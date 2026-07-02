import { GroupIcon } from "lucide-react";
import { Button } from "#/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { uniqueTypeNames } from "./creation-types";
import { useNodeTypes } from "./NodeTypeContext";

// Per-node-type toggle for rendering that type's nodes as a React Flow subgraph.
// The selection is ephemeral canvas state managed by the parent.
export function SubgraphSettings({
	subgraphTypes,
	onToggle,
}: {
	subgraphTypes: Set<string>;
	onToggle: (typeName: string, enabled: boolean) => void;
}) {
	const { typeList } = useNodeTypes();
	const names = uniqueTypeNames(typeList);
	const active = subgraphTypes.size > 0;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					type="button"
					variant={active ? "secondary" : "ghost"}
					size="icon"
					className="size-8"
					aria-label="サブグラフ表示"
					aria-pressed={active}
					title="ノードタイプごとにサブグラフ化"
				>
					<GroupIcon />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start">
				<DropdownMenuLabel>サブグラフ化するタイプ</DropdownMenuLabel>
				<DropdownMenuSeparator />
				{names.length === 0 ? (
					<DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
						タイプなし
					</DropdownMenuLabel>
				) : (
					names.map((name) => (
						<DropdownMenuCheckboxItem
							key={name}
							checked={subgraphTypes.has(name)}
							// Keep the menu open while toggling multiple types.
							onSelect={(e) => e.preventDefault()}
							onCheckedChange={(checked) => onToggle(name, checked)}
						>
							{name}
						</DropdownMenuCheckboxItem>
					))
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
