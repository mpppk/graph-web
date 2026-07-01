ALTER TABLE `graphs` ADD `template_id` text;--> statement-breakpoint
CREATE TABLE `graph_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_type` text NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `graph_templates_owner_name_unique` ON `graph_templates` (`owner_type`,`owner_id`,`name`);--> statement-breakpoint
CREATE TABLE `template_node_types` (
	`id` text PRIMARY KEY NOT NULL,
	`template_id` text NOT NULL,
	`node_type_id` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`template_id`) REFERENCES `graph_templates`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`node_type_id`) REFERENCES `node_types`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `template_node_types_template_node_unique` ON `template_node_types` (`template_id`,`node_type_id`);
