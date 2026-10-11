/** Read-only appearance facts from an already-open, audited tldraw 1.32.0 view. */
import type { App, TFile } from "obsidian";
import { MAX_TLDRAW_SOURCE_LENGTH } from "./importers/tldraw";

const MAX_SHAPES = 2_000;
const MAX_COORDINATE = 100_000;
const START = "!!!_START_OF_TLDRAW_DATA__DO_NOT_CHANGE_THIS_PHRASE_!!!";
const END = "!!!_END_OF_TLDRAW_DATA__DO_NOT_CHANGE_THIS_PHRASE_!!!";

type JsonRecord = Record<string, unknown>;
type Point = { x: number; y: number };

function read(value: unknown, key: PropertyKey): unknown {
	if ((typeof value !== "object" || value === null) && typeof value !== "function") return undefined;
	try { return Reflect.get(value, key); } catch { return undefined; }
}

function object(value: unknown): value is JsonRecord {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function finite(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= MAX_COORDINATE;
}

function invoke(value: unknown, key: string, ...args: unknown[]): unknown {
	const method = read(value, key);
	if (typeof method !== "function") throw new Error("source editor method unavailable");
	return Reflect.apply(method, value, args) as unknown;
}

function color(value: string): string | null | undefined {
	if (value === "none" || value === "transparent") return null;
	const match = /^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\s*\)$/u.exec(value);
	if (match === null) return undefined;
	const alpha = match[4] === undefined ? 1 : Number(match[4]);
	if (alpha === 0) return null;
	if (alpha !== 1) return undefined;
	const bytes = match.slice(1, 4).map(Number);
	if (bytes.some(byte => byte < 0 || byte > 255)) return undefined;
	return "#" + bytes.map(byte => byte.toString(16).padStart(2, "0")).join("");
}

/** Compare saved JSON with live records without depending on object key order. */
function sameJSON(saved: unknown, live: unknown, depth = 0): boolean {
	if (depth > 32) return false;
	if (saved === live) return true;
	if (Array.isArray(saved)) {
		return Array.isArray(live) && saved.length === live.length
			&& saved.every((value: unknown, index) => sameJSON(value, live[index], depth + 1));
	}
	if (!object(saved) || !object(live)) return false;
	const keys = Object.keys(saved);
	return keys.length === Object.keys(live).length
		&& keys.every(key => Object.prototype.hasOwnProperty.call(live, key) && sameJSON(saved[key], live[key], depth + 1));
}

function savedFile(file: TFile, sourceText: string): JsonRecord | undefined {
	if (sourceText.length > MAX_TLDRAW_SOURCE_LENGTH) return undefined;
	if (file.extension.toLowerCase() === "tldr") {
		const data: unknown = JSON.parse(sourceText);
		return object(data) ? data : undefined;
	}
	if (file.extension.toLowerCase() !== "md") return undefined;
	const start = sourceText.indexOf(START);
	const end = sourceText.indexOf(END);
	if (start < 0 || end <= start || sourceText.indexOf(START, start + START.length) !== -1
		|| sourceText.indexOf(END, end + END.length) !== -1) return undefined;
	const data: unknown = JSON.parse(sourceText.slice(start + START.length, end).trim());
	if (!object(data) || !object(data.meta) || data.meta["plugin-version"] !== "1.32.0"
		|| data.meta["tldraw-version"] !== "5.4.0" || !object(data.raw)) return undefined;
	return data.raw;
}

function matrix(value: unknown): { a: number; b: number; c: number; d: number; e: number; f: number } | undefined {
	const a = read(value, "a");
	const b = read(value, "b");
	const c = read(value, "c");
	const d = read(value, "d");
	const e = read(value, "e");
	const f = read(value, "f");
	return finite(a) && finite(b) && finite(c) && finite(d) && finite(e) && finite(f) ? { a, b, c, d, e, f } : undefined;
}

function bounds(value: unknown): { x: number; y: number; w: number; h: number } | undefined {
	const x = read(value, "x");
	const y = read(value, "y");
	const w = read(value, "w");
	const h = read(value, "h");
	return finite(x) && finite(y) && finite(w) && finite(h) && w >= 0 && h >= 0 ? { x, y, w, h } : undefined;
}

/** Missing, stale, virtualized or unfamiliar source views use the offline approximation. */
export function readOpenTldrawAppearance(app: App, file: TFile, sourceText: string): unknown {
	try {
		const plugin = read(read(read(app, "plugins"), "plugins"), "tldraw");
		if (read(read(plugin, "manifest"), "version") !== "1.32.0") return undefined;
		const editor = read(plugin, "currTldrawEditor");
		const container = invoke(editor, "getContainer") as HTMLElement | undefined;
		const owner = container?.ownerDocument.defaultView;
		if (owner === undefined || owner === null || !(container instanceof owner.HTMLElement)) return undefined;
		const views = app.workspace.getLeavesOfType("tldraw-view");
		if (!views.some(leaf => read(leaf.view, "file") === file
			&& leaf.view.containerEl.contains(container))) return undefined;
		const data = savedFile(file, sourceText);
		if (data?.tldrawFileFormatVersion !== 1 || !object(data.schema) || data.schema.schemaVersion !== 2
			|| !Array.isArray(data.records) || data.records.length > 10_000) return undefined;
		const pages = data.records.filter((value: unknown) => object(value) && value.typeName === "page") as JsonRecord[];
		if (pages.length !== 1 || invoke(editor, "getCurrentPageId") !== pages[0].id) return undefined;
		const store = read(editor, "store");
		for (const value of data.records as unknown[]) {
			if (!object(value) || (value.typeName !== "binding" && value.typeName !== "asset")) continue;
			if (typeof value.id !== "string" || !sameJSON(value, invoke(store, "get", value.id))) return undefined;
		}
		const records = data.records.filter((value: unknown) => object(value) && value.typeName === "shape") as JsonRecord[];
		if (records.length === 0 || records.length > MAX_SHAPES) return undefined;
		const live = invoke(editor, "getCurrentPageShapes");
		if (!Array.isArray(live) || live.length !== records.length) return undefined;
		const byId = new Map<string, JsonRecord>();
		for (const value of live as unknown[]) {
			if (!object(value) || typeof value.id !== "string" || byId.has(value.id)) return undefined;
			byId.set(value.id, value);
		}
		const shells = new Map<string, HTMLElement>();
		for (const element of Array.from(container.querySelectorAll<HTMLElement>("[data-shape-id]"))) {
			const id = element.dataset.shapeId;
			if (id === undefined || shells.has(id)) return undefined;
			shells.set(id, element);
		}
		const dark = container.classList.contains("tl-theme__dark");
		if (!dark && !container.classList.contains("tl-theme__light")) return undefined;
		const shapes: unknown[] = [];
		const connectors: unknown[] = [];
		let pointCount = 0;
		for (const source of records) {
			if (typeof source.id !== "string" || source.id.length > 512 || source.parentId !== pages[0].id
				|| !sameJSON(source, byId.get(source.id))) return undefined;
			const shell = shells.get(source.id);
			const transform = matrix(invoke(editor, "getShapePageTransform", source.id));
			const box = bounds(read(invoke(editor, "getShapeGeometry", source.id), "bounds"));
			if (shell === undefined || transform === undefined || box === undefined) return undefined;
			const paths = Array.from(shell.querySelectorAll("path")).filter(path => {
				const paint = owner.getComputedStyle(path);
				return paint.stroke !== "none" && Number.parseFloat(paint.strokeWidth) > 0;
			});
			const path = paths[0];
			const paint = path === undefined ? undefined : owner.getComputedStyle(path);
			if (source.type === "line" || source.type === "arrow") {
				if (path === undefined || !path.instanceOf(owner.SVGGeometryElement) || paint === undefined) return undefined;
				const length = path.getTotalLength();
				const localMatrix = path.getCTM();
				const ink = color(paint.stroke);
				const width = Number.parseFloat(paint.strokeWidth);
				if (!finite(length) || length <= 0 || localMatrix === null || matrix(localMatrix) === undefined
					|| ink === undefined || ink === null || !finite(width) || width <= 0 || width > 100) return undefined;
				const points: Point[] = [];
				for (let index = 0; index < 33; index += 1) {
					const sample = path.getPointAtLength(length * index / 32);
					const local = new owner.DOMPoint(sample.x, sample.y).matrixTransform(localMatrix);
					const x = transform.a * local.x + transform.c * local.y + transform.e;
					const y = transform.b * local.x + transform.d * local.y + transform.f;
					if (!finite(x) || !finite(y)) return undefined;
					points.push({ x, y });
				}
				pointCount += points.length;
				if (pointCount > 100_000) return undefined;
				connectors.push({ sourceId: source.id, points, color: ink, width });
				continue;
			}
			const textElement = shell.querySelector("p");
			const textStyle = textElement === null ? undefined : owner.getComputedStyle(textElement);
			const border = paint === undefined ? null : color(paint.stroke);
			const fill = paint === undefined ? null : color(paint.fill);
			const text = textStyle === undefined ? dark ? "#f2f2f2" : "#1d1d1d" : color(textStyle.color);
			if (border === undefined || fill === undefined || text === undefined || text === null) return undefined;
			let ink = border;
			let width = paint === undefined ? 0 : Number.parseFloat(paint.strokeWidth);
			if (source.type === "draw") {
				const filled = Array.from(shell.querySelectorAll("path")).find(element => owner.getComputedStyle(element).fill !== "none");
				if (filled === undefined) return undefined;
				const drawInk = color(owner.getComputedStyle(filled).fill);
				if (drawInk === undefined || drawInk === null) return undefined;
				ink = drawInk;
				// The pure subset is black/m/non-pen; nominal width is pinned SDK 5.4.0 data.
				width = 4.5;
			}
			if (!finite(width) || width < 0 || width > 100) return undefined;
			const props = source.props;
			if (!object(props)) return undefined;
			const typography = textStyle === undefined ? undefined : {
				fontFamily: textStyle.fontFamily,
				fontSize: Number.parseFloat(textStyle.fontSize),
				lineHeight: Number.parseFloat(textStyle.lineHeight) / Number.parseFloat(textStyle.fontSize),
				alignment: textStyle.textAlign === "center" ? "center" : textStyle.textAlign === "end" || textStyle.textAlign === "right" ? "right" : "left",
				verticalAlign: source.type === "text" || props.verticalAlign === "start" ? "top" : props.verticalAlign === "end" ? "bottom" : "center",
			};
			const localX = box.x + box.w / 2;
			const localY = box.y + box.h / 2;
			const x = transform.a * localX + transform.c * localY + transform.e - box.w / 2;
			const y = transform.b * localX + transform.d * localY + transform.f - box.h / 2;
			if (!finite(x) || !finite(y)) return undefined;
			shapes.push({ sourceId: source.id, x, y, width: Math.max(1, box.w), height: Math.max(1, box.h),
				style: { colors: { fill, border: ink, text }, borderWidth: width,
					borderStyle: ink === null ? "none" : props.dash === "dashed" ? "dashed" : props.dash === "dotted" ? "dotted" : "solid",
					...(typography === undefined ? {} : { typography }) } });
		}
		return { sourceText, theme: dark ? "dark" : "light", shapes, connectors };
	} catch {
		return undefined;
	}
}
