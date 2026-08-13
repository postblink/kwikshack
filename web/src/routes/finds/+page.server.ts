import { listCommunityFinds } from '$lib/server/community-finds';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({ finds: listCommunityFinds() });
