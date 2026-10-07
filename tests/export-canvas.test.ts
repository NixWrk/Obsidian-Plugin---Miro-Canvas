import { describe, expect, it, vi } from "vitest";
import { createExportCanvas } from "../src/export-canvas";

class Element {
  readonly nodeType = 1;
  readonly children: Element[] = [];
  readonly attributes = new Map<string, string>();
  readonly styles = new Map<string, string>();
  readonly style = { setProperty: (name: string, value: string) => this.styles.set(name, value) };
  readonly classes = new Set<string>();
  readonly classList = { add: (name: string) => this.classes.add(name) };
  className = "";
  parent?: Element;
  constructor(readonly ownerDocument: Host) {}
  appendChild(child: Element) {
    child.parent = this;
    this.children.push(child);
    return child;
  }
  remove() {
    if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = undefined;
  }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
}

class Host {
  readonly body = new Element(this);
  readonly defaultView = {
    HTMLElement: Element,
    getComputedStyle: () => ({ length: 2, item: (index: number) => ["--text-normal", "color"][index], getPropertyValue: () => "#dedede" }),
  };
  createElement() { return new Element(this); }
}

function fixture() {
  const document = new Host();
  const realSave = vi.fn();
  const realLocalSave = vi.fn();
  const keyBindings = vi.fn();
  let leaf: Leaf | undefined;
  class Leaf {
    readonly containerEl = new Element(document);
    readonly resizeObserver = { disconnect: vi.fn() };
    readonly _empty = { unload: vi.fn() };
    constructor() { leaf = this; }
  }
  const canvas = {
    wrapperEl: new Element(document),
    setData: vi.fn(() => { view.requestSave(); view.saveLocalData(); }),
    onResize: vi.fn(),
    unload: vi.fn(),
    getData: () => undefined as unknown,
  };
  const view = {
    containerEl: new Element(document),
    contentEl: new Element(document),
    canvas,
    load: vi.fn(),
    unload: vi.fn(),
    onOpen: keyBindings,
    requestSave: realSave,
    saveLocalData: realLocalSave,
    file: undefined as unknown,
  };
  const factory = vi.fn(() => view);
  const sourceCanvas = { wrapperEl: new Element(document), x: 17, y: 29, zoom: 2, selection: new Set(["original"]), requestFrame: vi.fn(), deselectAll: vi.fn() };
  const sourceView = { leaf: { constructor: Leaf }, app: { viewRegistry: { viewByType: { canvas: factory } } }, file: { path: "Original.canvas" }, canvas: sourceCanvas };
  return { document, sourceView, sourceCanvas, canvas, view, factory, realSave, realLocalSave, keyBindings, leaf: () => leaf! };
}

describe("independent native export surface", () => {
  it("uses an unregistered view with disabled persistence and no global key binding", () => {
    const f = fixture();
    const snapshot = { nodes: [], edges: [], miroSource: { evidence: "keep" }, future: { keep: true } };
    const renderer = createExportCanvas(f.sourceView, snapshot, f.document as unknown as Document);
    expect(f.canvas.setData).toHaveBeenCalledWith(snapshot);
    expect(f.canvas.getData()).toBe(snapshot);
    expect(f.realSave).not.toHaveBeenCalled();
    expect(f.realLocalSave).not.toHaveBeenCalled();
    expect(f.keyBindings).not.toHaveBeenCalled();
    expect(f.sourceCanvas.requestFrame).not.toHaveBeenCalled();
    expect(f.sourceCanvas.deselectAll).not.toHaveBeenCalled();
    expect(f.sourceCanvas).toMatchObject({ x: 17, y: 29, zoom: 2 });
    expect([...f.sourceCanvas.selection]).toEqual(["original"]);
    expect(f.document.body.children[0]!.attributes.has("inert")).toBe(true);
    expect(f.canvas.wrapperEl.styles.get("--text-normal")).toBe("#dedede");
    expect(f.canvas.wrapperEl.styles.has("color")).toBe(false);
    renderer.dispose();
    renderer.dispose();
    expect(f.canvas.unload).toHaveBeenCalledTimes(1);
    expect(f.view.unload).toHaveBeenCalledTimes(1);
    expect(f.leaf()._empty.unload).toHaveBeenCalledTimes(1);
    expect(f.document.body.children).toHaveLength(0);
    expect(snapshot.miroSource).toEqual({ evidence: "keep" });
  });

  it("removes its host and observer if the native view factory fails", () => {
    const f = fixture();
    f.factory.mockImplementationOnce(() => { throw new Error("factory failed"); });
    expect(() => createExportCanvas(f.sourceView, {}, f.document as unknown as Document)).toThrow("factory failed");
    expect(f.leaf().resizeObserver.disconnect).toHaveBeenCalled();
    expect(f.leaf()._empty.unload).toHaveBeenCalledTimes(1);
    expect(f.document.body.children).toHaveLength(0);
    expect(f.sourceCanvas.requestFrame).not.toHaveBeenCalled();
  });

  it("fails closed when independent construction is unsupported", () => {
    const f = fixture();
    expect(() => createExportCanvas({ canvas: f.sourceCanvas }, {}, f.document as unknown as Document)).toThrow();
    expect(f.factory).not.toHaveBeenCalled();
    expect(f.document.body.children).toHaveLength(0);
    expect(f.sourceCanvas.deselectAll).not.toHaveBeenCalled();
  });
});
