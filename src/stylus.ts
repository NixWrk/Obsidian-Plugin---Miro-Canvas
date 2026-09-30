/**
 * A stylus and a hand on the same screen: which of them a touch belongs to,
 * and how hard the stylus pressed.
 *
 * On a tablet such as a Galaxy Tab with an S Pen, the pen reports itself
 * as a "pen" pointer, near the screen (hovering, pressure 0) as well as on
 * it, while a finger and a palm are both "touch".  Android rejects a palm
 * itself, but only after the page has seen it land: a touch pointerdown
 * followed some 10 ms later by pointercancel.  The palm often lands before
 * the pen is near enough to be reported at all.
 */

/** How long after a stylus was last seen, pressed or hovering, a touch is still taken for the hand holding it. */
export const STYLUS_HOLD_MS = 1_500;

/** Whether a stylus has been seen on this device since Obsidian started; every board shares it. */
export interface StylusMemory {
  seen: boolean;
}

/** The one this Obsidian shares between its boards: a pen seen on one board is known to the next. */
const DEVICE_STYLUS: StylusMemory = { seen: false };

/**
 * One board's view of the stylus: when it was last near, and whether one
 * was ever seen here or on another board of this Obsidian.
 */
export class StylusWatch {
  private lastPenAt = Number.NEGATIVE_INFINITY;
  /** The pens on the screen now, by pointer: pressed and not yet lifted. */
  private readonly pressed = new Set<number>();

  public constructor(private readonly device: StylusMemory = DEVICE_STYLUS) {}

  /** A pen event of any kind: pressed, drawing, or hovering over the board. */
  public notePen(now: number): void {
    this.lastPenAt = now;
    this.device.seen = true;
  }

  /** A pen touches the screen. */
  public press(pointerId: number, now: number): void {
    this.pressed.add(pointerId);
    this.notePen(now);
  }

  /** A pen leaves the screen, or Android takes it back. */
  public lift(pointerId: number): void {
    this.pressed.delete(pointerId);
  }

  /**
   * A pen near the screen but not on it.  With the S Pen's side button held
   * it reports that button pressed while it only hovers (buttons 1,
   * pressure 0), so only whether it came down tells hovering from drawing;
   * the pressure alone does not either, since the last move of a stroke
   * reports 0 as the pen lifts.
   */
  public hovering(event: unknown): boolean {
    if (typeof event !== "object" || event === null) return false;
    const pointer = event as { readonly pointerType?: unknown; readonly pointerId?: unknown };
    return pointer.pointerType === "pen" && typeof pointer.pointerId === "number" && !this.pressed.has(pointer.pointerId);
  }

  /** Whether a stylus has been seen on this device at all. */
  public get seen(): boolean {
    return this.device.seen;
  }

  /** Whether the pen is in use right now: on the screen or near it a moment ago. */
  public near(now: number): boolean {
    return now - this.lastPenAt < STYLUS_HOLD_MS;
  }

  /**
   * Whether a touch belongs to the hand rather than to what is armed.  While
   * the pen is near, a touch is the palm or the hand that holds it; with a
   * drawing tool armed on a device that has a pen, a finger pans instead of
   * drawing, as Miro behaves on tablets.
   */
  public touchIsHand(now: number, drawingToolArmed: boolean): boolean {
    return this.near(now) || (drawingToolArmed && this.device.seen);
  }
}

/** A stylus's pressure while it touches the screen; hover and a released pen report 0. */
export function pressedPressure(event: { readonly pointerType?: string; readonly pressure?: number }): number | undefined {
  if (event.pointerType !== "pen") return undefined;
  const pressure = event.pressure;
  return typeof pressure === "number" && Number.isFinite(pressure) && pressure > 0 ? pressure : undefined;
}

/** The narrowest and the widest a stroke's pressure makes it, as a share of the width chosen. */
const MIN_PRESSURE_SCALE = 0.5;
const MAX_PRESSURE_SCALE = 1.6;
/**
 * The pressure an everyday stroke is drawn with, which keeps the width
 * chosen.  An S Pen writes between about 0.07 and 0.3 (median around 0.17,
 * measured on a Galaxy Tab); a pen that presses harder widens the line and
 * a light touch narrows it, gently.
 */
const EVERYDAY_PRESSURE = 0.2;
const PRESSURE_GAIN = 1.5;
/** What a pointer without a pressure sensor reports while pressed. */
const NO_SENSOR_PRESSURE = 0.5;

/**
 * How much a stylus's pressure widens or narrows a stroke, from the
 * pressures its points reported.  The typical pressure of the stroke is
 * used, not its peak, which a single hard moment would otherwise decide.
 * A mouse, a finger and a pen without a pressure sensor all draw the line
 * that was asked for.
 */
export function strokeWidthScale(pressures: readonly number[]): number {
  const samples = pressures.filter((pressure) => Number.isFinite(pressure) && pressure > 0);
  if (samples.length === 0) return 1;
  if (samples.every((pressure) => pressure === NO_SENSOR_PRESSURE)) return 1;
  const sorted = [...samples].sort((left, right) => left - right);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  const scale = 1 + (median - EVERYDAY_PRESSURE) * PRESSURE_GAIN;
  return Math.min(Math.max(scale, MIN_PRESSURE_SCALE), MAX_PRESSURE_SCALE);
}

/**
 * How soon after landing a touch Android takes back is a palm: it rejected
 * palms 7 to 25 ms after they landed on a Galaxy Tab; a finger it takes back
 * later belongs to a gesture of the system's own.
 */
export const PALM_CANCEL_MS = 250;

/**
 * The touches on a board, and how the board looked before each one that
 * landed alone.  When Android takes a touch back (pointercancel) soon after
 * it landed and no other finger is down, it was a palm: whatever native
 * Canvas already did with it - put the selection away on the press, moved
 * the board a little - is to be put back as it was.
 */
export class PalmRewind<Snapshot> {
  private readonly touches = new Map<number, { readonly at: number; readonly before: Snapshot | undefined }>();

  /** A touch lands; the board is read only when no other finger is down. */
  public land(pointerId: number, now: number, read: () => Snapshot): void {
    const alone = this.touches.size === 0;
    this.touches.set(pointerId, { at: now, before: alone ? read() : undefined });
  }

  /** A touch lifted as a finger does: whatever it did stands. */
  public lift(pointerId: number): void {
    this.touches.delete(pointerId);
  }

  /** Android took a touch back: the board as it was before, when that touch was a palm. */
  public cancel(pointerId: number, now: number): Snapshot | undefined {
    const touch = this.touches.get(pointerId);
    this.touches.delete(pointerId);
    if (touch === undefined || touch.before === undefined) return undefined;
    if (now - touch.at > PALM_CANCEL_MS) return undefined;
    // Another finger still down is a gesture of its own, which stands.
    if (this.touches.size > 0) return undefined;
    return touch.before;
  }
}
