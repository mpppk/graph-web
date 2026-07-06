import { createUIResource } from "@mcp-ui/server";

// Build the read-only MCP App (mcp-ui) resource for a graph. The host (Claude
// etc.) renders it in a sandboxed iframe pointed at the app's own /embed route,
// which reuses the real GraphCanvas in read mode. Kept free of DB/runtime
// imports so it stays unit-testable.
export function buildGraphDetailUiResource(baseUrl: string, graphId: string) {
	return createUIResource({
		uri: `ui://graph-web/graph-detail/${graphId}`,
		content: {
			type: "externalUrl",
			iframeUrl: `${baseUrl}/embed/graphs/${graphId}`,
		},
		encoding: "text",
	});
}
