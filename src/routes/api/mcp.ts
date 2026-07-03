import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createFileRoute } from "@tanstack/react-router";
import { buildMcpServer } from "#/lib/mcp/server";

// Stateless MCP endpoint. Each request builds a fresh server + transport and
// handles a single JSON-RPC exchange — the natural fit for a serverless Worker
// where no in-memory state survives between invocations.
async function handle(request: Request): Promise<Response> {
	const server = buildMcpServer();
	const transport = new WebStandardStreamableHTTPServerTransport({
		sessionIdGenerator: undefined, // stateless
		enableJsonResponse: true, // plain JSON responses instead of SSE
	});
	await server.connect(transport);
	return transport.handleRequest(request);
}

export const Route = createFileRoute("/api/mcp")({
	server: {
		handlers: {
			GET: ({ request }) => handle(request),
			POST: ({ request }) => handle(request),
			DELETE: ({ request }) => handle(request),
		},
	},
});
