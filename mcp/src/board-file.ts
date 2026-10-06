/**
 * A board as it lies on disk: its bytes, its revision and its JSON.
 *
 * The revision is the SHA-256 of the file's raw bytes.  An agent reads it
 * with the board and hands it back with a change; any save in between -
 * Obsidian's, a sync tool's, another agent's - changes the bytes and so the
 * revision, and the change is refused instead of writing over it.
 *
 * An edit works on a copy of the board in memory, through the same
 * runtime and store the plugin's own writers use inside Obsidian: a
 * FileCanvasRuntime stands in for the Canvas view, a FileMetadataStore for
 * the store of the plugin's record.  Every save they are asked for first
 * reads the file again and compares its revision; the file itself is
 * written once, at the end of the call, through a temporary file in the same
 * folder renamed over the board.
 */

import { createHash, randomBytes } from "node:crypto";
import { closeSync, existsSync, fsyncSync, lstatSync, openSync, readFileSync, renameSync, unlinkSync, writeSync } from "node:fs";
import path from "node:path";

import type { MetadataDocumentStore } from "../../src/metadata-writer";
import { ToolError, type Vault } from "./vault";

/** Larger boards are refused: reading one whole would stall the agent and the server. */
export const MAX_BOARD_BYTES = 64 * 1024 * 1024;

const UTF8_BOM = "﻿";

export interface BoardFile {
	/** Relative to the vault, with forward slashes. */
	readonly path: string;
	readonly absolutePath: string;
	readonly bytes: number;
	readonly mtimeMs: number;
	/** SHA-256 of the raw bytes, as lowercase hex. */
	readonly revision: string;
	/** The file began with a UTF-8 byte order mark; a write keeps it. */
	readonly hasBom: boolean;
	/** The text without the byte order mark. */
	readonly text: string;
	readonly document: Record<string, unknown>;
	/**
	 * The text holds a whole number too large for JavaScript to keep exactly;
	 * writing the board back would round it, so edits must be refused.
	 */
	readonly hasUnsafeIntegers: boolean;
}

/** The revision of some bytes: SHA-256 as lowercase hex. */
export function revisionOf(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Whether JSON text holds a whole number beyond 2^53 outside its strings.
 * JSON.parse would round it, and so would every write that follows.
 */
export function hasUnsafeIntegers(text: string): boolean {
	const numberPattern = /"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
	for (const match of text.matchAll(numberPattern)) {
		const token = match[0];
		if (token.startsWith("\"")) continue;
		if (/[.eE]/.test(token)) continue;
		const digits = token.replace(/^-/, "").replace(/^0+(?=\d)/, "");
		if (digits.length > 16 || (digits.length === 16 && !Number.isSafeInteger(Number(token)))) return true;
	}
	return false;
}

/** Parse a board's text; anything but a JSON object is refused. */
export function parseBoardText(text: string): Record<string, unknown> {
	let document: unknown;
	try {
		document = JSON.parse(text);
	} catch (error) {
		const detail = error instanceof Error ? error.message : "unreadable JSON";
		throw new ToolError("not-json", `The board is not valid JSON: ${detail}`);
	}
	if (document === null || typeof document !== "object" || Array.isArray(document)) {
		throw new ToolError("not-a-board", "The board's JSON is not an object.");
	}
	return document as Record<string, unknown>;
}

/** Read a board the agent named, with its revision. */
export function readBoardFile(vault: Vault, relative: unknown): BoardFile {
	const absolutePath = vault.resolveExisting(relative, "board");
	const stats = lstatSync(absolutePath);
	if (stats.size > MAX_BOARD_BYTES) {
		throw new ToolError("too-large", `The board is larger than ${MAX_BOARD_BYTES / 1024 / 1024} MB.`);
	}
	const raw = readFileSync(absolutePath);
	// The file may have changed between the size check and the read.
	if (raw.byteLength > MAX_BOARD_BYTES) {
		throw new ToolError("too-large", `The board is larger than ${MAX_BOARD_BYTES / 1024 / 1024} MB.`);
	}
	const decoded = raw.toString("utf8");
	const hasBom = decoded.startsWith(UTF8_BOM);
	const text = hasBom ? decoded.slice(UTF8_BOM.length) : decoded;
	return {
		path: vault.relativePath(absolutePath),
		absolutePath,
		bytes: raw.byteLength,
		mtimeMs: stats.mtimeMs,
		revision: revisionOf(raw),
		hasBom,
		text,
		document: parseBoardText(text),
		hasUnsafeIntegers: hasUnsafeIntegers(text),
	};
}

/** Whether two JSON values are the same, whatever the order of their keys. */
export function sameJson(left: unknown, right: unknown): boolean {
	if (Object.is(left, right)) return true;
	if (left === null || right === null || typeof left !== "object" || typeof right !== "object") return false;
	if (Array.isArray(left) !== Array.isArray(right)) return false;
	if (Array.isArray(left) && Array.isArray(right)) {
		if (left.length !== right.length) return false;
		return left.every((value, index) => sameJson(value, right[index]));
	}
	const leftRecord = left as Record<string, unknown>;
	const rightRecord = right as Record<string, unknown>;
	const leftKeys = Object.keys(leftRecord);
	if (leftKeys.length !== Object.keys(rightRecord).length) return false;
	return leftKeys.every((key) => Object.prototype.hasOwnProperty.call(rightRecord, key) && sameJson(leftRecord[key], rightRecord[key]));
}

/** Refused because the file changed since the agent read it, or since this call did. */
export const STALE_BOARD = "stale-board";

/** What the file holds now: its revision, or undefined when it is gone or unreadable. */
function revisionOnDisk(absolutePath: string): string | undefined {
	try {
		return revisionOf(readFileSync(absolutePath));
	} catch {
		return undefined;
	}
}

/** The bytes a board is written as: tab-indented JSON, as Obsidian writes it, with the byte order mark it had. */
export function serializeBoard(document: Readonly<Record<string, unknown>>, withBom: boolean): Buffer {
	const text = JSON.stringify(document, null, "\t");
	return Buffer.from(`${withBom ? UTF8_BOM : ""}${text}`, "utf8");
}

export interface BoardEditOptions {
	/** Work the change out and check it, but leave the file as it is. */
	readonly dryRun?: boolean;
	/** Called just before the file is written; tests change the board here to see a save refused. */
	readonly beforeWrite?: (absolutePath: string) => void;
}

/** What a finished edit left on disk. */
export interface BoardWriteResult {
	/** Whether the file was written. */
	readonly written: boolean;
	/** The revision of the file as it is now (or would be, after a dry run). */
	readonly revision: string;
	readonly bytes: number;
}

/**
 * One tool call's work on one board.  It holds two documents: the working
 * one, which the Canvas runtime imports into and reads from, and the saved
 * one, which every accepted save moves forward.  Only the saved document is
 * ever written to the file, and only once, by `write`.
 */
export class BoardEdit {
	public readonly vault: Vault;
	public readonly file: BoardFile;
	private readonly options: BoardEditOptions;
	private working: Record<string, unknown>;
	private saved: Record<string, unknown>;
	private stale = false;

	public constructor(vault: Vault, file: BoardFile, options: BoardEditOptions = {}) {
		this.vault = vault;
		this.file = file;
		this.options = options;
		this.working = structuredClone(file.document);
		this.saved = structuredClone(file.document);
	}

	/** Whether a save was refused because the file changed under this call. */
	public get staleDetected(): boolean {
		return this.stale;
	}

	/** The board as the last accepted save left it. */
	public get savedDocument(): Record<string, unknown> {
		return this.saved;
	}

	/** Whether the saves so far changed the board. */
	public get changed(): boolean {
		return !sameJson(this.saved, this.file.document);
	}

	public readWorking(): Record<string, unknown> {
		return structuredClone(this.working);
	}

	public importWorking(document: Record<string, unknown>): void {
		this.working = structuredClone(document);
	}

	/**
	 * Accept a save when the file still holds the bytes this call read.  The
	 * file itself is not written here.
	 */
	public save(document: Record<string, unknown>): boolean {
		if (revisionOnDisk(this.file.absolutePath) !== this.file.revision) {
			this.stale = true;
			return false;
		}
		this.saved = structuredClone(document);
		this.working = structuredClone(document);
		return true;
	}

	/**
	 * Write the saved board over the file: a temporary file in the same folder,
	 * flushed to disk, renamed over the board.  The file's revision is checked
	 * once more just before the rename; a save that lands between that check
	 * and the rename itself cannot be seen - a window of a few milliseconds.
	 */
	public write(): BoardWriteResult {
		if (!this.changed) {
			return { written: false, revision: this.file.revision, bytes: this.file.bytes };
		}
		return this.replaceFile(serializeBoard(this.saved, this.file.hasBom));
	}

	/**
	 * Put exact bytes back over the board - an undo gives back the file as it
	 * was, byte for byte - with the same checks and the same atomic write.
	 */
	public writeBytes(bytes: Buffer): BoardWriteResult {
		return this.replaceFile(bytes);
	}

	private replaceFile(bytes: Buffer): BoardWriteResult {
		const revision = revisionOf(bytes);
		if (this.options.dryRun === true) {
			this.refuseIfChanged(this.file.absolutePath);
			return { written: false, revision, bytes: bytes.byteLength };
		}
		// The path is checked again: a folder on the way may have become a link since the read.
		const target = this.vault.resolveExisting(this.file.path, "board");
		const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${process.pid}.${randomBytes(6).toString("hex")}.mcp-tmp`);
		try {
			const descriptor = openSync(temporary, "wx");
			try {
				writeSync(descriptor, bytes);
				fsyncSync(descriptor);
			} finally {
				closeSync(descriptor);
			}
			this.options.beforeWrite?.(target);
			this.refuseIfChanged(target);
			renameSync(temporary, target);
		} catch (error) {
			removeQuietly(temporary);
			if (error instanceof ToolError) throw error;
			const detail = error instanceof Error ? error.message : String(error);
			throw new ToolError("write-failed", `The board could not be written: ${detail}`);
		}
		return { written: true, revision, bytes: bytes.byteLength };
	}

	private refuseIfChanged(target: string): void {
		if (revisionOnDisk(target) === this.file.revision) return;
		this.stale = true;
		throw new ToolError(STALE_BOARD, "The board changed on disk since it was read; nothing was written. Read it again and redo the change.");
	}
}

function removeQuietly(file: string): void {
	try {
		if (existsSync(file)) unlinkSync(file);
	} catch {
		// Nothing more can be done; the name starts with a dot, so Obsidian ignores it.
	}
}

/**
 * The Canvas view as CanvasAuthoring expects it, over a board file:
 * getData and importData work on the copy in memory, requestSave is the save
 * that checks the file.  CanvasAuthoring's own guards - locks, miroSource,
 * verification, rollback - run exactly as they do inside Obsidian.
 */
export class FileCanvasRuntime {
	public readonly readonly = false;
	private readonly edit: BoardEdit;

	public constructor(edit: BoardEdit) {
		this.edit = edit;
	}

	public getData(): Record<string, unknown> {
		return this.edit.readWorking();
	}

	public importData(document: Record<string, unknown>, _clear?: boolean): void {
		this.edit.importWorking(document);
	}

	public requestSave(_immediate?: boolean): boolean {
		return this.edit.save(this.edit.readWorking());
	}
}

/**
 * The store MetadataWriter writes the plugin's record through: a save is
 * accepted only when the board is still the one the writer read, in memory
 * and on disk.
 */
export class FileMetadataStore implements MetadataDocumentStore {
	private readonly edit: BoardEdit;
	private failure: string | undefined;

	public constructor(edit: BoardEdit) {
		this.edit = edit;
	}

	public readDocument(): unknown {
		return structuredClone(this.edit.savedDocument);
	}

	public commitDocument(nextDocument: Readonly<Record<string, unknown>>, expectedDocument: Readonly<Record<string, unknown>>): boolean {
		if (!sameJson(this.edit.savedDocument, expectedDocument)) {
			this.failure = "the board changed during the call";
			return false;
		}
		if (!this.edit.save(structuredClone(nextDocument))) {
			this.failure = STALE_BOARD;
			return false;
		}
		this.failure = undefined;
		return true;
	}

	public describeLastCommitFailure(): string | undefined {
		return this.failure;
	}
}
