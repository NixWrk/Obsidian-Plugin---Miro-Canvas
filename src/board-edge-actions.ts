/** Pure, checked whole-board plans. The caller owns persistence and native history. */
import { normalizeAnchor, resolveAnchor, type CanvasAnchor, type AnchorPoint } from "./anchors";
import { isSafeColor } from "./appearance";
import { readBoardConnector } from "./board-connectors";
import { hasAsciiControl } from "./control-characters";
import { buildCanvasAnchorGeometry } from "./connector-endpoints";
import { createInteractionPolicy, decideInteraction } from "./interaction-policy";
import { parseMiroCanvasMetadata } from "./metadata";
import { buildSourceScene, CONNECTOR_CAPS, readWaypoints } from "./source-model";

type RecordValue = Record<string, unknown>;
export type BoardEdgeRefusal = "invalid-input" | "invalid-document" | "invalid-metadata" | "missing-line" | "locked" | "review-mode" | "unresolved-geometry" | "geometry-changed";
export interface BoardEdgeDiagnostic {
	readonly code: BoardEdgeRefusal;
	readonly message: string;
}
export interface FlipBoardEdgesOptions {
	/** Pass the session's connectorLabelPosition; the default is the midpoint. */
	readonly defaultLabelT?: number;
	/** Additional host policy, called once with every changed line/pin/anchor and endpoint target. */
	readonly editAllowed?: (ids: readonly string[]) => boolean;
}
export type FlipBoardEdgesPlan =
	| { readonly ok: true; readonly document: RecordValue; readonly flippedLineIds: readonly string[]; readonly changedLineIds: readonly string[]; readonly changedCommentKeys: readonly string[]; readonly changedFreeAnchorIds: readonly string[]; readonly diagnostics: readonly BoardEdgeDiagnostic[] }
	| { readonly ok: false; readonly reason: BoardEdgeRefusal; readonly diagnostics: readonly BoardEdgeDiagnostic[] };
export type BoardLineDirection = "connected" | "incoming" | "outgoing";
export type BoardLineTraversal = "direct" | "transitive";
export type BoardLineIdsPlan =
	| { readonly ok: true; readonly lineIds: readonly string[]; readonly diagnostics: readonly BoardEdgeDiagnostic[] }
	| { readonly ok: false; readonly reason: BoardEdgeRefusal; readonly diagnostics: readonly BoardEdgeDiagnostic[] };

class PlanError extends Error {
	public constructor(public readonly code: BoardEdgeRefusal, message: string) {
		super(message);
	}
}
function refuse(code: BoardEdgeRefusal, message: string): never {
	throw new PlanError(code, message);
}
function record(value: unknown): value is RecordValue {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
function own(value: RecordValue, key: string): boolean {
	return Object.prototype.hasOwnProperty.call(value, key);
}
function set(value: RecordValue, key: string, item: unknown): void {
	Object.defineProperty(value, key, { value: item, enumerable: true, configurable: true, writable: true });
}
function fraction(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}
function safeId(value: unknown): value is string {
	return typeof value === "string" && value.length > 0 && value.length <= 512 && !/\s/u.test(value) && !hasAsciiControl(value) && !["__proto__", "prototype", "constructor"].includes(value);
}
/** Match endpoint writers: data descriptors only, plain JSON, no silent field loss. */
function clone(value: unknown, visiting = new Set<object>(), depth = 0): unknown {
	if (depth > 64) refuse("invalid-document", "The JSON nesting limit was exceeded.");
	if (value === null || typeof value === "string" || typeof value === "boolean") return value;
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (!record(value) && !Array.isArray(value)) refuse("invalid-document", "The board contains a non-JSON value.");
	const object = value as object;
	if (visiting.has(object)) refuse("invalid-document", "The board contains cyclic JSON.");
	visiting.add(object);
	try {
		if (Object.getOwnPropertySymbols(object).some((key) => Object.getOwnPropertyDescriptor(object, key)?.enumerable)) refuse("invalid-document", "Enumerable symbols cannot be saved as JSON.");
		const array = Array.isArray(value);
		if (array && value.length > 100_000) refuse("invalid-document", "The JSON array length limit was exceeded.");
		const prototype: unknown = Object.getPrototypeOf(object);
		if (!array && prototype !== null && prototype !== Object.prototype) refuse("invalid-document", "The board contains a non-plain object.");
		const copy: RecordValue | unknown[] = array ? [] : {};
		const keys = array ? Array.from({ length: value.length }, (_, index) => String(index)) : Object.keys(object);
		if (array && Object.keys(object).some((key) => {
			const index = Number(key);
			return !Number.isSafeInteger(index) || index < 0 || index >= value.length || String(index) !== key;
		})) refuse("invalid-document", "An array contains extension fields.");
		for (const key of keys) {
			const descriptor = Object.getOwnPropertyDescriptor(object, key);
			if (descriptor === undefined || !own(descriptor as unknown as RecordValue, "value")) refuse("invalid-document", "Accessors and sparse arrays cannot be copied safely.");
			set(copy as RecordValue, key, clone(descriptor.value, visiting, depth + 1));
		}
		return copy;
	} finally {
		visiting.delete(object);
	}
}
function asRecord(value: unknown, message: string): RecordValue {
	if (!record(value)) refuse("invalid-document", message);
	return value;
}
function anchor(value: unknown): CanvasAnchor {
	const result = normalizeAnchor(value);
	if (!result.valid || result.anchor === undefined) refuse("invalid-metadata", "A stored connector anchor is invalid.");
	return result.anchor;
}
function optionalMap(value: unknown): RecordValue {
	return value === undefined ? {} : asRecord(value, "A known metadata map is invalid.");
}
function validateStyle(value: unknown): void {
	if (value === undefined) return;
	const style = asRecord(value, "Connector style must be an object.");
	for (const key of ["startCap", "endCap"] as const) {
		if (own(style, key) && !(CONNECTOR_CAPS as readonly unknown[]).includes(style[key])) refuse("invalid-metadata", "A connector cap is unknown.");
	}
	if (own(style, "labelT") && !fraction(style.labelT)) refuse("invalid-metadata", "A label share is invalid.");
	if (own(style, "waypoints") && readWaypoints(style.waypoints) === undefined) refuse("invalid-metadata", "Connector waypoints are invalid.");
	for (const [key, allowed] of [["route", ["straight", "elbowed", "curved"]], ["strokeStyle", ["solid", "dashed", "dotted"]]] as const) {
		if (own(style, key) && !(allowed as readonly unknown[]).includes(style[key])) refuse("invalid-metadata", "A connector route or stroke is unknown.");
	}
	for (const [key, min, max] of [["width", 0, 100], ["headSize", 0, 1000]] as const) {
		const number = style[key];
		if (own(style, key) && (typeof number !== "number" || !Number.isFinite(number) || number <= min || number > max || (key === "headSize" && number < 1))) refuse("invalid-metadata", "A connector size is invalid.");
	}
	if (own(style, "block") && typeof style.block !== "boolean") refuse("invalid-metadata", "A block flag is invalid.");
	if (own(style, "color") && !isSafeColor(style.color)) refuse("invalid-metadata", "A connector color is invalid.");
}
interface BoardIndex {
	readonly document: RecordValue;
	readonly metadata: RecordValue;
	readonly nodes: Map<string, RecordValue>;
	readonly native: Map<string, RecordValue>;
	readonly independent: Map<string, RecordValue>;
	readonly overrides: RecordValue;
	readonly lines: Map<string, { from: CanvasAnchor; to: CanvasAnchor }>;
}
function index(input: unknown): BoardIndex {
	const document = asRecord(clone(input), "The board must be an object.");
	const parsed = parseMiroCanvasMetadata(document);
	if (parsed.status === "invalid" || parsed.status === "unsupported") refuse("invalid-metadata", "Existing metadata is invalid or unsupported.");
	const metadata = optionalMap(document.miroCanvas);
	const nodes = new Map<string, RecordValue>();
	const native = new Map<string, RecordValue>();
	const independent = new Map<string, RecordValue>();
	const allIds = new Set<string>();
	for (const [field, target] of [["nodes", nodes], ["edges", native]] as const) {
		const items = document[field];
		if (!Array.isArray(items)) refuse("invalid-document", "The board needs native node and edge arrays.");
		for (const raw of items) {
			const item = asRecord(raw, "A native item is invalid.");
			if (!safeId(item.id) || allIds.has(item.id)) refuse("invalid-document", "Native IDs must be safe and unique.");
			allIds.add(item.id);
			target.set(item.id, item);
		}
	}
	for (const [id, raw] of Object.entries(optionalMap(metadata.connectors))) {
		if (!safeId(id) || allIds.has(id) || readBoardConnector(raw)?.id !== id) refuse("invalid-metadata", "Independent connector IDs or records are invalid.");
		allIds.add(id);
		independent.set(id, asRecord(raw, "A connector is invalid."));
	}
	const overrides = optionalMap(metadata.localOverrides);
	for (const raw of Object.values(overrides)) {
		const override = asRecord(raw, "An override is invalid.");
		validateStyle(override.connector);
		if (override.connectorAnchors !== undefined) {
			for (const end of ["from", "to"] as const) {
				const ends = asRecord(override.connectorAnchors, "Connector anchors must be an object.");
				if (own(ends, end)) anchor(ends[end]);
			}
		}
	}
	const lines = new Map<string, { from: CanvasAnchor; to: CanvasAnchor }>();
	for (const [id, edge] of native) {
		for (const end of ["from", "to"] as const) {
			if (!safeId(edge[`${end}Node`]) || !nodes.has(edge[`${end}Node`] as string)) refuse("invalid-document", "A native edge's fallback node is missing.");
			if (own(edge, `${end}Side`) && !["top", "right", "bottom", "left"].includes(edge[`${end}Side`] as string)) refuse("invalid-document", "A native side is invalid.");
			if (own(edge, `${end}End`) && !["none", "arrow"].includes(edge[`${end}End`] as string)) refuse("invalid-document", "A native cap is invalid.");
		}
		const ends = optionalMap(optionalMap(overrides[id]).connectorAnchors);
		const fallback = (end: "from" | "to"): CanvasAnchor => ({ type: "node", nodeId: edge[`${end}Node`] as string, u: 0.5, v: 0.5 });
		lines.set(id, { from: own(ends, "from") ? anchor(ends.from) : fallback("from"), to: own(ends, "to") ? anchor(ends.to) : fallback("to") });
	}
	for (const [id, line] of independent) lines.set(id, { from: anchor(line.from), to: anchor(line.to) });
	return { document, metadata, nodes, native, independent, overrides, lines };
}
function selectedIds(value: readonly string[]): Set<string> {
	if (!Array.isArray(value) || !value.every(safeId)) refuse("invalid-input", "Selection IDs are invalid.");
	return new Set(value);
}
function swap(value: RecordValue, left: string, right: string): void {
	const hasLeft = own(value, left);
	const hasRight = own(value, right);
	const oldLeft = value[left];
	const oldRight = value[right];
	delete value[left];
	delete value[right];
	if (hasRight) set(value, left, oldRight);
	if (hasLeft) set(value, right, oldLeft);
}
function reverseLabelAndWaypoints(style: RecordValue, defaultLabelT: number): void {
	if (own(style, "waypoints")) (style.waypoints as unknown[]).reverse();
	if (own(style, "labelT")) style.labelT = reversedFraction(style.labelT as number);
	else if (defaultLabelT !== 0.5) style.labelT = reversedFraction(defaultLabelT);
}
/** Decimal shares keep their written precision through the usual two flips. */
function reversedFraction(value: number): number {
	const decimal = /^0\.(\d+)$/u.exec(String(value));
	if (decimal === null) return 1 - value;
	const digits = decimal[1];
	const scale = 10n ** BigInt(digits.length);
	const remaining = (scale - BigInt(digits)).toString().padStart(digits.length, "0");
	return Number(`0.${remaining}`);
}
function target(value: CanvasAnchor): string | undefined {
	if (value.type === "node" || value.type === "image") return value.nodeId;
	if (value.type === "edge") return value.edgeId;
	if (value.type === "comment") return `miro-comment:${value.origin}:${value.commentId}`;
	return undefined;
}
function samePoint(left: AnchorPoint | undefined, right: AnchorPoint | undefined): boolean {
	return left !== undefined && right !== undefined && Math.hypot(left.x - right.x, left.y - right.y) < 0.001;
}
function failure(error: unknown): { ok: false; reason: BoardEdgeRefusal; diagnostics: BoardEdgeDiagnostic[] } {
	const reason = error instanceof PlanError ? error.code : "invalid-document";
	return { ok: false, reason, diagnostics: [{ code: reason, message: error instanceof Error ? error.message : "The board could not be inspected safely." }] };
}

/** Flip each distinct line once, and complement every stored reference to its route. */
export function planFlipBoardEdges(input: unknown, lineIds: readonly string[], options: FlipBoardEdgesOptions = {}): FlipBoardEdgesPlan {
	try {
		const board = index(input);
		const selected = selectedIds(lineIds);
		if (selected.size === 0) refuse("invalid-input", "Flip needs at least one line.");
		const defaultLabelT = options.defaultLabelT ?? 0.5;
		if (!fraction(defaultLabelT)) refuse("invalid-input", "The default label share is invalid.");
		for (const id of selected) if (!board.lines.has(id)) refuse("missing-line", `Line ${id} is missing.`);
		const beforeGeometry = buildCanvasAnchorGeometry(board.document);
		for (const id of selected) if (beforeGeometry.edges?.[id] === undefined) refuse("unresolved-geometry", `Line ${id} has unresolved or cyclic anchors.`);
		const scene = buildSourceScene(board.document);
		const policy = createInteractionPolicy(board.document);
		const policyIds = new Set(selected);
		const changedLines = new Set(selected);
		const changedComments = new Set<string>();
		const changedFreeAnchors = new Set<string>();
		const checkedAnchors: { before: CanvasAnchor; after: CanvasAnchor }[] = [];
		const complement = (raw: unknown): boolean => {
			const old = anchor(raw);
			if (old.type !== "edge" || !selected.has(old.edgeId)) return false;
			const stored = asRecord(raw, "An edge anchor is invalid.");
			stored.t = reversedFraction(old.t);
			checkedAnchors.push({ before: old, after: anchor(stored) });
			return true;
		};
		const ensureMetadata = (): RecordValue => {
			if (board.document.miroCanvas === undefined) set(board.document, "miroCanvas", board.metadata);
			if (!own(board.metadata, "schemaVersion")) board.metadata.schemaVersion = 1;
			return board.metadata;
		};
		for (const id of selected) {
			const ends = board.lines.get(id)!;
			for (const end of [ends.from, ends.to]) {
				const heldBy = target(end);
				if (heldBy !== undefined) policyIds.add(heldBy);
			}
			const independent = board.independent.get(id);
			if (independent !== undefined) {
				swap(independent, "from", "to");
				// Old block arrows hide their end head behind two stored 'none' caps.
				if (independent.block === true && independent.startCap === "none" && independent.endCap === "none") independent.endCap = "stealth";
				swap(independent, "startCap", "endCap");
				reverseLabelAndWaypoints(independent, defaultLabelT);
				const override = optionalMap(board.overrides[id]);
				if (record(override.connectorAnchors)) swap(override.connectorAnchors, "from", "to");
				if (record(override.connector)) {
					const oldStart = override.connector.startCap ?? independent.endCap;
					const storedEnd = override.connector.endCap ?? independent.startCap;
					const oldEnd = override.connector.block === true && oldStart === "none" && storedEnd === "none" ? "stealth" : storedEnd;
					override.connector.startCap = oldEnd;
					override.connector.endCap = oldStart;
					reverseLabelAndWaypoints(override.connector, defaultLabelT);
				}
				continue;
			}
			const edge = board.native.get(id)!;
			const oldFrom = edge.fromEnd ?? "none";
			const oldTo = edge.toEnd ?? "arrow";
			swap(edge, "fromNode", "toNode");
			swap(edge, "fromSide", "toSide");
			edge.fromEnd = oldTo;
			edge.toEnd = oldFrom;
			const override = optionalMap(board.overrides[id]);
			if (record(override.connectorAnchors)) swap(override.connectorAnchors, "from", "to");
			const descriptor = scene.items.get(id);
			const style = descriptor?.connector;
			if (own(override, "connector") || descriptor?.sourceId !== undefined || defaultLabelT !== 0.5) {
				ensureMetadata().localOverrides = board.overrides;
				if (!own(board.overrides, id)) set(board.overrides, id, override);
				const storedStyle = optionalMap(override.connector);
				override.connector = storedStyle;
				const startCap = style?.startCap ?? "none";
				const endCap = style?.endCap ?? "none";
				storedStyle.startCap = style?.block === true && startCap === "none" && endCap === "none" ? "stealth" : endCap;
				storedStyle.endCap = startCap;
				reverseLabelAndWaypoints(storedStyle, defaultLabelT);
				validateStyle(storedStyle);
			}
		}
		// Update references once, after swapping endpoints, including references inside the batch.
		for (const [id, line] of board.independent) {
			const fromChanged = complement(line.from);
			const toChanged = complement(line.to);
			if (fromChanged || toChanged) changedLines.add(id);
		}
		for (const [id, raw] of Object.entries(board.overrides)) {
			const override = asRecord(raw, "An override is invalid.");
			if (!record(override.connectorAnchors)) continue;
			for (const end of ["from", "to"] as const) {
				if (own(override.connectorAnchors, end) && complement(override.connectorAnchors[end])) {
					if (!board.lines.has(id)) refuse("invalid-metadata", "An endpoint override belongs to a missing line.");
					changedLines.add(id);
				}
			}
		}
		const places = optionalMap(board.metadata.commentPlaces);
		const decorations = optionalMap(board.metadata.commentDecorations);
		const commentChanged = (key: string, thread?: RecordValue): void => {
			if (thread?.locked === true || optionalMap(decorations[key]).locked === true) refuse("locked", `Comment ${key} is locked.`);
			changedComments.add(key);
			policyIds.add(`miro-comment:${key}`);
		};
		for (const [key, raw] of Object.entries(places)) if (complement(raw)) commentChanged(key);
		// Preserve comment evidence; moved pins, including hidden imports, use local places.
		const comments: { key: string; thread: RecordValue }[] = [];
		for (const raw of (board.metadata.localComments as unknown[] | undefined) ?? []) {
			const thread = asRecord(raw, "A local comment is invalid.");
			const origin = thread.origin === "imported" || thread.immutable === true ? "imported" : "local";
			if (thread.anchor !== undefined && !safeId(thread.id)) refuse("invalid-metadata", "An anchored comment needs a safe ID.");
			comments.push({ key: `${origin}:${thread.id as string}`, thread });
		}
		const source = record(board.document.miroSource) ? board.document.miroSource : record(board.metadata.miroSource) ? board.metadata.miroSource : undefined;
		if (Array.isArray(source?.comments)) {
			for (const raw of source.comments) {
				if (!record(raw)) continue;
				if (!safeId(raw.id)) {
					if (raw.anchor !== undefined) refuse("invalid-metadata", "An anchored imported comment needs a safe ID.");
					continue;
				}
				comments.push({ key: `imported:${raw.id}`, thread: raw });
			}
		}
		for (const { key, thread } of comments) {
			if (policyIds.has(`miro-comment:${key}`) && (thread.locked === true || optionalMap(decorations[key]).locked === true)) refuse("locked", `Comment ${key} is locked.`);
			if (changedComments.has(key)) commentChanged(key, thread);
			if (own(places, key) || thread.anchor === undefined) continue;
			const place = clone(thread.anchor);
			if (!complement(place)) continue;
			commentChanged(key, thread);
			set(places, key, place);
			ensureMetadata().commentPlaces = places;
		}
		for (const [id, raw] of Object.entries(optionalMap(board.metadata.freeAnchors))) {
			// Legacy coordinate-only free points contain no route reference.
			if (record(raw) && raw.type === undefined) continue;
			if (complement(raw)) {
				changedFreeAnchors.add(id);
				policyIds.add(id);
			}
		}
		for (const id of changedLines) policyIds.add(id);
		const decision = decideInteraction(policy, { operation: "reconnect", elementIds: [...policyIds] });
		if (!decision.allowed) refuse(decision.reason === "review-mode" ? "review-mode" : decision.reason === "element-locked" ? "locked" : "invalid-metadata", "Flip was refused by the board's interaction policy.");
		if (options.editAllowed !== undefined && !options.editAllowed([...policyIds])) refuse("locked", "Flip was refused by the host's edit policy.");
		const nextMetadata = parseMiroCanvasMetadata(board.document);
		if (nextMetadata.status === "invalid" || nextMetadata.status === "unsupported") refuse("invalid-metadata", "The planned metadata is invalid.");
		const afterGeometry = buildCanvasAnchorGeometry(board.document);
		for (const id of board.lines.keys()) {
			const before = beforeGeometry.edges?.[id];
			const after = afterGeometry.edges?.[id];
			if (before === undefined && !changedLines.has(id)) continue;
			if (before === undefined || after === undefined) refuse("unresolved-geometry", `Line ${id} cannot be resolved after Flip.`);
			if (!samePoint(before.start, selected.has(id) ? after.end : after.start) || !samePoint(before.end, selected.has(id) ? after.start : after.end)) refuse("geometry-changed", `Flip would move line ${id}'s attachment.`);
		}
		for (const checked of checkedAnchors) {
			if (!samePoint(resolveAnchor(checked.before, beforeGeometry).point, resolveAnchor(checked.after, afterGeometry).point)) refuse("geometry-changed", "Flip would move an edge anchor's absolute position.");
		}
		return { ok: true, document: board.document, flippedLineIds: [...selected], changedLineIds: [...changedLines], changedCommentKeys: [...changedComments], changedFreeAnchorIds: [...changedFreeAnchors], diagnostics: [] };
	} catch (error) {
		return failure(error);
	}
}

/**
 * Direction is endpoint incidence, independent of arrowheads. 'outgoing' means
 * a line's from target is selected, 'incoming' means its to target is selected.
 * Native fallback nodes are ignored when an explicit anchor exists. Direct is
 * one hop. Transitive promotes found lines (never their other nodes) to targets;
 * it follows connector-to-connector chains with a visited set, so cycles end.
 * Selected lines are omitted from results. Stable order: native, then independent.
 * Read-only selection is allowed on locked/review boards and unresolved cycles.
 */
export function planConnectedBoardLineIds(input: unknown, selectionIds: readonly string[], direction: BoardLineDirection = "connected", traversal: BoardLineTraversal = "direct"): BoardLineIdsPlan {
	try {
		const board = index(input);
		const selected = selectedIds(selectionIds);
		if (!["connected", "incoming", "outgoing"].includes(direction) || !["direct", "transitive"].includes(traversal)) refuse("invalid-input", "Line direction or traversal is invalid.");
		for (const id of selected) if (!board.nodes.has(id) && !board.lines.has(id)) refuse("invalid-input", `Selected item ${id} is missing.`);
		const incident = new Map<string, string[]>();
		for (const [id, ends] of board.lines) {
			const targets = direction === "incoming" ? [ends.to] : direction === "outgoing" ? [ends.from] : [ends.from, ends.to];
			for (const end of targets) {
				const heldBy = target(end);
				if (heldBy === undefined) continue;
				const ids = incident.get(heldBy) ?? [];
				ids.push(id);
				incident.set(heldBy, ids);
			}
		}
		const found = new Set<string>();
		const visited = new Set(selected);
		const queue = [...selected];
		for (let index = 0; index < queue.length; index += 1) {
			for (const id of incident.get(queue[index]) ?? []) {
				if (!selected.has(id)) found.add(id);
				if (traversal === "transitive" && !visited.has(id)) {
					visited.add(id);
					queue.push(id);
				}
			}
		}
		return { ok: true, lineIds: [...board.lines.keys()].filter((id) => found.has(id)), diagnostics: [] };
	} catch (error) {
		return failure(error);
	}
}
