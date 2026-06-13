import type { Edge as RFEdge, Node as RFNode } from "@xyflow/react";
import { getContrastTextColor } from "#/lib/utils";
import { NODE_TYPE_COLORS } from "./constants";

function escapeMermaidLabel(text: string): string {
	return text.replace(/"/g, "#quot;").replace(/\|/g, "#124;");
}

export function generateMermaidDiagram(
	nodes: RFNode[],
	edges: RFEdge[],
): string {
	const idMap = new Map<string, string>();
	for (let i = 0; i < nodes.length; i++) {
		idMap.set(nodes[i].id, `n${i}`);
	}

	const nodeLines = nodes.map((n) => {
		const mid = idMap.get(n.id) ?? n.id;
		const label = escapeMermaidLabel((n.data.label as string) || "(untitled)");
		return `  ${mid}["${label}"]`;
	});

	const edgeLines = edges.flatMap((e) => {
		const src = idMap.get(e.source);
		const tgt = idMap.get(e.target);
		if (!src || !tgt) return [];
		const label = ((e.data?.label as string) ?? "").trim();
		if (label) {
			return [`  ${src} -->|"${escapeMermaidLabel(label)}"| ${tgt}`];
		}
		return [`  ${src} --> ${tgt}`];
	});

	const usedTypes = [
		...new Set(
			nodes
				.map((n) => n.data.nodeType as string | null | undefined)
				.filter((t): t is string => !!t && t in NODE_TYPE_COLORS),
		),
	];

	const classDefLines = usedTypes.map((t) => {
		const fill = NODE_TYPE_COLORS[t];
		return `  classDef ${t} fill:${fill},stroke:none,color:${getContrastTextColor(fill)}`;
	});

	const classAssignLines = usedTypes.flatMap((t) => {
		const matchingIds = nodes
			.filter((n) => n.data.nodeType === t)
			.map((n) => idMap.get(n.id) ?? n.id)
			.join(",");
		return matchingIds ? [`  class ${matchingIds} ${t}`] : [];
	});

	return [
		"graph TD",
		...nodeLines,
		...(edgeLines.length ? [""] : []),
		...edgeLines,
		...(classDefLines.length ? [""] : []),
		...classDefLines,
		...classAssignLines,
	].join("\n");
}
