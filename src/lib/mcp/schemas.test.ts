import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
	createEdgesInput,
	createNodesInput,
	deleteNodesInput,
	setNodeMetadataInput,
	updateNodeInput,
} from "./schemas";

describe("createNodesInput", () => {
	const schema = z.object(createNodesInput);

	it("accepts nodes without coordinates or type", () => {
		const parsed = schema.parse({
			graph_id: "g1",
			nodes: [{ label: "A" }, { label: "B", node_type: "KPI", x: 1, y: 2 }],
		});
		expect(parsed.nodes).toHaveLength(2);
	});

	it("rejects an empty node list", () => {
		expect(() => schema.parse({ graph_id: "g1", nodes: [] })).toThrow();
	});

	it("rejects an empty label", () => {
		expect(() =>
			schema.parse({ graph_id: "g1", nodes: [{ label: "" }] }),
		).toThrow();
	});
});

describe("updateNodeInput", () => {
	const schema = z.object(updateNodeInput);

	it("accepts null node_type (clears the type)", () => {
		const parsed = schema.parse({ node_id: "n1", node_type: null });
		expect(parsed.node_type).toBeNull();
	});

	it("keeps node_type undefined when omitted", () => {
		const parsed = schema.parse({ node_id: "n1", label: "L" });
		expect(parsed.node_type).toBeUndefined();
	});
});

describe("createEdgesInput", () => {
	const schema = z.object(createEdgesInput);

	it("rejects an empty edge list", () => {
		expect(() => schema.parse({ graph_id: "g1", edges: [] })).toThrow();
	});

	it("accepts edges without labels", () => {
		const parsed = schema.parse({
			graph_id: "g1",
			edges: [{ source_node_id: "a", target_node_id: "b" }],
		});
		expect(parsed.edges[0].label).toBeUndefined();
	});
});

describe("deleteNodesInput", () => {
	const schema = z.object(deleteNodesInput);

	it("rejects an empty id list", () => {
		expect(() => schema.parse({ node_ids: [] })).toThrow();
	});
});

describe("setNodeMetadataInput", () => {
	const schema = z.object(setNodeMetadataInput);

	it("accepts set-only and delete-only calls", () => {
		expect(
			schema.parse({
				node_id: "n1",
				set: [{ key: "url", value: "https://example.com", value_type: "url" }],
			}).set,
		).toHaveLength(1);
		expect(
			schema.parse({ node_id: "n1", delete_keys: ["owner"] }).delete_keys,
		).toEqual(["owner"]);
	});

	it("rejects an invalid value_type", () => {
		expect(() =>
			schema.parse({
				node_id: "n1",
				set: [{ key: "k", value: "v", value_type: "json" }],
			}),
		).toThrow();
	});
});
