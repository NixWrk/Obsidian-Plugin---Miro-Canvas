import { describe, expect, it } from "vitest";

import { nativeToolbarItemOf, pointLandsOnBoard, resolveSelectionToolbarPresentation } from "../src/m1-session";

/** A native card-menu button stands in for the real element: only its icon class matters here. */
function nativeButton(iconClass: string | undefined): Element {
  return {
    querySelector: (selector: string) => (iconClass !== undefined && selector === `.${iconClass}` ? {} : null),
  } as unknown as Element;
}

describe("identifying native Canvas's own card-menu buttons", () => {
  it("tells card, note and media apart by the lucide icon each one carries, whatever their order", () => {
    expect(nativeToolbarItemOf(nativeButton("lucide-sticky-note"), 1)).toBe("card");
    expect(nativeToolbarItemOf(nativeButton("lucide-file-text"), 0)).toBe("note");
    expect(nativeToolbarItemOf(nativeButton("lucide-file-image"), 2)).toBe("media");
  });

  it("falls back to cardMenuEl's own position when a future build changes the icon", () => {
    expect(nativeToolbarItemOf(nativeButton("lucide-something-else"), 0)).toBe("card");
    expect(nativeToolbarItemOf(nativeButton("lucide-something-else"), 1)).toBe("note");
    expect(nativeToolbarItemOf(nativeButton("lucide-something-else"), 2)).toBe("media");
    expect(nativeToolbarItemOf(nativeButton(undefined), 3)).toBeUndefined();
  });
});

describe("effective selection toolbar presentation", () => {
  it("shows imported Miro shape, typography, colors, and border before any local edit", () => {
    const presentation = resolveSelectionToolbarPresentation({
      miroSource: { items: [{
        id: "shape", type: "shape", subtype: "star",
        style: {
          fontFamily: "Open Sans", fontSize: 22, fontWeight: 700, fontStyle: "italic",
          textAlign: "center", verticalAlign: "middle", lineHeight: 1.4,
          color: "#112233", fillColor: "#ffeeaa", borderColor: "#445566",
          borderWidth: 4, borderStyle: "dashed",
        },
      }] },
    }, "shape");

    expect(presentation.typography).toMatchObject({
      fontFamily: "Open Sans", fontSize: 22, alignment: "center", verticalAlign: "center",
      lineHeight: 1.4, format: { bold: true, italic: true },
    });
    expect(presentation.colors).toMatchObject({ text: "#112233", fill: "#ffeeaa", border: "#445566" });
    expect(presentation.style).toMatchObject({ shape: "star", borderWidth: 4, borderStyle: "dashed" });
  });

  it("shows imported connector routing and both Miro caps before any local edit", () => {
    const presentation = resolveSelectionToolbarPresentation({
      miroSource: { connectors: [{
        id: "edge", type: "connector", shape: "elbowed",
        style: {
          strokeColor: "#123456", strokeWidth: 5, strokeStyle: "dotted",
          startStrokeCap: "filled_diamond", endStrokeCap: "erd_many",
        },
      }] },
    }, "edge");

    expect(presentation.colors).toMatchObject({ edge: "#123456" });
    expect(presentation.style.connector).toEqual({
      route: "elbowed", strokeStyle: "dotted", startCap: "filled_diamond",
      endCap: "erd_many", width: 5, color: "#123456",
    });
  });

  it("shows a plain Canvas edge with the ends and curve Obsidian draws for it", () => {
    const document = {
      nodes: [{ id: "a", type: "text", text: "", x: 0, y: 0, width: 10, height: 10 },
        { id: "b", type: "text", text: "", x: 50, y: 0, width: 10, height: 10 }],
      edges: [
        { id: "plain", fromNode: "a", toNode: "b" },
        { id: "both", fromNode: "a", toNode: "b", fromEnd: "arrow", toEnd: "arrow" },
        { id: "bare", fromNode: "a", toNode: "b", toEnd: "none" },
      ],
    };
    expect(resolveSelectionToolbarPresentation(document, "plain").style.connector)
      .toMatchObject({ route: "curved", startCap: "none", endCap: "filled_triangle" });
    expect(resolveSelectionToolbarPresentation(document, "both").style.connector)
      .toMatchObject({ startCap: "filled_triangle", endCap: "filled_triangle" });
    expect(resolveSelectionToolbarPresentation(document, "bare").style.connector).toMatchObject({ startCap: "none", endCap: "none" });
    expect(resolveSelectionToolbarPresentation(document, "a").style.connector).toBeUndefined();
  });
});

/** A board root standing in for `M1Session`'s own: a fixed view rect, and one element `elementFromPoint` reports underneath it. */
function boardRoot(rect: { left: number; top: number; right: number; bottom: number }, hit: { closest: (selector: string) => unknown } | null) {
  return {
    getBoundingClientRect: () => rect,
    ownerDocument: { elementFromPoint: () => hit },
  };
}

describe("where a tool dragged off the bar may create something", () => {
  const rect = { left: 0, top: 0, right: 800, bottom: 600 };

  it("is true for a point inside the view that lands on nothing a panel selector matches", () => {
    const bare = boardRoot(rect, { closest: () => null });
    expect(pointLandsOnBoard({ x: 400, y: 300 }, bare)).toBe(true);
  });

  it("is false outside the root's own view, even where nothing else is in the way", () => {
    const bare = boardRoot(rect, { closest: () => null });
    expect(pointLandsOnBoard({ x: -1, y: 300 }, bare)).toBe(false);
    expect(pointLandsOnBoard({ x: 801, y: 300 }, bare)).toBe(false);
    expect(pointLandsOnBoard({ x: 400, y: -1 }, bare)).toBe(false);
    expect(pointLandsOnBoard({ x: 400, y: 601 }, bare)).toBe(false);
  });

  it("is false over a panel - the bar, the dock, a thread - even inside the view", () => {
    const overToolbar = boardRoot(rect, { closest: (selector) => (selector.includes("miro-canvas-toolbar") ? {} : null) });
    expect(pointLandsOnBoard({ x: 400, y: 590 }, overToolbar)).toBe(false);
  });

  it("is false when nothing is under the point at all", () => {
    const nothing = boardRoot(rect, null);
    expect(pointLandsOnBoard({ x: 400, y: 300 }, nothing)).toBe(false);
  });
});
