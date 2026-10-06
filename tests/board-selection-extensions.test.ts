import { describe, expect, it } from "vitest";
import { commentSelectionId, previewBoardSelection, translateBoardSelection, type SelectedRouteEnds } from "../src/board-selection";
import { buildCanvasAnchorGeometry } from "../src/connector-endpoints";

const extra = { future: { nested: [1, { keep: true }] } };
const at = (input: unknown, ...keys: string[]): unknown => {
  let current = input;
  for (const key of keys) current = (current as Record<string, unknown>)[key];
  return current;
};
const board = () => ({
  future: extra,
  miroSource: { items: [{ id: "source", future: extra }], comments: [
    { id: "imported", text: "Imported", anchor: { type: "node", nodeId: "a", u: 0.5, v: 0.5, ...extra } },
  ] },
  nodes: [{ id: "a", type: "text", x: 0, y: 0, width: 30, height: 30 }, { id: "b", type: "text", x: 300, y: 0, width: 30, height: 30 }],
  edges: [{ id: "native", fromNode: "a", toNode: "b", future: extra }],
  miroCanvas: { schemaVersion: 1, future: extra,
    localOverrides: { native: { future: extra,
      connector: { waypoints: [{ x: 100, y: 60, ...extra }], future: extra },
      connectorAnchors: { from: { type: "free", x: 15, y: 15, ...extra }, to: { type: "free", x: 315, y: 15, ...extra }, future: extra },
    } },
    connectors: { line: { id: "line", from: { type: "free", x: 15, y: 15, ...extra }, to: { type: "free", x: 400, y: 15, ...extra },
      waypoints: [{ x: 100, y: 60, ...extra }], route: "straight", color: "#123456", width: 2, startCap: "none", endCap: "arrow", future: extra } },
    localComments: [{ id: "local", text: "Local", anchor: { type: "free", x: 15, y: 35, ...extra }, replies: [] }],
    commentPlaces: {},
  },
});

function parity(before: Record<string, unknown>, ids: string[], ends: Readonly<Record<string, SelectedRouteEnds>> = {}): Record<string, unknown> {
  const original = structuredClone(before);
  const preview = previewBoardSelection(before, ids, 20, 10, ends);
  const committed = translateBoardSelection(before, ids, 20, 10, ends);
  expect(preview).toEqual(committed);
  expect(before).toEqual(original);
  expect(preview.miroSource).toBe(before.miroSource);
  expect(committed.miroSource).toEqual(before.miroSource);
  return committed;
}

describe("selection transformations retain extension fields", () => {
  for (const mask of [undefined, { from: true, to: true, wholeRoute: true }, { from: true, to: false, wholeRoute: false }]) {
    it(`preserves native and independent waypoints/free anchors with mask ${JSON.stringify(mask)}`, () => {
      let before: Record<string, unknown> = board();
      for (let move = 1; move <= 2; move += 1) {
        const ends: Record<string, SelectedRouteEnds> = mask === undefined ? {} : { native: mask, line: mask };
        const after = parity(before, ["native", "line"], ends);
        for (const [record, id] of [["localOverrides", "native"], ["connectors", "line"]]) {
          const base = ["miroCanvas", record, id];
          const waypoint = record === "localOverrides" ? [...base, "connector", "waypoints", "0"] : [...base, "waypoints", "0"];
          expect(at(after, ...waypoint)).toEqual({ x: mask?.wholeRoute === false ? 100 : 100 + 20 * move, y: mask?.wholeRoute === false ? 60 : 60 + 10 * move, ...extra });
          const anchors = record === "localOverrides" ? [...base, "connectorAnchors"] : base;
          expect(at(after, ...anchors, "from")).toEqual({ type: "free", x: 15 + 20 * move, y: 15 + 10 * move, ...extra });
          expect(at(after, ...anchors, "to")).toEqual({ type: "free", x: (record === "localOverrides" ? 315 : 400) + (mask?.to === false ? 0 : 20 * move), y: 15 + (mask?.to === false ? 0 : 10 * move), ...extra });
        }
        before = after;
      }
    });
  }

  for (const type of ["node", "image", "edge", "comment"]) {
    it(`keeps extensions when a captured ${type} anchor detaches, removing known attachment fields`, () => {
      const before = board();
      const anchor = type === "node" || type === "image" ? { type, nodeId: "a", u: 0.5, v: 0.5, ...extra }
        : type === "edge" ? { type, edgeId: "native", t: 0, ...extra }
        : { type, commentId: "local", origin: "local", ...extra };
      const input = { ...before, nodes: type === "image" ? [{ ...before.nodes[0], type: "file", file: "picture.png" }, before.nodes[1]] : before.nodes, miroCanvas: { ...before.miroCanvas,
        connectors: { line: { ...before.miroCanvas.connectors.line, from: anchor } },
        localOverrides: { native: { ...before.miroCanvas.localOverrides.native, connectorAnchors: {
          ...before.miroCanvas.localOverrides.native.connectorAnchors, from: type === "edge" ? { type: "node", nodeId: "a", u: 0.5, v: 0.5, ...extra } : anchor,
        } } },
      } };
      const from = buildCanvasAnchorGeometry(input).edges?.line?.start;
      expect(from).toBeDefined();
      const after = parity(input, ["line"], { line: { from: true, to: false, wholeRoute: false } });
      expect(at(after, "miroCanvas", "connectors", "line", "from")).toEqual({ ...extra, type: "free", x: from!.x + 20, y: from!.y + 10 });
      if (type !== "edge") {
        const native = buildCanvasAnchorGeometry(input).edges?.native?.start;
        expect(native).toBeDefined();
        const moved = parity(input, ["native"], { native: { from: true, to: false, wholeRoute: false } });
        expect(at(moved, "miroCanvas", "localOverrides", "native", "connectorAnchors", "from")).toEqual({ ...extra, type: "free", x: native!.x + 20, y: native!.y + 10 });
      }
    });
  }

  for (const origin of ["local", "imported"] as const) {
    for (const placed of [false, true]) {
      it(`retains ${origin} comment anchor extensions, existing placement=${placed}`, () => {
        const before = board();
        const id = origin === "local" ? "local" : "imported";
        const key = `${origin}:${id}`;
        if (placed) before.miroCanvas.commentPlaces = { [key]: { type: "free", x: 200, y: 50, ...extra } };
        const point = buildCanvasAnchorGeometry(before).comments?.[key];
        expect(point).toBeDefined();
        const after = parity(before, [commentSelectionId(origin, id)]);
        expect(at(after, "miroCanvas", "commentPlaces", key)).toEqual({ ...extra, type: "free", x: point!.x + 20, y: point!.y + 10 });
      });
    }
  }

  it("removes legacy attachment fields when native ends and comment places become free", () => {
    const before = board();
    const legacy = { type: "node", kind: "node", nodeId: "a", targetId: "a", elementId: "a", u: 0.5, v: 0.5, edgeId: "old", t: 0, commentId: "old", origin: "local", ...extra };
    const input = { ...before, miroCanvas: { ...before.miroCanvas,
      commentPlaces: { "local:local": legacy },
      localOverrides: { native: { ...before.miroCanvas.localOverrides.native, connectorAnchors: { from: legacy } } },
    } };
    const after = parity(input, ["native", commentSelectionId("local", "local")], { native: { from: true, to: false, wholeRoute: false } });
    for (const keys of [["commentPlaces", "local:local"], ["localOverrides", "native", "connectorAnchors", "from"]]) {
      expect(at(after, "miroCanvas", ...keys)).toEqual({ ...extra, type: "free", x: 35, y: 25 });
    }
  });
});
