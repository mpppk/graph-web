import ELK from "elkjs/lib/elk.bundled.js";
import type { Edge as RFEdge, Node as RFNode } from "@xyflow/react";

const elk = new ELK();

export async function computeElkLayout(
	nodes: RFNode[],
	edges: RFEdge[],
	layoutOptions: Record<string, string>,
): Promise<Map<string, { x: number; y: number }>> {
	const graph = {
		id: "root",
		layoutOptions,
		children: nodes.map((n) => ({ id: n.id, width: 160, height: 40 })),
		edges: edges.map((e) => ({
			id: e.id,
			sources: [e.source],
			targets: [e.target],
		})),
	};
	const layout = await elk.layout(graph);
	const positions = new Map<string, { x: number; y: number }>();
	for (const child of layout.children ?? []) {
		if (child.x !== undefined && child.y !== undefined) {
			positions.set(child.id, { x: child.x, y: child.y });
		}
	}
	return positions;
}
