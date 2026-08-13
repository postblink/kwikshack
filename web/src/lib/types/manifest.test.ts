import { describe, expect, it } from 'vitest';
import { isBuildManifest, isSubmitPayload, validateSubmitPayload } from './manifest';

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
		{ shareCode: 'code', contentGroups: [] },
		{ shareCode: 'code', contentGroups: [{ entries: [] }] },
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
		{ shareCode: 'valid-code', manifest: { shareCode: 'code', contentGroups: [] } },
		{ shareCode: 'valid-code', manifest: { shareCode: 'code', contentGroups: [null] } }
	])('rejects garbage: %j', (value) => {
		expect(isSubmitPayload(value)).toBe(false);
	});

	it('rejects mismatched codes, unbounded metadata, and external screenshots', () => {
		expect(validateSubmitPayload({ shareCode: 'other-code', manifest })).toBe('manifest shareCode must match shareCode');
		expect(validateSubmitPayload({ shareCode: 'valid-code', title: 'x'.repeat(121), manifest })).toBe(
			'title must be at most 120 characters'
		);
		expect(
			validateSubmitPayload({ shareCode: 'valid-code', manifest, screenshotUrls: ['https://tracker.example/pixel.png'] })
		).toBe('screenshots must be local KwikShack upload URLs');
	});

	it('accepts generated local screenshot URLs', () => {
		expect(
			isSubmitPayload({
				shareCode: 'valid-code',
				manifest,
				screenshotUrls: ['/uploads/7b3c8d04-f64d-40ca-a82e-6131e2c01481.png']
			})
		).toBe(true);
	});
});
