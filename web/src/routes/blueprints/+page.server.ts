import { countIndexedBlueprints, listIndexedBlueprints } from '$lib/server/blueprint-index';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const requested = Number(url.searchParams.get('offset') ?? '0');
	const offset = Number.isFinite(requested) ? Math.max(Math.trunc(requested), 0) : 0;
	const limit = 24;
	return {
		blueprints: listIndexedBlueprints({ limit, offset }),
		total: countIndexedBlueprints(),
		offset,
		limit
	};
};
