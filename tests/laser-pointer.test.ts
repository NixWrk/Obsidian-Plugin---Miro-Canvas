import { describe, expect, it, vi } from "vitest";
import { LaserPointer } from "../src/laser-pointer";

type TestEvent = Event & { stopped?: boolean; immediate?: boolean; prevented?: boolean };

class Target {
  public readonly listeners = new Map<string, EventListener[]>();
  public addEventListener(name: string, listener: EventListener): void {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener]);
  }
  public removeEventListener(name: string, listener: EventListener): void {
    this.listeners.set(name, (this.listeners.get(name) ?? []).filter(item => item !== listener));
  }
  public deliver(name: string, event: TestEvent): void {
    for (const listener of [...(this.listeners.get(name) ?? [])]) {
      listener(event);
      if (event.immediate) break;
    }
  }
  public count(): number {
    return [...this.listeners.values()].reduce((sum, items) => sum + items.length, 0);
  }
}

class OwnerWindow extends Target {
  public now = 0;
  public readonly performance = { now: () => this.now };
  public readonly timers = new Map<number, { run: () => void; at: number }>();
  private nextTimer = 1;
  public setTimeout(run: () => void, delay: number): number {
    const id = this.nextTimer++;
    this.timers.set(id, { run, at: this.now + delay });
    return id;
  }
  public clearTimeout(id: number): void { this.timers.delete(id); }
  public advance(duration: number): void {
    const end = this.now + duration;
    while (true) {
      const next = [...this.timers].sort((a, b) => a[1].at - b[1].at)[0];
      if (next === undefined || next[1].at > end) break;
      this.now = next[1].at;
      this.timers.delete(next[0]);
      next[1].run();
    }
    this.now = end;
  }
}

class Node extends Target {
  public readonly children: Node[] = [];
  public readonly attributes = new Map<string, string>();
  public readonly style = { left: "", top: "", opacity: "", pointerEvents: "" };
  public parentElement: Node | null = null;
  public className = "";
  public hidden = false;
  public captured: number | undefined;
  public childWrites = 0;
  public bounds = { left: 50, top: 80, right: 450, bottom: 380 };
  public constructor(public readonly tagName: string, public readonly ownerDocument: OwnerDocument) { super(); }
  public appendChild(child: Node): Node {
    child.remove();
    child.parentElement = this;
    this.children.push(child);
    this.childWrites += 1;
    return child;
  }
  public remove(): void {
    if (this.parentElement !== null) {
      this.parentElement.children.splice(this.parentElement.children.indexOf(this), 1);
      this.parentElement.childWrites += 1;
      this.parentElement = null;
    }
  }
  public setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
  public getAttribute(name: string): string | null { return this.attributes.get(name) ?? null; }
  public removeAttribute(name: string): void { this.attributes.delete(name); }
  public contains(node: Node): boolean { return this === node || this.children.some(child => child.contains(node)); }
  public closest(selector: string): Node | null {
    const matches = selector.split(",").some(raw => {
      const item = raw.trim();
      if (item.startsWith(".")) return item.slice(1).split(".").every(name => this.className.split(" ").includes(name));
      if (item.startsWith("[contenteditable]")) return this.attributes.has("contenteditable") && this.getAttribute("contenteditable") !== "false";
      if (item.startsWith("[role=")) return this.getAttribute("role") === item.slice(7, -2);
      return item === this.tagName;
    });
    return matches ? this : this.parentElement?.closest(selector) ?? null;
  }
  public getBoundingClientRect() { return this.bounds; }
  public setPointerCapture(id: number): void { this.captured = id; }
  public releasePointerCapture(id: number): void { if (this.captured === id) this.captured = undefined; }
}

class OwnerDocument extends Target {
  public defaultView: OwnerWindow | null = new OwnerWindow();
  public hidden = false;
  public hit: Node | null = null;
  public createElement(tag: string): Node { return new Node(tag, this); }
  public elementFromPoint(): Node | null { return this.hit; }
}

function event(target: Node, props: Record<string, unknown> = {}): TestEvent {
  const path: Target[] = [];
  let current: Node | null = target;
  while (current !== null) {
    path.push(current);
    current = current.parentElement;
  }
  path.push(target.ownerDocument);
  const result = {
    target, button: 0, buttons: 0, pointerId: 1, pointerType: "mouse", isPrimary: true,
    clientX: 100, clientY: 150, ...props,
    composedPath: () => path,
    preventDefault: () => { result.prevented = true; },
    stopPropagation: () => { result.stopped = true; },
    stopImmediatePropagation: () => { result.immediate = true; result.stopped = true; },
    prevented: false, stopped: false, immediate: false,
  };
  return result as unknown as TestEvent;
}

function setup() {
  const document = new OwnerDocument();
  const view = document.defaultView!;
  const root = document.createElement("div");
  const card = root.appendChild(document.createElement("div"));
  card.className = "canvas-node";
  document.hit = card;
  const laser = new LaserPointer(root as unknown as HTMLElement);
  const layer = () => root.children.find(node => node.className === "miro-canvas-laser-pointer");
  const dot = () => layer()!.children[0];
  const visible = () => layer()?.children.filter(node => !node.hidden) ?? [];
  const fire = (name: string, props: Record<string, unknown> = {}, target = card) => {
    const value = event(target, props);
    document.deliver(name, value);
    // Owner-document capture precedes any earlier-installed native root capture.
    if (!value.stopped) root.deliver(name, value);
    return value;
  };
  return { document, view, root, card, laser, layer, dot, visible, fire };
}

describe("temporary laser pointer", () => {
  it("is completely transparent while disabled and after disposal", () => {
    const item = setup();
    expect(item.laser.enabled).toBe(false);
    expect(item.layer()).toBeUndefined();
    expect(item.document.count()).toBe(0);
    expect(item.fire("pointerdown").prevented).toBe(false);
    item.laser.setEnabled(true);
    item.laser.setEnabled(true);
    const count = item.document.count();
    item.laser.setEnabled(false);
    expect(item.document.count()).toBe(0);
    expect(item.view.count()).toBe(0);
    expect(item.root.count()).toBe(0);
    expect(item.view.timers.size).toBe(0);
    expect(item.layer()).toBeUndefined();
    expect(count).toBeGreaterThan(0);
    item.laser.dispose();
    item.laser.dispose();
    item.laser.setEnabled(true);
    expect(item.laser.enabled).toBe(false);
    expect(item.root.getAttribute("data-miro-laser-enabled")).toBeNull();
  });

  it.each(["mouse", "touch", "pen"])("owns a primary %s gesture before native root input", pointerType => {
    const item = setup();
    const native = vi.fn();
    item.root.addEventListener("pointerdown", native);
    item.laser.setEnabled(true);
    expect(item.fire("pointerdown", { pointerType, pointerId: 9 }).immediate).toBe(true);
    expect(native).not.toHaveBeenCalled();
    expect(item.root.captured).toBe(9);
    expect(item.dot().style.left).toBe("50px");
    expect(item.dot().style.top).toBe("70px");
    expect(item.fire("pointermove", { pointerType, pointerId: 9, clientX: 220, clientY: 250 }).prevented).toBe(true);
    expect(item.dot().style.left).toBe("170px");
    expect(item.dot().style.top).toBe("170px");
    expect(item.fire("pointermove", { pointerId: 10 }).prevented).toBe(false);
    expect(item.fire("pointerup", { pointerId: 9 }).prevented).toBe(true);
    expect(item.root.captured).toBeUndefined();
    expect(item.dot().hidden).toBe(true);
    expect(item.visible().length).toBeGreaterThan(0);
    item.view.advance(640);
    expect(item.visible()).toHaveLength(0);
    expect(item.view.timers.size).toBe(0);
  });

  it("supports unconsumed mouse hover but not touch or pen hover or held native mouse navigation", () => {
    const item = setup();
    item.laser.setEnabled(true);
    expect(item.fire("pointermove").prevented).toBe(false);
    expect(item.dot().hidden).toBe(false);
    item.laser.clear();
    for (const pointerType of ["touch", "pen"]) {
      item.fire("pointermove", { pointerType });
      expect(item.visible()).toHaveLength(0);
    }
    item.fire("pointermove", { buttons: 2 });
    expect(item.visible()).toHaveLength(0);
    expect(item.fire("pointerdown", { button: 2 }).prevented).toBe(false);
    expect(item.fire("pointerdown", { isPrimary: false, pointerType: "touch" }).prevented).toBe(false);
    expect(item.view.timers.size).toBe(0);
  });

  it.each(["button", "a", "input", "textarea", "select", "summary", "iframe", "object", "embed", "video", "audio"])("does not take %s input, hover or clicks", tag => {
    const item = setup();
    const control = item.card.appendChild(item.document.createElement(tag));
    const child = control.appendChild(item.document.createElement("span"));
    item.laser.setEnabled(true);
    for (const name of ["pointerdown", "pointermove", "click", "dblclick"]) {
      expect(item.fire(name, {}, child).prevented).toBe(false);
    }
    expect(item.visible()).toHaveLength(0);
  });

  it.each(["canvas-controls", "canvas-menu", "canvas-node-resizer", "canvas-node-connection-point", "miro-canvas-slideshow", "miro-canvas-toolbar", "miro-canvas-panel", "miro-canvas-shape-radius-handle", "miro-canvas-thread", "miro-canvas-minimap", "miro-canvas-export", "miro-canvas-export-page__tab", "markdown-embed", "file-embed", "pdf-embed"])("leaves %s gestures native", className => {
    const item = setup();
    const control = item.root.appendChild(item.document.createElement("div"));
    control.className = className;
    item.laser.setEnabled(true);
    expect(item.fire("pointerdown", {}, control).prevented).toBe(false);
    expect(item.fire("click", {}, control).prevented).toBe(false);
    expect(item.visible()).toHaveLength(0);
  });

  it("leaves editable card content and semantic controls native but can point at static Markdown", () => {
    const item = setup();
    const content = item.card.appendChild(item.document.createElement("div"));
    content.className = "canvas-node-content markdown-preview-view";
    item.laser.setEnabled(true);
    item.fire("pointermove", {}, content);
    expect(item.dot().hidden).toBe(false);
    item.laser.clear();
    for (const [name, value] of [["contenteditable", ""], ["role", "slider"], ["role", "button"], ["role", "dialog"]]) {
      content.setAttribute(name, value);
      expect(item.fire("pointerdown", {}, content).prevented).toBe(false);
      content.removeAttribute(name);
    }
    item.card.className = "canvas-node is-editing";
    expect(item.fire("pointerdown", {}, content).prevented).toBe(false);
    expect(item.visible()).toHaveLength(0);
  });

  it("is scoped to its root, owning document and finite viewport coordinates", () => {
    const item = setup();
    const foreign = item.document.createElement("div");
    item.laser.setEnabled(true);
    expect(item.fire("pointerdown", {}, foreign).prevented).toBe(false);
    for (const clientX of [49, 450, NaN, Infinity]) expect(item.fire("pointerdown", { clientX }).prevented).toBe(false);
    const other = new OwnerDocument();
    other.deliver("pointerdown", event(other.createElement("div")));
    expect(item.visible()).toHaveLength(0);
    expect(other.count()).toBe(0);
  });

  it("never grows or replaces its pool, touches card DOM or queues more than one owner timer", () => {
    const item = setup();
    item.laser.setEnabled(true);
    const pool = [...item.layer()!.children];
    const writes = [item.root.childWrites, item.card.childWrites, item.layer()!.childWrites];
    for (let index = 0; index < 4000; index += 1) {
      item.fire("pointermove", { clientX: 60 + index % 300 });
      expect(item.view.timers.size).toBe(1);
    }
    expect(item.layer()!.children).toEqual(pool);
    expect(pool.filter(node => node.className.endsWith("__trail"))).toHaveLength(64);
    expect([item.root.childWrites, item.card.childWrites, item.layer()!.childWrites]).toEqual(writes);
    item.view.advance(320);
    expect(Number(pool[1].style.opacity)).toBeGreaterThan(0);
    expect(Number(pool[1].style.opacity)).toBeLessThan(1);
    item.view.advance(320);
    expect(item.visible()).toHaveLength(0);
    expect(item.view.timers.size).toBe(0);
    item.view.advance(60000);
    expect(item.view.timers.size).toBe(0);
  });

  it("continues consuming a captured gesture outside the viewport or over controls without painting there", () => {
    const item = setup();
    item.laser.setEnabled(true);
    item.fire("pointerdown");
    expect(item.fire("pointermove", { clientX: 500 }).prevented).toBe(true);
    expect(item.dot().hidden).toBe(true);
    const control = item.root.appendChild(item.document.createElement("button"));
    item.document.hit = control;
    expect(item.fire("pointermove").prevented).toBe(true);
    expect(item.dot().hidden).toBe(true);
    expect(item.fire("pointerup").prevented).toBe(true);
    expect(item.fire("click", {}, control).prevented).toBe(false);
    item.document.hit = item.card;
    expect(item.fire("click").prevented).toBe(true);
    expect(item.fire("dblclick").prevented).toBe(true);
  });

  it.each(["pointercancel", "lostpointercapture", "blur", "pagehide", "visibilitychange", "clear", "disable", "dispose"])("clears state and cancels timer/capture on %s", reason => {
    const item = setup();
    item.laser.setEnabled(true);
    item.fire("pointerdown");
    const late = [...item.view.timers.values()][0].run;
    if (reason === "pointercancel") item.fire(reason);
    else if (reason === "lostpointercapture") item.root.deliver(reason, event(item.root));
    else if (reason === "blur" || reason === "pagehide") item.view.deliver(reason, event(item.root));
    else if (reason === "visibilitychange") { item.document.hidden = true; item.document.deliver(reason, event(item.root)); }
    else if (reason === "clear") item.laser.clear();
    else if (reason === "disable") item.laser.setEnabled(false);
    else item.laser.dispose();
    expect(item.root.captured).toBeUndefined();
    expect(item.visible()).toHaveLength(0);
    expect(item.view.timers.size).toBe(0);
    late();
    expect(item.view.timers.size).toBe(0);
    expect(item.visible()).toHaveLength(0);
  });

  it("does not clear on unrelated cancellation or a visible visibility event; pointer leave clears hover", () => {
    const item = setup();
    item.laser.setEnabled(true);
    item.fire("pointerdown");
    expect(item.fire("pointercancel", { pointerId: 2 }).prevented).toBe(false);
    item.document.deliver("visibilitychange", event(item.root));
    item.root.deliver("pointerleave", event(item.root));
    expect(item.dot().hidden).toBe(false);
    item.fire("pointerup");
    item.fire("pointermove");
    item.root.deliver("pointerleave", event(item.card));
    expect(item.dot().hidden).toBe(false);
    item.root.deliver("pointerleave", event(item.root));
    expect(item.visible()).toHaveLength(0);
    expect(item.view.timers.size).toBe(0);
  });

  it("falls back to owner-document listeners when native pointer capture is unavailable", () => {
    const item = setup();
    item.root.setPointerCapture = () => { throw new Error("No capture"); };
    item.root.releasePointerCapture = () => { throw new Error("No capture"); };
    item.laser.setEnabled(true);
    expect(item.fire("pointerdown").prevented).toBe(true);
    expect(item.fire("pointermove").prevented).toBe(true);
    expect(item.fire("pointerup").prevented).toBe(true);
    item.laser.dispose();
    expect(item.document.count()).toBe(0);
  });

  it("restores its prior root attribute but preserves a newer foreign value", () => {
    const item = setup();
    item.root.setAttribute("data-miro-laser-enabled", "previous");
    item.laser.setEnabled(true);
    item.laser.setEnabled(false);
    expect(item.root.getAttribute("data-miro-laser-enabled")).toBe("previous");
    item.laser.setEnabled(true);
    item.root.setAttribute("data-miro-laser-enabled", "other-owner");
    item.laser.dispose();
    expect(item.root.getAttribute("data-miro-laser-enabled")).toBe("other-owner");
  });

  it("fails closed without an owner window instead of using global timers", () => {
    const document = new OwnerDocument();
    document.defaultView = null;
    const root = document.createElement("div");
    const laser = new LaserPointer(root as unknown as HTMLElement);
    laser.setEnabled(true);
    expect(laser.enabled).toBe(false);
    expect(root.children).toHaveLength(0);
    expect(document.count()).toBe(0);
    laser.dispose();
  });
});
