import { describe, expect, it, vi } from "vitest";
import { watchNativeUiVisibility } from "../src/native-ui-visibility";

class Owner {
  observers: TestObserver[] = [];
  defaultView: { MutationObserver?: typeof TestObserver };
  constructor(available = true) {
    const owner = this;
    this.defaultView = available ? { MutationObserver: class extends TestObserver {
      constructor(callback: MutationCallback) { super(callback); owner.observers.push(this); }
    } } : {};
  }
  changed(element: TestElement, name: string, oldValue: string | null) {
    for (const observer of this.observers) observer.changed(element, name, oldValue);
  }
  flush() {
    for (const observer of this.observers) {
      for (let iteration = 0; observer.records.length > 0; iteration += 1) {
        if (iteration > 10) throw new Error("Observer rewrites its own state forever");
        observer.notify();
      }
    }
  }
}

class TestObserver {
  readonly targets = new Map<TestElement, MutationObserverInit>();
  records: MutationRecord[] = [];
  observe = vi.fn((element: TestElement, options: MutationObserverInit) => { this.targets.set(element, options); });
  disconnect = vi.fn(() => { this.targets.clear(); this.records = []; });
  constructor(readonly callback: MutationCallback) {}
  takeRecords() { const records = this.records; this.records = []; return records; }
  changed(element: TestElement, name: string, oldValue: string | null) {
    const options = this.targets.get(element);
    if (options?.attributes && options.attributeFilter?.includes(name)) {
      this.records.push({ target: element, attributeName: name, oldValue: options.attributeOldValue ? oldValue : null } as unknown as MutationRecord);
    }
  }
  notify() { this.callback(this.takeRecords(), this as unknown as MutationObserver); }
}

class TestElement {
  readonly attributes = new Map<string, string>();
  readonly classes = new Set<string>();
  readonly properties = new Map<string, { value: string; priority: string }>();
  classList = {
    contains: (name: string) => this.classes.has(name),
    add: (name: string) => { this.classes.add(name); this.setAttribute("class", [...this.classes].join(" ")); },
    remove: (name: string) => { this.classes.delete(name); this.setAttribute("class", [...this.classes].join(" ")); },
  };
  readonly style = {
    getPropertyValue: (name: string) => this.properties.get(name)?.value ?? "",
    getPropertyPriority: (name: string) => this.properties.get(name)?.priority ?? "",
    setProperty: vi.fn((name: string, value: string, priority = "") => {
      this.properties.set(name, { value, priority }); this.syncStyle();
    }),
    removeProperty: vi.fn((name: string) => { const previous = this.properties.get(name)?.value ?? ""; this.properties.delete(name); this.syncStyle(); return previous; }),
  };
  querySelector = vi.fn(() => { throw new Error("Fixed native targets must not scan the board"); });
  constructor(public ownerDocument: Owner) {}
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  setAttribute = vi.fn((name: string, value: string) => { const old = this.getAttribute(name); this.attributes.set(name, value); this.ownerDocument.changed(this, name, old); });
  removeAttribute = vi.fn((name: string) => { const old = this.getAttribute(name); this.attributes.delete(name); this.ownerDocument.changed(this, name, old); });
  get hidden() { return this.getAttribute("hidden") !== null; }
  set hidden(value: boolean) { if (value) this.setAttribute("hidden", ""); else this.removeAttribute("hidden"); }
  syncStyle() { this.setAttribute("style", [...this.properties].map(([name, property]) => `${name}: ${property.value}${property.priority ? ` !${property.priority}` : ""};`).join(" ")); }
  getBoundingClientRect() { return { width: this.hidden || this.style.getPropertyValue("display") === "none" ? 0 : 80, height: this.hidden || this.style.getPropertyValue("display") === "none" ? 0 : 24 }; }
}

const element = (input: TestElement) => input as unknown as HTMLElement;
function fixture(available = true) {
  const owner = new Owner(available);
  const root = new TestElement(owner);
  const controls = new TestElement(owner);
  const menu = new TestElement(owner);
  controls.style.setProperty("display", "flex", "important");
  menu.style.setProperty("display", "block");
  let independent = false;
  const state = watchNativeUiVisibility(element(root), [{ element: element(controls), kind: "controls" }, { element: element(menu), kind: "menu" }], () => independent);
  return { owner, root, controls, menu, state, independent: (value: boolean) => { independent = value; } };
}

function suppressed(input: TestElement) {
  expect(input.style.getPropertyValue("display")).toBe("none");
  expect(input.style.getPropertyPriority("display")).toBe("");
  expect(input.getAttribute("hidden")).toBe("");
  expect(input.getBoundingClientRect()).toMatchObject({ width: 0, height: 0 });
}

describe("fixed native UI visibility ownership", () => {
  it("suppresses controls immediately with normal display and a real hidden attribute", () => {
    const rig = fixture();
    suppressed(rig.controls);
    expect(rig.menu.style.getPropertyValue("display")).toBe("block");
    expect(rig.menu.hidden).toBe(false);
    rig.state.dispose();
    expect(rig.controls.style.getPropertyValue("display")).toBe("flex");
    expect(rig.controls.style.getPropertyPriority("display")).toBe("important");
    expect(rig.controls.getAttribute("hidden")).toBeNull();
  });

  it("hides only independent menus and returns to normal selection repeatedly", () => {
    const rig = fixture();
    for (let round = 0; round < 2; round += 1) {
      rig.independent(true); rig.state.refresh(); suppressed(rig.menu);
      rig.owner.flush();
      rig.independent(false); rig.state.refresh(); rig.owner.flush();
      expect(rig.menu.style.getPropertyValue("display")).toBe("block");
      expect(rig.menu.getAttribute("hidden")).toBeNull();
      suppressed(rig.controls);
    }
    rig.state.dispose();
  });

  it.each(["is-screenshotting", "miro-canvas-presenting"])("observes %s and restores the menu after the mode ends", mode => {
    const rig = fixture();
    rig.root.classList.add(mode); rig.owner.flush(); suppressed(rig.menu);
    rig.root.classList.remove(mode); rig.owner.flush();
    expect(rig.menu.style.getPropertyValue("display")).toBe("block");
    expect(rig.menu.hidden).toBe(false);
    rig.state.dispose();
  });

  it("keeps menu suppression while any independent/capture/presentation reason remains", () => {
    const rig = fixture();
    rig.independent(true); rig.root.classList.add("is-screenshotting"); rig.root.classList.add("miro-canvas-presenting");
    rig.state.refresh(); suppressed(rig.menu);
    rig.independent(false); rig.root.classList.remove("is-screenshotting"); rig.state.refresh(); suppressed(rig.menu);
    rig.root.classList.remove("miro-canvas-presenting"); rig.state.refresh(); expect(rig.menu.hidden).toBe(false);
    rig.state.dispose();
  });

  it("remembers the latest native display value and priority after external shows", () => {
    const rig = fixture();
    rig.independent(true); rig.state.refresh(); rig.owner.flush();
    rig.menu.style.setProperty("display", "grid", "important"); rig.menu.hidden = false; rig.owner.flush(); suppressed(rig.menu);
    rig.menu.style.setProperty("display", "inline-flex"); rig.menu.hidden = false; rig.owner.flush(); suppressed(rig.menu);
    rig.independent(false); rig.state.refresh(); rig.owner.flush();
    expect(rig.menu.style.getPropertyValue("display")).toBe("inline-flex");
    expect(rig.menu.style.getPropertyPriority("display")).toBe("");
    expect(rig.menu.getAttribute("hidden")).toBeNull();
    rig.controls.style.setProperty("display", "grid", "important"); rig.owner.flush(); suppressed(rig.controls);
    rig.state.dispose();
    expect(rig.controls.style.getPropertyValue("display")).toBe("grid");
    expect(rig.controls.style.getPropertyPriority("display")).toBe("important");
  });

  it.each([null, "", "native-hidden", "false"])("restores an exact original hidden attribute %s", hidden => {
    const owner = new Owner(); const root = new TestElement(owner); const menu = new TestElement(owner);
    if (hidden !== null) menu.setAttribute("hidden", hidden);
    const state = watchNativeUiVisibility(element(root), [{ element: element(menu), kind: "menu" }], () => true);
    owner.flush(); state.dispose();
    expect(menu.getAttribute("hidden")).toBe(hidden);
    expect(menu.style.getPropertyValue("display")).toBe("");
  });

  it("distinguishes own hidden writes from later native hidden changes, including the same marker", () => {
    const rig = fixture(); rig.independent(true); rig.state.refresh(); rig.owner.flush();
    rig.menu.setAttribute("hidden", "native-hidden"); rig.owner.flush(); suppressed(rig.menu);
    rig.independent(false); rig.state.refresh(); rig.owner.flush();
    expect(rig.menu.getAttribute("hidden")).toBe("native-hidden");
    rig.menu.removeAttribute("hidden"); rig.independent(true); rig.state.refresh(); rig.owner.flush();
    rig.menu.setAttribute("hidden", ""); rig.owner.flush();
    rig.independent(false); rig.state.refresh();
    expect(rig.menu.getAttribute("hidden")).toBe("");
    rig.state.dispose();
  });

  it("preserves unrelated native inline properties during suppression and restoration", () => {
    const rig = fixture();
    rig.controls.style.setProperty("color", "red", "important"); rig.owner.flush();
    rig.state.dispose();
    expect(rig.controls.style.getPropertyValue("color")).toBe("red");
    expect(rig.controls.style.getPropertyPriority("color")).toBe("important");
    expect(rig.controls.style.getPropertyValue("display")).toBe("flex");
  });

  it("does not clobber a later plugin hook at dispose or release, even before observer delivery", () => {
    const rig = fixture(); rig.independent(true); rig.state.refresh();
    rig.controls.style.setProperty("display", "inline-block", "important");
    rig.controls.setAttribute("hidden", "later-controls");
    rig.menu.style.setProperty("display", "grid", "important"); rig.menu.removeAttribute("hidden");
    rig.independent(false); rig.state.refresh();
    expect(rig.menu.style.getPropertyValue("display")).toBe("grid");
    expect(rig.menu.hidden).toBe(false);
    rig.controls.style.setProperty("display", "block", "important"); rig.controls.setAttribute("hidden", "later-controls");
    rig.state.dispose();
    expect(rig.controls.style.getPropertyValue("display")).toBe("block");
    expect(rig.controls.style.getPropertyPriority("display")).toBe("important");
    expect(rig.controls.getAttribute("hidden")).toBe("later-controls");
  });

  it.each(["capture error", "capture cancel"])("restores after %s with explicit before-paint refresh", failure => {
    const rig = fixture();
    try {
      rig.root.classList.add("is-screenshotting"); rig.state.refresh(); suppressed(rig.menu);
      throw new Error(failure);
    } catch (error) { expect((error as Error).message).toBe(failure); }
    finally { rig.root.classList.remove("is-screenshotting"); rig.state.refresh(); }
    rig.owner.flush(); expect(rig.menu.hidden).toBe(false); suppressed(rig.controls); rig.state.dispose();
  });

  it("captures the owner observer and watches only root class and fixed native attributes", () => {
    const rig = fixture(); const observer = rig.owner.observers[0];
    expect(observer.observe.mock.calls).toEqual([
      [rig.root, { attributes: true, attributeFilter: ["class"] }],
      [rig.controls, { attributes: true, attributeFilter: ["style", "hidden"], attributeOldValue: true }],
      [rig.menu, { attributes: true, attributeFilter: ["style", "hidden"], attributeOldValue: true }],
    ]);
    const originalOwner = rig.owner;
    rig.root.ownerDocument = new Owner(); rig.state.dispose(); rig.state.dispose();
    expect(observer.disconnect).toHaveBeenCalledOnce();
    expect(originalOwner.observers).toHaveLength(1); expect(rig.root.ownerDocument.observers).toHaveLength(0);
    rig.root.classList.add("is-screenshotting"); observer.notify(); rig.state.refresh();
    expect(rig.menu.hidden).toBe(false); expect(rig.controls.style.getPropertyValue("display")).toBe("flex");
    expect(rig.root.querySelector).not.toHaveBeenCalled();
  });

  it("keeps separate roots/windows isolated and ignores replacement widgets until the parent supplies them", () => {
    const first = fixture(); const second = fixture(); const replacement = new TestElement(first.owner);
    first.root.classList.add("is-screenshotting"); first.owner.flush(); suppressed(first.menu);
    expect(second.menu.hidden).toBe(false); expect(replacement.hidden).toBe(false);
    expect(first.owner.observers[0].targets.has(replacement)).toBe(false);
    first.state.dispose(); suppressed(second.controls); second.state.dispose();
  });

  it("supports explicit refresh when the owning window has no observer", () => {
    const rig = fixture(false); expect(rig.owner.observers).toHaveLength(0);
    rig.independent(true); rig.state.refresh(); suppressed(rig.menu);
    rig.menu.style.setProperty("display", "grid", "important"); rig.menu.hidden = false; rig.state.refresh(); suppressed(rig.menu);
    rig.independent(false); rig.state.refresh();
    expect(rig.menu.style.getPropertyValue("display")).toBe("grid"); expect(rig.menu.style.getPropertyPriority("display")).toBe("important");
    expect(rig.menu.hidden).toBe(false); rig.state.dispose();
  });

  it("does not call missing style APIs in a minimal host and still restores actual hidden state", () => {
    const owner = new Owner(false); const root = new TestElement(owner); const controls = new TestElement(owner);
    Object.defineProperty(controls.style, "removeProperty", { value: undefined });
    const state = watchNativeUiVisibility(element(root), [{ element: element(controls), kind: "controls" }], () => false);
    expect(controls.getAttribute("hidden")).toBe(""); expect(controls.style.setProperty).not.toHaveBeenCalled();
    state.dispose(); expect(controls.getAttribute("hidden")).toBeNull();
  });

  it("collapses duplicate targets with controls taking precedence and leaves stable state untouched", () => {
    const owner = new Owner(); const root = new TestElement(owner); const controls = new TestElement(owner);
    const state = watchNativeUiVisibility(element(root), [{ element: element(controls), kind: "menu" }, { element: element(controls), kind: "controls" }], () => false);
    owner.flush(); controls.style.setProperty.mockClear(); controls.setAttribute.mockClear();
    state.refresh(); owner.flush(); suppressed(controls);
    expect(owner.observers[0].observe).toHaveBeenCalledTimes(2);
    expect(controls.style.setProperty).not.toHaveBeenCalled(); expect(controls.setAttribute).not.toHaveBeenCalled(); state.dispose();
  });
});

describe("minimal host and failed mounting cleanup", () => {
  it("allows a root without ownerDocument and still refreshes fixed targets explicitly", () => {
    const owner = new Owner(); const root = new TestElement(owner); const controls = new TestElement(owner); const menu = new TestElement(owner);
    Object.defineProperty(root, "ownerDocument", { value: undefined });
    const state = watchNativeUiVisibility(element(root), [{ element: element(controls), kind: "controls" }, { element: element(menu), kind: "menu" }], () => false);
    root.classes.add("is-screenshotting"); state.refresh(); suppressed(menu);
    root.classes.delete("is-screenshotting"); state.refresh(); expect(menu.hidden).toBe(false);
    expect(owner.observers).toHaveLength(0); state.dispose(); expect(controls.hidden).toBe(false);
  });

  it("uses explicit refresh rather than incomplete nonstandard observer mocks", () => {
    const owner = new Owner(); const root = new TestElement(owner); const menu = new TestElement(owner);
    Object.defineProperty(owner.defaultView.MutationObserver!.prototype, "takeRecords", { value: undefined });
    const state = watchNativeUiVisibility(element(root), [{ element: element(menu), kind: "menu" }], () => false);
    expect(owner.observers[0].observe).not.toHaveBeenCalled();
    expect(owner.observers[0].disconnect).toHaveBeenCalledOnce();
    root.classes.add("is-screenshotting"); state.refresh(); suppressed(menu);
    state.dispose(); expect(menu.hidden).toBe(false);
  });

  it("restores earlier targets if an initial native style setter refuses mounting", () => {
    const owner = new Owner(); const root = new TestElement(owner); const controls = new TestElement(owner); const menu = new TestElement(owner);
    controls.style.setProperty("display", "flex", "important"); menu.style.setProperty("display", "block");
    menu.style.setProperty.mockImplementation(() => { throw new Error("native style refusal"); });
    expect(() => watchNativeUiVisibility(element(root), [{ element: element(controls), kind: "controls" }, { element: element(menu), kind: "menu" }], () => true)).toThrow("native style refusal");
    expect(controls.style.getPropertyValue("display")).toBe("flex"); expect(controls.style.getPropertyPriority("display")).toBe("important");
    expect(controls.hidden).toBe(false); expect(menu.hidden).toBe(false); expect(owner.observers).toHaveLength(0);
  });

  it("preserves an external hook that changes display synchronously during restoration", () => {
    const rig = fixture();
    const originalSet = rig.controls.style.setProperty.getMockImplementation()!;
    rig.controls.style.setProperty.mockImplementation((name, value, priority) => {
      originalSet(name, value, priority);
      if (name === "display" && value === "flex") {
        rig.controls.properties.set("display", { value: "grid", priority: "important" }); rig.controls.syncStyle();
      }
    });
    rig.state.dispose();
    expect(rig.controls.style.getPropertyValue("display")).toBe("grid");
    expect(rig.controls.style.getPropertyPriority("display")).toBe("important"); expect(rig.controls.hidden).toBe(false);
  });
});
