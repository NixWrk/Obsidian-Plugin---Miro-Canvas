/**
 * Evidenced page-level tldraw native shapes and packed XY strokes.
 * Format and sample receipts: docs/import-tldraw-audit.md.
 * No migrations, editor runtime, fetch, or foreign implementation; assets are planned.
 */
import { MAX_WAYPOINTS } from "../connector-route";
import { validateMiroCanvasMetadata } from "../metadata";
import type { CanvasAnchor } from "../anchors";
import { MAX_STROKE_POINTS, readLocalStroke } from "../local-items";
import { BoardBuilder, type BoardRect, type ImportedCardStyle } from "./board-builder";
import { ImportAssets } from "./assets";
import { ImportError, type FormatAdapter, type ImportContext, type ImportResult, type ImportSource } from "./types";

export const MAX_TLDRAW_SOURCE_LENGTH = 16 * 1_024 * 1_024;
export const MAX_TLDRAW_RECORDS = 10_000;
export const MAX_TLDRAW_TOTAL_POINTS = 100_000;
const MAX_COORDINATE = 100_000;
const MAX_PACKED_LENGTH = Math.ceil((8 + (MAX_STROKE_POINTS - 1) * 4) / 3) * 4;
const DATA_START = "!!!_START_OF_TLDRAW_DATA__DO_NOT_CHANGE_THIS_PHRASE_!!!";
const DATA_END = "!!!_END_OF_TLDRAW_DATA__DO_NOT_CHANGE_THIS_PHRASE_!!!";
const NONVISUAL_RECORDS = new Set([
	"document", "page", "camera", "instance", "instance_page_state",
	"instance_presence", "pointer", "user",
]);

type JsonRecord = Record<string, unknown>;

interface DrawingFile {
	readonly records: readonly JsonRecord[];
	readonly sequences: JsonRecord;
	readonly extensions: readonly { readonly sourceId: string; readonly sourceType: string }[];
}

function record(value: unknown): value is JsonRecord {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function coordinate(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= MAX_COORDINATE;
}

function json(text: string): unknown {
	try {
		return JSON.parse(text) as unknown;
	} catch {
		throw new ImportError("unreadableData", "tldraw JSON");
	}
}

function readEnvelope(source: ImportSource, extensions: { sourceId: string; sourceType: string }[]): unknown {
	if (source.text.length > MAX_TLDRAW_SOURCE_LENGTH) throw new ImportError("tooLarge");
	if (source.extension === "tldr") return json(source.text);
	if (source.extension !== "md" || source.frontmatter?.["tldraw-file"] !== true) {
		throw new ImportError("unknownStructure", "not a tldraw source");
	}
	const start = source.text.indexOf(DATA_START);
	const end = source.text.indexOf(DATA_END);
	if (start < 0 || end < start + DATA_START.length
		|| source.text.indexOf(DATA_START, start + DATA_START.length) !== -1
		|| source.text.indexOf(DATA_END, end + DATA_END.length) !== -1) {
		throw new ImportError("unreadableData", "ambiguous tldraw delimiters");
	}
	const data = json(source.text.slice(start + DATA_START.length, end).trim());
	if (!record(data) || !record(data.meta) || !record(data.raw)
		|| typeof data.meta["plugin-version"] !== "string"
		|| typeof data.meta["tldraw-version"] !== "string") {
		throw new ImportError("unknownStructure", "tldraw Markdown wrapper");
	}
	noteUnknownKeys(data, ["meta", "raw"], "tldraw-wrapper", extensions);
	noteUnknownKeys(data.meta, ["plugin-version", "tldraw-version", "uuid"], "tldraw-wrapper", extensions, "meta:");
	if (Object.keys(source.frontmatter ?? {}).some(key => key !== "tldraw-file")) {
		extensions.push({ sourceId: "tldraw-wrapper", sourceType: "frontmatter" });
	}
	extensions.push({ sourceId: "tldraw-wrapper", sourceType: "markdown" });
	return data.raw;
}

function readDrawingFile(source: ImportSource): DrawingFile {
	const extensions: { sourceId: string; sourceType: string }[] = [];
	const data = readEnvelope(source, extensions);
	if (!record(data) || data.tldrawFileFormatVersion !== 1 || !record(data.schema)
		|| data.schema.schemaVersion !== 2 || !record(data.schema.sequences)
		|| !Array.isArray(data.records)) {
		throw new ImportError("unknownStructure", "requires tldraw file 1 / schema 2");
	}
	const sequences = data.schema.sequences;
	if (sequences["com.tldraw.store"] !== 5 || sequences["com.tldraw.shape"] !== 4
		|| sequences["com.tldraw.shape.draw"] !== 5 || sequences["com.tldraw.page"] !== 1) {
		throw new ImportError("unknownStructure", "unevidenced tldraw record versions");
	}
	if (data.records.length > MAX_TLDRAW_RECORDS) throw new ImportError("tooLarge");
	const records: JsonRecord[] = [];
	const ids = new Set<string>();
	for (const value of data.records as unknown[]) {
		if (!record(value) || typeof value.id !== "string" || value.id.length === 0
			|| value.id.length > 512 || typeof value.typeName !== "string" || value.typeName.length > 64 || ids.has(value.id)) {
			throw new ImportError("unreadableData", "invalid or duplicate tldraw record id");
		}
		ids.add(value.id);
		records.push(value);
	}
	const pages = records.filter(value => value.typeName === "page");
	if (pages.length !== 1 || typeof pages[0]?.id !== "string" || !pages[0].id.startsWith("page:")) {
		throw new ImportError("unknownStructure", "requires exactly one tldraw page");
	}
	const pageId = pages[0].id;
	for (const value of records) {
		if (value.typeName !== "shape") continue;
		if (value.parentId !== pageId) {
			throw new ImportError("unknownStructure", "nested shapes or dangling parents");
		}
		if (!coordinate(value.x) || !coordinate(value.y) || !coordinate(value.rotation)
			|| typeof value.type !== "string" || value.type.length > 64 || !record(value.props)) {
			throw new ImportError("unreadableData", "invalid tldraw shape geometry");
		}
	}
	noteUnknownKeys(data, ["tldrawFileFormatVersion", "schema", "records"], "tldraw-file", extensions);
	noteUnknownKeys(data.schema, ["schemaVersion", "sequences"], "tldraw-schema", extensions);
	return { records, sequences, extensions };
}

/** Unknown fields stay in the source; the report names each dropped field. */
function noteUnknownKeys(
	value: JsonRecord,
	known: readonly string[],
	sourceId: string,
	extensions: { sourceId: string; sourceType: string }[],
	fieldPrefix = "",
): void {
	const keys = new Set(known);
	for (const key of Object.keys(value)) {
		if (keys.has(key)) continue;
		const extra = value[key];
		if (extra === undefined || extra === null || (record(extra) && Object.keys(extra).length === 0)) continue;
		extensions.push({ sourceId, sourceType: fieldPrefix + key.slice(0, 128) });
	}
}

function noteRecordData(value: JsonRecord, builder: BoardBuilder): void {
	const id = value.id as string;
	for (const key of ["meta", "customData"]) {
		const data = value[key];
		if (data === undefined || data === null || (record(data) && Object.keys(data).length === 0)) continue;
		builder.note({ sourceId: id, sourceType: key, status: "plugin-unsupported", reason: "customData" });
	}
	if (value.typeName !== "shape") return;
	const extras: { sourceId: string; sourceType: string }[] = [];
	noteUnknownKeys(value, ["id", "typeName", "type", "x", "y", "rotation", "index", "parentId", "isLocked", "opacity", "props", "meta", "customData"], id, extras);
	if (value.type === "draw") {
		const props = value.props as JsonRecord;
		noteUnknownKeys(props, ["segments", "color", "fill", "dash", "size", "isComplete", "isClosed", "isPen", "scale", "scaleX", "scaleY"], id, extras, "props:");
		if (Array.isArray(props.segments)) {
			for (let at = 0; at < props.segments.length; at += 1) {
				const segment: unknown = props.segments[at];
				if (record(segment)) noteUnknownKeys(segment, ["type", "dim", "path"], id, extras, "segment:" + at + ":");
			}
		}
	}
		const nativeProps: Readonly<Record<string, readonly string[]>> = {
		geo: ["geo","dash","url","w","h","growY","scale","flipX","flipY","labelColor","color","fill","size","font","align","verticalAlign","richText"],
		text: ["color","size","font","textAlign","w","richText","scale","autoSize"],
		line: ["color","dash","size","spline","points","scale"],
		arrow: ["kind","labelColor","color","fill","dash","size","arrowheadStart","arrowheadEnd","font","start","end","bend","richText","labelPosition","scale","elbowMidPoint"],
		image: ["w","h","playing","url","assetId","crop","flipX","flipY","altText"],
	};
	if (typeof value.type === "string" && nativeProps[value.type] !== undefined) {
		noteUnknownKeys(value.props as JsonRecord, nativeProps[value.type], id, extras, "props:");
	}
	for (const extra of extras) {
		builder.note({ ...extra, status: "plugin-unsupported", reason: "customData" });
	}
}

/** IEEE 754 binary16, decoded independently from its numeric definition. */
function half(bits: number): number {
	const negative = bits >= 0x8000;
	const exponent = Math.floor(bits / 1_024) % 32;
	const fraction = bits % 1_024;
	if (exponent === 31) throw new ImportError("unreadableData", "non-finite packed coordinate");
	const magnitude = exponent === 0
		? fraction * 2 ** -24
		: (1 + fraction / 1_024) * 2 ** (exponent - 15);
	return negative ? -magnitude : magnitude;
}

/** Eight little-endian float32 bytes, followed by four-byte float16 XY deltas. */
function packedXY(path: unknown): number[] {
	if (typeof path !== "string") throw new ImportError("unreadableData", "missing packed path");
	if (path.length > MAX_PACKED_LENGTH) throw new ImportError("tooLarge", "packed tldraw path");
	if (path.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(path)) {
		throw new ImportError("unreadableData", "invalid packed base64");
	}
	let binary: string;
	try {
		binary = atob(path);
	} catch {
		throw new ImportError("unreadableData", "invalid packed base64");
	}
	if (btoa(binary) !== path || binary.length < 12 || (binary.length - 8) % 4 !== 0) {
		throw new ImportError("unreadableData", "invalid packed XY byte layout");
	}
	const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
	const view = new DataView(bytes.buffer);
	let x = view.getFloat32(0, true);
	let y = view.getFloat32(4, true);
	const points: number[] = [];
	for (let offset = 8; offset <= bytes.length; offset += 4) {
		if (!coordinate(x) || !coordinate(y)) throw new ImportError("unreadableData", "packed coordinate outside bounds");
		points.push(x, y);
		if (offset === bytes.length) break;
		x += half(view.getUint16(offset, true));
		y += half(view.getUint16(offset + 2, true));
	}
	return points;
}

function placeholderRect(shape: JsonRecord): BoardRect {
	const props = shape.props as JsonRecord;
	return {
		x: shape.x as number,
		y: shape.y as number,
		width: coordinate(props.w) && props.w > 0 ? props.w : 160,
		height: coordinate(props.h) && props.h > 0 ? props.h : 60,
	};
}

function supportedStroke(shape: JsonRecord): boolean {
	const props = shape.props as JsonRecord;
	if (shape.type !== "draw" || shape.rotation !== 0 || shape.opacity !== 1
		|| props.color !== "black" || props.fill !== "none" || props.dash !== "draw"
		|| props.size !== "m" || props.isPen !== false || props.isClosed !== false
		|| props.isComplete !== true || props.scale !== 1 || props.scaleX !== 1 || props.scaleY !== 1
		|| !Array.isArray(props.segments) || props.segments.length !== 1) return false;
	const segment: unknown = props.segments[0];
	return record(segment) && segment.type === "free" && segment.dim === 2 && typeof segment.path === "string";
}

/** Default SDK 5.4 theme values; custom theme tokens remain unsupported. */
const DEFAULT_COLORS: Readonly<Record<string, readonly [string, string]>> = {
	black: ["#1d1d1d", "#f2f2f2"], red: ["#e03131", "#e03131"], blue: ["#4465e9", "#4f72fc"],
};
const DEFAULT_WIDTHS: Readonly<Record<string, number>> = { s: 2, m: 3.5, l: 5, xl: 10 };
const DEFAULT_FONTS: Readonly<Record<string, string>> = { draw: "tldraw_draw, sans-serif", sans: "tldraw_sans, sans-serif", serif: "tldraw_serif, serif", mono: "tldraw_mono, monospace" };
const DEFAULT_FONT_SIZES: Readonly<Record<string, number>> = { s: 18, m: 24, l: 36, xl: 44 };
const DEFAULT_LABEL_SIZES: Readonly<Record<string, number>> = { s: 18, m: 22, l: 26, xl: 32 };
const GEO_KINDS = { rectangle: "rectangle", ellipse: "circle", diamond: "rhombus" } as const;

function sourceColor(token: unknown, context: ImportContext): string | undefined {
	return typeof token === "string" ? DEFAULT_COLORS[token]?.[context.theme === "dark" ? 1 : 0] : undefined;
}

function sourceWidth(size: unknown): number | undefined {
	return typeof size === "string" ? DEFAULT_WIDTHS[size] : undefined;
}

function plainRichText(value: unknown): string | undefined {
	if (!record(value) || value.type !== "doc" || !Array.isArray(value.content) || value.content.length > 1_000) return undefined;
	const paragraphs: string[] = [];
	for (const paragraph of value.content as unknown[]) {
		if (!record(paragraph) || paragraph.type !== "paragraph") return undefined;
		const content: unknown = paragraph.content ?? [];
		if (!Array.isArray(content) || content.length > 10_000) return undefined;
		let text = "";
		for (const item of content as unknown[]) {
			if (!record(item)) return undefined;
			if (item.type === "hardBreak") text += "  \n";
			else if (item.type === "text" && typeof item.text === "string" && item.text.length < 100_000
				&& (item.marks === undefined || (Array.isArray(item.marks) && item.marks.length === 0))) {
				text += item.text.replace(/[\\\x60*_[\]<>#]/gu, "\\$&");
			} else return undefined;
		}
		paragraphs.push(text);
	}
	return paragraphs.join("\n\n");
}

function worldPoint(shape: JsonRecord, value: unknown): { x: number; y: number } | undefined {
	if (!record(value) || !coordinate(value.x) || !coordinate(value.y)) return undefined;
	const angle = shape.rotation as number;
	const x = (shape.x as number) + Math.cos(angle) * value.x - Math.sin(angle) * value.y;
	const y = (shape.y as number) + Math.sin(angle) * value.x + Math.cos(angle) * value.y;
	return coordinate(x) && coordinate(y) ? { x, y } : undefined;
}

function sizedRect(shape: JsonRecord, width: unknown, height: unknown): BoardRect | undefined {
	if (!coordinate(width) || !coordinate(height) || width < 1 || height < 1) return undefined;
	const center = worldPoint(shape, { x: width / 2, y: height / 2 });
	return center === undefined ? undefined : { x: center.x - width / 2, y: center.y - height / 2, width, height };
}

function nativeStyle(shape: JsonRecord, context: ImportContext): ImportedCardStyle | undefined {
	const props = shape.props as JsonRecord;
	const color = sourceColor(props.color, context);
	const borderWidth = sourceWidth(props.size);
	if (color === undefined || borderWidth === undefined) return undefined;
	const font = typeof props.font === "string" ? DEFAULT_FONTS[props.font] : undefined;
	const fontSize = typeof props.size === "string" ? (shape.type === "geo" ? DEFAULT_LABEL_SIZES : DEFAULT_FONT_SIZES)[props.size] : 24;
	const align = props.textAlign ?? props.align;
	return {
		borderWidth,
		borderStyle: props.dash === "dashed" ? "dashed" : props.dash === "dotted" ? "dotted" : "solid",
		colors: { border: color, fill: props.fill === "solid" ? color : null, text: sourceColor(props.labelColor ?? props.color, context) ?? color },
		typography: { ...(font === undefined ? {} : { fontFamily: font }), fontSize,
			alignment: align === "middle" || align === "center" ? "center" : align === "end" ? "right" : "left",
			verticalAlign: props.verticalAlign === "end" ? "bottom" : props.verticalAlign === "start" ? "top" : "center" },
		rotation: (shape.rotation as number) * 180 / Math.PI,
		...(shape.isLocked === true ? { locked: true as const } : {}),
	};
}

function appearance(builder: BoardBuilder, shape: JsonRecord, nodeId?: string): void {
	builder.note({ sourceId: shape.id as string, sourceType: shape.type as string, status: "approximated", reason: "tldrawAppearance", ...(nodeId === undefined ? {} : { nodeId }) });
}

interface ObservedShape extends BoardRect {
	readonly style?: ImportedCardStyle;
}
interface ObservedConnector {
	readonly color: string;
	readonly width: number;
	readonly points: readonly { x: number; y: number }[];
}
interface ObservedAppearance {
	readonly theme: "light" | "dark";
	readonly shapes: ReadonlyMap<string, ObservedShape>;
	readonly connectors: ReadonlyMap<string, ObservedConnector>;
}

function readObservedAppearance(source: ImportSource, file: DrawingFile, value: unknown): ObservedAppearance | undefined {
	if (!record(value) || value.sourceText !== source.text || (value.theme !== "light" && value.theme !== "dark")
		|| !Array.isArray(value.shapes) || !Array.isArray(value.connectors)
		|| value.shapes.length > 5_000 || value.connectors.length > 5_000) return undefined;
	const sourceShapes = new Map(file.records.filter(item => item.typeName === "shape").map(item => [item.id as string, item]));
	const shapes = new Map<string, ObservedShape>();
	for (const item of value.shapes as unknown[]) {
		if (!record(item) || typeof item.sourceId !== "string" || !sourceShapes.has(item.sourceId) || shapes.has(item.sourceId)
			|| !coordinate(item.x) || !coordinate(item.y) || !coordinate(item.width) || !coordinate(item.height)
			|| item.width < 1 || item.height < 1) return undefined;
		let style: ImportedCardStyle | undefined;
		if (item.style !== undefined) {
			if (!record(item.style) || Object.keys(item.style).some(key => !["typography","colors","borderStyle","borderWidth"].includes(key))) return undefined;
			const validated = validateMiroCanvasMetadata({ schemaVersion: 1, localOverrides: { observed: item.style } });
			if (!validated.valid || validated.diagnostics.length !== 0) return undefined;
			style = item.style;
		}
		shapes.set(item.sourceId, { x: item.x, y: item.y, width: item.width, height: item.height, ...(style === undefined ? {} : { style }) });
	}
	const connectors = new Map<string, ObservedConnector>();
	let totalPoints = 0;
	for (const item of value.connectors as unknown[]) {
		if (!record(item) || typeof item.sourceId !== "string" || connectors.has(item.sourceId)
			|| !["line","arrow"].includes(String(sourceShapes.get(item.sourceId)?.type))
			|| typeof item.color !== "string" || !/^#[0-9a-f]{6}$/iu.test(item.color)
			|| !coordinate(item.width) || item.width <= 0 || item.width > 100
			|| !Array.isArray(item.points) || item.points.length < 2 || item.points.length > MAX_WAYPOINTS + 2) return undefined;
		const points: { x: number; y: number }[] = [];
		for (const point of item.points as unknown[]) {
			if (!record(point) || !coordinate(point.x) || !coordinate(point.y)) return undefined;
			points.push({ x: point.x, y: point.y });
		}
		totalPoints += points.length;
		if (totalPoints > 100_000) return undefined;
		connectors.set(item.sourceId, { color: item.color, width: item.width, points });
	}
	return { shapes, connectors, theme: value.theme };
}

interface NativeImportState {
	readonly appearance?: ObservedAppearance;
	readonly nodes: Map<string, string>;
	readonly consumed: Set<string>;
	readonly assets: ImportAssets;
	readonly context: ImportContext;
	readonly sourcePath: string;
	readonly records: readonly JsonRecord[];
	readonly sequences: JsonRecord;
	readonly byId: ReadonlyMap<string, JsonRecord>;
	readonly arrowBindings: ReadonlyMap<string, readonly JsonRecord[]>;
}

function importCard(shape: JsonRecord, builder: BoardBuilder, state: NativeImportState): boolean {
	const props = shape.props as JsonRecord;
	const id = shape.id as string;
	const type = shape.type as string;
	const version = state.sequences["com.tldraw.shape." + type];
	const source = { id, type };
	const observed = state.appearance?.shapes.get(id);
	if (shape.opacity !== 1) return false;
	if (type === "geo" && (version === 11 || version === 12) && props.scale === 1
		&& props.flipX !== true && props.flipY !== true && (props.fill === "none" || props.fill === "solid")
		&& ["draw", "solid", "dashed", "dotted"].includes(String(props.dash))) {
		const kind = GEO_KINDS[props.geo as keyof typeof GEO_KINDS];
		const text = plainRichText(props.richText);
		const rect = observed ?? sizedRect(shape, props.w, coordinate(props.h) && coordinate(props.growY) ? props.h + props.growY : undefined);
		const fallbackStyle = nativeStyle(shape, state.context);
		const style = observed?.style === undefined ? fallbackStyle : { ...fallbackStyle, ...observed.style, rotation: (shape.rotation as number) * 180 / Math.PI, ...(shape.isLocked === true ? { locked: true as const } : {}) };
		if (kind === undefined || text === undefined || rect === undefined || style === undefined || props.url) return false;
		const nodeId = builder.shapeCard(rect, text, { kind, fallback: "text" }, { source, style });
		state.nodes.set(id, nodeId);
		appearance(builder, shape, nodeId);
		return true;
	}
	if (type === "text" && version === 4 && props.scale === 1 && (props.autoSize === false || observed !== undefined)) {
		const text = plainRichText(props.richText);
		const fallbackStyle = nativeStyle(shape, state.context);
		const style = observed?.style === undefined ? fallbackStyle : { ...fallbackStyle, ...observed.style, rotation: (shape.rotation as number) * 180 / Math.PI, ...(shape.isLocked === true ? { locked: true as const } : {}) };
		if (text === undefined || style === undefined || !coordinate(props.w) || props.w < 1) return false;
		const fontSize = typeof props.size === "string" ? DEFAULT_FONT_SIZES[props.size] : 24;
		const lines = text.split("\n").reduce((count, line) => count + Math.max(1, Math.ceil(line.length * fontSize * 0.6 / (props.w as number))), 0);
		const rect = observed ?? sizedRect(shape, props.w, Math.max(1, lines * fontSize * 1.35));
		if (rect === undefined) return false;
		const nodeId = builder.item(rect, text, { type: "text" }, { source, style });
		state.nodes.set(id, nodeId);
		appearance(builder, shape, nodeId);
		return true;
	}
	if (type === "image" && version === 5 && props.crop === null && props.flipX === false && props.flipY === false && !props.url) {
		const rect = observed ?? sizedRect(shape, props.w, props.h);
		const asset = state.byId.get(String(props.assetId));
		if (rect === undefined || asset === undefined || asset.typeName !== "asset" || asset.type !== "image" || !record(asset.props) || typeof asset.props.src !== "string") return false;
		const assetSource = asset.props.src;
		let path: string | undefined;
		if (assetSource.startsWith("data:")) {
			const planned = state.assets.add(asset.id as string, assetSource);
			if (!planned.ok) {
				builder.placeholder(rect, { sourceId: id, sourceType: type, status: "missing-asset", reason: planned.reason });
				return true;
			}
			path = planned.path;
		} else if (!/^[a-z][a-z0-9+.-]*:|^\/\//iu.test(assetSource)) {
			path = state.context.resolveLink(assetSource, state.sourcePath);
		}
		if (path === undefined) return false;
		const imageStyle: ImportedCardStyle & { readonly cornerRadius: number } = {
			...observed?.style, rotation: (shape.rotation as number) * 180 / Math.PI,
			showAttachmentName: false, cornerRadius: 0,
		};
		const nodeId = builder.file(rect, path, { source, style: imageStyle });
		state.nodes.set(id, nodeId);
		state.consumed.add(asset.id as string);
		appearance(builder, shape, nodeId);
		return true;
	}
	return false;
}

function importLine(shape: JsonRecord, builder: BoardBuilder, state: NativeImportState): boolean {
	const props = shape.props as JsonRecord;
	const type = shape.type as string;
	const version = state.sequences["com.tldraw.shape." + type];
	const observed = state.appearance?.connectors.get(shape.id as string);
	const color = observed?.color ?? sourceColor(props.color, state.context);
	const width = observed?.width ?? sourceWidth(props.size);
	if (shape.opacity !== 1 || props.scale !== 1 || color === undefined || width === undefined
		|| !["solid", "draw", "dashed", "dotted"].includes(String(props.dash))) return false;
	let start: unknown;
	let end: unknown;
	let cap = "none";
	if (observed !== undefined && ((type === "line" && version === 5) || (type === "arrow" && version === 8
		&& props.arrowheadStart === "none" && ["none","arrow","triangle"].includes(String(props.arrowheadEnd))
		&& plainRichText(props.richText) === ""))) {
		start = props.start; end = props.end;
		cap = type === "arrow" ? props.arrowheadEnd === "triangle" ? "stealth" : props.arrowheadEnd === "arrow" ? "arrow" : "none" : "none";
	} else if (type === "line" && version === 5 && props.spline === "line" && record(props.points)) {
		const points = Object.values(props.points);
		if (points.length !== 2 || points.some(point => !record(point) || typeof point.index !== "string")) return false;
		points.sort((a, b) => (a as JsonRecord).index! < (b as JsonRecord).index! ? -1 : 1);
		[start, end] = points;
	} else if (type === "arrow" && version === 8 && props.kind === "arc" && props.bend === 0
		&& props.arrowheadStart === "none" && ["none", "arrow", "triangle"].includes(String(props.arrowheadEnd))
		&& plainRichText(props.richText) === "") {
		start = props.start;
		end = props.end;
		cap = props.arrowheadEnd === "triangle" ? "stealth" : props.arrowheadEnd === "arrow" ? "arrow" : "none";
	} else return false;
	const startPoint = observed?.points[0] ?? worldPoint(shape, start);
	const endPoint = observed?.points[observed.points.length - 1] ?? worldPoint(shape, end);
	if (startPoint === undefined || endPoint === undefined) return false;
	const usedBindings: string[] = [];
	const anchor = (terminal: "start" | "end", point: { x: number; y: number }): CanvasAnchor | undefined => {
		const matches = (state.arrowBindings.get(shape.id as string) ?? []).filter(value => record(value.props) && value.props.terminal === terminal);
		if (matches.length === 0) return { type: "free", ...point };
		if (matches.length !== 1) return undefined;
		const binding = matches[0];
		const data = binding.props as JsonRecord;
		const target = state.nodes.get(binding.toId as string);
		const normalized = data.normalizedAnchor;
		if (observed !== undefined && !state.appearance?.shapes.has(binding.toId as string)) return undefined;
		if (state.sequences["com.tldraw.binding.arrow"] !== 1 || binding.type !== "arrow" || (observed === undefined && data.isExact !== true)
			|| (observed === undefined && data.isPrecise !== true) || target === undefined || !record(normalized)
			|| !coordinate(normalized.x) || normalized.x < 0 || normalized.x > 1
			|| !coordinate(normalized.y) || normalized.y < 0 || normalized.y > 1) return undefined;
		usedBindings.push(binding.id as string);
				const targetBox = state.appearance?.shapes.get(binding.toId as string);
		let u = normalized.x;
		let v = normalized.y;
		if (observed !== undefined && targetBox !== undefined) {
			const x = Math.round(targetBox.x);
			const y = Math.round(targetBox.y);
			const width = Math.max(1, Math.round(targetBox.width));
			const height = Math.max(1, Math.round(targetBox.height));
			const cx = x + width / 2;
			const cy = y + height / 2;
			const angle = state.byId.get(binding.toId as string)?.rotation as number;
			const dx = point.x - cx;
			const dy = point.y - cy;
			u = (cx + Math.cos(angle) * dx + Math.sin(angle) * dy - x) / width;
			v = (cy - Math.sin(angle) * dx + Math.cos(angle) * dy - y) / height;
		}
		if (u < 0 || u > 1 || v < 0 || v > 1) return undefined;
		return { type: "node", nodeId: target, u, v };
	};
	const from = anchor("start", startPoint);
	const to = anchor("end", endPoint);
	if (from === undefined || to === undefined) return false;
	builder.connect({ from, to, color, width, route: "straight", startCap: "none", endCap: cap,
		...(observed === undefined ? {} : { waypoints: observed.points.slice(1,-1) }),
		...(props.dash === "dashed" || props.dash === "dotted" ? { strokeStyle: props.dash } : {}) },
		{ source: { id: shape.id as string, type } });
	for (const bindingId of usedBindings) state.consumed.add(bindingId);
	appearance(builder, shape);
	return true;
}

function convert(source: ImportSource, context: ImportContext): ImportResult {
	const file = readDrawingFile(source);
	const builder = new BoardBuilder("tldraw", context);
	for (const extra of file.extensions) {
		builder.note({ ...extra, status: "plugin-unsupported", reason: "customData" });
	}
	const shapes = file.records.filter(value => value.typeName === "shape");
	for (const shape of shapes) {
		if (typeof shape.index !== "string" || shape.index.length > 512) {
			throw new ImportError("unreadableData", "missing tldraw stacking index");
		}
	}
	shapes.sort((first, second) => {
		const left = first.index as string;
		const right = second.index as string;
		return left < right ? -1 : left > right ? 1 : 0;
	});
		const byId = new Map(file.records.map(value => [value.id as string, value]));
	const arrowBindings = new Map<string, JsonRecord[]>();
	for (const value of file.records) {
		if (value.typeName !== "binding" || typeof value.fromId !== "string") continue;
		const list = arrowBindings.get(value.fromId) ?? [];
		list.push(value);
		arrowBindings.set(value.fromId, list);
	}
	const capturedAppearance = readObservedAppearance(source, file, context.tldrawAppearance);
	const state: NativeImportState = { appearance: capturedAppearance, byId, arrowBindings, nodes: new Map(), consumed: new Set(), assets: new ImportAssets(source.path, context.newId), context, sourcePath: source.path, records: file.records, sequences: file.sequences };
	for (const shape of shapes) {
		if (importCard(shape, builder, state)) state.consumed.add(shape.id as string);
	}
	for (const shape of shapes) {
		if (importLine(shape, builder, state)) state.consumed.add(shape.id as string);
	}
		const firstLine = shapes.findIndex(shape => shape.type === "line" || shape.type === "arrow");
	if (firstLine >= 0 && shapes.slice(firstLine + 1).some(shape => shape.type !== "line" && shape.type !== "arrow")) {
		builder.note({ sourceId: "zOrder", sourceType: "shape index", status: "approximated", reason: "zOrder" });
	}
	let totalPoints = 0;
	for (const shape of shapes) {
		const id = shape.id as string;
		if (state.consumed.has(id)) continue;
		const type = shape.type as string;
		if (!supportedStroke(shape)) {
			builder.placeholder(placeholderRect(shape), {
				sourceId: id, sourceType: type, status: "plugin-unsupported", reason: "tldrawVariant",
			});
			continue;
		}
		const props = shape.props as JsonRecord;
		const segment = (props.segments as JsonRecord[])[0];
		const points = packedXY(segment.path);
		totalPoints += points.length / 2;
		if (totalPoints > MAX_TLDRAW_TOTAL_POINTS) throw new ImportError("tooLarge", "total tldraw points");
		let left = Infinity;
		let top = Infinity;
		let right = -Infinity;
		let bottom = -Infinity;
		for (let at = 0; at < points.length; at += 2) {
			left = Math.min(left, points[at]);
			right = Math.max(right, points[at]);
			top = Math.min(top, points[at + 1]);
			bottom = Math.max(bottom, points[at + 1]);
		}
				const x = Math.floor((shape.x as number) + left);
		const y = Math.floor((shape.y as number) + top);
		const width = Math.max(1, Math.ceil((shape.x as number) + right) - x);
		const height = Math.max(1, Math.ceil((shape.y as number) + bottom) - y);
		if (!coordinate(x) || !coordinate(y)) throw new ImportError("unreadableData", "drawing position outside bounds");
		const localPoints = points.map((value, at) => value + (at % 2 === 0 ? (shape.x as number) - x : (shape.y as number) - y));
		const observedStroke = state.appearance?.shapes.get(id)?.style;
		const stroke = readLocalStroke({
			color: observedStroke?.colors?.border ?? sourceColor("black", context),
			width: observedStroke?.borderWidth ?? 4.5,
			box: { width, height },
			points: localPoints,
		});
		if (stroke === undefined) throw new ImportError("unreadableData", "drawing exceeds board stroke bounds");
		const nodeId = builder.drawing({ x, y, width, height }, stroke, {
			source: { id, type },
			...(shape.isLocked === true ? { style: { locked: true as const } } : {}),
		});
		builder.note({ sourceId: id, sourceType: type, status: "approximated", reason: "tldrawStroke", nodeId });
	}
	for (const value of file.records) {
		noteRecordData(value, builder);
		if (state.consumed.has(value.id as string) || value.typeName === "shape" || NONVISUAL_RECORDS.has(value.typeName as string)) continue;
		builder.note({
			sourceId: value.id as string,
			sourceType: value.typeName as string,
			status: "plugin-unsupported",
			reason: "tldrawVariant",
		});
	}
	return { ...builder.finish({ sourcePath: source.path, formatVersion: "1 / schema 2 / draw 5" }, state.appearance?.theme), assets: state.assets.list() };
}

export const tldrawAdapter: FormatAdapter = {
	id: "tldraw",
	detect: source => source.extension === "tldr"
		|| (source.extension === "md" && source.frontmatter?.["tldraw-file"] === true),
	convert,
};
