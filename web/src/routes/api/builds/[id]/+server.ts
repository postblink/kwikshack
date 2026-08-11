import { json, error } from '@sveltejs/kit';
import { getBuild, enrichItems } from '$lib/server/builds';
import type { RequestHandler } from './$types';

// GET /api/builds/:id — full build with enriched decor items
export const GET: RequestHandler = async ({ params }) => {
	const record = getBuild(params.id);
	if (!record) error(404, 'Build not found');

	return json({
		...record,
		items: enrichItems(record.manifest),
		itemCount: record.manifest.contentGroups?.reduce(
			(n, g) => n + (Array.isArray(g.entries) ? g.entries.length : 0),
			0
		) ?? 0
	});
};
