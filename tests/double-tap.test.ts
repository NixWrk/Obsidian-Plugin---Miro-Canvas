import { describe, expect, it } from "vitest";

import { DOUBLE_TAP_MS, DOUBLE_TAP_REACH, DoubleTapWatch, TAP_MAX_MS, TAP_SLOP } from "../src/double-tap";

/** One tap of a finger: down, then up, `lasted` milliseconds later, `moved` pixels to the right. */
function tap(watch: DoubleTapWatch, id: number, at: { x: number; y: number }, now: number, options: { lasted?: number; moved?: number; counts?: boolean } = {}): boolean {
  watch.press(id, at, now, options.counts ?? true);
  return watch.release(id, { x: at.x + (options.moved ?? 0), y: at.y }, now + (options.lasted ?? 40));
}

describe("a double tap of a finger or a pen", () => {
  it("is two quick taps near each other: the second one's lift completes it", () => {
    const watch = new DoubleTapWatch();
    expect(tap(watch, 1, { x: 300, y: 300 }, 1_000)).toBe(false);
    expect(tap(watch, 2, { x: 310, y: 305 }, 1_200)).toBe(true);
  });

  it("is not a third tap's pair: it takes two to make one, and the next tap starts a new pair", () => {
    const watch = new DoubleTapWatch();
    tap(watch, 1, { x: 300, y: 300 }, 1_000);
    expect(tap(watch, 2, { x: 300, y: 300 }, 1_150)).toBe(true);
    expect(tap(watch, 3, { x: 300, y: 300 }, 1_300)).toBe(false);
    expect(tap(watch, 4, { x: 300, y: 300 }, 1_450)).toBe(true);
  });

  it("needs the second tap to land soon after the first lifted", () => {
    const watch = new DoubleTapWatch();
    tap(watch, 1, { x: 300, y: 300 }, 1_000);
    // The first lifted at 1 040.
    expect(tap(watch, 2, { x: 300, y: 300 }, 1_040 + DOUBLE_TAP_MS + 1)).toBe(false);
    tap(watch, 3, { x: 300, y: 300 }, 5_000);
    expect(tap(watch, 4, { x: 300, y: 300 }, 5_040 + DOUBLE_TAP_MS)).toBe(true);
  });

  it("needs the second tap near the first", () => {
    const watch = new DoubleTapWatch();
    tap(watch, 1, { x: 300, y: 300 }, 1_000);
    expect(tap(watch, 2, { x: 300 + DOUBLE_TAP_REACH + 1, y: 300 }, 1_100)).toBe(false);
    // That one stands as a first tap now, and its pair is the third.
    expect(tap(watch, 3, { x: 300 + DOUBLE_TAP_REACH + 5, y: 300 }, 1_250)).toBe(true);
  });

  it("is no tap when the finger is held, or moves: a hold is a long press, a move is a pan or a drag", () => {
    const watch = new DoubleTapWatch();
    tap(watch, 1, { x: 300, y: 300 }, 1_000);
    expect(tap(watch, 2, { x: 300, y: 300 }, 1_100, { lasted: TAP_MAX_MS + 1 })).toBe(false);
    tap(watch, 3, { x: 300, y: 300 }, 2_000);
    expect(tap(watch, 4, { x: 300, y: 300 }, 2_100, { moved: TAP_SLOP + 1 })).toBe(false);
    // A first tap that was held never pairs with the next.
    tap(watch, 5, { x: 300, y: 300 }, 3_000, { lasted: TAP_MAX_MS + 50 });
    expect(tap(watch, 6, { x: 300, y: 300 }, 3_500)).toBe(false);
  });

  it("is not made by a press that landed where a double tap does not count, and breaks a pair begun before it", () => {
    const watch = new DoubleTapWatch();
    tap(watch, 1, { x: 300, y: 300 }, 1_000);
    // The second landed on a card: no double tap, and the pair is broken.
    expect(tap(watch, 2, { x: 300, y: 300 }, 1_100, { counts: false })).toBe(false);
    // The next tap begins a pair of its own, which only a tap after it completes.
    expect(tap(watch, 3, { x: 300, y: 300 }, 1_200)).toBe(false);
    watch.reset();
    // A first tap on a card begins no pair.
    expect(tap(watch, 4, { x: 300, y: 300 }, 2_000, { counts: false })).toBe(false);
    expect(tap(watch, 5, { x: 300, y: 300 }, 2_100)).toBe(false);
  });

  it("is not made by a pinch or a palm: a second pointer down at the same time spoils both", () => {
    const watch = new DoubleTapWatch();
    tap(watch, 1, { x: 300, y: 300 }, 1_000);
    watch.press(2, { x: 300, y: 300 }, 1_100, true);
    watch.press(3, { x: 500, y: 300 }, 1_110, true);
    expect(watch.release(2, { x: 300, y: 300 }, 1_150)).toBe(false);
    expect(watch.release(3, { x: 500, y: 300 }, 1_160)).toBe(false);
    expect(tap(watch, 4, { x: 300, y: 300 }, 1_250)).toBe(false);
  });

  it("forgets a pointer Android took back, and the tap before it", () => {
    const watch = new DoubleTapWatch();
    tap(watch, 1, { x: 300, y: 300 }, 1_000);
    watch.press(2, { x: 300, y: 300 }, 1_100, true);
    watch.cancel(2);
    expect(watch.release(2, { x: 300, y: 300 }, 1_120)).toBe(false);
    expect(tap(watch, 3, { x: 300, y: 300 }, 1_200)).toBe(false);
  });

  it("forgets a press that was never lifted, after a while, rather than counting every later tap as a pinch", () => {
    const watch = new DoubleTapWatch();
    watch.press(1, { x: 300, y: 300 }, 1_000, true);
    expect(tap(watch, 2, { x: 300, y: 300 }, 10_000)).toBe(false);
    expect(tap(watch, 3, { x: 300, y: 300 }, 10_150)).toBe(true);
  });

  it("answers nothing for a lift it never saw land", () => {
    expect(new DoubleTapWatch().release(9, { x: 0, y: 0 }, 1_000)).toBe(false);
  });
});
