import { createFileRoute, redirect } from "@tanstack/react-router";
import { GraphTable } from "#/components/graph/GraphTable";
import { getSession } from "#/lib/graph-auth";
import {
	getGraph,
	listGraphNodeMetadata,
	listNodes,
	listNodeTypesForGraph,
} from "#/lib/graph-server-fns";
import { setActiveOrganization, setActiveTeam } from "#/lib/org-server-fns";

export const Route = createFileRoute(
	"/org/$orgId/team/$teamId/graphs/$graphId/table",
)({
	component: TeamGraphTablePage,
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

		const [graph, nodeList, metadata, nodeTypeList] = await Promise.all([
			getGraph({ data: { id: params.graphId } }),
			listNodes({ data: { graphId: params.graphId } }),
			listGraphNodeMetadata({ data: { graphId: params.graphId } }),
			listNodeTypesForGraph({ data: { graphId: params.graphId } }),
		]);
		return {
			graph,
			nodeList,
			metadata,
			nodeTypeList,
			orgId: params.orgId,
			teamId: params.teamId,
		};
	},
});

function TeamGraphTablePage() {
	const { graph, nodeList, metadata, nodeTypeList, orgId, teamId } =
		Route.useLoaderData();
	return (
		<GraphTable
			graph={graph}
			nodeList={nodeList}
			metadata={metadata}
			nodeTypeList={nodeTypeList}
			backHref={`/org/${orgId}/team/${teamId}/graphs/${graph.id}`}
		/>
	);
}
