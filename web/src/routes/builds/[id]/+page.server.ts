import { getBuild, enrichItems } from '$lib/server/builds';
import { db } from '$lib/server/db';
import { screenshots } from '$lib/server/db/schema';
import { asc, desc, eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

async function tagApiAvailable(fetch: typeof globalThis.fetch): Promise<boolean> {
	try {
		const response = await fetch('/api/tags');
		if (!response.ok) return false;
		const payload = (await response.json()) as unknown;
		return Array.isArray(payload)
			? payload.length > 0
			: Boolean(payload && typeof payload === 'object' && Array.isArray((payload as { tags?: unknown }).tags) && (payload as { tags: unknown[] }).tags.length);
	} catch {
		return false;
	}
}

export const load: PageServerLoad = async ({ params, fetch }) => {
	const record = getBuild(params.id);
	if (!record) error(404, 'Build not found');
	const ss = db
		.select()
		.from(screenshots)
		.where(eq(screenshots.buildId, params.id))
		.orderBy(desc(screenshots.isPrimary), asc(screenshots.sortOrder))
		.all();
	return { build: record, items: enrichItems(record.manifest), screenshots: ss, tagsAvailable: await tagApiAvailable(fetch) };
};
