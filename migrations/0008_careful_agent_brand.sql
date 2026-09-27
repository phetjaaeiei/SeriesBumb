CREATE TABLE `person` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`bio` text DEFAULT '' NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `person_slug_unique` ON `person` (`slug`);--> statement-breakpoint
ALTER TABLE `artist_member` ADD `personId` text REFERENCES person(id);--> statement-breakpoint
ALTER TABLE `artist_member` ADD `sourceId` text REFERENCES catalog_source(id);--> statement-breakpoint
CREATE INDEX `artist_member_person_idx` ON `artist_member` (`personId`);