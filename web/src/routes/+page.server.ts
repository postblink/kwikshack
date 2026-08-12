import { buildSummary, getFeaturedBuild, listBuilds, type BuildSort } from '$lib/server/builds';
import { getDecorItems } from '$lib/server/decor';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const q = url.searchParams.get('q') ?? '';
	const type = url.searchParams.get('type') ?? '';
	const faction = url.searchParams.get('faction') ?? '';
	const requestedSort = url.searchParams.get('sort');
	const sort: BuildSort = requestedSort === 'most_items' ? 'most_items' : 'newest';
	const itemIDs = [
		...new Set(
			(url.searchParams.get('items') ?? '')
				.split(',')
				.map(Number)
				.filter((itemID) => Number.isSafeInteger(itemID) && itemID > 0)
		)
	];
	const builds = listBuilds({
		limit: 24,
		type: type || undefined,
		faction: faction || undefined,
		q: q || undefined,
		itemIDs,
		sort
	}).map((b) => ({ ...b, summary: buildSummary(b.manifest) }));
	const selectedByID = new Map(getDecorItems(itemIDs).map((item) => [item.itemID, item]));
	const selectedItems = itemIDs.flatMap((itemID) => {
		const item = selectedByID.get(itemID);
		return item ? [item] : [];
	});
	const featured = getFeaturedBuild();
	const featuredBuild = featured ? { ...featured, summary: buildSummary(featured.manifest) } : null;

	return {
		builds,
		featuredBuild,
		selectedItems,
		filters: { q, type, faction, sort }
	};
};
