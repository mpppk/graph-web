import { useMutation, useQuery } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	redirect,
	useNavigate,
} from "@tanstack/react-router";
import {
	SettingsIcon,
	SquareChevronRightIcon,
	UserPlusIcon,
	UsersIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { CommandPalette } from "#/components/CommandPalette";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { Skeleton } from "#/components/ui/skeleton";
import { getSession } from "#/lib/graph-auth";
import {
	createTeam,
	inviteMember,
	listMembers,
	listTeams,
	setActiveOrganization,
} from "#/lib/org-server-fns";

const SKELETON_ROWS = ["skeleton-1", "skeleton-2", "skeleton-3"];

export const Route = createFileRoute("/org/$orgId/")({
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
		const [teams, org] = await Promise.all([
			listTeams({ data: { orgId: params.orgId } }),
			listMembers({ data: { orgId: params.orgId } }),
		]);
		return { teams, org };
	},
	component: OrgPage,
});

function OrgPage() {
	const { orgId } = Route.useParams();
	const navigate = useNavigate();

	const {
		data: teams,
		isPending: teamsPending,
		refetch: refetchTeams,
	} = useQuery({
		queryKey: ["teams", orgId],
		queryFn: () => listTeams({ data: { orgId } }),
	});

	const {
		data: org,
		isPending: membersPending,
		refetch: refetchMembers,
	} = useQuery({
		queryKey: ["org-members", orgId],
		queryFn: () => listMembers({ data: { orgId } }),
	});

	const [paletteOpen, setPaletteOpen] = useState(false);
	const [createTeamOpen, setCreateTeamOpen] = useState(false);
	const [inviteOpen, setInviteOpen] = useState(false);
	const [teamName, setTeamName] = useState("");
	const [inviteEmail, setInviteEmail] = useState("");
	const [inviteRole, setInviteRole] = useState<"member" | "admin" | "owner">(
		"member",
	);
	const [inviteLink, setInviteLink] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
				e.preventDefault();
				setPaletteOpen((v) => !v);
			}
		};
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, []);

	const { mutate: handleCreateTeam, isPending: creatingTeam } = useMutation({
		mutationFn: () => createTeam({ data: { orgId, name: teamName } }),
		onSuccess: () => {
			refetchTeams();
			setTeamName("");
			setCreateTeamOpen(false);
		},
	});

	const { mutate: handleInvite, isPending: inviting } = useMutation({
		mutationFn: () =>
			inviteMember({ data: { orgId, email: inviteEmail, role: inviteRole } }),
		onSuccess: (data) => {
			refetchMembers();
			setInviteEmail("");
			if (data?.id) {
				setInviteLink(
					`${window.location.origin}/accept-invitation?id=${data.id}`,
				);
			}
		},
	});

	const openCreateTeamDialog = () => {
		setTeamName("");
		setCreateTeamOpen(true);
	};

	const openInviteDialog = () => {
		setInviteEmail("");
		setInviteRole("member");
		setInviteLink(null);
		setInviteOpen(true);
	};

	return (
		<main className="mx-auto max-w-2xl px-4 py-10">
			<div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
				<Link to="/orgs" className="hover:text-foreground transition-colors">
					Organizations
				</Link>
				<span>/</span>
				<span className="font-medium text-foreground">
					{org?.name ?? orgId}
				</span>
			</div>

			<div className="mb-6 flex items-center gap-1">
				<h1 className="text-2xl font-bold">Teams</h1>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					aria-label="コマンドパレットを開く (⌘K)"
					title="コマンドパレットを開く (⌘K)"
					onClick={() => setPaletteOpen(true)}
				>
					<SquareChevronRightIcon />
				</Button>
			</div>

			<ul className="mb-8 space-y-2">
				{teamsPending ? (
					SKELETON_ROWS.map((key, i) => (
						<li key={key} className="rounded-lg border border-border px-4 py-3">
							<Skeleton className={i % 2 === 0 ? "h-5 w-1/3" : "h-5 w-1/2"} />
						</li>
					))
				) : (
					<>
						{teams?.map((team) => (
							<li key={team.id}>
								<Link
									to="/org/$orgId/team/$teamId/graphs"
									params={{ orgId, teamId: team.id }}
									className="block rounded-lg border border-border px-4 py-3 transition-colors hover:bg-muted no-underline text-foreground"
								>
									{team.name}
								</Link>
							</li>
						))}
						{teams?.length === 0 && (
							<li className="text-muted-foreground text-sm">No teams yet.</li>
						)}
					</>
				)}
			</ul>

			<Card>
				<CardHeader>
					<CardTitle>Members</CardTitle>
				</CardHeader>
				<CardContent>
					<ul className="space-y-1 text-sm">
						{membersPending
							? SKELETON_ROWS.map((key) => (
									<li key={key} className="flex justify-between">
										<Skeleton className="h-4 w-40" />
										<Skeleton className="h-4 w-16" />
									</li>
								))
							: org?.members?.map((m) => (
									<li key={m.id} className="flex justify-between">
										<span>
											{m.user.name} ({m.user.email})
										</span>
										<span className="text-muted-foreground">{m.role}</span>
									</li>
								))}
					</ul>
				</CardContent>
			</Card>

			<CommandPalette
				open={paletteOpen}
				onOpenChange={setPaletteOpen}
				commands={[
					{
						label: "チームを作成",
						keywords: ["create", "team", "チーム", "作成", "新規"],
						icon: <UsersIcon />,
						onSelect: openCreateTeamDialog,
					},
					{
						label: "メンバーを招待",
						keywords: ["invite", "member", "招待", "メンバー"],
						icon: <UserPlusIcon />,
						onSelect: openInviteDialog,
					},
					{
						label: "組織設定を開く",
						keywords: ["settings", "organization", "組織", "設定"],
						icon: <SettingsIcon />,
						onSelect: () =>
							navigate({ to: "/org/$orgId/settings", params: { orgId } }),
					},
				]}
			/>

			<Dialog open={createTeamOpen} onOpenChange={setCreateTeamOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>チームを作成</DialogTitle>
					</DialogHeader>

					<div className="flex flex-col gap-1.5">
						<Label htmlFor="team-name">Team name</Label>
						<Input
							id="team-name"
							type="text"
							placeholder="Team name"
							value={teamName}
							onChange={(e) => setTeamName(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && teamName.trim()) {
									handleCreateTeam();
								}
							}}
							autoFocus
						/>
					</div>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => setCreateTeamOpen(false)}
						>
							キャンセル
						</Button>
						<Button
							type="button"
							disabled={!teamName.trim() || creatingTeam}
							onClick={() => handleCreateTeam()}
						>
							{creatingTeam ? "作成中…" : "作成"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>メンバーを招待</DialogTitle>
					</DialogHeader>

					<div className="flex flex-col gap-3">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="invite-email">Email</Label>
							<Input
								id="invite-email"
								type="email"
								placeholder="colleague@example.com"
								value={inviteEmail}
								onChange={(e) => setInviteEmail(e.target.value)}
								autoFocus
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="invite-role">Role</Label>
							<Select
								value={inviteRole}
								onValueChange={(v) =>
									setInviteRole(v as "member" | "admin" | "owner")
								}
							>
								<SelectTrigger id="invite-role">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="member">Member</SelectItem>
									<SelectItem value="admin">Admin</SelectItem>
									<SelectItem value="owner">Owner</SelectItem>
								</SelectContent>
							</Select>
						</div>
						{inviteLink && (
							<div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm dark:border-green-800 dark:bg-green-950">
								<p className="mb-1 font-medium text-green-700 dark:text-green-300">
									Invitation created!
								</p>
								<p className="mb-2 text-muted-foreground">
									Share this link with the invitee:
								</p>
								<div className="flex items-center gap-2">
									<Input
										readOnly
										value={inviteLink}
										className="flex-1 font-mono text-xs"
										onFocus={(e) => e.currentTarget.select()}
									/>
									<Button
										type="button"
										size="sm"
										variant="outline"
										onClick={() => {
											navigator.clipboard.writeText(inviteLink);
											setCopied(true);
											setTimeout(() => setCopied(false), 2000);
										}}
									>
										{copied ? "Copied!" : "Copy"}
									</Button>
								</div>
							</div>
						)}
					</div>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => setInviteOpen(false)}
						>
							閉じる
						</Button>
						<Button
							type="button"
							disabled={!inviteEmail.trim() || inviting}
							onClick={() => {
								setInviteLink(null);
								handleInvite();
							}}
						>
							{inviting ? "Sending..." : "Send Invite"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</main>
	);
}
