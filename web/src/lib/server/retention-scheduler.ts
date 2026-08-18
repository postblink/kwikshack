import { formatRetentionReport, runRetentionMaintenance } from './retention';

/**
 * In-process retention scheduler.
 *
 * Why in-process rather than a platform cron: this deployment is a single
 * Railway service with a mounted volume and no cloud scheduler. The existing
 * `scripts/backup_volume.sh` cron runs from a workstation, which is fine for
 * backups and not fine for a compliance obligation. The application server is
 * the only process guaranteed to be running wherever the database is — and if
 * it is not running, nobody can read the data either.
 *
 * `scripts/maintenance.mjs` remains the operator path: manual runs, a platform
 * cron if one is ever added, and verification in CI. Both call the same rules.
 *
 * Cheap enough to run often: a handful of indexed DELETEs against a SQLite file.
 * Running every six hours rather than every twenty-four means a missed tick
 * never puts the 30-day deadline at risk.
 */
const INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Let the server finish booting before touching the database. */
const INITIAL_DELAY_MS = 30 * 1000;

const globalForScheduler = globalThis as unknown as { __kwikshackRetentionTimer?: NodeJS.Timeout };

function runOnce(): void {
	try {
		const report = runRetentionMaintenance();
		// Counts only — never a name, realm, BattleTag, account id, or token.
		const changed =
			report.expiredCharacters + report.expiredCanonicalDecor + report.expiredSessions + report.expiredOauthStates;
		if (changed > 0) console.log(`[retention] ${formatRetentionReport(report)}`);
	} catch (error) {
		// Never let maintenance take the server down.
		console.error(`[retention] run failed: ${error instanceof Error ? error.message : 'unknown error'}`);
	}
}

/** Idempotent: repeated calls (dev hot reload) do not stack timers. */
export function startRetentionScheduler(): void {
	if (globalForScheduler.__kwikshackRetentionTimer) return;

	const timer = setInterval(runOnce, INTERVAL_MS);
	// Do not hold the process open on shutdown.
	timer.unref?.();
	globalForScheduler.__kwikshackRetentionTimer = timer;

	const initial = setTimeout(runOnce, INITIAL_DELAY_MS);
	initial.unref?.();
}
