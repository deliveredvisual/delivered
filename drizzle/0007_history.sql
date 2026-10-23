ALTER TABLE `events` ADD `side` text DEFAULT 'client' NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `count` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
UPDATE `events` SET `side` = 'studio' WHERE `action` = 'invite';
