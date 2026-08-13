interface RateLimitOptions {
	windowMs: number;
	maxRequests: number;
	maxBuckets?: number;
	now?: () => number;
}

/** Small fixed-window limiter for a single adapter-node process. */
export class FixedWindowRateLimiter {
	private readonly buckets = new Map<string, { count: number; windowStart: number }>();
	private readonly maxBuckets: number;
	private readonly now: () => number;

	constructor(private readonly options: RateLimitOptions) {
		this.maxBuckets = options.maxBuckets ?? 10_000;
		this.now = options.now ?? Date.now;
	}

	allow(identifier: string): boolean {
		const now = this.now();
		const current = this.buckets.get(identifier);
		if (current && now - current.windowStart < this.options.windowMs) {
			current.count += 1;
			return current.count <= this.options.maxRequests;
		}

		if (current) this.buckets.delete(identifier);
		if (this.buckets.size >= this.maxBuckets) this.sweep(now);
		if (this.buckets.size >= this.maxBuckets) return false;

		this.buckets.set(identifier, { count: 1, windowStart: now });
		return true;
	}

	private sweep(now: number): void {
		for (const [identifier, bucket] of this.buckets) {
			if (now - bucket.windowStart >= this.options.windowMs) this.buckets.delete(identifier);
		}
	}
}
