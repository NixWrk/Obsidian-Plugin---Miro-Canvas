import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { BoardEdit, FileCanvasRuntime, FileMetadataStore, hasUnsafeIntegers, readBoardFile, revisionOf } from "../src/board-file";
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

describe("editing a board file", () => {
	it("accepts a save from the Canvas runtime while the file is unchanged, and writes once", () => {
		const root = makeFixtureVault();
		const vault = Vault.open(root);
		const file = readBoardFile(vault, "boards/native-board.canvas");
		const edit = new BoardEdit(vault, file);
		const runtime = new FileCanvasRuntime(edit);
		const next = { ...runtime.getData(), nodes: [] };
		runtime.importData(next, true);
		expect(runtime.requestSave(true)).toBe(true);
		expect(readBoardFile(vault, "boards/native-board.canvas").revision).toBe(file.revision);
		const written = edit.write();
		expect(written.written).toBe(true);
		expect(readFileSync(path.join(root, "boards", "native-board.canvas"), "utf8")).toBe(JSON.stringify(next, null, "\t"));
		expect(written.revision).toBe(readBoardFile(vault, "boards/native-board.canvas").revision);
	});

	it("refuses a runtime save and a metadata commit once the file changed", () => {
		const root = makeFixtureVault();
		const vault = Vault.open(root);
		const file = readBoardFile(vault, "boards/native-board.canvas");
		const edit = new BoardEdit(vault, file);
		const runtime = new FileCanvasRuntime(edit);
		const store = new FileMetadataStore(edit);
		writeFileSync(path.join(root, "boards", "native-board.canvas"), "{\"nodes\":[],\"edges\":[]}");
		runtime.importData({ nodes: [], edges: [] }, true);
		expect(runtime.requestSave(true)).toBe(false);
		const current = store.readDocument() as Record<string, unknown>;
		expect(store.commitDocument({ ...current, miroCanvas: { schemaVersion: 1 } }, current)).toBe(false);
		expect(store.describeLastCommitFailure()).toBe("stale-board");
		expect(edit.staleDetected).toBe(true);
		expect(edit.changed).toBe(false);
	});

	it("refuses a metadata commit made against another document", () => {
		const root = makeFixtureVault();
		const vault = Vault.open(root);
		const store = new FileMetadataStore(new BoardEdit(vault, readBoardFile(vault, "boards/native-board.canvas")));
		expect(store.commitDocument({ nodes: [], edges: [] }, { nodes: [{ id: "other" }], edges: [] })).toBe(false);
	});

	it("leaves no temporary file when the write is refused", () => {
		const root = makeFixtureVault();
		const vault = Vault.open(root);
		const target = path.join(root, "boards", "native-board.canvas");
		const edit = new BoardEdit(vault, readBoardFile(vault, "boards/native-board.canvas"), {
			beforeWrite: () => writeFileSync(target, "{}"),
		});
		expect(edit.save({ nodes: [], edges: [] })).toBe(true);
		expect(refusal(() => edit.write())).toBe("stale-board");
		expect(readFileSync(target, "utf8")).toBe("{}");
		expect(readdirSync(path.join(root, "boards")).filter((name) => name.endsWith(".mcp-tmp"))).toEqual([]);
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
