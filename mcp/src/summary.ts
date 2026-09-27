/**
 * What an agent reads of a board, at three depths.
 *
 * The summary says what is on the board - how many cards of each kind, its
 * frames, its extent, locks, comments, export pages - in a few hundred
 * bytes.  The item list gives each card and line its place, kind and a
 * stretch of its text.  The full board is the file as it is, less the Miro
 * import (`miroSource`), which can be many times the rest and is read
 * piece by piece through a JSON Pointer.  Every reading goes through the
 * plugin's own readers, so the server sees a board the way the plugin does.
 */

import { boardConnectors } from "../../src/board-connectors";
import { readExportState } from "../../src/export-pages";
import { createInteractionPolicy, decideEditOperation } from "../../src/interaction-policy";
import { listCommentThreads } from "../../src/local-comments";
import { parseMiroCanvasMetadata } from "../../src/metadata";
import { buildSourceScene, type SourceItemDescriptor } from "../../src/source-model";
import { ToolError } from "./vault";

type UnknownRecord = Record<string, unknown>;

export interface Rect {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

/** A card's text is cut to this many characters in the item list. */
export const ITEM_TEXT_LIMIT = 500;

/** A slice of `miroSource` larger than this is described, not returned. */
export const SOURCE_SLICE_LIMIT = 256 * 1024;

/** The full board larger than this is refused; the item list reads it in pages. */
export const FULL_BOARD_LIMIT = 8 * 1024 * 1024;

/** The summary lists at most this many frames by name. */
const SUMMARY_FRAME_LIMIT = 200;

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "avif", "svg"]);

function isRecord(value: unknown): value is UnknownRecord {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function arrayOf(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

function nodesOf(document: UnknownRecord): UnknownRecord[] {
	return arrayOf(document.nodes).filter(isRecord);
}

function edgesOf(document: UnknownRecord): UnknownRecord[] {
	return arrayOf(document.edges).filter(isRecord);
}

function rectOf(node: UnknownRecord): Rect | undefined {
	const { x, y, width, height } = node;
	if (typeof x !== "number" || typeof y !== "number" || typeof width !== "number" || typeof height !== "number") return undefined;
	if (![x, y, width, height].every(Number.isFinite)) return undefined;
	return { x, y, width, height };
}

function fileExtension(node: UnknownRecord): string {
	if (typeof node.file !== "string") return "";
	const clean = node.file.split(/[?#]/u, 1)[0] ?? "";
	const match = /\.([^.\\/]+)$/u.exec(clean);
	return match?.[1]?.toLowerCase() ?? "";
}

/**
 * A card's kind in the words the tools use: what the plugin made it as
 * (sticky_note, code, table, drawing, line, a shape), what Miro item it
 * shows, else what native Canvas calls it - a group is a frame.
 */
function kindOf(node: UnknownRecord, descriptor: SourceItemDescriptor | undefined): string {
	if (descriptor?.localItem !== undefined) return descriptor.localItem;
	if (descriptor?.shape !== undefined) return "shape";
	if (descriptor !== undefined && descriptor.sourceId !== undefined) {
		return descriptor.kind === "sticky" ? "sticky_note" : descriptor.kind;
	}
	if (node.type === "group") return "frame";
	if (node.type === "file") return IMAGE_EXTENSIONS.has(fileExtension(node)) ? "image" : "file";
	if (typeof node.type === "string") return node.type;
	return "unknown";
}

/** What a card says: its text, a frame's label, a link's address, a file's path. */
function textOf(node: UnknownRecord): string {
	for (const key of ["text", "label", "url", "file"]) {
		const value = node[key];
		if (typeof value === "string") return value;
	}
	return "";
}

function contains(outer: Rect, inner: Rect): boolean {
	return inner.x >= outer.x && inner.y >= outer.y
		&& inner.x + inner.width <= outer.x + outer.width
		&& inner.y + inner.height <= outer.y + outer.height;
}

/** The innermost frame that holds the whole card, as native Canvas groups them. */
function frameOf(id: string, rect: Rect | undefined, frames: readonly { readonly id: string; readonly rect: Rect }[]): string | undefined {
	if (rect === undefined) return undefined;
	let best: { readonly id: string; readonly area: number } | undefined;
	for (const frame of frames) {
		if (frame.id === id || !contains(frame.rect, rect)) continue;
		const area = frame.rect.width * frame.rect.height;
		if (best === undefined || area < best.area) best = { id: frame.id, area };
	}
	return best?.id;
}

function framesOf(document: UnknownRecord): { readonly id: string; readonly label?: string; readonly rect: Rect }[] {
	const frames: { id: string; label?: string; rect: Rect }[] = [];
	for (const node of nodesOf(document)) {
		const rect = rectOf(node);
		if (node.type !== "group" || typeof node.id !== "string" || rect === undefined) continue;
		frames.push({ id: node.id, ...(typeof node.label === "string" ? { label: node.label } : {}), rect });
	}
	return frames;
}

/** The locked state a tool reports: locked by a person, not held by review mode. */
function isLocked(document: UnknownRecord, id: string): boolean {
	const decision = decideEditOperation(document, "edit", id);
	return !decision.allowed && decision.reason === "element-locked";
}

/** Whether a board has the Miro import, and what the plugin makes of its own record. */
export function boardStatus(document: UnknownRecord): { readonly hasMiroSource: boolean; readonly miroCanvasStatus: string } {
	return {
		hasMiroSource: Object.prototype.hasOwnProperty.call(document, "miroSource"),
		miroCanvasStatus: parseMiroCanvasMetadata(document).status,
	};
}

export interface BoardSummary {
	readonly counts: {
		readonly nodes: number;
		readonly edges: number;
		readonly connectors: number;
		readonly byKind: Readonly<Record<string, number>>;
	};
	readonly frames: readonly { readonly id: string; readonly label?: string; readonly rect: Rect }[];
	readonly framesOmitted: number;
	readonly bounds: Rect | null;
	readonly reviewMode: boolean;
	readonly locked: number;
	readonly comments: { readonly threads: number; readonly open: number; readonly resolved: number; readonly replies: number };
	readonly exportPages: readonly { readonly id: string; readonly name?: string; readonly rect: Rect }[];
	readonly metadata: { readonly status: string; readonly errors: number; readonly warnings: number };
	readonly hasMiroSource: boolean;
}

/** The board in a few hundred bytes. */
export function summarizeBoard(document: UnknownRecord): BoardSummary {
	const nodes = nodesOf(document);
	const scene = buildSourceScene(document);
	const byKind: Record<string, number> = {};
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const node of nodes) {
		const id = typeof node.id === "string" ? node.id : "";
		const kind = kindOf(node, scene.items.get(id));
		byKind[kind] = (byKind[kind] ?? 0) + 1;
		const rect = rectOf(node);
		if (rect === undefined) continue;
		minX = Math.min(minX, rect.x);
		minY = Math.min(minY, rect.y);
		maxX = Math.max(maxX, rect.x + rect.width);
		maxY = Math.max(maxY, rect.y + rect.height);
	}
	const frames = framesOf(document);
	const policy = createInteractionPolicy(document);
	const threads = listCommentThreads(document);
	const metadata = isRecord(document.miroCanvas) ? document.miroCanvas : undefined;
	const exportState = readExportState(metadata?.export);
	const metadataRead = parseMiroCanvasMetadata(document);
	return {
		counts: {
			nodes: nodes.length,
			edges: edgesOf(document).length,
			connectors: boardConnectors(document).length,
			byKind,
		},
		frames: frames.slice(0, SUMMARY_FRAME_LIMIT),
		framesOmitted: Math.max(0, frames.length - SUMMARY_FRAME_LIMIT),
		bounds: Number.isFinite(minX) ? { x: minX, y: minY, width: maxX - minX, height: maxY - minY } : null,
		reviewMode: policy.valid && policy.reviewMode,
		locked: policy.valid ? policy.lockedElementIds.length : 0,
		comments: {
			threads: threads.length,
			open: threads.filter((thread) => !thread.resolved).length,
			resolved: threads.filter((thread) => thread.resolved).length,
			replies: threads.reduce((total, thread) => total + thread.replies.length, 0),
		},
		exportPages: exportState.pages.map((page) => ({
			id: page.id,
			...(page.name === undefined ? {} : { name: page.name }),
			rect: { x: page.x, y: page.y, width: page.width, height: page.height },
		})),
		metadata: {
			status: metadataRead.status,
			errors: metadataRead.diagnostics.filter((diagnostic) => diagnostic.severity === "error").length,
			warnings: metadataRead.diagnostics.filter((diagnostic) => diagnostic.severity === "warning").length,
		},
		hasMiroSource: boardStatus(document).hasMiroSource,
	};
}

/** One card or line in the item list. */
export interface BoardItem {
	readonly id: string;
	/** A card's kind (text, sticky_note, frame, shape, image...), or "edge" / "connector" for a line. */
	readonly kind: string;
	readonly nodeType?: string;
	readonly shape?: string;
	readonly text?: string;
	readonly textTruncated?: boolean;
	readonly rect?: Rect;
	readonly rotation?: number;
	readonly locked: boolean;
	readonly frameId?: string;
	/** The card's place in the board's node list: the order native Canvas draws them. */
	readonly layerIndex?: number;
	readonly from?: unknown;
	readonly to?: unknown;
	readonly label?: string;
}

export interface BoardItemPage {
	readonly total: number;
	readonly offset: number;
	readonly items: readonly BoardItem[];
	/** Where the next page starts; absent on the last page. */
	readonly nextOffset?: number;
}

function cutText(text: string): { readonly text: string; readonly textTruncated?: boolean } {
	if (text.length <= ITEM_TEXT_LIMIT) return { text };
	return { text: text.slice(0, ITEM_TEXT_LIMIT), textTruncated: true };
}

/**
 * Cards in the board's order, then native edges, then the board's own
 * connectors; `ids` keeps only those named.  One page of `limit` from `offset`.
 */
export function listBoardItems(
	document: UnknownRecord,
	options: { readonly ids?: readonly string[]; readonly offset?: number; readonly limit: number },
): BoardItemPage {
	const wanted = options.ids === undefined ? undefined : new Set(options.ids);
	const keep = (id: unknown): boolean => typeof id === "string" && (wanted === undefined || wanted.has(id));
	// Only ids and indexes first; each chosen item is read in full below.
	const entries: ({ readonly kind: "node"; readonly index: number } | { readonly kind: "edge"; readonly index: number } | { readonly kind: "connector"; readonly index: number })[] = [];
	const nodes = nodesOf(document);
	nodes.forEach((node, index) => {
		if (keep(node.id)) entries.push({ kind: "node", index });
	});
	const edges = edgesOf(document);
	edges.forEach((edge, index) => {
		if (keep(edge.id)) entries.push({ kind: "edge", index });
	});
	const connectors = boardConnectors(document);
	connectors.forEach((connector, index) => {
		if (keep(connector.id)) entries.push({ kind: "connector", index });
	});
	const offset = Math.max(0, options.offset ?? 0);
	const page = entries.slice(offset, offset + options.limit);
	const scene = page.length === 0 ? undefined : buildSourceScene(document);
	const frames = framesOf(document);
	const items = page.map((entry): BoardItem => {
		if (entry.kind === "node") {
			const node = nodes[entry.index];
			const id = node.id as string;
			const descriptor = scene?.items.get(id);
			const rect = rectOf(node);
			const frameId = frameOf(id, rect, frames);
			return {
				id,
				kind: kindOf(node, descriptor),
				...(typeof node.type === "string" ? { nodeType: node.type } : {}),
				...(descriptor?.shape === undefined ? {} : { shape: descriptor.shape }),
				...cutText(textOf(node)),
				...(rect === undefined ? {} : { rect }),
				rotation: descriptor?.rotation ?? 0,
				locked: isLocked(document, id),
				...(frameId === undefined ? {} : { frameId }),
				layerIndex: entry.index,
			};
		}
		if (entry.kind === "edge") {
			const edge = edges[entry.index];
			const id = edge.id as string;
			return {
				id,
				kind: "edge",
				from: { nodeId: edge.fromNode, ...(typeof edge.fromSide === "string" ? { side: edge.fromSide } : {}) },
				to: { nodeId: edge.toNode, ...(typeof edge.toSide === "string" ? { side: edge.toSide } : {}) },
				...(typeof edge.label === "string" ? { label: edge.label } : {}),
				locked: isLocked(document, id),
			};
		}
		const connector = connectors[entry.index];
		return {
			id: connector.id,
			kind: "connector",
			from: connector.from,
			to: connector.to,
			...(connector.label === undefined ? {} : { label: connector.label }),
			locked: isLocked(document, connector.id),
		};
	});
	const next = offset + page.length;
	return { total: entries.length, offset, items, ...(next < entries.length ? { nextOffset: next } : {}) };
}

/** The board as it is, less the Miro import; refused when too large to hand over at once. */
export function fullBoard(document: UnknownRecord): UnknownRecord {
	const { miroSource: _miroSource, ...rest } = document;
	const size = JSON.stringify(rest).length;
	if (size > FULL_BOARD_LIMIT) {
		throw new ToolError("too-large", `The board is ${size} characters without its Miro import; read it with level "items" in pages.`);
	}
	return rest;
}

function unescapePointer(name: string): string {
	return name.replace(/~1/g, "/").replace(/~0/g, "~");
}

/**
 * The piece of `miroSource` a JSON Pointer names ("" is all of it, "/items/0"
 * the first item).  A piece larger than the limit is described instead: its
 * size and its keys or length, so the agent can point further in.
 */
export function sourceSlice(document: UnknownRecord, sourcePointer: string): UnknownRecord {
	if (!Object.prototype.hasOwnProperty.call(document, "miroSource")) {
		throw new ToolError("no-source", "The board has no miroSource.");
	}
	if (sourcePointer !== "" && !sourcePointer.startsWith("/")) {
		throw new ToolError("pointer-invalid", "A source pointer is a JSON Pointer: empty, or starting with '/'.");
	}
	let value: unknown = document.miroSource;
	const names = sourcePointer === "" ? [] : sourcePointer.slice(1).split("/").map(unescapePointer);
	for (const name of names) {
		if (Array.isArray(value) && /^(?:0|[1-9]\d*)$/.test(name) && Number(name) < value.length) {
			value = value[Number(name)];
		} else if (isRecord(value) && Object.prototype.hasOwnProperty.call(value, name)) {
			value = value[name];
		} else {
			throw new ToolError("pointer-missing", `miroSource has nothing at ${sourcePointer}.`);
		}
	}
	const size = JSON.stringify(value)?.length ?? 0;
	if (size <= SOURCE_SLICE_LIMIT) return { pointer: sourcePointer, value };
	return {
		pointer: sourcePointer,
		truncated: true,
		size,
		...(Array.isArray(value) ? { length: value.length } : {}),
		...(isRecord(value) ? { keys: Object.keys(value).slice(0, 500) } : {}),
	};
}
