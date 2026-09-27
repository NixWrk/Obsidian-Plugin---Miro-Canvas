/**
 * A board as it lies on disk: its bytes, its revision and its JSON.
 *
 * The revision is the SHA-256 of the file's raw bytes.  An agent reads it
 * with the board and hands it back with a change; any save in between -
 * Obsidian's, a sync tool's, another agent's - changes the bytes and so the
 * revision, and the change is refused instead of writing over it.
 */

import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";

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
