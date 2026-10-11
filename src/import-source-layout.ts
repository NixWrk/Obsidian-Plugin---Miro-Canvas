/** Read only the layout of an audited, already-open source view. */
import type { App, TFile } from "obsidian";
import { parseMindmapOutline, type OutlineNode } from "./importers/mindmap-outline";
import { joinSourcePath, type SourcePathSegment } from "./source-path-chain";
import { isSafeFontFamily } from "./appearance";

const AUDITED_VIEWS = [
	{ id: "obsidian-enhancing-mindmap", version: "0.2.5", type: "mindmapView" },
	{ id: "obsidian-markmind", version: "3.7.4", type: "mindmapview" },
] as const;
const MAX_NODES = 2_000;
const MAX_POINTS = 100_000;

function read(value: unknown, key: PropertyKey): unknown {
	if ((typeof value !== "object" || value === null) && typeof value !== "function") return undefined;
	try { return Reflect.get(value, key); } catch { return undefined; }
}
function finite(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 100_000;
}
function color(value: string): string | null | undefined {
	if (/^#[0-9a-f]{6}$/iu.test(value)) return value;
	const match = /^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\s*\)$/u.exec(value);
	if (match === null) return undefined;
	const alpha = match[4] === undefined ? 1 : Number(match[4]);
	if (alpha === 0) return null;
	if (alpha !== 1) return undefined;
	const bytes = match.slice(1, 4).map(Number);
	if (bytes.some(byte => byte < 0 || byte > 255)) return undefined;
	return `#${bytes.map(byte => byte.toString(16).padStart(2, "0")).join("")}`;
}
/** Keep the source's safe fallback order within the existing metadata bound. */
function fontFamily(value: string): string | undefined {
	const families: string[] = [];
	for (const part of value.split(",")) {
		const family = part.trim().replace(/^(["'])(.*)\1$/u, "$2");
		if (!isSafeFontFamily(family)) continue;
		if (isSafeFontFamily([...families, family].join(", "))) families.push(family);
	}
	return families.length === 0 ? undefined : families.join(", ");
}
function rows(root: OutlineNode): { node: OutlineNode; parentLine: number | null }[] {
	const pending = [{ node: root, parentLine: null as number | null }];
	const result: { node: OutlineNode; parentLine: number | null }[] = [];
	while (pending.length > 0) {
		const entry = pending.pop()!;
		if (result.length >= MAX_NODES) return [];
		result.push(entry);
		for (let index = entry.node.children.length - 1; index >= 0; index -= 1) pending.push({ node: entry.node.children[index], parentLine: entry.node.line });
	}
	return result;
}

function richRows(sourceText: string): { node: OutlineNode; parentLine: number | null; sourceId: string; parentId: string | null }[] | undefined {
	const match = /^```[ \t]*json[ \t]*\r?\n([\s\S]+?)\r?\n```[ \t]*(?:\r?\n|$)/imu.exec(sourceText);
	if (match === null) return undefined;
	const data: unknown = JSON.parse(match[1]);
	const maps = read(data, "mindData");
	if (!Array.isArray(maps) || maps.length !== 1 || !Array.isArray(maps[0]) || maps[0].length > MAX_NODES) return undefined;
	const byId = new Map<string, { node: OutlineNode; parentLine: number | null; sourceId: string; parentId: string | null }>();
	for (const [index, record] of maps[0].entries()) {
		const id = read(record, "id");
		const text = read(record, "text");
		const parent = read(record, "pid");
		if (typeof id !== "string" || typeof text !== "string" || byId.has(id) || parent !== undefined && typeof parent !== "string") return undefined;
		byId.set(id, { sourceId: id, parentId: parent === undefined ? null : parent, parentLine: null,
			node: { kind: "text", line: index + 1, text, lines: [index + 1], children: [], folded: read(record, "isExpand") === false } });
	}
	let root: typeof byId extends Map<string, infer T> ? T | undefined : never;
	for (const entry of byId.values()) {
		if (entry.parentId === null) {
			if (root !== undefined) return undefined;
			root = entry;
		} else {
			const parent = byId.get(entry.parentId);
			if (parent === undefined || parent === entry) return undefined;
			entry.parentLine = parent.node.line;
			parent.node.children.push(entry.node);
		}
	}
	if (root === undefined) return undefined;
	const ordered = rows(root.node);
	if (ordered.length !== byId.size) return undefined;
	const byLine = new Map([...byId.values()].map(entry => [entry.node.line, entry]));
	return ordered.map(entry => byLine.get(entry.node.line)!);
}

/** Unrecognized, dirty, stale or incomplete source views leave the offline adapter in use. */
export function readOpenMindmapLayout(app: App, file: TFile, sourceText: string): unknown {
	try {
		const view = read(read(app.workspace, "activeLeaf"), "view");
		if (read(view, "file") !== file || read(view, "dirty") === true || read(view, "saving") === true) return undefined;
		const viewType = read(view, "getViewType");
		if (typeof viewType !== "function") return undefined;
		const type: unknown = Reflect.apply(viewType, view, []);
		const plugins = read(read(app, "plugins"), "plugins");
		if (!AUDITED_VIEWS.some(audit => type === audit.type && read(read(read(plugins, audit.id), "manifest"), "version") === audit.version)) return undefined;
		const outline = parseMindmapOutline(sourceText);
		if (outline.format !== "basic" && outline.format !== "rich") return undefined;
		if (outline.format === "basic" && (outline.preamble !== undefined || outline.roots.length !== 1)) return undefined;
		const expected = outline.format === "rich" ? richRows(sourceText) : rows(outline.roots[0]).map(entry => ({ ...entry, sourceId: `line:${entry.node.line}`, parentId: entry.parentLine === null ? null : `line:${entry.parentLine}` }));
		if (expected === undefined) return undefined;
		if (expected.length === 0 || expected.some(row => row.node.folded)) return undefined;
		const content = read(view, "contentEl") as HTMLElement | undefined;
		const owner = content?.ownerDocument.defaultView;
		if (owner === undefined || owner === null) return undefined;
		const model = read(view, "mindmap");
		const pending: unknown[] = [read(model, "root")];
		const actual: unknown[] = [];
		const seen = new Set<unknown>();
		while (pending.length > 0) {
			const node = pending.pop();
			if (node === undefined || seen.has(node) || actual.length >= MAX_NODES) return undefined;
			seen.add(node);
			actual.push(node);
			const children = read(node, "children");
			if (!Array.isArray(children)) return undefined;
			for (let index = children.length - 1; index >= 0; index -= 1) pending.push(children[index]);
		}
		if (actual.length !== expected.length) return undefined;
		const nodes = actual.map((node, index) => {
			const row = expected[index];
			const data = read(node, "data");
			const box = read(node, "box");
			const shell = read(node, "containEl");
			const label = read(node, "contentEl");
			if (read(data, "text") !== row.node.text || !Array.isArray(read(node, "children"))
				|| (read(node, "children") as unknown[]).length !== row.node.children.length
				|| !(shell instanceof owner.HTMLElement) || !(label instanceof owner.HTMLElement)
				|| !content!.contains(shell) || !shell.contains(label)) throw new Error("source nodes differ");
			const x = read(box, "x");
			const y = read(box, "y");
			const width = read(box, "width");
			const height = read(box, "height");
			if (!finite(x) || !finite(y) || !finite(width) || !finite(height) || width < 1 || height < 1) throw new Error("source box unavailable");
			const style = owner.getComputedStyle(label);
			const fontSize = Number.parseFloat(style.fontSize);
			const textColor = color(style.color);
			const fill = color(style.backgroundColor);
			const border = color(style.borderTopColor);
			const borderWidth = Number.parseFloat(style.borderTopWidth);
			const cornerRadius = Number.parseFloat(style.borderTopLeftRadius);
			if (textColor === undefined || textColor === null || fill === undefined || border === undefined || !finite(fontSize) || !finite(borderWidth)) throw new Error("source style unavailable");
			const lineHeight = Number.parseFloat(style.lineHeight) / fontSize;
			const family = fontFamily(style.fontFamily);
			return { sourceLine: row.node.line, parentLine: row.parentLine, sourceId: row.sourceId, parentId: row.parentId, text: row.node.text, x, y, width, height, style: {
				typography: { ...(family === undefined ? {} : { fontFamily: family }), fontSize, ...(Number.isFinite(lineHeight) ? { lineHeight } : {}), alignment: "left", verticalAlign: "center", format: { bold: Number(style.fontWeight) >= 600 } },
				colors: { text: textColor, fill, border }, borderStyle: borderWidth === 0 ? "none" : "solid", borderWidth,
				...(Number.isFinite(cornerRadius) && cornerRadius >= 0 ? { cornerRadius } : {}),
			} };
		});
		const byLine = new Map(nodes.map(node => [node.sourceLine, node]));
		const unmatched = nodes.filter(node => node.parentLine !== null);
		const edges: unknown[] = [];
		const segments: SourcePathSegment[] = [];
		let pointCount = 0;
		const svg = read(read(model, "draw"), "node");
		if (!(svg instanceof owner.SVGSVGElement) || !content!.contains(svg)) return undefined;
		const rootInverse = svg.getScreenCTM()?.inverse();
		if (rootInverse === undefined) return undefined;
		const distance = (p: { x: number; y: number }, rect: typeof nodes[number]): number => Math.hypot(Math.max(rect.x - p.x, 0, p.x - rect.x - rect.width), Math.max(rect.y - p.y, 0, p.y - rect.y - rect.height));
		const atBorder = (point: { x: number; y: number }, node: typeof nodes[number]): { x: number; y: number } => ({
			x: Math.min(Math.round(node.x) + Math.max(1, Math.round(node.width)), Math.max(Math.round(node.x), point.x)),
			y: Math.min(Math.round(node.y) + Math.max(1, Math.round(node.height)), Math.max(Math.round(node.y), point.y)),
		});
		for (const path of Array.from(svg.querySelectorAll("path,line,polyline"))) {
			if (!path.instanceOf(owner.SVGGeometryElement)) continue;
			const length = path.getTotalLength();
			if (!finite(length) || length <= 0) continue;
			const pathMatrix = path.getScreenCTM();
			if (pathMatrix === null) return undefined;
			const worldPoint = (offset: number): DOMPoint => {
				const point = path.getPointAtLength(offset);
				return new owner.DOMPoint(point.x, point.y).matrixTransform(pathMatrix).matrixTransform(rootInverse);
			};
			const first = worldPoint(0);
			const last = worldPoint(length);
			const paint = owner.getComputedStyle(path);
			const ink = color(paint.stroke);
			const width = Number.parseFloat(paint.strokeWidth);
			if (ink === undefined || ink === null || !finite(width) || width <= 0) continue;
			const polyline = path.instanceOf(owner.SVGPolylineElement) ? path.points : undefined;
			if (polyline !== undefined && polyline.numberOfItems > 64) return undefined;
			const count = polyline?.numberOfItems ?? (path.tagName === "line" ? 2 : length < 30 ? 9 : 33);
			const points = Array.from({ length: count }, (_, index) => {
				if (polyline !== undefined) {
					const local = polyline.getItem(index);
					const point = new owner.DOMPoint(local.x, local.y).matrixTransform(pathMatrix).matrixTransform(rootInverse);
					return { x: point.x, y: point.y };
				}
				const point = worldPoint(length * index / (count - 1));
				return { x: point.x, y: point.y };
			});
			if (polyline !== undefined) {
				for (let index = 1; index < points.length; index += 1) segments.push({ points: [points[index - 1], points[index]], color: ink, width, straight: true });
			} else segments.push({ points, color: ink, width, straight: path.tagName === "line" });
			pointCount += points.length;
			if (pointCount > MAX_POINTS) return undefined;
			const matches = unmatched.map(node => ({ node, gap: distance(first, byLine.get(node.parentLine!)!) + distance(last, node) })).sort((a, b) => a.gap - b.gap);
			if (matches.length === 0 || matches[0].gap > 0.25 || matches.length > 1 && matches[1].gap - matches[0].gap < 0.25) continue;
			const child = matches[0].node;
			const parent = byLine.get(child.parentLine!)!;
			if (distance(first, parent) > 0) points.unshift(atBorder(first, parent));
			if (distance(last, child) > 0) points.push(atBorder(last, child));
			edges.push({ parentLine: child.parentLine, childLine: child.sourceLine, parentId: child.parentId, childId: child.sourceId, points, color: ink, width });
			unmatched.splice(unmatched.indexOf(child), 1);
		}
		for (const child of unmatched) {
			const parent = byLine.get(child.parentLine!)!;
			// Enhancing draws a two-pixel underline just below a leaf's label box.
			const segment = joinSourcePath(segments, parent, child, 3);
			if (segment === undefined) return undefined;
			const points = [...segment.points];
			if (distance(points[0], parent) > 0) points.unshift(atBorder(points[0], parent));
			if (distance(points[points.length - 1], child) > 0) points.push(atBorder(points[points.length - 1], child));
			if (points.length > 66) return undefined;
			edges.push({ parentLine: child.parentLine, childLine: child.sourceLine, parentId: child.parentId, childId: child.sourceId, points, color: segment.color, width: segment.width });
		}
		return { sourceText, nodes, edges, theme: content!.ownerDocument.body.classList.contains("theme-dark") ? "dark" : "light" };
	} catch {
		return undefined;
	}
}
