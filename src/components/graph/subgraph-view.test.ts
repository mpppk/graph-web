import type { Node as RFNode } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import type { SubgraphLayout } from "./elk-layout";
import {
	buildSubgraphDisplayNodes,
	groupNodesByType,
	nodeTypeOf,
} from "./subgraph-view";

function node(id: string, nodeType?: string): RFNode {
	return {
		id,
		type: "default",
		position: { x: 5, y: 5 },
		data: { label: id, nodeType: nodeType ?? null },
	};
}

describe("nodeTypeOf", () => {
	it("returns the type name or null", () => {
		expect(nodeTypeOf(node("a", "KPI"))).toBe("KPI");
		expect(nodeTypeOf(node("b"))).toBeNull();
	});
});

describe("groupNodesByType", () => {
	it("groups by type and omits untyped nodes", () => {
		const groups = groupNodesByType([
			node("a", "KPI"),
			node("b", "KPI"),
			node("c", "Epic"),
			node("d"),
		]);
		expect(groups.get("KPI")?.map((n) => n.id)).toEqual(["a", "b"]);
		expect(groups.get("Epic")?.map((n) => n.id)).toEqual(["c"]);
		expect(groups.has("__none__")).toBe(false);
		expect([...groups.keys()]).toEqual(["KPI", "Epic"]);
	});
});

describe("buildSubgraphDisplayNodes", () => {
	const nodes = [node("a", "KPI"), node("b", "KPI"), node("c", "Epic")];

	it("returns the input unchanged when no types are active", () => {
		expect(buildSubgraphDisplayNodes(nodes, new Set(), null)).toBe(nodes);
	});

	it("returns the input unchanged when the layout is missing", () => {
		expect(buildSubgraphDisplayNodes(nodes, new Set(["KPI"]), null)).toBe(
			nodes,
		);
	});

	it("wraps active types in a group and links children", () => {
		const layout: SubgraphLayout = {
			groups: new Map([["KPI", { x: 100, y: 200, width: 300, height: 150 }]]),
			nodePositions: new Map([
				["a", { x: 16, y: 32 }],
				["b", { x: 16, y: 90 }],
				["c", { x: 500, y: 0 }],
			]),
		};
		const result = buildSubgraphDisplayNodes(nodes, new Set(["KPI"]), layout);

		// Group container comes first.
		const group = result[0];
		expect(group.id).toBe("group:KPI");
		expect(group.type).toBe("group");
		expect(group.position).toEqual({ x: 100, y: 200 });
		expect(group.style).toMatchObject({ width: 300, height: 150 });

		const a = result.find((n) => n.id === "a");
		expect(a?.parentId).toBe("group:KPI");
		expect(a?.extent).toBe("parent");
		expect(a?.position).toEqual({ x: 16, y: 32 });

		// Non-active type stays top-level (no parent) with its absolute position.
		const c = result.find((n) => n.id === "c");
		expect(c?.parentId).toBeUndefined();
		expect(c?.position).toEqual({ x: 500, y: 0 });
	});

	it("keeps group containers non-draggable by default", () => {
		const layout: SubgraphLayout = {
			groups: new Map([["KPI", { x: 0, y: 0, width: 100, height: 100 }]]),
			nodePositions: new Map(),
		};
		const result = buildSubgraphDisplayNodes(nodes, new Set(["KPI"]), layout);
		expect(result[0].draggable).toBe(false);
		expect(result[0].data.movable).toBe(false);
	});

	it("makes group containers draggable when movable", () => {
		const layout: SubgraphLayout = {
			groups: new Map([["KPI", { x: 0, y: 0, width: 100, height: 100 }]]),
			nodePositions: new Map(),
		};
		const result = buildSubgraphDisplayNodes(
			nodes,
			new Set(["KPI"]),
			layout,
			true,
		);
		const group = result[0];
		expect(group.draggable).toBe(true);
		// Never selectable so it stays out of selection/copy flows.
		expect(group.selectable).toBe(false);
		// Draggable only via its header, and the container itself is click-through.
		expect(group.dragHandle).toBe(".subgraph-drag-handle");
		expect(group.data.movable).toBe(true);
		expect(group.style?.pointerEvents).toBe("none");
	});
});
