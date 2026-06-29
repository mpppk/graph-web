import { createFileRoute } from "@tanstack/react-router";
import { GraphSettings } from "#/components/graph/GraphSettings";
import {
	getGraph,
	listCreationTypeSettings,
	listNodeTypesForGraph,
} from "#/lib/graph-server-fns";

export const Route = createFileRoute("/graphs/$graphId/settings")({
	component: GraphSettingsPage,
	loader: async ({ params }) => {
		const [graph, nodeTypeList, creationTypeSettings] = await Promise.all([
			getGraph({ data: { id: params.graphId } }),
			listNodeTypesForGraph({ data: { graphId: params.graphId } }),
			listCreationTypeSettings({ data: { graphId: params.graphId } }),
		]);
		return {
			graph,
			initialNodeTypes: nodeTypeList,
			initialCreationTypeSettings: creationTypeSettings,
		};
	},
});

function GraphSettingsPage() {
	const { graph, initialNodeTypes, initialCreationTypeSettings } =
		Route.useLoaderData();

	return (
		<GraphSettings
			graph={graph}
			backHref={`/graphs/${graph.id}`}
			initialNodeTypes={initialNodeTypes}
			initialCreationTypeSettings={initialCreationTypeSettings}
		/>
	);
}
