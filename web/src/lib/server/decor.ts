import { db } from './db';
import { decorItems } from './db/schema';
import { asc, inArray, like, or } from 'drizzle-orm';

export interface DecorSearchResult {
	itemID: number;
	recordID: number | null;
	name: string;
	icon: string | null;
	category: string | null;
}

const decorSelection = {
	itemID: decorItems.itemID,
	recordID: decorItems.recordID,
	name: decorItems.name,
	icon: decorItems.icon,
	category: decorItems.category
};

export function searchDecorItems(query: string, limit = 10): DecorSearchResult[] {
	const q = query.trim();
	if (!q) return [];

	return db
		.select(decorSelection)
		.from(decorItems)
		.where(or(like(decorItems.name, `%${q}%`), like(decorItems.category, `%${q}%`)))
		.orderBy(asc(decorItems.name))
		.limit(Math.min(Math.max(limit, 1), 50))
		.all();
}

export function getDecorItems(itemIDs: number[]): DecorSearchResult[] {
	if (itemIDs.length === 0) return [];
	return db.select(decorSelection).from(decorItems).where(inArray(decorItems.itemID, itemIDs)).all();
}
