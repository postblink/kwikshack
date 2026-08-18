#!/usr/bin/env node
// KwikShack scheduled maintenance — Blizzard API data retention.
//
//   node scripts/maintenance.mjs [--database <path>] [--dry-run]
//
// This is the mechanism that satisfies Blizzard's 30-day retention rule. It must
// run on a schedule; opportunistic cleanup on request paths is not sufficient,
// because a quiet deployment would hold expired data indefinitely.
//
// Run it at least daily. Exit codes:
//   0  clean
//   1  ran, but data older than the TTL still exists (investigate)
//   2  failed to run
//
// Deliberately standalone SQL rather than importing the app: this must keep
// working even if the server build is broken, and a maintenance job is the last
// thing that should pull in a web framework.

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import Database from 'better-sqlite3';

const TTL_DAYS = 30;
const TTL_MS = TTL_DAYS * 24 * 60 * 60 * 1000;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const databaseArgIndex = args.indexOf('--database');
const databaseUrl =
	(databaseArgIndex >= 0 ? args[databaseArgIndex + 1] : undefined) ?? process.env.DATABASE_URL ?? './data/kwikshack.db';

if (!existsSync(databaseUrl)) {
	console.error(`[maintenance] database not found: ${resolve(databaseUrl)}`);
	process.exit(2);
}

const now = Date.now();
// Drizzle stores `timestamp` columns as whole seconds.
const nowSeconds = Math.floor(now / 1000);
const canonicalCutoffSeconds = Math.floor((now - TTL_MS) / 1000);

const sqlite = new Database(databaseUrl);
sqlite.pragma('foreign_keys = ON');
sqlite.pragma('busy_timeout = 5000');

function tableExists(name) {
	return Boolean(sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
}

function countWhere(table, clause, ...params) {
	if (!tableExists(table)) return 0;
	return sqlite.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE ${clause}`).get(...params).c;
}

function deleteWhere(table, clause, ...params) {
	if (!tableExists(table)) return 0;
	if (dryRun) return countWhere(table, clause, ...params);
	return sqlite.prepare(`DELETE FROM ${table} WHERE ${clause}`).run(...params).changes;
}

try {
	const report = sqlite.transaction(() => ({
		// Blizzard-derived personal/profile data. Each row carries the deadline it
		// was written with, so the rule travels with the record.
		characters: deleteWhere('wow_character_identities', 'expires_at < ?', nowSeconds),
		// Blizzard-derived static game data. Deleting it degrades to the legacy
		// catalog; it never breaks a build.
		canonicalDecor: deleteWhere('canonical_decor', 'synced_at < ?', canonicalCutoffSeconds),
		// KwikShack-owned housekeeping, not a Blizzard obligation.
		sessions: deleteWhere('sessions', 'expires_at < ?', nowSeconds),
		oauthStates: deleteWhere('oauth_states', 'expires_at < ?', nowSeconds)
	}))();

	// Verify rather than assume: after deleting, nothing Blizzard-derived may
	// remain older than the TTL.
	const remaining = [
		countWhere('wow_character_identities', 'refreshed_at < ?', canonicalCutoffSeconds),
		countWhere('canonical_decor', 'synced_at < ?', canonicalCutoffSeconds)
	].reduce((a, b) => a + b, 0);

	// Counts only. Never a character name, realm, BattleTag, account id, or token.
	console.log(
		`[maintenance]${dryRun ? ' DRY RUN' : ''} ttl_days=${TTL_DAYS} ` +
			`characters=${report.characters} canonical_decor=${report.canonicalDecor} ` +
			`sessions=${report.sessions} oauth_states=${report.oauthStates} ` +
			`over_ttl_remaining=${remaining}`
	);

	if (remaining > 0 && !dryRun) {
		console.error(`[maintenance] FAIL: ${remaining} Blizzard-derived record(s) remain older than ${TTL_DAYS} days`);
		process.exitCode = 1;
	}
} catch (error) {
	console.error(`[maintenance] FAILED: ${error instanceof Error ? error.message : String(error)}`);
	process.exitCode = 2;
} finally {
	sqlite.close();
}
