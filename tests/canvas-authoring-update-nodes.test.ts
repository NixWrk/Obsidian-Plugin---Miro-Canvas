import { describe, expect, it } from "vitest";

import { createCanvasAuthoring, readCanvasGraph } from "../src/canvas-authoring";

type CanvasDocument = Record<string, any>;

function clone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

/** A native Canvas stand-in: whole-document import, one history entry per save. */
class FakeCanvas {
	public data: CanvasDocument;
	public readonly history: CanvasDocument[] = [];
	public readonly = false;

	public constructor(document: CanvasDocument) {
		this.data = clone(document);
		this.history.push(clone(document));
	}

	public getData(): CanvasDocument {
		return clone(this.data);
	}

	public importData(document: CanvasDocument, _rebuild: boolean): void {
		this.data = clone(document);
	}

	public requestSave(addHistory?: boolean): void {
		if (addHistory === true) this.history.push(clone(this.data));
	}
}

function board(): CanvasDocument {
	return {
		nodes: [
			{ id: "a", type: "text", text: "First", x: 0, y: 0, width: 200, height: 100, color: "2" },
			{ id: "b", type: "text", text: "Second", x: 300, y: 0, width: 200, height: 100, future: { kept: true } },
			{ id: "g", type: "group", x: -50, y: -50, width: 700, height: 300, label: "Frame" },
		],
		edges: [{ id: "e", fromNode: "a", toNode: "b", fromSide: "right", toSide: "left" }],
		miroCanvas: { schemaVersion: 1, localOverrides: {} },
		miroSource: { items: [{ id: "s", type: "sticky_note" }] },
	};
}

describe("CanvasAuthoring.updateNodes", () => {
	it("changes text, box and color of several cards in one history step", () => {
		const canvas = new FakeCanvas(board());
		const result = createCanvasAuthoring(canvas).updateNodes([
			{ id: "a", text: "Changed", x: 10, y: 20, color: null },
			{ id: "b", width: 240, height: 120, color: "#aabbcc" },
		]);
		expect(result.ok).toBe(true);
		expect(canvas.history).toHaveLength(2);
		const [a, b] = canvas.data.nodes;
		expect(a).toEqual({ id: "a", type: "text", text: "Changed", x: 10, y: 20, width: 200, height: 100 });
		expect(b).toMatchObject({ width: 240, height: 120, color: "#aabbcc", future: { kept: true } });
		expect(canvas.data.miroSource).toEqual(board().miroSource);
		expect(canvas.data.edges).toEqual(board().edges);
	});

	it("makes no history step when the cards already have the values", () => {
		const canvas = new FakeCanvas(board());
		const result = createCanvasAuthoring(canvas).updateNodes([{ id: "a", text: "First", x: 0, color: "2" }]);
		expect(result.ok).toBe(true);
		expect(result.diagnostics.map((item) => item.code)).toContain("update-node-unchanged");
		expect(canvas.history).toHaveLength(1);
	});

	it.each([
		["text on a frame", { id: "g", text: "No" }, "update-node-text-unsupported"],
		["a size of zero", { id: "a", width: 0 }, "update-node-geometry-invalid"],
		["a place that is not a number", { id: "a", x: Number.NaN }, "update-node-geometry-invalid"],
		["a color Canvas does not know", { id: "a", color: "red" }, "update-node-color-invalid"],
		["a card not on the board", { id: "missing", x: 1 }, "update-node-missing"],
		["nothing to change", { id: "a" }, "update-node-no-fields"],
	])("refuses %s", (_name, input, code) => {
		const canvas = new FakeCanvas(board());
		const result = createCanvasAuthoring(canvas).updateNodes([input as never]);
		expect(result.ok).toBe(false);
		expect(result.diagnostics.map((item) => item.code)).toContain(code);
		expect(canvas.data).toEqual(board());
		expect(canvas.history).toHaveLength(1);
	});

	it("refuses the same card twice in one update", () => {
		const canvas = new FakeCanvas(board());
		const result = createCanvasAuthoring(canvas).updateNodes([{ id: "a", x: 1 }, { id: "a", y: 1 }]);
		expect(result.ok).toBe(false);
		expect(canvas.data).toEqual(board());
	});

	it("refuses a locked card and changes none of the others", () => {
		const locked = board();
		locked.miroCanvas.localOverrides.b = { locked: true };
		const canvas = new FakeCanvas(locked);
		const result = createCanvasAuthoring(canvas).updateNodes([{ id: "a", x: 5 }, { id: "b", text: "No" }]);
		expect(result.ok).toBe(false);
		expect(result.diagnostics.map((item) => item.code)).toContain("update-node-blocked-lock");
		expect(canvas.data).toEqual(locked);
	});

	it("refuses every change in review mode", () => {
		const review = board();
		review.miroCanvas.settings = { reviewMode: true };
		const canvas = new FakeCanvas(review);
		const result = createCanvasAuthoring(canvas).updateNodes([{ id: "a", color: "3" }]);
		expect(result.ok).toBe(false);
		expect(result.diagnostics.map((item) => item.code)).toContain("update-node-blocked-review");
	});

	it("refuses a stale expected board", () => {
		const canvas = new FakeCanvas(board());
		const stale = board();
		stale.nodes[0].text = "Older";
		const result = createCanvasAuthoring(canvas).updateNodes([{ id: "a", x: 5 }], stale);
		expect(result.ok).toBe(false);
		expect(result.diagnostics.map((item) => item.code)).toContain("stale-node-update");
		expect(canvas.data).toEqual(board());
	});
});

describe("readCanvasGraph", () => {
	it("reads the cards and lines of a board as a copy", () => {
		const document = board();
		const read = readCanvasGraph(document);
		expect(read.ok).toBe(true);
		if (!read.ok) return;
		expect(read.nodes.map((node) => node.id)).toEqual(["a", "b", "g"]);
		expect(read.edges.map((edge) => edge.id)).toEqual(["e"]);
		expect(read.document).toEqual(document);
		expect(read.document).not.toBe(document);
	});

	it("says why a board with a repeated id cannot be read", () => {
		const document = board();
		document.edges[0].id = "a";
		const read = readCanvasGraph(document);
		expect(read).toEqual({ ok: false, message: "edges[0] has an invalid or duplicate id" });
	});

	it("says why something that is not a board cannot be read", () => {
		expect(readCanvasGraph([]).ok).toBe(false);
		expect(readCanvasGraph({ nodes: [] }).ok).toBe(false);
	});
});
