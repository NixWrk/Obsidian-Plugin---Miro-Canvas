import { describe, expect, it } from "vitest";
import { planEncapsulateSelection } from "../src/board-encapsulation";
import { cloneCanvasJson } from "../src/canvas-json";
import { validateMiroCanvasMetadata } from "../src/metadata";

const node = (id: string, x: number) => ({ id, type: "text", text: `[[Note]] ${id}`, x, y: 0, width: 100, height: 100, future: { keep: id } });
const board = () => ({
  nodes: [node("a", 0), node("b", 200), node("outside", 600)],
  edges: [
    { id: "inside", fromNode: "a", toNode: "b", fromEnd: "none", toEnd: "arrow", future: "keep" },
    { id: "crossing", fromNode: "b", toNode: "outside", fromSide: "right", toSide: "left", future: "keep" },
  ],
  miroSource: { evidence: [{ immutable: "exact" }] },
  miroCanvas: { schemaVersion: 1, settings: { future: "keep" }, properties: { tags: ["test"], aliases: ["Original"] },
    localOverrides: { a: { colors: { fill: "#abcdef" }, future: true }, inside: { connector: { labelT: 0.2 } } },
    bindings: { a: { sourceId: "source-a", role: "item", future: 1 } },
    localComments: [{ id: "comment", text: "Keep", anchor: { type: "node", nodeId: "a", u: 0.5, v: 0.5 }, future: true }],
    future: { untouched: true },
  },
  future: { root: "keep" },
});
const options = { targetPath: "New.canvas", proxyId: "proxy" };

describe("comment positions across a transfer", () => {
  it("uses a moved pin's effective place rather than its original thread anchor", () => {
    const before = board() as any;
    before.miroCanvas.commentPlaces = { "local:comment": { type: "node", nodeId: "outside", u: 0.5, v: 0.5 } };
    const result = planEncapsulateSelection(before, ["a", "b"], options);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((result.source.miroCanvas as any).localComments).toEqual(before.miroCanvas.localComments);
    expect((result.target.miroCanvas as any).localComments).toEqual([]);
    expect((result.source.miroCanvas as any).commentPlaces["local:comment"].nodeId).toBe("outside");
  });
  it("detaches an explicitly selected comment from a card left on the source board", () => {
    const before = board() as any;
    before.miroCanvas.commentPlaces = { "local:comment": { type: "node", nodeId: "outside", u: 0.5, v: 0.5, future: true } };
    const result = planEncapsulateSelection(before, ["a", "miro-comment:local:comment"], options);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((result.target.miroCanvas as any).commentPlaces["local:comment"]).toEqual({ type: "free", x: 650, y: 50, future: true });
    expect(result.target.miroSource).toEqual(before.miroSource);
  });
});

describe("selection encapsulation", () => {
  it("moves the selected subgraph and attaches external lines to one native file card", () => {
    const before = board();
    const plan = planEncapsulateSelection(before, ["a", "b"], options);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.source.nodes).toEqual([before.nodes[2], { id: "proxy", type: "file", file: "New.canvas", x: 0, y: 0, width: 300, height: 160 }]);
    expect(plan.source.edges).toEqual([{ ...before.edges[1], fromNode: "proxy" }]);
    expect(plan.target.nodes).toEqual(before.nodes.slice(0, 2));
    expect(plan.target.edges).toEqual([before.edges[0]]);
    expect(plan.source.miroSource).toEqual(before.miroSource);
    expect(plan.target.miroSource).toEqual(before.miroSource);
    expect(plan.target.future).toEqual(before.future);
    const own = plan.target.miroCanvas as Record<string, unknown>;
    expect(own.localOverrides).toEqual(before.miroCanvas.localOverrides);
    expect(own.bindings).toEqual(before.miroCanvas.bindings);
    expect(own.localComments).toEqual(before.miroCanvas.localComments);
    expect(own.properties).toEqual({ tags: ["test"] });
    expect((plan.source.miroCanvas as any).nodeRedirects.a).toEqual({ file: "New.canvas", nodeId: "a" });
    expect(validateMiroCanvasMetadata(plan.source.miroCanvas).valid).toBe(true);
    expect(validateMiroCanvasMetadata(plan.target.miroCanvas).valid).toBe(true);
    expect(before).toEqual(board());
  });

  it("rewrites note-relative text only in the new board", () => {
    const plan = planEncapsulateSelection(board(), ["a"], { ...options, rewriteText: (text) => text.replace("[[Note]]", "[[folder/Note]]") });
    expect(plan.ok).toBe(true);
    if (plan.ok) expect((plan.target.nodes as any[])[0].text).toBe("[[folder/Note]] a");
  });

  it("refuses locked moved cards, locked boundary lines and review mode", () => {
    const locked = board() as any;
    locked.miroCanvas.localOverrides.a.locked = true;
    expect(planEncapsulateSelection(locked, ["a"], options).ok).toBe(false);
    const line = board() as any;
    line.miroCanvas.localOverrides.crossing = { locked: true };
    expect(planEncapsulateSelection(line, ["a", "b"], options).ok).toBe(false);
    const review = board() as any;
    review.miroCanvas.settings.reviewMode = true;
    expect(planEncapsulateSelection(review, ["a"], options).ok).toBe(false);
  });

  it.each(["../New.canvas", "/New.canvas", "C:/New.canvas", "folder\\New.canvas", "not-a-board.md"])("refuses invalid target %s", targetPath => {
    expect(planEncapsulateSelection(board(), ["a"], { ...options, targetPath }).ok).toBe(false);
  });

  it("refuses an empty card selection, collisions and invalid metadata", () => {
    expect(planEncapsulateSelection(board(), [], options)).toMatchObject({ ok: false, reason: "empty-selection" });
    expect(planEncapsulateSelection(board(), ["a"], { ...options, proxyId: "b" }).ok).toBe(false);
    const invalid = board() as any;
    invalid.miroCanvas.schemaVersion = 99;
    expect(planEncapsulateSelection(invalid, ["a"], options).ok).toBe(false);
  });

  it("moves independent internal lines and rebases external chain attachments", () => {
    const original = board() as any;
    const line = { id: "own", from: { type: "node", nodeId: "a", u: 1, v: 0.5 }, to: { type: "node", nodeId: "b", u: 0, v: 0.5 }, route: "straight", color: "#123456", width: 2, startCap: "none", endCap: "arrow", future: true };
    original.miroCanvas.connectors = {
      own: line,
      chain: { ...line, id: "chain", from: { type: "edge", edgeId: "own", t: 0.4, future: "keep" }, to: { type: "free", x: 900, y: 200 } },
    };
    const plan = planEncapsulateSelection(original, ["a", "b"], options);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect((plan.target.miroCanvas as any).connectors.own).toEqual(line);
    expect((plan.source.miroCanvas as any).connectors.chain.from).toMatchObject({ type: "node", nodeId: "proxy", future: "keep" });
    expect((plan.source.miroCanvas as any).connectors.chain.to).toEqual(original.miroCanvas.connectors.chain.to);
  });
});

describe("plain Canvas JSON copy", () => {
  it("preserves unknown keys and rejects data that serialization would lose", () => {
    expect(cloneCanvasJson({ future: { "__proto__": null }, number: 0 })).toEqual({ future: { "__proto__": null }, number: 0 });
    expect(() => cloneCanvasJson({ future: undefined })).toThrow();
    expect(() => cloneCanvasJson({ get future() { return 1; } })).toThrow();
    expect(() => cloneCanvasJson([, 1])).toThrow();
    const cycle: any = {}; cycle.self = cycle;
    expect(() => cloneCanvasJson(cycle)).toThrow();
  });
});
