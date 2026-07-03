import { createFileRoute } from "@tanstack/react-router";
import { GraphTable } from "#/components/graph/GraphTable";
import {
	getGraph,
	listGraphNodeMetadata,
	listNodes,
	listNodeTypesForGraph,
} from "#/lib/graph-server-fns";

export const Route = createFileRoute("/graphs/$graphId/table")({
	component: GraphTablePage,
	loader: async ({ params }) => {
		const [graph, nodeList, metadata, nodeTypeList] = await Promise.all([
			getGraph({ data: { id: params.graphId } }),
			listNodes({ data: { graphId: params.graphId } }),
			listGraphNodeMetadata({ data: { graphId: params.graphId } }),
			listNodeTypesForGraph({ data: { graphId: params.graphId } }),
		]);
		return { graph, nodeList, metadata, nodeTypeList };
	},
});

function GraphTablePage() {
	const { graph, nodeList, metadata, nodeTypeList } = Route.useLoaderData();
	return (
		<GraphTable
			graph={graph}
			nodeList={nodeList}
			metadata={metadata}
			nodeTypeList={nodeTypeList}
			backHref={`/graphs/${graph.id}`}
		/>
	);
}
