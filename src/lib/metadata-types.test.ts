import { describe, expect, it } from "vitest";
import {
	isMetadataValueType,
	METADATA_VALUE_TYPES,
	normalizeMetadataValueType,
	validateMetadataValue,
} from "./metadata-types";

describe("validateMetadataValue", () => {
	it("allows empty values for every type", () => {
		for (const type of METADATA_VALUE_TYPES) {
			expect(validateMetadataValue(type, "").ok).toBe(true);
		}
	});

	it("accepts any string", () => {
		expect(validateMetadataValue("string", "hello world").ok).toBe(true);
	});

	describe("number", () => {
		it.each(["0", "42", "-3.14", "1e5"])("accepts %s", (v) => {
			expect(validateMetadataValue("number", v).ok).toBe(true);
		});
		it.each(["abc", "1.2.3", "12px"])("rejects %s", (v) => {
			expect(validateMetadataValue("number", v).ok).toBe(false);
		});
	});

	describe("url", () => {
		it.each(["https://example.com", "http://a.b/c?d=1"])("accepts %s", (v) => {
			expect(validateMetadataValue("url", v).ok).toBe(true);
		});
		it.each([
			"not a url",
			"example.com",
			"ftp://example.com",
		])("rejects %s", (v) => {
			expect(validateMetadataValue("url", v).ok).toBe(false);
		});
	});

	describe("boolean", () => {
		it.each(["true", "false"])("accepts %s", (v) => {
			expect(validateMetadataValue("boolean", v).ok).toBe(true);
		});
		it.each(["yes", "1", "True", "no"])("rejects %s", (v) => {
			expect(validateMetadataValue("boolean", v).ok).toBe(false);
		});
	});

	describe("date", () => {
		it.each(["2026-07-02", "2000-01-01", "2024-02-29"])("accepts %s", (v) => {
			expect(validateMetadataValue("date", v).ok).toBe(true);
		});
		it.each([
			"2026-13-40",
			"2026/07/02",
			"07-02-2026",
			"2023-02-29",
		])("rejects %s", (v) => {
			expect(validateMetadataValue("date", v).ok).toBe(false);
		});
	});
});

describe("isMetadataValueType / normalizeMetadataValueType", () => {
	it("recognizes valid types", () => {
		expect(isMetadataValueType("number")).toBe(true);
		expect(isMetadataValueType("nope")).toBe(false);
		expect(isMetadataValueType(undefined)).toBe(false);
	});

	it("falls back to string for invalid input", () => {
		expect(normalizeMetadataValueType(undefined)).toBe("string");
		expect(normalizeMetadataValueType("bogus")).toBe("string");
		expect(normalizeMetadataValueType("date")).toBe("date");
	});
});
