import { Link } from "@tanstack/react-router";
import BetterAuthHeader from "../integrations/better-auth/header-user.tsx";
import { authClient } from "#/lib/auth-client";

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
						Graph Web
					</Link>
				</h2>

				{session?.user && (
					<Link
						to="/orgs"
						className="text-sm text-muted-foreground hover:text-foreground transition-colors no-underline"
					>
						Organizations
					</Link>
				)}

				<div className="ml-auto flex items-center gap-1.5 sm:gap-2">
					<BetterAuthHeader />
				</div>
			</nav>
		</header>
	);
}
