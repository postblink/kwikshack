import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { applyMigrations } from './apply-migrations.js';
import { migrationFiles, removeTestDatabase, testDatabasePath } from '../test-db';

const created: string[] = [];

function freshDatabase(): { path: string; sqlite: Database.Database } {
	const path = testDatabasePath('migrate');
	created.push(path);
	const sqlite = new Database(path);
	sqlite.pragma('foreign_keys = ON');
	return { path, sqlite };
}

function tableNames(sqlite: Database.Database): string[] {
	return sqlite
		.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
		.all()
		.map((row) => (row as { name: string }).name);
}

function columnNames(sqlite: Database.Database, table: string): string[] {
	return (sqlite.pragma(`table_info(${JSON.stringify(table)})`) as { name: string }[]).map((row) => row.name);
}

afterEach(() => {
	while (created.length) removeTestDatabase(created.pop()!);
});

describe('applyMigrations', () => {
	it('creates the full schema on a fresh database', () => {
		const { sqlite } = freshDatabase();
		const files = migrationFiles();
		const result = applyMigrations(sqlite, files);

		// Assert against the migration directory rather than a hard-coded list, so
		// adding a migration does not require editing this test.
		expect(result.applied).toEqual(files.map((file) => file.name));
		expect(result.applied[0]).toBe('0001_baseline');
		expect(tableNames(sqlite)).toEqual(
			expect.arrayContaining([
				'accounts',
				'battle_net_identities',
				'blueprint_audit_events',
				'blueprint_claims',
				'builds',
				'canonical_decor',
				'decor_identifier_map',
				'decor_sync_state',
				'indexed_blueprint_sources',
				'indexed_blueprints',
				'oauth_states',
				'schema_migrations',
				'sessions',
				'users',
				'wow_character_identities'
			])
		);
		sqlite.close();
	});

	it('is idempotent — a second run applies nothing', () => {
		const { sqlite } = freshDatabase();
		const files = migrationFiles();
		applyMigrations(sqlite, files);
		const second = applyMigrations(sqlite, files);

		expect(second.applied).toEqual([]);
		expect(second.skipped).toHaveLength(files.length);
		expect(second.warnings).toEqual([]);
		sqlite.close();
	});

	it('upgrades a pre-migration database without losing data', () => {
		const { sqlite } = freshDatabase();
		// The shape `drizzle-kit push` left behind before migrations existed.
		sqlite.exec(`
			CREATE TABLE users (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, created_at INTEGER NOT NULL);
			CREATE TABLE builds (
				id TEXT PRIMARY KEY NOT NULL, share_code TEXT NOT NULL,
				code_status TEXT DEFAULT 'unverified' NOT NULL, blueprint_type TEXT DEFAULT 'House' NOT NULL,
				faction TEXT, title TEXT NOT NULL, description TEXT DEFAULT '', author_id TEXT,
				manifest TEXT NOT NULL, placement_data TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
			);
			CREATE TABLE decor_items (
				item_id INTEGER PRIMARY KEY NOT NULL, name TEXT NOT NULL, icon TEXT DEFAULT '',
				category TEXT DEFAULT '', source TEXT DEFAULT '', expansion TEXT DEFAULT '', updated_at INTEGER NOT NULL
			);
			INSERT INTO builds VALUES ('b1','CODE-1','unverified','House',NULL,'Existing build','',NULL,'{}',NULL,1,1);
			INSERT INTO decor_items VALUES (5,'Sconce','','','','',1);
		`);

		const result = applyMigrations(sqlite, migrationFiles());

		// The hand-added columns are reconciled rather than silently missing.
		expect(result.repaired).toEqual([
			'builds.blueprint_scope',
			'builds.last_verified_at',
			'decor_items.record_id',
			'decor_items.tags'
		]);
		expect(columnNames(sqlite, 'builds')).toEqual(expect.arrayContaining(['blueprint_scope', 'last_verified_at']));
		expect(columnNames(sqlite, 'decor_items')).toEqual(expect.arrayContaining(['record_id', 'tags']));

		// Existing rows survive untouched.
		expect(sqlite.prepare('SELECT title FROM builds WHERE id = ?').get('b1')).toEqual({ title: 'Existing build' });
		expect(sqlite.prepare('SELECT name FROM decor_items WHERE item_id = ?').get(5)).toEqual({ name: 'Sconce' });
		sqlite.close();
	});

	it('rolls a failing migration back and leaves it unrecorded', () => {
		const { sqlite } = freshDatabase();
		expect(() =>
			applyMigrations(sqlite, [
				{ name: '0001_ok', sql: 'CREATE TABLE ok (id TEXT PRIMARY KEY);' },
				{ name: '0002_bad', sql: 'CREATE TABLE half (id TEXT PRIMARY KEY); THIS IS NOT SQL;' }
			])
		).toThrow(/0002_bad failed and was rolled back/);

		expect(tableNames(sqlite)).toContain('ok');
		expect(tableNames(sqlite)).not.toContain('half');
		expect(sqlite.prepare('SELECT name FROM schema_migrations').all()).toEqual([{ name: '0001_ok' }]);
		sqlite.close();
	});

	it('warns rather than re-running when an applied migration was edited', () => {
		const { sqlite } = freshDatabase();
		applyMigrations(sqlite, [{ name: '0001_thing', sql: 'CREATE TABLE thing (id TEXT PRIMARY KEY);' }]);

		const result = applyMigrations(sqlite, [
			{ name: '0001_thing', sql: 'CREATE TABLE thing (id TEXT PRIMARY KEY, extra TEXT);' }
		]);

		expect(result.applied).toEqual([]);
		expect(result.warnings).toHaveLength(1);
		expect(result.warnings[0]).toMatch(/different checksum/);
		// The edit is reported, not silently applied.
		expect(columnNames(sqlite, 'thing')).toEqual(['id']);
		sqlite.close();
	});
});
