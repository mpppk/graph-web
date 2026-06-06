import { Link, createFileRoute } from "@tanstack/react-router";
import { authClient } from "#/lib/auth-client";
import { GraphList } from "#/components/graph/GraphList";
import { listGraphs } from "#/lib/graph-server-fns";

export const Route = createFileRoute("/graphs/")({
	component: GraphsPage,
	loader: async () => {
		try {
			return await listGraphs();
		} catch {
			return [];
		}
	},
});

function GraphsPage() {
	const { data: session, isPending } = authClient.useSession();
	const loaderData = Route.useLoaderData();

	if (isPending) {
		return (
			<div className="flex items-center justify-center py-20">
				<div className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-200 border-t-neutral-900 dark:border-neutral-800 dark:border-t-neutral-100" />
			</div>
		);
	}

	if (!session?.user) {
		return (
			<div className="flex items-center justify-center py-20">
				<div className="text-center">
					<p className="text-slate-600 mb-4">
						グラフ機能を使うにはログインが必要です。
					</p>
					<Link
						to="/demo/better-auth"
						className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
					>
						Sign in
					</Link>
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-slate-50">
			<main className="mx-auto max-w-4xl px-6 py-8">
				<GraphList initialGraphs={loaderData} />
			</main>
		</div>
	);
}
