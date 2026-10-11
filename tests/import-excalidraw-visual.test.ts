import { describe, expect, it } from "vitest";
import { idFactory, assertImportedBoard } from "../src/importers/board-builder";
import { convertExcalidraw } from "../src/importers/excalidraw";
import type { ImportContext, ImportSource } from "../src/importers/types";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="116" height="96" viewBox="0 0 116 96"><rect x="8" y="8" width="100" height="80" fill="#ffffff"/><text x="20" y="40" font-family="Arial">Label</text></svg>';
const dataURL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(SVG)}`;
const rectangle = { id: "r", type: "rectangle", x: 10, y: 20, width: 100, height: 80, angle: 0, strokeColor: "#000000", backgroundColor: "#ffdddd", fillStyle: "hachure", roughness: 2, opacity: 35, locked: true };
const label = { id: "label", type: "text", x: 30, y: 40, width: 60, height: 30, text: "Label", fontSize: 20, fontFamily: 2, containerId: "r", angle: 0 };
function source(elements: unknown[] = [rectangle, label]): ImportSource {
	return { path: "Drawings/Sketch.excalidraw", extension: "excalidraw", text: JSON.stringify({ type: "excalidraw", version: 2, elements, appState: { theme: "light" } }) };
}
function context(input: ImportSource, changes: Record<string, unknown> = {}): ImportContext {
	return { importerVersion: "test", now: "2026-10-11T00:00:00Z", newId: idFactory(12), resolveLink: () => undefined,
		excalidrawAppearance: { sourceText: input.text, snapshots: [{ sourceId: "r", labelId: "label", dataURL, x: 2, y: 12, width: 116, height: 96, ...changes }] } };
}

describe("observed Excalidraw SVG objects", () => {
	it("retains the complete object as one file, reports sealed text and binds attached edges", () => {
		const input = source([rectangle, label, { id: "a", type: "arrow", x: 110, y: 60, width: 90, height: 0, points: [[0, 0], [90, 0]], startBinding: { elementId: "r" }, angle: 0 }]);
		const before = input.text;
		const result = convertExcalidraw(input, context(input));
		expect(input.text).toBe(before);
		expect(result.assets).toHaveLength(1);
		const nodes = result.document.nodes as { id: string; type: string; file: string }[];
		expect(nodes).toMatchObject([{ type: "file", x: 2, y: 12, width: 116, height: 96 }]);
		const metadata = result.document.miroCanvas as { localOverrides: Record<string, unknown>; connectors: Record<string, { from: unknown }>; bindings: Record<string, unknown> };
		expect(metadata.localOverrides[nodes[0]!.id]).toMatchObject({ showAttachmentName: false, cornerRadius: 0, locked: true, borderStyle: "none", colors: { fill: null, border: null } });
		expect(Object.values(metadata.connectors)[0]!.from).toMatchObject({ type: "node", nodeId: nodes[0]!.id, u: 0.931, v: 0.5 });
		expect(result.report.entries).toMatchObject([{ sourceId: "r", reason: "visualFallback", nodeId: nodes[0]!.id }, { sourceId: "label", reason: "visualFallback", nodeId: nodes[0]!.id }]);
		expect(result.report.entries.some(entry => ["roughness", "hatch", "opacity"].includes(entry.reason))).toBe(false);
		assertImportedBoard(result.document);
	});

	it.each([{ sourceId: "unknown" }, { labelId: "wrong" }, { width: 100 }, { dataURL: "data:image/svg+xml;base64,YQ==" }, { x: NaN }, { x: 50 }, { width: 100_001 }])("falls back without publishing an unused asset for invalid capture %j", changes => {
		const input = source();
		const result = convertExcalidraw(input, context(input, changes));
		expect(result.assets).toBeUndefined();
		expect(result.document.nodes).toMatchObject([{ type: "text" }]);
		expect(result.report.entries.some(entry => entry.reason === "hatch")).toBe(true);
	});

	it("refuses stale or duplicate observations and keeps ordinary shapes editable", () => {
		const input = source();
		for (const capture of [{ sourceText: "old", snapshots: [] }, { sourceText: input.text, snapshots: [{ sourceId: "r" }, { sourceId: "r" }] }]) {
			expect(convertExcalidraw(input, { ...context(input), excalidrawAppearance: capture }).assets).toBeUndefined();
		}
		const plain = source([{ ...rectangle, roughness: 0, fillStyle: "solid", opacity: 100 }, label]);
		expect(convertExcalidraw(plain, context(plain)).assets).toBeUndefined();
	});

	it("retains a reflected linked picture through its observed SVG instead of dropping the flip", () => {
		const input = source([{ ...rectangle, type: "image", fileId: "picture", scale: [-1, 1] }]);
		const result = convertExcalidraw(input, context(input, { labelId: undefined }));
		expect(result.document.nodes).toMatchObject([{ type: "file" }]);
		expect(result.assets).toHaveLength(1);
		expect(result.report.entries).toMatchObject([{ sourceId: "r", reason: "visualFallback" }]);
		expect(result.report.entries.some(entry => entry.reason === "imageScale")).toBe(false);
	});
});
