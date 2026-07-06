import { describe, expect, it } from "vitest";
import { buildGraphDetailUiResource } from "./apps";

describe("buildGraphDetailUiResource", () => {
	it("builds a ui:// resource pointing at the graph's /embed route", () => {
		const res = buildGraphDetailUiResource(
			"http://localhost:3000",
			"graph-123",
		);

		expect(res.type).toBe("resource");
		expect(res.resource.uri).toBe("ui://graph-web/graph-detail/graph-123");
		expect(res.resource.text).toBe(
			"http://localhost:3000/embed/graphs/graph-123",
		);
	});

	it("does not leave a trailing slash duplication for prod base URLs", () => {
		const res = buildGraphDetailUiResource(
			"https://graph-web.niboshi.workers.dev",
			"abc",
		);
		expect(res.resource.text).toBe(
			"https://graph-web.niboshi.workers.dev/embed/graphs/abc",
		);
	});
});
