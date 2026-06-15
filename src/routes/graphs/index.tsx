import { createFileRoute, Link } from "@tanstack/react-router";
import { GraphList } from "#/components/graph/GraphList";
import { Button } from "#/components/ui/button";
import { authClient } from "#/lib/auth-client";
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
				<div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
			</div>
		);
	}

	if (!session?.user) {
		return (
			<div className="flex items-center justify-center py-20">
				<div className="text-center">
					<p className="mb-4 text-muted-foreground">
						グラフ機能を使うにはログインが必要です。
					</p>
					<Button asChild>
						<Link to="/login">Sign in</Link>
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-full">
			<main className="mx-auto max-w-4xl px-6 py-8">
				<GraphList initialGraphs={loaderData} />
			</main>
		</div>
	);
}
