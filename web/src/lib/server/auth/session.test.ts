import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Cookies } from '@sveltejs/kit';

const testDatabase = vi.hoisted(() => ({
	path: `/tmp/kwikshack-vitest-session-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.db`
}));

vi.mock('$app/environment', () => ({ building: true }));
vi.mock('$env/dynamic/private', () => ({ env: { DATABASE_URL: testDatabase.path } }));

import { db } from '../db';
import { sessions, wowCharacterIdentities } from '../db/schema';
import { migrateTestDatabase, removeTestDatabase } from '../test-db';
import {
	BLIZZARD_DATA_TTL_MS,
	SESSION_COOKIE,
	consumeOAuthState,
	createSession,
	destroySession,
	issueOAuthState,
	listAccountCharacters,
	pruneExpired,
	resolveSession,
	safeRedirect,
	syncWowCharacters,
	upsertBattleNetAccount
} from './session';

/** Minimal Cookies stand-in that records what was set, so flags can be asserted. */
function fakeCookies() {
	const store = new Map<string, { value: string; options: Record<string, unknown> }>();
	const cookies = {
		get: (name: string) => store.get(name)?.value,
		set: (name: string, value: string, options: Record<string, unknown>) => store.set(name, { value, options }),
		delete: (name: string) => store.delete(name)
	} as unknown as Cookies;
	return { cookies, store };
}

beforeAll(() => migrateTestDatabase(testDatabase.path));
afterAll(() => removeTestDatabase(testDatabase.path));

describe('safeRedirect', () => {
	it('keeps same-site paths', () => {
		expect(safeRedirect('/blueprints/abc')).toBe('/blueprints/abc');
		expect(safeRedirect('/')).toBe('/');
	});

	it('refuses anything that could bounce the user off-site', () => {
		expect(safeRedirect('https://evil.example/steal')).toBe('/');
		expect(safeRedirect('//evil.example')).toBe('/');
		expect(safeRedirect('/\\evil.example')).toBe('/');
		expect(safeRedirect(null)).toBe('/');
		expect(safeRedirect('')).toBe('/');
	});
});

describe('OAuth state', () => {
	it('round-trips an issued state and its redirect target', () => {
		const state = issueOAuthState('/blueprints/xyz');
		expect(consumeOAuthState(state)).toEqual({ redirectTo: '/blueprints/xyz' });
	});

	it('is single-use — a replayed state is rejected', () => {
		const state = issueOAuthState('/');
		expect(consumeOAuthState(state)).not.toBeNull();
		expect(consumeOAuthState(state)).toBeNull();
	});

	it('rejects a state the server never issued', () => {
		expect(consumeOAuthState('forged-state-value')).toBeNull();
		expect(consumeOAuthState(null)).toBeNull();
	});

	it('rejects an expired state', () => {
		const state = issueOAuthState('/');
		const later = new Date(Date.now() + 11 * 60 * 1000);
		expect(consumeOAuthState(state, later)).toBeNull();
	});

	it('does not honour an off-site redirect smuggled through the state', () => {
		const state = issueOAuthState('https://evil.example');
		expect(consumeOAuthState(state)).toEqual({ redirectTo: '/' });
	});
});

describe('accounts and sessions', () => {
	it('creates one stable account per Battle.net sub and reuses it on later sign-ins', () => {
		const first = upsertBattleNetAccount({ sub: 'sub-1', battletag: 'Builder#1111' }, 'us', ['openid'], false);
		const second = upsertBattleNetAccount({ sub: 'sub-1', battletag: 'Renamed#2222' }, 'us', ['openid', 'wow.profile'], false);

		expect(second.id).toBe(first.id);
		// The BattleTag is refreshed; the account identity is not re-minted.
		expect(second.battletag).toBe('Renamed#2222');
	});

	it('treats the same sub in a different region as a separate identity', () => {
		const us = upsertBattleNetAccount({ sub: 'sub-region', battletag: 'A#1' }, 'us', [], false);
		const eu = upsertBattleNetAccount({ sub: 'sub-region', battletag: 'A#1' }, 'eu', [], false);
		expect(eu.id).not.toBe(us.id);
	});

	it('takes admin status from configuration on every sign-in, in both directions', () => {
		const promoted = upsertBattleNetAccount({ sub: 'sub-admin', battletag: 'Op#1' }, 'us', [], true);
		expect(promoted.role).toBe('admin');

		const demoted = upsertBattleNetAccount({ sub: 'sub-admin', battletag: 'Op#1' }, 'us', [], false);
		expect(demoted.id).toBe(promoted.id);
		expect(demoted.role).toBe('creator');
	});

	it('issues an HttpOnly, SameSite=Lax session cookie and resolves it', () => {
		const account = upsertBattleNetAccount({ sub: 'sub-session', battletag: 'S#1' }, 'us', ['openid'], false);
		const { cookies, store } = fakeCookies();

		createSession(account.id, cookies, true);
		const entry = store.get(SESSION_COOKIE)!;

		expect(entry.options).toMatchObject({ httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
		expect(resolveSession(entry.value)?.id).toBe(account.id);
	});

	it('stores only a hash of the cookie token, so the row cannot be replayed', () => {
		const account = upsertBattleNetAccount({ sub: 'sub-hash', battletag: 'H#1' }, 'us', [], false);
		const { cookies, store } = fakeCookies();
		createSession(account.id, cookies, true);
		const token = store.get(SESSION_COOKIE)!.value;

		const stored = db.select().from(sessions).all().map((row) => row.id);
		expect(stored).not.toContain(token);
		// The stored id is a SHA-256 hex digest, not the token.
		expect(stored.every((id) => /^[0-9a-f]{64}$/.test(id))).toBe(true);
	});

	it('rejects an unknown or absent session token', () => {
		expect(resolveSession(undefined)).toBeNull();
		expect(resolveSession('not-a-real-token')).toBeNull();
	});

	it('rejects an expired session and clears the row', () => {
		const account = upsertBattleNetAccount({ sub: 'sub-expiry', battletag: 'E#1' }, 'us', [], false);
		const { cookies, store } = fakeCookies();
		createSession(account.id, cookies, true);
		const token = store.get(SESSION_COOKIE)!.value;

		const later = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000);
		expect(resolveSession(token, later)).toBeNull();
		expect(resolveSession(token)).toBeNull();
	});

	it('invalidates the session server-side on logout, not just in the browser', () => {
		const account = upsertBattleNetAccount({ sub: 'sub-logout', battletag: 'L#1' }, 'us', [], false);
		const { cookies, store } = fakeCookies();
		createSession(account.id, cookies, true);
		const token = store.get(SESSION_COOKIE)!.value;

		destroySession(token, cookies);

		expect(store.get(SESSION_COOKIE)).toBeUndefined();
		// A stolen copy of the cookie is useless afterwards.
		expect(resolveSession(token)).toBeNull();
	});
});

describe('character association', () => {
	const character = {
		characterId: 700,
		name: 'Thornwick',
		realmId: 11,
		realmSlug: 'tichondrius',
		realmName: 'Tichondrius',
		faction: 'Horde',
		level: 80
	};

	it('stores characters with a 30-day deletion deadline', () => {
		const account = upsertBattleNetAccount({ sub: 'sub-chars', battletag: 'C#1' }, 'us', ['wow.profile'], false);
		const now = new Date();
		syncWowCharacters(account.id, 'us', [character], now);

		const stored = listAccountCharacters(account.id);
		expect(stored).toHaveLength(1);
		expect(stored[0].name).toBe('Thornwick');
		// Drizzle's `timestamp` mode stores whole seconds, so compare at that resolution.
		expect(Math.floor(stored[0].expiresAt.getTime() / 1000)).toBe(
			Math.floor((now.getTime() + BLIZZARD_DATA_TTL_MS) / 1000)
		);
	});

	it('replaces the set on each sync, so a removed character does not linger', () => {
		const account = upsertBattleNetAccount({ sub: 'sub-resync', battletag: 'R#1' }, 'us', ['wow.profile'], false);
		syncWowCharacters(account.id, 'us', [character, { ...character, characterId: 701, name: 'Brambles' }]);
		expect(listAccountCharacters(account.id)).toHaveLength(2);

		syncWowCharacters(account.id, 'us', [character]);
		const remaining = listAccountCharacters(account.id);
		expect(remaining).toHaveLength(1);
		expect(remaining[0].name).toBe('Thornwick');
	});

	it('never returns Blizzard data past its TTL, and prunes it', () => {
		const account = upsertBattleNetAccount({ sub: 'sub-ttl', battletag: 'T#1' }, 'us', ['wow.profile'], false);
		const longAgo = new Date(Date.now() - BLIZZARD_DATA_TTL_MS - 1000);
		syncWowCharacters(account.id, 'us', [character], longAgo);

		expect(listAccountCharacters(account.id)).toEqual([]);
		pruneExpired();
		expect(db.select().from(wowCharacterIdentities).all().some((row) => row.accountId === account.id)).toBe(false);
	});
});
