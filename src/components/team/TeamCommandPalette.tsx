import { ArrowLeftIcon, SettingsIcon, SparklesIcon } from "lucide-react";
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
import { useKeyboardInset } from "#/lib/useKeyboardInset";

type Mode = "command" | "ai";

type ChatMessage = {
	role: "user" | "assistant";
	content: string;
};

const AI_PLACEHOLDER_REPLY =
	"AIアシスタント連携は近日対応予定です。今のところコマンド（チーム設定）を実行できます。";

const cmdkClassName =
	"[&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group]]:px-2 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5";

export function TeamCommandPalette({
	open,
	onOpenChange,
	onOpenSettings,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onOpenSettings: () => void;
}) {
	const [mode, setMode] = useState<Mode>("command");
	const [search, setSearch] = useState("");
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const transcriptEndRef = useRef<HTMLDivElement | null>(null);

	const keyboardInset = useKeyboardInset(open);

	useEffect(() => {
		if (open) {
			setMode("command");
			setSearch("");
			setMessages([]);
		}
	}, [open]);

	useEffect(() => {
		if (mode === "ai") {
			transcriptEndRef.current?.scrollIntoView({ block: "end" });
		}
	}, [mode]);

	const runAndClose = (fn: () => void) => {
		fn();
		onOpenChange(false);
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
			<DialogContent
				className="overflow-hidden p-0 max-sm:top-auto max-sm:bottom-[var(--cmdk-kb-inset)] max-sm:translate-y-0"
				style={
					{ "--cmdk-kb-inset": `${keyboardInset}px` } as React.CSSProperties
				}
				showCloseButton={false}
			>
				<Command
					className={cmdkClassName}
					shouldFilter={mode === "command"}
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

							<CommandGroup heading="操作">
								<CommandItem
									keywords={["settings", "設定", "type", "タイプ", "管理"]}
									onSelect={() => runAndClose(onOpenSettings)}
								>
									<SettingsIcon />
									チーム設定を開く
								</CommandItem>
							</CommandGroup>

							<CommandGroup heading="AI" forceMount>
								<CommandItem
									forceMount
									value="__ask_ai__"
									onSelect={() => setMode("ai")}
								>
									<SparklesIcon />
									{search.trim()
										? `AIに質問する: "${search.trim()}"`
										: "AIに質問する"}
								</CommandItem>
							</CommandGroup>
						</CommandList>
					) : (
						<div className="max-h-[300px] overflow-y-auto px-4 py-3">
							{messages.length === 0 ? (
								<p className="text-muted-foreground py-6 text-center text-sm">
									チームについて質問してみましょう。
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
