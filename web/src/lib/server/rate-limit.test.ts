import { describe, expect, it } from 'vitest';
import { FixedWindowRateLimiter } from './rate-limit';

describe('FixedWindowRateLimiter', () => {
	it('limits each identifier and resets after the window', () => {
		let now = 1_000;
		const limiter = new FixedWindowRateLimiter({ windowMs: 100, maxRequests: 2, now: () => now });
		expect(limiter.allow('one')).toBe(true);
		expect(limiter.allow('one')).toBe(true);
		expect(limiter.allow('one')).toBe(false);
		expect(limiter.allow('two')).toBe(true);
		now += 100;
		expect(limiter.allow('one')).toBe(true);
	});

	it('refuses new buckets when the bounded map is full', () => {
		const limiter = new FixedWindowRateLimiter({ windowMs: 1_000, maxRequests: 2, maxBuckets: 1, now: () => 0 });
		expect(limiter.allow('one')).toBe(true);
		expect(limiter.allow('two')).toBe(false);
	});
});
