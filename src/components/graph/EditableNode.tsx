import { Handle, type NodeProps, Position } from "@xyflow/react";
import { getContrastTextColor } from "#/lib/utils";
import { useGraphMode } from "./GraphModeContext";
import { useNodeTypes } from "./NodeTypeContext";

export function EditableNode({ data }: NodeProps) {
	const { colorMap } = useNodeTypes();
	const readOnly = useGraphMode() === "read";
	const nodeType = data.nodeType as string | null | undefined;
	const bgColor = nodeType ? (colorMap[nodeType] ?? "#ffffff") : "#ffffff";
	const textColor = getContrastTextColor(bgColor);

	return (
		<div
			style={{
				backgroundColor: bgColor,
				color: textColor,
			}}
			className="flex min-w-[120px] max-w-[200px] items-center justify-center rounded-md border-2 border-border px-3 py-2 text-sm font-medium shadow-sm"
		>
			{/* Handles stay mounted in read mode (hidden + non-connectable) so
			    edges keep an anchor point to render against; removing them would
			    make all edges disappear. */}
			<Handle
				type="target"
				position={Position.Top}
				isConnectable={!readOnly}
				style={readOnly ? { opacity: 0, pointerEvents: "none" } : undefined}
			/>
			<span className="w-full text-center">{data.label as string}</span>
			<Handle
				type="source"
				position={Position.Bottom}
				isConnectable={!readOnly}
				style={readOnly ? { opacity: 0, pointerEvents: "none" } : undefined}
			/>
		</div>
	);
}
