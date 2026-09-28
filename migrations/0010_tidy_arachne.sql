CREATE TABLE `person_credit` (
	`id` text PRIMARY KEY NOT NULL,
	`personId` text NOT NULL,
	`targetKind` text NOT NULL,
	`targetId` text NOT NULL,
	`creditedAs` text NOT NULL,
	`role` text NOT NULL,
	`sourceId` text NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`personId`) REFERENCES `person`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sourceId`) REFERENCES `catalog_source`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `person_credit_target_idx` ON `person_credit` (`targetKind`,`targetId`);--> statement-breakpoint
CREATE INDEX `person_credit_person_idx` ON `person_credit` (`personId`);