import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { Button } from "#/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Switch } from "#/components/ui/switch";
import { Textarea } from "#/components/ui/textarea";
import {
	addTemplateNodeType,
	createTemplate,
	deleteTemplate,
	listSelectableNodeTypes,
	listTemplatesForOrg,
	listTemplatesForTeam,
	removeTemplateNodeType,
	renameTemplate,
	type TemplateWithNodeTypes,
	updateTemplateDescription,
} from "#/lib/graph-server-fns";

// Manage graph templates for an org or a team. A template groups an allowlist
// of node types (chosen from the owner's scope) that becomes the selectable set
// when a graph is created from it.
export function TemplateManager({
	ownerType,
	ownerId,
}: {
	ownerType: "org" | "team";
	ownerId: string;
}) {
	const qc = useQueryClient();
	const queryKey = useMemo(
		() => ["templates", ownerType, ownerId],
		[ownerType, ownerId],
	);

	const invalidate = useCallback(
		() => qc.invalidateQueries({ queryKey }),
		[qc, queryKey],
	);

	const { data: templates = [] } = useQuery({
		queryKey,
		queryFn: () =>
			ownerType === "team"
				? listTemplatesForTeam({ data: { teamId: ownerId } })
				: listTemplatesForOrg({ data: { orgId: ownerId } }),
	});

	const [newName, setNewName] = useState("");
	const [newDescription, setNewDescription] = useState("");
	const [dialogOpen, setDialogOpen] = useState(false);

	const createMut = useMutation({
		mutationFn: () =>
			createTemplate({
				data: {
					ownerType,
					ownerId,
					name: newName.trim(),
					description: newDescription.trim(),
				},
			}),
		onSuccess: () => {
			setNewName("");
			setNewDescription("");
			setDialogOpen(false);
			invalidate();
		},
	});

	const renameMut = useMutation({
		mutationFn: (data: { id: string; name: string }) =>
			renameTemplate({ data }),
		onSuccess: invalidate,
	});

	const describeMut = useMutation({
		mutationFn: (data: { id: string; description: string }) =>
			updateTemplateDescription({ data }),
		onSuccess: invalidate,
	});

	const deleteMut = useMutation({
		mutationFn: (id: string) => deleteTemplate({ data: { id } }),
		onSuccess: invalidate,
	});

	const handleCreate = useCallback(() => {
		if (!newName.trim() || createMut.isPending) return;
		createMut.mutate();
	}, [newName, createMut]);

	const handleOpenChange = (open: boolean) => {
		if (!open) {
			setNewName("");
			setNewDescription("");
		}
		setDialogOpen(open);
	};

	return (
		<div className="space-y-3">
			{templates.length === 0 && (
				<p className="text-xs text-muted-foreground">テンプレートなし</p>
			)}
			{templates.map((t) => (
				<TemplateRow
					key={t.id}
					template={t}
					onRename={(name) => renameMut.mutate({ id: t.id, name })}
					onDescribe={(description) =>
						describeMut.mutate({ id: t.id, description })
					}
					onDelete={() => deleteMut.mutate(t.id)}
					onChanged={invalidate}
				/>
			))}

			<Button
				type="button"
				variant="outline"
				size="sm"
				className="w-full"
				onClick={() => setDialogOpen(true)}
			>
				+ テンプレートを追加
			</Button>

			<Dialog open={dialogOpen} onOpenChange={handleOpenChange}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>新規テンプレート</DialogTitle>
					</DialogHeader>

					<Input
						value={newName}
						placeholder="テンプレート名"
						onChange={(e) => setNewName(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") handleCreate();
						}}
						className="text-sm"
						autoFocus
					/>

					<Textarea
						value={newDescription}
						placeholder="既定の説明（任意）"
						onChange={(e) => setNewDescription(e.target.value)}
						className="text-sm"
						rows={3}
					/>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => handleOpenChange(false)}
						>
							キャンセル
						</Button>
						<Button
							type="button"
							disabled={!newName.trim() || createMut.isPending}
							onClick={handleCreate}
						>
							追加
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}

function TemplateRow({
	template,
	onRename,
	onDescribe,
	onDelete,
	onChanged,
}: {
	template: TemplateWithNodeTypes;
	onRename: (name: string) => void;
	onDescribe: (description: string) => void;
	onDelete: () => void;
	onChanged: () => void;
}) {
	const [nameDraft, setNameDraft] = useState(template.name);
	const [descriptionDraft, setDescriptionDraft] = useState(
		template.description,
	);
	const [expanded, setExpanded] = useState(false);

	const selectedIds = new Set(template.nodeTypes.map((nt) => nt.id));

	const { data: selectable = [] } = useQuery({
		queryKey: ["templateSelectable", template.id],
		queryFn: () =>
			listSelectableNodeTypes({ data: { templateId: template.id } }),
		enabled: expanded,
	});

	const addMut = useMutation({
		mutationFn: (nodeTypeId: string) =>
			addTemplateNodeType({ data: { templateId: template.id, nodeTypeId } }),
		onSuccess: onChanged,
	});

	const removeMut = useMutation({
		mutationFn: (nodeTypeId: string) =>
			removeTemplateNodeType({ data: { templateId: template.id, nodeTypeId } }),
		onSuccess: onChanged,
	});

	const commitName = () => {
		const trimmed = nameDraft.trim();
		if (trimmed && trimmed !== template.name) onRename(trimmed);
		else setNameDraft(template.name);
	};

	const commitDescription = () => {
		if (descriptionDraft !== template.description) onDescribe(descriptionDraft);
	};

	return (
		<div className="space-y-2 rounded-md border p-3">
			<div className="flex items-center gap-2">
				<Input
					value={nameDraft}
					onChange={(e) => setNameDraft(e.target.value)}
					onBlur={commitName}
					onKeyDown={(e) => {
						if (e.key === "Enter") commitName();
						if (e.key === "Escape") setNameDraft(template.name);
					}}
					className="h-8 text-sm"
				/>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="h-8 shrink-0"
					onClick={() => setExpanded((v) => !v)}
				>
					{expanded ? "閉じる" : "ノードタイプ"}
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="h-8 w-8 shrink-0 text-destructive"
					onClick={onDelete}
					aria-label="Delete template"
				>
					🗑
				</Button>
			</div>
			<Textarea
				value={descriptionDraft}
				placeholder="既定の説明（任意）"
				onChange={(e) => setDescriptionDraft(e.target.value)}
				onBlur={commitDescription}
				className="text-sm"
				rows={2}
			/>
			<p className="text-[10px] uppercase tracking-wide text-muted-foreground">
				{selectedIds.size} タイプ
			</p>

			{expanded && (
				<div className="space-y-1">
					{selectable.length === 0 && (
						<p className="text-xs text-muted-foreground">
							選択できるノードタイプがありません
						</p>
					)}
					{selectable.map((nt) => (
						<div
							key={nt.id}
							className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm"
						>
							<span className="flex min-w-0 items-center gap-2">
								<span
									className="inline-block size-3 shrink-0 rounded"
									style={{ backgroundColor: nt.color }}
								/>
								<span className="truncate text-foreground">{nt.name}</span>
							</span>
							<Switch
								checked={selectedIds.has(nt.id)}
								disabled={addMut.isPending || removeMut.isPending}
								onCheckedChange={(checked) =>
									checked ? addMut.mutate(nt.id) : removeMut.mutate(nt.id)
								}
								aria-label={`${nt.name} をテンプレートに含める`}
							/>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
