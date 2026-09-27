CREATE TABLE `catalog_source` (
	`id` text PRIMARY KEY NOT NULL,
	`entityKind` text NOT NULL,
	`entityId` text NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`claim` text NOT NULL,
	`accessedAt` integer NOT NULL,
	`createdBy` text,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`createdBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `catalog_source_entity_idx` ON `catalog_source` (`entityKind`,`entityId`,`createdAt`);--> statement-breakpoint
CREATE UNIQUE INDEX `catalog_source_entity_url_uq` ON `catalog_source` (`entityKind`,`entityId`,`url`);
