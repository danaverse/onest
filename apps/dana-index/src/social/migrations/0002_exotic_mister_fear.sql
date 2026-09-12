CREATE TABLE `profile_media` (
	`pet_root_txid` text PRIMARY KEY NOT NULL,
	`avatar_sha256` text,
	`banner_sha256` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`avatar_sha256`) REFERENCES `media`(`sha256`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`banner_sha256`) REFERENCES `media`(`sha256`) ON UPDATE no action ON DELETE no action
);
