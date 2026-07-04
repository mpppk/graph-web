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
import {
	type MetadataValueType,
	normalizeMetadataValueType,
	validateMetadataValue,
} from "#/lib/metadata-types";
import {
	assertGraphAccess,
	assertTeamAccess,
	requireEdgeWithAccess,
	requireMetadataWithAccess,
	requireNodeWithAccess,
} from "#/lib/services/access";
import { pickByScopePrecedence } from "#/lib/services/node-type-resolution";

// Graph domain logic shared by server functions (cookie sessions) and MCP
// tools (OAuth bearer tokens). Every function takes the acting userId
// explicitly and authorizes through services/access.

// ── Node type template seeding ────────────────────────────────────────────────

// Add a node type's template metadata keys to a node (empty values, never
// overwriting existing entries). Resolves the applicable type definition using
// graph > team > org > user precedence. Returns the keys that were seeded.
export async function seedNodeTypeTemplate(
	nodeId: string,
	graph: typeof graphs.$inferSelect,
	nodeType: string,
): Promise<string[]> {
	const matches = await findNodeTypesByName(graph, nodeType);
	const type = pickByScopePrecedence(matches);
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
				valueType: "string" as const,
			})),
		)
		.onConflictDoNothing();

	return fields.map((f) => f.key);
}

// All node type rows matching a name within the scopes applicable to a graph
// (user + graph, plus team + org for team-owned graphs).
async function findNodeTypesByName(
	graph: typeof graphs.$inferSelect,
	name: string,
) {
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

	return db
		.select()
		.from(nodeTypes)
		.where(
			and(
				eq(nodeTypes.name, name),
				or(...(conditions as Parameters<typeof or>)),
			),
		);
}

// ── Graph reads ───────────────────────────────────────────────────────────────

export async function listPersonalGraphs(userId: string) {
	return db
		.select()
		.from(graphs)
		.where(and(eq(graphs.userId, userId), isNull(graphs.teamId)));
}

export async function listGraphsForTeam(userId: string, teamId: string) {
	await assertTeamAccess(teamId, userId);
	return db.select().from(graphs).where(eq(graphs.teamId, teamId));
}

export type AccessibleGraph = typeof graphs.$inferSelect & {
	owner:
		| { type: "personal" }
		| {
				type: "team";
				teamId: string;
				teamName: string;
				orgId: string;
				orgName: string;
		  };
};

// Every graph the user can access: personal graphs plus all graphs of teams
// belonging to organizations the user is a member of. Used by MCP list_graphs.
export async function listAccessibleGraphs(
	userId: string,
): Promise<AccessibleGraph[]> {
	const personal = await listPersonalGraphs(userId);
	const teamRows = await db
		.select({
			graph: graphs,
			teamId: authSchema.team.id,
			teamName: authSchema.team.name,
			orgId: authSchema.organization.id,
			orgName: authSchema.organization.name,
		})
		.from(graphs)
		.innerJoin(authSchema.team, eq(graphs.teamId, authSchema.team.id))
		.innerJoin(
			authSchema.organization,
			eq(authSchema.team.organizationId, authSchema.organization.id),
		)
		.innerJoin(
			authSchema.member,
			and(
				eq(authSchema.member.organizationId, authSchema.organization.id),
				eq(authSchema.member.userId, userId),
			),
		);

	return [
		...personal.map((g) => ({ ...g, owner: { type: "personal" as const } })),
		...teamRows.map((r) => ({
			...r.graph,
			owner: {
				type: "team" as const,
				teamId: r.teamId,
				teamName: r.teamName,
				orgId: r.orgId,
				orgName: r.orgName,
			},
		})),
	];
}

export type GraphNodeMetadataRow = {
	nodeId: string;
	key: string;
	value: string;
	valueType: MetadataValueType;
};

// A graph with all of its nodes and edges (and optionally every node's
// metadata) in one call. Coarse on purpose: MCP clients pay per round trip.
export async function getGraphDetail(
	userId: string,
	graphId: string,
	opts?: { includeMetadata?: boolean },
) {
	const graph = await assertGraphAccess(graphId, userId);
	const graphNodes = await db
		.select()
		.from(nodes)
		.where(eq(nodes.graphId, graphId));
	const graphEdges = await db
		.select()
		.from(edges)
		.where(eq(edges.graphId, graphId));

	let metadata: GraphNodeMetadataRow[] | undefined;
	if (opts?.includeMetadata !== false) {
		metadata = await db
			.select({
				nodeId: nodeMetadata.nodeId,
				key: nodeMetadata.key,
				value: nodeMetadata.value,
				valueType: nodeMetadata.valueType,
			})
			.from(nodeMetadata)
			.innerJoin(nodes, eq(nodeMetadata.nodeId, nodes.id))
			.where(eq(nodes.graphId, graphId));
	}

	return { graph, nodes: graphNodes, edges: graphEdges, metadata };
}

export async function getNodeDetail(userId: string, nodeId: string) {
	const { node, graph } = await requireNodeWithAccess(nodeId, userId);
	const metadata = await db
		.select()
		.from(nodeMetadata)
		.where(eq(nodeMetadata.nodeId, nodeId));
	return { node, graph, metadata };
}

export async function listEdgesForGraph(userId: string, graphId: string) {
	await assertGraphAccess(graphId, userId);
	return db.select().from(edges).where(eq(edges.graphId, graphId));
}

export async function listMetadataForNode(userId: string, nodeId: string) {
	await requireNodeWithAccess(nodeId, userId);
	return db.select().from(nodeMetadata).where(eq(nodeMetadata.nodeId, nodeId));
}

// ── Graph writes ──────────────────────────────────────────────────────────────

export async function updateGraph(
	userId: string,
	input: { graphId: string; name?: string; description?: string },
) {
	await assertGraphAccess(input.graphId, userId);
	const set: Partial<typeof graphs.$inferInsert> = {};
	if (input.name !== undefined) set.name = input.name;
	if (input.description !== undefined) set.description = input.description;
	if (Object.keys(set).length > 0) {
		await db.update(graphs).set(set).where(eq(graphs.id, input.graphId));
	}
	const [graph] = await db
		.select()
		.from(graphs)
		.where(eq(graphs.id, input.graphId));
	return graph;
}

// ── Node writes ───────────────────────────────────────────────────────────────

export async function updateNodePosition(
	userId: string,
	input: { nodeId: string; x: number; y: number },
) {
	await requireNodeWithAccess(input.nodeId, userId);
	await db
		.update(nodes)
		.set({ x: input.x, y: input.y })
		.where(eq(nodes.id, input.nodeId));
	return { success: true };
}

export async function updateNodeLabel(
	userId: string,
	input: { nodeId: string; label: string },
) {
	await requireNodeWithAccess(input.nodeId, userId);
	await db
		.update(nodes)
		.set({ label: input.label })
		.where(eq(nodes.id, input.nodeId));
	const [node] = await db
		.select()
		.from(nodes)
		.where(eq(nodes.id, input.nodeId));
	return node;
}

// Delete nodes after authorizing through each distinct parent graph. IDs that
// no longer exist are ignored so the operation stays idempotent (the UI's
// optimistic updates may double-delete).
export async function deleteNodesById(
	userId: string,
	input: { nodeIds: string[] },
) {
	if (input.nodeIds.length === 0) return { success: true };
	const found = await db
		.select()
		.from(nodes)
		.where(inArray(nodes.id, input.nodeIds));
	for (const graphId of new Set(found.map((n) => n.graphId))) {
		await assertGraphAccess(graphId, userId);
	}
	if (found.length > 0) {
		await db.delete(nodes).where(
			inArray(
				nodes.id,
				found.map((n) => n.id),
			),
		);
	}
	return { success: true };
}

// Set or clear a node's type. When a type is set, its template metadata keys
// are seeded onto the node. Returns the seeded keys.
export async function setNodeType(
	userId: string,
	input: { nodeId: string; nodeType: string | null },
) {
	const { graph } = await requireNodeWithAccess(input.nodeId, userId);
	await db
		.update(nodes)
		.set({ nodeType: input.nodeType })
		.where(eq(nodes.id, input.nodeId));

	if (!input.nodeType) return { success: true, addedKeys: [] as string[] };

	const addedKeys = await seedNodeTypeTemplate(
		input.nodeId,
		graph,
		input.nodeType,
	);
	return { success: true, addedKeys };
}

// ── Edge writes ───────────────────────────────────────────────────────────────

// Create edges in a graph after verifying every referenced node belongs to
// that graph (previously unchecked, which allowed cross-graph edges).
export async function createEdgesInGraph(
	userId: string,
	input: {
		graphId: string;
		edges: { sourceNodeId: string; targetNodeId: string; label?: string }[];
	},
) {
	await assertGraphAccess(input.graphId, userId);
	if (input.edges.length === 0) return [];

	const nodeIds = [
		...new Set(input.edges.flatMap((e) => [e.sourceNodeId, e.targetNodeId])),
	];
	const graphNodes = await db
		.select({ id: nodes.id })
		.from(nodes)
		.where(and(inArray(nodes.id, nodeIds), eq(nodes.graphId, input.graphId)));
	const known = new Set(graphNodes.map((n) => n.id));
	const missing = nodeIds.filter((id) => !known.has(id));
	if (missing.length > 0) {
		throw new Error(`Nodes not in graph: ${missing.join(", ")}`);
	}

	const values = input.edges.map((e) => ({
		id: crypto.randomUUID(),
		graphId: input.graphId,
		sourceNodeId: e.sourceNodeId,
		targetNodeId: e.targetNodeId,
		label: e.label ?? "",
	}));
	await db.insert(edges).values(values);
	return db
		.select()
		.from(edges)
		.where(
			inArray(
				edges.id,
				values.map((v) => v.id),
			),
		);
}

export async function updateEdgeLabel(
	userId: string,
	input: { edgeId: string; label: string },
) {
	await requireEdgeWithAccess(input.edgeId, userId);
	await db
		.update(edges)
		.set({ label: input.label })
		.where(eq(edges.id, input.edgeId));
	const [edge] = await db
		.select()
		.from(edges)
		.where(eq(edges.id, input.edgeId));
	return edge;
}

// Delete edges after authorizing through each distinct parent graph. Missing
// IDs are ignored (idempotent, see deleteNodesById).
export async function deleteEdgesById(
	userId: string,
	input: { edgeIds: string[] },
) {
	if (input.edgeIds.length === 0) return { success: true };
	const found = await db
		.select()
		.from(edges)
		.where(inArray(edges.id, input.edgeIds));
	for (const graphId of new Set(found.map((e) => e.graphId))) {
		await assertGraphAccess(graphId, userId);
	}
	if (found.length > 0) {
		await db.delete(edges).where(
			inArray(
				edges.id,
				found.map((e) => e.id),
			),
		);
	}
	return { success: true };
}

// ── Metadata writes ───────────────────────────────────────────────────────────

export async function upsertNodeMetadataEntry(
	userId: string,
	input: {
		nodeId: string;
		key: string;
		value: string;
		valueType?: MetadataValueType;
	},
) {
	await requireNodeWithAccess(input.nodeId, userId);
	const valueType = normalizeMetadataValueType(input.valueType);
	const result = validateMetadataValue(valueType, input.value);
	if (!result.ok) {
		throw new Error(result.error);
	}
	await db
		.insert(nodeMetadata)
		.values({
			id: crypto.randomUUID(),
			nodeId: input.nodeId,
			key: input.key,
			value: input.value,
			valueType,
		})
		.onConflictDoUpdate({
			target: [nodeMetadata.nodeId, nodeMetadata.key],
			set: { value: input.value, valueType },
		});
	const [meta] = await db
		.select()
		.from(nodeMetadata)
		.where(
			and(
				eq(nodeMetadata.nodeId, input.nodeId),
				eq(nodeMetadata.key, input.key),
			),
		);
	return meta;
}

// Missing IDs are a no-op (idempotent, see deleteNodesById).
export async function deleteNodeMetadataById(
	userId: string,
	metadataId: string,
) {
	const [meta] = await db
		.select()
		.from(nodeMetadata)
		.where(eq(nodeMetadata.id, metadataId));
	if (!meta) return { success: true };
	await requireMetadataWithAccess(metadataId, userId);
	await db.delete(nodeMetadata).where(eq(nodeMetadata.id, metadataId));
	return { success: true };
}

// ── MCP batch writes ──────────────────────────────────────────────────────────

// Every node type name applicable to a graph (for error messages).
async function listApplicableNodeTypeNames(
	graph: typeof graphs.$inferSelect,
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
	const rows = await db
		.select({ name: nodeTypes.name })
		.from(nodeTypes)
		.where(or(...(conditions as Parameters<typeof or>)));
	return [...new Set(rows.map((r) => r.name))].sort();
}

// Resolve a node type by name within the graph's scopes. Unknown names are an
// error listing the valid options so LLM clients can self-correct.
export async function resolveNodeTypeByName(
	graph: typeof graphs.$inferSelect,
	name: string,
) {
	const matches = await findNodeTypesByName(graph, name);
	const type = pickByScopePrecedence(matches);
	if (!type) {
		const available = await listApplicableNodeTypeNames(graph);
		throw new Error(
			`Unknown node type "${name}". Available types: ${available.length ? available.join(", ") : "(none)"}`,
		);
	}
	return type;
}

// Create nodes in one batch. Node type names are resolved up front (the whole
// call fails on an unknown name, before any insert); nodes without
// coordinates are placed by the caller-provided placement plan.
export async function createNodesInGraph(
	userId: string,
	input: {
		graphId: string;
		nodes: {
			label: string;
			nodeType?: string;
			x?: number;
			y?: number;
		}[];
		placePending: (
			existing: { x: number; y: number }[],
			count: number,
		) => { x: number; y: number }[];
	},
) {
	const graph = await assertGraphAccess(input.graphId, userId);
	if (input.nodes.length === 0) return [];

	// Fail before inserting anything if a type name doesn't resolve.
	const typeNames = [
		...new Set(input.nodes.flatMap((n) => (n.nodeType ? [n.nodeType] : []))),
	];
	for (const name of typeNames) {
		await resolveNodeTypeByName(graph, name);
	}

	const existing = await db
		.select({ x: nodes.x, y: nodes.y })
		.from(nodes)
		.where(eq(nodes.graphId, input.graphId));
	const pendingCount = input.nodes.filter(
		(n) => n.x === undefined || n.y === undefined,
	).length;
	const placements = input.placePending(existing, pendingCount);

	let placed = 0;
	const values = input.nodes.map((n) => {
		const auto =
			n.x === undefined || n.y === undefined ? placements[placed++] : null;
		return {
			id: crypto.randomUUID(),
			graphId: input.graphId,
			label: n.label,
			x: n.x ?? auto?.x ?? 0,
			y: n.y ?? auto?.y ?? 0,
			nodeType: n.nodeType ?? null,
		};
	});
	await db.insert(nodes).values(values);

	for (const v of values) {
		if (v.nodeType) await seedNodeTypeTemplate(v.id, graph, v.nodeType);
	}
	return db
		.select()
		.from(nodes)
		.where(
			inArray(
				nodes.id,
				values.map((v) => v.id),
			),
		);
}

// Update any combination of a node's label, position and type. Changing the
// type goes through the same template seeding as the UI.
export async function updateNodeFields(
	userId: string,
	input: {
		nodeId: string;
		label?: string;
		x?: number;
		y?: number;
		nodeType?: string | null;
	},
) {
	const { graph } = await requireNodeWithAccess(input.nodeId, userId);

	const set: Partial<typeof nodes.$inferInsert> = {};
	if (input.label !== undefined) set.label = input.label;
	if (input.x !== undefined) set.x = input.x;
	if (input.y !== undefined) set.y = input.y;
	let addedKeys: string[] = [];
	if (input.nodeType !== undefined) {
		if (input.nodeType !== null) {
			await resolveNodeTypeByName(graph, input.nodeType);
		}
		set.nodeType = input.nodeType;
	}
	if (Object.keys(set).length > 0) {
		await db.update(nodes).set(set).where(eq(nodes.id, input.nodeId));
	}
	if (input.nodeType) {
		addedKeys = await seedNodeTypeTemplate(input.nodeId, graph, input.nodeType);
	}
	const [node] = await db
		.select()
		.from(nodes)
		.where(eq(nodes.id, input.nodeId));
	return { node, addedKeys };
}

// Upsert and delete metadata entries for a node in one call. All values are
// validated before anything is written.
export async function setNodeMetadataEntries(
	userId: string,
	input: {
		nodeId: string;
		set?: { key: string; value: string; valueType?: MetadataValueType }[];
		deleteKeys?: string[];
	},
) {
	await requireNodeWithAccess(input.nodeId, userId);

	const entries = (input.set ?? []).map((e) => {
		const valueType = normalizeMetadataValueType(e.valueType);
		const result = validateMetadataValue(valueType, e.value);
		if (!result.ok) {
			throw new Error(`Invalid value for key "${e.key}": ${result.error}`);
		}
		return { key: e.key, value: e.value, valueType };
	});

	for (const e of entries) {
		await db
			.insert(nodeMetadata)
			.values({
				id: crypto.randomUUID(),
				nodeId: input.nodeId,
				key: e.key,
				value: e.value,
				valueType: e.valueType,
			})
			.onConflictDoUpdate({
				target: [nodeMetadata.nodeId, nodeMetadata.key],
				set: { value: e.value, valueType: e.valueType },
			});
	}
	if (input.deleteKeys?.length) {
		await db
			.delete(nodeMetadata)
			.where(
				and(
					eq(nodeMetadata.nodeId, input.nodeId),
					inArray(nodeMetadata.key, input.deleteKeys),
				),
			);
	}
	return db
		.select()
		.from(nodeMetadata)
		.where(eq(nodeMetadata.nodeId, input.nodeId));
}
