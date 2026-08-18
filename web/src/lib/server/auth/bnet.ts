// Battle.net OAuth 2.0 authorization-code client.
//
// Verified against Blizzard's current official documentation (2026-08-17):
//   https://community.developer.battle.net/documentation/guides/using-oauth
//   https://community.developer.battle.net/documentation/guides/using-oauth/authorization-code-flow
//   https://oauth.battle.net/.well-known/openid-configuration
//
// Facts this implementation depends on, and what they imply:
//
//  * Authorize/token hosts are https://oauth.battle.net for US/EU/APAC and
//    https://oauth.battlenet.com.cn for CN. /userinfo is served from the same
//    OAuth host, not from the regional API host.
//  * The token request authenticates with HTTP Basic client_id:client_secret.
//    This is a CONFIDENTIAL client; the secret never reaches the browser.
//  * Blizzard's discovery document advertises no `code_challenge_methods_supported`
//    and the OAuth guide documents no PKCE parameters, so PKCE is NOT used.
//    Single-use, server-issued `state` is the CSRF defence.
//  * Access tokens last ~24h. The documented token response contains no
//    refresh_token, so KwikShack does not attempt refresh — it re-authenticates.
//    Tokens are used inside the callback request and then discarded; nothing
//    token-shaped is persisted or logged.
//  * Users can approve a subset of the requested scopes, so the granted scope
//    list in the token response must be honoured rather than assumed.

export const BNET_SCOPES = { openid: 'openid', wowProfile: 'wow.profile' } as const;

/** OAuth regions per Blizzard's OAuth guide (kr/tw were folded into apac). */
export const BNET_OAUTH_REGIONS = ['us', 'eu', 'apac', 'cn'] as const;
export type BnetOAuthRegion = (typeof BNET_OAUTH_REGIONS)[number];

/** API host regions per the WoW Profile API docs — a different set from OAuth. */
export const BNET_API_REGIONS = ['us', 'eu', 'kr', 'tw', 'cn'] as const;
export type BnetApiRegion = (typeof BNET_API_REGIONS)[number];

export interface BnetConfig {
	clientId: string;
	clientSecret: string;
	redirectUri: string;
	oauthRegion: BnetOAuthRegion;
	apiRegion: BnetApiRegion;
}

export function oauthHost(region: BnetOAuthRegion): string {
	return region === 'cn' ? 'https://oauth.battlenet.com.cn' : 'https://oauth.battle.net';
}

export function apiHost(region: BnetApiRegion): string {
	return region === 'cn' ? 'https://gateway.battlenet.com.cn' : `https://${region}.api.blizzard.com`;
}

export class BnetAuthError extends Error {
	constructor(
		message: string,
		readonly code: 'network' | 'token' | 'userinfo' | 'profile' | 'shape'
	) {
		super(message);
		this.name = 'BnetAuthError';
	}
}

/** Build the URL the browser is redirected to for user consent. */
export function buildAuthorizeUrl(config: BnetConfig, state: string, scopes: string[]): string {
	const url = new URL('/authorize', oauthHost(config.oauthRegion));
	url.searchParams.set('response_type', 'code');
	url.searchParams.set('client_id', config.clientId);
	url.searchParams.set('redirect_uri', config.redirectUri);
	url.searchParams.set('scope', scopes.join(' '));
	url.searchParams.set('state', state);
	return url.toString();
}

export interface BnetTokenResponse {
	accessToken: string;
	/** Scopes actually granted — may be narrower than requested. */
	grantedScopes: string[];
	expiresInSeconds: number;
}

function basicAuth(clientId: string, clientSecret: string): string {
	return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
}

/**
 * Exchange a single-use authorization code for an access token.
 * Throws BnetAuthError on any non-success; the caller renders a generic
 * failure so Blizzard's error text is never reflected into the page.
 */
export async function exchangeCodeForToken(
	config: BnetConfig,
	code: string,
	fetchImpl: typeof fetch = fetch
): Promise<BnetTokenResponse> {
	const body = new URLSearchParams({
		grant_type: 'authorization_code',
		code,
		redirect_uri: config.redirectUri
	});

	let response: Response;
	try {
		response = await fetchImpl(new URL('/token', oauthHost(config.oauthRegion)).toString(), {
			method: 'POST',
			headers: {
				authorization: basicAuth(config.clientId, config.clientSecret),
				'content-type': 'application/x-www-form-urlencoded',
				accept: 'application/json'
			},
			body
		});
	} catch {
		throw new BnetAuthError('Could not reach the Battle.net token endpoint', 'network');
	}

	if (!response.ok) throw new BnetAuthError(`Token exchange failed (HTTP ${response.status})`, 'token');

	let payload: unknown;
	try {
		payload = await response.json();
	} catch {
		throw new BnetAuthError('Token endpoint returned a non-JSON body', 'token');
	}

	if (typeof payload !== 'object' || payload === null) {
		throw new BnetAuthError('Token endpoint returned an unexpected body', 'shape');
	}
	const record = payload as Record<string, unknown>;
	const accessToken = record.access_token;
	if (typeof accessToken !== 'string' || accessToken.length === 0) {
		throw new BnetAuthError('Token response contained no access_token', 'shape');
	}

	const scope = typeof record.scope === 'string' ? record.scope : '';
	const expiresIn = typeof record.expires_in === 'number' && Number.isFinite(record.expires_in) ? record.expires_in : 0;

	return {
		accessToken,
		grantedScopes: scope.split(/\s+/).filter(Boolean),
		expiresInSeconds: expiresIn
	};
}

export interface BnetUserInfo {
	/** Blizzard's stable account identifier. */
	sub: string;
	battletag: string | null;
}

/** GET /userinfo — the account id + BattleTag. Requires the `openid` scope. */
export async function fetchUserInfo(
	config: BnetConfig,
	accessToken: string,
	fetchImpl: typeof fetch = fetch
): Promise<BnetUserInfo> {
	let response: Response;
	try {
		response = await fetchImpl(new URL('/userinfo', oauthHost(config.oauthRegion)).toString(), {
			headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' }
		});
	} catch {
		throw new BnetAuthError('Could not reach the Battle.net userinfo endpoint', 'network');
	}
	if (!response.ok) throw new BnetAuthError(`Userinfo request failed (HTTP ${response.status})`, 'userinfo');

	let payload: unknown;
	try {
		payload = await response.json();
	} catch {
		throw new BnetAuthError('Userinfo returned a non-JSON body', 'userinfo');
	}
	if (typeof payload !== 'object' || payload === null) {
		throw new BnetAuthError('Userinfo returned an unexpected body', 'shape');
	}

	const record = payload as Record<string, unknown>;
	// Blizzard returns both `sub` (OIDC) and `id` (numeric). Prefer `sub`.
	const sub =
		typeof record.sub === 'string' && record.sub
			? record.sub
			: typeof record.id === 'number' && Number.isFinite(record.id)
				? String(record.id)
				: null;
	if (!sub) throw new BnetAuthError('Userinfo contained no account identifier', 'shape');

	const battletag = typeof record.battletag === 'string' && record.battletag ? record.battletag : null;
	return { sub, battletag };
}

export interface BnetCharacter {
	characterId: number;
	name: string;
	realmId: number;
	realmSlug: string;
	realmName: string;
	faction: string | null;
	level: number | null;
}

/** Guard against a pathological account dump becoming an unbounded write. */
const MAX_CHARACTERS = 200;

function readCharacter(value: unknown): BnetCharacter | null {
	if (typeof value !== 'object' || value === null) return null;
	const record = value as Record<string, unknown>;
	const realm = typeof record.realm === 'object' && record.realm !== null ? (record.realm as Record<string, unknown>) : null;

	const characterId = record.id;
	const name = record.name;
	const realmId = realm?.id;
	const realmSlug = realm?.slug;
	if (!Number.isSafeInteger(characterId) || typeof name !== 'string' || !name) return null;
	if (!Number.isSafeInteger(realmId) || typeof realmSlug !== 'string' || !realmSlug) return null;

	const factionRecord =
		typeof record.faction === 'object' && record.faction !== null ? (record.faction as Record<string, unknown>) : null;
	const factionType = typeof factionRecord?.type === 'string' ? factionRecord.type : null;

	return {
		characterId: characterId as number,
		name,
		realmId: realmId as number,
		realmSlug,
		realmName: typeof realm?.name === 'string' ? realm.name : '',
		faction: factionType === 'ALLIANCE' ? 'Alliance' : factionType === 'HORDE' ? 'Horde' : null,
		level: Number.isSafeInteger(record.level) ? (record.level as number) : null
	};
}

/**
 * GET /profile/user/wow — the authenticated account's WoW characters.
 * Requires the `wow.profile` scope. Returns [] rather than throwing when the
 * user declined the scope or has no characters in this region, so a partial
 * grant degrades to "signed in, no characters associated".
 */
export async function fetchWowCharacters(
	config: BnetConfig,
	accessToken: string,
	fetchImpl: typeof fetch = fetch
): Promise<BnetCharacter[]> {
	const url = new URL('/profile/user/wow', apiHost(config.apiRegion));
	url.searchParams.set('namespace', `profile-${config.apiRegion}`);
	url.searchParams.set('locale', 'en_US');

	let response: Response;
	try {
		response = await fetchImpl(url.toString(), {
			headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' }
		});
	} catch {
		throw new BnetAuthError('Could not reach the WoW profile API', 'network');
	}

	// 403 is the documented answer when the scope was not granted; 404 means the
	// account has no WoW profile in this region. Neither is a sign-in failure.
	if (response.status === 403 || response.status === 404) return [];
	if (!response.ok) throw new BnetAuthError(`WoW profile request failed (HTTP ${response.status})`, 'profile');

	let payload: unknown;
	try {
		payload = await response.json();
	} catch {
		throw new BnetAuthError('WoW profile returned a non-JSON body', 'profile');
	}
	if (typeof payload !== 'object' || payload === null) return [];

	const wowAccounts = (payload as Record<string, unknown>).wow_accounts;
	if (!Array.isArray(wowAccounts)) return [];

	const characters: BnetCharacter[] = [];
	const seen = new Set<string>();
	for (const account of wowAccounts) {
		if (typeof account !== 'object' || account === null) continue;
		const list = (account as Record<string, unknown>).characters;
		if (!Array.isArray(list)) continue;
		for (const entry of list) {
			const character = readCharacter(entry);
			if (!character) continue;
			const key = `${character.realmId}-${character.characterId}`;
			if (seen.has(key)) continue;
			seen.add(key);
			characters.push(character);
			if (characters.length >= MAX_CHARACTERS) return characters;
		}
	}
	return characters;
}
