import { building } from '$app/environment';
import type { Handle } from '@sveltejs/kit';
import { SESSION_COOKIE, resolveSession } from '$lib/server/auth/session';
import { startRetentionScheduler } from '$lib/server/retention-scheduler';

// Importing the db module runs pending migrations once per process, so `vite
// dev`, `vitest`, and the production server all boot on the migrated schema.
import '$lib/server/db';

// Blizzard's 30-day data retention rule is enforced on a timer, not on request
// traffic — a quiet deployment would otherwise hold expired data indefinitely.
if (!building) startRetentionScheduler();

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.account = resolveSession(event.cookies.get(SESSION_COOKIE));
	return resolve(event);
};
