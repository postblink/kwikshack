import { describe, expect, it } from 'vitest';
import { isSubmitKeyAllowed } from '$lib/server/submit-key';

describe('isSubmitKeyAllowed', () => {
	it('allows submissions when the key is unset', () => {
		expect(isSubmitKeyAllowed(undefined, null)).toBe(true);
	});

	it('denies a mismatched key', () => {
		expect(isSubmitKeyAllowed('expected', 'wrong')).toBe(false);
	});

	it('allows a matching key', () => {
		expect(isSubmitKeyAllowed('expected', 'expected')).toBe(true);
	});

	it('denies when key set but no key provided', () => {
		expect(isSubmitKeyAllowed('expected', null)).toBe(false);
	});
});
