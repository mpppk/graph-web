import { useQuery } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import { authClient } from "#/lib/auth-client";
import { getGraph } from "#/lib/graph-server-fns";
import { getTeam } from "#/lib/org-server-fns";
import BetterAuthHeader from "../integrations/better-auth/header-user.tsx";

function HeaderBreadcrumb() {
	const params = useRouterState({
		select: (s) => {
			const last = s.matches[s.matches.length - 1];
			return (last?.params ?? {}) as Record<string, string>;
		},
	});

	const orgId = params.orgId;
	const teamId = params.teamId;
	const graphId = params.graphId;

	const { data: team } = useQuery({
		queryKey: ["team", teamId],
		queryFn: () => getTeam({ data: { teamId: teamId! } }),
		enabled: !!teamId,
	});

	const { data: graph } = useQuery({
		queryKey: ["graph", graphId],
		queryFn: () => getGraph({ data: { id: graphId! } }),
		enabled: !!graphId,
	});

	if (!teamId || !orgId) return null;

	return (
		<div className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
			<Link
				to="/org/$orgId/team/$teamId/graphs"
				params={{ orgId, teamId }}
				className="truncate no-underline transition-colors hover:text-foreground"
			>
				{team?.name ?? "…"}
			</Link>
			{graphId && (
				<>
					<span className="text-muted-foreground/60">/</span>
					<span className="truncate font-medium text-foreground">
						{graph?.name ?? "…"}
					</span>
				</>
			)}
		</div>
	);
}

export default function Header() {
	const { data: session } = authClient.useSession();

	return (
		<header className="sticky top-0 z-50 border-b bg-background/80 px-4 backdrop-blur-lg">
			<nav className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-3 gap-y-2 py-3 sm:py-4">
				<h2 className="m-0 flex-shrink-0 text-base font-semibold tracking-tight">
					<Link
						to="/orgs"
						className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-sm text-foreground no-underline shadow-xs sm:px-4 sm:py-2"
					>
						G
					</Link>
				</h2>

				{session?.user && <HeaderBreadcrumb />}

				<div className="ml-auto flex items-center gap-1.5 sm:gap-2">
					<BetterAuthHeader />
				</div>
			</nav>
		</header>
	);
}
