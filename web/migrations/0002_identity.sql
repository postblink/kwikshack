-- 0002_identity
--
-- Battle.net-backed creator identity.
--
-- Three separate claims are modelled separately on purpose:
--   accounts                 — a stable KwikShack identity (never a display name)
--   battle_net_identities    — "this KwikShack account controls this Battle.net account"
--   wow_character_identities — "this Battle.net account controls this character"
--
-- The pre-existing `users` table is NOT touched. It stays what it always was:
-- an unauthenticated display-name label attached to native build submissions.
--
-- No OAuth access token or refresh token is stored. Tokens are used inside the
-- callback request to read /userinfo and /profile/user/wow, then discarded.
-- Character rows carry an explicit expiry so the Blizzard Developer API Terms
-- of Use 30-day maximum data TTL is enforceable by a query, not by memory.

CREATE TABLE IF NOT EXISTS `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	-- Mutable label. Seeded from the BattleTag name, editable later.
	`display_name` text NOT NULL,
	-- 'creator' | 'admin'
	`role` text DEFAULT 'creator' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);

CREATE TABLE IF NOT EXISTS `battle_net_identities` (
	`account_id` text PRIMARY KEY NOT NULL,
	-- Blizzard's stable account identifier (the `sub` / `id` from /userinfo).
	`bnet_sub` text NOT NULL,
	`battletag` text,
	-- us | eu | apac | cn
	`region` text NOT NULL,
	-- Space-separated scopes the user actually granted (may be narrower than requested).
	`granted_scopes` text DEFAULT '' NOT NULL,
	`last_verified_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE UNIQUE INDEX IF NOT EXISTS `battle_net_identities_sub_idx` ON `battle_net_identities` (`region`, `bnet_sub`);

CREATE TABLE IF NOT EXISTS `wow_character_identities` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`region` text NOT NULL,
	`realm_id` integer NOT NULL,
	`realm_slug` text NOT NULL,
	`realm_name` text DEFAULT '' NOT NULL,
	`character_id` integer NOT NULL,
	`name` text NOT NULL,
	`faction` text,
	`level` integer,
	`refreshed_at` integer NOT NULL,
	-- Hard deletion deadline for Blizzard-sourced profile data.
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE UNIQUE INDEX IF NOT EXISTS `wow_character_identities_key_idx`
	ON `wow_character_identities` (`account_id`, `region`, `realm_id`, `character_id`);
CREATE INDEX IF NOT EXISTS `wow_character_identities_expiry_idx` ON `wow_character_identities` (`expires_at`);

-- Server-side sessions. The cookie carries a random token; only its SHA-256 is
-- stored, so a database read cannot be replayed as a login.
CREATE TABLE IF NOT EXISTS `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX IF NOT EXISTS `sessions_account_idx` ON `sessions` (`account_id`);
CREATE INDEX IF NOT EXISTS `sessions_expiry_idx` ON `sessions` (`expires_at`);

-- Server-generated OAuth `state`, stored hashed and single-use so a restart or a
-- second replica cannot be tricked into accepting a state it never issued.
CREATE TABLE IF NOT EXISTS `oauth_states` (
	`id` text PRIMARY KEY NOT NULL,
	`redirect_to` text DEFAULT '/' NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
CREATE INDEX IF NOT EXISTS `oauth_states_expiry_idx` ON `oauth_states` (`expires_at`);
