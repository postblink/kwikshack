import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const testDatabase = vi.hoisted(() => ({
	path: `/tmp/kwikshack-vitest-retention-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.db`
}));

vi.mock('$app/environment', () => ({ building: true }));
vi.mock('$env/dynamic/private', () => ({ env: { DATABASE_URL: testDatabase.path } }));

import { eq } from 'drizzle-orm';
import { db } from './db';
import {
	accounts,
	battleNetIdentities,
	blueprintClaims,
	builds,
	canonicalDecor,
	decorIdentifierMap,
	decorItems,
	indexedBlueprints,
	sessions,
	wowCharacterIdentities
} from './db/schema';
import { migrateTestDatabase, removeTestDatabase } from './test-db';
import {
	BLIZZARD_DATA_TTL_DAYS,
	BLIZZARD_DATA_TTL_MS,
	formatRetentionReport,
	oldestBlizzardRecordAgeDays,
	runRetentionMaintenance
} from './retention';
import { upsertBattleNetAccount } from './auth/session';
import { indexBlueprint } from './blueprint-index';
import { requestClaim } from './claims';
import { createBuild } from './builds';

const DAY = 24 * 60 * 60 * 1000;

function daysAgo(days: number): Date {
	return new Date(Date.now() - days * DAY);
}

let counter = 0;
function account(name: string) {
	return upsertBattleNetAccount({ sub: `${name}-${counter++}`, battletag: `${name}#0001` }, 'us', ['openid'], false);
}

function insertCharacter(accountId: string, refreshedAt: Date, expiresAt: Date, name = 'Thornwick') {
	const id = crypto.randomUUID();
	db.insert(wowCharacterIdentities)
		.values({
			id,
			accountId,
			region: 'us',
			realmId: 11,
			realmSlug: 'tichondrius',
			realmName: 'Tichondrius',
			characterId: counter++,
			name,
			faction: 'Horde',
			level: 80,
			refreshedAt,
			expiresAt
		})
		.run();
	return id;
}

function insertCanonicalDecor(decorId: number, syncedAt: Date) {
	db.insert(canonicalDecor)
		.values({
			decorId,
			region: 'us',
			locale: 'en_US',
			name: `Decor ${decorId}`,
			category: 'Seating',
			source: null,
			itemId: null,
			mediaId: null,
			mediaUrl: null,
			raw: {},
			syncedAt
		})
		.onConflictDoNothing()
		.run();
}

beforeAll(() => migrateTestDatabase(testDatabase.path));
afterAll(() => removeTestDatabase(testDatabase.path));

beforeEach(() => {
	db.delete(wowCharacterIdentities).run();
	db.delete(canonicalDecor).run();
	db.delete(sessions).run();
});

describe('the retention rule', () => {
	it('is the value Blizzard currently documents', () => {
		// Blizzard Developer API Terms of Use: "a maximum 30-day TTL ... for all
		// Data obtained through our APIs".
		expect(BLIZZARD_DATA_TTL_DAYS).toBe(30);
		expect(BLIZZARD_DATA_TTL_MS).toBe(30 * DAY);
	});
});

describe('runRetentionMaintenance', () => {
	it('deletes Blizzard-derived character data past its deadline', () => {
		const owner = account('expired');
		insertCharacter(owner.id, daysAgo(31), daysAgo(1));

		const report = runRetentionMaintenance();

		expect(report.expiredCharacters).toBe(1);
		expect(db.select().from(wowCharacterIdentities).all()).toHaveLength(0);
	});

	it('keeps character data that is still inside the window', () => {
		const owner = account('fresh');
		insertCharacter(owner.id, daysAgo(2), new Date(Date.now() + 28 * DAY));

		const report = runRetentionMaintenance();

		expect(report.expiredCharacters).toBe(0);
		expect(db.select().from(wowCharacterIdentities).all()).toHaveLength(1);
	});

	it('holds the boundary: one second past the deadline goes, one second before stays', () => {
		const owner = account('boundary');
		insertCharacter(owner.id, daysAgo(30), new Date(Date.now() - 1_000), 'JustExpired');
		insertCharacter(owner.id, daysAgo(29), new Date(Date.now() + 60_000), 'JustAlive');

		runRetentionMaintenance();

		const remaining = db.select().from(wowCharacterIdentities).all();
		expect(remaining).toHaveLength(1);
		expect(remaining[0].name).toBe('JustAlive');
	});

	it('deletes canonical decor older than the TTL and keeps recent rows', () => {
		insertCanonicalDecor(1, daysAgo(31));
		insertCanonicalDecor(2, daysAgo(3));

		const report = runRetentionMaintenance();

		expect(report.expiredCanonicalDecor).toBe(1);
		expect(db.select().from(canonicalDecor).all().map((row) => row.decorId)).toEqual([2]);
	});

	it('is idempotent — a second run changes nothing', () => {
		const owner = account('idempotent');
		insertCharacter(owner.id, daysAgo(40), daysAgo(10));
		insertCanonicalDecor(3, daysAgo(40));

		const first = runRetentionMaintenance();
		const second = runRetentionMaintenance();

		expect(first.expiredCharacters + first.expiredCanonicalDecor).toBeGreaterThan(0);
		expect(second.expiredCharacters).toBe(0);
		expect(second.expiredCanonicalDecor).toBe(0);
		expect(second.expiredSessions).toBe(0);
	});

	it('leaves nothing Blizzard-derived older than the TTL behind', () => {
		const owner = account('sweep');
		insertCharacter(owner.id, daysAgo(45), daysAgo(15));
		insertCanonicalDecor(4, daysAgo(45));

		const report = runRetentionMaintenance();

		expect(report.oldestBlizzardRecordAgeDays === null || report.oldestBlizzardRecordAgeDays < BLIZZARD_DATA_TTL_DAYS).toBe(
			true
		);
		expect(oldestBlizzardRecordAgeDays()).toBeNull();
	});

	it('does not touch KwikShack-owned data', () => {
		const owner = account('preserve');
		insertCharacter(owner.id, daysAgo(40), daysAgo(10));

		// Everything below is KwikShack's own, not obtained from a Blizzard API.
		createBuild({
			shareCode: 'RETENTION-NATIVE',
			title: 'A native build',
			blueprintType: 'House',
			faction: null,
			manifest: {
				shareCode: 'RETENTION-NATIVE',
				blueprintType: 'House',
				contentGroups: [{ contentType: 3, entries: [{ itemID: 4242, total: 1 }] }],
				budgetInfo: null,
				blockingRequirements: null
			}
		});
		const indexed = indexBlueprint({
			shareCode: 'RETENTION-INDEXED',
			title: 'An indexed listing',
			attributedCreator: 'Thornwick',
			platform: 'blizzard-forums',
			sourceUrl: 'https://us.forums.blizzard.com/en/wow/t/retention/1',
			publication: 'published'
		});
		requestClaim({ blueprintId: (indexed as { id: string }).id, accountId: owner.id });
		db.insert(decorItems)
			.values({ itemID: 99001, recordID: 99002, name: 'Legacy catalog chair', updatedAt: new Date() })
			.onConflictDoNothing()
			.run();
		db.insert(decorIdentifierMap)
			.values({
				id: 'us:item:99001',
				observedKind: 'item',
				observedId: 99001,
				decorId: 5,
				region: 'us',
				evidence: 'manual',
				confidence: 40,
				createdAt: daysAgo(90),
				updatedAt: daysAgo(90)
			})
			.onConflictDoNothing()
			.run();

		runRetentionMaintenance();

		// The account survives losing its characters — a claim must not evaporate.
		expect(db.select().from(accounts).where(eq(accounts.id, owner.id)).get()).toBeDefined();
		expect(db.select().from(battleNetIdentities).where(eq(battleNetIdentities.accountId, owner.id)).get()).toBeDefined();
		expect(db.select().from(builds).all().length).toBeGreaterThan(0);
		expect(db.select().from(indexedBlueprints).all().length).toBeGreaterThan(0);
		expect(db.select().from(blueprintClaims).all().length).toBeGreaterThan(0);
		// The legacy catalog is KwikShack's own data and is never retention-bound.
		expect(db.select().from(decorItems).all().length).toBeGreaterThan(0);
		// The mapping is KwikShack's own conclusion, so it survives too.
		expect(db.select().from(decorIdentifierMap).all().length).toBeGreaterThan(0);
	});

	it('removes expired sessions without disturbing live ones', () => {
		const owner = account('sessions');
		db.insert(sessions)
			.values({ id: 'expired-session', accountId: owner.id, createdAt: daysAgo(10), expiresAt: daysAgo(3) })
			.run();
		db.insert(sessions)
			.values({ id: 'live-session', accountId: owner.id, createdAt: new Date(), expiresAt: new Date(Date.now() + DAY) })
			.run();

		const report = runRetentionMaintenance();

		expect(report.expiredSessions).toBe(1);
		expect(db.select().from(sessions).all().map((row) => row.id)).toEqual(['live-session']);
	});
});

describe('formatRetentionReport', () => {
	it('reports counts and never identifying detail', () => {
		const owner = account('logsafe');
		insertCharacter(owner.id, daysAgo(40), daysAgo(10), 'SecretCharacterName');

		const line = formatRetentionReport(runRetentionMaintenance());

		expect(line).toContain('characters=1');
		expect(line).not.toContain('SecretCharacterName');
		expect(line).not.toContain('tichondrius');
		expect(line).not.toContain(owner.id);
	});
});
