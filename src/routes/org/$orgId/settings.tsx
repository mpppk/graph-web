import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import { NodeTypeProvider } from "#/components/graph/NodeTypeContext";
import { NodeTypeManager } from "#/components/graph/NodeTypeManager";
import { TemplateManager } from "#/components/graph/TemplateManager";
import { Button } from "#/components/ui/button";
import { getSession } from "#/lib/graph-auth";
import { listNodeTypesForOrg } from "#/lib/graph-server-fns";
import { setActiveOrganization } from "#/lib/org-server-fns";

export const Route = createFileRoute("/org/$orgId/settings")({
	component: OrgSettingsPage,
	beforeLoad: async () => {
		const session = await getSession();
		if (!session) {
			throw redirect({ to: "/login" });
		}
	},
	loader: async ({ params }) => {
		await setActiveOrganization({ data: { orgId: params.orgId } }).catch(
			() => {},
		);

		const nodeTypeList = await listNodeTypesForOrg({
			data: { orgId: params.orgId },
		});

		return {
			initialNodeTypes: nodeTypeList,
			orgId: params.orgId,
		};
	},
});

function OrgSettingsPage() {
	const { initialNodeTypes, orgId } = Route.useLoaderData();
	const navigate = useNavigate();

	const { data: nodeTypeList = [] } = useQuery({
		queryKey: ["nodeTypes", "org", orgId],
		queryFn: () => listNodeTypesForOrg({ data: { orgId } }),
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
						onClick={() => navigate({ to: "/org/$orgId", params: { orgId } })}
					>
						<ArrowLeftIcon className="size-4" />
						組織トップへ戻る
					</Button>
					<h1 className="min-w-0 truncate font-semibold text-foreground">
						組織設定
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
									組織共通のノードタイプと、そのメタデータ項目を管理します。
								</p>
							</div>
							<NodeTypeManager orgId={orgId} fixedScope="org" />
						</section>

						<section className="space-y-3">
							<div>
								<h2 className="text-sm font-semibold text-foreground">
									テンプレート管理
								</h2>
								<p className="text-xs text-muted-foreground">
									グラフ作成時に使える組織テンプレートと、その利用可能なノードタイプを管理します。
								</p>
							</div>
							<TemplateManager ownerType="org" ownerId={orgId} />
						</section>
					</div>
				</div>
			</div>
		</NodeTypeProvider>
	);
}
