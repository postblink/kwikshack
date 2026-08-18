import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { migrateTestDatabase, removeTestDatabase, testDatabasePath } from '../src/lib/server/test-db';

/**
 * Guards on the importer's credential handling and blast radius.
 *
 * The operator session cookie is a bearer credential — anything holding it can
 * act as an administrator. These tests exist because the previous version of
 * this script took it as `--session <value>`, which puts an admin credential in
 * `ps` output and shell history.
 */
const script = resolve(dirname(fileURLToPath(import.meta.url)), 'seed-blueprints.mjs');
const cohort = resolve(dirname(fileURLToPath(import.meta.url)), 'seed/blueprint-cohort-01.json');

const created: string[] = [];
const tempDirs: string[] = [];

function run(args: string[], options: { env?: Record<string, string>; input?: string } = {}) {
	try {
		const stdout = execFileSync('node', [script, ...args], {
			encoding: 'utf8',
			input: options.input ?? '',
			env: { ...process.env, ...options.env },
			stdio: ['pipe', 'pipe', 'pipe']
		});
		return { code: 0, output: stdout };
	} catch (error) {
		const failure = error as { status: number; stdout?: string; stderr?: string };
		return { code: failure.status ?? 1, output: `${failure.stdout ?? ''}${failure.stderr ?? ''}` };
	}
}

afterEach(() => {
	while (created.length) removeTestDatabase(created.pop()!);
	while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

function freshDatabase(): string {
	const path = testDatabasePath('seedcli');
	created.push(path);
	migrateTestDatabase(path);
	return path;
}

describe('credential handling', () => {
	it('refuses a session passed as a command-line argument', () => {
		const result = run(['--file', cohort, '--session', 'super-secret-cookie-value']);

		expect(result.code).not.toBe(0);
		expect(result.output).toMatch(/--session is not accepted/);
		expect(result.output).toMatch(/visible to other processes/);
		// The rejection must not echo the value it just refused.
		expect(result.output).not.toContain('super-secret-cookie-value');
	});

	it('never prints a credential supplied through the environment', () => {
		const secret = 'env-secret-cookie-abcdefghijklmnop';
		// No server is listening, so every request fails — the interesting part is
		// that the resulting error output carries no credential.
		const result = run(['--file', cohort, '--base', 'http://127.0.0.1:9'], {
			env: { KWIKSHACK_IMPORT_SESSION: secret }
		});

		expect(result.output).not.toContain(secret);
		expect(result.output).toMatch(/FAIL/);
	});

	it('never prints a credential supplied through stdin', () => {
		const secret = 'stdin-secret-cookie-abcdefghijklmnop';
		const result = run(['--file', cohort, '--base', 'http://127.0.0.1:9', '--session-stdin'], { input: secret });

		expect(result.output).not.toContain(secret);
	});

	it('reads a session file but refuses one other users can read', () => {
		const dir = mkdtempSync(join(tmpdir(), 'kwikshack-seed-'));
		tempDirs.push(dir);
		const file = join(dir, 'session');
		writeFileSync(file, 'file-secret-cookie-abcdefghijklmnop');

		chmodSync(file, 0o644);
		const loose = run(['--file', cohort, '--base', 'http://127.0.0.1:9', '--session-file', file]);
		expect(loose.code).not.toBe(0);
		expect(loose.output).toMatch(/group\/world readable/);

		chmodSync(file, 0o600);
		const tight = run(['--file', cohort, '--base', 'http://127.0.0.1:9', '--session-file', file]);
		// Now accepted — it proceeds to the (unreachable) server rather than
		// complaining about the credential.
		expect(tight.output).not.toMatch(/group\/world readable/);
		expect(tight.output).not.toContain('file-secret-cookie-abcdefghijklmnop');
	});

	it('explains the safe options when no credential is supplied', () => {
		const result = run(['--file', cohort, '--base', 'https://example.invalid']);

		expect(result.code).not.toBe(0);
		expect(result.output).toMatch(/--session-stdin/);
		expect(result.output).toMatch(/KWIKSHACK_IMPORT_SESSION/);
	});
});

describe('draft-first defaults', () => {
	it('imports as drafts unless publication is explicitly requested', () => {
		const result = run(['--file', cohort, '--dry-run']);

		expect(result.code).toBe(0);
		expect(result.output).toMatch(/importing as drafts/);
		expect(result.output).not.toMatch(/importing as PUBLISHED/);
	});

	it('says so plainly when --publish is used', () => {
		const result = run(['--file', cohort, '--dry-run', '--publish']);

		expect(result.output).toMatch(/importing as PUBLISHED/);
	});

	it('previews the whole cohort without contacting a server', () => {
		const result = run(['--file', cohort, '--dry-run', '--base', 'https://example.invalid']);

		expect(result.code).toBe(0);
		expect(result.output).toMatch(/14 listings, 2 extra sources/);
	});
});

describe('throwaway operator', () => {
	it('refuses to write an administrator into a non-local target', () => {
		const database = freshDatabase();
		const result = run([
			'--file',
			cohort,
			'--base',
			'https://kwikshack.com',
			'--database',
			database,
			'--bootstrap-session'
		]);

		expect(result.code).not.toBe(0);
		expect(result.output).toMatch(/refused for non-local target/);

		// Nothing was written.
		const sqlite = new Database(database, { readonly: true });
		expect(sqlite.prepare('SELECT COUNT(*) AS c FROM accounts').get()).toEqual({ c: 0 });
		sqlite.close();
	});

	it('removes only the account it created, leaving real operators alone', () => {
		const database = freshDatabase();
		const now = Math.floor(Date.now() / 1000);

		// A real operator who happens to exist while an import runs.
		const sqlite = new Database(database);
		sqlite
			.prepare('INSERT INTO accounts (id, display_name, role, created_at, updated_at) VALUES (?,?,?,?,?)')
			.run('real-admin', 'A genuine operator', 'admin', now, now);
		sqlite
			.prepare('INSERT INTO sessions (id, account_id, created_at, expires_at) VALUES (?,?,?,?)')
			.run('real-admin-session', 'real-admin', now, now + 86400);
		sqlite.close();

		// No server is listening, so the run fails — cleanup must still happen.
		run(['--file', cohort, '--base', 'http://127.0.0.1:9', '--database', database, '--bootstrap-session']);

		const after = new Database(database, { readonly: true });
		const accounts = after.prepare('SELECT id FROM accounts').all() as { id: string }[];
		const sessions = after.prepare('SELECT id FROM sessions').all() as { id: string }[];
		after.close();

		// The genuine operator and their session survive untouched...
		expect(accounts.map((row) => row.id)).toEqual(['real-admin']);
		expect(sessions.map((row) => row.id)).toEqual(['real-admin-session']);
		// ...and no throwaway operator is left behind.
		expect(accounts.some((row) => row.id.startsWith('seed-import-'))).toBe(false);
	});

	it('leaves no operator behind when every request fails', () => {
		const database = freshDatabase();
		run(['--file', cohort, '--base', 'http://127.0.0.1:9', '--database', database, '--bootstrap-session']);

		const sqlite = new Database(database, { readonly: true });
		const accounts = sqlite.prepare('SELECT COUNT(*) AS c FROM accounts').get() as { c: number };
		const sessions = sqlite.prepare('SELECT COUNT(*) AS c FROM sessions').get() as { c: number };
		sqlite.close();

		expect(accounts.c).toBe(0);
		expect(sessions.c).toBe(0);
	});
});
