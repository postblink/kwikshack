import { describe, expect, it } from 'vitest';
import { getSubmitAccess } from '$lib/server/submit-key';

describe('getSubmitAccess', () => {
	it('allows an unset key only when explicitly open for local development', () => {
		expect(getSubmitAccess(undefined, null, true)).toBe('allowed');
		expect(getSubmitAccess(undefined, null, false)).toBe('unavailable');
	});

	it('denies a mismatched key', () => {
		expect(getSubmitAccess('expected', 'wrong', false)).toBe('invalid');
	});

	it('allows a matching key', () => {
		expect(getSubmitAccess('expected', 'expected', false)).toBe('allowed');
	});

	it('denies when key set but no key provided', () => {
		expect(getSubmitAccess('expected', null, false)).toBe('invalid');
	});
});
