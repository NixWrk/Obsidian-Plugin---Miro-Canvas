import { afterEach, describe, expect, it, vi } from "vitest";
import { PanelVisibility } from "../src/panel-visibility";
import { normalizePanelPosition, type PanelPosition } from "../src/panel-layout";

class ElementStub {
  children: ElementStub[] = [];
  attributes = new Map<string, string>();
  listeners = new Map<string, Set<(event: any) => void>>();
  style = { setProperty: vi.fn(), removeProperty: vi.fn() };
  defaultView = null;
  appendChild(child: ElementStub) { this.children.push(child); }
  createElement() { return new ElementStub(); }
  setAttribute(key: string, value: string) { this.attributes.set(key, value); }
  getAttribute(key: string) { return this.attributes.get(key) ?? null; }
  removeAttribute(key: string) { this.attributes.delete(key); }
  querySelector() { return null; }
  remove() {}
  getBoundingClientRect() { return { left: 20, top: 100, right: 320, bottom: 600, width: 300, height: 500 }; }
  addEventListener(key: string, listener: (event: any) => void) {
    if (!this.listeners.has(key)) this.listeners.set(key, new Set());
    this.listeners.get(key)!.add(listener);
  }
  removeEventListener(key: string, listener: (event: any) => void) { this.listeners.get(key)?.delete(listener); }
  fire(key: string, x = 50, y = 150, pointerId = 1) {
    for (const listener of [...this.listeners.get(key) ?? []]) {
      listener({ button: 0, clientX: x, clientY: y, pointerId, preventDefault() {}, stopPropagation() {} });
    }
  }
}

function setup(collapsed: boolean, hidden = false, inBar = false) {
  const document = new ElementStub();
  document.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800 });
  const panel = new ElementStub();
  const bar = new ElementStub();
  if (inBar) panel.querySelector = () => bar as never;
  (document as any).body = { classList: { contains: () => true } };
  let position: PanelPosition = { anchor: "top-left", dx: 20, dy: 100, orientation: "vertical", collapsed };
  const save = vi.fn((_id, next: PanelPosition) => { position = next; });
  const visibility = new PanelVisibility({
    document: document as unknown as Document,
    boardRoot: document as unknown as HTMLElement,
    panels: () => ({ toolbar: panel as unknown as HTMLElement }),
    position: () => position,
    savePosition: save,
    buttonHidden: () => hidden,
  });
  visibility.mount();
  return { document, panel, button: (inBar ? bar : panel).children[0]!, bar, save, visibility };
}

afterEach(() => vi.useRealTimers());

describe("panel buttons", () => {
  it("mounts the button inside the panel's own main row", () => {
    const rig = setup(false, false, true);
    expect(rig.panel.children).toHaveLength(0);
    expect(rig.bar.children).toContain(rig.button);
    rig.visibility.dispose();
  });

  it("centers a vertical control and keeps a gap before the tools", () => {
    const rig = setup(false, false, true);
    rig.panel.setAttribute("data-miro-canvas-panel-orientation", "vertical");
    rig.visibility.refresh();
    expect(rig.button.style.setProperty).toHaveBeenCalledWith("left", "calc(50% - 22px)");
    expect(rig.bar.style.setProperty).toHaveBeenCalledWith("padding-top", "100px");
    expect(rig.button.getAttribute("data-panel-icon")).toBe("panel-top-close");
    expect(rig.button.getAttribute("title")).toContain("Hold, then drag");
    rig.visibility.dispose();
  });

  it("centers the button in a folded square", () => {
    const rig = setup(true, false, true);
    expect(rig.button.style.setProperty).toHaveBeenCalledWith("left", "calc(50% - 22px)");
    expect(rig.button.style.setProperty).toHaveBeenCalledWith("top", "calc(50% - 22px)");
    rig.visibility.dispose();
  });

  it("hides a removed button without reserving an empty slot", () => {
    const rig = setup(false, true, true);
    expect((rig.button as any).hidden).toBe(true);
    expect(rig.bar.style.setProperty).toHaveBeenCalledWith("padding-top", "0px");
    rig.visibility.dispose();
  });

  it("keeps a collapsed panel reachable even when its button was removed", () => {
    const rig = setup(true, true);
    expect((rig.button as any).hidden).toBe(false);
    rig.visibility.dispose();
  });

  it("toggles with a short press", () => {
    vi.useFakeTimers();
    const rig = setup(false);
    rig.button.fire("pointerdown");
    vi.advanceTimersByTime(100);
    rig.document.fire("pointerup");
    rig.button.fire("click");
    expect(rig.save).toHaveBeenCalledExactlyOnceWith("toolbar", expect.objectContaining({ collapsed: true }));
    rig.visibility.dispose();
  });

  it.each([true, false])("moves after a hold without changing collapsed=%s", (collapsed) => {
    vi.useFakeTimers();
    const rig = setup(collapsed);
    rig.button.fire("pointerdown");
    vi.advanceTimersByTime(450);
    rig.document.fire("pointermove", 100, 250);
    expect(rig.save).not.toHaveBeenCalled();
    expect(rig.panel.style.setProperty).toHaveBeenCalled();
    rig.document.fire("pointerup", 100, 250);
    rig.button.fire("click");
    expect(rig.save).toHaveBeenCalledTimes(1);
    expect(rig.save.mock.calls[0]![1]).toMatchObject({ collapsed, orientation: "vertical", buttonRight: false, buttonBottom: false });
    rig.visibility.dispose();
  });

  it("cancels a held drag without saving or folding", () => {
    vi.useFakeTimers();
    const rig = setup(false);
    rig.button.fire("pointerdown");
    vi.advanceTimersByTime(500);
    rig.document.fire("pointermove", 100, 250);
    rig.document.fire("pointercancel");
    rig.button.fire("click");
    expect(rig.save).not.toHaveBeenCalled();
    expect(rig.panel.style.setProperty).toHaveBeenCalledWith("left", "20px");
    rig.visibility.dispose();
  });

  it("does not drag before the hold finishes", () => {
    vi.useFakeTimers();
    const rig = setup(true);
    rig.button.fire("pointerdown");
    rig.document.fire("pointermove", 100, 250);
    vi.advanceTimersByTime(600);
    rig.document.fire("pointerup", 100, 250);
    rig.button.fire("click");
    expect(rig.save).not.toHaveBeenCalled();
    rig.visibility.dispose();
  });

  it("persists only a valid collapsed flag", () => {
    const position = { anchor: "top-left", dx: 1, dy: 2 };
    expect(normalizePanelPosition({ ...position, collapsed: true })).toEqual({ ...position, collapsed: true });
    expect(normalizePanelPosition({ ...position, collapsed: "yes" })).toEqual(position);
  });
});
