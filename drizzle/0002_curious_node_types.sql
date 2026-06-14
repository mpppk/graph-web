CREATE TABLE `node_types` (
	`id` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`scope_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT '#ffffff' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `node_types_scope_scope_id_name_unique` ON `node_types` (`scope`,`scope_id`,`name`);--> statement-breakpoint
CREATE TABLE `node_type_fields` (
	`id` text PRIMARY KEY NOT NULL,
	`node_type_id` text NOT NULL,
	`key` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`node_type_id`) REFERENCES `node_types`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `node_type_fields_node_type_id_key_unique` ON `node_type_fields` (`node_type_id`,`key`);
