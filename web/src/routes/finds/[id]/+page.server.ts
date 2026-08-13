import { getCommunityFind } from '$lib/server/community-finds';
import { getBuild } from '$lib/server/builds';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
	const find = getCommunityFind(params.id);
	if (!find) error(404, 'Community Find not found');
	const linkedBuild = find.nativeBuildId ? getBuild(find.nativeBuildId) : null;
	return {
		find,
		linkedBuild: linkedBuild ? { id: linkedBuild.id, title: linkedBuild.title } : null
	};
};
