#!/usr/bin/env node
/**
 * KwikShack recordID backfill
 * Self-learning mapping: real build manifests often carry BOTH recordID (the
 * housing catalog ID) and itemID (resolved in-game by the addon). The static
 * seed only knows recordIDs for crafted items, so this script learns the rest
 * from submitted builds:
 *
 *   1. For each pair (recordID, itemID, name) in every build manifest, set
 *      decor_items.record_id on the matching item row (if currently NULL).
 *   2. Insert stub rows for itemIDs not yet in the catalog so future lookups
 *      at least resolve names.
 *
 * Idempotent — safe to re-run as more builds arrive.
 */
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', 'data', 'kwikshack.db');

const db = new Database(DB_PATH);

/** Extract {recordID, itemID, name} trios from a manifest's decor groups. */
function extractPairs(manifest) {
	const pairs = new Map(); // key recordID:itemID -> { recordID, itemID, name }
	if (!manifest || typeof manifest !== 'object') return pairs;
	for (const group of manifest.contentGroups ?? []) {
		const ct = group.contentType ?? group.groupType;
		if (ct !== 3) continue; // decor only
		for (const entry of group.entries ?? []) {
			const recordID = typeof entry.recordID === 'number' ? entry.recordID : null;
			const itemID = typeof entry.itemID === 'number' ? entry.itemID : null;
			if (recordID === null || itemID === null) continue;
			const key = `${recordID}:${itemID}`;
			if (!pairs.has(key)) {
				pairs.set(key, { recordID, itemID, name: typeof entry.name === 'string' ? entry.name : null });
			}
		}
	}
	return pairs;
}

// Collect pairs from all builds
const builds = db.prepare('SELECT manifest FROM builds').all();
const all = new Map();
let buildsWithPairs = 0;
for (const row of builds) {
	let manifest;
	try {
		manifest = JSON.parse(row.manifest);
	} catch {
		continue;
	}
	const pairs = extractPairs(manifest);
	if (pairs.size > 0) buildsWithPairs++;
	for (const [, p] of pairs) all.set(`${p.recordID}:${p.itemID}`, p);
}
console.log(`Scanned ${builds.length} builds (${buildsWithPairs} with pairs) -> ${all.size} unique pairs`);

// 1. Update existing catalog rows that are missing record_id
const updateRec = db.prepare('UPDATE decor_items SET record_id = ? WHERE item_id = ? AND record_id IS NULL');
// 2. Insert stub rows for unknown itemIDs (keep real name if we have one)
const insertStub = db.prepare(
	'INSERT OR IGNORE INTO decor_items (item_id, record_id, name, icon, category, source, expansion, updated_at) VALUES (?, ?, ?, NULL, NULL, NULL, NULL, ?)'
);

const tx = db.transaction(() => {
	let updated = 0;
	let inserted = 0;
	for (const p of all.values()) {
		const now = Math.floor(Date.now() / 1000);
		const u = updateRec.run(p.recordID, p.itemID);
		updated += u.changes;
		const ins = insertStub.run(p.itemID, p.recordID, p.name, now);
		inserted += ins.changes > 0 ? 1 : 0;
	}
	return { updated, inserted };
});

const res = tx();
console.log(`Done — record_id backfilled on ${res.updated} rows, ${res.inserted} stub items inserted`);
