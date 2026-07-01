import type { Edge as RFEdge } from "@xyflow/react";
import { useEffect, useState } from "react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";

export function EdgeSidePanel({
	edgeId,
	edges,
	onClose,
	onDeleteEdge,
	onUpdateLabel,
	readOnly = false,
}: {
	edgeId: string;
	edges: RFEdge[];
	onClose: () => void;
	onDeleteEdge: (id: string) => void;
	onUpdateLabel: (edgeId: string, label: string) => void;
	readOnly?: boolean;
}) {
	const edge = edges.find((e) => e.id === edgeId);
	const currentLabel = (edge?.data?.label as string) ?? "";
	const [draft, setDraft] = useState(currentLabel);

	useEffect(() => {
		setDraft(currentLabel);
	}, [currentLabel]);

	if (!edge) return null;

	const handleCommit = () => {
		if (draft !== currentLabel) {
			onUpdateLabel(edgeId, draft);
		}
	};

	return (
		<aside className="fixed inset-x-0 bottom-0 z-20 flex max-h-[60vh] flex-col rounded-t-xl border-t bg-card shadow-lg md:static md:z-auto md:max-h-none md:w-72 md:flex-shrink-0 md:rounded-none md:border-t-0 md:border-l md:shadow-none">
			<div className="flex items-center justify-between border-b px-4 py-3">
				<span className="text-sm font-semibold text-foreground">Edge</span>
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
						<div className="rounded-md border bg-muted px-3 py-2 text-sm text-foreground">
							{currentLabel || (
								<span className="italic text-muted-foreground">
									（ラベルなし）
								</span>
							)}
						</div>
					) : (
						<>
							<Input
								value={draft}
								onChange={(e) => setDraft(e.target.value)}
								onBlur={handleCommit}
								onKeyDown={(e) => {
									if (e.key === "Enter") handleCommit();
								}}
								placeholder="エッジラベルを入力..."
							/>
							<p className="mt-1 text-xs text-muted-foreground">
								ラベルをダブルクリックでキャンバス上から編集
							</p>
						</>
					)}
				</section>
			</div>

			{!readOnly && (
				<div className="border-t p-4">
					<Button
						type="button"
						variant="destructive"
						className="w-full"
						onClick={() => onDeleteEdge(edgeId)}
					>
						Delete Edge
					</Button>
				</div>
			)}
		</aside>
	);
}
