import { error, redirect } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import type { AuthenticatedAccount } from './session';

/**
 * Authorization helpers.
 *
 * Every mutating surface goes through one of these. Authorization is never
 * inferred from a display name, an attributed creator string, or anything a
 * caller supplied — only from the session the server resolved.
 */

/** Require a signed-in account. Sends browsers to sign in; fails APIs with 401. */
export function requireAccount(event: RequestEvent, options: { html?: boolean } = {}): AuthenticatedAccount {
	const account = event.locals.account;
	if (account) return account;
	if (options.html) {
		const target = `${event.url.pathname}${event.url.search}`;
		redirect(303, `/account?redirectTo=${encodeURIComponent(target)}`);
	}
	error(401, 'Sign in with Battle.net to continue');
}

/**
 * Require an operator. Admin status comes from KWIKSHACK_ADMIN_BNET_SUBS and is
 * refreshed on each sign-in, so revoking it in configuration takes effect
 * without a database edit.
 *
 * 404, not 403: an unauthorized visitor learns nothing about which admin
 * surfaces exist.
 */
export function requireAdmin(event: RequestEvent): AuthenticatedAccount {
	const account = event.locals.account;
	if (!account || account.role !== 'admin') error(404, 'Not found');
	return account;
}
