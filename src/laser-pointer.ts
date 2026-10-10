import { createHtmlElement } from "./dom-elements";
import { setElementStyles } from "./dom-styles";

const ENABLED_ATTRIBUTE = "data-miro-laser-enabled";
const LIFETIME_MS = 600;
const TICK_MS = 32;
const MAX_POINTS = 64;
const CONTROLS = [
  "button", "a", "input", "textarea", "select", "summary", "iframe", "object", "embed",
  "audio", "video", '[contenteditable]:not([contenteditable="false"])',
  '[role="button"]', '[role="link"]', '[role="textbox"]', '[role="slider"]',
  '[role="menu"]', '[role="dialog"]', ".clickable-icon", ".internal-link", ".external-link",
  ".canvas-controls", ".canvas-control-group", ".canvas-menu", ".canvas-node-resizer",
  ".canvas-node-connection-point", ".canvas-node.is-editing", ".markdown-embed",
  ".file-embed", ".pdf-embed", ".webviewer-container",
  ".miro-canvas-shape-radius-handle", ".miro-canvas-panel", ".miro-canvas-dock",
  ".miro-canvas-thread", ".miro-canvas-slideshow", ".miro-canvas-toolbar",
  ".miro-canvas-comment-markers", ".miro-canvas-handles", ".miro-canvas-minimap",
  ".miro-canvas-m2-tools", ".miro-canvas-arrange-banner", ".miro-canvas-arrange-tray",
  ".miro-canvas-export", ".miro-canvas-export-page__tab", ".miro-canvas-export-page__corner",
  ".miro-canvas-tools", ".miro-canvas-connector-labels", ".miro-canvas-quick-tools",
].join(",");

interface TrailPoint {
  readonly element: HTMLElement;
  expires: number;
}

interface Position {
  readonly x: number;
  readonly y: number;
}

/** A viewport decoration. No board data, camera or history participates. */
export class LaserPointer {
  private readonly document: Document;
  private readonly view: Window | null;
  private readonly layer: HTMLElement;
  private readonly dot: HTMLElement;
  private readonly points: TrailPoint[] = [];
  private readonly removeListeners: (() => void)[] = [];
  private isEnabled = false;
  private disposed = false;
  private previousAttribute: string | null = null;
  private pointerId: number | undefined;
  private timer: number | undefined;
  private nextPoint = 0;
  private dotExpires = 0;

  public constructor(private readonly root: HTMLElement) {
    this.document = root.ownerDocument;
    this.view = this.document.defaultView;
    this.layer = createHtmlElement(this.document, "div");
    this.layer.className = "miro-canvas-laser-pointer";
    this.layer.setAttribute("aria-hidden", "true");
    setElementStyles(this.layer, { "pointer-events": "none" });
    this.dot = createHtmlElement(this.document, "span");
    this.dot.className = "miro-canvas-laser-pointer__dot";
    this.dot.hidden = true;
    this.layer.appendChild(this.dot);
    // Populate detached DOM once; pointer frames never change the board subtree.
    for (let index = 0; index < MAX_POINTS; index += 1) {
      const element = createHtmlElement(this.document, "span");
      element.className = "miro-canvas-laser-pointer__trail";
      element.hidden = true;
      this.layer.appendChild(element);
      this.points.push({ element, expires: 0 });
    }
  }

  public get enabled(): boolean {
    return this.isEnabled;
  }

  public setEnabled(enabled: boolean): void {
    if (this.disposed || enabled === this.isEnabled) return;
    if (enabled && this.view === null) return;
    this.isEnabled = enabled;
    if (enabled) {
      this.previousAttribute = this.root.getAttribute(ENABLED_ATTRIBUTE);
      this.root.setAttribute(ENABLED_ATTRIBUTE, "true");
      this.root.appendChild(this.layer);
      this.listen(this.document, "pointerdown", this.onDown);
      this.listen(this.document, "pointermove", this.onMove);
      this.listen(this.document, "pointerup", this.onUp);
      this.listen(this.document, "pointercancel", this.onCancel);
      this.listen(this.document, "click", this.onClick);
      this.listen(this.document, "dblclick", this.onClick);
      this.listen(this.root, "pointerleave", this.onLeave);
      this.listen(this.root, "lostpointercapture", this.onLostCapture);
      this.listen(this.document, "visibilitychange", this.onVisibility);
      this.listen(this.view!, "blur", this.onAway);
      this.listen(this.view!, "pagehide", this.onAway);
    } else {
      this.clear();
      for (const remove of this.removeListeners.splice(0)) remove();
      this.layer.remove();
      if (this.root.getAttribute(ENABLED_ATTRIBUTE) === "true") {
        if (this.previousAttribute === null) this.root.removeAttribute(ENABLED_ATTRIBUTE);
        else this.root.setAttribute(ENABLED_ATTRIBUTE, this.previousAttribute);
      }
      this.previousAttribute = null;
    }
  }

  public clear(): void {
    if (this.timer !== undefined) this.view?.clearTimeout(this.timer);
    this.timer = undefined;
    this.dotExpires = 0;
    this.dot.hidden = true;
    for (const point of this.points) {
      point.expires = 0;
      point.element.hidden = true;
    }
    this.nextPoint = 0;
    const pointerId = this.pointerId;
    this.pointerId = undefined;
    if (pointerId !== undefined) this.release(pointerId);
  }

  public dispose(): void {
    if (this.disposed) return;
    this.setEnabled(false);
    this.disposed = true;
    this.clear();
    this.layer.remove();
  }

  private listen(target: EventTarget, type: string, listener: EventListener): void {
    target.addEventListener(type, listener, { capture: true, passive: false });
    this.removeListeners.push(() => target.removeEventListener(type, listener, true));
  }

  private consume(event: Event): void {
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  private elementOf(event: Event): Element | undefined {
    // Structural guards work across native windows and SVG/text event targets.
    for (const target of event.composedPath()) {
      if (typeof (target as Element | null)?.closest === "function") return target as Element;
    }
    const target = event.target as Element | null;
    if (typeof target?.closest === "function") return target;
    return target?.parentElement ?? undefined;
  }

  private boardTarget(element: Element | undefined): boolean {
    return element !== undefined && this.root.contains(element) && element.closest(CONTROLS) === null;
  }

  private position(event: MouseEvent, captured = false): Position | undefined {
    if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return undefined;
    const bounds = this.root.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX >= bounds.right
      || event.clientY < bounds.top || event.clientY >= bounds.bottom) return undefined;
    const target = captured ? this.document.elementFromPoint(event.clientX, event.clientY) ?? undefined : this.elementOf(event);
    if (!this.boardTarget(target)) return undefined;
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  private paint(position: Position): void {
    const now = this.view!.performance.now();
    this.dot.style.left = `${position.x}px`;
    this.dot.style.top = `${position.y}px`;
    this.dot.hidden = false;
    this.dotExpires = now + LIFETIME_MS;
    const point = this.points[this.nextPoint];
    point.expires = this.dotExpires;
    point.element.style.left = this.dot.style.left;
    point.element.style.top = this.dot.style.top;
    setElementStyles(point.element, { opacity: "1" });
    point.element.hidden = false;
    this.nextPoint = (this.nextPoint + 1) % MAX_POINTS;
    this.schedule();
  }

  private schedule(): void {
    if (this.timer !== undefined || !this.isEnabled) return;
    const timer = this.view!.setTimeout(() => {
      if (this.timer !== timer || !this.isEnabled) return;
      this.timer = undefined;
      const now = this.view!.performance.now();
      let pending = false;
      for (const point of this.points) {
        const remaining = point.expires - now;
        point.element.hidden = remaining <= 0;
        if (remaining > 0) {
          point.element.style.opacity = String(remaining / LIFETIME_MS);
          pending = true;
        }
      }
      if (this.dotExpires <= now) this.dot.hidden = true;
      if (pending) this.schedule();
    }, TICK_MS);
    this.timer = timer;
  }

  private release(pointerId: number): void {
    try {
      this.root.releasePointerCapture(pointerId);
    } catch {
      // Owner-document listeners cover native hosts without pointer capture.
    }
  }

  private readonly onDown = (event: Event): void => {
    const pointer = event as PointerEvent;
    if (pointer.button !== 0 || pointer.isPrimary === false || this.pointerId !== undefined) return;
    const position = this.position(pointer);
    if (position === undefined) return;
    this.consume(event);
    this.pointerId = pointer.pointerId;
    this.paint(position);
    try {
      this.root.setPointerCapture(pointer.pointerId);
    } catch {
      // Keep ownership through owner-document listeners instead.
    }
  };

  private readonly onMove = (event: Event): void => {
    const pointer = event as PointerEvent;
    if (this.pointerId !== undefined) {
      if (pointer.pointerId !== this.pointerId) return;
      this.consume(event);
      const position = this.position(pointer, true);
      if (position !== undefined) this.paint(position);
      else this.dot.hidden = true;
      return;
    }
    if (pointer.pointerType !== "mouse" || pointer.buttons !== 0) return;
    const position = this.position(pointer);
    if (position !== undefined) this.paint(position);
    else this.dot.hidden = true;
  };

  private readonly onUp = (event: Event): void => {
    const pointer = event as PointerEvent;
    if (pointer.pointerId !== this.pointerId) return;
    this.consume(event);
    const position = this.position(pointer, true);
    if (position !== undefined) this.paint(position);
    this.pointerId = undefined;
    this.release(pointer.pointerId);
    this.dot.hidden = true;
  };

  private readonly onCancel = (event: Event): void => {
    if ((event as PointerEvent).pointerId !== this.pointerId) return;
    this.consume(event);
    this.clear();
  };

  private readonly onClick = (event: Event): void => {
    if (this.position(event as MouseEvent) !== undefined) this.consume(event);
  };

  private readonly onLeave = (event: Event): void => {
    if (event.target === this.root && this.pointerId === undefined) this.clear();
  };

  private readonly onLostCapture = (event: Event): void => {
    if ((event as PointerEvent).pointerId === this.pointerId) this.clear();
  };

  private readonly onAway = (): void => this.clear();

  private readonly onVisibility = (): void => {
    if (this.document.hidden) this.clear();
  };
}
