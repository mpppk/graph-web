import { createContext, useContext, useMemo } from "react";
import type { NodeTypeWithFields } from "#/lib/graph-server-fns";

type NodeTypeContextValue = {
	typeList: NodeTypeWithFields[];
	colorMap: Record<string, string>;
};

const NodeTypeContext = createContext<NodeTypeContextValue>({
	typeList: [],
	colorMap: {},
});

// Build a name → color map. Graph-scope types take precedence over user-scope
// when two types share a name.
export function buildColorMap(
	typeList: NodeTypeWithFields[],
): Record<string, string> {
	const colorMap: Record<string, string> = {};
	for (const t of typeList) {
		if (t.scope === "graph") colorMap[t.name] = t.color;
	}
	for (const t of typeList) {
		if (colorMap[t.name] === undefined) colorMap[t.name] = t.color;
	}
	return colorMap;
}

// Custom React Flow nodes can't receive arbitrary props, so the available node
// types and their colors are provided via context instead.
export function NodeTypeProvider({
	typeList,
	children,
}: {
	typeList: NodeTypeWithFields[];
	children: React.ReactNode;
}) {
	const value = useMemo<NodeTypeContextValue>(
		() => ({ typeList, colorMap: buildColorMap(typeList) }),
		[typeList],
	);

	return (
		<NodeTypeContext.Provider value={value}>
			{children}
		</NodeTypeContext.Provider>
	);
}

export function useNodeTypes() {
	return useContext(NodeTypeContext);
}
