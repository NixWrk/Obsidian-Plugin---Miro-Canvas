import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { hasUnsafeIntegers, readBoardFile, revisionOf } from "../src/board-file";
import { ToolError, Vault } from "../src/vault";
import { makeFixtureVault, makeVault, removeVaults } from "./helpers";

afterEach(removeVaults);

function refusal(action: () => unknown): string | undefined {
	try {
		action();
	} catch (error) {
		if (error instanceof ToolError) return error.code;
		throw error;
	}
	return undefined;
}

describe("readBoardFile", () => {
	it("gives the SHA-256 of the raw bytes as the revision, the same on every read", () => {
		const root = makeFixtureVault();
		const vault = Vault.open(root);
		const raw = readFileSync(path.join(root, "boards", "plugin-authored-board.canvas"));
		const first = readBoardFile(vault, "boards/plugin-authored-board.canvas");
		const second = readBoardFile(vault, "boards/plugin-authored-board.canvas");
		expect(first.revision).toBe(createHash("sha256").update(raw).digest("hex"));
		expect(second.revision).toBe(first.revision);
		expect(first.bytes).toBe(raw.byteLength);
		expect(first.path).toBe("boards/plugin-authored-board.canvas");
		expect(first.document.miroSource).toBeDefined();
	});

	it("changes the revision when any byte changes, even only whitespace", () => {
		const root = makeVault();
		const file = path.join(root, "board.canvas");
		writeFileSync(file, "{\"nodes\":[],\"edges\":[]}");
		const vault = Vault.open(root);
		const before = readBoardFile(vault, "board.canvas").revision;
		writeFileSync(file, "{\"nodes\":[], \"edges\":[]}");
		expect(readBoardFile(vault, "board.canvas").revision).not.toBe(before);
	});

	it("reads a board that begins with a byte order mark, and says so", () => {
		const root = makeVault();
		const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("{\"nodes\":[],\"edges\":[]}")]);
		writeFileSync(path.join(root, "bom.canvas"), bytes);
		const board = readBoardFile(Vault.open(root), "bom.canvas");
		expect(board.hasBom).toBe(true);
		expect(board.document).toEqual({ nodes: [], edges: [] });
		expect(board.revision).toBe(revisionOf(bytes));
	});

	it("refuses a file that is not JSON, or JSON that is not an object", () => {
		const root = makeVault();
		writeFileSync(path.join(root, "broken.canvas"), "{\"nodes\":");
		writeFileSync(path.join(root, "list.canvas"), "[]");
		const vault = Vault.open(root);
		expect(refusal(() => readBoardFile(vault, "broken.canvas"))).toBe("not-json");
		expect(refusal(() => readBoardFile(vault, "list.canvas"))).toBe("not-a-board");
		expect(refusal(() => readBoardFile(vault, "missing.canvas"))).toBe("not-found");
	});

	it("reads without leaving anything behind in the folder", () => {
		const root = makeFixtureVault();
		const before = readdirSync(path.join(root, "boards")).sort();
		readBoardFile(Vault.open(root), "boards/converter-board.canvas");
		expect(readdirSync(path.join(root, "boards")).sort()).toEqual(before);
	});
});

describe("hasUnsafeIntegers", () => {
	it("finds a whole number JavaScript would round, outside strings only", () => {
		expect(hasUnsafeIntegers("{\"id\":3458764513820540928}")).toBe(true);
		expect(hasUnsafeIntegers("{\"id\":-3458764513820540928}")).toBe(true);
		expect(hasUnsafeIntegers("{\"id\":9007199254740991}")).toBe(false);
		expect(hasUnsafeIntegers("{\"id\":\"3458764513820540928\"}")).toBe(false);
		expect(hasUnsafeIntegers("{\"x\":1.5e300,\"y\":12345678901234567890.5}")).toBe(false);
		expect(hasUnsafeIntegers("{\"text\":\"a \\\" 3458764513820540928\"}")).toBe(false);
	});
});
