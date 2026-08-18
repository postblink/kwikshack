import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { building } from '$app/environment';
import { env } from '$env/dynamic/private';
import { runMigrations } from './migrate';

// Runtime-configurable so hosted deploys (Railway) can point DATABASE_URL at
// a mounted volume — $env/static/private would bake the dev value at build.
const DATABASE_URL = env.DATABASE_URL ?? './data/kwikshack.db';

// Server-only singleton — reuse the connection across hot reloads in dev.
const globalForDb = globalThis as unknown as { __kwikshackDb?: Database.Database };

const sqlite = globalForDb.__kwikshackDb ?? new Database(DATABASE_URL);
sqlite.pragma('foreign_keys = ON');
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('busy_timeout = 5000');

if (!building) {
	globalForDb.__kwikshackDb = sqlite;
	// Migrations are the authoritative schema path. Running them here (rather
	// than only in the deploy entrypoint) keeps `vite dev`, `vitest`, and the
	// production server on the same schema. The build-time analyse pass is
	// skipped so a throwaway build database is never migrated.
	runMigrations(sqlite);
}

export const db = drizzle(sqlite, { casing: 'snake_case' });
export { sqlite };
