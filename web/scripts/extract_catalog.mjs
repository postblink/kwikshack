#!/usr/bin/env node
/**
 * KwikShack catalog extractor
 * Parses the Housing Decor Guide addon data files (MIT-licensed, game data)
 * into a seed JSON keyed by itemID.
 *
 * Sources:
 *   HDGR_FacetDB.lua      — 1906 items: itemID, style facets (category, size,
 *                           indoor/outdoor, era), name in trailing comment
 *   HDGR_DecorDB.lua      — 305 crafted items: spellID → itemID, decorID, name,
 *                           profession, expansion, category, reagents
 *   HDGR_CatalogOverrides.lua — itemID → source classification (optional)
 *
 * Output: scripts/seed/catalog.json
 *   [{ itemID, recordID (when known), name, category, expansion, source, icon (null) }]
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = '/tmp/hdg/data';

// ---------------------------------------------------------------------------
// Lua helpers — enough for these generated data files.
// ---------------------------------------------------------------------------

/** Extract the balanced body of `[id] = { ... }` starting at a match index. */
function extractTableBody(src, startIdx) {
	let depth = 0;
	let i = src.indexOf('{', startIdx);
	if (i < 0) return null;
	const bodyStart = i;
	for (; i < src.length; i++) {
		const c = src[i];
		if (c === '{') depth++;
		else if (c === '}') {
			depth--;
			if (depth === 0) return { body: src.slice(bodyStart + 1, i), end: i };
		}
	}
	return null;
}

/** Parse flat `key=value, key={...}` field blocks into a plain object. */
function parseFields(body) {
	const out = {};
	const re = /([A-Za-z_][A-Za-z0-9_]*)\s*=\s*/g;
	let m;
	while ((m = re.exec(body)) !== null) {
		const key = m[1];
		const rest = body.slice(m.index + m[0].length);
		if (rest[0] === '{') {
			// Small inline array/table: capture balanced braces
			const t = extractTableBody(rest, 0);
			if (!t) continue;
			out[key] = t.body;
			re.lastIndex = m.index + m[0].length + (t.end - 0) + 1;
			// crude: advance past the closing brace we found
			re.lastIndex = m.index + m[0].length + t.end + 1;
		} else {
			const v = rest.match(/^("[^"]*"|'[^']*'|-?\d+(?:\.\d+)?)/);
			if (!v) continue;
			let val = v[1];
			if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
				val = val.slice(1, -1);
			} else if (val.includes('.')) {
				val = parseFloat(val);
			} else {
				val = parseInt(val, 10);
			}
			out[key] = val;
			re.lastIndex = m.index + m[0].length + v[0].length;
		}
	}
	return out;
}

/** Iterate `[id] = { ... }, -- Name` entries. */
function* iterEntries(src) {
	const re = /^\s*\[(\d+)\]\s*=\s*\{/gm;
	let m;
	while ((m = re.exec(src)) !== null) {
		const t = extractTableBody(src, m.index);
		if (!t) continue;
		// Name from the trailing comment after the closing brace
		const after = src.slice(t.end + 1, t.end + 200);
		const cm = after.match(/--\s*([^\n]+)/);
		const name = cm ? cm[1].trim() : '';
		yield { id: Number(m[1]), body: t.body, name };
		re.lastIndex = t.end + 1;
	}
}

/** Parse `[1]="x", [2]="y", ...` vocab arrays. */
function parseVocab(body) {
	const out = {};
	const re = /\[(\d+)\]\s*=\s*"([^"]*)"/g;
	let m;
	while ((m = re.exec(body)) !== null) out[Number(m[1])] = m[2];
	return out;
}

// ---------------------------------------------------------------------------
// Vocab (FacetDB header)
// ---------------------------------------------------------------------------
const facetSrc = readFileSync(join(DATA, 'HDGR_FacetDB.lua'), 'utf8');
const vocabBlock = facetSrc.match(/HDGR_FacetVocab = \{(.*?)\n\}/s);
const vocab = {};
if (vocabBlock) {
	// Vocab arrays are single-line: name = {[1]="x", [2]="y", ...}
	const vre = /(\w+)\s*=\s*\{([^}\n]*)\}/g;
	let vm;
	while ((vm = vre.exec(vocabBlock[1])) !== null) {
		vocab[vm[1]] = parseVocab(vm[2]);
	}
}

const ERA_NAMES = {
	1: 'Classic', 2: 'Burning Crusade', 3: 'Wrath of the Lich King', 4: 'Cataclysm',
	5: 'Mists of Pandaria', 6: 'Warlords of Draenor', 7: 'Legion', 8: 'Battle for Azeroth',
	9: 'Shadowlands', 10: 'Dragonflight', 11: 'The War Within', 12: 'Midnight'
};

// ---------------------------------------------------------------------------
// FacetDB — broad catalog, keyed by itemID
// ---------------------------------------------------------------------------
const catalog = new Map();

for (const { id, body, name } of iterEntries(facetSrc)) {
	const f = parseFields(body);
	catalog.set(id, {
		itemID: id,
		name,
		category: vocab.category?.[f.cat] ?? null,
		expansion: ERA_NAMES[f.era] ?? null,
		source: null,
		icon: null
	});
}

// ---------------------------------------------------------------------------
// DecorDB — crafted items add profession + expansion detail
// ---------------------------------------------------------------------------
const decorSrc = readFileSync(join(DATA, 'HDGR_DecorDB.lua'), 'utf8');
const recordIDs = new Map();
for (const { id, body, name } of iterEntries(decorSrc)) {
	const f = parseFields(body);
	const itemID = f.itemID;
	if (!itemID) continue;
	if (f.decorID) recordIDs.set(itemID, f.decorID);
	const existing = catalog.get(itemID) ?? {
		itemID, name, category: null, expansion: null, source: null, icon: null
	};
	if (f.decorID) existing.recordID = f.decorID;
	if (!existing.name && name) existing.name = name;
	if (!existing.category) existing.category = f.category ?? null;
	if (!existing.expansion) existing.expansion = f.expansion ?? null;
	existing.source = `Crafted (${f.profession ?? '?'})`;
	catalog.set(itemID, existing);
}

// ---------------------------------------------------------------------------
// CatalogOverrides — source classification (bonus; keep it light)
// ---------------------------------------------------------------------------
const ovSrc = readFileSync(join(DATA, 'HDGR_CatalogOverrides.lua'), 'utf8');
for (const { id, body } of iterEntries(ovSrc)) {
	const f = parseFields(body);
	const entry = catalog.get(id);
	if (entry && !entry.source && f.sources) entry.source = 'Community-curated source';
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------
const rows = [...catalog.values()].sort((a, b) => a.itemID - b.itemID);
const outPath = join(__dirname, 'seed', 'catalog.json');
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(rows, null, 1));

// Preserve fetched icons while merging recordID mappings into the seed used by
// seed_db.mjs. enrich_icons.mjs also carries these fields forward on later runs.
const enrichedPath = join(__dirname, 'seed', 'catalog.enriched.json');
if (existsSync(enrichedPath)) {
	const enrichedRows = JSON.parse(readFileSync(enrichedPath, 'utf8'));
	for (const row of enrichedRows) {
		const recordID = recordIDs.get(row.itemID);
		if (recordID !== undefined) row.recordID = recordID;
		else delete row.recordID;
	}
	writeFileSync(enrichedPath, JSON.stringify(enrichedRows, null, 1));
}

console.log(`Extracted ${rows.length} items → ${outPath}`);
const withName = rows.filter((r) => r.name).length;
const withCat = rows.filter((r) => r.category).length;
const withExp = rows.filter((r) => r.expansion).length;
const crafted = rows.filter((r) => r.source).length;
console.log(`names: ${withName} | categories: ${withCat} | expansion: ${withExp} | crafted: ${crafted} | recordIDs: ${recordIDs.size}`);
console.log('Samples:');
for (const r of rows.slice(0, 4)) console.log(' ', r.itemID, '|', r.name, '|', r.category, '|', r.expansion, '|', r.source);
