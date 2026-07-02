import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Node as RFNode } from "@xyflow/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import {
	deleteNodeMetadata,
	listNodeMetadata,
	upsertNodeMetadata,
} from "#/lib/graph-server-fns";
import { useNodeTypes } from "./NodeTypeContext";

export function NodeSidePanel({
	nodeId,
	nodes,
	onClose,
	onDeleteNode,
	onUpdateNodeType,
	onUpdateNodeLabel,
	readOnly = false,
}: {
	nodeId: string;
	nodes: RFNode[];
	onClose: () => void;
	onDeleteNode: (id: string) => void;
	onUpdateNodeType: (nodeId: string, nodeType: string | null) => void;
	onUpdateNodeLabel: (nodeId: string, label: string) => void;
	readOnly?: boolean;
}) {
	const { typeList } = useNodeTypes();
	const qc = useQueryClient();
	const node = nodes.find((n) => n.id === nodeId);
	const label = node ? (node.data.label as string) : "";
	const currentNodeType = node
		? ((node.data.nodeType as string | null | undefined) ?? "")
		: "";

	const { data: metadata = [] } = useQuery({
		queryKey: ["metadata", nodeId],
		queryFn: () => listNodeMetadata({ data: { nodeId } }),
		enabled: !!nodeId,
	});

	const upsertMeta = useMutation({
		mutationFn: ({ key, value }: { key: string; value: string }) =>
			upsertNodeMetadata({ data: { nodeId, key, value } }),
		onSuccess: () => qc.invalidateQueries({ queryKey: ["metadata", nodeId] }),
	});

	const deleteMeta = useMutation({
		mutationFn: (id: string) => deleteNodeMetadata({ data: { id } }),
		onSuccess: () => qc.invalidateQueries({ queryKey: ["metadata", nodeId] }),
	});

	const [newKey, setNewKey] = useState("");
	const [newValue, setNewValue] = useState("");
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editDraft, setEditDraft] = useState("");
	const editInputRef = useRef<HTMLInputElement>(null);

	const [labelEditing, setLabelEditing] = useState(false);
	const [labelDraft, setLabelDraft] = useState("");
	const labelInputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (editingId) editInputRef.current?.focus();
	}, [editingId]);

	useEffect(() => {
		if (labelEditing) {
			labelInputRef.current?.focus();
			labelInputRef.current?.select();
		}
	}, [labelEditing]);

	const handleLabelEditStart = useCallback(() => {
		setLabelDraft(label);
		setLabelEditing(true);
	}, [label]);

	const handleLabelCommit = useCallback(() => {
		const trimmed = labelDraft.trim();
		if (trimmed && trimmed !== label) {
			onUpdateNodeLabel(nodeId, trimmed);
		}
		setLabelEditing(false);
	}, [labelDraft, label, nodeId, onUpdateNodeLabel]);

	const handleAddMeta = useCallback(() => {
		const k = newKey.trim();
		const v = newValue.trim();
		if (!k) return;
		upsertMeta.mutate({ key: k, value: v });
		setNewKey("");
		setNewValue("");
	}, [newKey, newValue, upsertMeta]);

	const handleEditStart = useCallback((id: string, value: string) => {
		setEditingId(id);
		setEditDraft(value);
	}, []);

	const handleEditCommit = useCallback(
		(_id: string, key: string) => {
			upsertMeta.mutate({ key, value: editDraft });
			setEditingId(null);
		},
		[editDraft, upsertMeta],
	);

	if (!node) return null;

	return (
		<aside className="fixed inset-x-0 bottom-0 z-20 flex max-h-[60vh] flex-col rounded-t-xl border-t bg-card shadow-lg md:static md:z-auto md:max-h-none md:w-72 md:flex-shrink-0 md:rounded-none md:border-t-0 md:border-l md:shadow-none">
			<div className="flex items-center justify-between border-b px-4 py-3">
				<span className="text-sm font-semibold text-foreground">Node</span>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="h-7 w-7"
					onClick={onClose}
					aria-label="Close panel"
				>
					✕
				</Button>
			</div>

			<div className="flex-1 overflow-y-auto p-4 space-y-5">
				<section>
					<p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
						Label
					</p>
					{readOnly ? (
						<div className="w-full rounded-md border bg-muted px-3 py-2 text-left text-sm text-foreground">
							{label}
						</div>
					) : labelEditing ? (
						<Input
							ref={labelInputRef}
							value={labelDraft}
							onChange={(e) => setLabelDraft(e.target.value)}
							onBlur={handleLabelCommit}
							onKeyDown={(e) => {
								if (e.key === "Enter") handleLabelCommit();
								if (e.key === "Escape") setLabelEditing(false);
							}}
							className="text-sm"
						/>
					) : (
						<button
							type="button"
							className="w-full rounded-md border bg-muted px-3 py-2 text-left text-sm text-foreground hover:bg-accent"
							onClick={handleLabelEditStart}
							title="クリックして編集"
						>
							{label}
						</button>
					)}
				</section>

				<section>
					<p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
						タイプ
					</p>
					<Select
						value={currentNodeType || "__none__"}
						disabled={readOnly}
						onValueChange={(val) => {
							onUpdateNodeType(nodeId, val === "__none__" ? null : val);
						}}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="__none__">なし</SelectItem>
							{[...new Set(typeList.map((t) => t.name))].map((name) => (
								<SelectItem key={name} value={name}>
									{name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</section>

				<section>
					<p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
						Metadata
					</p>

					{metadata.length === 0 && (
						<p className="text-xs text-muted-foreground">メタデータなし</p>
					)}

					<ul className="space-y-2">
						{metadata.map((m) => (
							<li key={m.id} className="flex items-center gap-2">
								<span className="w-24 shrink-0 truncate rounded bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
									{m.key}
								</span>
								{readOnly ? (
									<span className="flex-1 truncate px-2 py-1 text-left text-xs text-foreground">
										{m.value || (
											<span className="italic text-muted-foreground">
												（空）
											</span>
										)}
									</span>
								) : editingId === m.id ? (
									<Input
										ref={editInputRef}
										value={editDraft}
										onChange={(e) => setEditDraft(e.target.value)}
										onBlur={() => handleEditCommit(m.id, m.key)}
										onKeyDown={(e) => {
											if (e.key === "Enter") handleEditCommit(m.id, m.key);
											if (e.key === "Escape") setEditingId(null);
										}}
										className="h-7 flex-1 text-xs"
									/>
								) : (
									<button
										type="button"
										className="flex-1 truncate rounded px-2 py-1 text-left text-xs text-foreground hover:bg-accent"
										onClick={() => handleEditStart(m.id, m.value)}
										title="クリックして編集"
									>
										{m.value || (
											<span className="italic text-muted-foreground">
												（空）
											</span>
										)}
									</button>
								)}
								{!readOnly && (
									<Button
										type="button"
										variant="ghost"
										size="icon"
										onClick={() => deleteMeta.mutate(m.id)}
										className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
										aria-label="Delete metadata"
									>
										✕
									</Button>
								)}
							</li>
						))}
					</ul>

					{!readOnly && (
						<div className="mt-3 flex gap-2">
							<Input
								value={newKey}
								onChange={(e) => setNewKey(e.target.value)}
								placeholder="key"
								className="h-7 w-24 shrink-0 text-xs"
								onKeyDown={(e) => {
									if (e.key === "Enter") handleAddMeta();
								}}
							/>
							<Input
								value={newValue}
								onChange={(e) => setNewValue(e.target.value)}
								placeholder="value"
								className="h-7 flex-1 text-xs"
								onKeyDown={(e) => {
									if (e.key === "Enter") handleAddMeta();
								}}
							/>
							<Button
								type="button"
								variant="secondary"
								size="sm"
								onClick={handleAddMeta}
								disabled={!newKey.trim()}
								className="h-7 shrink-0 text-xs"
							>
								追加
							</Button>
						</div>
					)}
				</section>
			</div>

			{!readOnly && (
				<div className="border-t p-4">
					<Button
						type="button"
						variant="destructive"
						className="w-full"
						onClick={() => onDeleteNode(nodeId)}
					>
						Delete Node
					</Button>
				</div>
			)}
		</aside>
	);
}
