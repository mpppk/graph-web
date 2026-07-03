import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "#/db/index";
import { graphs } from "#/db/schema";

// ── Spike: minimal MCP server ──────────────────────────────────────────────────
// Purpose of this phase is to prove that the MCP SDK's core protocol + a
// Web-standard Streamable HTTP transport run on Cloudflare's workerd runtime and
// that D1 is reachable from within a tool handler. It is intentionally
// unauthenticated (fixed / no user) — OAuth via better-auth comes in a later
// phase. Do NOT expose this in production as-is.
export function buildMcpServer(): McpServer {
	const server = new McpServer(
		{ name: "graph-web", version: "0.0.0" },
		{ instructions: "Graph viewing/editing tools for graph-web (spike)." },
	);

	// Trivial tool: proves the request/response round-trip end to end.
	server.registerTool(
		"ping",
		{
			title: "Ping",
			description: "Health check. Returns 'pong' plus the echoed message.",
			inputSchema: { message: z.string().optional() },
		},
		async ({ message }) => ({
			content: [{ type: "text", text: `pong${message ? `: ${message}` : ""}` }],
		}),
	);

	// Reads D1 from within the Worker to prove the binding is reachable here.
	// SPIKE ONLY: unauthenticated, returns every graph. Replaced by an
	// auth-scoped implementation in the OAuth phase.
	server.registerTool(
		"list_graphs",
		{
			title: "List graphs (spike)",
			description:
				"Lists all graphs. Unauthenticated spike tool — returns every graph in the database.",
			inputSchema: {},
		},
		async () => {
			const rows = await db
				.select({ id: graphs.id, name: graphs.name })
				.from(graphs);
			return {
				content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
			};
		},
	);

	return server;
}
