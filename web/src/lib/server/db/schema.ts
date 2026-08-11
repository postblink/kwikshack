import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

// =============================================================================
// KwikShack data model — v0
// The manifest is stored as JSON (item lists + budgets + requirements resolved
// from blueprint share codes via the addon). PlacementData is optional JSON
// (spatial data when available). Enrichment happens at render time against the
// decorItems catalog.
// =============================================================================

export const users = sqliteTable(
	'users',
	{
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
	},
	(t) => [index('users_name_idx').on(t.name)]
);

export const builds = sqliteTable(
	'builds',
	{
		id: text('id').primaryKey(),
		// The importable share code — canonical identifier, subject to rot
		shareCode: text('share_code').notNull(),
		// active | expired | unverified
		codeStatus: text('code_status').notNull().default('unverified'),
		// House | Interior | Exterior | Room
		blueprintType: text('blueprint_type').notNull().default('House'),
		// Alliance | Horde | null (interiors/rooms are faction-neutral)
		faction: text('faction'),
		title: text('title').notNull(),
		description: text('description').default(''),
		authorId: text('author_id').references(() => users.id),
		// The resolved manifest (contentGroups, budgetInfo, blockingRequirements)
		manifest: text('manifest', { mode: 'json' }).notNull(),
		// Optional spatial data (positions/rotations) — from author's own house
		placementData: text('placement_data', { mode: 'json' }),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
	},
	(t) => [
		index('builds_share_code_idx').on(t.shareCode),
		index('builds_type_idx').on(t.blueprintType),
		index('builds_faction_idx').on(t.faction)
	]
);

export const tags = sqliteTable(
	'tags',
	{
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		category: text('category').default('')
	},
	(t) => [index('tags_name_idx').on(t.name)]
);

export const buildTags = sqliteTable(
	'build_tags',
	{
		buildId: text('build_id')
			.notNull()
			.references(() => builds.id, { onDelete: 'cascade' }),
		tagId: text('tag_id')
			.notNull()
			.references(() => tags.id, { onDelete: 'cascade' })
	},
	(t) => [index('build_tags_build_idx').on(t.buildId), index('build_tags_tag_idx').on(t.tagId)]
);

export const screenshots = sqliteTable(
	'screenshots',
	{
		id: text('id').primaryKey(),
		buildId: text('build_id')
			.notNull()
			.references(() => builds.id, { onDelete: 'cascade' }),
		url: text('url').notNull(),
		caption: text('caption').default(''),
		isPrimary: integer('is_primary', { mode: 'boolean' }).notNull().default(false),
		sortOrder: integer('sort_order').notNull().default(0)
	},
	(t) => [index('screenshots_build_idx').on(t.buildId)]
);

// Decor item catalog — enriched metadata cache (icons, names, sources).
// Populated from game data (wow.tools DB2 dumps / Wowhead API) as builds come in.
export const decorItems = sqliteTable(
	'decor_items',
	{
		itemID: integer('item_id').primaryKey(),
		name: text('name').notNull(),
		icon: text('icon').default(''),
		category: text('category').default(''),
		source: text('source').default(''),
		expansion: text('expansion').default(''),
		updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
	}
);
