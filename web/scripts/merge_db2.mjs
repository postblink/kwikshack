#!/usr/bin/env node
/**
 * Merge the authoritative HouseDecor DB2 catalog (wago.tools) into the seed.
 *
 * DB2 carries the FULL housing decor catalog — every placeable decor item with
 * its recordID (housing catalog id) and ThumbnailFileDataID (icon) — but NO
 * style facets (mood/culture/size/palette are HDGR-only classifications). So
 * this pass only fills completeness gaps:
 *
 *   - backfill recordID + icon for items the HDGR catalog already has
 *   - add DB2-only items (name + icon + recordID, tags: [], category: null)
 *   - keep HDGR-only items (removed/reclassified) untouched
 *
 * The "[DNT] ... DO NOT USE" rows are dev/debug placeholders — always dropped.
 *
 * Usage: node merge_db2.mjs [path/to/HouseDecor.csv]
 *   Without an argument it fetches the current CSV from wago.tools
 *   (build pinned below); a local path skips the fetch (offline re-run).
 *
 * Output: scripts/seed/catalog.enriched.json (idempotent — safe to re-run).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED = join(__dirname, 'seed');
const ENRICHED = join(SEED, 'catalog.enriched.json');
const CSV_URL = 'https://wago.tools/db2/HouseDecor/csv';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) KwikShack-catalog';

// ---------------------------------------------------------------------------
// Minimal RFC-4180 CSV parser (names may contain commas + escaped quotes).
// ---------------------------------------------------------------------------
function parseCsv(text) {
	const rows = [];
	let row = [];
	let field = '';
	let inQuotes = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (inQuotes) {
			if (c === '"') {
				if (text[i + 1] === '"') { field += '"'; i++; }
				else inQuotes = false;
			} else field += c;
		} else if (c === '"') {
			inQuotes = true;
		} else if (c === ',') {
			row.push(field); field = '';
		} else if (c === '\n') {
			row.push(field); rows.push(row); row = []; field = '';
		} else if (c !== '\r') {
			field += c;
		}
	}
	if (field.length || row.length) { row.push(field); rows.push(row); }
	return rows;
}

const isDnt = (name) => name.includes('[DNT]') || name.includes('DO NOT USE');

async function loadCsv() {
	const arg = process.argv[2];
	if (arg) return readFileSync(arg, 'utf8');
	const res = await fetch(CSV_URL, { headers: { 'User-Agent': UA } });
	if (!res.ok) throw new Error(`fetch ${CSV_URL} → HTTP ${res.status}`);
	return await res.text();
}

const csv = await loadCsv();
const parsed = parseCsv(csv);
const header = parsed[0];
const col = Object.fromEntries(header.map((h, i) => [h, i]));

// DB2 map: itemID → { recordID, name, icon (ThumbnailFileDataID string|null) }
const db2 = new Map();
for (const row of parsed.slice(1)) {
	const name = (row[col.Name_lang] ?? '').trim();
	if (!name || isDnt(name)) continue;
	const itemID = parseInt(row[col.ItemID], 10);
	if (!Number.isFinite(itemID) || itemID <= 0) continue;
	const recordID = parseInt(row[col.ID], 10);
	const thumb = (row[col.ThumbnailFileDataID] ?? '').trim();
	const icon = thumb && thumb !== '0' ? thumb : null;
	db2.set(itemID, { recordID, name, icon });
}

const enriched = JSON.parse(readFileSync(ENRICHED, 'utf8'));
const byId = new Map(enriched.map((r) => [r.itemID, r]));

let added = 0;
let recordBackfill = 0;
let iconBackfill = 0;
for (const [itemID, info] of db2) {
	let r = byId.get(itemID);
	if (!r) {
		byId.set(itemID, {
			itemID,
			name: info.name,
			category: null,
			expansion: null,
			source: null,
			icon: info.icon,
			tags: [],
			recordID: info.recordID
		});
		added++;
		continue;
	}
	if (!r.recordID) { r.recordID = info.recordID; recordBackfill++; }
	if (!r.icon && info.icon) { r.icon = info.icon; iconBackfill++; }
	if (!r.name && info.name) r.name = info.name;
}

const rows = [...byId.values()].sort((a, b) => a.itemID - b.itemID);
writeFileSync(ENRICHED, JSON.stringify(rows, null, 1));

const withRecord = rows.filter((r) => r.recordID).length;
const withIcon = rows.filter((r) => r.icon).length;
const withTags = rows.filter((r) => Array.isArray(r.tags) && r.tags.length).length;
const withCat = rows.filter((r) => r.category).length;

console.log(`DB2 rows (live, non-DNT): ${db2.size}`);
console.log(`Merged catalog → ${rows.length} items (added ${added})`);
console.log(`backfilled → recordID: ${recordBackfill} | icon: ${iconBackfill}`);
console.log(`coverage → recordID: ${withRecord}/${rows.length} | icon: ${withIcon}/${rows.length} | tags: ${withTags} | category: ${withCat}`);
