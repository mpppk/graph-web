import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import * as authSchema from "#/db/auth-schema";
import { db } from "#/db/index";
import {
	edges,
	graphs,
	nodeMetadata,
	nodes,
	nodeTypeFields,
	nodeTypes,
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
		const org = await auth.api.getFullOrganization({
			headers: getRequest().headers,
			query: { organizationId: type.scopeId },
		});
		if (!org?.members?.some((m) => m.userId === userId))
			throw new Error("Forbidden");
	} else {
		throw new Error("Unsupported node type scope");
	}
	return type;
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
		(data: { name: string; description?: string; teamId?: string }) => data,
	)
	.handler(async ({ data }) => {
		const userId = await requireUserId();
		const id = crypto.randomUUID();
		await db.insert(graphs).values({
			id,
			userId,
			teamId: data.teamId ?? null,
			name: data.name,
			description: data.description ?? "",
		});
		const [graph] = await db.select().from(graphs).where(eq(graphs.id, id));
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
		(data: { graphId: string; label: string; x?: number; y?: number }) => data,
	)
	.handler(async ({ data }) => {
		const userId = await requireUserId();
		await assertGraphAccess(data.graphId, userId);
		const id = crypto.randomUUID();
		await db.insert(nodes).values({
			id,
			graphId: data.graphId,
			label: data.label,
			x: data.x ?? 0,
			y: data.y ?? 0,
		});
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

		if (data.nodes.length > 0) {
			await db.insert(nodes).values(
				data.nodes.map((n) => ({
					id: nodeIdMap.get(n.tempId)!,
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
				nodeId: nodeIdMap.get(n.tempId)!,
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
				const sourceNodeId = nodeIdMap.get(e.sourceTempId)!;
				const targetNodeId = nodeIdMap.get(e.targetTempId)!;
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

		// Build applicable type conditions: graph > team > org > user
		const conditions: ReturnType<typeof and>[] = [
			and(eq(nodeTypes.scope, "user"), eq(nodeTypes.scopeId, graph.userId)),
			and(eq(nodeTypes.scope, "graph"), eq(nodeTypes.scopeId, node.graphId)),
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
					eq(nodeTypes.name, data.nodeType),
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
		if (!type) return { success: true, addedKeys: [] as string[] };

		const fields = await db
			.select()
			.from(nodeTypeFields)
			.where(eq(nodeTypeFields.nodeTypeId, type.id));
		if (!fields.length) return { success: true, addedKeys: [] as string[] };

		await db
			.insert(nodeMetadata)
			.values(
				fields.map((f) => ({
					id: crypto.randomUUID(),
					nodeId: data.id,
					key: f.key,
					value: "",
				})),
			)
			.onConflictDoNothing();

		return { success: true, addedKeys: fields.map((f) => f.key) };
	});
