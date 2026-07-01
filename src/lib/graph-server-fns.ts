import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import * as authSchema from "#/db/auth-schema";
import { db } from "#/db/index";
import {
	edges,
	graphCreationTypeSettings,
	graphs,
	graphTemplates,
	nodeMetadata,
	nodes,
	nodeTypeFields,
	nodeTypes,
	templateNodeTypes,
} from "#/db/schema";
import { auth } from "#/lib/auth";
import { requireUserId } from "#/lib/graph-auth-internal";

// ── Shared helpers ────────────────────────────────────────────────────────────

const DEFAULT_NODE_TYPES: { name: string; color: string }[] = [
	{ name: "KPI", color: "#3b82f6" },
	{ name: "Epic", color: "#8b5cf6" },
	{ name: "Feature", color: "#22c55e" },
	{ name: "Opportunity", color: "#f97316" },
	{ name: "Solution", color: "#14b8a6" },
];

// Verify the user is a member of the organization.
async function assertOrgAccess(orgId: string, userId: string) {
	const org = await auth.api.getFullOrganization({
		headers: getRequest().headers,
		query: { organizationId: orgId },
	});
	if (!org?.members?.some((m) => m.userId === userId))
		throw new Error("Forbidden");
	return org;
}

async function assertTeamAccess(teamId: string, userId: string) {
	const [team] = await db
		.select()
		.from(authSchema.team)
		.where(eq(authSchema.team.id, teamId));
	if (!team) throw new Error("Team not found");
	await assertOrgAccess(team.organizationId, userId);
	return team;
}

// Verify the user can access the graph.
// Team-owned graphs: user must be an org member.
// Legacy user-owned graphs: user must be the owner.
async function assertGraphAccess(graphId: string, userId: string) {
	const [graph] = await db.select().from(graphs).where(eq(graphs.id, graphId));
	if (!graph) throw new Error("Graph not found");

	if (graph.teamId) {
		const [graphTeam] = await db
			.select()
			.from(authSchema.team)
			.where(eq(authSchema.team.id, graph.teamId));
		if (!graphTeam) throw new Error("Graph not found");
		const org = await auth.api.getFullOrganization({
			headers: getRequest().headers,
			query: { organizationId: graphTeam.organizationId },
		});
		const isMember = org?.members?.some((m) => m.userId === userId);
		if (!isMember) throw new Error("Forbidden");
	} else {
		if (graph.userId !== userId) throw new Error("Forbidden");
	}
	return graph;
}

// Idempotently seed the default user-scope node types for a user.
async function ensureDefaultNodeTypes(userId: string) {
	await db
		.insert(nodeTypes)
		.values(
			DEFAULT_NODE_TYPES.map((t) => ({
				id: crypto.randomUUID(),
				scope: "user" as const,
				scopeId: userId,
				name: t.name,
				color: t.color,
			})),
		)
		.onConflictDoNothing();
}

// Resolve a node type the user is allowed to modify.
// Precedence: user-scope (own), graph-scope (own graph), team-scope (org member), org-scope (org member).
async function requireOwnedNodeType(typeId: string, userId: string) {
	const [type] = await db
		.select()
		.from(nodeTypes)
		.where(eq(nodeTypes.id, typeId));
	if (!type) throw new Error("Node type not found");

	if (type.scope === "user") {
		if (type.scopeId !== userId) throw new Error("Forbidden");
	} else if (type.scope === "graph") {
		await assertGraphAccess(type.scopeId, userId);
	} else if (type.scope === "team") {
		// verify user is a member of the org that owns this team
		const [scopeTeam] = await db
			.select()
			.from(authSchema.team)
			.where(eq(authSchema.team.id, type.scopeId));
		if (!scopeTeam) throw new Error("Node type not found");
		const org = await auth.api.getFullOrganization({
			headers: getRequest().headers,
			query: { organizationId: scopeTeam.organizationId },
		});
		if (!org?.members?.some((m) => m.userId === userId))
			throw new Error("Forbidden");
	} else if (type.scope === "org") {
		await assertOrgAccess(type.scopeId, userId);
	} else {
		throw new Error("Unsupported node type scope");
	}
	return type;
}

// Add a node type's template metadata keys to a node (empty values, never
// overwriting existing entries). Resolves the applicable type definition using
// graph > team > org > user precedence. Returns the keys that were seeded.
async function seedNodeTypeTemplate(
	nodeId: string,
	graph: typeof graphs.$inferSelect,
	nodeType: string,
): Promise<string[]> {
	const conditions: ReturnType<typeof and>[] = [
		and(eq(nodeTypes.scope, "user"), eq(nodeTypes.scopeId, graph.userId)),
		and(eq(nodeTypes.scope, "graph"), eq(nodeTypes.scopeId, graph.id)),
	];

	if (graph.teamId) {
		const [graphTeam] = await db
			.select()
			.from(authSchema.team)
			.where(eq(authSchema.team.id, graph.teamId));
		if (graphTeam) {
			conditions.push(
				and(eq(nodeTypes.scope, "team"), eq(nodeTypes.scopeId, graph.teamId)),
			);
			conditions.push(
				and(
					eq(nodeTypes.scope, "org"),
					eq(nodeTypes.scopeId, graphTeam.organizationId),
				),
			);
		}
	}

	const matches = await db
		.select()
		.from(nodeTypes)
		.where(
			and(
				eq(nodeTypes.name, nodeType),
				or(...(conditions as Parameters<typeof or>)),
			),
		);

	// graph > team > org > user precedence
	const scopePriority = { graph: 0, team: 1, org: 2, user: 3 } as Record<
		string,
		number
	>;
	const type = matches.sort(
		(a, b) => (scopePriority[a.scope] ?? 99) - (scopePriority[b.scope] ?? 99),
	)[0];
	if (!type) return [];

	const fields = await db
		.select()
		.from(nodeTypeFields)
		.where(eq(nodeTypeFields.nodeTypeId, type.id));
	if (!fields.length) return [];

	await db
		.insert(nodeMetadata)
		.values(
			fields.map((f) => ({
				id: crypto.randomUUID(),
				nodeId,
				key: f.key,
				value: "",
			})),
		)
		.onConflictDoNothing();

	return fields.map((f) => f.key);
}

// Apply a template to a freshly created graph by seeding creation-type
// overrides: every node type applicable to the graph whose name is NOT in the
// template's allowlist is disabled for node creation. Allowlisted types stay
// enabled by default (no override row needed).
async function applyTemplateToGraph(
	graph: typeof graphs.$inferSelect,
	templateId: string,
) {
	const [tpl] = await db
		.select()
		.from(graphTemplates)
		.where(eq(graphTemplates.id, templateId));
	if (!tpl) return;

	const allow = await db
		.select({ name: nodeTypes.name })
		.from(templateNodeTypes)
		.innerJoin(nodeTypes, eq(templateNodeTypes.nodeTypeId, nodeTypes.id))
		.where(eq(templateNodeTypes.templateId, templateId));
	const allowNames = new Set(allow.map((a) => a.name));

	// Ensure the owner's default user-scope types exist so they're considered.
	await ensureDefaultNodeTypes(graph.userId);

	const conditions: ReturnType<typeof and>[] = [
		and(eq(nodeTypes.scope, "user"), eq(nodeTypes.scopeId, graph.userId)),
	];
	if (graph.teamId) {
		const [graphTeam] = await db
			.select()
			.from(authSchema.team)
			.where(eq(authSchema.team.id, graph.teamId));
		if (graphTeam) {
			conditions.push(
				and(eq(nodeTypes.scope, "team"), eq(nodeTypes.scopeId, graph.teamId)),
			);
			conditions.push(
				and(
					eq(nodeTypes.scope, "org"),
					eq(nodeTypes.scopeId, graphTeam.organizationId),
				),
			);
		}
	}

	const candidates = await db
		.select({ name: nodeTypes.name })
		.from(nodeTypes)
		.where(or(...(conditions as Parameters<typeof or>)));
	const disableNames = [...new Set(candidates.map((c) => c.name))].filter(
		(n) => !allowNames.has(n),
	);

	if (disableNames.length) {
		await db
			.insert(graphCreationTypeSettings)
			.values(
				disableNames.map((typeName) => ({
					id: crypto.randomUUID(),
					graphId: graph.id,
					typeName,
					enabled: false,
				})),
			)
			.onConflictDoNothing();
	}
}

// ── Graph operations ──────────────────────────────────────────────────────────

export const listGraphs = createServerFn({ method: "GET" })
	.inputValidator((data: { teamId?: string } | undefined) => data ?? {})
	.handler(async ({ data }) => {
		const userId = await requireUserId();
		if (data?.teamId) {
			return db.select().from(graphs).where(eq(graphs.teamId, data.teamId));
		}
		// Legacy: personal graphs with no team
		return db
			.select()
			.from(graphs)
			.where(and(eq(graphs.userId, userId), isNull(graphs.teamId)));
	});

export const createGraph = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			name: string;
			description?: string;
			teamId?: string;
			templateId?: string;
		}) => data,
	)
	.handler(async ({ data }) => {
		const userId = await requireUserId();
		const id = crypto.randomUUID();
		await db.insert(graphs).values({
			id,
			userId,
			teamId: data.teamId ?? null,
			templateId: data.templateId ?? null,
			name: data.name,
			description: data.description ?? "",
		});
		const [graph] = await db.select().from(graphs).where(eq(graphs.id, id));
		if (data.templateId) await applyTemplateToGraph(graph, data.templateId);
		return graph;
	});

export const getGraph = createServerFn({ method: "GET" })
	.inputValidator((data: { id: string }) => data)
	.handler(async ({ data }) => {
		const userId = await requireUserId();
		return assertGraphAccess(data.id, userId);
	});

export const updateGraphName = createServerFn({ method: "POST" })
	.inputValidator((data: { id: string; name: string }) => data)
	.handler(async ({ data }) => {
		const userId = await requireUserId();
		await assertGraphAccess(data.id, userId);
		await db
			.update(graphs)
			.set({ name: data.name })
			.where(eq(graphs.id, data.id));
		const [graph] = await db
			.select()
			.from(graphs)
			.where(eq(graphs.id, data.id));
		return graph;
	});

export const deleteGraph = createServerFn({ method: "POST" })
	.inputValidator((data: { id: string }) => data)
	.handler(async ({ data }) => {
		const userId = await requireUserId();
		await assertGraphAccess(data.id, userId);
		await db.delete(graphs).where(eq(graphs.id, data.id));
		// graph-scope node types have no FK so must be cleaned up explicitly (fields cascade).
		await db
			.delete(nodeTypes)
			.where(and(eq(nodeTypes.scope, "graph"), eq(nodeTypes.scopeId, data.id)));
		return { success: true };
	});

// ── Node operations ───────────────────────────────────────────────────────────

export const listNodes = createServerFn({ method: "GET" })
	.inputValidator((data: { graphId: string }) => data)
	.handler(async ({ data }) => {
		const userId = await requireUserId();
		await assertGraphAccess(data.graphId, userId);
		return db.select().from(nodes).where(eq(nodes.graphId, data.graphId));
	});

export const createNode = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			graphId: string;
			label: string;
			x?: number;
			y?: number;
			nodeType?: string | null;
		}) => data,
	)
	.handler(async ({ data }) => {
		const userId = await requireUserId();
		const graph = await assertGraphAccess(data.graphId, userId);
		const id = crypto.randomUUID();
		const nodeType = data.nodeType ?? null;
		await db.insert(nodes).values({
			id,
			graphId: data.graphId,
			label: data.label,
			x: data.x ?? 0,
			y: data.y ?? 0,
			nodeType,
		});
		// Seed the type's template metadata so a typed node starts with its fields.
		if (nodeType) await seedNodeTypeTemplate(id, graph, nodeType);
		const [node] = await db.select().from(nodes).where(eq(nodes.id, id));
		return node;
	});

export const updateNodePosition = createServerFn({ method: "POST" })
	.inputValidator((data: { id: string; x: number; y: number }) => data)
	.handler(async ({ data }) => {
		await db
			.update(nodes)
			.set({ x: data.x, y: data.y })
			.where(eq(nodes.id, data.id));
		return { success: true };
	});

export const updateNodeLabel = createServerFn({ method: "POST" })
	.inputValidator((data: { id: string; label: string }) => data)
	.handler(async ({ data }) => {
		await db
			.update(nodes)
			.set({ label: data.label })
			.where(eq(nodes.id, data.id));
		const [node] = await db.select().from(nodes).where(eq(nodes.id, data.id));
		return node;
	});

export const deleteNode = createServerFn({ method: "POST" })
	.inputValidator((data: { id: string }) => data)
	.handler(async ({ data }) => {
		await db.delete(nodes).where(eq(nodes.id, data.id));
		return { success: true };
	});

export const pasteNodes = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			graphId: string;
			nodes: Array<{
				tempId: string;
				label: string;
				x: number;
				y: number;
				nodeType: string | null;
				metadata: Array<{ key: string; value: string }>;
			}>;
			edges: Array<{
				sourceTempId: string;
				targetTempId: string;
				label: string;
			}>;
		}) => data,
	)
	.handler(async ({ data }) => {
		const userId = await requireUserId();
		await assertGraphAccess(data.graphId, userId);

		const nodeIdMap = new Map<string, string>();
		for (const n of data.nodes) {
			nodeIdMap.set(n.tempId, crypto.randomUUID());
		}
		const getNodeId = (tempId: string) => {
			const id = nodeIdMap.get(tempId);
			if (!id) throw new Error(`Unknown tempId: ${tempId}`);
			return id;
		};

		if (data.nodes.length > 0) {
			await db.insert(nodes).values(
				data.nodes.map((n) => ({
					id: getNodeId(n.tempId),
					graphId: data.graphId,
					label: n.label,
					x: n.x,
					y: n.y,
					nodeType: n.nodeType,
				})),
			);
		}

		const allMetadata = data.nodes.flatMap((n) =>
			n.metadata.map((m) => ({
				id: crypto.randomUUID(),
				nodeId: getNodeId(n.tempId),
				key: m.key,
				value: m.value,
			})),
		);
		if (allMetadata.length > 0) {
			await db.insert(nodeMetadata).values(allMetadata);
		}

		const createdEdges: Array<{
			id: string;
			sourceNodeId: string;
			targetNodeId: string;
			label: string;
		}> = [];
		if (data.edges.length > 0) {
			const edgeValues = data.edges.map((e) => {
				const id = crypto.randomUUID();
				const sourceNodeId = getNodeId(e.sourceTempId);
				const targetNodeId = getNodeId(e.targetTempId);
				createdEdges.push({ id, sourceNodeId, targetNodeId, label: e.label });
				return {
					id,
					graphId: data.graphId,
					sourceNodeId,
					targetNodeId,
					label: e.label,
				};
			});
			await db.insert(edges).values(edgeValues);
		}

		return {
			nodeIdMap: Object.fromEntries(nodeIdMap),
			edges: createdEdges,
		};
	});

// ── Edge operations ───────────────────────────────────────────────────────────

export const listEdges = createServerFn({ method: "GET" })
	.inputValidator((data: { graphId: string }) => data)
	.handler(async ({ data }) => {
		return db.select().from(edges).where(eq(edges.graphId, data.graphId));
	});

export const createEdge = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			graphId: string;
			sourceNodeId: string;
			targetNodeId: string;
			label?: string;
		}) => data,
	)
	.handler(async ({ data }) => {
		const id = crypto.randomUUID();
		await db.insert(edges).values({
			id,
			graphId: data.graphId,
			sourceNodeId: data.sourceNodeId,
			targetNodeId: data.targetNodeId,
			label: data.label ?? "",
		});
		const [edge] = await db.select().from(edges).where(eq(edges.id, id));
		return edge;
	});

export const updateEdgeLabel = createServerFn({ method: "POST" })
	.inputValidator((data: { id: string; label: string }) => data)
	.handler(async ({ data }) => {
		await db
			.update(edges)
			.set({ label: data.label })
			.where(eq(edges.id, data.id));
		const [edge] = await db.select().from(edges).where(eq(edges.id, data.id));
		return edge;
	});

export const deleteEdge = createServerFn({ method: "POST" })
	.inputValidator((data: { id: string }) => data)
	.handler(async ({ data }) => {
		await db.delete(edges).where(eq(edges.id, data.id));
		return { success: true };
	});

// ── Metadata operations ───────────────────────────────────────────────────────

export const listNodeMetadata = createServerFn({ method: "GET" })
	.inputValidator((data: { nodeId: string }) => data)
	.handler(async ({ data }) => {
		return db
			.select()
			.from(nodeMetadata)
			.where(eq(nodeMetadata.nodeId, data.nodeId));
	});

export const upsertNodeMetadata = createServerFn({ method: "POST" })
	.inputValidator(
		(data: { nodeId: string; key: string; value: string }) => data,
	)
	.handler(async ({ data }) => {
		const id = crypto.randomUUID();
		await db
			.insert(nodeMetadata)
			.values({ id, nodeId: data.nodeId, key: data.key, value: data.value })
			.onConflictDoUpdate({
				target: [nodeMetadata.nodeId, nodeMetadata.key],
				set: { value: data.value },
			});
		const [meta] = await db
			.select()
			.from(nodeMetadata)
			.where(
				and(
					eq(nodeMetadata.nodeId, data.nodeId),
					eq(nodeMetadata.key, data.key),
				),
			);
		return meta;
	});

export const deleteNodeMetadata = createServerFn({ method: "POST" })
	.inputValidator((data: { id: string }) => data)
	.handler(async ({ data }) => {
		await db.delete(nodeMetadata).where(eq(nodeMetadata.id, data.id));
		return { success: true };
	});

// ── Node type operations ──────────────────────────────────────────────────────

export type NodeTypeWithFields = {
	id: string;
	scope: string;
	scopeId: string;
	name: string;
	color: string;
	fields: { id: string; key: string; position: number }[];
};

// List the node types applicable to a graph:
// user-scope (graph owner) + graph-scope + team-scope + org-scope (when team-owned).
export const listNodeTypesForGraph = createServerFn({ method: "GET" })
	.inputValidator((data: { graphId: string }) => data)
	.handler(async ({ data }): Promise<NodeTypeWithFields[]> => {
		const userId = await requireUserId();
		const graph = await assertGraphAccess(data.graphId, userId);
		await ensureDefaultNodeTypes(graph.userId);

		const conditions: ReturnType<typeof and>[] = [
			and(eq(nodeTypes.scope, "user"), eq(nodeTypes.scopeId, graph.userId)),
			and(eq(nodeTypes.scope, "graph"), eq(nodeTypes.scopeId, data.graphId)),
		];

		if (graph.teamId) {
			const [graphTeam] = await db
				.select()
				.from(authSchema.team)
				.where(eq(authSchema.team.id, graph.teamId));
			if (graphTeam) {
				conditions.push(
					and(eq(nodeTypes.scope, "team"), eq(nodeTypes.scopeId, graph.teamId)),
				);
				conditions.push(
					and(
						eq(nodeTypes.scope, "org"),
						eq(nodeTypes.scopeId, graphTeam.organizationId),
					),
				);
			}
		}

		const types = await db
			.select()
			.from(nodeTypes)
			.where(or(...(conditions as Parameters<typeof or>)));

		const typeIds = types.map((t) => t.id);
		const fields = typeIds.length
			? await db
					.select()
					.from(nodeTypeFields)
					.where(inArray(nodeTypeFields.nodeTypeId, typeIds))
			: [];

		return types.map((t) => ({
			id: t.id,
			scope: t.scope,
			scopeId: t.scopeId,
			name: t.name,
			color: t.color,
			fields: fields
				.filter((f) => f.nodeTypeId === t.id)
				.sort((a, b) => a.position - b.position)
				.map((f) => ({ id: f.id, key: f.key, position: f.position })),
		}));
	});

export const listNodeTypesForTeam = createServerFn({ method: "GET" })
	.inputValidator((data: { teamId: string }) => data)
	.handler(async ({ data }): Promise<NodeTypeWithFields[]> => {
		const userId = await requireUserId();
		await assertTeamAccess(data.teamId, userId);

		const types = await db
			.select()
			.from(nodeTypes)
			.where(
				and(eq(nodeTypes.scope, "team"), eq(nodeTypes.scopeId, data.teamId)),
			);

		const typeIds = types.map((t) => t.id);
		const fields = typeIds.length
			? await db
					.select()
					.from(nodeTypeFields)
					.where(inArray(nodeTypeFields.nodeTypeId, typeIds))
			: [];

		return types.map((t) => ({
			id: t.id,
			scope: t.scope,
			scopeId: t.scopeId,
			name: t.name,
			color: t.color,
			fields: fields
				.filter((f) => f.nodeTypeId === t.id)
				.sort((a, b) => a.position - b.position)
				.map((f) => ({ id: f.id, key: f.key, position: f.position })),
		}));
	});

export const createNodeTypeForTeam = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			teamId: string;
			name: string;
			color: string;
			fields?: string[];
		}) => data,
	)
	.handler(async ({ data }) => {
		const userId = await requireUserId();
		await assertTeamAccess(data.teamId, userId);

		const name = data.name.trim();
		if (!name) throw new Error("Name is required");

		const id = crypto.randomUUID();
		await db.insert(nodeTypes).values({
			id,
			scope: "team",
			scopeId: data.teamId,
			name,
			color: data.color,
		});

		const keys = [
			...new Set((data.fields ?? []).map((k) => k.trim()).filter(Boolean)),
		];
		if (keys.length) {
			await db.insert(nodeTypeFields).values(
				keys.map((key, i) => ({
					id: crypto.randomUUID(),
					nodeTypeId: id,
					key,
					position: i,
				})),
			);
		}
		return { id };
	});

export const listNodeTypesForOrg = createServerFn({ method: "GET" })
	.inputValidator((data: { orgId: string }) => data)
	.handler(async ({ data }): Promise<NodeTypeWithFields[]> => {
		const userId = await requireUserId();
		await assertOrgAccess(data.orgId, userId);

		const types = await db
			.select()
			.from(nodeTypes)
			.where(
				and(eq(nodeTypes.scope, "org"), eq(nodeTypes.scopeId, data.orgId)),
			);

		const typeIds = types.map((t) => t.id);
		const fields = typeIds.length
			? await db
					.select()
					.from(nodeTypeFields)
					.where(inArray(nodeTypeFields.nodeTypeId, typeIds))
			: [];

		return types.map((t) => ({
			id: t.id,
			scope: t.scope,
			scopeId: t.scopeId,
			name: t.name,
			color: t.color,
			fields: fields
				.filter((f) => f.nodeTypeId === t.id)
				.sort((a, b) => a.position - b.position)
				.map((f) => ({ id: f.id, key: f.key, position: f.position })),
		}));
	});

export const createNodeTypeForOrg = createServerFn({ method: "POST" })
	.inputValidator(
		(data: { orgId: string; name: string; color: string; fields?: string[] }) =>
			data,
	)
	.handler(async ({ data }) => {
		const userId = await requireUserId();
		await assertOrgAccess(data.orgId, userId);

		const name = data.name.trim();
		if (!name) throw new Error("Name is required");

		const id = crypto.randomUUID();
		await db.insert(nodeTypes).values({
			id,
			scope: "org",
			scopeId: data.orgId,
			name,
			color: data.color,
		});

		const keys = [
			...new Set((data.fields ?? []).map((k) => k.trim()).filter(Boolean)),
		];
		if (keys.length) {
			await db.insert(nodeTypeFields).values(
				keys.map((key, i) => ({
					id: crypto.randomUUID(),
					nodeTypeId: id,
					key,
					position: i,
				})),
			);
		}
		return { id };
	});

export const createNodeType = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			graphId: string;
			scope: "user" | "graph" | "team" | "org";
			name: string;
			color: string;
			fields?: string[];
		}) => data,
	)
	.handler(async ({ data }) => {
		const userId = await requireUserId();
		const graph = await assertGraphAccess(data.graphId, userId);

		const name = data.name.trim();
		if (!name) throw new Error("Name is required");

		let scopeId: string;
		if (data.scope === "user") {
			scopeId = graph.userId;
		} else if (data.scope === "graph") {
			scopeId = data.graphId;
		} else if (data.scope === "team") {
			if (!graph.teamId) throw new Error("Graph is not team-owned");
			scopeId = graph.teamId;
		} else if (data.scope === "org") {
			if (!graph.teamId) throw new Error("Graph is not team-owned");
			const [graphTeam] = await db
				.select()
				.from(authSchema.team)
				.where(eq(authSchema.team.id, graph.teamId));
			if (!graphTeam) throw new Error("Team not found");
			scopeId = graphTeam.organizationId;
		} else {
			throw new Error("Unsupported node type scope");
		}

		const id = crypto.randomUUID();
		await db.insert(nodeTypes).values({
			id,
			scope: data.scope,
			scopeId,
			name,
			color: data.color,
		});

		const keys = [
			...new Set((data.fields ?? []).map((k) => k.trim()).filter(Boolean)),
		];
		if (keys.length) {
			await db.insert(nodeTypeFields).values(
				keys.map((key, i) => ({
					id: crypto.randomUUID(),
					nodeTypeId: id,
					key,
					position: i,
				})),
			);
		}
		return { id };
	});

// Update a node type's name/color. Renaming also rewrites the node_type text on
// matching nodes within the type's scope so existing nodes keep their type.
export const renameNodeType = createServerFn({ method: "POST" })
	.inputValidator((data: { id: string; name?: string; color?: string }) => data)
	.handler(async ({ data }) => {
		const userId = await requireUserId();
		const type = await requireOwnedNodeType(data.id, userId);

		const newName = data.name?.trim();
		const set: { name?: string; color?: string } = {};
		if (newName && newName !== type.name) set.name = newName;
		if (data.color && data.color !== type.color) set.color = data.color;
		if (Object.keys(set).length === 0) return { success: true };

		await db.update(nodeTypes).set(set).where(eq(nodeTypes.id, data.id));

		if (set.name) {
			if (type.scope === "graph") {
				await db
					.update(nodes)
					.set({ nodeType: set.name })
					.where(
						and(eq(nodes.graphId, type.scopeId), eq(nodes.nodeType, type.name)),
					);
			} else if (type.scope === "team") {
				// rename across all graphs in the team
				const teamGraphs = await db
					.select({ id: graphs.id })
					.from(graphs)
					.where(eq(graphs.teamId, type.scopeId));
				const graphIds = teamGraphs.map((g) => g.id);
				if (graphIds.length) {
					await db
						.update(nodes)
						.set({ nodeType: set.name })
						.where(
							and(
								inArray(nodes.graphId, graphIds),
								eq(nodes.nodeType, type.name),
							),
						);
				}
			} else if (type.scope === "org") {
				// rename across all graphs in all teams of the org
				const orgTeams = await db
					.select({ id: authSchema.team.id })
					.from(authSchema.team)
					.where(eq(authSchema.team.organizationId, type.scopeId));
				const teamIds = orgTeams.map((t) => t.id);
				if (teamIds.length) {
					const orgGraphs = await db
						.select({ id: graphs.id })
						.from(graphs)
						.where(inArray(graphs.teamId, teamIds));
					const graphIds = orgGraphs.map((g) => g.id);
					if (graphIds.length) {
						await db
							.update(nodes)
							.set({ nodeType: set.name })
							.where(
								and(
									inArray(nodes.graphId, graphIds),
									eq(nodes.nodeType, type.name),
								),
							);
					}
				}
			} else {
				// user-scope: rename across all graphs the user owns
				const owned = await db
					.select({ id: graphs.id })
					.from(graphs)
					.where(eq(graphs.userId, userId));
				const graphIds = owned.map((g) => g.id);
				if (graphIds.length) {
					await db
						.update(nodes)
						.set({ nodeType: set.name })
						.where(
							and(
								inArray(nodes.graphId, graphIds),
								eq(nodes.nodeType, type.name),
							),
						);
				}
			}
		}
		return { success: true };
	});

export const deleteNodeType = createServerFn({ method: "POST" })
	.inputValidator((data: { id: string }) => data)
	.handler(async ({ data }) => {
		const userId = await requireUserId();
		await requireOwnedNodeType(data.id, userId);
		await db.delete(nodeTypes).where(eq(nodeTypes.id, data.id));
		return { success: true };
	});

export const addNodeTypeField = createServerFn({ method: "POST" })
	.inputValidator(
		(data: { nodeTypeId: string; key: string; position?: number }) => data,
	)
	.handler(async ({ data }) => {
		const userId = await requireUserId();
		await requireOwnedNodeType(data.nodeTypeId, userId);
		const key = data.key.trim();
		if (!key) throw new Error("Key is required");
		const id = crypto.randomUUID();
		await db
			.insert(nodeTypeFields)
			.values({
				id,
				nodeTypeId: data.nodeTypeId,
				key,
				position: data.position ?? 0,
			})
			.onConflictDoNothing();
		return { success: true };
	});

export const deleteNodeTypeField = createServerFn({ method: "POST" })
	.inputValidator((data: { id: string }) => data)
	.handler(async ({ data }) => {
		const userId = await requireUserId();
		const [field] = await db
			.select()
			.from(nodeTypeFields)
			.where(eq(nodeTypeFields.id, data.id));
		if (!field) return { success: true };
		await requireOwnedNodeType(field.nodeTypeId, userId);
		await db.delete(nodeTypeFields).where(eq(nodeTypeFields.id, data.id));
		return { success: true };
	});

// Assign a type to a node and add the type's template metadata keys (empty,
// never overwriting existing values). Precedence: graph > team > org > user.
export const setNodeTypeWithTemplate = createServerFn({ method: "POST" })
	.inputValidator((data: { id: string; nodeType: string | null }) => data)
	.handler(async ({ data }) => {
		await db
			.update(nodes)
			.set({ nodeType: data.nodeType })
			.where(eq(nodes.id, data.id));

		if (!data.nodeType) return { success: true, addedKeys: [] as string[] };

		const [node] = await db.select().from(nodes).where(eq(nodes.id, data.id));
		if (!node) return { success: true, addedKeys: [] as string[] };
		const [graph] = await db
			.select()
			.from(graphs)
			.where(eq(graphs.id, node.graphId));
		if (!graph) return { success: true, addedKeys: [] as string[] };

		const addedKeys = await seedNodeTypeTemplate(data.id, graph, data.nodeType);
		return { success: true, addedKeys };
	});

// ── Creation type settings ────────────────────────────────────────────────────

export type CreationTypeSetting = { typeName: string; enabled: boolean };

// List the per-graph overrides for which node types are selectable at node
// creation. Types default to enabled, so only explicit overrides are returned.
export const listCreationTypeSettings = createServerFn({ method: "GET" })
	.inputValidator((data: { graphId: string }) => data)
	.handler(async ({ data }): Promise<CreationTypeSetting[]> => {
		const userId = await requireUserId();
		await assertGraphAccess(data.graphId, userId);
		const rows = await db
			.select()
			.from(graphCreationTypeSettings)
			.where(eq(graphCreationTypeSettings.graphId, data.graphId));
		return rows.map((r) => ({ typeName: r.typeName, enabled: r.enabled }));
	});

// Toggle whether a node type is selectable at node creation for a graph.
export const setCreationTypeEnabled = createServerFn({ method: "POST" })
	.inputValidator(
		(data: { graphId: string; typeName: string; enabled: boolean }) => data,
	)
	.handler(async ({ data }) => {
		const userId = await requireUserId();
		await assertGraphAccess(data.graphId, userId);
		await db
			.insert(graphCreationTypeSettings)
			.values({
				id: crypto.randomUUID(),
				graphId: data.graphId,
				typeName: data.typeName,
				enabled: data.enabled,
			})
			.onConflictDoUpdate({
				target: [
					graphCreationTypeSettings.graphId,
					graphCreationTypeSettings.typeName,
				],
				set: { enabled: data.enabled },
			});
		return { success: true };
	});

// ── Graph templates ───────────────────────────────────────────────────────────

export type TemplateWithNodeTypes = {
	id: string;
	ownerType: "org" | "team";
	ownerId: string;
	name: string;
	nodeTypes: { id: string; name: string; color: string }[];
};

// Resolve a template the user is allowed to modify (owner org/team member).
async function requireOwnedTemplate(templateId: string, userId: string) {
	const [tpl] = await db
		.select()
		.from(graphTemplates)
		.where(eq(graphTemplates.id, templateId));
	if (!tpl) throw new Error("Template not found");
	if (tpl.ownerType === "team") await assertTeamAccess(tpl.ownerId, userId);
	else await assertOrgAccess(tpl.ownerId, userId);
	return tpl;
}

// The node types selectable for a template: team owner → team-scope + parent
// org-scope; org owner → org-scope.
async function selectableNodeTypesForTemplate(
	tpl: typeof graphTemplates.$inferSelect,
) {
	const conditions: ReturnType<typeof and>[] = [];
	if (tpl.ownerType === "team") {
		const [team] = await db
			.select()
			.from(authSchema.team)
			.where(eq(authSchema.team.id, tpl.ownerId));
		if (team) {
			conditions.push(
				and(eq(nodeTypes.scope, "team"), eq(nodeTypes.scopeId, tpl.ownerId)),
			);
			conditions.push(
				and(
					eq(nodeTypes.scope, "org"),
					eq(nodeTypes.scopeId, team.organizationId),
				),
			);
		}
	} else {
		conditions.push(
			and(eq(nodeTypes.scope, "org"), eq(nodeTypes.scopeId, tpl.ownerId)),
		);
	}
	if (!conditions.length) return [];
	return db
		.select()
		.from(nodeTypes)
		.where(or(...(conditions as Parameters<typeof or>)));
}

async function listTemplatesByOwner(
	ownerType: "org" | "team",
	ownerId: string,
): Promise<TemplateWithNodeTypes[]> {
	const templates = await db
		.select()
		.from(graphTemplates)
		.where(
			and(
				eq(graphTemplates.ownerType, ownerType),
				eq(graphTemplates.ownerId, ownerId),
			),
		);

	const templateIds = templates.map((t) => t.id);
	const links = templateIds.length
		? await db
				.select({
					templateId: templateNodeTypes.templateId,
					id: nodeTypes.id,
					name: nodeTypes.name,
					color: nodeTypes.color,
				})
				.from(templateNodeTypes)
				.innerJoin(nodeTypes, eq(templateNodeTypes.nodeTypeId, nodeTypes.id))
				.where(inArray(templateNodeTypes.templateId, templateIds))
		: [];

	return templates.map((t) => ({
		id: t.id,
		ownerType: t.ownerType,
		ownerId: t.ownerId,
		name: t.name,
		nodeTypes: links
			.filter((l) => l.templateId === t.id)
			.map((l) => ({ id: l.id, name: l.name, color: l.color })),
	}));
}

export const listTemplatesForTeam = createServerFn({ method: "GET" })
	.inputValidator((data: { teamId: string }) => data)
	.handler(async ({ data }): Promise<TemplateWithNodeTypes[]> => {
		const userId = await requireUserId();
		await assertTeamAccess(data.teamId, userId);
		return listTemplatesByOwner("team", data.teamId);
	});

export const listTemplatesForOrg = createServerFn({ method: "GET" })
	.inputValidator((data: { orgId: string }) => data)
	.handler(async ({ data }): Promise<TemplateWithNodeTypes[]> => {
		const userId = await requireUserId();
		await assertOrgAccess(data.orgId, userId);
		return listTemplatesByOwner("org", data.orgId);
	});

// Templates a team graph can be created from: the team's own templates plus the
// parent organization's templates.
export const listTemplatesForTeamCreation = createServerFn({ method: "GET" })
	.inputValidator((data: { teamId: string }) => data)
	.handler(async ({ data }): Promise<TemplateWithNodeTypes[]> => {
		const userId = await requireUserId();
		const team = await assertTeamAccess(data.teamId, userId);
		const [orgTemplates, teamTemplates] = await Promise.all([
			listTemplatesByOwner("org", team.organizationId),
			listTemplatesByOwner("team", data.teamId),
		]);
		return [...orgTemplates, ...teamTemplates];
	});

export const createTemplate = createServerFn({ method: "POST" })
	.inputValidator(
		(data: { ownerType: "org" | "team"; ownerId: string; name: string }) =>
			data,
	)
	.handler(async ({ data }) => {
		const userId = await requireUserId();
		if (data.ownerType === "team") await assertTeamAccess(data.ownerId, userId);
		else await assertOrgAccess(data.ownerId, userId);

		const name = data.name.trim();
		if (!name) throw new Error("Name is required");

		const id = crypto.randomUUID();
		await db.insert(graphTemplates).values({
			id,
			ownerType: data.ownerType,
			ownerId: data.ownerId,
			name,
		});
		return { id };
	});

export const renameTemplate = createServerFn({ method: "POST" })
	.inputValidator((data: { id: string; name: string }) => data)
	.handler(async ({ data }) => {
		const userId = await requireUserId();
		await requireOwnedTemplate(data.id, userId);
		const name = data.name.trim();
		if (!name) throw new Error("Name is required");
		await db
			.update(graphTemplates)
			.set({ name })
			.where(eq(graphTemplates.id, data.id));
		return { success: true };
	});

export const deleteTemplate = createServerFn({ method: "POST" })
	.inputValidator((data: { id: string }) => data)
	.handler(async ({ data }) => {
		const userId = await requireUserId();
		await requireOwnedTemplate(data.id, userId);
		await db.delete(graphTemplates).where(eq(graphTemplates.id, data.id));
		return { success: true };
	});

// List the node types selectable for a template (the pool the allowlist is
// chosen from).
export const listSelectableNodeTypes = createServerFn({ method: "GET" })
	.inputValidator((data: { templateId: string }) => data)
	.handler(
		async ({
			data,
		}): Promise<{ id: string; name: string; color: string }[]> => {
			const userId = await requireUserId();
			const tpl = await requireOwnedTemplate(data.templateId, userId);
			const types = await selectableNodeTypesForTemplate(tpl);
			return types.map((t) => ({ id: t.id, name: t.name, color: t.color }));
		},
	);

export const addTemplateNodeType = createServerFn({ method: "POST" })
	.inputValidator((data: { templateId: string; nodeTypeId: string }) => data)
	.handler(async ({ data }) => {
		const userId = await requireUserId();
		const tpl = await requireOwnedTemplate(data.templateId, userId);
		const selectable = await selectableNodeTypesForTemplate(tpl);
		if (!selectable.some((t) => t.id === data.nodeTypeId))
			throw new Error("Node type is not selectable for this template");
		await db
			.insert(templateNodeTypes)
			.values({
				id: crypto.randomUUID(),
				templateId: data.templateId,
				nodeTypeId: data.nodeTypeId,
			})
			.onConflictDoNothing();
		return { success: true };
	});

export const removeTemplateNodeType = createServerFn({ method: "POST" })
	.inputValidator((data: { templateId: string; nodeTypeId: string }) => data)
	.handler(async ({ data }) => {
		const userId = await requireUserId();
		await requireOwnedTemplate(data.templateId, userId);
		await db
			.delete(templateNodeTypes)
			.where(
				and(
					eq(templateNodeTypes.templateId, data.templateId),
					eq(templateNodeTypes.nodeTypeId, data.nodeTypeId),
				),
			);
		return { success: true };
	});
