-- 0001_baseline
--
-- The pre-migration schema, expressed so it is safe on BOTH a fresh database
-- and the databases that were previously created with `drizzle-kit push`.
-- Every statement here is a CREATE ... IF NOT EXISTS, so applying it to an
-- already-populated deployment is a no-op.
--
-- Columns that were added to live databases by hand before this migration
-- system existed (builds.blueprint_scope, builds.last_verified_at,
-- decor_items.record_id, decor_items.tags) are reconciled by the runner's
-- baseline column repair — see src/lib/server/db/apply-migrations.js.

CREATE TABLE IF NOT EXISTS `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
CREATE INDEX IF NOT EXISTS `users_name_idx` ON `users` (`name`);

CREATE TABLE IF NOT EXISTS `builds` (
	`id` text PRIMARY KEY NOT NULL,
	`share_code` text NOT NULL,
	`code_status` text DEFAULT 'unverified' NOT NULL,
	`blueprint_type` text DEFAULT 'House' NOT NULL,
	`blueprint_scope` text,
	`faction` text,
	`title` text NOT NULL,
	`description` text DEFAULT '',
	`author_id` text,
	`manifest` text NOT NULL,
	`placement_data` text,
	`last_verified_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
CREATE UNIQUE INDEX IF NOT EXISTS `builds_share_code_idx` ON `builds` (`share_code`);
CREATE INDEX IF NOT EXISTS `builds_type_idx` ON `builds` (`blueprint_type`);
CREATE INDEX IF NOT EXISTS `builds_faction_idx` ON `builds` (`faction`);

CREATE TABLE IF NOT EXISTS `likes` (
	`build_id` text NOT NULL,
	`client_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`build_id`, `client_id`),
	FOREIGN KEY (`build_id`) REFERENCES `builds`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX IF NOT EXISTS `likes_build_idx` ON `likes` (`build_id`);

CREATE TABLE IF NOT EXISTS `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category` text DEFAULT ''
);
CREATE INDEX IF NOT EXISTS `tags_name_idx` ON `tags` (`name`);

CREATE TABLE IF NOT EXISTS `build_tags` (
	`build_id` text NOT NULL,
	`tag_id` text NOT NULL,
	FOREIGN KEY (`build_id`) REFERENCES `builds`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX IF NOT EXISTS `build_tags_build_idx` ON `build_tags` (`build_id`);
CREATE INDEX IF NOT EXISTS `build_tags_tag_idx` ON `build_tags` (`tag_id`);

CREATE TABLE IF NOT EXISTS `screenshots` (
	`id` text PRIMARY KEY NOT NULL,
	`build_id` text NOT NULL,
	`url` text NOT NULL,
	`caption` text DEFAULT '',
	`is_primary` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`build_id`) REFERENCES `builds`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX IF NOT EXISTS `screenshots_build_idx` ON `screenshots` (`build_id`);

CREATE TABLE IF NOT EXISTS `decor_items` (
	`item_id` integer PRIMARY KEY NOT NULL,
	`record_id` integer,
	`name` text NOT NULL,
	`icon` text DEFAULT '',
	`category` text DEFAULT '',
	`source` text DEFAULT '',
	`expansion` text DEFAULT '',
	`tags` text DEFAULT '[]' NOT NULL,
	`updated_at` integer NOT NULL
);
CREATE INDEX IF NOT EXISTS `decor_items_record_id_idx` ON `decor_items` (`record_id`);
