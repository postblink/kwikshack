#!/usr/bin/env node
// Load a reviewed blueprint cohort through KwikShack's real indexing path.
//
// Records are imported as DRAFTS by default. The intended lifecycle is:
//
//     ingest → draft → resolve/verify → review → publish
//
// so the easiest command can never publish an unreviewed batch to the public
// gallery. `--publish` opts into immediate publication and should normally only
// be used locally.
//
// USAGE
//
//   Production (draft import, session read from stdin — never from argv):
//     printf '%s' "$COOKIE" | node scripts/seed-blueprints.mjs \
//         --file scripts/seed/blueprint-cohort-01.json \
//         --base https://kwikshack.com --session-stdin
//
//   Local development (bootstraps a throwaway operator against localhost only):
//     node scripts/seed-blueprints.mjs --base http://127.0.0.1:3000 \
//         --database ./data/kwikshack.db --bootstrap-session
//
//   Preview without contacting a server:
//     node scripts/seed-blueprints.mjs --dry-run
//
// CREDENTIALS
//
// The operator session cookie is a bearer credential: anything holding it can
// act as an administrator until it expires. It is therefore never accepted as a
// command-line argument, because argv is visible to every process on the host
// (`ps auxww`) and is written to shell history. Accepted sources, in order of
// preference:
//
//   1. --session-stdin           read from stdin; the strongest option
//   2. KWIKSHACK_IMPORT_SESSION  environment variable
//   3. --session-file <path>     a file, refused if group/world readable
//
// The value is never logged, never echoed, and is redacted from any error text
// before it is printed.
//
// This POSTs to the operator form at /admin/blueprints rather than writing to
// the database, so a run exercises exactly what a curator using the admin UI
// exercises: auth, validation, host checks, native-build conflict detection,
// dedup, provenance, and audit events. A seed path that bypassed those would
// test nothing.

import { readFileSync, statSync } from 'node:fs';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
	const i = args.indexOf(`--${name}`);
	return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const has = (name) => args.includes(`--${name}`);

const HELP = `
KwikShack blueprint cohort importer — imports as drafts by default.

  --file <path>          cohort JSON (default scripts/seed/blueprint-cohort-01.json)
  --base <url>           server to import into (default http://127.0.0.1:3000)
  --database <path>      database, only used by --bootstrap-session
  --dry-run              list what would be imported; contacts no server
  --publish              publish immediately instead of importing as drafts
  --session-stdin        read the operator session cookie from stdin (preferred)
  --session-file <path>  read it from a file (must not be group/world readable)
  --bootstrap-session    create a throwaway operator; localhost targets only
  --help

The session cookie is never accepted as a command-line argument.
Set KWIKSHACK_IMPORT_SESSION, or pipe it in:

  printf '%s' "$COOKIE" | node scripts/seed-blueprints.mjs --base https://… --session-stdin
`;

/**
 * Whatever credential this run is using, held only so it can be stripped from
 * output. Nothing reads it to authenticate.
 */
let activeSecret = null;

/** Redact the active credential from anything about to be printed. */
function redact(text) {
	const value = String(text ?? '');
	if (!activeSecret || activeSecret.length < 8) return value;
	return value.split(activeSecret).join('[redacted]');
}

// -----------------------------------------------------------------------------
// Credentials
// -----------------------------------------------------------------------------

function readStdin() {
	return new Promise((resolve, reject) => {
		let data = '';
		process.stdin.setEncoding('utf8');
		process.stdin.on('data', (chunk) => (data += chunk));
		process.stdin.on('end', () => resolve(data));
		process.stdin.on('error', reject);
	});
}

function readSessionFile(path) {
	const stats = statSync(path);
	// 0o077 covers group and other. A credential readable by anyone else on the
	// box is not meaningfully protected.
	if (stats.mode & 0o077) {
		throw new Error(`session file ${path} is group/world readable — run: chmod 600 ${path}`);
	}
	return readFileSync(path, 'utf8');
}

/**
 * Resolve the operator session without ever touching argv.
 * Returns null when the caller is bootstrapping a local session instead.
 */
async function resolveSession() {
	// A hard failure rather than a warning: silently accepting an argv secret
	// would defeat the point of every other precaution here.
	if (has('session')) {
		throw new Error(
			'--session is not accepted: command-line arguments are visible to other processes and are saved in shell history.\n' +
				'       Use --session-stdin, KWIKSHACK_IMPORT_SESSION, or --session-file instead.'
		);
	}

	if (has('session-stdin')) {
		const value = (await readStdin()).trim();
		if (!value) throw new Error('--session-stdin was given but stdin was empty');
		activeSecret = value;
		return value;
	}

	const fromEnv = process.env.KWIKSHACK_IMPORT_SESSION?.trim();
	if (fromEnv) {
		activeSecret = fromEnv;
		return fromEnv;
	}

	const sessionFile = flag('session-file', null);
	if (sessionFile) {
		const value = readSessionFile(sessionFile).trim();
		if (!value) throw new Error(`session file ${sessionFile} was empty`);
		activeSecret = value;
		return value;
	}

	return null;
}

// -----------------------------------------------------------------------------
// Throwaway local operator
// -----------------------------------------------------------------------------

/**
 * A fresh id per run. Never a fixed one: a fixed id could collide with — and
 * then delete — a real account, and cleanup must only ever remove the row this
 * run created.
 */
let bootstrappedAccountId = null;
let bootstrapDatabaseUrl = null;

function assertLocalTarget(base) {
	const host = new URL(base).hostname;
	if (host !== 'localhost' && host !== '127.0.0.1' && host !== '::1') {
		throw new Error(
			`--bootstrap-session writes an administrator straight into the database and is refused for non-local target "${host}".\n` +
				'       For a real deployment, sign in as an operator and pass the session via --session-stdin.'
		);
	}
}

function bootstrapSession(databaseUrl, base) {
	assertLocalTarget(base);

	const sqlite = new Database(databaseUrl);
	const now = Math.floor(Date.now() / 1000);
	const accountId = `seed-import-${randomUUID()}`;
	const token = randomBytes(32).toString('base64url');

	// Register the id for cleanup BEFORE writing anything, so a failure part-way
	// through cannot leave an administrator row nobody knows to remove.
	bootstrappedAccountId = accountId;
	bootstrapDatabaseUrl = databaseUrl;

	try {
		// One transaction, and plain INSERT rather than INSERT OR REPLACE: if this
		// id somehow already exists the run must fail, never overwrite an account.
		sqlite.transaction(() => {
			sqlite
				.prepare('INSERT INTO accounts (id, display_name, role, created_at, updated_at) VALUES (?,?,?,?,?)')
				.run(accountId, 'Temporary import operator', 'admin', now, now);
			sqlite
				.prepare('INSERT INTO sessions (id, account_id, created_at, expires_at) VALUES (?,?,?,?)')
				.run(createHash('sha256').update(token).digest('hex'), accountId, now, now + 3600);
		})();
	} finally {
		sqlite.close();
	}

	activeSecret = token;
	console.log('[seed] created a throwaway operator for this run (removed when it finishes)');
	return token;
}

/**
 * Remove only the account this run created.
 *
 * Deliberately scoped by the generated id: an operator who imported using their
 * own session must never lose their account because they ran an import. Audit
 * events survive with a null actor via
 * blueprint_audit_events.actor_account_id ON DELETE SET NULL.
 *
 * Idempotent, so it is safe to call from several exit paths.
 */
function cleanupBootstrap() {
	if (!bootstrappedAccountId || !bootstrapDatabaseUrl) return;
	const accountId = bootstrappedAccountId;
	bootstrappedAccountId = null;

	try {
		const sqlite = new Database(bootstrapDatabaseUrl);
		try {
			sqlite.prepare('DELETE FROM sessions WHERE account_id = ?').run(accountId);
			sqlite.prepare('DELETE FROM accounts WHERE id = ?').run(accountId);
		} finally {
			sqlite.close();
		}
		console.log('[seed] throwaway operator removed');
	} catch (error) {
		// Name the id so it can be removed by hand; it is not a secret.
		console.error(
			`[seed] WARNING could not remove the throwaway operator "${accountId}" — delete it by hand: ` +
				(error instanceof Error ? error.message : String(error))
		);
	}
}

// Interrupted runs must not leave an administrator behind either.
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
	process.on(signal, () => {
		cleanupBootstrap();
		process.exit(130);
	});
}
process.on('exit', cleanupBootstrap);

// -----------------------------------------------------------------------------
// Posting
// -----------------------------------------------------------------------------

/** SvelteKit returns an ActionResult envelope; the HTTP status is always 200. */
function readResult(payload) {
	if (!payload || typeof payload !== 'object') return { type: 'unknown' };
	if (payload.type === 'failure') {
		let detail = payload.data;
		try {
			const parsed = JSON.parse(payload.data);
			detail = Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string').join('; ') : payload.data;
		} catch {
			/* leave as-is */
		}
		return { type: 'failure', status: payload.status, detail };
	}
	let outcome = null;
	try {
		const parsed = JSON.parse(payload.data);
		outcome = Array.isArray(parsed) ? parsed.find((v) => typeof v === 'string') : null;
	} catch {
		/* leave as-is */
	}
	return { type: 'success', outcome };
}

async function postListing(entry, sessionToken, { base, publish }) {
	const body = new URLSearchParams();
	body.set('shareCode', entry.shareCode);
	body.set('title', entry.title ?? '');
	body.set('attributedCreator', entry.attributedCreator ?? '');
	body.set('attributedCharacter', entry.attributedCharacter ?? '');
	body.set('attributedRealm', entry.attributedRealm ?? '');
	body.set('platform', entry.platform ?? '');
	body.set('sourceUrl', entry.sourceUrl ?? '');
	body.set('discoveredAt', entry.discoveredAt ?? '');
	body.set('internalNotes', entry.internalNotes ?? '');
	body.set('blueprintType', entry.blueprintType ?? 'House');
	body.set('blueprintScope', entry.blueprintScope ?? '');
	body.set('faction', entry.faction ?? '');
	// Absent means draft — the admin action only publishes on an explicit
	// publication=published field.
	if (publish) body.set('publication', 'published');

	const response = await fetch(`${base}/admin/blueprints?/index`, {
		method: 'POST',
		headers: {
			'content-type': 'application/x-www-form-urlencoded',
			origin: base,
			cookie: `kwikshack_session=${sessionToken}`
		},
		body
	});
	if (response.status === 404) {
		throw new Error('admin route returned 404 — the session is missing, expired, or not an operator');
	}
	if (response.status === 401 || response.status === 403) {
		throw new Error(`admin route rejected the session (HTTP ${response.status})`);
	}
	return readResult(await response.json().catch(() => null));
}

// -----------------------------------------------------------------------------

async function main() {
	if (has('help')) {
		console.log(HELP.trim());
		return;
	}

	const file = flag('file', 'scripts/seed/blueprint-cohort-01.json');
	const base = flag('base', 'http://127.0.0.1:3000').replace(/\/$/, '');
	const databaseUrl = flag('database', process.env.DATABASE_URL ?? './data/kwikshack.db');
	const dryRun = has('dry-run');
	// Draft-first: publishing is opt-in, so the easiest command cannot push an
	// unreviewed cohort live.
	const publish = has('publish');

	const cohort = JSON.parse(readFileSync(file, 'utf8'));
	const listings = cohort.listings ?? [];
	const extraSources = cohort.extraSources ?? [];

	console.log(`[seed] cohort ${cohort.cohort} — ${listings.length} listings, ${extraSources.length} extra sources`);
	console.log(
		`[seed] target ${base}${dryRun ? ' DRY RUN' : ''} — importing as ${publish ? 'PUBLISHED' : 'drafts'}`
	);
	if (!publish && !dryRun) {
		console.log('[seed] drafts are not visible in the public gallery; publish them after review');
	}

	if (dryRun) {
		for (const entry of listings) {
			console.log(`[seed] would index ${entry.shareCode}  ${entry.title}  (${entry.platform})`);
		}
		for (const extra of extraSources) {
			console.log(`[seed] would add source ${extra.platform} → ${extra.shareCode}`);
		}
		return;
	}

	let session = await resolveSession();
	if (!session) {
		if (!has('bootstrap-session')) {
			throw new Error(
				'no operator session supplied.\n' +
					'       Pipe one in:  printf \'%s\' "$COOKIE" | node scripts/seed-blueprints.mjs … --session-stdin\n' +
					'       or set KWIKSHACK_IMPORT_SESSION, or use --session-file <path>.\n' +
					'       For local development, --bootstrap-session creates a throwaway operator.'
			);
		}
		session = bootstrapSession(databaseUrl, base);
	}

	const tally = { created: 0, source_added: 0, duplicate: 0, failed: 0 };
	try {
		for (const entry of [...listings, ...extraSources]) {
			// An extra source reuses an already-indexed code, so the same call is
			// expected to come back as `source_added` rather than `created`.
			const label = entry.title ?? `source for ${entry.shareCode}`;
			try {
				const result = await postListing(entry, session, { base, publish });
				if (result.type === 'failure') {
					tally.failed += 1;
					console.error(`[seed] FAIL  ${label}: ${result.status} ${redact(result.detail)}`);
				} else {
					const outcome = result.outcome ?? 'unknown';
					tally[outcome] = (tally[outcome] ?? 0) + 1;
					console.log(`[seed] ${outcome.padEnd(12)} ${label}`);
				}
			} catch (error) {
				tally.failed += 1;
				const message = error instanceof Error ? error.message : String(error);
				console.error(`[seed] FAIL  ${label}: ${redact(message)}`);
			}
		}
	} finally {
		cleanupBootstrap();
	}

	console.log(
		`[seed] done created=${tally.created} source_added=${tally.source_added} ` +
			`duplicate=${tally.duplicate} failed=${tally.failed}`
	);
	if (!publish && tally.created > 0) {
		console.log(`[seed] ${tally.created} draft(s) await review at ${base}/admin/blueprints`);
	}
	if (tally.failed > 0) process.exitCode = 1;
}

main().catch((error) => {
	cleanupBootstrap();
	const message = error instanceof Error ? error.message : String(error);
	console.error(`[seed] FAILED: ${redact(message)}`);
	process.exit(1);
});
