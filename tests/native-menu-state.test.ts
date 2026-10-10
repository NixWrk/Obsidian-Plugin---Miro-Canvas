import { describe, expect, it, vi } from "vitest";
import { watchNativeMenuState } from "../src/native-menu-state";

class MenuElement {
  children: MenuElement[] = [];
  get childNodes() { return this.children; }
  parentNode: MenuElement | null = null;
  get nextSibling(): MenuElement | null {
    const siblings = this.parentNode?.children;
    return siblings?.[siblings.indexOf(this) + 1] ?? null;
  }
  hidden = true;
  disabled = false;
  deleteVisible = false;
  className = "";
  attributes = new Map<string, string>();
  tagName = "BUTTON";
  ownerDocument!: { defaultView: unknown; createElement: (tag: string) => MenuElement };
  mutate: (target: MenuElement, attribute?: string, removedNodes?: MenuElement[]) => void = () => {};
  private text = "";
  get textContent(): string { return this.text; }
  set textContent(value: string) {
    this.writeText(value);
  }
  writeText = vi.fn((value: string) => {
    this.text = value;
    this.mutate(this);
  });
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  setAttribute = vi.fn((name: string, value: string) => {
    this.attributes.set(name, value);
    this.mutate(this, name);
  });
  removeAttribute = vi.fn((name: string) => {
    this.attributes.delete(name);
    this.mutate(this, name);
  });
  appendChild = vi.fn((child: MenuElement) => {
    child.remove();
    this.children.push(child);
    child.parentNode = this;
    this.mutate(this);
    return child;
  });
  insertBefore = vi.fn((child: MenuElement, next: MenuElement | null) => {
    child.remove();
    const index = next === null ? this.children.length : this.children.indexOf(next);
    if (index < 0) throw new Error("Sibling belongs to another menu");
    this.children.splice(index, 0, child);
    child.parentNode = this;
    this.mutate(this);
    return child;
  });
  remove() {
    const parent = this.parentNode;
    if (parent === null) return;
    parent.children.splice(parent.children.indexOf(this), 1);
    this.parentNode = null;
    parent.mutate(parent, undefined, [this]);
  }
  replaceChildren(...children: MenuElement[]) {
    for (const child of [...this.children]) child.remove();
    for (const child of children) this.appendChild(child);
  }
  querySelector(selector: string): MenuElement | object | null {
    if (!selector.includes("lucide-")) return this.deleteVisible ? {} : null;
    return this.children.find((child) => selector.split(",").some((part) => {
      const name = part.trim().replace(":scope > .", "");
      return child.className.split(" ").includes(name);
    })) ?? null;
  }
  private handlers: (() => void)[] = [];
  addEventListener(_name: string, handler: () => void) { this.handlers.push(handler); }
  click() { for (const handler of this.handlers) handler(); }
  cloneNode(deep: boolean): MenuElement {
    const clone = this.ownerDocument.createElement(this.tagName);
    clone.className = this.className;
    clone.text = this.text;
    clone.hidden = this.hidden;
    clone.disabled = this.disabled;
    clone.attributes = new Map(this.attributes);
    if (deep) for (const child of this.children) clone.appendChild(child.cloneNode(true));
    return clone;
  }
}

function fixture() {
  type Record = { type: string; target: MenuElement; removedNodes: MenuElement[] };
  let notify: (records: Record[]) => void = () => {};
  let observing = false;
  let root: MenuElement | undefined;
  let filter: string[] = [];
  const records: Record[] = [];
  const mutate = (target: MenuElement, attribute?: string, removedNodes: MenuElement[] = []) => {
    if (!observing || (attribute !== undefined && !filter.includes(attribute))) return;
    let ancestor: MenuElement | null = target;
    while (ancestor !== null && ancestor !== root) ancestor = ancestor.parentNode;
    if (ancestor === root) records.push({ type: attribute === undefined ? "childList" : "attributes", target, removedNodes });
  };
  const observe = vi.fn((target: MenuElement, options: { attributeFilter: string[] }) => {
    observing = true;
    root = target;
    filter = options.attributeFilter;
  });
  const disconnect = vi.fn(() => { observing = false; records.length = 0; });
  const takeRecords = vi.fn(() => records.splice(0));
  class Observer {
    constructor(callback: (records: Record[]) => void) { notify = callback; }
    observe = observe;
    disconnect = disconnect;
    takeRecords = takeRecords;
  }
  const document = { defaultView: { MutationObserver: Observer }, createElement: (tag: string): MenuElement => {
    const element = new MenuElement();
    element.tagName = tag.toUpperCase();
    element.ownerDocument = document;
    element.mutate = mutate;
    return element;
  } };
  const make = (label?: string, icon?: string) => {
    const button = document.createElement("button");
    if (label !== undefined) button.setAttribute("aria-label", label);
    if (icon !== undefined) {
      const svg = document.createElement("svg");
      svg.className = icon;
      button.appendChild(svg);
    }
    return button;
  };
  const slot = document.createElement("div");
  const menu = document.createElement("div");
  const snapshot = document.createElement("div");
  slot.appendChild(menu);
  slot.appendChild(snapshot);
  const layout = vi.fn();
  const state = watchNativeMenuState(slot as unknown as HTMLElement, menu as unknown as HTMLElement,
    snapshot as unknown as HTMLElement, layout);
  const flush = () => {
    let deliveries = 0;
    while (records.length > 0) {
      notify(records.splice(0));
      deliveries += 1;
      if (deliveries > 10) throw new Error("Observer loop");
    }
    return deliveries;
  };
  return { slot, menu, snapshot, state, observe, disconnect, layout, make, document, flush, notify: () => notify([]) };
}

const labelOf = (button: MenuElement) => button.children.find((child) => child.className === "miro-canvas-toolbar__menu-label");
const shortcutOf = (button: MenuElement) => button.children.find((child) => child.className === "miro-canvas-toolbar__menu-shortcut");

describe("adopted native menu state", () => {
  it("notifies placement after native contents change even when visibility stays the same", () => {
    const rig = fixture();
    rig.menu.appendChild(rig.make());
    rig.flush();
    rig.layout.mockClear();
    rig.menu.appendChild(rig.make());
    expect(rig.flush()).toBe(1);
    expect(rig.layout).toHaveBeenCalledOnce();
    rig.state.dispose();
  });

  it("keeps the slot visible during delayed menu clearing and hides the snapshot when the live menu returns", () => {
    const rig = fixture();
    expect(rig.slot.getAttribute("data-miro-native-visible")).toBe("false");
    rig.menu.appendChild(rig.make());
    rig.flush();
    expect(rig.slot.getAttribute("data-miro-native-menu")).toBe("true");
    rig.snapshot.hidden = false;
    rig.state.refresh();
    rig.menu.replaceChildren();
    rig.flush();
    expect(rig.slot.getAttribute("data-miro-native-menu")).toBe("false");
    expect(rig.slot.getAttribute("data-miro-native-visible")).toBe("true");
    rig.menu.appendChild(rig.make());
    rig.flush();
    expect(rig.slot.getAttribute("data-miro-native-menu")).toBe("true");
    rig.menu.replaceChildren();
    rig.snapshot.hidden = true;
    rig.flush();
    expect(rig.slot.getAttribute("data-miro-native-visible")).toBe("false");
    rig.slot.deleteVisible = true;
    rig.notify();
    expect(rig.slot.getAttribute("data-miro-native-visible")).toBe("true");
    rig.state.dispose();
  });

  it("marks only direct native duplicate buttons and restores removed and retained buttons", () => {
    const rig = fixture();
    const palette = rig.make("Color", "lucide-palette");
    const arrow = rig.make("Direction", "lucide-arrow-right");
    const normal = rig.make("Edit");
    const other = rig.make("Not a button", "lucide-palette");
    other.tagName = "SPAN";
    const nested = rig.make("Nested icon");
    const wrapper = rig.document.createElement("span");
    wrapper.appendChild(rig.make("Color", "lucide-palette"));
    nested.appendChild(wrapper);
    palette.setAttribute("data-miro-native-duplicate", "native");
    rig.menu.replaceChildren(palette, normal, other, arrow, nested);
    rig.flush();
    expect(palette.getAttribute("data-miro-native-duplicate")).toBe("true");
    expect(arrow.getAttribute("data-miro-native-duplicate")).toBe("true");
    for (const button of [normal, other, nested]) expect(button.getAttribute("data-miro-native-duplicate")).toBeNull();
    expect(labelOf(palette)).toBeUndefined();
    expect(labelOf(arrow)).toBeUndefined();
    expect(labelOf(other)).toBeUndefined();
    rig.menu.replaceChildren();
    rig.flush();
    expect(palette.getAttribute("data-miro-native-duplicate")).toBe("native");
    expect(arrow.getAttribute("data-miro-native-duplicate")).toBeNull();
    rig.menu.appendChild(palette);
    rig.flush();
    rig.state.dispose();
    expect(palette.getAttribute("data-miro-native-duplicate")).toBe("native");
    expect(rig.slot.getAttribute("data-miro-native-menu")).toBeNull();
    expect(rig.disconnect).toHaveBeenCalledOnce();
  });

  it.each([
    ["Edit\n(Ctrl+E)", "Edit", "Ctrl+E"],
    ["Изменить\r\n (Ctrl+Enter) ", "Изменить", "Ctrl+Enter"],
    ["Zoom to selection", "Zoom to selection", undefined],
    ["Увеличить\n⌘ + Enter", "Увеличить", "⌘ + Enter"],
    ["Unknown native action\n(Ctrl) (Alt)", "Unknown native action", "(Ctrl) (Alt)"],
    ["<b>Edit</b>\n(<img>)", "<b>Edit</b>", "<img>"],
  ])("uses native localized plain text from %j", (aria, label, shortcut) => {
    const rig = fixture();
    const button = rig.make(aria, "lucide-pencil");
    button.hidden = false;
    button.disabled = true;
    const icon = button.children[0];
    const handler = vi.fn();
    button.addEventListener("click", handler);
    rig.menu.appendChild(button);
    expect(rig.flush()).toBe(1);
    expect(rig.menu.children).toEqual([button]);
    expect(button.children[0]).toBe(icon);
    expect(button.getAttribute("aria-label")).toBe(aria);
    expect(labelOf(button)?.textContent).toBe(label);
    expect(shortcutOf(button)?.textContent).toBe(shortcut);
    expect(labelOf(button)?.getAttribute("aria-hidden")).toBe("true");
    expect(button.hidden).toBe(false);
    expect(button.disabled).toBe(true);
    button.click();
    expect(handler).toHaveBeenCalledOnce();
    rig.state.dispose();
    expect(button.children).toEqual([icon]);
    button.click();
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("syncs aria-label changes without replacing buttons or rewriting unchanged labels", () => {
    const rig = fixture();
    const button = rig.make("Edit\n(Ctrl+E)", "lucide-pencil");
    rig.menu.appendChild(button);
    rig.flush();
    const label = labelOf(button)!;
    const shortcut = shortcutOf(button)!;
    label.writeText.mockClear();
    shortcut.writeText.mockClear();
    button.appendChild.mockClear();
    button.setAttribute.mockClear();
    rig.slot.setAttribute.mockClear();
    rig.state.refresh();
    rig.notify();
    expect(rig.flush()).toBe(0);
    expect(label.writeText).not.toHaveBeenCalled();
    expect(shortcut.writeText).not.toHaveBeenCalled();
    expect(button.appendChild).not.toHaveBeenCalled();
    expect(button.setAttribute).not.toHaveBeenCalled();
    expect(rig.slot.setAttribute).not.toHaveBeenCalled();
    button.setAttribute("aria-label", "Изменить\n(Enter)");
    expect(rig.flush()).toBe(1);
    expect(labelOf(button)).toBe(label);
    expect(shortcutOf(button)).toBe(shortcut);
    expect(label.textContent).toBe("Изменить");
    expect(shortcut.textContent).toBe("Enter");
    button.setAttribute("aria-label", "Изменить");
    rig.flush();
    expect(shortcutOf(button)).toBeUndefined();
    button.removeAttribute("aria-label");
    rig.flush();
    expect(labelOf(button)).toBeUndefined();
    expect(button.getAttribute("data-miro-native-unlabeled")).toBe("true");
    rig.state.dispose();
  });

  it("marks unlabeled buttons safely and leaves nested controls alone", () => {
    const rig = fixture();
    const unknown = rig.make();
    const empty = rig.make(" \n(Ctrl+E)");
    const wrapper = rig.document.createElement("div");
    const nested = rig.make("Delete", "lucide-trash-2");
    wrapper.appendChild(nested);
    rig.menu.replaceChildren(unknown, empty, wrapper);
    rig.flush();
    for (const button of [unknown, empty]) {
      expect(button.getAttribute("data-miro-native-unlabeled")).toBe("true");
      expect(labelOf(button)).toBeUndefined();
      expect(shortcutOf(button)).toBeUndefined();
    }
    expect(nested.getAttribute("data-miro-native-danger")).toBeNull();
    expect(labelOf(nested)).toBeUndefined();
    rig.state.dispose();
    expect(unknown.attributes.size).toBe(0);
  });

  it("moves native delete last in DOM, preserves handlers and restores its original sibling", () => {
    const rig = fixture();
    const first = rig.make("Zoom");
    const trash = rig.make("Delete\n(Delete)", "lucide-trash-2");
    const edit = rig.make("Edit");
    const handler = vi.fn();
    trash.addEventListener("click", handler);
    trash.setAttribute("data-miro-native-danger", "native");
    rig.menu.replaceChildren(first, trash, edit);
    expect(rig.flush()).toBe(1);
    expect(rig.menu.children).toEqual([first, edit, trash]);
    expect(trash.getAttribute("data-miro-native-danger")).toBe("true");
    trash.click();
    expect(handler).toHaveBeenCalledOnce();
    rig.menu.appendChild(rig.make("New native action"));
    rig.flush();
    expect(rig.menu.children.slice(-1)[0]).toBe(trash);
    rig.menu.appendChild.mockClear();
    rig.state.refresh();
    expect(rig.menu.appendChild).not.toHaveBeenCalled();
    rig.state.dispose();
    expect(rig.menu.children.slice(0, 3)).toEqual([first, trash, edit]);
    expect(trash.getAttribute("data-miro-native-danger")).toBe("native");
    expect(labelOf(trash)).toBeUndefined();
    expect(shortcutOf(trash)).toBeUndefined();
  });

  it("restores order when the direct trash icon disappears, with a surviving sibling fallback", () => {
    const rig = fixture();
    const first = rig.make("First");
    const trash = rig.make("Delete", "lucide-trash-2");
    const next = rig.make("Next");
    const last = rig.make("Last");
    rig.menu.replaceChildren(first, trash, next, last);
    rig.flush();
    next.remove();
    trash.children[0]?.remove();
    rig.flush();
    expect(rig.menu.children).toEqual([first, trash, last]);
    expect(trash.getAttribute("data-miro-native-danger")).toBeNull();
    rig.state.dispose();
  });

  it("does not move a removed button in another menu and captures fresh order after readding it", () => {
    const rig = fixture();
    const trash = rig.make("Delete", "lucide-trash-2");
    const edit = rig.make("Edit");
    const foreign = rig.document.createElement("div");
    rig.menu.replaceChildren(trash, edit);
    rig.flush();
    foreign.appendChild(trash);
    rig.flush();
    expect(foreign.children).toEqual([trash]);
    expect(trash.getAttribute("data-miro-native-danger")).toBeNull();
    expect(labelOf(trash)).toBeUndefined();
    const last = rig.make("Last");
    rig.menu.replaceChildren(edit, trash, last);
    rig.flush();
    expect(rig.menu.children).toEqual([edit, last, trash]);
    rig.state.dispose();
    expect(rig.menu.children).toEqual([edit, trash, last]);
  });

  it("captures fresh native order when removal and readdition share one observer batch", () => {
    const rig = fixture();
    const trash = rig.make("Delete", "lucide-trash-2");
    const first = rig.make("First");
    const last = rig.make("Last");
    rig.menu.replaceChildren(trash, first, last);
    rig.flush();
    trash.remove();
    rig.menu.insertBefore(trash, last);
    expect(rig.flush()).toBe(1);
    expect(rig.menu.children).toEqual([first, last, trash]);
    rig.state.dispose();
    expect(rig.menu.children).toEqual([first, trash, last]);
  });

  it("preserves native captions and never moves a delete already last", () => {
    const rig = fixture();
    const normal = rig.make("Edit");
    const trash = rig.make("Delete", "lucide-trash-2");
    const caption = rig.document.createElement("span");
    caption.className = "miro-canvas-toolbar__menu-label";
    caption.textContent = "Native caption";
    normal.appendChild(caption);
    rig.menu.replaceChildren(normal, trash);
    rig.menu.appendChild.mockClear();
    rig.flush();
    expect(rig.menu.appendChild).not.toHaveBeenCalled();
    rig.state.dispose();
    expect(normal.children).toEqual([caption]);
    expect(caption.textContent).toBe("Native caption");
    expect(rig.menu.children).toEqual([normal, trash]);
  });

  it("cleans a button moved to another menu when disposal precedes observer delivery", () => {
    const rig = fixture();
    const trash = rig.make("Delete", "lucide-trash-2");
    const normal = rig.make("Edit");
    rig.menu.replaceChildren(trash, normal);
    rig.flush();
    const foreign = rig.document.createElement("div");
    foreign.appendChild(trash);
    foreign.appendChild(rig.make("Foreign"));
    const order = [...foreign.children];
    rig.state.dispose();
    expect(foreign.children).toEqual(order);
    expect(trash.getAttribute("data-miro-native-danger")).toBeNull();
    expect(labelOf(trash)).toBeUndefined();
  });

  it("keeps multiple danger buttons stable and restores their original order", () => {
    const rig = fixture();
    const first = rig.make("Delete one", "lucide-trash-2");
    const normal = rig.make("Edit");
    const second = rig.make("Delete two", "lucide-trash-2");
    const last = rig.make("Zoom");
    rig.menu.replaceChildren(first, normal, second, last);
    rig.flush();
    expect(rig.menu.children).toEqual([normal, last, first, second]);
    rig.menu.appendChild.mockClear();
    rig.state.refresh();
    expect(rig.menu.appendChild).not.toHaveBeenCalled();
    rig.state.dispose();
    expect(rig.menu.children).toEqual([first, normal, second, last]);
  });

  it("retains decorated inert snapshots while cleaning detached live buttons", () => {
    const rig = fixture();
    const trash = rig.make("Удалить\n(Delete)", "lucide-trash-2");
    const edit = rig.make("Изменить");
    rig.menu.replaceChildren(trash, edit);
    rig.flush();
    rig.snapshot.setAttribute("aria-hidden", "true");
    rig.snapshot.setAttribute("inert", "");
    rig.snapshot.replaceChildren(...rig.menu.children.map((button) => button.cloneNode(true)));
    rig.snapshot.hidden = false;
    rig.menu.replaceChildren();
    rig.flush();
    expect(labelOf(trash)).toBeUndefined();
    expect(trash.getAttribute("data-miro-native-danger")).toBeNull();
    const snapshotTrash = rig.snapshot.children[1]!;
    expect(labelOf(snapshotTrash)?.textContent).toBe("Удалить");
    expect(shortcutOf(snapshotTrash)?.textContent).toBe("Delete");
    expect(rig.slot.getAttribute("data-miro-native-visible")).toBe("true");
    rig.state.dispose();
    expect(rig.snapshot.getAttribute("inert")).toBe("");
    expect(labelOf(snapshotTrash)?.textContent).toBe("Удалить");
  });

  it("watches only its slot, preserves later native attributes and ignores refresh after disposal", () => {
    const rig = fixture();
    const button = rig.make("Delete", "lucide-trash-2");
    rig.menu.appendChild(button);
    rig.flush();
    button.setAttribute("data-miro-native-danger", "host-update");
    expect(rig.observe).toHaveBeenCalledExactlyOnceWith(rig.slot, {
      childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "aria-label"],
    });
    rig.state.dispose();
    expect(button.getAttribute("data-miro-native-danger")).toBe("host-update");
    rig.state.refresh();
    rig.state.dispose();
    expect(labelOf(button)).toBeUndefined();
    expect(rig.disconnect).toHaveBeenCalledOnce();
  });
});
