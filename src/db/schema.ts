import { sql } from "drizzle-orm";
import {
	integer,
	real,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const graphs = sqliteTable("graphs", {
	id: text("id").primaryKey(),
	userId: text("user_id").notNull(),
	teamId: text("team_id"),
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

// User-definable node types. Scoped so the same definition can be shared at
// different levels. Only "user" and "graph" scopes are implemented for now;
// "org"/"team" are reserved for a future organization/team system.
export const nodeTypes = sqliteTable(
	"node_types",
	{
		id: text("id").primaryKey(),
		// "user" → scopeId is a userId, "graph" → scopeId is a graphId.
		scope: text("scope", {
			enum: ["org", "team", "graph", "user"],
		}).notNull(),
		scopeId: text("scope_id").notNull(),
		name: text("name").notNull(),
		color: text("color").notNull().default("#ffffff"),
		createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
	},
	(t) => [
		uniqueIndex("node_types_scope_scope_id_name_unique").on(
			t.scope,
			t.scopeId,
			t.name,
		),
	],
);

// Per-graph overrides for which node types are selectable when creating a new
// node. Types default to enabled, so only explicit overrides are stored here
// (the absence of a row means the type is enabled for creation).
export const graphCreationTypeSettings = sqliteTable(
	"graph_creation_type_settings",
	{
		id: text("id").primaryKey(),
		graphId: text("graph_id")
			.notNull()
			.references(() => graphs.id, { onDelete: "cascade" }),
		typeName: text("type_name").notNull(),
		enabled: integer("enabled", { mode: "boolean" }).notNull(),
		createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
	},
	(t) => [
		uniqueIndex("graph_creation_type_settings_graph_id_type_name_unique").on(
			t.graphId,
			t.typeName,
		),
	],
);

// The metadata field keys a node type defines. When the type is assigned to a
// node, these keys are added to the node's metadata as empty template entries.
export const nodeTypeFields = sqliteTable(
	"node_type_fields",
	{
		id: text("id").primaryKey(),
		nodeTypeId: text("node_type_id")
			.notNull()
			.references(() => nodeTypes.id, { onDelete: "cascade" }),
		key: text("key").notNull(),
		position: integer("position").notNull().default(0),
		createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
	},
	(t) => [
		uniqueIndex("node_type_fields_node_type_id_key_unique").on(
			t.nodeTypeId,
			t.key,
		),
	],
);
