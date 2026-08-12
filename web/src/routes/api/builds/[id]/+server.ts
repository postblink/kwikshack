import { json, error } from '@sveltejs/kit';
import { getBuild, enrichItems } from '$lib/server/builds';
import { db } from '$lib/server/db';
import { screenshots } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';

// GET /api/builds/:id — full build with enriched decor items + screenshots
export const GET: RequestHandler = async ({ params, url }) => {
	const record = getBuild(params.id, url.searchParams.get('clientId')?.trim() || undefined);
	if (!record) error(404, 'Build not found');

	return json({
		...record,
		items: enrichItems(record.manifest),
		itemCount: record.manifest.contentGroups?.reduce(
			(n, g) => n + (Array.isArray(g.entries) ? g.entries.length : 0),
			0
		) ?? 0,
		screenshots: db.select().from(screenshots).where(eq(screenshots.buildId, params.id)).all()
	});
};
