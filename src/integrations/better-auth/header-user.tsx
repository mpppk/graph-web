import { Link } from "@tanstack/react-router";
import { UserIcon } from "lucide-react";
import ThemeToggle from "#/components/ThemeToggle";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { authClient } from "#/lib/auth-client";

export default function BetterAuthHeader() {
	const { data: session, isPending } = authClient.useSession();

	if (isPending) {
		return <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />;
	}

	if (session?.user) {
		return (
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						aria-label="アカウントメニュー"
						className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						{session.user.image ? (
							<img
								src={session.user.image}
								alt=""
								className="h-8 w-8 rounded-full object-cover transition-shadow hover:ring-2 hover:ring-ring"
							/>
						) : (
							<div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted transition-shadow hover:ring-2 hover:ring-ring">
								<span className="text-xs font-medium text-muted-foreground">
									{session.user.name?.charAt(0).toUpperCase() ?? "U"}
								</span>
							</div>
						)}
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent>
					<div className="flex items-center justify-between px-2 py-1.5">
						<span className="text-sm">ダークモード</span>
						<ThemeToggle />
					</div>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						onSelect={() => {
							void authClient.signOut();
						}}
					>
						Sign out
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		);
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					aria-label="アカウントメニュー"
					className="flex h-8 w-8 items-center justify-center rounded-full bg-muted transition-shadow hover:ring-2 hover:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					<UserIcon
						className="size-4 text-muted-foreground"
						aria-hidden
					/>
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent>
				<div className="flex items-center justify-between px-2 py-1.5">
					<span className="text-sm">ダークモード</span>
					<ThemeToggle />
				</div>
				<DropdownMenuSeparator />
				<DropdownMenuItem asChild>
					<Link to="/login">Sign in</Link>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
