import { describe, expect, it, vi } from "vitest";

import { planBoardConnectors } from "../src/board-connector-writes";
import type { BoardConnector } from "../src/board-connectors";

function line(id: string, from: BoardConnector["from"], to: BoardConnector["to"]): BoardConnector {
	return { id, from, to, route: "straight", color: "#1e1e1e", width: 2, startCap: "none", endCap: "arrow" };
}

/** Two cards; a line from empty board to the first card, and a line starting on that line. */
function board(): Record<string, any> {
	return {
		nodes: [
			{ id: "a", type: "text", text: "A", x: 0, y: 0, width: 100, height: 100 },
			{ id: "b", type: "text", text: "B", x: 300, y: 0, width: 100, height: 100 },
		],
		edges: [{ id: "e", fromNode: "a", fromSide: "right", toNode: "b", toSide: "left" }],
		miroCanvas: {
			schemaVersion: 1,
			future: "kept",
			connectors: {
				c1: line("c1", { type: "free", x: -100, y: 50 }, { type: "node", nodeId: "a", u: 0, v: 0.5 }),
				c2: line("c2", { type: "edge", edgeId: "c1", t: 0.5 }, { type: "free", x: -50, y: 200 }),
			},
			localOverrides: {
				e: { connectorAnchors: { to: { type: "edge", edgeId: "c1", t: 0.5 } } },
				a: { locked: false },
			},
		},
	};
}

describe("planBoardConnectors", () => {
	it("adds a connector beside the ones already there", () => {
		const document = board();
		const added = line("c3", { type: "free", x: 500, y: 0 }, { type: "node", nodeId: "b", u: 1, v: 0.5 });
		const plan = planBoardConnectors(document, [added], [], () => true);
		expect(plan.ok).toBe(true);
		if (!plan.ok) return;
		expect(Object.keys(plan.connectors)).toEqual(["c1", "c2", "c3"]);
		expect(plan.connectors.c3).toEqual(added);
		expect(plan.localOverrides).toEqual(document.miroCanvas.localOverrides);
		// The board itself is only read.
		expect(document).toEqual(board());
	});

	it("frees the ends that held on to a connector taken away, where they were", () => {
		const plan = planBoardConnectors(board(), [], ["c1"], () => true);
		expect(plan.ok).toBe(true);
		if (!plan.ok) return;
		expect(Object.keys(plan.connectors)).toEqual(["c2"]);
		expect(plan.connectors.c2.from).toEqual({ type: "free", x: -50, y: 50 });
		const edgeOverride = plan.localOverrides.e as { connectorAnchors: { to: unknown } };
		expect(edgeOverride.connectorAnchors.to).toMatchObject({ type: "free" });
		expect(plan.localOverrides.a).toEqual({ locked: false });
	});

	it("asks about every line the change touches and stops at a locked one", () => {
		const editAllowed = vi.fn((ids: readonly string[]) => !ids.includes("e"));
		const plan = planBoardConnectors(board(), [], ["c1"], editAllowed);
		expect(plan).toEqual({ ok: false, reason: "locked" });
		expect(editAllowed.mock.calls).toEqual([[["c2"]], [["e"]]]);
	});

	it("refuses a connector that would end on a card not on the board", () => {
		const stray = line("c3", { type: "free", x: 0, y: 0 }, { type: "node", nodeId: "gone", u: 0.5, v: 0.5 });
		expect(planBoardConnectors(board(), [stray], [], () => true)).toEqual({ ok: false, reason: "target-invalid" });
	});

	it("does not ask when nothing a connector keeps changes", () => {
		const document = board();
		const editAllowed = vi.fn(() => true);
		const plan = planBoardConnectors(document, [document.miroCanvas.connectors.c1], [], editAllowed);
		expect(plan.ok).toBe(true);
		expect(editAllowed).not.toHaveBeenCalled();
	});
});
