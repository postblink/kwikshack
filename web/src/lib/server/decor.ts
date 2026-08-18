import { db } from './db';
import { canonicalDecor, decorIdentifierMap, decorItems } from './db/schema';
import { and, asc, eq, inArray, like, or } from 'drizzle-orm';

export interface DecorSearchResult {
	itemID: number;
	recordID: number | null;
	name: string;
	icon: string | null;
	category: string | null;
	/** True when the name/category came from Blizzard's Housing Decor API. */
	canonical?: boolean;
}

const decorSelection = {
	itemID: decorItems.itemID,
	recordID: decorItems.recordID,
	name: decorItems.name,
	icon: decorItems.icon,
	category: decorItems.category
};

/**
 * Overlay canonical Blizzard names/categories onto legacy catalog rows.
 *
 * Filtering still runs against `decor_items`, which is deliberate for this pass:
 * `itemID` is the identifier the build filter already speaks, and changing the
 * filter's identifier space is a bigger change than swapping display text.
 * Canonical data corrects what a player reads; it does not yet change what the
 * filter matches on.
 *
 * Any failure here degrades to the legacy row rather than losing the result.
 */
function withCanonicalNames(rows: DecorSearchResult[], region = 'us', locale = 'en_US'): DecorSearchResult[] {
	if (rows.length === 0) return rows;
	try {
		const itemIDs = rows.map((row) => row.itemID);
		const links = db
			.select()
			.from(decorIdentifierMap)
			.where(
				and(
					eq(decorIdentifierMap.region, region),
					eq(decorIdentifierMap.observedKind, 'item'),
					inArray(decorIdentifierMap.observedId, itemIDs)
				)
			)
			.all();
		if (links.length === 0) return rows;

		const canonicalRows = db
			.select()
			.from(canonicalDecor)
			.where(
				and(
					eq(canonicalDecor.region, region),
					eq(canonicalDecor.locale, locale),
					inArray(canonicalDecor.decorId, [...new Set(links.map((link) => link.decorId))])
				)
			)
			.all();
		const byDecorId = new Map(canonicalRows.map((row) => [row.decorId, row]));
		const byItemID = new Map(
			links.flatMap((link) => {
				const canonical = byDecorId.get(link.decorId);
				return canonical ? [[link.observedId, canonical] as const] : [];
			})
		);

		return rows.map((row) => {
			const canonical = byItemID.get(row.itemID);
			return canonical
				? { ...row, name: canonical.name, category: canonical.category ?? row.category, canonical: true }
				: row;
		});
	} catch {
		return rows;
	}
}

export function searchDecorItems(query: string, limit = 10): DecorSearchResult[] {
	const q = query.trim();
	if (!q) return [];

	const capped = Math.min(Math.max(limit, 1), 50);

	const legacyMatches = db
		.select(decorSelection)
		.from(decorItems)
		.where(or(like(decorItems.name, `%${q}%`), like(decorItems.category, `%${q}%`)))
		.orderBy(asc(decorItems.name))
		.limit(capped)
		.all();

	// A player searching an official decor name should find it even when the
	// legacy catalog stored a different label for the same thing.
	const canonicalMatches = canonicalNameMatches(q, capped);

	const seen = new Set(legacyMatches.map((row) => row.itemID));
	const merged = [
		...withCanonicalNames(legacyMatches),
		...canonicalMatches.filter((row) => !seen.has(row.itemID))
	];

	return merged.sort((a, b) => a.name.localeCompare(b.name)).slice(0, capped);
}

/**
 * Search canonical names directly, resolving back to the itemID the rest of the
 * site filters on. Only links that resolve to a real legacy row are returned, so
 * a canonical hit always produces a usable filter value.
 */
function canonicalNameMatches(query: string, limit: number, region = 'us', locale = 'en_US'): DecorSearchResult[] {
	try {
		const rows = db
			.select()
			.from(canonicalDecor)
			.where(and(eq(canonicalDecor.region, region), eq(canonicalDecor.locale, locale), like(canonicalDecor.name, `%${query}%`)))
			.orderBy(asc(canonicalDecor.name))
			.limit(limit)
			.all();
		if (rows.length === 0) return [];

		const links = db
			.select()
			.from(decorIdentifierMap)
			.where(
				and(
					eq(decorIdentifierMap.region, region),
					eq(decorIdentifierMap.observedKind, 'item'),
					inArray(decorIdentifierMap.decorId, rows.map((row) => row.decorId))
				)
			)
			.all();
		if (links.length === 0) return [];

		const itemIDs = [...new Set(links.map((link) => link.observedId))];
		const legacyRows = new Map(
			db.select(decorSelection).from(decorItems).where(inArray(decorItems.itemID, itemIDs)).all().map((row) => [row.itemID, row])
		);
		const byDecorId = new Map(rows.map((row) => [row.decorId, row]));

		return links.flatMap((link) => {
			const legacy = legacyRows.get(link.observedId);
			const canonical = byDecorId.get(link.decorId);
			if (!legacy || !canonical) return [];
			return [{ ...legacy, name: canonical.name, category: canonical.category ?? legacy.category, canonical: true }];
		});
	} catch {
		return [];
	}
}

export function getDecorItems(itemIDs: number[]): DecorSearchResult[] {
	if (itemIDs.length === 0) return [];
	return withCanonicalNames(
		db.select(decorSelection).from(decorItems).where(inArray(decorItems.itemID, itemIDs)).all()
	);
}
