import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const testDatabase = vi.hoisted(() => ({
	path: `/tmp/kwikshack-vitest-claims-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.db`
}));

vi.mock('$app/environment', () => ({ building: true }));
vi.mock('$env/dynamic/private', () => ({ env: { DATABASE_URL: testDatabase.path } }));

import { EVIDENCE_KINDS } from '$lib/types/evidence';
import { migrateTestDatabase, removeTestDatabase } from './test-db';
import { listAccountCharacters, syncWowCharacters, upsertBattleNetAccount } from './auth/session';
import { getIndexedBlueprint, indexBlueprint, setPublication } from './blueprint-index';
import { approveClaim, collectEvidenceKinds, listPendingClaims, rejectClaim, requestClaim } from './claims';

const baseInput = {
	title: 'Gilded tavern hall',
	attributedCreator: 'Thornwick',
	platform: 'blizzard-forums',
	sourceUrl: 'https://us.forums.blizzard.com/en/wow/t/gilded-tavern/1',
	publication: 'published' as const
};

let counter = 0;
function account(name: string, isAdmin = false) {
	return upsertBattleNetAccount({ sub: `${name}-${counter++}`, battletag: `${name}#0001` }, 'us', ['openid'], isAdmin);
}

function listing(shareCode: string, extra: Partial<typeof baseInput> = {}) {
	const result = indexBlueprint({ ...baseInput, ...extra, shareCode });
	return (result as { id: string }).id;
}

beforeAll(() => migrateTestDatabase(testDatabase.path));
afterAll(() => removeTestDatabase(testDatabase.path));

describe('collectEvidenceKinds', () => {
	it('records character ownership when a character is cited', () => {
		const kinds = collectEvidenceKinds({
			attributedCreator: 'Someone Else',
			attributedCharacter: null,
			characterName: 'Thornwick',
			battletag: 'Unrelated#1',
			evidenceUrl: null
		});
		expect(kinds).toEqual([EVIDENCE_KINDS.characterOwnership]);
	});

	it('records a character-to-attribution match as a distinct, stronger signal', () => {
		const kinds = collectEvidenceKinds({
			attributedCreator: 'Thornwick',
			attributedCharacter: null,
			characterName: 'Thornwick',
			battletag: null,
			evidenceUrl: null
		});
		expect(kinds).toContain(EVIDENCE_KINDS.characterOwnership);
		expect(kinds).toContain(EVIDENCE_KINDS.characterMatchesAttribution);
	});

	it('records a bare display-name resemblance separately and weakly', () => {
		const kinds = collectEvidenceKinds({
			attributedCreator: 'Thornwick',
			attributedCharacter: null,
			characterName: null,
			battletag: 'Thornwick#1234',
			evidenceUrl: null
		});
		// A name match alone must never look like proven ownership.
		expect(kinds).toEqual([EVIDENCE_KINDS.displayNameSimilarity]);
		expect(kinds).not.toContain(EVIDENCE_KINDS.characterOwnership);
	});

	it('records nothing when there is nothing to record', () => {
		expect(
			collectEvidenceKinds({
				attributedCreator: 'Thornwick',
				attributedCharacter: null,
				characterName: null,
				battletag: 'Someone#9999',
				evidenceUrl: null
			})
		).toEqual([]);
	});
});

describe('requestClaim', () => {
	it('records a claim and marks the listing as under review without transferring it', () => {
		const id = listing('CLAIM-BASIC');
		const claimant = account('claimant');

		const result = requestClaim({ blueprintId: id, accountId: claimant.id, claimantNote: 'I posted this code.' });
		expect(result).toMatchObject({ ok: true });

		const blueprint = getIndexedBlueprint(id)!;
		expect(blueprint.claimState).toBe('pending');
		// Nothing is handed over on request.
		expect(blueprint.claimedCreatorName).toBeNull();
	});

	it('refuses a second pending claim from the same account', () => {
		const id = listing('CLAIM-DOUBLE');
		const claimant = account('double');
		requestClaim({ blueprintId: id, accountId: claimant.id });

		expect(requestClaim({ blueprintId: id, accountId: claimant.id })).toMatchObject({ ok: false, status: 409 });
	});

	it('allows a competing claim from a different account', () => {
		const id = listing('CLAIM-COMPETING');
		requestClaim({ blueprintId: id, accountId: account('rival-a').id });
		expect(requestClaim({ blueprintId: id, accountId: account('rival-b').id })).toMatchObject({ ok: true });
	});

	it("refuses to cite another account's character", () => {
		const id = listing('CLAIM-CHARSTEAL');
		const owner = account('char-owner');
		const impostor = account('char-impostor');
		syncWowCharacters(owner.id, 'us', [
			{ characterId: 1, name: 'Thornwick', realmId: 11, realmSlug: 'tichondrius', realmName: 'Tichondrius', faction: 'Horde', level: 80 }
		]);
		const characterId = listAccountCharacters(owner.id)[0].id;

		expect(requestClaim({ blueprintId: id, accountId: impostor.id, characterIdentityId: characterId })).toMatchObject({
			ok: false,
			status: 403
		});
	});

	it('accepts a character the claimant actually owns and records it as evidence', () => {
		const id = listing('CLAIM-CHAROK');
		const claimant = account('char-legit');
		syncWowCharacters(claimant.id, 'us', [
			{ characterId: 2, name: 'Thornwick', realmId: 11, realmSlug: 'tichondrius', realmName: 'Tichondrius', faction: 'Horde', level: 80 }
		]);
		const characterId = listAccountCharacters(claimant.id)[0].id;

		expect(requestClaim({ blueprintId: id, accountId: claimant.id, characterIdentityId: characterId })).toMatchObject({
			ok: true
		});

		const pending = listPendingClaims().find((claim) => claim.blueprintId === id)!;
		expect(pending.claimedCharacter).toBe('Thornwick-Tichondrius');
		expect(pending.evidenceKinds).toContain(EVIDENCE_KINDS.characterOwnership);
		expect(pending.evidenceKinds).toContain(EVIDENCE_KINDS.characterMatchesAttribution);
	});

	it('rejects a non-https evidence URL', () => {
		const id = listing('CLAIM-BADURL');
		expect(
			requestClaim({ blueprintId: id, accountId: account('badurl').id, evidenceUrl: 'javascript:alert(1)' })
		).toMatchObject({ ok: false, status: 400 });
		expect(
			requestClaim({ blueprintId: id, accountId: account('badurl2').id, evidenceUrl: 'http://example.com' })
		).toMatchObject({ ok: false, status: 400 });
	});

	it('refuses a claim on an unknown or archived listing', () => {
		expect(requestClaim({ blueprintId: 'no-such-id', accountId: account('ghost').id })).toMatchObject({
			ok: false,
			status: 404
		});

		const id = listing('CLAIM-ARCHIVED');
		setPublication(id, 'archived');
		expect(requestClaim({ blueprintId: id, accountId: account('late').id })).toMatchObject({ ok: false, status: 409 });
	});
});

describe('claim review', () => {
	it('transfers management on approval and leaves provenance intact', () => {
		const id = listing('CLAIM-APPROVE');
		const before = getIndexedBlueprint(id)!;
		const claimant = account('approve-me');
		const admin = account('reviewer-a', true);
		const claim = requestClaim({ blueprintId: id, accountId: claimant.id });

		expect(approveClaim((claim as { claimId: string }).claimId, admin.id, 'Verified via forum profile')).toEqual({
			ok: true
		});

		const after = getIndexedBlueprint(id)!;
		expect(after.claimState).toBe('claimed');
		expect(after.claimedCreatorName).toBe('approve-me');
		expect(after.sources).toEqual(before.sources);
		expect(after.attributedCreator).toBe('Thornwick');
		expect(after.indexedAt).toBe(before.indexedAt);
	});

	it('closes out competing claims when one is approved', () => {
		const id = listing('CLAIM-SUPERSEDE');
		const winner = account('winner');
		const loser = account('loser');
		const admin = account('reviewer-b', true);
		const winning = requestClaim({ blueprintId: id, accountId: winner.id });
		requestClaim({ blueprintId: id, accountId: loser.id });

		approveClaim((winning as { claimId: string }).claimId, admin.id);

		expect(listPendingClaims().some((claim) => claim.blueprintId === id)).toBe(false);
	});

	it('returns the listing to unclaimed when the only pending claim is rejected', () => {
		const id = listing('CLAIM-REJECT');
		const claimant = account('rejected');
		const admin = account('reviewer-c', true);
		const claim = requestClaim({ blueprintId: id, accountId: claimant.id });

		expect(rejectClaim((claim as { claimId: string }).claimId, admin.id, 'No connection to the source post')).toEqual({
			ok: true
		});
		expect(getIndexedBlueprint(id)!.claimState).toBe('unclaimed');
	});

	it('refuses to review a claim twice', () => {
		const id = listing('CLAIM-TWICE');
		const claimant = account('twice');
		const admin = account('reviewer-d', true);
		const claim = requestClaim({ blueprintId: id, accountId: claimant.id });
		const claimId = (claim as { claimId: string }).claimId;

		approveClaim(claimId, admin.id);
		expect(approveClaim(claimId, admin.id)).toMatchObject({ ok: false, status: 409 });
		expect(rejectClaim(claimId, admin.id)).toMatchObject({ ok: false, status: 409 });
	});

	it('refuses a new claim once a listing is claimed', () => {
		const id = listing('CLAIM-LOCKED');
		const owner = account('locked-owner');
		const admin = account('reviewer-e', true);
		const claim = requestClaim({ blueprintId: id, accountId: owner.id });
		approveClaim((claim as { claimId: string }).claimId, admin.id);

		expect(requestClaim({ blueprintId: id, accountId: account('too-late').id })).toMatchObject({
			ok: false,
			status: 409
		});
	});

	it('keeps reviewer notes out of the public projection', () => {
		const id = listing('CLAIM-NOTES');
		const claimant = account('notes');
		const admin = account('reviewer-f', true);
		const claim = requestClaim({ blueprintId: id, accountId: claimant.id, claimantNote: 'CLAIMANT-PRIVATE-NOTE' });
		approveClaim((claim as { claimId: string }).claimId, admin.id, 'REVIEWER-PRIVATE-NOTE');

		const serialised = JSON.stringify(getIndexedBlueprint(id));
		expect(serialised).not.toContain('REVIEWER-PRIVATE-NOTE');
		expect(serialised).not.toContain('CLAIMANT-PRIVATE-NOTE');
	});
});
