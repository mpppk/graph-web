import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import type { graphs } from "#/db/schema";
import {
	createGraph,
	deleteGraph,
	listGraphs,
	updateGraphName,
} from "#/lib/graph-server-fns";

type Graph = typeof graphs.$inferSelect;

export function GraphList({ initialGraphs }: { initialGraphs: Graph[] }) {
	const navigate = useNavigate();
	const qc = useQueryClient();
	const [editingGraphId, setEditingGraphId] = useState<string | null>(null);
	const [editingDraft, setEditingDraft] = useState("");
	const nameInputRef = useRef<HTMLInputElement>(null);
	const singleClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	const { data: graphList = initialGraphs } = useQuery({
		queryKey: ["graphs"],
		queryFn: () => listGraphs(),
		initialData: initialGraphs,
	});

	const createGraphMutation = useMutation({
		mutationFn: (name: string) => createGraph({ data: { name } }),
		onSuccess: (newGraph) => {
			qc.invalidateQueries({ queryKey: ["graphs"] });
			if (newGraph) {
				setEditingDraft(newGraph.name);
				setEditingGraphId(newGraph.id);
				setTimeout(() => nameInputRef.current?.select(), 0);
			}
		},
	});

	const updateNameMutation = useMutation({
		mutationFn: ({ id, name }: { id: string; name: string }) =>
			updateGraphName({ data: { id, name } }),
		onSuccess: () => qc.invalidateQueries({ queryKey: ["graphs"] }),
	});

	const deleteGraphMutation = useMutation({
		mutationFn: (id: string) => deleteGraph({ data: { id } }),
		onSuccess: () => qc.invalidateQueries({ queryKey: ["graphs"] }),
	});

	const commitGraphName = useCallback(() => {
		if (!editingGraphId) return;
		const trimmed = editingDraft.trim();
		const current = graphList.find((g) => g.id === editingGraphId)?.name ?? "";
		if (trimmed && trimmed !== current) {
			updateNameMutation.mutate({ id: editingGraphId, name: trimmed });
		}
		setEditingGraphId(null);
	}, [editingGraphId, editingDraft, graphList, updateNameMutation]);

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<h2 className="text-xl font-semibold text-slate-800">Graphs</h2>
				<button
					type="button"
					disabled={createGraphMutation.isPending}
					onClick={() => createGraphMutation.mutate("New Graph")}
					className="rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
				>
					{createGraphMutation.isPending ? "Creating…" : "+ New Graph"}
				</button>
			</div>

			{graphList.length === 0 ? (
				<p className="py-8 text-center text-slate-400">
					No graphs yet. Create one to get started.
				</p>
			) : (
				<ul className="space-y-2">
					{graphList.map((g) => (
						<li
							key={g.id}
							className="flex items-start justify-between rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
						>
							<div className="flex-1 text-left min-w-0">
								{editingGraphId === g.id ? (
									<input
										ref={nameInputRef}
										value={editingDraft}
										onChange={(e) => setEditingDraft(e.target.value)}
										onBlur={commitGraphName}
										onKeyDown={(e) => {
											if (e.key === "Enter") commitGraphName();
											if (e.key === "Escape") setEditingGraphId(null);
										}}
										className="w-full rounded border border-blue-400 px-1 py-0 text-base font-medium text-blue-600 outline-none focus:ring-1 focus:ring-blue-400"
									/>
								) : (
									<button
										type="button"
										onClick={() => {
											if (singleClickTimer.current)
												clearTimeout(singleClickTimer.current);
											singleClickTimer.current = setTimeout(
												() =>
													navigate({
														to: "/graphs/$graphId",
														params: { graphId: g.id },
													}),
												250,
											);
										}}
										onDoubleClick={(e) => {
											e.stopPropagation();
											if (singleClickTimer.current) {
												clearTimeout(singleClickTimer.current);
												singleClickTimer.current = null;
											}
											setEditingDraft(g.name);
											setEditingGraphId(g.id);
											setTimeout(() => nameInputRef.current?.select(), 0);
										}}
										className="text-left"
									>
										<div className="font-medium text-blue-600 hover:underline">
											{g.name}
										</div>
									</button>
								)}
								{g.description && (
									<div className="mt-1 text-sm text-slate-500">
										{g.description}
									</div>
								)}
								<div className="mt-2 font-mono text-xs text-slate-400">
									{g.createdAt}
								</div>
							</div>
							<button
								type="button"
								onClick={() => deleteGraphMutation.mutate(g.id)}
								className="ml-4 rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50"
							>
								Delete
							</button>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
