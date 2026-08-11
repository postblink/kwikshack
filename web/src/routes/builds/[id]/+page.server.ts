import { getBuild, enrichItems } from '$lib/server/builds';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const record = getBuild(params.id);
	if (!record) error(404, 'Build not found');
	return { build: record, items: enrichItems(record.manifest) };
};
