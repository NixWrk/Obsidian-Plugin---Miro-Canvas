import { createHtmlElement, createSvgElement } from "./dom-elements";
import { words } from "./i18n";

export const SHAPE_RADIUS_HANDLE_MIN_ZOOM = 2;

export interface ShapeRadiusHandleState {
  readonly id: string;
  readonly nodeEl: HTMLElement;
  readonly width: number;
  readonly height: number;
  readonly radius: number;
  readonly editable: boolean;
  readonly zoom: number;
  readonly minimumZoom?: number;
}

export interface ShapeRadiusHandleOptions {
  readonly document: Document;
  readonly onPreview: (id: string, radius: number) => void;
  readonly onCommit: (id: string, radius: number) => void;
  readonly onCancel: () => void;
}

interface RadiusDrag {
  readonly pointerId: number;
  readonly start: { x: number; y: number };
  readonly clientX: number;
  readonly clientY: number;
  readonly original: number;
  moved: boolean;
}

/** One corner control on the selected figure; the caller owns geometry and history. */
export class ShapeRadiusHandle {
  private readonly host: HTMLDivElement;
  private readonly button: HTMLButtonElement;
  private readonly input: HTMLInputElement;
  private readonly value: HTMLSpanElement;
  private state: ShapeRadiusHandleState | undefined;
  private drag: RadiusDrag | undefined;
  private editingOriginal: number | undefined;
  private radius = 0;
  private suppressClick = false;
  private disposed = false;
  private iconCreated = false;

  public constructor(private readonly options: ShapeRadiusHandleOptions) {
    const document = options.document;
    const text = words().enhancements;
    this.host = createHtmlElement(document, "div");
    this.host.className = "miro-canvas-shape-radius-handle";
    this.button = createHtmlElement(document, "button");
    this.button.className = "miro-canvas-shape-radius-handle__button";
    this.button.type = "button";
    this.button.setAttribute("aria-label", text.shapeRadiusHandle);
    this.input = createHtmlElement(document, "input");
    this.input.className = "miro-canvas-shape-radius-handle__input";
    this.input.type = "number";
    this.input.min = "0";
    this.input.step = "any";
    this.input.setAttribute("aria-label", text.shapeRadiusInput);
    this.input.hidden = true;
    this.host.appendChild(this.button);
    this.host.appendChild(this.input);
    this.value = createHtmlElement(document, "span");
    this.value.className = "miro-canvas-shape-radius-handle__value";
    this.value.setAttribute("aria-hidden", "true");
    this.value.hidden = true;
    this.host.appendChild(this.value);
    this.host.addEventListener("pointerdown", this.onPointerDown);
    this.host.addEventListener("click", this.onClick);
    this.host.addEventListener("dblclick", this.stopEvent);
    this.host.addEventListener("contextmenu", this.stopEvent);
    this.host.addEventListener("keydown", this.onKeyDown);
    this.button.addEventListener("lostpointercapture", this.onPointerCancel);
    this.input.addEventListener("input", this.onInput);
    this.input.addEventListener("blur", this.onInputBlur);
  }

  public update(state: ShapeRadiusHandleState | undefined): void {
    if (this.disposed) return;
    if (state === undefined || !this.verify(state, false)) {
      this.cancel();
      this.state = undefined;
      this.host.remove();
      return;
    }
    this.createIcon();
    const old = this.state;
    if (old !== undefined && (old.id !== state.id || old.nodeEl !== state.nodeEl
      || old.width !== state.width || old.height !== state.height)) this.cancel();
    this.state = state;
    if (state.zoom < (state.minimumZoom ?? SHAPE_RADIUS_HANDLE_MIN_ZOOM)) {
      this.cancel();
      this.host.remove();
      return;
    }
    if (this.drag === undefined && this.editingOriginal === undefined) this.radius = this.clamp(state.radius);
    if (this.host.parentNode !== state.nodeEl) state.nodeEl.appendChild(this.host);
    this.render();
  }

  /** Follow one owned figure as native Canvas animates its displayed zoom. */
  public updateZoom(zoom: number): void {
    if (this.disposed || this.state === undefined || this.state.zoom === zoom) return;
    this.update({ ...this.state, zoom });
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancel();
    this.state = undefined;
    this.host.remove();
    this.host.removeEventListener("pointerdown", this.onPointerDown);
    this.host.removeEventListener("click", this.onClick);
    this.host.removeEventListener("dblclick", this.stopEvent);
    this.host.removeEventListener("contextmenu", this.stopEvent);
    this.host.removeEventListener("keydown", this.onKeyDown);
    this.button.removeEventListener("lostpointercapture", this.onPointerCancel);
    this.input.removeEventListener("input", this.onInput);
    this.input.removeEventListener("blur", this.onInputBlur);
  }

  private createIcon(): void {
    if (this.iconCreated) return;
    const document = this.options.document;
    const icon = createSvgElement(document, "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("aria-hidden", "true");
    icon.setAttribute("focusable", "false");
    const corner = createSvgElement(document, "path");
    corner.setAttribute("d", "M5 19V11a6 6 0 0 1 6-6h8");
    const direction = createSvgElement(document, "path");
    direction.setAttribute("d", "M12 12l7 7M12 16v-4h4M15 19h4v-4");
    icon.appendChild(corner);
    icon.appendChild(direction);
    this.button.appendChild(icon);
    this.iconCreated = true;
  }

  private verify(state: ShapeRadiusHandleState, requireVisible = true): boolean {
    const node = state.nodeEl;
    const minimumZoom = state.minimumZoom ?? SHAPE_RADIUS_HANDLE_MIN_ZOOM;
    if (!Number.isFinite(minimumZoom) || minimumZoom < 0
      || (requireVisible && state.zoom < minimumZoom)
      || !state.editable || !state.id || !Number.isFinite(state.radius)
      || ![state.width, state.height, state.zoom].every(value => Number.isFinite(value) && value > 0)
      || !Number.isFinite(1 / state.zoom)
      || node.ownerDocument !== this.options.document || !node.isConnected
      || !node.matches(".canvas-node.is-selected, .canvas-node.is-focused")) return false;
    for (const key of ["data-node-id", "data-id", "data-miro-canvas-id"]) {
      const id = node.getAttribute(key);
      if (id !== null && id !== state.id) return false;
    }
    return this.shapeSvg(node) !== undefined;
  }

  private shapeSvg(node: HTMLElement): SVGSVGElement | undefined {
    const svg = node.querySelector<SVGSVGElement>(".miro-source-decoration-shape svg");
    if (svg === null || svg.ownerDocument !== this.options.document
      || svg.closest(".canvas-node") !== node || !node.contains(svg)
      || svg.getAttribute("viewBox")?.trim().split(/[\s,]+/).join(" ") !== "0 0 100 100") return undefined;
    return svg;
  }

  private localPoint(event: PointerEvent): { x: number; y: number } | undefined {
    const state = this.state;
    if (state === undefined || !this.verify(state)) return undefined;
    const svg = this.shapeSvg(state.nodeEl);
    try {
      const inverse = svg?.getScreenCTM()?.inverse();
      if (svg === undefined || inverse === undefined) return undefined;
      const point = svg.createSVGPoint();
      point.x = event.clientX;
      point.y = event.clientY;
      const normalized = point.matrixTransform(inverse);
      const x = normalized.x * state.width / 100;
      const y = normalized.y * state.height / 100;
      return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined;
    } catch {
      return undefined;
    }
  }

  private clamp(radius: number): number {
    const state = this.state;
    return Math.max(0, Math.min(radius, 1000, (state?.width ?? 0) / 2, (state?.height ?? 0) / 2));
  }

  private render(): void {
    const state = this.state;
    if (state === undefined) return;
    const spacing = 22 / state.zoom;
    this.host.style.left = `clamp(min(50%, ${spacing}px), ${this.radius / state.width * 100}%, 50%)`;
    this.host.style.top = `clamp(min(50%, ${spacing}px), ${this.radius / state.height * 100}%, 50%)`;
    this.host.style.transform = `translate(-50%, -50%) scale(${1 / state.zoom})`;
    this.button.title = words().enhancements.shapeRadiusValue(this.radius);
    this.button.setAttribute("aria-label", this.button.title);
    this.input.max = String(Math.min(1000, state.width / 2, state.height / 2));
    this.host.setAttribute("data-dragging", String(this.drag !== undefined));
    this.value.textContent = words().enhancements.shapeRadiusLiveValue(this.radius);
    this.value.hidden = this.drag === undefined;
  }

  private readonly stopEvent = (event: Event): void => {
    event.stopImmediatePropagation();
    event.preventDefault();
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    event.stopImmediatePropagation();
    if (event.target === this.input) return;
    event.preventDefault();
    if (event.button !== 0 || this.drag !== undefined || this.editingOriginal !== undefined) return;
    const start = this.localPoint(event);
    if (start === undefined) return;
    this.suppressClick = false;
    this.drag = { pointerId: event.pointerId, start, clientX: event.clientX, clientY: event.clientY, original: this.radius, moved: false };
    this.listen(true);
    this.render();
    try {
      this.button.setPointerCapture(event.pointerId);
    } catch {
      // Document listeners also cover hosts without pointer capture.
    }
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    const drag = this.drag;
    if (drag === undefined || event.pointerId !== drag.pointerId) return;
    this.stopEvent(event);
    const point = this.localPoint(event);
    if (point === undefined) {
      this.cancel();
      return;
    }
    if (!drag.moved && Math.hypot(event.clientX - drag.clientX, event.clientY - drag.clientY) < 3) return;
    drag.moved = true;
    this.preview(this.clamp(drag.original + (point.x - drag.start.x + point.y - drag.start.y) / 2));
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (this.drag === undefined || event.pointerId !== this.drag.pointerId) return;
    this.onPointerMove(event);
    const drag = this.drag;
    if (drag === undefined) return;
    this.suppressClick = drag.moved;
    this.drag = undefined;
    this.listen(false);
    this.release(drag.pointerId);
    this.render();
    if (drag.moved && this.state !== undefined) this.options.onCommit(this.state.id, this.radius);
  };

  private readonly onPointerCancel = (event: PointerEvent): void => {
    if (this.drag === undefined || event.pointerId !== this.drag.pointerId) return;
    this.stopEvent(event);
    this.suppressClick = true;
    this.cancel();
  };

  private readonly onClick = (event: MouseEvent): void => {
    if (event.target === this.input) {
      event.stopImmediatePropagation();
      return;
    }
    this.stopEvent(event);
    if (this.suppressClick && event.detail !== 0) {
      this.suppressClick = false;
      return;
    }
    this.openInput();
  };

  private openInput(): void {
    if (this.state === undefined || !this.verify(this.state) || this.drag !== undefined || this.editingOriginal !== undefined) return;
    this.editingOriginal = this.radius;
    this.input.value = String(this.radius);
    this.input.removeAttribute("aria-invalid");
    this.input.setCustomValidity("");
    this.button.hidden = true;
    this.input.hidden = false;
    this.listen(true);
    this.input.focus();
    this.input.select();
  }

  private numericValue(): number | undefined {
    const value = this.input.value.trim();
    const radius = Number(value);
    const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value);
    return decimal && this.input.validity.badInput !== true && Number.isFinite(radius) ? this.clamp(radius) : undefined;
  }

  private readonly onInput = (): void => {
    if (this.editingOriginal === undefined) return;
    if (this.state === undefined || !this.verify(this.state)) {
      this.cancel();
      return;
    }
    const radius = this.numericValue();
    this.input.setAttribute("aria-invalid", String(radius === undefined));
    this.input.setCustomValidity(radius === undefined ? words().enhancements.shapeRadiusInvalid : "");
    if (radius !== undefined) this.preview(radius);
  };

  private readonly onInputBlur = (): void => {
    this.finishInput(false);
  };

  private finishInput(keepInvalid: boolean): void {
    if (this.editingOriginal === undefined) return;
    if (this.state === undefined || !this.verify(this.state)) {
      this.cancel();
      return;
    }
    const radius = this.numericValue();
    if (radius === undefined) {
      if (keepInvalid) this.onInput();
      else this.cancel();
      return;
    }
    const id = this.state.id;
    this.editingOriginal = undefined;
    this.listen(false);
    this.closeInput();
    this.radius = radius;
    this.render();
    this.options.onCommit(id, radius);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && (this.drag !== undefined || this.editingOriginal !== undefined)) {
      this.stopEvent(event);
      this.suppressClick = true;
      this.cancel();
    } else if (event.target === this.input) {
      event.stopImmediatePropagation();
      if (event.key === "Enter") {
        event.preventDefault();
        this.finishInput(true);
      }
    } else if (event.target === this.button) {
      event.stopImmediatePropagation();
    }
  };

  private preview(radius: number): void {
    if (this.state === undefined || radius === this.radius) return;
    const id = this.state.id;
    this.radius = radius;
    this.render();
    this.options.onPreview(id, radius);
  }

  private cancel(): void {
    const drag = this.drag;
    const original = drag?.original ?? this.editingOriginal;
    this.drag = undefined;
    this.editingOriginal = undefined;
    this.listen(false);
    if (drag !== undefined) this.release(drag.pointerId);
    this.closeInput();
    if (original !== undefined) {
      this.radius = original;
      this.render();
      this.options.onCancel();
    }
  }

  private closeInput(): void {
    this.input.hidden = true;
    this.button.hidden = false;
  }

  private release(pointerId: number): void {
    try {
      this.button.releasePointerCapture(pointerId);
    } catch {
      // The browser may already have released a cancelled pointer.
    }
  }

  private listen(active: boolean): void {
    const document = this.options.document;
    if (active) {
      document.addEventListener("pointermove", this.onPointerMove, true);
      document.addEventListener("pointerup", this.onPointerUp, true);
      document.addEventListener("pointercancel", this.onPointerCancel, true);
      document.addEventListener("keydown", this.onKeyDown, true);
    } else {
      document.removeEventListener("pointermove", this.onPointerMove, true);
      document.removeEventListener("pointerup", this.onPointerUp, true);
      document.removeEventListener("pointercancel", this.onPointerCancel, true);
      document.removeEventListener("keydown", this.onKeyDown, true);
    }
  }
}
