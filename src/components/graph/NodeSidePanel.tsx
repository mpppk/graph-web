import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Node as RFNode } from "@xyflow/react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	deleteNodeMetadata,
	listNodeMetadata,
	upsertNodeMetadata,
} from "#/lib/graph-server-fns";
import { PREDEFINED_NODE_TYPES } from "./constants";

export function NodeSidePanel({
	nodeId,
	nodes,
	onClose,
	onDeleteNode,
	onUpdateNodeType,
}: {
	nodeId: string;
	nodes: RFNode[];
	onClose: () => void;
	onDeleteNode: (id: string) => void;
	onUpdateNodeType: (nodeId: string, nodeType: string | null) => void;
}) {
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

	useEffect(() => {
		if (editingId) editInputRef.current?.focus();
	}, [editingId]);

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
		<aside className="flex w-72 flex-shrink-0 flex-col border-l border-slate-200 bg-white">
			<div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
				<span className="text-sm font-semibold text-slate-700">Node</span>
				<button
					type="button"
					onClick={onClose}
					className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
					aria-label="Close panel"
				>
					✕
				</button>
			</div>

			<div className="flex-1 overflow-y-auto p-4 space-y-5">
				<section>
					<p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
						Label
					</p>
					<p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
						{label}
					</p>
					<p className="mt-1 text-xs text-slate-400">
						ダブルクリックでキャンバス上から編集
					</p>
				</section>

				<section>
					<p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
						タイプ
					</p>
					<select
						value={currentNodeType}
						onChange={(e) => {
							const val = e.target.value;
							onUpdateNodeType(nodeId, val || null);
						}}
						className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
					>
						<option value="">なし</option>
						{PREDEFINED_NODE_TYPES.map((t) => (
							<option key={t} value={t}>
								{t}
							</option>
						))}
					</select>
				</section>

				<section>
					<p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
						Metadata
					</p>

					{metadata.length === 0 && (
						<p className="text-xs text-slate-400">メタデータなし</p>
					)}

					<ul className="space-y-2">
						{metadata.map((m) => (
							<li key={m.id} className="flex items-center gap-2">
								<span className="w-24 shrink-0 truncate rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
									{m.key}
								</span>
								{editingId === m.id ? (
									<input
										ref={editInputRef}
										value={editDraft}
										onChange={(e) => setEditDraft(e.target.value)}
										onBlur={() => handleEditCommit(m.id, m.key)}
										onKeyDown={(e) => {
											if (e.key === "Enter") handleEditCommit(m.id, m.key);
											if (e.key === "Escape") setEditingId(null);
										}}
										className="flex-1 rounded border border-blue-400 px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-blue-400"
									/>
								) : (
									<button
										type="button"
										className="flex-1 truncate rounded px-2 py-1 text-left text-xs text-slate-700 hover:bg-slate-50"
										onClick={() => handleEditStart(m.id, m.value)}
										title="クリックして編集"
									>
										{m.value || (
											<span className="italic text-slate-400">（空）</span>
										)}
									</button>
								)}
								<button
									type="button"
									onClick={() => deleteMeta.mutate(m.id)}
									className="shrink-0 rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-400"
									aria-label="Delete metadata"
								>
									✕
								</button>
							</li>
						))}
					</ul>

					<div className="mt-3 flex gap-2">
						<input
							value={newKey}
							onChange={(e) => setNewKey(e.target.value)}
							placeholder="key"
							className="w-24 shrink-0 rounded border border-slate-200 px-2 py-1 text-xs outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
							onKeyDown={(e) => {
								if (e.key === "Enter") handleAddMeta();
							}}
						/>
						<input
							value={newValue}
							onChange={(e) => setNewValue(e.target.value)}
							placeholder="value"
							className="flex-1 rounded border border-slate-200 px-2 py-1 text-xs outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
							onKeyDown={(e) => {
								if (e.key === "Enter") handleAddMeta();
							}}
						/>
						<button
							type="button"
							onClick={handleAddMeta}
							disabled={!newKey.trim()}
							className="shrink-0 rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200 disabled:opacity-40"
						>
							追加
						</button>
					</div>
				</section>
			</div>

			<div className="border-t border-slate-200 p-4">
				<button
					type="button"
					onClick={() => onDeleteNode(nodeId)}
					className="w-full rounded-lg border border-red-200 py-2 text-sm font-medium text-red-500 hover:bg-red-50"
				>
					Delete Node
				</button>
			</div>
		</aside>
	);
}
