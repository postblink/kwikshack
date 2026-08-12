import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { unlinkSync } from 'node:fs';
import type { BuildManifest } from '$lib/types/manifest';

const testDatabase = vi.hoisted(() => ({
	path: `/tmp/kwikshack-vitest-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.db`
}));

vi.mock('$app/environment', () => ({ building: true }));
vi.mock('$env/dynamic/private', () => ({ env: { DATABASE_URL: testDatabase.path } }));

import {
	buildSummary,
	buildTags,
	createBuild,
	distinctDecorItemCount,
	enrichItems,
	getBuildLikeState,
	listBuilds,
	listTags,
	toggleBuildLike
} from './builds';
import { searchDecorItems } from './decor';

const compactManifest: BuildManifest = {
	shareCode: 'compact-code',
	blueprintType: 'House',
	contentGroups: [{ contentType: 3, entries: [{ itemID: 101, total: 2 }] }],
	budgetInfo: null,
	blockingRequirements: null
};

beforeAll(() => {
	const sqlite = new Database(testDatabase.path);
	sqlite.exec(`
		PRAGMA foreign_keys = ON;
		CREATE TABLE users (
			id TEXT PRIMARY KEY NOT NULL,
			name TEXT NOT NULL,
			created_at INTEGER NOT NULL
		);
		CREATE TABLE builds (
			id TEXT PRIMARY KEY NOT NULL,
			share_code TEXT NOT NULL,
			code_status TEXT DEFAULT 'unverified' NOT NULL,
			blueprint_type TEXT DEFAULT 'House' NOT NULL,
			faction TEXT,
			title TEXT NOT NULL,
			description TEXT DEFAULT '',
			author_id TEXT REFERENCES users(id),
			manifest TEXT NOT NULL,
			placement_data TEXT,
			last_verified_at INTEGER,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL
		);
		CREATE UNIQUE INDEX builds_share_code_idx ON builds (share_code);
		CREATE TABLE screenshots (
			id TEXT PRIMARY KEY NOT NULL,
			build_id TEXT NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
			url TEXT NOT NULL,
			caption TEXT DEFAULT '',
			is_primary INTEGER DEFAULT 0 NOT NULL,
			sort_order INTEGER DEFAULT 0 NOT NULL
		);
		CREATE TABLE likes (
			build_id TEXT NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
			client_id TEXT NOT NULL,
			created_at INTEGER NOT NULL,
			PRIMARY KEY (build_id, client_id)
		);
		CREATE INDEX likes_build_idx ON likes (build_id);
		CREATE TABLE decor_items (
			item_id INTEGER PRIMARY KEY NOT NULL,
			record_id INTEGER,
			name TEXT NOT NULL,
			icon TEXT DEFAULT '',
			category TEXT DEFAULT '',
			source TEXT DEFAULT '',
			expansion TEXT DEFAULT '',
			tags TEXT NOT NULL DEFAULT '[]',
			updated_at INTEGER NOT NULL
		);
		CREATE INDEX decor_items_record_id_idx ON decor_items (record_id);
	`);
	const insert = sqlite.prepare(
		'INSERT INTO decor_items (item_id, record_id, name, icon, updated_at) VALUES (?, ?, ?, ?, ?)'
	);
	insert.run(100, 200, 'Catalog Chair', '123456', 1);
	insert.run(101, null, 'Compact Table', '654321', 1);
	sqlite.prepare("UPDATE decor_items SET category = 'Seating' WHERE item_id = 100").run();
	sqlite.prepare('UPDATE decor_items SET tags = ? WHERE item_id = 100').run(JSON.stringify(['cozy', 'human', 'small']));
	sqlite.prepare('UPDATE decor_items SET tags = ? WHERE item_id = 101').run(JSON.stringify(['rustic', 'cozy']));
	sqlite.close();
});

afterAll(() => {
	unlinkSync(testDatabase.path);
});

describe('enrichItems', () => {
	it('enriches compact itemID entries and live recordID entries', () => {
		const manifest: BuildManifest = {
			shareCode: 'mixed-code',
			blueprintType: 'House',
			contentGroups: [
				{
					contentType: 3,
					entries: [
						{ itemID: 101, total: 2 },
						{ recordID: 200, total: 3, name: 'Payload Chair' },
						{ recordID: 999, total: 1, name: 'Unmapped Decor' }
					]
				}
			],
			budgetInfo: null,
			blockingRequirements: null
		};

		expect(enrichItems(manifest)).toEqual([
			{ key: 101, itemID: 101, recordID: null, name: 'Compact Table', icon: '654321', count: 2 },
			{ key: 200, itemID: 100, recordID: 200, name: 'Catalog Chair', icon: '123456', count: 3 },
			{ key: 999, itemID: null, recordID: 999, name: 'Unmapped Decor', icon: null, count: 1 }
		]);
	});
});

describe('buildSummary', () => {
	it('counts decor and room entries across both group field shapes', () => {
		const manifest: BuildManifest = {
			...compactManifest,
			contentGroups: [
				{ contentType: 3, entries: [{ itemID: 1 }, { itemID: 2 }] },
				{ groupType: 3, entries: [{ itemID: 3 }] },
				{ contentType: 2, entries: [{ recordID: 4 }, { recordID: 5 }] },
				{ contentType: 1, entries: [{ recordID: 6 }] }
			]
		};

		expect(buildSummary(manifest)).toEqual({ decorCount: 3, roomCount: 2 });
	});

	it('counts distinct decor identities and ignores structural entries', () => {
		const manifest: BuildManifest = {
			...compactManifest,
			contentGroups: [
				{ contentType: 3, entries: [{ itemID: 1 }, { itemID: 1 }, { recordID: 2 }] },
				{ contentType: 2, entries: [{ itemID: 3 }] }
			]
		};

		expect(distinctDecorItemCount(manifest)).toBe(2);
	});
});

describe('searchDecorItems', () => {
	it('searches names and categories', () => {
		expect(searchDecorItems('table')).toEqual([
			{ itemID: 101, recordID: null, name: 'Compact Table', icon: '654321', category: '' }
		]);
		expect(searchDecorItems('seating')).toEqual([
			{ itemID: 100, recordID: 200, name: 'Catalog Chair', icon: '123456', category: 'Seating' }
		]);
	});
});

describe('buildTags and listTags', () => {
	it('unions deduped catalog tags across a build decor items, most frequent first', () => {
		const manifest: BuildManifest = {
			...compactManifest,
			contentGroups: [
				{ contentType: 3, entries: [{ itemID: 100 }, { itemID: 101 }] },
				{ contentType: 2, entries: [{ itemID: 999 }] } // structural, ignored
			]
		};
		expect(buildTags(manifest)).toEqual(['cozy', 'human', 'rustic', 'small']);
	});

	it('lists distinct tags with usage counts across builds', () => {
		createBuild({
			shareCode: 'tagged-code',
			title: 'Tagged Build',
			blueprintType: 'House',
			faction: null,
			manifest: {
				...compactManifest,
				shareCode: 'tagged-code',
				contentGroups: [{ contentType: 3, entries: [{ itemID: 100 }] }]
			}
		});
		const counts = new Map(listTags().map((t) => [t.tag, t.count]));
		expect(counts.get('cozy')).toBe(1);
		expect(counts.get('human')).toBe(1);
		expect(counts.get('small')).toBe(1);
		expect(counts.get('rustic')).toBeUndefined();
	});
	it('populates tags on listBuilds records (not just listTags)', () => {
		createBuild({
			shareCode: 'tags-on-record',
			title: 'Tags On Record',
			blueprintType: 'House',
			faction: null,
			manifest: {
				...compactManifest,
				shareCode: 'tags-on-record',
				contentGroups: [{ contentType: 3, entries: [{ itemID: 100 }] }]
			}
		});
		const record = listBuilds({ tag: 'cozy' }).find((b) => b.shareCode === 'tags-on-record');
		expect(record?.tags).toContain('cozy');
	});
});

describe('createBuild and listBuilds', () => {
	it('round-trips a build through the isolated SQLite database', () => {
		const created = createBuild({
			shareCode: compactManifest.shareCode,
			title: 'Compact Build',
			description: 'Round-trip test',
			blueprintType: 'Interior',
			faction: null,
			authorName: 'Builder',
			manifest: compactManifest,
			screenshotUrls: ['/uploads/test.png']
		});

		const listed = listBuilds({ q: 'Compact' });
		expect(listed).toHaveLength(1);
		expect(listed[0]).toMatchObject({
			id: created.id,
			shareCode: 'compact-code',
			title: 'Compact Build',
			description: 'Round-trip test',
			blueprintType: 'Interior',
			authorName: 'Builder',
			manifest: compactManifest
		});
	});

	it('upserts on duplicate shareCode instead of inserting a second row', () => {
		const first = createBuild({
			shareCode: 'upsert-code',
			title: 'Upsert First',
			blueprintType: 'House',
			faction: null,
			manifest: { ...compactManifest, shareCode: 'upsert-code' }
		});

		const second = createBuild({
			shareCode: 'upsert-code',
			title: 'Upsert Second',
			blueprintType: 'Interior',
			faction: null,
			manifest: { ...compactManifest, shareCode: 'upsert-code' }
		});

		expect(second.id).toBe(first.id);
		expect(second.lastVerifiedAt).toBeInstanceOf(Date);

		const listed = listBuilds({ q: 'Upsert' });
		expect(listed).toHaveLength(1);
		expect(listed[0].id).toBe(first.id);
		expect(listed[0].title).toBe('Upsert Second');
		expect(listed[0].blueprintType).toBe('Interior');
	});

	it('filters by manifest itemID before applying pagination', () => {
		createBuild({
			shareCode: 'item-match',
			title: 'Item Filter Match',
			blueprintType: 'House',
			faction: null,
			manifest: { ...compactManifest, shareCode: 'item-match', contentGroups: [{ contentType: 3, entries: [{ itemID: 701 }] }] }
		});
		createBuild({
			shareCode: 'item-miss',
			title: 'Item Filter Miss',
			blueprintType: 'House',
			faction: null,
			manifest: { ...compactManifest, shareCode: 'item-miss', contentGroups: [{ contentType: 3, entries: [{ itemID: 702 }] }] }
		});

		const listed = listBuilds({ q: 'Item Filter', itemIDs: [701], limit: 1 });
		expect(listed.map((build) => build.title)).toEqual(['Item Filter Match']);
	});

	it('sorts by distinct decor item count', () => {
		createBuild({
			shareCode: 'sort-sparse',
			title: 'Sort Spec Sparse',
			blueprintType: 'House',
			faction: null,
			manifest: { ...compactManifest, shareCode: 'sort-sparse', contentGroups: [{ contentType: 3, entries: [{ itemID: 801 }] }] }
		});
		createBuild({
			shareCode: 'sort-rich',
			title: 'Sort Spec Rich',
			blueprintType: 'House',
			faction: null,
			manifest: {
				...compactManifest,
				shareCode: 'sort-rich',
				contentGroups: [
					{ contentType: 3, entries: [{ itemID: 802 }, { itemID: 803 }, { itemID: 802 }] },
					{ contentType: 2, entries: [{ itemID: 804 }] }
				]
			}
		});

		const listed = listBuilds({ q: 'Sort Spec', sort: 'most_items' });
		expect(listed.map((build) => build.title)).toEqual(['Sort Spec Rich', 'Sort Spec Sparse']);
	});

	it('filters by exact author name', () => {
		const listed = listBuilds({ author: 'Builder' });
		expect(listed.map((build) => build.title)).toContain('Compact Build');
		expect(listed.every((build) => build.authorName === 'Builder')).toBe(true);
		expect(listBuilds({ author: 'builder' })).toEqual([]);
	});

	it('toggles one like per client and sorts by like count', () => {
		const [target] = listBuilds({ q: 'Sort Spec Sparse' });
		expect(getBuildLikeState(target.id, 'client-one')).toEqual({ likeCount: 0, liked: false });
		expect(toggleBuildLike(target.id, 'client-one')).toEqual({ likeCount: 1, liked: true });
		expect(getBuildLikeState(target.id, 'client-one')).toEqual({ likeCount: 1, liked: true });
		expect(toggleBuildLike(target.id, 'client-two')).toEqual({ likeCount: 2, liked: true });

		const sorted = listBuilds({ q: 'Sort Spec', sort: 'most_liked', clientId: 'client-one' });
		expect(sorted[0]).toMatchObject({ id: target.id, likeCount: 2, liked: true });
		expect(toggleBuildLike(target.id, 'client-one')).toEqual({ likeCount: 1, liked: false });
	});
});
