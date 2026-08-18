import { lt } from 'drizzle-orm';
import { db } from './db';
import { canonicalDecor, oauthStates, sessions, wowCharacterIdentities } from './db/schema';

/**
 * Blizzard API data retention.
 *
 * Verified against the Blizzard Developer API Terms of Use and Blizzard's
 * Data Protection Notice & FAQ (re-checked 2026-08-17):
 *
 *   "You must implement a maximum 30-day TTL (time-to-live) policy for all Data
 *    obtained through our APIs."
 *   "You must refresh your data no less frequently than every thirty (30) days."
 *   "developers should delete the data if you receive a 404 – Not Found error"
 *
 * The refresh obligation exists because retained data "could belong to a user
 * who has asked for their data to be made private or erased". KwikShack stores
 * no access or refresh token by design, so it cannot refresh profile data
 * unattended — which makes deletion at the TTL the compliant behaviour, and
 * re-authentication the way a user restores their character list.
 *
 * A note on scope, because the Terms are genuinely ambiguous here: the TTL
 * clause says "all Data obtained through our APIs", while the Data Protection
 * FAQ frames the rule entirely around *player* data. KwikShack applies the
 * strict reading and expires canonical decor (static game data) on the same
 * clock as character data. Losing it degrades to the legacy catalog rather than
 * breaking anything, so the strict reading costs little.
 *
 * `decor_items` is deliberately NOT expired: it is KwikShack's own catalog,
 * seeded from the MIT-licensed Housing Decor Guide data files and Wowhead
 * enrichment, not from a Blizzard API.
 */
export const BLIZZARD_DATA_TTL_DAYS = 30;
export const BLIZZARD_DATA_TTL_MS = BLIZZARD_DATA_TTL_DAYS * 24 * 60 * 60 * 1000;

/**
 * Refresh well inside the deadline rather than at it. A sync that only runs at
 * day 30 has no room for a failed run.
 */
export const RECOMMENDED_SYNC_INTERVAL_DAYS = 7;

export interface RetentionReport {
	/** Blizzard-derived character rows deleted past the TTL. */
	expiredCharacters: number;
	/** Blizzard-derived canonical decor rows deleted past the TTL. */
	expiredCanonicalDecor: number;
	/** KwikShack-owned housekeeping, not a Blizzard obligation. */
	expiredSessions: number;
	expiredOauthStates: number;
	/** Oldest surviving Blizzard-derived record, for the operator's confidence. */
	oldestBlizzardRecordAgeDays: number | null;
	ranAt: Date;
}

function ageInDays(from: Date, now: Date): number {
	return Math.floor((now.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * Delete every Blizzard-derived record past its retention deadline, plus expired
 * KwikShack session/state rows.
 *
 * Idempotent and safe to run repeatedly: it deletes only rows whose own stored
 * deadline has already passed, so a second run in the same second is a no-op.
 *
 * Deliberately narrow. It does not touch accounts, Battle.net identities,
 * claims, audit events, builds, indexed blueprints, provenance, screenshots, or
 * the legacy decor catalog. Losing a character association must not cascade
 * into losing a creator's listing.
 */
export function runRetentionMaintenance(now = new Date()): RetentionReport {
	const canonicalCutoff = new Date(now.getTime() - BLIZZARD_DATA_TTL_MS);

	const report = db.transaction((tx) => {
		// wow_character_identities carries its own expires_at, set when the row was
		// written, so the deadline travels with the record.
		const expiredCharacters = tx.delete(wowCharacterIdentities).where(lt(wowCharacterIdentities.expiresAt, now)).run()
			.changes;

		// canonical_decor records when it was synced; the deadline is derived.
		const expiredCanonicalDecor = tx.delete(canonicalDecor).where(lt(canonicalDecor.syncedAt, canonicalCutoff)).run()
			.changes;

		const expiredSessions = tx.delete(sessions).where(lt(sessions.expiresAt, now)).run().changes;
		const expiredOauthStates = tx.delete(oauthStates).where(lt(oauthStates.expiresAt, now)).run().changes;

		return { expiredCharacters, expiredCanonicalDecor, expiredSessions, expiredOauthStates };
	});

	return { ...report, oldestBlizzardRecordAgeDays: oldestBlizzardRecordAgeDays(now), ranAt: now };
}

/**
 * Age of the oldest surviving Blizzard-derived record, in whole days. After
 * maintenance this must be below the TTL; the CLI treats anything else as a
 * compliance failure rather than a warning.
 */
export function oldestBlizzardRecordAgeDays(now = new Date()): number | null {
	const characterAges = db
		.select({ refreshedAt: wowCharacterIdentities.refreshedAt })
		.from(wowCharacterIdentities)
		.all()
		.map((row) => ageInDays(row.refreshedAt, now));
	const decorAges = db
		.select({ syncedAt: canonicalDecor.syncedAt })
		.from(canonicalDecor)
		.all()
		.map((row) => ageInDays(row.syncedAt, now));

	const all = [...characterAges, ...decorAges];
	return all.length ? Math.max(...all) : null;
}

/**
 * One-line summary for logs. Counts only — never a character name, realm,
 * BattleTag, account id, or anything token-shaped.
 */
export function formatRetentionReport(report: RetentionReport): string {
	const oldest = report.oldestBlizzardRecordAgeDays;
	return [
		`characters=${report.expiredCharacters}`,
		`canonical_decor=${report.expiredCanonicalDecor}`,
		`sessions=${report.expiredSessions}`,
		`oauth_states=${report.expiredOauthStates}`,
		`oldest_blizzard_record_days=${oldest === null ? 'none' : oldest}`
	].join(' ');
}
