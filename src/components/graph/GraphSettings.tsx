import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import { Button } from "#/components/ui/button";
import type { graphs } from "#/db/schema";
import {
	type CreationTypeSetting,
	listNodeTypesForGraph,
	type NodeTypeWithFields,
} from "#/lib/graph-server-fns";
import { CreationTypeSettings } from "./CreationTypeSettings";
import { NodeTypeProvider } from "./NodeTypeContext";
import { NodeTypeManager } from "./NodeTypeManager";

type Graph = typeof graphs.$inferSelect;

export function GraphSettings({
	graph,
	backHref,
	orgId,
	teamId,
	initialNodeTypes,
	initialCreationTypeSettings,
}: {
	graph: Graph;
	backHref: string;
	orgId?: string;
	teamId?: string;
	initialNodeTypes: NodeTypeWithFields[];
	initialCreationTypeSettings: CreationTypeSetting[];
}) {
	const navigate = useNavigate();

	const { data: nodeTypeList = [] } = useQuery({
		queryKey: ["nodeTypes", graph.id],
		queryFn: () => listNodeTypesForGraph({ data: { graphId: graph.id } }),
		initialData: initialNodeTypes,
	});

	return (
		<NodeTypeProvider typeList={nodeTypeList}>
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
						<ArrowLeftIcon className="size-4" />
						グラフへ戻る
					</Button>
					<h1 className="min-w-0 truncate font-semibold text-foreground">
						{graph.name} の設定
					</h1>
				</header>

				<div className="flex-1 overflow-y-auto">
					<div className="mx-auto max-w-2xl space-y-8 px-4 py-6">
						<section className="space-y-3">
							<div>
								<h2 className="text-sm font-semibold text-foreground">
									ノードタイプ管理
								</h2>
								<p className="text-xs text-muted-foreground">
									ノードに割り当てられるタイプと、そのメタデータ項目を管理します。
								</p>
							</div>
							<NodeTypeManager
								graphId={graph.id}
								orgId={orgId}
								teamId={teamId}
							/>
						</section>

						<section className="space-y-3">
							<div>
								<h2 className="text-sm font-semibold text-foreground">
									作成時に選択可能なタイプ
								</h2>
								<p className="text-xs text-muted-foreground">
									ノード新規作成時に選択肢として表示するタイプを切り替えます。
								</p>
							</div>
							<CreationTypeSettings
								graphId={graph.id}
								initialSettings={initialCreationTypeSettings}
							/>
						</section>
					</div>
				</div>
			</div>
		</NodeTypeProvider>
	);
}
