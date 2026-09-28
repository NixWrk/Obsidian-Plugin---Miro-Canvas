/**
 * The one way an importer puts things on a board.
 *
 * Every importer builds its board here, so an imported board is made of the
 * same records the plugin's own tools write: a card's look is the override
 * the selection toolbar writes, a shape is a card plus the `{ kind,
 * fallback: "text" }` descriptor `createShape` writes, a frame, a drawing
 * or a sticky note is a card plus the `item` record `local-items.ts` reads
 * back, and a line is a native edge wherever both its ends hold on to a card
 * and the plugin's own connector record otherwise - the same choice the
 * welcome board and the line tool make.
 *
 * Every card that stands for an element of the source is bound to it
 * (`miroCanvas.bindings`, the two binding fields schema/v1 already has), and
 * every element that could not come over exactly is an entry of the report.
 * `finish` checks the board with the plugin's own metadata validator and
 * refuses to hand back anything it would warn about.
 *
 * Pure: never imports "obsidian"; the words come from `words()`.
 */

import type { CanvasAnchor } from "../anchors";
import { fitsNativeEdge, nativeEdgeOf, readBoardConnector, type BoardConnector } from "../board-connectors";
import type { CanvasShapeDescriptor } from "../canvas-authoring";
import { words } from "../i18n";
import { readLocalItem, type LocalItem, type LocalStroke } from "../local-items";
import { MIRO_CANVAS_SCHEMA_VERSION, validateMiroCanvasMetadata, type MiroCanvasDiagnostic } from "../metadata";
import {
	MAX_IMPORT_ENTRIES,
	type ImportContext,
	type ImportCounts,
	type ImportEntry,
	type ImportEntryStatus,
	type ImportFormat,
	type ImportReason,
	type ImportReport,
	type ImportResult,
} from "./types";

/** An id as native Canvas makes one: sixteen hex digits, drawn from a seed so builds compare equal. */
export function idFactory(seed: number): () => string {
	let state = (seed >>> 0) || 0x2f6e2b1;
	const next32 = (): number => {
		state ^= state << 13; state >>>= 0;
		state ^= state >>> 17;
		state ^= state << 5; state >>>= 0;
		return state >>> 0;
	};
	return () => `${next32().toString(16).padStart(8, "0")}${next32().toString(16).padStart(8, "0")}`;
}

/** The plugin's name in every report: the importer. */
export const IMPORTER_NAME = "miro-canvas";

/** Where a card goes on the board, in board units. */
export interface BoardRect {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

/** What a card's look sets, in the shape the selection toolbar writes it. */
export interface ImportedCardStyle {
	readonly typography?: Readonly<Record<string, unknown>>;
	readonly colors?: Readonly<Record<string, string | null>>;
	readonly borderStyle?: "solid" | "dashed" | "dotted" | "none";
	readonly borderWidth?: number;
	readonly locked?: true;
	/** Degrees, clockwise, as the rotation handle writes it. */
	readonly rotation?: number;
}

/** The element of the source a card or a line stands for. */
export interface SourceElement {
	/** Its id in the source; the builder adds the format in front of it in the binding. */
	readonly id: string;
	/** What it is, in the source's own words ("rectangle", "heading"). */
	readonly type: string;
}

export interface CardOptions {
	readonly style?: ImportedCardStyle;
	/** The source element this card stands for: it is bound to it. */
	readonly source?: SourceElement;
}

export interface ConnectOptions {
	/** The source element this line stands for: it is bound to it. */
	readonly source?: SourceElement;
}

/** A line as the builder takes it: both ends, and whatever of its look differs from the defaults. */
export type ImportedConnector = { readonly from: CanvasAnchor; readonly to: CanvasAnchor } & Partial<Omit<BoardConnector, "from" | "to">>;

/** What the report says about the source file as a whole. */
export interface ImportDetails {
	readonly sourcePath: string;
	readonly formatVersion?: string;
}

/** A plain grey that reads on light and dark boards alike, for lines an importer gives no colour. */
const DEFAULT_LINE_COLOR = "#7f7f7f";
/** The same grey for a placeholder's dashed border. */
const PLACEHOLDER_BORDER = "#8c8c8c";
const PLACEHOLDER_MIN = { width: 160, height: 60 } as const;
const PLACEHOLDER_MAX = { width: 320, height: 160 } as const;

/** The report card: this far to the right of everything imported, this wide. */
const REPORT_CARD_GAP = 120;
const REPORT_CARD_WIDTH = 560;
/** Rough height of one line of the report card, so the card opens showing most of it. */
const REPORT_LINE_HEIGHT = 28;
const REPORT_CARD_MIN_HEIGHT = 160;
const REPORT_CARD_MAX_HEIGHT = 4_000;
/** The most rows the report card's table lists; the rest are counted on one line. */
export const REPORT_CARD_MAX_ROWS = 500;

function round(value: number): number {
	return Math.round(value);
}

/** A side at least one unit long: native Canvas has no card of zero size. */
function side(value: number): number {
	return Math.max(1, round(value));
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

/**
 * Builds one board from one source: the cards, frames and lines, the
 * bindings back to the source and the report of what could not come over.
 */
export class BoardBuilder {
	readonly format: ImportFormat;
	private readonly context: ImportContext;
	/** Frames are kept apart and written first, so every card is drawn over them. */
	private readonly frames: Record<string, unknown>[] = [];
	private readonly nodes: Record<string, unknown>[] = [];
	private readonly edges: Record<string, unknown>[] = [];
	private readonly overrides: Record<string, Record<string, unknown>> = {};
	private readonly connectors: Record<string, BoardConnector> = {};
	private readonly bindings: Record<string, { sourceId: string; role: string }> = {};
	/** Source ids of every element that has a card or a line on the board. */
	private readonly boundSources = new Set<string>();
	/** Source ids every entry is about, beyond the cap as well. */
	private readonly reportedSources = new Set<string>();
	private readonly entries: ImportEntry[] = [];
	private approximatedCount = 0;
	private notImportedCount = 0;
	private skippedCount = 0;
	private convertedWithoutBinding = 0;

	constructor(format: ImportFormat, context: ImportContext) {
		this.format = format;
		this.context = context;
	}

	/** A new element id. */
	newId(): string {
		return this.context.newId();
	}

	/** A text card; with a style it looks the way the toolbar would have made it look. */
	card(rect: BoardRect, text: string, options: CardOptions = {}): string {
		const id = this.newId();
		this.nodes.push({ id, type: "text", text, x: round(rect.x), y: round(rect.y), width: side(rect.width), height: side(rect.height) });
		this.applyOptions(id, options);
		return id;
	}

	/** A shape: a card drawn as `shape.kind`, which native Canvas shows as a plain card. */
	shapeCard(rect: BoardRect, text: string, shape: CanvasShapeDescriptor, options: CardOptions = {}): string {
		const id = this.card(rect, text, options);
		this.overrides[id] = { ...(this.overrides[id] ?? {}), shape: { kind: shape.kind, fallback: shape.fallback } };
		return id;
	}

	/** A card standing for an item Canvas has no field for: text, a sticky note, a code block, a table. */
	item(rect: BoardRect, text: string, local: LocalItem, options: CardOptions = {}): string {
		const id = this.card(rect, text, options);
		this.overrides[id] = { ...(this.overrides[id] ?? {}), item: checkedItem(local) };
		return id;
	}

	/** A pen stroke; its points live in `stroke.box`, which the card's size is mapped onto. */
	drawing(rect: BoardRect, stroke: LocalStroke, options: CardOptions = {}): string {
		return this.item(rect, "", { type: "drawing", stroke }, options);
	}

	/** A frame: a native group with its name, drawn under every card. */
	frame(rect: BoardRect, label: string, options: CardOptions = {}): string {
		const id = this.newId();
		this.frames.push({ id, type: "group", label, x: round(rect.x), y: round(rect.y), width: side(rect.width), height: side(rect.height) });
		this.applyOptions(id, options);
		this.overrides[id] = { ...(this.overrides[id] ?? {}), item: checkedItem({ type: "frame" }) };
		return id;
	}

	/** A native file card pointing at a file in the vault. */
	file(rect: BoardRect, path: string, options: CardOptions = {}): string {
		const id = this.newId();
		this.nodes.push({ id, type: "file", file: path, x: round(rect.x), y: round(rect.y), width: side(rect.width), height: side(rect.height) });
		this.applyOptions(id, options);
		return id;
	}

	/**
	 * A line.  A native edge, with its override, when both ends hold on to a
	 * card - the same choice `placeConnector` (m1-session.ts) makes - or the
	 * plugin's own connector record when they do not.
	 */
	connect(line: ImportedConnector, options: ConnectOptions = {}): { readonly id: string; readonly native: boolean } {
		const candidate = {
			id: this.newId(),
			route: "straight",
			color: DEFAULT_LINE_COLOR,
			width: 2,
			startCap: "none",
			endCap: "stealth",
			...line,
		};
		const connector = readBoardConnector(candidate);
		if (connector === undefined) throw new Error(`import: built an invalid connector (${candidate.id})`);
		const native = fitsNativeEdge(connector);
		if (native) {
			const { edge, override } = nativeEdgeOf(connector);
			this.edges.push(edge);
			this.overrides[connector.id] = { ...(this.overrides[connector.id] ?? {}), ...override };
		} else {
			this.connectors[connector.id] = connector;
		}
		if (options.source !== undefined) this.bind(connector.id, options.source);
		return { id: connector.id, native };
	}

	/**
	 * A small dashed card where an element that could not be imported was,
	 * saying what it was ("Not imported: web embed"), so nothing disappears
	 * from the board without a trace.  Records the entry, pointing at it.
	 */
	placeholder(rect: BoardRect, entry: Omit<ImportEntry, "nodeId">): string {
		const size = {
			width: clamp(rect.width, PLACEHOLDER_MIN.width, PLACEHOLDER_MAX.width),
			height: clamp(rect.height, PLACEHOLDER_MIN.height, PLACEHOLDER_MAX.height),
		};
		const text = words().importer.placeholder(importReasonName(entry.reason));
		const id = this.card({ x: rect.x, y: rect.y, ...size }, text, {
			source: { id: entry.sourceId, type: entry.sourceType },
			style: {
				borderStyle: "dashed",
				borderWidth: 2,
				colors: { border: PLACEHOLDER_BORDER },
				typography: { fontSize: 14, alignment: "center", verticalAlign: "center" },
			},
		});
		this.note({ ...entry, nodeId: id });
		return id;
	}

	/** Binds a card or a line to the source element it stands for. */
	bind(elementId: string, source: SourceElement): void {
		const sourceType = source.type === "" ? "element" : source.type;
		this.bindings[elementId] = { sourceId: `${this.format}:${source.id}`, role: `import:${this.format}:${sourceType}` };
		this.boundSources.add(source.id);
	}

	/** Records an element that was approximated or left out. */
	note(entry: ImportEntry): void {
		this.reportedSources.add(entry.sourceId);
		if (entry.status === "approximated") this.approximatedCount += 1;
		else if (entry.status === "skipped") this.skippedCount += 1;
		else this.notImportedCount += 1;
		if (this.entries.length < MAX_IMPORT_ENTRIES) this.entries.push({ ...entry });
	}

	/** Counts elements that came over exactly without a binding of their own (a copied board keeps its ids). */
	countConverted(count = 1): void {
		this.convertedWithoutBinding += count;
	}

	/** Counts elements deliberately left out that need no line in the report (deleted in the source). */
	countSkipped(count = 1): void {
		this.skippedCount += count;
	}

	/** How many elements ended up where: an element with an entry counts under its entry, not as converted. */
	counts(): ImportCounts {
		let converted = this.convertedWithoutBinding;
		for (const sourceId of this.boundSources) {
			if (!this.reportedSources.has(sourceId)) converted += 1;
		}
		return {
			converted,
			approximated: this.approximatedCount,
			notImported: this.notImportedCount,
			skipped: this.skippedCount,
		};
	}

	/** The report of this import, in the shape of a future `miroCanvas.imports[]` entry. */
	report(details: ImportDetails): ImportReport {
		return {
			id: this.newId(),
			format: this.format,
			...(details.formatVersion === undefined ? {} : { formatVersion: details.formatVersion }),
			sourcePath: details.sourcePath,
			importer: IMPORTER_NAME,
			importerVersion: this.context.importerVersion,
			importedAt: this.context.now,
			counts: this.counts(),
			entries: this.entries.map((entry) => ({ ...entry })),
		};
	}

	/** The finished board and its report; throws when the board would not pass the plugin's own checks. */
	finish(details: ImportDetails): ImportResult {
		const miroCanvas: Record<string, unknown> = { schemaVersion: MIRO_CANVAS_SCHEMA_VERSION };
		if (Object.keys(this.bindings).length > 0) miroCanvas.bindings = this.bindings;
		if (Object.keys(this.overrides).length > 0) miroCanvas.localOverrides = this.overrides;
		if (Object.keys(this.connectors).length > 0) miroCanvas.connectors = this.connectors;
		const document: Record<string, unknown> = {
			nodes: [...this.frames, ...this.nodes],
			edges: [...this.edges],
			miroCanvas,
		};
		assertImportedBoard(document);
		return { document, report: this.report(details) };
	}

	private applyOptions(id: string, options: CardOptions): void {
		if (options.style !== undefined) this.overrides[id] = { ...(this.overrides[id] ?? {}), ...options.style };
		if (options.source !== undefined) this.bind(id, options.source);
	}
}

/** The item record `createItem` writes, or a thrown error for one the plugin could not read back. */
function checkedItem(item: LocalItem): LocalItem {
	const checked = readLocalItem(item);
	if (checked === undefined) throw new Error(`import: built an invalid ${item.type} item`);
	return checked;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

/**
 * Throws unless the document is a board the plugin reads without a single
 * complaint: every node has an id, a type and a place, every id is used
 * once, every edge joins two nodes on the board, and `miroCanvas` passes the
 * metadata validator with no error and no warning.  Everything else in the
 * document (`miroSource`, fields the plugin does not know) is left alone.
 */
export function assertImportedBoard(document: Record<string, unknown>): void {
	const nodes = document.nodes;
	const edges = document.edges;
	if (!Array.isArray(nodes) || !Array.isArray(edges)) throw new Error("import: the board has no nodes or edges list");
	const ids = new Set<string>();
	const nodeIds = new Set<string>();
	const useId = (id: unknown, what: string): string => {
		if (typeof id !== "string" || id === "") throw new Error(`import: ${what} without an id`);
		if (ids.has(id)) throw new Error(`import: the id ${id} is used twice`);
		ids.add(id);
		return id;
	};
	for (const node of nodes) {
		if (!isRecord(node)) throw new Error("import: a node is not an object");
		const id = useId(node.id, "a node");
		if (typeof node.type !== "string" || node.type === "") throw new Error(`import: node ${id} has no type`);
		for (const key of ["x", "y", "width", "height"] as const) {
			if (!isFiniteNumber(node[key])) throw new Error(`import: node ${id} has no ${key}`);
		}
		nodeIds.add(id);
	}
	for (const edge of edges) {
		if (!isRecord(edge)) throw new Error("import: an edge is not an object");
		const id = useId(edge.id, "an edge");
		if (typeof edge.fromNode !== "string" || !nodeIds.has(edge.fromNode)) throw new Error(`import: edge ${id} starts at no node`);
		if (typeof edge.toNode !== "string" || !nodeIds.has(edge.toNode)) throw new Error(`import: edge ${id} ends at no node`);
	}
	if (document.miroCanvas === undefined) return;
	const validated = validateMiroCanvasMetadata(document.miroCanvas);
	if (!validated.valid || validated.diagnostics.length > 0) {
		const messages = validated.diagnostics.map((entry) => `${entry.path}: ${entry.message}`).join("; ");
		throw new Error(`import: the board's metadata does not pass the plugin's checks (${messages})`);
	}
}

function diagnosticKey(diagnostic: MiroCanvasDiagnostic): string {
	return `${diagnostic.severity} ${diagnostic.code} ${diagnostic.path}`;
}

/**
 * The check for a board whose plugin data came with it (a copied Advanced
 * Canvas board): the board must open as `assertImportedBoard` asks, and the
 * metadata validator may say nothing of its `miroCanvas` that it did not
 * already say of the data the board came with (`before`).  Warnings about
 * fields a newer version wrote, or data the plugin cannot read at all, stay
 * the board's own; the importer only must not add to them.
 */
export function assertNothingNewToSay(document: Record<string, unknown>, before: readonly MiroCanvasDiagnostic[]): void {
	assertImportedBoard({ ...document, miroCanvas: undefined });
	if (document.miroCanvas === undefined) return;
	const known = new Set(before.map(diagnosticKey));
	const after = validateMiroCanvasMetadata(document.miroCanvas).diagnostics;
	const added = after.filter((diagnostic) => !known.has(diagnosticKey(diagnostic)));
	if (added.length > 0) {
		const messages = added.map((entry) => `${entry.path}: ${entry.message}`).join("; ");
		throw new Error(`import: the board's metadata gained complaints (${messages})`);
	}
}

/** What the plugin's validator says of a board's `miroCanvas` as it is; nothing when there is none. */
export function metadataDiagnostics(document: Record<string, unknown>): readonly MiroCanvasDiagnostic[] {
	if (document.miroCanvas === undefined) return [];
	return validateMiroCanvasMetadata(document.miroCanvas).diagnostics;
}

/** The format's name in the person's language. */
export function importFormatName(format: ImportFormat): string {
	const formats = words().importer.formats;
	switch (format) {
		case "advanced-canvas":
			return formats.advancedCanvas;
		case "excalidraw":
			return formats.excalidraw;
		case "mindmap-outline":
			return formats.mindmapOutline;
		case "markmind-rich":
			return formats.markmindRich;
	}
}

/** A status's name in the person's language. */
export function importStatusName(status: ImportEntryStatus): string {
	const statuses = words().importer.status;
	switch (status) {
		case "approximated":
			return statuses.approximated;
		case "unsupported":
			return statuses.unsupported;
		case "source-limited":
			return statuses.sourceLimited;
		case "missing-asset":
			return statuses.missingAsset;
		case "invalid-source":
			return statuses.invalidSource;
		case "plugin-unsupported":
			return statuses.pluginUnsupported;
		case "skipped":
			return statuses.skipped;
	}
}

/** A reason's words in the person's language. */
export function importReasonName(reason: ImportReason): string {
	return words().importer.reasons[reason];
}

/** Why an entry is in the report, as one phrase: "Not supported: web embed". */
export function importEntryWhy(entry: Pick<ImportEntry, "status" | "reason">): string {
	return `${importStatusName(entry.status)}: ${importReasonName(entry.reason)}`;
}

/** A value made safe for one cell of a Markdown table: one line, pipes escaped. */
function tableCell(value: string): string {
	const oneLine = value.replace(/\s+/gu, " ").trim();
	const escaped = oneLine.replace(/\\/gu, "\\\\").replace(/\|/gu, "\\|");
	return escaped === "" ? "-" : escaped;
}

/** An id in a table cell: as code, so Markdown never reads its underscores or stars. */
function idCell(value: string): string {
	const cleaned = value.replace(/`/gu, "'");
	return cleaned.trim() === "" ? "-" : `\`${tableCell(cleaned)}\``;
}

/** A wiki link to the source, or its path as code when the path would break the link. */
function sourceLink(path: string): string {
	if (/\[\[|\]\]|\||\n/u.test(path)) return `\`${path.replace(/`/gu, "'")}\``;
	return `[[${path}]]`;
}

/** The format's name, with its version when the source gives one: "Excalidraw drawing, version 2". */
export function importFormatLabel(report: Pick<ImportReport, "format" | "formatVersion">): string {
	const name = importFormatName(report.format);
	if (report.formatVersion === undefined) return name;
	return words().importer.report.formatVersion(name, report.formatVersion);
}

/**
 * The report card's text, plain Markdown: where the board came from, with
 * what and when, how many elements ended up where, and a table of
 * everything approximated or left out (at most `REPORT_CARD_MAX_ROWS` rows).
 */
export function reportCardMarkdown(report: ImportReport): string {
	const strings = words().importer.report;
	const lines = [
		`## ${strings.title}`,
		"",
		`- ${strings.source}: ${sourceLink(report.sourcePath)}`,
		`- ${strings.format}: ${importFormatLabel(report)}`,
		`- ${strings.importedWith}: ${report.importer} ${report.importerVersion}`,
		`- ${strings.importedOn}: ${report.importedAt.slice(0, 10)}`,
		"",
		`| ${strings.result} | ${strings.count} |`,
		"| --- | ---: |",
		`| ${strings.converted} | ${report.counts.converted} |`,
		`| ${strings.approximated} | ${report.counts.approximated} |`,
		`| ${strings.notImported} | ${report.counts.notImported} |`,
		`| ${strings.skipped} | ${report.counts.skipped} |`,
	];
	// Skipped elements are counted above; the table lists what a person may want to look at.
	const listed = report.entries.filter((entry) => entry.status !== "skipped");
	const total = report.counts.approximated + report.counts.notImported;
	if (listed.length > 0) {
		lines.push("", `### ${strings.detailsHeading}`, "", `| ${strings.what} | ${strings.id} | ${strings.why} |`, "| --- | --- | --- |");
		for (const entry of listed.slice(0, REPORT_CARD_MAX_ROWS)) {
			lines.push(`| ${tableCell(entry.sourceType)} | ${idCell(entry.sourceId)} | ${tableCell(importEntryWhy(entry))} |`);
		}
		// Entries past the report's own cap are still counted, so the rest is
		// what the counts hold beyond the rows shown.
		const shown = Math.min(listed.length, REPORT_CARD_MAX_ROWS);
		const more = total - shown;
		if (more > 0) lines.push("", strings.more(more));
	}
	return lines.join("\n");
}

/** The box around every node on the board, or undefined for an empty board. */
function boardBounds(nodes: readonly unknown[]): BoardRect | undefined {
	let left = Infinity;
	let top = Infinity;
	let right = -Infinity;
	let bottom = -Infinity;
	for (const node of nodes) {
		if (!isRecord(node)) continue;
		const { x, y, width, height } = node;
		if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(width) || !isFiniteNumber(height)) continue;
		left = Math.min(left, x);
		top = Math.min(top, y);
		right = Math.max(right, x + width);
		bottom = Math.max(bottom, y + height);
	}
	if (left === Infinity) return undefined;
	return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * The board's plugin data with the report card's binding added, or
 * undefined when the binding cannot be added without touching data that is
 * not the importer's to change: plugin data that is not an object at all,
 * or that the plugin does not read (a newer schema, a broken bindings
 * record).  A board without plugin data gets a new record.
 */
function metadataWithReportBinding(document: Record<string, unknown>, binding: { sourceId: string; role: string }, id: string): Record<string, unknown> | undefined {
	if (document.miroCanvas === undefined) {
		return { schemaVersion: MIRO_CANVAS_SCHEMA_VERSION, bindings: { [id]: binding } };
	}
	const metadata = document.miroCanvas;
	if (!isRecord(metadata)) return undefined;
	if (!validateMiroCanvasMetadata(metadata).valid) return undefined;
	if (metadata.bindings !== undefined && !isRecord(metadata.bindings)) return undefined;
	const bindings = isRecord(metadata.bindings) ? metadata.bindings : {};
	return { ...metadata, bindings: { ...bindings, [id]: binding } };
}

/**
 * The same board with a report card to the right of everything imported: a
 * native text card with `reportCardMarkdown`, bound to the source file as
 * the import's report.  The result it is given is left as it was.
 *
 * A copied board may bring plugin data of its own that the plugin's
 * validator already has something to say about; the card is still added,
 * and the check is only that the card gave the validator nothing new to
 * say.  Where the board's plugin data is not the importer's to write to (not
 * an object, or not read by the plugin), that data is kept exactly as it was
 * and the card goes on the board without its binding - its own text still
 * names the source.
 */
export function addReportCard(result: ImportResult, newId: () => string): ImportResult {
	const nodes = Array.isArray(result.document.nodes) ? result.document.nodes : [];
	const bounds = boardBounds(nodes);
	const text = reportCardMarkdown(result.report);
	const lineCount = text.split("\n").length;
	const id = newId();
	const card = {
		id,
		type: "text",
		text,
		x: bounds === undefined ? 0 : round(bounds.x + bounds.width + REPORT_CARD_GAP),
		y: bounds === undefined ? 0 : round(bounds.y),
		width: REPORT_CARD_WIDTH,
		height: clamp(lineCount * REPORT_LINE_HEIGHT + 48, REPORT_CARD_MIN_HEIGHT, REPORT_CARD_MAX_HEIGHT),
	};
	const before = metadataDiagnostics(result.document);
	const binding = { sourceId: `import:${result.report.sourcePath}`, role: "import-report" };
	const metadata = metadataWithReportBinding(result.document, binding, id);
	const document: Record<string, unknown> = {
		...result.document,
		nodes: [...nodes, card],
		...(metadata === undefined ? {} : { miroCanvas: metadata }),
	};
	assertNothingNewToSay(document, before);
	return { document, report: { ...result.report, reportNodeId: id } };
}
