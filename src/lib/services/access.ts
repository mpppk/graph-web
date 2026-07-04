import { and, eq } from "drizzle-orm";
import * as authSchema from "#/db/auth-schema";
import { db } from "#/db/index";
import { edges, graphs, nodeMetadata, nodes } from "#/db/schema";

// Authorization helpers shared by server functions and MCP tools. Unlike the
// previous in-request helpers these take the acting userId explicitly and
// never touch the request context, so they work outside a browser session
// (e.g. for OAuth bearer tokens).

// Verify the user is a member of the organization by querying the membership
// table directly (equivalent to the members check previously done through
// auth.api.getFullOrganization, which required session headers).
export async function assertOrgMember(
	orgId: string,
	userId: string,
): Promise<void> {
	const [row] = await db
		.select({ id: authSchema.member.id })
		.from(authSchema.member)
		.where(
			and(
				eq(authSchema.member.organizationId, orgId),
				eq(authSchema.member.userId, userId),
			),
		)
		.limit(1);
	if (!row) throw new Error("Forbidden");
}

export async function assertTeamAccess(teamId: string, userId: string) {
	const [team] = await db
		.select()
		.from(authSchema.team)
		.where(eq(authSchema.team.id, teamId));
	if (!team) throw new Error("Team not found");
	await assertOrgMember(team.organizationId, userId);
	return team;
}

// Verify the user can access the graph.
// Team-owned graphs: user must be an org member.
// Legacy user-owned graphs: user must be the owner.
export async function assertGraphAccess(graphId: string, userId: string) {
	const [graph] = await db.select().from(graphs).where(eq(graphs.id, graphId));
	if (!graph) throw new Error("Graph not found");

	if (graph.teamId) {
		const [graphTeam] = await db
			.select()
			.from(authSchema.team)
			.where(eq(authSchema.team.id, graph.teamId));
		if (!graphTeam) throw new Error("Graph not found");
		await assertOrgMember(graphTeam.organizationId, userId);
	} else {
		if (graph.userId !== userId) throw new Error("Forbidden");
	}
	return graph;
}

// Resolve a node and authorize the user through its parent graph.
export async function requireNodeWithAccess(nodeId: string, userId: string) {
	const [node] = await db.select().from(nodes).where(eq(nodes.id, nodeId));
	if (!node) throw new Error("Node not found");
	const graph = await assertGraphAccess(node.graphId, userId);
	return { node, graph };
}

// Resolve an edge and authorize the user through its parent graph.
export async function requireEdgeWithAccess(edgeId: string, userId: string) {
	const [edge] = await db.select().from(edges).where(eq(edges.id, edgeId));
	if (!edge) throw new Error("Edge not found");
	const graph = await assertGraphAccess(edge.graphId, userId);
	return { edge, graph };
}

// Resolve a metadata row and authorize the user through its node's graph.
export async function requireMetadataWithAccess(
	metadataId: string,
	userId: string,
) {
	const [meta] = await db
		.select()
		.from(nodeMetadata)
		.where(eq(nodeMetadata.id, metadataId));
	if (!meta) throw new Error("Metadata not found");
	const { graph } = await requireNodeWithAccess(meta.nodeId, userId);
	return { meta, graph };
}
