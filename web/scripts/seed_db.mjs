#!/usr/bin/env node
/**
 * KwikShack catalog seeder
 * Upserts scripts/seed/catalog.enriched.json into the decor_items table.
 * Idempotent: existing rows are updated, new rows inserted.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED = join(__dirname, 'seed');
const DB_PATH = join(__dirname, '..', 'data', 'kwikshack.db');

let rows;
try {
	rows = JSON.parse(readFileSync(join(SEED, 'catalog.enriched.json'), 'utf8'));
} catch {
	console.error('catalog.enriched.json not found — run extract_catalog.mjs then enrich_icons.mjs first');
	process.exit(1);
}

const db = new Database(DB_PATH);
const upsert = db.prepare(`
	INSERT INTO decor_items (item_id, name, icon, category, source, expansion, updated_at)
	VALUES (?, ?, ?, ?, ?, ?, ?)
	ON CONFLICT (item_id) DO UPDATE SET
		name = excluded.name,
		icon = excluded.icon,
		category = excluded.category,
		source = excluded.source,
		expansion = excluded.expansion,
		updated_at = excluded.updated_at
`);

const tx = db.transaction((items) => {
	let inserted = 0;
	let updated = 0;
	for (const r of items) {
		const now = Math.floor(Date.now() / 1000);
		const result = upsert.run(r.itemID, r.name, r.icon, r.category, r.source, r.expansion, now);
		if (result.changes > 0) {
			if (result.changes === 1) updated++;
			else inserted++;
		}
	}
	return { inserted, updated };
});

const { inserted, updated } = tx(rows);
const counts = db.prepare('SELECT COUNT(*) AS total FROM decor_items').get();
const withIcon = db.prepare('SELECT COUNT(*) AS n FROM decor_items WHERE icon IS NOT NULL AND icon != \'\'').get();
console.log(`Seeded ${rows.length} rows — total in DB: ${counts.total} | with icons: ${withIcon.n}`);
