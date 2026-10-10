import { describe, expect, it } from "vitest";
import { collapsedGroupOwners, toggleGroupCollapse } from "../src/board-groups";
import { buildCanvasAnchorGeometry } from "../src/connector-endpoints";
import { previewBoardSelection } from "../src/board-selection";

const board = () => ({
  nodes: [
    { id: "group", type: "group", x: 0, y: 0, width: 900, height: 500 },
    { id: "inside", type: "text", text: "A", x: 400, y: 300, width: 100, height: 80 },
    { id: "outside", type: "text", text: "B", x: 1000, y: 0, width: 120, height: 80 },
  ],
  edges: [{ id: "edge", fromNode: "inside", toNode: "outside", fromSide: "right", toSide: "left" }],
  miroCanvas: { schemaVersion: 1, connectors: {
    inner: { id: "inner", from: { type: "free", x: 100, y: 100 }, to: { type: "free", x: 700, y: 400 }, route: "straight", color: "#123456", width: 2, startCap: "none", endCap: "none" },
    chain: { id: "chain", from: { type: "edge", edgeId: "inner", t: 0.5 }, to: { type: "node", nodeId: "outside", u: 0, v: 0.5 }, route: "straight", color: "#123456", width: 2, startCap: "none", endCap: "arrow" },
  } },
  miroSource: { evidence: "preserved" },
});

describe("collapsed group attachment geometry", () => {
  it("keeps native boxes and projects native/independent chain attachments onto the compact group", () => {
    const before = board();
    const collapsed = toggleGroupCollapse(before, "group")!;
    expect(collapsed.nodes).toEqual(before.nodes);
    const owners = collapsedGroupOwners(collapsed);
    const geometry = buildCanvasAnchorGeometry(collapsed, undefined, undefined, undefined, owners);
    expect(geometry.nodes?.group).toEqual({ x: 0, y: 0, width: 280, height: 64 });
    expect(geometry.nodes?.inside).toEqual(geometry.nodes?.group);
    expect(geometry.edges?.edge?.start).toEqual({ x: 280, y: 32 });
    expect(geometry.edges?.chain?.start?.x).toBeLessThanOrEqual(280);
    expect(geometry.edges?.chain?.start?.y).toBeLessThanOrEqual(64);
    expect(collapsed.miroSource).toEqual(before.miroSource);
  });
  it("follows the same proxy during a drag and restores expanded geometry after cancellation", () => {
    const collapsed = toggleGroupCollapse(board(), "group")!;
    const owners = collapsedGroupOwners(collapsed);
    const prior = buildCanvasAnchorGeometry(collapsed, undefined, undefined, undefined, owners);
    const preview = previewBoardSelection(collapsed, ["group", ...owners.keys()], 80, 40);
    const moved = buildCanvasAnchorGeometry(preview, undefined, undefined, prior, owners);
    expect(moved.edges?.edge?.start).toEqual({ x: 360, y: 72 });
    expect(moved.edges?.chain?.end).toEqual(prior.edges?.chain?.end);
    expect(moved.edges?.chain?.start?.x).toBeCloseTo(prior.edges!.chain!.start!.x + 80);
    expect(moved.edges?.chain?.start?.y).toBeCloseTo(prior.edges!.chain!.start!.y + 40);
    expect(buildCanvasAnchorGeometry(collapsed, undefined, undefined, undefined, owners)).toEqual(prior);
    const expanded = toggleGroupCollapse(collapsed, "group")!;
    expect(buildCanvasAnchorGeometry(expanded).nodes?.inside).toEqual({ x: 400, y: 300, width: 100, height: 80 });
  });
});
