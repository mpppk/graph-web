import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import * as graphService from "#/lib/services/graph-service";
import { getGraphInput, getNodeInput } from "./schemas";

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
				return ok(detail);
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
