import { and, eq, inArray } from 'drizzle-orm';
import { db } from './db';
import { canonicalDecor, decorIdentifierMap, decorItems, decorSyncState } from './db/schema';
import { DECOR_MAP_CONFIDENCE } from './decor-sync.js';

/**
 * Canonical decor identity — the READ side.
 *
 * Blizzard's Housing Decor Game Data API is the authoritative source of decor
 * identity. Parsing, persistence, and the identifier-mapping rules live in
 * `decor-sync.js` (plain JS) so the sync CLI and the application share one
 * implementation. This module only reads.
 *
 * Endpoints (verified on the Developer Portal 2026-08-17):
 *   GET /data/wow/decor/index      ?namespace=static-{region}&locale=
 *   GET /data/wow/decor/{decorId}  ?namespace=static-{region}&locale=
 *   GET /data/wow/search/decor     ?namespace=static-{region}&name.en_US=&_page=&_pageSize=
 *
 * Three tiers of decor knowledge, and which wins:
 *
 *   1. Canonical    Blizzard's API. Wins whenever present.
 *   2. Legacy       `decor_items` — KwikShack's own catalog from the MIT-licensed
 *                   Housing Decor Guide files plus Wowhead enrichment. The
 *                   fallback. Not Blizzard API data, so not retention-bound.
 *   3. Observed     What a manifest says. Renders a build; never catalog truth.
 *
 * A missing canonical row is normal — it means fall back, never that decor
 * should disappear from a build.
 */

export { DECOR_MAP_CONFIDENCE } from './decor-sync.js';
export { parseDecorDetail, parseDecorIndex, readLocalizedName } from './decor-sync.js';

export const DECOR_INDEX_PATH = '/data/wow/decor/index';
export const DECOR_DETAIL_PATH = '/data/wow/decor';

export interface CanonicalLookup {
	decorId: number;
	name: string;
	category: string | null;
	source: string | null;
	itemId: number | null;
	mediaUrl: string | null;
}

export interface CanonicalMaps {
	byItemID: Map<number, CanonicalLookup>;
	byRecordID: Map<number, CanonicalLookup>;
}

const EMPTY_MAPS: CanonicalMaps = { byItemID: new Map(), byRecordID: new Map() };

/**
 * Resolve observed manifest identifiers to canonical decor.
 *
 * Returns only what is genuinely known. Anything not returned falls back to the
 * legacy catalog. Wrapped so a canonical-lookup failure can never take a build
 * page down with it: the fallback path is always available.
 */
export function lookupCanonical(
	identifiers: { itemIDs?: number[]; recordIDs?: number[] },
	region = 'us',
	locale = 'en_US'
): CanonicalMaps {
	const itemIDs = [...new Set(identifiers.itemIDs ?? [])];
	const recordIDs = [...new Set(identifiers.recordIDs ?? [])];
	if (itemIDs.length === 0 && recordIDs.length === 0) return EMPTY_MAPS;

	try {
		const links = [
			...(itemIDs.length
				? db
						.select()
						.from(decorIdentifierMap)
						.where(
							and(
								eq(decorIdentifierMap.region, region),
								eq(decorIdentifierMap.observedKind, 'item'),
								inArray(decorIdentifierMap.observedId, itemIDs)
							)
						)
						.all()
				: []),
			...(recordIDs.length
				? db
						.select()
						.from(decorIdentifierMap)
						.where(
							and(
								eq(decorIdentifierMap.region, region),
								eq(decorIdentifierMap.observedKind, 'record'),
								inArray(decorIdentifierMap.observedId, recordIDs)
							)
						)
						.all()
				: [])
		];
		if (links.length === 0) return EMPTY_MAPS;

		const decorIds = [...new Set(links.map((link) => link.decorId))];
		const rows = db
			.select()
			.from(canonicalDecor)
			.where(
				and(
					eq(canonicalDecor.region, region),
					eq(canonicalDecor.locale, locale),
					inArray(canonicalDecor.decorId, decorIds)
				)
			)
			.all();

		const byDecorId = new Map<number, CanonicalLookup>(
			rows.map((row) => [
				row.decorId,
				{
					decorId: row.decorId,
					name: row.name,
					category: row.category,
					source: row.source,
					itemId: row.itemId,
					mediaUrl: row.mediaUrl
				}
			])
		);

		const byItemID = new Map<number, CanonicalLookup>();
		const byRecordID = new Map<number, CanonicalLookup>();
		for (const link of links) {
			const canonical = byDecorId.get(link.decorId);
			// A link whose canonical row was deleted by the retention job resolves to
			// nothing — the same graceful fallback as never having synced at all.
			if (!canonical) continue;
			if (link.observedKind === 'item') byItemID.set(link.observedId, canonical);
			else byRecordID.set(link.observedId, canonical);
		}
		return { byItemID, byRecordID };
	} catch {
		// Canonical data is an enhancement. If reading it fails for any reason,
		// builds must still render from the legacy catalog.
		return EMPTY_MAPS;
	}
}

export function getSyncState(region = 'us', locale = 'en_US') {
	return db
		.select()
		.from(decorSyncState)
		.where(eq(decorSyncState.id, `decor:${region}:${locale}`))
		.get();
}

/** Coverage summary for the operator surface. */
export function canonicalCoverage(region = 'us', locale = 'en_US') {
	const canonicalRows = db
		.select({ decorId: canonicalDecor.decorId, syncedAt: canonicalDecor.syncedAt })
		.from(canonicalDecor)
		.where(and(eq(canonicalDecor.region, region), eq(canonicalDecor.locale, locale)))
		.all();
	const links = db
		.select({ confidence: decorIdentifierMap.confidence })
		.from(decorIdentifierMap)
		.where(eq(decorIdentifierMap.region, region))
		.all();

	return {
		canonicalRecords: canonicalRows.length,
		mappedIdentifiers: links.length,
		strongLinks: links.filter((link) => link.confidence >= DECOR_MAP_CONFIDENCE.blizzardDecorId).length,
		weakLinks: links.filter((link) => link.confidence < DECOR_MAP_CONFIDENCE.blizzardDecorId).length,
		legacyCatalogRecords: db.select({ itemID: decorItems.itemID }).from(decorItems).all().length,
		oldestSyncedAt: canonicalRows.reduce<Date | null>(
			(oldest, row) => (oldest === null || row.syncedAt < oldest ? row.syncedAt : oldest),
			null
		),
		syncState: getSyncState(region, locale) ?? null
	};
}
