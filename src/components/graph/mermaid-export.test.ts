import type { Edge as RFEdge, Node as RFNode } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { generateMermaidDiagram } from "./mermaid-export";

function node(id: string, label: string, nodeType?: string): RFNode {
	return {
		id,
		position: { x: 0, y: 0 },
		data: { label, nodeType: nodeType ?? null },
	};
}

describe("generateMermaidDiagram", () => {
	it("uses the provided colorMap for classDef fills", () => {
		const nodes = [node("a", "A", "KPI")];
		const out = generateMermaidDiagram(nodes, [], { KPI: "#3b82f6" });
		expect(out).toContain("classDef type_0 fill:#3b82f6");
		expect(out).toContain("class n0 type_0");
	});

	it("ignores types missing from the colorMap", () => {
		const nodes = [node("a", "A", "Unknown")];
		const out = generateMermaidDiagram(nodes, [], { KPI: "#3b82f6" });
		expect(out).not.toContain("classDef");
		expect(out).not.toContain("class ");
	});

	it("sanitizes free-form type names into valid class identifiers", () => {
		const nodes = [node("a", "A", "重要 Risk!")];
		const out = generateMermaidDiagram(nodes, [], { "重要 Risk!": "#ff0000" });
		// The class id must be alphanumeric, not the raw name with spaces/symbols.
		expect(out).toContain("classDef type_0 fill:#ff0000");
		expect(out).toContain("class n0 type_0");
		expect(out).not.toContain("重要 Risk!");
	});

	it("renders edges with and without labels", () => {
		const nodes = [node("a", "A"), node("b", "B")];
		const edges: RFEdge[] = [
			{ id: "e1", source: "a", target: "b", data: { label: "rel" } },
			{ id: "e2", source: "b", target: "a", data: { label: "" } },
		];
		const out = generateMermaidDiagram(nodes, edges, {});
		expect(out).toContain('n0 -->|"rel"| n1');
		expect(out).toContain("n1 --> n0");
	});
});
