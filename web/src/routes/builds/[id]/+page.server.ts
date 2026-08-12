import { getBuild, enrichItems } from '$lib/server/builds';
import { db } from '$lib/server/db';
import { screenshots } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const record = getBuild(params.id);
	if (!record) error(404, 'Build not found');
	const ss = db.select().from(screenshots).where(eq(screenshots.buildId, params.id)).all();
	return { build: record, items: enrichItems(record.manifest), screenshots: ss };
};
