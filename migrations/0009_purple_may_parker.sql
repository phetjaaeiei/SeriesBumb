CREATE TABLE `artist_relation` (
	`id` text PRIMARY KEY NOT NULL,
	`artistId` text NOT NULL,
	`relatedArtistId` text NOT NULL,
	`relationType` text NOT NULL,
	`sourceId` text NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`artistId`) REFERENCES `artist`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`relatedArtistId`) REFERENCES `artist`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sourceId`) REFERENCES `catalog_source`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `artist_relation_unique` ON `artist_relation` (`artistId`,`relatedArtistId`,`relationType`);--> statement-breakpoint
CREATE INDEX `artist_relation_related_idx` ON `artist_relation` (`relatedArtistId`);--> statement-breakpoint
CREATE TABLE `tape_edition` (
	`id` text PRIMARY KEY NOT NULL,
	`tapeId` text NOT NULL,
	`relatedTapeId` text NOT NULL,
	`format` text NOT NULL,
	`editionYear` integer,
	`note` text DEFAULT '' NOT NULL,
	`sourceId` text NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`tapeId`) REFERENCES `tape`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`relatedTapeId`) REFERENCES `tape`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sourceId`) REFERENCES `catalog_source`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tape_edition_unique` ON `tape_edition` (`tapeId`,`relatedTapeId`);--> statement-breakpoint
CREATE INDEX `tape_edition_related_idx` ON `tape_edition` (`relatedTapeId`);