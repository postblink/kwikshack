// Test-only helper: build a real database from the real migrations.
//
// Tests used to hand-write CREATE TABLE statements, which is the same drift
// mechanism that bit the deployed database. Running migrations/*.sql here means
// a schema change that breaks a migration breaks the test suite too.

import Database from 'better-sqlite3';
import { readdirSync, readFileSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyMigrations } from './db/apply-migrations.js';

const migrationsDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'migrations');

export function migrationFiles(): { name: string; sql: string }[] {
	return readdirSync(migrationsDir)
		.filter((name) => name.endsWith('.sql'))
		.sort()
		.map((name) => ({ name: name.replace(/\.sql$/, ''), sql: readFileSync(join(migrationsDir, name), 'utf8') }));
}

export function migrateTestDatabase(path: string): void {
	const sqlite = new Database(path);
	sqlite.pragma('foreign_keys = ON');
	applyMigrations(sqlite, migrationFiles());
	sqlite.close();
}

export function testDatabasePath(label: string): string {
	return `/tmp/kwikshack-vitest-${label}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.db`;
}

export function removeTestDatabase(path: string): void {
	for (const suffix of ['', '-wal', '-shm']) {
		try {
			unlinkSync(`${path}${suffix}`);
		} catch {
			// Already gone — nothing to clean up.
		}
	}
}
