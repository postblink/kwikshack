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
// Override with DB_PATH (e.g. for verification against a temp file) or
// SEED_FILE (to seed from a non-default catalog). Defaults target the live DB.
const DB_PATH = process.env.DB_PATH ?? join(__dirname, '..', 'data', 'kwikshack.db');
const SEED_FILE = process.env.SEED_FILE ?? join(SEED, 'catalog.enriched.json');

let rows;
try {
	rows = JSON.parse(readFileSync(SEED_FILE, 'utf8'));
} catch {
	console.error(`${SEED_FILE} not found — run extract_catalog.mjs then enrich_icons.mjs first`);
	process.exit(1);
}

const db = new Database(DB_PATH);
const upsert = db.prepare(`
	INSERT INTO decor_items (item_id, record_id, name, icon, category, source, expansion, tags, updated_at)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	ON CONFLICT (item_id) DO UPDATE SET
		record_id = excluded.record_id,
		name = excluded.name,
		icon = excluded.icon,
		category = excluded.category,
		source = excluded.source,
		expansion = excluded.expansion,
		tags = excluded.tags,
		updated_at = excluded.updated_at
`);

const tx = db.transaction((items) => {
	let inserted = 0;
	let updated = 0;
	let withTags = 0;
	for (const r of items) {
		const now = Math.floor(Date.now() / 1000);
		const tags = JSON.stringify(Array.isArray(r.tags) ? r.tags : []);
		if (Array.isArray(r.tags) && r.tags.length) withTags++;
		const result = upsert.run(
			r.itemID, r.recordID ?? null, r.name, r.icon, r.category, r.source, r.expansion, tags, now
		);
		if (result.changes > 0) {
			if (result.changes === 1) updated++;
			else inserted++;
		}
	}
	return { inserted, updated, withTags };
});

const { inserted, updated, withTags } = tx(rows);
const counts = db.prepare('SELECT COUNT(*) AS total FROM decor_items').get();
const withIcon = db.prepare("SELECT COUNT(*) AS n FROM decor_items WHERE icon IS NOT NULL AND icon != ''").get();
const withTag = db.prepare("SELECT COUNT(*) AS n FROM decor_items WHERE tags IS NOT NULL AND tags != '[]'").get();
console.log(`Seeded ${rows.length} rows (${withTags} with tags) — total in DB: ${counts.total} | with icons: ${withIcon.n} | with tags: ${withTag.n}`);
