import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import {
	addNodeTypeField,
	createNodeType,
	deleteNodeType,
	deleteNodeTypeField,
	type NodeTypeWithFields,
	renameNodeType,
} from "#/lib/graph-server-fns";
import { useNodeTypes } from "./NodeTypeContext";

const SCOPE_LABELS: Record<string, string> = {
	user: "ユーザー",
	graph: "このグラフ",
	team: "チーム",
	org: "組織",
};

export function NodeTypeManager({
	graphId,
	orgId,
	teamId,
}: {
	graphId: string;
	orgId?: string;
	teamId?: string;
}) {
	const { typeList } = useNodeTypes();
	const qc = useQueryClient();

	const invalidate = useCallback(
		() => qc.invalidateQueries({ queryKey: ["nodeTypes", graphId] }),
		[qc, graphId],
	);

	// New-type form state.
	const [newName, setNewName] = useState("");
	const [newColor, setNewColor] = useState("#3b82f6");
	const [newScope, setNewScope] = useState<"user" | "graph" | "team" | "org">(
		"user",
	);
	const [newFields, setNewFields] = useState("");

	const createMut = useMutation({
		mutationFn: () =>
			createNodeType({
				data: {
					graphId,
					scope: newScope,
					name: newName.trim(),
					color: newColor,
					fields: newFields
						.split(",")
						.map((s) => s.trim())
						.filter(Boolean),
				},
			}),
		onSuccess: () => {
			setNewName("");
			setNewFields("");
			invalidate();
		},
	});

	const renameMut = useMutation({
		mutationFn: (data: { id: string; name?: string; color?: string }) =>
			renameNodeType({ data }),
		onSuccess: invalidate,
	});

	const deleteMut = useMutation({
		mutationFn: (id: string) => deleteNodeType({ data: { id } }),
		onSuccess: invalidate,
	});

	const addFieldMut = useMutation({
		mutationFn: (data: { nodeTypeId: string; key: string }) =>
			addNodeTypeField({ data }),
		onSuccess: invalidate,
	});

	const deleteFieldMut = useMutation({
		mutationFn: (id: string) => deleteNodeTypeField({ data: { id } }),
		onSuccess: invalidate,
	});

	const handleCreate = useCallback(() => {
		if (!newName.trim() || createMut.isPending) return;
		createMut.mutate();
	}, [newName, createMut]);

	return (
		<div className="space-y-5">
			{/* Create new type */}
			<section className="space-y-2 rounded-md border p-3">
				<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
					新規タイプ
				</p>
				<div className="flex items-center gap-2">
					<input
						type="color"
						value={newColor}
						onChange={(e) => setNewColor(e.target.value)}
						className="h-9 w-9 shrink-0 cursor-pointer rounded border bg-transparent"
						aria-label="Color"
					/>
					<Input
						value={newName}
						placeholder="タイプ名"
						onChange={(e) => setNewName(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") handleCreate();
						}}
						className="text-sm"
					/>
				</div>
				<Select
					value={newScope}
					onValueChange={(v) =>
						setNewScope(v as "user" | "graph" | "team" | "org")
					}
				>
					<SelectTrigger className="w-full">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="user">{SCOPE_LABELS.user}</SelectItem>
						<SelectItem value="graph">{SCOPE_LABELS.graph}</SelectItem>
						{teamId && (
							<SelectItem value="team">{SCOPE_LABELS.team}</SelectItem>
						)}
						{orgId && <SelectItem value="org">{SCOPE_LABELS.org}</SelectItem>}
					</SelectContent>
				</Select>
				<Input
					value={newFields}
					placeholder="メタデータキー (カンマ区切り)"
					onChange={(e) => setNewFields(e.target.value)}
					className="text-sm"
				/>
				<Button
					type="button"
					size="sm"
					className="w-full"
					disabled={!newName.trim() || createMut.isPending}
					onClick={handleCreate}
				>
					追加
				</Button>
			</section>

			{/* Existing types */}
			<section className="space-y-3">
				<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
					既存タイプ
				</p>
				{typeList.length === 0 && (
					<p className="text-xs text-muted-foreground">タイプなし</p>
				)}
				{typeList.map((t) => (
					<NodeTypeRow
						key={t.id}
						type={t}
						scopeLabel={SCOPE_LABELS[t.scope] ?? t.scope}
						onColorChange={(color) => renameMut.mutate({ id: t.id, color })}
						onRename={(name) => renameMut.mutate({ id: t.id, name })}
						onDelete={() => deleteMut.mutate(t.id)}
						onAddField={(key) => addFieldMut.mutate({ nodeTypeId: t.id, key })}
						onDeleteField={(id) => deleteFieldMut.mutate(id)}
					/>
				))}
			</section>
		</div>
	);
}

function NodeTypeRow({
	type,
	scopeLabel,
	onColorChange,
	onRename,
	onDelete,
	onAddField,
	onDeleteField,
}: {
	type: NodeTypeWithFields;
	scopeLabel: string;
	onColorChange: (color: string) => void;
	onRename: (name: string) => void;
	onDelete: () => void;
	onAddField: (key: string) => void;
	onDeleteField: (id: string) => void;
}) {
	const [nameDraft, setNameDraft] = useState(type.name);
	const [newField, setNewField] = useState("");

	const commitName = () => {
		const trimmed = nameDraft.trim();
		if (trimmed && trimmed !== type.name) onRename(trimmed);
		else setNameDraft(type.name);
	};

	const commitField = () => {
		const k = newField.trim();
		if (!k) return;
		onAddField(k);
		setNewField("");
	};

	return (
		<div className="space-y-2 rounded-md border p-3">
			<div className="flex items-center gap-2">
				<input
					type="color"
					value={type.color}
					onChange={(e) => onColorChange(e.target.value)}
					className="h-8 w-8 shrink-0 cursor-pointer rounded border bg-transparent"
					aria-label="Color"
				/>
				<Input
					value={nameDraft}
					onChange={(e) => setNameDraft(e.target.value)}
					onBlur={commitName}
					onKeyDown={(e) => {
						if (e.key === "Enter") commitName();
						if (e.key === "Escape") setNameDraft(type.name);
					}}
					className="h-8 text-sm"
				/>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="h-8 w-8 shrink-0 text-destructive"
					onClick={onDelete}
					aria-label="Delete type"
				>
					🗑
				</Button>
			</div>
			<p className="text-[10px] uppercase tracking-wide text-muted-foreground">
				{scopeLabel}
			</p>

			<div className="space-y-1">
				{type.fields.map((f) => (
					<div key={f.id} className="flex items-center gap-2">
						<span className="flex-1 truncate rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
							{f.key}
						</span>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="h-6 w-6 shrink-0"
							onClick={() => onDeleteField(f.id)}
							aria-label="Delete field"
						>
							✕
						</Button>
					</div>
				))}
				<div className="flex items-center gap-2">
					<Input
						value={newField}
						placeholder="メタデータキーを追加"
						onChange={(e) => setNewField(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") commitField();
						}}
						className="h-7 text-xs"
					/>
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="h-7 shrink-0"
						onClick={commitField}
					>
						+
					</Button>
				</div>
			</div>
		</div>
	);
}
