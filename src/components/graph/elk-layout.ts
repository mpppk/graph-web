import type { Edge as RFEdge, Node as RFNode } from "@xyflow/react";
import ELK from "elkjs/lib/elk.bundled.js";

const elk = new ELK();

// Fixed node box used for layout. Kept in sync with the values below.
const NODE_WIDTH = 160;
const NODE_HEIGHT = 40;

// Prefix for the synthetic group container id created per subgraphed node type.
export const GROUP_ID_PREFIX = "group:";

export function groupIdForType(typeName: string): string {
	return `${GROUP_ID_PREFIX}${typeName}`;
}

export async function computeElkLayout(
	nodes: RFNode[],
	edges: RFEdge[],
	layoutOptions: Record<string, string>,
): Promise<Map<string, { x: number; y: number }>> {
	const graph = {
		id: "root",
		layoutOptions,
		children: nodes.map((n) => ({
			id: n.id,
			width: NODE_WIDTH,
			height: NODE_HEIGHT,
		})),
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

export type SubgraphLayout = {
	// typeName → absolute box of the group container.
	groups: Map<string, { x: number; y: number; width: number; height: number }>;
	// nodeId → position. Grouped nodes are parent-relative; ungrouped are absolute.
	nodePositions: Map<string, { x: number; y: number }>;
};

// Compute a hierarchical ELK layout where nodes of each subgraphed type are
// nested inside a group container. ELK returns child coordinates relative to
// their parent, which maps directly onto React Flow's parentId model.
export async function computeElkSubgraphLayout(
	nodes: RFNode[],
	edges: RFEdge[],
	subgraphTypes: Set<string>,
	layoutOptions: Record<string, string>,
): Promise<SubgraphLayout> {
	const box = (n: RFNode) => ({
		id: n.id,
		width: NODE_WIDTH,
		height: NODE_HEIGHT,
	});

	// Partition nodes into their type group (only for subgraphed types).
	const groupChildren = new Map<string, ReturnType<typeof box>[]>();
	const topLevel: ReturnType<typeof box>[] = [];
	for (const n of nodes) {
		const type = (n.data?.nodeType as string | null | undefined) ?? null;
		if (type && subgraphTypes.has(type)) {
			const arr = groupChildren.get(type) ?? [];
			arr.push(box(n));
			groupChildren.set(type, arr);
		} else {
			topLevel.push(box(n));
		}
	}

	const groupNodes = [...groupChildren.entries()].map(([type, children]) => ({
		id: groupIdForType(type),
		// Leave room at the top for the group header label.
		layoutOptions: {
			"elk.padding": "[top=32,left=16,bottom=16,right=16]",
		},
		children,
	}));

	const graph = {
		id: "root",
		layoutOptions: {
			...layoutOptions,
			"elk.hierarchyHandling": "INCLUDE_CHILDREN",
		},
		children: [...topLevel, ...groupNodes],
		edges: edges.map((e) => ({
			id: e.id,
			sources: [e.source],
			targets: [e.target],
		})),
	};

	const layout = await elk.layout(graph);
	const groups: SubgraphLayout["groups"] = new Map();
	const nodePositions: SubgraphLayout["nodePositions"] = new Map();

	for (const child of layout.children ?? []) {
		if (child.id.startsWith(GROUP_ID_PREFIX)) {
			const typeName = child.id.slice(GROUP_ID_PREFIX.length);
			groups.set(typeName, {
				x: child.x ?? 0,
				y: child.y ?? 0,
				width: child.width ?? NODE_WIDTH,
				height: child.height ?? NODE_HEIGHT,
			});
			for (const grandChild of child.children ?? []) {
				nodePositions.set(grandChild.id, {
					x: grandChild.x ?? 0,
					y: grandChild.y ?? 0,
				});
			}
		} else if (child.x !== undefined && child.y !== undefined) {
			nodePositions.set(child.id, { x: child.x, y: child.y });
		}
	}

	return { groups, nodePositions };
}
