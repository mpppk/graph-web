import "@xyflow/react/dist/style.css";
import {
	Background,
	Controls,
	MiniMap,
	type Connection,
	type Edge as RFEdge,
	type Node as RFNode,
	type OnConnect,
	type ReactFlowInstance,
	ReactFlow,
	useEdgesState,
	useNodesState,
} from "@xyflow/react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { EditableEdge } from "./EditableEdge";
import { EditableNode } from "./EditableNode";
import { NodeSidePanel } from "./NodeSidePanel";
import { EdgeSidePanel } from "./EdgeSidePanel";
import {
	DEFAULT_LAYOUT_ALGORITHM,
	LAYOUT_ALGORITHMS,
	type LayoutAlgorithm,
} from "./constants";
import { computeElkLayout } from "./elk-layout";
import { generateMermaidDiagram } from "./mermaid-export";
import {
	createEdge,
	createNode,
	deleteEdge,
	deleteNode,
	updateEdgeLabel,
	updateNodePosition,
	updateNodeType,
} from "#/lib/graph-server-fns";
import type { graphs } from "#/db/schema";

type Graph = typeof graphs.$inferSelect;

const nodeTypes = { default: EditableNode };
const edgeTypes = { editable: EditableEdge };

function GraphCanvasInner({
	graph,
	initialNodes,
	initialEdges,
}: {
	graph: Graph;
	initialNodes: RFNode[];
	initialEdges: RFEdge[];
}) {
	const navigate = useNavigate();
	const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
	const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
	const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
	const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
	const [selectedAlgo, setSelectedAlgo] =
		useState<LayoutAlgorithm>(DEFAULT_LAYOUT_ALGORITHM);
	const [layoutMenuOpen, setLayoutMenuOpen] = useState(false);
	const layoutMenuRef = useRef<HTMLDivElement | null>(null);
	const rfInstanceRef = useRef<ReactFlowInstance | null>(null);
	const [mermaidCopied, setMermaidCopied] = useState(false);

	useEffect(() => {
		if (!layoutMenuOpen) return;
		const onPointerDown = (e: MouseEvent) => {
			if (
				layoutMenuRef.current &&
				!layoutMenuRef.current.contains(e.target as Node)
			) {
				setLayoutMenuOpen(false);
			}
		};
		document.addEventListener("mousedown", onPointerDown);
		return () => document.removeEventListener("mousedown", onPointerDown);
	}, [layoutMenuOpen]);

	const updatePosition = useMutation({
		mutationFn: ({ id, x, y }: { id: string; x: number; y: number }) =>
			updateNodePosition({ data: { id, x, y } }),
	});

	const createNodeMutation = useMutation({
		mutationFn: (label: string) =>
			createNode({
				data: {
					graphId: graph.id,
					label,
					x: Math.random() * 400,
					y: Math.random() * 300,
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
		}: { sourceNodeId: string; targetNodeId: string }) =>
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

	const updateNodeTypeMutation = useMutation({
		mutationFn: ({ id, nodeType }: { id: string; nodeType: string | null }) =>
			updateNodeType({ data: { id, nodeType } }),
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

	const onConnect: OnConnect = useCallback(
		(connection: Connection) => {
			if (connection.source && connection.target) {
				createEdgeMutation.mutate({
					sourceNodeId: connection.source,
					targetNodeId: connection.target,
				});
			}
		},
		[createEdgeMutation],
	);

	const onNodeDragStop = useCallback(
		(_: MouseEvent | TouchEvent, node: RFNode) => {
			updatePosition.mutate({
				id: node.id,
				x: node.position.x,
				y: node.position.y,
			});
		},
		[updatePosition],
	);

	const onNodeClick = useCallback((_: React.MouseEvent, node: RFNode) => {
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
		const diagram = generateMermaidDiagram(nodes, edges);
		navigator.clipboard.writeText(diagram).then(() => {
			setMermaidCopied(true);
			setTimeout(() => setMermaidCopied(false), 2000);
		});
	}, [nodes, edges]);

	return (
		<div className="flex h-screen flex-col">
			<header className="flex items-center gap-4 border-b border-slate-200 bg-white px-4 py-3">
				<button
					type="button"
					onClick={() => navigate({ to: "/graphs" })}
					className="rounded px-3 py-1 text-sm text-slate-600 hover:bg-slate-100"
				>
					← Back
				</button>
				<h1 className="font-semibold text-slate-800">{graph.name}</h1>
				{graph.description && (
					<span className="text-sm text-slate-400">{graph.description}</span>
				)}
				<div className="ml-auto flex gap-2">
					<button
						type="button"
						onClick={handleCopyMermaid}
						className="rounded-lg border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50"
					>
						{mermaidCopied ? "Copied!" : "Copy as Mermaid"}
					</button>
					<div ref={layoutMenuRef} className="relative flex">
						<button
							type="button"
							onClick={() => runLayout(selectedAlgo)}
							className="rounded-l-lg border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50"
						>
							⤢ 再配置: {selectedAlgo.label}
						</button>
						<button
							type="button"
							aria-label="レイアウトアルゴリズムを選択"
							onClick={() => setLayoutMenuOpen((v) => !v)}
							className="rounded-r-lg border border-l-0 border-slate-300 px-2 py-1 text-sm hover:bg-slate-50"
						>
							▼
						</button>
						{layoutMenuOpen && (
							<ul className="absolute right-0 top-full z-10 mt-1 w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
								{LAYOUT_ALGORITHMS.map((algo) => (
									<li key={algo.id}>
										<button
											type="button"
											onClick={() => {
												setSelectedAlgo(algo);
												setLayoutMenuOpen(false);
												runLayout(algo);
											}}
											className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50 ${
												algo.id === selectedAlgo.id
													? "bg-slate-100 font-medium"
													: ""
											}`}
										>
											{algo.label}
										</button>
									</li>
								))}
							</ul>
						)}
					</div>
					<button
						type="button"
						disabled={createNodeMutation.isPending}
						onClick={() => createNodeMutation.mutate("New Node")}
						className="rounded-lg bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
					>
						+ Add Node
					</button>
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
						onNodeClick={onNodeClick}
						onEdgeClick={onEdgeClick}
						onPaneClick={onPaneClick}
						onNodesDelete={onNodesDelete}
						onEdgesDelete={onEdgesDelete}
						deleteKeyCode="Delete"
						fitView
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
					/>
				)}
				{selectedEdgeId && (
					<EdgeSidePanel
						edgeId={selectedEdgeId}
						edges={edges}
						onClose={() => setSelectedEdgeId(null)}
						onDeleteEdge={handleDeleteEdgeFromPanel}
						onUpdateLabel={handleUpdateEdgeLabel}
					/>
				)}
			</div>
		</div>
	);
}

export default function GraphCanvas(props: {
	graph: Graph;
	initialNodes: RFNode[];
	initialEdges: RFEdge[];
}) {
	return <GraphCanvasInner {...props} />;
}
