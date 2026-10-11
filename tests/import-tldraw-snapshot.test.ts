import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assertImportedBoard, idFactory } from "../src/importers/board-builder";
import { tldrawAdapter } from "../src/importers/tldraw";
import { MAX_IMPORT_SVG_BYTES } from "../src/importers/assets";
import type { ImportContext, ImportResult } from "../src/importers/types";
import { validateMiroCanvasMetadata } from "../src/metadata";
import { resolveAnchor } from "../src/anchors";

type RecordData = { id: string; typeName: string; type?: string; x?: number; y?: number; rotation?: number; opacity?: number; props?: Record<string, unknown>; [key: string]: unknown };
type Box = { x: number; y: number; width: number; height: number };
const DATA = readFileSync(join(import.meta.dirname, "fixtures/import/tldraw-authored-native.tldr"), "utf8");

/** Independently authored passive rectangle exercises transport, not tldraw's smoothed ink. */
function dataURL(box: Box, body = `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" fill="#135790"/>`): string {
	return "data:image/svg+xml;base64," + Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${box.width}" height="${box.height}" viewBox="${box.x} ${box.y} ${box.width} ${box.height}">${body}</svg>`).toString("base64");
}
function setup(type: "draw" | "geo" = "draw") {
	const data = JSON.parse(DATA) as { schema: { sequences: Record<string, number> }; records: RecordData[] };
	const id = type === "draw" ? "shape:authored-stroke" : "shape:rectangle";
	const shape = data.records.find(record => record.id === id)!;
	if (type === "geo") {
		shape.rotation = 0;
		Object.assign(shape.props!, { geo: "hexagon", richText: { type: "doc", content: [{ type: "paragraph", content: [] }] } });
	}
	const box = type === "draw" ? { x: 0.375, y: 440.625, width: 120, height: 70 } : { x: -300, y: 0, width: 220, height: 140 };
	const inkBox = { x: box.x - 5, y: box.y - 5, width: box.width + 10, height: box.height + 10 };
	const captured = { sourceId: id, ...box, visualSnapshot: { ...inkBox, dataURL: dataURL(inkBox) } };
	const appearance = { sourceText: "", theme: "dark", shapes: [captured], connectors: [] as unknown[] };
	const convert = (capture: unknown = appearance): ImportResult => {
		const text = JSON.stringify(data);
		appearance.sourceText = text;
		const context: ImportContext = { now: "2026-10-11T00:00:00Z", importerVersion: "test", theme: "light", newId: idFactory(71), resolveLink: () => undefined, tldrawAppearance: capture };
		return tldrawAdapter.convert({ path: "Boards/source.tldr", extension: "tldr", text }, context);
	};
	return { data, id, shape, box, inkBox, captured, appearance, convert };
}
function bound(result: ImportResult, sourceId: string) {
	const metadata = result.document.miroCanvas as { bindings: Record<string, { sourceId: string }>; localOverrides: Record<string, Record<string, unknown>> };
	const id = Object.keys(metadata.bindings).find(key => metadata.bindings[key].sourceId === "tldraw:" + sourceId)!;
	return { node: (result.document.nodes as Record<string, unknown>[]).find(node => node.id === id)!, style: metadata.localOverrides[id], metadata };
}

describe("tldraw passive per-object visual fallback", () => {
	it("publishes validated draw ink as a source-bound native SVG attachment", () => {
		const current = setup();
		const before = JSON.stringify(current.data);
		const result = current.convert();
		const { node, style } = bound(result, current.id);
		assertImportedBoard(result.document);
		expect(validateMiroCanvasMetadata(result.document.miroCanvas).diagnostics).toEqual([]);
		expect(result.assets).toHaveLength(2);
		expect(node).toMatchObject({ type: "file", x: Math.round(current.inkBox.x), y: Math.round(current.inkBox.y), width: current.inkBox.width, height: current.inkBox.height });
		expect(String(node.file)).toMatch(/^Boards\/Miro Canvas pictures [a-z0-9]+\/[a-z0-9]+\.svg$/);
		expect(result.assets!.find(asset => asset.path === node.file)).toBeDefined();
		expect(style).toMatchObject({ rotation: 0, borderWidth: 0, borderStyle: "none", colors: { fill: null, border: null }, showAttachmentName: false, cornerRadius: 0 });
		expect(result.report.entries.some(entry => entry.sourceId === current.id && entry.status === "approximated" && entry.reason === "visualFallback")).toBe(true);
		expect(result.report.entries.filter(entry => entry.sourceId === current.id && ["tldrawStroke", "tldrawVariant"].includes(entry.reason))).toEqual([]);
		expect(result.document.miroCanvas).toMatchObject({ settings: { displayTheme: "dark" } });
		expect(JSON.stringify(current.data)).toBe(before);
	});

	it("retains a passive filled curved outline without sampling it into a polyline", () => {
		const current = setup();
		const { x, y, width, height } = current.inkBox;
		current.captured.visualSnapshot.dataURL = dataURL(current.inkBox, `<path d="M ${x} ${y} Q ${x + width / 2} ${y - 1} ${x + width} ${y} L ${x + width} ${y + height} Q ${x + width / 2} ${y + height + 1} ${x} ${y + height} Z" fill="#135790" fill-rule="evenodd"/>`);
		const result = current.convert();
		const node = bound(result, current.id).node;
		const asset = result.assets!.find(asset => asset.path === node.file)!;
		expect(new TextDecoder().decode(asset.bytes)).toContain("<path d=");
		expect(new TextDecoder().decode(asset.bytes)).toContain(" Q ");
	});

	it("can retain closed, pressure-shaped and rotated draw ink only when a snapshot is present", () => {
		const current = setup();
		Object.assign(current.shape.props!, { isPen: true, isClosed: true, color: "violet", fill: "solid" });
		current.shape.rotation = Math.PI / 2;
		const cx = current.box.x + current.box.width / 2;
		const cy = current.box.y + current.box.height / 2;
		const box = { x: cx - current.box.height / 2 - 5, y: cy - current.box.width / 2 - 5, width: current.box.height + 10, height: current.box.width + 10 };
		current.captured.visualSnapshot = { ...box, dataURL: dataURL(box) };
		expect(bound(current.convert(), current.id).node.type).toBe("file");
		const capture = { ...current.appearance, shapes: [{ sourceId: current.id, ...current.box }] };
		expect(bound(current.convert(capture), current.id).node.type).toBe("text");
	});

	it("uses the baked snapshot box and zero rotation for arrows attached to replaced draw", () => {
		const current = setup();
		current.shape.rotation = 0.2;
		const angle = 0.2;
		const width = Math.cos(angle) * current.box.width + Math.sin(angle) * current.box.height;
		const height = Math.sin(angle) * current.box.width + Math.cos(angle) * current.box.height;
		const box = { x: current.box.x + current.box.width / 2 - width / 2 - 5, y: current.box.y + current.box.height / 2 - height / 2 - 5, width: width + 10, height: height + 10 };
		current.captured.visualSnapshot = { ...box, dataURL: dataURL(box) };
		const binding = current.data.records.find(record => record.id === "binding:start")!;
		binding.toId = current.id;
		const first = { x: current.box.x + current.box.width / 2, y: current.box.y + current.box.height / 2 };
		current.appearance.shapes.push({ sourceId: "shape:diamond", x: 300, y: 0, width: 220, height: 140 } as typeof current.captured);
		current.appearance.connectors.push({ sourceId: "shape:bound-arrow", color: "#135790", width: 3.5, points: [first, { x: 300.22, y: 70 }] });
		const result = current.convert();
		const { node, style, metadata } = bound(result, current.id);
		const edgeId = Object.keys(metadata.bindings).find(key => metadata.bindings[key].sourceId === "tldraw:shape:bound-arrow")!;
		const anchor = (metadata.localOverrides[edgeId].connectorAnchors as { from: unknown }).from;
		const resolved = resolveAnchor(anchor, { nodes: { [node.id as string]: { ...node, rotation: style.rotation } } });
		expect(resolved.valid).toBe(true);
		expect(resolved.point!.x).toBeCloseTo(first.x, 9);
		expect(resolved.point!.y).toBeCloseTo(first.y, 9);
	});

	it("keeps customData losses even when visual ink is captured", () => {
		const current = setup();
		current.shape.meta = { important: "semantic annotation" };
		const result = current.convert();
		expect(bound(result, current.id).node.type).toBe("file");
		expect(result.report.entries.some(entry => entry.sourceId === current.id && entry.reason === "customData" && entry.status === "plugin-unsupported")).toBe(true);
	});

	it("retains native text and geometry on their existing paths", () => {
		for (const type of ["text", "label", "solid"] as const) {
			const current = setup("geo");
			if (type === "text") { current.shape.type = "text"; current.shape.props!.richText = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Editable" }] }] }; }
			if (type === "label") current.shape.props!.richText = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Label must survive" }] }] };
			if (type === "solid") Object.assign(current.shape.props!, { geo: "rectangle", dash: "solid", fill: "solid" });
			const result = current.convert();
			expect(bound(result, current.id).node.type).toBe("text");
			expect(result.assets).toHaveLength(1);
		}
	});

	it("declines geo variants and incomplete draws", () => {
		const future = setup("geo"); future.data.schema.sequences["com.tldraw.shape.geo"] = 99;
		const linked = setup("geo"); linked.shape.props!.url = "https://example.test";
		const incomplete = setup(); incomplete.shape.props!.isComplete = false;
		for (const current of [future, linked, incomplete]) {
			expect(bound(current.convert(), current.id).node.type).toBe("text");
			expect(current.convert().assets).toHaveLength(1);
		}
	});

	it("rejects stale sources and unknown source IDs through the existing capture gate", () => {
		const current = setup(); current.convert();
		const fallback = current.convert(null);
		const stale = structuredClone(current.appearance); stale.sourceText += "stale";
		const unknown = structuredClone(current.appearance); unknown.shapes[0].sourceId = "shape:unknown";
		for (const capture of [stale, unknown]) expect(current.convert(capture)).toEqual(fallback);
	});

	it.each(["active", "defs", "text", "image", "external", "style", "tooLarge", "nan", "moved", "clipped", "dimension", "viewBox", "extra", "raster"])("declines %s snapshots without changing the offline approximation", variant => {
		const current = setup();
		const box = current.inkBox;
		if (variant === "active") current.captured.visualSnapshot.dataURL = dataURL(box, "<script>alert(1)</script>");
		if (variant === "defs") current.captured.visualSnapshot.dataURL = dataURL(box, '<defs/><rect width="1" height="1"/>');
		if (variant === "text") current.captured.visualSnapshot.dataURL = dataURL(box, '<text x="0" y="0">Source font</text>');
		if (variant === "image") current.captured.visualSnapshot.dataURL = dataURL(box, '<image width="1" height="1" href="https://example.test/image.png"/>');
		if (variant === "external") current.captured.visualSnapshot.dataURL = dataURL(box, '<rect width="1" height="1" fill="url(https://example.test)"/>');
		if (variant === "style") current.captured.visualSnapshot.dataURL = dataURL(box, '<rect width="1" height="1" style="fill:red"/>');
		if (variant === "tooLarge") current.captured.visualSnapshot.dataURL = dataURL(box, " ".repeat(MAX_IMPORT_SVG_BYTES + 1));
		if (variant === "nan") current.captured.visualSnapshot.x = NaN;
		if (variant === "moved") current.captured.visualSnapshot.x += 1000;
		if (variant === "clipped") current.captured.visualSnapshot.width = 5;
		if (variant === "dimension") current.captured.visualSnapshot.width += 1;
		if (variant === "viewBox") current.captured.visualSnapshot.dataURL = dataURL({ ...box, x: box.x + 1000 });
		if (variant === "extra") Object.assign(current.captured.visualSnapshot, { external: true });
		if (variant === "raster") current.captured.visualSnapshot.dataURL = "data:image/png;base64,AAAA";
		current.convert();
		const baseline = current.convert({ ...current.appearance, shapes: [{ sourceId: current.id, ...current.box }] });
		expect(current.convert()).toEqual(baseline);
	});
});
