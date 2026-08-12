import { describe, expect, it } from 'vitest';
import { isBuildManifest, isSubmitPayload } from './manifest';

const manifest = {
	shareCode: 'valid-code',
	blueprintType: 'House',
	contentGroups: [{ contentType: 3, entries: [{ recordID: 123, total: 1 }] }],
	budgetInfo: null,
	blockingRequirements: null
};

describe('isBuildManifest', () => {
	it('accepts a minimally valid manifest', () => {
		expect(isBuildManifest(manifest)).toBe(true);
	});

	it.each([
		null,
		'garbage',
		{},
		{ shareCode: '', contentGroups: [] },
		{ shareCode: 'code', contentGroups: 'garbage' },
		{ shareCode: 'code', contentGroups: [null] },
		{ shareCode: 'code', contentGroups: [{ entries: ['garbage'] }] }
	])('rejects garbage: %j', (value) => {
		expect(isBuildManifest(value)).toBe(false);
	});
});

describe('isSubmitPayload', () => {
	it('accepts a minimally valid payload', () => {
		expect(isSubmitPayload({ shareCode: 'valid-code', manifest })).toBe(true);
	});

	it.each([
		null,
		[],
		{},
		{ shareCode: '', manifest },
		{ shareCode: 'valid-code', manifest: null },
		{ shareCode: 'valid-code', manifest: { shareCode: 'code', contentGroups: [null] } }
	])('rejects garbage: %j', (value) => {
		expect(isSubmitPayload(value)).toBe(false);
	});
});
