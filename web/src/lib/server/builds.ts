import { db } from './db';
import { builds, decorItems, screenshots, users } from './db/schema';
import { asc, eq, inArray, like, and, isNull } from 'drizzle-orm';
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
	lastVerifiedAt: Date | null;
	createdAt: Date;
}

export interface FeaturedBuildRecord extends BuildRecord {
	primaryScreenshot: string | null;
}

export type BuildSort = 'newest' | 'most_items';

/** Create-or-get a user by display name (v0: no auth, name is a label). */
function ensureUser(name: string): string | null {
	if (!name) return null;
	const existing = db.select({ id: users.id }).from(users).where(eq(users.name, name)).get();
	if (existing) return existing.id;
	const id = crypto.randomUUID();
	db.insert(users).values({ id, name }).run();
	return id;
}

/**
 * Self-learning recordID→itemID map. The static catalog only knows recordIDs
 * for crafted items; manifests resolved by the addon carry BOTH recordID and
 * itemID. Learn from each submission so recordID-only builds (like the probe
 * builds) can resolve icons/names on later lookups.
 */
export function ingestRecordPairs(manifest: BuildManifest): void {
	for (const group of manifest.contentGroups ?? []) {
		const ct = group.contentType ?? group.groupType;
		if (ct !== 3) continue; // decor only
		for (const entry of group.entries ?? []) {
			const recordID = typeof entry.recordID === 'number' ? entry.recordID : null;
			const itemID = typeof entry.itemID === 'number' ? entry.itemID : null;
			if (recordID === null || itemID === null) continue;
			// Backfill record_id on an existing catalog row (if not yet known)
			db.update(decorItems)
				.set({ recordID })
				.where(and(eq(decorItems.itemID, itemID), isNull(decorItems.recordID)))
				.run();
			// Insert a stub row for items the catalog hasn't seen (name + recordID)
			db.insert(decorItems)
				.values({
					itemID,
					recordID,
					name: typeof entry.name === 'string' ? entry.name : `Item ${itemID}`
				})
				.onConflictDoNothing()
				.run();
		}
	}
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
	screenshotUrls?: string[];
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
			placementData: input.placementData ?? null,
			lastVerifiedAt: new Date()
		})
		.onConflictDoUpdate({
			target: builds.shareCode,
			set: {
				codeStatus: 'unverified',
				blueprintType: input.blueprintType,
				faction: input.faction,
				title: input.title,
				description: input.description ?? '',
				authorId,
				manifest: input.manifest,
				placementData: input.placementData ?? null,
				lastVerifiedAt: new Date(),
				updatedAt: new Date()
			}
		})
		.run();
	// Learn recordID↔itemID pairs from this manifest (self-healing catalog map)
	ingestRecordPairs(input.manifest);
	// Resolve the persisted row — new id on insert, existing id on conflict.
	const record = getBuildByCode(input.shareCode)!;
	// Replace screenshots when the submission carries any (idempotent on re-submit).
	if (input.screenshotUrls?.length) {
		db.delete(screenshots).where(eq(screenshots.buildId, record.id)).run();
		for (let i = 0; i < input.screenshotUrls.length; i++) {
			db.insert(screenshots)
				.values({
					id: crypto.randomUUID(),
					buildId: record.id,
					url: input.screenshotUrls[i],
					caption: '',
					isPrimary: i === 0,
					sortOrder: i
				})
				.run();
		}
	}
	return record;
}

export function listBuilds(
	opts: {
		limit?: number;
		offset?: number;
		type?: string;
		faction?: string;
		q?: string;
		itemIDs?: number[];
		sort?: BuildSort;
	} = {}
): BuildRecord[] {
	const { limit = 24, offset = 0, type, faction, q, itemIDs, sort = 'newest' } = opts;
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
		.all();

	let records = rows.map((r) => toBuildRecord(r.build, r.author));
	if (itemIDs?.length) {
		const wanted = new Set(itemIDs);
		records = records.filter((record) => manifestItemIDs(record.manifest).some((itemID) => wanted.has(itemID)));
	}

	records.sort((a, b) => {
		if (sort === 'most_items') {
			const countDifference = distinctDecorItemCount(b.manifest) - distinctDecorItemCount(a.manifest);
			if (countDifference !== 0) return countDifference;
		}
		return b.createdAt.getTime() - a.createdAt.getTime();
	});

	const start = Math.max(0, offset);
	return records.slice(start, start + Math.max(0, limit));
}

export function getFeaturedBuild(): FeaturedBuildRecord | null {
	const rows = db
		.select({ build: builds, author: users.name })
		.from(builds)
		.leftJoin(users, eq(builds.authorId, users.id))
		.all();
	if (rows.length === 0) return null;

	const chosen = rows[Math.floor(Math.random() * rows.length)];
	const primaryScreenshot = db
		.select({ url: screenshots.url })
		.from(screenshots)
		.where(and(eq(screenshots.buildId, chosen.build.id), eq(screenshots.isPrimary, true)))
		.orderBy(asc(screenshots.sortOrder))
		.get();

	return {
		...toBuildRecord(chosen.build, chosen.author),
		primaryScreenshot: primaryScreenshot?.url ?? null
	};
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
		lastVerifiedAt: b.lastVerifiedAt,
		createdAt: b.createdAt
	};
}

/** Count decor items and structural entries (rooms/house/fixtures) in a manifest. */
export function buildSummary(manifest: BuildManifest): { decorCount: number; roomCount: number } {
	let decorCount = 0;
	let roomCount = 0;
	for (const group of manifest.contentGroups ?? []) {
		const ct = group.contentType ?? group.groupType;
		const n = group.entries?.length ?? 0;
		if (ct === 3) decorCount += n;
		else if (ct === 2) roomCount += n;
	}
	return { decorCount, roomCount };
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

/** Count distinct decor entries, preferring stable catalog identifiers. */
export function distinctDecorItemCount(manifest: BuildManifest): number {
	const seen = new Set<string>();
	let anonymousIndex = 0;
	for (const group of manifest.contentGroups ?? []) {
		const contentType = group.contentType ?? group.groupType;
		if (contentType !== 3) continue;
		for (const entry of group.entries ?? []) {
			if (typeof entry.itemID === 'number') seen.add(`item:${entry.itemID}`);
			else if (typeof entry.recordID === 'number') seen.add(`record:${entry.recordID}`);
			else if (typeof entry.name === 'string' && entry.name) seen.add(`name:${entry.name}`);
			else seen.add(`anonymous:${anonymousIndex++}`);
		}
	}
	return seen.size;
}

export interface TagCount {
	tag: string;
	count: number;
}

/**
 * Derive style/facet tags for a build: the union of catalog `tags` across the
 * build's decor items, deduped and ordered by frequency (ties broken
 * alphabetically). Capped at `maxTags` so an item-heavy build doesn't carry a
 * wall of noise — the top-N tags by frequency win.
 */
export function buildTags(manifest: BuildManifest, maxTags = 30): string[] {
	const itemIDs = new Set<number>();
	const recordIDs = new Set<number>();
	for (const group of manifest.contentGroups ?? []) {
		const contentType = group.contentType ?? group.groupType;
		if (contentType !== 3) continue;
		for (const entry of group.entries ?? []) {
			if (typeof entry.itemID === 'number') itemIDs.add(entry.itemID);
			else if (typeof entry.recordID === 'number') recordIDs.add(entry.recordID);
		}
	}

	const rows = [
		...(itemIDs.size
			? db.select().from(decorItems).where(inArray(decorItems.itemID, [...itemIDs])).all()
			: []),
		...(recordIDs.size
			? db.select().from(decorItems).where(inArray(decorItems.recordID, [...recordIDs])).all()
			: [])
	];

	const freq = new Map<string, number>();
	for (const row of rows) {
		for (const tag of row.tags ?? []) freq.set(tag, (freq.get(tag) ?? 0) + 1);
	}
	return [...freq.entries()]
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.slice(0, maxTags)
		.map(([tag]) => tag);
}

/**
 * Distinct tags with usage counts across all stored builds (for GET /api/tags).
 * A tag's count is the number of builds whose decor items carry it.
 */
export function listTags(): TagCount[] {
	const manifestRows = db.select({ manifest: builds.manifest }).from(builds).all();
	const counts = new Map<string, number>();
	for (const row of manifestRows) {
		for (const tag of buildTags(row.manifest as unknown as BuildManifest)) {
			counts.set(tag, (counts.get(tag) ?? 0) + 1);
		}
	}
	return [...counts.entries()]
		.map(([tag, count]) => ({ tag, count }))
		.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
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
		recordID: number | null;
	}
	const acc = new Map<string, Acc>();

	for (const group of manifest.contentGroups ?? []) {
		// Only decor groups (contentType/groupType 3) belong in the item grid.
		// House type (1), rooms (2), exterior fixtures (5) are structural and
		// shown separately (or omitted in v0).
		const isDecor = group.groupType === 3 || group.contentType === 3;
		if (!isDecor) continue;
		for (const entry of group.entries ?? []) {
			const itemID = typeof entry.itemID === 'number' ? entry.itemID : null;
			const recordID = typeof entry.recordID === 'number' ? entry.recordID : null;
			const id = itemID ?? recordID;
			if (id === null) continue;
			const key = itemID !== null ? `item:${itemID}` : `record:${recordID}`;
			// Count: live payload uses `total`; legacy uses `count`; default 1
			const n = typeof entry.total === 'number' ? entry.total : typeof entry.count === 'number' ? entry.count : 1;
			const cur = acc.get(key) ?? {
				name: typeof entry.name === 'string' ? entry.name : '',
				icon: null,
				count: 0,
				itemID,
				recordID
			};
			cur.count += n;
			if (!cur.name && typeof entry.name === 'string') cur.name = entry.name;
			acc.set(key, cur);
		}
	}

	// Catalog lookups for both compact itemID entries and live recordID entries.
	const ids = [...acc.values()].flatMap((a) => (a.itemID !== null ? [a.itemID] : []));
	const recordIDs = [...acc.values()].flatMap((a) => (a.itemID === null && a.recordID !== null ? [a.recordID] : []));
	const itemRows = ids.length ? db.select().from(decorItems).where(inArray(decorItems.itemID, ids)).all() : [];
	const recordRows = recordIDs.length ? db.select().from(decorItems).where(inArray(decorItems.recordID, recordIDs)).all() : [];
	const byItemID = new Map(itemRows.map((r) => [r.itemID, r]));
	const byRecordID = new Map(recordRows.flatMap((r) => (r.recordID === null ? [] : [[r.recordID, r] as const])));

	return [...acc.values()].map((a) => {
		const cat = a.itemID !== null ? byItemID.get(a.itemID) : a.recordID !== null ? byRecordID.get(a.recordID) : undefined;
		const key = a.itemID ?? a.recordID!;
		return {
			key,
			itemID: cat?.itemID ?? a.itemID,
			recordID: a.recordID,
			name: cat?.name ?? a.name ?? (a.itemID !== null ? `Item ${a.itemID}` : `Decor ${key}`),
			icon: cat?.icon ?? null,
			count: a.count
		};
	});
}
