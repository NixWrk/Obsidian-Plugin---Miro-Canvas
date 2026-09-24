/**
 * What native Canvas does to nodes and edges as it stores them.
 *
 * A save rebuilds the document from Canvas's own model, so a file written by
 * another tool - the converter, a hand edit - comes back in Canvas's own
 * habits: an edge end left at its default is left out, an empty colour or
 * label is left out, and node geometry is rounded to whole pixels.  A check
 * that a save kept the board must accept exactly these, or every write to a
 * converted board is refused until Canvas has saved it once by itself.
 */

export type GraphKind = "nodes" | "edges";

/**
 * Values native Canvas stores as "not set" and so leaves out of getData():
 * an edge has no start cap and an arrow at its end unless told otherwise,
 * and a colour or a label only when one is set.
 */
export const NATIVE_OMITTED_DEFAULTS: Readonly<Record<GraphKind, Readonly<Record<string, unknown>>>> = Object.freeze({
	nodes: Object.freeze({ color: "" }),
	edges: Object.freeze({ fromEnd: "none", toEnd: "arrow", color: "", label: "" }),
});

/** Native Canvas rounds node geometry to whole pixels as it stores it. */
const NATIVE_ROUNDED_GEOMETRY: ReadonlySet<string> = new Set(["x", "y", "width", "height"]);

/** Whether native Canvas leaves this written field out because it holds the default. */
export function nativeOmits(kind: GraphKind, field: string, written: unknown): boolean {
	const omitted = NATIVE_OMITTED_DEFAULTS[kind];
	return Object.prototype.hasOwnProperty.call(omitted, field) && omitted[field] === written;
}

/** Whether the stored value is the written node geometry rounded, as native Canvas stores it. */
export function nativeRounds(kind: GraphKind, field: string, written: unknown, stored: unknown): boolean {
	return kind === "nodes"
		&& NATIVE_ROUNDED_GEOMETRY.has(field)
		&& typeof written === "number"
		&& Number.isFinite(written)
		&& stored === Math.round(written);
}

/** Fields native Canvas may add to an item when it stores it: an empty colour, label or end, and the like. */
const NATIVE_NODE_DEFAULTS: ReadonlySet<string> = new Set(["color", "subpath"]);
const NATIVE_EDGE_DEFAULTS: ReadonlySet<string> = new Set(["color", "label", "fromEnd", "toEnd", "fromFloating", "toFloating", "styleAttributes"]);

/** Whether native Canvas may have added this field, with this value, to an item it stored. */
export function nativeDefaultAllowed(kind: GraphKind, field: string, value: unknown): boolean {
	if (kind === "nodes") return NATIVE_NODE_DEFAULTS.has(field) && (typeof value === "string" || value === null);
	if (!NATIVE_EDGE_DEFAULTS.has(field)) return false;
	if (field === "fromFloating" || field === "toFloating") return typeof value === "boolean";
	if (field === "styleAttributes") return isRecord(value) && Object.keys(value).length === 0;
	return typeof value === "string" || value === null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(target: object, key: string): boolean {
	return Object.prototype.hasOwnProperty.call(target, key);
}

function equalJson(left: unknown, right: unknown): boolean {
	if (Object.is(left, right)) return true;
	if (Array.isArray(left) || Array.isArray(right)) {
		return Array.isArray(left) && Array.isArray(right) && left.length === right.length
			&& left.every((item, index) => equalJson(item, right[index]));
	}
	if (!isRecord(left) || !isRecord(right)) return false;
	const keys = Object.keys(left);
	return keys.length === Object.keys(right).length
		&& keys.every((key) => hasOwn(right, key) && equalJson(left[key], right[key]));
}

/**
 * What native Canvas changed in the graph while storing it, named precisely,
 * or undefined when it kept the graph that was written.
 *
 * Items are matched by id, not by position: Canvas stores its items in its
 * own stacking order, which after opening a board need not be the file's, so
 * comparing by index read a reordered save as every item changing and
 * refused - and rolled back - writes that were fine.  Beyond that, an item
 * may only lose a field Canvas leaves out as its default, round its
 * geometry, or gain a field Canvas adds as a default.
 */
export function graphDrift(stored: Record<string, unknown>, written: Record<string, unknown>): string | undefined {
	for (const kind of ["nodes", "edges"] as const) {
		const actual = stored[kind];
		const wanted = written[kind];
		if (!Array.isArray(actual) || !Array.isArray(wanted)) return `${kind} missing`;
		if (actual.length !== wanted.length) return `${kind} count ${wanted.length}->${actual.length}`;
		const byId = new Map<string, Record<string, unknown>>();
		for (const item of actual) {
			if (isRecord(item) && typeof item.id === "string") byId.set(item.id, item);
		}
		for (let index = 0; index < wanted.length; index += 1) {
			const wantedItem: unknown = wanted[index];
			if (!isRecord(wantedItem)) return `${kind}[${index}] not an object`;
			const id = typeof wantedItem.id === "string" ? wantedItem.id : undefined;
			if (id === undefined) return `${kind}[${index}] has no id`;
			const actualItem = byId.get(id);
			if (actualItem === undefined) return `${kind} ${id} missing after save`;
			for (const field of Object.keys(wantedItem)) {
				if (!hasOwn(actualItem, field)) {
					// Native Canvas leaves a default out: that is keeping it.
					if (nativeOmits(kind, field, wantedItem[field])) continue;
					return `${kind} ${id} lost ${field}`;
				}
				if (equalJson(actualItem[field], wantedItem[field])) continue;
				if (nativeRounds(kind, field, wantedItem[field], actualItem[field])) continue;
				return `${kind} ${id} changed ${field}`;
			}
			for (const field of Object.keys(actualItem)) {
				if (hasOwn(wantedItem, field)) continue;
				if (!nativeDefaultAllowed(kind, field, actualItem[field])) return `${kind} ${id} gained ${field}`;
			}
		}
	}
	return undefined;
}
