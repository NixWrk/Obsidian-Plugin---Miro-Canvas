/**
 * The current official Obsidian fixture's page-level, packed XY pen strokes.
 * Format and sample receipts: docs/import-tldraw-audit.md.
 * No migrations, editor runtime, assets, or foreign implementation.
 */
import { defaultPenInk } from "../drawing";
import { MAX_STROKE_POINTS, readLocalStroke } from "../local-items";
import { BoardBuilder, type BoardRect } from "./board-builder";
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
	return { records, extensions };
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
	let totalPoints = 0;
	for (const shape of shapes) {
		const id = shape.id as string;
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
		const width = Math.max(1, right - left);
		const height = Math.max(1, bottom - top);
		const x = (shape.x as number) + left;
		const y = (shape.y as number) + top;
		if (!coordinate(x) || !coordinate(y)) throw new ImportError("unreadableData", "drawing position outside bounds");
		const localPoints = points.map((value, at) => value - (at % 2 === 0 ? left : top));
		const stroke = readLocalStroke({
			color: defaultPenInk(context.theme ?? "light"),
			width: 4,
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
		if (value.typeName === "shape" || NONVISUAL_RECORDS.has(value.typeName as string)) continue;
		builder.note({
			sourceId: value.id as string,
			sourceType: value.typeName as string,
			status: "plugin-unsupported",
			reason: "tldrawVariant",
		});
	}
	return builder.finish({ sourcePath: source.path, formatVersion: "1 / schema 2 / draw 5" });
}

export const tldrawAdapter: FormatAdapter = {
	id: "tldraw",
	detect: source => source.extension === "tldr"
		|| (source.extension === "md" && source.frontmatter?.["tldraw-file"] === true),
	convert,
};