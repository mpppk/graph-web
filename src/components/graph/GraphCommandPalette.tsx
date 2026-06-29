import {
	ArrowLeftIcon,
	CheckIcon,
	ChevronRightIcon,
	ClipboardCopyIcon,
	LayoutGridIcon,
	PlusIcon,
	SparklesIcon,
	TagsIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "#/components/ui/command";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";
import type { LayoutAlgorithm } from "./constants";

type Mode = "command" | "ai";

type ChatMessage = {
	role: "user" | "assistant";
	content: string;
};

const AI_PLACEHOLDER_REPLY =
	"AIアシスタント連携は近日対応予定です。今のところコマンド（Copy as Mermaid・タイプ管理・再配置・ノード追加）を実行できます。";

const cmdkClassName =
	"[&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group]]:px-2 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5";

export function GraphCommandPalette({
	open,
	onOpenChange,
	onCopyMermaid,
	onOpenTypeManager,
	onRunLayout,
	onAddNode,
	layoutAlgorithms,
	selectedAlgoId,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onCopyMermaid: () => void;
	onOpenTypeManager: () => void;
	onRunLayout: (algo: LayoutAlgorithm) => void;
	onAddNode: () => void;
	layoutAlgorithms: LayoutAlgorithm[];
	selectedAlgoId: string;
}) {
	const [mode, setMode] = useState<Mode>("command");
	const [pages, setPages] = useState<string[]>([]);
	const [search, setSearch] = useState("");
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const transcriptEndRef = useRef<HTMLDivElement | null>(null);

	const page = pages[pages.length - 1];

	// Reset to a clean state whenever the palette is (re)opened.
	useEffect(() => {
		if (open) {
			setMode("command");
			setPages([]);
			setSearch("");
			setMessages([]);
		}
	}, [open]);

	// Keep the latest chat message in view.
	useEffect(() => {
		if (mode === "ai") {
			transcriptEndRef.current?.scrollIntoView({ block: "end" });
		}
	}, [mode]);

	const runAndClose = (fn: () => void) => {
		fn();
		onOpenChange(false);
	};

	const enterAiMode = () => {
		setMode("ai");
	};

	const backToCommands = () => {
		setMode("command");
		setSearch("");
	};

	const sendAiMessage = () => {
		const text = search.trim();
		if (!text) return;
		setMessages((prev) => [
			...prev,
			{ role: "user", content: text },
			{ role: "assistant", content: AI_PLACEHOLDER_REPLY },
		]);
		setSearch("");
		requestAnimationFrame(() => {
			transcriptEndRef.current?.scrollIntoView({ block: "end" });
		});
	};

	const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (mode === "ai") {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				sendAiMessage();
				return;
			}
			if (e.key === "Escape" || (e.key === "Backspace" && search === "")) {
				e.preventDefault();
				e.stopPropagation();
				backToCommands();
				return;
			}
			return;
		}
		// Command mode: empty Backspace pops a drill-down page.
		if (e.key === "Backspace" && search === "" && pages.length > 0) {
			e.preventDefault();
			setPages((prev) => prev.slice(0, -1));
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogHeader className="sr-only">
				<DialogTitle>コマンドパレット</DialogTitle>
				<DialogDescription>
					コマンドを検索して実行するか、AIに質問します。
				</DialogDescription>
			</DialogHeader>
			<DialogContent className="overflow-hidden p-0" showCloseButton={false}>
				<Command
					className={cmdkClassName}
					shouldFilter={mode === "command"}
					// In AI mode there are no selectable items; keep cmdk from warning.
					loop
				>
					{mode === "ai" && (
						<div className="flex items-center gap-2 border-b px-3 py-2">
							<button
								type="button"
								onClick={backToCommands}
								className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
							>
								<ArrowLeftIcon className="size-3.5" />
								コマンドに戻る
							</button>
							<span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
								<SparklesIcon className="size-3.5" />
								AIに質問
							</span>
						</div>
					)}

					<CommandInput
						placeholder={
							mode === "ai"
								? "AIに質問を入力… (Enterで送信)"
								: "コマンドを検索、またはAIに質問…"
						}
						value={search}
						onValueChange={setSearch}
						onKeyDown={handleInputKeyDown}
					/>

					{mode === "command" ? (
						<CommandList>
							<CommandEmpty>該当するコマンドがありません。</CommandEmpty>

							{page === undefined && (
								<>
									<CommandGroup heading="操作">
										<CommandItem
											keywords={["mermaid", "copy", "コピー", "図"]}
											onSelect={() => runAndClose(onCopyMermaid)}
										>
											<ClipboardCopyIcon />
											Copy as Mermaid
										</CommandItem>
										<CommandItem
											keywords={["type", "タイプ", "管理"]}
											onSelect={() => runAndClose(onOpenTypeManager)}
										>
											<TagsIcon />
											タイプ管理を開く
										</CommandItem>
										<CommandItem
											keywords={["layout", "再配置", "レイアウト", "整列"]}
											onSelect={() => {
												setSearch("");
												setPages((prev) => [...prev, "layout"]);
											}}
										>
											<LayoutGridIcon />
											再配置…
											<ChevronRightIcon className="ml-auto" />
										</CommandItem>
										<CommandItem
											keywords={["add", "node", "追加", "ノード"]}
											onSelect={() => runAndClose(onAddNode)}
										>
											<PlusIcon />
											ノードを追加
										</CommandItem>
									</CommandGroup>

									{/* forceMount the group too: cmdk hides a group whose only
									    child is a forceMounted (non-matching) item, so without
									    this the AI entry vanishes as soon as the query matches
									    no command. */}
									<CommandGroup heading="AI" forceMount>
										<CommandItem
											// Always available regardless of the search text.
											forceMount
											value="__ask_ai__"
											onSelect={enterAiMode}
										>
											<SparklesIcon />
											{search.trim()
												? `AIに質問する: "${search.trim()}"`
												: "AIに質問する"}
										</CommandItem>
									</CommandGroup>
								</>
							)}

							{page === "layout" && (
								<CommandGroup heading="再配置: アルゴリズムを選択">
									{layoutAlgorithms.map((algo) => (
										<CommandItem
											key={algo.id}
											keywords={[algo.label, "layout", "再配置"]}
											onSelect={() => runAndClose(() => onRunLayout(algo))}
										>
											<LayoutGridIcon />
											{algo.label}
											{algo.id === selectedAlgoId && (
												<CheckIcon className="ml-auto" />
											)}
										</CommandItem>
									))}
								</CommandGroup>
							)}
						</CommandList>
					) : (
						<div className="max-h-[300px] overflow-y-auto px-4 py-3">
							{messages.length === 0 ? (
								<p className="text-muted-foreground py-6 text-center text-sm">
									グラフについて質問してみましょう。
								</p>
							) : (
								<div className="flex flex-col gap-3">
									{messages.map((m, i) => (
										<div
											// biome-ignore lint/suspicious/noArrayIndexKey: append-only chat log
											key={i}
											className={
												m.role === "user"
													? "self-end max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
													: "self-start max-w-[85%] rounded-lg bg-muted px-3 py-2 text-sm text-foreground"
											}
										>
											{m.content}
										</div>
									))}
									<div ref={transcriptEndRef} />
								</div>
							)}
						</div>
					)}
				</Command>
			</DialogContent>
		</Dialog>
	);
}
