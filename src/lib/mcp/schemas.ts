import { z } from "zod";

// Input schemas for MCP tools. Kept free of DB / runtime imports so they can
// be unit tested under vitest (jsdom).

export const getGraphInput = {
	graph_id: z.string().describe("The graph ID (from list_graphs)"),
	include_metadata: z
		.boolean()
		.default(true)
		.describe("Include every node's metadata entries in the response"),
};

export const getNodeInput = {
	node_id: z.string().describe("The node ID"),
};

// ── Write tools ───────────────────────────────────────────────────────────────

export const metadataValueType = z
	.enum(["string", "number", "url", "boolean", "date"])
	.describe("How the value is interpreted (defaults to string)");

export const updateGraphInput = {
	graph_id: z.string(),
	name: z.string().min(1).optional().describe("New graph name"),
	description: z.string().optional().describe("New graph description"),
};

export const createNodesInput = {
	graph_id: z.string(),
	nodes: z
		.array(
			z.object({
				label: z.string().min(1),
				node_type: z
					.string()
					.optional()
					.describe(
						"Node type name (must exist for this graph; see get_graph)",
					),
				x: z.number().optional(),
				y: z.number().optional(),
			}),
		)
		.min(1)
		.describe(
			"Nodes to create. Omit x/y to auto-place below the existing nodes.",
		),
};

export const updateNodeInput = {
	node_id: z.string(),
	label: z.string().min(1).optional(),
	node_type: z
		.string()
		.nullable()
		.optional()
		.describe("Node type name to assign, or null to clear the type"),
	x: z.number().optional(),
	y: z.number().optional(),
};

export const deleteNodesInput = {
	node_ids: z
		.array(z.string())
		.min(1)
		.describe("Nodes to delete (their edges and metadata are removed too)"),
};

export const createEdgesInput = {
	graph_id: z.string(),
	edges: z
		.array(
			z.object({
				source_node_id: z.string(),
				target_node_id: z.string(),
				label: z.string().optional(),
			}),
		)
		.min(1),
};

export const updateEdgeInput = {
	edge_id: z.string(),
	label: z.string().describe("New edge label (empty string clears it)"),
};

export const deleteEdgesInput = {
	edge_ids: z.array(z.string()).min(1),
};

export const setNodeMetadataInput = {
	node_id: z.string(),
	set: z
		.array(
			z.object({
				key: z.string().min(1),
				value: z.string(),
				value_type: metadataValueType.optional(),
			}),
		)
		.optional()
		.describe("Entries to create or overwrite (upsert by key)"),
	delete_keys: z
		.array(z.string())
		.optional()
		.describe("Metadata keys to remove"),
};
