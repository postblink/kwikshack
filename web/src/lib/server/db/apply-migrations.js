// Deliberately boring SQLite migration runner.
//
// Plain JavaScript so the SvelteKit server bundle and the standalone Node CLI
// (`scripts/migrate.mjs`) execute the SAME code. Two implementations of "apply
// migrations" is how schema drift starts.
//
// Rules:
//   * Migrations are numbered .sql files. They are applied once, in name order.
//   * Each migration runs inside a transaction and is recorded in
//     `schema_migrations` in the same transaction.
//   * Already-applied migrations are never re-run, never re-hashed into a
//     failure. A checksum mismatch is reported as a warning, not a hard stop,
//     because rewriting history on a live database is worse than noticing it.
//   * Nothing here drops or rewrites data.

import { createHash } from 'node:crypto';

/**
 * Columns that live databases may be missing because they were added by hand
 * before this migration system existed. Applying `0001_baseline` to such a
 * database is a no-op (the tables already exist), so the drift has to be
 * reconciled explicitly, once.
 *
 * Do NOT add to this list. New columns belong in a numbered migration.
 *
 * @type {{ table: string, column: string, ddl: string }[]}
 */
const BASELINE_COLUMN_REPAIRS = [
	{ table: 'builds', column: 'blueprint_scope', ddl: '`blueprint_scope` text' },
	{ table: 'builds', column: 'last_verified_at', ddl: '`last_verified_at` integer' },
	{ table: 'decor_items', column: 'record_id', ddl: '`record_id` integer' },
	{ table: 'decor_items', column: 'tags', ddl: "`tags` text DEFAULT '[]' NOT NULL" }
];

/**
 * @param {import('better-sqlite3').Database} sqlite
 * @param {string} table
 * @returns {boolean}
 */
function tableExists(sqlite, table) {
	return Boolean(
		sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)
	);
}

/**
 * @param {import('better-sqlite3').Database} sqlite
 * @param {string} table
 * @returns {Set<string>}
 */
function columnsOf(sqlite, table) {
	/** @type {{ name: string }[]} */
	const rows = /** @type {any} */ (sqlite.pragma(`table_info(${JSON.stringify(table)})`));
	return new Set(rows.map((row) => row.name));
}

/**
 * Reconcile the hand-edited columns described above. Runs before the numbered
 * migrations so `0001_baseline` sees a consistent starting point either way.
 *
 * @param {import('better-sqlite3').Database} sqlite
 * @returns {string[]} descriptions of the repairs that were applied
 */
function repairBaselineColumns(sqlite) {
	/** @type {string[]} */
	const repaired = [];
	for (const { table, column, ddl } of BASELINE_COLUMN_REPAIRS) {
		if (!tableExists(sqlite, table)) continue; // fresh database — 0001 creates it correctly
		if (columnsOf(sqlite, table).has(column)) continue;
		sqlite.exec(`ALTER TABLE \`${table}\` ADD COLUMN ${ddl}`);
		repaired.push(`${table}.${column}`);
	}
	return repaired;
}

/**
 * @param {string} sql
 * @returns {string}
 */
function checksum(sql) {
	return createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex').slice(0, 32);
}

/**
 * @typedef {{ name: string, sql: string }} Migration
 * @typedef {{ applied: string[], skipped: string[], repaired: string[], warnings: string[] }} MigrationResult
 */

/**
 * Apply pending migrations. Safe to call on every boot.
 *
 * @param {import('better-sqlite3').Database} sqlite
 * @param {Migration[]} migrations
 * @returns {MigrationResult}
 */
export function applyMigrations(sqlite, migrations) {
	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS schema_migrations (
			name TEXT PRIMARY KEY NOT NULL,
			checksum TEXT NOT NULL,
			applied_at INTEGER NOT NULL
		)
	`);

	const repaired = repairBaselineColumns(sqlite);

	/** @type {Map<string, string>} */
	const already = new Map(
		/** @type {{ name: string, checksum: string }[]} */ (
			sqlite.prepare('SELECT name, checksum FROM schema_migrations').all()
		).map((row) => [row.name, row.checksum])
	);

	/** @type {MigrationResult} */
	const result = { applied: [], skipped: [], repaired, warnings: [] };
	const ordered = [...migrations].sort((a, b) => a.name.localeCompare(b.name));

	for (const migration of ordered) {
		const digest = checksum(migration.sql);
		const previous = already.get(migration.name);
		if (previous !== undefined) {
			if (previous !== digest) {
				result.warnings.push(
					`${migration.name} was applied with a different checksum (recorded ${previous}, file ${digest}). ` +
						'An applied migration was edited — add a new migration instead.'
				);
			}
			result.skipped.push(migration.name);
			continue;
		}

		const run = sqlite.transaction(() => {
			sqlite.exec(migration.sql);
			sqlite
				.prepare('INSERT INTO schema_migrations (name, checksum, applied_at) VALUES (?, ?, ?)')
				.run(migration.name, digest, Date.now());
		});

		try {
			run();
		} catch (cause) {
			const reason = cause instanceof Error ? cause.message : String(cause);
			throw new Error(`Migration ${migration.name} failed and was rolled back: ${reason}`, { cause });
		}
		result.applied.push(migration.name);
	}

	return result;
}
