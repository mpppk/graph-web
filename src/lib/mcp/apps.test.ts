import { describe, expect, it } from "vitest";
import {
	buildGraphDetailAppHtml,
	buildGraphDetailUiResource,
	GRAPH_DETAIL_RESOURCE_URI,
} from "./apps";

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

describe("buildGraphDetailAppHtml", () => {
	const html = buildGraphDetailAppHtml("http://localhost:3000");

	it("embeds the base url and the /embed route", () => {
		expect(html).toContain('"http://localhost:3000"');
		expect(html).toContain('/embed/graphs/"');
	});

	it("handles the MCP Apps (SEP) handshake and tool notifications", () => {
		expect(html).toContain("ui/initialize");
		expect(html).toContain("ui/notifications/tool-input");
		expect(html).toContain("ui/notifications/tool-result");
	});

	it("reads the graph id from arguments or structured content", () => {
		expect(html).toContain("graph_id");
		expect(html).toContain("graph.id");
	});

	it("uses the shared SEP resource uri", () => {
		expect(GRAPH_DETAIL_RESOURCE_URI).toBe("ui://graph-web/graph-detail");
	});
});
