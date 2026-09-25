CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`accountId` text NOT NULL,
	`providerId` text NOT NULL,
	`userId` text NOT NULL,
	`accessToken` text,
	`refreshToken` text,
	`idToken` text,
	`accessTokenExpiresAt` integer,
	`refreshTokenExpiresAt` integer,
	`scope` text,
	`password` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_user_id_idx` ON `account` (`userId`);--> statement-breakpoint
CREATE INDEX `account_provider_account_idx` ON `account` (`providerId`,`accountId`);--> statement-breakpoint
CREATE TABLE `artist` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`nameAlt` text,
	`nameSort` text NOT NULL,
	`artistType` text,
	`status` text DEFAULT 'unknown' NOT NULL,
	`province` text,
	`yearsActive` text,
	`bio` text DEFAULT '' NOT NULL,
	`imageKey` text,
	`imageBytes` integer DEFAULT 0 NOT NULL,
	`publishedTapeCount` integer DEFAULT 0 NOT NULL,
	`createdBy` text,
	`createdAt` integer NOT NULL,
	`updatedBy` text,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`createdBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updatedBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `artist_slug_unique` ON `artist` (`slug`);--> statement-breakpoint
CREATE INDEX `artist_name_sort_id_idx` ON `artist` (`nameSort`,`id`);--> statement-breakpoint
CREATE INDEX `artist_province_name_sort_id_idx` ON `artist` (`province`,`nameSort`,`id`);--> statement-breakpoint
CREATE TABLE `artist_member` (
	`id` text PRIMARY KEY NOT NULL,
	`artistId` text NOT NULL,
	`name` text NOT NULL,
	`role` text DEFAULT '' NOT NULL,
	`years` text,
	`isCurrent` integer DEFAULT false NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`artistId`) REFERENCES `artist`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `artist_member_artist_position_idx` ON `artist_member` (`artistId`,`position`);--> statement-breakpoint
CREATE TABLE `collection` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`coverKey` text,
	`imageBytes` integer DEFAULT 0 NOT NULL,
	`isFeatured` integer DEFAULT false NOT NULL,
	`position` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`createdBy` text,
	`createdAt` integer NOT NULL,
	`updatedBy` text,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`createdBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updatedBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `collection_slug_unique` ON `collection` (`slug`);--> statement-breakpoint
CREATE INDEX `collection_status_position_idx` ON `collection` (`status`,`position`);--> statement-breakpoint
CREATE TABLE `collection_item` (
	`collectionId` text NOT NULL,
	`tapeId` text NOT NULL,
	`position` integer NOT NULL,
	`note` text,
	PRIMARY KEY(`collectionId`, `tapeId`),
	FOREIGN KEY (`collectionId`) REFERENCES `collection`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tapeId`) REFERENCES `tape`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `collection_item_tape_idx` ON `collection_item` (`tapeId`);--> statement-breakpoint
CREATE INDEX `collection_item_collection_position_idx` ON `collection_item` (`collectionId`,`position`);--> statement-breakpoint
CREATE TABLE `comment` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`tapeId` text,
	`songId` text,
	`body` text NOT NULL,
	`createdAt` integer NOT NULL,
	`deletedAt` integer,
	`deletedBy` text,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tapeId`) REFERENCES `tape`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`songId`) REFERENCES `song`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`deletedBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "comment_exactly_one_target" CHECK(("comment"."tapeId" IS NOT NULL) <> ("comment"."songId" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `comment_tape_created_id_idx` ON `comment` (`tapeId`,`createdAt`,`id`);--> statement-breakpoint
CREATE INDEX `comment_song_created_id_idx` ON `comment` (`songId`,`createdAt`,`id`);--> statement-breakpoint
CREATE INDEX `comment_user_created_idx` ON `comment` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `comment_created_id_idx` ON `comment` (`createdAt`,`id`);--> statement-breakpoint
CREATE TABLE `genre` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`position` integer NOT NULL,
	`publishedTapeCount` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `genre_slug_unique` ON `genre` (`slug`);--> statement-breakpoint
CREATE INDEX `genre_position_idx` ON `genre` (`position`);--> statement-breakpoint
CREATE TABLE `label` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`nameAlt` text,
	`nameSort` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`logoKey` text,
	`imageBytes` integer DEFAULT 0 NOT NULL,
	`publishedTapeCount` integer DEFAULT 0 NOT NULL,
	`createdBy` text,
	`createdAt` integer NOT NULL,
	`updatedBy` text,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`createdBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updatedBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `label_slug_unique` ON `label` (`slug`);--> statement-breakpoint
CREATE INDEX `label_name_sort_id_idx` ON `label` (`nameSort`,`id`);--> statement-breakpoint
CREATE TABLE `redirect` (
	`fromPath` text PRIMARY KEY NOT NULL,
	`toPath` text NOT NULL,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `redirect_to_path_idx` ON `redirect` (`toPath`);--> statement-breakpoint
CREATE TABLE `search_doc` (
	`docId` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`refId` text NOT NULL,
	`isPublic` integer DEFAULT false NOT NULL,
	`nameKey` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `search_doc_kind_ref_uq` ON `search_doc` (`kind`,`refId`);--> statement-breakpoint
CREATE INDEX `search_doc_public_kind_name_idx` ON `search_doc` (`isPublic`,`kind`,`nameKey`);--> statement-breakpoint
CREATE TABLE `search_queue` (
	`kind` text NOT NULL,
	`refId` text NOT NULL,
	PRIMARY KEY(`kind`, `refId`)
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expiresAt` integer NOT NULL,
	`token` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`ipAddress` text,
	`userAgent` text,
	`userId` text NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_user_id_idx` ON `session` (`userId`);--> statement-breakpoint
CREATE TABLE `site_stats` (
	`id` integer PRIMARY KEY NOT NULL,
	`tapeCount` integer DEFAULT 0 NOT NULL,
	`publishedTapeCount` integer DEFAULT 0 NOT NULL,
	`songCount` integer DEFAULT 0 NOT NULL,
	`userCount` integer DEFAULT 0 NOT NULL,
	`imageBytes` integer DEFAULT 0 NOT NULL,
	`reindexCursor` text,
	`reindexDay` text,
	`reindexRowsWritten` integer DEFAULT 0 NOT NULL,
	`updatedAt` integer NOT NULL,
	CONSTRAINT "site_stats_single_row" CHECK("site_stats"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `song` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`titleAlt` text,
	`titleSort` text NOT NULL,
	`lyricist` text,
	`composer` text,
	`arranger` text,
	`notes` text,
	`lyrics` text,
	`likeCount` integer DEFAULT 0 NOT NULL,
	`commentCount` integer DEFAULT 0 NOT NULL,
	`publishedTapeCount` integer DEFAULT 0 NOT NULL,
	`createdBy` text,
	`createdAt` integer NOT NULL,
	`updatedBy` text,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`createdBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updatedBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `song_slug_unique` ON `song` (`slug`);--> statement-breakpoint
CREATE INDEX `song_updated_at_id_idx` ON `song` (`updatedAt`,`id`);--> statement-breakpoint
CREATE TABLE `song_artist` (
	`songId` text NOT NULL,
	`artistId` text NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`songId`, `artistId`),
	FOREIGN KEY (`songId`) REFERENCES `song`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`artistId`) REFERENCES `artist`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `song_artist_artist_song_idx` ON `song_artist` (`artistId`,`songId`);--> statement-breakpoint
CREATE INDEX `song_artist_song_position_idx` ON `song_artist` (`songId`,`position`);--> statement-breakpoint
CREATE TABLE `song_like` (
	`userId` text NOT NULL,
	`songId` text NOT NULL,
	`createdAt` integer NOT NULL,
	PRIMARY KEY(`userId`, `songId`),
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`songId`) REFERENCES `song`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `song_like_song_idx` ON `song_like` (`songId`);--> statement-breakpoint
CREATE INDEX `song_like_user_created_song_idx` ON `song_like` (`userId`,`createdAt`,`songId`);--> statement-breakpoint
CREATE TABLE `tape` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`slugLocked` integer DEFAULT false NOT NULL,
	`title` text NOT NULL,
	`titleAlt` text,
	`titleSort` text NOT NULL,
	`labelId` text,
	`year` integer,
	`yearSort` integer DEFAULT 9999 NOT NULL,
	`decade` integer,
	`releaseType` text NOT NULL,
	`catalogNo` text,
	`description` text DEFAULT '' NOT NULL,
	`reelUrl` text,
	`isRare` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`publishedAt` integer,
	`coverImageId` text,
	`coverThumbKey` text,
	`ogImageKey` text,
	`ogImageBytes` integer DEFAULT 0 NOT NULL,
	`ogSourceImageId` text,
	`ogSourceTitle` text,
	`likeCount` integer DEFAULT 0 NOT NULL,
	`ownerCount` integer DEFAULT 0 NOT NULL,
	`commentCount` integer DEFAULT 0 NOT NULL,
	`createdBy` text,
	`createdAt` integer NOT NULL,
	`updatedBy` text,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`labelId`) REFERENCES `label`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`coverImageId`) REFERENCES `tape_image`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`ogSourceImageId`) REFERENCES `tape_image`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`createdBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updatedBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tape_slug_unique` ON `tape` (`slug`);--> statement-breakpoint
CREATE INDEX `tape_status_published_at_id_idx` ON `tape` (`status`,`publishedAt`,`id`);--> statement-breakpoint
CREATE INDEX `tape_status_year_sort_id_idx` ON `tape` (`status`,`yearSort`,`id`);--> statement-breakpoint
CREATE INDEX `tape_status_title_sort_id_idx` ON `tape` (`status`,`titleSort`,`id`);--> statement-breakpoint
CREATE INDEX `tape_status_owner_count_published_at_id_idx` ON `tape` (`status`,`ownerCount`,`publishedAt`,`id`);--> statement-breakpoint
CREATE INDEX `tape_status_updated_at_id_idx` ON `tape` (`status`,`updatedAt`,`id`);--> statement-breakpoint
CREATE INDEX `tape_updated_at_id_idx` ON `tape` (`updatedAt`,`id`);--> statement-breakpoint
CREATE INDEX `tape_status_decade_published_at_id_idx` ON `tape` (`status`,`decade`,`publishedAt`,`id`);--> statement-breakpoint
CREATE INDEX `tape_label_status_published_at_id_idx` ON `tape` (`labelId`,`status`,`publishedAt`,`id`);--> statement-breakpoint
CREATE INDEX `tape_label_status_year_sort_id_idx` ON `tape` (`labelId`,`status`,`yearSort`,`id`);--> statement-breakpoint
CREATE INDEX `tape_status_release_type_published_at_id_idx` ON `tape` (`status`,`releaseType`,`publishedAt`,`id`);--> statement-breakpoint
CREATE TABLE `tape_artist` (
	`tapeId` text NOT NULL,
	`artistId` text NOT NULL,
	`position` integer NOT NULL,
	`isPublished` integer DEFAULT false NOT NULL,
	`yearSort` integer DEFAULT 9999 NOT NULL,
	PRIMARY KEY(`tapeId`, `artistId`),
	FOREIGN KEY (`tapeId`) REFERENCES `tape`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`artistId`) REFERENCES `artist`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `tape_artist_artist_published_year_tape_idx` ON `tape_artist` (`artistId`,`isPublished`,`yearSort`,`tapeId`);--> statement-breakpoint
CREATE INDEX `tape_artist_tape_position_idx` ON `tape_artist` (`tapeId`,`position`);--> statement-breakpoint
CREATE TABLE `tape_genre` (
	`tapeId` text NOT NULL,
	`genreId` text NOT NULL,
	`isPublished` integer DEFAULT false NOT NULL,
	`publishedAt` integer,
	PRIMARY KEY(`tapeId`, `genreId`),
	FOREIGN KEY (`tapeId`) REFERENCES `tape`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`genreId`) REFERENCES `genre`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `tape_genre_genre_published_at_tape_idx` ON `tape_genre` (`genreId`,`isPublished`,`publishedAt`,`tapeId`);--> statement-breakpoint
CREATE TABLE `tape_image` (
	`id` text PRIMARY KEY NOT NULL,
	`tapeId` text NOT NULL,
	`kind` text NOT NULL,
	`fullKey` text NOT NULL,
	`thumbKey` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`bytes` integer NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`tapeId`) REFERENCES `tape`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tape_image_tape_position_idx` ON `tape_image` (`tapeId`,`position`);--> statement-breakpoint
CREATE TABLE `tape_like` (
	`userId` text NOT NULL,
	`tapeId` text NOT NULL,
	`createdAt` integer NOT NULL,
	PRIMARY KEY(`userId`, `tapeId`),
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tapeId`) REFERENCES `tape`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tape_like_tape_idx` ON `tape_like` (`tapeId`);--> statement-breakpoint
CREATE INDEX `tape_like_user_created_tape_idx` ON `tape_like` (`userId`,`createdAt`,`tapeId`);--> statement-breakpoint
CREATE TABLE `tape_owner` (
	`userId` text NOT NULL,
	`tapeId` text NOT NULL,
	`createdAt` integer NOT NULL,
	PRIMARY KEY(`userId`, `tapeId`),
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tapeId`) REFERENCES `tape`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tape_owner_tape_idx` ON `tape_owner` (`tapeId`);--> statement-breakpoint
CREATE INDEX `tape_owner_user_created_tape_idx` ON `tape_owner` (`userId`,`createdAt`,`tapeId`);--> statement-breakpoint
CREATE TABLE `tape_track` (
	`id` text PRIMARY KEY NOT NULL,
	`tapeId` text NOT NULL,
	`songId` text NOT NULL,
	`side` text NOT NULL,
	`position` integer NOT NULL,
	`durationSec` integer,
	`note` text,
	FOREIGN KEY (`tapeId`) REFERENCES `tape`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`songId`) REFERENCES `song`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "tape_track_position_positive" CHECK("tape_track"."position" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tape_track_tape_side_position_uq` ON `tape_track` (`tapeId`,`side`,`position`);--> statement-breakpoint
CREATE INDEX `tape_track_song_idx` ON `tape_track` (`songId`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`emailVerified` integer DEFAULT false NOT NULL,
	`image` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`commentBanned` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`createdAt` integer,
	`updatedAt` integer
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);
--> statement-breakpoint
PRAGMA optimize;
