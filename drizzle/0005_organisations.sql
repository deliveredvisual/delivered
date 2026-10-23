CREATE TABLE `org_deliveries` (
	`org_id` text NOT NULL,
	`project_id` text NOT NULL,
	`added_by` text,
	`saved_at` integer NOT NULL,
	`opened_at` integer,
	FOREIGN KEY (`org_id`) REFERENCES `studios`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `org_deliveries_unique` ON `org_deliveries` (`org_id`,`project_id`);--> statement-breakpoint
CREATE INDEX `org_deliveries_project` ON `org_deliveries` (`project_id`);--> statement-breakpoint
ALTER TABLE `studios` ADD `creative` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `studios` ADD `client` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `studios` ADD `primary_view` text DEFAULT 'creative' NOT NULL;--> statement-breakpoint
-- Everyone who signed up as a client gets their own organisation (named after their company, or themselves).
INSERT INTO `studios` (`id`, `name`, `email`, `status`, `created_at`, `creative`, `client`, `primary_view`)
SELECT 'org_' || `u`.`id`, CASE WHEN `u`.`company` <> '' THEN `u`.`company` ELSE `u`.`name` END, '', 'pending', `u`.`created_at`, false, true, 'client'
FROM `users` `u`
WHERE NOT EXISTS (SELECT 1 FROM `memberships` `m` WHERE `m`.`user_id` = `u`.`id`);--> statement-breakpoint
INSERT INTO `memberships` (`studio_id`, `user_id`, `role`, `created_at`)
SELECT 'org_' || `u`.`id`, `u`.`id`, 'owner', `u`.`created_at`
FROM `users` `u`
WHERE NOT EXISTS (SELECT 1 FROM `memberships` `m` WHERE `m`.`user_id` = `u`.`id`);--> statement-breakpoint
-- Deliveries people had on their own page now belong to their organisation.
INSERT OR IGNORE INTO `org_deliveries` (`org_id`, `project_id`, `added_by`, `saved_at`, `opened_at`)
SELECT `m`.`studio_id`, `s`.`project_id`, MAX(`s`.`invited_by`), MIN(`s`.`saved_at`), MAX(`s`.`opened_at`)
FROM `saved_deliveries` `s`
JOIN `memberships` `m` ON `m`.`user_id` = `s`.`user_id`
JOIN `projects` `p` ON `p`.`id` = `s`.`project_id`
WHERE `p`.`studio_id` <> `m`.`studio_id`
GROUP BY `m`.`studio_id`, `s`.`project_id`;--> statement-breakpoint
-- Organisations that received deliveries get their client dashboard switched on.
UPDATE `studios` SET `client` = true WHERE `id` IN (SELECT DISTINCT `org_id` FROM `org_deliveries`);--> statement-breakpoint
DROP TABLE `saved_deliveries`;
