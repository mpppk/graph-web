import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { db } from "#/db/index";
import { edges, graphs, nodeMetadata, nodes } from "#/db/schema";
import { requireUserId } from "#/lib/graph-auth";

// ── Graph operations ──────────────────────────────────────────────────────────

export const listGraphs = createServerFn({ method: "GET" }).handler(
	async () => {
		const userId = await requireUserId();
		return db.select().from(graphs).where(eq(graphs.userId, userId));
	},
);

export const createGraph = createServerFn({ method: "POST" })
	.inputValidator(
		(data: { name: string; description?: string }) => data,
	)
	.handler(async ({ data }) => {
		const userId = await requireUserId();
		const id = crypto.randomUUID();
		await db.insert(graphs).values({
			id,
			userId,
			name: data.name,
			description: data.description ?? "",
		});
		const [graph] = await db
			.select()
			.from(graphs)
			.where(eq(graphs.id, id));
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
		(data: {
			graphId: string;
			label: string;
			x?: number;
			y?: number;
		}) => data,
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
		const [node] = await db
			.select()
			.from(nodes)
			.where(eq(nodes.id, data.id));
		return node;
	});

export const updateNodeType = createServerFn({ method: "POST" })
	.inputValidator(
		(data: { id: string; nodeType: string | null }) => data,
	)
	.handler(async ({ data }) => {
		await db
			.update(nodes)
			.set({ nodeType: data.nodeType })
			.where(eq(nodes.id, data.id));
		return { success: true };
	});

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
		const [edge] = await db
			.select()
			.from(edges)
			.where(eq(edges.id, data.id));
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
