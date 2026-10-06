import { createHtmlElement } from "./dom-elements";
import { setElementStyles } from "./dom-styles";
/**
 * "Arrange panels": a mode, entered from the dock's board menu or its
 * command, in which the bottom tool bar, the dock's icon row and the
 * minimap can be dragged to a new place on the board, and the tool bar's
 * own items can be dragged to reorder them, off the bar into a tray, or
 * back from the tray onto the bar.  The settings list stays a second way to
 * do the same thing; both write `toolbarItems` and `panelLayout` and
 * neither owns either setting.
 *
 * While the mode is on the board itself ignores presses - no selection, no
 * creation, no panning - so a drag never fights the native Canvas for the
 * same gesture.  Everything here reacts to explicit pointer and keyboard
 * input; nothing runs per frame, and outside the mode this module does
 * nothing at all.
 */

import { words } from "./i18n";
import { applyPanelPosition, applyPanelPositionSettled, flipPanelOrientation, positionFromPoint, type PanelId, type PanelPosition, type ViewBox, type ViewSize } from "./panel-layout";
import {
  ALL_TOOLBAR_ITEMS, barItemElements, moveToolbarItem, paintToolbarIcon, removeToolbarItem, toolbarItemLabel, type ToolbarItem,
} from "./quick-tools";

export interface PanelArrangeHost {
  readonly document: Document;
  /** The board's own root: where the banner and the tray mount, and whose presses the mode swallows. */
  readonly boardRoot: HTMLElement;
  readonly setIcon?: (element: HTMLElement, icon: string) => void;
  /** The three movable panels' current elements, by id; a panel not built yet (no document) is left out. */
  readonly panels: () => Readonly<Partial<Record<PanelId, HTMLElement>>>;
  /** The tool bar's own row of items - not the pen's or the connector's row, and not the "+" popover. */
  readonly toolbarBar: () => HTMLElement | undefined;
  readonly toolbarItems: () => readonly ToolbarItem[];
  /** A panel's own stored place, or nothing when it still sits at its CSS default. */
  readonly panelPosition: (id: PanelId) => PanelPosition | undefined;
  /** Saves one panel's new place; a light change the caller need not rebuild anything for. */
  readonly savePanelPosition: (id: PanelId, position: PanelPosition) => void;
  readonly saveToolbarItems: (items: readonly ToolbarItem[]) => void;
  readonly resetLayout: () => void;
  readonly onExit: () => void;
  readonly refreshPanelButtons?: () => void;
  readonly closeToolChoices?: () => void;
}

/** Where the pointer sits relative to each candidate slot's midpoint decides the drop index - the usual drag-reorder rule. */
export function dropIndexFromPointer(
  rects: readonly { readonly left: number; readonly top: number; readonly width: number; readonly height: number }[],
  pointer: { readonly x: number; readonly y: number },
  vertical: boolean,
): number {
  const coord = vertical ? pointer.y : pointer.x;
  for (let index = 0; index < rects.length; index += 1) {
    const rect = rects[index];
    const mid = vertical ? rect.top + rect.height / 2 : rect.left + rect.width / 2;
    if (coord < mid) return index;
  }
  return rects.length;
}

/** True when a point falls inside a rectangle, `getBoundingClientRect`'s own shape. */
export function rectContainsPoint(rect: { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number }, x: number, y: number): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

/** True when a press must be swallowed: it landed neither inside an allowed zone nor on one of its descendants. */
export function pressIsOutside(target: Node | null, zones: readonly (Node | undefined)[]): boolean {
  if (target === null) return true;
  return !zones.some((zone) => zone !== undefined && (zone === target || zone.contains(target)));
}

const GRIP_ATTRIBUTE = "data-miro-canvas-arrange";

/** Keep the spare tools beside a column, or above/below a row, within the uncovered board. */
export function arrangeTrayPlacement(view: ViewBox, bar: ViewBox, tray: ViewSize, vertical: boolean, obstacles: readonly ViewBox[] = []): { readonly left: number; readonly top: number; readonly maxWidth: number; readonly maxHeight: number } {
  const gap = vertical ? 12 : 64;
  const right = view.left + view.width;
  const bottom = view.top + view.height;
  const roomLeft = Math.max(0, bar.left - view.left - gap);
  const roomRight = Math.max(0, right - bar.left - bar.width - gap);
  const roomAbove = Math.max(0, bar.top - view.top - gap);
  const roomBelow = Math.max(0, bottom - bar.top - bar.height - gap);
  const width = Math.min(320, view.width, vertical ? Math.max(roomLeft, roomRight) : view.width);
  const height = Math.min(view.height, vertical ? view.height : Math.max(roomAbove, roomBelow));
  const measuredWidth = Math.min(tray.width, width);
  const measuredHeight = Math.min(tray.height, height);
  const clamp = (value: number, start: number, size: number, itemSize: number): number => Math.min(Math.max(value, start), start + Math.max(0, size - itemSize));
  const left = vertical
    ? (roomRight >= roomLeft ? bar.left + bar.width + gap : bar.left - measuredWidth - gap)
    : bar.left + (bar.width - measuredWidth) / 2;
  const top = vertical
    ? bar.top
    : (roomAbove >= roomBelow ? bar.top - measuredHeight - gap : bar.top + bar.height + gap);
  const placedLeft = clamp(left, view.left, view.width, measuredWidth);
  let placedTop = clamp(top, view.top, view.height, measuredHeight);
  for (let pass = 0; pass < obstacles.length; pass += 1) {
    for (const obstacle of obstacles) {
      if (placedLeft >= obstacle.left + obstacle.width + 8 || placedLeft + measuredWidth + 8 <= obstacle.left) continue;
      if (placedTop >= obstacle.top + obstacle.height + 8 || placedTop + measuredHeight + 8 <= obstacle.top) continue;
      const above = obstacle.top - measuredHeight - 8;
      const below = obstacle.top + obstacle.height + 8;
      if (above >= view.top) placedTop = above;
      else if (below + measuredHeight <= bottom) placedTop = below;
    }
  }
  return {
    left: placedLeft,
    top: placedTop,
    maxWidth: width,
    maxHeight: height,
  };
}

/** Builds and owns the "arrange panels" mode's own DOM: the banner, the tray, and the panels' drag affordance. */
export class PanelArrangeMode {
  private activeState = false;
  private banner: HTMLElement | undefined;
  private tray: HTMLElement | undefined;
  private trayList: HTMLElement | undefined;
  /** One handle per panel, the mode's own: a packed bar leaves little empty room of its own to drag by. */
  private readonly handles: HTMLElement[] = [];
  private readonly panelHandles = new Map<PanelId, HTMLElement>();
  /** The tool bar's and the dock row's own flip button, by panel id - the minimap keeps no orientation of its own. */
  private readonly flipButtons = new Map<PanelId, HTMLElement>();
  private readonly documentListeners: Array<() => void> = [];
  private dragCleanup: (() => void) | undefined;
  private sizeObserver: ResizeObserver | undefined;

  public constructor(private readonly host: PanelArrangeHost) {}

  public get active(): boolean {
    return this.activeState;
  }

  /** The host moved its panels after a resize or a layout update. */
  public refresh(): void {
    if (this.activeState) this.placeTray();
  }

  public enter(): void {
    if (this.activeState) return;
    this.activeState = true;
    const labels = words().arrange;
    const document = this.host.document;
    this.banner = createHtmlElement(document, "div");
    this.banner.className = "miro-canvas-arrange-banner";
    this.banner.setAttribute("role", "status");
    const text = this.banner.appendChild(createHtmlElement(document, "span"));
    text.className = "miro-canvas-arrange-banner__text";
    text.textContent = labels.bannerText;
    const reset = this.banner.appendChild(createHtmlElement(document, "button"));
    reset.type = "button";
    reset.className = "miro-canvas-arrange-banner__button";
    reset.textContent = labels.reset;
    reset.addEventListener("click", () => this.host.resetLayout());
    const done = this.banner.appendChild(createHtmlElement(document, "button"));
    done.type = "button";
    done.className = "miro-canvas-arrange-banner__button miro-canvas-arrange-banner__button--done";
    done.textContent = labels.done;
    done.addEventListener("click", () => this.exit());
    this.host.boardRoot.appendChild(this.banner);

    this.tray = createHtmlElement(document, "div");
    this.tray.className = "miro-canvas-arrange-tray";
    this.tray.setAttribute("aria-label", labels.trayAriaLabel);
    const heading = this.tray.appendChild(createHtmlElement(document, "div"));
    heading.className = "miro-canvas-arrange-tray__heading";
    heading.textContent = labels.trayHeading;
    this.trayList = this.tray.appendChild(createHtmlElement(document, "div"));
    this.trayList.className = "miro-canvas-arrange-tray__list";
    this.host.boardRoot.appendChild(this.tray);
    this.renderTray();

    for (const [key, element] of Object.entries(this.host.panels())) {
      if (element === undefined) continue;
      const id = key as PanelId;
      element.setAttribute(GRIP_ATTRIBUTE, "true");
      // The handle floats outside the panel's own box - beside it, never
      // inside its flow - so a packed bar still has room to drag by, and
      // the mode's own chrome never grows the panel into a neighbour (the
      // minimap sits right above the dock's default place).
      const handle = createHtmlElement(document, "span");
      handle.className = "miro-canvas-arrange-handle";
      element.prepend(handle);
      this.handles.push(handle);
      this.panelHandles.set(id, handle);
      const grip = handle.appendChild(createHtmlElement(document, "span"));
      grip.className = "miro-canvas-arrange-grip";
      grip.setAttribute("aria-hidden", "true");
      if (id === "minimap") {
        const resize = createHtmlElement(document, "button");
        resize.type = "button";
        resize.className = "miro-canvas-arrange-resize";
        resize.setAttribute("aria-label", labels.resizeMinimap);
        this.host.setIcon?.(resize, "scaling");
        element.appendChild(resize);
        this.handles.push(resize);
      }
      // Only the tool bar and the dock's icon row have an orientation of
      // their own to turn; the minimap always keeps the same shape.
      if (id !== "toolbar" && id !== "dockBar") continue;
      const flip = handle.appendChild(createHtmlElement(document, "button"));
      flip.type = "button";
      flip.className = "miro-canvas-arrange-flip";
      flip.setAttribute("aria-label", labels.turnPanel);
      let drawn = false;
      try {
        this.host.setIcon?.(flip, "rotate-cw");
        drawn = this.host.setIcon !== undefined;
      } catch {
        drawn = false;
      }
      if (!drawn) flip.textContent = "⟳";
      this.flipButtons.set(id, flip);
    }

    this.listenDocument("pointerdown", this.onBoardPointerDown as EventListener, true);
    this.listenDocument("keydown", this.onKeyDown as EventListener, true);
    this.placeTray();
    const Observer = this.host.document.defaultView?.ResizeObserver;
    if (typeof Observer === "function") {
      this.sizeObserver = new Observer(() => this.placeTray());
      this.sizeObserver.observe(this.host.boardRoot);
      this.sizeObserver.observe(this.tray);
      const toolbar = this.host.panels().toolbar;
      if (toolbar !== undefined) this.sizeObserver.observe(toolbar);
      this.sizeObserver.observe(this.banner);
    }
  }

  public exit(): void {
    if (!this.activeState) return;
    this.activeState = false;
    this.sizeObserver?.disconnect();
    this.sizeObserver = undefined;
    this.dragCleanup?.();
    this.dragCleanup = undefined;
    this.banner?.remove();
    this.banner = undefined;
    this.tray?.remove();
    this.tray = undefined;
    this.trayList = undefined;
    for (const element of Object.values(this.host.panels())) element?.removeAttribute(GRIP_ATTRIBUTE);
    for (const handle of this.handles.splice(0)) handle.remove();
    this.panelHandles.clear();
    this.flipButtons.clear();
    for (const remove of this.documentListeners.splice(0)) remove();
    this.host.onExit();
  }

  /** Board teardown: leaves no trace, without running `onExit`'s own board-facing cleanup twice. */
  public dispose(): void {
    if (!this.activeState) return;
    this.activeState = false;
    this.sizeObserver?.disconnect();
    this.sizeObserver = undefined;
    this.dragCleanup?.();
    this.dragCleanup = undefined;
    this.banner?.remove();
    this.tray?.remove();
    this.panelHandles.clear();
    for (const remove of this.documentListeners.splice(0)) remove();
  }

  private renderTray(): void {
    const list = this.trayList;
    if (list === undefined) return;
    while (list.firstChild !== null) list.removeChild(list.firstChild);
    const onBar = new Set(this.host.toolbarItems());
    const document = this.host.document;
    for (const item of ALL_TOOLBAR_ITEMS) {
      if (onBar.has(item)) continue;
      const row = list.appendChild(createHtmlElement(document, "div"));
      row.className = "miro-canvas-arrange-tray__item";
      row.setAttribute("data-tool", item);
      const icon = row.appendChild(createHtmlElement(document, "span"));
      icon.className = "miro-canvas-arrange-tray__icon";
      paintToolbarIcon(icon, item, document, this.host.setIcon);
      const label = row.appendChild(createHtmlElement(document, "span"));
      label.className = "miro-canvas-arrange-tray__label";
      label.textContent = toolbarItemLabel(item);
      row.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.startItemDrag(item, "tray", event);
      });
    }
    this.placeTray();
  }

  private placeTray(): void {
    this.placeHandles();
    this.host.refreshPanelButtons?.();
    const tray = this.tray;
    const toolbar = this.host.panels().toolbar;
    if (tray === undefined || toolbar === undefined) return;
    tray.hidden = toolbar.getAttribute("data-miro-canvas-panel-collapsed") === "true";
    if (tray.hidden) return;
    const board = this.host.boardRoot.getBoundingClientRect();
    const bar = toolbar.getBoundingClientRect();
    const banner = this.banner?.getBoundingClientRect();
    const style = this.host.document.defaultView?.getComputedStyle(this.host.boardRoot);
    const foot = Math.max(0, Number.parseFloat(style?.getPropertyValue("--miro-canvas-host-foot") ?? "0") || 0);
    const top = Math.max(8, (banner?.bottom ?? board.top) - board.top + 8);
    const view = { left: 8, top, width: Math.max(0, board.width - 16), height: Math.max(0, board.height - foot - top - 8) };
    const obstacles: ViewBox[] = [];
    for (const button of Array.from(this.host.boardRoot.querySelectorAll?.(".miro-canvas-panel-toggle") ?? [])) {
      const rect = button.getBoundingClientRect();
      obstacles.push({ left: rect.left - board.left, top: rect.top - board.top, width: rect.width, height: rect.height });
    }
    const toolbarHandle = this.panelHandles.get("toolbar")?.getBoundingClientRect();
    if (toolbarHandle !== undefined) obstacles.push({ left: toolbarHandle.left - board.left, top: toolbarHandle.top - board.top, width: toolbarHandle.width, height: toolbarHandle.height });
    for (const [id, element] of Object.entries(this.host.panels())) {
      if (id === "toolbar" || element === undefined) continue;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      const box = { left: rect.left - board.left, top: rect.top - board.top, width: rect.width, height: rect.height };
      obstacles.push(box);
      // A column at an edge leaves a narrower strip for the spare tools.
      if (element.getAttribute("data-miro-canvas-panel-orientation") === "vertical") {
        if (box.left <= view.left + 24) {
          const start = Math.max(view.left, box.left + box.width + 12);
          view.width = Math.max(0, view.width - (start - view.left));
          view.left = start;
        } else if (box.left + box.width >= view.left + view.width - 24) {
          view.width = Math.max(0, box.left - view.left - 12);
        }
      }
      const handle = this.panelHandles.get(id as PanelId)?.getBoundingClientRect();
      if (handle !== undefined) obstacles.push({ left: handle.left - board.left, top: handle.top - board.top, width: handle.width, height: handle.height });
    }
    const barBox = { left: bar.left - board.left, top: bar.top - board.top, width: bar.width, height: bar.height };
    const vertical = toolbar.getAttribute("data-miro-canvas-panel-orientation") === "vertical";
    const measure = (): ViewSize => {
      const rect = tray.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    };
    const limits = arrangeTrayPlacement(view, barBox, measure(), vertical, obstacles);
    tray.style.setProperty("max-width", `${limits.maxWidth}px`);
    tray.style.setProperty("max-height", `${limits.maxHeight}px`);
    const position = arrangeTrayPlacement(view, barBox, measure(), vertical, obstacles);
    tray.style.setProperty("left", `${position.left}px`);
    tray.style.setProperty("top", `${position.top}px`);
  }

  private placeHandles(): void {
    const board = this.host.boardRoot.getBoundingClientRect();
    const banner = this.banner?.getBoundingClientRect();
    const minTop = Math.max(board.top + 8, (banner?.bottom ?? board.top) + 8);
    const style = this.host.document.defaultView?.getComputedStyle(this.host.boardRoot);
    const foot = Math.max(0, Number.parseFloat(style?.getPropertyValue("--miro-canvas-host-foot") ?? "0") || 0);
    for (const [id, handle] of this.panelHandles) {
      const panel = this.host.panels()[id];
      if (panel === undefined) continue;
      const bar = panel.getBoundingClientRect();
      const size = handle.getBoundingClientRect();
      const horizontalToolbar = id === "toolbar" && panel.getAttribute("data-miro-canvas-panel-orientation") !== "vertical";
      const desiredLeft = horizontalToolbar ? bar.right - size.width : bar.left;
      const left = Math.min(Math.max(desiredLeft, board.left + 8), board.right - size.width - 8);
      const above = bar.top - size.height - 8;
      const desiredTop = above >= minTop ? above : bar.bottom + 8;
      let top = Math.max(minTop, Math.min(desiredTop, board.bottom - foot - size.height - 8));
      for (const [otherId, other] of Object.entries(this.host.panels())) {
        if (otherId === id || other === undefined) continue;
        const obstacle = other.getBoundingClientRect();
        if (obstacle.width <= 0 || obstacle.height <= 0) continue;
        if (left >= obstacle.right + 8 || left + size.width + 8 <= obstacle.left) continue;
        if (top >= obstacle.bottom + 8 || top + size.height + 8 <= obstacle.top) continue;
        if (obstacle.top - size.height - 8 >= minTop) top = obstacle.top - size.height - 8;
        else if (obstacle.bottom + 8 + size.height <= board.bottom - foot - 8) top = obstacle.bottom + 8;
      }
      handle.style.setProperty("left", `${left - bar.left}px`);
      handle.style.setProperty("top", `${top - bar.top}px`);
      setElementStyles(handle, { "right": "auto" });
      setElementStyles(handle, { "bottom": "auto" });
    }
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") this.exit();
  };

  private readonly onBoardPointerDown = (event: PointerEvent): void => {
    if (!this.activeState || event.button !== 0) return;
    const target = event.target as Node | null;
    if (pressIsOutside(target, [this.banner, this.tray])) {
      const panels = this.host.panels();
      for (const id of Object.keys(panels) as PanelId[]) {
        const element = panels[id];
        if (element === undefined || pressIsOutside(target, [element])) continue;
        const toggle = (event.target as Element | null)?.closest?.(".miro-canvas-panel-toggle");
        if (toggle != null) return;
        if (id === "minimap" && (event.target as Element | null)?.closest?.(".miro-canvas-arrange-resize") != null) {
          event.preventDefault();
          event.stopPropagation();
          this.startMinimapResize(element, event);
          return;
        }
        const bar = id === "toolbar" ? this.host.toolbarBar() : undefined;
        const more = bar === undefined ? undefined : Array.from(bar.children).find((child) => child.classList.contains("miro-canvas-tools__more"));
        if (more !== undefined && !pressIsOutside(target, [more])) {
          const choices = more.querySelector(".miro-canvas-toolbar__panel");
          if (choices === null || pressIsOutside(target, [choices])) return;
          const spare = barItemElements(choices).find((entry) => ALL_TOOLBAR_ITEMS.includes(entry.item) && !pressIsOutside(target, [entry.element]));
          if (spare === undefined) return;
          event.preventDefault();
          event.stopPropagation();
          this.host.closeToolChoices?.();
          this.startItemDrag(spare.item, "tray", event);
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        const flip = this.flipButtons.get(id);
        if (flip !== undefined && !pressIsOutside(target, [flip])) {
          this.flipPanel(id, element);
          return;
        }
        const hit = bar === undefined ? undefined : barItemElements(bar).find((entry) => !pressIsOutside(target, [entry.element]));
        if (hit !== undefined) this.startItemDrag(hit.item, "bar", event);
        else this.startPanelDrag(id, element, event);
        return;
      }
      // The press landed on the board itself, not on a panel: no selection, no creation, no panning while arranging.
      event.preventDefault();
      event.stopPropagation();
    }
  };

  private startMinimapResize(element: HTMLElement, event: PointerEvent): void {
    const document = this.host.document;
    const board = this.host.boardRoot.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    const original = this.host.panelPosition("minimap");
    const canvas = element.querySelector("canvas")?.getBoundingClientRect();
    const insetWidth = rect.width - (canvas?.width ?? rect.width - 8);
    const insetHeight = rect.height - (canvas?.height ?? rect.height - 8);
    let next: PanelPosition = { ...positionFromPoint({ left: rect.left - board.left, top: rect.top - board.top }, board, rect), ...original };
    const move = (pointer: PointerEvent): void => {
      if (pointer.pointerId !== event.pointerId) return;
      const width = Math.max(100, Math.min(800, board.right - rect.left - insetWidth, rect.width - insetWidth + pointer.clientX - event.clientX));
      const height = Math.max(80, Math.min(600, board.bottom - rect.top - insetHeight, rect.height - insetHeight + pointer.clientY - event.clientY));
      next = { ...next, ...positionFromPoint({ left: rect.left - board.left, top: rect.top - board.top }, board, { width: width + insetWidth, height: height + insetHeight }), width, height };
      applyPanelPositionSettled(element, next, board);
    };
    const cleanup = (): void => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", finish);
      document.removeEventListener("pointercancel", cancel);
      this.dragCleanup = undefined;
    };
    const finish = (pointer: PointerEvent): void => {
      if (pointer.pointerId !== event.pointerId) return;
      move(pointer);
      cleanup();
      this.host.savePanelPosition("minimap", next);
    };
    const cancel = (pointer?: PointerEvent): void => {
      if (pointer !== undefined && pointer.pointerId !== event.pointerId) return;
      cleanup();
      applyPanelPositionSettled(element, original, board);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", finish);
    document.addEventListener("pointercancel", cancel);
    this.dragCleanup = () => cancel();
  }

  private startPanelDrag(id: PanelId, element: HTMLElement, event: PointerEvent): void {
    const document = this.host.document;
    const boardRect = this.host.boardRoot.getBoundingClientRect();
    const panelRect = element.getBoundingClientRect();
    const offsetX = event.clientX - panelRect.left;
    const offsetY = event.clientY - panelRect.top;
    const panelSize = { width: panelRect.width, height: panelRect.height };
    // Moving the panel is a change of place only; a chosen orientation - not
    // the anchor's own default - rides along untouched, so a vertical bar
    // dragged to a new corner stays vertical there.
    const orientation = this.host.panelPosition(id)?.orientation;
    const pointToPosition = (clientX: number, clientY: number): PanelPosition => {
      const at = positionFromPoint(
        { left: clientX - boardRect.left - offsetX, top: clientY - boardRect.top - offsetY },
        { width: boardRect.width, height: boardRect.height },
        panelSize,
      );
      return { ...this.host.panelPosition(id), ...at, ...(orientation === undefined ? {} : { orientation }) };
    };
    const move = (moveEvent: PointerEvent): void => {
      applyPanelPosition(element, pointToPosition(moveEvent.clientX, moveEvent.clientY), { width: boardRect.width, height: boardRect.height }, panelSize);
      this.placeTray();
    };
    const finish = (upEvent: PointerEvent): void => {
      cleanup();
      this.host.savePanelPosition(id, pointToPosition(upEvent.clientX, upEvent.clientY));
      this.placeTray();
    };
    const cleanup = (): void => {
      document.removeEventListener("pointermove", move as EventListener);
      document.removeEventListener("pointerup", finish as EventListener);
      this.dragCleanup = undefined;
    };
    document.addEventListener("pointermove", move as EventListener);
    document.addEventListener("pointerup", finish as EventListener, { once: true });
    this.dragCleanup = cleanup;
  }

  /**
   * Flips a panel's orientation at once: turns its bar the other way, then
   * re-resolves its rect against the panel's new, post-flip size, so it
   * stays inside the view whichever way it grew - a horizontal bar becomes
   * tall and narrow, a vertical one wide and short.
   */
  private flipPanel(id: PanelId, element: HTMLElement): void {
    const boardRect = this.host.boardRoot.getBoundingClientRect();
    const view = { width: boardRect.width, height: boardRect.height };
    const before = element.getBoundingClientRect();
    const stored = this.host.panelPosition(id);
    // A panel still at its CSS default has no stored place of its own yet;
    // its current, on-screen rect stands in for one so the flip has an
    // anchor and offsets to turn.
    const current = stored ?? positionFromPoint(
      { left: before.left - boardRect.left, top: before.top - boardRect.top },
      view,
      { width: before.width, height: before.height },
    );
    const flipped = flipPanelOrientation(current);
    applyPanelPositionSettled(element, flipped, view, { width: before.width, height: before.height });
    this.host.savePanelPosition(id, flipped);
    this.placeTray();
  }

  private startItemDrag(item: ToolbarItem, source: "bar" | "tray", event: PointerEvent): void {
    const bar = this.host.toolbarBar();
    if (bar === undefined) return;
    const document = this.host.document;
    const ghost = createHtmlElement(document, "div");
    ghost.className = "miro-canvas-arrange-ghost";
    const icon = ghost.appendChild(createHtmlElement(document, "span"));
    icon.className = "miro-canvas-arrange-ghost__icon";
    paintToolbarIcon(icon, item, document, this.host.setIcon);
    const label = ghost.appendChild(createHtmlElement(document, "span"));
    label.textContent = toolbarItemLabel(item);
    document.body.appendChild(ghost);
    const marker = createHtmlElement(document, "div");
    marker.className = "miro-canvas-arrange-insertion";
    marker.setAttribute("aria-hidden", "true");
    bar.appendChild(marker);
    const showInsertion = (x: number, y: number): void => {
      const bounds = bar.getBoundingClientRect();
      const withinBar = rectContainsPoint(bounds, x, y);
      marker.hidden = !withinBar;
      bar.setAttribute("data-miro-canvas-arrange-drop", withinBar ? "reorder" : "remove");
      if (!withinBar) return;
      const vertical = this.host.panels().toolbar?.getAttribute("data-miro-canvas-panel-orientation") === "vertical";
      const entries = barItemElements(bar).filter((entry) => entry.item !== item);
      const rects = entries.map((entry) => entry.element.getBoundingClientRect());
      const index = dropIndexFromPointer(rects, { x, y }, vertical);
      marker.setAttribute("data-insert-index", String(index));
      const next = rects[index];
      const last = rects[rects.length - 1];
      const slot = next ?? last ?? bounds;
      const offset = next === undefined && last !== undefined;
      const left = vertical ? slot.left - bounds.left + 4 : (offset ? slot.right + 2 : slot.left - 2) - bounds.left;
      const top = vertical ? (offset ? slot.bottom + 2 : slot.top - 2) - bounds.top : slot.top - bounds.top + 4;
      marker.style.setProperty("left", `${left}px`);
      marker.style.setProperty("top", `${top}px`);
      marker.style.setProperty("width", `${vertical ? Math.max(8, slot.width - 8) : 3}px`);
      marker.style.setProperty("height", `${vertical ? 3 : Math.max(8, slot.height - 8)}px`);
    };
    const place = (x: number, y: number): void => {
      ghost.style.left = `${x}px`;
      ghost.style.top = `${y}px`;
    };
    place(event.clientX, event.clientY);
    showInsertion(event.clientX, event.clientY);
    const move = (moveEvent: PointerEvent): void => {
      place(moveEvent.clientX, moveEvent.clientY);
      showInsertion(moveEvent.clientX, moveEvent.clientY);
    };
    const finish = (upEvent: PointerEvent): void => {
      cleanup();
      const items = this.host.toolbarItems();
      const withinBar = rectContainsPoint(bar.getBoundingClientRect(), upEvent.clientX, upEvent.clientY);
      if (withinBar) {
        const entries = barItemElements(bar).filter((entry) => entry.item !== item);
        const orientation = this.host.panels().toolbar?.getAttribute("data-miro-canvas-panel-orientation");
        const index = dropIndexFromPointer(
          entries.map((entry) => entry.element.getBoundingClientRect()),
          { x: upEvent.clientX, y: upEvent.clientY },
          orientation === "vertical",
        );
        this.host.saveToolbarItems(moveToolbarItem(items, item, index));
      } else if (source === "bar") {
        this.host.saveToolbarItems(removeToolbarItem(items, item));
      } else {
        // A tray item dropped outside the bar stays in the tray.
        this.renderTray();
      }
    };
    const cleanup = (): void => {
      document.removeEventListener("pointermove", move as EventListener);
      document.removeEventListener("pointerup", finish as EventListener);
      document.removeEventListener("pointercancel", cleanup as EventListener);
      marker.remove();
      ghost.remove();
      bar.removeAttribute("data-miro-canvas-arrange-drop");
      this.dragCleanup = undefined;
    };
    document.addEventListener("pointermove", move as EventListener);
    document.addEventListener("pointerup", finish as EventListener, { once: true });
    document.addEventListener("pointercancel", cleanup as EventListener, { once: true });
    this.dragCleanup = cleanup;
  }

  private listenDocument(type: string, handler: EventListener, capture: boolean): void {
    this.host.document.addEventListener(type, handler, capture);
    this.documentListeners.push(() => this.host.document.removeEventListener(type, handler, capture));
  }
}
