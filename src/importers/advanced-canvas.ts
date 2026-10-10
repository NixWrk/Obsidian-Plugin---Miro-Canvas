/**
 * An Advanced Canvas board: a copy of the whole board, every field kept, with
 * Advanced Canvas's styles written again as the plugin's own overrides.
 *
 * Advanced Canvas (Developer-Mike/obsidian-advanced-canvas, file format
 * "1.0-1.0" in `metadata.version`) keeps its looks on the cards and lines
 * themselves: `styleAttributes` on a node (`shape`, `border`, `textAlign`)
 * and on an edge (`path`, `arrow`, `pathfindingMethod`), a portal as
 * `portal: true` on a file card with the lines into it under
 * `interdimensionalEdges`, a collapsed group as `collapsed: true`, and the
 * first slide of a presentation as `metadata.startNode` (`isStartNode` on the
 * node in files older than that format).
 *
 * The copy keeps every card and line under its own id, so no card is bound
 * to a source element: Advanced Canvas still draws the copy as it drew the
 * original, and the plugin draws it from the overrides.  An override the
 * board already has wins over the one Advanced Canvas's style would give.
 * Unreadable native records and lines with missing ends are omitted with
 * diagnostics; every readable record retains its unknown fields.
 *
 * Pure: never imports "obsidian"; the board it returns is checked the way
 * `BoardBuilder.finish` checks a built one.
 */

import { groupCollapse, toggleGroupCollapse } from "../board-groups";
import type { CanvasShapeKind } from "../canvas-authoring";
import { MIRO_CANVAS_SCHEMA_VERSION, validateMiroCanvasMetadata, type MiroCanvasDiagnostic } from "../metadata";
import { BoardBuilder, assertNothingNewToSay } from "./board-builder";
import { canvasElementSourceId, isReadableCanvasEdge, isReadableCanvasNode, noteMissingCanvasAssets, readJsonCanvasDocument } from "./json-canvas";
import {
	ImportError,
	MAX_IMPORT_ELEMENTS,
	type FormatAdapter,
	type ImportContext,
	type ImportEntryStatus,
	type ImportReason,
	type ImportResult,
	type ImportSource,
} from "./types";

type UnknownRecord = Record<string, unknown>;

/** A style value written again as the plugin's own, and why it is only close, when it is. */
interface Mapped<T> {
	readonly value: T;
	readonly approximation?: ImportReason;
}

/** Advanced Canvas's card shapes, as the plugin's shape kinds. */
const NODE_SHAPES: ReadonlyMap<string, Mapped<CanvasShapeKind>> = new Map([
	["pill", { value: "flow_chart_terminator" }],
	["diamond", { value: "rhombus" }],
	["parallelogram", { value: "parallelogram" }],
	["circle", { value: "circle" }],
	["predefined-process", { value: "flow_chart_predefined_process" }],
	["document", { value: "flow_chart_document" }],
	["database", { value: "can" }],
]);

/** Card borders; an invisible border is a card with no border. */
const NODE_BORDERS: ReadonlyMap<string, Mapped<string>> = new Map([
	["dashed", { value: "dashed" }],
	["dotted", { value: "dotted" }],
	["invisible", { value: "none" }],
]);

/** Text alignment; left is Advanced Canvas's default and never written. */
const TEXT_ALIGNMENTS: ReadonlyMap<string, Mapped<string>> = new Map([
	["center", { value: "center" }],
	["right", { value: "right" }],
]);

/** Line dashes; the plugin has one dash length. */
const EDGE_PATHS: ReadonlyMap<string, Mapped<string>> = new Map<string, Mapped<string>>([
	["dotted", { value: "dotted" }],
	["short-dashed", { value: "dashed" }],
	["long-dashed", { value: "dashed", approximation: "longDash" }],
]);

/**
 * Arrowheads, on every end of a line that has one.  The plugin's round ends
 * on a native edge are `filled_oval` and `oval`; a halved triangle and a
 * blunt end have no equal and take the nearest.
 */
const EDGE_ARROWS: ReadonlyMap<string, Mapped<string>> = new Map<string, Mapped<string>>([
	["triangle-outline", { value: "triangle" }],
	["thin-triangle", { value: "arrow" }],
	["halved-triangle", { value: "stealth", approximation: "arrowhead" }],
	["diamond", { value: "filled_diamond" }],
	["diamond-outline", { value: "diamond" }],
	["circle", { value: "filled_oval" }],
	["circle-outline", { value: "oval" }],
	["blunt", { value: "none", approximation: "arrowhead" }],
]);

/** How a line finds its way; Advanced Canvas's A* search is drawn with elbows. */
const EDGE_ROUTES: ReadonlyMap<string, Mapped<string>> = new Map<string, Mapped<string>>([
	["direct", { value: "straight" }],
	["square", { value: "elbowed" }],
	["a-star", { value: "elbowed", approximation: "pathfinding" }],
]);

/** Card settings Advanced Canvas keeps that the plugin leaves alone (the older names too). */
const KEPT_NODE_SETTINGS = ["dynamicHeight", "ratio", "zIndex", "autoResizeHeight", "sideRatio"] as const;

/** The ids Advanced Canvas gives the cards and lines of a board shown inside a portal: `acportal||<portal>||<id>`. */
const PORTAL_ID_DELIMITER = "||";
const PORTAL_ID_PREFIX = `acportal${PORTAL_ID_DELIMITER}`;

function isRecord(value: unknown): value is UnknownRecord {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(record: UnknownRecord, key: string): boolean {
	return Object.prototype.hasOwnProperty.call(record, key);
}

/** Malformed styles are described without invoking their own coercion fields. */
function styleDescription(value: unknown): string {
	if (Array.isArray(value)) return "array";
	if (isRecord(value)) return "object";
	return String(value);
}

/** The styles Advanced Canvas set; null means a style returned to its default. */
function setStyles(value: unknown): [string, unknown][] {
	if (!isRecord(value)) return [];
	return Object.entries(value).filter(([, style]) => style !== null && style !== undefined);
}

/** The card on this board a portal's inner id belongs to: the outermost portal, `p1` in `acportal||p1||p2||n`. */
function portalOf(id: string): string | undefined {
	if (!id.startsWith(PORTAL_ID_PREFIX)) return undefined;
	const nested = id.slice(PORTAL_ID_PREFIX.length).split(PORTAL_ID_DELIMITER);
	if (nested.length < 2 || nested[0] === "") return undefined;
	return nested[0];
}

/** Whether a card carries anything only Advanced Canvas writes and this importer turns into something. */
function nodeHasAdvancedFields(node: UnknownRecord): boolean {
	if (setStyles(node.styleAttributes).length > 0) return true;
	if (node.portal === true || node.portalToFile === true) return true;
	if (node.isStartNode === true) return true;
	if (node.collapsed === true || node.isCollapsed === true) return true;
	if (Array.isArray(node.interdimensionalEdges) && node.interdimensionalEdges.length > 0) return true;
	return isRecord(node.edgesToNodeFromPortal);
}

/**
 * Whether the board has Advanced Canvas's own fields.  A board Advanced
 * Canvas only opened carries `metadata.version` and empty `styleAttributes`
 * and has nothing to import; the settings the plugin leaves alone
 * (`dynamicHeight`, `ratio`, `zIndex`) are not reason enough either.
 */
function detectAdvancedCanvas(source: ImportSource): boolean {
	if (source.extension !== "canvas") return false;
	let board: unknown;
	try {
		board = readJsonCanvasDocument(source);
	} catch {
		return false;
	}
	if (!isRecord(board) || !Array.isArray(board.nodes)) return false;
	if (isRecord(board.metadata) && typeof board.metadata.startNode === "string" && board.metadata.startNode !== "") return true;
	if (board.nodes.some((node) => isRecord(node) && nodeHasAdvancedFields(node))) return true;
	const edges = Array.isArray(board.edges) ? board.edges : [];
	return edges.some((edge) => isRecord(edge) && setStyles(edge.styleAttributes).length > 0);
}

/** The board's own `miroCanvas`, and whether the importer may add to it. */
interface PluginData {
	/** The record overrides and the deck go into: the board's own, or a new one. */
	readonly record: UnknownRecord;
	/** Whether the board had one. */
	readonly existed: boolean;
	/** Whether the plugin reads it, so what the importer adds would be read too. */
	readonly writable: boolean;
	/** What the plugin's own validator said of the board's record before anything was added. */
	readonly diagnostics: readonly MiroCanvasDiagnostic[];
}

function readPluginData(document: UnknownRecord): PluginData {
	if (!hasOwn(document, "miroCanvas")) {
		return { record: { schemaVersion: MIRO_CANVAS_SCHEMA_VERSION }, existed: false, writable: true, diagnostics: [] };
	}
	const own = document.miroCanvas;
	const validated = validateMiroCanvasMetadata(own);
	return {
		record: isRecord(own) ? own : {},
		existed: true,
		writable: validated.valid && isRecord(own),
		diagnostics: validated.diagnostics,
	};
}

/**
 * Adds `patch` into `target` where `target` has nothing yet, record by
 * record; whatever `target` already holds stays as it is.
 */
function addMissing(target: UnknownRecord, patch: UnknownRecord): void {
	for (const [key, value] of Object.entries(patch)) {
		const existing = hasOwn(target, key) ? target[key] : undefined;
		if (isRecord(existing) && isRecord(value)) {
			addMissing(existing, value);
		} else if (!hasOwn(target, key)) {
			Object.defineProperty(target, key, { value, enumerable: true, configurable: true, writable: true });
		}
	}
}

/** Reads `record.a.b` along a path, or undefined. */
function valueAt(record: unknown, path: readonly string[]): unknown {
	let current = record;
	for (const key of path) {
		if (!isRecord(current) || !hasOwn(current, key)) return undefined;
		current = current[key];
	}
	return current;
}

/** Writes `value` at `record.a.b`, making the records on the way. */
function setAt(record: UnknownRecord, path: readonly string[], value: unknown): void {
	let current = record;
	for (const key of path.slice(0, -1)) {
		const next = current[key];
		if (isRecord(next)) {
			current = next;
		} else {
			const made: UnknownRecord = {};
			current[key] = made;
			current = made;
		}
	}
	current[path[path.length - 1]] = value;
}

/** One board being copied: the copy, the plugin's data on it, and the report. */
class AdvancedCanvasCopy {
	private readonly builder: BoardBuilder;
	private readonly document: UnknownRecord;
	private readonly plugin: PluginData;
	private readonly nodes: UnknownRecord[] = [];
	private readonly edges: UnknownRecord[] = [];
	/** Card ids; a line never has one of them (ids are used once on a board). */
	private readonly nodeIds = new Set<string>();
	/** Overrides to add, by card or line id: only what the board's own overrides do not already set. */
	private readonly additions = new Map<string, UnknownRecord>();
	private deck: UnknownRecord | undefined;
	/** Cards and lines with an entry in the report: they count under it, not as converted. */
	private readonly reported = new Set<string>();
	/** Settings kept but not drawn, reported once for each kind. */
	private readonly keptKinds = new Set<string>();
	private readonly context: ImportContext;
	private groupCount = 0;
	private collapseWork = 0;
	private readonly sourceLength: number;

	constructor(document: UnknownRecord, context: ImportContext, sourceLength: number) {
		this.builder = new BoardBuilder("advanced-canvas", context);
		this.context = context;
		this.sourceLength = sourceLength;
		this.document = document;
		this.plugin = readPluginData(document);
	}

	convert(sourcePath: string): ImportResult {
		this.notePluginData();
		this.keepReadableNodes();
		this.keepReadableEdges();
		noteMissingCanvasAssets(this.nodes, sourcePath, this.context, (entry) => {
			this.reported.add(entry.nodeId as string);
			this.builder.note(entry);
		});
		for (const node of this.nodes) this.convertNode(node);
		for (const edge of this.edges) this.convertEdge(edge);
		this.convertPresentation();
		this.writePluginData();
		this.countConverted();
		this.check();
		const metadata = this.document.metadata;
		const version = isRecord(metadata) && typeof metadata.version === "string" && metadata.version !== "" ? metadata.version : undefined;
		const report = this.builder.report({ sourcePath, ...(version === undefined ? {} : { formatVersion: version }) });
		return { document: this.document, report };
	}

	/**
	 * A board that already has plugin data the plugin's validator complains
	 * about keeps it exactly as it is.  With only warnings (fields a newer
	 * version wrote) the plugin still reads it, so the styles are added to
	 * it; with errors the plugin does not read it, so nothing is added and
	 * every style stays Advanced Canvas's alone.
	 */
	private notePluginData(): void {
		if (!this.plugin.existed || this.plugin.diagnostics.length === 0) return;
		if (this.plugin.writable) {
			this.builder.note({ sourceId: "miroCanvas", sourceType: "plugin data", status: "plugin-unsupported", reason: "existingOverride" });
		} else {
			this.builder.note({ sourceId: "miroCanvas", sourceType: "plugin data", status: "invalid-source", reason: "unreadableData" });
		}
	}

	/** Cards without an id, a type or a place, or with an id used before, are left out of the copy. */
	private keepReadableNodes(): void {
		const source = this.document.nodes as unknown[];
		source.forEach((node, index) => {
			const readable = isReadableCanvasNode(node, true) && !this.nodeIds.has(node.id as string);
			if (readable) {
				this.nodes.push(node);
				if (node.type === "group") this.groupCount += 1;
				this.nodeIds.add(node.id as string);
				return;
			}
			const id = canvasElementSourceId(node, "nodes", index);
			this.builder.note({ sourceId: id, sourceType: "node", status: "invalid-source", reason: "invalidElement" });
		});
		this.document.nodes = this.nodes;
	}

	/**
	 * Lines whose end is on no card cannot stay: no Canvas opens a board with
	 * one.  A line into a card shown inside a portal (`acportal||<portal>||…`)
	 * holds on to the portal's card instead; any other is left out.
	 */
	private keepReadableEdges(): void {
		const source = Array.isArray(this.document.edges) ? this.document.edges : [];
		const usedIds = new Set<string>(this.nodeIds);
		source.forEach((edge, index) => {
			if (!isReadableCanvasEdge(edge, true) || usedIds.has(edge.id as string)) {
				const id = canvasElementSourceId(edge, "edges", index);
				this.builder.note({ sourceId: id, sourceType: "edge", status: "invalid-source", reason: "invalidElement" });
				return;
			}
			usedIds.add(edge.id as string);
			if (this.holdsOn(edge.fromNode) && this.holdsOn(edge.toNode)) {
				this.edges.push(edge);
				return;
			}
			if (this.reattachToPortal(edge)) {
				this.edges.push(edge);
				this.reported.add(edge.id as string);
				this.builder.note({ sourceId: edge.id as string, sourceType: "edge", status: "approximated", reason: "portalEdge" });
				return;
			}
			const intoPortal = [edge.fromNode, edge.toNode].some((end) => typeof end === "string" && portalOf(end) !== undefined);
			if (intoPortal) {
				this.builder.note({ sourceId: edge.id as string, sourceType: "edge", status: "plugin-unsupported", reason: "portalEdge" });
			} else {
				this.builder.note({ sourceId: edge.id as string, sourceType: "edge", status: "invalid-source", reason: "invalidElement" });
			}
		});
		this.document.edges = this.edges;
	}

	private holdsOn(end: unknown): boolean {
		return typeof end === "string" && this.nodeIds.has(end);
	}

	/** Moves the one loose end of a line onto the portal card it pointed into; false when it cannot. */
	private reattachToPortal(edge: UnknownRecord): boolean {
		const fromHeld = this.holdsOn(edge.fromNode);
		const toHeld = this.holdsOn(edge.toNode);
		if (fromHeld === toHeld) return false;
		const loose = fromHeld ? edge.toNode : edge.fromNode;
		if (typeof loose !== "string") return false;
		const portal = portalOf(loose);
		if (portal === undefined || !this.nodeIds.has(portal)) return false;
		if (fromHeld) edge.toNode = portal;
		else edge.fromNode = portal;
		return true;
	}

	private convertNode(node: UnknownRecord): void {
		const id = node.id as string;
		const type = node.type as string;
		for (const [key, value] of setStyles(node.styleAttributes)) {
			if (key === "shape") this.nodeShape(node, value);
			else if (key === "border") this.nodeBorder(node, value);
			else if (key === "textAlign") this.nodeAlignment(node, value);
			else this.keptKind(`styleAttributes.${key}`, `${type} style`);
		}
		if (type === "file" && (node.portal === true || node.portalToFile === true)) {
			this.noteElement(id, type, "approximated", "portal");
		}
		this.notePortalEdges(node);
		if (type === "group" && (node.collapsed === true || node.isCollapsed === true)) this.convertCollapse(node);
		for (const setting of KEPT_NODE_SETTINGS) {
			const value = node[setting];
			if (value !== undefined && value !== null && value !== false) this.keptKind(setting, `${type} setting`);
		}
	}

	/** Use the same snapshot planner as the native group action; never store projected boxes. */
	private convertCollapse(node: UnknownRecord): void {
		const id = node.id as string;
		if (!this.plugin.writable) {
			this.noteElement(id, "group", "plugin-unsupported", "collapsed");
			return;
		}
		const ownOverrides = this.plugin.record.localOverrides;
		const own = isRecord(ownOverrides) && hasOwn(ownOverrides, id) ? ownOverrides[id] : undefined;
		if (valueAt(own, ["groupCollapse"]) !== undefined) {
			this.noteElement(id, "group", "approximated", "existingOverride");
			return;
		}
		// Bound both nested membership scans and copies of the board's unknown data.
		this.collapseWork += Math.max(this.sourceLength, this.nodes.length * (this.groupCount + 1));
		if (this.collapseWork > MAX_IMPORT_ELEMENTS * 128) {
			this.noteElement(id, "group", "plugin-unsupported", "collapsed");
			return;
		}
		const overrides = isRecord(ownOverrides) ? { ...ownOverrides } : {};
		if (!hasOwn(overrides, id)) Object.defineProperty(overrides, id, { value: {}, enumerable: true, configurable: true, writable: true });
		const planningDocument = { ...this.document, miroCanvas: { ...this.plugin.record, localOverrides: overrides } };
		const planned = toggleGroupCollapse(planningDocument, id);
		const snapshot = planned === undefined ? undefined : groupCollapse(planned, id);
		if (snapshot === undefined) {
			this.noteElement(id, "group", "plugin-unsupported", "collapsed");
			return;
		}
		this.addOverride(node, ["groupCollapse"], snapshot, "collapsed");
	}

	/** Advanced Canvas draws a shape on text cards only. */
	private nodeShape(node: UnknownRecord, value: unknown): void {
		const mapped = typeof value === "string" ? NODE_SHAPES.get(value) : undefined;
		if (mapped === undefined || node.type !== "text") {
			this.keptKind(`styleAttributes.shape: ${styleDescription(value)}`, `${String(node.type)} style`);
			return;
		}
		this.addOverride(node, ["shape"], { kind: mapped.value, fallback: "text" }, mapped.approximation);
	}

	private nodeBorder(node: UnknownRecord, value: unknown): void {
		const mapped = typeof value === "string" ? NODE_BORDERS.get(value) : undefined;
		if (mapped === undefined) {
			this.keptKind(`styleAttributes.border: ${styleDescription(value)}`, `${String(node.type)} style`);
			return;
		}
		this.addOverride(node, ["borderStyle"], mapped.value, mapped.approximation);
	}

	/** Advanced Canvas aligns the text of text cards only. */
	private nodeAlignment(node: UnknownRecord, value: unknown): void {
		const mapped = typeof value === "string" ? TEXT_ALIGNMENTS.get(value) : undefined;
		if (mapped === undefined || node.type !== "text") {
			this.keptKind(`styleAttributes.textAlign: ${styleDescription(value)}`, `${String(node.type)} style`);
			return;
		}
		this.addOverride(node, ["typography", "alignment"], mapped.value, mapped.approximation);
	}

	/**
	 * The lines from this board into a portal are kept on the portal's card
	 * (`interdimensionalEdges`, `edgesToNodeFromPortal` before format 1.0),
	 * where Advanced Canvas finds them; the plugin opens no portal and does
	 * not draw them.
	 */
	private notePortalEdges(node: UnknownRecord): void {
		const lines: unknown[] = [];
		if (Array.isArray(node.interdimensionalEdges)) lines.push(...(node.interdimensionalEdges as readonly unknown[]));
		if (isRecord(node.edgesToNodeFromPortal)) {
			for (const group of Object.values(node.edgesToNodeFromPortal)) {
				if (Array.isArray(group)) lines.push(...(group as readonly unknown[]));
			}
		}
		lines.forEach((line, index) => {
			const id = isRecord(line) && typeof line.id === "string" && line.id !== "" ? line.id : `${String(node.id)}.interdimensionalEdges[${index}]`;
			this.builder.note({ sourceId: id, sourceType: "edge", status: "plugin-unsupported", reason: "portalEdge" });
		});
	}

	private convertEdge(edge: UnknownRecord): void {
		for (const [key, value] of setStyles(edge.styleAttributes)) {
			if (key === "path") this.edgePath(edge, value);
			else if (key === "arrow") this.edgeArrow(edge, value);
			else if (key === "pathfindingMethod") this.edgeRoute(edge, value);
			else this.keptKind(`styleAttributes.${key}`, "edge style");
		}
	}

	private edgePath(edge: UnknownRecord, value: unknown): void {
		const mapped = typeof value === "string" ? EDGE_PATHS.get(value) : undefined;
		if (mapped === undefined) {
			this.keptKind(`styleAttributes.path: ${styleDescription(value)}`, "edge style");
			return;
		}
		this.addOverride(edge, ["connector", "strokeStyle"], mapped.value, mapped.approximation);
	}

	/** Advanced Canvas draws its arrowhead on every end that has an arrow: the end, unless told otherwise, and the start when asked. */
	private edgeArrow(edge: UnknownRecord, value: unknown): void {
		const mapped = typeof value === "string" ? EDGE_ARROWS.get(value) : undefined;
		if (mapped === undefined) {
			this.keptKind(`styleAttributes.arrow: ${styleDescription(value)}`, "edge style");
			return;
		}
		const ends: string[] = [];
		if (edge.fromEnd === "arrow") ends.push("startCap");
		if (edge.toEnd === undefined || edge.toEnd === "arrow") ends.push("endCap");
		let written = false;
		for (const end of ends) {
			if (this.addOverride(edge, ["connector", end], mapped.value)) written = true;
		}
		// One entry for the line, however many of its ends were approximated.
		if (written && mapped.approximation !== undefined) this.noteElement(edge.id as string, "edge", "approximated", mapped.approximation);
	}

	private edgeRoute(edge: UnknownRecord, value: unknown): void {
		const mapped = typeof value === "string" ? EDGE_ROUTES.get(value) : undefined;
		if (mapped === undefined) {
			this.keptKind(`styleAttributes.pathfindingMethod: ${styleDescription(value)}`, "edge style");
			return;
		}
		this.addOverride(edge, ["connector", "route"], mapped.value, mapped.approximation);
	}

	/**
	 * The presentation: the start slide and the slides after it, following
	 * the lines out of each as Advanced Canvas's "next slide" does.  Where a
	 * slide has several lines out, Advanced Canvas goes down a different one
	 * on each visit; the deck follows the one it takes first (lines with a
	 * label before those without, labels in alphabetical order).
	 */
	private convertPresentation(): void {
		const startNode = this.startNode();
		if (startNode === undefined) return;
		if (!this.nodeIds.has(startNode)) {
			this.builder.note({ sourceId: startNode, sourceType: "start node", status: "invalid-source", reason: "invalidElement" });
			return;
		}
		if (!this.plugin.writable) {
			this.builder.note({ sourceId: startNode, sourceType: "start node", status: "plugin-unsupported", reason: "customStyle" });
			return;
		}
		const ownDecks = this.plugin.record.decks;
		if (Array.isArray(ownDecks) && ownDecks.length > 0) {
			this.builder.note({ sourceId: startNode, sourceType: "start node", status: "approximated", reason: "existingOverride" });
			return;
		}
		const outgoingByNode = new Map<string, UnknownRecord[]>();
		for (const edge of this.edges) {
			if (edge.fromNode === edge.toNode) continue;
			const from = edge.fromNode as string;
			const outgoing = outgoingByNode.get(from) ?? [];
			outgoing.push(edge);
			outgoingByNode.set(from, outgoing);
		}
		const slides = [startNode];
		const visited = new Set(slides);
		let current = startNode;
		for (;;) {
			const outgoing = outgoingByNode.get(current) ?? [];
			if (outgoing.length === 0) break;
			if (outgoing.length > 1) {
				this.builder.note({ sourceId: current, sourceType: "slide order", status: "approximated", reason: "branchingDeck" });
			}
			const next = firstSlideLine(outgoing).toNode as string;
			if (visited.has(next)) break;
			slides.push(next);
			visited.add(next);
			current = next;
		}
		this.deck = {
			id: this.builder.newId(),
			startNode,
			slides: slides.map((nodeId) => ({ id: this.builder.newId(), nodeId })),
		};
	}

	/** `metadata.startNode`, or the card marked `isStartNode` in files older than format 1.0. */
	private startNode(): string | undefined {
		const metadata = this.document.metadata;
		if (isRecord(metadata) && typeof metadata.startNode === "string" && metadata.startNode !== "") return metadata.startNode;
		const marked = this.nodes.find((node) => node.isStartNode === true);
		return marked === undefined ? undefined : (marked.id as string);
	}

	/**
	 * Adds one field to a card's or line's override.  The board's own
	 * override wins; plugin data the plugin cannot read is not written to.
	 * True when the field was added.
	 */
	private addOverride(element: UnknownRecord, path: readonly string[], value: unknown, approximation?: ImportReason): boolean {
		const id = element.id as string;
		const type = this.nodeIds.has(id) ? String(element.type) : "edge";
		if (!this.plugin.writable) {
			this.noteElement(id, type, "plugin-unsupported", "customStyle");
			return false;
		}
		const ownOverrides = this.plugin.record.localOverrides;
		if (valueAt(isRecord(ownOverrides) && hasOwn(ownOverrides, id) ? ownOverrides[id] : undefined, path) !== undefined) {
			this.noteElement(id, type, "approximated", "existingOverride");
			return false;
		}
		const patch = this.additions.get(id) ?? {};
		setAt(patch, path, value);
		this.additions.set(id, patch);
		if (approximation !== undefined) this.noteElement(id, type, "approximated", approximation);
		return true;
	}

	private noteElement(id: string, type: string, status: ImportEntryStatus, reason: ImportReason): void {
		this.reported.add(id);
		this.builder.note({ sourceId: id, sourceType: type, status, reason, nodeId: id });
	}

	/** A setting kept in the copy for Advanced Canvas that the plugin does not draw: one entry for each kind. */
	private keptKind(kind: string, sourceType: string): void {
		if (this.keptKinds.has(kind)) return;
		this.keptKinds.add(kind);
		this.builder.note({ sourceId: kind, sourceType, status: "plugin-unsupported", reason: "customStyle" });
	}

	/** Writes the overrides and the deck into the plugin's data; a board without any keeps having none. */
	private writePluginData(): void {
		if (!this.plugin.writable) return;
		if (this.additions.size === 0 && this.deck === undefined) return;
		const record = this.plugin.record;
		if (!this.plugin.existed) this.document.miroCanvas = record;
		if (this.additions.size > 0) {
			if (!isRecord(record.localOverrides)) record.localOverrides = {};
			const overrides = record.localOverrides as UnknownRecord;
			for (const [id, patch] of this.additions) {
				const own = hasOwn(overrides, id) ? overrides[id] : undefined;
				if (isRecord(own)) addMissing(own, patch);
				else Object.defineProperty(overrides, id, { value: patch, enumerable: true, configurable: true, writable: true });
			}
		}
		if (this.deck !== undefined) record.decks = [this.deck];
	}

	private countConverted(): void {
		for (const element of [...this.nodes, ...this.edges]) {
			if (!this.reported.has(element.id as string)) this.builder.countConverted();
		}
	}

	/**
	 * The copy must open as a board and its plugin data must pass the
	 * plugin's own checks - or, where the board's own data did not pass
	 * them, must not fail them in any new way.
	 */
	private check(): void {
		assertNothingNewToSay(this.document, this.plugin.diagnostics);
	}
}

/** The line Advanced Canvas follows first out of a slide: labelled lines first, by label, then the rest in board order. */
function firstSlideLine(outgoing: readonly UnknownRecord[]): UnknownRecord {
	const label = (edge: UnknownRecord): string => (typeof edge.label === "string" ? edge.label : "");
	const sorted = [...outgoing].sort((a, b) => {
		if (label(a) === "" && label(b) === "") return 0;
		if (label(a) === "") return 1;
		if (label(b) === "") return -1;
		return label(a).localeCompare(label(b), "en");
	});
	return sorted[0];
}

function convertAdvancedCanvas(source: ImportSource, context: ImportContext): ImportResult {
	const document = readJsonCanvasDocument(source);
	let elements = (document.nodes as unknown[]).length + (document.edges as unknown[]).length;
	for (const node of document.nodes as unknown[]) {
		if (!isRecord(node)) continue;
		if (Array.isArray(node.interdimensionalEdges)) elements += node.interdimensionalEdges.length;
		if (isRecord(node.edgesToNodeFromPortal)) {
			for (const lines of Object.values(node.edgesToNodeFromPortal)) {
				if (Array.isArray(lines)) elements += lines.length;
			}
		}
		if (elements > MAX_IMPORT_ELEMENTS) throw new ImportError("tooLarge");
	}
	return new AdvancedCanvasCopy(document, context, source.text.length).convert(source.path);
}

export const advancedCanvasAdapter: FormatAdapter = {
	id: "advanced-canvas",
	detect: (source) => {
		try {
			return detectAdvancedCanvas(source);
		} catch {
			return false;
		}
	},
	convert: convertAdvancedCanvas,
};
