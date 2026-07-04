import { describe, expect, it } from "vitest";
import { planNodePlacement } from "./placement";

describe("planNodePlacement", () => {
	it("starts at the origin for an empty graph", () => {
		expect(planNodePlacement([], 2)).toEqual([
			{ x: 0, y: 0 },
			{ x: 220, y: 0 },
		]);
	});

	it("places below the existing nodes, aligned to their left edge", () => {
		const existing = [
			{ x: 100, y: 50 },
			{ x: 500, y: 300 },
		];
		const placed = planNodePlacement(existing, 1);
		expect(placed).toEqual([{ x: 100, y: 460 }]);
	});

	it("wraps to a new row after four nodes", () => {
		const placed = planNodePlacement([], 5);
		expect(placed[3]).toEqual({ x: 660, y: 0 });
		expect(placed[4]).toEqual({ x: 0, y: 140 });
	});

	it("returns an empty plan for zero nodes", () => {
		expect(planNodePlacement([{ x: 1, y: 2 }], 0)).toEqual([]);
	});
});
