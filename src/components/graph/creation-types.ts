import type {
	CreationTypeSetting,
	NodeTypeWithFields,
} from "#/lib/graph-server-fns";

// Unique node type names available in a graph, in their listed order.
export function uniqueTypeNames(typeList: NodeTypeWithFields[]): string[] {
	return [...new Set(typeList.map((t) => t.name))];
}

// Node type names selectable at node creation. Types default to enabled, so a
// name is excluded only when an explicit disabled override exists for it.
export function enabledCreationTypeNames(
	typeList: NodeTypeWithFields[],
	settings: CreationTypeSetting[],
): string[] {
	const disabled = new Set(
		settings.filter((s) => !s.enabled).map((s) => s.typeName),
	);
	return uniqueTypeNames(typeList).filter((name) => !disabled.has(name));
}
