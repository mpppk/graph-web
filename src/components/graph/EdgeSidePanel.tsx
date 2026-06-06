import type { Edge as RFEdge } from "@xyflow/react";
import { useEffect, useState } from "react";

export function EdgeSidePanel({
	edgeId,
	edges,
	onClose,
	onDeleteEdge,
	onUpdateLabel,
}: {
	edgeId: string;
	edges: RFEdge[];
	onClose: () => void;
	onDeleteEdge: (id: string) => void;
	onUpdateLabel: (edgeId: string, label: string) => void;
}) {
	const edge = edges.find((e) => e.id === edgeId);
	const currentLabel = (edge?.data?.label as string) ?? "";
	const [draft, setDraft] = useState(currentLabel);

	useEffect(() => {
		setDraft(currentLabel);
	}, [currentLabel]);

	if (!edge) return null;

	const handleCommit = () => {
		if (draft !== currentLabel) {
			onUpdateLabel(edgeId, draft);
		}
	};

	return (
		<aside className="flex w-72 flex-shrink-0 flex-col border-l border-slate-200 bg-white">
			<div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
				<span className="text-sm font-semibold text-slate-700">Edge</span>
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
					<input
						value={draft}
						onChange={(e) => setDraft(e.target.value)}
						onBlur={handleCommit}
						onKeyDown={(e) => {
							if (e.key === "Enter") handleCommit();
						}}
						placeholder="エッジラベルを入力..."
						className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
					/>
					<p className="mt-1 text-xs text-slate-400">
						ラベルをダブルクリックでキャンバス上から編集
					</p>
				</section>
			</div>

			<div className="border-t border-slate-200 p-4">
				<button
					type="button"
					onClick={() => onDeleteEdge(edgeId)}
					className="w-full rounded-lg border border-red-200 py-2 text-sm font-medium text-red-500 hover:bg-red-50"
				>
					Delete Edge
				</button>
			</div>
		</aside>
	);
}
