import type { App, TFile } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import { readOpenTldrawAppearance } from "../src/import-tldraw-appearance";
import { readEmbeddedAsset } from "../src/importers/assets";

const capture = vi.hoisted(() => vi.fn());
vi.mock("../src/import-svg-snapshot", () => ({ capturePassiveSvg: capture }));

type Point = { x: number; y: number };
type Matrix = { a: number; b: number; c: number; d: number; e: number; f: number };
const IDENTITY: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

/** Instrumented DOM/model protocol; original editor/runtime acceptance is tested separately. */
function fixture() {
	const styles = new Map<unknown, Record<string, string>>();
	class Element {
		ownerDocument!: { defaultView: typeof owner };
		parentElement: Element | null = null;
		dataset: Record<string, string> = {};
		classList = { contains: (name: string) => name === "tl-theme__dark" };
		querySelectorAll(_selector: string): Element[] { return []; }
		querySelector(_selector: string): Element | null { return null; }
		contains(element: unknown) { return element === container || element === shell || element === root; }
		getAttribute(_name: string): string | null { return null; }
		hasAttribute(_name: string): boolean { return false; }
		instanceOf(constructor: typeof Element) { return this instanceof constructor; }
	}
	class SVG extends Element {
		getCTM() { return viewport; }
		getBBox() { return ink; }
	}
	class Path extends Element {}
	const defaults = { fill: "rgb(19, 87, 144)", stroke: "none", strokeWidth: "0", color: "rgb(242, 242, 242)", opacity: "1", display: "block", visibility: "visible" };
	const owner = { HTMLElement: Element, SVGSVGElement: SVG, getComputedStyle(element: unknown) {
		const values = { ...defaults, ...styles.get(element) };
		return { ...values, getPropertyValue: (name: string) => values[name as keyof typeof values] ?? "" };
	} };
	const container = new Element();
	const shell = new Element(); shell.dataset.shapeId = "shape:draw";
	const root = new SVG(); root.parentElement = shell;
	const path = new Path(); path.parentElement = root;
	for (const element of [container, shell, root, path]) element.ownerDocument = { defaultView: owner };
	container.querySelectorAll = selector => selector === "[data-shape-id]" ? [shell] : [];
	shell.querySelectorAll = selector => selector === "svg" ? [root] : selector === "path" ? [path] : [];
	root.querySelectorAll = selector => selector === "*" ? [path] : [];
	const sourceShape = { id: "shape:draw", typeName: "shape", type: "draw", parentId: "page:p", index: "a1", x: 100, y: 200, rotation: 0.2, opacity: 1, props: { isComplete: true }, meta: {} };
	const records = [{ id: "page:p", typeName: "page" }, sourceShape];
	const saved = { tldrawFileFormatVersion: 1, schema: { schemaVersion: 2 }, records };
	const live = structuredClone(sourceShape);
	const matrix: Matrix = { a: Math.cos(0.2), b: Math.sin(0.2), c: -Math.sin(0.2), d: Math.cos(0.2), e: 100, f: 200 };
	let viewport = { ...IDENTITY };
	let ink = { x: -2, y: -2, width: 44, height: 24 };
	const editor = { getContainer: () => container, getCurrentPageId: () => "page:p", getCurrentPageShapes: () => [live], getShapePageTransform: () => matrix,
		getShapeGeometry: () => ({ bounds: { x: 0, y: 0, w: 40, h: 20 } }), store: { get: (id: string) => records.find(record => record.id === id) },
		getSvg: vi.fn(() => { throw new Error("foreign export forbidden"); }), getSvgString: vi.fn(() => { throw new Error("foreign export forbidden"); }) };
	const file = { extension: "tldr", path: "Authored/source.tldr" } as TFile;
	const plugin = { manifest: { version: "1.32.0" }, currTldrawEditor: editor };
	const view = { file, containerEl: container };
	const app = { plugins: { plugins: { tldraw: plugin } }, workspace: { getLeavesOfType: () => [{ view }] } } as unknown as App;
	capture.mockReset().mockImplementation((_root, box: { x: number; y: number; width: number; height: number }) =>
		`data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${box.width}" height="${box.height}" viewBox="${box.x} ${box.y} ${box.width} ${box.height}"><rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" fill="#135790"/></svg>`)}`);
	return { app, file, plugin, editor, view, root, shell, path, styles, records, sourceShape, live, matrix, setViewport(value: Matrix) { viewport = value; }, setInk(value: typeof ink) { ink = value; }, text: () => JSON.stringify(saved), read: () => readOpenTldrawAppearance(app, file, JSON.stringify(saved)) };
}
type Appearance = { sourceText: string; theme: string; shapes: { sourceId: string; visualSnapshot?: { dataURL: string; x: number; y: number; width: number; height: number } }[] };

describe("pinned readonly tldraw draw snapshot capture", () => {
	it("reads the actual shape SVG, bakes its viewport/page transform, and retains exact source identity", () => {
		const current = fixture();
		current.setViewport({ a: 2, b: 0, c: 0, d: 2, e: 3, f: 4 });
		const before = current.text();
		const result = current.read() as Appearance;
		const snapshot = result.shapes[0].visualSnapshot!;
		expect(result).toMatchObject({ sourceText: before, theme: "dark", shapes: [{ sourceId: "shape:draw" }] });
		expect(capture).toHaveBeenCalledWith(current.root, { x: -2, y: -2, width: 44, height: 24 });
		const local: Point[] = [{ x: -1, y: 0 }, { x: 87, y: 0 }, { x: -1, y: 48 }, { x: 87, y: 48 }];
		const world = local.map(point => ({ x: current.matrix.a * point.x + current.matrix.c * point.y + 100, y: current.matrix.b * point.x + current.matrix.d * point.y + 200 }));
		expect(snapshot.x).toBeCloseTo(Math.min(...world.map(point => point.x)), 10);
		expect(snapshot.y).toBeCloseTo(Math.min(...world.map(point => point.y)), 10);
		const checked = readEmbeddedAsset(snapshot.dataURL);
		expect(checked.ok).toBe(true);
		if (checked.ok) expect(new TextDecoder().decode(checked.bytes)).toContain("transform=\"matrix(");
		expect(current.text()).toBe(before);
		expect(current.editor.getSvg).not.toHaveBeenCalled();
		expect(current.editor.getSvgString).not.toHaveBeenCalled();
	});

	it("retains shape opacity from the enclosing source DOM without applying rotation twice", () => {
		const current = fixture(); current.styles.set(current.shell, { opacity: "0.5" }); current.sourceShape.opacity = 0.5; current.live.opacity = 0.5;
		const result = current.read() as Appearance;
		const asset = readEmbeddedAsset(result.shapes[0].visualSnapshot!.dataURL);
		expect(asset.ok).toBe(true);
		if (asset.ok) expect(new TextDecoder().decode(asset.bytes)).toContain('opacity="0.5"');
	});

	it.each(["stale", "plugin", "file", "binding", "asset"])("declines %s source identity before SVG capture", variant => {
		const current = fixture();
		if (variant === "stale") current.live.x += 1;
		if (variant === "plugin") current.plugin.manifest.version = "future";
		if (variant === "file") current.view.file = { ...current.file } as TFile;
		if (variant === "binding" || variant === "asset") current.records.push({ id: variant + ":missing", typeName: variant } as typeof current.sourceShape);
		if (variant === "binding" || variant === "asset") current.editor.store.get = () => undefined;
		expect(current.read()).toBeUndefined();
		expect(capture).not.toHaveBeenCalled();
	});

	it.each(["declined", "cssTransform", "filter", "font", "nonfinite", "geo", "incomplete", "duplicateSVG"])("omits only the visual snapshot for %s and retains the ordinary appearance facts", variant => {
		const current = fixture();
		if (variant === "declined") capture.mockReturnValue(undefined);
		if (variant === "cssTransform") current.styles.set(current.path, { transform: "matrix(1, 0, 0, 1, 1, 1)" });
		if (variant === "filter") current.styles.set(current.shell, { filter: "url(#shadow)" });
		if (variant === "font") current.root.querySelector = () => current.path;
		if (variant === "nonfinite") current.setInk({ x: NaN, y: 0, width: 44, height: 24 });
		if (variant === "geo") { current.sourceShape.type = "geo"; current.live.type = "geo"; }
		if (variant === "incomplete") { current.sourceShape.props.isComplete = false; current.live.props.isComplete = false; }
		if (variant === "duplicateSVG") current.shell.querySelectorAll = selector => selector === "svg" ? [current.root, current.root] : selector === "path" ? [current.path] : [];
		const result = current.read() as Appearance;
		expect(result.shapes[0].sourceId).toBe("shape:draw");
		expect(result.shapes[0].visualSnapshot).toBeUndefined();
	});
});
