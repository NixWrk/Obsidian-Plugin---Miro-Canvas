/**
 * The tools that change a board.
 *
 * Every change goes through the plugin's own writers - CanvasAuthoring for
 * cards and lines, MetadataWriter for the plugin's record - running over a
 * copy of the board in memory, so the same rules hold as inside Obsidian:
 * a locked card stays as it is, review mode refuses edits, miroSource (the
 * Miro import) is never touched, and fields this plugin does not know are
 * kept.  The file is written once, at the end of the call, and only when it
 * still holds the bytes the call read; an agent that hands back the revision
 * it read (expectedRevision) is refused when anything saved the board since.
 */

import { lstatSync, readFileSync } from "node:fs";
import path from "node:path";

import { normalizeAnchor, resolveAnchor, type AnchorPoint, type CanvasAnchor } from "../../src/anchors";
import { planBoardConnectors } from "../../src/board-connector-writes";
import {
	boardConnectors, fitsNativeEdge, nativeEdgeOf, readBoardConnector, restyleBoardConnector, type BoardConnector,
} from "../../src/board-connectors";
import {
	CANVAS_SHAPE_KINDS, CanvasAuthoring, type CanvasAuthoringDiagnostic, type UpdateElementStyleInput, type UpdateNodeInput,
} from "../../src/canvas-authoring";
import { newCanvasId } from "../../src/canvas-ids";
import { buildCanvasAnchorGeometry } from "../../src/connector-endpoints";
import { words } from "../../src/i18n";
import { decideEditOperation, reduceInteractionMetadata } from "../../src/interaction-policy";
import {
	addLocalComment, addReply, deleteLocalComment, editLocalComment, listCommentThreads, setCommentResolved,
	type CommentMutationResult,
} from "../../src/local-comments";
import { LOCAL_ITEM_SIZES, TABLE_TEMPLATE, type LocalItem } from "../../src/local-items";
import { MetadataWriter, type MetadataWriteResult } from "../../src/metadata-writer";
import { miroStickyColors } from "../../src/miro-palette";
import { CONNECTOR_CAPS, CONNECTOR_ROUTES, CONNECTOR_STROKES } from "../../src/source-model";
import {
	BoardEdit, FileCanvasRuntime, FileMetadataStore, readBoardFile, revisionOf, sameJson, STALE_BOARD, type BoardFile,
} from "./board-file";
import { boardPathSchema, createReadTools, readWarnings, type ToolDefinition } from "./tools";
import { ToolError, Vault } from "./vault";

type UnknownRecord = Record<string, unknown>;
type JsonSchema = Record<string, unknown>;

export interface EditToolContext {
	readonly vault: Vault;
	/** Called just before a board is written; tests change the file here to see the write refused. */
	readonly beforeWrite?: (absolutePath: string) => void;
}

/** One thing to say about an edit: a stable code and a sentence. */
export interface EditDiagnostic {
	readonly code: string;
	readonly message: string;
	readonly level?: string;
}

/** What one step of an edit came to. */
interface StepResult {
	readonly ok: boolean;
	readonly diagnostics: readonly EditDiagnostic[];
	/** Ids of what the step made, by what they are. */
	readonly created?: Readonly<Record<string, string>>;
}

/** The last change the server wrote to each board, which undo_last can take back. */
interface UndoEntry {
	readonly before: Buffer;
	readonly afterRevision: string;
	readonly tool: string;
}

const UTF8_BOM = "\uFEFF";

/** The workspace files Obsidian keeps its open tabs in. */
const WORKSPACE_FILES = ["workspace.json", "workspace-mobile.json"];
const WORKSPACE_MAX_BYTES = 16 * 1024 * 1024;

/** Where an end given only by its card and side holds on to the card. */
const SIDE_POINTS = {
	top: { u: 0.5, v: 0 },
	right: { u: 1, v: 0.5 },
	bottom: { u: 0.5, v: 1 },
	left: { u: 0, v: 0.5 },
} as const;
type Side = keyof typeof SIDE_POINTS;
const SIDES = Object.keys(SIDE_POINTS) as Side[];

/** A new connector's look when the agent says nothing of it, as native Canvas draws an edge. */
const CONNECTOR_DEFAULTS = { route: "straight", color: "#1a1a1a", width: 2, startCap: "none", endCap: "stealth" } as const;

const NATIVE_COLOR = /^(?:[1-6]|#[0-9a-fA-F]{6})$/;

const EDIT_ANNOTATIONS = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const DELETE_ANNOTATIONS = { ...EDIT_ANNOTATIONS, destructiveHint: true };

function isRecord(value: unknown): value is UnknownRecord {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function arrayOf(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

function stringOr(value: unknown, fallback: string | undefined): string | undefined {
	return typeof value === "string" ? value : fallback;
}

function numberOr(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

// ---------------------------------------------------------------------------
// Results

function refuse(code: string, message: string): StepResult {
	return { ok: false, diagnostics: [{ code, message }] };
}

/** A CanvasAuthoring answer as a step; only what went wrong or was noticed is kept. */
function fromAuthoring(result: { readonly ok: boolean; readonly diagnostics: readonly CanvasAuthoringDiagnostic[] }, created?: Record<string, string>): StepResult {
	const diagnostics = result.diagnostics.map((item) => ({ code: item.code, message: item.message, level: item.level }));
	return { ok: result.ok, diagnostics, ...(result.ok && created !== undefined ? { created } : {}) };
}

/** A MetadataWriter answer as a step: a change that changes nothing is fine. */
function fromWriter(result: MetadataWriteResult): StepResult {
	const ok = result.status === "applied" || result.status === "noop";
	const diagnostics = result.diagnostics.map((item) => ({ code: item.code, message: item.message }));
	return { ok, diagnostics };
}

// ---------------------------------------------------------------------------
// One call's work on one board

/** The plugin's writers over one board in memory, made when first asked for. */
class EditSession {
	public readonly edit: BoardEdit;
	private authoringInstance: CanvasAuthoring | undefined;
	private writerInstance: MetadataWriter | undefined;

	public constructor(edit: BoardEdit) {
		this.edit = edit;
	}

	/** The board as the last accepted change left it. */
	public get document(): UnknownRecord {
		return this.edit.savedDocument;
	}

	public authoring(): CanvasAuthoring {
		this.authoringInstance ??= new CanvasAuthoring(new FileCanvasRuntime(this.edit));
		return this.authoringInstance;
	}

	public writer(): MetadataWriter {
		this.writerInstance ??= new MetadataWriter(new FileMetadataStore(this.edit));
		return this.writerInstance;
	}
}

/** Whether the board's lock and review rules let `operation` touch every one of `ids`. */
function editAllowed(document: unknown, operation: string, ids: readonly string[]): boolean {
	const decision = decideEditOperation(document, operation, ids);
	return decision.valid && decision.allowed;
}

/** Whether Obsidian's workspace shows the board open in a tab. */
export function boardOpenInObsidian(vault: Vault, boardPath: string): boolean {
	for (const name of WORKSPACE_FILES) {
		const file = path.join(vault.realRoot, ".obsidian", name);
		let workspace: unknown;
		try {
			const stats = lstatSync(file);
			// lstat: a link is not a file, and is not followed.
			if (!stats.isFile() || stats.size > WORKSPACE_MAX_BYTES) continue;
			workspace = JSON.parse(readFileSync(file, "utf8"));
		} catch {
			continue;
		}
		if (holdsOpenBoard(workspace, boardPath, 0)) return true;
	}
	return false;
}

function holdsOpenBoard(value: unknown, boardPath: string, depth: number): boolean {
	if (depth > 64) return false;
	if (Array.isArray(value)) return value.some((item) => holdsOpenBoard(item, boardPath, depth + 1));
	if (!isRecord(value)) return false;
	// A tab: { type: "leaf", state: { type: "canvas", state: { file: "<path>" } } }.
	if (value.type === "canvas" && isRecord(value.state) && value.state.file === boardPath) return true;
	return Object.values(value).some((item) => holdsOpenBoard(item, boardPath, depth + 1));
}

function editWarnings(vault: Vault, file: BoardFile): EditDiagnostic[] {
	const warnings: EditDiagnostic[] = readWarnings(file);
	if (boardOpenInObsidian(vault, file.path)) {
		warnings.push({
			code: "open-in-obsidian",
			message: "The board is open in Obsidian. Obsidian reloads it when the file changes, but a change made there and not "
				+ "yet saved can still be written over this one; check the board in Obsidian.",
		});
	}
	return warnings;
}

/** Everything whose record the change touched: cards, lines, connectors, comments. */
export function changedIds(before: UnknownRecord, after: UnknownRecord): string[] {
	const changed = new Set<string>();
	const compareById = (left: unknown, right: unknown): void => {
		const index = (list: unknown): Map<string, unknown> => new Map(arrayOf(list)
			.filter((item): item is UnknownRecord => isRecord(item) && typeof item.id === "string")
			.map((item) => [item.id as string, item]));
		const leftIndex = index(left);
		const rightIndex = index(right);
		for (const id of new Set([...leftIndex.keys(), ...rightIndex.keys()])) {
			if (!sameJson(leftIndex.get(id), rightIndex.get(id))) changed.add(id);
		}
	};
	const compareByKey = (left: unknown, right: unknown): void => {
		const leftRecord = isRecord(left) ? left : {};
		const rightRecord = isRecord(right) ? right : {};
		for (const id of new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)])) {
			if (!sameJson(leftRecord[id], rightRecord[id])) changed.add(id);
		}
	};
	compareById(before.nodes, after.nodes);
	compareById(before.edges, after.edges);
	const beforeMetadata = isRecord(before.miroCanvas) ? before.miroCanvas : {};
	const afterMetadata = isRecord(after.miroCanvas) ? after.miroCanvas : {};
	compareByKey(beforeMetadata.connectors, afterMetadata.connectors);
	compareByKey(beforeMetadata.localOverrides, afterMetadata.localOverrides);
	compareById(beforeMetadata.localComments, afterMetadata.localComments);
	return [...changed].sort();
}

type EditStatus = "applied" | "noop" | "rejected";

/** How every edit tool answers about one board; `fields` fill in what the edit came to. */
function answerFor(vault: Vault, file: BoardFile, dryRun: boolean): (status: EditStatus, fields: UnknownRecord) => UnknownRecord {
	const warnings = editWarnings(vault, file);
	return (status, fields) => ({
		path: file.path,
		status,
		dryRun,
		written: false,
		revision: file.revision,
		previousRevision: file.revision,
		changedIds: [],
		diagnostics: [],
		warnings,
		...fields,
	});
}

/** Why a board is refused before any work: a newer save than the agent read, or numbers it cannot keep. */
function refusalBeforeWork(file: BoardFile, args: UnknownRecord): EditDiagnostic | undefined {
	if (typeof args.expectedRevision === "string" && args.expectedRevision !== file.revision) {
		return { code: STALE_BOARD, message: "The board changed since the revision given was read; nothing was done. Read it again." };
	}
	if (file.hasUnsafeIntegers) {
		return { code: "unsafe-integers", message: "The board holds whole numbers beyond 2^53, which writing it back would round; it is not edited." };
	}
	return undefined;
}

/**
 * undo_last: put back the bytes the board had before this server's last
 * change to it, when that change is still what the file holds.
 */
function undoLastChange(context: EditToolContext, history: Map<string, UndoEntry>, args: UnknownRecord): UnknownRecord {
	const file = readBoardFile(context.vault, args.path);
	const dryRun = args.dryRun === true;
	const answer = answerFor(context.vault, file, dryRun);
	const refusal = refusalBeforeWork(file, args);
	if (refusal !== undefined) return answer("rejected", { diagnostics: [refusal] });
	const entry = history.get(file.path);
	if (entry === undefined) {
		return answer("rejected", { diagnostics: [{ code: "nothing-to-undo", message: "This server has written no change to the board that it could undo." }] });
	}
	if (entry.afterRevision !== file.revision) {
		history.delete(file.path);
		return answer("rejected", {
			diagnostics: [{ code: "history-conflict", message: "The board changed since this server's last change to it; that change is not undone." }],
		});
	}
	const edit = new BoardEdit(context.vault, file, {
		dryRun,
		...(context.beforeWrite === undefined ? {} : { beforeWrite: context.beforeWrite }),
	});
	let written;
	try {
		written = edit.writeBytes(entry.before);
	} catch (error) {
		if (!(error instanceof ToolError)) throw error;
		return answer("rejected", { diagnostics: [{ code: error.code, message: error.message }] });
	}
	if (written.written) history.delete(file.path);
	const restored = JSON.parse(entry.before.toString("utf8").replace(/^\uFEFF/, "")) as UnknownRecord;
	return answer("applied", {
		written: written.written,
		revision: written.revision,
		changedIds: changedIds(file.document, restored),
		created: { undone: entry.tool },
	});
}

/**
 * Run one edit on one board: read it, check the revision the agent holds,
 * do the work in memory through the plugin's writers, write the file once.
 */
function runEdit(
	context: EditToolContext,
	history: Map<string, UndoEntry>,
	toolName: string,
	args: UnknownRecord,
	work: (session: EditSession) => StepResult,
): UnknownRecord {
	const file = readBoardFile(context.vault, args.path);
	const dryRun = args.dryRun === true;
	const answer = answerFor(context.vault, file, dryRun);
	const refusal = refusalBeforeWork(file, args);
	if (refusal !== undefined) return answer("rejected", { diagnostics: [refusal] });
	const edit = new BoardEdit(context.vault, file, {
		dryRun,
		...(context.beforeWrite === undefined ? {} : { beforeWrite: context.beforeWrite }),
	});
	let step: StepResult;
	try {
		step = work(new EditSession(edit));
	} catch (error) {
		if (!(error instanceof ToolError)) throw error;
		step = refuse(error.code, error.message);
	}
	const staleNotice = { code: STALE_BOARD, message: "The board changed on disk during the call; nothing was written. Read it again." };
	if (!step.ok) {
		return answer("rejected", { diagnostics: edit.staleDetected ? [staleNotice, ...step.diagnostics] : step.diagnostics });
	}
	if (!edit.changed) {
		return answer("noop", { diagnostics: step.diagnostics, ...(step.created === undefined ? {} : { created: step.created }) });
	}
	let written;
	try {
		written = edit.write();
	} catch (error) {
		if (!(error instanceof ToolError)) throw error;
		return answer("rejected", { diagnostics: [{ code: error.code, message: error.message }, ...step.diagnostics] });
	}
	if (written.written) {
		// The file as it was, byte for byte, so an undo gives back exactly that.
		const before = Buffer.from(`${file.hasBom ? UTF8_BOM : ""}${file.text}`, "utf8");
		if (revisionOf(before) === file.revision) {
			history.set(file.path, { before, afterRevision: written.revision, tool: toolName });
		} else {
			history.delete(file.path);
		}
	}
	return answer("applied", {
		written: written.written,
		revision: written.revision,
		changedIds: changedIds(file.document, edit.savedDocument),
		diagnostics: step.diagnostics,
		...(step.created === undefined ? {} : { created: step.created }),
	});
}

// ---------------------------------------------------------------------------
// Where a line's end holds

/** An end as the agent gives it: a full anchor, or a card and maybe a side. */
interface EndSpec {
	readonly anchor?: CanvasAnchor;
	readonly nodeId?: string;
	readonly side?: Side;
}

function readEndSpec(raw: unknown, name: string): EndSpec {
	if (!isRecord(raw)) throw new ToolError("anchor-invalid", `${name} must be an object.`);
	if (typeof raw.type === "string") {
		const normalized = normalizeAnchor(raw);
		if (!normalized.valid || normalized.anchor === undefined) {
			throw new ToolError("anchor-invalid", `${name} is not an anchor the board knows: ${normalized.diagnostics[0]?.message ?? "invalid"}.`);
		}
		return { anchor: normalized.anchor };
	}
	if (typeof raw.nodeId === "string" && raw.nodeId.length > 0) {
		const side = raw.side;
		if (side !== undefined && !(SIDES as unknown[]).includes(side)) {
			throw new ToolError("anchor-invalid", `${name}.side must be top, right, bottom or left.`);
		}
		return { nodeId: raw.nodeId, ...(side === undefined ? {} : { side: side as Side }) };
	}
	if (typeof raw.x === "number" && typeof raw.y === "number") {
		return { anchor: { type: "free", x: raw.x, y: raw.y } };
	}
	throw new ToolError("anchor-invalid", `${name} needs a nodeId, a point (x, y) or an anchor with a type.`);
}

/** Which side of a card faces a point: the one a line to it leaves from. */
function sideFacing(rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }, point: AnchorPoint): Side {
	const dx = (point.x - (rect.x + rect.width / 2)) / Math.max(rect.width, 1);
	const dy = (point.y - (rect.y + rect.height / 2)) / Math.max(rect.height, 1);
	if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "right" : "left";
	return dy >= 0 ? "bottom" : "top";
}

/**
 * Both ends of a line as anchors.  An end given as a card without a side
 * holds on to the side facing the other end, as a line drawn by hand would.
 */
function resolveEnds(document: UnknownRecord, fromSpec: EndSpec, toSpec: EndSpec): { from: CanvasAnchor; to: CanvasAnchor } {
	const geometry = buildCanvasAnchorGeometry(document);
	const rectOf = (nodeId: string) => {
		const rect = geometry.nodes?.[nodeId];
		if (rect === undefined) throw new ToolError("not-found", `The board has no card ${nodeId}.`);
		return rect;
	};
	const pointOf = (spec: EndSpec): AnchorPoint | undefined => {
		if (spec.nodeId !== undefined) {
			const rect = rectOf(spec.nodeId);
			return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
		}
		const resolved = resolveAnchor(spec.anchor, geometry);
		return resolved.valid ? resolved.point : undefined;
	};
	const anchorOf = (spec: EndSpec, other: EndSpec): CanvasAnchor => {
		if (spec.anchor !== undefined) return spec.anchor;
		const nodeId = spec.nodeId!;
		const rect = rectOf(nodeId);
		const towards = pointOf(other);
		const side = spec.side ?? (towards === undefined ? "right" : sideFacing(rect, towards));
		return { type: "node", nodeId, ...SIDE_POINTS[side] };
	};
	return { from: anchorOf(fromSpec, toSpec), to: anchorOf(toSpec, fromSpec) };
}

// ---------------------------------------------------------------------------
// Writes the session makes the same way

/** Store the board's own connectors through the plugin's record, as the session does. */
function writeBoardConnectors(session: EditSession, items: readonly BoardConnector[], remove: readonly string[] = []): StepResult {
	const document = session.document;
	if (!editAllowed(document, "edit", [...items.map((connector) => connector.id), ...remove])) {
		return refuse("locked", "A line this change touches is locked, or the board is in review mode.");
	}
	const plan = planBoardConnectors(document, items, remove, (ids) => editAllowed(document, "edit", ids));
	if (!plan.ok) {
		const messages = {
			"locked": "A line this change touches is locked, or the board is in review mode.",
			"end-unresolved": "Where a line held on to the one taken away cannot be told.",
			"target-invalid": "A line would end on something the board does not have.",
		};
		return refuse(plan.reason, messages[plan.reason]);
	}
	return fromWriter(session.writer().write("board-connectors", (draft) => {
		draft.connectors = plan.connectors;
		draft.localOverrides = plan.localOverrides;
	}));
}

/** A connector whose ends both hold on to cards becomes the native edge it can be, under the same id. */
function connectorToNative(session: EditSession, connector: BoardConnector): StepResult {
	const { edge, override } = nativeEdgeOf(connector);
	return fromAuthoring(session.authoring().rewriteGraph({
		addEdges: [edge],
		metadata: (metadata) => {
			const connectors = isRecord(metadata.connectors) ? { ...metadata.connectors } : {};
			delete connectors[connector.id];
			metadata.connectors = connectors;
			const overrides = isRecord(metadata.localOverrides) ? { ...metadata.localOverrides } : {};
			const kept = isRecord(overrides[connector.id]) ? overrides[connector.id] as UnknownRecord : {};
			overrides[connector.id] = { ...kept, ...override };
			metadata.localOverrides = overrides;
		},
	}));
}

/** Whether a comment thread is locked: its pin keeps still and takes no replies. */
function commentLocked(document: UnknownRecord, threadId: string): boolean {
	const metadata = isRecord(document.miroCanvas) ? document.miroCanvas : {};
	const decorations = isRecord(metadata.commentDecorations) ? metadata.commentDecorations : {};
	const decoration = decorations[`local:${threadId}`];
	return isRecord(decoration) && decoration.locked === true;
}

/**
 * Lines that ended on a comment pin taken away keep their end where it was,
 * free, as the session does when a thread is deleted.
 */
function freeLinesOnMissingComments(document: UnknownRecord, draft: UnknownRecord): void {
	const before = buildCanvasAnchorGeometry(document);
	const after = buildCanvasAnchorGeometry({ ...document, miroCanvas: draft });
	const detach = (raw: unknown, id: string, end: "from" | "to"): unknown => {
		const anchor = normalizeAnchor(raw).anchor;
		if (anchor?.type !== "comment" || after.comments?.[`${anchor.origin}:${anchor.commentId}`] !== undefined) return raw;
		const route = before.edges?.[id];
		const point = end === "from" ? route?.start : route?.end;
		if (point === undefined || !editAllowed(document, "edit", [id])) {
			throw new Error("A line held by the comment is locked, or where its end was cannot be told.");
		}
		return { type: "free", x: point.x, y: point.y };
	};
	if (isRecord(draft.connectors)) {
		for (const [id, connector] of Object.entries(draft.connectors)) {
			if (!isRecord(connector)) continue;
			draft.connectors[id] = { ...connector, from: detach(connector.from, id, "from"), to: detach(connector.to, id, "to") };
		}
	}
	if (isRecord(draft.localOverrides)) {
		for (const [id, override] of Object.entries(draft.localOverrides)) {
			if (!isRecord(override) || !isRecord(override.connectorAnchors)) continue;
			const anchors = { ...override.connectorAnchors };
			for (const end of ["from", "to"] as const) {
				if (anchors[end] !== undefined) anchors[end] = detach(anchors[end], id, end);
			}
			draft.localOverrides[id] = { ...override, connectorAnchors: anchors };
		}
	}
}

/** Change the comments through the plugin's record, as the session's comment card does. */
function mutateComment(
	session: EditSession,
	action: string,
	transform: (draft: UnknownRecord) => CommentMutationResult,
): { step: StepResult; mutation?: CommentMutationResult } {
	const document = session.document;
	let mutation: CommentMutationResult | undefined;
	let problem: EditDiagnostic | undefined;
	const result = session.writer().write(action, (draft) => {
		mutation = transform(draft);
		if (!mutation.ok || mutation.metadata === undefined) {
			const first = mutation.diagnostics[0];
			problem = { code: first?.code ?? "comment-invalid", message: first?.message ?? "The comment change was refused." };
			throw new Error(problem.message);
		}
		freeLinesOnMissingComments(document, mutation.metadata);
		return mutation.metadata;
	});
	const step = fromWriter(result);
	if (!step.ok && problem !== undefined) return { step: { ok: false, diagnostics: [problem, ...step.diagnostics] } };
	return { step, ...(mutation === undefined ? {} : { mutation }) };
}

// ---------------------------------------------------------------------------
// Schemas

const commonProperties = {
	path: boardPathSchema,
	expectedRevision: {
		type: "string",
		pattern: "^[0-9a-f]{64}$",
		description: "The revision read_board gave. The edit is refused (stale-board) when the board changed since.",
	},
	dryRun: { type: "boolean", default: false, description: "Work the change out and check it, but leave the file alone." },
};

const editResultSchema: JsonSchema = {
	type: "object",
	properties: {
		path: { type: "string" },
		status: { enum: ["applied", "noop", "rejected"] },
		dryRun: { type: "boolean" },
		written: { type: "boolean" },
		revision: { type: "string", description: "The board's revision now (after a dry run: what it would be)." },
		previousRevision: { type: "string" },
		changedIds: { type: "array", items: { type: "string" } },
		created: { type: "object", additionalProperties: { type: "string" } },
		diagnostics: { type: "array", items: { type: "object" } },
		warnings: { type: "array", items: { type: "object" } },
	},
	required: ["path", "status", "dryRun", "written", "revision", "previousRevision", "changedIds", "diagnostics", "warnings"],
};

const idSchema = { type: "string", minLength: 1, maxLength: 512 };
const idsSchema = { type: "array", items: idSchema, minItems: 1, maxItems: 2000, uniqueItems: true };

const endSchema: JsonSchema = {
	type: "object",
	description: "A card and a side ({ nodeId, side? }; without a side, the side facing the other end), a point on the board "
		+ "({ x, y }), or a full anchor: { type: \"node\", nodeId, u, v } (u, v from 0 to 1 across the card), "
		+ "{ type: \"free\", x, y }, { type: \"edge\", edgeId, t }, { type: \"comment\", commentId, origin }.",
	properties: {
		nodeId: { type: "string" },
		side: { enum: SIDES },
		type: { enum: ["node", "image", "free", "edge", "comment"] },
		x: { type: "number" },
		y: { type: "number" },
		u: { type: "number" },
		v: { type: "number" },
		edgeId: { type: "string" },
		t: { type: "number" },
		commentId: { type: "string" },
		origin: { enum: ["local", "imported"] },
	},
};

const colorsSchema = {
	type: "object",
	description: "Colours as #rrggbb: text, fill, border (cards and shapes), edge (lines).",
	properties: { text: { type: "string" }, fill: { type: "string" }, border: { type: "string" }, edge: { type: "string" } },
	additionalProperties: false,
};

const typographySchema = {
	type: "object",
	description: "fontFamily, fontSize, fontWeight, fontStyle, format { bold, italic, underline, strike }, alignment, textAlign, "
		+ "textDecoration, lineHeight, verticalAlign.",
};

const connectorStyleProperties = {
	route: { enum: [...CONNECTOR_ROUTES] },
	color: { type: "string", description: "#rrggbb" },
	width: { type: "number", exclusiveMinimum: 0, maximum: 100 },
	startCap: { enum: [...CONNECTOR_CAPS] },
	endCap: { enum: [...CONNECTOR_CAPS] },
	strokeStyle: { enum: [...CONNECTOR_STROKES] },
	headSize: { type: "number", minimum: 1, maximum: 1000 },
	labelT: { type: "number", minimum: 0, maximum: 1, description: "Where the label sits along the line, 0 to 1." },
};

function editTool(
	name: string,
	title: string,
	description: string,
	properties: Record<string, unknown>,
	required: readonly string[],
	run: (args: UnknownRecord) => UnknownRecord,
	annotations: Record<string, unknown> = EDIT_ANNOTATIONS,
): ToolDefinition {
	return {
		name,
		title,
		description,
		inputSchema: {
			type: "object",
			properties: { ...commonProperties, ...properties },
			required: ["path", ...required],
			additionalProperties: false,
		},
		outputSchema: editResultSchema,
		annotations,
		run,
		failed: (result) => result.status === "rejected",
	};
}

// ---------------------------------------------------------------------------
// The tools

/** The tools that change boards; none of them exists with --read-only. */
export function createEditTools(context: EditToolContext): ToolDefinition[] {
	const history = new Map<string, UndoEntry>();
	const edit = (toolName: string, args: UnknownRecord, work: (session: EditSession) => StepResult): UnknownRecord =>
		runEdit(context, history, toolName, args, work);
	const stickyTokens = miroStickyColors().map((color) => color.token);

	const addItem = editTool(
		"add_item",
		"Add an item",
		"Add one of the board tools' items: text, sticky_note, code, frame, table or link. It is stored as an ordinary Canvas "
			+ "card (a frame as a group) that remembers what it stands for, so the board still opens without the plugin. "
			+ "Width and height default to Miro's sizes. text is the card's Markdown (a code block defaults to an empty fence, "
			+ "a table to an empty Markdown table); label names a frame; url is a link's web address; color is a sticky note's "
			+ "colour by Miro's name; title names a code block or a table.",
		{
			type: { enum: ["text", "sticky_note", "code", "frame", "table", "link"] },
			x: { type: "number" },
			y: { type: "number" },
			width: { type: "number", exclusiveMinimum: 0 },
			height: { type: "number", exclusiveMinimum: 0 },
			text: { type: "string" },
			label: { type: "string", maxLength: 256 },
			url: { type: "string" },
			color: { enum: stickyTokens },
			title: { type: "string", maxLength: 256 },
		},
		["type", "x", "y"],
		(args) => edit("add_item", args, (session) => {
			const type = args.type as "text" | "sticky_note" | "code" | "frame" | "table" | "link";
			const size = type === "link" ? { width: 400, height: 240 } : LOCAL_ITEM_SIZES[type];
			const strings = words().session;
			let item: LocalItem | { readonly type: "link" };
			if (type === "sticky_note") {
				item = { type, color: stringOr(args.color, "light_yellow")! };
			} else if (type === "code") {
				item = { type, title: stringOr(args.title, strings.codeBlockDefaultTitle)! };
			} else if (type === "table") {
				item = { type, title: stringOr(args.title, strings.gridDefaultTitle)! };
			} else {
				item = { type };
			}
			const defaultText = type === "code" ? "```\n\n```" : type === "table" ? TABLE_TEMPLATE : "";
			const frames = arrayOf(session.document.nodes).filter((node) => isRecord(node) && node.type === "group").length;
			const label = type === "frame" ? stringOr(args.label, strings.frameDefaultName(frames + 1)) : undefined;
			const id = newCanvasId();
			const result = session.authoring().createItem({
				item,
				id,
				x: numberOr(args.x, 0),
				y: numberOr(args.y, 0),
				width: numberOr(args.width, size.width),
				height: numberOr(args.height, size.height),
				text: stringOr(args.text, defaultText),
				...(label === undefined ? {} : { label }),
				...(typeof args.url === "string" ? { url: args.url } : {}),
			});
			return fromAuthoring(result, { nodeId: id });
		}),
	);

	const addCard = editTool(
		"add_card",
		"Add a card",
		"Add a plain native Canvas card: a text card (Markdown in text), a card showing a vault file (file, a path inside "
			+ "the vault) or a web page (url). color is a Canvas colour, \"1\" to \"6\" or #rrggbb. Geometry is rounded to whole numbers.",
		{
			kind: { enum: ["text", "file", "link"], default: "text" },
			x: { type: "number" },
			y: { type: "number" },
			width: { type: "number", exclusiveMinimum: 0, default: 240 },
			height: { type: "number", exclusiveMinimum: 0, default: 120 },
			text: { type: "string" },
			file: { type: "string", description: "A file inside the vault, for kind \"file\"." },
			url: { type: "string", description: "An http or https address, for kind \"link\"." },
			color: { type: "string", pattern: NATIVE_COLOR.source },
		},
		["x", "y"],
		(args) => edit("add_card", args, (session) => {
			const kind = stringOr(args.kind, "text");
			const id = newCanvasId();
			const node: UnknownRecord = {
				id,
				type: kind,
				x: Math.round(numberOr(args.x, 0)),
				y: Math.round(numberOr(args.y, 0)),
				width: Math.max(1, Math.round(numberOr(args.width, 240))),
				height: Math.max(1, Math.round(numberOr(args.height, 120))),
			};
			if (kind === "text") {
				node.text = stringOr(args.text, "");
			} else if (kind === "file") {
				if (typeof args.file !== "string") return refuse("file-missing", "A file card needs file, a path inside the vault.");
				node.file = readVaultFilePath(args.file);
			} else {
				node.url = readWebAddress(args.url);
			}
			if (typeof args.color === "string") node.color = args.color;
			return fromAuthoring(session.authoring().rewriteGraph({ addNodes: [node] }), { nodeId: id });
		}),
	);

	const addShape = editTool(
		"add_shape",
		"Add a shape",
		`Add a Miro shape: an ordinary Canvas text card that remembers its shape, so it stays a readable card without the plugin. `
			+ `shape is one of: ${CANVAS_SHAPE_KINDS.join(", ")}. Geometry is rounded to whole numbers.`,
		{
			shape: { enum: [...CANVAS_SHAPE_KINDS] },
			x: { type: "number" },
			y: { type: "number" },
			width: { type: "number", exclusiveMinimum: 0 },
			height: { type: "number", exclusiveMinimum: 0 },
			text: { type: "string" },
			colors: colorsSchema,
			typography: typographySchema,
			borderStyle: { enum: ["solid", "dashed", "dotted", "none"] },
			borderWidth: { type: "number", minimum: 0, maximum: 100 },
		},
		["shape", "x", "y", "width", "height"],
		(args) => edit("add_shape", args, (session) => {
			const id = newCanvasId();
			const result = session.authoring().createShape({
				id,
				shape: args.shape,
				text: stringOr(args.text, ""),
				x: Math.round(numberOr(args.x, 0)),
				y: Math.round(numberOr(args.y, 0)),
				width: Math.max(1, Math.round(numberOr(args.width, 200))),
				height: Math.max(1, Math.round(numberOr(args.height, 200))),
				...(args.colors === undefined ? {} : { colors: args.colors }),
				...(args.typography === undefined ? {} : { typography: args.typography }),
				...(args.borderStyle === undefined ? {} : { borderStyle: args.borderStyle }),
				...(args.borderWidth === undefined ? {} : { borderWidth: args.borderWidth }),
			});
			return fromAuthoring(result, { nodeId: id });
		}),
	);

	const updateNode = editTool(
		"update_node",
		"Change a card",
		"Change a card's own fields: its text (text cards only), its place and size (rounded to whole numbers), its Canvas "
			+ "colour (\"1\" to \"6\" or #rrggbb; null takes it away). Lines on the card follow it. A locked card is refused.",
		{
			id: idSchema,
			text: { type: "string" },
			x: { type: "number" },
			y: { type: "number" },
			width: { type: "number", exclusiveMinimum: 0 },
			height: { type: "number", exclusiveMinimum: 0 },
			color: { anyOf: [{ type: "string", pattern: NATIVE_COLOR.source }, { type: "null" }] },
		},
		["id"],
		(args) => edit("update_node", args, (session) => {
			const update: { -readonly [key in keyof UpdateNodeInput]: UpdateNodeInput[key] } = { id: args.id as string };
			if (typeof args.text === "string") update.text = args.text;
			// The board keeps whole-number geometry; the plugin's own tools round the same way.
			if (typeof args.x === "number") update.x = Math.round(args.x);
			if (typeof args.y === "number") update.y = Math.round(args.y);
			if (typeof args.width === "number") update.width = Math.max(1, Math.round(args.width));
			if (typeof args.height === "number") update.height = Math.max(1, Math.round(args.height));
			if (args.color === null || typeof args.color === "string") update.color = args.color;
			return fromAuthoring(session.authoring().updateNodes([update]));
		}),
	);

	const move = editTool(
		"move",
		"Move",
		"Move cards, lines, the board's own connectors and comment pins (as \"miro-comment:local:<id>\") by dx, dy (rounded to "
			+ "whole numbers), together, as one drag would. Lines on a moved card follow it. Anything locked refuses the whole move.",
		{ ids: idsSchema, dx: { type: "number" }, dy: { type: "number" } },
		["ids", "dx", "dy"],
		(args) => edit("move", args, (session) => {
			const dx = Math.round(numberOr(args.dx, 0));
			const dy = Math.round(numberOr(args.dy, 0));
			if (dx === 0 && dy === 0) return { ok: true, diagnostics: [] };
			return fromAuthoring(session.authoring().moveSelection(args.ids as string[], dx, dy));
		}),
	);

	const setStyle = editTool(
		"set_style",
		"Change the look",
		"Change how shapes, text cards and lines look, as the selection toolbar does: colors, typography, shape (turns a shape "
			+ "into another kind), borderStyle, borderWidth; connector (route, color, width, startCap, endCap, strokeStyle, "
			+ "headSize, labelT) for native edges. Only what is given changes; the rest stays.",
		{
			ids: idsSchema,
			colors: colorsSchema,
			typography: typographySchema,
			shape: { enum: [...CANVAS_SHAPE_KINDS] },
			borderStyle: { enum: ["solid", "dashed", "dotted", "none"] },
			borderWidth: { type: "number", minimum: 0, maximum: 100 },
			connector: { type: "object", properties: connectorStyleProperties, additionalProperties: false },
		},
		["ids"],
		(args) => edit("set_style", args, (session) => {
			const inputs = (args.ids as string[]).map((id) => {
				const input: { -readonly [key in keyof UpdateElementStyleInput]: UpdateElementStyleInput[key] } = { id };
				if (isRecord(args.colors)) input.colors = args.colors;
				if (isRecord(args.typography)) input.typography = args.typography;
				if (typeof args.shape === "string") input.shape = args.shape as UpdateElementStyleInput["shape"];
				if (typeof args.borderStyle === "string") input.borderStyle = args.borderStyle as UpdateElementStyleInput["borderStyle"];
				if (typeof args.borderWidth === "number") input.borderWidth = args.borderWidth;
				if (isRecord(args.connector)) input.connector = args.connector as UpdateElementStyleInput["connector"];
				return input;
			});
			return fromAuthoring(session.authoring().updateElementStyles(inputs));
		}),
	);

	const rotate = editTool(
		"rotate",
		"Rotate",
		"Turn a card to an angle in degrees, clockwise; 0 is upright. The plugin keeps the angle in its record: without the "
			+ "plugin the card shows upright.",
		{ id: idSchema, degrees: { type: "number" } },
		["id", "degrees"],
		(args) => edit("rotate", args, (session) =>
			fromAuthoring(session.authoring().updateRotation({ id: args.id as string, rotation: numberOr(args.degrees, 0) }))),
	);

	const connect = editTool(
		"connect",
		"Connect",
		"Draw a line from one end to another. Between two different cards it is a native Canvas edge, which shows without the "
			+ "plugin; with an end on empty board, on another line or on a comment pin it is kept as the board's own connector. "
			+ "Defaults: straight, #1a1a1a, width 2, an arrowhead at the end (endCap stealth).",
		{
			from: endSchema,
			to: endSchema,
			label: { type: "string", maxLength: 1024 },
			...connectorStyleProperties,
		},
		["from", "to"],
		(args) => edit("connect", args, (session) => {
			const ends = resolveEnds(session.document, readEndSpec(args.from, "from"), readEndSpec(args.to, "to"));
			const id = newCanvasId();
			const connector = {
				id,
				from: ends.from,
				to: ends.to,
				route: stringOr(args.route, CONNECTOR_DEFAULTS.route),
				color: stringOr(args.color, CONNECTOR_DEFAULTS.color)!.toLowerCase(),
				width: numberOr(args.width, CONNECTOR_DEFAULTS.width),
				startCap: stringOr(args.startCap, CONNECTOR_DEFAULTS.startCap),
				endCap: stringOr(args.endCap, CONNECTOR_DEFAULTS.endCap),
				...(typeof args.strokeStyle === "string" ? { strokeStyle: args.strokeStyle } : {}),
				...(typeof args.headSize === "number" ? { headSize: args.headSize } : {}),
				...(typeof args.labelT === "number" ? { labelT: args.labelT } : {}),
				...(typeof args.label === "string" && args.label !== "" ? { label: args.label } : {}),
			};
			const checked = readBoardConnector(connector);
			if (checked === undefined) return refuse("connector-invalid", "The line's ends or look are not ones the board keeps.");
			if (!fitsNativeEdge(checked)) {
				const stored = writeBoardConnectors(session, [checked]);
				return stored.ok ? { ...stored, created: { connectorId: id, form: "board-connector" } } : stored;
			}
			// As the session places a line between two cards: the native edge and the plugin's record of it.
			const { edge, override } = nativeEdgeOf(checked);
			const result = session.authoring().insertGraph({ nodes: [], edges: [edge], overrides: { [id]: override } });
			return fromAuthoring(result, { connectorId: id, form: "native-edge" });
		}),
	);

	const updateConnector = editTool(
		"update_connector",
		"Change a line",
		"Change a line - a native edge or the board's own connector: its label (\"\" takes it away), its ends (from, to) and its "
			+ "look (route, color, width, startCap, endCap, strokeStyle, headSize, labelT). A connector whose ends come to hold "
			+ "on to two cards becomes a native edge under the same id. A native edge's ends must stay on cards.",
		{
			id: idSchema,
			label: { type: "string", maxLength: 1024 },
			from: endSchema,
			to: endSchema,
			...connectorStyleProperties,
		},
		["id"],
		(args) => edit("update_connector", args, (session) => updateLine(session, args)),
	);

	const remove = editTool(
		"delete",
		"Delete",
		"Take cards, native edges and the board's own connectors off the board, with every line that ended on a card taken "
			+ "away and the plugin's record of each. Comments are deleted with the comment tool. Anything locked refuses the whole delete.",
		{ ids: idsSchema },
		["ids"],
		(args) => edit("delete", args, (session) => fromAuthoring(session.authoring().deleteItems({ ids: args.ids as string[] }))),
		DELETE_ANNOTATIONS,
	);

	const layer = editTool(
		"layer",
		"Bring forward or send back",
		"Change which cards lie on top: front, back, forward (one step) or backward. Only the order of the board's cards "
			+ "changes; lines, frames and comment pins among the ids are passed over.",
		{ ids: idsSchema, direction: { enum: ["front", "back", "forward", "backward"] } },
		["ids", "direction"],
		(args) => edit("layer", args, (session) => fromAuthoring(session.authoring().changeZOrder({
			ids: args.ids as string[],
			direction: args.direction as "front" | "back" | "forward" | "backward",
		}))),
	);

	const lock = editTool(
		"lock",
		"Lock or unlock",
		"Lock cards and lines (locked: true) so that nothing moves, resizes, restyles or deletes them, or unlock them.",
		{ ids: idsSchema, locked: { type: "boolean" } },
		["ids", "locked"],
		(args) => edit("lock", args, (session) => {
			const ids = args.ids as string[];
			const known = new Set<string>([
				...arrayOf(session.document.nodes).map((node) => (isRecord(node) ? node.id : undefined)),
				...arrayOf(session.document.edges).map((edge) => (isRecord(edge) ? edge.id : undefined)),
				...boardConnectors(session.document).map((connector) => connector.id),
			].filter((id): id is string => typeof id === "string"));
			const missing = ids.filter((id) => !known.has(id));
			if (missing.length > 0) return refuse("not-found", `The board has no card or line ${missing.join(", ")}.`);
			return fromWriter(session.writer().write("set-locks", (draft) => {
				const next = reduceInteractionMetadata(draft, { type: "set-locks", elementIds: ids, locked: args.locked === true });
				if (next === undefined) throw new Error("The lock change was not one the board's record takes.");
				return next as UnknownRecord;
			}));
		}),
	);

	const comment = editTool(
		"comment",
		"Comment",
		"Work with the board's own comments. op add: a new thread (text; anchor: a card { nodeId }, a point { x, y } or a full "
			+ "anchor; author: a name, \"AI agent\" when absent). op reply: a reply to commentId. op edit: new text for commentId. "
			+ "op resolve / reopen / delete: on commentId. Imported Miro comments cannot be changed; a locked thread takes nothing.",
		{
			op: { enum: ["add", "reply", "edit", "resolve", "reopen", "delete"] },
			commentId: idSchema,
			text: { type: "string", minLength: 1, maxLength: 100000 },
			anchor: endSchema,
			author: { type: "string", minLength: 1, maxLength: 256 },
		},
		["op"],
		(args) => edit("comment", args, (session) => changeComment(session, args)),
	);

	const undoLast = editTool(
		"undo_last",
		"Undo the last change",
		"Give back the board exactly as it was before the last change this server wrote to it, when nothing has saved the "
			+ "board since. Only the last change of this server's run can be undone.",
		{},
		[],
		(args) => undoLastChange(context, history, args),
	);

	return [addItem, addCard, addShape, updateNode, move, setStyle, rotate, connect, updateConnector, remove, layer, lock, comment, undoLast];
}

/** Every tool the server offers: with `readOnly`, the ones that change boards are not there at all. */
export function createServerTools(context: EditToolContext & { readonly readOnly: boolean }): ToolDefinition[] {
	const readTools = createReadTools({ vault: context.vault });
	return context.readOnly ? readTools : [...readTools, ...createEditTools(context)];
}

/**
 * A file card's path, checked for shape only by the vault's own rule for
 * paths: the card names a file, the server never opens it.
 */
function readVaultFilePath(file: string): string {
	return Vault.splitRelativePath(file, "folder").join("/");
}

/** A web address for a link card: http or https only. */
function readWebAddress(value: unknown): string {
	try {
		const parsed = new URL(String(value));
		if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.href;
	} catch {
		// Falls through to the refusal below.
	}
	throw new ToolError("url-invalid", "A link card needs an http or https address.");
}

/** The look of a line as the agent gave it, only the fields given. */
function connectorPatch(args: UnknownRecord): Partial<BoardConnector> {
	const patch: Record<string, unknown> = {};
	for (const key of Object.keys(connectorStyleProperties)) {
		if (args[key] !== undefined) patch[key] = key === "color" && typeof args[key] === "string" ? (args[key] as string).toLowerCase() : args[key];
	}
	return patch as Partial<BoardConnector>;
}

/** update_connector: a native edge through CanvasAuthoring, the board's own connector through its record. */
function updateLine(session: EditSession, args: UnknownRecord): StepResult {
	const id = args.id as string;
	const document = session.document;
	const edge = arrayOf(document.edges).find((item) => isRecord(item) && item.id === id);
	const patch = connectorPatch(args);
	const hasEnds = args.from !== undefined || args.to !== undefined;
	if (isRecord(edge)) {
		const steps: StepResult[] = [];
		const run = (step: StepResult): boolean => {
			steps.push(step);
			return step.ok;
		};
		const merged = (): StepResult => ({ ok: steps.every((step) => step.ok), diagnostics: steps.flatMap((step) => step.diagnostics) });
		if (hasEnds) {
			const current = { nodeId: String(edge.fromNode) };
			const target = { nodeId: String(edge.toNode) };
			const fromSpec = args.from === undefined ? current : readEndSpec(args.from, "from");
			const toSpec = args.to === undefined ? target : readEndSpec(args.to, "to");
			const ends = resolveEnds(session.document, fromSpec, toSpec);
			for (const end of ["from", "to"] as const) {
				if (args[end] === undefined) continue;
				const anchor = ends[end];
				if (anchor.type !== "node" && anchor.type !== "image") {
					return refuse("native-edge-end", "A native edge's ends hold on to cards. To end it elsewhere, delete it and connect again.");
				}
				if (!run(fromAuthoring(session.authoring().updateConnectorEndpoint({ edgeId: id, end, anchor })))) return merged();
			}
		}
		if (typeof args.label === "string") {
			if (!run(fromAuthoring(session.authoring().updateEdgeLabel(id, args.label)))) return merged();
		}
		if (Object.keys(patch).length > 0) {
			const style: UpdateElementStyleInput = { id, connector: patch as UpdateElementStyleInput["connector"] };
			if (!run(fromAuthoring(session.authoring().updateElementStyles([style])))) return merged();
		}
		if (steps.length === 0) return refuse("nothing-to-change", "Name a label, an end or a look to change.");
		return merged();
	}
	const current = boardConnectors(document).find((connector) => connector.id === id);
	if (current === undefined) return refuse("not-found", `The board has no line ${id}.`);
	let next: BoardConnector = { ...current };
	if (typeof args.label === "string") {
		if (args.label === "") {
			const { label: _label, ...rest } = next;
			next = rest as BoardConnector;
		} else {
			next = { ...next, label: args.label };
		}
	}
	if (hasEnds) {
		const fromSpec = args.from === undefined ? { anchor: current.from } : readEndSpec(args.from, "from");
		const toSpec = args.to === undefined ? { anchor: current.to } : readEndSpec(args.to, "to");
		const ends = resolveEnds(document, fromSpec, toSpec);
		next = { ...next, from: ends.from, to: ends.to };
	}
	if (Object.keys(patch).length > 0) next = restyleBoardConnector(next, patch);
	if (sameJson(next, current)) return { ok: true, diagnostics: [] };
	if (readBoardConnector(next) === undefined) return refuse("connector-invalid", "The line's ends or look are not ones the board keeps.");
	if (!editAllowed(document, "edit", [id])) return refuse("locked", "The line is locked, or the board is in review mode.");
	if (fitsNativeEdge(next)) return connectorToNative(session, next);
	return writeBoardConnectors(session, [next]);
}

/** comment: one change to the board's own comments. */
function changeComment(session: EditSession, args: UnknownRecord): StepResult {
	const op = args.op as string;
	const document = session.document;
	const text = typeof args.text === "string" ? args.text : undefined;
	const author = { name: typeof args.author === "string" ? args.author.trim() || "AI agent" : "AI agent" };
	const idFactory = (): string => newCanvasId();
	if (op === "add") {
		if (text === undefined) return refuse("text-missing", "A comment needs text.");
		let anchor: CanvasAnchor | undefined;
		if (args.anchor !== undefined) {
			const spec = readEndSpec(args.anchor, "anchor");
			anchor = spec.anchor ?? (() => {
				const rect = buildCanvasAnchorGeometry(document).nodes?.[spec.nodeId!];
				if (rect === undefined) throw new ToolError("not-found", `The board has no card ${spec.nodeId}.`);
				const place = spec.side === undefined ? { u: 0.5, v: 0.5 } : SIDE_POINTS[spec.side];
				return { type: "node" as const, nodeId: spec.nodeId!, ...place };
			})();
		}
		const outcome = mutateComment(session, "add-comment", (draft) => addLocalComment(
			draft,
			{ text, ...(anchor === undefined ? {} : { anchor }) },
			{ author, idFactory },
		));
		const commentId = outcome.mutation?.comment?.id;
		return commentId === undefined ? outcome.step : { ...outcome.step, created: { commentId } };
	}
	const commentId = typeof args.commentId === "string" ? args.commentId : undefined;
	if (commentId === undefined) return refuse("comment-id-missing", `op ${op} needs commentId.`);
	const thread = listCommentThreads(document).find((item) => item.id === commentId);
	if (thread === undefined) return refuse("not-found", `The board has no comment ${commentId}.`);
	if (thread.origin !== "local") return refuse("comment-immutable", "Imported Miro comments cannot be changed.");
	if (commentLocked(document, commentId)) return refuse("comment-locked", "The comment thread is locked.");
	if (op === "reply") {
		if (text === undefined) return refuse("text-missing", "A reply needs text.");
		const outcome = mutateComment(session, "reply-comment", (draft) => addReply(draft, commentId, text, { author, idFactory }));
		const replyId = outcome.mutation?.reply?.id;
		return replyId === undefined ? outcome.step : { ...outcome.step, created: { replyId } };
	}
	if (op === "edit") {
		if (text === undefined) return refuse("text-missing", "Editing a comment needs its new text.");
		return mutateComment(session, "edit-comment", (draft) => editLocalComment(draft, commentId, text)).step;
	}
	if (op === "resolve" || op === "reopen") {
		return mutateComment(session, "resolve-comment", (draft) => setCommentResolved(draft, commentId, op === "resolve")).step;
	}
	return mutateComment(session, "delete-comment", (draft) => deleteLocalComment(draft, commentId)).step;
}
