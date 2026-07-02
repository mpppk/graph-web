import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Node as RFNode } from "@xyflow/react";
import { useCallback, useEffect, useRef, useState } from "react";
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
	deleteNodeMetadata,
	listNodeMetadata,
	upsertNodeMetadata,
} from "#/lib/graph-server-fns";
import {
	DEFAULT_METADATA_VALUE_TYPE,
	METADATA_VALUE_TYPE_LABELS,
	METADATA_VALUE_TYPES,
	type MetadataValueType,
	validateMetadataValue,
} from "#/lib/metadata-types";
import { useNodeTypes } from "./NodeTypeContext";

// Selector for a metadata value type (種別).
function TypeSelect({
	value,
	onChange,
	disabled,
	className,
}: {
	value: MetadataValueType;
	onChange: (v: MetadataValueType) => void;
	disabled?: boolean;
	className?: string;
}) {
	return (
		<Select
			value={value}
			disabled={disabled}
			onValueChange={(v) => onChange(v as MetadataValueType)}
		>
			<SelectTrigger className={className}>
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{METADATA_VALUE_TYPES.map((t) => (
					<SelectItem key={t} value={t}>
						{METADATA_VALUE_TYPE_LABELS[t]}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

// Value input control that adapts to the selected type.
function MetadataValueInput({
	type,
	value,
	onChange,
	onEnter,
	onEscape,
	onBlur,
	inputRef,
	className,
}: {
	type: MetadataValueType;
	value: string;
	onChange: (v: string) => void;
	onEnter?: () => void;
	onEscape?: () => void;
	onBlur?: () => void;
	inputRef?: React.Ref<HTMLInputElement>;
	className?: string;
}) {
	if (type === "boolean") {
		return (
			<Select value={value === "" ? undefined : value} onValueChange={onChange}>
				<SelectTrigger className={className}>
					<SelectValue placeholder="真偽値" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="true">はい (true)</SelectItem>
					<SelectItem value="false">いいえ (false)</SelectItem>
				</SelectContent>
			</Select>
		);
	}
	const inputType =
		type === "number" ? "number" : type === "date" ? "date" : "text";
	return (
		<Input
			ref={inputRef}
			type={inputType}
			value={value}
			placeholder={type === "url" ? "https://..." : "value"}
			onChange={(e) => onChange(e.target.value)}
			onBlur={onBlur}
			onKeyDown={(e) => {
				if (e.key === "Enter") onEnter?.();
				if (e.key === "Escape") onEscape?.();
			}}
			className={className}
		/>
	);
}

// Read-only display of a metadata value, formatted by type.
function MetadataValueDisplay({
	type,
	value,
}: {
	type: MetadataValueType;
	value: string;
}) {
	if (value === "") {
		return <span className="italic text-muted-foreground">（空）</span>;
	}
	if (type === "url") {
		return (
			<a
				href={value}
				target="_blank"
				rel="noopener noreferrer"
				className="truncate text-primary underline hover:no-underline"
				onClick={(e) => e.stopPropagation()}
			>
				{value}
			</a>
		);
	}
	if (type === "boolean") {
		return <span>{value === "true" ? "はい" : "いいえ"}</span>;
	}
	return <span>{value}</span>;
}

export function NodeSidePanel({
	nodeId,
	nodes,
	onClose,
	onDeleteNode,
	onUpdateNodeType,
	onUpdateNodeLabel,
	readOnly = false,
}: {
	nodeId: string;
	nodes: RFNode[];
	onClose: () => void;
	onDeleteNode: (id: string) => void;
	onUpdateNodeType: (nodeId: string, nodeType: string | null) => void;
	onUpdateNodeLabel: (nodeId: string, label: string) => void;
	readOnly?: boolean;
}) {
	const { typeList } = useNodeTypes();
	const qc = useQueryClient();
	const node = nodes.find((n) => n.id === nodeId);
	const label = node ? (node.data.label as string) : "";
	const currentNodeType = node
		? ((node.data.nodeType as string | null | undefined) ?? "")
		: "";

	const { data: metadata = [] } = useQuery({
		queryKey: ["metadata", nodeId],
		queryFn: () => listNodeMetadata({ data: { nodeId } }),
		enabled: !!nodeId,
	});

	const upsertMeta = useMutation({
		mutationFn: ({
			key,
			value,
			valueType,
		}: {
			key: string;
			value: string;
			valueType: MetadataValueType;
		}) => upsertNodeMetadata({ data: { nodeId, key, value, valueType } }),
		onSuccess: () => qc.invalidateQueries({ queryKey: ["metadata", nodeId] }),
	});

	const deleteMeta = useMutation({
		mutationFn: (id: string) => deleteNodeMetadata({ data: { id } }),
		onSuccess: () => qc.invalidateQueries({ queryKey: ["metadata", nodeId] }),
	});

	const [newKey, setNewKey] = useState("");
	const [newValue, setNewValue] = useState("");
	const [newType, setNewType] = useState<MetadataValueType>(
		DEFAULT_METADATA_VALUE_TYPE,
	);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editDraft, setEditDraft] = useState("");
	const [editType, setEditType] = useState<MetadataValueType>(
		DEFAULT_METADATA_VALUE_TYPE,
	);
	const editInputRef = useRef<HTMLInputElement>(null);

	const [labelEditing, setLabelEditing] = useState(false);
	const [labelDraft, setLabelDraft] = useState("");
	const labelInputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (editingId) editInputRef.current?.focus();
	}, [editingId]);

	useEffect(() => {
		if (labelEditing) {
			labelInputRef.current?.focus();
			labelInputRef.current?.select();
		}
	}, [labelEditing]);

	const handleLabelEditStart = useCallback(() => {
		setLabelDraft(label);
		setLabelEditing(true);
	}, [label]);

	const handleLabelCommit = useCallback(() => {
		const trimmed = labelDraft.trim();
		if (trimmed && trimmed !== label) {
			onUpdateNodeLabel(nodeId, trimmed);
		}
		setLabelEditing(false);
	}, [labelDraft, label, nodeId, onUpdateNodeLabel]);

	const newValidation = validateMetadataValue(newType, newValue.trim());
	const editValidation = validateMetadataValue(editType, editDraft.trim());

	const handleAddMeta = useCallback(() => {
		const k = newKey.trim();
		const v = newValue.trim();
		if (!k) return;
		if (!validateMetadataValue(newType, v).ok) return;
		upsertMeta.mutate({ key: k, value: v, valueType: newType });
		setNewKey("");
		setNewValue("");
		setNewType(DEFAULT_METADATA_VALUE_TYPE);
	}, [newKey, newValue, newType, upsertMeta]);

	const handleEditStart = useCallback(
		(id: string, value: string, valueType: MetadataValueType) => {
			setEditingId(id);
			setEditDraft(value);
			setEditType(valueType);
		},
		[],
	);

	const handleEditCommit = useCallback(
		(key: string) => {
			const v = editDraft.trim();
			if (!validateMetadataValue(editType, v).ok) return;
			upsertMeta.mutate({ key, value: v, valueType: editType });
			setEditingId(null);
		},
		[editDraft, editType, upsertMeta],
	);

	if (!node) return null;

	return (
		<aside className="fixed inset-x-0 bottom-0 z-20 flex max-h-[60vh] flex-col rounded-t-xl border-t bg-card shadow-lg md:static md:z-auto md:max-h-none md:w-72 md:flex-shrink-0 md:rounded-none md:border-t-0 md:border-l md:shadow-none">
			<div className="flex items-center justify-between border-b px-4 py-3">
				<span className="text-sm font-semibold text-foreground">Node</span>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="h-7 w-7"
					onClick={onClose}
					aria-label="Close panel"
				>
					✕
				</Button>
			</div>

			<div className="flex-1 overflow-y-auto p-4 space-y-5">
				<section>
					<p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
						Label
					</p>
					{readOnly ? (
						<div className="w-full rounded-md border bg-muted px-3 py-2 text-left text-sm text-foreground">
							{label}
						</div>
					) : labelEditing ? (
						<Input
							ref={labelInputRef}
							value={labelDraft}
							onChange={(e) => setLabelDraft(e.target.value)}
							onBlur={handleLabelCommit}
							onKeyDown={(e) => {
								if (e.key === "Enter") handleLabelCommit();
								if (e.key === "Escape") setLabelEditing(false);
							}}
							className="text-sm"
						/>
					) : (
						<button
							type="button"
							className="w-full rounded-md border bg-muted px-3 py-2 text-left text-sm text-foreground hover:bg-accent"
							onClick={handleLabelEditStart}
							title="クリックして編集"
						>
							{label}
						</button>
					)}
				</section>

				<section>
					<p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
						タイプ
					</p>
					<Select
						value={currentNodeType || "__none__"}
						disabled={readOnly}
						onValueChange={(val) => {
							onUpdateNodeType(nodeId, val === "__none__" ? null : val);
						}}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="__none__">なし</SelectItem>
							{[...new Set(typeList.map((t) => t.name))].map((name) => (
								<SelectItem key={name} value={name}>
									{name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</section>

				<section>
					<p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
						Metadata
					</p>

					{metadata.length === 0 && (
						<p className="text-xs text-muted-foreground">メタデータなし</p>
					)}

					<ul className="space-y-2">
						{metadata.map((m) => {
							const valueType = m.valueType as MetadataValueType;
							return (
								<li key={m.id} className="flex items-start gap-2">
									<span className="mt-1 flex w-24 shrink-0 flex-col gap-0.5">
										<span className="truncate rounded bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
											{m.key}
										</span>
										<span className="px-1 text-[10px] text-muted-foreground">
											{METADATA_VALUE_TYPE_LABELS[valueType]}
										</span>
									</span>
									{readOnly ? (
										<span className="mt-1 flex-1 truncate px-2 py-1 text-left text-xs text-foreground">
											<MetadataValueDisplay type={valueType} value={m.value} />
										</span>
									) : editingId === m.id ? (
										<div className="flex flex-1 flex-col gap-1">
											<TypeSelect
												value={editType}
												onChange={setEditType}
												className="h-7 w-full text-xs"
											/>
											<MetadataValueInput
												type={editType}
												value={editDraft}
												onChange={setEditDraft}
												inputRef={editInputRef}
												onEnter={() => handleEditCommit(m.key)}
												onEscape={() => setEditingId(null)}
												className="h-7 w-full text-xs"
											/>
											{!editValidation.ok && (
												<p className="text-[10px] text-destructive">
													{editValidation.error}
												</p>
											)}
											<div className="flex gap-1">
												<Button
													type="button"
													variant="secondary"
													size="sm"
													onClick={() => handleEditCommit(m.key)}
													disabled={!editValidation.ok}
													className="h-6 text-xs"
												>
													保存
												</Button>
												<Button
													type="button"
													variant="ghost"
													size="sm"
													onClick={() => setEditingId(null)}
													className="h-6 text-xs"
												>
													キャンセル
												</Button>
											</div>
										</div>
									) : (
										<button
											type="button"
											className="mt-1 flex-1 truncate rounded px-2 py-1 text-left text-xs text-foreground hover:bg-accent"
											onClick={() => handleEditStart(m.id, m.value, valueType)}
											title="クリックして編集"
										>
											<MetadataValueDisplay type={valueType} value={m.value} />
										</button>
									)}
									{!readOnly && editingId !== m.id && (
										<Button
											type="button"
											variant="ghost"
											size="icon"
											onClick={() => deleteMeta.mutate(m.id)}
											className="mt-1 h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
											aria-label="Delete metadata"
										>
											✕
										</Button>
									)}
								</li>
							);
						})}
					</ul>

					{!readOnly && (
						<div className="mt-3 flex flex-col gap-2">
							<div className="flex gap-2">
								<Input
									value={newKey}
									onChange={(e) => setNewKey(e.target.value)}
									placeholder="key"
									className="h-7 w-24 shrink-0 text-xs"
									onKeyDown={(e) => {
										if (e.key === "Enter") handleAddMeta();
									}}
								/>
								<TypeSelect
									value={newType}
									onChange={setNewType}
									className="h-7 flex-1 text-xs"
								/>
							</div>
							<div className="flex gap-2">
								<MetadataValueInput
									type={newType}
									value={newValue}
									onChange={setNewValue}
									onEnter={handleAddMeta}
									className="h-7 flex-1 text-xs"
								/>
								<Button
									type="button"
									variant="secondary"
									size="sm"
									onClick={handleAddMeta}
									disabled={!newKey.trim() || !newValidation.ok}
									className="h-7 shrink-0 text-xs"
								>
									追加
								</Button>
							</div>
							{!newValidation.ok && (
								<p className="text-[10px] text-destructive">
									{newValidation.error}
								</p>
							)}
						</div>
					)}
				</section>
			</div>

			{!readOnly && (
				<div className="border-t p-4">
					<Button
						type="button"
						variant="destructive"
						className="w-full"
						onClick={() => onDeleteNode(nodeId)}
					>
						Delete Node
					</Button>
				</div>
			)}
		</aside>
	);
}
