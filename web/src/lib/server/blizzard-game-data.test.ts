import { describe, expect, it } from 'vitest';
import { GameDataClient, GameDataError, gameDataApiHost, gameDataOAuthHost } from './blizzard-game-data.js';
import { apiHost, oauthHost } from './auth/bnet';

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function tokenThen(...responses: Response[]): { fetchImpl: typeof fetch; calls: string[] } {
	const calls: string[] = [];
	let index = 0;
	const fetchImpl = (async (url: string) => {
		calls.push(url);
		if (url.endsWith('/token')) return jsonResponse({ access_token: 'game-data-token', expires_in: 86399 });
		return responses[index++] ?? jsonResponse({});
	}) as unknown as typeof fetch;
	return { fetchImpl, calls };
}

describe('host resolution', () => {
	// blizzard-game-data.js is plain JS so the sync CLI can import it, which means
	// it carries its own copy of the host logic. This test is what stops that copy
	// drifting from auth/bnet.ts.
	it('agrees with the OAuth client it duplicates', () => {
		for (const region of ['us', 'eu', 'apac', 'cn'] as const) {
			expect(gameDataOAuthHost(region)).toBe(oauthHost(region));
		}
		for (const region of ['us', 'eu', 'kr', 'tw', 'cn'] as const) {
			expect(gameDataApiHost(region)).toBe(apiHost(region));
		}
	});
});

describe('GameDataClient', () => {
	const options = { clientId: 'id', clientSecret: 'secret', oauthRegion: 'us', apiRegion: 'us' };

	it('authenticates with client credentials, not a user token', async () => {
		const calls: { url: string; init: RequestInit }[] = [];
		const fetchImpl = (async (url: string, init: RequestInit) => {
			calls.push({ url, init });
			if (url.endsWith('/token')) return jsonResponse({ access_token: 'game-data-token' });
			return jsonResponse({ id: 1 });
		}) as unknown as typeof fetch;

		const client = new GameDataClient({ ...options, fetchImpl, delayMs: 0 });
		await client.get('/data/wow/decor/index');

		const tokenCall = calls[0];
		expect(tokenCall.url).toBe('https://oauth.battle.net/token');
		expect((tokenCall.init.body as URLSearchParams).get('grant_type')).toBe('client_credentials');
		expect((tokenCall.init.headers as Record<string, string>).authorization).toBe(
			`Basic ${Buffer.from('id:secret').toString('base64')}`
		);
	});

	it('sends the static namespace and locale documented for game data', async () => {
		const { fetchImpl, calls } = tokenThen(jsonResponse({ id: 1 }));
		const client = new GameDataClient({ ...options, fetchImpl, delayMs: 0, locale: 'de_DE' });
		await client.get('/data/wow/decor/index');

		const url = new URL(calls[1]);
		expect(url.origin).toBe('https://us.api.blizzard.com');
		expect(url.pathname).toBe('/data/wow/decor/index');
		expect(url.searchParams.get('namespace')).toBe('static-us');
		expect(url.searchParams.get('locale')).toBe('de_DE');
	});

	it('reuses one token across requests', async () => {
		const { fetchImpl, calls } = tokenThen(jsonResponse({ id: 1 }), jsonResponse({ id: 2 }));
		const client = new GameDataClient({ ...options, fetchImpl, delayMs: 0 });
		await client.get('/data/wow/decor/1');
		await client.get('/data/wow/decor/2');

		expect(calls.filter((url) => url.endsWith('/token'))).toHaveLength(1);
	});

	it('treats 404 as a missing document, not an error', async () => {
		const { fetchImpl } = tokenThen(new Response('', { status: 404 }));
		const client = new GameDataClient({ ...options, fetchImpl, delayMs: 0 });
		expect(await client.get('/data/wow/decor/999')).toBeNull();
	});

	it('re-authorizes once when a token ages out mid-run', async () => {
		let dataCalls = 0;
		const fetchImpl = (async (url: string) => {
			if (url.endsWith('/token')) return jsonResponse({ access_token: `token-${dataCalls}` });
			dataCalls += 1;
			return dataCalls === 1 ? new Response('', { status: 401 }) : jsonResponse({ id: 7 });
		}) as unknown as typeof fetch;

		const client = new GameDataClient({ ...options, fetchImpl, delayMs: 0 });
		expect(await client.get('/data/wow/decor/7')).toEqual({ id: 7 });
	});

	it('enforces a hard request budget so a loop cannot become a ban', async () => {
		const { fetchImpl } = tokenThen(jsonResponse({}), jsonResponse({}), jsonResponse({}));
		const client = new GameDataClient({ ...options, fetchImpl, delayMs: 0, maxRequests: 2 });
		await client.get('/data/wow/decor/1');
		await client.get('/data/wow/decor/2');

		await expect(client.get('/data/wow/decor/3')).rejects.toThrow(/budget/);
	});

	it('surfaces a failed token request as a typed error', async () => {
		const fetchImpl = (async () => new Response('', { status: 401 })) as unknown as typeof fetch;
		const client = new GameDataClient({ ...options, fetchImpl, delayMs: 0 });
		await expect(client.get('/data/wow/decor/index')).rejects.toThrow(GameDataError);
	});
});
