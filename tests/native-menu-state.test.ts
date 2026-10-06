import { describe, expect, it, vi } from "vitest";
import { watchNativeMenuState } from "../src/native-menu-state";

class MenuElement {
  children: MenuElement[] = [];
  get childNodes() { return this.children; }
  hidden = true;
  duplicateIcon = false;
  deleteVisible = false;
  attributes = new Map<string, string>();
  tagName = "BUTTON";
  ownerDocument: unknown;
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  setAttribute = vi.fn((name: string, value: string) => { this.attributes.set(name, value); });
  removeAttribute(name: string) { this.attributes.delete(name); }
  querySelector(selector: string) {
    return selector.includes("lucide-") ? (this.duplicateIcon ? {} : null) : (this.deleteVisible ? {} : null);
  }
}

function fixture() {
  let notify = () => {};
  const observe = vi.fn();
  const disconnect = vi.fn();
  class Observer {
    constructor(callback: () => void) { notify = callback; }
    observe = observe;
    disconnect = disconnect;
  }
  const slot = new MenuElement();
  const menu = new MenuElement();
  const snapshot = new MenuElement();
  slot.ownerDocument = { defaultView: { MutationObserver: Observer } };
  const layout = vi.fn();
  const state = watchNativeMenuState(slot as unknown as HTMLElement, menu as unknown as HTMLElement, snapshot as unknown as HTMLElement, layout);
  return { slot, menu, snapshot, state, observe, disconnect, layout, notify: () => notify() };
}

describe("adopted native menu state", () => {
  it("notifies placement after native contents change even when visibility stays the same", () => {
    const rig = fixture();
    rig.menu.children = [new MenuElement()];
    rig.notify();
    rig.layout.mockClear();
    rig.menu.children.push(new MenuElement());
    rig.notify();
    expect(rig.layout).toHaveBeenCalledOnce();
    rig.state.dispose();
  });
  it("keeps the slot visible during delayed menu clearing and hides the snapshot when the live menu returns", () => {
    const rig = fixture();
    expect(rig.slot.getAttribute("data-miro-native-visible")).toBe("false");
    rig.menu.children = [new MenuElement()];
    rig.notify();
    expect(rig.slot.getAttribute("data-miro-native-menu")).toBe("true");
    rig.snapshot.hidden = false;
    rig.state.refresh();
    rig.menu.children = [];
    rig.notify();
    expect(rig.slot.getAttribute("data-miro-native-menu")).toBe("false");
    expect(rig.slot.getAttribute("data-miro-native-visible")).toBe("true");
    rig.menu.children = [new MenuElement()];
    rig.notify();
    expect(rig.slot.getAttribute("data-miro-native-menu")).toBe("true");
    rig.menu.children = [];
    rig.snapshot.hidden = true;
    rig.notify();
    expect(rig.slot.getAttribute("data-miro-native-visible")).toBe("false");
    rig.slot.deleteVisible = true;
    rig.notify();
    expect(rig.slot.getAttribute("data-miro-native-visible")).toBe("true");
    rig.state.dispose();
  });

  it("marks only direct native duplicate buttons and restores removed and retained buttons", () => {
    const rig = fixture();
    const duplicate = new MenuElement();
    duplicate.duplicateIcon = true;
    const normal = new MenuElement();
    const other = new MenuElement();
    other.tagName = "SPAN";
    other.duplicateIcon = true;
    rig.menu.children = [duplicate, normal, other];
    rig.notify();
    expect(duplicate.getAttribute("data-miro-native-duplicate")).toBe("true");
    expect(normal.getAttribute("data-miro-native-duplicate")).toBeNull();
    expect(other.getAttribute("data-miro-native-duplicate")).toBeNull();
    rig.menu.children = [];
    rig.notify();
    expect(duplicate.getAttribute("data-miro-native-duplicate")).toBeNull();
    rig.menu.children = [duplicate];
    rig.notify();
    rig.state.dispose();
    expect(duplicate.getAttribute("data-miro-native-duplicate")).toBeNull();
    expect(rig.slot.getAttribute("data-miro-native-menu")).toBeNull();
    expect(rig.disconnect).toHaveBeenCalledOnce();
  });

  it("watches only its slot and does not rewrite unchanged states", () => {
    const rig = fixture();
    rig.slot.setAttribute.mockClear();
    rig.state.refresh();
    rig.notify();
    expect(rig.slot.setAttribute).not.toHaveBeenCalled();
    expect(rig.observe).toHaveBeenCalledExactlyOnceWith(rig.slot, {
      childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"],
    });
    rig.state.dispose();
  });
});
