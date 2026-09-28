CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`actorUserId` text,
	`actorEmail` text NOT NULL,
	`action` text NOT NULL,
	`targetId` text,
	`status` integer NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`actorUserId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `audit_log_created_idx` ON `audit_log` (`createdAt`,`id`);--> statement-breakpoint
CREATE INDEX `audit_log_actor_created_idx` ON `audit_log` (`actorUserId`,`createdAt`);