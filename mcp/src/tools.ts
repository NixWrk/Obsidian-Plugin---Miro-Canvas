/**
 * The tools an agent calls: reading boards and checking them.
 *
 * Each tool takes JSON arguments checked against its input schema before it
 * runs, and answers with a JSON object that matches its output schema.  A
 * refusal - a path outside the vault, a file that is not a board - is a
 * ToolError, which the agent reads as a failed call with a code and a
 * sentence.
 */

import { readBoardFile, type BoardFile } from "./board-file";
import { boardStatus, fullBoard, listBoardItems, sourceSlice, summarizeBoard } from "./summary";
import { validateBoard } from "./validate";
import { ToolError, type Vault } from "./vault";

type JsonSchema = Record<string, unknown>;

export interface ToolDefinition {
	readonly name: string;
	readonly title: string;
	readonly description: string;
	readonly inputSchema: JsonSchema;
	readonly outputSchema: JsonSchema;
	readonly annotations?: Readonly<Record<string, unknown>>;
	/** Runs with arguments the input schema has accepted; a ToolError is a refusal. */
	readonly run: (args: Record<string, unknown>) => Record<string, unknown>;
	/**
	 * Whether an answer reports a refusal - an edit the board's rules or a
	 * newer save turned down - which the agent should see as a failed call
	 * while still reading why.
	 */
	readonly failed?: (result: Record<string, unknown>) => boolean;
}

export interface ToolContext {
	readonly vault: Vault;
}

const LIST_LIMIT_DEFAULT = 200;
const LIST_LIMIT_MAX = 1000;
const ITEM_LIMIT_DEFAULT = 500;
const ITEM_LIMIT_MAX = 2000;

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

export const boardPathSchema = {
	type: "string",
	minLength: 1,
	description: "The board's path inside the vault, with forward slashes, ending in .canvas.",
};

/** Warnings every read of a board may carry. */
export function readWarnings(file: BoardFile): { code: string; message: string }[] {
	const warnings: { code: string; message: string }[] = [];
	if (file.hasUnsafeIntegers) {
		warnings.push({
			code: "unsafe-integers",
			message: "The board holds whole numbers beyond 2^53; they are shown rounded, and edits to this board will be refused.",
		});
	}
	return warnings;
}

function listBoardsTool(context: ToolContext): ToolDefinition {
	return {
		name: "list_boards",
		title: "List boards",
		description: "List the .canvas boards in the vault (or one folder of it), sorted by path, with each board's size, "
			+ "time of last change, whether it holds a Miro import (miroSource) and the state of the plugin's record (miroCanvas: "
			+ "absent, valid, invalid or unsupported). Hidden folders and links are skipped. Page with cursor.",
		inputSchema: {
			type: "object",
			properties: {
				folder: { type: "string", description: "A folder inside the vault; the whole vault when absent." },
				cursor: { type: "string", description: "nextCursor from the previous page." },
				limit: { type: "integer", minimum: 1, maximum: LIST_LIMIT_MAX, default: LIST_LIMIT_DEFAULT },
			},
			additionalProperties: false,
		},
		outputSchema: {
			type: "object",
			properties: {
				boards: {
					type: "array",
					items: {
						type: "object",
						properties: {
							path: { type: "string" },
							bytes: { type: "integer" },
							mtime: { type: "string" },
							hasMiroSource: { type: ["boolean", "null"] },
							miroCanvasStatus: { type: "string" },
						},
						required: ["path", "bytes", "mtime", "hasMiroSource", "miroCanvasStatus"],
					},
				},
				nextCursor: { type: "string" },
			},
			required: ["boards"],
		},
		annotations: READ_ONLY,
		run: (args) => {
			const limit = typeof args.limit === "number" ? args.limit : LIST_LIMIT_DEFAULT;
			let start = 0;
			if (typeof args.cursor === "string") {
				if (!/^(?:0|[1-9]\d{0,8})$/.test(args.cursor)) throw new ToolError("cursor-invalid", "The cursor is not one this server gave.");
				start = Number(args.cursor);
			}
			const all = context.vault.listBoards(typeof args.folder === "string" ? args.folder : undefined);
			const page = all.slice(start, start + limit);
			const boards = page.map((entry) => {
				let status: { hasMiroSource: boolean | null; miroCanvasStatus: string };
				try {
					status = boardStatus(readBoardFile(context.vault, entry.path).document);
				} catch (error) {
					status = { hasMiroSource: null, miroCanvasStatus: error instanceof ToolError ? `unreadable: ${error.code}` : "unreadable" };
				}
				return { path: entry.path, bytes: entry.bytes, mtime: new Date(entry.mtimeMs).toISOString(), ...status };
			});
			const next = start + page.length;
			return { boards, ...(next < all.length ? { nextCursor: String(next) } : {}) };
		},
	};
}

function readBoardTool(context: ToolContext): ToolDefinition {
	return {
		name: "read_board",
		title: "Read a board",
		description: "Read one board. level \"summary\" (default): counts of cards by kind, frames, extent, locks, comments, export pages, "
			+ "the plugin record's state. level \"items\": cards (id, kind, text cut to 500 characters, rect, rotation, locked, frameId, "
			+ "layerIndex), then native edges, then the board's own connectors, in pages (offset, limit); ids keeps only those named. "
			+ "level \"full\": the board's JSON without miroSource. sourcePointer (a JSON Pointer such as \"/items/0\") returns that piece "
			+ "of miroSource instead. Every answer carries the board's revision, which edits will ask for.",
		inputSchema: {
			type: "object",
			properties: {
				path: boardPathSchema,
				level: { enum: ["summary", "items", "full"], default: "summary" },
				ids: { type: "array", items: { type: "string", minLength: 1 }, maxItems: ITEM_LIMIT_MAX },
				offset: { type: "integer", minimum: 0, default: 0 },
				limit: { type: "integer", minimum: 1, maximum: ITEM_LIMIT_MAX, default: ITEM_LIMIT_DEFAULT },
				sourcePointer: { type: "string", description: "A JSON Pointer into miroSource; \"\" is all of it." },
			},
			required: ["path"],
			additionalProperties: false,
		},
		outputSchema: {
			type: "object",
			properties: {
				path: { type: "string" },
				revision: { type: "string" },
				bytes: { type: "integer" },
				level: { enum: ["summary", "items", "full", "source"] },
				summary: { type: "object" },
				items: { type: "object" },
				document: { type: "object" },
				source: { type: "object" },
				warnings: { type: "array", items: { type: "object" } },
			},
			required: ["path", "revision", "bytes", "level", "warnings"],
		},
		annotations: READ_ONLY,
		run: (args) => {
			const file = readBoardFile(context.vault, args.path);
			const head = { path: file.path, revision: file.revision, bytes: file.bytes };
			const warnings = readWarnings(file);
			if (typeof args.sourcePointer === "string") {
				return { ...head, level: "source", source: sourceSlice(file.document, args.sourcePointer), warnings };
			}
			const level = typeof args.level === "string" ? args.level : "summary";
			if (level === "items") {
				const items = listBoardItems(file.document, {
					...(Array.isArray(args.ids) ? { ids: args.ids as string[] } : {}),
					offset: typeof args.offset === "number" ? args.offset : 0,
					limit: typeof args.limit === "number" ? args.limit : ITEM_LIMIT_DEFAULT,
				});
				return { ...head, level, items, warnings };
			}
			if (level === "full") {
				return { ...head, level, document: fullBoard(file.document), warnings };
			}
			return { ...head, level: "summary", summary: summarizeBoard(file.document), warnings };
		},
	};
}

function validateBoardTool(context: ToolContext): ToolDefinition {
	const problem = {
		type: "object",
		properties: { pointer: { type: "string" }, message: { type: "string" } },
	};
	return {
		name: "validate_board",
		title: "Check a board",
		description: "Check one board against the board schema miro2obsidian publishes (board, miroSource, miroCanvas; draft 2020-12) "
			+ "and against the plugin's own reading: its metadata reader, ids used once across cards, lines and connectors, whole-number "
			+ "geometry, connector ends and comment pins that land on the board, records about cards the board no longer has, lines "
			+ "still stored as cards. valid is true when there is no schema error and no plugin error; warnings do not count.",
		inputSchema: {
			type: "object",
			properties: { path: boardPathSchema },
			required: ["path"],
			additionalProperties: false,
		},
		outputSchema: {
			type: "object",
			properties: {
				path: { type: "string" },
				revision: { type: "string" },
				valid: { type: "boolean" },
				verdicts: {
					type: "object",
					properties: {
						board: { enum: ["valid", "invalid", "not_applicable"] },
						miroSource: { enum: ["valid", "invalid", "not_applicable"] },
						miroCanvas: { enum: ["valid", "invalid", "not_applicable"] },
					},
				},
				schema: { type: "array", items: { ...problem, properties: { ...problem.properties, schema: { type: "string" } } } },
				plugin: {
					type: "array",
					items: { ...problem, properties: { ...problem.properties, code: { type: "string" }, severity: { enum: ["error", "warning"] } } },
				},
				omitted: { type: "integer" },
				warnings: { type: "array", items: { type: "object" } },
			},
			required: ["path", "revision", "valid", "verdicts", "schema", "plugin", "omitted", "warnings"],
		},
		annotations: READ_ONLY,
		run: (args) => {
			const file = readBoardFile(context.vault, args.path);
			const validation = validateBoard(file.document);
			return { path: file.path, revision: file.revision, ...validation, warnings: readWarnings(file) };
		},
	};
}

/** The tools that only read. */
export function createReadTools(context: ToolContext): ToolDefinition[] {
	return [listBoardsTool(context), readBoardTool(context), validateBoardTool(context)];
}
