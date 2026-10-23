CREATE TABLE `invites` (
	`token` text PRIMARY KEY NOT NULL,
	`studio_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`used_by` text,
	FOREIGN KEY (`studio_id`) REFERENCES `studios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `invites_studio` ON `invites` (`studio_id`);--> statement-breakpoint
CREATE TABLE `memberships` (
	`studio_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`studio_id`) REFERENCES `studios`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `memberships_unique` ON `memberships` (`studio_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `memberships_user` ON `memberships` (`user_id`);--> statement-breakpoint
CREATE TABLE `saved_deliveries` (
	`user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`saved_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `saved_unique` ON `saved_deliveries` (`user_id`,`project_id`);--> statement-breakpoint
CREATE TABLE `signin_failures` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `signin_failures_email` ON `signin_failures` (`email`,`at`);--> statement-breakpoint
CREATE TABLE `studios` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`company` text DEFAULT '' NOT NULL,
	`kind` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email` ON `users` (`email`);--> statement-breakpoint
ALTER TABLE `projects` ADD `studio_id` text DEFAULT 'studio_default' NOT NULL;--> statement-breakpoint
CREATE INDEX `projects_studio` ON `projects` (`studio_id`);--> statement-breakpoint
INSERT INTO `studios` (`id`, `name`, `email`, `status`, `created_at`) VALUES ('studio_default', 'Alec Pender', 'hello@alecpender.com', 'active', CAST(unixepoch('subsec') * 1000 AS INTEGER));
