-- 0004_canonical_decor
--
-- Canonical decor identity from Blizzard's Housing Decor Game Data API
-- (/data/wow/decor/*), kept strictly apart from two other things it is easy to
-- confuse it with:
--
--   decor_items            KwikShack's legacy catalog, seeded from the MIT-licensed
--                          Housing Decor Guide data files plus Wowhead enrichment.
--                          NOT Blizzard API data, so NOT subject to the Blizzard
--                          Developer API 30-day retention rule. Stays as the
--                          fallback when canonical data is missing or stale.
--
--   manifest entries       What a blueprint actually contains. Observed data.
--                          Never promoted to catalog truth.
--
-- canonical_decor rows ARE Blizzard API Data and are therefore deleted at the
-- retention TTL by the maintenance job, exactly like profile data. Rendering
-- degrades to decor_items rather than breaking. See docs/architecture.md.

CREATE TABLE IF NOT EXISTS `canonical_decor` (
	-- Blizzard's own decor identifier, the {decorId} path parameter.
	-- NOT assumed equal to a manifest recordID or an itemID — see
	-- decor_identifier_map, which records how each link was actually established.
	`decor_id` integer NOT NULL,
	`region` text DEFAULT 'us' NOT NULL,
	`locale` text DEFAULT 'en_US' NOT NULL,
	`name` text NOT NULL,
	`category` text,
	`source` text,
	-- Item reference from the payload, when the API supplies one. This is the
	-- authoritative itemID↔decorId bridge when present.
	`item_id` integer,
	`media_id` integer,
	`media_url` text,
	-- Payload fields KwikShack does not model yet, kept so the mapping can be
	-- reviewed against reality instead of guessed at.
	`raw` text DEFAULT '{}' NOT NULL,
	`synced_at` integer NOT NULL,
	PRIMARY KEY (`region`, `locale`, `decor_id`)
);
CREATE INDEX IF NOT EXISTS `canonical_decor_item_idx` ON `canonical_decor` (`item_id`);
CREATE INDEX IF NOT EXISTS `canonical_decor_name_idx` ON `canonical_decor` (`name`);
CREATE INDEX IF NOT EXISTS `canonical_decor_synced_idx` ON `canonical_decor` (`synced_at`);

-- How an identifier observed in a manifest reaches a canonical decor row, and on
-- what evidence. `confidence` is numeric so a stronger link can overwrite a
-- weaker one and never the reverse.
--
--   100  blizzard_item_reference — the canonical payload named this itemID
--    90  blizzard_decor_id       — the observed id matched a canonical decor_id
--    50  name_exact              — exact name match against the legacy catalog
--    40  manual                  — an operator asserted it
--
-- Nothing here is learned from user submissions. That path is what this table
-- exists to replace.
CREATE TABLE IF NOT EXISTS `decor_identifier_map` (
	`id` text PRIMARY KEY NOT NULL,
	-- 'item' | 'record'
	`observed_kind` text NOT NULL,
	`observed_id` integer NOT NULL,
	`decor_id` integer NOT NULL,
	`region` text DEFAULT 'us' NOT NULL,
	`evidence` text NOT NULL,
	`confidence` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS `decor_identifier_map_observed_idx`
	ON `decor_identifier_map` (`region`, `observed_kind`, `observed_id`);
CREATE INDEX IF NOT EXISTS `decor_identifier_map_decor_idx` ON `decor_identifier_map` (`decor_id`);

-- One row per (region, locale) catalog. Lets the sync be incremental and lets
-- the maintenance job report staleness without scanning the catalog.
CREATE TABLE IF NOT EXISTS `decor_sync_state` (
	`id` text PRIMARY KEY NOT NULL,
	`region` text NOT NULL,
	`locale` text NOT NULL,
	`last_started_at` integer,
	`last_completed_at` integer,
	-- 'ok' | 'failed' | 'partial' | ''
	`last_status` text DEFAULT '' NOT NULL,
	`last_error` text DEFAULT '' NOT NULL,
	`entries_seen` integer DEFAULT 0 NOT NULL,
	`entries_written` integer DEFAULT 0 NOT NULL
);
