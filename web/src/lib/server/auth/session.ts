import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, eq, lt } from 'drizzle-orm';
import type { Cookies } from '@sveltejs/kit';
import { db } from '../db';
import {
	accounts,
	battleNetIdentities,
	oauthStates,
	sessions,
	wowCharacterIdentities
} from '../db/schema';
import type { BnetCharacter, BnetUserInfo } from './bnet';
import { BLIZZARD_DATA_TTL_MS } from '../retention';

export const SESSION_COOKIE = 'kwikshack_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const STATE_TTL_MS = 10 * 60 * 1000;

/**
 * Blizzard's retention rule lives in one place — `server/retention.ts` — so the
 * write path and the maintenance job cannot disagree about the deadline.
 * Character rows carry an explicit `expires_at` derived from it.
 */
export { BLIZZARD_DATA_TTL_MS } from '../retention';

/** Cookie tokens are stored hashed, so a database read cannot be replayed. */
function hashToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

function newToken(): string {
	return randomBytes(32).toString('base64url');
}

export interface AuthenticatedAccount {
	id: string;
	displayName: string;
	role: 'creator' | 'admin';
	bnetSub: string | null;
	battletag: string | null;
	region: string | null;
}

// -----------------------------------------------------------------------------
// OAuth state
// -----------------------------------------------------------------------------

/**
 * Issue a single-use `state`. Stored hashed and server-side so it survives a
 * restart, works across replicas, and cannot be forged by a caller.
 * Returns the raw value for the authorize URL.
 */
export function issueOAuthState(redirectTo: string, now = new Date()): string {
	pruneExpired(now);
	const token = newToken();
	db.insert(oauthStates)
		.values({
			id: hashToken(token),
			redirectTo: safeRedirect(redirectTo),
			createdAt: now,
			expiresAt: new Date(now.getTime() + STATE_TTL_MS)
		})
		.run();
	return token;
}

/**
 * Consume a `state` returned by Blizzard. Returns the stored redirect target,
 * or null when the state is unknown, replayed, or expired.
 */
export function consumeOAuthState(token: string | null, now = new Date()): { redirectTo: string } | null {
	if (!token) return null;
	const id = hashToken(token);
	const row = db.select().from(oauthStates).where(eq(oauthStates.id, id)).get();
	// Single-use regardless of outcome.
	db.delete(oauthStates).where(eq(oauthStates.id, id)).run();
	if (!row) return null;
	if (row.expiresAt.getTime() <= now.getTime()) return null;
	return { redirectTo: safeRedirect(row.redirectTo) };
}

/**
 * Only same-site paths are ever honoured as a post-login destination, so a
 * crafted authorize link cannot bounce a signed-in user off-site.
 */
export function safeRedirect(value: string | null | undefined): string {
	if (!value) return '/';
	if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/';
	return value;
}

// -----------------------------------------------------------------------------
// Accounts and identity
// -----------------------------------------------------------------------------

/**
 * Link a Battle.net identity to a stable KwikShack account, creating the account
 * on first sign-in. The Battle.net `sub` is the join key — never the BattleTag,
 * which the user can change.
 */
export function upsertBattleNetAccount(
	userInfo: BnetUserInfo,
	region: string,
	grantedScopes: string[],
	isAdmin: boolean,
	now = new Date()
): AuthenticatedAccount {
	return db.transaction((tx) => {
		const existing = tx
			.select()
			.from(battleNetIdentities)
			.where(and(eq(battleNetIdentities.region, region), eq(battleNetIdentities.bnetSub, userInfo.sub)))
			.get();

		const role = isAdmin ? 'admin' : 'creator';
		const displayName = userInfo.battletag?.split('#')[0] || 'Battle.net creator';

		if (existing) {
			tx.update(battleNetIdentities)
				.set({
					battletag: userInfo.battletag,
					grantedScopes: grantedScopes.join(' '),
					lastVerifiedAt: now
				})
				.where(eq(battleNetIdentities.accountId, existing.accountId))
				.run();
			// Admin status comes from configuration, so a removed operator loses it
			// on their next sign-in without a manual database edit.
			tx.update(accounts).set({ role, updatedAt: now }).where(eq(accounts.id, existing.accountId)).run();
			const account = tx.select().from(accounts).where(eq(accounts.id, existing.accountId)).get()!;
			return {
				id: account.id,
				displayName: account.displayName,
				role,
				bnetSub: userInfo.sub,
				battletag: userInfo.battletag,
				region
			};
		}

		const accountId = crypto.randomUUID();
		tx.insert(accounts).values({ id: accountId, displayName, role, createdAt: now, updatedAt: now }).run();
		tx.insert(battleNetIdentities)
			.values({
				accountId,
				bnetSub: userInfo.sub,
				battletag: userInfo.battletag,
				region,
				grantedScopes: grantedScopes.join(' '),
				lastVerifiedAt: now,
				createdAt: now
			})
			.run();
		return { id: accountId, displayName, role, bnetSub: userInfo.sub, battletag: userInfo.battletag, region };
	});
}

/**
 * Replace the account's character associations with what Blizzard just
 * returned. Characters that disappeared from the account are deleted rather
 * than kept, which is both the Terms-of-Use behaviour and the honest one.
 */
export function syncWowCharacters(
	accountId: string,
	region: string,
	characters: BnetCharacter[],
	now = new Date()
): void {
	const expiresAt = new Date(now.getTime() + BLIZZARD_DATA_TTL_MS);
	db.transaction((tx) => {
		tx.delete(wowCharacterIdentities)
			.where(and(eq(wowCharacterIdentities.accountId, accountId), eq(wowCharacterIdentities.region, region)))
			.run();
		for (const character of characters) {
			tx.insert(wowCharacterIdentities)
				.values({
					id: crypto.randomUUID(),
					accountId,
					region,
					realmId: character.realmId,
					realmSlug: character.realmSlug,
					realmName: character.realmName,
					characterId: character.characterId,
					name: character.name,
					faction: character.faction,
					level: character.level,
					refreshedAt: now,
					expiresAt
				})
				.run();
		}
	});
}

export interface StoredCharacter {
	id: string;
	name: string;
	realmSlug: string;
	realmName: string;
	faction: string | null;
	level: number | null;
	refreshedAt: Date;
	expiresAt: Date;
}

/** Non-expired characters for an account. Expired rows are never returned. */
export function listAccountCharacters(accountId: string, now = new Date()): StoredCharacter[] {
	pruneExpired(now);
	return db
		.select()
		.from(wowCharacterIdentities)
		.where(eq(wowCharacterIdentities.accountId, accountId))
		.all()
		.filter((row) => row.expiresAt.getTime() > now.getTime())
		.map((row) => ({
			id: row.id,
			name: row.name,
			realmSlug: row.realmSlug,
			realmName: row.realmName,
			faction: row.faction,
			level: row.level,
			refreshedAt: row.refreshedAt,
			expiresAt: row.expiresAt
		}));
}

// -----------------------------------------------------------------------------
// Sessions
// -----------------------------------------------------------------------------

export function createSession(accountId: string, cookies: Cookies, secure: boolean, now = new Date()): void {
	const token = newToken();
	db.insert(sessions)
		.values({
			id: hashToken(token),
			accountId,
			createdAt: now,
			expiresAt: new Date(now.getTime() + SESSION_TTL_MS)
		})
		.run();

	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		secure,
		// Lax, not Strict: the Battle.net callback is a cross-site top-level
		// navigation, and Strict would drop the cookie on arrival.
		sameSite: 'lax',
		maxAge: Math.floor(SESSION_TTL_MS / 1000)
	});
}

export function resolveSession(token: string | undefined, now = new Date()): AuthenticatedAccount | null {
	if (!token) return null;
	const id = hashToken(token);
	const row = db
		.select({ session: sessions, account: accounts, identity: battleNetIdentities })
		.from(sessions)
		.innerJoin(accounts, eq(sessions.accountId, accounts.id))
		.leftJoin(battleNetIdentities, eq(battleNetIdentities.accountId, accounts.id))
		.where(eq(sessions.id, id))
		.get();
	if (!row) return null;
	if (row.session.expiresAt.getTime() <= now.getTime()) {
		db.delete(sessions).where(eq(sessions.id, id)).run();
		return null;
	}
	return {
		id: row.account.id,
		displayName: row.account.displayName,
		role: row.account.role,
		bnetSub: row.identity?.bnetSub ?? null,
		battletag: row.identity?.battletag ?? null,
		region: row.identity?.region ?? null
	};
}

export function destroySession(token: string | undefined, cookies: Cookies): void {
	if (token) db.delete(sessions).where(eq(sessions.id, hashToken(token))).run();
	cookies.delete(SESSION_COOKIE, { path: '/' });
}

/** Invalidate every session for an account (used when an account is removed). */
export function destroyAllSessions(accountId: string): void {
	db.delete(sessions).where(eq(sessions.accountId, accountId)).run();
}

/**
 * Opportunistic housekeeping on the auth paths.
 *
 * This is NO LONGER the compliance mechanism. Blizzard's 30-day retention rule
 * is satisfied by the scheduled maintenance job (`server/retention.ts`, run via
 * `scripts/maintenance.mjs`), because a deployment that receives no auth traffic
 * would otherwise hold expired data indefinitely. This function stays because
 * cleaning up on the paths that create these rows is cheap and keeps the tables
 * small between scheduled runs.
 */
export function pruneExpired(now = new Date()): void {
	db.delete(sessions).where(lt(sessions.expiresAt, now)).run();
	db.delete(oauthStates).where(lt(oauthStates.expiresAt, now)).run();
	db.delete(wowCharacterIdentities).where(lt(wowCharacterIdentities.expiresAt, now)).run();
}

/** Constant-time compare for short opaque values. */
export function safeEqual(a: string, b: string): boolean {
	const left = Buffer.from(a);
	const right = Buffer.from(b);
	return left.length === right.length && timingSafeEqual(left, right);
}
