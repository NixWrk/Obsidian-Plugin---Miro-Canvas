import { afterEach, describe, expect, it, vi } from "vitest";

import { PenTooltips } from "../src/pen-tooltips";

/**
 * Just enough of a page for the watcher: elements that know their class,
 * attributes, parent and box, a document and a window that are event
 * targets, and timers the test runs by advancing the clock.
 */
class FakeElement {
  public readonly nodeType = 1;
  public readonly attributes = new Map<string, string>();
  public readonly children: FakeElement[] = [];
  public readonly style: Record<string, string> = {};
  public parentElement: FakeElement | undefined;
  public className = "";
  public connected = true;
  public textContent = "";
  public rect = { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };

  public constructor(public readonly tagName = "DIV") {}

  public get isConnected(): boolean {
    return this.connected;
  }

  public setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  public getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  public appendChild<Child extends FakeElement>(child: Child): Child {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  public remove(): void {
    if (this.parentElement !== undefined) this.parentElement.children.splice(this.parentElement.children.indexOf(this), 1);
    this.parentElement = undefined;
    this.connected = false;
  }

  public contains(other: unknown): boolean {
    for (let node = other as FakeElement | undefined; node !== undefined; node = node.parentElement) if (node === this) return true;
    return false;
  }

  public getBoundingClientRect() {
    return this.rect;
  }

  /** Reads the three kinds of selector the watcher uses: `[attribute]`, `[class*="part"]` and `.name`. */
  public matches(selector: string): boolean {
    return selector.split(",").map((part) => part.trim()).some((part) => {
      const contained = /^\[class\*="(.+)"\]$/u.exec(part);
      if (contained !== null) return this.className.includes(contained[1]!);
      const attribute = /^\[([a-z-]+)\]$/u.exec(part);
      if (attribute !== null) return this.attributes.has(attribute[1]!);
      return part.startsWith(".") && this.className.split(/\s+/u).includes(part.slice(1));
    });
  }

  public closest(selector: string): FakeElement | null {
    for (let node: FakeElement | undefined = this; node !== undefined; node = node.parentElement) if (node.matches(selector)) return node;
    return null;
  }
}

/** A browser matches the capture flag of a listener removed to the one added; Node's EventTarget does not. */
function captureFlagAsInBrowsers<Target extends EventTarget>(target: Target): Target {
  const add = target.addEventListener.bind(target);
  const remove = target.removeEventListener.bind(target);
  target.addEventListener = (type, listener, options) => add(type, listener, typeof options === "boolean" ? { capture: options } : options);
  target.removeEventListener = (type, listener, options) => remove(type, listener, typeof options === "boolean" ? { capture: options } : options);
  return target;
}

function page(size = { width: 1000, height: 800 }) {
  const view = Object.assign(captureFlagAsInBrowsers(new EventTarget()), {
    innerWidth: size.width,
    innerHeight: size.height,
    setTimeout: (callback: () => void, delay: number) => setTimeout(callback, delay),
    clearTimeout: (handle: ReturnType<typeof setTimeout>) => clearTimeout(handle),
  });
  const body = new FakeElement("BODY");
  const document = Object.assign(captureFlagAsInBrowsers(new EventTarget()), {
    defaultView: view,
    body,
    createElement: (tag: string) => new FakeElement(tag.toUpperCase()),
    createTextNode: (text: string) => Object.assign(new FakeElement("#text"), { textContent: text }),
    querySelector: (selector: string) => body.children.find((child) => child.matches(selector)) ?? null,
  });
  // The tooltip measures itself once it is on the page: 80 wide and 30 tall.
  const measured = vi.spyOn(FakeElement.prototype, "getBoundingClientRect");
  measured.mockImplementation(function (this: FakeElement) {
    return this.className.includes("miro-canvas-pen-tooltip")
      ? { left: 0, top: 0, right: 80, bottom: 30, width: 80, height: 30 }
      : this.rect;
  });
  const control = (label: string, extra: Record<string, string> = {}, box = { left: 100, top: 400, width: 32, height: 32 }) => {
    const bar = body.appendChild(Object.assign(new FakeElement(), { className: "miro-canvas-toolbar miro-canvas-tools" }));
    const button = bar.appendChild(Object.assign(new FakeElement("BUTTON"), { className: "miro-canvas-toolbar__button" }));
    button.setAttribute("aria-label", label);
    for (const [name, value] of Object.entries(extra)) button.setAttribute(name, value);
    button.rect = { ...box, right: box.left + box.width, bottom: box.top + box.height };
    return button;
  };
  const pointer = (type: string, target: FakeElement | undefined, fields: Record<string, unknown> = {}) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    const values = { pointerType: "pen", pointerId: 7, buttons: 0, relatedTarget: null, target, ...fields };
    for (const [name, value] of Object.entries(values)) Object.defineProperty(event, name, { value });
    document.dispatchEvent(event);
    return event;
  };
  const shown = () => body.children.filter((child) => child.className.includes("tooltip"));
  return { view, document: document as unknown as Document, fake: document, body, control, pointer, shown };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const mobile = { isMobile: () => true };

describe("a stylus hovering over a control of the board, on a phone or a tablet", () => {
  it("shows the control's label after the delay it asks for, in Obsidian's tooltip classes, above a control that asks for that", () => {
    vi.useFakeTimers();
    const { document, control, pointer, shown } = page();
    new PenTooltips(mobile).attach(document);
    const pen = control("Pen\nP", { "data-tooltip-position": "top", "data-tooltip-delay": "200" });
    pointer("pointerover", pen);
    vi.advanceTimersByTime(199);
    expect(shown()).toHaveLength(0);
    vi.advanceTimersByTime(1);
    const [tooltip] = shown();
    expect(tooltip!.className).toBe("tooltip miro-canvas-pen-tooltip mod-top");
    expect(tooltip!.children[0]!.textContent).toBe("Pen\nP");
    expect(tooltip!.children[1]!.className).toBe("tooltip-arrow");
    // Centred over the control (its middle at 116), its foot a gap above the control's top (400 - 13 - 30).
    expect(tooltip!.style.left).toBe("116px");
    expect(tooltip!.style.top).toBe("357px");
    expect(tooltip!.style.pointerEvents).toBe("none");
    // Its measured size is fixed, so that it does not shrink to the room left at a window's edge.
    expect([tooltip!.style.width, tooltip!.style.height]).toEqual(["80px", "30px"]);
  });

  it("waits Obsidian's own second for a control that names no delay, and sits below it", () => {
    vi.useFakeTimers();
    const { document, control, pointer, shown } = page();
    new PenTooltips(mobile).attach(document);
    const button = control("Lock comment");
    pointer("pointerover", button);
    vi.advanceTimersByTime(999);
    expect(shown()).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(shown()[0]!.className).toBe("tooltip miro-canvas-pen-tooltip");
    expect(shown()[0]!.style.top).toBe("445px");
  });

  it("takes the label of the control the pen is over when it is over one of its parts", () => {
    vi.useFakeTimers();
    const { document, control, pointer, shown } = page();
    new PenTooltips(mobile).attach(document);
    const button = control("Highlighter", { "data-tooltip-delay": "75" });
    const icon = button.appendChild(new FakeElement("svg"));
    pointer("pointerover", icon);
    vi.advanceTimersByTime(75);
    expect(shown()[0]!.children[0]!.textContent).toBe("Highlighter");
  });

  it("goes when the pen leaves the control, and does not come back for a part of the same control", () => {
    vi.useFakeTimers();
    const { document, control, pointer, shown } = page();
    new PenTooltips(mobile).attach(document);
    const button = control("Eraser", { "data-tooltip-delay": "50" });
    const icon = button.appendChild(new FakeElement("svg"));
    pointer("pointerover", button);
    vi.advanceTimersByTime(50);
    expect(shown()).toHaveLength(1);
    // Over another part of the same control is still over it.
    pointer("pointerout", button, { relatedTarget: icon });
    pointer("pointerover", icon);
    expect(shown()).toHaveLength(1);
    // Out of the control altogether.
    pointer("pointerout", icon, { relatedTarget: new FakeElement() });
    expect(shown()).toHaveLength(0);
  });

  it("goes when the pen leaves the range of the screen", () => {
    vi.useFakeTimers();
    const { document, control, pointer, shown } = page();
    new PenTooltips(mobile).attach(document);
    const button = control("Eraser", { "data-tooltip-delay": "50" });
    pointer("pointerover", button);
    vi.advanceTimersByTime(50);
    expect(shown()).toHaveLength(1);
    pointer("pointerout", button, { relatedTarget: null });
    expect(shown()).toHaveLength(0);
  });

  it("goes, and the wait for it ends, when the pen touches the screen", () => {
    vi.useFakeTimers();
    const { document, control, pointer, shown } = page();
    new PenTooltips(mobile).attach(document);
    const button = control("Smart drawing", { "data-tooltip-delay": "50" });
    pointer("pointerover", button);
    vi.advanceTimersByTime(50);
    expect(shown()).toHaveLength(1);
    pointer("pointerdown", button, { buttons: 1 });
    expect(shown()).toHaveLength(0);
    // Still pressed, the pen moves on to another control: it is drawing, not hovering.
    const other = control("Pen\nP", { "data-tooltip-delay": "50" });
    pointer("pointerover", other);
    vi.advanceTimersByTime(500);
    expect(shown()).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
    // Lifted, it hovers again.
    pointer("pointerup", other);
    pointer("pointerover", control("Select\nV", { "data-tooltip-delay": "50" }));
    vi.advanceTimersByTime(50);
    expect(shown()).toHaveLength(1);
  });

  it("goes when a pointer of another kind is pressed anywhere, or the pen is taken away by the system", () => {
    vi.useFakeTimers();
    const { document, control, pointer, shown } = page();
    new PenTooltips(mobile).attach(document);
    const button = control("Eraser", { "data-tooltip-delay": "50" });
    pointer("pointerover", button);
    vi.advanceTimersByTime(50);
    pointer("pointerdown", new FakeElement(), { pointerType: "touch", pointerId: 2 });
    expect(shown()).toHaveLength(0);
    pointer("pointerover", button);
    vi.advanceTimersByTime(50);
    expect(shown()).toHaveLength(1);
    pointer("pointercancel", button);
    expect(shown()).toHaveLength(0);
  });

  it("moves to the label of the next control, after that control's own delay", () => {
    vi.useFakeTimers();
    const { document, control, pointer, shown } = page();
    new PenTooltips(mobile).attach(document);
    const first = control("Pen\nP", { "data-tooltip-delay": "50" });
    const second = control("Eraser", { "data-tooltip-delay": "300" }, { left: 150, top: 400, width: 32, height: 32 });
    pointer("pointerover", first);
    vi.advanceTimersByTime(50);
    expect(shown()[0]!.children[0]!.textContent).toBe("Pen\nP");
    pointer("pointerout", first, { relatedTarget: second });
    pointer("pointerover", second);
    expect(shown()).toHaveLength(0);
    vi.advanceTimersByTime(300);
    expect(shown()).toHaveLength(1);
    expect(shown()[0]!.children[0]!.textContent).toBe("Eraser");
  });

  it("never shows one for a finger or a mouse", () => {
    vi.useFakeTimers();
    const { document, control, pointer, shown } = page();
    new PenTooltips(mobile).attach(document);
    const button = control("Eraser", { "data-tooltip-delay": "10" });
    for (const pointerType of ["touch", "mouse"]) {
      pointer("pointerover", button, { pointerType, pointerId: 3 });
      vi.advanceTimersByTime(2_000);
      expect(shown()).toHaveLength(0);
    }
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps the pen's tooltip while a mouse, or the mouse a browser makes of a pen it is driven with, comes and goes", () => {
    vi.useFakeTimers();
    const { document, control, pointer, shown } = page();
    new PenTooltips(mobile).attach(document);
    const button = control("Eraser", { "data-tooltip-delay": "50" });
    // The mouse arrives before the pen's wait is over, and again after the tooltip is up.
    pointer("pointerover", button);
    pointer("pointerover", button, { pointerType: "mouse", pointerId: 1 });
    vi.advanceTimersByTime(50);
    expect(shown()).toHaveLength(1);
    pointer("pointerout", button, { pointerType: "mouse", pointerId: 1, relatedTarget: new FakeElement() });
    pointer("pointerover", new FakeElement(), { pointerType: "mouse", pointerId: 1 });
    expect(shown()).toHaveLength(1);
  });

  it("shows nothing for a control that is not the board's, or has no label, or only names a group", () => {
    vi.useFakeTimers();
    const { document, body, control, pointer, shown } = page();
    new PenTooltips(mobile).attach(document);
    const foreign = body.appendChild(Object.assign(new FakeElement("BUTTON"), { className: "clickable-icon" }));
    foreign.setAttribute("aria-label", "Obsidian's own");
    const unlabelled = control("");
    const group = control("Board tools");
    group.setAttribute("role", "toolbar");
    for (const target of [foreign, unlabelled, group]) {
      pointer("pointerover", target);
      vi.advanceTimersByTime(2_000);
    }
    expect(shown()).toHaveLength(0);
  });

  it("shows nothing on a computer, where the mouse has Obsidian's own tooltips and a pen is left to them", () => {
    vi.useFakeTimers();
    const { document, control, pointer, shown } = page();
    new PenTooltips({ isMobile: () => false }).attach(document);
    const button = control("Eraser", { "data-tooltip-delay": "10" });
    pointer("pointerover", button);
    vi.advanceTimersByTime(2_000);
    expect(shown()).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("shows no second tooltip while Obsidian's own is up", () => {
    vi.useFakeTimers();
    const { document, body, control, pointer, shown } = page();
    new PenTooltips(mobile).attach(document);
    body.appendChild(Object.assign(new FakeElement(), { className: "tooltip mod-top" }));
    pointer("pointerover", control("Eraser", { "data-tooltip-delay": "10" }));
    vi.advanceTimersByTime(100);
    expect(shown()).toHaveLength(1);
  });

  it("stays in the window: nearer the edge than its own half width, and on the other side of a control without room", () => {
    vi.useFakeTimers();
    const { document, control, pointer, shown } = page({ width: 1000, height: 800 });
    new PenTooltips(mobile).attach(document);
    // A control at the far left asking for a tooltip above it: the tooltip's middle is kept 44 in (4 + half of 80).
    const left = control("Select\nV", { "data-tooltip-position": "top", "data-tooltip-delay": "10" }, { left: 0, top: 400, width: 32, height: 32 });
    pointer("pointerover", left);
    vi.advanceTimersByTime(10);
    expect(shown()[0]!.style.left).toBe("44px");
    pointer("pointerout", left, { relatedTarget: null });
    // A control at the very top: no room above, so it is put below.
    const top = control("Frame\nF", { "data-tooltip-position": "top", "data-tooltip-delay": "10" }, { left: 500, top: 2, width: 32, height: 32 });
    pointer("pointerover", top);
    vi.advanceTimersByTime(10);
    expect(shown()[0]!.className).toBe("tooltip miro-canvas-pen-tooltip");
    expect(shown()[0]!.style.top).toBe("47px");
  });

  it("puts a tooltip asked for at the side of a control at that side, on the middle of the control", () => {
    vi.useFakeTimers();
    const { document, control, pointer, shown } = page();
    new PenTooltips(mobile).attach(document);
    const button = control("Delete", { "data-tooltip-position": "right", "data-tooltip-delay": "10" }, { left: 100, top: 400, width: 32, height: 32 });
    pointer("pointerover", button);
    vi.advanceTimersByTime(10);
    const tooltip = shown()[0]!;
    expect(tooltip.className).toBe("tooltip miro-canvas-pen-tooltip mod-right");
    expect(tooltip.style.left).toBe("145px");
    expect(tooltip.style.top).toBe("416px");
  });

  it("is not shown for a control that left the page while the pen waited, and watches a window once", () => {
    vi.useFakeTimers();
    const { document, control, pointer, shown } = page();
    const watcher = new PenTooltips(mobile);
    watcher.attach(document);
    watcher.attach(document);
    const button = control("Eraser", { "data-tooltip-delay": "50" });
    pointer("pointerover", button);
    button.remove();
    vi.advanceTimersByTime(50);
    expect(shown()).toHaveLength(0);
    const again = control("Pen\nP", { "data-tooltip-delay": "50" });
    pointer("pointerover", again);
    vi.advanceTimersByTime(50);
    // Two attachments would show two.
    expect(shown()).toHaveLength(1);
  });

  it("takes the tooltip, the wait and every listener away when it is detached or disposed", () => {
    vi.useFakeTimers();
    const { document, control, pointer, shown } = page();
    const watcher = new PenTooltips(mobile);
    watcher.attach(document);
    const button = control("Eraser", { "data-tooltip-delay": "50" });
    pointer("pointerover", button);
    vi.advanceTimersByTime(50);
    expect(shown()).toHaveLength(1);
    watcher.detach(document);
    expect(shown()).toHaveLength(0);
    pointer("pointerover", button);
    expect(vi.getTimerCount()).toBe(0);
    watcher.attach(document);
    pointer("pointerover", button);
    expect(vi.getTimerCount()).toBe(1);
    watcher.dispose();
    expect(vi.getTimerCount()).toBe(0);
    pointer("pointerover", button);
    vi.advanceTimersByTime(2_000);
    expect(shown()).toHaveLength(0);
  });

  it("does nothing for a window it cannot watch", () => {
    const watcher = new PenTooltips(mobile);
    expect(() => {
      watcher.attach(undefined);
      watcher.attach(null);
      watcher.attach({ defaultView: null } as unknown as Document);
      watcher.detach(undefined);
      watcher.dispose();
    }).not.toThrow();
  });
});
