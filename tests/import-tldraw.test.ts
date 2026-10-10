import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { assertImportedBoard, idFactory } from "../src/importers/board-builder";
import { MAX_TLDRAW_RECORDS, MAX_TLDRAW_SOURCE_LENGTH, MAX_TLDRAW_TOTAL_POINTS, tldrawAdapter } from "../src/importers/tldraw";
import { ImportError, MAX_IMPORT_ENTRIES, type ImportContext, type ImportResult, type ImportSource } from "../src/importers/types";
import { MAX_STROKE_POINTS, type LocalStroke } from "../src/local-items";

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), "fixtures/import/tldraw-current-schema.tldr");
const REAL_TEXT = readFileSync(FIXTURE, "utf8");
const START = "!!!_START_OF_TLDRAW_DATA__DO_NOT_CHANGE_THIS_PHRASE_!!!";
const END = "!!!_END_OF_TLDRAW_DATA__DO_NOT_CHANGE_THIS_PHRASE_!!!";

interface SampleShape {
	id: string;
	typeName: string;
	type: string;
	parentId: string;
	index: string;
	x: number;
	y: number;
	rotation: number;
	isLocked: boolean;
	opacity: number;
	props: {
		segments: { type: string; dim: number; path: string }[];
		[key: string]: unknown;
	};
}

interface Sample {
	tldrawFileFormatVersion: number;
	schema: { schemaVersion: number; sequences: Record<string, number> };
	records: (SampleShape | { id: string; typeName: string; [key: string]: unknown })[];
}

function sample(): Sample {
	return JSON.parse(REAL_TEXT) as Sample;
}

function shapes(data: Sample): SampleShape[] {
	return data.records.filter(value => value.typeName === "shape") as SampleShape[];
}

function source(text = REAL_TEXT): ImportSource {
	return { path: "Boards/official.tldr", extension: "tldr", text };
}

function context(theme: "light" | "dark" = "light"): ImportContext {
	return {
		importerVersion: "test",
		now: "2026-10-11T00:00:00.000Z",
		newId: idFactory(51),
		resolveLink: () => { throw new Error("tldraw subset must not resolve assets"); },
		theme,
	};
}

function convert(data = sample(), theme: "light" | "dark" = "light"): ImportResult {
	return tldrawAdapter.convert(source(JSON.stringify(data)), context(theme));
}

function stroke(result: ImportResult, sourceId: string): LocalStroke {
	const metadata = result.document.miroCanvas as {
		bindings: Record<string, { sourceId: string }>;
		localOverrides: Record<string, { item: { stroke: LocalStroke } }>;
	};
	const id = Object.keys(metadata.bindings).find(key => metadata.bindings[key]!.sourceId === "tldraw:" + sourceId)!;
	return metadata.localOverrides[id]!.item.stroke;
}

function expectFailure(data: Sample, reason: string): void {
	try {
		convert(data);
		throw new Error("unexpected successful import");
	} catch (error) {
		expect(error).toBeInstanceOf(ImportError);
		expect((error as ImportError).reason).toBe(reason);
	}
}

/** A synthetic byte-level vector, not an exported tldraw drawing. */
function packedVector(firstX = 1, firstY = -2, deltaX = 0x3e00, deltaY = 0xb800): string {
	const bytes = new Uint8Array(12);
	const view = new DataView(bytes.buffer);
	view.setFloat32(0, firstX, true);
	view.setFloat32(4, firstY, true);
	view.setUint16(8, deltaX, true);
	view.setUint16(10, deltaY, true);
	return Buffer.from(bytes).toString("base64");
}

describe("bounded tldraw import", () => {
	it("pins the unmodified official persisted sample", () => {
		expect(createHash("sha256").update(readFileSync(FIXTURE)).digest("hex"))
			.toBe("d4aa78fc99e15b98949656d03793d7b39c34289358e24b153c7859465591ad03");
	});

	it("recognises tldr and marked Markdown, but not unrelated JSON or archives", () => {
		expect(tldrawAdapter.detect(source())).toBe(true);
		expect(tldrawAdapter.detect({ ...source(), extension: "json" })).toBe(false);
		expect(tldrawAdapter.detect({ ...source(), extension: "tldraw" })).toBe(false);
		expect(tldrawAdapter.detect({ ...source(), extension: "md" })).toBe(false);
		expect(tldrawAdapter.detect({ ...source(), extension: "md", frontmatter: { "tldraw-file": true } })).toBe(true);
		expect(tldrawAdapter.detect({ ...source(), extension: "md", frontmatter: { "tldraw-file": "true" } })).toBe(false);
	});

	it("imports both real strokes with honest appearance losses and immutable input", () => {
		const input = source();
		const result = tldrawAdapter.convert(input, context());
		expect(input.text).toBe(REAL_TEXT);
		expect(result.document.nodes).toHaveLength(2);
		expect(result.document.edges).toEqual([]);
		expect(result.document.miroSource).toBeUndefined();
		expect(result.report.format).toBe("tldraw");
		expect(result.report.formatVersion).toBe("1 / schema 2 / draw 5");
		expect(result.report.counts).toEqual({ converted: 0, approximated: 2, notImported: 1, skipped: 0 });
		expect(result.report.entries.filter(entry => entry.status === "approximated").every(entry => entry.reason === "tldrawStroke")).toBe(true);
		assertImportedBoard(result.document);
		expect(tldrawAdapter.convert(input, context())).toEqual(result);
	});

	it("matches real coordinates independently calculated with Python struct ff / ee", () => {
		const result = convert();
		const first = stroke(result, "shape:B8g2DGB0V1tqtCGkUopau");
		expect(first.points).toHaveLength(142);
		expect(first.box.width).toBeCloseTo(87.98681640625, 10);
		expect(first.box.height).toBeCloseTo(144.29351806640625, 10);
		expect(first.points[0]).toBeCloseTo(77.62942504882812, 10);
		expect(first.points[1]).toBeCloseTo(47.0277099609375, 10);
		expect(first.points[first.points.length - 2]).toBeCloseTo(87.98681640625, 10);
		expect(first.points[first.points.length - 1]).toBeCloseTo(144.29351806640625, 10);
		const second = stroke(result, "shape:lYFTlcgUfO12Ftet14pMy");
		expect(second.points).toHaveLength(178);
		expect(second.box.width).toBeCloseTo(72.39312744140625, 10);
		expect(second.box.height).toBeCloseTo(127.8155517578125, 10);
	});

	it("keeps theme-readable ink, locks and source stacking order", () => {
		const data = sample();
		const first = shapes(data)[0]!;
		first.isLocked = true;
		data.records.reverse();
		const result = convert(data, "dark");
		expect(stroke(result, first.id).color).toBe("#ffffff");
		const nodes = result.document.nodes as { id: string }[];
		const metadata = result.document.miroCanvas as {
			bindings: Record<string, { sourceId: string }>;
			localOverrides: Record<string, { locked?: boolean }>;
		};
		expect(metadata.bindings[nodes[0]!.id]!.sourceId).toBe("tldraw:" + first.id);
		expect(metadata.localOverrides[nodes[0]!.id]!.locked).toBe(true);
	});

	it("reads the official Markdown writer's meta/raw delimiter wrapper", () => {
		const fence = String.fromCharCode(96).repeat(3);
		const text = ["---", "tldraw-file: true", "---", "", fence + "json " + START,
			JSON.stringify({ meta: { "plugin-version": "1.32.0", "tldraw-version": "5.4.0", uuid: "synthetic-wrapper" }, raw: sample() }),
			END, fence].join("\n");
		const result = tldrawAdapter.convert({ path: "Boards/example.md", extension: "md", text, frontmatter: { "tldraw-file": true } }, context());
		expect(result.document.nodes).toHaveLength(2);
		expect(result.report.sourcePath).toBe("Boards/example.md");
	});

	it("rejects ambiguous or truncated Markdown data and the old record-map wrapper", () => {
		const raw = JSON.stringify({ meta: { "plugin-version": "test", "tldraw-version": "2.1.4" }, raw: {} });
		for (const text of [START + raw, END + START + raw, START + raw + END + START + END, START + raw + END]) {
			expect(() => tldrawAdapter.convert({ ...source(text), extension: "md", frontmatter: { "tldraw-file": true } }, context())).toThrow(ImportError);
		}
	});

	it.each([
		["tldrawFileFormatVersion", 2], ["schemaVersion", 1], ["com.tldraw.store", 6],
		["com.tldraw.shape", 5], ["com.tldraw.shape.draw", 6], ["com.tldraw.page", 2],
	])("refuses unevidenced version %s", (field, value) => {
		const data = sample();
		if (field === "tldrawFileFormatVersion") data.tldrawFileFormatVersion = value as number;
		else if (field === "schemaVersion") data.schema.schemaVersion = value as number;
		else data.schema.sequences[field] = value as number;
		expectFailure(data, "unknownStructure");
	});

	it("refuses multiple pages, nested shapes and dangling parents", () => {
		const extraPage = sample();
		extraPage.records.push({ id: "page:two", typeName: "page" });
		expectFailure(extraPage, "unknownStructure");
		for (const parentId of ["shape:frame", "page:missing"]) {
			const data = sample();
			shapes(data)[0]!.parentId = parentId;
			expectFailure(data, "unknownStructure");
		}
	});

	it("refuses duplicate IDs and malformed top-level geometry", () => {
		const duplicate = sample();
		duplicate.records.push(duplicate.records[0]!);
		expectFailure(duplicate, "unreadableData");
		for (const value of [NaN, Infinity, 100_001]) {
			const data = sample();
			shapes(data)[0]!.x = value;
			expectFailure(data, "unreadableData");
		}
	});

	it("decodes signed deltas and subnormal binary16 without a foreign runtime", () => {
		const data = sample();
		const shape = shapes(data)[0]!;
		shape.props.segments[0]!.path = packedVector();
		const imported = stroke(convert(data), shape.id);
		expect(imported.points).toEqual([0, 0.5, 1.5, 0]);
		expect(imported.box).toEqual({ width: 1.5, height: 1 });
		shape.props.segments[0]!.path = packedVector(0, 0, 1, 0x8001);
		expect(stroke(convert(data), shape.id).points).toEqual([0, 2 ** -24, 2 ** -24, 0]);
	});

	it("rejects nonfinite packed values, malformed bytes, noncanonical base64 and huge paths", () => {
		for (const path of [
			"%%%", "AAAAAAAAAAA=", "AAAAAAAAAAAA", "AAAAAAAAAAAAAAAAAA==",
			packedVector(Infinity), packedVector(0, 0, 0x7c00), packedVector(0, 0, 0x7e00),
			packedVector(100_000, 0, 0x3c00),
		]) {
			const data = sample();
			shapes(data)[0]!.props.segments[0]!.path = path;
			expectFailure(data, "unreadableData");
		}
		const huge = sample();
		shapes(huge)[0]!.props.segments[0]!.path = Buffer.alloc(8 + MAX_STROKE_POINTS * 4).toString("base64");
		expectFailure(huge, "tooLarge");
	});

	it("creates placeholders instead of claiming support for unevidenced visual variants", () => {
		for (const patch of [
			{ isPen: true }, { fill: "solid" }, { color: "red" }, { size: "l" },
			{ scaleX: -1 }, { scale: 2 }, { isClosed: true }, { isComplete: false },
			{ segments: [{ type: "free", dim: 3, path: packedVector() }] },
		]) {
			const data = sample();
			Object.assign(shapes(data)[0]!.props, patch);
			const result = convert(data);
			expect(result.report.counts.notImported).toBe(2);
			expect(result.report.entries.some(entry => entry.status === "plugin-unsupported" && entry.nodeId !== undefined)).toBe(true);
		}
		const data = sample();
		shapes(data)[0]!.rotation = Math.PI / 2;
		shapes(data)[1]!.type = "image";
		const result = convert(data);
		expect(result.report.counts).toEqual({ converted: 0, approximated: 0, notImported: 3, skipped: 0 });
		expect(result.assets ?? []).toEqual([]);
	});

	it("reports unsupported bindings and assets rather than fetching or executing them", () => {
		const data = sample();
		data.records.push({ id: "asset:remote", typeName: "asset", props: { src: "https://example.invalid/image.png" } });
		data.records.push({ id: "binding:arrow", typeName: "binding" });
		const result = convert(data);
		expect(result.report.counts.notImported).toBe(3);
		expect(result.report.entries.filter(entry => entry.reason === "tldrawVariant").map(entry => entry.sourceType)).toEqual(["asset", "binding"]);
	});

	it("reports significant meta, customData and unfamiliar fields without interpreting their contents", () => {
		const data = sample();
		const shape = shapes(data)[0]!;
		Object.assign(shape, { meta: { secretMeaning: "keep in source" }, customData: { relations: ["shape:other"] }, foreignField: "extra" });
		shape.props.foreignProp = { arbitrary: true };
		Object.assign(shape.props.segments[0]!, { customData: { tool: "foreign" } });
		(data as Sample & { customData: unknown }).customData = { sourceEvidence: true };
		const result = convert(data);
		const extras = result.report.entries.filter(entry => entry.reason === "customData");
		expect(extras.map(entry => [entry.sourceId, entry.sourceType])).toEqual(expect.arrayContaining([
			["tldraw-file", "customData"], [shape.id, "meta"], [shape.id, "customData"],
			[shape.id, "foreignField"], [shape.id, "props:foreignProp"], [shape.id, "segment:0:customData"],
		]));
		expect(result.report.counts).toEqual({ converted: 0, approximated: 1, notImported: 3, skipped: 0 });
		expect(result.report.entries.filter(entry => entry.sourceId === shape.id)).toHaveLength(6);
		expect(result.report.entries.some(entry => entry.sourceId === shape.id && entry.reason === "tldrawStroke")).toBe(true);
		expect(JSON.stringify(result.document)).not.toContain("keep in source");
		expect((shape as SampleShape & { meta: unknown }).meta).toEqual({ secretMeaning: "keep in source" });
	});

		it("caps report details without counting one record more than once", () => {
		const data = sample();
		const shape = shapes(data)[0]!;
		for (let index = 0; index < MAX_IMPORT_ENTRIES + 5; index += 1) {
			shape.props["extension_" + index] = true;
		}
		const result = convert(data);
		expect(result.report.entries).toHaveLength(MAX_IMPORT_ENTRIES);
		expect(result.report.omittedEntries).toBe(8);
		expect(result.report.counts).toEqual({ converted: 0, approximated: 1, notImported: 2, skipped: 0 });
	});

	it("enforces the total point budget across individually valid strokes", () => {
		const data = sample();
		const first = shapes(data)[0]!;
		const path = Buffer.alloc(8 + (MAX_STROKE_POINTS - 1) * 4).toString("base64");
		const count = Math.ceil(MAX_TLDRAW_TOTAL_POINTS / MAX_STROKE_POINTS);
		data.records = data.records.filter(value => value.typeName !== "shape");
		for (let index = 0; index < count; index += 1) {
			data.records.push({
				...first, id: "shape:budget:" + index,
				props: { ...first.props, segments: [{ type: "free", dim: 2, path }] },
			});
		}
		expectFailure(data, "tooLarge");
	});

	it("enforces source and record budgets before producing a board", () => {
		expect(() => tldrawAdapter.convert(source(" ".repeat(MAX_TLDRAW_SOURCE_LENGTH + 1)), context())).toThrow(ImportError);
		const data = sample();
		data.records = Array.from({ length: MAX_TLDRAW_RECORDS + 1 }, (_, index) => ({ id: "page:" + index, typeName: "page" }));
		expectFailure(data, "tooLarge");
	});
});