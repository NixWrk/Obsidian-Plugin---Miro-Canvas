import { afterEach, describe, expect, it, vi } from "vitest";
import { setLocale, words } from "../src/i18n";
import { ShapeRadiusHandle, type ShapeRadiusHandleState } from "../src/shape-radius-handle";

type Listener = (event: Record<string, unknown>) => void;

class Events {
  public readonly listeners = new Map<string, Set<Listener>>();
  public addEventListener(type: string, listener: Listener): void {
    const listeners = this.listeners.get(type) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }
  public removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }
  public dispatch(type: string, fields: Record<string, unknown> = {}) {
    const event = { target: this, button: 0, pointerId: 1, clientX: 0, clientY: 0, detail: 1,
      preventDefault: vi.fn(), stopImmediatePropagation: vi.fn(), ...fields };
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event);
    return event;
  }
  public activeListeners(): number {
    return [...this.listeners.values()].reduce((sum, listeners) => sum + listeners.size, 0);
  }
}

class Element extends Events {
  public children: Element[] = [];
  public parentNode: Element | undefined;
  public className = "";
  public style: Record<string, string> = {};
  public readonly attributes = new Map<string, string>();
  public isConnected = true;
  public hidden = false;
  public title = "";
  public textContent = "";
  public type = "";
  public min = "";
  public max = "";
  public step = "";
  public value = "";
  public validity = { badInput: false };
  public validityMessage = "";
  public captured: number | undefined;
  public constructor(public readonly tagName: string, public readonly ownerDocument: FakeDocument) { super(); }
  public appendChild(child: Element): Element {
    child.remove();
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  public remove(): void {
    if (this.parentNode !== undefined) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1);
    this.parentNode = undefined;
  }
  public setAttribute(key: string, value: string): void { this.attributes.set(key, value); }
  public getAttribute(key: string): string | null { return this.attributes.get(key) ?? null; }
  public removeAttribute(key: string): void { this.attributes.delete(key); }
  public matches(): boolean {
    return this.className.split(" ").includes("canvas-node")
      && (this.className.includes("is-selected") || this.className.includes("is-focused"));
  }
  public closest(): Element | null {
    if (this.className.split(" ").includes("canvas-node")) return this;
    return this.parentNode?.closest() ?? null;
  }
  public contains(other: Element): boolean { return this === other || this.children.some(child => child.contains(other)); }
  public querySelector(selector: string): Element | null {
    if (selector !== ".miro-source-decoration-shape svg") throw new Error("Unexpected unscoped SVG query");
    return this.descendants().find(element => element.tagName === "svg"
      && element.parentNode?.className === "miro-source-decoration-shape") ?? null;
  }
  public descendants(): Element[] { return this.children.flatMap(child => [child, ...child.descendants()]); }
  public focus(): void { this.ownerDocument.activeElement = this; }
  public select(): void {}
  public setCustomValidity(value: string): void { this.validityMessage = value; }
  public setPointerCapture(pointerId: number): void { this.captured = pointerId; }
  public releasePointerCapture(pointerId: number): void {
    if (this.captured === pointerId) {
      this.captured = undefined;
      this.dispatch("lostpointercapture", { pointerId });
    }
  }
}

class FakeDocument extends Events {
  public defaultView = null;
  public activeElement: Element | undefined;
  public createElement(tag: string): Element { return new Element(tag, this); }
  public createElementNS(_namespace: string, tag: string): Element { return this.createElement(tag); }
}

function build(overrides: Partial<ShapeRadiusHandleState> = {}, rotation = 0, zoom = 1) {
  const document = new FakeDocument();
  const node = document.createElement("div");
  node.className = "canvas-node is-focused";
  node.setAttribute("data-node-id", "shape1");
  const layer = document.createElement("div");
  layer.className = "miro-source-decoration-shape";
  const svg = Object.assign(document.createElement("svg"), {
    getScreenCTM: vi.fn(() => ({ inverse: vi.fn(() => {
      const angle = rotation * Math.PI / 180;
      const a = Math.cos(angle) / zoom / state.width * 100;
      const c = Math.sin(angle) / zoom / state.width * 100;
      const b = -Math.sin(angle) / zoom / state.height * 100;
      const d = Math.cos(angle) / zoom / state.height * 100;
      return { a, b, c, d, e: -70 * a - 90 * c, f: -70 * b - 90 * d };
    }) })),
    createSVGPoint: () => ({ x: 0, y: 0, matrixTransform(matrix: { a: number; b: number; c: number; d: number; e: number; f: number }) {
      return { x: matrix.a * this.x + matrix.c * this.y + matrix.e,
        y: matrix.b * this.x + matrix.d * this.y + matrix.f };
    } }),
  });
  svg.setAttribute("viewBox", "0 0 100 100");
  layer.appendChild(svg);
  node.appendChild(layer);
  const state: ShapeRadiusHandleState = { id: "shape1", nodeEl: node as unknown as HTMLElement,
    width: 400, height: 120, radius: 16, editable: true, zoom, ...overrides };
  const onPreview = vi.fn();
  const onCommit = vi.fn();
  const onCancel = vi.fn();
  const control = new ShapeRadiusHandle({ document: document as unknown as Document, onPreview, onCommit, onCancel });
  control.update(state);
  const host = node.children.find(child => child.className === "miro-canvas-shape-radius-handle")!;
  const button = host?.children[0]!;
  const input = host?.children[1]!;
  const value = host?.children[2]!;
  const point = (x: number, y: number, pointerId = 1) => {
    const angle = rotation * Math.PI / 180;
    return { clientX: 70 + zoom * (x * Math.cos(angle) - y * Math.sin(angle)),
      clientY: 90 + zoom * (x * Math.sin(angle) + y * Math.cos(angle)), pointerId };
  };
  const down = (x = 16, y = 16, pointerId = 1) => host.dispatch("pointerdown", { target: button, ...point(x, y, pointerId) });
  const move = (x: number, y: number, pointerId = 1) => document.dispatch("pointermove", point(x, y, pointerId));
  const up = (x: number, y: number, pointerId = 1) => document.dispatch("pointerup", point(x, y, pointerId));
  const open = () => host.dispatch("click", { target: button, detail: 0 });
  const edit = (value: string) => {
    input.value = value;
    input.dispatch("input");
  };
  const key = (value: string) => document.dispatch("keydown", { key: value, target: input });
  const update = (patch: Partial<ShapeRadiusHandleState> = {}) => control.update({ ...state, ...patch });
  return { document, node, layer, svg, host, button, input, value, state, control, onPreview, onCommit, onCancel, down, move, up, open, edit, key, update };
}

afterEach(() => setLocale("en"));

describe("shape corner handle", () => {
  it("keeps the pointer target fixed while the corner icon and value follow the radius", () => {
    const item = build({}, 37, 0.75);
    const corner = item.button.children[0]!.children[0]!;
    const original = corner.getAttribute("d");
    const left = item.host.style.left;
    const top = item.host.style.top;
    const transform = item.host.style.transform;
    item.down();
    item.move(40, 40);
    expect(item.onPreview).toHaveBeenLastCalledWith("shape1", expect.closeTo(40));
    expect(corner.getAttribute("d")).not.toBe(original);
    expect(item.host.style.left).toBe(left);
    expect(item.host.style.top).toBe(top);
    expect(item.host.style.transform).toBe(transform);
    item.up(40, 40);
    item.update({ radius: 40 });
    expect(item.host.style.left).toBe(left);
    expect(item.host.style.top).toBe(top);
    item.open();
    item.edit("0");
    expect(corner.getAttribute("d")).toBe("M5 19V5H19");
    expect(item.host.style.left).toBe(left);
    item.key("Escape");
    expect(corner.getAttribute("d")).not.toBe("M5 19V5H19");
    expect(item.host.style.top).toBe(top);
  });

  it("shows square and maximally rounded corners without translating the control", () => {
    const item = build({ radius: 0 });
    const corner = item.button.children[0]!.children[0]!;
    expect(corner.getAttribute("d")).toBe("M5 19V5H19");
    item.down(0, 0);
    item.move(100, 100);
    expect(corner.getAttribute("d")).toBe("M5 19V15A10 10 0 0 1 15 5H19");
    item.document.dispatch("pointercancel");
    expect(corner.getAttribute("d")).toBe("M5 19V5H19");
    expect(item.onCommit).not.toHaveBeenCalled();
    expect(item.host.style.left).toBe("min(50%, 22px)");
  });

  it("distinguishes the corner icon from connection points without an extra focus target", () => {
    const item = build();
    const icon = item.button.children[0]!;
    expect(icon.tagName).toBe("svg");
    expect(icon.getAttribute("aria-hidden")).toBe("true");
    expect(icon.getAttribute("focusable")).toBe("false");
    expect(icon.children.map(child => child.tagName)).toEqual(["path", "path"]);
    expect(item.value.hidden).toBe(true);
    expect(item.value.getAttribute("aria-hidden")).toBe("true");
  });

  it.each(["touch", "pen", "mouse"])("shows live %s feedback before release and hides it after one commit", pointerType => {
    const item = build({}, 37, 0.75);
    item.host.dispatch("pointerdown", { target: item.button, pointerType, pointerId: 5,
      clientX: 70, clientY: 90 });
    expect(item.value.hidden).toBe(false);
    expect(item.value.textContent).toBe(words().enhancements.shapeRadiusLiveValue(16));
    expect(item.host.getAttribute("data-dragging")).toBe("true");
    item.move(12, 12, 5);
    expect(item.value.textContent).toBe(words().enhancements.shapeRadiusLiveValue(28));
    expect(item.onPreview).toHaveBeenLastCalledWith("shape1", expect.closeTo(28));
    expect(item.onCommit).not.toHaveBeenCalled();
    item.up(12, 12, 5);
    expect(item.onCommit).toHaveBeenCalledExactlyOnceWith("shape1", expect.closeTo(28));
    expect(item.host.getAttribute("data-dragging")).toBe("false");
    expect(item.value.hidden).toBe(true);
    expect(item.input.hidden).toBe(true);
  });

  it("hides feedback on cancellation and reuses it for the next finger", () => {
    setLocale("ru");
    const item = build();
    item.down();
    item.move(200, 200);
    expect(item.value.textContent).toBe(words().enhancements.shapeRadiusLiveValue(60));
    item.document.dispatch("pointercancel");
    expect(item.value.hidden).toBe(true);
    expect(item.host.getAttribute("data-dragging")).toBe("false");
    item.down();
    expect(item.value.textContent).toBe(words().enhancements.shapeRadiusLiveValue(16));
    item.up(16, 16);
    expect(item.value.hidden).toBe(true);
    expect(item.onCommit).not.toHaveBeenCalled();
  });

  it.each([[0, 0.5], [90, 2], [37, 0.75], [-120, 1.8]])("projects physical dx/dy at rotation %s and zoom %s", (rotation, zoom) => {
    const item = build({}, rotation, zoom);
    const press = item.down();
    expect(press.preventDefault).toHaveBeenCalledOnce();
    expect(press.stopImmediatePropagation).toHaveBeenCalledOnce();
    expect(item.onPreview).not.toHaveBeenCalled();
    item.move(36, 56);
    expect(item.onPreview).toHaveBeenLastCalledWith("shape1", expect.closeTo(46));
    expect(item.onCommit).not.toHaveBeenCalled();
    item.up(36, 56);
    item.up(36, 56);
    expect(item.onCommit).toHaveBeenCalledExactlyOnceWith("shape1", expect.closeTo(46));
    expect(item.onCancel).not.toHaveBeenCalled();
    expect(item.document.activeListeners()).toBe(0);
  });

  it("uses one equal radius on a non-square figure and clamped accessible spacing", () => {
    const item = build({}, 0, 2);
    expect(item.host.style.left).toBe("min(50%, 11px)");
    expect(item.host.style.top).toBe("min(50%, 11px)");
    expect(item.host.style.transform).toBe("translate(-50%, -50%) scale(0.5)");
    expect(item.host.style.border).toBeUndefined();
    expect(item.node.attributes.size).toBe(1);
    expect(item.input.max).toBe("60");
  });

  it("clamps dragging at zero, half the smaller dimension and 1000", () => {
    const item = build();
    item.down();
    item.move(-100, -100);
    expect(item.onPreview).toHaveBeenLastCalledWith("shape1", 0);
    item.move(900, 900);
    expect(item.onPreview).toHaveBeenLastCalledWith("shape1", 60);
    item.up(900, 900);
    expect(item.onCommit).toHaveBeenCalledExactlyOnceWith("shape1", 60);
    const large = build({ width: 4000, height: 5000 });
    large.down();
    large.up(2000, 2000);
    expect(large.onCommit).toHaveBeenCalledExactlyOnceWith("shape1", 1000);
  });

  it("ignores foreign pointer movement, release and cancel without consuming them", () => {
    const item = build();
    item.down();
    expect(item.move(50, 50, 8).stopImmediatePropagation).not.toHaveBeenCalled();
    item.up(50, 50, 8);
    item.document.dispatch("pointercancel", { pointerId: 8 });
    expect(item.onPreview).not.toHaveBeenCalled();
    expect(item.onCommit).not.toHaveBeenCalled();
    expect(item.onCancel).not.toHaveBeenCalled();
    item.move(24, 24);
    item.up(24, 24);
    expect(item.onCommit).toHaveBeenCalledExactlyOnceWith("shape1", expect.closeTo(24));
  });

  it.each(["pointercancel", "lostpointercapture", "Escape", "readonly", "hidden", "dispose", "selection"])("cancels %s without history and restores the original radius", reason => {
    const item = build();
    item.down();
    item.move(36, 36);
    if (reason === "pointercancel") item.document.dispatch(reason);
    if (reason === "lostpointercapture") item.button.dispatch(reason);
    if (reason === "Escape") item.key(reason);
    if (reason === "readonly") item.update({ editable: false });
    if (reason === "hidden") item.control.update(undefined);
    if (reason === "dispose") item.control.dispose();
    if (reason === "selection") {
      item.node.className = "canvas-node";
      item.update();
    }
    expect(item.onCancel).toHaveBeenCalledOnce();
    expect(item.onCommit).not.toHaveBeenCalled();
    expect(item.host.style.left).toBe("min(50%, 22px)");
    expect(item.document.activeListeners()).toBe(0);
    item.up(36, 36);
    expect(item.onCommit).not.toHaveBeenCalled();
  });

  it("preserves an active gesture through synchronous parent preview updates", () => {
    const item = build();
    item.onPreview.mockImplementation((_id, radius) => item.update({ radius }));
    item.down();
    item.move(30, 30);
    item.move(42, 42);
    item.up(42, 42);
    expect(item.onCommit).toHaveBeenCalledExactlyOnceWith("shape1", expect.closeTo(42));
    item.update({ radius: 42 });
    item.down(42, 42);
    item.up(50, 50);
    expect(item.onCommit).toHaveBeenNthCalledWith(2, "shape1", expect.closeTo(50));
    expect(item.onCancel).not.toHaveBeenCalled();
  });

  it("a click opens only the inline numeric input and a completed drag suppresses its click", () => {
    const item = build();
    item.down();
    item.up(16, 16);
    expect(item.onCommit).not.toHaveBeenCalled();
    item.host.dispatch("click", { target: item.button });
    expect(item.input.hidden).toBe(false);
    expect(item.button.hidden).toBe(true);
    expect(item.document.activeElement).toBe(item.input);
    expect(item.host.children.map(child => child.tagName)).toEqual(["button", "input", "span"]);
    item.key("Escape");
    item.down();
    item.up(24, 24);
    item.host.dispatch("click", { target: item.button });
    expect(item.input.hidden).toBe(true);
    expect(item.onCommit).toHaveBeenCalledOnce();
  });

  it.each(["Enter", "blur"])("accepts exact fractional input once on %s", finish => {
    const item = build();
    item.open();
    item.edit("23.125");
    expect(item.onPreview).toHaveBeenCalledExactlyOnceWith("shape1", 23.125);
    expect(item.onCommit).not.toHaveBeenCalled();
    if (finish === "Enter") item.key(finish);
    else item.input.dispatch("blur");
    item.input.dispatch("blur");
    item.key("Enter");
    expect(item.onCommit).toHaveBeenCalledExactlyOnceWith("shape1", 23.125);
    expect(item.onCancel).not.toHaveBeenCalled();
    expect(item.input.hidden).toBe(true);
    expect(item.document.activeListeners()).toBe(0);
  });

  it.each(["", " ", "NaN", "Infinity", "2bad", "0x20"])("never persists invalid input %j", value => {
    const item = build();
    item.open();
    item.edit("25");
    item.edit(value);
    item.key("Enter");
    expect(item.onCommit).not.toHaveBeenCalled();
    expect(item.input.getAttribute("aria-invalid")).toBe("true");
    expect(item.input.hidden).toBe(false);
    expect(item.input.validityMessage).toBe(words().enhancements.shapeRadiusInvalid);
    item.input.dispatch("blur");
    expect(item.onCancel).toHaveBeenCalledOnce();
    expect(item.onCommit).not.toHaveBeenCalled();
    expect(item.host.style.left).toBe("min(50%, 22px)");
  });

  it("clamps numeric bounds and accepts valid input after an invalid value", () => {
    const item = build();
    item.open();
    item.edit("bad");
    item.edit("250");
    expect(item.input.getAttribute("aria-invalid")).toBe("false");
    item.key("Enter");
    expect(item.onCommit).toHaveBeenCalledExactlyOnceWith("shape1", 60);
    item.update({ radius: 60 });
    item.open();
    item.edit("-10");
    item.input.dispatch("blur");
    expect(item.onCommit).toHaveBeenNthCalledWith(2, "shape1", 0);
  });

  it("Escape and disabling cancel numeric preview without blur committing", () => {
    const item = build();
    item.open();
    item.edit("27.5");
    item.key("Escape");
    item.input.dispatch("blur");
    expect(item.onCancel).toHaveBeenCalledOnce();
    expect(item.onCommit).not.toHaveBeenCalled();
    item.open();
    expect(item.input.value).toBe("16");
    item.edit("35");
    item.control.update(undefined);
    item.input.dispatch("blur");
    expect(item.onCancel).toHaveBeenCalledTimes(2);
    expect(item.onCommit).not.toHaveBeenCalled();
  });

  it("allows typing and caret gestures inside the input while blocking native board gestures", () => {
    const item = build();
    item.open();
    const press = item.host.dispatch("pointerdown", { target: item.input });
    expect(press.preventDefault).not.toHaveBeenCalled();
    expect(press.stopImmediatePropagation).toHaveBeenCalledOnce();
    const key = item.key("ArrowLeft");
    expect(key.preventDefault).not.toHaveBeenCalled();
    expect(key.stopImmediatePropagation).toHaveBeenCalledOnce();
    const click = item.host.dispatch("click", { target: item.input });
    expect(click.preventDefault).not.toHaveBeenCalled();
  });

  it.each([{ editable: false }, { width: 0 }, { height: -1 }, { zoom: 0 }, { zoom: NaN }, { radius: Infinity }, { id: "other" }])("fails closed for invalid state %j", patch => {
    const item = build(patch);
    expect(item.host).toBeUndefined();
    expect(item.onCommit).not.toHaveBeenCalled();
  });

  it.each(["detached", "foreign document", "wrong viewBox", "nested node", "missing SVG"])("rejects %s", reason => {
    const item = build();
    if (reason === "detached") item.node.isConnected = false;
    if (reason === "foreign document") item.update({ nodeEl: new Element("div", new FakeDocument()) as unknown as HTMLElement });
    if (reason === "wrong viewBox") item.svg.setAttribute("viewBox", "0 0 400 120");
    if (reason === "nested node") item.layer.className += " canvas-node";
    if (reason === "missing SVG") item.svg.remove();
    if (reason !== "foreign document") item.update();
    expect(item.host.parentNode).toBeUndefined();
  });

  it("refuses absent/singular CTM and cancels a drag when the node becomes unselected", () => {
    const item = build();
    item.svg.getScreenCTM.mockImplementation(() => { throw new Error("singular"); });
    item.down();
    item.up(30, 30);
    expect(item.onCommit).not.toHaveBeenCalled();
    expect(item.document.activeListeners()).toBe(0);
    item.svg.getScreenCTM.mockReset();
    item.svg.getScreenCTM.mockImplementation(() => ({ inverse: vi.fn(() => ({ a: 0.25, b: 0, c: 0, d: 100 / 120, e: -17.5, f: -75 })) }));
    item.down();
    item.move(25, 25);
    item.node.className = "canvas-node";
    item.up(40, 40);
    expect(item.onCancel).toHaveBeenCalledOnce();
    expect(item.onCommit).not.toHaveBeenCalled();
  });

  it("dispose removes all listeners, is idempotent and prevents reuse", () => {
    const item = build();
    item.open();
    item.edit("30");
    item.control.dispose();
    item.control.dispose();
    item.update();
    item.host.dispatch("click", { target: item.button });
    item.input.dispatch("blur");
    expect(item.onCancel).toHaveBeenCalledOnce();
    expect(item.onCommit).not.toHaveBeenCalled();
    expect(item.host.parentNode).toBeUndefined();
    expect([item.document, item.host, item.button, item.input].map(element => element.activeListeners())).toEqual([0, 0, 0, 0]);
  });

  it("rejects missing and nonfinite screen matrices without starting a gesture", () => {
    const item = build();
    item.svg.getScreenCTM.mockReturnValue(null as never);
    item.down();
    expect(item.document.activeListeners()).toBe(0);
    item.svg.getScreenCTM.mockImplementation(() => ({ inverse: vi.fn(() => ({ a: NaN, b: 0, c: 0, d: 1, e: 0, f: 0 })) }));
    item.down();
    expect(item.document.activeListeners()).toBe(0);
    expect(item.onCommit).not.toHaveBeenCalled();
  });

  it("cancels an edit if native numeric input reports an incomplete value", () => {
    const item = build();
    item.open();
    item.input.validity.badInput = true;
    item.edit("2");
    item.key("Enter");
    expect(item.onCommit).not.toHaveBeenCalled();
    expect(item.input.getAttribute("aria-invalid")).toBe("true");
    item.input.dispatch("blur");
    expect(item.onCancel).toHaveBeenCalledOnce();
  });

  it("blocks button keyboard propagation while keeping native keyboard activation", () => {
    const item = build();
    const key = item.host.dispatch("keydown", { key: "Enter", target: item.button });
    expect(key.stopImmediatePropagation).toHaveBeenCalledOnce();
    expect(key.preventDefault).not.toHaveBeenCalled();
    item.open();
    expect(item.input.hidden).toBe(false);
  });

  it("cancels geometry changes and does not repeatedly cancel when hidden", () => {
    const item = build();
    item.down();
    item.move(28, 28);
    item.update({ width: 500 });
    expect(item.onCancel).toHaveBeenCalledOnce();
    expect(item.onCommit).not.toHaveBeenCalled();
    expect(item.document.activeListeners()).toBe(0);
    item.control.update(undefined);
    item.control.update(undefined);
    expect(item.onCancel).toHaveBeenCalledOnce();
  });

  it("builds localized labels for Russian controls and the settings toggle", () => {
    setLocale("ru");
    const item = build();
    expect(item.button.title).toBe(words().enhancements.shapeRadiusValue(16));
    expect(item.input.getAttribute("aria-label")).toBe("Радиус скругления фигуры в пикселях доски");
    expect(words().enhancements.shapeRadiusControl).toBe("Регулировка скругления фигур");
  });
});
