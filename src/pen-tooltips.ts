import { setElementStyles } from "./dom-styles";
/**
 * Hover text for a stylus, on a phone or a tablet.
 *
 * Obsidian shows a control's `aria-label` as a tooltip when a mouse rests on
 * it.  On a phone or a tablet it shows none: a finger never hovers, and a
 * stylus hovering over the screen (an S Pen held just above it) reports itself
 * as a "pen" pointer without the mouse events Obsidian's tooltips wait for.  So
 * the board's controls, whose pictures are named only by their hover text, were
 * unreadable to someone holding the pen.
 *
 * This watches the pointers of a whole window.  A pen that is over a control of
 * this plugin and not touching the screen shows that control's label after the
 * delay the control asks for (`data-tooltip-delay`, as Obsidian reads it), in
 * Obsidian's own tooltip look (its `tooltip` classes) placed beside the control
 * where it asks (`data-tooltip-position`) and kept in view.  It goes when the
 * pen leaves the control or the range of the screen, touches the screen, or
 * anything else is pressed.  A finger and a mouse never get one from here, and
 * on a computer nothing happens at all: the mouse keeps Obsidian's own tooltips,
 * and a pen there is left to them too, so that never two show.
 *
 * It does nothing while the pointer is still and no frame work at all: a few
 * listeners on the window, and one timer waiting at a time.
 */
import { OBSIDIAN_TOOLTIP_DELAY } from "./tooltips";

/** The room a tooltip keeps from the window's edge, in pixels. */
const VIEW_MARGIN = 4;
/** From the control to the tooltip's edge: the arrow and a little air, as Obsidian leaves it. */
const CONTROL_GAP = 13;

type Placement = "top" | "bottom" | "left" | "right";

/** Where Obsidian's own tooltip classes put the arrow: only a placement other than below has a class of its own. */
const PLACEMENT_CLASS: Readonly<Record<Placement, string>> = {
  top: " mod-top",
  bottom: "",
  left: " mod-left",
  right: " mod-right",
};

/** A labelled element standing for a group of controls, not a control itself: it names the group and says nothing hovered. */
const CONTAINER_ROLES: ReadonlySet<string> = new Set(["toolbar", "group", "region", "dialog", "list", "listbox", "tablist", "menu", "presentation"]);

export interface PenTooltipsOptions {
  /** Whether this is a phone or a tablet; read at each hover, so it may change. */
  readonly isMobile?: () => boolean;
}

/** What one window has: its listeners, the control the pen is over, and the tooltip or the wait for it. */
interface WindowState {
  readonly document: Document;
  readonly view: Window;
  /** Takes the window's listeners away. */
  remove: () => void;
  /** The pens that touch the screen now; a pen in contact is writing, not hovering. */
  readonly touching: Set<number>;
  hovered: Element | undefined;
  wait: number | undefined;
  tooltip: HTMLElement | undefined;
}

/** The control with a label that a pointer's target is part of, when it is one of this plugin's and a control. */
function labelledControl(target: unknown): HTMLElement | undefined {
  const element = elementOf(target);
  if (element === undefined) return undefined;
  const labelled = element.closest<HTMLElement>("[aria-label]");
  if (labelled === null) return undefined;
  const label = labelled.getAttribute("aria-label");
  if (label === null || label.trim() === "") return undefined;
  if (CONTAINER_ROLES.has(labelled.getAttribute("role") ?? "")) return undefined;
  // Only the plugin's own: an element of its own, or one of Canvas's moved into its panels.
  if (labelled.closest('[class*="miro-canvas-"], [class*="miro-source-"]') === null) return undefined;
  return labelled;
}

function elementOf(target: unknown): Element | undefined {
  if (typeof target !== "object" || target === null) return undefined;
  const node = target as { readonly nodeType?: number; readonly parentElement?: Element | null; readonly closest?: unknown };
  // A text node's pointer events belong to the element holding it.
  if (node.nodeType === 3) return node.parentElement ?? undefined;
  return typeof node.closest === "function" ? (target as Element) : undefined;
}

function placementOf(control: Element): Placement {
  const asked = control.getAttribute("data-tooltip-position");
  return asked === "top" || asked === "left" || asked === "right" || asked === "bottom" ? asked : "bottom";
}

function delayOf(control: Element): number {
  const asked = Number(control.getAttribute("data-tooltip-delay") ?? OBSIDIAN_TOOLTIP_DELAY);
  return Number.isFinite(asked) && asked >= 0 ? asked : Number(OBSIDIAN_TOOLTIP_DELAY);
}

export class PenTooltips {
  private readonly windows = new Map<Document, WindowState>();

  public constructor(private readonly options: PenTooltipsOptions = {}) {}

  /** Starts watching a window's pointers; again for one already watched does nothing. */
  public attach(document: Document | undefined | null): void {
    const view = document?.defaultView;
    if (document === undefined || document === null || view === undefined || view === null || this.windows.has(document)) return;
    const state: WindowState = {
      document, view, touching: new Set<number>(), hovered: undefined, wait: undefined, tooltip: undefined,
      remove: () => undefined,
    };
    const over = (event: Event): void => this.enter(state, event as PointerEvent);
    const out = (event: Event): void => this.leave(state, event as PointerEvent);
    const down = (event: Event): void => {
      const pointer = event as PointerEvent;
      if (pointer.pointerType === "pen") state.touching.add(pointer.pointerId);
      // A press of any kind, a finger's too, is the end of looking at hover text.
      this.dismiss(state);
    };
    const up = (event: Event): void => {
      state.touching.delete((event as PointerEvent).pointerId);
    };
    const cancel = (event: Event): void => {
      state.touching.delete((event as PointerEvent).pointerId);
      this.dismiss(state);
    };
    const away = (): void => this.dismiss(state);
    const listeners: readonly (readonly [EventTarget, string, EventListener])[] = [
      [document, "pointerover", over],
      [document, "pointerout", out],
      [document, "pointerdown", down],
      [document, "pointerup", up],
      [document, "pointercancel", cancel],
      [view, "blur", away],
      [document, "visibilitychange", away],
    ];
    for (const [target, type, listener] of listeners) target.addEventListener(type, listener, true);
    state.remove = () => {
      for (const [target, type, listener] of listeners) target.removeEventListener(type, listener, true);
    };
    this.windows.set(document, state);
  }

  /** Stops watching a window, and takes away what it shows. */
  public detach(document: Document | undefined | null): void {
    if (document === undefined || document === null) return;
    const state = this.windows.get(document);
    if (state === undefined) return;
    this.dismiss(state);
    state.remove();
    this.windows.delete(document);
  }

  public dispose(): void {
    for (const document of [...this.windows.keys()]) this.detach(document);
  }

  /**
   * A pointer comes over something: the pen over a control of the plugin starts
   * the wait for its label.  Another pointer coming and going - a mouse, a
   * finger, or the mouse a browser makes of a pen it is driven with - is not
   * the pen's business: it neither shows a tooltip nor takes the pen's away
   * (a press of one does, below).
   */
  private enter(state: WindowState, event: PointerEvent): void {
    if (event.pointerType !== "pen") return;
    if (state.touching.has(event.pointerId) || this.options.isMobile?.() === false) {
      this.dismiss(state);
      return;
    }
    const control = labelledControl(event.target);
    if (control === state.hovered && control !== undefined) return;
    this.dismiss(state);
    if (control === undefined) return;
    state.hovered = control;
    state.wait = state.view.setTimeout(() => {
      state.wait = undefined;
      this.show(state, control);
    }, delayOf(control));
  }

  /** A pointer goes out of something: the pen out of the control it was over, or out of range, takes the tooltip away. */
  private leave(state: WindowState, event: PointerEvent): void {
    if (event.pointerType !== "pen" || state.hovered === undefined) return;
    const into = elementOf(event.relatedTarget);
    // Over another part of the same control is still over it.
    if (into !== undefined && state.hovered.contains(into)) return;
    this.dismiss(state);
  }

  private show(state: WindowState, control: HTMLElement): void {
    if (state.hovered !== control || !control.isConnected) return;
    // Obsidian's own tooltip is up (a mouse, or a pen it hears on a computer): never two.
    if (state.document.querySelector(".tooltip") !== null) return;
    const label = control.getAttribute("aria-label");
    if (label === null || label === "") return;
    const body = state.document.body;
    const tooltip = state.document.createElement("div");
    tooltip.className = "tooltip miro-canvas-pen-tooltip";
    tooltip.setAttribute("role", "tooltip");
    setElementStyles(tooltip, { "position": "fixed" });
    setElementStyles(tooltip, { "pointer-events": "none" });
    setElementStyles(tooltip, { "visibility": "hidden" });
    tooltip.appendChild(state.document.createTextNode(label));
    const arrow = state.document.createElement("div");
    arrow.className = "tooltip-arrow";
    tooltip.appendChild(arrow);
    body.appendChild(tooltip);
    state.tooltip = tooltip;
    this.place(state, control, tooltip);
    setElementStyles(tooltip, { "visibility": "" });
  }

  /**
   * Beside the control where it asks, on the other side when there is no room
   * on that one, and kept in the window along the other axis.  Obsidian's own
   * classes put the arrow on the side that faces the control.
   */
  private place(state: WindowState, control: Element, tooltip: HTMLElement): void {
    const view = state.view;
    const box = control.getBoundingClientRect();
    const own = tooltip.getBoundingClientRect();
    const width = own.width;
    const height = own.height;
    const room = { width: view.innerWidth, height: view.innerHeight };
    let placement = placementOf(control);
    const fits: Readonly<Record<Placement, boolean>> = {
      top: box.top - CONTROL_GAP - height >= VIEW_MARGIN,
      bottom: box.bottom + CONTROL_GAP + height <= room.height - VIEW_MARGIN,
      left: box.left - CONTROL_GAP - width >= VIEW_MARGIN,
      right: box.right + CONTROL_GAP + width <= room.width - VIEW_MARGIN,
    };
    const opposite: Readonly<Record<Placement, Placement>> = { top: "bottom", bottom: "top", left: "right", right: "left" };
    if (!fits[placement] && fits[opposite[placement]]) placement = opposite[placement];
    const across = (centre: number, size: number, limit: number): number =>
      Math.min(Math.max(centre, size / 2 + VIEW_MARGIN), Math.max(limit - size / 2 - VIEW_MARGIN, size / 2 + VIEW_MARGIN));
    const centreX = (box.left + box.right) / 2;
    const centreY = (box.top + box.bottom) / 2;
    let left: number;
    let top: number;
    let transform: string;
    if (placement === "top" || placement === "bottom") {
      left = across(centreX, width, room.width);
      top = placement === "top" ? box.top - CONTROL_GAP - height : box.bottom + CONTROL_GAP;
      transform = "translateX(-50%)";
    } else {
      top = across(centreY, height, room.height);
      left = placement === "left" ? box.left - CONTROL_GAP - width : box.right + CONTROL_GAP;
      transform = "translateY(-50%)";
    }
    tooltip.className = `tooltip miro-canvas-pen-tooltip${PLACEMENT_CLASS[placement]}`;
    tooltip.setAttribute("data-tooltip-placement", placement);
    // Its size as measured, as Obsidian's own tooltip fixes it: left alone it would shrink to the room
    // that is left between where it is put and the edge of the window.
    setElementStyles(tooltip, { "box-sizing": "border-box" });
    tooltip.style.width = `${width}px`;
    tooltip.style.height = `${height}px`;
    tooltip.style.left = `${Math.round(left * 100) / 100}px`;
    tooltip.style.top = `${Math.round(top * 100) / 100}px`;
    tooltip.style.transform = transform;
  }

  /** Away with the tooltip and the wait for one, and forget the control the pen was over. */
  private dismiss(state: WindowState): void {
    if (state.wait !== undefined) state.view.clearTimeout(state.wait);
    state.wait = undefined;
    state.tooltip?.remove();
    state.tooltip = undefined;
    state.hovered = undefined;
  }
}
