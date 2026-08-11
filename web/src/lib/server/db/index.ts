import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { building } from '$app/environment';
import { DATABASE_URL } from '$env/static/private';

// Server-only singleton — reuse the connection across hot reloads in dev.
const globalForDb = globalThis as unknown as { __kwikshackDb?: Database.Database };

const sqlite = globalForDb.__kwikshackDb ?? new Database(DATABASE_URL);

if (!building) {
	globalForDb.__kwikshackDb = sqlite;
}

export const db = drizzle(sqlite, { casing: 'snake_case' });
