import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createReadTools, type ToolDefinition } from "../src/tools";
import { ToolError, Vault } from "../src/vault";
import { makeFixtureVault, removeVaults } from "./helpers";

afterEach(removeVaults);

function tools(root: string): Map<string, ToolDefinition> {
	return new Map(createReadTools({ vault: Vault.open(root) }).map((tool) => [tool.name, tool]));
}

function call(root: string, name: string, args: Record<string, unknown>): Record<string, any> {
	return tools(root).get(name)!.run(args);
}

describe("list_boards", () => {
	it("lists the boards with what the plugin makes of each", () => {
		const root = makeFixtureVault();
		const result = call(root, "list_boards", {});
		expect(result.boards.map((board: any) => [board.path, board.hasMiroSource, board.miroCanvasStatus])).toEqual([
			["boards/converter-board.canvas", true, "absent"],
			["boards/future-fields-board.canvas", false, "valid"],
			["boards/native-board.canvas", false, "absent"],
			["boards/plugin-authored-board.canvas", true, "valid"],
		]);
		expect(result.nextCursor).toBeUndefined();
	});

	it("pages with a cursor", () => {
		const root = makeFixtureVault();
		const first = call(root, "list_boards", { limit: 3 });
		expect(first.boards).toHaveLength(3);
		const second = call(root, "list_boards", { limit: 3, cursor: first.nextCursor });
		expect(second.boards.map((board: any) => board.path)).toEqual(["boards/plugin-authored-board.canvas"]);
		expect(second.nextCursor).toBeUndefined();
	});

	it("still lists a board it cannot read, and says so", () => {
		const root = makeFixtureVault();
		writeFileSync(path.join(root, "boards", "broken.canvas"), "{");
		const broken = call(root, "list_boards", {}).boards.find((board: any) => board.path === "boards/broken.canvas");
		expect(broken).toMatchObject({ hasMiroSource: null, miroCanvasStatus: "unreadable: not-json" });
	});
});

describe("read_board", () => {
	it("sums the board up", () => {
		const root = makeFixtureVault();
		const result = call(root, "read_board", { path: "boards/plugin-authored-board.canvas" });
		expect(result.level).toBe("summary");
		expect(result.revision).toMatch(/^[0-9a-f]{64}$/);
		expect(result.summary.counts).toMatchObject({ nodes: 4, edges: 1, connectors: 1 });
		// card-1 shows a Miro sticky note, sticky-1 is one the plugin made.
		expect(result.summary.counts.byKind).toEqual({ sticky_note: 2, frame: 1, text: 1 });
		expect(result.summary.frames).toEqual([{ id: "frame-1", label: "Frame", rect: { x: 0, y: 220, width: 640, height: 400 } }]);
		expect(result.summary.bounds).toEqual({ x: 0, y: 0, width: 1340, height: 620 });
		expect(result.summary.comments).toMatchObject({ open: 1, replies: 1 });
		expect(result.summary.exportPages).toEqual([{ id: "page-1", name: "Page 1", rect: { x: 0, y: 0, width: 400, height: 300 } }]);
		expect(result.summary.metadata).toEqual({ status: "valid", errors: 0, warnings: 0 });
		expect(result.warnings).toEqual([]);
	});

	it("lists cards, then edges, then connectors, in pages", () => {
		const root = makeFixtureVault();
		const first = call(root, "read_board", { path: "boards/plugin-authored-board.canvas", level: "items", limit: 4 });
		expect(first.items.total).toBe(6);
		expect(first.items.nextOffset).toBe(4);
		expect(first.items.items.map((item: any) => item.id)).toEqual(["card-1", "sticky-1", "frame-1", "deck-slide-1"]);
		const sticky = first.items.items[1];
		expect(sticky).toMatchObject({ kind: "sticky_note", nodeType: "text", rotation: 12.5, locked: false, layerIndex: 1 });
		expect(sticky.frameId).toBeUndefined();
		const rest = call(root, "read_board", { path: "boards/plugin-authored-board.canvas", level: "items", offset: 4 });
		expect(rest.items.items.map((item: any) => [item.id, item.kind])).toEqual([["edge-1", "edge"], ["conn-1", "connector"]]);
		expect(rest.items.nextOffset).toBeUndefined();
	});

	it("keeps only the items named, and cuts long text", () => {
		const root = makeFixtureVault();
		const file = path.join(root, "boards", "native-board.canvas");
		const document = JSON.parse(readFileSync(file, "utf8"));
		document.nodes[0].text = "x".repeat(600);
		writeFileSync(file, JSON.stringify(document));
		const id = document.nodes[0].id;
		const result = call(root, "read_board", { path: "boards/native-board.canvas", level: "items", ids: [id] });
		expect(result.items.items).toHaveLength(1);
		expect(result.items.items[0].text).toHaveLength(500);
		expect(result.items.items[0].textTruncated).toBe(true);
	});

	it("finds the frame a card sits in and whether it is locked", () => {
		const root = makeFixtureVault();
		const file = path.join(root, "boards", "native-board.canvas");
		writeFileSync(file, JSON.stringify({
			nodes: [
				{ id: "outer", type: "group", x: 0, y: 0, width: 1000, height: 1000 },
				{ id: "inner", type: "group", x: 100, y: 100, width: 400, height: 400 },
				{ id: "card", type: "text", text: "in", x: 150, y: 150, width: 100, height: 100 },
			],
			edges: [],
			miroCanvas: { schemaVersion: 1, localOverrides: { card: { locked: true } } },
		}));
		const result = call(root, "read_board", { path: "boards/native-board.canvas", level: "items" });
		const byId = new Map(result.items.items.map((item: any) => [item.id, item]));
		expect(byId.get("card")).toMatchObject({ frameId: "inner", locked: true });
		expect(byId.get("inner")).toMatchObject({ kind: "frame", frameId: "outer", locked: false });
	});

	it("gives the whole board without the Miro import", () => {
		const root = makeFixtureVault();
		const result = call(root, "read_board", { path: "boards/plugin-authored-board.canvas", level: "full" });
		expect(result.document.miroSource).toBeUndefined();
		expect(result.document.miroCanvas.schemaVersion).toBe(1);
	});

	it("reads the Miro import piece by piece", () => {
		const root = makeFixtureVault();
		const result = call(root, "read_board", { path: "boards/plugin-authored-board.canvas", sourcePointer: "/items/0" });
		expect(result.source).toEqual({ pointer: "/items/0", value: { id: "miro-item-1", type: "sticky_note" } });
		expect(() => call(root, "read_board", { path: "boards/plugin-authored-board.canvas", sourcePointer: "/items/9" })).toThrow(ToolError);
		expect(() => call(root, "read_board", { path: "boards/native-board.canvas", sourcePointer: "" })).toThrow(ToolError);
	});

	it("warns of numbers too large to keep exactly", () => {
		const root = makeFixtureVault();
		writeFileSync(path.join(root, "boards", "big.canvas"), "{\"nodes\":[],\"edges\":[],\"miroSource\":{\"id\":3458764513820540928}}");
		const result = call(root, "read_board", { path: "boards/big.canvas" });
		expect(result.warnings.map((warning: any) => warning.code)).toEqual(["unsafe-integers"]);
	});
});

describe("validate_board", () => {
	it("checks a board in the vault and returns its revision", () => {
		const root = makeFixtureVault();
		const result = call(root, "validate_board", { path: "boards/plugin-authored-board.canvas" });
		expect(result).toMatchObject({ path: "boards/plugin-authored-board.canvas", valid: true, schema: [], omitted: 0 });
		expect(result.verdicts).toEqual({ board: "valid", miroSource: "valid", miroCanvas: "valid" });
	});
});
