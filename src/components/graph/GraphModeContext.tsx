import { createContext, useContext } from "react";

export type GraphMode = "read" | "edit";

const GraphModeContext = createContext<GraphMode>("edit");

// Custom React Flow nodes/edges can't receive arbitrary props, so the current
// read/edit mode is provided via context instead (mirrors NodeTypeContext).
export function GraphModeProvider({
	mode,
	children,
}: {
	mode: GraphMode;
	children: React.ReactNode;
}) {
	return (
		<GraphModeContext.Provider value={mode}>
			{children}
		</GraphModeContext.Provider>
	);
}

export function useGraphMode() {
	return useContext(GraphModeContext);
}
