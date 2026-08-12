import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { isSubmitPayload } from '$lib/types/manifest';
import { createBuild, listBuilds, type BuildSort } from '$lib/server/builds';
import { isSubmitKeyAllowed } from '$lib/server/submit-key';
import type { RequestHandler } from './$types';

// POST /api/builds — submit a build (manifest + optional placement data)
// Body: SubmitBuildPayload — see $lib/types/manifest.ts
// Auth: if KWIKSHACK_SUBMIT_KEY is set (production), require
// `x-kwikshack-key` header to match. Unset = open (local dev).
// NOTE: keep this module's exports to valid route handlers only — SvelteKit
// rejects any other named export at runtime.

// In-memory per-IP rate limiter. Module-level state lives for the lifetime of
// the server process (resets on restart); no external deps.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;
const rateLimitBuckets = new Map<string, { count: number; windowStart: number }>();

function allowRequest(ip: string): boolean {
	const now = Date.now();
	// Opportunistic sweep so the map can't grow unbounded across many IPs.
	if (rateLimitBuckets.size > 10_000) {
		for (const [key, bucket] of rateLimitBuckets) {
			if (now - bucket.windowStart >= RATE_LIMIT_WINDOW_MS) rateLimitBuckets.delete(key);
		}
	}
	const bucket = rateLimitBuckets.get(ip);
	if (!bucket || now - bucket.windowStart >= RATE_LIMIT_WINDOW_MS) {
		rateLimitBuckets.set(ip, { count: 1, windowStart: now });
		return true;
	}
	bucket.count += 1;
	return bucket.count <= RATE_LIMIT_MAX;
}

export const POST: RequestHandler = async (event) => {
	const submitKey = env.KWIKSHACK_SUBMIT_KEY;
	const providedKey = event.request.headers.get('x-kwikshack-key');
	if (!isSubmitKeyAllowed(submitKey, providedKey)) error(401, 'Invalid submit key');

	const clientIp = event.getClientAddress();
	if (!allowRequest(clientIp)) error(429, 'Rate limit exceeded');

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		error(400, 'Body must be JSON');
	}

	if (!isSubmitPayload(body)) {
		error(400, 'Invalid payload: need shareCode + manifest with contentGroups');
	}

	const record = createBuild({
		shareCode: body.shareCode,
		title: body.title?.trim() || `Build ${body.shareCode}`,
		description: body.description,
		blueprintType: body.blueprintType ?? 'House',
		faction: body.faction ?? null,
		authorName: body.authorName,
		manifest: body.manifest,
		placementData: body.placementData ?? null,
		screenshotUrls: Array.isArray(body.screenshotUrls) ? body.screenshotUrls : undefined
	});

	return json({ id: record.id, shareCode: record.shareCode });
};

// GET /api/builds?limit=&offset=&type=&faction=&q=&author=&tag=&items=&sort=&clientId=
export const GET: RequestHandler = async ({ url }) => {
	const requestedLimit = Number(url.searchParams.get('limit') ?? '24');
	const requestedOffset = Number(url.searchParams.get('offset') ?? '0');
	const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.trunc(requestedLimit), 0), 100) : 24;
	const offset = Number.isFinite(requestedOffset) ? Math.max(Math.trunc(requestedOffset), 0) : 0;
	const type = url.searchParams.get('type') ?? undefined;
	const faction = url.searchParams.get('faction') ?? undefined;
	const q = url.searchParams.get('q') ?? undefined;
	const author = url.searchParams.get('author') ?? undefined;
	const tag = url.searchParams.get('tag') ?? undefined;
	const clientId = url.searchParams.get('clientId')?.trim() || undefined;
	const itemIDs = [
		...new Set(
			(url.searchParams.get('items') ?? '')
				.split(',')
				.map(Number)
				.filter((itemID) => Number.isSafeInteger(itemID) && itemID > 0)
		)
	];
	const requestedSort = url.searchParams.get('sort');
	const sort: BuildSort = requestedSort === 'most_items' || requestedSort === 'most_liked' ? requestedSort : 'newest';

	const records = listBuilds({ limit, offset, type, faction, q, author, tag, itemIDs, sort, clientId });
	return json({
		builds: records.map((b) => ({
			id: b.id,
			shareCode: b.shareCode,
			codeStatus: b.codeStatus,
			blueprintType: b.blueprintType,
			faction: b.faction,
			title: b.title,
			authorName: b.authorName,
		lastVerifiedAt: b.lastVerifiedAt,
		createdAt: b.createdAt,
		likeCount: b.likeCount,
		liked: b.liked,
		tags: b.tags ?? []
	})),
		limit,
		offset,
		sort
	});
};
