import { buildSummary, getFeaturedBuild, listBuilds, type BuildSort } from '$lib/server/builds';
import { getDecorItems } from '$lib/server/decor';
import type { PageServerLoad } from './$types';

interface TagSummary {
	name: string;
	count: number;
}

async function getAvailableTags(fetch: typeof globalThis.fetch): Promise<TagSummary[]> {
	try {
		const response = await fetch('/api/tags');
		if (!response.ok) return [];
		const payload = (await response.json()) as unknown;
		const candidate = Array.isArray(payload)
			? payload
			: payload && typeof payload === 'object' && Array.isArray((payload as { tags?: unknown }).tags)
				? (payload as { tags: unknown[] }).tags
				: [];
		return candidate.flatMap((entry) => {
			if (typeof entry === 'string' && entry.trim()) return [{ name: entry.trim(), count: 0 }];
			if (!entry || typeof entry !== 'object') return [];
			const name = (entry as { name?: unknown; tag?: unknown }).name ?? (entry as { tag?: unknown }).tag;
			const count = (entry as { count?: unknown }).count;
			return typeof name === 'string' && name.trim()
				? [{ name: name.trim(), count: typeof count === 'number' ? count : 0 }]
				: [];
		});
	} catch {
		return [];
	}
}

export const load: PageServerLoad = async ({ url, fetch }) => {
	const q = url.searchParams.get('q') ?? '';
	const type = url.searchParams.get('type') ?? '';
	const faction = url.searchParams.get('faction') ?? '';
	const author = url.searchParams.get('author') ?? '';
	const tag = url.searchParams.get('tag') ?? '';
	const availableTags = await getAvailableTags(fetch);
	const activeTag = availableTags.some((entry) => entry.name === tag) ? tag : '';
	const requestedSort = url.searchParams.get('sort');
	const sort: BuildSort = requestedSort === 'most_items' || requestedSort === 'most_liked' ? requestedSort : 'newest';
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
		author: author || undefined,
		tag: activeTag || undefined,
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
		availableTags,
		filters: { q, type, faction, author, tag: activeTag, sort }
	};
};
