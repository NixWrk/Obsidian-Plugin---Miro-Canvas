import { describe, expect, it } from "vitest";

import {
  PANEL_ANCHORS,
  applyPanelPosition,
  isVerticalAnchor,
  normalizePanelLayout,
  normalizePanelPosition,
  positionFromPoint,
  resolvePanelRect,
  type PanelPosition,
} from "../src/panel-layout";

const VIEW = { width: 1200, height: 800 };
const PANEL = { width: 200, height: 40 };

describe("resolvePanelRect", () => {
  it("keeps a panel inside the view for every anchor, whatever the view size", () => {
    for (const anchor of PANEL_ANCHORS) {
      for (const view of [{ width: 1200, height: 800 }, { width: 300, height: 200 }, { width: 40, height: 20 }]) {
        const position: PanelPosition = { anchor, dx: 5000, dy: -5000 };
        const rect = resolvePanelRect(position, view, PANEL);
        expect(rect.left, anchor).toBeGreaterThanOrEqual(0);
        expect(rect.top, anchor).toBeGreaterThanOrEqual(0);
        expect(rect.left, anchor).toBeLessThanOrEqual(Math.max(0, view.width - PANEL.width));
        expect(rect.top, anchor).toBeLessThanOrEqual(Math.max(0, view.height - PANEL.height));
      }
    }
  });

  it("places each corner anchor at its own corner, inward by dx/dy", () => {
    expect(resolvePanelRect({ anchor: "top-left", dx: 10, dy: 20 }, VIEW, PANEL)).toEqual({ left: 10, top: 20 });
    expect(resolvePanelRect({ anchor: "top-right", dx: 10, dy: 20 }, VIEW, PANEL))
      .toEqual({ left: VIEW.width - PANEL.width - 10, top: 20 });
    expect(resolvePanelRect({ anchor: "bottom-left", dx: 10, dy: 20 }, VIEW, PANEL))
      .toEqual({ left: 10, top: VIEW.height - PANEL.height - 20 });
    expect(resolvePanelRect({ anchor: "bottom-right", dx: 10, dy: 20 }, VIEW, PANEL))
      .toEqual({ left: VIEW.width - PANEL.width - 10, top: VIEW.height - PANEL.height - 20 });
  });

  it("centres a top/bottom anchor and shifts it by dx", () => {
    const maxLeft = VIEW.width - PANEL.width;
    expect(resolvePanelRect({ anchor: "bottom-center", dx: 0, dy: 16 }, VIEW, PANEL))
      .toEqual({ left: maxLeft / 2, top: VIEW.height - PANEL.height - 16 });
    expect(resolvePanelRect({ anchor: "top-center", dx: 30, dy: 0 }, VIEW, PANEL).left).toBe(maxLeft / 2 + 30);
  });

  it("centres a left/right-middle anchor and shifts it by dy", () => {
    const maxTop = VIEW.height - PANEL.height;
    expect(resolvePanelRect({ anchor: "left-middle", dx: 8, dy: 0 }, VIEW, PANEL))
      .toEqual({ left: 8, top: maxTop / 2 });
    expect(resolvePanelRect({ anchor: "right-middle", dx: 8, dy: -50 }, VIEW, PANEL).top).toBe(maxTop / 2 - 50);
  });

  it("never lets a panel grow larger than the view produce a negative rect", () => {
    const rect = resolvePanelRect({ anchor: "bottom-right", dx: 0, dy: 0 }, { width: 10, height: 10 }, PANEL);
    expect(rect.left).toBe(0);
    expect(rect.top).toBe(0);
  });
});

describe("isVerticalAnchor", () => {
  it("is true only for the two side-middle anchors", () => {
    for (const anchor of PANEL_ANCHORS) {
      expect(isVerticalAnchor(anchor)).toBe(anchor === "left-middle" || anchor === "right-middle");
    }
  });
});

describe("positionFromPoint", () => {
  it("round-trips through resolvePanelRect: the stored position resolves back to the same point", () => {
    const drops = [
      { left: 0, top: 0 }, { left: 1000, top: 0 }, { left: 1000, top: 760 }, { left: 0, top: 760 },
      { left: 500, top: 0 }, { left: 500, top: 760 }, { left: 0, top: 380 }, { left: 1000, top: 380 },
      { left: 340, top: 210 },
    ];
    for (const drop of drops) {
      const position = positionFromPoint(drop, VIEW, PANEL, 0);
      const resolved = resolvePanelRect(position, VIEW, PANEL);
      expect(resolved, JSON.stringify(drop)).toEqual(drop);
    }
  });

  it("snaps a drop within tolerance onto the nearest edge", () => {
    const maxLeft = VIEW.width - PANEL.width;
    const near = positionFromPoint({ left: maxLeft - 5, top: 0 }, VIEW, PANEL);
    expect(resolvePanelRect(near, VIEW, PANEL).left).toBe(maxLeft);
    const farEnough = positionFromPoint({ left: maxLeft - 40, top: 0 }, VIEW, PANEL);
    expect(resolvePanelRect(farEnough, VIEW, PANEL).left).toBe(maxLeft - 40);
  });

  it("snaps a drop within tolerance onto the horizontal centre line", () => {
    const maxLeft = VIEW.width - PANEL.width;
    const near = positionFromPoint({ left: maxLeft / 2 + 6, top: 760 }, VIEW, PANEL);
    expect(resolvePanelRect(near, VIEW, PANEL).left).toBe(maxLeft / 2);
  });

  it("turns the bar vertical near a left or right edge", () => {
    const left = positionFromPoint({ left: 0, top: 380 }, VIEW, PANEL, 0);
    expect(isVerticalAnchor(left.anchor)).toBe(true);
    expect(left.anchor).toBe("left-middle");
    const right = positionFromPoint({ left: 1000, top: 380 }, VIEW, PANEL, 0);
    expect(isVerticalAnchor(right.anchor)).toBe(true);
    expect(right.anchor).toBe("right-middle");
  });

  it("keeps the bar horizontal away from a side edge", () => {
    const bottom = positionFromPoint({ left: 500, top: 760 }, VIEW, PANEL, 0);
    expect(isVerticalAnchor(bottom.anchor)).toBe(false);
  });
});

describe("normalizePanelPosition", () => {
  it("accepts a well-formed position", () => {
    expect(normalizePanelPosition({ anchor: "top-left", dx: 5, dy: 5 })).toEqual({ anchor: "top-left", dx: 5, dy: 5 });
  });

  it("rejects an unknown anchor, a missing offset, or a non-finite offset", () => {
    expect(normalizePanelPosition({ anchor: "middle", dx: 0, dy: 0 })).toBeUndefined();
    expect(normalizePanelPosition({ anchor: "top-left", dx: 0 })).toBeUndefined();
    expect(normalizePanelPosition({ anchor: "top-left", dx: NaN, dy: 0 })).toBeUndefined();
    expect(normalizePanelPosition("top-left")).toBeUndefined();
    expect(normalizePanelPosition(undefined)).toBeUndefined();
  });

  it("clamps an absurd offset instead of rejecting the whole entry", () => {
    const position = normalizePanelPosition({ anchor: "top-left", dx: 1e9, dy: -1e9 });
    expect(position?.dx).toBe(100_000);
    expect(position?.dy).toBe(-100_000);
  });
});

describe("normalizePanelLayout", () => {
  it("falls back to an empty layout - today's places - for anything unusable", () => {
    expect(normalizePanelLayout(undefined)).toEqual({});
    expect(normalizePanelLayout(null)).toEqual({});
    expect(normalizePanelLayout("nonsense")).toEqual({});
    expect(normalizePanelLayout({})).toEqual({});
  });

  it("keeps only the recognised panels, dropping unknown keys and broken entries", () => {
    const layout = normalizePanelLayout({
      toolbar: { anchor: "bottom-center", dx: 0, dy: 16 },
      dockBar: { anchor: "nonsense", dx: 0, dy: 0 },
      minimap: { anchor: "top-right", dx: 12, dy: 12 },
      somethingElse: { anchor: "top-left", dx: 0, dy: 0 },
    });
    expect(layout).toEqual({
      toolbar: { anchor: "bottom-center", dx: 0, dy: 16 },
      minimap: { anchor: "top-right", dx: 12, dy: 12 },
    });
  });
});

describe("applyPanelPosition", () => {
  function fakeElement(): { style: Map<string, string>; attributes: Map<string, string>; element: import("../src/panel-layout").StyledElement } {
    const style = new Map<string, string>();
    const attributes = new Map<string, string>();
    const element = {
      style: {
        setProperty: (name: string, value: string) => { style.set(name, value); },
        removeProperty: (name: string) => { style.delete(name); },
      },
      setAttribute: (name: string, value: string) => { attributes.set(name, value); },
    };
    return { style, attributes, element };
  }

  it("clears every inline position property when the panel has no stored place", () => {
    const { style, attributes, element } = fakeElement();
    style.set("left", "1px");
    style.set("bottom", "2px");
    applyPanelPosition(element, undefined, VIEW, PANEL);
    expect(style.size).toBe(0);
    expect(attributes.get("data-miro-canvas-panel-orientation")).toBe("horizontal");
  });

  it("writes left/top and clears right/bottom for a stored place", () => {
    const { style, attributes, element } = fakeElement();
    applyPanelPosition(element, { anchor: "top-left", dx: 10, dy: 20 }, VIEW, PANEL);
    expect(style.get("left")).toBe("10px");
    expect(style.get("top")).toBe("20px");
    expect(style.get("right")).toBe("auto");
    expect(style.get("bottom")).toBe("auto");
    expect(attributes.get("data-miro-canvas-panel-orientation")).toBe("horizontal");
  });

  it("marks the orientation vertical for a side anchor", () => {
    const { attributes, element } = fakeElement();
    applyPanelPosition(element, { anchor: "left-middle", dx: 0, dy: 0 }, VIEW, PANEL);
    expect(attributes.get("data-miro-canvas-panel-orientation")).toBe("vertical");
  });
});
