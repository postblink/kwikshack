import { listBuilds } from '$lib/server/builds';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const builds = listBuilds({
		limit: 24,
		type: url.searchParams.get('type') ?? undefined,
		faction: url.searchParams.get('faction') ?? undefined,
		q: url.searchParams.get('q') ?? undefined
	});
	return { builds };
};
