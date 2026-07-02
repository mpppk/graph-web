import type { Node as RFNode } from "@xyflow/react";
import { groupIdForType, type SubgraphLayout } from "./elk-layout";

// Class name marking the group container's drag handle (its header). React Flow
// only starts a group drag when the pointer goes down on an element matching
// this selector, so the rest of the container can be click-through.
export const SUBGRAPH_DRAG_HANDLE_CLASS = "subgraph-drag-handle";

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
			data: { typeName, movable },
			// Both explicit dimensions (so React Flow knows the parent size for
			// child `extent: "parent"` clamping) and style (for rendering).
			width: box.width,
			height: box.height,
			// `pointerEvents: none` disables the container's own hit area (which
			// otherwise spans the whole padded bounding box and captures clicks in
			// the empty space around the nodes). The header opts back in to
			// `pointerEvents: auto` so it can act as the drag handle; everything
			// else is click-through to the pane behind it.
			//
			// The remaining overrides strip React Flow's default group-node chrome
			// (dark border, 10px padding, grey background) so the only visible box
			// is the one drawn by SubgraphGroupNode, flush with the layout bounds.
			style: {
				width: box.width,
				height: box.height,
				pointerEvents: "none",
				border: "none",
				borderRadius: 0,
				padding: 0,
				background: "transparent",
			},
			// Draggable (when editable) so the whole group moves as one, but only
			// when grabbed by its header (dragHandle); never selectable so it stays
			// out of selection/copy flows.
			draggable: movable,
			dragHandle: `.${SUBGRAPH_DRAG_HANDLE_CLASS}`,
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
