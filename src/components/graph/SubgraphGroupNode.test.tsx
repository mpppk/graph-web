import { render } from "@testing-library/react";
import type { NodeProps } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { SubgraphGroupNode } from "./SubgraphGroupNode";
import { SUBGRAPH_DRAG_HANDLE_CLASS } from "./subgraph-view";

// The component only reads `data`, so a minimal props object is enough.
function renderGroup(data: { typeName: string; movable: boolean }) {
	const props = { data } as unknown as NodeProps;
	return render(<SubgraphGroupNode {...props} />);
}

describe("SubgraphGroupNode", () => {
	it("marks the header as the drag handle and makes only it interactive when movable", () => {
		const { getByText } = renderGroup({ typeName: "KPI", movable: true });
		const header = getByText("KPI");
		expect(header.classList.contains(SUBGRAPH_DRAG_HANDLE_CLASS)).toBe(true);
		// Header opts back in to pointer events so it can be grabbed to drag.
		expect(header.style.pointerEvents).toBe("auto");
		expect(header.style.cursor).toBe("grab");
	});

	it("keeps the header click-through when not movable", () => {
		const { getByText } = renderGroup({ typeName: "KPI", movable: false });
		const header = getByText("KPI");
		expect(header.style.pointerEvents).toBe("none");
		expect(header.style.cursor).toBe("default");
	});
});
