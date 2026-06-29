import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, expect, test, vi } from "vitest";
import { LAYOUT_ALGORITHMS } from "./constants";
import { GraphCommandPalette } from "./GraphCommandPalette";

beforeAll(() => {
	// jsdom lacks scrollIntoView; cmdk + our AI transcript call it.
	Element.prototype.scrollIntoView = vi.fn();
	// jsdom lacks ResizeObserver, which cmdk uses internally.
	globalThis.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
});

afterEach(() => {
	vi.clearAllMocks();
});

function renderPalette(overrides: Record<string, unknown> = {}) {
	const props = {
		open: true,
		onOpenChange: vi.fn(),
		onCopyMermaid: vi.fn(),
		onOpenSettings: vi.fn(),
		onRunLayout: vi.fn(),
		onAddNode: vi.fn(),
		creationTypes: ["KPI", "Feature"],
		layoutAlgorithms: LAYOUT_ALGORITHMS,
		selectedAlgoId: LAYOUT_ALGORITHMS[0].id,
		...overrides,
	};
	render(<GraphCommandPalette {...props} />);
	return props;
}

test("shows the root commands and the AI entry", () => {
	renderPalette();
	expect(screen.getByText("Copy as Mermaid")).toBeDefined();
	expect(screen.getByText("設定を開く")).toBeDefined();
	expect(screen.getByText("再配置…")).toBeDefined();
	expect(screen.getByText("ノードを追加…")).toBeDefined();
	expect(screen.getByText("AIに質問する")).toBeDefined();
});

test("running a command invokes the handler and closes", () => {
	const props = renderPalette();
	fireEvent.click(screen.getByText("Copy as Mermaid"));
	expect(props.onCopyMermaid).toHaveBeenCalledTimes(1);
	expect(props.onOpenChange).toHaveBeenCalledWith(false);
});

test("設定を開く invokes onOpenSettings and closes", () => {
	const props = renderPalette();
	fireEvent.click(screen.getByText("設定を開く"));
	expect(props.onOpenSettings).toHaveBeenCalledTimes(1);
	expect(props.onOpenChange).toHaveBeenCalledWith(false);
});

test("再配置 drills down into the algorithm list", () => {
	const props = renderPalette();
	fireEvent.click(screen.getByText("再配置…"));
	// Sub-page lists every layout algorithm.
	for (const algo of LAYOUT_ALGORITHMS) {
		expect(screen.getByText(algo.label)).toBeDefined();
	}
	fireEvent.click(screen.getByText(LAYOUT_ALGORITHMS[2].label));
	expect(props.onRunLayout).toHaveBeenCalledWith(LAYOUT_ALGORITHMS[2]);
	expect(props.onOpenChange).toHaveBeenCalledWith(false);
});

test("再配置 sub-page shows a back button that returns to root commands", () => {
	renderPalette();
	fireEvent.click(screen.getByText("再配置…"));
	// Back button is visible in the layout sub-page.
	const backButton = screen.getByText("コマンドに戻る");
	expect(backButton).toBeDefined();
	// Clicking it returns to root commands.
	fireEvent.click(backButton);
	expect(screen.getByText("Copy as Mermaid")).toBeDefined();
	expect(screen.getByText("再配置…")).toBeDefined();
});

test("ノードを追加 drills down into the creation type list", () => {
	const props = renderPalette();
	fireEvent.click(screen.getByText("ノードを追加…"));
	// Sub-page lists "タイプなし" plus every enabled creation type.
	expect(screen.getByText("タイプなし")).toBeDefined();
	expect(screen.getByText("KPI")).toBeDefined();
	expect(screen.getByText("Feature")).toBeDefined();
	fireEvent.click(screen.getByText("KPI"));
	expect(props.onAddNode).toHaveBeenCalledWith("KPI");
	expect(props.onOpenChange).toHaveBeenCalledWith(false);
});

test("ノードを追加 can create a node with no type", () => {
	const props = renderPalette();
	fireEvent.click(screen.getByText("ノードを追加…"));
	fireEvent.click(screen.getByText("タイプなし"));
	expect(props.onAddNode).toHaveBeenCalledWith(null);
	expect(props.onOpenChange).toHaveBeenCalledWith(false);
});

test("selecting the AI entry switches to chat mode and sends a placeholder reply", () => {
	renderPalette();
	const input = screen.getByPlaceholderText(
		"コマンドを検索、またはAIに質問…",
	) as HTMLInputElement;
	fireEvent.change(input, { target: { value: "なにか質問" } });
	fireEvent.click(screen.getByText(/AIに質問する/));
	// Now in AI mode: composer placeholder + back affordance.
	const composer = screen.getByPlaceholderText("AIに質問を入力… (Enterで送信)");
	fireEvent.change(composer, { target: { value: "ノードを増やしたい" } });
	fireEvent.keyDown(composer, { key: "Enter" });
	expect(screen.getByText("ノードを増やしたい")).toBeDefined();
	expect(screen.getByText(/近日対応予定/)).toBeDefined();
});
