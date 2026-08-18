import { error, redirect } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { BNET_SCOPES, buildAuthorizeUrl } from '$lib/server/auth/bnet';
import { authConfig } from '$lib/server/auth/config';
import { issueOAuthState, safeRedirect } from '$lib/server/auth/session';
import { FixedWindowRateLimiter } from '$lib/server/rate-limit';
import type { RequestHandler } from './$types';

// GET /auth/battlenet?redirectTo=/some/path
// Starts the Battle.net authorization-code flow.

const startLimiter = new FixedWindowRateLimiter({ windowMs: 60_000, maxRequests: 20 });

export const GET: RequestHandler = async (event) => {
	if (!startLimiter.allow(event.getClientAddress())) error(429, 'Too many sign-in attempts');

	const state = authConfig(dev);
	if (!state.enabled) error(503, 'Battle.net sign-in is not configured');

	// `openid` gets the account id and BattleTag; `wow.profile` is what makes
	// character association possible. Blizzard lets the user approve either one
	// alone, and the callback handles a partial grant.
	const scopes = [BNET_SCOPES.openid, BNET_SCOPES.wowProfile];
	const oauthState = issueOAuthState(safeRedirect(event.url.searchParams.get('redirectTo')));

	redirect(303, buildAuthorizeUrl(state.config, oauthState, scopes));
};
