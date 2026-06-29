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
import { setActiveOrganization, setActiveTeam } from "#/lib/org-server-fns";

const GraphCanvas = lazy(() => import("#/components/graph/GraphCanvas"));

export const Route = createFileRoute(
	"/org/$orgId/team/$teamId/graphs/$graphId/",
)({
	component: TeamGraphPage,
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
			orgId: params.orgId,
			teamId: params.teamId,
		};
	},
});

function TeamGraphPage() {
	const {
		graph,
		initialNodes,
		initialEdges,
		initialNodeTypes,
		initialCreationTypeSettings,
		orgId,
		teamId,
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
				backHref={`/org/${orgId}/team/${teamId}/graphs`}
				orgId={orgId}
				teamId={teamId}
			/>
		</Suspense>
	);
}
