// Metadata value types (種別). Shared source of truth between the server
// (validation on save) and the client (input controls, display, validation).

export const METADATA_VALUE_TYPES = [
	"string",
	"number",
	"url",
	"boolean",
	"date",
] as const;

export type MetadataValueType = (typeof METADATA_VALUE_TYPES)[number];

export const DEFAULT_METADATA_VALUE_TYPE: MetadataValueType = "string";

// Japanese display labels for each type.
export const METADATA_VALUE_TYPE_LABELS: Record<MetadataValueType, string> = {
	string: "文字列",
	number: "数値",
	url: "URL",
	boolean: "真偽値",
	date: "日付",
};

export function isMetadataValueType(v: unknown): v is MetadataValueType {
	return (
		typeof v === "string" &&
		(METADATA_VALUE_TYPES as readonly string[]).includes(v)
	);
}

// Normalize/coerce the incoming type, falling back to the default.
export function normalizeMetadataValueType(v: unknown): MetadataValueType {
	return isMetadataValueType(v) ? v : DEFAULT_METADATA_VALUE_TYPE;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type ValidationResult = { ok: true } | { ok: false; error: string };

// Validate a stored (string) value against its declared type. Empty values are
// always allowed (metadata may be created empty, e.g. from node-type templates).
export function validateMetadataValue(
	type: MetadataValueType,
	value: string,
): ValidationResult {
	if (value === "") return { ok: true };

	switch (type) {
		case "string":
			return { ok: true };
		case "number":
			return Number.isFinite(Number(value))
				? { ok: true }
				: { ok: false, error: "数値を入力してください" };
		case "url": {
			try {
				const url = new URL(value);
				if (url.protocol !== "http:" && url.protocol !== "https:") {
					return { ok: false, error: "http/https のURLを入力してください" };
				}
				return { ok: true };
			} catch {
				return { ok: false, error: "有効なURLを入力してください" };
			}
		}
		case "boolean":
			return value === "true" || value === "false"
				? { ok: true }
				: { ok: false, error: "真偽値が不正です" };
		case "date": {
			if (!DATE_RE.test(value)) {
				return { ok: false, error: "YYYY-MM-DD 形式で入力してください" };
			}
			const t = Date.parse(value);
			if (Number.isNaN(t)) {
				return { ok: false, error: "有効な日付を入力してください" };
			}
			// Guard against overflow (e.g. 2026-13-40 parsing to another date).
			const [y, m, d] = value.split("-").map(Number);
			const dt = new Date(Date.UTC(y, m - 1, d));
			if (
				dt.getUTCFullYear() !== y ||
				dt.getUTCMonth() !== m - 1 ||
				dt.getUTCDate() !== d
			) {
				return { ok: false, error: "有効な日付を入力してください" };
			}
			return { ok: true };
		}
		default:
			return { ok: true };
	}
}
