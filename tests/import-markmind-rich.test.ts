import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assertImportedBoard, idFactory } from "../src/importers/board-builder";
import { convertMarkmindRich, detectMarkmindRich, markmindRichAdapter, parseMarkmindRichSource } from "../src/importers/markmind-rich";
import { findAdapter } from "../src/importers/registry";
import { ImportError, MAX_IMPORT_ELEMENTS, MAX_IMPORT_SOURCE_LENGTH, type ImportContext, type ImportResult, type ImportSource } from "../src/importers/types";
import { validateMiroCanvasMetadata } from "../src/metadata";
import { buildSourceScene } from "../src/source-model";
import authoredNativeLayout from "./fixtures/import/markmind-rich-authored-layout.json";

const AUTHORED = readFileSync(new URL("./fixtures/import/markmind-rich-authored-3.7.4.md", import.meta.url), "utf8");
const ROOT_ID = "beb4a817-f9a9-d7cd";
const source = (text = AUTHORED): ImportSource => ({ path: "Maps/actual-authored-rich.md", extension: "md", text });
const context = (snapshot?: unknown): ImportContext => ({ importerVersion: "test", now: "2026-10-12T00:00:00Z", newId: idFactory(13), resolveLink: () => undefined, ...(snapshot === undefined ? {} : { mindmapLayout: snapshot }) });
const data = (): Record<string, unknown> => structuredClone(parseMarkmindRichSource(AUTHORED).raw);
function note(raw: Record<string, unknown>, outside = ""): string {
	return "---\nmindmap-plugin: rich\n---\n" + outside + "\n``` json\n" + JSON.stringify(raw) + "\n```\n";
}
function simpleData(): Record<string, unknown> {
	return { mindData: [[
		{ id: "root", text: "Centre", isRoot: true, x: 0, y: 0, style: {} },
		{ id: "right", text: "**Right** [[Note]]", pid: "root", x: 160, y: 0, style: {}, stroke: "#706db6" },
		{ id: "left", text: "Left", pid: "root", x: -120, y: 50, style: {}, stroke: "#ce408f" },
	]], opt: { fontSize: 16, fontFamily: "", background: "transparent" }, induceData: [], wireFrameData: [], relateLinkData: [], calloutData: [] };
}
function records(raw: Record<string, unknown>): Record<string, unknown>[] {
	return (raw.mindData as Record<string, unknown>[][])[0]!;
}
function parts(result: ImportResult) {
	const metadata = result.document.miroCanvas as { bindings: Record<string, { sourceId: string }>; localOverrides: Record<string, Record<string, unknown>>; settings?: Record<string, unknown> };
	const nodes = result.document.nodes as { id: string; text: string; x: number; y: number; width: number; height: number }[];
	const edges = result.document.edges as { id: string; fromNode: string; toNode: string; fromSide: string; toSide: string }[];
	const node = (sourceId: string) => nodes.find(candidate => metadata.bindings[candidate.id]?.sourceId === `markmind-rich:${sourceId}`)!;
	return { metadata, nodes, edges, node };
}
function snapshot(text: string) {
	const parsed = parseMarkmindRichSource(text);
	const nodes = parsed.nodes.map(node => ({ sourceId: node.sourceId, parentId: node.parentId, text: node.text, x: node.x, y: node.y, width: 100, height: 40, style: {
		typography: { fontFamily: "Arial", fontSize: 20, lineHeight: 1.4, alignment: "left", verticalAlign: "center", format: { bold: false } },
		colors: { text: "#123456", fill: null, border: "#654321" }, borderWidth: 1, borderStyle: "solid",
	} }));
	const byId = new Map(nodes.map(node => [node.sourceId, node]));
	const edges = parsed.nodes.filter(node => node.parentId !== null).map(node => {
		const from = byId.get(node.parentId!)!;
		const to = byId.get(node.sourceId)!;
		const left = to.x < from.x;
		return { parentId: node.parentId!, childId: node.sourceId, color: "#135790", width: 1.5, points: [
			{ x: from.x + (left ? 0 : from.width), y: from.y + from.height / 2 },
			{ x: (from.x + to.x) / 2, y: from.y + from.height / 2 },
			{ x: to.x + (left ? to.width : 0), y: to.y + to.height / 2 },
		] };
	});
	return { sourceText: text, nodes, edges, theme: "dark" };
}

function nativeSnapshot() {
	const facts = structuredClone(authoredNativeLayout);
	const byId = new Map(parseMarkmindRichSource(AUTHORED).nodes.map(node => [node.sourceId, node]));
	return {
		sourceText: AUTHORED, theme: facts.theme,
		nodes: facts.nodes.map(({ styleIndex, ...node }) => ({ ...node, text: byId.get(node.sourceId)!.text, style: facts.styles[styleIndex]! })),
		edges: facts.edges.map(edge => ({ ...edge, points: edge.points.map(([x, y]) => ({ x, y })) })),
	};
}

describe("Markmind rich: own authored 3.7.4 evidence", () => {
	it("recognises rich notes without claiming basic or unknown modes", () => {
		expect(detectMarkmindRich(source())).toBe(true);
		expect(findAdapter(source())?.id).toBe("markmind-rich");
		expect(markmindRichAdapter.detect({ ...source(), extension: "MD", frontmatter: { "mindmap-plugin": "Rich" } })).toBe(true);
		for (const text of ["# Just a note", "---\nmindmap-plugin: basic\n---\n# Centre", "---\nmindmap-plugin: other\n---\n", "---\nmindmap-plugin: rich\n# no closing marker"]) expect(detectMarkmindRich(source(text))).toBe(false);
		expect(detectMarkmindRich({ ...source(), extension: "canvas" })).toBe(false);
	});

	it("exports the 13 checked source identities, parents, raw fields and saved positions", () => {
		const parsed = parseMarkmindRichSource(AUTHORED);
		expect(parsed.nodes).toHaveLength(13);
		expect(parsed.nodes[0]).toMatchObject({ sourceId: ROOT_ID, parentId: null, text: "Карта проекта", x: 3940, y: 3800 });
		expect(parsed.nodes.filter(node => node.parentId !== null)).toHaveLength(12);
		expect(parsed.nodes.find(node => node.text === "[[Заметка]]")?.parentId).toBe("5991cb00-678d-a4ad");
		expect(parsed.nodes.find(node => node.text === "**Важное**")?.raw.stroke).toBe("#706db6");
		expect(parsed.raw).toMatchObject({ opt: { background: "transparent", fontFamily: "", fontSize: 16 }, induceData: [], wireFrameData: [], relateLinkData: [], calloutData: [], scrollLeft: 3422, scrollTop: 3357 });
		expect(parsed.noteBody).toBe("");
	});

	it("makes every authored node a native card and all 12 tree branches native edges", () => {
		const original = source();
		const result = convertMarkmindRich(original, context());
		const board = parts(result);
		const parsed = parseMarkmindRichSource(AUTHORED);
		expect(board.nodes).toHaveLength(13);
		expect(board.edges).toHaveLength(12);
		for (const node of parsed.nodes) expect(board.node(node.sourceId)).toMatchObject({ text: node.text, x: node.x, y: node.y });
		for (const child of parsed.nodes.filter(node => node.parentId !== null)) {
			const edge = board.edges.find(edge => edge.toNode === board.node(child.sourceId).id)!;
			expect(edge.fromNode).toBe(board.node(child.parentId!).id);
			expect(board.metadata.localOverrides[edge.id]).toMatchObject({ colors: { edge: child.raw.stroke }, connector: { route: "curved", startCap: "none", endCap: "none" } });
		}
		expect(result.report.counts).toEqual({ converted: 13, approximated: 1, notImported: 0, skipped: 0 });
		expect(result.report.entries).toEqual([{ sourceId: "appearance", sourceType: "persisted positions; estimated card sizes and paths", status: "approximated", reason: "appearance" }]);
		expect(result.report.formatVersion).toBeUndefined();
		expect(original.text).toBe(AUTHORED);
		expect(result.document.miroSource).toBeUndefined();
		expect(() => assertImportedBoard(result.document)).not.toThrow();
		expect(validateMiroCanvasMetadata(result.document.miroCanvas).diagnostics).toEqual([]);
		expect(convertMarkmindRich(original, context())).toEqual(result);
	});

	it("retains BOM/CRLF, Cyrillic and Markdown labels without re-laying out the tree", () => {
		const windows = "\ufeff" + AUTHORED.replace(/\r?\n/gu, "\r\n");
		expect(parseMarkmindRichSource(windows).nodes).toEqual(parseMarkmindRichSource(AUTHORED).nodes);
		const text = note(simpleData());
		const board = parts(convertMarkmindRich(source(text), context()));
		expect(board.node("right").text).toBe("**Right** [[Note]]");
		const right = board.edges.find(edge => edge.toNode === board.node("right").id)!;
		const left = board.edges.find(edge => edge.toNode === board.node("left").id)!;
		expect([right.fromSide, right.toSide]).toEqual(["right", "left"]);
		expect([left.fromSide, left.toSide]).toEqual(["left", "right"]);
		expect(board.node("left")).toMatchObject({ x: -120, y: 50 });
	});
});

describe("Markmind rich: bounded fail-closed source reader", () => {
	it.each([
		(raw: Record<string, unknown>) => { raw.mindData = []; },
		(raw: Record<string, unknown>) => { raw.mindData = [records(raw), []]; },
		(raw: Record<string, unknown>) => { raw.mindData = [[]]; },
		(raw: Record<string, unknown>) => { records(raw)[1]!.id = "root"; },
		(raw: Record<string, unknown>) => { records(raw)[1]!.pid = "missing"; },
		(raw: Record<string, unknown>) => { records(raw)[1]!.pid = "right"; },
		(raw: Record<string, unknown>) => { records(raw)[1]!.pid = "left"; records(raw)[2]!.pid = "right"; },
		(raw: Record<string, unknown>) => { delete records(raw)[1]!.pid; },
		(raw: Record<string, unknown>) => { records(raw)[0]!.isRoot = false; },
		(raw: Record<string, unknown>) => { records(raw)[1]!.isRoot = true; },
		(raw: Record<string, unknown>) => { records(raw)[1]!.x = "160"; },
		(raw: Record<string, unknown>) => { records(raw)[1]!.y = null; },
		(raw: Record<string, unknown>) => { records(raw)[1]!.text = 123; },
		(raw: Record<string, unknown>) => { records(raw)[1]!.text = '<img src="https://example.com/a.png">'; },
		(raw: Record<string, unknown>) => { records(raw)[1]!.isExpand = "false"; },
		(raw: Record<string, unknown>) => { records(raw)[1]!.id = "bad\u0000id"; },
		(raw: Record<string, unknown>) => { raw.wireFrameData = {}; },
	])("refuses invalid records, root/parent structure, cycles or unevidenced variants before allocating IDs", (change) => {
		const raw = simpleData();
		change(raw);
		const noIds = { ...context(), newId: (): string => { throw new Error("allocated before validation"); } };
		expect(() => convertMarkmindRich(source(note(raw)), noIds)).toThrow(ImportError);
	});

	it("distinguishes malformed JSON, ambiguous/missing data fences and duplicate mode properties", () => {
		const prefix = "---\nmindmap-plugin: rich\n---\n";
		expect(() => parseMarkmindRichSource(prefix + "```json\n{bad\n```\n")).toThrowError(expect.objectContaining({ reason: "unreadableData" }));
		for (const text of [prefix + "# no data", note(simpleData()) + "```json\n{}\n```\n", "---\nmindmap-plugin: rich\nmindmap-plugin: basic\n---\n"]) {
			expect(() => parseMarkmindRichSource(text)).toThrowError(expect.objectContaining({ reason: "unknownStructure" }));
		}
	});

	it("enforces text, node and auxiliary element limits", () => {
		expect(() => parseMarkmindRichSource(" ".repeat(MAX_IMPORT_SOURCE_LENGTH + 1))).toThrowError(expect.objectContaining({ reason: "tooLarge" }));
		const raw = simpleData();
		raw.mindData = [Array.from({ length: MAX_IMPORT_ELEMENTS + 1 }, () => null)];
		expect(() => parseMarkmindRichSource(note(raw))).toThrowError(expect.objectContaining({ reason: "tooLarge" }));
		const components = simpleData();
		components.calloutData = Array.from({ length: MAX_IMPORT_ELEMENTS }, () => ({}));
		expect(() => parseMarkmindRichSource(note(components))).toThrowError(expect.objectContaining({ reason: "tooLarge" }));
	});

	it("reads a large deep tree iteratively and resolves parents appearing after their children", () => {
		const raw = simpleData();
		const rows = [{ id: "r", text: "r", x: 0, y: 0, isRoot: true }, ...Array.from({ length: 8_000 }, (_, index) => ({ id: String(index), text: "n", x: index, y: 0, pid: index === 0 ? "r" : String(index - 1) }))];
		raw.mindData = [[...rows].reverse()];
		expect(parseMarkmindRichSource(note(raw)).nodes).toHaveLength(8_001);
		const small = simpleData();
		small.mindData = [[...records(small)].reverse()];
		expect(parts(convertMarkmindRich(source(note(small)), context())).edges).toHaveLength(2);
	});
});

describe("Markmind rich: declarations and explicit unsupported components", () => {
	it("maps safe declared text/paint/border styles without executing CSS", () => {
		const raw = simpleData();
		records(raw)[1]!.style = { "font-size": "24px", "font-family": "Arial", color: "#123", "background-color": "#eef0ff", "border-color": "#456789", "border-width": "2px", "border-style": "dashed", "text-align": "center", opacity: 0.4, "background-image": "url(https://example.com/a.png)" };
		const result = convertMarkmindRich(source(note(raw)), context());
		const board = parts(result);
		expect(board.metadata.localOverrides[board.node("right").id]).toMatchObject({ typography: { fontSize: 24, fontFamily: "Arial", alignment: "center" }, colors: { text: "#112233", fill: "#eef0ff", border: "#456789" }, borderWidth: 2, borderStyle: "dashed" });
		expect(JSON.stringify(result.document)).not.toContain("example.com");
		expect(result.report.entries).toContainEqual(expect.objectContaining({ sourceId: "right", sourceType: "style", status: "plugin-unsupported", reason: "customStyle" }));
	});

	it("reports rich auxiliary records, unknown node/envelope fields and folded branches", () => {
		const raw = simpleData();
		for (const field of ["induceData", "wireFrameData", "relateLinkData", "calloutData"]) raw[field] = [{ id: "unknown", x: 1, y: 2 }];
		records(raw)[1]!.imageData = { source: "unknown" };
		records(raw)[1]!.isExpand = false;
		records(raw)[2]!.layout = { layoutName: "fishbone" };
		records(raw)[2]!.stroke = "rgba(1,2,3,.5)";
		raw.futureRich = { keep: true };
		raw.theme = "unknown-theme";
		(raw.opt as Record<string, unknown>).background = "#ffffff";
		const text = note(raw, "# extra note\nText remains in the source.").replace("mindmap-plugin: rich", "mindmap-plugin: rich\ntags: [qa]");
		const result = convertMarkmindRich(source(text), context());
		expect(parts(result).nodes).toHaveLength(3);
		for (const field of ["induceData", "wireFrameData", "relateLinkData", "calloutData"]) expect(result.report.entries).toContainEqual({ sourceId: `${field}:0`, sourceType: field, status: "plugin-unsupported", reason: "unknownElement" });
		expect(result.report.entries).toContainEqual(expect.objectContaining({ sourceId: "right", reason: "foldedBranch" }));
		expect(result.report.entries).toContainEqual(expect.objectContaining({ sourceId: "right", reason: "unknownElement" }));
		for (const id of ["left", "theme", "opt:background", "noteBody", "property:tags", "field:futureRich"]) expect(result.report.entries.some(entry => entry.sourceId === id)).toBe(true);
	});
});

describe("Markmind rich: complete source layout capture", () => {
	const text = note(simpleData());
	it("keeps matched measured cards, styles, source theme and sampled attached branch geometry", () => {
		const capture = snapshot(text);
		const before = structuredClone(capture);
		const result = convertMarkmindRich(source(text), context(capture));
		const board = parts(result);
		for (const node of capture.nodes) {
			expect(board.node(node.sourceId)).toMatchObject({ x: node.x, y: node.y, width: 100, height: 40 });
			expect(board.metadata.localOverrides[board.node(node.sourceId).id]).toEqual({ ...node.style, shape: { kind: "rectangle", fallback: "text" } });
		}
		expect(board.metadata.settings?.displayTheme).toBe("dark");
		for (const captured of capture.edges) {
			const edge = board.edges.find(edge => edge.toNode === board.node(captured.childId).id)!;
			expect(board.metadata.localOverrides[edge.id]).toMatchObject({ colors: { edge: captured.color }, connector: { route: "straight", width: 1.5, startCap: "none", endCap: "none", waypoints: [captured.points[1]] } });
			const from = board.node(captured.parentId);
			expect(board.metadata.localOverrides[edge.id]!.connectorAnchors).toMatchObject({ from: { type: "node", nodeId: from.id, u: captured.childId === "left" ? 0 : 1, v: 0.5 } });
		}
		expect(result.report.entries).toEqual([{ sourceId: "appearance", sourceType: "captured sizes/styles; sampled paths and native Markdown", status: "approximated", reason: "appearance" }]);
		expect(capture).toEqual(before);
		expect(convertMarkmindRich(source(text), context(capture))).toEqual(result);
	});


	it("uses independently reflowed captured positions while retaining source identities and hierarchy", () => {
		const capture = snapshot(text);
		const saved = parseMarkmindRichSource(text).nodes;
		const positions: Record<string, { x: number; y: number }> = {
			root: { x: -60, y: 120 }, right: { x: -320, y: -50 }, left: { x: 400, y: 400 },
		};
		for (const node of capture.nodes) Object.assign(node, positions[node.sourceId]);
		const byId = new Map(capture.nodes.map(node => [node.sourceId, node]));
		for (const edge of capture.edges) {
			const from = byId.get(edge.parentId)!;
			const to = byId.get(edge.childId)!;
			const left = to.x < from.x;
			edge.points = [
				{ x: from.x + (left ? 0 : from.width), y: from.y + from.height / 2 },
				{ x: (from.x + to.x) / 2, y: from.y + from.height / 2 },
				{ x: to.x + (left ? to.width : 0), y: to.y + to.height / 2 },
			];
		}
		const input = source(text);
		const result = convertMarkmindRich(input, context(capture));
		const board = parts(result);
		for (const captured of capture.nodes) expect(board.node(captured.sourceId)).toMatchObject({ x: captured.x, y: captured.y, width: captured.width, height: captured.height });
		for (const captured of capture.edges) {
			const edge = board.edges.find(edge => edge.toNode === board.node(captured.childId).id)!;
			expect(board.metadata.localOverrides[edge.id]).toMatchObject({
				connector: { route: "straight", waypoints: [captured.points[1]] },
				connectorAnchors: { from: { u: captured.childId === "right" ? 0 : 1, v: 0.5 }, to: { u: captured.childId === "right" ? 1 : 0, v: 0.5 } },
			});
		}
		expect(board.metadata.settings?.displayTheme).toBe("dark");
		expect(result.report.entries).toContainEqual(expect.objectContaining({ sourceType: "captured sizes/styles; sampled paths and native Markdown", reason: "appearance" }));
		expect(input.text).toBe(text);
		expect(parseMarkmindRichSource(input.text).nodes).toEqual(saved);
		expect(() => assertImportedBoard(result.document)).not.toThrow();
	});

	it("rejects a reflowed node with edge endpoints still belonging to its saved position", () => {
		const capture = snapshot(text);
		capture.nodes[1]!.x += 400;
		capture.nodes[1]!.y += 200;
		expect(convertMarkmindRich(source(text), context(capture))).toEqual(convertMarkmindRich(source(text), context()));
	});

	it.each([
		(capture: ReturnType<typeof snapshot>) => { capture.sourceText += " "; },
		(capture: ReturnType<typeof snapshot>) => { capture.nodes.pop(); },
		(capture: ReturnType<typeof snapshot>) => { capture.nodes[1]!.sourceId = "not-source"; },
		(capture: ReturnType<typeof snapshot>) => { capture.nodes[1]!.sourceId = "root"; },
		(capture: ReturnType<typeof snapshot>) => { capture.nodes[1]!.text += "changed"; },
		(capture: ReturnType<typeof snapshot>) => { capture.nodes[1]!.parentId = "left"; },
		(capture: ReturnType<typeof snapshot>) => { capture.nodes[1]!.x = NaN; },
		(capture: ReturnType<typeof snapshot>) => { capture.nodes[1]!.y = Infinity; },
		(capture: ReturnType<typeof snapshot>) => { capture.nodes[1]!.x = 100001; },
		(capture: ReturnType<typeof snapshot>) => { capture.nodes[1]!.width = 0; },
		(capture: ReturnType<typeof snapshot>) => { capture.nodes[1]!.height = NaN; },
		(capture: ReturnType<typeof snapshot>) => { capture.nodes[1]!.style.typography.fontFamily = "url(https://example.com/font)"; },
		(capture: ReturnType<typeof snapshot>) => { capture.nodes[1]!.style.borderWidth = 500; },
		(capture: ReturnType<typeof snapshot>) => { capture.edges.pop(); },
		(capture: ReturnType<typeof snapshot>) => { capture.edges[1] = structuredClone(capture.edges[0]!); },
		(capture: ReturnType<typeof snapshot>) => { capture.edges[0]!.parentId = "left"; },
		(capture: ReturnType<typeof snapshot>) => { capture.edges[0]!.color = "url(https://example.com/paint)"; },
		(capture: ReturnType<typeof snapshot>) => { capture.edges[0]!.width = 0; },
		(capture: ReturnType<typeof snapshot>) => { capture.edges[0]!.points[0]!.x = 10000; },
		(capture: ReturnType<typeof snapshot>) => { capture.edges[0]!.points = Array.from({ length: 67 }, () => ({ x: 0, y: 0 })); },
		(capture: ReturnType<typeof snapshot>) => { capture.theme = "other"; },
	])("rejects stale, partial, unsafe or mismatched snapshots atomically", (change) => {
		const capture = snapshot(text);
		change(capture);
		const result = convertMarkmindRich(source(text), context(capture));
		const fallback = convertMarkmindRich(source(text), context());
		expect(result).toEqual(fallback);
	});

	it("detaches validated styles and path samples from the capture before preview", () => {
		const capture = snapshot(text);
		const result = convertMarkmindRich(source(text), context(capture));
		const before = structuredClone(result);
		capture.nodes[1]!.style.colors.text = "#ffffff";
		capture.nodes[1]!.style.typography.format.bold = true;
		capture.edges[0]!.points[1]!.x += 20;
		expect(result).toEqual(before);
	});

	it("does not execute snapshot accessors while validating source matches", () => {
		const capture = snapshot(text);
		let calls = 0;
		Object.defineProperty(capture.nodes[1], "text", { get: () => { calls += 1; return "**Right** [[Note]]"; } });
		expect(convertMarkmindRich(source(text), context(capture))).toEqual(convertMarkmindRich(source(text), context()));
		expect(calls).toBe(0);
	});

	it("uses the actual source IDs and positions when capturing the authored tree", () => {
		const capture = snapshot(AUTHORED);
		const result = convertMarkmindRich(source(), context(capture));
		expect(parts(result).nodes).toHaveLength(13);
		expect(parts(result).edges).toHaveLength(12);
		expect(result.report.entries[0]!.sourceType).toBe("captured sizes/styles; sampled paths and native Markdown");
	});
});


describe("Markmind rich: original authored view capture", () => {
	it("consumes every native identity, reflowed card, style and composite branch without changing the source", () => {
		expect(createHash("sha256").update(AUTHORED.replace(/\r\n/gu, "\n")).digest("hex")).toBe(authoredNativeLayout.sourceSha256);
		const capture = nativeSnapshot();
		const before = structuredClone(capture);
		const saved = parseMarkmindRichSource(AUTHORED).nodes;
		expect(capture.nodes).toHaveLength(13);
		expect(capture.edges).toHaveLength(12);
		expect(new Set(capture.nodes.map(node => node.sourceId)).size).toBe(saved.length);
		for (const captured of capture.nodes) expect(saved.find(node => node.sourceId === captured.sourceId)).toMatchObject({ text: captured.text, parentId: captured.parentId });
		expect(capture.nodes.filter(node => { const raw = saved.find(raw => raw.sourceId === node.sourceId)!; return node.x !== raw.x || node.y !== raw.y; })).toHaveLength(12);
		const input = source();
		const result = convertMarkmindRich(input, context(capture));
		const board = parts(result);
		expect(board.nodes).toHaveLength(13);
		expect(board.edges).toHaveLength(12);
		for (const captured of capture.nodes) {
			expect(board.node(captured.sourceId)).toMatchObject({ text: captured.text, x: captured.x, y: captured.y, width: captured.width, height: captured.height });
			expect(board.metadata.localOverrides[board.node(captured.sourceId).id]).toEqual({ ...captured.style, ...(captured.sourceId === ROOT_ID ? { shape: { kind: "rectangle", fallback: "text" } } : { item: { type: "text" } }) });
		}
		for (const captured of capture.edges) {
			expect(saved.find(node => node.sourceId === captured.childId)?.parentId).toBe(captured.parentId);
			const edge = board.edges.find(edge => edge.toNode === board.node(captured.childId).id)!;
			expect(edge.fromNode).toBe(board.node(captured.parentId).id);
			const overrides = board.metadata.localOverrides[edge.id]!;
			expect(overrides).toMatchObject({ colors: { edge: captured.color }, connector: { route: "straight", width: captured.width, startCap: "none", endCap: "none" } });
			const connector = overrides.connector as { waypoints: { x: number; y: number }[] };
			expect(connector.waypoints).toHaveLength(captured.points.length - 2);
			for (const [index, point] of connector.waypoints.entries()) {
				expect(point.x).toBeCloseTo(captured.points[index + 1]!.x, 2);
				expect(point.y).toBeCloseTo(captured.points[index + 1]!.y, 2);
			}
			const anchors = overrides.connectorAnchors as { from: { nodeId: string; u: number; v: number }; to: { nodeId: string; u: number; v: number } };
			for (const [anchor, node, point] of [
				[anchors.from, board.node(captured.parentId), captured.points[0]!],
				[anchors.to, board.node(captured.childId), captured.points[captured.points.length - 1]!],
			] as const) {
				expect(anchor.nodeId).toBe(node.id);
				expect(node.x + node.width * anchor.u).toBeCloseTo(point.x, 6);
				expect(node.y + node.height * anchor.v).toBeCloseTo(point.y, 6);
			}
		}
		expect(board.metadata.settings?.displayTheme).toBe("light");
		expect(result.report.entries).toEqual([{ sourceId: "appearance", sourceType: "captured sizes/styles; sampled paths and native Markdown", status: "approximated", reason: "appearance" }]);
		expect(input.text).toBe(AUTHORED);
		expect(parseMarkmindRichSource(input.text).nodes).toEqual(saved);
		expect(capture).toEqual(before);
		expect(validateMiroCanvasMetadata(result.document.miroCanvas).diagnostics).toEqual([]);
		expect(() => assertImportedBoard(result.document)).not.toThrow();
	});

	it.each([
		(capture: ReturnType<typeof nativeSnapshot>) => { capture.sourceText += " "; },
		(capture: ReturnType<typeof nativeSnapshot>) => { capture.nodes[1]!.sourceId = "not-source"; },
		(capture: ReturnType<typeof nativeSnapshot>) => { capture.nodes[1]!.text += " changed"; },
		(capture: ReturnType<typeof nativeSnapshot>) => { capture.nodes[1]!.parentId = capture.nodes[2]!.sourceId; },
		(capture: ReturnType<typeof nativeSnapshot>) => { capture.nodes.pop(); },
		(capture: ReturnType<typeof nativeSnapshot>) => { capture.edges.pop(); },
	])("atomically rejects native facts when source bytes, identity, text, hierarchy or coverage disagree", change => {
		const capture = nativeSnapshot();
		change(capture);
		expect(convertMarkmindRich(source(), context(capture))).toEqual(convertMarkmindRich(source(), context()));
	});
});


describe("Markmind rich: measured label surfaces", () => {
	it("uses padding-free local text for transparent labels and a shape for the actual colored root without changing their geometry", () => {
		const capture = nativeSnapshot();
		Object.assign(capture.nodes[0]!.style, { cornerRadius: 4 });
		for (const node of capture.nodes) Object.assign(node.style.typography, { fontFamily: "Arial" });
		const result = convertMarkmindRich(source(), context(capture));
		const board = parts(result);
		const scene = buildSourceScene(result.document);
		for (const node of capture.nodes) {
			const card = board.node(node.sourceId);
			expect(card).toMatchObject({ text: node.text, x: node.x, y: node.y, width: node.width, height: node.height });
			const surface = node.sourceId === ROOT_ID ? { shape: { kind: "round_rectangle", fallback: "text" } } : { item: { type: "text" } };
			expect(board.metadata.localOverrides[card.id]).toEqual({ ...node.style, ...surface });
			expect(scene.items.get(card.id)).toMatchObject(node.sourceId === ROOT_ID ? { kind: "shape", shape: "round_rectangle", cornerRadius: 4 } : { kind: "text", localItem: "text" });
			expect(scene.items.get(card.id)?.css["font-family"]).toBe("Arial");
		}
		expect(board.edges).toHaveLength(12);
		expect(validateMiroCanvasMetadata(result.document.miroCanvas).diagnostics).toEqual([]);
	});

	it.each([
		{ fill: null, border: "#123456", width: 0, radius: 0, kind: "text" },
		{ fill: "#ffffff00", border: null, width: 2, radius: 0, kind: "text" },
		{ fill: "#00aaff", border: null, width: 0, radius: 0, kind: "rectangle" },
		{ fill: "#00aaff", border: null, width: 0, radius: 5, kind: "round_rectangle" },
		{ fill: null, border: "#123456", width: 2, radius: 0, kind: "rectangle" },
		{ fill: null, border: "#123456", width: 2, radius: 5, kind: "round_rectangle" },
	])("uses only evidenced fill/border/radius for $kind surfaces", ({ fill, border, width, radius, kind }) => {
		const text = note(simpleData());
		const capture = snapshot(text);
		const root = capture.nodes[0]!;
		Object.assign(root.style, { colors: { text: "#123456", fill, border }, borderWidth: width, borderStyle: "solid", cornerRadius: radius });
		const result = convertMarkmindRich(source(text), context(capture));
		const board = parts(result);
		const card = board.node("root");
		expect(card).toMatchObject({ x: root.x, y: root.y, width: root.width, height: root.height });
		expect(board.metadata.localOverrides[card.id]).toEqual({ ...root.style, ...(kind === "text" ? { item: { type: "text" } } : { shape: { kind, fallback: "text" } }) });
		expect(buildSourceScene(result.document).items.get(card.id)).toMatchObject(kind === "text" ? { kind: "text", localItem: "text" } : { kind: "shape", shape: kind, cornerRadius: radius });
	});

	it.each([-1, 1001, NaN, Infinity, "4"])("rejects unsafe radius %s atomically", cornerRadius => {
		const capture = nativeSnapshot();
		Object.assign(capture.nodes[0]!.style, { cornerRadius });
		expect(convertMarkmindRich(source(), context(capture))).toEqual(convertMarkmindRich(source(), context()));
	});

	it("uses local text for offline unpainted authored labels while keeping saved positions and native branches", () => {
		const result = convertMarkmindRich(source(), context());
		const board = parts(result);
		const scene = buildSourceScene(result.document);
		for (const node of parseMarkmindRichSource(AUTHORED).nodes) {
			const card = board.node(node.sourceId);
			expect(card).toMatchObject({ x: node.x, y: node.y, text: node.text });
			expect(board.metadata.localOverrides[card.id]).toMatchObject({ item: { type: "text" } });
			expect(scene.items.get(card.id)).toMatchObject({ kind: "text", localItem: "text" });
		}
		expect(board.edges).toHaveLength(12);
	});
});
