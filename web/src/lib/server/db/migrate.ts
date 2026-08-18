import type { Database } from 'better-sqlite3';
import { applyMigrations } from './apply-migrations.js';

// The .sql files are bundled into the server build. Reading them from disk at
// runtime would break the Docker image, which ships only `build/` and
// `node_modules/`.
const files = import.meta.glob('../../../../migrations/*.sql', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

export const migrations = Object.entries(files)
	.map(([path, sql]) => ({ name: path.split('/').pop()!.replace(/\.sql$/, ''), sql }))
	.sort((a, b) => a.name.localeCompare(b.name));

let migrated = false;

/** Apply pending migrations once per process. Safe to call from anywhere. */
export function runMigrations(sqlite: Database): void {
	if (migrated) return;
	migrated = true;

	if (migrations.length === 0) {
		throw new Error('No migrations were bundled — the migrations/ glob resolved to nothing.');
	}

	const result = applyMigrations(sqlite, migrations);
	for (const repair of result.repaired) console.warn(`[migrate] reconciled pre-migration column ${repair}`);
	for (const warning of result.warnings) console.warn(`[migrate] ${warning}`);
	if (result.applied.length) console.log(`[migrate] applied: ${result.applied.join(', ')}`);
}
