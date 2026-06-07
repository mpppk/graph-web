import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import { Button } from "#/components/ui/button";
import { Card, CardContent } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
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
				<h2 className="text-xl font-semibold text-foreground">Graphs</h2>
				<Button
					type="button"
					disabled={createGraphMutation.isPending}
					onClick={() => createGraphMutation.mutate("New Graph")}
				>
					{createGraphMutation.isPending ? "Creating…" : "+ New Graph"}
				</Button>
			</div>

			{graphList.length === 0 ? (
				<p className="py-8 text-center text-muted-foreground">
					No graphs yet. Create one to get started.
				</p>
			) : (
				<ul className="space-y-2">
					{graphList.map((g) => (
						<li key={g.id}>
							<Card>
								<CardContent className="flex items-start justify-between p-4">
									<div className="min-w-0 flex-1 text-left">
										{editingGraphId === g.id ? (
											<Input
												ref={nameInputRef}
												value={editingDraft}
												onChange={(e) => setEditingDraft(e.target.value)}
												onBlur={commitGraphName}
												onKeyDown={(e) => {
													if (e.key === "Enter") commitGraphName();
													if (e.key === "Escape") setEditingGraphId(null);
												}}
												className="h-7 max-w-xs text-base font-medium text-primary"
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
												<div className="font-medium text-primary hover:underline">
													{g.name}
												</div>
											</button>
										)}
										{g.description && (
											<div className="mt-1 text-sm text-muted-foreground">
												{g.description}
											</div>
										)}
										<div className="mt-2 font-mono text-xs text-muted-foreground">
											{g.createdAt}
										</div>
									</div>
									<Button
										type="button"
										variant="ghost"
										size="sm"
										onClick={() => deleteGraphMutation.mutate(g.id)}
										className="ml-4 text-destructive hover:text-destructive"
									>
										Delete
									</Button>
								</CardContent>
							</Card>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
