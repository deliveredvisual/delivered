CREATE TABLE `client_folder_photos` (
	`folder_id` text NOT NULL,
	`photo_id` text NOT NULL,
	`added_at` integer NOT NULL,
	FOREIGN KEY (`folder_id`) REFERENCES `client_folders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`photo_id`) REFERENCES `photos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `client_folder_photos_unique` ON `client_folder_photos` (`folder_id`,`photo_id`);--> statement-breakpoint
CREATE TABLE `client_folders` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`created_by` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `client_folders_project` ON `client_folders` (`project_id`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`author` text NOT NULL,
	`from_studio` integer DEFAULT false NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`pins` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `messages_project` ON `messages` (`project_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `projects` ADD `landing_layout` text DEFAULT 'collage' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `landing_bg` text DEFAULT '#ffffff' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `landing_cover_id` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `landing_intro` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `landing_spacing` text DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `landing_group_folders` integer DEFAULT true NOT NULL;