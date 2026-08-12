import { db } from './db';
import { builds, decorItems, users } from './db/schema';
import { eq, inArray, like, and } from 'drizzle-orm';
import type { BuildManifest, PlacementData } from '$lib/types/manifest';

export interface BuildRecord {
	id: string;
	shareCode: string;
	codeStatus: string;
	blueprintType: string;
	faction: string | null;
	title: string;
	description: string | null;
	authorName: string | null;
	manifest: BuildManifest;
	placementData: PlacementData | null;
	createdAt: Date;
}

/** Create-or-get a user by display name (v0: no auth, name is a label). */
function ensureUser(name: string): string | null {
	if (!name) return null;
	const existing = db.select({ id: users.id }).from(users).where(eq(users.name, name)).get();
	if (existing) return existing.id;
	const id = crypto.randomUUID();
	db.insert(users).values({ id, name }).run();
	return id;
}

export function createBuild(input: {
	shareCode: string;
	title: string;
	description?: string;
	blueprintType: string;
	faction: string | null;
	authorName?: string;
	manifest: BuildManifest;
	placementData?: PlacementData | null;
}): BuildRecord {
	const id = crypto.randomUUID();
	const authorId = input.authorName ? ensureUser(input.authorName) : null;
	db.insert(builds)
		.values({
			id,
			shareCode: input.shareCode,
			codeStatus: 'unverified',
			blueprintType: input.blueprintType,
			faction: input.faction,
			title: input.title,
			description: input.description ?? '',
			authorId,
			manifest: input.manifest,
			placementData: input.placementData ?? null
		})
		.run();
	return getBuild(id)!;
}

export function listBuilds(opts: { limit?: number; offset?: number; type?: string; faction?: string; q?: string } = {}): BuildRecord[] {
	const { limit = 24, offset = 0, type, faction, q } = opts;
	const where = [];
	if (type) where.push(eq(builds.blueprintType, type));
	if (faction) where.push(eq(builds.faction, faction));
	if (q) where.push(like(builds.title, `%${q}%`));

	const rows = db
		.select({
			build: builds,
			author: users.name
		})
		.from(builds)
		.leftJoin(users, eq(builds.authorId, users.id))
		.where(where.length ? and(...where) : undefined)
		.orderBy(builds.createdAt)
		.limit(limit)
		.offset(offset)
		.all();

	return rows.map((r) => toBuildRecord(r.build, r.author));
}

export function getBuild(id: string): BuildRecord | null {
	const row = db
		.select({ build: builds, author: users.name })
		.from(builds)
		.leftJoin(users, eq(builds.authorId, users.id))
		.where(eq(builds.id, id))
		.get();
	return row ? toBuildRecord(row.build, row.author) : null;
}

export function getBuildByCode(shareCode: string): BuildRecord | null {
	const row = db
		.select({ build: builds, author: users.name })
		.from(builds)
		.leftJoin(users, eq(builds.authorId, users.id))
		.where(eq(builds.shareCode, shareCode))
		.get();
	return row ? toBuildRecord(row.build, row.author) : null;
}

function toBuildRecord(b: typeof builds.$inferSelect, authorName: string | null): BuildRecord {
	return {
		id: b.id,
		shareCode: b.shareCode,
		codeStatus: b.codeStatus,
		blueprintType: b.blueprintType,
		faction: b.faction,
		title: b.title,
		description: b.description,
		authorName,
		manifest: b.manifest as unknown as BuildManifest,
		placementData: b.placementData as unknown as PlacementData | null,
		createdAt: b.createdAt
	};
}

/** Collect every distinct decor itemID used in a manifest's content groups. */
export function manifestItemIDs(manifest: BuildManifest): number[] {
	const seen = new Set<number>();
	for (const group of manifest.contentGroups ?? []) {
		for (const entry of group.entries ?? []) {
			if (typeof entry.itemID === 'number') seen.add(entry.itemID);
		}
	}
	return [...seen];
}

export interface EnrichedItem {
	// recordID (decor catalog ID) or itemID — whichever the payload carried
	key: number;
	itemID: number | null;
	recordID: number | null;
	name: string;
	icon: string | null;
	count: number;
}

/**
 * Enrich manifest entries with catalog metadata (icons, names).
 * Works with the live payload shape (recordID + name + total) and falls back
 * to itemID-based catalog lookup when the addon enriched the manifest.
 */
export function enrichItems(manifest: BuildManifest): EnrichedItem[] {
	interface Acc {
		name: string;
		icon: string | null;
		count: number;
		itemID: number | null;
	}
	const acc = new Map<number, Acc>();

	for (const group of manifest.contentGroups ?? []) {
		for (const entry of group.entries ?? []) {
			const id = typeof entry.itemID === 'number' ? entry.itemID : typeof entry.recordID === 'number' ? entry.recordID : null;
			if (id === null) continue;
			// Count: live payload uses `total`; legacy uses `count`; default 1
			const n = typeof entry.total === 'number' ? entry.total : typeof entry.count === 'number' ? entry.count : 1;
			const cur = acc.get(id) ?? { name: typeof entry.name === 'string' ? entry.name : '', icon: null, count: 0, itemID: typeof entry.itemID === 'number' ? entry.itemID : null };
			cur.count += n;
			if (!cur.name && typeof entry.name === 'string') cur.name = entry.name;
			acc.set(id, cur);
		}
	}

	// Catalog lookup for itemID-keyed entries (icons + canonical names)
	const ids = [...acc.values()].flatMap((a) => (a.itemID !== null ? [a.itemID] : []));
	const rows = ids.length ? db.select().from(decorItems).where(inArray(decorItems.itemID, ids)).all() : [];
	const byID = new Map(rows.map((r) => [r.itemID, r]));

	return [...acc.entries()].map(([key, a]) => {
		const cat = a.itemID !== null ? byID.get(a.itemID) : undefined;
		return {
			key,
			itemID: a.itemID,
			recordID: a.itemID === null ? key : null,
			name: cat?.name ?? a.name ?? (a.itemID !== null ? `Item ${a.itemID}` : `Decor ${key}`),
			icon: cat?.icon ?? null,
			count: a.count
		};
	});
}
