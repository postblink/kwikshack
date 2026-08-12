import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { building } from '$app/environment';
import { env } from '$env/dynamic/private';

// Runtime-configurable so hosted deploys (Railway) can point DATABASE_URL at
// a mounted volume — $env/static/private would bake the dev value at build.
const DATABASE_URL = env.DATABASE_URL ?? './data/kwikshack.db';

// Server-only singleton — reuse the connection across hot reloads in dev.
const globalForDb = globalThis as unknown as { __kwikshackDb?: Database.Database };

const sqlite = globalForDb.__kwikshackDb ?? new Database(DATABASE_URL);

if (!building) {
	globalForDb.__kwikshackDb = sqlite;
}

export const db = drizzle(sqlite, { casing: 'snake_case' });
