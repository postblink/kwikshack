import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import type { BuildManifest } from '$lib/types/manifest';

const testDatabase = vi.hoisted(() => ({
	path: `/tmp/kwikshack-vitest-decor-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.db`
}));

vi.mock('$app/environment', () => ({ building: true }));
vi.mock('$env/dynamic/private', () => ({ env: { DATABASE_URL: testDatabase.path } }));

import { db } from './db';
import { canonicalDecor, decorIdentifierMap, decorItems } from './db/schema';
import { migrateTestDatabase, removeTestDatabase } from './test-db';
import {
	DECOR_MAP_CONFIDENCE,
	parseDecorDetail,
	parseDecorIndex,
	readLocalizedName,
	upsertCanonicalDecor
} from './decor-sync.js';
import { canonicalCoverage, lookupCanonical } from './decor-canonical';
import { enrichItems } from './builds';
import { getDecorItems, searchDecorItems } from './decor';
import { attachResolvedManifest, indexBlueprint } from './blueprint-index';

/** Direct handle for the plain-JS write path, which takes better-sqlite3. */
let sqlite: Database.Database;

const NOW_SECONDS = Math.floor(Date.now() / 1000);

function seedLegacyCatalog() {
	db.delete(decorItems).run();
	db.insert(decorItems)
		.values([
			{ itemID: 700, recordID: 80, name: 'Sturdy Oak Chair', icon: '111', category: 'Seating', updatedAt: new Date() },
			{ itemID: 701, recordID: 5001, name: 'Mislabelled Sconce', icon: '222', category: 'Lighting', updatedAt: new Date() },
			{ itemID: 702, recordID: 6002, name: 'Only In Legacy', icon: '333', category: 'Rugs', updatedAt: new Date() }
		])
		.run();
}

beforeAll(() => {
	migrateTestDatabase(testDatabase.path);
	sqlite = new Database(testDatabase.path);
	sqlite.pragma('foreign_keys = ON');
});

afterAll(() => {
	sqlite.close();
	removeTestDatabase(testDatabase.path);
});

beforeEach(() => {
	db.delete(canonicalDecor).run();
	db.delete(decorIdentifierMap).run();
	seedLegacyCatalog();
});

// -----------------------------------------------------------------------------

describe('readLocalizedName', () => {
	it('accepts a plain string', () => {
		expect(readLocalizedName('Fireplace', 'en_US')).toBe('Fireplace');
	});

	it('accepts a locale map and prefers the requested locale', () => {
		expect(readLocalizedName({ en_US: 'Fireplace', de_DE: 'Kamin' }, 'de_DE')).toBe('Kamin');
	});

	it('falls back to en_US, then to any other locale', () => {
		expect(readLocalizedName({ en_US: 'Fireplace' }, 'fr_FR')).toBe('Fireplace');
		expect(readLocalizedName({ ko_KR: '벽난로' }, 'fr_FR')).toBe('벽난로');
	});

	it('ignores non-locale keys, so a sibling field is never read as the name', () => {
		// `{ type: "CRAFTED", name: {...} }` must not resolve to "CRAFTED".
		expect(readLocalizedName({ type: 'CRAFTED', id: 3 }, 'en_US')).toBeNull();
	});

	it('returns null for anything unusable', () => {
		expect(readLocalizedName(null, 'en_US')).toBeNull();
		expect(readLocalizedName('', 'en_US')).toBeNull();
		expect(readLocalizedName(42, 'en_US')).toBeNull();
	});
});

describe('parseDecorDetail', () => {
	it('reads the documented fields and keeps unmodelled scalars', () => {
		const parsed = parseDecorDetail(
			{
				id: 80,
				name: { en_US: 'Sturdy Oak Chair' },
				category: { id: 3, name: { en_US: 'Seating' } },
				source: { type: 'CRAFTED', name: { en_US: 'Carpentry' } },
				item: { id: 700, key: { href: 'https://…' } },
				media: { id: 4242, key: { href: 'https://render.example/decor/4242' } },
				is_account_wide: true,
				_links: { self: {} }
			},
			'en_US'
		);

		expect(parsed).toEqual({
			decorId: 80,
			name: 'Sturdy Oak Chair',
			category: 'Seating',
			source: 'Carpentry',
			itemId: 700,
			mediaId: 4242,
			mediaUrl: 'https://render.example/decor/4242',
			raw: { is_account_wide: true }
		});
	});

	it('survives a payload that carries only the essentials', () => {
		expect(parseDecorDetail({ id: 9, name: 'Bare Minimum' })).toMatchObject({
			decorId: 9,
			name: 'Bare Minimum',
			category: null,
			itemId: null
		});
	});

	it('rejects a payload with no id or no name rather than inventing one', () => {
		expect(parseDecorDetail({ name: 'No id' })).toBeNull();
		expect(parseDecorDetail({ id: 5 })).toBeNull();
		expect(parseDecorDetail(null)).toBeNull();
		expect(parseDecorDetail('not an object')).toBeNull();
	});
});

describe('parseDecorIndex', () => {
	it('reads an index document', () => {
		expect(parseDecorIndex({ decor: [{ id: 1, name: 'A' }, { id: 2, name: { en_US: 'B' } }] })).toEqual([
			{ id: 1, name: 'A' },
			{ id: 2, name: 'B' }
		]);
	});

	it('reads a search document, which wraps each entry in `data`', () => {
		expect(parseDecorIndex({ results: [{ data: { id: 7, name: { en_US: 'Wrapped' } } }] })).toEqual([
			{ id: 7, name: 'Wrapped' }
		]);
	});

	it('deduplicates and skips entries with no id', () => {
		expect(parseDecorIndex({ decor: [{ id: 1 }, { id: 1 }, { name: 'no id' }] })).toEqual([{ id: 1, name: null }]);
	});

	it('returns nothing for an unrecognised shape rather than guessing', () => {
		expect(parseDecorIndex({ somethingElse: [{ id: 1 }] })).toEqual([]);
		expect(parseDecorIndex(null)).toEqual([]);
	});
});

// -----------------------------------------------------------------------------

describe('identifier mapping evidence', () => {
	it("uses Blizzard's item reference as the strongest link", () => {
		upsertCanonicalDecor(
			sqlite,
			[
				{
					decorId: 80,
					name: 'Sturdy Oak Chair',
					category: 'Seating',
					source: null,
					itemId: 700,
					mediaId: null,
					mediaUrl: null,
					raw: {}
				}
			],
			{ region: 'us', locale: 'en_US', nowSeconds: NOW_SECONDS }
		);

		const link = db.select().from(decorIdentifierMap).all().find((row) => row.observedId === 700);
		expect(link).toMatchObject({
			observedKind: 'item',
			decorId: 80,
			evidence: 'blizzard_item_reference',
			confidence: DECOR_MAP_CONFIDENCE.blizzardItemReference
		});
	});

	it('treats a matching id AND name as decor-id evidence, but a name alone as weak', () => {
		upsertCanonicalDecor(
			sqlite,
			[
				// recordID 80 and decorId 80 agree, and so do the names.
				{ decorId: 80, name: 'Sturdy Oak Chair', category: null, source: null, itemId: null, mediaId: null, mediaUrl: null, raw: {} },
				// Name matches a legacy row whose recordID (5001) is a different number.
				{ decorId: 91, name: 'Mislabelled Sconce', category: null, source: null, itemId: null, mediaId: null, mediaUrl: null, raw: {} }
			],
			{ region: 'us', locale: 'en_US', nowSeconds: NOW_SECONDS }
		);

		const links = db.select().from(decorIdentifierMap).all();
		const strong = links.find((row) => row.observedKind === 'record' && row.observedId === 80);
		const weak = links.find((row) => row.observedKind === 'record' && row.observedId === 5001);

		expect(strong).toMatchObject({ evidence: 'blizzard_decor_id', confidence: DECOR_MAP_CONFIDENCE.blizzardDecorId });
		expect(weak).toMatchObject({ evidence: 'name_exact', confidence: DECOR_MAP_CONFIDENCE.nameExact });
	});

	it('never lets weaker evidence overwrite stronger evidence', () => {
		// Strong link first.
		upsertCanonicalDecor(
			sqlite,
			[{ decorId: 80, name: 'Sturdy Oak Chair', category: null, source: null, itemId: 700, mediaId: null, mediaUrl: null, raw: {} }],
			{ region: 'us', locale: 'en_US', nowSeconds: NOW_SECONDS }
		);
		// A different decor now claims the same itemID by name only.
		upsertCanonicalDecor(
			sqlite,
			[{ decorId: 999, name: 'Sturdy Oak Chair', category: null, source: null, itemId: null, mediaId: null, mediaUrl: null, raw: {} }],
			{ region: 'us', locale: 'en_US', nowSeconds: NOW_SECONDS }
		);

		const link = db.select().from(decorIdentifierMap).all().find((row) => row.observedKind === 'item' && row.observedId === 700);
		expect(link).toMatchObject({ decorId: 80, evidence: 'blizzard_item_reference' });
	});

	it('is idempotent — re-syncing the same payload changes no mapping', () => {
		const records = [
			{ decorId: 80, name: 'Sturdy Oak Chair', category: 'Seating', source: null, itemId: 700, mediaId: null, mediaUrl: null, raw: {} }
		];
		const first = upsertCanonicalDecor(sqlite, records, { region: 'us', locale: 'en_US', nowSeconds: NOW_SECONDS });
		const second = upsertCanonicalDecor(sqlite, records, { region: 'us', locale: 'en_US', nowSeconds: NOW_SECONDS });

		expect(first.mapped).toBeGreaterThan(0);
		expect(second.mapped).toBe(0);
		expect(db.select().from(canonicalDecor).all()).toHaveLength(1);
	});

	it('updates a canonical row in place when Blizzard changes its metadata', () => {
		upsertCanonicalDecor(
			sqlite,
			[{ decorId: 80, name: 'Old Name', category: 'Seating', source: null, itemId: 700, mediaId: null, mediaUrl: null, raw: {} }],
			{ region: 'us', locale: 'en_US', nowSeconds: NOW_SECONDS }
		);
		upsertCanonicalDecor(
			sqlite,
			[{ decorId: 80, name: 'Renamed By Blizzard', category: 'Chairs', source: null, itemId: 700, mediaId: null, mediaUrl: null, raw: {} }],
			{ region: 'us', locale: 'en_US', nowSeconds: NOW_SECONDS }
		);

		const rows = db.select().from(canonicalDecor).all();
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ name: 'Renamed By Blizzard', category: 'Chairs' });
	});
});

// -----------------------------------------------------------------------------

describe('canonical data wins, legacy is the fallback', () => {
	const manifest: BuildManifest = {
		shareCode: 'DECOR-TEST',
		blueprintType: 'House',
		contentGroups: [
			{
				contentType: 3,
				entries: [
					{ itemID: 700, total: 2, name: 'Whatever The Submitter Typed' },
					{ itemID: 702, total: 1, name: 'Also Submitter Text' },
					{ recordID: 424242, total: 1, name: 'Completely Unknown Decor' }
				]
			}
		],
		budgetInfo: null,
		blockingRequirements: null
	};

	it('prefers the official name over both the legacy catalog and the submitted text', () => {
		upsertCanonicalDecor(
			sqlite,
			[
				{
					decorId: 80,
					name: 'Official Oaken Chair',
					category: 'Seating',
					source: null,
					itemId: 700,
					mediaId: null,
					mediaUrl: null,
					raw: {}
				}
			],
			{ region: 'us', locale: 'en_US', nowSeconds: NOW_SECONDS }
		);

		const items = enrichItems(manifest);
		const canonical = items.find((item) => item.itemID === 700)!;

		expect(canonical.name).toBe('Official Oaken Chair');
		expect(canonical.canonical).toBe(true);
		expect(canonical.decorId).toBe(80);
	});

	it('falls back to the legacy catalog when there is no canonical record', () => {
		const items = enrichItems(manifest);
		const legacy = items.find((item) => item.itemID === 702)!;

		expect(legacy.name).toBe('Only In Legacy');
		expect(legacy.canonical).toBe(false);
	});

	it('keeps an entirely unknown identifier usable rather than dropping it', () => {
		const items = enrichItems(manifest);
		const unknown = items.find((item) => item.recordID === 424242)!;

		// Falls all the way through to the submitted name — the build still renders.
		expect(unknown.name).toBe('Completely Unknown Decor');
		expect(unknown.count).toBe(1);
		expect(unknown.canonical).toBe(false);
	});

	it('renders every entry whether or not canonical data exists', () => {
		expect(enrichItems(manifest)).toHaveLength(3);
	});

	it('behaves as if never synced when canonical rows were deleted by retention', () => {
		upsertCanonicalDecor(
			sqlite,
			[{ decorId: 80, name: 'Official Oaken Chair', category: null, source: null, itemId: 700, mediaId: null, mediaUrl: null, raw: {} }],
			{ region: 'us', locale: 'en_US', nowSeconds: NOW_SECONDS }
		);
		expect(enrichItems(manifest).find((item) => item.itemID === 700)!.canonical).toBe(true);

		// Retention deletes canonical rows but leaves KwikShack's mapping behind.
		db.delete(canonicalDecor).run();

		const after = enrichItems(manifest).find((item) => item.itemID === 700)!;
		expect(after.canonical).toBe(false);
		expect(after.name).toBe('Sturdy Oak Chair');
	});

	it('resolves nothing when asked about nothing', () => {
		expect(lookupCanonical({}).byItemID.size).toBe(0);
		expect(lookupCanonical({ itemIDs: [], recordIDs: [] }).byRecordID.size).toBe(0);
	});
});

describe('decor search and filters', () => {
	beforeEach(() => {
		upsertCanonicalDecor(
			sqlite,
			[
				{
					decorId: 80,
					name: 'Official Oaken Chair',
					category: 'Official Seating',
					source: null,
					itemId: 700,
					mediaId: null,
					mediaUrl: null,
					raw: {}
				}
			],
			{ region: 'us', locale: 'en_US', nowSeconds: NOW_SECONDS }
		);
	});

	it('shows the canonical name on a legacy search hit', () => {
		const hit = searchDecorItems('Sturdy').find((row) => row.itemID === 700);
		expect(hit).toMatchObject({ name: 'Official Oaken Chair', category: 'Official Seating', canonical: true });
	});

	it('finds decor by its official name even though the legacy row is named differently', () => {
		const hit = searchDecorItems('Oaken').find((row) => row.itemID === 700);
		expect(hit).toBeDefined();
		// The filter value stays the itemID the rest of the site already uses.
		expect(hit!.itemID).toBe(700);
	});

	it('still returns decor that has no canonical record', () => {
		expect(searchDecorItems('Only In Legacy').map((row) => row.itemID)).toContain(702);
	});

	it('shows canonical names on the selected-item chips', () => {
		expect(getDecorItems([700, 702])).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ itemID: 700, name: 'Official Oaken Chair', canonical: true }),
				expect.objectContaining({ itemID: 702, name: 'Only In Legacy' })
			])
		);
	});
});

describe('canonicalCoverage', () => {
	it('reports what is known without claiming more than it should', () => {
		upsertCanonicalDecor(
			sqlite,
			[{ decorId: 80, name: 'Sturdy Oak Chair', category: null, source: null, itemId: 700, mediaId: null, mediaUrl: null, raw: {} }],
			{ region: 'us', locale: 'en_US', nowSeconds: NOW_SECONDS }
		);

		const coverage = canonicalCoverage();
		expect(coverage.canonicalRecords).toBe(1);
		expect(coverage.strongLinks).toBeGreaterThan(0);
		expect(coverage.legacyCatalogRecords).toBe(3);
	});
});

describe('submitted data cannot become canonical truth', () => {
	it('an indexed third-party blueprint writes nothing to canonical decor or the map', () => {
		const before = {
			canonical: db.select().from(canonicalDecor).all().length,
			map: db.select().from(decorIdentifierMap).all().length,
			legacy: db.select().from(decorItems).all().length
		};

		const indexed = indexBlueprint({
			shareCode: 'DECOR-POISON',
			title: 'A third-party listing',
			attributedCreator: 'Somebody',
			platform: 'blizzard-forums',
			sourceUrl: 'https://us.forums.blizzard.com/en/wow/t/decor-poison/1',
			publication: 'published'
		});
		attachResolvedManifest((indexed as { id: string }).id, {
			shareCode: 'DECOR-POISON',
			blueprintType: 'House',
			contentGroups: [
				{
					contentType: 3,
					// A pair that claims itemID 700 is really decor 999999, plus a
					// completely invented item. Neither may reach the catalog.
					entries: [
						{ itemID: 700, recordID: 999999, name: 'Renamed By A Stranger', total: 1 },
						{ itemID: 888888, recordID: 888889, name: 'Invented Decor', total: 1 }
					]
				}
			],
			budgetInfo: null,
			blockingRequirements: null
		});

		expect(db.select().from(canonicalDecor).all().length).toBe(before.canonical);
		expect(db.select().from(decorIdentifierMap).all().length).toBe(before.map);
		expect(db.select().from(decorItems).all().length).toBe(before.legacy);
		expect(db.select().from(decorItems).all().some((row) => row.itemID === 888888)).toBe(false);
	});
});
