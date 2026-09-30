import { describe, expect, it } from "vitest";

import { PALM_CANCEL_MS, PalmRewind, pressedPressure, STYLUS_HOLD_MS, strokeWidthScale, StylusWatch } from "../src/stylus";

// Timings and pressures below are the ones a real S Pen session on a Galaxy
// Tab (SM-X736B, Android 16, Obsidian 1.13) reported to the page.

describe("StylusWatch", () => {
  it("takes a touch for the hand while the pen is near, from its hover as well as its strokes", () => {
    const watch = new StylusWatch({ seen: false });
    expect(watch.touchIsHand(1_000, false)).toBe(false);
    // The pen hovering over the board, before it touches anything.
    watch.notePen(1_000);
    expect(watch.near(1_000 + STYLUS_HOLD_MS - 1)).toBe(true);
    expect(watch.touchIsHand(1_450, false)).toBe(true);
    expect(watch.touchIsHand(1_000 + STYLUS_HOLD_MS, false)).toBe(false);
  });

  it("lets a finger pan rather than draw once the device has shown a pen, on any board", () => {
    const device = { seen: false };
    const first = new StylusWatch(device);
    const second = new StylusWatch(device);
    expect(second.touchIsHand(0, true)).toBe(false);
    first.notePen(0);
    // Long after the pen went away, on another board of the same Obsidian.
    expect(second.seen).toBe(true);
    expect(second.touchIsHand(60_000, true)).toBe(true);
    // Without a drawing tool armed the finger is a finger again.
    expect(second.touchIsHand(60_000, false)).toBe(false);
  });

  it("tells a hovering pen, even one reporting its side button, from one on the screen", () => {
    const watch = new StylusWatch({ seen: false });
    const hover = { pointerType: "pen", pointerId: 7, pressure: 0, buttons: 1 };
    expect(watch.hovering(hover)).toBe(true);
    watch.press(7, 10);
    // The last move of a stroke reports pressure 0 as the pen lifts: still drawing.
    expect(watch.hovering({ ...hover, buttons: 1 })).toBe(false);
    watch.lift(7);
    expect(watch.hovering(hover)).toBe(true);
    expect(watch.hovering({ pointerType: "mouse", pointerId: 1, pressure: 0 })).toBe(false);
    expect(watch.hovering({ pointerType: "touch", pointerId: 11, pressure: 1 })).toBe(false);
    expect(watch.hovering(undefined)).toBe(false);
  });
});

describe("pressedPressure", () => {
  it("reads a pen's pressure on the screen and nothing else", () => {
    expect(pressedPressure({ pointerType: "pen", pressure: 0.174 })).toBe(0.174);
    expect(pressedPressure({ pointerType: "pen", pressure: 0 })).toBeUndefined();
    expect(pressedPressure({ pointerType: "mouse", pressure: 0.5 })).toBeUndefined();
    expect(pressedPressure({ pointerType: "touch", pressure: 1 })).toBeUndefined();
    expect(pressedPressure({ pointerType: "pen", pressure: Number.NaN })).toBeUndefined();
  });
});

describe("strokeWidthScale", () => {
  it("keeps the chosen width for an everyday S Pen stroke, whose pressure peaks around 0.3", () => {
    // Medians of the seven strokes of the recorded session.
    for (const median of [0.071, 0.121, 0.154, 0.17, 0.174, 0.209, 0.226]) {
      const scale = strokeWidthScale([median * 0.6, median, median, median * 1.3]);
      expect(scale).toBeGreaterThan(0.8);
      expect(scale).toBeLessThan(1.05);
    }
  });

  it("widens a hard stroke and narrows a light one, within bounds", () => {
    expect(strokeWidthScale([0.2, 0.2, 0.2])).toBeCloseTo(1);
    expect(strokeWidthScale([0.5, 0.6, 0.55])).toBeGreaterThan(1.4);
    expect(strokeWidthScale([1, 1, 1])).toBe(1.6);
    expect(strokeWidthScale([0.01, 0.01])).toBeGreaterThanOrEqual(0.5);
    expect(strokeWidthScale([0.03, 0.05, 0.04])).toBeLessThan(0.8);
  });

  it("uses the stroke's typical pressure, not one hard moment", () => {
    expect(strokeWidthScale([0.2, 0.2, 0.2, 0.2, 0.95])).toBeCloseTo(1);
  });

  it("draws the width asked for with a mouse, a finger or a pen without a pressure sensor", () => {
    expect(strokeWidthScale([])).toBe(1);
    expect(strokeWidthScale([0, 0])).toBe(1);
    expect(strokeWidthScale([0.5, 0.5, 0.5])).toBe(1);
  });
});

describe("PalmRewind", () => {
  it("puts the board back when Android takes a lone touch back within moments", () => {
    const touches = new PalmRewind<string>();
    // The palm of the recorded session: down, then cancelled 7 ms later.
    touches.land(11, 71_671, () => "card selected");
    expect(touches.cancel(11, 71_678)).toBe("card selected");
    // The second one: 24 ms.
    touches.land(20, 106_494, () => "as it was");
    expect(touches.cancel(20, 106_518)).toBe("as it was");
  });

  it("leaves what a finger did when it lifts, or when the system takes it back later", () => {
    const touches = new PalmRewind<string>();
    touches.land(16, 0, () => "before");
    touches.lift(16);
    expect(touches.cancel(16, 10)).toBeUndefined();
    touches.land(17, 0, () => "before");
    expect(touches.cancel(17, PALM_CANCEL_MS + 1)).toBeUndefined();
  });

  it("does not undo a gesture another finger is still making", () => {
    const touches = new PalmRewind<string>();
    let reads = 0;
    touches.land(18, 0, () => { reads += 1; return "before the pinch"; });
    touches.land(19, 16, () => { reads += 1; return "mid pinch"; });
    // Only the first touch of a gesture reads the board.
    expect(reads).toBe(1);
    expect(touches.cancel(19, 20)).toBeUndefined();
    // Both taken back at once: both were palms.
    expect(touches.cancel(18, 30)).toBe("before the pinch");
    touches.land(21, 100, () => "pan");
    touches.land(22, 105, () => "palm");
    expect(touches.cancel(22, 112)).toBeUndefined();
  });
});
