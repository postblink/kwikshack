#!/usr/bin/env node
// Standalone migration runner for deploys and operators.
//
//   node scripts/migrate.mjs [--database <path>] [--dry-run]
//
// Uses the same applyMigrations() the server uses, so "what the CLI does" and
// "what the app does on boot" cannot diverge.

import { readdirSync, readFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { applyMigrations } from '../src/lib/server/db/apply-migrations.js';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(here, '..', 'migrations');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const databaseArgIndex = args.indexOf('--database');
const databaseUrl =
	(databaseArgIndex >= 0 ? args[databaseArgIndex + 1] : undefined) ??
	process.env.DATABASE_URL ??
	'./data/kwikshack.db';

const migrations = readdirSync(migrationsDir)
	.filter((name) => name.endsWith('.sql'))
	.sort()
	.map((name) => ({ name: name.replace(/\.sql$/, ''), sql: readFileSync(join(migrationsDir, name), 'utf8') }));

if (migrations.length === 0) {
	console.error(`[migrate] no .sql files found in ${migrationsDir}`);
	process.exit(1);
}

mkdirSync(dirname(resolve(databaseUrl)), { recursive: true });
const isNew = !existsSync(databaseUrl);

if (dryRun) {
	console.log(`[migrate] would migrate ${databaseUrl}${isNew ? ' (new database)' : ''}`);
	for (const migration of migrations) console.log(`[migrate]   ${migration.name}`);
	process.exit(0);
}

// Cheap rollback insurance for an existing database. WAL contents are
// checkpointed first so the copy is a complete snapshot.
let backupPath = null;
if (!isNew && process.env.KWIKSHACK_MIGRATE_BACKUP !== '0') {
	const probe = new Database(databaseUrl);
	probe.pragma('wal_checkpoint(TRUNCATE)');
	probe.close();
	backupPath = `${databaseUrl}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
	copyFileSync(databaseUrl, backupPath);
	console.log(`[migrate] backup written to ${backupPath}`);
}

const sqlite = new Database(databaseUrl);
sqlite.pragma('foreign_keys = ON');
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('busy_timeout = 5000');

try {
	const result = applyMigrations(sqlite, migrations);
	for (const repair of result.repaired) console.log(`[migrate] reconciled pre-migration column ${repair}`);
	for (const warning of result.warnings) console.warn(`[migrate] WARNING ${warning}`);
	console.log(
		result.applied.length
			? `[migrate] applied ${result.applied.length}: ${result.applied.join(', ')}`
			: '[migrate] already up to date'
	);
	if (result.skipped.length) console.log(`[migrate] skipped ${result.skipped.length} already-applied`);
} catch (error) {
	console.error(`[migrate] FAILED: ${error instanceof Error ? error.message : String(error)}`);
	if (backupPath) console.error(`[migrate] the database was not modified by the failed migration; backup at ${backupPath}`);
	process.exitCode = 1;
} finally {
	sqlite.close();
}
