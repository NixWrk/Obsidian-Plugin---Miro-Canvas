/**
 * The evidenced Markmind 3.7.4 rich TREE: a fenced flat id/text/pid/x/y list.
 * Reads user-authored data only; no editor implementation or runtime.
 * Native cards keep Markdown; implicit branches are edges. A checked source
 * snapshot supplies reflowed geometry and appearance. Fallback sizes/paths
 * and unsupported rich components remain explicit losses, never fabricated.
 */
import { isSafeFontFamily, isValidFontSize } from "../appearance";
import { MAX_WAYPOINTS } from "../connector-route";
import { validateMiroCanvasMetadata } from "../metadata";
import { BoardBuilder, type BoardRect, type CardOptions, type ImportedCardStyle } from "./board-builder";
import { ImportError, MAX_IMPORT_ELEMENTS, MAX_IMPORT_SOURCE_LENGTH, type FormatAdapter, type ImportContext, type ImportResult, type ImportSource } from "./types";

type RecordValue = Readonly<Record<string, unknown>>;
const COMPONENTS = ["induceData", "wireFrameData", "relateLinkData", "calloutData"] as const;
const NODE_FIELDS = new Set(["id", "text", "pid", "x", "y", "isRoot", "main", "style", "stroke", "isExpand", "collapseMark", "hasMark", "useHandMode", "useScale", "layout"]);
const ENVELOPE_FIELDS = new Set(["theme", "mindData", ...COMPONENTS, "opt", "scrollLeft", "scrollTop", "transformOrigin"]);
const MAX_LAYOUT_NODES = 5_000;
const MAX_LAYOUT_POINTS = 100_000;
const MAX_LABEL_LENGTH = 1024 * 1024;

export interface MarkmindRichNode {
	readonly sourceId: string;
	readonly parentId: string | null;
	readonly text: string;
	readonly x: number;
	readonly y: number;
	readonly raw: RecordValue;
}

export interface ParsedMarkmindRich {
	readonly nodes: readonly MarkmindRichNode[];
	readonly raw: RecordValue;
	readonly noteBody: string;
	readonly properties: readonly string[];
}

interface CapturedNode extends BoardRect {
	readonly style: ImportedCardStyle;
}
interface CapturedEdge {
	readonly color: string;
	readonly width: number;
	readonly points: readonly { readonly x: number; readonly y: number }[];
}
interface CapturedLayout {
	readonly nodes: ReadonlyMap<string, CapturedNode>;
	readonly edges: ReadonlyMap<string, CapturedEdge>;
	readonly theme?: "light" | "dark";
}

function record(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
function finite(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 100_000;
}
function sourceId(value: unknown): value is string {
	return typeof value === "string" && value.length > 0 && value.length <= 256 && !Array.from(value).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
}
function meaningful(value: unknown): boolean {
	return value !== undefined && value !== null && value !== "" && value !== false
		&& (!Array.isArray(value) || value.length > 0) && (!record(value) || Object.keys(value).length > 0);
}

function frontmatter(text: string): { body: string; format?: string; properties: string[] } {
	const normalized = text.replace(/^\ufeff/u, "").replace(/\r\n?/gu, "\n");
	const match = /^---[ \t]*\n([\s\S]*?)\n(?:---|\.\.\.)[ \t]*(?:\n|$)/u.exec(normalized);
	if (match === null) return { body: normalized, properties: [] };
	let format: string | undefined;
	const properties: string[] = [];
	for (const line of match[1].split("\n")) {
		const property = /^([^\s#:][^:]*):[ \t]*(.*)$/u.exec(line);
		if (property === null) continue;
		if (property[1].trim() !== "mindmap-plugin") properties.push(property[1].trim());
		else {
			if (format !== undefined) throw new ImportError("unknownStructure", "duplicate mindmap-plugin property");
			format = property[2].replace(/[ \t]+#.*$/u, "").replace(/^(["'])(.*)\1$/u, "$2").trim().toLowerCase();
		}
	}
	return { body: normalized.slice(match[0].length), properties, ...(format === undefined ? {} : { format }) };
}

export function detectMarkmindRich(source: ImportSource): boolean {
	if (source.extension.toLowerCase() !== "md") return false;
	try {
		const property = source.frontmatter?.["mindmap-plugin"];
		return typeof property === "string" ? property.trim().toLowerCase() === "rich" : frontmatter(source.text).format === "rich";
	} catch {
		return false;
	}
}

/** Checked flat rows and raw evidence, for the host's own source-view mapping. */
export function parseMarkmindRichSource(sourceText: string): ParsedMarkmindRich {
	if (sourceText.length > MAX_IMPORT_SOURCE_LENGTH) throw new ImportError("tooLarge", "Markmind source exceeds the text limit");
	const note = frontmatter(sourceText);
	if (note.format !== "rich") throw new ImportError("unknownStructure", "expected mindmap-plugin: rich");
	const fences = [...note.body.matchAll(/^ {0,3}(`{3,})[ \t]*json[ \t]*\n([\s\S]*?)\n {0,3}\1[ \t]*(?=\n|$)/gimu)];
	if (fences.length !== 1) throw new ImportError("unknownStructure", "expected one rich JSON fence");
	let raw: unknown;
	try {
		raw = JSON.parse(fences[0][2]);
	} catch {
		throw new ImportError("unreadableData", "rich JSON could not be parsed");
	}
	if (!record(raw) || !Array.isArray(raw.mindData) || raw.mindData.length !== 1 || !Array.isArray(raw.mindData[0])) {
		throw new ImportError("unknownStructure", "only one flat rich tree is evidenced");
	}
	const rows: unknown[] = raw.mindData[0];
	if (rows.length === 0) throw new ImportError("unknownStructure", "rich tree is empty");
	let elementCount = rows.length;
	if (elementCount > MAX_IMPORT_ELEMENTS) throw new ImportError("tooLarge", "rich tree exceeds the node limit");
	for (const field of COMPONENTS) {
		if (raw[field] !== undefined && !Array.isArray(raw[field])) throw new ImportError("unknownStructure", `rich ${field} is not an array`);
		elementCount += Array.isArray(raw[field]) ? raw[field].length : 0;
		if (elementCount > MAX_IMPORT_ELEMENTS) throw new ImportError("tooLarge", "rich components exceed the element limit");
	}
	const nodes: MarkmindRichNode[] = [];
	const byId = new Map<string, MarkmindRichNode>();
	for (const row of rows) {
		if (!record(row) || !sourceId(row.id) || byId.has(row.id) || typeof row.text !== "string" || !finite(row.x) || !finite(row.y)) {
			throw new ImportError("invalidElement", "rich node id/text/position is invalid");
		}
		if (["isRoot", "main", "isExpand", "collapseMark", "useHandMode", "useScale"].some(key => row[key] !== undefined && typeof row[key] !== "boolean")) {
			throw new ImportError("invalidElement", "rich node state is invalid");
		}
		if (row.text.length > MAX_LABEL_LENGTH) throw new ImportError("tooLarge", "rich node text exceeds the label limit");
		if (/<\/?[a-z][a-z0-9:-]*\b[^>]*>/iu.test(row.text)) throw new ImportError("unknownStructure", "rich HTML labels are not evidenced");
		const parentId = row.pid === undefined || row.pid === null ? null : row.pid;
		if (parentId !== null && !sourceId(parentId) || row.isRoot === true && parentId !== null) {
			throw new ImportError("invalidElement", "rich parent id is invalid");
		}
		const node: MarkmindRichNode = { sourceId: row.id, parentId, text: row.text, x: row.x, y: row.y, raw: row };
		nodes.push(node);
		byId.set(node.sourceId, node);
	}
	const roots = nodes.filter(node => node.parentId === null);
	if (roots.length !== 1 || roots[0].raw.isRoot !== true) throw new ImportError("unknownStructure", "expected one declared rich root");
	const children = new Map<string, string[]>();
	for (const node of nodes) {
		if (node.parentId === null) continue;
		if (!byId.has(node.parentId) || node.parentId === node.sourceId) throw new ImportError("invalidElement", "rich parent target is invalid");
		const siblings = children.get(node.parentId) ?? [];
		siblings.push(node.sourceId);
		children.set(node.parentId, siblings);
	}
	const pending = [roots[0].sourceId];
	const visited = new Set<string>();
	while (pending.length > 0) {
		const id = pending.pop()!;
		if (visited.has(id)) throw new ImportError("invalidElement", "rich tree contains a cycle");
		visited.add(id);
		for (const child of children.get(id) ?? []) pending.push(child);
	}
	if (visited.size !== nodes.length) throw new ImportError("invalidElement", "rich tree is disconnected or cyclic");
	const fence = fences[0];
	const outside = (note.body.slice(0, fence.index) + note.body.slice(fence.index + fence[0].length)).trim();
	const rootHeading = `# ${roots[0].text}`;
	return { nodes, raw, noteBody: outside === rootHeading ? "" : outside, properties: note.properties };
}

function color(value: unknown): string | null | undefined {
	if (value === "transparent" || value === "none" || value === null) return null;
	if (typeof value !== "string") return undefined;
	if (/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu.test(value)) return value.toLowerCase();
	if (/^#[0-9a-f]{3}$/iu.test(value)) return "#" + [...value.slice(1)].map(character => character + character).join("").toLowerCase();
	return undefined;
}

function snapshotRecord(value: unknown): value is Record<string, unknown> {
	if (!record(value)) return false;
	const prototype: unknown = Object.getPrototypeOf(value);
	return (prototype === Object.prototype || prototype === null) && Object.values(Object.getOwnPropertyDescriptors(value)).every(field => "value" in field);
}
function snapshotArray(value: unknown): value is unknown[] {
	return Array.isArray(value) && Object.values(Object.getOwnPropertyDescriptors(value)).every(field => "value" in field);
}
function checkedStyle(value: unknown): ImportedCardStyle | undefined {
	if (!snapshotRecord(value) || Object.keys(value).some(key => !["typography", "colors", "borderStyle", "borderWidth", "cornerRadius"].includes(key))) return undefined;
	if (value.cornerRadius !== undefined && (!finite(value.cornerRadius) || value.cornerRadius < 0 || value.cornerRadius > 1000)) return undefined;
	if (value.borderWidth !== undefined && (!finite(value.borderWidth) || value.borderWidth < 0 || value.borderWidth > 100)) return undefined;
	if (value.typography !== undefined && (!snapshotRecord(value.typography) || Object.keys(value.typography).some(key => !["fontFamily", "fontSize", "lineHeight", "alignment", "verticalAlign", "format"].includes(key)))) return undefined;
	if (value.colors !== undefined && (!snapshotRecord(value.colors) || Object.keys(value.colors).some(key => !["text", "fill", "border"].includes(key)))) return undefined;
	if (record(value.typography) && value.typography.format !== undefined && !snapshotRecord(value.typography.format)) return undefined;
	const checked = validateMiroCanvasMetadata({ schemaVersion: 1, localOverrides: { captured: value } });
	if (!checked.valid || checked.diagnostics.length > 0) return undefined;
	const typography = record(value.typography) ? { ...value.typography, ...(record(value.typography.format) ? { format: { ...value.typography.format } } : {}) } : undefined;
	let colors: Record<string, string | null> | undefined;
	if (record(value.colors)) {
		colors = {};
		for (const [slot, paint] of Object.entries(value.colors)) {
			if (paint !== null && typeof paint !== "string") return undefined;
			colors[slot] = paint;
		}
	}
	return { ...value, ...(typography === undefined ? {} : { typography }), ...(colors === undefined ? {} : { colors }) };
}

function declaredStyle(node: MarkmindRichNode, options: RecordValue): { style: ImportedCardStyle; lost: boolean } {
	const typography: Record<string, unknown> = { fontSize: isValidFontSize(options.fontSize) ? options.fontSize : 16, alignment: "left", verticalAlign: "center" };
	if (isSafeFontFamily(options.fontFamily) && options.fontFamily !== "") typography.fontFamily = options.fontFamily;
	const colors: Record<string, string | null> = { fill: null };
	const style: Record<string, unknown> = { typography, colors, borderStyle: "none", borderWidth: 0 };
	let lost = node.raw.style !== undefined && !record(node.raw.style);
	const targets = new Map<string, unknown>();
	for (const [key, value] of Object.entries(record(node.raw.style) ? node.raw.style : {})) {
		if (!meaningful(value)) continue;
		let target: string | undefined;
		let parsed: unknown;
		if (["fontSize", "font-size"].includes(key)) {
			target = "fontSize";
			parsed = typeof value === "number" ? value : typeof value === "string" && /^\d+(?:\.\d+)?(?:px)?$/u.test(value) ? Number(value.replace(/px$/u, "")) : undefined;
			if (!isValidFontSize(parsed)) parsed = undefined;
		} else if (["fontFamily", "font-family"].includes(key)) {
			target = "fontFamily";
			parsed = isSafeFontFamily(value) ? value : undefined;
		} else if (["color", "background", "backgroundColor", "background-color", "borderColor", "border-color"].includes(key)) {
			target = key === "color" ? "text" : key.startsWith("border") ? "border" : "fill";
			parsed = color(value);
		} else if (["borderWidth", "border-width"].includes(key)) {
			target = "borderWidth";
			parsed = typeof value === "number" ? value : typeof value === "string" && /^\d+(?:\.\d+)?(?:px)?$/u.test(value) ? Number(value.replace(/px$/u, "")) : undefined;
			if (!finite(parsed) || parsed < 0 || parsed > 100) parsed = undefined;
		} else if (["borderStyle", "border-style"].includes(key)) {
			target = "borderStyle";
			parsed = ["solid", "dashed", "dotted", "none"].includes(String(value)) ? value : undefined;
		} else if (["textAlign", "text-align"].includes(key)) {
			target = "alignment";
			parsed = ["left", "center", "right", "justify"].includes(String(value)) ? value : undefined;
		}
		if (target === undefined || parsed === undefined || targets.has(target) && targets.get(target) !== parsed) {
			lost = true;
			continue;
		}
		targets.set(target, parsed);
		if (["fontSize", "fontFamily", "alignment"].includes(target)) typography[target] = parsed;
		else if (["text", "fill", "border"].includes(target)) colors[target] = parsed as string | null;
		else style[target] = parsed;
	}
	return { style: checkedStyle(style) ?? { borderStyle: "none", colors: { fill: null } }, lost };
}

function edgeKey(parentId: string, childId: string): string {
	return JSON.stringify([parentId, childId]);
}
function capturedLayout(source: ImportSource, parsed: ParsedMarkmindRich, input: unknown): CapturedLayout | undefined {
	try {
		if (!snapshotRecord(input) || input.sourceText !== source.text || !snapshotArray(input.nodes) || !snapshotArray(input.edges)
			|| input.nodes.length !== parsed.nodes.length || input.nodes.length > MAX_LAYOUT_NODES || input.edges.length !== parsed.nodes.length - 1
			|| input.theme !== undefined && input.theme !== "light" && input.theme !== "dark") return undefined;
		const expected = new Map(parsed.nodes.map(node => [node.sourceId, node]));
		const nodes = new Map<string, CapturedNode>();
		for (const value of input.nodes) {
			if (!snapshotRecord(value) || typeof value.sourceId !== "string" || nodes.has(value.sourceId)) return undefined;
			const original = expected.get(value.sourceId);
			if (original === undefined || value.text !== original.text || value.parentId !== original.parentId || !finite(value.x) || !finite(value.y)
				|| !finite(value.width) || !finite(value.height) || value.width < 1 || value.height < 1) return undefined;
			const style = checkedStyle(value.style);
			if (style === undefined) return undefined;
			nodes.set(value.sourceId, { x: value.x, y: value.y, width: value.width, height: value.height, style });
		}
		const edges = new Map<string, CapturedEdge>();
		let pointCount = 0;
		for (const value of input.edges) {
			if (!snapshotRecord(value) || typeof value.parentId !== "string" || typeof value.childId !== "string" || expected.get(value.childId)?.parentId !== value.parentId
				|| typeof value.color !== "string" || !/^#[0-9a-f]{6}$/iu.test(value.color) || !finite(value.width) || value.width <= 0 || value.width > 100
				|| !snapshotArray(value.points) || value.points.length < 2 || value.points.length > MAX_WAYPOINTS + 2) return undefined;
			const key = edgeKey(value.parentId, value.childId);
			if (edges.has(key)) return undefined;
			const points: { x: number; y: number }[] = [];
			for (const point of value.points) {
				if (!snapshotRecord(point) || !finite(point.x) || !finite(point.y)) return undefined;
				points.push({ x: point.x, y: point.y });
			}
			pointCount += points.length;
			if (pointCount > MAX_LAYOUT_POINTS) return undefined;
			const from = nodes.get(value.parentId);
			const to = nodes.get(value.childId);
			const inside = (point: { x: number; y: number }, rect: BoardRect): boolean => point.x >= Math.round(rect.x) && point.x <= Math.round(rect.x) + Math.max(1, Math.round(rect.width))
				&& point.y >= Math.round(rect.y) && point.y <= Math.round(rect.y) + Math.max(1, Math.round(rect.height));
			if (from === undefined || to === undefined || !inside(points[0], from) || !inside(points[points.length - 1], to)) return undefined;
			edges.set(key, { color: value.color, width: value.width, points });
		}
		return { nodes, edges, ...(input.theme === undefined ? {} : { theme: input.theme }) };
	} catch {
		return undefined;
	}
}

function estimatedRect(node: MarkmindRichNode, style: ImportedCardStyle): BoardRect {
	const fontSize = typeof style.typography?.fontSize === "number" ? style.typography.fontSize : 16;
	const lines = node.text.split("\n");
	let longest = 0;
	for (const line of lines) longest = Math.max(longest, [...line].length);
	return { x: node.x, y: node.y, width: Math.min(2048, Math.max(32, Math.ceil(longest * fontSize * 0.62 + 16))), height: Math.min(2048, Math.max(24, Math.ceil(lines.length * fontSize * 1.25 + 4))) };
}
function anchor(point: { x: number; y: number }, rect: BoardRect): { u: number; v: number } {
	return { u: (point.x - Math.round(rect.x)) / Math.max(1, Math.round(rect.width)), v: (point.y - Math.round(rect.y)) / Math.max(1, Math.round(rect.height)) };
}

function sourceLabel(builder: BoardBuilder, rect: BoardRect, text: string, options: CardOptions): string {
	const style = options.style;
	const visiblePaint = (paint: string | null | undefined): boolean => typeof paint === "string" && paint !== "transparent" && !/^#[0-9a-f]{6}00$/iu.test(paint);
	const border = style?.colors?.border;
	const painted = visiblePaint(style?.colors?.fill) || (style?.borderWidth ?? 0) > 0 && style?.borderStyle !== "none" && (border === undefined || visiblePaint(border));
	return painted
		? builder.shapeCard(rect, text, { kind: (style?.cornerRadius ?? 0) > 0 ? "round_rectangle" : "rectangle", fallback: "text" }, options)
		: builder.item(rect, text, { type: "text" }, options);
}

export function convertMarkmindRich(source: ImportSource, context: ImportContext): ImportResult {
	const parsed = parseMarkmindRichSource(source.text);
	const builder = new BoardBuilder("markmind-rich", context);
	const captured = capturedLayout(source, parsed, context.mindmapLayout);
	const options = record(parsed.raw.opt) ? parsed.raw.opt : {};
	const placed = new Map<string, { id: string; rect: BoardRect }>();
	for (const node of parsed.nodes) {
		const declared = declaredStyle(node, options);
		const capture = captured?.nodes.get(node.sourceId);
		const rect = capture ?? estimatedRect(node, declared.style);
		const id = sourceLabel(builder, rect, node.text, { source: { id: node.sourceId, type: "node" }, style: capture?.style ?? declared.style });
		placed.set(node.sourceId, { id, rect });
		if (declared.lost) builder.note({ sourceId: node.sourceId, sourceType: "style", status: "plugin-unsupported", reason: "customStyle", nodeId: id });
		if (meaningful(node.raw.layout) && (!record(node.raw.layout) || node.raw.layout.layoutName !== "mindmap2" || node.raw.layout.direct !== "mindmap" || Object.keys(node.raw.layout).some(key => key !== "layoutName" && key !== "direct"))) {
			builder.note({ sourceId: node.sourceId, sourceType: "layout", status: "plugin-unsupported", reason: "customStyle", nodeId: id });
		}
		if (node.raw.isExpand === false || node.raw.collapseMark === true) builder.note({ sourceId: node.sourceId, sourceType: "collapsed branch", status: "approximated", reason: "foldedBranch", nodeId: id });
		if (meaningful(node.raw.hasMark) || Object.keys(node.raw).some(key => !NODE_FIELDS.has(key) && meaningful(node.raw[key]))) {
			builder.note({ sourceId: node.sourceId, sourceType: "rich node fields", status: "plugin-unsupported", reason: "unknownElement", nodeId: id });
		}
	}
	for (const node of parsed.nodes) {
		if (node.parentId === null) continue;
		const from = placed.get(node.parentId)!;
		const to = placed.get(node.sourceId)!;
		const edge = captured?.edges.get(edgeKey(node.parentId, node.sourceId));
		const left = to.rect.x + to.rect.width / 2 < from.rect.x + from.rect.width / 2;
		const stroke = color(node.raw.stroke);
		const ink = typeof stroke === "string" && /^#[0-9a-f]{6}$/iu.test(stroke) ? stroke : undefined;
		builder.connect({
			from: { type: "node", nodeId: from.id, ...(edge === undefined ? { u: left ? 0 : 1, v: 0.5 } : anchor(edge.points[0], from.rect)) },
			to: { type: "node", nodeId: to.id, ...(edge === undefined ? { u: left ? 1 : 0, v: 0.5 } : anchor(edge.points[edge.points.length - 1], to.rect)) },
			route: edge === undefined ? "curved" : "straight",
			startCap: "none", endCap: "none",
			...(edge === undefined ? ink === undefined ? {} : { color: ink } : { color: edge.color, width: edge.width, waypoints: edge.points.slice(1, -1) }),
		});
		if (meaningful(node.raw.stroke) && ink === undefined) builder.note({ sourceId: node.sourceId, sourceType: "stroke", status: "plugin-unsupported", reason: "customStyle" });
	}
	for (const field of COMPONENTS) {
		const values = parsed.raw[field];
		if (!Array.isArray(values)) continue;
		values.forEach((_value, index) => builder.note({ sourceId: `${field}:${index}`, sourceType: field, status: "plugin-unsupported", reason: "unknownElement" }));
	}
	for (const [key, value] of Object.entries(parsed.raw)) {
		if (!ENVELOPE_FIELDS.has(key) && meaningful(value)) builder.note({ sourceId: `field:${key}`, sourceType: key, status: "plugin-unsupported", reason: "unknownElement" });
	}
	for (const [key, value] of Object.entries(options)) {
		if (!meaningful(value)) continue;
		if (key === "background" && value === "transparent" || key === "fontSize" && isValidFontSize(value) || key === "fontFamily" && isSafeFontFamily(value)) continue;
		builder.note({ sourceId: `opt:${key}`, sourceType: "opt", status: "plugin-unsupported", reason: key === "background" ? "background" : "customStyle" });
	}
	if (parsed.raw.opt !== undefined && !record(parsed.raw.opt)) builder.note({ sourceId: "opt", sourceType: "opt", status: "invalid-source", reason: "customStyle" });
	if (meaningful(parsed.raw.theme) && parsed.raw.theme !== "light" && parsed.raw.theme !== "dark") builder.note({ sourceId: "theme", sourceType: "theme", status: "plugin-unsupported", reason: "customStyle" });
	for (const property of parsed.properties) builder.note({ sourceId: `property:${property}`, sourceType: property, status: "plugin-unsupported", reason: "frontmatter" });
	if (parsed.noteBody !== "") builder.note({ sourceId: "noteBody", sourceType: "Markdown outside rich tree", status: "plugin-unsupported", reason: "noteBody" });
	builder.note({ sourceId: "appearance", sourceType: captured === undefined ? "persisted positions; estimated card sizes and paths" : "captured sizes/styles; sampled paths and native Markdown", status: "approximated", reason: "appearance" });
	const theme = captured?.theme ?? (parsed.raw.theme === "light" || parsed.raw.theme === "dark" ? parsed.raw.theme : undefined);
	return builder.finish({ sourcePath: source.path }, theme);
}

export const markmindRichAdapter: FormatAdapter = { id: "markmind-rich", detect: detectMarkmindRich, convert: convertMarkmindRich };
