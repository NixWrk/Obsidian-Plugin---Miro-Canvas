import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { revisionOf } from "../src/board-file";
import { McpServer } from "../src/json-rpc";
import { createReadTools, type ToolDefinition } from "../src/tools";
import { createEditTools, createServerTools, type EditToolContext } from "../src/tools-edit";
import { Vault } from "../src/vault";
import { makeFixtureVault, makeVault, removeVaults } from "./helpers";

afterEach(removeVaults);

type Answer = Record<string, any>;

/** The read and edit tools over one vault, as the server offers them. */
function toolsFor(root: string, extra: Partial<EditToolContext> = {}): (name: string, args: Record<string, unknown>) => Answer {
	const vault = Vault.open(root);
	const tools = new Map<string, ToolDefinition>(
		[...createReadTools({ vault }), ...createEditTools({ vault, ...extra })].map((tool) => [tool.name, tool]),
	);
	return (name, args) => tools.get(name)!.run(args);
}

function boardFile(root: string, name: string): string {
	return path.join(root, "boards", name);
}

function readJson(file: string): Answer {
	return JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}

function leftovers(folder: string): string[] {
	return readdirSync(folder).filter((name) => name.endsWith(".mcp-tmp"));
}

const FIXTURES = ["converter-board.canvas", "future-fields-board.canvas", "native-board.canvas", "plugin-authored-board.canvas"];

describe("edits keep a board valid and its Miro import as it was", () => {
	for (const name of FIXTURES) {
		it(`adds a shape, an item and a line to ${name}`, () => {
			const root = makeFixtureVault();
			const call = toolsFor(root);
			const board = `boards/${name}`;
			const before = readJson(boardFile(root, name));
			const read = call("read_board", { path: board });
			const shape = call("add_shape", { path: board, expectedRevision: read.revision, shape: "circle", x: 1000.4, y: 20.6, width: 120, height: 120, text: "Idea" });
			expect(shape.status).toBe("applied");
			expect(shape.written).toBe(true);
			expect(shape.previousRevision).toBe(read.revision);
			expect(shape.revision).toBe(revisionOf(readFileSync(boardFile(root, name))));
			const shapeId = shape.created.nodeId;
			expect(shape.changedIds).toContain(shapeId);
			const sticky = call("add_item", { path: board, expectedRevision: shape.revision, type: "sticky_note", x: 1200, y: 20, text: "Note", color: "yellow" });
			expect(sticky.status).toBe("applied");
			const line = call("connect", { path: board, expectedRevision: sticky.revision, from: { nodeId: shapeId }, to: { nodeId: sticky.created.nodeId } });
			expect(line.status).toBe("applied");
			const after = readJson(boardFile(root, name));
			expect(after.miroSource).toStrictEqual(before.miroSource);
			const node = after.nodes.find((item: Answer) => item.id === shapeId);
			expect(node).toMatchObject({ type: "text", x: 1000, y: 21, width: 120, height: 120, text: "Idea" });
			expect(after.miroCanvas.localOverrides[shapeId].shape).toEqual({ kind: "circle", fallback: "text" });
			const validation = call("validate_board", { path: board });
			expect(validation.schema).toEqual([]);
			expect(validation.plugin.filter((problem: Answer) => problem.severity === "error")).toEqual([]);
			expect(validation.valid).toBe(true);
		});
	}

	it("keeps every field it does not know, at every level", () => {
		const root = makeFixtureVault();
		const call = toolsFor(root);
		const board = "boards/future-fields-board.canvas";
		const result = call("update_node", { path: board, id: "n1", text: "changed", x: 10.6 });
		expect(result.status).toBe("applied");
		expect(result.changedIds).toEqual(["n1"]);
		const after = readJson(boardFile(root, "future-fields-board.canvas"));
		expect(after.nodes[0]).toMatchObject({ text: "changed", x: 11, futureNodeField: "keep-node" });
		expect(after.futureRootLevelField).toEqual({ sentinel: "keep-board-root" });
		expect(after.miroCanvas.futureRootField).toEqual({ sentinel: "keep-root" });
		expect(after.miroCanvas.settings.futureSettingField).toBe("keep-setting");
		expect(after.miroCanvas.bindings.n1.futureBindingField).toBe("keep-binding");
		expect(after.miroCanvas.localOverrides.n1.futureOverrideField).toBe("keep-override");
	});

	it("writes tab-indented JSON and keeps a byte order mark", () => {
		const root = makeVault();
		const file = path.join(root, "bom.canvas");
		writeFileSync(file, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("{\"nodes\":[],\"edges\":[]}")]));
		const call = toolsFor(root);
		expect(call("add_card", { path: "bom.canvas", x: 0, y: 0, text: "hello" }).status).toBe("applied");
		const bytes = readFileSync(file);
		expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
		expect(bytes.toString("utf8")).toContain("\n\t\"nodes\": [");
	});
});

describe("the board's rules", () => {
	it("refuses to change a locked card, and leaves the file as it was", () => {
		const root = makeFixtureVault();
		const call = toolsFor(root);
		const board = "boards/native-board.canvas";
		const locked = call("lock", { path: board, ids: ["note-1"], locked: true });
		expect(locked.status).toBe("applied");
		expect(readJson(boardFile(root, "native-board.canvas")).miroCanvas.localOverrides["note-1"].locked).toBe(true);
		const bytes = readFileSync(boardFile(root, "native-board.canvas"));
		for (const [name, args] of [
			["update_node", { id: "note-1", text: "no" }],
			["move", { ids: ["note-1"], dx: 10, dy: 0 }],
			["rotate", { id: "note-1", degrees: 30 }],
			["delete", { ids: ["note-1"] }],
		] as const) {
			const result = call(name, { path: board, ...args });
			expect(result.status, name).toBe("rejected");
			expect(result.diagnostics.length, name).toBeGreaterThan(0);
		}
		expect(readFileSync(boardFile(root, "native-board.canvas")).equals(bytes)).toBe(true);
		expect(call("lock", { path: board, ids: ["note-1"], locked: false }).status).toBe("applied");
		expect(call("update_node", { path: board, id: "note-1", text: "yes" }).status).toBe("applied");
	});

	it("refuses a lock on something the board does not have", () => {
		const root = makeFixtureVault();
		const result = toolsFor(root)("lock", { path: "boards/native-board.canvas", ids: ["nobody"], locked: true });
		expect(result.status).toBe("rejected");
		expect(result.diagnostics[0].code).toBe("not-found");
	});

	it("refuses a board with numbers it would round", () => {
		const root = makeVault();
		const file = path.join(root, "big.canvas");
		writeFileSync(file, "{\"nodes\":[],\"edges\":[],\"miroSource\":{\"id\":3458764513820540928}}");
		const result = toolsFor(root)("add_card", { path: "big.canvas", x: 0, y: 0 });
		expect(result.status).toBe("rejected");
		expect(result.diagnostics[0].code).toBe("unsafe-integers");
		expect(readFileSync(file, "utf8")).toBe("{\"nodes\":[],\"edges\":[],\"miroSource\":{\"id\":3458764513820540928}}");
	});
});

describe("lines", () => {
	it("joins two cards with a native edge and its record", () => {
		const root = makeFixtureVault();
		const call = toolsFor(root);
		const board = "boards/native-board.canvas";
		const card = call("add_card", { path: board, x: 600, y: 0, width: 200, height: 140, text: "right" });
		const result = call("connect", { path: board, from: { nodeId: "note-1" }, to: { nodeId: card.created.nodeId }, label: "next" });
		expect(result.status).toBe("applied");
		expect(result.created.form).toBe("native-edge");
		const after = readJson(boardFile(root, "native-board.canvas"));
		const edge = after.edges.find((item: Answer) => item.id === result.created.connectorId);
		expect(edge).toMatchObject({ fromNode: "note-1", fromSide: "right", toNode: card.created.nodeId, toSide: "left", label: "next" });
		expect(after.miroCanvas.connectors ?? {}).toEqual({});
		expect(after.miroCanvas.localOverrides[edge.id].connector).toMatchObject({ route: "straight", endCap: "stealth" });
	});

	it("keeps a line with a free end as the board's own connector", () => {
		const root = makeFixtureVault();
		const call = toolsFor(root);
		const result = call("connect", { path: "boards/native-board.canvas", from: { nodeId: "note-1", side: "bottom" }, to: { x: 180, y: 400 } });
		expect(result.status).toBe("applied");
		expect(result.created.form).toBe("board-connector");
		const after = readJson(boardFile(root, "native-board.canvas"));
		expect(after.edges).toEqual([]);
		expect(after.miroCanvas.connectors[result.created.connectorId]).toMatchObject({
			from: { type: "node", nodeId: "note-1", u: 0.5, v: 1 },
			to: { type: "free", x: 180, y: 400 },
		});
		expect(call("validate_board", { path: "boards/native-board.canvas" }).valid).toBe(true);
	});

	it("labels a native edge, and turns a connector put on two cards into a native edge", () => {
		const root = makeFixtureVault();
		const call = toolsFor(root);
		const board = "boards/plugin-authored-board.canvas";
		const labelled = call("update_connector", { path: board, id: "edge-1", label: "because", color: "#ff0000" });
		expect(labelled.status).toBe("applied");
		let after = readJson(boardFile(root, "plugin-authored-board.canvas"));
		expect(after.edges.find((edge: Answer) => edge.id === "edge-1").label).toBe("because");
		expect(after.miroCanvas.localOverrides["edge-1"].connector.color).toBe("#ff0000");
		const joined = call("update_connector", { path: board, id: "conn-1", from: { nodeId: "card-1" } });
		expect(joined.status).toBe("applied");
		after = readJson(boardFile(root, "plugin-authored-board.canvas"));
		expect(after.miroCanvas.connectors["conn-1"]).toBeUndefined();
		expect(after.edges.find((edge: Answer) => edge.id === "conn-1")).toMatchObject({ fromNode: "card-1", toNode: "frame-1" });
		expect(call("validate_board", { path: board }).valid).toBe(true);
	});
});

describe("layers", () => {
	it("reorders only the cards and never starts a zOrder record", () => {
		const root = makeFixtureVault();
		const call = toolsFor(root);
		const board = "boards/native-board.canvas";
		const card = call("add_card", { path: board, x: 100, y: 50, text: "on top" });
		const before = readJson(boardFile(root, "native-board.canvas"));
		expect(before.nodes.map((node: Answer) => node.id)).toEqual(["note-1", card.created.nodeId]);
		const result = call("layer", { path: board, ids: [card.created.nodeId], direction: "back" });
		expect(result.status).toBe("applied");
		const after = readJson(boardFile(root, "native-board.canvas"));
		expect(after.nodes.map((node: Answer) => node.id)).toEqual([card.created.nodeId, "note-1"]);
		expect(after.nodes).toEqual(expect.arrayContaining(before.nodes));
		expect(after.edges).toEqual(before.edges);
		expect(after.miroCanvas?.zOrder).toBeUndefined();
	});

	it("answers noop when the card is already there", () => {
		const root = makeFixtureVault();
		const result = toolsFor(root)("layer", { path: "boards/future-fields-board.canvas", ids: ["n1"], direction: "front" });
		expect(result.status).toBe("noop");
		expect(result.written).toBe(false);
	});
});

describe("saves made elsewhere", () => {
	it("refuses an edit when the board changed between reading and writing, and leaves the newer file alone", () => {
		const root = makeFixtureVault();
		const file = boardFile(root, "native-board.canvas");
		const newer = "{\"nodes\":[],\"edges\":[]}";
		const call = toolsFor(root, { beforeWrite: (target) => writeFileSync(target, newer) });
		const result = call("add_card", { path: "boards/native-board.canvas", x: 0, y: 0, text: "late" });
		expect(result.status).toBe("rejected");
		expect(result.diagnostics[0].code).toBe("stale-board");
		expect(readFileSync(file, "utf8")).toBe(newer);
		expect(leftovers(path.join(root, "boards"))).toEqual([]);
	});

	it("refuses an edit made against an older revision before doing anything", () => {
		const root = makeFixtureVault();
		const call = toolsFor(root);
		const board = "boards/native-board.canvas";
		const read = call("read_board", { path: board });
		expect(call("add_card", { path: board, x: 0, y: 0 }).status).toBe("applied");
		const bytes = readFileSync(boardFile(root, "native-board.canvas"));
		const result = call("update_node", { path: board, expectedRevision: read.revision, id: "note-1", text: "stale" });
		expect(result.status).toBe("rejected");
		expect(result.diagnostics[0].code).toBe("stale-board");
		expect(readFileSync(boardFile(root, "native-board.canvas")).equals(bytes)).toBe(true);
	});

	it("says so when Obsidian has the board open in a tab", () => {
		const root = makeFixtureVault();
		writeFileSync(path.join(root, ".obsidian", "workspace.json"), JSON.stringify({
			main: { children: [{ children: [{ type: "leaf", state: { type: "canvas", state: { file: "boards/native-board.canvas" } } }] }] },
		}));
		const call = toolsFor(root);
		const open = call("update_node", { path: "boards/native-board.canvas", id: "note-1", text: "x" });
		expect(open.warnings.map((warning: Answer) => warning.code)).toEqual(["open-in-obsidian"]);
		const closed = call("update_node", { path: "boards/future-fields-board.canvas", id: "n1", text: "x" });
		expect(closed.warnings).toEqual([]);
	});
});

describe("dry runs and undo", () => {
	it("works a change out without writing it", () => {
		const root = makeFixtureVault();
		const file = boardFile(root, "native-board.canvas");
		const bytes = readFileSync(file);
		const result = toolsFor(root)("update_node", { path: "boards/native-board.canvas", id: "note-1", width: 400, dryRun: true });
		expect(result).toMatchObject({ status: "applied", dryRun: true, written: false, changedIds: ["note-1"] });
		expect(result.revision).not.toBe(result.previousRevision);
		expect(readFileSync(file).equals(bytes)).toBe(true);
		expect(leftovers(path.join(root, "boards"))).toEqual([]);
	});

	it("gives back the board byte for byte, once", () => {
		const root = makeFixtureVault();
		const file = boardFile(root, "plugin-authored-board.canvas");
		const bytes = readFileSync(file);
		const call = toolsFor(root);
		expect(call("delete", { path: "boards/plugin-authored-board.canvas", ids: ["sticky-1"] }).status).toBe("applied");
		const undone = call("undo_last", { path: "boards/plugin-authored-board.canvas" });
		expect(undone.status).toBe("applied");
		expect(undone.changedIds).toContain("sticky-1");
		expect(readFileSync(file).equals(bytes)).toBe(true);
		expect(call("undo_last", { path: "boards/plugin-authored-board.canvas" }).diagnostics[0].code).toBe("nothing-to-undo");
	});

	it("does not undo over a save made since", () => {
		const root = makeFixtureVault();
		const call = toolsFor(root);
		expect(call("add_card", { path: "boards/native-board.canvas", x: 0, y: 0 }).status).toBe("applied");
		writeFileSync(boardFile(root, "native-board.canvas"), "{\"nodes\":[],\"edges\":[]}");
		const result = call("undo_last", { path: "boards/native-board.canvas" });
		expect(result.diagnostics[0].code).toBe("history-conflict");
		expect(readFileSync(boardFile(root, "native-board.canvas"), "utf8")).toBe("{\"nodes\":[],\"edges\":[]}");
	});
});

describe("the tools offered", () => {
	it("has no tool that changes a board when read-only", () => {
		const vault = Vault.open(makeFixtureVault());
		const readOnly = createServerTools({ vault, readOnly: true }).map((tool) => tool.name);
		expect(readOnly).toEqual(["list_boards", "read_board", "validate_board"]);
		const all = createServerTools({ vault, readOnly: false }).map((tool) => tool.name);
		expect(all).toEqual([
			"list_boards", "read_board", "validate_board",
			"add_item", "add_card", "add_shape", "update_node", "move", "set_style", "rotate",
			"connect", "update_connector", "delete", "layer", "lock", "comment", "undo_last",
		]);
	});

	it("reports a refused edit as a failed call that still says why", async () => {
		const vault = Vault.open(makeFixtureVault());
		const server = new McpServer({ name: "miro-canvas", version: "test", tools: createServerTools({ vault, readOnly: false }) });
		const answer = await server.handleMessage({
			jsonrpc: "2.0", id: 1, method: "tools/call",
			params: { name: "update_node", arguments: { path: "boards/native-board.canvas", id: "nobody", text: "x" } },
		}) as Answer;
		expect(answer.result.isError).toBe(true);
		expect(answer.result.structuredContent.status).toBe("rejected");
		const applied = await server.handleMessage({
			jsonrpc: "2.0", id: 2, method: "tools/call",
			params: { name: "update_node", arguments: { path: "boards/native-board.canvas", id: "note-1", text: "x" } },
		}) as Answer;
		expect(applied.result.isError).toBe(false);
		expect(applied.result.structuredContent.status).toBe("applied");
	});
});

describe("other edits", () => {
	it("moves a card with the lines and comment pin on it", () => {
		const root = makeFixtureVault();
		const call = toolsFor(root);
		const result = call("move", { path: "boards/plugin-authored-board.canvas", ids: ["card-1"], dx: 40.4, dy: -10 });
		expect(result.status).toBe("applied");
		const after = readJson(boardFile(root, "plugin-authored-board.canvas"));
		expect(after.nodes.find((node: Answer) => node.id === "card-1")).toMatchObject({ x: 40, y: -10 });
		expect(after.edges.find((edge: Answer) => edge.id === "edge-1")).toMatchObject({ fromNode: "card-1", toNode: "sticky-1" });
	});

	it("deletes a card with the edge that ended on it", () => {
		const root = makeFixtureVault();
		const call = toolsFor(root);
		const result = call("delete", { path: "boards/plugin-authored-board.canvas", ids: ["sticky-1"] });
		expect(result.status).toBe("applied");
		const after = readJson(boardFile(root, "plugin-authored-board.canvas"));
		expect(after.nodes.some((node: Answer) => node.id === "sticky-1")).toBe(false);
		expect(after.edges.some((edge: Answer) => edge.id === "edge-1")).toBe(false);
		expect(result.changedIds).toEqual(expect.arrayContaining(["sticky-1", "edge-1"]));
	});

	it("rotates and restyles a shape", () => {
		const root = makeFixtureVault();
		const call = toolsFor(root);
		const board = "boards/native-board.canvas";
		const shape = call("add_shape", { path: board, shape: "rectangle", x: 0, y: 300, width: 200, height: 100 });
		const id = shape.created.nodeId;
		expect(call("rotate", { path: board, id, degrees: 45 }).status).toBe("applied");
		expect(call("set_style", { path: board, ids: [id], colors: { fill: "#ffcc00" }, borderStyle: "dashed" }).status).toBe("applied");
		const override = readJson(boardFile(root, "native-board.canvas")).miroCanvas.localOverrides[id];
		expect(override.rotation).toBe(45);
		expect(override.colors.fill).toBe("#ffcc00");
		expect(override.borderStyle).toBe("dashed");
	});

	it("adds, answers, resolves and deletes a comment, and leaves Miro's comments alone", () => {
		const root = makeFixtureVault();
		const call = toolsFor(root);
		const board = "boards/plugin-authored-board.canvas";
		const added = call("comment", { path: board, op: "add", text: "Why here?", anchor: { nodeId: "card-1" } });
		expect(added.status).toBe("applied");
		const commentId = added.created.commentId;
		const reply = call("comment", { path: board, op: "reply", commentId, text: "Because.", author: "Reviewer" });
		expect(reply.status).toBe("applied");
		expect(call("comment", { path: board, op: "resolve", commentId }).status).toBe("applied");
		let metadata = readJson(boardFile(root, "plugin-authored-board.canvas")).miroCanvas;
		const thread = metadata.localComments.find((item: Answer) => item.id === commentId);
		expect(thread).toMatchObject({ text: "Why here?", resolved: true, author: { name: "AI agent" }, anchor: { type: "node", nodeId: "card-1" } });
		expect(thread.replies[0]).toMatchObject({ id: reply.created.replyId, text: "Because.", author: { name: "Reviewer" } });
		expect(call("comment", { path: board, op: "delete", commentId }).status).toBe("applied");
		metadata = readJson(boardFile(root, "plugin-authored-board.canvas")).miroCanvas;
		expect(metadata.localComments.some((item: Answer) => item.id === commentId)).toBe(false);
		expect(call("comment", { path: board, op: "edit", commentId: "imported-comment-1", text: "no" }).status).toBe("rejected");
		expect(call("validate_board", { path: board }).valid).toBe(true);
	});

	it("refuses to change a locked comment thread", () => {
		const root = makeFixtureVault();
		const file = boardFile(root, "plugin-authored-board.canvas");
		const document = readJson(file);
		document.miroCanvas.commentDecorations["local:comment-1"] = { locked: true };
		writeFileSync(file, JSON.stringify(document));
		const result = toolsFor(root)("comment", { path: "boards/plugin-authored-board.canvas", op: "reply", commentId: "comment-1", text: "no" });
		expect(result.status).toBe("rejected");
		expect(result.diagnostics[0].code).toBe("comment-locked");
	});
});
