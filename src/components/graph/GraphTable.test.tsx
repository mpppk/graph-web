import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeAll, expect, test, vi } from "vitest";
import type { graphs, nodes } from "#/db/schema";
import type { NodeTypeWithFields } from "#/lib/graph-server-fns";
import type { MetadataValueType } from "#/lib/metadata-types";
import { GraphTable } from "./GraphTable";

// GraphTable calls useNavigate for its "back" button; stub the router.
vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => vi.fn(),
}));

beforeAll(() => {
	globalThis.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
});

type Graph = typeof graphs.$inferSelect;
type NodeRow = typeof nodes.$inferSelect;

const graph: Graph = {
	id: "g1",
	userId: "u1",
	teamId: null,
	templateId: null,
	name: "My Graph",
	description: "A test graph",
	createdAt: "2026-01-01",
};

function node(overrides: Partial<NodeRow> & { id: string }): NodeRow {
	return {
		graphId: "g1",
		label: overrides.label ?? overrides.id,
		x: 0,
		y: 0,
		nodeType: null,
		createdAt: "2026-01-01",
		...overrides,
	};
}

const nodeList: NodeRow[] = [
	node({ id: "n1", label: "Alpha", nodeType: "KPI" }),
	node({ id: "n2", label: "Beta", nodeType: "Feature" }),
	node({ id: "n3", label: "Gamma", nodeType: null }),
];

const metadata: {
	nodeId: string;
	key: string;
	value: string;
	valueType: MetadataValueType;
}[] = [
	{
		nodeId: "n1",
		key: "description",
		value: "the alpha node",
		valueType: "string",
	},
	{ nodeId: "n1", key: "priority", value: "3", valueType: "number" },
	{
		nodeId: "n2",
		key: "description",
		value: "the beta node",
		valueType: "string",
	},
];

const nodeTypeList: NodeTypeWithFields[] = [
	{
		id: "t1",
		scope: "user",
		scopeId: "u1",
		name: "KPI",
		color: "#3b82f6",
		fields: [],
	},
	{
		id: "t2",
		scope: "user",
		scopeId: "u1",
		name: "Feature",
		color: "#22c55e",
		fields: [],
	},
];

function renderTable() {
	render(
		<GraphTable
			graph={graph}
			nodeList={nodeList}
			metadata={metadata}
			nodeTypeList={nodeTypeList}
			backHref="/graphs/g1"
		/>,
	);
}

test("renders a column per metadata key plus 名前/タイプ", () => {
	renderTable();
	const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
	// 名前, タイプ, then metadata keys sorted alphabetically.
	expect(headers).toEqual(["名前", "タイプ", "description", "priority"]);
});

test("renders each node as a row with its metadata values", () => {
	renderTable();
	expect(screen.getByText("Alpha")).toBeDefined();
	expect(screen.getByText("the alpha node")).toBeDefined();
	expect(screen.getByText("3")).toBeDefined();
	expect(screen.getByText("Beta")).toBeDefined();
	expect(screen.getByText("the beta node")).toBeDefined();
	// Gamma has no metadata; it still appears as a row.
	expect(screen.getByText("Gamma")).toBeDefined();
});

test("filtering by node type hides non-matching rows", () => {
	renderTable();
	// Toggle off KPI and タイプなし, leaving only Feature visible.
	fireEvent.click(screen.getByRole("button", { name: "KPI" }));
	fireEvent.click(screen.getByRole("button", { name: "タイプなし" }));

	expect(screen.queryByText("Alpha")).toBeNull();
	expect(screen.queryByText("Gamma")).toBeNull();
	expect(screen.getByText("Beta")).toBeDefined();
});

test("filtering drops columns no visible row has", () => {
	renderTable();
	// Leave only Feature (Beta) visible. Beta has only "description", so the
	// "priority" column (held solely by the KPI node Alpha) must disappear.
	fireEvent.click(screen.getByRole("button", { name: "KPI" }));
	fireEvent.click(screen.getByRole("button", { name: "タイプなし" }));

	const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
	expect(headers).toEqual(["名前", "タイプ", "description"]);
});

test("絞り込みを解除 restores all rows", () => {
	renderTable();
	fireEvent.click(screen.getByRole("button", { name: "KPI" }));
	expect(screen.queryByText("Alpha")).toBeNull();

	fireEvent.click(screen.getByText("絞り込みを解除"));
	expect(screen.getByText("Alpha")).toBeDefined();
	expect(screen.getByText("Beta")).toBeDefined();
	expect(screen.getByText("Gamma")).toBeDefined();
});

test("untyped nodes show a placeholder in the タイプ column", () => {
	renderTable();
	const gammaRow = screen.getByText("Gamma").closest("tr");
	expect(gammaRow).not.toBeNull();
	if (gammaRow) {
		// The type cell renders an em dash placeholder for untyped nodes.
		expect(within(gammaRow).getAllByText("—").length).toBeGreaterThan(0);
	}
});
