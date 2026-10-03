CREATE TABLE `forum_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `forum_limits_expiry` ON `forum_limits` (`expires_at`);--> statement-breakpoint
CREATE TABLE `forum_replies` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`message` text NOT NULL,
	`author` text NOT NULL,
	`owner_hash` text NOT NULL,
	`payload_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`deleted` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `forum_threads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `forum_replies_thread_created` ON `forum_replies` (`thread_id`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `forum_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`course` text NOT NULL,
	`kind` text NOT NULL,
	`subject` text NOT NULL,
	`message` text NOT NULL,
	`author` text NOT NULL,
	`owner_hash` text NOT NULL,
	`payload_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `forum_threads_course_updated` ON `forum_threads` (`course`,`updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `forum_threads_updated` ON `forum_threads` (`updated_at`,`id`);