import { useMutation } from "@tanstack/react-query";
import { Handle, type NodeProps, Position, useReactFlow } from "@xyflow/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { updateNodeLabel } from "#/lib/graph-server-fns";
import { NODE_TYPE_COLORS } from "./constants";

export function EditableNode({ id, data, selected }: NodeProps) {
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(data.label as string);
	const inputRef = useRef<HTMLInputElement>(null);
	const { updateNodeData } = useReactFlow();
	const nodeType = data.nodeType as string | null | undefined;
	const bgColor = nodeType
		? (NODE_TYPE_COLORS[nodeType] ?? "#ffffff")
		: "#ffffff";
	const hasTypeColor = !!nodeType && !!NODE_TYPE_COLORS[nodeType];

	const mutation = useMutation({
		mutationFn: (label: string) => updateNodeLabel({ data: { id, label } }),
		onSuccess: (node) => {
			if (node) updateNodeData(id, { label: node.label });
		},
	});

	const commitEdit = useCallback(() => {
		const trimmed = draft.trim();
		if (trimmed && trimmed !== (data.label as string)) {
			updateNodeData(id, { label: trimmed });
			mutation.mutate(trimmed, {
				onError: () => updateNodeData(id, { label: data.label as string }),
			});
		} else {
			setDraft(data.label as string);
		}
		setEditing(false);
	}, [draft, data.label, mutation, updateNodeData, id]);

	useEffect(() => {
		if (data.autoEdit) {
			setDraft(data.label as string);
			setEditing(true);
			updateNodeData(id, { ...data, autoEdit: false });
			setTimeout(() => inputRef.current?.select(), 0);
		}
	}, [data, id, updateNodeData]);

	const handleDoubleClick = useCallback(() => {
		setDraft(data.label as string);
		setEditing(true);
		setTimeout(() => inputRef.current?.select(), 0);
	}, [data.label]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLInputElement>) => {
			if (e.key === "Enter") commitEdit();
			if (e.key === "Escape") {
				setDraft(data.label as string);
				setEditing(false);
			}
		},
		[commitEdit, data.label],
	);

	return (
		<div
			style={{
				backgroundColor: bgColor,
				color: hasTypeColor ? "#ffffff" : undefined,
			}}
			className={`flex min-w-[120px] max-w-[200px] items-center justify-center rounded-md border-2 px-3 py-2 text-sm font-medium shadow-sm ${
				selected ? "border-blue-500" : "border-slate-300"
			}`}
		>
			<Handle type="target" position={Position.Top} />
			{editing ? (
				<input
					ref={inputRef}
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					onBlur={commitEdit}
					onKeyDown={handleKeyDown}
					className={`w-full bg-transparent text-center text-sm outline-none ${hasTypeColor ? "placeholder-white/60" : ""}`}
					onKeyUp={(e) => e.stopPropagation()}
				/>
			) : (
				<button
					type="button"
					className="text-center bg-transparent border-0 p-0 text-inherit cursor-text w-full"
					onDoubleClick={handleDoubleClick}
				>
					{data.label as string}
				</button>
			)}
			<Handle type="source" position={Position.Bottom} />
		</div>
	);
}
