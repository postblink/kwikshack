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

export const POST: RequestHandler = async ({ request }) => {
	const submitKey = env.KWIKSHACK_SUBMIT_KEY;
	const providedKey = request.headers.get('x-kwikshack-key');
	if (!isSubmitKeyAllowed(submitKey, providedKey)) error(401, 'Invalid submit key');

	let body: unknown;
	try {
		body = await request.json();
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

// GET /api/builds?limit=&offset=&type=&faction=&q=&items=&sort=
export const GET: RequestHandler = async ({ url }) => {
	const requestedLimit = Number(url.searchParams.get('limit') ?? '24');
	const requestedOffset = Number(url.searchParams.get('offset') ?? '0');
	const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.trunc(requestedLimit), 0), 100) : 24;
	const offset = Number.isFinite(requestedOffset) ? Math.max(Math.trunc(requestedOffset), 0) : 0;
	const type = url.searchParams.get('type') ?? undefined;
	const faction = url.searchParams.get('faction') ?? undefined;
	const q = url.searchParams.get('q') ?? undefined;
	const itemIDs = [
		...new Set(
			(url.searchParams.get('items') ?? '')
				.split(',')
				.map(Number)
				.filter((itemID) => Number.isSafeInteger(itemID) && itemID > 0)
		)
	];
	const requestedSort = url.searchParams.get('sort');
	const sort: BuildSort = requestedSort === 'most_items' ? 'most_items' : 'newest';

	const records = listBuilds({ limit, offset, type, faction, q, itemIDs, sort });
	return json({
		builds: records.map((b) => ({
			id: b.id,
			shareCode: b.shareCode,
			codeStatus: b.codeStatus,
			blueprintType: b.blueprintType,
			faction: b.faction,
			title: b.title,
			authorName: b.authorName,
			createdAt: b.createdAt
		})),
		limit,
		offset,
		sort
	});
};
