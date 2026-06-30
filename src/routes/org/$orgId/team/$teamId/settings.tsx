import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import { NodeTypeProvider } from "#/components/graph/NodeTypeContext";
import { NodeTypeManager } from "#/components/graph/NodeTypeManager";
import { Button } from "#/components/ui/button";
import { getSession } from "#/lib/graph-auth";
import { listNodeTypesForTeam } from "#/lib/graph-server-fns";
import { setActiveOrganization, setActiveTeam } from "#/lib/org-server-fns";

export const Route = createFileRoute("/org/$orgId/team/$teamId/settings")({
	component: TeamSettingsPage,
	beforeLoad: async () => {
		const session = await getSession();
		if (!session) {
			throw redirect({ to: "/login" });
		}
	},
	loader: async ({ params }) => {
		await Promise.all([
			setActiveOrganization({ data: { orgId: params.orgId } }).catch(() => {}),
			setActiveTeam({ data: { teamId: params.teamId } }).catch(() => {}),
		]);

		const nodeTypeList = await listNodeTypesForTeam({
			data: { teamId: params.teamId },
		});

		return {
			initialNodeTypes: nodeTypeList,
			orgId: params.orgId,
			teamId: params.teamId,
		};
	},
});

function TeamSettingsPage() {
	const { initialNodeTypes, orgId, teamId } = Route.useLoaderData();
	const navigate = useNavigate();

	const { data: nodeTypeList = [] } = useQuery({
		queryKey: ["nodeTypes", "team", teamId],
		queryFn: () => listNodeTypesForTeam({ data: { teamId } }),
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
							navigate({
								to: "/org/$orgId/team/$teamId/graphs",
								params: { orgId, teamId },
							})
						}
					>
						<ArrowLeftIcon className="size-4" />
						グラフ一覧へ戻る
					</Button>
					<h1 className="min-w-0 truncate font-semibold text-foreground">
						チーム設定
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
									チーム共通のノードタイプと、そのメタデータ項目を管理します。
								</p>
							</div>
							<NodeTypeManager teamId={teamId} fixedScope="team" />
						</section>
					</div>
				</div>
			</div>
		</NodeTypeProvider>
	);
}
