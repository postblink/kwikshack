import { redirect } from '@sveltejs/kit';
import { dev } from '$app/environment';
import {
	BNET_SCOPES,
	BnetAuthError,
	exchangeCodeForToken,
	fetchUserInfo,
	fetchWowCharacters
} from '$lib/server/auth/bnet';
import { adminSubs, authConfig } from '$lib/server/auth/config';
import {
	consumeOAuthState,
	createSession,
	syncWowCharacters,
	upsertBattleNetAccount
} from '$lib/server/auth/session';
import { FixedWindowRateLimiter } from '$lib/server/rate-limit';
import type { RequestHandler } from './$types';

// GET /auth/battlenet/callback?code=&state=
//
// Every failure path lands on /account?error=<code> rather than rendering
// Blizzard's message. Nothing token-shaped is logged, and the authorization code
// is never echoed back to the browser.

const callbackLimiter = new FixedWindowRateLimiter({ windowMs: 60_000, maxRequests: 20 });

const MAX_CODE_LENGTH = 2048;

function fail(reason: string): never {
	redirect(303, `/account?error=${encodeURIComponent(reason)}`);
}

export const GET: RequestHandler = async (event) => {
	if (!callbackLimiter.allow(event.getClientAddress())) fail('rate_limited');

	const state = authConfig(dev);
	if (!state.enabled) fail('unconfigured');

	// The state is consumed first and unconditionally, so a replayed or forged
	// callback burns nothing and cannot be retried.
	const stored = consumeOAuthState(event.url.searchParams.get('state'));
	if (!stored) fail('state_mismatch');

	// Blizzard reports user denial as ?error=access_denied.
	if (event.url.searchParams.get('error')) fail('denied');

	const code = event.url.searchParams.get('code');
	if (!code || code.length > MAX_CODE_LENGTH) fail('missing_code');

	try {
		const token = await exchangeCodeForToken(state.config, code, event.fetch);
		const userInfo = await fetchUserInfo(state.config, token.accessToken, event.fetch);

		const isAdmin = adminSubs().has(userInfo.sub);
		const account = upsertBattleNetAccount(
			userInfo,
			state.config.oauthRegion,
			token.grantedScopes,
			isAdmin
		);

		// Character association is best-effort: a user who granted only `openid`
		// still gets a working account, with no characters attached.
		if (token.grantedScopes.includes(BNET_SCOPES.wowProfile)) {
			try {
				const characters = await fetchWowCharacters(state.config, token.accessToken, event.fetch);
				syncWowCharacters(account.id, state.config.oauthRegion, characters);
			} catch (cause) {
				// A profile-API hiccup must not cost the user their sign-in.
				console.warn('[auth] character sync failed:', cause instanceof Error ? cause.message : 'unknown error');
			}
		}

		createSession(account.id, event.cookies, !dev);
	} catch (cause) {
		if (cause instanceof BnetAuthError) fail(cause.code === 'network' ? 'network' : 'exchange_failed');
		throw cause;
	}

	redirect(303, stored.redirectTo);
};
