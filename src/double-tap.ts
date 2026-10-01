/**
 * A double tap on the board, timed from the pointers themselves.
 *
 * A mouse double-clicks through the browser's own `dblclick`.  A finger does
 * not reliably: native Canvas takes the press of a touch for itself and
 * cancels its default, after which the browser counts no click, so a double
 * tap on the board can reach the page as two separate taps and nothing more.
 * This watch tells a pair of taps from a drag, a hold or a pinch.
 */

/** The longest a press may last and still be a tap rather than a hold. */
export const TAP_MAX_MS = 300;
/** The farthest, in screen pixels, a tap may wander between landing and lifting. */
export const TAP_SLOP = 10;
/** How soon after the first tap lifted the second must land. */
export const DOUBLE_TAP_MS = 300;
/** How near the first tap, in screen pixels, the second must land. */
export const DOUBLE_TAP_REACH = 40;
/** A press never lifted - the window lost focus under it - is forgotten after this long. */
const STALE_PRESS_MS = 3_000;

export interface TapPoint {
  readonly x: number;
  readonly y: number;
}

interface Press {
  readonly point: TapPoint;
  readonly at: number;
  /** Whether it landed where a double tap counts, with no other pointer down. */
  eligible: boolean;
  /** Whether it landed soon enough and near enough after a tap to be its pair. */
  readonly second: boolean;
}

function distance(from: TapPoint, to: TapPoint): number {
  return Math.hypot(to.x - from.x, to.y - from.y);
}

/** How long a press is remembered as the first or the second of a double click that may follow it. */
const DOUBLE_CLICK_MEMORY_MS = 1_000;

/**
 * The last two presses on the board, and whether each was a hand beside the
 * pen.  The browser's own `dblclick` says nothing of the pointer that made
 * it, so a double click is judged by the two presses it came from: a touch
 * that landed while the pen was near is the palm or the hand that holds it,
 * and its double click is no Escape.
 */
export class RecentPresses {
  private readonly lastTwo: { readonly byHand: boolean; readonly at: number }[] = [];

  /** A pointer lands; `byHand` when it is a touch that came down beside the pen. */
  public note(byHand: boolean, now: number): void {
    this.lastTwo.push({ byHand, at: now });
    if (this.lastTwo.length > 2) this.lastTwo.shift();
  }

  /** Whether a double click arriving now came from a hand: either of its two presses was one. */
  public handMadeDoubleClick(now: number): boolean {
    return this.lastTwo.some((press) => press.byHand && now - press.at <= DOUBLE_CLICK_MEMORY_MS);
  }

  /** Forgets every press, as when the board is put away. */
  public reset(): void {
    this.lastTwo.length = 0;
  }
}

/**
 * One board's taps.  The owner of the board feeds it every press and release
 * of a finger or a pen; a release that completes a pair of taps says so.
 */
export class DoubleTapWatch {
  private readonly presses = new Map<number, Press>();
  private lastTap: { readonly point: TapPoint; readonly at: number } | undefined;

  /**
   * A pointer lands.  `counts` is whether it landed where a double tap is
   * the board's to take: on the empty board, not on a card or a control.
   */
  public press(pointerId: number, point: TapPoint, now: number, counts: boolean): void {
    for (const [id, held] of this.presses) {
      if (now - held.at > STALE_PRESS_MS) this.presses.delete(id);
    }
    // A second pointer down together with the first is a pinch or a palm.
    const alone = this.presses.size === 0;
    if (!alone) {
      for (const other of this.presses.values()) other.eligible = false;
      this.lastTap = undefined;
    }
    const last = this.lastTap;
    const second = last !== undefined && now - last.at <= DOUBLE_TAP_MS && distance(last.point, point) <= DOUBLE_TAP_REACH;
    this.presses.set(pointerId, { point, at: now, eligible: counts && alone, second });
  }

  /** A pointer lifts; true when this tap is the second of a double tap. */
  public release(pointerId: number, point: TapPoint, now: number): boolean {
    const press = this.presses.get(pointerId);
    this.presses.delete(pointerId);
    if (press === undefined) return false;
    const tapped = press.eligible && now - press.at <= TAP_MAX_MS && distance(press.point, point) <= TAP_SLOP;
    if (!tapped) {
      this.lastTap = undefined;
      return false;
    }
    if (press.second) {
      this.lastTap = undefined;
      return true;
    }
    this.lastTap = { point, at: now };
    return false;
  }

  /** A pointer is taken back, as Android takes back a palm: nothing it did counts. */
  public cancel(pointerId: number): void {
    this.presses.delete(pointerId);
    this.lastTap = undefined;
  }

  /** Forgets every press and tap, as when the board is put away. */
  public reset(): void {
    this.presses.clear();
    this.lastTap = undefined;
  }
}
