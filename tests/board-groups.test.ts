import { describe, expect, it } from "vitest";
import { collapsedGroupOwners, compactGroupRect, groupCollapse, groupSelectionIds, projectCollapsedGroups, toggleGroupCollapse } from "../src/board-groups";
import type { CanvasAnchor } from "../src/anchors";
import type { BoardConnector } from "../src/board-connectors";

const board = () => ({
  nodes: [
    { id: "g", type: "group", x: 0, y: 0, width: 900, height: 700, label: "Plan", future: { exact: true } },
    { id: "nested", type: "group", x: 100, y: 100, width: 500, height: 400 },
    { id: "a", type: "text", text: "Hello", x: 150, y: 150, width: 100, height: 100 },
    { id: "outside", type: "text", text: "Outside", x: 1200, y: 0, width: 100, height: 100 },
  ],
  edges: [{ id: "edge", fromNode: "a", toNode: "outside", future: true }],
  miroSource: { immutable: [1, 2] },
  miroCanvas: { schemaVersion: 1, localOverrides: { g: { future: "keep" } } },
  future: "keep root",
});

describe("collapsed native groups", () => {
  it("stores only a collapse snapshot; raw native boxes and source stay exact on both toggles", () => {
    const original = board();
    const collapsed = toggleGroupCollapse(original, "g")!;
    expect(collapsed.nodes).toEqual(original.nodes);
    expect(groupCollapse(collapsed, "g")).toEqual({ width: 900, height: 700, children: ["nested", "a"] });
    expect(collapsed.edges).toEqual(original.edges);
    expect(collapsed.miroSource).toEqual(original.miroSource);
    expect(toggleGroupCollapse(collapsed, "g")).toEqual(original);
    expect(original.nodes[0].width).toBe(900);
  });

  it("moves nested collapsed descendants once and excludes outside cards", () => {
    const nested = toggleGroupCollapse(board(), "nested")!;
    const collapsed = toggleGroupCollapse(nested, "g")!;
    expect(groupSelectionIds(collapsed, ["g", "a"])).toEqual(["g", "a", "nested"]);
    expect([...collapsedGroupOwners(collapsed)]).toEqual([["nested", "g"], ["a", "g"]]);
    const projected = projectCollapsedGroups(collapsed);
    expect((projected.nodes as ReturnType<typeof board>["nodes"])[0]).toMatchObject({ x: 0, y: 0, width: 280, height: 64, projectedCollapsed: true });
    expect((projected.nodes as ReturnType<typeof board>["nodes"])[2]).toMatchObject({ x: 0, y: 0, width: 280, height: 64, projectedCollapsed: true });
    expect((collapsed.nodes as ReturnType<typeof board>["nodes"])[2]).toMatchObject({ x: 150, y: 150 });
  });

  it("leaves empty groups valid and ignores nonexistent child references", () => {
    const empty = { nodes: [{ id: "g", type: "group", x: 0, y: 0, width: 100, height: 80 }], edges: [] };
    const collapsed = toggleGroupCollapse(empty, "g")!;
    expect(groupSelectionIds(collapsed, ["g"])).toEqual(["g"]);
    expect(collapsedGroupOwners(collapsed).size).toBe(0);
    expect(toggleGroupCollapse(empty, "absent")).toBeUndefined();
  });

  it("expand removes only the flag, preserving later native resizes and unknown fields", () => {
    const original = board();
    const collapsed = toggleGroupCollapse(original, "g")!;
    const nodes = collapsed.nodes as typeof original.nodes;
    nodes[0].width = 1200;
    nodes[0].height = 850;
    const snapshot = groupCollapse(collapsed, "g")! as Record<string, unknown>;
    snapshot.futureSnapshot = { keep: true };
    const expanded = toggleGroupCollapse(collapsed, "g")!;
    expect(expanded.nodes).toEqual(nodes);
    expect((expanded.nodes as typeof original.nodes)[0]).toMatchObject({ width: 1200, height: 850, future: original.nodes[0].future });
    expect(expanded.miroCanvas).toEqual(original.miroCanvas);
    expect(expanded.miroSource).toEqual(original.miroSource);
    expect(groupCollapse(collapsed, "g")?.futureSnapshot).toEqual({ keep: true });
  });

  it("caps compact geometry without enlarging small groups or writing preview flags", () => {
    expect(compactGroupRect({ x: -100, y: 25, width: 900, height: 700 })).toEqual({ x: -100, y: 25, width: 280, height: 64 });
    expect(compactGroupRect({ x: 1, y: 2, width: 90, height: 32 })).toEqual({ x: 1, y: 2, width: 90, height: 32 });
    expect(compactGroupRect({ x: 1, y: 2, width: NaN, height: 32 })).toBeUndefined();
    const original = board();
    const collapsed = toggleGroupCollapse(original, "g")!;
    const saved = JSON.stringify(collapsed);
    const projected = projectCollapsedGroups(collapsed);
    expect(JSON.stringify(collapsed)).toBe(saved);
    expect(projected.miroSource).toBe(collapsed.miroSource);
    expect(projected.miroCanvas).toBe(collapsed.miroCanvas);
    expect((collapsed.nodes as typeof original.nodes).every((node) => !("projectedCollapsed" in node))).toBe(true);
    expect(projectCollapsedGroups(original)).toBe(original);
  });

  it("projects an empty collapsed group even when it owns no children", () => {
    const original = { nodes: [{ id: "g", type: "group", x: 30, y: 40, width: 700, height: 500 }], edges: [] };
    const collapsed = toggleGroupCollapse(original, "g")!;
    expect(collapsedGroupOwners(collapsed).size).toBe(0);
    expect(projectCollapsedGroups(collapsed).nodes).toEqual([{ ...original.nodes[0], width: 280, height: 64, projectedCollapsed: true }]);
    expect(collapsed.nodes).toEqual(original.nodes);
    expect(toggleGroupCollapse(collapsed, "g")?.nodes).toEqual(original.nodes);
  });

  it("retains captured native membership after a child leaves the original bounds", () => {
    const collapsed = toggleGroupCollapse(board(), "g")!;
    const nodes = collapsed.nodes as ReturnType<typeof board>["nodes"];
    nodes[2].x = 2500;
    expect(groupSelectionIds(collapsed, ["g", "g"])).toEqual(["g", "nested", "a"]);
    expect(collapsedGroupOwners(collapsed).get("a")).toBe("g");
  });

  it("bounds cyclic group membership and elects one visible outer representative", () => {
    const collapsed = toggleGroupCollapse(toggleGroupCollapse(board(), "nested")!, "g")!;
    const meta = collapsed.miroCanvas as { localOverrides: Record<string, { groupCollapse: { children: string[] } }> };
    meta.localOverrides.nested.groupCollapse.children.push("g", "missing");
    expect(groupSelectionIds(collapsed, ["g"])).toEqual(["g", "nested", "a"]);
    expect([...collapsedGroupOwners(collapsed)]).toEqual([["nested", "g"], ["a", "g"]]);
  });

  it("preserves unknown own prototype keys and refuses unsafe or invalid snapshots", () => {
    const original = board();
    Object.defineProperty(original.miroCanvas.localOverrides.g, "__proto__", { value: { exact: true }, enumerable: true });
    const collapsed = toggleGroupCollapse(original, "g")!;
    expect(Object.getOwnPropertyDescriptor((collapsed.miroCanvas as typeof original.miroCanvas).localOverrides.g, "__proto__")?.value).toEqual({ exact: true });
    expect(toggleGroupCollapse(collapsed, "g")).toEqual(original);
    const malformed = board() as any;
    malformed.miroCanvas.localOverrides.g.groupCollapse = { width: 900, height: 700, children: ["a", "a"] };
    expect(toggleGroupCollapse(malformed, "g")).toBeUndefined();
    expect(toggleGroupCollapse({ ...board(), miroCanvas: { schemaVersion: 999 } }, "g")).toBeUndefined();
    let getterInvoked = false;
    const getter = board();
    Object.defineProperty(getter, "unreadable", { enumerable: true, get: () => { getterInvoked = true; return 1; } });
    expect(toggleGroupCollapse(getter, "g")).toBeUndefined();
    expect(getterInvoked).toBe(false);
    const cyclic = board() as any;
    cyclic.future = cyclic;
    expect(toggleGroupCollapse(cyclic, "g")).toBeUndefined();
  });
});

describe("collapsed group ownership for lines and pins", () => {
  const nodeAnchor = (nodeId: string): CanvasAnchor => ({ type: "node", nodeId, u: 0.5, v: 0.5 });
  const edgeAnchor = (edgeId: string): CanvasAnchor => ({ type: "edge", edgeId, t: 0.25 });
  const free = (x: number, y: number): CanvasAnchor => ({ type: "free", x, y });
  const pin = (id: string, origin: "local" | "imported" = "local"): CanvasAnchor => ({ type: "comment", commentId: id, origin });
  function line(id: string, from: CanvasAnchor, to: CanvasAnchor): BoardConnector {
    return { id, from, to, route: "straight", color: "#123456", width: 2, startCap: "none", endCap: "arrow" };
  }
  function richBoard() {
    const initial = board();
    initial.nodes.push({ id: "b", type: "text", text: "Inside", x: 350, y: 300, width: 60, height: 60 });
    return {
      ...initial,
      miroCanvas: {
        ...initial.miroCanvas,
        localOverrides: { ...initial.miroCanvas.localOverrides } as Record<string, Record<string, unknown>>,
        connectors: {} as Record<string, BoardConnector>,
        localComments: [] as Record<string, unknown>[],
        commentPlaces: {} as Record<string, CanvasAnchor>,
        freeAnchors: {} as Record<string, CanvasAnchor | { x: number; y: number }>,
      },
    };
  }
  function owners(document: ReturnType<typeof richBoard>) {
    return collapsedGroupOwners(toggleGroupCollapse(document, "g")!);
  }

  it("owns fully internal native/independent lines and grounded chains; external lines stay visible", () => {
    const document = richBoard();
    document.edges.push({ id: "internal-native", fromNode: "a", toNode: "b", future: true });
    const lines = document.miroCanvas.connectors;
    lines.internal = line("internal", nodeAnchor("a"), free(700, 500));
    lines.chain = line("chain", edgeAnchor("internal"), nodeAnchor("b"));
    lines.nativeChain = line("nativeChain", edgeAnchor("internal-native"), edgeAnchor("chain"));
    lines.external = line("external", nodeAnchor("a"), nodeAnchor("outside"));
    lines.crossingChain = line("crossingChain", edgeAnchor("external"), free(400, 500));
    lines.border = line("border", free(0, 0), free(900, 700));
    lines.root = line("root", nodeAnchor("g"), nodeAnchor("a"));
    lines.outlyingBend = { ...line("outlyingBend", nodeAnchor("a"), nodeAnchor("b")), waypoints: [{ x: 1500, y: 900 }] };
    const map = owners(document);
    for (const id of ["internal-native", "internal", "chain", "nativeChain", "border"]) expect(map.get(id), id).toBe("g");
    for (const id of ["edge", "external", "crossingChain", "root", "outlyingBend"]) expect(map.has(id), id).toBe(false);
  });

  it("uses effective native endpoint overrides instead of fallback-node containment", () => {
    const document = richBoard();
    document.miroCanvas.localOverrides.edge = { connectorAnchors: { to: nodeAnchor("b") } };
    document.edges.push({ id: "internal-native", fromNode: "a", toNode: "b", future: true });
    document.miroCanvas.localOverrides["internal-native"] = { connectorAnchors: { to: free(1300, 100) } };
    expect(owners(document).get("edge")).toBe("g");
    expect(owners(document).has("internal-native")).toBe(false);
  });

  it("owns local/imported/hidden comments, placed pins, free anchors and attached lines", () => {
    const initial = richBoard();
    const document = {
      ...initial,
      miroSource: { ...initial.miroSource, comments: [
        { id: "source", anchor: nodeAnchor("a"), messages: [] },
        { id: "hidden", anchor: free(500, 400), messages: [] },
      ] },
      miroCanvas: { ...initial.miroCanvas, hiddenImportedComments: ["hidden"] },
    };
    document.miroCanvas.localComments.push(
      { id: "local", text: "Comment", origin: "local", anchor: nodeAnchor("a"), replies: [] },
      { id: "placed", text: "Placed", origin: "local", anchor: nodeAnchor("outside"), replies: [] },
      { id: "outside", text: "Outside", origin: "local", anchor: nodeAnchor("a"), replies: [] },
      { id: "chain", text: "Chained", origin: "local", anchor: pin("local"), replies: [] },
    );
    document.miroCanvas.commentPlaces["local:placed"] = free(500, 600);
    document.miroCanvas.commentPlaces["local:outside"] = free(1600, 600);
    document.miroCanvas.connectors.commentLine = line("commentLine", pin("placed"), pin("source", "imported"));
    document.miroCanvas.connectors.hiddenTarget = line("hiddenTarget", pin("hidden", "imported"), nodeAnchor("b"));
    document.miroCanvas.connectors.externalComment = line("externalComment", pin("outside"), nodeAnchor("b"));
    document.miroCanvas.freeAnchors.point = free(450, 200);
    document.miroCanvas.freeAnchors.edgePoint = edgeAnchor("commentLine");
    document.miroCanvas.freeAnchors.commentPoint = pin("local");
    document.miroCanvas.freeAnchors.legacy = { x: 600, y: 500 };
    document.miroCanvas.freeAnchors.outside = free(2000, 2000);
    const original = JSON.stringify(document);
    const map = owners(document);
    for (const id of ["miro-comment:local:local", "miro-comment:local:placed", "miro-comment:local:chain", "miro-comment:imported:source", "miro-comment:imported:hidden", "commentLine", "hiddenTarget", "point", "edgePoint", "commentPoint", "legacy"]) expect(map.get(id), id).toBe("g");
    for (const id of ["miro-comment:local:outside", "externalComment", "outside"]) expect(map.has(id), id).toBe(false);
    expect(JSON.stringify(document)).toBe(original);
  });

  it("bounds connector/comment cycles and keeps ungrounded or external cycles visible", () => {
    const document = richBoard();
    const lines = document.miroCanvas.connectors;
    lines.cycleA = line("cycleA", edgeAnchor("cycleB"), free(400, 300));
    lines.cycleB = line("cycleB", edgeAnchor("cycleA"), nodeAnchor("a"));
    lines.unknownA = line("unknownA", edgeAnchor("unknownB"), edgeAnchor("unknownB"));
    lines.unknownB = line("unknownB", edgeAnchor("unknownA"), edgeAnchor("unknownA"));
    lines.unknownTail = line("unknownTail", edgeAnchor("unknownA"), free(300, 200));
    lines.externalA = line("externalA", edgeAnchor("externalB"), free(300, 200));
    lines.externalB = line("externalB", edgeAnchor("externalA"), nodeAnchor("outside"));
    lines.missing = line("missing", edgeAnchor("absent"), nodeAnchor("a"));
    document.miroCanvas.localComments.push(
      { id: "loopA", text: "A", anchor: pin("loopB"), replies: [] },
      { id: "loopB", text: "B", anchor: pin("loopA"), replies: [] },
      { id: "linePin", text: "Pin", anchor: edgeAnchor("pinCycle"), replies: [] },
    );
    lines.pinCycle = line("pinCycle", pin("linePin"), free(300, 200));
    const map = owners(document);
    for (const id of ["cycleA", "cycleB", "pinCycle", "miro-comment:local:linePin"]) expect(map.get(id), id).toBe("g");
    for (const id of ["unknownA", "unknownB", "unknownTail", "externalA", "externalB", "missing", "miro-comment:local:loopA", "miro-comment:local:loopB"]) expect(map.has(id), id).toBe(false);
  });

  it("resolves a long dependency chain iteratively without a route or recursion", () => {
    const document = richBoard();
    document.miroCanvas.connectors.first = line("first", nodeAnchor("a"), free(300, 200));
    let previous = "first";
    for (let index = 0; index < 2500; index += 1) {
      const id = `chain-${index}`;
      document.miroCanvas.connectors[id] = line(id, edgeAnchor(previous), free(350, 250));
      previous = id;
    }
    expect(owners(document).get(previous)).toBe("g");
  });

  it("gives nested items to the outer visible group even if the inner group comes first", () => {
    const document = richBoard();
    document.nodes = [document.nodes[1], document.nodes[0], ...document.nodes.slice(2)];
    document.miroCanvas.connectors.internal = line("internal", nodeAnchor("a"), free(400, 300));
    const nested = toggleGroupCollapse(document, "nested")!;
    const outer = toggleGroupCollapse(nested, "g")!;
    expect(collapsedGroupOwners(outer).get("internal")).toBe("g");
    const expanded = toggleGroupCollapse(outer, "g")!;
    expect(collapsedGroupOwners(expanded).get("internal")).toBe("nested");
    expect(expanded.nodes).toEqual(document.nodes);
  });

  it("does not let colliding free-anchor IDs overwrite native ownership", () => {
    const document = richBoard();
    document.miroCanvas.freeAnchors.a = free(1500, 2000);
    expect(owners(document).get("a")).toBe("g");
  });

  it("keeps connections between distinct collapsed groups visible", () => {
    const document = richBoard();
    document.nodes.push({ id: "other-group", type: "group", x: 1100, y: -100, width: 400, height: 500 });
    document.miroCanvas.connectors.cross = line("cross", nodeAnchor("a"), nodeAnchor("outside"));
    document.miroCanvas.connectors.otherInternal = line("otherInternal", nodeAnchor("outside"), free(1400, 100));
    const collapsed = toggleGroupCollapse(toggleGroupCollapse(document, "other-group")!, "g")!;
    const map = collapsedGroupOwners(collapsed);
    expect(map.get("outside")).toBe("other-group");
    expect(map.get("otherInternal")).toBe("other-group");
    expect(map.has("cross")).toBe(false);
    expect(map.has("edge")).toBe(false);
  });

  it("keeps a native internal line visible when its stored bends leave the group", () => {
    const document = richBoard();
    document.edges.push({ id: "bent", fromNode: "a", toNode: "b", future: true });
    document.miroCanvas.localOverrides.bent = { connector: { waypoints: [{ x: -30, y: 20 }] } };
    expect(owners(document).has("bent")).toBe(false);
  });
});
