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
	itemID: number;
	name: string;
	icon: string | null;
	count: number;
}

/** Enrich manifest item IDs with catalog metadata (icons, names). */
export function enrichItems(manifest: BuildManifest): EnrichedItem[] {
	const ids = manifestItemIDs(manifest);
	if (ids.length === 0) return [];
	const rows = db.select().from(decorItems).where(inArray(decorItems.itemID, ids)).all();
	const byID = new Map(rows.map((r) => [r.itemID, r]));

	// Aggregate counts from manifest, fall back to catalog metadata.
	// Only decor groups (3) carry placement counts; dye groups (4) reference
	// the same itemIDs without a count and must not inflate the total.
	const counts = new Map<number, number>();
	for (const group of manifest.contentGroups ?? []) {
		for (const entry of group.entries ?? []) {
			if (typeof entry.itemID !== 'number') continue;
			if (group.groupType === 3 && typeof entry.count === 'number') {
				counts.set(entry.itemID, (counts.get(entry.itemID) ?? 0) + entry.count);
			}
		}
	}

	return ids.map((itemID) => {
		const cat = byID.get(itemID);
		return {
			itemID,
			name: cat?.name ?? `Item ${itemID}`,
			icon: cat?.icon ?? null,
			count: counts.get(itemID) ?? 0
		};
	});
}
