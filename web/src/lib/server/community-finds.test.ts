import { describe, expect, it } from 'vitest';
import { communityFindData } from './community-finds.data';
import {
	toPublicCommunityFind,
	validateCommunityFind,
	validateCommunityFindRegistry,
	type CommunityFindInput
} from './community-finds';

const validFind: CommunityFindInput = {
	id: 'cozy-library',
	title: 'Cozy Library',
	creatorName: 'Example Creator',
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

	it('rejects impossible calendar dates', () => {
		expect(validateCommunityFind({ ...validFind, discoveredAt: '2026-02-31' })).toContain(
			'discoveredAt must be YYYY-MM-DD'
		);
	});

	it('validates the checked-in curation registry', () => {
		expect(validateCommunityFindRegistry(communityFindData)).toEqual([]);
	});

	it('strips internal permission evidence from visitor-facing data', () => {
		const publicFind = toPublicCommunityFind({ ...validFind, curationNotes: 'private permission evidence' });
		expect(publicFind.sourceUrl).toBe(validFind.sourceUrl);
		expect(publicFind).not.toHaveProperty('permission');
		expect(publicFind).not.toHaveProperty('publication');
		expect(publicFind).not.toHaveProperty('curationNotes');
	});
});
