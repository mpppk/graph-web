import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Switch } from "#/components/ui/switch";
import {
	type CreationTypeSetting,
	listCreationTypeSettings,
	setCreationTypeEnabled,
} from "#/lib/graph-server-fns";
import { uniqueTypeNames } from "./creation-types";
import { useNodeTypes } from "./NodeTypeContext";

export function CreationTypeSettings({
	graphId,
	initialSettings,
}: {
	graphId: string;
	initialSettings: CreationTypeSetting[];
}) {
	const { typeList } = useNodeTypes();
	const qc = useQueryClient();

	const { data: settings = [] } = useQuery({
		queryKey: ["creationTypeSettings", graphId],
		queryFn: () => listCreationTypeSettings({ data: { graphId } }),
		initialData: initialSettings,
	});

	const toggleMut = useMutation({
		mutationFn: (data: { typeName: string; enabled: boolean }) =>
			setCreationTypeEnabled({ data: { graphId, ...data } }),
		onSuccess: () =>
			qc.invalidateQueries({ queryKey: ["creationTypeSettings", graphId] }),
	});

	// Types default to enabled; an override row may flip a name off (or back on).
	const enabledByName = new Map(settings.map((s) => [s.typeName, s.enabled]));
	const names = uniqueTypeNames(typeList);

	return (
		<div className="space-y-2">
			{names.length === 0 && (
				<p className="text-xs text-muted-foreground">タイプなし</p>
			)}
			{names.map((name) => {
				const enabled = enabledByName.get(name) ?? true;
				return (
					<div
						key={name}
						className="flex items-center justify-between gap-2 rounded-md border p-3 text-sm"
					>
						<span className="min-w-0 truncate text-foreground">{name}</span>
						<Switch
							checked={enabled}
							onCheckedChange={(checked) =>
								toggleMut.mutate({ typeName: name, enabled: checked })
							}
							aria-label={`${name} を作成時に選択可能にする`}
						/>
					</div>
				);
			})}
		</div>
	);
}
