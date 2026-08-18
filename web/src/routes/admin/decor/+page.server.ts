import { requireAdmin } from '$lib/server/auth/guards';
import { canonicalCoverage } from '$lib/server/decor-canonical';
import { BLIZZARD_DATA_TTL_DAYS, RECOMMENDED_SYNC_INTERVAL_DAYS, oldestBlizzardRecordAgeDays } from '$lib/server/retention';
import type { PageServerLoad } from './$types';

/**
 * Read-only operator view of canonical decor coverage.
 *
 * Syncing is a CLI job (`pnpm decor:sync`), not a button: a full catalog import
 * makes thousands of API calls and must not run inside a web request.
 */
export const load: PageServerLoad = async (event) => {
	requireAdmin(event);
	const coverage = canonicalCoverage();
	const oldestDays = oldestBlizzardRecordAgeDays();

	return {
		coverage: {
			canonicalRecords: coverage.canonicalRecords,
			mappedIdentifiers: coverage.mappedIdentifiers,
			strongLinks: coverage.strongLinks,
			weakLinks: coverage.weakLinks,
			legacyCatalogRecords: coverage.legacyCatalogRecords,
			oldestSyncedAt: coverage.oldestSyncedAt?.toISOString().slice(0, 10) ?? null
		},
		sync: coverage.syncState
			? {
					status: coverage.syncState.lastStatus,
					error: coverage.syncState.lastError,
					startedAt: coverage.syncState.lastStartedAt?.toISOString().slice(0, 16).replace('T', ' ') ?? null,
					completedAt: coverage.syncState.lastCompletedAt?.toISOString().slice(0, 16).replace('T', ' ') ?? null,
					entriesSeen: coverage.syncState.entriesSeen,
					entriesWritten: coverage.syncState.entriesWritten
				}
			: null,
		retention: {
			ttlDays: BLIZZARD_DATA_TTL_DAYS,
			recommendedSyncDays: RECOMMENDED_SYNC_INTERVAL_DAYS,
			oldestBlizzardRecordAgeDays: oldestDays
		}
	};
};
