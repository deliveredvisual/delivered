ALTER TABLE `saved_deliveries` ADD `invited_by` text;--> statement-breakpoint
ALTER TABLE `saved_deliveries` ADD `opened_at` integer;--> statement-breakpoint
CREATE INDEX `saved_project` ON `saved_deliveries` (`project_id`);--> statement-breakpoint
UPDATE `saved_deliveries` SET `opened_at` = `saved_at` WHERE `invited_by` IS NULL;
