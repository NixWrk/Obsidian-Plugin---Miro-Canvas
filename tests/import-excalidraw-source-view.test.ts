import type { App, TFile } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import { readOpenExcalidrawAppearance } from "../src/import-excalidraw-appearance";

vi.mock("../src/import-svg-snapshot", () => ({ capturePassiveSvg: () => "data:image/svg+xml;charset=utf-8,checked" }));

function fixture() {
	const element = { id: "one", type: "rectangle", x: 10, y: 20, width: 100, height: 80, roughness: 2, backgroundColor: "#ffdddd", fillStyle: "hachure", strokeWidth: 2, isDeleted: false };
	const sourceText = JSON.stringify({ type: "excalidraw", version: 2, elements: [element] });
	const file = { path: "Sketch.excalidraw" } as TFile;
	class SourceSvg { querySelector(): object | null { return {}; } }
	const library = { getCommonBoundingBox: vi.fn(() => ({ minX: 10, minY: 20, width: 100, height: 80 })), exportToSvg: vi.fn(async () => new SourceSvg()) };
	const api = { getSceneElements: () => [{ ...element, index: "a0" }], getAppState: () => ({ theme: "light" }) };
	const view = { file, dirty: false, saving: false, data: sourceText, excalidrawAPI: api, packages: { excalidrawLib: library }, getViewType: () => "excalidraw", containerEl: { ownerDocument: { defaultView: { SVGSVGElement: SourceSvg } } } };
	const plugin = { manifest: { version: "2.28.1" } };
	const app = { plugins: { plugins: { "obsidian-excalidraw-plugin": plugin } }, workspace: { getMostRecentLeaf: () => ({ view }) } } as unknown as App;
	return { element, sourceText, file, app, view, library, api, plugin, SourceSvg };
}

describe("audited open Excalidraw visual observation", () => {
	it("exports only static objects without fonts, files or embeddables and keeps source state intact", async () => {
		const f = fixture();
		const before = JSON.stringify(f.view);
		expect(await readOpenExcalidrawAppearance(f.app, f.file, f.sourceText)).toEqual({ sourceText: f.sourceText, snapshots: [{ sourceId: "one", dataURL: "data:image/svg+xml;charset=utf-8,checked", x: -6, y: 4, width: 132, height: 112 }] });
		expect(f.library.exportToSvg).toHaveBeenCalledWith(expect.objectContaining({ files: {}, skipInliningFonts: true, renderEmbeddables: false, exportPadding: 16, appState: expect.objectContaining({ exportEmbedScene: false, exportBackground: false }) }));
		expect(JSON.stringify(f.view)).toBe(before);
	});

	it.each(["dirty", "saving", "version", "file", "text", "live", "theme"])("declines %s before an export", async change => {
		const f = fixture();
		if (change === "dirty") f.view.dirty = true;
		if (change === "saving") f.view.saving = true;
		if (change === "version") f.plugin.manifest.version = "2.29.0";
		if (change === "file") f.view.file = { ...f.file };
		if (change === "text") f.view.data = "stale";
		if (change === "live") f.api.getSceneElements = () => [{ ...f.element, x: 50, index: "a0" }];
		if (change === "theme") f.api.getAppState = () => ({ theme: "dark" });
		expect(await readOpenExcalidrawAppearance(f.app, f.file, f.sourceText)).toBeUndefined();
		expect(f.library.exportToSvg).not.toHaveBeenCalled();
	});

	it("discards the whole observation when the drawing changes during export", async () => {
		const f = fixture();
		f.library.exportToSvg.mockImplementation(async () => { f.view.dirty = true; return new f.SourceSvg(); });
		expect(await readOpenExcalidrawAppearance(f.app, f.file, f.sourceText)).toBeUndefined();
	});

	it("accepts nonvisual load revisions while still refusing changed sketch seeds", async () => {
		const f = fixture();
		Object.assign(f.element, { version: 2, versionNonce: 41, updated: 100, seed: 22 });
		const text = JSON.stringify({ type: "excalidraw", version: 2, elements: [f.element] });
		f.view.data = text;
		f.api.getSceneElements = () => [{ ...f.element, index: "a0", version: 3, versionNonce: 42, updated: 101 }];
		expect(await readOpenExcalidrawAppearance(f.app, f.file, text)).toBeDefined();
		f.api.getSceneElements = () => [{ ...f.element, index: "a0", seed: 23 }];
		expect(await readOpenExcalidrawAppearance(f.app, f.file, text)).toBeUndefined();
	});

	it("bounds failed export attempts and refuses blank exports", async () => {
		const f = fixture();
		const elements = Array.from({ length: 520 }, (_, index) => ({ ...f.element, id: `shape-${index}` }));
		const text = JSON.stringify({ type: "excalidraw", version: 2, elements });
		f.view.data = text;
		f.api.getSceneElements = () => elements.map(element => ({ ...element, index: "a0" }));
		f.library.exportToSvg.mockImplementation(async () => { const svg = new f.SourceSvg(); svg.querySelector = () => null; return svg; });
		const result = await readOpenExcalidrawAppearance(f.app, f.file, text) as { snapshots: unknown[] };
		expect(result.snapshots).toEqual([]);
		expect(f.library.exportToSvg).toHaveBeenCalledTimes(512);
	});

	it.each([true, false])("uses only an already-loaded data raster for reflected images (%s)", async local => {
		const f = fixture();
		Object.assign(f.element, { type: "image", fileId: "picture", scale: [-1, 1] });
		const text = JSON.stringify({ type: "excalidraw", version: 2, elements: [f.element] });
		f.view.data = text;
		const dataURL = local ? "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==" : "https://example.com/image.png";
		Object.assign(f.api, { getFiles: () => ({ picture: { dataURL } }) });
		const result = await readOpenExcalidrawAppearance(f.app, f.file, text) as { snapshots: unknown[] };
		expect(result.snapshots).toHaveLength(local ? 1 : 0);
		if (local) expect(f.library.exportToSvg).toHaveBeenCalledWith(expect.objectContaining({ files: { picture: { dataURL } } }));
		else expect(f.library.exportToSvg).not.toHaveBeenCalled();
	});
});
