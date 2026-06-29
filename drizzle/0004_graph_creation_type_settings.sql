CREATE TABLE `graph_creation_type_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`graph_id` text NOT NULL,
	`type_name` text NOT NULL,
	`enabled` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`graph_id`) REFERENCES `graphs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `graph_creation_type_settings_graph_id_type_name_unique` ON `graph_creation_type_settings` (`graph_id`,`type_name`);
