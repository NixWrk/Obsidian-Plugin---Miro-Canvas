import { setElementStyles } from "./dom-styles";
import { words } from "./i18n";
import { applyPanelPositionSettled, effectivePanelOrientation, positionFromPoint, type PanelId, type PanelPosition } from "./panel-layout";

type CollapsiblePanel = "toolbar" | "dockBar";

interface VisibilityHost {
  readonly document: Document;
  readonly boardRoot: HTMLElement;
  readonly panels: () => Readonly<Partial<Record<PanelId, HTMLElement>>>;
  readonly position: (id: PanelId) => PanelPosition | undefined;
  readonly savePosition: (id: PanelId, position: PanelPosition) => void;
  readonly buttonHidden?: (id: CollapsiblePanel) => boolean;
  readonly setIcon?: (element: HTMLElement, icon: string) => void;
}

/** Each bar can become a small, movable button without losing its tools or place. */
export class PanelVisibility {
  private readonly buttons = new Map<CollapsiblePanel, HTMLButtonElement>();
  private readonly listeners: Array<() => void> = [];
  private readonly placementKeys = new Map<CollapsiblePanel, string>();
  private dragCleanup: (() => void) | undefined;

  public constructor(private readonly host: VisibilityHost) {}

  public mount(): void {
    if (typeof this.host.boardRoot.getBoundingClientRect !== "function") return;
    for (const id of ["toolbar", "dockBar"] as const) {
      const panel = this.host.panels()[id];
      if (panel === undefined || this.buttons.has(id)) continue;
      const button = this.host.document.createElement("button");
      button.type = "button";
      button.className = "miro-canvas-panel-toggle clickable-icon";
      (this.bar(id, panel) ?? panel).appendChild(button);
      this.buttons.set(id, button);
      let suppressClick = false;
      const click = (event: Event): void => {
        event.preventDefault();
        event.stopPropagation();
        if (suppressClick) {
          suppressClick = false;
          return;
        }
        const current = this.currentPosition(id, panel);
        const board = this.host.boardRoot.getBoundingClientRect();
        const pivot = button.getBoundingClientRect();
        const style = this.host.document.defaultView?.getComputedStyle(this.host.boardRoot);
        const foot = Math.max(0, Number.parseFloat(style?.getPropertyValue("--miro-canvas-host-foot") ?? "0") || 0);
        const view = { width: board.width, height: Math.max(1, board.height - foot) };
        const collapsed = current.collapsed !== true;
        const right = panel.getAttribute("data-panel-button-right") === "true";
        const bottom = panel.getAttribute("data-panel-button-bottom") === "true";
        const bar = this.bar(id, panel);
        bar?.style.removeProperty("max-height");
        bar?.style.removeProperty("overflow-y");
        applyPanelPositionSettled(panel, { ...current, collapsed }, view);
        this.placeButton(id, button, collapsed, { ...current, buttonRight: right, buttonBottom: bottom });
        const size = panel.getBoundingClientRect();
        const buttonRight = collapsed ? right : pivot.left - board.left + size.width > view.width;
        const above = pivot.bottom - board.top;
        const below = view.height - (pivot.top - board.top);
        const buttonBottom = collapsed ? bottom : size.height > below && above > below;
        if (!collapsed && effectivePanelOrientation(current) === "vertical" && bar !== null) {
          // A long column scrolls away from its pivot instead of moving the button.
          bar.style.setProperty("max-height", `${Math.max(44, (buttonBottom ? above : below) - 2)}px`);
          setElementStyles(bar, { "overflow-y": "auto" });
        }
        this.placeButton(id, button, collapsed, { ...current, buttonRight, buttonBottom });
        const panelBox = panel.getBoundingClientRect();
        const placed = button.getBoundingClientRect();
        const left = pivot.left - board.left - (placed.left - panelBox.left);
        const top = pivot.top - board.top - (placed.top - panelBox.top);
        const next: PanelPosition = {
          ...positionFromPoint({ left, top }, view, panelBox, 0),
          orientation: effectivePanelOrientation(current), collapsed, buttonRight, buttonBottom,
        };
        applyPanelPositionSettled(panel, next, view);
        this.host.savePosition(id, next);
        this.refresh();
      };
      const down = (event: PointerEvent): void => {
        event.stopPropagation();
        if (event.button !== 0) return;
        event.preventDefault();
        this.dragCleanup?.();
        suppressClick = false;
        const initial = this.host.position(id);
        const pivot = button.getBoundingClientRect();
        const bar = this.bar(id, panel);
        const previousHeight = bar?.style.getPropertyValue?.("max-height") ?? "";
        const previousOverflow = bar?.style.getPropertyValue?.("overflow-y") ?? "";
        const board = this.host.boardRoot.getBoundingClientRect();
        const startX = event.clientX;
        const startY = event.clientY;
        const buttonRight = panel.getAttribute("data-panel-button-right") === "true";
        const buttonBottom = panel.getAttribute("data-panel-button-bottom") === "true";
        let dragged = false;
        let ready = false;
        let swiped = false;
        const hold = setTimeout(() => {
          ready = true;
          button.setAttribute("data-panel-moving", "true");
        }, 450);
        let next = this.currentPosition(id, panel);
        const style = this.host.document.defaultView?.getComputedStyle(this.host.boardRoot);
        const foot = Math.max(0, Number.parseFloat(style?.getPropertyValue("--miro-canvas-host-foot") ?? "0") || 0);
        const view = { width: board.width, height: Math.max(1, board.height - foot) };
        const move = (pointer: PointerEvent): void => {
          if (pointer.pointerId !== event.pointerId) return;
          if (!ready) {
            if (Math.hypot(pointer.clientX - startX, pointer.clientY - startY) >= 8) {
              swiped = true;
              clearTimeout(hold);
            }
            return;
          }
          if (!dragged && Math.hypot(pointer.clientX - startX, pointer.clientY - startY) < 8) return;
          dragged = true;
          const target = { left: pivot.left - board.left + pointer.clientX - startX, top: pivot.top - board.top + pointer.clientY - startY };
          const orientation = effectivePanelOrientation(this.currentPosition(id, panel));
          if (initial?.collapsed !== true && orientation === "vertical" && bar !== null) {
            const room = buttonBottom ? target.top + pivot.height : view.height - target.top;
            bar.style.setProperty("max-height", `${Math.max(44, room - 2)}px`);
            setElementStyles(bar, { "overflow-y": "auto" });
          }
          const box = panel.getBoundingClientRect();
          const placed = button.getBoundingClientRect();
          next = {
            ...positionFromPoint({ left: target.left - (placed.left - box.left), top: target.top - (placed.top - box.top) }, view, box),
            orientation,
            collapsed: initial?.collapsed === true,
            buttonRight,
            buttonBottom,
          };
          applyPanelPositionSettled(panel, next, view);
          pointer.preventDefault();
        };
        const cleanup = (): void => {
          clearTimeout(hold);
          button.removeAttribute("data-panel-moving");
          this.host.document.removeEventListener("pointermove", move);
          this.host.document.removeEventListener("pointerup", up);
          this.host.document.removeEventListener("pointercancel", cancel);
          this.dragCleanup = undefined;
        };
        const cancel = (pointer?: PointerEvent): void => {
          if (pointer !== undefined && pointer.pointerId !== event.pointerId) return;
          cleanup();
          if (bar !== null) {
            if (previousHeight) bar.style.setProperty("max-height", previousHeight);
            else bar.style.removeProperty("max-height");
            if (previousOverflow) bar.style.setProperty("overflow-y", previousOverflow);
            else bar.style.removeProperty("overflow-y");
          }
          applyPanelPositionSettled(panel, initial, view);
          suppressClick = ready || swiped || dragged;
        };
        const up = (pointer: PointerEvent): void => {
          if (pointer.pointerId !== event.pointerId) return;
          move(pointer);
          cleanup();
          suppressClick = ready || swiped || dragged;
          if (dragged) this.host.savePosition(id, next);
        };
        this.host.document.addEventListener("pointermove", move);
        this.host.document.addEventListener("pointerup", up);
        this.host.document.addEventListener("pointercancel", cancel);
        this.dragCleanup = () => cancel();
      };
      button.addEventListener("click", click);
      button.addEventListener("pointerdown", down);
      this.listeners.push(() => {
        button.removeEventListener("click", click);
        button.removeEventListener("pointerdown", down);
      });
    }
    this.refresh();
    const view = this.host.document.defaultView;
    if (typeof view?.requestAnimationFrame === "function") {
      const frame = view.requestAnimationFrame(() => this.refresh());
      this.listeners.push(() => view.cancelAnimationFrame(frame));
    }
  }

  public refresh(): void {
    const labels = words().arrange;
    for (const [id, button] of this.buttons) {
      const collapsed = this.host.position(id)?.collapsed === true;
      const label = id === "toolbar"
        ? (collapsed ? labels.expandTools : labels.collapseTools)
        : (collapsed ? labels.expandNavigation : labels.collapseNavigation);
      button.setAttribute("aria-label", label);
      button.setAttribute("aria-expanded", String(!collapsed));
      button.setAttribute("title", `${label}. ${labels.holdToMovePanel}`);
      const panel = this.host.panels()[id];
      const vertical = panel?.getAttribute("data-miro-canvas-panel-orientation") === "vertical";
      const icon = collapsed ? (id === "toolbar" ? "pencil-ruler" : "compass") : vertical ? "panel-top-close" : "panel-left-close";
      if (button.getAttribute("data-panel-icon") !== icon) {
        button.setAttribute("data-panel-icon", icon);
        if (this.host.setIcon !== undefined) this.host.setIcon(button, icon);
        else button.textContent = collapsed ? (id === "toolbar" ? "✎" : "⌖") : "−";
      }
      this.placeButton(id, button, collapsed);
    }
  }

  private placeButton(id: CollapsiblePanel, button: HTMLElement, collapsed: boolean, override?: PanelPosition): void {
    const panel = this.host.panels()[id];
    if (panel === undefined) return;
    const mobile = this.host.document.body?.classList?.contains("is-mobile") === true;
    const arranging = this.host.boardRoot.querySelector?.(".miro-canvas-arrange-banner") != null;
    button.hidden = !collapsed && !arranging && (!mobile || this.host.buttonHidden?.(id) === true);
    const grouped = id === "toolbar" && !button.hidden;
    const reserve = button.hidden ? "0px" : grouped ? "100px" : "56px";
    const position = override ?? this.host.position(id);
    const right = position?.buttonRight ?? position?.anchor.includes("right") ?? false;
    const bottom = position?.buttonBottom ?? false;
    const vertical = panel.getAttribute("data-miro-canvas-panel-orientation") === "vertical";
    const key = `${collapsed}:${button.hidden}:${grouped}:${right}:${bottom}:${vertical}`;
    if (this.placementKeys.get(id) === key) return;
    this.placementKeys.set(id, key);
    panel.setAttribute("data-panel-controls-grouped", String(grouped));
    panel.setAttribute("data-panel-button-right", String(right));
    panel.setAttribute("data-panel-button-bottom", String(bottom));
    const bar = this.bar(id, panel);
    const more = bar?.querySelector<HTMLElement>(".miro-canvas-tools__more");
    if (more != null) {
      for (const key of ["position", "left", "right", "top", "bottom", "margin", "padding", "border"]) more.style.removeProperty(key);
      if (grouped && !collapsed) {
        setElementStyles(more, { "position": "absolute" });
        setElementStyles(more, { "margin": "0" });
        setElementStyles(more, { "padding": "0" });
        setElementStyles(more, { "border": "0" });
        more.style.setProperty("left", vertical ? "calc(50% - 20px)" : right ? "auto" : "52px");
        more.style.setProperty("right", !vertical && right ? "52px" : "auto");
        more.style.setProperty("top", bottom ? "auto" : vertical ? "52px" : "6px");
        more.style.setProperty("bottom", bottom ? vertical ? "52px" : "6px" : "auto");
      }
    }
    if (bar !== null) {
      if (!vertical) {
        bar.style.removeProperty("max-height");
        bar.style.removeProperty("overflow-y");
      }
      bar.style.setProperty("min-height", button.hidden ? "0px" : vertical ? "44px" : "52px");
      bar.style.setProperty("min-width", button.hidden || !vertical ? "0px" : "44px");
      bar.style.setProperty("padding-left", !vertical && !right ? reserve : "0px");
      bar.style.setProperty("padding-right", !vertical && right ? reserve : "0px");
      bar.style.setProperty("padding-top", vertical && !bottom ? reserve : !vertical && !button.hidden ? "4px" : "0px");
      bar.style.setProperty("padding-bottom", vertical && bottom ? reserve : !vertical && !button.hidden ? "4px" : "0px");
    }
    // Local alignment stays centered when wrapping or positioning changes the bar.
    button.style.setProperty("left", collapsed || vertical ? "calc(50% - 22px)" : right ? "auto" : "4px");
    button.style.setProperty("right", !collapsed && !vertical && right ? "4px" : "auto");
    button.style.setProperty("top", collapsed ? "calc(50% - 22px)" : bottom ? "auto" : "4px");
    button.style.setProperty("bottom", !collapsed && bottom ? "4px" : "auto");
  }

  private bar(id: PanelId, panel: HTMLElement): HTMLElement | null {
    return panel.querySelector<HTMLElement>(id === "toolbar"
      ? ".miro-canvas-toolbar__bar:not(.miro-canvas-tools__connectors):not(.miro-canvas-tools__drawing)"
      : ".miro-canvas-dock__bar");
  }

  private currentPosition(id: PanelId, panel: HTMLElement): PanelPosition {
    const saved = this.host.position(id);
    if (saved !== undefined) return saved;
    const board = this.host.boardRoot.getBoundingClientRect();
    const box = panel.getBoundingClientRect();
    const style = this.host.document.defaultView?.getComputedStyle(this.host.boardRoot);
    const foot = Math.max(0, Number.parseFloat(style?.getPropertyValue("--miro-canvas-host-foot") ?? "0") || 0);
    return positionFromPoint({ left: box.left - board.left, top: box.top - board.top }, { width: board.width, height: Math.max(1, board.height - foot) }, box);
  }

  public dispose(): void {
    this.dragCleanup?.();
    for (const remove of this.listeners.splice(0)) remove();
    for (const button of this.buttons.values()) button.remove();
    this.buttons.clear();
    this.placementKeys.clear();
  }
}
