import type { Node as RFNode } from "@xyflow/react";
import { groupIdForType, type SubgraphLayout } from "./elk-layout";

// The node type name carried on a React Flow node's data, or null.
export function nodeTypeOf(node: RFNode): string | null {
	return (node.data?.nodeType as string | null | undefined) ?? null;
}

// Group nodes by their type name. Nodes without a type are omitted.
export function groupNodesByType(nodes: RFNode[]): Map<string, RFNode[]> {
	const groups = new Map<string, RFNode[]>();
	for (const n of nodes) {
		const type = nodeTypeOf(n);
		if (!type) continue;
		const arr = groups.get(type) ?? [];
		arr.push(n);
		groups.set(type, arr);
	}
	return groups;
}

// Build the React Flow node list for the subgraph view. Nodes of a subgraphed
// type become children (parentId + relative position) of a synthetic group
// container node; other nodes stay top-level. When there is no layout yet (or
// no active types) the input nodes are returned unchanged as a flat graph.
//
// When `movable` is true the group containers are draggable, so dragging a
// group moves all of its children together (children follow their parent). The
// movement is view-only; the caller decides whether/how to persist it.
export function buildSubgraphDisplayNodes(
	nodes: RFNode[],
	subgraphTypes: Set<string>,
	layout: SubgraphLayout | null,
	movable = false,
): RFNode[] {
	if (subgraphTypes.size === 0 || !layout) return nodes;

	const groupNodes: RFNode[] = [];
	for (const [typeName, box] of layout.groups) {
		if (!subgraphTypes.has(typeName)) continue;
		groupNodes.push({
			id: groupIdForType(typeName),
			type: "group",
			position: { x: box.x, y: box.y },
			data: { typeName },
			// Both explicit dimensions (so React Flow knows the parent size for
			// child `extent: "parent"` clamping) and style (for rendering).
			width: box.width,
			height: box.height,
			style: { width: box.width, height: box.height },
			// Draggable (when editable) so the whole group moves as one; never
			// selectable so it stays out of selection/copy flows.
			draggable: movable,
			selectable: false,
			// Render group containers behind their children.
			zIndex: 0,
		});
	}

	const childNodes: RFNode[] = nodes.map((n) => {
		const type = nodeTypeOf(n);
		if (type && subgraphTypes.has(type)) {
			const pos = layout.nodePositions.get(n.id);
			return {
				...n,
				parentId: groupIdForType(type),
				extent: "parent" as const,
				position: pos ?? n.position,
			};
		}
		const pos = layout.nodePositions.get(n.id);
		// Ungrouped node — drop any stale parent linkage, use absolute position.
		const { parentId: _parentId, extent: _extent, ...rest } = n;
		return pos ? { ...rest, position: pos } : rest;
	});

	// Group containers must precede their children in the array.
	return [...groupNodes, ...childNodes];
}
