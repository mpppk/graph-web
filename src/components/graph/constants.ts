export const NODE_TYPE_COLORS: Record<string, string> = {
	KPI: "#3b82f6",
	Epic: "#8b5cf6",
	Feature: "#22c55e",
	Opportunity: "#f97316",
	Solution: "#14b8a6",
};

export const PREDEFINED_NODE_TYPES = Object.keys(NODE_TYPE_COLORS);

export type LayoutAlgorithm = {
	id: string;
	label: string;
	elkOptions: Record<string, string>;
};

export const DEFAULT_LAYOUT_ALGORITHM: LayoutAlgorithm = {
	id: "layered",
	label: "Layered (階層)",
	elkOptions: {
		"elk.algorithm": "layered",
		"elk.direction": "DOWN",
		"elk.spacing.nodeNode": "40",
		"elk.layered.spacing.nodeNodeBetweenLayers": "60",
	},
};

export const LAYOUT_ALGORITHMS: LayoutAlgorithm[] = [
	DEFAULT_LAYOUT_ALGORITHM,
	{
		id: "mrtree",
		label: "Mr.Tree (木)",
		elkOptions: {
			"elk.algorithm": "mrtree",
			"elk.spacing.nodeNode": "40",
		},
	},
	{
		id: "force",
		label: "Force (力学)",
		elkOptions: {
			"elk.algorithm": "force",
			"elk.spacing.nodeNode": "80",
		},
	},
	{
		id: "radial",
		label: "Radial (放射状)",
		elkOptions: {
			"elk.algorithm": "radial",
			"elk.spacing.nodeNode": "60",
		},
	},
	{
		id: "stress",
		label: "Stress",
		elkOptions: {
			"elk.algorithm": "stress",
			"elk.spacing.nodeNode": "80",
		},
	},
];
