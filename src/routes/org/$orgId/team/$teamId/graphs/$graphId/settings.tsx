import { createFileRoute, redirect } from "@tanstack/react-router";
import { GraphSettings } from "#/components/graph/GraphSettings";
import { getSession } from "#/lib/graph-auth";
import {
	getGraph,
	listCreationTypeSettings,
	listNodeTypesForGraph,
} from "#/lib/graph-server-fns";
import { setActiveOrganization, setActiveTeam } from "#/lib/org-server-fns";

export const Route = createFileRoute(
	"/org/$orgId/team/$teamId/graphs/$graphId/settings",
)({
	component: TeamGraphSettingsPage,
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

		const [graph, nodeTypeList, creationTypeSettings] = await Promise.all([
			getGraph({ data: { id: params.graphId } }),
			listNodeTypesForGraph({ data: { graphId: params.graphId } }),
			listCreationTypeSettings({ data: { graphId: params.graphId } }),
		]);

		return {
			graph,
			initialNodeTypes: nodeTypeList,
			initialCreationTypeSettings: creationTypeSettings,
			orgId: params.orgId,
			teamId: params.teamId,
		};
	},
});

function TeamGraphSettingsPage() {
	const {
		graph,
		initialNodeTypes,
		initialCreationTypeSettings,
		orgId,
		teamId,
	} = Route.useLoaderData();

	return (
		<GraphSettings
			graph={graph}
			backHref={`/org/${orgId}/team/${teamId}/graphs/${graph.id}`}
			orgId={orgId}
			teamId={teamId}
			initialNodeTypes={initialNodeTypes}
			initialCreationTypeSettings={initialCreationTypeSettings}
		/>
	);
}
