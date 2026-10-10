/**
 * Trace before repair, 2026-10-08: parent --phase edges passes Flip/history,
 * selected line IDs and captured ends, but root related-class count is zero.
 * Readonly native 9346 inspection: edgeEl absent, lineGroupEl is a g under the
 * Canvas root when attached; detached internal groups remain outside it.
 * Presentation calls planConnectedBoardLineIds with the mixed selection after
 * Select connected lines. That planner deliberately omits selected lines, so
 * every newly selected incident line loses its highlight. Command semantics
 * must stay unchanged; presentation must retain selected native/own lines.
 * Checks: card -> connected selection, captured endpoint masks, incoming and
 * outgoing, independent dependencies, unrelated lines, selection clearing,
 * disabled highlighting, memoized refresh, native SVG fallback. No source,
 * history or selection writes from presentation. Native input remains pending.
 */
import { describe, expect, it, vi } from "vitest";
import { M1CanvasSession } from "../src/m1-session";
import { DEFAULT_SETTINGS } from "../src/settings";

class Element {
  nodeType = 1;
  style = {};
  parentElement?: Element;
  children: Element[] = [];
  attributes = new Map<string, string>();
  classes = new Set<string>();
  classList = { add: vi.fn((key: string) => { this.classes.add(key); }), remove: vi.fn((key: string) => { this.classes.delete(key); }) };
  constructor(public tagName = "g") {}
  appendChild(child: Element) { child.parentElement = this; this.children.push(child); return child; }
  removeChild(child: Element) { this.children = this.children.filter((value) => value !== child); child.parentElement = undefined; }
  getAttribute(key: string) { return this.attributes.get(key) ?? null; }
  setAttribute(key: string, value: string) { this.attributes.set(key, value); }
  contains(child: Element): boolean { return child === this || this.children.some((value) => value.contains(child)); }
  closest(): null { return null; }
  querySelector(): null { return null; }
  querySelectorAll(selector: string): Element[] {
    const matches = (element: Element) => selector === "[data-connector-id]" ? element.attributes.has("data-connector-id")
      : selector === ".miro-canvas-line-related" ? element.classes.has("miro-canvas-line-related")
      : selector === "path:not(.canvas-interaction-path)" ? element.tagName === "path" && !element.classes.has("canvas-interaction-path") : false;
    return this.children.flatMap((child) => [...(matches(child) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
}

function fixture(enabled = true) {
  const root = new Element("div");
  const board = {
    nodes: ["a", "b", "c"].map((id, index) => ({ id, type: "text", x: index * 200, y: 0, width: 100, height: 80 })),
    edges: [{ id: "outgoing", fromNode: "a", fromSide: "right", toNode: "b", toSide: "left" },
      { id: "incoming", fromNode: "c", fromSide: "left", toNode: "a", toSide: "right" },
      { id: "unrelated", fromNode: "b", fromSide: "right", toNode: "c", toSide: "left" }],
    miroCanvas: { schemaVersion: 1, connectors: {
      own: { id: "own", route: "straight", color: "#123456", width: 2, startCap: "none", endCap: "arrow", from: { type: "node", nodeId: "a", u: 1, v: 0.5 }, to: { type: "free", x: 400, y: 100 } },
      tail: { id: "tail", route: "straight", color: "#123456", width: 2, startCap: "none", endCap: "arrow", from: { type: "edge", edgeId: "own", t: 0.5 }, to: { type: "free", x: 500, y: 100 } },
    } },
    miroSource: { opaque: ["keep"] }, future: { nested: true },
  };
  const nativeNodes = new Map(board.nodes.map((node) => [node.id, { ...node, nodeEl: root.appendChild(new Element("div")) }]));
  const nativeEdges = new Map(board.edges.map((edge) => {
    const lineGroupEl = root.appendChild(new Element());
    lineGroupEl.appendChild(new Element("path"));
    return [edge.id, { ...edge, lineGroupEl }];
  }));
  const ownShells = new Map(["own", "tail"].map((id) => {
    const shell = root.appendChild(new Element());
    shell.appendChild(new Element("path")).setAttribute("data-connector-id", id);
    return [id, shell];
  }));
  const selection = new Set<{ id: string }>([nativeNodes.get("a")!]);
  let ownSelected: string[] = [];
  const canvas = { getData: () => board, select: vi.fn((edge: { id: string }) => { selection.add(edge); }) };
  // Isolate the real command/presentation methods from unrelated session tools.
  const session = Object.create(M1CanvasSession.prototype) as M1CanvasSession;
  const internals = session as unknown as Record<string, any>;
  Object.assign(internals, {
    root, view: { canvas }, currentRawDocument: board, selectedIds: ["a"], selectedIdSet: new Set(["a"]),
    settings: { ...DEFAULT_SETTINGS, highlightConnectedLines: enabled }, enhancementDomIdentity: 0,
    enhancementPaintKey: "", enhancementClasses: new Set(), selectedRouteEnds: new Map(),
    adapter: { getDocument: () => board, getNodes: () => [...nativeNodes.values()], getEdges: () => [...nativeEdges.values()], read: () => canvas.getData },
    settledBoard: () => board, collapsedOwners: () => new Map(), zoom: () => 1,
    connectorLayer: { select: vi.fn((ids: string[]) => { ownSelected = ids; }) },
  });
  const paint = () => {
    internals.setSelectedIds([...selection].map((item) => item.id).concat(ownSelected));
    internals.refreshEnhancementRendering();
  };
  internals.refresh = paint;
  return { session, internals, canvas, selection, board, root, nativeNodes, nativeEdges, ownShells, paint, clearOwn: () => { ownSelected = []; } };
}

describe("related-line presentation after native connected selection", () => {
  it("keeps native SVG highlights after selecting connected lines without altering endpoint masks or the board", () => {
    const f = fixture(), before = JSON.stringify(f.board);
    f.paint();
    expect(f.nativeEdges.get("outgoing")!.lineGroupEl.classes.has("miro-canvas-line-related")).toBe(true);
    f.session.selectRelatedLines();
    expect([...f.selection].map((item) => item.id)).toEqual(["a", "outgoing", "incoming"]);
    expect(f.internals.selectedRouteEnds.get("outgoing")).toEqual({ from: true, to: false, wholeRoute: false });
    expect(f.internals.selectedRouteEnds.get("incoming")).toEqual({ from: false, to: true, wholeRoute: false });
    for (const id of ["outgoing", "incoming"]) expect(f.nativeEdges.get(id)!.lineGroupEl.classes.has("miro-canvas-line-related"), id).toBe(true);
    expect(f.nativeEdges.get("unrelated")!.lineGroupEl.classes.has("miro-canvas-line-related")).toBe(false);
    expect(f.root.querySelectorAll(".miro-canvas-line-related").length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(f.board)).toBe(before);
  });

  it("retains selected independent lines and still highlights their unselected dependents", () => {
    const f = fixture();
    f.paint();
    f.session.selectRelatedLines();
    expect(f.ownShells.get("own")!.classes.has("miro-canvas-line-related")).toBe(true);
    expect(f.ownShells.get("tail")!.classes.has("miro-canvas-line-related")).toBe(true);
    expect(f.internals.selectedRouteEnds.get("own")).toEqual({ from: true, to: false, wholeRoute: false });
  });

  it.each(["incoming", "outgoing"] as const)("retains highlights and command direction for %s", (direction) => {
    const f = fixture();
    f.session.selectRelatedLines(direction);
    expect([...f.selection].map((item) => item.id)).toEqual(["a", direction]);
    expect(f.nativeEdges.get(direction)!.lineGroupEl.classes.has("miro-canvas-line-related")).toBe(true);
    expect(f.nativeEdges.get("unrelated")!.lineGroupEl.classes.has("miro-canvas-line-related")).toBe(false);
  });

  it("clears highlights when selection is cleared and never selects from a presentation refresh", () => {
    const f = fixture();
    f.session.selectRelatedLines();
    f.canvas.select.mockClear();
    f.selection.clear();
    f.clearOwn();
    f.paint();
    expect(f.root.querySelectorAll(".miro-canvas-line-related")).toHaveLength(0);
    expect(f.canvas.select).not.toHaveBeenCalled();
  });

  it("keeps highlighting disabled while connected selection still works", () => {
    const f = fixture(false);
    f.session.selectRelatedLines();
    expect([...f.selection].map((item) => item.id)).toContain("outgoing");
    expect(f.root.querySelectorAll(".miro-canvas-line-related")).toHaveLength(0);
  });

  it("does not repaint stable classes during repeated presentation refreshes", () => {
    const f = fixture();
    f.session.selectRelatedLines();
    const shell = f.nativeEdges.get("outgoing")!.lineGroupEl;
    const adds = shell.classList.add.mock.calls.length, removes = shell.classList.remove.mock.calls.length;
    for (let frame = 0; frame < 100; frame += 1) f.paint();
    expect(shell.classList.add).toHaveBeenCalledTimes(adds);
    expect(shell.classList.remove).toHaveBeenCalledTimes(removes);
  });
});
