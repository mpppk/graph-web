// Pure helpers for resolving which node type definition applies when the same
// type name exists at multiple scopes. Kept free of DB imports so it can be
// unit tested.

// graph > team > org > user precedence
const SCOPE_PRIORITY: Record<string, number> = {
	graph: 0,
	team: 1,
	org: 2,
	user: 3,
};

export function pickByScopePrecedence<T extends { scope: string }>(
	matches: T[],
): T | undefined {
	return [...matches].sort(
		(a, b) => (SCOPE_PRIORITY[a.scope] ?? 99) - (SCOPE_PRIORITY[b.scope] ?? 99),
	)[0];
}
