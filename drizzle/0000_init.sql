CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`version_id` text NOT NULL,
	`author` text NOT NULL,
	`org` text DEFAULT '' NOT NULL,
	`timecode` integer NOT NULL,
	`body` text NOT NULL,
	`resolved` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`version_id`) REFERENCES `film_versions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `comments_version` ON `comments` (`version_id`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`viewer` text DEFAULT '' NOT NULL,
	`action` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `events_project` ON `events` (`project_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `film_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`film_id` text NOT NULL,
	`version` integer NOT NULL,
	`file_key` text,
	`poster_key` text,
	`filename` text DEFAULT '' NOT NULL,
	`size` integer DEFAULT 0 NOT NULL,
	`duration` integer,
	`created_at` integer NOT NULL,
	`approved_at` integer,
	`approved_by` text,
	FOREIGN KEY (`film_id`) REFERENCES `films`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `versions_film` ON `film_versions` (`film_id`);--> statement-breakpoint
CREATE TABLE `films` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`title` text NOT NULL,
	`aspect` text DEFAULT '16:9' NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `films_project` ON `films` (`project_id`);--> statement-breakpoint
CREATE TABLE `photos` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`set_id` text,
	`filename` text NOT NULL,
	`width` integer,
	`height` integer,
	`size` integer DEFAULT 0 NOT NULL,
	`original_key` text,
	`preview_key` text,
	`thumb_key` text,
	`raw_key` text,
	`raw_size` integer DEFAULT 0 NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`set_id`) REFERENCES `sets`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `photos_project` ON `photos` (`project_id`);--> statement-breakpoint
CREATE INDEX `photos_set` ON `photos` (`set_id`);--> statement-breakpoint
CREATE TABLE `picks` (
	`project_id` text NOT NULL,
	`photo_id` text NOT NULL,
	`viewer` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`photo_id`) REFERENCES `photos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `picks_unique` ON `picks` (`project_id`,`photo_id`,`viewer`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`client_name` text DEFAULT '' NOT NULL,
	`category` text DEFAULT '' NOT NULL,
	`shot_date` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`password_hash` text,
	`nda` integer DEFAULT false NOT NULL,
	`invoice_paid` integer DEFAULT false NOT NULL,
	`hold_until_paid` integer DEFAULT false NOT NULL,
	`raw_enabled` integer DEFAULT false NOT NULL,
	`licence_usage` text DEFAULT '' NOT NULL,
	`licence_territory` text DEFAULT '' NOT NULL,
	`licence_term` text DEFAULT '' NOT NULL,
	`licence_credit` text DEFAULT '' NOT NULL,
	`licence_terms` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_slug` ON `projects` (`slug`);--> statement-breakpoint
CREATE TABLE `sets` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sets_project` ON `sets` (`project_id`);