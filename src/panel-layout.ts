/**
 * Where a movable panel sits on the board: the bottom tool bar, the dock's
 * icon row, and the minimap, each kept relative to the nearest corner or
 * edge of the board's view rather than an absolute pixel, so a resized
 * window keeps every panel inside the view and in its chosen place.
 *
 * This module is pure math and normalization; it never touches the DOM. The
 * one exception, `applyPanelPosition`, only writes the four positioning
 * style properties a caller's own element already owns.
 */

export const PANEL_ANCHORS = [
  "top-left", "top-center", "top-right",
  "left-middle", "right-middle",
  "bottom-left", "bottom-center", "bottom-right",
] as const;
export type PanelAnchor = (typeof PANEL_ANCHORS)[number];

/** The three panels a person can drag; the selection toolbar keeps following the selection instead. */
export const PANEL_IDS = ["toolbar", "dockBar", "minimap"] as const;
export type PanelId = (typeof PANEL_IDS)[number];

/** Which way a bar lays out its items: a row or a column. */
export const PANEL_ORIENTATIONS = ["horizontal", "vertical"] as const;
export type PanelOrientation = (typeof PANEL_ORIENTATIONS)[number];

/**
 * A panel's stored place: the nearest corner or edge, and an offset from it.
 * For a corner anchor both `dx` and `dy` are inward margins from that
 * corner's two edges.  For a `*-center`/`*-middle` anchor the offset along
 * the centred axis (`dx` for top/bottom, `dy` for left/right) is a signed
 * shift from the centre line; the other offset stays an inward margin.
 *
 * `orientation` is a person's own choice, made with the flip button in the
 * layout mode; left unset, the bar keeps the old rule of turning vertical
 * only at a side anchor (`isVerticalAnchor`), so an untouched layout looks
 * exactly as it always did.
 */
export interface PanelPosition {
  readonly anchor: PanelAnchor;
  readonly dx: number;
  readonly dy: number;
  readonly orientation?: PanelOrientation;
}

export interface ViewSize {
  readonly width: number;
  readonly height: number;
}

/** How close a drop must land to an edge or a centre line to snap onto it. */
export const PANEL_SNAP_TOLERANCE = 12;

/** A stored offset a broken settings file cannot be trusted to keep sane. */
const MAX_OFFSET = 100_000;

function clampMargin(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), Math.max(max, 0));
}

/** The panel's top-left corner in view coordinates; always inside the view, whatever the stored offset. */
export function resolvePanelRect(position: PanelPosition, view: ViewSize, panel: ViewSize): { readonly left: number; readonly top: number } {
  const maxLeft = Math.max(0, view.width - panel.width);
  const maxTop = Math.max(0, view.height - panel.height);
  const { anchor, dx, dy } = position;
  switch (anchor) {
    case "top-left": return { left: clampMargin(dx, maxLeft), top: clampMargin(dy, maxTop) };
    case "top-right": return { left: maxLeft - clampMargin(dx, maxLeft), top: clampMargin(dy, maxTop) };
    case "bottom-left": return { left: clampMargin(dx, maxLeft), top: maxTop - clampMargin(dy, maxTop) };
    case "bottom-right": return { left: maxLeft - clampMargin(dx, maxLeft), top: maxTop - clampMargin(dy, maxTop) };
    case "top-center": return { left: Math.min(Math.max(maxLeft / 2 + dx, 0), maxLeft), top: clampMargin(dy, maxTop) };
    case "bottom-center": return { left: Math.min(Math.max(maxLeft / 2 + dx, 0), maxLeft), top: maxTop - clampMargin(dy, maxTop) };
    case "left-middle": return { left: clampMargin(dx, maxLeft), top: Math.min(Math.max(maxTop / 2 + dy, 0), maxTop) };
    case "right-middle": return { left: maxLeft - clampMargin(dx, maxLeft), top: Math.min(Math.max(maxTop / 2 + dy, 0), maxTop) };
  }
}

/** True for the two side anchors, where the bar turns vertical and stacks its items in a column. */
export function isVerticalAnchor(anchor: PanelAnchor): boolean {
  return anchor === "left-middle" || anchor === "right-middle";
}

/** A position's orientation: a person's own choice, or the old anchor-based default when none was made. */
export function effectivePanelOrientation(position: PanelPosition): PanelOrientation {
  return position.orientation ?? (isVerticalAnchor(position.anchor) ? "vertical" : "horizontal");
}

/** The same place, turned the other way: what the layout mode's flip button writes. */
export function flipPanelOrientation(position: PanelPosition): PanelPosition {
  const flipped: PanelOrientation = effectivePanelOrientation(position) === "vertical" ? "horizontal" : "vertical";
  return Object.freeze({ ...position, orientation: flipped });
}

function anchorForZone(horizontal: "left" | "center" | "right", vertical: "top" | "middle" | "bottom"): PanelAnchor {
  if (vertical === "top") return horizontal === "left" ? "top-left" : horizontal === "right" ? "top-right" : "top-center";
  if (vertical === "bottom") return horizontal === "left" ? "bottom-left" : horizontal === "right" ? "bottom-right" : "bottom-center";
  // The middle band: a side stays a side; dead centre has no anchor of its
  // own, so it falls back to the bottom, the commonest place for a bar.
  if (horizontal === "left") return "left-middle";
  if (horizontal === "right") return "right-middle";
  return "bottom-center";
}

/**
 * Turns a raw drop point into a stored position: snaps the point onto an
 * edge or a centre line within `PANEL_SNAP_TOLERANCE`, then picks the
 * anchor whose corner or edge the (snapped) point now sits nearest to.  The
 * result always resolves back to the same point through `resolvePanelRect`.
 */
export function positionFromPoint(
  point: { readonly left: number; readonly top: number },
  view: ViewSize,
  panel: ViewSize,
  snapTolerance = PANEL_SNAP_TOLERANCE,
): PanelPosition {
  const maxLeft = Math.max(0, view.width - panel.width);
  const maxTop = Math.max(0, view.height - panel.height);
  const centerLeft = maxLeft / 2;
  const centerTop = maxTop / 2;
  let left = Math.min(Math.max(point.left, 0), maxLeft);
  let top = Math.min(Math.max(point.top, 0), maxTop);
  if (left <= snapTolerance) left = 0;
  else if (maxLeft - left <= snapTolerance) left = maxLeft;
  else if (Math.abs(left - centerLeft) <= snapTolerance) left = centerLeft;
  if (top <= snapTolerance) top = 0;
  else if (maxTop - top <= snapTolerance) top = maxTop;
  else if (Math.abs(top - centerTop) <= snapTolerance) top = centerTop;

  // The zone comes from where the panel's centre sits in the view, in
  // thirds, so a panel need not touch an edge to be read as belonging to it.
  const cx = left + panel.width / 2;
  const cy = top + panel.height / 2;
  const nx = view.width > 0 ? cx / view.width : 0.5;
  const ny = view.height > 0 ? cy / view.height : 0.5;
  const horizontal = nx < 1 / 3 ? "left" : nx > 2 / 3 ? "right" : "center";
  const vertical = ny < 1 / 3 ? "top" : ny > 2 / 3 ? "bottom" : "middle";
  const anchor = anchorForZone(horizontal, vertical);

  switch (anchor) {
    case "top-left": return Object.freeze({ anchor, dx: left, dy: top });
    case "top-right": return Object.freeze({ anchor, dx: maxLeft - left, dy: top });
    case "bottom-left": return Object.freeze({ anchor, dx: left, dy: maxTop - top });
    case "bottom-right": return Object.freeze({ anchor, dx: maxLeft - left, dy: maxTop - top });
    case "top-center": return Object.freeze({ anchor, dx: left - centerLeft, dy: top });
    case "bottom-center": return Object.freeze({ anchor, dx: left - centerLeft, dy: maxTop - top });
    case "left-middle": return Object.freeze({ anchor, dx: left, dy: top - centerTop });
    case "right-middle": return Object.freeze({ anchor, dx: maxLeft - left, dy: top - centerTop });
  }
}

/** Accepts any stored value and returns a usable position, or nothing for one too broken to trust. */
export function normalizePanelPosition(value: unknown): PanelPosition | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const { anchor, dx, dy, orientation } = value as { anchor?: unknown; dx?: unknown; dy?: unknown; orientation?: unknown };
  if (!(PANEL_ANCHORS as readonly string[]).includes(anchor as string)) return undefined;
  if (typeof dx !== "number" || !Number.isFinite(dx)) return undefined;
  if (typeof dy !== "number" || !Number.isFinite(dy)) return undefined;
  const bound = (offset: number): number => Math.min(Math.max(offset, -MAX_OFFSET), MAX_OFFSET);
  // An unrecognised orientation is dropped rather than distrusting the whole
  // position: the bar just keeps the anchor's own default until chosen again.
  const validOrientation = (PANEL_ORIENTATIONS as readonly string[]).includes(orientation as string)
    ? (orientation as PanelOrientation)
    : undefined;
  return Object.freeze({
    anchor: anchor as PanelAnchor, dx: bound(dx), dy: bound(dy),
    ...(validOrientation === undefined ? {} : { orientation: validOrientation }),
  });
}

/**
 * The stored layout: an entry per panel that has been moved from its
 * default place.  A panel missing here, or one whose stored entry does not
 * survive `normalizePanelPosition`, keeps today's place - the CSS default,
 * which this module never overrides.
 */
export type PanelLayout = Readonly<Partial<Record<PanelId, PanelPosition>>>;

/** Accepts any stored value and always returns a usable layout, dropping unknown panels and broken entries. */
export function normalizePanelLayout(value: unknown): PanelLayout {
  if (typeof value !== "object" || value === null) return Object.freeze({});
  const source = value as Record<string, unknown>;
  const layout: Partial<Record<PanelId, PanelPosition>> = {};
  for (const id of PANEL_IDS) {
    const position = normalizePanelPosition(source[id]);
    if (position !== undefined) layout[id] = position;
  }
  return Object.freeze(layout);
}

/** An element whose inline position this module may write; a real `HTMLElement` satisfies it. */
export interface StyledElement {
  readonly style: {
    setProperty(name: string, value: string): void;
    removeProperty(name: string): void;
  };
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
}

/**
 * Writes (or clears) one panel's inline position.  With no stored position
 * every inline override is removed, so the element falls back to its own
 * CSS default exactly as it always did - the tool bar's own default centres
 * itself with `left: 50%` plus a `transform: translateX(-50%)`, and that
 * pairing must stay intact.  With a stored position, `left`/`top` are
 * already the panel's literal top-left corner (`resolvePanelRect`'s own
 * contract), so that centring transform would double-shift it - by half the
 * panel's own width, unnoticed on a narrow vertical bar but enough to run a
 * wide horizontal one halfway under whatever sits to the view's own left -
 * and is cleared along with `right`/`bottom`, which take over from `left`/
 * `top` the same way.
 */
export function applyPanelPosition(element: StyledElement, position: PanelPosition | undefined, view: ViewSize, panel: ViewSize): void {
  const style = element.style;
  if (position === undefined) {
    for (const property of ["left", "top", "right", "bottom", "transform"]) style.removeProperty(property);
    element.setAttribute("data-miro-canvas-panel-orientation", "horizontal");
    element.removeAttribute("data-miro-canvas-panel-side");
    return;
  }
  const { left, top } = resolvePanelRect(position, view, panel);
  style.setProperty("left", `${left}px`);
  style.setProperty("top", `${top}px`);
  style.setProperty("right", "auto");
  style.setProperty("bottom", "auto");
  style.setProperty("transform", "none");
  element.setAttribute("data-miro-canvas-panel-orientation", effectivePanelOrientation(position));
  // Which half of the view the panel actually landed in, from its resolved
  // rect rather than the anchor's name, so a vertical bar's popovers know
  // which way is "towards the middle" whatever anchor put it there.
  const center = left + panel.width / 2;
  element.setAttribute("data-miro-canvas-panel-side", view.width > 0 && center > view.width / 2 ? "right" : "left");
}

/** An element this module can also measure; a real `HTMLElement` satisfies this too. */
export interface MeasurableElement extends StyledElement {
  getBoundingClientRect?: () => { readonly width: number; readonly height: number };
}

/**
 * `applyPanelPosition`, but safe against a stale size.  The element's own
 * rendered width/height, read right before a call, may still reflect
 * whatever orientation it had a moment ago - a fresh mount, or a flip that
 * just changed the very attribute this function writes - rather than the
 * one `position` is about to give it.  This applies once, which writes the
 * orientation attribute and lets the element's own CSS react, then
 * re-measures; if the size actually changed, it applies again against the
 * settled size, so the final `left`/`top` are never resolved against the
 * size the element is leaving rather than the one it lands on.
 *
 * `before`, when the caller already has a fresh rect of its own (a drag or
 * a flip that just measured one), skips the first read.
 */
export function applyPanelPositionSettled(
  element: MeasurableElement,
  position: PanelPosition | undefined,
  view: ViewSize,
  before?: ViewSize,
): void {
  const measure = (): ViewSize => {
    const rect = typeof element.getBoundingClientRect === "function" ? element.getBoundingClientRect() : undefined;
    return rect === undefined ? { width: 0, height: 0 } : { width: rect.width, height: rect.height };
  };
  if (position === undefined) {
    // Clearing needs no size at all, so there is nothing worth measuring for it.
    applyPanelPosition(element, undefined, view, { width: 0, height: 0 });
    return;
  }
  const firstSize = before ?? measure();
  applyPanelPosition(element, position, view, firstSize);
  const settled = measure();
  if (settled.width !== firstSize.width || settled.height !== firstSize.height) {
    applyPanelPosition(element, position, view, settled);
  }
}
