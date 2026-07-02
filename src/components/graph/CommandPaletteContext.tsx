import { createContext, useContext, useState } from "react";

type OpenPalette = () => void;

type CommandPaletteContextValue = {
	// Non-null only while a graph canvas (which owns the palette) is mounted.
	openPalette: OpenPalette | null;
	setOpenPalette: (handler: OpenPalette | null) => void;
};

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(
	null,
);

// The command palette itself lives inside GraphCanvas (it's tightly coupled to
// the graph's data and mutations). This context lets the global header expose a
// trigger button that opens that palette: GraphCanvas registers its open
// handler here on mount, and the header calls it.
export function CommandPaletteProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const [openPalette, setOpenPalette] = useState<OpenPalette | null>(null);
	return (
		<CommandPaletteContext.Provider value={{ openPalette, setOpenPalette }}>
			{children}
		</CommandPaletteContext.Provider>
	);
}

export function useCommandPalette() {
	const ctx = useContext(CommandPaletteContext);
	if (!ctx) {
		throw new Error(
			"useCommandPalette must be used within a CommandPaletteProvider",
		);
	}
	return ctx;
}
