/**
 * Is this board one the plugin and the converter agree on?
 *
 * Two kinds of check.  The schema: miro2obsidian's JSON Schema, pinned in
 * schema/v1 and carried inside the server's bundle, over the whole board -
 * the board itself, its `miroSource` and its `miroCanvas`.  The plugin: what
 * the plugin's own reader says of `miroCanvas`, and what no schema can say -
 * ids used once across cards, lines and connectors, lines that end on
 * something, records about cards the board no longer has.
 */

import Ajv2020, { type ErrorObject, type ValidateFunction } from "ajv/dist/2020";

import boardSchema from "../../schema/v1/board.schema.json";
import miroCanvasSchema from "../../schema/v1/miro-canvas.schema.json";
import miroSourceSchema from "../../schema/v1/miro-source.schema.json";
import { resolveAnchors } from "../../src/anchors";
import { boardConnectors, migrateLineNodes } from "../../src/board-connectors";
import { readCanvasGraph } from "../../src/canvas-authoring";
import { buildCanvasAnchorGeometry } from "../../src/connector-endpoints";
import { parseMiroCanvasMetadata } from "../../src/metadata";

/** Which of the three schema files an error belongs to. */
export type SchemaName = "board" | "miro-source" | "miro-canvas";

export interface SchemaProblem {
	readonly schema: SchemaName;
	/** JSON Pointer into the board. */
	readonly pointer: string;
	readonly message: string;
}

export interface PluginProblem {
	readonly code: string;
	readonly severity: "error" | "warning";
	/** JSON Pointer into the board. */
	readonly pointer: string;
	readonly message: string;
}

/** Each schema's verdict; not_applicable when the board has no such key. */
export type SchemaVerdict = "valid" | "invalid" | "not_applicable";

export interface BoardValidation {
	/** No schema error and no plugin error; warnings do not count. */
	readonly valid: boolean;
	readonly verdicts: { readonly board: SchemaVerdict; readonly miroSource: SchemaVerdict; readonly miroCanvas: SchemaVerdict };
	readonly schema: readonly SchemaProblem[];
	readonly plugin: readonly PluginProblem[];
	/** Problems beyond the reported ones, left out to keep the answer readable. */
	readonly omitted: number;
}

/** At most this many problems of each kind are reported. */
const MAX_PROBLEMS = 200;

type UnknownRecord = Record<string, unknown>;

let compiledBoard: ValidateFunction | undefined;

/** The board schema, compiled once, with the other two resolved from the bundle, never fetched. */
function boardValidator(): ValidateFunction {
	if (compiledBoard !== undefined) return compiledBoard;
	const ajv = new Ajv2020({ strict: false, allErrors: true, logger: false });
	ajv.addSchema(miroSourceSchema);
	ajv.addSchema(miroCanvasSchema);
	compiledBoard = ajv.compile(boardSchema);
	return compiledBoard;
}

function isRecord(value: unknown): value is UnknownRecord {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(record: UnknownRecord, key: string): boolean {
	return Object.prototype.hasOwnProperty.call(record, key);
}

function escapePointer(name: string): string {
	return name.replace(/~/g, "~0").replace(/\//g, "~1");
}

function pointer(...names: readonly (string | number)[]): string {
	return names.map((name) => `/${escapePointer(String(name))}`).join("");
}

/**
 * The plugin's diagnostic paths ("miroCanvas.zOrder[2]") as JSON Pointers.
 * A key that itself holds a dot cannot be told apart; the pointer is then
 * as near as the path allows.
 */
function pointerFromDotted(dotted: string): string {
	if (dotted === "") return "";
	const names = dotted.replace(/\[(\d+)\]/g, ".$1").split(".").filter((name) => name !== "");
	return pointer(...names);
}

function schemaOf(instancePath: string): SchemaName {
	if (instancePath === "/miroSource" || instancePath.startsWith("/miroSource/")) return "miro-source";
	if (instancePath === "/miroCanvas" || instancePath.startsWith("/miroCanvas/")) return "miro-canvas";
	return "board";
}

function describeSchemaError(error: ErrorObject): string {
	const detail = Object.entries(error.params ?? {})
		.map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
		.join(", ");
	return detail === "" ? `${error.message ?? "is invalid"}` : `${error.message ?? "is invalid"} (${detail})`;
}

/** The schema's errors over the whole board, each filed under the schema file it came from. */
export function checkSchemas(document: unknown): { readonly problems: SchemaProblem[]; readonly verdicts: BoardValidation["verdicts"] } {
	const validator = boardValidator();
	const valid = validator(document);
	const errors = valid ? [] : validator.errors ?? [];
	const problems = errors.map((error): SchemaProblem => ({
		schema: schemaOf(error.instancePath),
		pointer: error.instancePath,
		message: describeSchemaError(error),
	}));
	const record = isRecord(document) ? document : {};
	const verdictFor = (key: string, schema: SchemaName): SchemaVerdict => {
		if (!hasOwn(record, key)) return "not_applicable";
		return problems.some((problem) => problem.schema === schema) ? "invalid" : "valid";
	};
	return {
		problems,
		verdicts: {
			board: problems.length === 0 ? "valid" : "invalid",
			miroSource: verdictFor("miroSource", "miro-source"),
			miroCanvas: verdictFor("miroCanvas", "miro-canvas"),
		},
	};
}

/** The plugin's own reading of the board: what it would refuse, and what it would quietly ignore. */
export function checkPlugin(document: UnknownRecord): PluginProblem[] {
	const problems: PluginProblem[] = [];
	const add = (code: string, severity: PluginProblem["severity"], at: string, message: string): void => {
		problems.push({ code, severity, pointer: at, message });
	};

	// The plugin's record, as the plugin reads it.
	const metadataRead = parseMiroCanvasMetadata(document);
	for (const diagnostic of metadataRead.diagnostics) {
		add(diagnostic.code, diagnostic.severity, pointerFromDotted(diagnostic.path), diagnostic.message);
	}

	// Cards and lines as every edit reads them: ids safe and used once.  A
	// board without nodes or edges is still a board; those are read as empty.
	const graphRead = readCanvasGraph({
		...document,
		nodes: hasOwn(document, "nodes") ? document.nodes : [],
		edges: hasOwn(document, "edges") ? document.edges : [],
	});
	if (!graphRead.ok) {
		add("graph-invalid", "error", "", graphRead.message);
		return problems;
	}
	const nodeIds = new Set<string>();
	for (const node of graphRead.nodes) nodeIds.add(node.id as string);
	const edgeIds = new Set<string>();
	for (const edge of graphRead.edges) edgeIds.add(edge.id as string);
	const connectors = boardConnectors(document);
	const connectorIds = new Set<string>();
	for (const connector of connectors) {
		if (nodeIds.has(connector.id) || edgeIds.has(connector.id)) {
			add("duplicate-id", "error", pointer("miroCanvas", "connectors", connector.id), `The connector id '${connector.id}' is also a card's or a line's.`);
		}
		connectorIds.add(connector.id);
	}

	// Whole numbers for places and sizes, as native Canvas writes them.
	graphRead.nodes.forEach((node, index) => {
		for (const key of ["x", "y", "width", "height"]) {
			const value = node[key];
			if (typeof value === "number" && !Number.isInteger(value)) {
				add("fractional-geometry", "warning", pointer("nodes", index, key), `Card '${String(node.id)}' has ${key} ${value}; Canvas writes whole numbers.`);
			}
		}
	});

	const metadata = isRecord(document.miroCanvas) ? document.miroCanvas : undefined;
	if (metadata !== undefined) {
		checkMetadataReferences(metadata, nodeIds, edgeIds, connectorIds, add);
		checkAnchors(document, metadata, add);
	}

	// Lines drawn by older versions as cards: the plugin offers to migrate them.
	const migration = migrateLineNodes(document);
	if (migration.migrated.length > 0) {
		add("old-line-nodes", "warning", "/nodes", `${migration.migrated.length} line(s) are still stored as cards; opening the board in the plugin offers to turn them into connectors.`);
	}
	return problems;
}

type AddProblem = (code: string, severity: PluginProblem["severity"], at: string, message: string) => void;

/** Records about cards and lines the board does not have: the layer order, overrides, bindings. */
function checkMetadataReferences(
	metadata: UnknownRecord,
	nodeIds: ReadonlySet<string>,
	edgeIds: ReadonlySet<string>,
	connectorIds: ReadonlySet<string>,
	add: AddProblem,
): void {
	// A repeated id in the layer order is the plugin reader's to report (duplicate-z-order-id).
	if (Array.isArray(metadata.zOrder)) {
		metadata.zOrder.forEach((id, index) => {
			if (typeof id === "string" && !nodeIds.has(id)) {
				add("zorder-orphan", "warning", pointer("miroCanvas", "zOrder", index), `The layer order names '${id}', which is not a card on the board.`);
			}
		});
	}
	if (isRecord(metadata.localOverrides)) {
		for (const id of Object.keys(metadata.localOverrides)) {
			if (!nodeIds.has(id) && !edgeIds.has(id) && !connectorIds.has(id)) {
				add("override-orphan", "warning", pointer("miroCanvas", "localOverrides", id), `There is a local override for '${id}', which is not on the board.`);
			}
		}
	}
	if (isRecord(metadata.bindings)) {
		for (const id of Object.keys(metadata.bindings)) {
			if (!nodeIds.has(id) && !edgeIds.has(id) && !connectorIds.has(id)) {
				add("binding-orphan", "warning", pointer("miroCanvas", "bindings", id), `There is a binding for '${id}', which is not a card or line on the board.`);
			}
		}
	}
}

/**
 * Every stored end and pin must land on the board: connector ends and native
 * edges' own anchors must, or the line cannot be drawn; a comment pin or a
 * free anchor that does not is only reported.
 */
function checkAnchors(document: UnknownRecord, metadata: UnknownRecord, add: AddProblem): void {
	const anchors: UnknownRecord = {};
	const severities = new Map<string, PluginProblem["severity"]>();
	const collect = (at: string, value: unknown, severity: PluginProblem["severity"]): void => {
		anchors[at] = value;
		severities.set(at, severity);
	};
	if (isRecord(metadata.connectors)) {
		for (const [id, connector] of Object.entries(metadata.connectors)) {
			if (!isRecord(connector)) continue;
			for (const end of ["from", "to"]) {
				if (hasOwn(connector, end)) collect(pointer("miroCanvas", "connectors", id, end), connector[end], "error");
			}
		}
	}
	if (isRecord(metadata.localOverrides)) {
		for (const [id, override] of Object.entries(metadata.localOverrides)) {
			if (!isRecord(override) || !isRecord(override.connectorAnchors)) continue;
			for (const end of ["from", "to"]) {
				const anchor = override.connectorAnchors[end];
				if (anchor !== undefined) collect(pointer("miroCanvas", "localOverrides", id, "connectorAnchors", end), anchor, "error");
			}
		}
	}
	if (isRecord(metadata.commentPlaces)) {
		for (const [key, place] of Object.entries(metadata.commentPlaces)) {
			collect(pointer("miroCanvas", "commentPlaces", key), place, "warning");
		}
	}
	if (Array.isArray(metadata.localComments)) {
		metadata.localComments.forEach((comment, index) => {
			if (isRecord(comment) && comment.anchor !== undefined) {
				collect(pointer("miroCanvas", "localComments", index, "anchor"), comment.anchor, "warning");
			}
		});
	}
	if (isRecord(metadata.freeAnchors)) {
		for (const [id, anchor] of Object.entries(metadata.freeAnchors)) {
			collect(pointer("miroCanvas", "freeAnchors", id), anchor, "warning");
		}
	}
	if (Object.keys(anchors).length === 0) return;
	const geometry = buildCanvasAnchorGeometry(document);
	const resolved = resolveAnchors(anchors, geometry);
	for (const [at, result] of Object.entries(resolved)) {
		if (result.valid) continue;
		const reason = result.diagnostics[0]?.message ?? "it does not resolve";
		add("anchor-unresolved", severities.get(at) ?? "warning", at, `This end or pin does not land on the board: ${reason}`);
	}
}

/** Both checks over one board. */
export function validateBoard(document: UnknownRecord): BoardValidation {
	const schemaCheck = checkSchemas(document);
	const plugin = checkPlugin(document);
	const valid = schemaCheck.problems.length === 0 && !plugin.some((problem) => problem.severity === "error");
	const omitted = Math.max(0, schemaCheck.problems.length - MAX_PROBLEMS) + Math.max(0, plugin.length - MAX_PROBLEMS);
	return {
		valid,
		verdicts: schemaCheck.verdicts,
		schema: schemaCheck.problems.slice(0, MAX_PROBLEMS),
		plugin: plugin.slice(0, MAX_PROBLEMS),
		omitted,
	};
}
