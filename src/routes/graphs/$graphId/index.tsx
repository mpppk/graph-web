import { createFileRoute } from "@tanstack/react-router";
import type { Edge as RFEdge, Node as RFNode } from "@xyflow/react";
import { lazy, Suspense } from "react";
import {
	getGraph,
	listCreationTypeSettings,
	listEdges,
	listNodes,
	listNodeTypesForGraph,
} from "#/lib/graph-server-fns";

const GraphCanvas = lazy(() => import("#/components/graph/GraphCanvas"));

export const Route = createFileRoute("/graphs/$graphId/")({
	component: GraphPage,
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

function GraphPage() {
	const {
		graph,
		initialNodes,
		initialEdges,
		initialNodeTypes,
		initialCreationTypeSettings,
	} = Route.useLoaderData();

	return (
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
				backHref="/graphs"
			/>
		</Suspense>
	);
}
