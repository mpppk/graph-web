import { useNavigate } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "#/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import type { graphs, nodes } from "#/db/schema";
import type { NodeTypeWithFields } from "#/lib/graph-server-fns";
import type { MetadataValueType } from "#/lib/metadata-types";
import { buildColorMap } from "./NodeTypeContext";

type Graph = typeof graphs.$inferSelect;
type NodeRow = typeof nodes.$inferSelect;

type MetadataRow = {
	nodeId: string;
	key: string;
	value: string;
	valueType: MetadataValueType;
};

// Sentinel used in the type filter for nodes without a type.
const NO_TYPE = "__none__";

// Render a metadata value formatted by its declared type.
function MetadataValue({
	type,
	value,
}: {
	type: MetadataValueType;
	value: string;
}) {
	if (value === "") {
		return <span className="text-muted-foreground/60">—</span>;
	}
	if (type === "url") {
		return (
			<a
				href={value}
				target="_blank"
				rel="noopener noreferrer"
				className="text-primary underline hover:no-underline"
			>
				{value}
			</a>
		);
	}
	if (type === "boolean") {
		return <span>{value === "true" ? "はい" : "いいえ"}</span>;
	}
	return <span>{value}</span>;
}

function NodeTypeBadge({
	name,
	color,
}: {
	name: string;
	color: string | undefined;
}) {
	return (
		<span className="inline-flex items-center gap-1.5">
			<span
				className="inline-block size-2.5 shrink-0 rounded-full border"
				style={{ backgroundColor: color ?? "transparent" }}
			/>
			<span>{name}</span>
		</span>
	);
}

export function GraphTable({
	graph,
	nodeList,
	metadata,
	nodeTypeList,
	backHref,
}: {
	graph: Graph;
	nodeList: NodeRow[];
	metadata: MetadataRow[];
	nodeTypeList: NodeTypeWithFields[];
	backHref: string;
}) {
	const navigate = useNavigate();
	const colorMap = useMemo(() => buildColorMap(nodeTypeList), [nodeTypeList]);

	// nodeId → (key → { value, valueType })
	const metadataByNode = useMemo(() => {
		const map = new Map<string, Map<string, MetadataRow>>();
		for (const m of metadata) {
			let byKey = map.get(m.nodeId);
			if (!byKey) {
				byKey = new Map();
				map.set(m.nodeId, byKey);
			}
			byKey.set(m.key, m);
		}
		return map;
	}, [metadata]);

	// Node types present among the nodes (plus a slot for untyped nodes).
	const presentTypes = useMemo(() => {
		const set = new Set<string>();
		let hasUntyped = false;
		for (const n of nodeList) {
			if (n.nodeType) set.add(n.nodeType);
			else hasUntyped = true;
		}
		const list = [...set].sort((a, b) => a.localeCompare(b));
		return { list, hasUntyped };
	}, [nodeList]);

	// Which types are currently shown. `null` means "no filter applied" (all).
	const [activeTypes, setActiveTypes] = useState<Set<string> | null>(null);

	const toggleType = (key: string) => {
		setActiveTypes((prev) => {
			const all = new Set<string>([
				...presentTypes.list,
				...(presentTypes.hasUntyped ? [NO_TYPE] : []),
			]);
			// Start from the full set the first time a chip is toggled off.
			const base = prev ?? all;
			const next = new Set(base);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			// Everything selected again → back to the "no filter" state.
			if (next.size === all.size) return null;
			return next;
		});
	};

	const isActive = (key: string) =>
		activeTypes === null || activeTypes.has(key);

	const filteredNodes = useMemo(() => {
		const sorted = [...nodeList].sort((a, b) => a.label.localeCompare(b.label));
		if (activeTypes === null) return sorted;
		return sorted.filter((n) => activeTypes.has(n.nodeType ?? NO_TYPE));
	}, [nodeList, activeTypes]);

	// Dynamic columns: only metadata keys held by at least one currently
	// displayed (filtered) node. Keys no visible row has are dropped.
	const metadataKeys = useMemo(() => {
		const keys = new Set<string>();
		for (const n of filteredNodes) {
			const byKey = metadataByNode.get(n.id);
			if (byKey) for (const key of byKey.keys()) keys.add(key);
		}
		return [...keys].sort((a, b) => a.localeCompare(b));
	}, [filteredNodes, metadataByNode]);

	return (
		<div className="mx-auto max-w-6xl px-6 py-8">
			<div className="mb-4 flex items-center gap-3">
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="shrink-0"
					onClick={() =>
						navigate({ to: backHref } as Parameters<typeof navigate>[0])
					}
				>
					<ArrowLeftIcon />
					グラフに戻る
				</Button>
			</div>

			<div className="mb-6">
				<h1 className="truncate text-2xl font-semibold text-foreground">
					{graph.name}
				</h1>
				{graph.description && (
					<p className="mt-1 text-sm text-muted-foreground">
						{graph.description}
					</p>
				)}
			</div>

			{(presentTypes.list.length > 0 || presentTypes.hasUntyped) && (
				<div className="mb-4 flex flex-wrap items-center gap-2">
					<span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
						タイプで絞り込み
					</span>
					{presentTypes.list.map((name) => (
						<button
							key={name}
							type="button"
							onClick={() => toggleType(name)}
							aria-pressed={isActive(name)}
							className={
								isActive(name)
									? "inline-flex items-center gap-1.5 rounded-full border border-primary bg-primary/10 px-3 py-1 text-xs font-medium text-foreground"
									: "inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground hover:bg-accent"
							}
						>
							<span
								className="inline-block size-2.5 rounded-full border"
								style={{ backgroundColor: colorMap[name] ?? "transparent" }}
							/>
							{name}
						</button>
					))}
					{presentTypes.hasUntyped && (
						<button
							type="button"
							onClick={() => toggleType(NO_TYPE)}
							aria-pressed={isActive(NO_TYPE)}
							className={
								isActive(NO_TYPE)
									? "inline-flex items-center gap-1.5 rounded-full border border-primary bg-primary/10 px-3 py-1 text-xs font-medium text-foreground"
									: "inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground hover:bg-accent"
							}
						>
							タイプなし
						</button>
					)}
					{activeTypes !== null && (
						<button
							type="button"
							onClick={() => setActiveTypes(null)}
							className="text-xs text-muted-foreground underline hover:text-foreground"
						>
							絞り込みを解除
						</button>
					)}
				</div>
			)}

			{nodeList.length === 0 ? (
				<p className="py-12 text-center text-muted-foreground">
					ノードがありません。
				</p>
			) : (
				<div className="rounded-lg border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>名前</TableHead>
								<TableHead>タイプ</TableHead>
								{metadataKeys.map((key) => (
									<TableHead key={key}>{key}</TableHead>
								))}
							</TableRow>
						</TableHeader>
						<TableBody>
							{filteredNodes.length === 0 ? (
								<TableRow>
									<TableCell
										colSpan={2 + metadataKeys.length}
										className="py-10 text-center text-muted-foreground"
									>
										条件に一致するノードがありません。
									</TableCell>
								</TableRow>
							) : (
								filteredNodes.map((n) => {
									const byKey = metadataByNode.get(n.id);
									return (
										<TableRow key={n.id}>
											<TableCell className="font-medium text-foreground">
												{n.label}
											</TableCell>
											<TableCell>
												{n.nodeType ? (
													<NodeTypeBadge
														name={n.nodeType}
														color={colorMap[n.nodeType]}
													/>
												) : (
													<span className="text-muted-foreground/60">—</span>
												)}
											</TableCell>
											{metadataKeys.map((key) => {
												const m = byKey?.get(key);
												return (
													<TableCell key={key}>
														{m ? (
															<MetadataValue
																type={m.valueType}
																value={m.value}
															/>
														) : (
															<span className="text-muted-foreground/60">
																—
															</span>
														)}
													</TableCell>
												);
											})}
										</TableRow>
									);
								})
							)}
						</TableBody>
					</Table>
				</div>
			)}
		</div>
	);
}
