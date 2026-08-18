import { sqliteTable, text, integer, index, uniqueIndex, primaryKey } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// =============================================================================
// KwikShack data model — v0
// The manifest is stored as JSON (item lists + budgets + requirements resolved
// from blueprint share codes via the addon). PlacementData is optional JSON
// (spatial data when available). Enrichment happens at render time against the
// decorItems catalog.
//
// Schema changes are applied by the migration runner (web/migrations/*.sql),
// NOT by `drizzle-kit push`. This file must stay in step with those files by
// hand; `pnpm test` fails if it drifts (see db/schema.test.ts).
// =============================================================================

/**
 * Display-name label attached to native build submissions. NOT an identity —
 * anyone holding the submit key can write any name here. Authenticated identity
 * lives in `accounts` + `battleNetIdentities`.
 */
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
		// Optional Blizzard blueprint export scope. Null preserves legacy rows.
		blueprintScope: text('blueprint_scope', { enum: ['full_house', 'interior', 'exterior', 'room'] }),
		// Alliance | Horde | null (interiors/rooms are faction-neutral)
		faction: text('faction'),
		title: text('title').notNull(),
		description: text('description').default(''),
		authorId: text('author_id').references(() => users.id),
		// The resolved manifest (contentGroups, budgetInfo, blockingRequirements)
		manifest: text('manifest', { mode: 'json' }).notNull(),
		// Optional spatial data (positions/rotations) — from author's own house
		placementData: text('placement_data', { mode: 'json' }),
		// Last time this share code was verified as still importable (code-rot
		// plumbing). null = never verified. Full expiry detection lives in the
		// in-game addon; this column only records the timestamp.
		lastVerifiedAt: integer('last_verified_at', { mode: 'timestamp' }),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
	},
	(t) => [
		uniqueIndex('builds_share_code_idx').on(t.shareCode),
		index('builds_type_idx').on(t.blueprintType),
		index('builds_faction_idx').on(t.faction)
	]
);

export const likes = sqliteTable(
	'likes',
	{
		buildId: text('build_id')
			.notNull()
			.references(() => builds.id, { onDelete: 'cascade' }),
		clientId: text('client_id').notNull(),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
	},
	(t) => [primaryKey({ columns: [t.buildId, t.clientId] }), index('likes_build_idx').on(t.buildId)]
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
		recordID: integer('record_id'),
		name: text('name').notNull(),
		icon: text('icon').default(''),
		category: text('category').default(''),
		source: text('source').default(''),
		expansion: text('expansion').default(''),
		// Style/facet tags derived from HDGR_FacetDB (mood, culture, size,
		// inout, palette) — JSON array of lowercase facet strings.
		tags: text('tags', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
		updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
	},
	(t) => [index('decor_items_record_id_idx').on(t.recordID)]
);

// =============================================================================
// Canonical decor — see migrations/0004_canonical_decor.sql
//
// Blizzard's Housing Decor Game Data API is the authoritative source of decor
// identity. These rows are Blizzard API Data and are deleted at the retention
// TTL by the maintenance job; `decorItems` above is KwikShack's own catalog and
// is not, so it remains the fallback.
// =============================================================================

export const canonicalDecor = sqliteTable(
	'canonical_decor',
	{
		/** Blizzard's `{decorId}`. Not assumed equal to a recordID or itemID. */
		decorId: integer('decor_id').notNull(),
		region: text('region').notNull().default('us'),
		locale: text('locale').notNull().default('en_US'),
		name: text('name').notNull(),
		category: text('category'),
		source: text('source'),
		/** Authoritative itemID bridge when the payload supplies one. */
		itemId: integer('item_id'),
		mediaId: integer('media_id'),
		mediaUrl: text('media_url'),
		/** Unmodelled payload fields, so the mapping can be reviewed, not guessed. */
		raw: text('raw', { mode: 'json' }).notNull().default(sql`'{}'`),
		syncedAt: integer('synced_at', { mode: 'timestamp' }).notNull()
	},
	(t) => [
		primaryKey({ columns: [t.region, t.locale, t.decorId] }),
		index('canonical_decor_item_idx').on(t.itemId),
		index('canonical_decor_name_idx').on(t.name),
		index('canonical_decor_synced_idx').on(t.syncedAt)
	]
);

/** Evidence strengths for `decorIdentifierMap.confidence`. Higher always wins. */
export const DECOR_MAP_CONFIDENCE = {
	blizzardItemReference: 100,
	blizzardDecorId: 90,
	nameExact: 50,
	manual: 40
} as const;

export const decorIdentifierMap = sqliteTable(
	'decor_identifier_map',
	{
		id: text('id').primaryKey(),
		observedKind: text('observed_kind', { enum: ['item', 'record'] }).notNull(),
		observedId: integer('observed_id').notNull(),
		decorId: integer('decor_id').notNull(),
		region: text('region').notNull().default('us'),
		evidence: text('evidence').notNull(),
		confidence: integer('confidence').notNull(),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
	},
	(t) => [
		uniqueIndex('decor_identifier_map_observed_idx').on(t.region, t.observedKind, t.observedId),
		index('decor_identifier_map_decor_idx').on(t.decorId)
	]
);

export const decorSyncState = sqliteTable('decor_sync_state', {
	id: text('id').primaryKey(),
	region: text('region').notNull(),
	locale: text('locale').notNull(),
	lastStartedAt: integer('last_started_at', { mode: 'timestamp' }),
	lastCompletedAt: integer('last_completed_at', { mode: 'timestamp' }),
	lastStatus: text('last_status').notNull().default(''),
	lastError: text('last_error').notNull().default(''),
	entriesSeen: integer('entries_seen').notNull().default(0),
	entriesWritten: integer('entries_written').notNull().default(0)
});

// =============================================================================
// Identity — see migrations/0002_identity.sql
//
// Three claims, kept apart on purpose:
//   accounts               — a stable KwikShack identity
//   battleNetIdentities    — Battle.net authenticated this account
//   wowCharacterIdentities — Battle.net says this account controls this character
//
// None of them establish that a creator owns a particular blueprint. That is a
// separate, weaker claim recorded in `blueprintClaims`.
// =============================================================================

export const accounts = sqliteTable('accounts', {
	id: text('id').primaryKey(),
	/** Mutable label. Seeded from the BattleTag; never used for authorization. */
	displayName: text('display_name').notNull(),
	role: text('role', { enum: ['creator', 'admin'] }).notNull().default('creator'),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
});

export const battleNetIdentities = sqliteTable(
	'battle_net_identities',
	{
		accountId: text('account_id')
			.primaryKey()
			.references(() => accounts.id, { onDelete: 'cascade' }),
		/** Blizzard's stable account id (`sub` from /userinfo). */
		bnetSub: text('bnet_sub').notNull(),
		battletag: text('battletag'),
		region: text('region').notNull(),
		/** Scopes the user actually granted — may be narrower than requested. */
		grantedScopes: text('granted_scopes').notNull().default(''),
		lastVerifiedAt: integer('last_verified_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
	},
	(t) => [uniqueIndex('battle_net_identities_sub_idx').on(t.region, t.bnetSub)]
);

export const wowCharacterIdentities = sqliteTable(
	'wow_character_identities',
	{
		id: text('id').primaryKey(),
		accountId: text('account_id')
			.notNull()
			.references(() => accounts.id, { onDelete: 'cascade' }),
		region: text('region').notNull(),
		realmId: integer('realm_id').notNull(),
		realmSlug: text('realm_slug').notNull(),
		realmName: text('realm_name').notNull().default(''),
		characterId: integer('character_id').notNull(),
		name: text('name').notNull(),
		faction: text('faction'),
		level: integer('level'),
		refreshedAt: integer('refreshed_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
		/** Blizzard Developer API Terms of Use: 30-day maximum TTL for API data. */
		expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull()
	},
	(t) => [
		uniqueIndex('wow_character_identities_key_idx').on(t.accountId, t.region, t.realmId, t.characterId),
		index('wow_character_identities_expiry_idx').on(t.expiresAt)
	]
);

/** `id` is the SHA-256 of the cookie token, never the token itself. */
export const sessions = sqliteTable(
	'sessions',
	{
		id: text('id').primaryKey(),
		accountId: text('account_id')
			.notNull()
			.references(() => accounts.id, { onDelete: 'cascade' }),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
		expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull()
	},
	(t) => [index('sessions_account_idx').on(t.accountId), index('sessions_expiry_idx').on(t.expiresAt)]
);

/** Single-use OAuth `state`, stored hashed so only the issuer's value validates. */
export const oauthStates = sqliteTable(
	'oauth_states',
	{
		id: text('id').primaryKey(),
		redirectTo: text('redirect_to').notNull().default('/'),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
		expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull()
	},
	(t) => [index('oauth_states_expiry_idx').on(t.expiresAt)]
);

// =============================================================================
// Indexed public blueprints — see migrations/0003_blueprint_index.sql
//
// A blueprint code that was publicly and intentionally shared elsewhere.
// Deliberately not `builds`: a native build is the creator's own submission.
// =============================================================================

export const BLUEPRINT_RESOLUTION_STATES = ['unresolved', 'resolved', 'unavailable', 'revoked'] as const;
export const BLUEPRINT_CLAIM_STATES = ['unclaimed', 'pending', 'claimed'] as const;
export const BLUEPRINT_PUBLICATION_STATES = ['draft', 'published', 'archived'] as const;

export const indexedBlueprints = sqliteTable(
	'indexed_blueprints',
	{
		id: text('id').primaryKey(),
		shareCode: text('share_code').notNull(),
		resolutionState: text('resolution_state', { enum: BLUEPRINT_RESOLUTION_STATES })
			.notNull()
			.default('unresolved'),
		resolutionCheckedAt: integer('resolution_checked_at', { mode: 'timestamp' }),
		resolutionNote: text('resolution_note').notNull().default(''),
		blueprintType: text('blueprint_type').notNull().default('House'),
		blueprintScope: text('blueprint_scope', { enum: ['full_house', 'interior', 'exterior', 'room'] }),
		faction: text('faction'),
		/** Only ever written from a manifest resolved through the supported flow. */
		manifest: text('manifest', { mode: 'json' }),
		/** Attribution observed at the source. A citation, not a verified fact. */
		attributedCreator: text('attributed_creator').notNull(),
		attributedRealm: text('attributed_realm'),
		attributedCharacter: text('attributed_character'),
		/** Curator-authored listing title — original KwikShack copy. */
		title: text('title').notNull(),
		creatorTitle: text('creator_title'),
		creatorDescription: text('creator_description'),
		creatorTags: text('creator_tags', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
		creatorLinks: text('creator_links', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
		preferredAttribution: text('preferred_attribution'),
		claimState: text('claim_state', { enum: BLUEPRINT_CLAIM_STATES }).notNull().default('unclaimed'),
		claimedByAccountId: text('claimed_by_account_id').references(() => accounts.id, { onDelete: 'set null' }),
		claimedAt: integer('claimed_at', { mode: 'timestamp' }),
		publication: text('publication', { enum: BLUEPRINT_PUBLICATION_STATES }).notNull().default('draft'),
		nativeBuildId: text('native_build_id').references(() => builds.id, { onDelete: 'set null' }),
		indexedAt: integer('indexed_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
	},
	(t) => [
		uniqueIndex('indexed_blueprints_share_code_idx').on(t.shareCode),
		index('indexed_blueprints_publication_idx').on(t.publication),
		index('indexed_blueprints_claim_idx').on(t.claimedByAccountId)
	]
);

/** One blueprint, many discovery sources. Extra sources never fork the listing. */
export const indexedBlueprintSources = sqliteTable(
	'indexed_blueprint_sources',
	{
		id: text('id').primaryKey(),
		blueprintId: text('blueprint_id')
			.notNull()
			.references(() => indexedBlueprints.id, { onDelete: 'cascade' }),
		platform: text('platform').notNull(),
		sourceUrl: text('source_url').notNull(),
		attributedCreator: text('attributed_creator').notNull(),
		discoveredAt: integer('discovered_at', { mode: 'timestamp' }).notNull(),
		ingestionMethod: text('ingestion_method').notNull().default('manual'),
		/** Internal review evidence. Never serialised to a visitor response. */
		internalNotes: text('internal_notes').notNull().default(''),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
	},
	(t) => [
		uniqueIndex('indexed_blueprint_sources_url_idx').on(t.blueprintId, t.sourceUrl),
		index('indexed_blueprint_sources_blueprint_idx').on(t.blueprintId)
	]
);

/** Only images the claimed creator uploaded to KwikShack. Never source media. */
export const indexedBlueprintScreenshots = sqliteTable(
	'indexed_blueprint_screenshots',
	{
		id: text('id').primaryKey(),
		blueprintId: text('blueprint_id')
			.notNull()
			.references(() => indexedBlueprints.id, { onDelete: 'cascade' }),
		url: text('url').notNull(),
		caption: text('caption').notNull().default(''),
		isPrimary: integer('is_primary', { mode: 'boolean' }).notNull().default(false),
		sortOrder: integer('sort_order').notNull().default(0),
		uploadedByAccountId: text('uploaded_by_account_id').references(() => accounts.id, { onDelete: 'set null' }),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
	},
	(t) => [index('indexed_blueprint_screenshots_blueprint_idx').on(t.blueprintId)]
);

export const CLAIM_STATUSES = ['pending', 'approved', 'rejected', 'withdrawn'] as const;

export const blueprintClaims = sqliteTable(
	'blueprint_claims',
	{
		id: text('id').primaryKey(),
		blueprintId: text('blueprint_id')
			.notNull()
			.references(() => indexedBlueprints.id, { onDelete: 'cascade' }),
		accountId: text('account_id')
			.notNull()
			.references(() => accounts.id, { onDelete: 'cascade' }),
		status: text('status', { enum: CLAIM_STATUSES }).notNull().default('pending'),
		characterIdentityId: text('character_identity_id').references(() => wowCharacterIdentities.id, {
			onDelete: 'set null'
		}),
		evidenceUrl: text('evidence_url'),
		claimantNote: text('claimant_note').notNull().default(''),
		/** Internal reviewer fields. Never serialised to a visitor response. */
		reviewerNote: text('reviewer_note').notNull().default(''),
		evidenceKinds: text('evidence_kinds', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
		reviewedAt: integer('reviewed_at', { mode: 'timestamp' }),
		reviewedByAccountId: text('reviewed_by_account_id').references(() => accounts.id, { onDelete: 'set null' })
	},
	(t) => [
		index('blueprint_claims_blueprint_idx').on(t.blueprintId),
		index('blueprint_claims_account_idx').on(t.accountId),
		index('blueprint_claims_status_idx').on(t.status)
	]
);

/** Append-only. Claiming enriches a listing; it never rewrites its origin. */
export const blueprintAuditEvents = sqliteTable(
	'blueprint_audit_events',
	{
		id: text('id').primaryKey(),
		blueprintId: text('blueprint_id')
			.notNull()
			.references(() => indexedBlueprints.id, { onDelete: 'cascade' }),
		event: text('event').notNull(),
		actorAccountId: text('actor_account_id').references(() => accounts.id, { onDelete: 'set null' }),
		detail: text('detail', { mode: 'json' }).notNull().default(sql`'{}'`),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
	},
	(t) => [index('blueprint_audit_events_blueprint_idx').on(t.blueprintId)]
);
