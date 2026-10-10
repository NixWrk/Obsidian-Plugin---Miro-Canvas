import { afterEach, describe, expect, it, vi } from "vitest";
import { SlideShow, type SlideRect, type SlideShowHost } from "../src/slide-show";

import { setLocale } from "../src/i18n";

type Listener = (event: FakeEvent) => void;

interface FakeEvent {
  readonly key?: string;
  readonly target?: FakeElement;
  readonly isComposing?: boolean;
  composedPath?(): readonly FakeElement[];
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  prevented?: boolean;
  preventDefault(): void;
  stopPropagation(): void;
}

class FakeTarget {
  public readonly listeners = new Map<string, Listener[]>();
  public addEventListener(name: string, listener: Listener): void {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener]);
  }
  public removeEventListener(name: string, listener: Listener): void {
    this.listeners.set(name, (this.listeners.get(name) ?? []).filter((item) => item !== listener));
  }
  public fire(name: string, props: Partial<FakeEvent> = {}): FakeEvent {
    const event: FakeEvent = {
      ...props,
      preventDefault() { event.prevented = true; },
      stopPropagation() {},
    };
    for (const listener of [...(this.listeners.get(name) ?? [])]) listener(event);
    return event;
  }
}

class FakeElement extends FakeTarget {
  public readonly children: FakeElement[] = [];
  public readonly attributes = new Map<string, string>();
  public readonly classes = new Set<string>();
  public readonly classList = {
    add: (name: string) => { this.classes.add(name); },
    remove: (name: string) => { this.classes.delete(name); },
    contains: (name: string) => this.classes.has(name),
  };
  public parentNode: FakeElement | undefined;
  public textContent = "";
  public type = "";
  public constructor(public readonly tagName: string, public readonly ownerDocument: FakeDocument) { super(); }
  public set className(value: string) { for (const name of value.split(" ")) this.classes.add(name); }
  public appendChild(child: FakeElement): FakeElement { child.parentNode = this; this.children.push(child); return child; }
  public remove(): void {
    this.parentNode?.children.splice(this.parentNode.children.indexOf(this), 1);
    this.parentNode = undefined;
  }
  public setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
  public getAttribute(name: string): string | null { return this.attributes.get(name) ?? null; }
  public closest(selector: string): FakeElement | null {
    const matches = selector.split(",").some(raw => {
      const item = raw.trim();
      if (item.startsWith("[contenteditable]")) return this.attributes.has("contenteditable") && this.getAttribute("contenteditable") !== "false";
      if (item.startsWith("[role=")) return this.getAttribute("role") === item.slice(7, -2);
      return item === this.tagName;
    });
    return matches ? this : this.parentNode?.closest(selector) ?? null;
  }
  public click(): void { this.fire("click"); }
  public find(test: (element: FakeElement) => boolean): FakeElement | undefined {
    for (const child of this.children) {
      if (test(child)) return child;
      const found = child.find(test);
      if (found !== undefined) return found;
    }
    return undefined;
  }
}

class FakeDocument extends FakeTarget {
  public createElement(tagName: string): FakeElement { return new FakeElement(tagName, this); }
  public createElementNS(_namespace: string, tagName: string): FakeElement { return this.createElement(tagName); }
}

function setup(rects: Record<string, SlideRect>, host: Partial<SlideShowHost> = {}) {
  const document = new FakeDocument();
  const root = document.createElement("div");
  const shown: SlideRect[] = [];
  const show = new SlideShow(root as unknown as HTMLElement, { rectOf: (id) => rects[id], show: (rect) => shown.push(rect), ...host });
  const key = (name: string, props: Partial<FakeEvent> = {}) => document.fire("keydown", { key: name, ...props });
  const bar = () => root.find((element) => element.classes.has("miro-canvas-slideshow"));
  const counter = () => root.find((element) => element.classes.has("miro-canvas-slideshow__counter"))?.textContent;
  const button = (label: string) => root.find((element) => element.getAttribute("aria-label") === label)!;
  return { document, root, show, shown, key, bar, counter, button };
}

const RECTS = {
  one: { x: 0, y: 0, width: 960, height: 540 },
  two: { x: 1000, y: 0, width: 960, height: 540 },
  three: { x: 2000, y: 0, width: 960, height: 540 },
};

afterEach(() => setLocale("en"));

describe("slide show", () => {
  it("frames each slide in turn from the keyboard and ends on Escape", () => {
    const { root, show, shown, key, bar, counter } = setup(RECTS);
    expect(show.start(["one", "gone", "two", "three"])).toBe(true);
    expect(root.classes.has("miro-canvas-presenting")).toBe(true);
    expect(shown).toEqual([RECTS.one]);
    // A slide that no longer exists is left out of the count.
    expect(counter()).toBe("1 / 3");
    expect(key("ArrowRight").prevented).toBe(true);
    key(" ");
    expect(shown.slice(-2)).toEqual([RECTS.two, RECTS.three]);
    key("ArrowRight");
    expect(show.current).toBe(2);
    expect(bar()?.getAttribute("data-last")).toBe("true");
    // A shortcut with a modifier is left to Obsidian.
    expect(key("ArrowLeft", { ctrlKey: true }).prevented).toBeUndefined();
    key("Home");
    expect(counter()).toBe("1 / 3");
    key("Escape");
    expect(show.active).toBe(false);
    expect(bar()).toBeUndefined();
    expect(root.classes.has("miro-canvas-presenting")).toBe(false);
    // Once ended, the keyboard belongs to the board again.
    expect(key("ArrowRight").prevented).toBeUndefined();
    // Past the last slide the current one is framed again: start, two moves, the stop at the end and Home.
    expect(shown).toHaveLength(5);
  });

  it("moves from its own buttons and refuses a deck with nothing to show", () => {
    const { show, shown, bar, button } = setup(RECTS);
    expect(show.start(["gone"])).toBe(false);
    expect(bar()).toBeUndefined();
    show.start(["one", "two"], 1);
    expect(shown).toEqual([RECTS.two]);
    button("Previous slide").click();
    expect(shown.at(-1)).toEqual(RECTS.one);
    button("End presentation").click();
    expect(show.active).toBe(false);
  });

  it("reports activity once per transition and removes keyboard ownership on stop/disposal", () => {
    const changes = vi.fn();
    const item = setup(RECTS, { onActiveChange: changes });
    expect(item.show.start(["gone"])).toBe(false);
    expect(changes).not.toHaveBeenCalled();
    item.show.start(["one", "two"]);
    expect(changes.mock.calls).toEqual([[true]]);
    item.show.next();
    item.show.refreshLaser();
    item.show.start(["two"]);
    expect(changes.mock.calls).toEqual([[true], [false], [true]]);
    item.show.dispose();
    item.show.stop();
    expect(changes.mock.calls).toEqual([[true], [false], [true], [false]]);
    expect(item.document.listeners.get("keydown")).toHaveLength(0);
    expect(item.key("ArrowRight").prevented).toBeUndefined();
    expect(item.show.start(["one"])).toBe(false);
  });

  it("toggles via the optional callback and refreshes accessible state after external changes", () => {
    let enabled = false;
    const toggle = vi.fn(() => { enabled = !enabled; });
    const item = setup(RECTS, { onLaserToggle: toggle, isLaserEnabled: () => enabled });
    item.show.start(["one", "two"]);
    const laser = item.root.find(element => element.classes.has("miro-canvas-slideshow__laser"))!;
    expect(laser.getAttribute("aria-label")).toBe("Laser pointer");
    expect(laser.getAttribute("aria-pressed")).toBe("false");
    laser.click();
    expect(toggle).toHaveBeenCalledOnce();
    expect(laser.getAttribute("aria-pressed")).toBe("true");
    expect(item.show.current).toBe(0);
    enabled = false;
    item.show.refreshLaser();
    expect(laser.getAttribute("aria-pressed")).toBe("false");
    item.show.stop();
    item.show.refreshLaser();
    expect(item.root.find(element => element.classes.has("miro-canvas-slideshow__laser"))).toBeUndefined();
  });

  it("has no inert laser button when the host cannot toggle and defaults a missing getter to unpressed", () => {
    const oldHost = setup(RECTS);
    oldHost.show.start(["one"]);
    expect(oldHost.root.find(element => element.classes.has("miro-canvas-slideshow__laser"))).toBeUndefined();
    const item = setup(RECTS, { onLaserToggle: vi.fn() });
    item.show.start(["one"]);
    expect(item.root.find(element => element.classes.has("miro-canvas-slideshow__laser"))?.getAttribute("aria-pressed")).toBe("false");
  });

  it("localizes the laser name and delegates icon creation to the existing native helper", () => {
    setLocale("ru");
    const setIcon = vi.fn();
    const item = setup(RECTS, { onLaserToggle: vi.fn(), setIcon });
    item.show.start(["one"]);
    const laser = item.root.find(element => element.classes.has("miro-canvas-slideshow__laser"))!;
    expect(laser.getAttribute("aria-label")).toBe("Лазерная указка");
    expect(setIcon).toHaveBeenCalledWith(laser, "mouse-pointer-2");
  });

  it.each(["input", "textarea", "select", "button", "a"])("does not consume navigation while a %s is focused, but Escape ends the show", tag => {
    const changes = vi.fn();
    const item = setup(RECTS, { onActiveChange: changes });
    item.show.start(["one", "two"]);
    const control = item.document.createElement(tag);
    for (const value of [" ", "Enter", "Backspace", "ArrowRight", "Home", "End"]) {
      expect(item.key(value, { target: control }).prevented).toBeUndefined();
      expect(item.show.current).toBe(0);
    }
    expect(item.key("Escape", { target: control }).prevented).toBe(true);
    expect(item.show.active).toBe(false);
    expect(changes.mock.calls).toEqual([[true], [false]]);
  });

  it("leaves editable descendants, shadow input paths, composition and native shortcuts alone", () => {
    const item = setup(RECTS);
    item.show.start(["one", "two"]);
    const edit = item.document.createElement("div");
    edit.setAttribute("contenteditable", "");
    const child = edit.appendChild(item.document.createElement("span"));
    expect(item.key("ArrowRight", { target: child }).prevented).toBeUndefined();
    const shadowInput = item.document.createElement("input");
    expect(item.key("Enter", { target: item.root, composedPath: () => [shadowInput, item.root] }).prevented).toBeUndefined();
    expect(item.key("Enter", { isComposing: true }).prevented).toBeUndefined();
    expect(item.key("ArrowRight", { altKey: true }).prevented).toBeUndefined();
    expect(item.key("ArrowRight", { metaKey: true }).prevented).toBeUndefined();
    expect(item.show.current).toBe(0);
    edit.setAttribute("contenteditable", "false");
    expect(item.key("ArrowRight", { target: child }).prevented).toBe(true);
    expect(item.show.current).toBe(1);
  });

  it("preserves a pre-existing presentation class and cleans up after a camera failure", () => {
    const item = setup(RECTS);
    item.root.classList.add("miro-canvas-presenting");
    item.show.start(["one"]);
    item.show.stop();
    expect(item.root.classList.contains("miro-canvas-presenting")).toBe(true);
    const changes = vi.fn();
    const broken = setup(RECTS, { show: () => { throw new Error("Camera failed"); }, onActiveChange: changes });
    expect(() => broken.show.start(["one"])).toThrow("Camera failed");
    expect(broken.show.active).toBe(false);
    expect(broken.root.classList.contains("miro-canvas-presenting")).toBe(false);
    expect(broken.document.listeners.get("keydown")).toHaveLength(0);
    expect(changes).not.toHaveBeenCalled();
  });

  it("cleans up UI if the activity callback fails and calls the inactive callback after cleanup", () => {
    const item = setup(RECTS, { onActiveChange: active => { if (active) throw new Error("Activation failed"); } });
    expect(() => item.show.start(["one"])).toThrow("Activation failed");
    expect(item.show.active).toBe(false);
    expect(item.bar()).toBeUndefined();
    expect(item.document.listeners.get("keydown")).toHaveLength(0);
  });


  it("cleans partial mounting if native icon creation fails before attachment", () => {
    const item = setup(RECTS, { setIcon: () => { throw new Error("Icon failed"); }, onLaserToggle: vi.fn() });
    expect(() => item.show.start(["one"])).toThrow("Icon failed");
    expect(item.show.active).toBe(false);
    expect(item.bar()).toBeUndefined();
    expect(item.root.classList.contains("miro-canvas-presenting")).toBe(false);
    expect(item.document.listeners.get("keydown") ?? []).toHaveLength(0);
    item.show.refreshLaser();
    item.show.dispose();
  });

});
