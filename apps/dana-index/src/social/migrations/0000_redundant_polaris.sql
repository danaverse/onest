CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`author_install` text NOT NULL,
	`author_address` text,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	`removed` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `comments_post_idx` ON `comments` (`post_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `ingest_state` (
	`key` text PRIMARY KEY NOT NULL,
	`last_seen_txid` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `media` (
	`sha256` text PRIMARY KEY NOT NULL,
	`mime` text NOT NULL,
	`bytes` integer NOT NULL,
	`object_key` text NOT NULL,
	`width` integer,
	`height` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `media_created_idx` ON `media` (`created_at`);--> statement-breakpoint
CREATE TABLE `post_media` (
	`post_id` text NOT NULL,
	`sha256` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`post_id`, `sha256`),
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sha256`) REFERENCES `media`(`sha256`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `posts` (
	`id` text PRIMARY KEY NOT NULL,
	`pet_root_txid` text NOT NULL,
	`author_install` text NOT NULL,
	`author_address` text,
	`caption` text DEFAULT '' NOT NULL,
	`content_hash` text NOT NULL,
	`anchor_txid` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`anchored_at` integer,
	`upvote_atoms` integer DEFAULT 0 NOT NULL,
	`downvote_atoms` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `posts_content_hash_idx` ON `posts` (`content_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `posts_anchor_txid_idx` ON `posts` (`anchor_txid`);--> statement-breakpoint
CREATE INDEX `posts_created_idx` ON `posts` (`created_at`);--> statement-breakpoint
CREATE INDEX `posts_status_created_idx` ON `posts` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `posts_pet_root_idx` ON `posts` (`pet_root_txid`);--> statement-breakpoint
CREATE TABLE `votes` (
	`txid` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`direction` integer NOT NULL,
	`atoms` integer NOT NULL,
	`burned_by` text NOT NULL,
	`voter_install` text,
	`block_height` integer,
	`voted_at` integer NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `votes_post_idx` ON `votes` (`post_id`);--> statement-breakpoint
CREATE INDEX `votes_voted_at_idx` ON `votes` (`voted_at`);--> statement-breakpoint
CREATE VIRTUAL TABLE `posts_fts` USING fts5(
	`id` UNINDEXED,
	`caption`,
	`pet_root_txid` UNINDEXED,
	tokenize = 'unicode61 remove_diacritics 2'
);--> statement-breakpoint
INSERT INTO `posts_fts` (`id`, `caption`, `pet_root_txid`)
	SELECT `id`, `caption`, `pet_root_txid` FROM `posts`;--> statement-breakpoint
CREATE TRIGGER `posts_fts_ai` AFTER INSERT ON `posts` BEGIN
	INSERT INTO `posts_fts` (`id`, `caption`, `pet_root_txid`)
	VALUES (new.`id`, new.`caption`, new.`pet_root_txid`);
END;--> statement-breakpoint
CREATE TRIGGER `posts_fts_ad` AFTER DELETE ON `posts` BEGIN
	DELETE FROM `posts_fts` WHERE `id` = old.`id`;
END;--> statement-breakpoint
CREATE TRIGGER `posts_fts_au` AFTER UPDATE OF `caption`, `pet_root_txid` ON `posts` BEGIN
	DELETE FROM `posts_fts` WHERE `id` = old.`id`;
	INSERT INTO `posts_fts` (`id`, `caption`, `pet_root_txid`)
	VALUES (new.`id`, new.`caption`, new.`pet_root_txid`);
END;