import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { BuildingIcon, SquareChevronRightIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { CommandPalette } from "#/components/CommandPalette";
import { Button } from "#/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Skeleton } from "#/components/ui/skeleton";
import { getSession } from "#/lib/graph-auth";
import { createOrg, listOrgs } from "#/lib/org-server-fns";

const SKELETON_ROWS = ["skeleton-1", "skeleton-2", "skeleton-3"];

export const Route = createFileRoute("/orgs")({
	beforeLoad: async () => {
		const session = await getSession();
		if (!session) {
			throw redirect({ to: "/login" });
		}
	},
	loader: async () => {
		return listOrgs();
	},
	component: OrgsPage,
});

function OrgsPage() {
	const {
		data: orgs,
		isPending: orgsPending,
		refetch,
	} = useQuery({
		queryKey: ["orgs"],
		queryFn: () => listOrgs(),
	});

	const [paletteOpen, setPaletteOpen] = useState(false);
	const [createOpen, setCreateOpen] = useState(false);
	const [name, setName] = useState("");
	const [slug, setSlug] = useState("");

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

	const { mutate: handleCreate, isPending } = useMutation({
		mutationFn: () => createOrg({ data: { name, slug } }),
		onSuccess: () => {
			refetch();
			setName("");
			setSlug("");
			setCreateOpen(false);
		},
	});

	const openCreateDialog = () => {
		setName("");
		setSlug("");
		setCreateOpen(true);
	};

	return (
		<main className="mx-auto max-w-2xl px-4 py-10">
			<div className="mb-6 flex items-center gap-1">
				<h1 className="text-2xl font-bold">Organizations</h1>
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
				{orgsPending ? (
					SKELETON_ROWS.map((key, i) => (
						<li key={key} className="rounded-lg border border-border px-4 py-3">
							<Skeleton className={i % 2 === 0 ? "h-5 w-1/3" : "h-5 w-1/2"} />
						</li>
					))
				) : (
					<>
						{orgs?.map((org) => (
							<li key={org.id}>
								<Link
									to="/org/$orgId"
									params={{ orgId: org.id }}
									className="block rounded-lg border border-border px-4 py-3 transition-colors hover:bg-muted no-underline text-foreground"
								>
									{org.name}
								</Link>
							</li>
						))}
						{orgs?.length === 0 && (
							<li className="text-muted-foreground text-sm">
								No organizations yet.
							</li>
						)}
					</>
				)}
			</ul>

			<CommandPalette
				open={paletteOpen}
				onOpenChange={setPaletteOpen}
				commands={[
					{
						label: "組織を作成",
						keywords: ["create", "organization", "org", "組織", "作成", "新規"],
						icon: <BuildingIcon />,
						onSelect: openCreateDialog,
					},
				]}
			/>

			<Dialog open={createOpen} onOpenChange={setCreateOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>組織を作成</DialogTitle>
					</DialogHeader>

					<div className="space-y-3">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="org-name">Name</Label>
							<Input
								id="org-name"
								type="text"
								placeholder="My Organization"
								value={name}
								onChange={(e) => setName(e.target.value)}
								autoFocus
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="org-slug">Slug</Label>
							<Input
								id="org-slug"
								type="text"
								placeholder="my-org"
								value={slug}
								onChange={(e) => setSlug(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter" && name.trim() && slug.trim()) {
										handleCreate();
									}
								}}
							/>
						</div>
					</div>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => setCreateOpen(false)}
						>
							キャンセル
						</Button>
						<Button
							type="button"
							disabled={!name.trim() || !slug.trim() || isPending}
							onClick={() => handleCreate()}
						>
							{isPending ? "作成中…" : "作成"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</main>
	);
}
