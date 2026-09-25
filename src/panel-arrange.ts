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
import { applyPanelPosition, applyPanelPositionSettled, flipPanelOrientation, positionFromPoint, type PanelId, type PanelPosition } from "./panel-layout";
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
}

/** Where the pointer sits relative to each candidate slot's midpoint decides the drop index - the usual drag-reorder rule. */
export function dropIndexFromPointer(
  rects: readonly { readonly left: number; readonly top: number; readonly width: number; readonly height: number }[],
  pointer: { readonly x: number; readonly y: number },
  vertical: boolean,
): number {
  const coord = vertical ? pointer.y : pointer.x;
  for (let index = 0; index < rects.length; index += 1) {
    const rect = rects[index]!;
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

/** Builds and owns the "arrange panels" mode's own DOM: the banner, the tray, and the panels' drag affordance. */
export class PanelArrangeMode {
  private activeState = false;
  private banner: HTMLElement | undefined;
  private tray: HTMLElement | undefined;
  private trayList: HTMLElement | undefined;
  /** One handle per panel, the mode's own: a packed bar leaves little empty room of its own to drag by. */
  private readonly handles: HTMLElement[] = [];
  /** The tool bar's and the dock row's own flip button, by panel id - the minimap keeps no orientation of its own. */
  private readonly flipButtons = new Map<PanelId, HTMLElement>();
  private readonly documentListeners: Array<() => void> = [];
  private dragCleanup: (() => void) | undefined;

  public constructor(private readonly host: PanelArrangeHost) {}

  public get active(): boolean {
    return this.activeState;
  }

  public enter(): void {
    if (this.activeState) return;
    this.activeState = true;
    const labels = words().arrange;
    const document = this.host.document;
    this.banner = document.createElement("div");
    this.banner.className = "miro-canvas-arrange-banner";
    this.banner.setAttribute("role", "status");
    const text = this.banner.appendChild(document.createElement("span"));
    text.className = "miro-canvas-arrange-banner__text";
    text.textContent = labels.bannerText;
    const reset = this.banner.appendChild(document.createElement("button"));
    reset.type = "button";
    reset.className = "miro-canvas-arrange-banner__button";
    reset.textContent = labels.reset;
    reset.addEventListener("click", () => this.host.resetLayout());
    const done = this.banner.appendChild(document.createElement("button"));
    done.type = "button";
    done.className = "miro-canvas-arrange-banner__button miro-canvas-arrange-banner__button--done";
    done.textContent = labels.done;
    done.addEventListener("click", () => this.exit());
    this.host.boardRoot.appendChild(this.banner);

    this.tray = document.createElement("div");
    this.tray.className = "miro-canvas-arrange-tray";
    this.tray.setAttribute("aria-label", labels.trayAriaLabel);
    const heading = this.tray.appendChild(document.createElement("div"));
    heading.className = "miro-canvas-arrange-tray__heading";
    heading.textContent = labels.trayHeading;
    this.trayList = this.tray.appendChild(document.createElement("div"));
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
      const handle = document.createElement("span");
      handle.className = "miro-canvas-arrange-handle";
      element.prepend(handle);
      this.handles.push(handle);
      const grip = handle.appendChild(document.createElement("span"));
      grip.className = "miro-canvas-arrange-grip";
      grip.setAttribute("aria-hidden", "true");
      // Only the tool bar and the dock's icon row have an orientation of
      // their own to turn; the minimap always keeps the same shape.
      if (id !== "toolbar" && id !== "dockBar") continue;
      const flip = handle.appendChild(document.createElement("button"));
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
  }

  public exit(): void {
    if (!this.activeState) return;
    this.activeState = false;
    this.dragCleanup?.();
    this.dragCleanup = undefined;
    this.banner?.remove();
    this.banner = undefined;
    this.tray?.remove();
    this.tray = undefined;
    this.trayList = undefined;
    for (const element of Object.values(this.host.panels())) element?.removeAttribute(GRIP_ATTRIBUTE);
    for (const handle of this.handles.splice(0)) handle.remove();
    this.flipButtons.clear();
    for (const remove of this.documentListeners.splice(0)) remove();
    this.host.onExit();
  }

  /** Board teardown: leaves no trace, without running `onExit`'s own board-facing cleanup twice. */
  public dispose(): void {
    if (!this.activeState) return;
    this.activeState = false;
    this.dragCleanup?.();
    this.dragCleanup = undefined;
    this.banner?.remove();
    this.tray?.remove();
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
      const row = list.appendChild(document.createElement("div"));
      row.className = "miro-canvas-arrange-tray__item";
      row.setAttribute("data-tool", item);
      const icon = row.appendChild(document.createElement("span"));
      icon.className = "miro-canvas-arrange-tray__icon";
      paintToolbarIcon(icon, item, document, this.host.setIcon);
      const label = row.appendChild(document.createElement("span"));
      label.className = "miro-canvas-arrange-tray__label";
      label.textContent = toolbarItemLabel(item);
      row.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.startItemDrag(item, "tray", event as PointerEvent);
      });
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
        event.preventDefault();
        event.stopPropagation();
        const flip = this.flipButtons.get(id);
        if (flip !== undefined && !pressIsOutside(target, [flip])) {
          this.flipPanel(id, element);
          return;
        }
        const bar = id === "toolbar" ? this.host.toolbarBar() : undefined;
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
      return orientation === undefined ? at : { ...at, orientation };
    };
    const move = (moveEvent: PointerEvent): void => {
      applyPanelPosition(element, pointToPosition(moveEvent.clientX, moveEvent.clientY), { width: boardRect.width, height: boardRect.height }, panelSize);
    };
    const finish = (upEvent: PointerEvent): void => {
      cleanup();
      this.host.savePanelPosition(id, pointToPosition(upEvent.clientX, upEvent.clientY));
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
  }

  private startItemDrag(item: ToolbarItem, source: "bar" | "tray", event: PointerEvent): void {
    const bar = this.host.toolbarBar();
    if (bar === undefined) return;
    const document = this.host.document;
    const ghost = document.createElement("div");
    ghost.className = "miro-canvas-arrange-ghost";
    const icon = ghost.appendChild(document.createElement("span"));
    icon.className = "miro-canvas-arrange-ghost__icon";
    paintToolbarIcon(icon, item, document, this.host.setIcon);
    const label = ghost.appendChild(document.createElement("span"));
    label.textContent = toolbarItemLabel(item);
    document.body.appendChild(ghost);
    const place = (x: number, y: number): void => {
      ghost.style.left = `${x}px`;
      ghost.style.top = `${y}px`;
    };
    place(event.clientX, event.clientY);
    const move = (moveEvent: PointerEvent): void => {
      place(moveEvent.clientX, moveEvent.clientY);
      const withinBar = rectContainsPoint(bar.getBoundingClientRect(), moveEvent.clientX, moveEvent.clientY);
      bar.setAttribute("data-miro-canvas-arrange-drop", withinBar ? "reorder" : "remove");
    };
    const finish = (upEvent: PointerEvent): void => {
      cleanup();
      ghost.remove();
      bar.removeAttribute("data-miro-canvas-arrange-drop");
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
      this.dragCleanup = undefined;
    };
    document.addEventListener("pointermove", move as EventListener);
    document.addEventListener("pointerup", finish as EventListener, { once: true });
    this.dragCleanup = cleanup;
  }

  private listenDocument(type: string, handler: EventListener, capture: boolean): void {
    this.host.document.addEventListener(type, handler, capture);
    this.documentListeners.push(() => this.host.document.removeEventListener(type, handler, capture));
  }
}
