import { describe, expect, it } from "vitest";
import { pickByScopePrecedence } from "./node-type-resolution";

describe("pickByScopePrecedence", () => {
	it("returns undefined for no matches", () => {
		expect(pickByScopePrecedence([])).toBeUndefined();
	});

	it("returns the single match", () => {
		const only = { scope: "user", id: "a" };
		expect(pickByScopePrecedence([only])).toBe(only);
	});

	it("prefers graph over team, org and user", () => {
		const picked = pickByScopePrecedence([
			{ scope: "user", id: "u" },
			{ scope: "org", id: "o" },
			{ scope: "graph", id: "g" },
			{ scope: "team", id: "t" },
		]);
		expect(picked?.id).toBe("g");
	});

	it("prefers team over org and user", () => {
		const picked = pickByScopePrecedence([
			{ scope: "user", id: "u" },
			{ scope: "org", id: "o" },
			{ scope: "team", id: "t" },
		]);
		expect(picked?.id).toBe("t");
	});

	it("prefers org over user", () => {
		const picked = pickByScopePrecedence([
			{ scope: "user", id: "u" },
			{ scope: "org", id: "o" },
		]);
		expect(picked?.id).toBe("o");
	});

	it("ranks unknown scopes last", () => {
		const picked = pickByScopePrecedence([
			{ scope: "mystery", id: "m" },
			{ scope: "user", id: "u" },
		]);
		expect(picked?.id).toBe("u");
	});

	it("does not mutate the input array", () => {
		const input = [
			{ scope: "user", id: "u" },
			{ scope: "graph", id: "g" },
		];
		pickByScopePrecedence(input);
		expect(input.map((m) => m.id)).toEqual(["u", "g"]);
	});
});
