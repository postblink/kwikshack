import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { dev } from '$app/environment';
import { validateSubmitPayload, type SubmitBuildPayload } from '$lib/types/manifest';
import { createBuild, getBuildByCode, listBuilds, type BuildSort } from '$lib/server/builds';
import { getSubmitAccess } from '$lib/server/submit-key';
import { FixedWindowRateLimiter } from '$lib/server/rate-limit';
import type { RequestHandler } from './$types';

// POST /api/builds — submit a build (manifest + optional placement data)
// Body: SubmitBuildPayload — see $lib/types/manifest.ts
// Auth: production fails closed unless KWIKSHACK_SUBMIT_KEY is configured.
// Local dev remains open. Founding builders use the same key from the web form
// or companion's x-kwikshack-key header.
// NOTE: keep this module's exports to valid route handlers only — SvelteKit
// rejects any other named export at runtime.

const MAX_BUILD_REQUEST_BYTES = 1024 * 1024;
const submissionLimiter = new FixedWindowRateLimiter({ windowMs: 60_000, maxRequests: 10 });

export const POST: RequestHandler = async (event) => {
	const clientIp = event.getClientAddress();
	if (!submissionLimiter.allow(clientIp)) error(429, 'Rate limit exceeded');

	const submitKey = env.KWIKSHACK_SUBMIT_KEY;
	const providedKey = event.request.headers.get('x-kwikshack-key');
	const access = getSubmitAccess(submitKey, providedKey, dev);
	if (access === 'unavailable') error(503, 'Build submissions are not configured');
	if (access === 'invalid') error(401, 'Invalid submit key');

	const contentLength = Number(event.request.headers.get('content-length') ?? '0');
	if (Number.isFinite(contentLength) && contentLength > MAX_BUILD_REQUEST_BYTES) error(413, 'Build payload too large');

	let text: string;
	try {
		text = await event.request.text();
	} catch {
		error(400, 'Could not read request body');
	}
	if (new TextEncoder().encode(text).byteLength > MAX_BUILD_REQUEST_BYTES) error(413, 'Build payload too large');

	let body: unknown;
	try {
		body = JSON.parse(text);
	} catch {
		error(400, 'Body must be JSON');
	}

	const validationError = validateSubmitPayload(body);
	if (validationError) error(400, validationError);
	const validBody = body as SubmitBuildPayload;

	const existing = getBuildByCode(validBody.shareCode);
	if (existing) return json({ id: existing.id, shareCode: existing.shareCode, existing: true });

	const record = createBuild({
		shareCode: validBody.shareCode,
		title: validBody.title?.trim() || `Build ${validBody.shareCode}`,
		description: validBody.description,
		blueprintType: validBody.blueprintType ?? 'House',
		faction: validBody.faction ?? null,
		authorName: validBody.authorName,
		manifest: validBody.manifest,
		placementData: validBody.placementData ?? null,
		screenshotUrls: validBody.screenshotUrls
	});

	return json({ id: record.id, shareCode: record.shareCode, existing: false }, { status: 201 });
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
			primaryScreenshot: b.primaryScreenshot,
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
