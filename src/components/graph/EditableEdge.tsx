import { useMutation } from "@tanstack/react-query";
import {
	BaseEdge,
	EdgeLabelRenderer,
	type EdgeProps,
	getBezierPath,
	useReactFlow,
} from "@xyflow/react";
import { useCallback, useRef, useState } from "react";
import { updateEdgeLabel } from "#/lib/graph-server-fns";
import { useGraphMode } from "./GraphModeContext";

export function EditableEdge({
	id,
	sourceX,
	sourceY,
	targetX,
	targetY,
	sourcePosition,
	targetPosition,
	data,
}: EdgeProps) {
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState((data?.label as string) ?? "");
	const inputRef = useRef<HTMLInputElement>(null);
	const { updateEdgeData } = useReactFlow();
	const readOnly = useGraphMode() === "read";

	const mutation = useMutation({
		mutationFn: (label: string) => updateEdgeLabel({ data: { id, label } }),
		onSuccess: (edge) => {
			if (edge) updateEdgeData(id, { label: edge.label });
		},
	});

	const [edgePath, labelX, labelY] = getBezierPath({
		sourceX,
		sourceY,
		sourcePosition,
		targetX,
		targetY,
		targetPosition,
	});

	const commitEdit = useCallback(() => {
		const trimmed = draft.trim();
		const current = (data?.label as string) ?? "";
		if (trimmed !== current) {
			updateEdgeData(id, { label: trimmed });
			mutation.mutate(trimmed, {
				onError: () => updateEdgeData(id, { label: current }),
			});
		}
		setEditing(false);
	}, [draft, data?.label, mutation, updateEdgeData, id]);

	const handleDoubleClick = useCallback(
		(e: React.MouseEvent) => {
			if (readOnly) return;
			e.stopPropagation();
			setDraft((data?.label as string) ?? "");
			setEditing(true);
			setTimeout(() => inputRef.current?.select(), 0);
		},
		[data?.label, readOnly],
	);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLInputElement>) => {
			if (e.key === "Enter") commitEdit();
			if (e.key === "Escape") {
				setDraft((data?.label as string) ?? "");
				setEditing(false);
			}
		},
		[commitEdit, data?.label],
	);

	const label = (data?.label as string) ?? "";

	return (
		<>
			<BaseEdge path={edgePath} />
			<EdgeLabelRenderer>
				<div
					style={{
						position: "absolute",
						transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
						pointerEvents: "all",
					}}
					className="nodrag nopan"
				>
					{editing ? (
						<input
							ref={inputRef}
							value={draft}
							onChange={(e) => setDraft(e.target.value)}
							onBlur={commitEdit}
							onKeyDown={handleKeyDown}
							onKeyUp={(e) => e.stopPropagation()}
							className="rounded border border-ring bg-background px-2 py-1 text-xs text-foreground shadow-sm outline-none focus:ring-1 focus:ring-ring"
						/>
					) : label ? (
						readOnly ? (
							<span className="rounded border bg-background px-2 py-1 text-xs text-foreground shadow-sm">
								{label}
							</span>
						) : (
							<button
								type="button"
								onDoubleClick={handleDoubleClick}
								className="cursor-pointer rounded border bg-background px-2 py-1 text-xs text-foreground shadow-sm hover:border-ring"
							>
								{label}
							</button>
						)
					) : null}
				</div>
			</EdgeLabelRenderer>
		</>
	);
}
