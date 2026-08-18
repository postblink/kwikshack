import { describe, expect, it } from 'vitest';
import {
	BnetAuthError,
	apiHost,
	buildAuthorizeUrl,
	exchangeCodeForToken,
	fetchUserInfo,
	fetchWowCharacters,
	oauthHost,
	type BnetConfig
} from './bnet';

const config: BnetConfig = {
	clientId: 'client-id',
	clientSecret: 'client-secret',
	redirectUri: 'https://kwikshack.com/auth/battlenet/callback',
	oauthRegion: 'us',
	apiRegion: 'us'
};

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('endpoints', () => {
	it('uses the global OAuth host outside China and the CN host inside it', () => {
		expect(oauthHost('us')).toBe('https://oauth.battle.net');
		expect(oauthHost('eu')).toBe('https://oauth.battle.net');
		expect(oauthHost('apac')).toBe('https://oauth.battle.net');
		expect(oauthHost('cn')).toBe('https://oauth.battlenet.com.cn');
	});

	it('uses the regional API host', () => {
		expect(apiHost('us')).toBe('https://us.api.blizzard.com');
		expect(apiHost('eu')).toBe('https://eu.api.blizzard.com');
		expect(apiHost('cn')).toBe('https://gateway.battlenet.com.cn');
	});
});

describe('buildAuthorizeUrl', () => {
	it('includes every parameter Blizzard documents', () => {
		const url = new URL(buildAuthorizeUrl(config, 'state-value', ['openid', 'wow.profile']));

		expect(url.origin).toBe('https://oauth.battle.net');
		expect(url.pathname).toBe('/authorize');
		expect(url.searchParams.get('response_type')).toBe('code');
		expect(url.searchParams.get('client_id')).toBe('client-id');
		expect(url.searchParams.get('redirect_uri')).toBe('https://kwikshack.com/auth/battlenet/callback');
		expect(url.searchParams.get('scope')).toBe('openid wow.profile');
		expect(url.searchParams.get('state')).toBe('state-value');
	});

	it('never leaks the client secret into the browser-visible URL', () => {
		expect(buildAuthorizeUrl(config, 'state-value', ['openid'])).not.toContain('client-secret');
	});
});

describe('exchangeCodeForToken', () => {
	it('authenticates with HTTP Basic and posts the documented form body', async () => {
		let seen: { url: string; init: RequestInit } | null = null;
		const fetchImpl = (async (url: string, init: RequestInit) => {
			seen = { url, init };
			return jsonResponse({ access_token: 'token', token_type: 'bearer', expires_in: 86399, scope: 'openid wow.profile' });
		}) as unknown as typeof fetch;

		const token = await exchangeCodeForToken(config, 'auth-code', fetchImpl);

		expect(token.accessToken).toBe('token');
		expect(token.grantedScopes).toEqual(['openid', 'wow.profile']);
		expect(token.expiresInSeconds).toBe(86399);

		const request = seen!;
		expect(request.url).toBe('https://oauth.battle.net/token');
		const headers = request.init.headers as Record<string, string>;
		expect(headers.authorization).toBe(`Basic ${Buffer.from('client-id:client-secret').toString('base64')}`);
		const body = request.init.body as URLSearchParams;
		expect(body.get('grant_type')).toBe('authorization_code');
		expect(body.get('code')).toBe('auth-code');
		expect(body.get('redirect_uri')).toBe(config.redirectUri);
	});

	it('honours a narrowed scope grant', async () => {
		const fetchImpl = (async () =>
			jsonResponse({ access_token: 'token', scope: 'openid' })) as unknown as typeof fetch;

		const token = await exchangeCodeForToken(config, 'auth-code', fetchImpl);
		expect(token.grantedScopes).toEqual(['openid']);
		expect(token.grantedScopes).not.toContain('wow.profile');
	});

	it('rejects an invalid or expired authorization code', async () => {
		const fetchImpl = (async () => jsonResponse({ error: 'invalid_grant' }, 400)) as unknown as typeof fetch;
		await expect(exchangeCodeForToken(config, 'stale', fetchImpl)).rejects.toThrow(BnetAuthError);
	});

	it('rejects a token response with no access_token', async () => {
		const fetchImpl = (async () => jsonResponse({ token_type: 'bearer' })) as unknown as typeof fetch;
		await expect(exchangeCodeForToken(config, 'code', fetchImpl)).rejects.toThrow(/no access_token/);
	});

	it('surfaces a network failure as a typed error rather than a raw throw', async () => {
		const fetchImpl = (async () => {
			throw new Error('ECONNREFUSED');
		}) as unknown as typeof fetch;
		await expect(exchangeCodeForToken(config, 'code', fetchImpl)).rejects.toMatchObject({ code: 'network' });
	});
});

describe('fetchUserInfo', () => {
	it('reads the account id and BattleTag', async () => {
		const fetchImpl = (async (url: string, init: RequestInit) => {
			expect(url).toBe('https://oauth.battle.net/userinfo');
			expect((init.headers as Record<string, string>).authorization).toBe('Bearer token');
			return jsonResponse({ sub: '12345678', id: 12345678, battletag: 'Builder#1234' });
		}) as unknown as typeof fetch;

		expect(await fetchUserInfo(config, 'token', fetchImpl)).toEqual({ sub: '12345678', battletag: 'Builder#1234' });
	});

	it('falls back to the numeric id when sub is absent', async () => {
		const fetchImpl = (async () => jsonResponse({ id: 999, battletag: 'A#1' })) as unknown as typeof fetch;
		expect((await fetchUserInfo(config, 'token', fetchImpl)).sub).toBe('999');
	});

	it('fails when no account identifier is present', async () => {
		const fetchImpl = (async () => jsonResponse({ battletag: 'A#1' })) as unknown as typeof fetch;
		await expect(fetchUserInfo(config, 'token', fetchImpl)).rejects.toThrow(/no account identifier/);
	});
});

describe('fetchWowCharacters', () => {
	const profile = {
		wow_accounts: [
			{
				id: 1,
				characters: [
					{
						id: 500,
						name: 'Thornwick',
						realm: { id: 11, slug: 'tichondrius', name: 'Tichondrius' },
						faction: { type: 'HORDE', name: 'Horde' },
						level: 80
					},
					{ id: 501, name: 'Brambles', realm: { id: 11, slug: 'tichondrius', name: 'Tichondrius' }, level: 12 }
				]
			}
		]
	};

	it('requests the namespaced profile endpoint and normalises characters', async () => {
		const fetchImpl = (async (url: string) => {
			const parsed = new URL(url);
			expect(parsed.origin).toBe('https://us.api.blizzard.com');
			expect(parsed.pathname).toBe('/profile/user/wow');
			expect(parsed.searchParams.get('namespace')).toBe('profile-us');
			return jsonResponse(profile);
		}) as unknown as typeof fetch;

		const characters = await fetchWowCharacters(config, 'token', fetchImpl);
		expect(characters).toEqual([
			{
				characterId: 500,
				name: 'Thornwick',
				realmId: 11,
				realmSlug: 'tichondrius',
				realmName: 'Tichondrius',
				faction: 'Horde',
				level: 80
			},
			{
				characterId: 501,
				name: 'Brambles',
				realmId: 11,
				realmSlug: 'tichondrius',
				realmName: 'Tichondrius',
				faction: null,
				level: 12
			}
		]);
	});

	it('degrades to no characters when the scope was declined', async () => {
		const fetchImpl = (async () => new Response('', { status: 403 })) as unknown as typeof fetch;
		expect(await fetchWowCharacters(config, 'token', fetchImpl)).toEqual([]);
	});

	it('degrades to no characters when the account has no profile in the region', async () => {
		const fetchImpl = (async () => new Response('', { status: 404 })) as unknown as typeof fetch;
		expect(await fetchWowCharacters(config, 'token', fetchImpl)).toEqual([]);
	});

	it('skips malformed entries instead of inventing characters', async () => {
		const fetchImpl = (async () =>
			jsonResponse({
				wow_accounts: [
					{
						characters: [
							{ name: 'No id', realm: { id: 1, slug: 'a' } },
							{ id: 2, realm: { id: 1, slug: 'a' } },
							{ id: 3, name: 'No realm' },
							{ id: 4, name: 'Fine', realm: { id: 1, slug: 'a', name: 'A' } }
						]
					}
				]
			})) as unknown as typeof fetch;

		const characters = await fetchWowCharacters(config, 'token', fetchImpl);
		expect(characters).toHaveLength(1);
		expect(characters[0].name).toBe('Fine');
	});

	it('raises on an unexpected server error', async () => {
		const fetchImpl = (async () => new Response('', { status: 500 })) as unknown as typeof fetch;
		await expect(fetchWowCharacters(config, 'token', fetchImpl)).rejects.toThrow(BnetAuthError);
	});
});
