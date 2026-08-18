-- 0003_blueprint_index
--
-- Indexed public blueprints: a blueprint code that was publicly and
-- intentionally shared elsewhere, indexed by KwikShack with attribution and
-- source provenance.
--
-- This is deliberately NOT the `builds` table. A native build is a creator's
-- own submission with a resolved manifest; an indexed blueprint is a third-party
-- share we observed. Merging them would make `builds.author_id` and
-- `builds.code_status` lie.
--
-- Provenance is append-only and separate from the listing, so a later claim can
-- make a listing creator-managed without erasing how KwikShack found it.

CREATE TABLE IF NOT EXISTS `indexed_blueprints` (
	`id` text PRIMARY KEY NOT NULL,
	`share_code` text NOT NULL,

	-- KwikShack's own resolution state for the code.
	--   unresolved  — indexed, never resolved through the addon path
	--   resolved    — a manifest was resolved through the supported flow
	--   unavailable — resolution was attempted and the code did not resolve
	--   revoked     — the creator or a takedown withdrew the share
	`resolution_state` text DEFAULT 'unresolved' NOT NULL,
	`resolution_checked_at` integer,
	`resolution_note` text DEFAULT '' NOT NULL,

	-- Derived from the resolved manifest only. Never from source-site prose.
	`blueprint_type` text DEFAULT 'House' NOT NULL,
	`blueprint_scope` text,
	`faction` text,
	`manifest` text,

	-- Attribution as observed at the source. This is a citation, never a
	-- statement that KwikShack verified ownership.
	`attributed_creator` text NOT NULL,
	`attributed_realm` text,
	`attributed_character` text,

	-- Curator-authored listing title (original KwikShack copy, not source prose).
	`title` text NOT NULL,

	-- Creator-authored overlay. Writable only through an approved claim.
	`creator_title` text,
	`creator_description` text,
	`creator_tags` text DEFAULT '[]' NOT NULL,
	`creator_links` text DEFAULT '[]' NOT NULL,
	`preferred_attribution` text,

	-- unclaimed | pending | claimed
	`claim_state` text DEFAULT 'unclaimed' NOT NULL,
	`claimed_by_account_id` text,
	`claimed_at` integer,

	-- draft | published | archived
	`publication` text DEFAULT 'draft' NOT NULL,
	`native_build_id` text,

	`indexed_at` integer NOT NULL,
	`updated_at` integer NOT NULL,

	FOREIGN KEY (`claimed_by_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`native_build_id`) REFERENCES `builds`(`id`) ON UPDATE no action ON DELETE set null
);
CREATE UNIQUE INDEX IF NOT EXISTS `indexed_blueprints_share_code_idx` ON `indexed_blueprints` (`share_code`);
CREATE INDEX IF NOT EXISTS `indexed_blueprints_publication_idx` ON `indexed_blueprints` (`publication`);
CREATE INDEX IF NOT EXISTS `indexed_blueprints_claim_idx` ON `indexed_blueprints` (`claimed_by_account_id`);

-- One blueprint may legitimately be found on several platforms. Extra sources
-- add provenance; they never create a second public listing.
CREATE TABLE IF NOT EXISTS `indexed_blueprint_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`blueprint_id` text NOT NULL,
	`platform` text NOT NULL,
	`source_url` text NOT NULL,
	`attributed_creator` text NOT NULL,
	`discovered_at` integer NOT NULL,
	-- 'manual' or 'adapter:<source id>'
	`ingestion_method` text DEFAULT 'manual' NOT NULL,
	-- Internal review evidence. NEVER serialised to a visitor response.
	`internal_notes` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`blueprint_id`) REFERENCES `indexed_blueprints`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE UNIQUE INDEX IF NOT EXISTS `indexed_blueprint_sources_url_idx`
	ON `indexed_blueprint_sources` (`blueprint_id`, `source_url`);
CREATE INDEX IF NOT EXISTS `indexed_blueprint_sources_blueprint_idx` ON `indexed_blueprint_sources` (`blueprint_id`);

-- Only images uploaded to KwikShack by the claimed creator ever land here.
-- Source-site media is never copied, proxied, or hotlinked.
CREATE TABLE IF NOT EXISTS `indexed_blueprint_screenshots` (
	`id` text PRIMARY KEY NOT NULL,
	`blueprint_id` text NOT NULL,
	`url` text NOT NULL,
	`caption` text DEFAULT '' NOT NULL,
	`is_primary` integer DEFAULT 0 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`uploaded_by_account_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`blueprint_id`) REFERENCES `indexed_blueprints`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_by_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null
);
CREATE INDEX IF NOT EXISTS `indexed_blueprint_screenshots_blueprint_idx`
	ON `indexed_blueprint_screenshots` (`blueprint_id`);

CREATE TABLE IF NOT EXISTS `blueprint_claims` (
	`id` text PRIMARY KEY NOT NULL,
	`blueprint_id` text NOT NULL,
	`account_id` text NOT NULL,
	-- pending | approved | rejected | withdrawn
	`status` text DEFAULT 'pending' NOT NULL,
	-- The character the claimant says published the blueprint, if they have one
	-- associated. Battle.net proves they control the character, not the build.
	`character_identity_id` text,
	`evidence_url` text,
	`claimant_note` text DEFAULT '' NOT NULL,
	-- Internal reviewer fields. NEVER serialised to a visitor response.
	`reviewer_note` text DEFAULT '' NOT NULL,
	`evidence_kinds` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`reviewed_at` integer,
	`reviewed_by_account_id` text,
	FOREIGN KEY (`blueprint_id`) REFERENCES `indexed_blueprints`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`character_identity_id`) REFERENCES `wow_character_identities`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`reviewed_by_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null
);
CREATE INDEX IF NOT EXISTS `blueprint_claims_blueprint_idx` ON `blueprint_claims` (`blueprint_id`);
CREATE INDEX IF NOT EXISTS `blueprint_claims_account_idx` ON `blueprint_claims` (`account_id`);
CREATE INDEX IF NOT EXISTS `blueprint_claims_status_idx` ON `blueprint_claims` (`status`);
-- At most one open request per account per listing.
CREATE UNIQUE INDEX IF NOT EXISTS `blueprint_claims_pending_idx`
	ON `blueprint_claims` (`blueprint_id`, `account_id`) WHERE `status` = 'pending';

-- Append-only history. Claiming enriches a listing; it never rewrites how the
-- listing came to exist.
CREATE TABLE IF NOT EXISTS `blueprint_audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`blueprint_id` text NOT NULL,
	`event` text NOT NULL,
	`actor_account_id` text,
	`detail` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`blueprint_id`) REFERENCES `indexed_blueprints`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null
);
CREATE INDEX IF NOT EXISTS `blueprint_audit_events_blueprint_idx` ON `blueprint_audit_events` (`blueprint_id`);
