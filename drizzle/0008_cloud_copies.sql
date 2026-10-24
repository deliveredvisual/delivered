CREATE TABLE `cloud_folders` (
	`project_id` text NOT NULL,
	`provider` text NOT NULL,
	`path` text NOT NULL,
	`remote` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cloud_folders_unique` ON `cloud_folders` (`project_id`,`provider`,`path`);--> statement-breakpoint
CREATE TABLE `cloud_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`studio_id` text NOT NULL,
	`project_id` text NOT NULL,
	`provider` text NOT NULL,
	`kind` text DEFAULT 'file' NOT NULL,
	`r2_key` text DEFAULT '' NOT NULL,
	`folder` text DEFAULT '' NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`size` integer DEFAULT 0 NOT NULL,
	`offset` integer DEFAULT 0 NOT NULL,
	`session` text,
	`status` text DEFAULT 'waiting' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`error` text,
	`next_at` integer NOT NULL,
	`lease_until` integer,
	`created_at` integer NOT NULL,
	`done_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cloud_jobs_unique` ON `cloud_jobs` (`provider`,`project_id`,`kind`,`r2_key`);--> statement-breakpoint
CREATE INDEX `cloud_jobs_waiting` ON `cloud_jobs` (`status`,`next_at`);--> statement-breakpoint
CREATE INDEX `cloud_jobs_project` ON `cloud_jobs` (`project_id`,`provider`,`status`);--> statement-breakpoint
CREATE TABLE `cloud_links` (
	`studio_id` text NOT NULL,
	`provider` text NOT NULL,
	`account` text DEFAULT '' NOT NULL,
	`refresh_token` text NOT NULL,
	`access_token` text,
	`access_expires` integer,
	`root_id` text,
	`connected_by` text DEFAULT '' NOT NULL,
	`error` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`studio_id`) REFERENCES `studios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cloud_links_unique` ON `cloud_links` (`studio_id`,`provider`);