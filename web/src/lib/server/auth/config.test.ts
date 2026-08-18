import { describe, expect, it, vi } from 'vitest';

// The module reads `env` at import time for the non-pure helpers; the pure
// resolvers under test take their input as an argument.
vi.mock('$env/dynamic/private', () => ({ env: {} }));

import { resolveAdminSubs, resolveAuthConfig } from './config';

const complete = {
	BNET_CLIENT_ID: 'id',
	BNET_CLIENT_SECRET: 'secret',
	BNET_REDIRECT_URI: 'https://kwikshack.com/auth/battlenet/callback'
};

describe('resolveAuthConfig', () => {
	it('is disabled — not broken — when credentials are absent', () => {
		const result = resolveAuthConfig({}, false);
		expect(result.enabled).toBe(false);
		expect(result).toMatchObject({ reason: expect.stringContaining('BNET_CLIENT_ID') });
	});

	it('is disabled when only half the credential pair is present', () => {
		expect(resolveAuthConfig({ BNET_CLIENT_ID: 'id' }, false).enabled).toBe(false);
		expect(resolveAuthConfig({ BNET_CLIENT_SECRET: 'secret' }, false).enabled).toBe(false);
	});

	it('requires a redirect URI', () => {
		const result = resolveAuthConfig({ BNET_CLIENT_ID: 'id', BNET_CLIENT_SECRET: 'secret' }, false);
		expect(result).toMatchObject({ enabled: false, reason: expect.stringContaining('BNET_REDIRECT_URI') });
	});

	it('refuses a plain-http redirect URI in production', () => {
		const result = resolveAuthConfig({ ...complete, BNET_REDIRECT_URI: 'http://kwikshack.com/cb' }, false);
		expect(result).toMatchObject({ enabled: false, reason: expect.stringContaining('https') });
	});

	it('refuses http://localhost in production but allows it in dev', () => {
		const source = { ...complete, BNET_REDIRECT_URI: 'http://localhost:5173/auth/battlenet/callback' };
		expect(resolveAuthConfig(source, false).enabled).toBe(false);
		expect(resolveAuthConfig(source, true).enabled).toBe(true);
	});

	it('refuses a malformed redirect URI', () => {
		expect(resolveAuthConfig({ ...complete, BNET_REDIRECT_URI: 'not a url' }, false).enabled).toBe(false);
	});

	it('defaults both regions to us', () => {
		const result = resolveAuthConfig(complete, false);
		expect(result).toMatchObject({ enabled: true, config: { oauthRegion: 'us', apiRegion: 'us' } });
	});

	it('lets the OAuth region and API region differ, since Blizzard defines different sets', () => {
		const result = resolveAuthConfig({ ...complete, BNET_OAUTH_REGION: 'apac', BNET_API_REGION: 'kr' }, false);
		expect(result).toMatchObject({ enabled: true, config: { oauthRegion: 'apac', apiRegion: 'kr' } });
	});

	it('rejects a region Blizzard does not define for that endpoint set', () => {
		// `apac` is an OAuth region but not an API host region.
		expect(resolveAuthConfig({ ...complete, BNET_API_REGION: 'apac' }, false).enabled).toBe(false);
		// `kr` is an API host region but was folded into `apac` for OAuth.
		expect(resolveAuthConfig({ ...complete, BNET_OAUTH_REGION: 'kr' }, false).enabled).toBe(false);
	});
});

describe('resolveAdminSubs', () => {
	it('fails closed when unset — no implicit first-user-is-admin', () => {
		expect(resolveAdminSubs({}).size).toBe(0);
	});

	it('parses a comma-separated list, ignoring blanks', () => {
		expect([...resolveAdminSubs({ KWIKSHACK_ADMIN_BNET_SUBS: ' 111 , 222 ,, ' })]).toEqual(['111', '222']);
	});
});
