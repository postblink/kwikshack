import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';

const testDatabase = vi.hoisted(() => ({
	path: `/tmp/kwikshack-vitest-schema-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.db`
}));

vi.mock('$app/environment', () => ({ building: true }));
vi.mock('$env/dynamic/private', () => ({ env: { DATABASE_URL: testDatabase.path } }));

import * as schema from './schema';
import { migrateTestDatabase, removeTestDatabase } from '../test-db';

/**
 * Drift guard.
 *
 * `web/migrations/*.sql` is the authoritative schema; `schema.ts` is the
 * TypeScript view of it, maintained by hand. Nothing enforces that they agree —
 * except this test. If a migration adds a column and schema.ts does not, or the
 * reverse, the suite fails here rather than at runtime in production.
 */
let sqlite: Database.Database;

beforeAll(() => {
	migrateTestDatabase(testDatabase.path);
	sqlite = new Database(testDatabase.path, { readonly: true });
});

afterAll(() => {
	sqlite.close();
	removeTestDatabase(testDatabase.path);
});

const tables: [string, SQLiteTable][] = Object.entries(schema).flatMap(([exportName, value]) =>
	typeof value === 'object' && value !== null && 'getSQL' in value
		? [[exportName, value as unknown as SQLiteTable] as [string, SQLiteTable]]
		: []
);

describe('schema.ts matches the migrations', () => {
	it('declares at least the tables the migrations create', () => {
		expect(tables.length).toBeGreaterThan(10);
	});

	it.each(tables)('%s has the same columns in the database', (_exportName, table) => {
		const config = getTableConfig(table);
		const actual = (sqlite.pragma(`table_info(${JSON.stringify(config.name)})`) as { name: string }[]).map(
			(row) => row.name
		);
		expect(actual.length, `table ${config.name} is missing from the migrations`).toBeGreaterThan(0);

		const declared = config.columns.map((column) => column.name);
		expect(new Set(declared)).toEqual(new Set(actual));
	});
});
