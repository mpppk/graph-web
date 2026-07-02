import "@xyflow/react/dist/style.css";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
	Background,
	type Connection,
	Controls,
	MiniMap,
	type OnConnect,
	ReactFlow,
	type ReactFlowInstance,
	type Edge as RFEdge,
	type Node as RFNode,
	useEdgesState,
	useNodesState,
} from "@xyflow/react";
import { SparklesIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "#/components/ui/button";
import { Switch } from "#/components/ui/switch";
import type { graphs } from "#/db/schema";
import {
	type CreationTypeSetting,
	createEdge,
	createNode,
	deleteEdge,
	deleteNode,
	listCreationTypeSettings,
	listNodeMetadata,
	listNodeTypesForGraph,
	type NodeTypeWithFields,
	pasteNodes,
	setNodeTypeWithTemplate,
	updateEdgeLabel,
	updateNodeLabel,
	updateNodePosition,
} from "#/lib/graph-server-fns";
import {
	DEFAULT_LAYOUT_ALGORITHM,
	LAYOUT_ALGORITHMS,
	type LayoutAlgorithm,
} from "./constants";
import { enabledCreationTypeNames } from "./creation-types";
import { EdgeSidePanel } from "./EdgeSidePanel";
import { EditableEdge } from "./EditableEdge";
import { EditableNode } from "./EditableNode";
import { computeElkLayout } from "./elk-layout";
import { GraphCommandPalette } from "./GraphCommandPalette";
import { type GraphMode, GraphModeProvider } from "./GraphModeContext";
import { generateMermaidDiagram } from "./mermaid-export";
import { NodeSidePanel } from "./NodeSidePanel";
import { buildColorMap, NodeTypeProvider } from "./NodeTypeContext";

type Graph = typeof graphs.$inferSelect;

function useColorMode(): "dark" | "light" {
	const [colorMode, setColorMode] = useState<"dark" | "light">(() =>
		document.documentElement.classList.contains("dark") ? "dark" : "light",
	);
	useEffect(() => {
		const observer = new MutationObserver(() => {
			setColorMode(
				document.documentElement.classList.contains("dark") ? "dark" : "light",
			);
		});
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["class"],
		});
		return () => observer.disconnect();
	}, []);
	return colorMode;
}

type ClipboardData = {
	centroidX: number;
	centroidY: number;
	nodes: Array<{
		originalId: string;
		label: string;
		nodeType: string | null;
		relativeX: number;
		relativeY: number;
		metadata: Array<{ key: string; value: string }>;
	}>;
	edges: Array<{
		sourceOriginalId: string;
		targetOriginalId: string;
		label: string;
	}>;
};

const PASTE_OFFSET = 50;

const nodeTypes = { default: EditableNode };
const edgeTypes = { editable: EditableEdge };

function GraphCanvasInner({
	graph,
	initialNodes,
	initialEdges,
	initialNodeTypes,
	initialCreationTypeSettings = [],
	backHref = "/graphs",
	orgId,
	teamId,
}: {
	graph: Graph;
	initialNodes: RFNode[];
	initialEdges: RFEdge[];
	initialNodeTypes: NodeTypeWithFields[];
	initialCreationTypeSettings?: CreationTypeSetting[];
	backHref?: string;
	orgId?: string;
	teamId?: string;
}) {
	const navigate = useNavigate();
	const qc = useQueryClient();
	const colorMode = useColorMode();
	const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
	const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
	const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
	const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
	const [mode, setMode] = useState<GraphMode>("edit");
	const readOnly = mode === "read";

	const { data: nodeTypeList = [] } = useQuery({
		queryKey: ["nodeTypes", graph.id],
		queryFn: () => listNodeTypesForGraph({ data: { graphId: graph.id } }),
		initialData: initialNodeTypes,
	});

	const { data: creationTypeSettings = [] } = useQuery({
		queryKey: ["creationTypeSettings", graph.id],
		queryFn: () => listCreationTypeSettings({ data: { graphId: graph.id } }),
		initialData: initialCreationTypeSettings,
	});
	const creationTypeNames = enabledCreationTypeNames(
		nodeTypeList,
		creationTypeSettings,
	);

	const settingsHref =
		orgId && teamId
			? `/org/${orgId}/team/${teamId}/graphs/${graph.id}/settings`
			: `/graphs/${graph.id}/settings`;
	const [selectedAlgo, setSelectedAlgo] = useState<LayoutAlgorithm>(
		DEFAULT_LAYOUT_ALGORITHM,
	);
	const [paletteOpen, setPaletteOpen] = useState(false);
	const rfInstanceRef = useRef<ReactFlowInstance | null>(null);
	const clipboardRef = useRef<ClipboardData | null>(null);

	const updatePosition = useMutation({
		mutationFn: ({ id, x, y }: { id: string; x: number; y: number }) =>
			updateNodePosition({ data: { id, x, y } }),
	});

	const createNodeMutation = useMutation({
		mutationFn: ({
			label,
			nodeType,
		}: {
			label: string;
			nodeType: string | null;
		}) =>
			createNode({
				data: {
					graphId: graph.id,
					label,
					x: Math.random() * 400,
					y: Math.random() * 300,
					nodeType,
				},
			}),
		onSuccess: (newNode) => {
			if (!newNode) return;
			setNodes((prev) => [
				...prev,
				{
					id: newNode.id,
					type: "default",
					position: { x: newNode.x, y: newNode.y },
					data: {
						label: newNode.label,
						nodeType: newNode.nodeType ?? null,
						autoEdit: true,
					},
				},
			]);
		},
	});

	const createEdgeMutation = useMutation({
		mutationFn: ({
			sourceNodeId,
			targetNodeId,
		}: {
			sourceNodeId: string;
			targetNodeId: string;
		}) =>
			createEdge({ data: { graphId: graph.id, sourceNodeId, targetNodeId } }),
		onSuccess: (newEdge) => {
			if (!newEdge) return;
			setEdges((eds) => [
				...eds,
				{
					id: newEdge.id,
					source: newEdge.sourceNodeId,
					target: newEdge.targetNodeId,
					type: "editable",
					data: { label: newEdge.label ?? "" },
				},
			]);
		},
	});

	const updateEdgeLabelMutation = useMutation({
		mutationFn: ({ id, label }: { id: string; label: string }) =>
			updateEdgeLabel({ data: { id, label } }),
		onSuccess: (updatedEdge) => {
			if (!updatedEdge) return;
			setEdges((eds) =>
				eds.map((e) =>
					e.id === updatedEdge.id
						? { ...e, data: { ...e.data, label: updatedEdge.label } }
						: e,
				),
			);
		},
	});

	const deleteNodeMutation = useMutation({
		mutationFn: (id: string) => deleteNode({ data: { id } }),
	});

	const deleteEdgeMutation = useMutation({
		mutationFn: (id: string) => deleteEdge({ data: { id } }),
	});

	const pasteNodesMutation = useMutation({
		mutationFn: (payload: {
			graphId: string;
			nodes: Array<{
				tempId: string;
				label: string;
				x: number;
				y: number;
				nodeType: string | null;
				metadata: Array<{ key: string; value: string }>;
			}>;
			edges: Array<{
				sourceTempId: string;
				targetTempId: string;
				label: string;
			}>;
		}) => pasteNodes({ data: payload }),
		onSuccess: (result, variables) => {
			const newNodes: RFNode[] = variables.nodes.map((n) => ({
				id: result.nodeIdMap[n.tempId],
				type: "default" as const,
				position: { x: n.x, y: n.y },
				data: { label: n.label, nodeType: n.nodeType },
				selected: true,
			}));
			setNodes((prev) => [
				...prev.map((n) => ({ ...n, selected: false })),
				...newNodes,
			]);

			const newEdges: RFEdge[] = result.edges.map((e) => ({
				id: e.id,
				source: e.sourceNodeId,
				target: e.targetNodeId,
				type: "editable",
				data: { label: e.label },
			}));
			setEdges((prev) => [...prev, ...newEdges]);

			if (clipboardRef.current) {
				clipboardRef.current.centroidX += PASTE_OFFSET;
				clipboardRef.current.centroidY += PASTE_OFFSET;
			}
		},
	});

	const updateNodeTypeMutation = useMutation({
		mutationFn: ({ id, nodeType }: { id: string; nodeType: string | null }) =>
			setNodeTypeWithTemplate({ data: { id, nodeType } }),
		onSuccess: (_res, vars) => {
			// Template metadata keys may have been added — refresh the panel.
			qc.invalidateQueries({ queryKey: ["metadata", vars.id] });
		},
	});

	const handleUpdateNodeType = useCallback(
		(nodeId: string, nodeTypeVal: string | null) => {
			setNodes((nds) =>
				nds.map((n) =>
					n.id === nodeId
						? { ...n, data: { ...n.data, nodeType: nodeTypeVal } }
						: n,
				),
			);
			updateNodeTypeMutation.mutate({ id: nodeId, nodeType: nodeTypeVal });
		},
		[setNodes, updateNodeTypeMutation],
	);

	const updateNodeLabelMutation = useMutation({
		mutationFn: ({ id, label }: { id: string; label: string }) =>
			updateNodeLabel({ data: { id, label } }),
	});

	const handleUpdateNodeLabel = useCallback(
		(nodeId: string, label: string) => {
			setNodes((nds) =>
				nds.map((n) =>
					n.id === nodeId ? { ...n, data: { ...n.data, label } } : n,
				),
			);
			updateNodeLabelMutation.mutate({ id: nodeId, label });
		},
		[setNodes, updateNodeLabelMutation],
	);

	const onConnect: OnConnect = useCallback(
		(connection: Connection) => {
			if (readOnly) return;
			if (connection.source && connection.target) {
				createEdgeMutation.mutate({
					sourceNodeId: connection.source,
					targetNodeId: connection.target,
				});
			}
		},
		[createEdgeMutation, readOnly],
	);

	const onNodeDragStop = useCallback(
		(_: MouseEvent | TouchEvent, node: RFNode) => {
			if (readOnly) return;
			updatePosition.mutate({
				id: node.id,
				x: node.position.x,
				y: node.position.y,
			});
		},
		[updatePosition, readOnly],
	);

	const onSelectionDragStop = useCallback(
		(_: React.MouseEvent, selectedNodes: RFNode[]) => {
			if (readOnly) return;
			for (const node of selectedNodes) {
				updatePosition.mutate({
					id: node.id,
					x: node.position.x,
					y: node.position.y,
				});
			}
		},
		[updatePosition, readOnly],
	);

	const onNodeClick = useCallback((_: React.MouseEvent, node: RFNode) => {
		if (_.ctrlKey || _.metaKey) {
			setSelectedNodeId(null);
			setSelectedEdgeId(null);
			return;
		}
		setSelectedNodeId(node.id);
		setSelectedEdgeId(null);
	}, []);

	const onEdgeClick = useCallback((_: React.MouseEvent, edge: RFEdge) => {
		setSelectedEdgeId(edge.id);
		setSelectedNodeId(null);
	}, []);

	const onPaneClick = useCallback(() => {
		setSelectedNodeId(null);
		setSelectedEdgeId(null);
	}, []);

	const onNodesDelete = useCallback(
		(deletedNodes: RFNode[]) => {
			for (const n of deletedNodes) {
				deleteNodeMutation.mutate(n.id);
				if (selectedNodeId === n.id) setSelectedNodeId(null);
			}
		},
		[deleteNodeMutation, selectedNodeId],
	);

	const onEdgesDelete = useCallback(
		(deletedEdges: RFEdge[]) => {
			for (const e of deletedEdges) {
				deleteEdgeMutation.mutate(e.id);
				if (selectedEdgeId === e.id) setSelectedEdgeId(null);
			}
		},
		[deleteEdgeMutation, selectedEdgeId],
	);

	const handleDeleteNodeFromPanel = useCallback(
		(nodeId: string) => {
			setNodes((nds) => nds.filter((n) => n.id !== nodeId));
			setEdges((eds) =>
				eds.filter((e) => e.source !== nodeId && e.target !== nodeId),
			);
			deleteNodeMutation.mutate(nodeId);
			setSelectedNodeId(null);
		},
		[setNodes, setEdges, deleteNodeMutation],
	);

	const handleDeleteEdgeFromPanel = useCallback(
		(edgeId: string) => {
			setEdges((eds) => eds.filter((e) => e.id !== edgeId));
			deleteEdgeMutation.mutate(edgeId);
			setSelectedEdgeId(null);
		},
		[setEdges, deleteEdgeMutation],
	);

	const handleUpdateEdgeLabel = useCallback(
		(edgeId: string, label: string) => {
			updateEdgeLabelMutation.mutate({ id: edgeId, label });
		},
		[updateEdgeLabelMutation],
	);

	const runLayout = useCallback(
		async (algo: LayoutAlgorithm) => {
			if (nodes.length === 0) return;
			const positions = await computeElkLayout(nodes, edges, algo.elkOptions);
			const updated = nodes.map((n) => {
				const pos = positions.get(n.id);
				return pos ? { ...n, position: pos } : n;
			});
			setNodes(updated);
			for (const n of updated) {
				updatePosition.mutate({
					id: n.id,
					x: n.position.x,
					y: n.position.y,
				});
			}
			requestAnimationFrame(() => {
				rfInstanceRef.current?.fitView({ duration: 400, padding: 0.2 });
			});
		},
		[nodes, edges, setNodes, updatePosition],
	);

	const handleCopyMermaid = useCallback(() => {
		const diagram = generateMermaidDiagram(
			nodes,
			edges,
			buildColorMap(nodeTypeList),
		);
		navigator.clipboard.writeText(diagram);
	}, [nodes, edges, nodeTypeList]);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			const isModK =
				(e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K");
			if (isModK) {
				e.preventDefault();
				setPaletteOpen((v) => !v);
				return;
			}

			const target = e.target as HTMLElement;
			if (
				target.tagName === "INPUT" ||
				target.tagName === "TEXTAREA" ||
				target.isContentEditable
			) {
				return;
			}

			const isMod = e.ctrlKey || e.metaKey;

			if (isMod && e.key === "c") {
				const selectedNodes = nodes.filter((n) => n.selected);
				if (selectedNodes.length === 0) return;

				e.preventDefault();

				const centroidX =
					selectedNodes.reduce((sum, n) => sum + n.position.x, 0) /
					selectedNodes.length;
				const centroidY =
					selectedNodes.reduce((sum, n) => sum + n.position.y, 0) /
					selectedNodes.length;

				const selectedIds = new Set(selectedNodes.map((n) => n.id));
				const selectedEdges = edges.filter(
					(edge) =>
						selectedIds.has(edge.source) && selectedIds.has(edge.target),
				);

				Promise.all(
					selectedNodes.map(async (node) => {
						try {
							const meta = await listNodeMetadata({
								data: { nodeId: node.id },
							});
							return { nodeId: node.id, metadata: meta };
						} catch {
							return {
								nodeId: node.id,
								metadata: [] as Array<{ key: string; value: string }>,
							};
						}
					}),
				).then((metadataResults) => {
					const metaMap = new Map(
						metadataResults.map((r) => [r.nodeId, r.metadata]),
					);

					clipboardRef.current = {
						centroidX,
						centroidY,
						nodes: selectedNodes.map((n) => ({
							originalId: n.id,
							label: n.data.label as string,
							nodeType: (n.data.nodeType as string | null) ?? null,
							relativeX: n.position.x - centroidX,
							relativeY: n.position.y - centroidY,
							metadata: (metaMap.get(n.id) ?? []).map((m) => ({
								key: m.key,
								value: m.value,
							})),
						})),
						edges: selectedEdges.map((edge) => ({
							sourceOriginalId: edge.source,
							targetOriginalId: edge.target,
							label: (edge.data?.label as string) ?? "",
						})),
					};
				});

				return;
			}

			if (isMod && e.key === "v") {
				if (readOnly || !clipboardRef.current || pasteNodesMutation.isPending)
					return;
				e.preventDefault();

				const clipboard = clipboardRef.current;
				const pasteX = clipboard.centroidX + PASTE_OFFSET;
				const pasteY = clipboard.centroidY + PASTE_OFFSET;

				const tempIdMap = new Map<string, string>();
				const nodesPayload = clipboard.nodes.map((n) => {
					const tempId = crypto.randomUUID();
					tempIdMap.set(n.originalId, tempId);
					return {
						tempId,
						label: n.label,
						x: pasteX + n.relativeX,
						y: pasteY + n.relativeY,
						nodeType: n.nodeType,
						metadata: n.metadata,
					};
				});

				const edgesPayload = clipboard.edges
					.filter(
						(e) =>
							tempIdMap.has(e.sourceOriginalId) &&
							tempIdMap.has(e.targetOriginalId),
					)
					.map((e) => ({
						sourceTempId: tempIdMap.get(e.sourceOriginalId) ?? "",
						targetTempId: tempIdMap.get(e.targetOriginalId) ?? "",
						label: e.label,
					}));

				pasteNodesMutation.mutate({
					graphId: graph.id,
					nodes: nodesPayload,
					edges: edgesPayload,
				});

				return;
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [nodes, edges, graph.id, pasteNodesMutation, readOnly]);

	return (
		<NodeTypeProvider typeList={nodeTypeList}>
			<GraphModeProvider mode={mode}>
				<div className="flex h-full flex-col">
					<header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b bg-card px-4 py-3">
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() =>
								navigate({ to: backHref } as Parameters<typeof navigate>[0])
							}
						>
							← Back
						</Button>
						<div className="flex min-w-0 items-center gap-1">
							<h1 className="min-w-0 truncate font-semibold text-foreground">
								{graph.name}
							</h1>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								aria-label="コマンドパレットを開く (⌘K)"
								title="コマンドパレットを開く (⌘K)"
								onClick={() => setPaletteOpen(true)}
							>
								<SparklesIcon />
							</Button>
						</div>
						{graph.description && (
							<span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
								{graph.description}
							</span>
						)}
						<div className="ml-auto flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
							<span>{readOnly ? "閲覧" : "編集"}</span>
							<Switch
								checked={!readOnly}
								onCheckedChange={(checked) =>
									setMode(checked ? "edit" : "read")
								}
								aria-label="編集モード"
							/>
						</div>
					</header>

					<div className="flex flex-1 overflow-hidden">
						<div className="flex-1 overflow-hidden">
							<ReactFlow
								nodes={nodes}
								edges={edges}
								nodeTypes={nodeTypes}
								edgeTypes={edgeTypes}
								onNodesChange={onNodesChange}
								onEdgesChange={onEdgesChange}
								onConnect={onConnect}
								onNodeDragStop={onNodeDragStop}
								onSelectionDragStop={onSelectionDragStop}
								onNodeClick={onNodeClick}
								onEdgeClick={onEdgeClick}
								onPaneClick={onPaneClick}
								onNodesDelete={onNodesDelete}
								onEdgesDelete={onEdgesDelete}
								deleteKeyCode={readOnly ? null : ["Delete", "Backspace"]}
								nodesConnectable={!readOnly}
								nodesDraggable={!readOnly}
								panOnDrag
								selectionKeyCode="Shift"
								fitView
								colorMode={colorMode}
								onInit={(instance) => {
									rfInstanceRef.current = instance;
								}}
							>
								<Background />
								<Controls />
								<MiniMap />
							</ReactFlow>
						</div>

						{selectedNodeId && (
							<NodeSidePanel
								nodeId={selectedNodeId}
								nodes={nodes}
								onClose={() => setSelectedNodeId(null)}
								onDeleteNode={handleDeleteNodeFromPanel}
								onUpdateNodeType={handleUpdateNodeType}
								onUpdateNodeLabel={handleUpdateNodeLabel}
								readOnly={readOnly}
							/>
						)}
						{selectedEdgeId && (
							<EdgeSidePanel
								edgeId={selectedEdgeId}
								edges={edges}
								onClose={() => setSelectedEdgeId(null)}
								onDeleteEdge={handleDeleteEdgeFromPanel}
								onUpdateLabel={handleUpdateEdgeLabel}
								readOnly={readOnly}
							/>
						)}
					</div>

					<GraphCommandPalette
						open={paletteOpen}
						onOpenChange={setPaletteOpen}
						onCopyMermaid={handleCopyMermaid}
						onOpenSettings={() =>
							navigate({ to: settingsHref } as Parameters<typeof navigate>[0])
						}
						onRunLayout={(algo) => {
							setSelectedAlgo(algo);
							runLayout(algo);
						}}
						onAddNode={(nodeType) =>
							createNodeMutation.mutate({ label: "New Node", nodeType })
						}
						creationTypes={creationTypeNames}
						layoutAlgorithms={LAYOUT_ALGORITHMS}
						selectedAlgoId={selectedAlgo.id}
						readOnly={readOnly}
					/>
				</div>
			</GraphModeProvider>
		</NodeTypeProvider>
	);
}

export default function GraphCanvas(props: {
	graph: Graph;
	initialNodes: RFNode[];
	initialEdges: RFEdge[];
	initialNodeTypes: NodeTypeWithFields[];
	initialCreationTypeSettings?: CreationTypeSetting[];
	backHref?: string;
	orgId?: string;
	teamId?: string;
}) {
	return <GraphCanvasInner {...props} />;
}
