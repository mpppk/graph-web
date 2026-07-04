// Placement rule for nodes created without coordinates (MCP clients rarely
// think in pixels). Pure so it can be unit tested.

const COLUMNS = 4;
const DX = 220;
const DY = 140;
const GAP_BELOW_EXISTING = 160;

export function planNodePlacement(
	existing: { x: number; y: number }[],
	count: number,
): { x: number; y: number }[] {
	let originX = 0;
	let originY = 0;
	if (existing.length > 0) {
		originX = Math.min(...existing.map((n) => n.x));
		originY = Math.max(...existing.map((n) => n.y)) + GAP_BELOW_EXISTING;
	}
	return Array.from({ length: count }, (_, i) => ({
		x: originX + (i % COLUMNS) * DX,
		y: originY + Math.floor(i / COLUMNS) * DY,
	}));
}
