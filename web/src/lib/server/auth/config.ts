import { env } from '$env/dynamic/private';
import {
	BNET_API_REGIONS,
	BNET_OAUTH_REGIONS,
	type BnetApiRegion,
	type BnetConfig,
	type BnetOAuthRegion
} from './bnet';

/**
 * Battle.net sign-in is a feature flag. When the client credentials are absent
 * the rest of the site — including the invitation-key submission pilot — keeps
 * working exactly as before, and the auth routes return 503 instead of
 * half-attempting a flow.
 *
 * Manual Blizzard Developer Portal setup is required before this can be
 * enabled; see docs/battlenet-identity.md.
 */
export type AuthConfigState =
	| { enabled: true; config: BnetConfig }
	| { enabled: false; reason: string };

function isOAuthRegion(value: string): value is BnetOAuthRegion {
	return (BNET_OAUTH_REGIONS as readonly string[]).includes(value);
}

function isApiRegion(value: string): value is BnetApiRegion {
	return (BNET_API_REGIONS as readonly string[]).includes(value);
}

/**
 * Resolve the OAuth configuration from the environment.
 *
 * Exported as a pure function of a plain record so it can be unit-tested
 * without a SvelteKit environment.
 */
export function resolveAuthConfig(source: Record<string, string | undefined>, isDev: boolean): AuthConfigState {
	const clientId = source.BNET_CLIENT_ID?.trim();
	const clientSecret = source.BNET_CLIENT_SECRET?.trim();
	const redirectUri = source.BNET_REDIRECT_URI?.trim();

	if (!clientId || !clientSecret) {
		return { enabled: false, reason: 'BNET_CLIENT_ID and BNET_CLIENT_SECRET are not configured' };
	}
	if (!redirectUri) {
		return { enabled: false, reason: 'BNET_REDIRECT_URI is not configured' };
	}

	let parsedRedirect: URL;
	try {
		parsedRedirect = new URL(redirectUri);
	} catch {
		return { enabled: false, reason: 'BNET_REDIRECT_URI is not a valid absolute URL' };
	}

	// Blizzard requires an HTTPS redirect URI. http://localhost is tolerated
	// locally only, so a misconfigured production deploy cannot downgrade.
	const isLocalhost = parsedRedirect.hostname === 'localhost' || parsedRedirect.hostname === '127.0.0.1';
	if (parsedRedirect.protocol !== 'https:' && !(isDev && isLocalhost && parsedRedirect.protocol === 'http:')) {
		return { enabled: false, reason: 'BNET_REDIRECT_URI must be an https:// URL' };
	}

	const oauthRegionRaw = (source.BNET_OAUTH_REGION ?? source.BNET_REGION ?? 'us').trim().toLowerCase();
	const apiRegionRaw = (source.BNET_API_REGION ?? source.BNET_REGION ?? 'us').trim().toLowerCase();
	if (!isOAuthRegion(oauthRegionRaw)) {
		return { enabled: false, reason: `BNET_OAUTH_REGION must be one of ${BNET_OAUTH_REGIONS.join(', ')}` };
	}
	if (!isApiRegion(apiRegionRaw)) {
		return { enabled: false, reason: `BNET_API_REGION must be one of ${BNET_API_REGIONS.join(', ')}` };
	}

	return {
		enabled: true,
		config: {
			clientId,
			clientSecret,
			redirectUri: parsedRedirect.toString(),
			oauthRegion: oauthRegionRaw,
			apiRegion: apiRegionRaw
		}
	};
}

/**
 * Battle.net account ids (the `sub` from /userinfo) allowed to review claims and
 * index blueprints. Comma-separated. Empty means nobody — admin routes fail
 * closed rather than defaulting to the first account that signs in.
 */
export function resolveAdminSubs(source: Record<string, string | undefined>): Set<string> {
	return new Set(
		(source.KWIKSHACK_ADMIN_BNET_SUBS ?? '')
			.split(',')
			.map((value) => value.trim())
			.filter(Boolean)
	);
}

export function authConfig(isDev: boolean): AuthConfigState {
	return resolveAuthConfig(env as Record<string, string | undefined>, isDev);
}

export function adminSubs(): Set<string> {
	return resolveAdminSubs(env as Record<string, string | undefined>);
}
