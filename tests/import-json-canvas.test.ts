// Author-generated synthetic boards exercising JSON Canvas 1.0; no external fixture data.
import { describe, expect, it, vi } from "vitest";

import { assertImportedBoard, idFactory } from "../src/importers/board-builder";
import { jsonCanvasAdapter } from "../src/importers/json-canvas";
import {
	ImportError,
	MAX_IMPORT_ELEMENTS,
	MAX_IMPORT_ENTRIES,
	MAX_IMPORT_SOURCE_LENGTH,
	type ImportContext,
	type ImportSource,
} from "../src/importers/types";
import { validateMiroCanvasMetadata } from "../src/metadata";

type UnknownRecord = Record<string, unknown>;
const textNode = { id: "text", type: "text", text: "Привет [[Note]]\n\`\`\`ts\nconst x = 1;\n\`\`\`", x: -100, y: -20, width: 240, height: 120 };

function source(value: UnknownRecord): ImportSource {
	return { path: "Boards/Source.canvas", extension: "canvas", text: JSON.stringify(value) };
}

function context(): ImportContext {
	return {
		importerVersion: "9.9.9",
		now: "2026-10-11T00:00:00.000Z",
		newId: idFactory(41),
		resolveLink: () => undefined,
	};
}

function copy(value: UnknownRecord, importContext = context()) {
	return jsonCanvasAdapter.convert(source(value), importContext);
}

function failure(importSource: ImportSource, reason: string): void {
	let thrown: unknown;
	try {
		jsonCanvasAdapter.convert(importSource, context());
	} catch (error) {
		thrown = error;
	}
	expect(thrown).toBeInstanceOf(ImportError);
	expect((thrown as ImportError).reason).toBe(reason);
}

describe("JSON Canvas copy detection", () => {
	it.each([{}, { nodes: [] }, { edges: [] }, { nodes: [], edges: [] }])("accepts optional arrays: %j", (document) => {
		expect(jsonCanvasAdapter.detect(source(document))).toBe(true);
		expect(copy(document).document).toEqual({ ...document, nodes: [], edges: [] });
	});

	it("only recognises Canvas sources, with bounded valid top-level JSON", () => {
		expect(jsonCanvasAdapter.detect({ ...source({}), extension: "md" })).toBe(false);
		for (const text of ["", "{", "null", "[]", "42", '{"nodes":null}', '{"edges":{}}']) {
			expect(jsonCanvasAdapter.detect({ ...source({}), text })).toBe(false);
		}
	});

	it.each([{ nodes: null }, { edges: {} }, { nodes: "cards" }, { edges: false }])("rejects malformed arrays: %j", (document) => {
		failure(source(document), "unknownStructure");
	});

	it("reports unreadable JSON separately from an unknown root", () => {
		failure({ ...source({}), text: "{" }, "unreadableData");
		failure({ ...source({}), text: "[]" }, "unknownStructure");
	});
});

describe("JSON Canvas native copy", () => {
	it("copies all four card kinds, optional edge fields, z-order and unknown fields at every level", () => {
		const document = {
			customRoot: { arbitrary: [1, { keep: true }] },
			metadata: { version: "foreign", frontmatter: { tags: ["board"], nested: { keep: true } } },
			miroSource: { items: [{ id: "evidence", future: { untouched: true } }] },
			miroCanvas: { schemaVersion: 1, future: { keep: true }, localOverrides: { text: { typography: { fontSize: 18 } } } },
			nodes: [
				{ id: "group", type: "group", x: -200, y: -200, width: 1000, height: 700, label: "Frame", background: "Images/Back.png", backgroundStyle: "ratio", future: { a: [1] } },
				{ ...textNode, color: "#aAbBcC", custom: { a: { b: true } } },
				{ id: "file", type: "file", file: "Notes/Note.md", subpath: "#Heading", x: 200, y: 0, width: 200, height: 200 },
				{ id: "link", type: "link", url: "https://example.org", x: 500, y: 0, width: 300, height: 200, color: "6" },
			],
			edges: [
				{ id: "edge", fromNode: "text", toNode: "file", custom: { native: ["kept"] } },
				{ id: "edge2", fromNode: "link", toNode: "text", fromSide: "left", toSide: "right", fromEnd: "arrow", toEnd: "none", color: "1", label: "Связь" },
			],
		};
		const importContext = { ...context(), resolveLink: vi.fn((link: string) => link) };
		const result = copy(document, importContext);
		expect(result.document).toEqual(document);
		expect(result.report.entries.map(entry => entry.reason)).toEqual(["customStyle", "customStyle", "customStyle", "customData", "existingOverride"]);
		expect(importContext.resolveLink.mock.calls).toEqual([["Images/Back.png", "Boards/Source.canvas"], ["Notes/Note.md", "Boards/Source.canvas"]]);
		expect(result.report).toMatchObject({
			format: "json-canvas", formatVersion: "1.0", sourcePath: "Boards/Source.canvas",
			importer: "miro-canvas", importerVersion: "9.9.9", importedAt: importContext.now,
			counts: { converted: 3, approximated: 0, notImported: 5, skipped: 0 },
		});
		expect(validateMiroCanvasMetadata(result.document.miroCanvas).diagnostics).toEqual(validateMiroCanvasMetadata(document.miroCanvas).diagnostics);
	});

	it("does not add plugin metadata, bindings or foreign source evidence", () => {
		const document = { nodes: [textNode], edges: [] };
		const result = copy(document);
		expect(result.document).toEqual(document);
		expect(result.document.miroCanvas).toBeUndefined();
		expect(result.document.miroSource).toBeUndefined();
		expect(() => assertImportedBoard(result.document)).not.toThrow();
	});

	it.each(["foreign", null, { schemaVersion: 99 }, { schemaVersion: 1, localOverrides: "unreadable", future: [1] }])("preserves even unreadable existing plugin data: %j", (miroCanvas) => {
		const document = { nodes: [textNode], edges: [], miroCanvas, miroSource: { evidence: [1, 2] } };
		expect(copy(document).document).toEqual(document);
	});

	it("leaves source text immutable and makes detached deterministic copies", () => {
		const importSource = Object.freeze(source({ nodes: [textNode], edges: [], metadata: { nested: [1, 2] } }));
		const before = importSource.text;
		const first = jsonCanvasAdapter.convert(importSource, context());
		const second = jsonCanvasAdapter.convert(importSource, context());
		expect(first).toEqual(second);
		(first.document.metadata as UnknownRecord).nested = ["changed"];
		expect(importSource.text).toBe(before);
		expect(second.document.metadata).toEqual({ nested: [1, 2] });
	});

	it("preserves prototype-named JSON keys as data", () => {
		const document = JSON.parse('{"nodes":[],"edges":[],"__proto__":{"canvasPolluted":true},"miroSource":{"constructor":{"prototype":{"canvasPolluted":true}}},"metadata":{"__proto__":{"keep":true}}}') as UnknownRecord;
		const result = copy(document);
		expect(JSON.stringify(result.document)).toBe(JSON.stringify(document));
		expect(Object.prototype).not.toHaveProperty("canvasPolluted");
	});
});

describe("safe native card and line validation", () => {
	it.each([
		{ x: 0.5 }, { x: Number.MAX_SAFE_INTEGER }, { y: "0" }, { width: 0 }, { height: -1 },
		{ width: Number.MAX_SAFE_INTEGER + 1 }, { type: "unknown" }, { text: null }, { color: "7" },
		{ color: "#123" }, { color: 1 }, { id: "" },
	])("omits invalid geometry or card fields with an explicit report: %j", (patch) => {
		const result = copy({ nodes: [{ ...textNode, ...patch }], edges: [] });
		expect(result.document.nodes).toEqual([]);
		expect(result.report.counts).toEqual({ converted: 0, approximated: 0, notImported: 1, skipped: 0 });
		expect(result.report.entries[0]).toMatchObject({ status: "invalid-source", reason: "invalidElement" });
	});

	it.each([
		{ ...textNode, type: "file", file: 42 },
		{ ...textNode, type: "file", file: "Note.md", subpath: "Heading" },
		{ ...textNode, type: "link", url: null },
		{ ...textNode, type: "group", label: 12 },
		{ ...textNode, type: "group", background: false },
		{ ...textNode, type: "group", backgroundStyle: "stretch" },
	])("checks the fields specific to the native card kind: %j", (node) => {
		expect(copy({ nodes: [node] }).document.nodes).toEqual([]);
	});

	it.each([
		{ fromSide: "center" }, { toSide: 1 }, { fromEnd: "diamond" }, { toEnd: null },
		{ label: true }, { color: "8" }, { fromNode: "absent" }, { toNode: "" }, { id: "" },
	])("omits invalid line attributes or dangling endpoints: %j", (patch) => {
		const result = copy({ nodes: [textNode], edges: [{ id: "line", fromNode: "text", toNode: "text", ...patch }] });
		expect(result.document.edges).toEqual([]);
		expect(result.report.entries[0]).toMatchObject({ status: "invalid-source", reason: "invalidElement", sourceType: "edge" });
	});

	it("keeps the first valid IDs and removes duplicate IDs, invalid cards and their lines", () => {
		const result = copy({
			nodes: [textNode, { ...textNode, text: "duplicate" }, { ...textNode, id: "invalid", width: -1 }, null],
			edges: [
				{ id: "text", fromNode: "text", toNode: "text" },
				{ id: "valid", fromNode: "text", toNode: "text" },
				{ id: "valid", fromNode: "text", toNode: "text" },
				{ id: "dangling", fromNode: "text", toNode: "invalid" },
			],
		});
		expect(result.document.nodes).toEqual([textNode]);
		expect(result.document.edges).toEqual([{ id: "valid", fromNode: "text", toNode: "text" }]);
		expect(result.report.entries).toHaveLength(6);
		expect(result.report.counts).toEqual({ converted: 2, approximated: 0, notImported: 5, skipped: 0 });
		expect(() => assertImportedBoard(result.document)).not.toThrow();
	});
});

describe("missing asset diagnostics", () => {
	it("keeps unresolved file cards, subpaths and group backgrounds and reports each affected card", () => {
		const document = {
			nodes: [
				{ ...textNode, id: "a", type: "file", file: "Images/Picture.png", subpath: "#block" },
				{ ...textNode, id: "b", type: "file", file: "Images/Picture.png" },
				{ ...textNode, id: "g", type: "group", background: "Images/Picture.png" },
				{ ...textNode, id: "resolved", type: "file", file: "Note" },
				{ ...textNode, id: "web", type: "link", url: "https://example.org" },
			],
			edges: [{ id: "line", fromNode: "a", toNode: "web" }],
		};
		const resolveLink = vi.fn((link: string) => link === "Note" ? "Notes/Note.md" : undefined);
		const result = copy(document, { ...context(), resolveLink });
		expect(result.document).toEqual(document);
		expect(resolveLink.mock.calls).toEqual([["Images/Picture.png", "Boards/Source.canvas"], ["Note", "Boards/Source.canvas"]]);
		expect(result.report.entries).toEqual([
			{ sourceId: "a", sourceType: "file", nodeId: "a", status: "missing-asset", reason: "fileNotFound" },
			{ sourceId: "b", sourceType: "file", nodeId: "b", status: "missing-asset", reason: "fileNotFound" },
			{ sourceId: "g", sourceType: "group background", nodeId: "g", status: "missing-asset", reason: "imageNotFound" },
		]);
		expect(result.report.counts).toEqual({ converted: 3, approximated: 0, notImported: 3, skipped: 0 });
	});
});

describe("bounded source validation", () => {
	it("refuses source text over the shared limit before parsing it", () => {
		const importSource = { ...source({}), text: " ".repeat(MAX_IMPORT_SOURCE_LENGTH + 1) };
		expect(jsonCanvasAdapter.detect(importSource)).toBe(false);
		failure(importSource, "tooLarge");
	});

	it("bounds combined card and line counts, including unreadable elements", () => {
		failure(source({ nodes: Array.from({ length: MAX_IMPORT_ELEMENTS }, () => null), edges: [null] }), "tooLarge");
		const result = copy({ edges: Array.from({ length: MAX_IMPORT_ELEMENTS }, () => null) });
		expect(result.report.counts.notImported).toBe(MAX_IMPORT_ELEMENTS);
		expect(result.report.entries).toHaveLength(MAX_IMPORT_ENTRIES);
		expect(result.document).toEqual({ nodes: [], edges: [] });
	});

	it("bounds unknown JSON nesting and rejects numeric overflow without a recursive crash", () => {
		const nested = '{"nodes":[],"unknown":' + "[".repeat(130) + "0" + "]".repeat(130) + "}";
		failure({ ...source({}), text: nested }, "tooLarge");
		expect(jsonCanvasAdapter.detect({ ...source({}), text: nested })).toBe(false);
		failure({ ...source({}), text: '{"nodes":[],"unknown":1e999}' }, "unreadableData");
	});
});
