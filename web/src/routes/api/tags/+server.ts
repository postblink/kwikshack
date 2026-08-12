import { json } from '@sveltejs/kit';
import { listTags } from '$lib/server/builds';
import type { RequestHandler } from './$types';

// GET /api/tags — distinct style/facet tags with usage counts across builds.
export const GET: RequestHandler = async () => {
	return json({ tags: listTags() });
};
