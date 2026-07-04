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
