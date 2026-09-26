CREATE TABLE `audio_download_usage` (
	`provider` text NOT NULL,
	`day` text NOT NULL,
	`bytes` integer DEFAULT 0 NOT NULL,
	`requests` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`provider`, `day`),
	CONSTRAINT "audio_download_bytes_check" CHECK("audio_download_usage"."bytes" >= 0),
	CONSTRAINT "audio_download_requests_check" CHECK("audio_download_usage"."requests" >= 0)
);
--> statement-breakpoint
CREATE TABLE `audio_file` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`filename` text NOT NULL,
	`provider` text NOT NULL,
	`size` integer NOT NULL,
	`contentType` text NOT NULL,
	`objectKey` text,
	`driveUrl` text,
	`note` text,
	`songId` text,
	`tapeId` text,
	`status` text NOT NULL,
	`createdBy` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`songId`) REFERENCES `song`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`tapeId`) REFERENCES `tape`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`createdBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "audio_file_provider_check" CHECK("audio_file"."provider" IN ('supabase', 'firebase', 'drive')),
	CONSTRAINT "audio_file_size_check" CHECK("audio_file"."size" >= 0),
	CONSTRAINT "audio_file_status_check" CHECK("audio_file"."status" IN ('pending', 'uploading', 'ready', 'failed', 'deleting')),
	CONSTRAINT "audio_file_location_check" CHECK(("audio_file"."provider" = 'drive' AND "audio_file"."driveUrl" IS NOT NULL AND "audio_file"."objectKey" IS NULL) OR ("audio_file"."provider" != 'drive' AND "audio_file"."driveUrl" IS NULL AND "audio_file"."objectKey" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `audio_file_created_id_idx` ON `audio_file` (`createdAt`,`id`);--> statement-breakpoint
CREATE INDEX `audio_file_provider_status_idx` ON `audio_file` (`provider`,`status`);--> statement-breakpoint
CREATE INDEX `audio_file_song_idx` ON `audio_file` (`songId`);--> statement-breakpoint
CREATE INDEX `audio_file_tape_idx` ON `audio_file` (`tapeId`);
