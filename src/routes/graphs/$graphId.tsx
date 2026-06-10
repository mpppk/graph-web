import { createFileRoute } from "@tanstack/react-router";
import type { Edge as RFEdge, Node as RFNode } from "@xyflow/react";
import { lazy, Suspense } from "react";
import { getGraph, listEdges, listNodes } from "#/lib/graph-server-fns";

const GraphCanvas = lazy(() => import("#/components/graph/GraphCanvas"));

export const Route = createFileRoute("/graphs/$graphId")({
	component: GraphPage,
	loader: async ({ params }) => {
		const [graph, nodeList, edgeList] = await Promise.all([
			getGraph({ data: { id: params.graphId } }),
			listNodes({ data: { graphId: params.graphId } }),
			listEdges({ data: { graphId: params.graphId } }),
		]);

		const initialNodes: RFNode[] = nodeList.map((n) => ({
			id: n.id,
			type: "editableNode",
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

		return { graph, initialNodes, initialEdges };
	},
});

function GraphPage() {
	const { graph, initialNodes, initialEdges } = Route.useLoaderData();

	return (
		<Suspense
			fallback={
				<div className="flex h-screen items-center justify-center text-muted-foreground">
					Loading canvas…
				</div>
			}
		>
			<GraphCanvas
				graph={graph}
				initialNodes={initialNodes}
				initialEdges={initialEdges}
			/>
		</Suspense>
	);
}
