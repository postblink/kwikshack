#!/usr/bin/env node
/**
 * Merge the game-derived HouseDecor DB2 client table (wago.tools) into the seed.
 *
 * DB2 carries the FULL housing decor catalog — every placeable decor item with
 * its recordID (housing catalog id) and ThumbnailFileDataID (icon) — but NO
 * acquisition status or style facets (mood/culture/size/palette are HDGR-only
 * classifications). Presence in this table does not prove that an item is
 * currently obtainable. This pass:
 *
 *   - update recordID, name, and icon for current DB2-backed items
 *   - add DB2-only items (name + icon + recordID, tags: [], category: null)
 *   - remove rows explicitly marked internal/test/deprecated in the current DB2
 *   - retain seed-only items without an explicit internal marker as unverified
 *
 * The "[DNT] ... DO NOT USE" rows are dev/debug placeholders — always dropped.
 *
 * Usage: node merge_db2.mjs [path/to/HouseDecor.csv]
 *   Without an argument it fetches the current CSV from wago.tools
 *   and records its filename/build; a local path skips the fetch (offline re-run).
 *
 * Output: scripts/seed/catalog.enriched.json (idempotent — safe to re-run).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeHouseDecor } from './catalog_merge.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED = join(__dirname, 'seed');
const ENRICHED = join(SEED, 'catalog.enriched.json');
const PROVENANCE = join(SEED, 'catalog.provenance.json');
const CSV_URL = 'https://wago.tools/db2/HouseDecor/csv';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) KwikShack-catalog';

async function loadCsv() {
	const arg = process.argv[2];
	if (arg) return { csv: readFileSync(arg, 'utf8'), filename: basename(arg) };
	const res = await fetch(CSV_URL, { headers: { 'User-Agent': UA } });
	if (!res.ok) throw new Error(`fetch ${CSV_URL} → HTTP ${res.status}`);
	const disposition = res.headers.get('content-disposition') ?? '';
	const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? 'HouseDecor.csv';
	return { csv: await res.text(), filename };
}

const { csv, filename } = await loadCsv();
const existing = JSON.parse(readFileSync(ENRICHED, 'utf8'));
const { rows, stats } = mergeHouseDecor(existing, csv);
writeFileSync(ENRICHED, JSON.stringify(rows, null, 1));

const version = filename.match(/HouseDecor\.(\d+\.\d+\.\d+\.(\d+))\.csv/i);
writeFileSync(
	PROVENANCE,
	JSON.stringify(
		{
			source: CSV_URL,
			file: filename,
			gameVersion: version?.[1] ?? null,
			gameBuild: version ? Number(version[2]) : null,
			liveRows: stats.liveRows,
			internalRowsExcluded: stats.internalRows,
			retainedUnverified: stats.retainedUnverified
		},
		null,
		2
	) + '\n'
);

const withRecord = rows.filter((r) => r.recordID).length;
const withIcon = rows.filter((r) => r.icon).length;
const withTags = rows.filter((r) => Array.isArray(r.tags) && r.tags.length).length;
const withCat = rows.filter((r) => r.category).length;

console.log(`DB2 ${filename}: ${stats.liveRows} live rows | ${stats.internalRows} internal rows excluded`);
console.log(`Merged catalog → ${rows.length} items (added ${stats.added} | updated ${stats.updated} | unchanged ${stats.unchanged})`);
console.log(`removed explicit internal rows: ${stats.excludedExisting} | retained seed-only rows: ${stats.retainedUnverified.length}`);
console.log(`coverage → recordID: ${withRecord}/${rows.length} | icon: ${withIcon}/${rows.length} | tags: ${withTags} | category: ${withCat}`);
