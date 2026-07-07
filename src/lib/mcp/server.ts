import { env } from "cloudflare:workers";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { buildGraphDetailAppHtml, GRAPH_DETAIL_RESOURCE_URI } from "./apps";
import { registerReadTools, registerWriteTools } from "./tools";

// Build a per-request MCP server bound to the authenticated user. The SDK
// forbids reusing a connected server across requests, and per-request
// instances are what make the stateless transport safe on Workers.
export function buildMcpServer(userId: string): McpServer {
	const server = new McpServer({ name: "graph-web", version: "1.0.0" });
	registerReadTools(server, userId);
	registerWriteTools(server, userId);
	registerApps(server);
	return server;
}

// Register the MCP Apps (SEP) UI resource. `get_graph` points at this via
// `_meta.ui.resourceUri`; hosts fetch it and render the returned HTML, then
// push the tool input/result into the iframe so it can show the right graph.
function registerApps(server: McpServer) {
	const baseUrl = env.BETTER_AUTH_URL;
	server.registerResource(
		"graph-detail",
		GRAPH_DETAIL_RESOURCE_URI,
		{
			title: "Graph detail (read-only)",
			description:
				"Read-only interactive view of a graph, rendered by MCP Apps hosts.",
			mimeType: "text/html;profile=mcp-app",
		},
		() => ({
			contents: [
				{
					uri: GRAPH_DETAIL_RESOURCE_URI,
					mimeType: "text/html;profile=mcp-app",
					text: buildGraphDetailAppHtml(baseUrl),
					_meta: {
						ui: {
							csp: {
								connectDomains: [baseUrl],
								resourceDomains: [baseUrl],
							},
						},
					},
				},
			],
		}),
	);
}
