import type { NodeProps } from "@xyflow/react";
import { useNodeTypes } from "./NodeTypeContext";
import { SUBGRAPH_DRAG_HANDLE_CLASS } from "./subgraph-view";

// Container node rendered behind the nodes of a single subgraphed type. The
// container itself is click-through (`pointerEvents: none` on the node), so the
// empty space inside the box does not capture clicks. Only the header opts back
// in, acting as the drag handle for moving the whole group in edit mode.
export function SubgraphGroupNode({ data }: NodeProps) {
	const { colorMap } = useNodeTypes();
	const typeName = data.typeName as string;
	const movable = Boolean(data.movable);
	const color = colorMap[typeName] ?? "#94a3b8";

	return (
		<div
			className="h-full w-full rounded-lg border-2"
			style={{
				borderColor: color,
				backgroundColor: `${color}1a`,
			}}
		>
			<div
				className={`${SUBGRAPH_DRAG_HANDLE_CLASS} truncate rounded-t-md px-2 py-1 text-xs font-semibold`}
				style={{
					color,
					// Re-enable hit testing only on the header so it can be grabbed to
					// drag the group; the rest of the container stays click-through.
					pointerEvents: movable ? "auto" : "none",
					cursor: movable ? "grab" : "default",
				}}
			>
				{typeName}
			</div>
		</div>
	);
}
