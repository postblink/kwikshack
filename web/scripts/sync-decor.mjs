#!/usr/bin/env node
// Import Blizzard's Housing Decor catalog into KwikShack's canonical tables.
//
//   node scripts/sync-decor.mjs [--database <path>] [--region us] [--locale en_US]
//                               [--limit N] [--dry-run] [--probe]
//
// Requires BNET_CLIENT_ID / BNET_CLIENT_SECRET (client-credentials — no user is
// involved and no profile endpoint is touched).
//
// Run this on a schedule well inside the 30-day retention window; weekly is the
// documented cadence. Canonical rows are deleted by scripts/maintenance.mjs once
// they pass the TTL, and the site falls back to the legacy catalog until the
// next successful sync.
//
// --probe fetches a couple of records and prints the field names Blizzard
// actually returned, WITHOUT writing anything. The decor response shape is not
// published on the Developer Portal, so confirm the identifier mapping with a
// probe before trusting a first full import.

import { existsSync } from 'node:fs';
import Database from 'better-sqlite3';
import { GameDataClient, GameDataError } from '../src/lib/server/blizzard-game-data.js';
import { parseDecorDetail, parseDecorIndex, recordSyncState, upsertCanonicalDecor } from '../src/lib/server/decor-sync.js';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
	const index = args.indexOf(`--${name}`);
	return index >= 0 && args[index + 1] && !args[index + 1].startsWith('--') ? args[index + 1] : fallback;
};

const dryRun = args.includes('--dry-run');
const probe = args.includes('--probe');
const region = flag('region', process.env.BNET_API_REGION ?? process.env.BNET_REGION ?? 'us');
const oauthRegion = process.env.BNET_OAUTH_REGION ?? (region === 'cn' ? 'cn' : 'us');
const locale = flag('locale', 'en_US');
const limit = Number(flag('limit', '0')) || 0;
const databaseUrl = flag('database', process.env.DATABASE_URL ?? './data/kwikshack.db');

const clientId = process.env.BNET_CLIENT_ID;
const clientSecret = process.env.BNET_CLIENT_SECRET;
if (!clientId || !clientSecret) {
	console.error('[sync-decor] BNET_CLIENT_ID and BNET_CLIENT_SECRET are required');
	process.exit(2);
}
if (!existsSync(databaseUrl) && !probe) {
	console.error(`[sync-decor] database not found: ${databaseUrl}`);
	process.exit(2);
}

const client = new GameDataClient({
	clientId,
	clientSecret,
	oauthRegion,
	apiRegion: region,
	locale,
	// A generous but hard ceiling. Blizzard permits 36,000 calls/hour; a runaway
	// loop should stop long before it becomes anyone's problem.
	maxRequests: 6000,
	delayMs: 60
});

async function main() {
	console.log(`[sync-decor] region=${region} locale=${locale}${dryRun ? ' DRY RUN' : ''}${probe ? ' PROBE' : ''}`);

	const index = await client.get('/data/wow/decor/index');
	if (index === null) {
		console.error('[sync-decor] /data/wow/decor/index returned 404 — the endpoint may be unavailable in this region');
		process.exit(1);
	}

	let entries = parseDecorIndex(index);
	if (entries.length === 0) {
		// Do not guess at a shape. Show the operator what actually came back.
		console.error('[sync-decor] could not read any entries from the index. Top-level keys were:');
		console.error(`  ${Object.keys(index ?? {}).join(', ') || '(none)'}`);
		console.error('[sync-decor] update parseDecorIndex() in src/lib/server/decor-sync.js to match.');
		process.exit(1);
	}
	console.log(`[sync-decor] index lists ${entries.length} decor entries`);
	if (limit > 0) entries = entries.slice(0, limit);

	if (probe) {
		for (const entry of entries.slice(0, 3)) {
			const detail = await client.get(`/data/wow/decor/${entry.id}`);
			console.log(`[sync-decor] probe decor ${entry.id}: keys = ${Object.keys(detail ?? {}).join(', ')}`);
			const parsed = parseDecorDetail(detail, locale);
			console.log(
				`[sync-decor]   parsed -> ${
					parsed ? `name="${parsed.name}" itemId=${parsed.itemId} category=${parsed.category}` : 'UNPARSEABLE'
				}`
			);
		}
		console.log('[sync-decor] probe complete; nothing was written');
		return;
	}

	const sqlite = new Database(databaseUrl);
	sqlite.pragma('foreign_keys = ON');
	sqlite.pragma('busy_timeout = 5000');

	const startedAtSeconds = Math.floor(Date.now() / 1000);
	let seen = 0;
	let written = 0;
	let mapped = 0;
	let failures = 0;

	try {
		if (!dryRun) {
			recordSyncState(sqlite, { region, locale, status: 'partial', seen: 0, written: 0, startedAtSeconds });
		}

		// Batch so a long run commits progress instead of risking everything on one
		// transaction, and so a failure part-way leaves a usable partial catalog.
		let batch = [];
		for (const entry of entries) {
			let detail;
			try {
				detail = await client.get(`/data/wow/decor/${entry.id}`);
			} catch (error) {
				failures += 1;
				if (error instanceof GameDataError && error.status && error.status >= 500) continue;
				throw error;
			}
			seen += 1;
			// A 404 for one decor is normal (removed from the game); skip it.
			if (detail === null) continue;

			const parsed = parseDecorDetail(detail, locale);
			if (!parsed) {
				failures += 1;
				continue;
			}
			batch.push(parsed);

			if (batch.length >= 100 && !dryRun) {
				const result = upsertCanonicalDecor(sqlite, batch, { region, locale });
				written += result.written;
				mapped += result.mapped;
				batch = [];
				console.log(`[sync-decor] ${written}/${entries.length} written`);
			}
		}

		if (batch.length && !dryRun) {
			const result = upsertCanonicalDecor(sqlite, batch, { region, locale });
			written += result.written;
			mapped += result.mapped;
		}

		if (!dryRun) {
			recordSyncState(sqlite, {
				region,
				locale,
				status: failures > 0 ? 'partial' : 'ok',
				seen,
				written,
				startedAtSeconds,
				completedAtSeconds: Math.floor(Date.now() / 1000)
			});
		}

		console.log(
			`[sync-decor] done seen=${seen} written=${written} identifier_links=${mapped} ` +
				`unparsed=${failures} api_requests=${client.requests}`
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (!dryRun) {
			recordSyncState(sqlite, { region, locale, status: 'failed', error: message, seen, written, startedAtSeconds });
		}
		console.error(`[sync-decor] FAILED after ${client.requests} requests: ${message}`);
		process.exitCode = 1;
	} finally {
		sqlite.close();
	}
}

main().catch((error) => {
	console.error(`[sync-decor] FAILED: ${error instanceof Error ? error.message : String(error)}`);
	process.exit(1);
});
