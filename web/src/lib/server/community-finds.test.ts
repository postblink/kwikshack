import { describe, expect, it } from 'vitest';
import { communityFindData } from './community-finds.data';
import {
	toPublicCommunityFind,
	validateCommunityFind,
	validateCommunityFindRegistry,
	listCommunityFinds,
	type CommunityFindInput
} from './community-finds';

const validFind: CommunityFindInput = {
	id: 'cozy-library',
	title: 'Cozy Library',
	creatorName: 'Example Creator',
	curationBlurb: 'An original KwikShack editorial note.',
	tags: ['Library'],
	sourcePlatform: 'Example Community',
	sourceUrl: 'https://example.com/builds/cozy-library',
	permission: 'external-link-only',
	publication: 'published',
	discoveredAt: '2026-08-01',
	addedAt: '2026-08-12'
};

describe('Community Find curation rules', () => {
	it('accepts a provenance-only external link record', () => {
		expect(validateCommunityFind(validFind)).toEqual([]);
	});

	it('keeps pending or unknown records out of publication', () => {
		expect(validateCommunityFind({ ...validFind, permission: 'pending' })).toContain(
			'published finds require granted or external-link-only permission'
		);
	});

	it('rejects unsafe source URLs and duplicate ids', () => {
		expect(validateCommunityFind({ ...validFind, sourceUrl: 'javascript:alert(1)' })).toContain(
			'sourceUrl must be an absolute HTTP(S) URL'
		);
		expect(validateCommunityFindRegistry([validFind, validFind])).toContain('cozy-library: duplicate id');
	});

	it('allows only the existing internal submission route for relative claim links', () => {
		expect(validateCommunityFind({ ...validFind, claimUrl: '/submit?from=community-find' })).toEqual([]);
		expect(validateCommunityFind({ ...validFind, claimUrl: '/admin/claims' })).toContain(
			'claimUrl must be /submit, HTTP(S), or mailto'
		);
	});

	it('rejects impossible calendar dates', () => {
		expect(validateCommunityFind({ ...validFind, discoveredAt: '2026-02-31' })).toContain(
			'discoveredAt must be YYYY-MM-DD'
		);
	});

	it('validates the checked-in curation registry', () => {
		expect(validateCommunityFindRegistry(communityFindData)).toEqual([]);
	});

	it('publishes the pilot finds in editorial order with exact original blurbs', () => {
		const finds = listCommunityFinds();
		expect(finds.map((find) => find.id)).toEqual([
			'tiny-kitchen',
			'a-blood-elf-mansion',
			'witchy-cottage',
			'the-peon-pub',
			'cozy-bedroom-with-reading-nook'
		]);
		expect(finds.map((find) => find.curationBlurb)).toEqual([
			'A remarkably complete kitchen packed into a tiny space, with clever custom-built appliances, storage, and detailing.',
			'A grand Blood Elf mansion built around dramatic vertical spaces, sweeping stairs, rich interiors, and an especially impressive library.',
			'A tiny Night Elf cottage overflowing with cozy, witchy character and storybook atmosphere.',
			'An Orc-inspired kitchen that grew into a full pub, complete with bar spaces, games, and plenty of Horde personality.',
			'A warm bedroom and reading retreat with particularly clever custom windows and an inviting use of space.'
		]);
	});

	it('keeps external media and blueprint data out of the pilot registry', () => {
		for (const find of communityFindData) {
			expect(find.sourceUrl).toMatch(/^https:\/\/www\.wowhead\.com\/housing-builds\//);
			expect(find).not.toHaveProperty('imageUrl');
			expect(find).not.toHaveProperty('screenshotUrl');
			expect(find).not.toHaveProperty('shareCode');
			expect(find).not.toHaveProperty('blueprint');
		}
	});

	it('strips internal permission evidence from visitor-facing data', () => {
		const publicFind = toPublicCommunityFind({ ...validFind, curationNotes: 'private permission evidence' });
		expect(publicFind.sourceUrl).toBe(validFind.sourceUrl);
		expect(publicFind).not.toHaveProperty('permission');
		expect(publicFind).not.toHaveProperty('publication');
		expect(publicFind).not.toHaveProperty('curationNotes');
	});
});
