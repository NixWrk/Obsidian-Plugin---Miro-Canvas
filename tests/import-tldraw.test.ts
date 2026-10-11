import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { assertImportedBoard, idFactory } from "../src/importers/board-builder";
import { MAX_TLDRAW_RECORDS, MAX_TLDRAW_SOURCE_LENGTH, MAX_TLDRAW_TOTAL_POINTS, tldrawAdapter } from "../src/importers/tldraw";
import { ImportError, MAX_IMPORT_ENTRIES, type ImportContext, type ImportResult, type ImportSource } from "../src/importers/types";
import { MAX_STROKE_POINTS, type LocalStroke } from "../src/local-items";
import { resolveAnchor } from "../src/anchors";

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
		expect(first.box.width).toBeCloseTo(89, 10);
		expect(first.box.height).toBeCloseTo(146, 10);
		expect(first.points[0]).toBeCloseTo(77.71612548828125, 10);
		expect(first.points[1]).toBeCloseTo(47.82942199707031, 10);
		expect(first.points[first.points.length - 2]).toBeCloseTo(88.07351684570312, 10);
		expect(first.points[first.points.length - 1]).toBeCloseTo(145.09523010253906, 10);
		const second = stroke(result, "shape:lYFTlcgUfO12Ftet14pMy");
		expect(second.points).toHaveLength(178);
		expect(second.box.width).toBeCloseTo(74, 10);
		expect(second.box.height).toBeCloseTo(129, 10);
	});

	it("keeps theme-readable ink, locks and source stacking order", () => {
		const data = sample();
		const first = shapes(data)[0]!;
		first.isLocked = true;
		data.records.reverse();
		const result = convert(data, "dark");
		expect(stroke(result, first.id).color).toBe("#f2f2f2");
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
		expect(imported.points).toEqual([0.71612548828125, 0.8294219970703125, 2.21612548828125, 0.3294219970703125]);
		expect(imported.box).toEqual({ width: 3, height: 1 });
		shape.props.segments[0]!.path = packedVector(0, 0, 1, 0x8001);
				const subnormal = stroke(convert(data), shape.id);
		expect(subnormal.points[2] - subnormal.points[0]).toBe(2 ** -24);
		expect(subnormal.points[3] - subnormal.points[1]).toBe(-(2 ** -24));
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
function nativeSample(): Sample {
	return JSON.parse(readFileSync(join(dirname(FIXTURE), "tldraw-authored-native.tldr"), "utf8")) as Sample;
}

function importedNode(result: ImportResult, sourceId: string): Record<string, unknown> {
	const metadata = result.document.miroCanvas as { bindings: Record<string, { sourceId: string }> };
	return (result.document.nodes as Record<string, unknown>[]).find(node => metadata.bindings[node.id as string]?.sourceId === "tldraw:" + sourceId)!;
}

describe("tldraw authored native shape evidence", () => {
	it("imports sized geo/plain text/straight lines/arrows/images without a foreign runtime", () => {
		const result = convert(nativeSample());
		assertImportedBoard(result.document);
		expect(result.assets).toHaveLength(1);
		expect(result.assets![0]!.bytes.slice(0, 8)).toEqual(Uint8Array.from([137,80,78,71,13,10,26,10]));
		expect(result.document.nodes).toHaveLength(6);
		expect(result.document.edges).toHaveLength(1);
		expect(result.report.entries.filter(entry => entry.reason === "tldrawVariant")).toHaveLength(0);
		expect(importedNode(result,"shape:text").text).toContain("\\*stars\\*");
		expect(importedNode(result,"shape:text").text).toContain("Кириллица");
		expect(importedNode(result,"shape:image").type).toBe("file");
	});

	it("maps source-origin rotation to a card-center rotation and preserves default style tokens", () => {
		const result = convert(nativeSample());
		const card = importedNode(result, "shape:rectangle");
		const cx = -300 + Math.cos(0.2)*110 - Math.sin(0.2)*70;
		const cy = Math.sin(0.2)*110 + Math.cos(0.2)*70;
		expect(card.x).toBe(Math.round(cx - 110));
		expect(card.y).toBe(Math.round(cy - 70));
		const metadata = result.document.miroCanvas as { localOverrides: Record<string, { rotation: number; borderWidth: number; colors: Record<string,string> }> };
		const style = metadata.localOverrides[card.id as string]!;
		expect(style.rotation).toBeCloseTo(0.2 * 180 / Math.PI);
		expect(style.colors.border).toBe("#4465e9");
		expect(style.borderWidth).toBe(3.5);
	});

	it("preserves fractional stroke coordinates after the actual Canvas integer-box projection", () => {
		const result = convert(nativeSample());
		const node = importedNode(result, "shape:authored-stroke");
		const pen = stroke(result, "shape:authored-stroke");
		expect(node.width).toBe(pen.box.width);
		expect(node.height).toBe(pen.box.height);
		expect((node.x as number) + pen.points[0]!).toBe(0.375);
		expect((node.y as number) + pen.points[1]!).toBe(440.625);
		expect((node.x as number) + pen.points[pen.points.length-2]!).toBe(120.375);
		expect(pen.width).toBe(4.5);
		expect(pen.color).toBe("#1d1d1d");
	});

	it("refuses unevidenced curves/clipping/crops/rich marks without silently flattening them", () => {
		for (const variant of ["curve","binding","crop","marks","future"]) {
			const data = nativeSample();
			if (variant === "curve") shapes(data).find(shape=>shape.id==="shape:free-arrow")!.props.bend = 50;
			if (variant === "binding") (data.records.find(record=>record.id==="binding:end")!.props as Record<string,unknown>).isExact = false;
			if (variant === "crop") shapes(data).find(shape=>shape.id==="shape:image")!.props.crop = { topLeft:{x:0.1,y:0.1},bottomRight:{x:1,y:1} };
			if (variant === "marks") shapes(data).find(shape=>shape.id==="shape:text")!.props.richText = { type:"doc",content:[{type:"paragraph",content:[{type:"text",text:"bold",marks:[{type:"bold"}]}]}] };
			if (variant === "future") data.schema.sequences["com.tldraw.shape.geo"] = 99;
			expect(convert(data).report.entries.some(entry => entry.reason === "tldrawVariant")).toBe(true);
		}
	});
});
describe("optional measured tldraw appearance", () => {
	function observedCase() {
		const data = nativeSample();
		shapes(data).find(shape=>shape.id==="shape:text")!.props.autoSize = true;
		shapes(data).find(shape=>shape.id==="shape:free-arrow")!.props.bend = 40;
		const text = JSON.stringify(data);
		const appearance = {
			sourceText: text, theme: "light",
			shapes: [{ sourceId: "shape:text", x:-300,y:240,width:340,height:130,
				style:{ typography:{fontSize:26,fontFamily:"tldraw_mono, monospace",lineHeight:1.35},colors:{text:"#135790",fill:null,border:null},borderStyle:"none",borderWidth:0 } }],
			connectors: [{sourceId:"shape:free-arrow",points:[{x:300,y:260},{x:350,y:285},{x:470,y:285},{x:520,y:260}],color:"#864200",width:5}],
		};
		return { data, text, appearance };
	}
	it("uses measured text boxes/styles and actual shaft samples for automatic text and curved source arrows", () => {
		const {text,appearance} = observedCase();
		const result = tldrawAdapter.convert(source(text),{...context(),tldrawAppearance:appearance});
		const textNode = importedNode(result,"shape:text");
		expect([textNode.x,textNode.y,textNode.width,textNode.height]).toEqual([-300,240,340,130]);
		const metadata = result.document.miroCanvas as { localOverrides:Record<string,Record<string,unknown>>;connectors:Record<string,{route:string;color:string;waypoints:{x:number;y:number}[]}>;bindings:Record<string,{sourceId:string}> };
		expect((metadata.localOverrides[textNode.id as string]!.colors as Record<string,unknown>).text).toBe("#135790");
		const arrowId = Object.keys(metadata.bindings).find(id=>metadata.bindings[id]!.sourceId==="tldraw:shape:free-arrow")!;
		expect(metadata.connectors[arrowId]!.route).toBe("straight");
		expect(metadata.connectors[arrowId]!.waypoints).toEqual([{x:350,y:285},{x:470,y:285}]);
		expect(metadata.connectors[arrowId]!.color).toBe("#864200");
		expect(result.report.entries.some(entry=>entry.sourceId==="shape:free-arrow" && entry.status==="approximated")).toBe(true);
	});
	it("rejects stale/unknown/duplicate/nonfinite/unsafe captures atomically and preserves default fallback", () => {
		const {text,appearance} = observedCase();
		const fallback = tldrawAdapter.convert(source(text),context());
		const stale = structuredClone(appearance); stale.sourceText+="stale";
		const unknown = structuredClone(appearance); unknown.shapes[0]!.sourceId="shape:absent";
		const duplicate = structuredClone(appearance); duplicate.shapes.push(duplicate.shapes[0]!);
		const invalid = structuredClone(appearance); invalid.connectors[0]!.points[1]!.x=NaN;
		const unsafe = structuredClone(appearance); Object.assign(unsafe.shapes[0]!.style,{html:"active"});
		const huge = structuredClone(appearance); huge.connectors[0]!.points=Array.from({length:500},()=>({x:0,y:0}));
		for(const value of [stale,unknown,duplicate,invalid,unsafe,huge]) {
			expect(tldrawAdapter.convert(source(text),{...context(),tldrawAppearance:value})).toEqual(fallback);
		}
	});
	it("keeps source rotation when measured styles override the defaults", () => {
		const data=nativeSample(); const text=JSON.stringify(data);
		const observed={sourceText:text,theme:"light",shapes:[{sourceId:"shape:rectangle",x:-300,y:0,width:220,height:140,style:{colors:{text:"#123456",border:"#123456",fill:null}}}],connectors:[]};
		const result=tldrawAdapter.convert(source(text),{...context(),tldrawAppearance:observed});
		const node=importedNode(result,"shape:rectangle");
		const overrides=(result.document.miroCanvas as {localOverrides:Record<string,{rotation:number}>}).localOverrides;
		expect(overrides[node.id as string]!.rotation).toBeCloseTo(0.2*180/Math.PI);
		expect(JSON.stringify(observed)).not.toContain("miroCanvas");
	});
});
const EDITOR_FIXTURE = join(dirname(FIXTURE), "tldraw-editor-authored-1.32.0.md");
const EDITOR_TEXT = readFileSync(EDITOR_FIXTURE, "utf8");
const EDITOR_APPEARANCE = JSON.parse(readFileSync(join(dirname(FIXTURE), "tldraw-editor-appearance-1.32.0.json"), "utf8")) as unknown;

function editorSource(): ImportSource {
	return { path: "Tldraw QA/Editor authored all.md", extension: "md", text: EDITOR_TEXT, frontmatter: { "tldraw-file": true, tags: ["tldraw"] } };
}

describe("actual tldraw 1.32.0 editor save", () => {
	it("pins the original editor's real Markdown wrapper and normalized record versions", () => {
		expect(createHash("sha256").update(readFileSync(EDITOR_FIXTURE)).digest("hex"))
			.toBe("a574acb8bc541acaa41317b301153d524b0495f0ce7efe81ab3deef959ad28af");
		const envelope = JSON.parse(EDITOR_TEXT.slice(EDITOR_TEXT.indexOf(START) + START.length, EDITOR_TEXT.indexOf(END))) as { meta: Record<string, unknown>; raw: Sample };
		expect(envelope.meta["plugin-version"]).toBe("1.32.0");
		expect(envelope.meta["tldraw-version"]).toBe("5.4.0");
		expect(envelope.raw.tldrawFileFormatVersion).toBe(1);
		expect(envelope.raw.schema.schemaVersion).toBe(2);
		expect(envelope.raw.schema.sequences["com.tldraw.shape.geo"]).toBe(12);
		expect(envelope.raw.records).toHaveLength(19);
		expect(shapes(envelope.raw)).toHaveLength(9);
		const input = editorSource();
		const result = tldrawAdapter.convert(input, context("dark"));
		assertImportedBoard(result.document);
		expect(result.report.entries.filter(entry => entry.reason === "tldrawVariant")).toEqual([]);
		expect(input.text).toBe(EDITOR_TEXT);
		expect(result.assets).toHaveLength(1);
	});

	it("uses actual measured text geometry and SVG shaft samples while retaining explicit stroke loss", () => {
		const result = tldrawAdapter.convert(editorSource(), { ...context("dark"), tldrawAppearance: EDITOR_APPEARANCE });
		assertImportedBoard(result.document);
		const node = importedNode(result, "shape:text");
		expect([node.x, node.y, node.width, node.height]).toEqual([-300, 240, 260, 128]);
		const metadata = result.document.miroCanvas as {
			localOverrides: Record<string, { typography?: Record<string, unknown>; connectorAnchors?: { from: unknown; to: unknown }; connector?: { route: string; waypoints: unknown[] } }>;
			bindings: Record<string, { sourceId: string }>;
		};
		expect(metadata.localOverrides[node.id as string]!.typography!.lineHeight).toBe(32 / 24);
		const edgeId = Object.keys(metadata.bindings).find(id => metadata.bindings[id]!.sourceId === "tldraw:shape:bound-arrow")!;
		const edge = metadata.localOverrides[edgeId]!;
		expect(edge.connector!.route).toBe("straight");
		expect(edge.connector!.waypoints).toHaveLength(31);
		expect(edge.connectorAnchors!.from).toMatchObject({ type: "node", u: 219.77999877929688 / 220, v: 0.5 });
		expect(result.report.entries.some(entry => entry.sourceId === "shape:authored-stroke" && entry.reason === "tldrawStroke")).toBe(true);
		expect(result.report.counts).toEqual({ converted: 0, approximated: 10, notImported: 1, skipped: 0 });
		expect(result.document.miroCanvas).toMatchObject({ settings: { displayTheme: "dark" } });
	});
	it("retains the accepted source theme independently of the importing host", () => {
		const result = tldrawAdapter.convert(editorSource(), { ...context("light"), tldrawAppearance: EDITOR_APPEARANCE });
		expect(result.document.miroCanvas).toMatchObject({ settings: { displayTheme: "dark" } });
	});

	it("does not add a filename caption or rounded mask to the source image", () => {
		const result = tldrawAdapter.convert(editorSource(), context());
		const image = importedNode(result, "shape:image");
		const overrides = (result.document.miroCanvas as { localOverrides: Record<string, Record<string, unknown>> }).localOverrides;
		expect(overrides[image.id as string]).toMatchObject({ showAttachmentName: false, cornerRadius: 0 });
	});

	it("fails closed on an unknown capture theme", () => {
		const capture = structuredClone(EDITOR_APPEARANCE) as Record<string, unknown>;
		capture.theme = "future";
		expect(tldrawAdapter.convert(editorSource(), { ...context(), tldrawAppearance: capture }))
			.toEqual(tldrawAdapter.convert(editorSource(), context()));
	});

	it("inverse-rotates captured attachment points around the rounded native card center", () => {
		// Synthetic rotated-binding derivative of authored geometry, not a new editor export.
		const data = nativeSample();
		const binding = data.records.find(record => record.id === "binding:start")!;
		(binding as Record<string, unknown>).toId = "shape:rectangle";
		const cx = -300 + Math.cos(0.2) * 110 - Math.sin(0.2) * 70;
		const cy = Math.sin(0.2) * 110 + Math.cos(0.2) * 70;
		const rect = { x: cx - 110, y: cy - 70, width: 220, height: 140 };
		const nativeCx = Math.round(rect.x) + 110;
		const nativeCy = Math.round(rect.y) + 70;
		const first = { x: nativeCx + Math.cos(0.2) * 66, y: nativeCy + Math.sin(0.2) * 66 };
		const text = JSON.stringify(data);
		const capture = { sourceText: text, theme: "light", shapes: [
			{ sourceId: "shape:rectangle", ...rect },
			{ sourceId: "shape:diamond", x: 300, y: 0, width: 220, height: 140 },
		], connectors: [{ sourceId: "shape:bound-arrow", color: "#1d1d1d", width: 3.5, points: [first, { x: 250, y: 70 }, { x: 300.22, y: 70 }] }] };
		const result = tldrawAdapter.convert(source(text), { ...context(), tldrawAppearance: capture });
		const node = importedNode(result, "shape:rectangle");
		const metadata = result.document.miroCanvas as { bindings: Record<string, { sourceId: string }>; localOverrides: Record<string, { rotation?: number; connectorAnchors?: { from: unknown } }> };
		const edgeId = Object.keys(metadata.bindings).find(id => metadata.bindings[id]!.sourceId === "tldraw:shape:bound-arrow")!;
		const anchor = metadata.localOverrides[edgeId]!.connectorAnchors!.from;
		expect(anchor).toMatchObject({ type: "node", nodeId: node.id, u: 0.8 });
		const resolved = resolveAnchor(anchor, { nodes: { [node.id as string]: { ...node, rotation: metadata.localOverrides[node.id as string]!.rotation } } });
		expect(resolved.valid).toBe(true);
		expect(resolved.point!.x).toBeCloseTo(first.x, 9);
		expect(resolved.point!.y).toBeCloseTo(first.y, 9);
	});
});
