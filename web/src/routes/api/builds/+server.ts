import { json, error } from '@sveltejs/kit';
import { isSubmitPayload } from '$lib/types/manifest';
import { createBuild, listBuilds } from '$lib/server/builds';
import type { RequestHandler } from './$types';

// POST /api/builds — submit a build (manifest + optional placement data)
// Body: SubmitBuildPayload — see $lib/types/manifest.ts
export const POST: RequestHandler = async ({ request }) => {
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

// GET /api/builds?limit=&offset=&type=&faction=&q=
export const GET: RequestHandler = async ({ url }) => {
	const limit = Math.min(Number(url.searchParams.get('limit') ?? '24'), 100);
	const offset = Number(url.searchParams.get('offset') ?? '0');
	const type = url.searchParams.get('type') ?? undefined;
	const faction = url.searchParams.get('faction') ?? undefined;
	const q = url.searchParams.get('q') ?? undefined;

	const records = listBuilds({ limit, offset, type, faction, q });
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
			offset
	});
};
