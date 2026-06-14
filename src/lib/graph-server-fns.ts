import { createServerFn } from "@tanstack/react-start";
import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "#/db/index";
import {
	edges,
	graphs,
	nodeMetadata,
	nodes,
	nodeTypeFields,
	nodeTypes,
} from "#/db/schema";
import { requireUserId } from "#/lib/graph-auth";

// ── Shared helpers ────────────────────────────────────────────────────────────

// Default node types seeded once per user (user-scope). These mirror the types
// that used to be hardcoded in components/graph/constants.ts.
const DEFAULT_NODE_TYPES: { name: string; color: string }[] = [
	{ name: "KPI", color: "#3b82f6" },
	{ name: "Epic", color: "#8b5cf6" },
	{ name: "Feature", color: "#22c55e" },
	{ name: "Opportunity", color: "#f97316" },
	{ name: "Solution", color: "#14b8a6" },
];

// Verify the given graph exists and is owned by the user; returns the graph.
async function assertGraphOwner(graphId: string, userId: string) {
	const [graph] = await db
		.select()
		.from(graphs)
		.where(and(eq(graphs.id, graphId), eq(graphs.userId, userId)));
	if (!graph) throw new Error("Graph not found");
	return graph;
}

// Idempotently seed the default user-scope node types for a user. Safe to call
// repeatedly thanks to the (scope, scopeId, name) unique index.
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

// Resolve a node type the user owns, throwing if missing/forbidden. A type is
// owned if it is user-scope for this user, or graph-scope for a graph the user
// owns.
async function requireOwnedNodeType(typeId: string, userId: string) {
	const [type] = await db
		.select()
		.from(nodeTypes)
		.where(eq(nodeTypes.id, typeId));
	if (!type) throw new Error("Node type not found");
	if (type.scope === "user") {
		if (type.scopeId !== userId) throw new Error("Forbidden");
	} else if (type.scope === "graph") {
		await assertGraphOwner(type.scopeId, userId);
	} else {
		throw new Error("Unsupported node type scope");
	}
	return type;
}

// ── Graph operations ──────────────────────────────────────────────────────────

export const listGraphs = createServerFn({ method: "GET" }).handler(
	async () => {
		const userId = await requireUserId();
		return db.select().from(graphs).where(eq(graphs.userId, userId));
	},
);

export const createGraph = createServerFn({ method: "POST" })
	.inputValidator((data: { name: string; description?: string }) => data)
	.handler(async ({ data }) => {
		const userId = await requireUserId();
		const id = crypto.randomUUID();
		await db.insert(graphs).values({
			id,
			userId,
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
		const [graph] = await db
			.select()
			.from(graphs)
			.where(and(eq(graphs.id, data.id), eq(graphs.userId, userId)));
		if (!graph) throw new Error("Graph not found");
		return graph;
	});

export const updateGraphName = createServerFn({ method: "POST" })
	.inputValidator((data: { id: string; name: string }) => data)
	.handler(async ({ data }) => {
		const userId = await requireUserId();
		await db
			.update(graphs)
			.set({ name: data.name })
			.where(and(eq(graphs.id, data.id), eq(graphs.userId, userId)));
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
		await db
			.delete(graphs)
			.where(and(eq(graphs.id, data.id), eq(graphs.userId, userId)));
		// scopeId is a polymorphic column with no FK, so graph-scope node types
		// must be cleaned up explicitly to avoid orphans (fields cascade).
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
		// verify graph ownership
		const [graph] = await db
			.select()
			.from(graphs)
			.where(and(eq(graphs.id, data.graphId), eq(graphs.userId, userId)));
		if (!graph) throw new Error("Graph not found");
		return db.select().from(nodes).where(eq(nodes.graphId, data.graphId));
	});

export const createNode = createServerFn({ method: "POST" })
	.inputValidator(
		(data: { graphId: string; label: string; x?: number; y?: number }) => data,
	)
	.handler(async ({ data }) => {
		const userId = await requireUserId();
		const [graph] = await db
			.select()
			.from(graphs)
			.where(and(eq(graphs.id, data.graphId), eq(graphs.userId, userId)));
		if (!graph) throw new Error("Graph not found");
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

// Assigning a node type goes through setNodeTypeWithTemplate (defined below)
// so template metadata keys are seeded; there is no plain updateNodeType.

export const deleteNode = createServerFn({ method: "POST" })
	.inputValidator((data: { id: string }) => data)
	.handler(async ({ data }) => {
		await db.delete(nodes).where(eq(nodes.id, data.id));
		return { success: true };
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

// List the node types applicable to a graph: the graph owner's user-scope types
// plus this graph's graph-scope types. Lazily seeds the user defaults.
export const listNodeTypesForGraph = createServerFn({ method: "GET" })
	.inputValidator((data: { graphId: string }) => data)
	.handler(async ({ data }): Promise<NodeTypeWithFields[]> => {
		const userId = await requireUserId();
		const graph = await assertGraphOwner(data.graphId, userId);
		await ensureDefaultNodeTypes(graph.userId);

		const types = await db
			.select()
			.from(nodeTypes)
			.where(
				or(
					and(eq(nodeTypes.scope, "user"), eq(nodeTypes.scopeId, graph.userId)),
					and(
						eq(nodeTypes.scope, "graph"),
						eq(nodeTypes.scopeId, data.graphId),
					),
				),
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

export const createNodeType = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			graphId: string;
			scope: "user" | "graph";
			name: string;
			color: string;
			fields?: string[];
		}) => data,
	)
	.handler(async ({ data }) => {
		const userId = await requireUserId();
		const graph = await assertGraphOwner(data.graphId, userId);
		if (data.scope !== "user" && data.scope !== "graph") {
			throw new Error("Unsupported node type scope");
		}
		const name = data.name.trim();
		if (!name) throw new Error("Name is required");
		const scopeId = data.scope === "user" ? graph.userId : data.graphId;

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
			} else {
				// user-scope: rename across all graphs the user owns.
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
		// node_type text on nodes is left untouched; unknown names fall back to
		// the default color gracefully.
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
// never overwriting existing values). Replaces the plain updateNodeType for the
// canvas so assigning a type also seeds its metadata fields.
export const setNodeTypeWithTemplate = createServerFn({ method: "POST" })
	.inputValidator((data: { id: string; nodeType: string | null }) => data)
	.handler(async ({ data }) => {
		await db
			.update(nodes)
			.set({ nodeType: data.nodeType })
			.where(eq(nodes.id, data.id));

		if (!data.nodeType) return { success: true, addedKeys: [] as string[] };

		// Find the node's graph to resolve which types apply.
		const [node] = await db.select().from(nodes).where(eq(nodes.id, data.id));
		if (!node) return { success: true, addedKeys: [] as string[] };
		const [graph] = await db
			.select()
			.from(graphs)
			.where(eq(graphs.id, node.graphId));
		if (!graph) return { success: true, addedKeys: [] as string[] };

		// Resolve the applicable type by name (graph-scope takes precedence over
		// user-scope when names collide).
		const matches = await db
			.select()
			.from(nodeTypes)
			.where(
				and(
					eq(nodeTypes.name, data.nodeType),
					or(
						and(
							eq(nodeTypes.scope, "user"),
							eq(nodeTypes.scopeId, graph.userId),
						),
						and(
							eq(nodeTypes.scope, "graph"),
							eq(nodeTypes.scopeId, node.graphId),
						),
					),
				),
			);
		const type = matches.find((t) => t.scope === "graph") ?? matches[0];
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
