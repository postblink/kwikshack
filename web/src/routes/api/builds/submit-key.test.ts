import { describe, expect, it, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$lib/server/builds', () => ({ createBuild: vi.fn(), listBuilds: vi.fn() }));

import { isSubmitKeyAllowed } from './+server';

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
});
