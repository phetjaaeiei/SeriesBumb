CREATE TABLE `catalog_submission` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`targetKind` text NOT NULL,
	`targetId` text NOT NULL,
	`proposedChange` text NOT NULL,
	`sourceUrl` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`createdAt` integer NOT NULL,
	`reviewedAt` integer,
	`reviewedBy` text,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewedBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `catalog_submission_status_created_idx` ON `catalog_submission` (`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `catalog_submission_user_created_idx` ON `catalog_submission` (`userId`,`createdAt`);--> statement-breakpoint
CREATE TABLE `review` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`tapeId` text NOT NULL,
	`body` text NOT NULL,
	`rating` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`createdAt` integer NOT NULL,
	`reviewedAt` integer,
	`reviewedBy` text,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tapeId`) REFERENCES `tape`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewedBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_user_tape_uq` ON `review` (`userId`,`tapeId`);--> statement-breakpoint
CREATE INDEX `review_status_created_idx` ON `review` (`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `review_tape_status_created_idx` ON `review` (`tapeId`,`status`,`createdAt`);