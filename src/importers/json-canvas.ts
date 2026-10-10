/**
 * JSON Canvas 1.0 copy import (https://jsoncanvas.org/spec/1.0/).
 * Native arrays are optional in the source. The copy supplies empty arrays
 * for Obsidian, preserves every other field and never rewrites asset paths.
 */
import { BoardBuilder, assertNothingNewToSay, metadataDiagnostics } from "./board-builder";
import {
	ImportError,
	MAX_IMPORT_ELEMENTS,
	MAX_IMPORT_SOURCE_LENGTH,
	type FormatAdapter,
	type ImportContext,
	type ImportEntry,
	type ImportResult,
	type ImportSource,
} from "./types";

type UnknownRecord = Record<string, unknown>;
const MAX_JSON_DEPTH = 128;
const NODE_FIELDS = new Set(["id", "type", "x", "y", "width", "height", "color", "text", "file", "subpath", "url", "label", "background", "backgroundStyle"]);
const EDGE_FIELDS = new Set(["id", "fromNode", "toNode", "fromSide", "toSide", "fromEnd", "toEnd", "color", "label"]);
const ROOT_FIELDS = new Set(["nodes", "edges", "miroCanvas", "miroSource", "metadata"]);
const NODE_TYPES = new Set(["text", "file", "link", "group"]);
const SIDES = new Set(["top", "right", "bottom", "left"]);
const ENDS = new Set(["none", "arrow"]);
const BACKGROUND_STYLES = new Set(["cover", "ratio", "repeat"]);

export function isCanvasRecord(value: unknown): value is UnknownRecord {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Bound nesting before any recursive metadata reader or writer sees the copy. */
function checkJsonValues(value: unknown, depth = 0): void {
	if (depth > MAX_JSON_DEPTH) throw new ImportError("tooLarge", "Canvas JSON nesting");
	if (typeof value === "number" && !Number.isFinite(value)) throw new ImportError("unreadableData", "Non-finite JSON number");
	if (Array.isArray(value)) {
		for (const child of value) checkJsonValues(child, depth + 1);
	} else if (isCanvasRecord(value)) {
		for (const key of Object.keys(value)) checkJsonValues(value[key], depth + 1);
	}
}

/** Parse a detached, bounded board; unknown data and source evidence stay exact. */
export function readJsonCanvasDocument(source: ImportSource): UnknownRecord {
	if (source.text.length > MAX_IMPORT_SOURCE_LENGTH) throw new ImportError("tooLarge");
	let document: unknown;
	try {
		document = JSON.parse(source.text) as unknown;
	} catch {
		throw new ImportError("unreadableData");
	}
	if (!isCanvasRecord(document)) throw new ImportError("unknownStructure");
	for (const field of ["nodes", "edges"]) {
		if (Object.prototype.hasOwnProperty.call(document, field) && !Array.isArray(document[field])) {
			throw new ImportError("unknownStructure");
		}
	}
	const nodes = Array.isArray(document.nodes) ? document.nodes : [];
	const edges = Array.isArray(document.edges) ? document.edges : [];
	if (nodes.length + edges.length > MAX_IMPORT_ELEMENTS) throw new ImportError("tooLarge");
	checkJsonValues(document);
	document.nodes = nodes;
	document.edges = edges;
	return document;
}

function optionalString(record: UnknownRecord, key: string): boolean {
	return record[key] === undefined || typeof record[key] === "string";
}

function optionalChoice(record: UnknownRecord, key: string, choices: ReadonlySet<string>): boolean {
	const value = record[key];
	return value === undefined || (typeof value === "string" && choices.has(value));
}

function readableColor(value: unknown, advanced: boolean): boolean {
	return value === undefined || (typeof value === "string"
		&& (/^#[0-9a-f]{6}$/iu.test(value) || (advanced ? /^[1-9][0-9]*$/u : /^[1-6]$/u).test(value)));
}

/** Shared native validation; Advanced Canvas additionally permits custom palette IDs. */
export function isReadableCanvasNode(value: unknown, advanced = false): value is UnknownRecord {
	if (!isCanvasRecord(value) || typeof value.id !== "string" || value.id === ""
		|| typeof value.type !== "string" || !NODE_TYPES.has(value.type)) return false;
	for (const field of ["x", "y", "width", "height"]) {
		if (typeof value[field] !== "number" || !Number.isSafeInteger(value[field])) return false;
	}
	if ((value.width as number) <= 0 || (value.height as number) <= 0
		|| !Number.isSafeInteger((value.x as number) + (value.width as number))
		|| !Number.isSafeInteger((value.y as number) + (value.height as number))
		|| !readableColor(value.color, advanced)) return false;
	if (value.type === "text") return typeof value.text === "string";
	if (value.type === "link") return typeof value.url === "string";
	if (value.type === "file") {
		return typeof value.file === "string" && optionalString(value, "subpath")
			&& (value.subpath === undefined || (value.subpath as string).startsWith("#"));
	}
	return optionalString(value, "label") && optionalString(value, "background")
		&& optionalChoice(value, "backgroundStyle", BACKGROUND_STYLES);
}

/** Endpoints are checked separately, after unreadable cards have been removed. */
export function isReadableCanvasEdge(value: unknown, advanced = false): value is UnknownRecord {
	return isCanvasRecord(value) && typeof value.id === "string" && value.id !== ""
		&& typeof value.fromNode === "string" && value.fromNode !== ""
		&& typeof value.toNode === "string" && value.toNode !== ""
		&& optionalChoice(value, "fromSide", SIDES) && optionalChoice(value, "toSide", SIDES)
		&& optionalChoice(value, "fromEnd", ENDS) && optionalChoice(value, "toEnd", ENDS)
		&& optionalString(value, "label") && readableColor(value.color, advanced);
}

export function canvasElementSourceId(value: unknown, kind: "nodes" | "edges", index: number): string {
	return isCanvasRecord(value) && typeof value.id === "string" && value.id !== "" ? value.id : `${kind}[${index}]`;
}

/** Check each distinct local reference once; a missing asset never removes its card. */
export function noteMissingCanvasAssets(
	nodes: readonly UnknownRecord[],
	sourcePath: string,
	context: ImportContext,
	note: (entry: ImportEntry) => void,
): void {
	const resolved = new Map<string, boolean>();
	for (const node of nodes) {
		const path = node.type === "file" ? node.file : node.type === "group" ? node.background : undefined;
		if (typeof path !== "string") continue;
		let exists = resolved.get(path);
		if (exists === undefined) {
			exists = context.resolveLink(path, sourcePath) !== undefined;
			resolved.set(path, exists);
		}
		if (!exists) {
			note({
				sourceId: node.id as string,
				sourceType: node.type === "group" ? "group background" : "file",
				status: "missing-asset",
				reason: node.type === "group" ? "imageNotFound" : "fileNotFound",
				nodeId: node.id as string,
			});
		}
	}
}

function convertJsonCanvas(source: ImportSource, context: ImportContext): ImportResult {
	const document = readJsonCanvasDocument(source);
	const before = metadataDiagnostics(document);
	const builder = new BoardBuilder("json-canvas", context);
	const nodes: UnknownRecord[] = [];
	const edges: UnknownRecord[] = [];
	const nodeIds = new Set<string>();
	const usedIds = new Set<string>();
	const reported = new Set<string>();
	const note = (entry: ImportEntry): void => {
		if (entry.nodeId !== undefined) reported.add(entry.nodeId);
		builder.note(entry);
	};
	(document.nodes as unknown[]).forEach((node, index) => {
		if (!isReadableCanvasNode(node) || usedIds.has(node.id as string)) {
			note({ sourceId: canvasElementSourceId(node, "nodes", index), sourceType: "node", status: "invalid-source", reason: "invalidElement" });
			return;
		}
		nodes.push(node);
		nodeIds.add(node.id as string);
		usedIds.add(node.id as string);
	});
	(document.edges as unknown[]).forEach((edge, index) => {
		if (!isReadableCanvasEdge(edge) || usedIds.has(edge.id as string)
			|| !nodeIds.has(edge.fromNode as string) || !nodeIds.has(edge.toNode as string)) {
			note({ sourceId: canvasElementSourceId(edge, "edges", index), sourceType: "edge", status: "invalid-source", reason: "invalidElement" });
			return;
		}
		edges.push(edge);
		usedIds.add(edge.id as string);
	});
	document.nodes = nodes;
	document.edges = edges;
	noteMissingCanvasAssets(nodes, source.path, context, note);
	// Preserve extension data, but do not claim another plugin's semantics are drawn.
	for (const [elements, fields] of [[nodes, NODE_FIELDS], [edges, EDGE_FIELDS]] as const) {
		for (const element of elements) {
			const unknown = Object.keys(element).find((key) => !fields.has(key));
			if (unknown !== undefined) note({ sourceId: element.id as string, sourceType: unknown, status: "plugin-unsupported", reason: "customStyle", nodeId: element.id as string });
		}
	}
	for (const key of Object.keys(document)) {
		if (!ROOT_FIELDS.has(key)) builder.note({ sourceId: `root:${key}`, sourceType: key, status: "plugin-unsupported", reason: "customData" });
	}
	if (before.length > 0) builder.note({ sourceId: "miroCanvas", sourceType: "miroCanvas", status: "plugin-unsupported", reason: "existingOverride" });
	for (const element of [...nodes, ...edges]) {
		if (!reported.has(element.id as string)) builder.countConverted();
	}
	assertNothingNewToSay(document, before);
	return { document, report: builder.report({ sourcePath: source.path, formatVersion: "1.0" }) };
}

export const jsonCanvasAdapter: FormatAdapter = {
	id: "json-canvas",
	detect: (source) => {
		if (source.extension !== "canvas") return false;
		try {
			readJsonCanvasDocument(source);
			return true;
		} catch {
			return false;
		}
	},
	convert: convertJsonCanvas,
};
