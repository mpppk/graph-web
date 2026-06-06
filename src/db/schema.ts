import { sql } from "drizzle-orm";
import {
	integer,
	real,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const todos = sqliteTable("todos", {
	id: integer({ mode: "number" }).primaryKey({
		autoIncrement: true,
	}),
	title: text().notNull(),
	createdAt: integer("created_at", { mode: "timestamp" }).default(
		sql`(unixepoch())`,
	),
});

export const graphs = sqliteTable("graphs", {
	id: text("id").primaryKey(),
	userId: text("user_id").notNull(),
	name: text("name").notNull(),
	description: text("description").notNull().default(""),
	createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

export const nodes = sqliteTable("nodes", {
	id: text("id").primaryKey(),
	graphId: text("graph_id")
		.notNull()
		.references(() => graphs.id, { onDelete: "cascade" }),
	label: text("label").notNull(),
	x: real("x").notNull().default(0),
	y: real("y").notNull().default(0),
	nodeType: text("node_type"),
	createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

export const edges = sqliteTable("edges", {
	id: text("id").primaryKey(),
	graphId: text("graph_id")
		.notNull()
		.references(() => graphs.id, { onDelete: "cascade" }),
	sourceNodeId: text("source_node_id")
		.notNull()
		.references(() => nodes.id, { onDelete: "cascade" }),
	targetNodeId: text("target_node_id")
		.notNull()
		.references(() => nodes.id, { onDelete: "cascade" }),
	label: text("label").notNull().default(""),
	createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

export const nodeMetadata = sqliteTable(
	"node_metadata",
	{
		id: text("id").primaryKey(),
		nodeId: text("node_id")
			.notNull()
			.references(() => nodes.id, { onDelete: "cascade" }),
		key: text("key").notNull(),
		value: text("value").notNull().default(""),
		createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
	},
	(t) => [uniqueIndex("node_metadata_node_id_key_unique").on(t.nodeId, t.key)],
);
