import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { checkSchemas, validateBoard } from "../src/validate";
import { FIXTURES_DIR } from "./helpers";

interface ManifestEntry {
	readonly id: string;
	readonly path: string;
	readonly board_schema: "valid" | "invalid";
	readonly miro_source_schema: "valid" | "invalid" | "not_applicable";
	readonly miro_canvas_schema: "valid" | "invalid" | "not_applicable";
}

function readJson(file: string): Record<string, unknown> {
	return JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
}

const manifest = (readJson(path.join(FIXTURES_DIR, "manifest.json")) as unknown as { fixtures: ManifestEntry[] }).fixtures;

describe("the pinned schema over miro2obsidian's fixtures", () => {
	it("has fixtures to check", () => {
		expect(manifest.length).toBeGreaterThan(0);
	});

	for (const entry of manifest) {
		it(`gives the manifest's verdicts for ${entry.id}`, () => {
			const document = readJson(path.join(FIXTURES_DIR, entry.path));
			const { verdicts } = checkSchemas(document);
			expect(verdicts).toEqual({
				board: entry.board_schema,
				miroSource: entry.miro_source_schema,
				miroCanvas: entry.miro_canvas_schema,
			});
		});
	}

	for (const entry of manifest.filter((item) => item.board_schema === "valid")) {
		it(`finds ${entry.id} valid by the plugin's reading too`, () => {
			const result = validateBoard(readJson(path.join(FIXTURES_DIR, entry.path)));
			expect(result.plugin.filter((problem) => problem.severity === "error")).toEqual([]);
			expect(result.valid).toBe(true);
		});
	}

	it("reports where a schema error is, as a JSON Pointer under its schema", () => {
		const result = validateBoard(readJson(path.join(FIXTURES_DIR, "invalid", "edge-bad-side.canvas")));
		expect(result.valid).toBe(false);
		expect(result.schema.some((problem) => problem.schema === "board" && problem.pointer.startsWith("/edges/0"))).toBe(true);
	});

	it("files the plugin reader's own verdict under plugin", () => {
		const result = validateBoard(readJson(path.join(FIXTURES_DIR, "invalid", "duplicate-zorder.canvas")));
		expect(result.plugin).toContainEqual(expect.objectContaining({ code: "duplicate-z-order-id", severity: "error", pointer: "/miroCanvas/zOrder/2" }));
	});
});

function board(): Record<string, any> {
	return {
		nodes: [
			{ id: "a", type: "text", text: "A", x: 0, y: 0, width: 100, height: 100 },
			{ id: "b", type: "text", text: "B", x: 300, y: 0, width: 100, height: 100 },
		],
		edges: [{ id: "e", fromNode: "a", toNode: "b", fromSide: "right", toSide: "left" }],
		miroCanvas: { schemaVersion: 1 },
	};
}

function codes(document: Record<string, unknown>): string[] {
	return validateBoard(document).plugin.map((problem) => `${problem.severity}:${problem.code}`);
}

describe("the plugin's checks", () => {
	it("finds nothing wrong with a plain board", () => {
		expect(codes(board())).toEqual([]);
		expect(validateBoard(board()).valid).toBe(true);
	});

	it("reads a board with no nodes or edges keys as an empty one", () => {
		expect(validateBoard({}).plugin).toEqual([]);
	});

	it("refuses an id used by a card and a line alike", () => {
		const document = board();
		document.edges[0].id = "a";
		expect(codes(document)).toEqual(["error:graph-invalid"]);
	});

	it("refuses a connector whose id a card already has", () => {
		const document = board();
		document.miroCanvas.connectors = {
			a: { id: "a", from: { type: "free", x: 0, y: 0 }, to: { type: "free", x: 10, y: 10 }, route: "straight", color: "#000000", width: 2, startCap: "none", endCap: "arrow" },
		};
		expect(codes(document)).toContain("error:duplicate-id");
	});

	it("refuses a connector end on a card the board does not have", () => {
		const document = board();
		document.miroCanvas.connectors = {
			c: { id: "c", from: { type: "free", x: 0, y: 0 }, to: { type: "node", nodeId: "gone", u: 0.5, v: 0.5 }, route: "straight", color: "#000000", width: 2, startCap: "none", endCap: "arrow" },
		};
		const result = validateBoard(document);
		expect(result.valid).toBe(false);
		expect(result.plugin).toContainEqual(expect.objectContaining({ code: "anchor-unresolved", severity: "error", pointer: "/miroCanvas/connectors/c/to" }));
	});

	it("warns of a comment pinned to a card the board does not have", () => {
		const document = board();
		document.miroCanvas.commentPlaces = { "local:x": { type: "node", nodeId: "gone", u: 0.5, v: 0.5 } };
		expect(codes(document)).toContain("warning:anchor-unresolved");
		expect(validateBoard(document).valid).toBe(true);
	});

	it("accepts provenance bindings for native and independent imported lines", () => {
		const document = board();
		const nativeId = document.edges[0].id;
		document.miroCanvas.connectors = { free: { id: "free", from: { type: "free", x: 0, y: 0 }, to: { type: "free", x: 10, y: 10 }, route: "straight", color: "#000000", width: 2, startCap: "none", endCap: "arrow" } };
		document.miroCanvas.bindings = { [nativeId]: { sourceId: "excalidraw:native", role: "import:excalidraw:arrow" }, free: { sourceId: "excalidraw:free", role: "import:excalidraw:arrow" } };
		expect(codes(document)).not.toContain("warning:binding-orphan");
	});

	it("warns of records about cards the board no longer has", () => {
		const document = board();
		document.miroCanvas.localOverrides = { gone: { rotation: 10 } };
		document.miroCanvas.bindings = { gone: { sourceId: "s", role: "item" } };
		document.miroCanvas.zOrder = ["a", "gone"];
		expect(codes(document)).toEqual(expect.arrayContaining(["warning:override-orphan", "warning:binding-orphan", "warning:zorder-orphan"]));
	});

	it("warns of places and sizes that are not whole numbers", () => {
		const document = board();
		document.nodes[1].x = 300.5;
		const result = validateBoard(document);
		expect(result.plugin).toContainEqual(expect.objectContaining({ code: "fractional-geometry", severity: "warning", pointer: "/nodes/1/x" }));
		expect(result.valid).toBe(true);
	});

	it("does not change the board it checks", () => {
		const document = readJson(path.join(FIXTURES_DIR, "valid", "plugin-authored-board.canvas"));
		const before = JSON.stringify(document);
		validateBoard(document);
		expect(JSON.stringify(document)).toBe(before);
	});
});
