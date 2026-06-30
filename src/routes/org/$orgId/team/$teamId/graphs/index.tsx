import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	redirect,
	useNavigate,
} from "@tanstack/react-router";
import { SparklesIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { TeamCommandPalette } from "#/components/team/TeamCommandPalette";
import { Button } from "#/components/ui/button";
import { Card, CardContent } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import type { graphs } from "#/db/schema";
import { getSession } from "#/lib/graph-auth";
import {
	createGraph,
	deleteGraph,
	listGraphs,
	updateGraphName,
} from "#/lib/graph-server-fns";
import {
	listMembers,
	setActiveOrganization,
	setActiveTeam,
} from "#/lib/org-server-fns";

type Graph = typeof graphs.$inferSelect;

export const Route = createFileRoute("/org/$orgId/team/$teamId/graphs/")({
	beforeLoad: async () => {
		const session = await getSession();
		if (!session) {
			throw redirect({ to: "/login" });
		}
	},
	loader: async ({ params }) => {
		await Promise.all([
			setActiveOrganization({ data: { orgId: params.orgId } }).catch(() => {}),
			setActiveTeam({ data: { teamId: params.teamId } }).catch(() => {}),
		]);
		const [graphs, org] = await Promise.all([
			listGraphs({ data: { teamId: params.teamId } }),
			listMembers({ data: { orgId: params.orgId } }),
		]);
		return { graphs, org };
	},
	component: TeamGraphsPage,
});

function TeamGraphsPage() {
	const { orgId, teamId } = Route.useParams();
	const navigate = useNavigate();
	const qc = useQueryClient();

	const { data: org } = useQuery({
		queryKey: ["org-members", orgId],
		queryFn: () => listMembers({ data: { orgId } }),
	});

	const { data: graphList = [] } = useQuery({
		queryKey: ["team-graphs", teamId],
		queryFn: () => listGraphs({ data: { teamId } }),
	});

	const [paletteOpen, setPaletteOpen] = useState(false);
	const [editingGraphId, setEditingGraphId] = useState<string | null>(null);
	const [editingDraft, setEditingDraft] = useState("");
	const nameInputRef = useRef<HTMLInputElement>(null);
	const singleClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
				e.preventDefault();
				setPaletteOpen((v) => !v);
			}
		};
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, []);

	const createGraphMutation = useMutation({
		mutationFn: (name: string) => createGraph({ data: { name, teamId } }),
		onSuccess: (newGraph) => {
			qc.invalidateQueries({ queryKey: ["team-graphs", teamId] });
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
		onSuccess: () =>
			qc.invalidateQueries({ queryKey: ["team-graphs", teamId] }),
	});

	const deleteGraphMutation = useMutation({
		mutationFn: (id: string) => deleteGraph({ data: { id } }),
		onSuccess: () =>
			qc.invalidateQueries({ queryKey: ["team-graphs", teamId] }),
	});

	const commitGraphName = useCallback(() => {
		if (!editingGraphId) return;
		const trimmed = editingDraft.trim();
		const current =
			(graphList as Graph[]).find((g) => g.id === editingGraphId)?.name ?? "";
		if (trimmed && trimmed !== current) {
			updateNameMutation.mutate({ id: editingGraphId, name: trimmed });
		}
		setEditingGraphId(null);
	}, [editingGraphId, editingDraft, graphList, updateNameMutation]);

	return (
		<main className="mx-auto max-w-4xl px-6 py-8">
			<div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
				<Link to="/orgs" className="hover:text-foreground transition-colors">
					Organizations
				</Link>
				<span>/</span>
				<Link
					to="/org/$orgId"
					params={{ orgId }}
					className="hover:text-foreground transition-colors"
				>
					{org?.name ?? orgId}
				</Link>
				<span>/</span>
				<span className="font-medium text-foreground">Graphs</span>
			</div>

			<div className="space-y-4">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-1">
						<h2 className="text-xl font-semibold text-foreground">Graphs</h2>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							aria-label="コマンドパレットを開く (⌘K)"
							title="コマンドパレットを開く (⌘K)"
							onClick={() => setPaletteOpen(true)}
						>
							<SparklesIcon />
						</Button>
					</div>
					<Button
						type="button"
						disabled={createGraphMutation.isPending}
						onClick={() => createGraphMutation.mutate("New Graph")}
					>
						{createGraphMutation.isPending ? "Creating…" : "+ New Graph"}
					</Button>
				</div>

				{(graphList as Graph[]).length === 0 ? (
					<p className="py-8 text-center text-muted-foreground">
						No graphs yet. Create one to get started.
					</p>
				) : (
					<ul className="space-y-2">
						{(graphList as Graph[]).map((g) => (
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
																	to: "/org/$orgId/team/$teamId/graphs/$graphId",
																	params: { orgId, teamId, graphId: g.id },
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

			<TeamCommandPalette
				open={paletteOpen}
				onOpenChange={setPaletteOpen}
				onOpenSettings={() =>
					navigate({
						to: "/org/$orgId/team/$teamId/settings",
						params: { orgId, teamId },
					})
				}
			/>
		</main>
	);
}
