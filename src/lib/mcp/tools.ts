import { env } from "cloudflare:workers";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import * as graphService from "#/lib/services/graph-service";
import * as userService from "#/lib/services/user-service";
import { buildGraphDetailUiResource } from "./apps";
import { planNodePlacement } from "./placement";
import {
	createEdgesInput,
	createNodesInput,
	deleteEdgesInput,
	deleteNodesInput,
	getGraphInput,
	getNodeInput,
	setNodeMetadataInput,
	updateEdgeInput,
	updateGraphInput,
	updateNodeInput,
} from "./schemas";

// Serialize a result as both structured content and a text mirror; MCP
// clients without structured-content support read the text form.
function ok(payload: unknown): CallToolResult {
	return {
		content: [{ type: "text", text: JSON.stringify(payload) }],
		structuredContent: payload as Record<string, unknown>,
	};
}

function err(e: unknown): CallToolResult {
	const message = e instanceof Error ? e.message : String(e);
	return {
		content: [{ type: "text", text: `Error: ${message}` }],
		isError: true,
	};
}

export function registerReadTools(server: McpServer, userId: string) {
	server.registerTool(
		"get_current_user",
		{
			title: "Get current user",
			description:
				"Get the account info (id, name, email, avatar) of the signed-in " +
				"user this MCP connection is authenticated as.",
			annotations: { readOnlyHint: true },
		},
		async () => {
			try {
				const user = await userService.getCurrentUser(userId);
				return ok({ user });
			} catch (e) {
				return err(e);
			}
		},
	);

	server.registerTool(
		"list_graphs",
		{
			title: "List graphs",
			description:
				"List every graph the signed-in user can access: personal graphs and " +
				"graphs of teams in organizations the user belongs to.",
			annotations: { readOnlyHint: true },
		},
		async () => {
			try {
				const graphs = await graphService.listAccessibleGraphs(userId);
				return ok({ graphs });
			} catch (e) {
				return err(e);
			}
		},
	);

	server.registerTool(
		"get_graph",
		{
			title: "Get graph",
			description:
				"Get a graph with all of its nodes and edges (and, by default, every " +
				"node's metadata) in one call.",
			inputSchema: getGraphInput,
			annotations: { readOnlyHint: true },
		},
		async ({ graph_id, include_metadata }) => {
			try {
				const detail = await graphService.getGraphDetail(userId, graph_id, {
					includeMetadata: include_metadata,
				});
				// Attach a read-only MCP App (mcp-ui) that renders the graph in the
				// host via an iframe pointed at the app's own /embed route.
				const ui = buildGraphDetailUiResource(
					env.BETTER_AUTH_URL,
					detail.graph.id,
				);
				return {
					content: [{ type: "text", text: JSON.stringify(detail) }, ui],
					structuredContent: detail as Record<string, unknown>,
				};
			} catch (e) {
				return err(e);
			}
		},
	);

	server.registerTool(
		"get_node",
		{
			title: "Get node",
			description: "Get a single node with its metadata entries.",
			inputSchema: getNodeInput,
			annotations: { readOnlyHint: true },
		},
		async ({ node_id }) => {
			try {
				const { node, metadata } = await graphService.getNodeDetail(
					userId,
					node_id,
				);
				return ok({ node, metadata });
			} catch (e) {
				return err(e);
			}
		},
	);
}

export function registerWriteTools(server: McpServer, userId: string) {
	server.registerTool(
		"update_graph",
		{
			title: "Update graph",
			description: "Update a graph's name and/or description.",
			inputSchema: updateGraphInput,
			annotations: { destructiveHint: true, idempotentHint: true },
		},
		async ({ graph_id, name, description }) => {
			try {
				if (name === undefined && description === undefined) {
					throw new Error("Provide name and/or description");
				}
				const graph = await graphService.updateGraph(userId, {
					graphId: graph_id,
					name,
					description,
				});
				return ok({ graph });
			} catch (e) {
				return err(e);
			}
		},
	);

	server.registerTool(
		"create_nodes",
		{
			title: "Create nodes",
			description:
				"Create one or more nodes in a graph. Nodes without x/y are placed " +
				"automatically below the existing nodes.",
			inputSchema: createNodesInput,
			annotations: { destructiveHint: false },
		},
		async ({ graph_id, nodes }) => {
			try {
				const created = await graphService.createNodesInGraph(userId, {
					graphId: graph_id,
					nodes: nodes.map((n) => ({
						label: n.label,
						nodeType: n.node_type,
						x: n.x,
						y: n.y,
					})),
					placePending: planNodePlacement,
				});
				return ok({ nodes: created });
			} catch (e) {
				return err(e);
			}
		},
	);

	server.registerTool(
		"update_node",
		{
			title: "Update node",
			description:
				"Update a node's label, position and/or type. Assigning a type also " +
				"seeds the type's metadata template keys onto the node.",
			inputSchema: updateNodeInput,
			annotations: { destructiveHint: true, idempotentHint: true },
		},
		async ({ node_id, label, node_type, x, y }) => {
			try {
				if (
					label === undefined &&
					node_type === undefined &&
					x === undefined &&
					y === undefined
				) {
					throw new Error("Provide at least one field to update");
				}
				const result = await graphService.updateNodeFields(userId, {
					nodeId: node_id,
					label,
					nodeType: node_type,
					x,
					y,
				});
				return ok(result);
			} catch (e) {
				return err(e);
			}
		},
	);

	server.registerTool(
		"delete_nodes",
		{
			title: "Delete nodes",
			description:
				"Delete nodes by ID. Connected edges and metadata are deleted too. " +
				"IDs that no longer exist are ignored.",
			inputSchema: deleteNodesInput,
			annotations: { destructiveHint: true, idempotentHint: true },
		},
		async ({ node_ids }) => {
			try {
				return ok(
					await graphService.deleteNodesById(userId, { nodeIds: node_ids }),
				);
			} catch (e) {
				return err(e);
			}
		},
	);

	server.registerTool(
		"create_edges",
		{
			title: "Create edges",
			description: "Create one or more edges between nodes of the same graph.",
			inputSchema: createEdgesInput,
			annotations: { destructiveHint: false },
		},
		async ({ graph_id, edges }) => {
			try {
				const created = await graphService.createEdgesInGraph(userId, {
					graphId: graph_id,
					edges: edges.map((e) => ({
						sourceNodeId: e.source_node_id,
						targetNodeId: e.target_node_id,
						label: e.label,
					})),
				});
				return ok({ edges: created });
			} catch (e) {
				return err(e);
			}
		},
	);

	server.registerTool(
		"update_edge",
		{
			title: "Update edge",
			description: "Update an edge's label.",
			inputSchema: updateEdgeInput,
			annotations: { destructiveHint: true, idempotentHint: true },
		},
		async ({ edge_id, label }) => {
			try {
				const edge = await graphService.updateEdgeLabel(userId, {
					edgeId: edge_id,
					label,
				});
				return ok({ edge });
			} catch (e) {
				return err(e);
			}
		},
	);

	server.registerTool(
		"delete_edges",
		{
			title: "Delete edges",
			description: "Delete edges by ID. IDs that no longer exist are ignored.",
			inputSchema: deleteEdgesInput,
			annotations: { destructiveHint: true, idempotentHint: true },
		},
		async ({ edge_ids }) => {
			try {
				return ok(
					await graphService.deleteEdgesById(userId, { edgeIds: edge_ids }),
				);
			} catch (e) {
				return err(e);
			}
		},
	);

	server.registerTool(
		"set_node_metadata",
		{
			title: "Set node metadata",
			description:
				"Create, overwrite and/or delete metadata entries on a node. " +
				"Returns the node's full metadata after the change.",
			inputSchema: setNodeMetadataInput,
			annotations: { destructiveHint: true, idempotentHint: true },
		},
		async ({ node_id, set, delete_keys }) => {
			try {
				if (!set?.length && !delete_keys?.length) {
					throw new Error("Provide set and/or delete_keys");
				}
				const metadata = await graphService.setNodeMetadataEntries(userId, {
					nodeId: node_id,
					set: set?.map((e) => ({
						key: e.key,
						value: e.value,
						valueType: e.value_type,
					})),
					deleteKeys: delete_keys,
				});
				return ok({ metadata });
			} catch (e) {
				return err(e);
			}
		},
	);
}
