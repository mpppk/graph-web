import { createFileRoute, redirect } from "@tanstack/react-router";
import type { Edge as RFEdge, Node as RFNode } from "@xyflow/react";
import { lazy, Suspense } from "react";
import { getSession } from "#/lib/graph-auth";
import {
	getGraph,
	listCreationTypeSettings,
	listEdges,
	listNodes,
	listNodeTypesForGraph,
} from "#/lib/graph-server-fns";

const GraphCanvas = lazy(() => import("#/components/graph/GraphCanvas"));

// Read-only embed of a graph, rendered inside an MCP App iframe on the host
// (Claude etc.). Reuses the same GraphCanvas as the full app, forced into read
// mode. Authenticated by the browser cookie session (not the MCP OAuth token),
// so an unauthenticated viewer is redirected to /login inside the iframe.
export const Route = createFileRoute("/embed/graphs/$graphId")({
	component: EmbedGraphPage,
	beforeLoad: async () => {
		const session = await getSession();
		if (!session) {
			throw redirect({ to: "/login" });
		}
	},
	loader: async ({ params }) => {
		const [graph, nodeList, edgeList, nodeTypeList, creationTypeSettings] =
			await Promise.all([
				getGraph({ data: { id: params.graphId } }),
				listNodes({ data: { graphId: params.graphId } }),
				listEdges({ data: { graphId: params.graphId } }),
				listNodeTypesForGraph({ data: { graphId: params.graphId } }),
				listCreationTypeSettings({ data: { graphId: params.graphId } }),
			]);

		const initialNodes: RFNode[] = nodeList.map((n) => ({
			id: n.id,
			type: "default",
			position: { x: n.x, y: n.y },
			data: { label: n.label, nodeType: n.nodeType ?? null },
		}));

		const initialEdges: RFEdge[] = edgeList.map((e) => ({
			id: e.id,
			source: e.sourceNodeId,
			target: e.targetNodeId,
			type: "editable",
			data: { label: e.label ?? "" },
		}));

		return {
			graph,
			initialNodes,
			initialEdges,
			initialNodeTypes: nodeTypeList,
			initialCreationTypeSettings: creationTypeSettings,
		};
	},
});

function EmbedGraphPage() {
	const {
		graph,
		initialNodes,
		initialEdges,
		initialNodeTypes,
		initialCreationTypeSettings,
	} = Route.useLoaderData();

	return (
		<div className="flex h-full flex-col">
			<div className="flex flex-shrink-0 items-center gap-2 border-b bg-background/80 px-3 py-2 backdrop-blur-lg">
				<span className="min-w-0 flex-1 truncate text-sm font-medium">
					{graph.name}
				</span>
				<a
					href={`/graphs/${graph.id}`}
					target="_blank"
					rel="noopener noreferrer"
					className="inline-flex flex-shrink-0 items-center rounded-md border bg-card px-2.5 py-1 text-xs font-medium no-underline shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
				>
					編集画面を開く
				</a>
			</div>
			<div className="min-h-0 flex-1">
				<Suspense
					fallback={
						<div className="flex h-full items-center justify-center text-muted-foreground">
							Loading canvas…
						</div>
					}
				>
					<GraphCanvas
						graph={graph}
						initialNodes={initialNodes}
						initialEdges={initialEdges}
						initialNodeTypes={initialNodeTypes}
						initialCreationTypeSettings={initialCreationTypeSettings}
						initialMode="read"
					/>
				</Suspense>
			</div>
		</div>
	);
}
