import type { NodeProps } from "@xyflow/react";
import { useNodeTypes } from "./NodeTypeContext";

// Container node rendered behind the nodes of a single subgraphed type. It is
// non-interactive; its size comes from the ELK layout via the node's style.
export function SubgraphGroupNode({ data }: NodeProps) {
	const { colorMap } = useNodeTypes();
	const typeName = data.typeName as string;
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
				className="truncate rounded-t-md px-2 py-1 text-xs font-semibold"
				style={{ color }}
			>
				{typeName}
			</div>
		</div>
	);
}
