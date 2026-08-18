import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import type { BuildManifest } from '$lib/types/manifest';

const testDatabase = vi.hoisted(() => ({
	path: `/tmp/kwikshack-vitest-index-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.db`
}));

vi.mock('$app/environment', () => ({ building: true }));
vi.mock('$env/dynamic/private', () => ({ env: { DATABASE_URL: testDatabase.path } }));

import { db } from './db';
import { blueprintAuditEvents, decorItems, indexedBlueprintSources, indexedBlueprints } from './db/schema';
import { migrateTestDatabase, removeTestDatabase } from './test-db';
import { createBuild } from './builds';
import { upsertBattleNetAccount } from './auth/session';
import { approveClaim, requestClaim } from './claims';
import {
	applyCreatorEdit,
	attachResolvedManifest,
	findNativeBuildForCode,
	getIndexedBlueprint,
	getIndexedBlueprintForManagement,
	indexBlueprint,
	listIndexedBlueprints,
	normalizeShareCode,
	setPublication,
	setResolutionState
} from './blueprint-index';

const baseInput = {
	title: 'Moonlit apothecary loft',
	attributedCreator: 'Thornwick',
	platform: 'blizzard-forums',
	sourceUrl: 'https://us.forums.blizzard.com/en/wow/t/moonlit-loft/1',
	internalNotes: 'Confirmed original poster; code posted for public import.',
	publication: 'published' as const
};

function manifestFor(shareCode: string): BuildManifest {
	return {
		shareCode,
		blueprintType: 'House',
		contentGroups: [
			{ contentType: 3, entries: [{ itemID: 900, recordID: 4242, name: 'Alchemy Table', total: 3 }] },
			{ contentType: 2, entries: [{ roomGUID: 'room-1' }] }
		],
		budgetInfo: null,
		blockingRequirements: null
	};
}

function newAccount(sub: string, isAdmin = false) {
	return upsertBattleNetAccount({ sub, battletag: `${sub}#0001` }, 'us', ['openid'], isAdmin);
}

beforeAll(() => migrateTestDatabase(testDatabase.path));
afterAll(() => removeTestDatabase(testDatabase.path));

describe('normalizeShareCode', () => {
	it('trims whitespace but never changes case — codes are opaque', () => {
		expect(normalizeShareCode('  AbC-123  ')).toBe('AbC-123');
		expect(normalizeShareCode('AbC')).not.toBe('abc');
	});
});

describe('indexBlueprint', () => {
	it('creates a listing with its provenance', () => {
		const result = indexBlueprint({ ...baseInput, shareCode: 'CODE-CREATE' });
		expect(result.status).toBe('created');

		const blueprint = getIndexedBlueprint((result as { id: string }).id)!;
		expect(blueprint.shareCode).toBe('CODE-CREATE');
		expect(blueprint.attributedCreator).toBe('Thornwick');
		expect(blueprint.sources).toHaveLength(1);
		expect(blueprint.sources[0].sourceUrl).toBe(baseInput.sourceUrl);
		expect(blueprint.sources[0].platformLabel).toBe('World of Warcraft Forums');
	});

	it('rejects an invalid share code', () => {
		const result = indexBlueprint({ ...baseInput, shareCode: 'has spaces' });
		expect(result).toMatchObject({ status: 'invalid' });
		expect((result as { errors: string[] }).errors.join(' ')).toMatch(/shareCode/);
	});

	it('rejects a source URL that does not belong to the declared platform', () => {
		const result = indexBlueprint({
			...baseInput,
			shareCode: 'CODE-WRONGHOST',
			platform: 'wowhead',
			sourceUrl: 'https://reddit.com/r/WoWHousing/comments/abc'
		});
		expect(result).toMatchObject({ status: 'invalid' });
		expect((result as { errors: string[] }).errors.join(' ')).toMatch(/does not belong to Wowhead/);
	});

	it('rejects a non-https source URL', () => {
		const result = indexBlueprint({
			...baseInput,
			shareCode: 'CODE-HTTP',
			sourceUrl: 'http://us.forums.blizzard.com/en/wow/t/x/1'
		});
		expect(result).toMatchObject({ status: 'invalid' });
	});

	it('adds a second source to the same listing rather than duplicating it', () => {
		const first = indexBlueprint({ ...baseInput, shareCode: 'CODE-MULTI' });
		const second = indexBlueprint({
			...baseInput,
			shareCode: 'CODE-MULTI',
			platform: 'reddit',
			sourceUrl: 'https://reddit.com/r/WoWHousing/comments/xyz'
		});

		expect(second).toEqual({ status: 'source_added', id: (first as { id: string }).id });
		const blueprint = getIndexedBlueprint((first as { id: string }).id)!;
		expect(blueprint.sources).toHaveLength(2);
		expect(blueprint.sources.map((source) => source.platform).sort()).toEqual(['blizzard-forums', 'reddit']);
		// Exactly one public listing, no matter how many places it was found.
		expect(db.select().from(indexedBlueprints).all().filter((row) => row.shareCode === 'CODE-MULTI')).toHaveLength(1);
	});

	it('adds a source without demanding listing fields that already exist', () => {
		const first = indexBlueprint({ ...baseInput, shareCode: 'CODE-SOURCE-ONLY' });

		// Recording a second place a blueprint was found is a first-class action.
		// It must not require restating a title and type that already exist and
		// would be ignored — that is what made the first curated batch fail.
		const second = indexBlueprint({
			shareCode: 'CODE-SOURCE-ONLY',
			title: '',
			attributedCreator: 'Thornwick',
			platform: 'youtube',
			sourceUrl: 'https://www.youtube.com/watch?v=abcdefghijk'
		});

		expect(second).toEqual({ status: 'source_added', id: (first as { id: string }).id });
		const blueprint = getIndexedBlueprint((first as { id: string }).id)!;
		expect(blueprint.sources).toHaveLength(2);
		// The original curation title is untouched by the source-only call.
		expect(blueprint.title).toBe(baseInput.title);
	});

	it('still requires a title when the call actually creates a listing', () => {
		const result = indexBlueprint({ ...baseInput, shareCode: 'CODE-NO-TITLE', title: '' });
		expect(result).toMatchObject({ status: 'invalid' });
		expect((result as { errors: string[] }).errors.join(' ')).toMatch(/title is required/);
	});

	it('does not judge listing metadata on a source-add, and does not let it overwrite anything', () => {
		const first = indexBlueprint({ ...baseInput, shareCode: 'CODE-SOURCE-META', blueprintType: 'House' });
		const id = (first as { id: string }).id;

		// Values that WOULD be rejected on a create are simply irrelevant here:
		// the source-add path never reads them, so it must neither fail on them
		// nor apply them to the existing listing.
		const second = indexBlueprint({
			shareCode: 'CODE-SOURCE-META',
			title: 'A different title',
			attributedCreator: 'Thornwick',
			platform: 'reddit',
			sourceUrl: 'https://reddit.com/r/WoWHousing/comments/meta',
			blueprintType: 'NotAValidType',
			faction: 'Banana'
		});

		expect(second).toEqual({ status: 'source_added', id });
		const blueprint = getIndexedBlueprint(id)!;
		expect(blueprint.title).toBe(baseInput.title);
		expect(blueprint.blueprintType).toBe('House');
		expect(blueprint.faction).toBeNull();
	});

	it('still rejects a bad source URL on a source-add', () => {
		indexBlueprint({ ...baseInput, shareCode: 'CODE-SOURCE-BADURL' });

		// Source fields ARE validated on this path — only the listing fields are skipped.
		const result = indexBlueprint({
			shareCode: 'CODE-SOURCE-BADURL',
			title: '',
			attributedCreator: 'Thornwick',
			platform: 'wowhead',
			sourceUrl: 'https://reddit.com/r/WoWHousing/comments/wrong-host'
		});

		expect(result).toMatchObject({ status: 'invalid' });
		expect((result as { errors: string[] }).errors.join(' ')).toMatch(/does not belong to Wowhead/);
	});

	it('is a no-op when the same source URL is submitted twice', () => {
		const first = indexBlueprint({ ...baseInput, shareCode: 'CODE-SAMESOURCE' });
		const second = indexBlueprint({ ...baseInput, shareCode: 'CODE-SAMESOURCE' });

		expect(second).toEqual({ status: 'duplicate', id: (first as { id: string }).id });
		expect(
			db.select().from(indexedBlueprintSources).all().filter((row) => row.blueprintId === (first as { id: string }).id)
		).toHaveLength(1);
	});

	// The reverse of the native_conflict guard below. `indexBlueprint` refuses a
	// code a native build owns; these cover a native submission arriving for a
	// code that was already indexed — which is what happens if the companion is
	// pointed at a third-party code instead of the admin ?/resolve form.
	it('links a native submission to the indexed listing for the same code', () => {
		const indexed = indexBlueprint({ ...baseInput, shareCode: 'CODE-INDEXED-FIRST' });
		const indexedId = (indexed as { id: string }).id;

		createBuild({
			shareCode: 'CODE-INDEXED-FIRST',
			title: 'Submitted natively afterwards',
			blueprintType: 'House',
			faction: null,
			authorName: 'Somebody else entirely',
			manifest: manifestFor('CODE-INDEXED-FIRST')
		});

		const nativeBuild = findNativeBuildForCode('CODE-INDEXED-FIRST');
		const listing = getIndexedBlueprintForManagement(indexedId)!;

		// One blueprint, two records that know about each other.
		expect(nativeBuild).not.toBeNull();
		expect(listing.nativeBuildId).toBe(nativeBuild!.id);
	});

	it('does not let a native submission teach the catalog from an indexed code', () => {
		indexBlueprint({ ...baseInput, shareCode: 'CODE-INDEXED-NOPOISON' });
		const before = db.select().from(decorItems).all().length;

		createBuild({
			shareCode: 'CODE-INDEXED-NOPOISON',
			title: 'Resolved through the wrong tool',
			blueprintType: 'House',
			faction: null,
			manifest: {
				shareCode: 'CODE-INDEXED-NOPOISON',
				blueprintType: 'House',
				// A pair no other test introduces, so the catalog can only learn it here.
				contentGroups: [{ contentType: 3, entries: [{ itemID: 660001, recordID: 660002, name: 'Third-party decor', total: 2 }] }],
				budgetInfo: null,
				blockingRequirements: null
			}
		});

		// Submission is not proof of authorship — that is what claiming is for —
		// so a code we know came from someone else's public share must not become
		// authoritative catalog knowledge through this path either.
		expect(db.select().from(decorItems).all().length).toBe(before);
		expect(db.select().from(decorItems).all().some((row) => row.itemID === 660001)).toBe(false);
	});

	it('still learns the catalog from an ordinary native submission', () => {
		const before = db.select().from(decorItems).all().length;

		createBuild({
			shareCode: 'CODE-NOT-INDEXED-AT-ALL',
			title: 'A normal creator submission',
			blueprintType: 'House',
			faction: null,
			manifest: {
				shareCode: 'CODE-NOT-INDEXED-AT-ALL',
				blueprintType: 'House',
				contentGroups: [{ contentType: 3, entries: [{ itemID: 660101, recordID: 660102, name: 'Learned decor', total: 1 }] }],
				budgetInfo: null,
				blockingRequirements: null
			}
		});

		// The pilot's existing self-learning behaviour is unchanged for codes that
		// were never indexed from somebody else's post.
		expect(db.select().from(decorItems).all().length).toBe(before + 1);
		expect(db.select().from(decorItems).all().some((row) => row.itemID === 660101)).toBe(true);
	});

	it('archives a published listing but leaves a curated draft alone', () => {
		const published = indexBlueprint({ ...baseInput, shareCode: 'CODE-INDEXED-PUBLISHED' });
		const draft = indexBlueprint({ ...baseInput, shareCode: 'CODE-INDEXED-DRAFT', publication: 'draft' });

		for (const code of ['CODE-INDEXED-PUBLISHED', 'CODE-INDEXED-DRAFT']) {
			createBuild({
				shareCode: code,
				title: `Native for ${code}`,
				blueprintType: 'House',
				faction: null,
				manifest: manifestFor(code)
			});
		}

		// Native takes precedence in presentation, so a public listing steps aside...
		expect(getIndexedBlueprint((published as { id: string }).id)).toBeNull();
		// ...but a draft under review is not destroyed; it was never public.
		const draftRow = getIndexedBlueprintForManagement((draft as { id: string }).id)!;
		expect(draftRow).not.toBeNull();
		expect(draftRow.nativeBuildId).not.toBeNull();
	});

	it('records the collision so an operator can see it happened', () => {
		const indexed = indexBlueprint({ ...baseInput, shareCode: 'CODE-INDEXED-AUDIT' });
		const indexedId = (indexed as { id: string }).id;

		createBuild({
			shareCode: 'CODE-INDEXED-AUDIT',
			title: 'Native arrival',
			blueprintType: 'House',
			faction: null,
			manifest: manifestFor('CODE-INDEXED-AUDIT')
		});

		const events = db
			.select()
			.from(blueprintAuditEvents)
			.where(eq(blueprintAuditEvents.blueprintId, indexedId))
			.all()
			.map((row) => row.event);
		expect(events).toContain('native_build_submitted');
	});

	it('refuses to index a code that a native creator submission already owns', () => {
		createBuild({
			shareCode: 'CODE-NATIVE',
			title: 'Creator submitted this themselves',
			blueprintType: 'House',
			faction: null,
			manifest: manifestFor('CODE-NATIVE')
		});

		const result = indexBlueprint({ ...baseInput, shareCode: 'CODE-NATIVE' });
		expect(result.status).toBe('native_conflict');
		expect(db.select().from(indexedBlueprints).all().some((row) => row.shareCode === 'CODE-NATIVE')).toBe(false);
	});

	it('keeps new listings out of the public list until they are published', () => {
		const result = indexBlueprint({ ...baseInput, shareCode: 'CODE-DRAFT', publication: 'draft' });
		const id = (result as { id: string }).id;

		expect(getIndexedBlueprint(id)).toBeNull();
		expect(listIndexedBlueprints().some((blueprint) => blueprint.id === id)).toBe(false);
		// Operators can still see it.
		expect(getIndexedBlueprintForManagement(id)).not.toBeNull();

		setPublication(id, 'published');
		expect(getIndexedBlueprint(id)).not.toBeNull();
	});
});

describe('internal evidence stays internal', () => {
	it('never appears in the public projection', () => {
		const result = indexBlueprint({
			...baseInput,
			shareCode: 'CODE-SECRET',
			internalNotes: 'SENSITIVE-REVIEW-EVIDENCE'
		});
		const blueprint = getIndexedBlueprint((result as { id: string }).id)!;

		expect(JSON.stringify(blueprint)).not.toContain('SENSITIVE-REVIEW-EVIDENCE');
		// It is stored — the point is that it is not served.
		expect(
			db.select().from(indexedBlueprintSources).all().some((row) => row.internalNotes === 'SENSITIVE-REVIEW-EVIDENCE')
		).toBe(true);
	});
});

describe('resolution and revocation', () => {
	it('reports no derived data and no verification until a manifest is resolved', () => {
		const result = indexBlueprint({ ...baseInput, shareCode: 'CODE-UNRESOLVED' });
		const blueprint = getIndexedBlueprint((result as { id: string }).id)!;

		expect(blueprint.resolutionState).toBe('unresolved');
		expect(blueprint.derived).toBeNull();
		// Unresolved is still offerable — it is just not claimed to be verified.
		expect(blueprint.copyable).toBe(true);
	});

	it('derives counts only from a resolved manifest', () => {
		const result = indexBlueprint({ ...baseInput, shareCode: 'CODE-RESOLVE' });
		const id = (result as { id: string }).id;

		expect(attachResolvedManifest(id, manifestFor('CODE-RESOLVE'))).toEqual({ ok: true });
		const blueprint = getIndexedBlueprint(id)!;
		expect(blueprint.resolutionState).toBe('resolved');
		expect(blueprint.derived).toEqual({ decorCount: 3, roomCount: 1, distinctDecorItems: 1 });
	});

	it('refuses a manifest whose code does not match the listing', () => {
		const result = indexBlueprint({ ...baseInput, shareCode: 'CODE-MISMATCH' });
		const id = (result as { id: string }).id;
		expect(attachResolvedManifest(id, manifestFor('SOME-OTHER-CODE'))).toMatchObject({ ok: false });
	});

	it('does not teach the decor catalog from third-party manifests', () => {
		const before = db.select().from(decorItems).all().length;
		const result = indexBlueprint({ ...baseInput, shareCode: 'CODE-NOCATALOG' });
		// A pair no other path in this suite has introduced, so the only way it
		// could reach the catalog is through the indexed-blueprint resolution path.
		attachResolvedManifest((result as { id: string }).id, {
			shareCode: 'CODE-NOCATALOG',
			blueprintType: 'House',
			contentGroups: [{ contentType: 3, entries: [{ itemID: 777001, recordID: 777002, name: 'Unvetted Sconce', total: 1 }] }],
			budgetInfo: null,
			blockingRequirements: null
		} satisfies BuildManifest);

		// Native submissions self-learn recordID↔itemID pairs; indexed third-party
		// codes deliberately do not, so unverified pairs cannot become catalog truth.
		expect(db.select().from(decorItems).all().length).toBe(before);
		expect(db.select().from(decorItems).all().some((row) => row.itemID === 777001)).toBe(false);
		expect(db.select().from(decorItems).all().some((row) => row.recordID === 777002)).toBe(false);
	});

	it('withdraws the copy action when a code stops resolving', () => {
		const result = indexBlueprint({ ...baseInput, shareCode: 'CODE-GONE' });
		const id = (result as { id: string }).id;
		setResolutionState(id, 'unavailable', 'Checked 2026-08-17; addon reported no contents');

		const blueprint = getIndexedBlueprint(id)!;
		expect(blueprint.resolutionState).toBe('unavailable');
		expect(blueprint.copyable).toBe(false);
		// Provenance survives so the listing stays auditable.
		expect(blueprint.sources).toHaveLength(1);
	});

	it('withdraws the copy action when sharing is revoked, keeping the record', () => {
		const result = indexBlueprint({ ...baseInput, shareCode: 'CODE-REVOKED' });
		const id = (result as { id: string }).id;
		setResolutionState(id, 'revoked', 'Creator asked us to stop offering the code');

		const blueprint = getIndexedBlueprint(id)!;
		expect(blueprint.copyable).toBe(false);
		expect(blueprint.indexedAt).toBeTruthy();
	});
});

describe('creator editing authorization', () => {
	function claimedListing(shareCode: string, ownerSub: string) {
		const indexed = indexBlueprint({ ...baseInput, shareCode });
		const id = (indexed as { id: string }).id;
		const owner = newAccount(ownerSub);
		const admin = newAccount(`${ownerSub}-admin`, true);
		const claim = requestClaim({ blueprintId: id, accountId: owner.id, claimantNote: 'I posted this' });
		approveClaim((claim as { claimId: string }).claimId, admin.id);
		return { id, owner };
	}

	it('lets the approved creator edit their own listing', () => {
		const { id, owner } = claimedListing('CODE-EDIT-OWN', 'owner-a');

		expect(applyCreatorEdit(id, owner.id, { title: 'My apothecary loft', description: 'Built over six weeks.' })).toEqual({
			ok: true
		});

		const blueprint = getIndexedBlueprint(id)!;
		expect(blueprint.title).toBe('My apothecary loft');
		expect(blueprint.description).toBe('Built over six weeks.');
		expect(blueprint.claimState).toBe('claimed');
	});

	it("refuses another authenticated user's edit", () => {
		const { id } = claimedListing('CODE-EDIT-OTHER', 'owner-b');
		const stranger = newAccount('stranger-b');

		const result = applyCreatorEdit(id, stranger.id, { title: 'Hijacked' });
		expect(result).toMatchObject({ ok: false, status: 403 });
		expect(getIndexedBlueprint(id)!.title).toBe(baseInput.title);
	});

	it('refuses edits to an unclaimed listing from any authenticated user', () => {
		const indexed = indexBlueprint({ ...baseInput, shareCode: 'CODE-EDIT-UNCLAIMED' });
		const id = (indexed as { id: string }).id;
		const anyone = newAccount('anyone-c');

		expect(applyCreatorEdit(id, anyone.id, { title: 'Mine now' })).toMatchObject({ ok: false, status: 403 });
	});

	it('refuses edits while a claim is only pending', () => {
		const indexed = indexBlueprint({ ...baseInput, shareCode: 'CODE-EDIT-PENDING' });
		const id = (indexed as { id: string }).id;
		const hopeful = newAccount('hopeful-d');
		requestClaim({ blueprintId: id, accountId: hopeful.id });

		expect(applyCreatorEdit(id, hopeful.id, { title: 'Too early' })).toMatchObject({ ok: false, status: 403 });
	});

	it('leaves provenance untouched when a creator edits', () => {
		const { id, owner } = claimedListing('CODE-EDIT-PROV', 'owner-e');
		const before = getIndexedBlueprint(id)!;

		applyCreatorEdit(id, owner.id, { title: 'Renamed', preferredAttribution: 'Thornwick of Tichondrius' });

		const after = getIndexedBlueprint(id)!;
		expect(after.sources).toEqual(before.sources);
		expect(after.indexedAt).toBe(before.indexedAt);
		// The attribution observed at the source is still the recorded fact.
		expect(after.attributedCreator).toBe('Thornwick');
		expect(after.preferredAttribution).toBe('Thornwick of Tichondrius');
	});

	it('discards derived data when the creator replaces the blueprint code', () => {
		const { id, owner } = claimedListing('CODE-EDIT-REPLACE', 'owner-f');
		attachResolvedManifest(id, manifestFor('CODE-EDIT-REPLACE'));
		expect(getIndexedBlueprint(id)!.derived).not.toBeNull();

		expect(applyCreatorEdit(id, owner.id, { shareCode: 'CODE-EDIT-REPLACED-NEW' })).toEqual({ ok: true });

		const after = getIndexedBlueprint(id)!;
		expect(after.shareCode).toBe('CODE-EDIT-REPLACED-NEW');
		// The old manifest described the old blueprint; it is not carried over.
		expect(after.resolutionState).toBe('unresolved');
		expect(after.derived).toBeNull();
	});

	it('refuses a replacement code that a native build already owns', () => {
		const { id, owner } = claimedListing('CODE-EDIT-CLASH', 'owner-g');
		createBuild({
			shareCode: 'CODE-EDIT-NATIVE-TARGET',
			title: 'Someone else submitted this',
			blueprintType: 'House',
			faction: null,
			manifest: manifestFor('CODE-EDIT-NATIVE-TARGET')
		});

		expect(applyCreatorEdit(id, owner.id, { shareCode: 'CODE-EDIT-NATIVE-TARGET' })).toMatchObject({
			ok: false,
			status: 409
		});
	});

	it('rejects oversized and malformed creator input', () => {
		const { id, owner } = claimedListing('CODE-EDIT-VALIDATE', 'owner-h');

		expect(applyCreatorEdit(id, owner.id, { title: '' })).toMatchObject({ ok: false, status: 400 });
		expect(applyCreatorEdit(id, owner.id, { title: 'x'.repeat(121) })).toMatchObject({ ok: false, status: 400 });
		expect(applyCreatorEdit(id, owner.id, { tags: Array(13).fill('tag') })).toMatchObject({ ok: false, status: 400 });
		expect(applyCreatorEdit(id, owner.id, { links: ['javascript:alert(1)'] })).toMatchObject({ ok: false, status: 400 });
		expect(applyCreatorEdit(id, owner.id, { links: ['http://insecure.example'] })).toMatchObject({
			ok: false,
			status: 400
		});
	});

	it('hides the creator overlay again if the listing is ever unclaimed', () => {
		const { id, owner } = claimedListing('CODE-EDIT-OVERLAY', 'owner-i');
		applyCreatorEdit(id, owner.id, { title: 'Creator title', description: 'Creator words' });

		// Simulate an operator reversing a claim.
		db.update(indexedBlueprints)
			.set({ claimState: 'unclaimed', claimedByAccountId: null })
			.where(eq(indexedBlueprints.id, id))
			.run();

		const blueprint = getIndexedBlueprint(id)!;
		expect(blueprint.title).toBe(baseInput.title);
		expect(blueprint.description).toBeNull();
	});
});
