CREATE TABLE `category_budgets` (
	`trip_id` integer NOT NULL,
	`category_key` text NOT NULL,
	`target_aud_cents` integer NOT NULL,
	PRIMARY KEY(`trip_id`, `category_key`),
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `itinerary_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trip_id` integer NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`city` text NOT NULL,
	`country` text NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `transaction_overrides` (
	`txn_id` text NOT NULL,
	`trip_id` integer NOT NULL,
	`excluded` integer NOT NULL,
	`notes` text,
	PRIMARY KEY(`txn_id`, `trip_id`),
	FOREIGN KEY (`txn_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` integer NOT NULL,
	`source` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`amount_aud_cents` integer NOT NULL,
	`foreign_amount` numeric,
	`foreign_currency` text,
	`description` text NOT NULL,
	`up_category_parent` text,
	`up_category_child` text,
	`is_transfer` integer DEFAULT 0 NOT NULL,
	`is_atm` integer DEFAULT 0 NOT NULL,
	`counts_as_spend` integer DEFAULT 1 NOT NULL,
	`raw` text,
	`synced_at` integer NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `transactions_trip_time` ON `transactions` (`trip_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `trips` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text,
	`budget_aud_cents` integer NOT NULL,
	`is_active` integer NOT NULL,
	`created_at` integer NOT NULL,
	`archived_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trips_one_active` ON `trips` (`is_active`) WHERE "trips"."is_active" = 1;