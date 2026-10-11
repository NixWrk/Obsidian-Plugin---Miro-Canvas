import { afterEach, describe, expect, it, vi } from "vitest";
import { checkExportCanvasFrame, createExportCanvas, exportCanvasSettings, settleExportMarkdown } from "../src/export-canvas";
import { DEFAULT_SETTINGS } from "../src/settings";
import { contentThresholdBand } from "../src/content-breakpoints";
import { collapsedGroupOwners, projectCollapsedGroups } from "../src/board-groups";
import { planCapture } from "../src/board-export";

class Element {
  readonly nodeType = 1;
  readonly children: Element[] = [];
  readonly attributes = new Map<string, string>();
  readonly styles = new Map<string, string>();
  readonly style = { setProperty: (name: string, value: string) => this.styles.set(name, value) };
  readonly classes = new Set<string>();
  readonly classList = { add: (name: string) => this.classes.add(name) };
  className = "";
  textContent = "";
  offsetWidth = 300;
  clientHeight = 200;
  groupHidden = false;
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
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  closest(): Element | null { return this.groupHidden ? this : null; }
  get offsetParent(): Element | null { return this.parent ?? null; }
  contains(element: Element): boolean { return this === element || this.children.some(child => child.contains(element)); }
  get win() { return this.ownerDocument.defaultView; }
}

class Host {
  readonly body = new Element(this);
  readonly defaultView = {
    HTMLElement: Element,
    requestAnimationFrame: vi.fn((_run: FrameRequestCallback) => 99),
    cancelAnimationFrame: vi.fn(),
    setTimeout: (run: () => void, ms: number) => globalThis.setTimeout(run, ms) as unknown as number,
    clearTimeout: (id: number) => globalThis.clearTimeout(id),
    performance: { now: () => performance.now() },
    receiverCheck() { return this; },
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
    canvasEl: new Element(document),
    requestFrame: vi.fn(),
    cancelFrame: vi.fn(),
    nodes: new Map<string, unknown>(),
    setData: vi.fn((_snapshot: unknown) => { view.requestSave(); view.saveLocalData(); }),
    onResize: vi.fn(),
    unload: vi.fn(),
    getData: () => undefined as unknown,
  };
  canvas.wrapperEl.appendChild(canvas.canvasEl);
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
  const sourceCanvas = { wrapperEl: new Element(document), canvasEl: new Element(document), x: 17, y: 29, zoom: 2, selection: new Set(["original"]), requestFrame: vi.fn(), deselectAll: vi.fn(), setData: vi.fn(), unload: vi.fn() };
  const sourceView = { leaf: { constructor: Leaf, containerEl: new Element(document), resizeObserver: { disconnect: vi.fn() }, _empty: { unload: vi.fn() } }, app: { viewRegistry: { viewByType: { canvas: factory } } }, file: { path: "Original.canvas" }, canvas: sourceCanvas, containerEl: new Element(document), contentEl: new Element(document), requestSave: vi.fn(), saveLocalData: vi.fn(), load: vi.fn(), unload: vi.fn() };
  return { document, sourceView, sourceCanvas, canvas, view, factory, realSave, realLocalSave, keyBindings, leaf: () => leaf! };
}

afterEach(() => vi.useRealTimers());

function markdownNode(f: ReturnType<typeof fixture>, id = "text") {
  const content = f.canvas.canvasEl.appendChild(new Element(f.document));
  const preview = content.appendChild(new Element(f.document));
  const originalQueue = { high: true, cancel: vi.fn() };
  const renderer = {
    previewEl: preview,
    text: "[[Feature Reference]] Launch card",
    lastText: null as string | null,
    sections: [] as { rendered: boolean }[],
    asyncSections: [] as unknown[],
    rendered: [] as (() => void)[] | null,
    parsing: false,
    queued: originalQueue as typeof originalQueue | null,
    renderedWidth: 300,
    viewportHeight: 200,
    onRender: vi.fn(),
    onResize: vi.fn(),
  };
  renderer.onRender.mockImplementation(() => {
    renderer.queued = null;
    renderer.lastText = renderer.text;
    renderer.sections = [{ rendered: true }];
    renderer.rendered = null;
    preview.textContent = "Feature Reference Launch card";
  });
  const node = { canvas: f.canvas, text: renderer.text, contentEl: content, child: { containerEl: content, previewMode: { renderer } } };
  f.canvas.nodes.set(id, node);
  return { node, renderer, preview, content, originalQueue };
}

describe("independent native Markdown readiness", () => {
  it("drains only the owned native queue and materializes text with global RAF suspended", async () => {
    const f = fixture();
    const child = markdownNode(f);
    const globalRaf = f.document.defaultView.requestAnimationFrame;
    const background = createExportCanvas(f.sourceView, { nodes: [], edges: [] }, f.document as unknown as Document);
    await settleExportMarkdown(f.canvas, new AbortController().signal);
    expect(child.preview.textContent).toBe("Feature Reference Launch card");
    expect(child.originalQueue.cancel).toHaveBeenCalledOnce();
    expect(child.renderer.onRender).toHaveBeenCalledOnce();
    expect(child.renderer.onRender.mock.instances[0]).toBe(child.renderer);
    expect(child.renderer.onResize).not.toHaveBeenCalled();
    expect(globalRaf).not.toHaveBeenCalled();
    expect(f.document.defaultView.requestAnimationFrame).toBe(globalRaf);
    expect(f.sourceCanvas.requestFrame).not.toHaveBeenCalled();
    background.dispose();
  });

  it("supports a file child's direct renderer and resizes before advancing its queue", async () => {
    const f = fixture();
    const child = markdownNode(f);
    Reflect.deleteProperty(child.node, "text");
    Reflect.set(child.node, "child", { containerEl: child.content, renderer: child.renderer });
    child.renderer.renderedWidth = 0;
    child.renderer.viewportHeight = 0;
    const resizedQueue = { high: true, cancel: vi.fn() };
    child.renderer.onResize.mockImplementation(() => {
      child.renderer.queued = resizedQueue;
      child.renderer.renderedWidth = child.preview.offsetWidth;
      child.renderer.viewportHeight = child.preview.clientHeight;
    });
    const background = createExportCanvas(f.sourceView, { nodes: [], edges: [] }, f.document as unknown as Document);
    await settleExportMarkdown(f.canvas, new AbortController().signal);
    expect(child.renderer.onResize.mock.instances[0]).toBe(child.renderer);
    expect(resizedQueue.cancel).toHaveBeenCalledOnce();
    expect(child.preview.textContent).toContain("Launch card");
    background.dispose();
  });

  it("keeps ready renderers idle, and skips intentionally hidden collapsed content", async () => {
    const f = fixture();
    const ready = markdownNode(f, "ready");
    ready.renderer.onRender();
    ready.renderer.onRender.mockClear();
    const hidden = markdownNode(f, "collapsed");
    hidden.content.groupHidden = true;
    const background = createExportCanvas(f.sourceView, { nodes: [], edges: [] }, f.document as unknown as Document);
    await settleExportMarkdown(f.canvas, new AbortController().signal);
    expect(ready.renderer.onRender).not.toHaveBeenCalled();
    expect(ready.originalQueue.cancel).not.toHaveBeenCalled();
    expect(hidden.originalQueue.cancel).not.toHaveBeenCalled();
    expect(hidden.renderer.onRender).not.toHaveBeenCalled();
    background.dispose();
  });

  it("cancels empty-card queues without waiting for nonexistent Markdown or inventing text", async () => {
    vi.useFakeTimers();
    const f = fixture();
    const child = markdownNode(f);
    child.node.text = child.renderer.text = "";
    child.renderer.onRender.mockImplementation(() => { throw new Error("Empty drawing cards never settle natively"); });
    const background = createExportCanvas(f.sourceView, { nodes: [], edges: [] }, f.document as unknown as Document);
    await settleExportMarkdown(f.canvas, new AbortController().signal);
    expect(child.originalQueue.cancel).toHaveBeenCalledOnce();
    expect(child.renderer.onRender).not.toHaveBeenCalled();
    expect(child.preview.textContent).toBe("");
    expect(vi.getTimerCount()).toBe(0);
    background.dispose();
  });

  it("advances progressive sections in bounded rounds and cancels each replaced native queue", async () => {
    vi.useFakeTimers();
    const f = fixture();
    const child = markdownNode(f);
    const nextQueue = { high: true, cancel: vi.fn() };
    child.renderer.onRender.mockImplementationOnce(() => {
      child.renderer.lastText = child.renderer.text;
      child.renderer.sections = [{ rendered: true }, { rendered: false }];
      child.renderer.queued = nextQueue;
    });
    const background = createExportCanvas(f.sourceView, { nodes: [], edges: [] }, f.document as unknown as Document);
    const pending = settleExportMarkdown(f.canvas, new AbortController().signal);
    expect(child.preview.textContent).toBe("");
    expect(child.renderer.onRender).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(16);
    await pending;
    expect(child.renderer.onRender).toHaveBeenCalledTimes(2);
    expect(nextQueue.cancel).toHaveBeenCalledOnce();
    expect(child.preview.textContent).toContain("Launch card");
    expect(vi.getTimerCount()).toBe(0);
    background.dispose();
  });

  it.each(["parsing", "postprocessing"])("waits for native %s promises without forcing parser or global RAF", async phase => {
    vi.useFakeTimers();
    const f = fixture();
    const child = markdownNode(f);
    child.renderer.parsing = phase === "parsing";
    if (phase === "postprocessing") {
      child.renderer.lastText = child.renderer.text;
      child.renderer.sections = [{ rendered: true }];
      child.renderer.asyncSections = [{}];
    }
    const background = createExportCanvas(f.sourceView, { nodes: [], edges: [] }, f.document as unknown as Document);
    const pending = settleExportMarkdown(f.canvas, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(32);
    expect(child.renderer.onRender).not.toHaveBeenCalled();
    child.renderer.parsing = false;
    child.renderer.asyncSections = [];
    await vi.advanceTimersByTimeAsync(16);
    await pending;
    expect(child.preview.textContent).toContain("Launch card");
    expect(vi.getTimerCount()).toBe(0);
    background.dispose();
  });

  it.each(["Stop", "dispose", "timeout"])("cleans pending queues and timers on %s without blank success", async reason => {
    vi.useFakeTimers();
    const f = fixture();
    const child = markdownNode(f);
    child.renderer.parsing = true;
    const background = createExportCanvas(f.sourceView, { nodes: [], edges: [] }, f.document as unknown as Document);
    const controller = new AbortController();
    const rejected = expect(settleExportMarkdown(f.canvas, controller.signal)).rejects.toThrow();
    if (reason === "Stop") controller.abort();
    if (reason === "dispose") background.dispose();
    if (reason === "timeout") await vi.advanceTimersByTimeAsync(5000);
    await rejected;
    expect(child.originalQueue.cancel).toHaveBeenCalledOnce();
    expect(child.renderer.onRender).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(child.preview.textContent).toBe("");
    background.dispose();
  });

  it.each(["foreign preview", "accessor queue", "missing method", "missing child"])("fails closed on %s before cancelling even an earlier valid queue", async shape => {
    const f = fixture();
    const valid = markdownNode(f, "valid");
    const invalid = markdownNode(f, "invalid");
    const getter = vi.fn(() => invalid.originalQueue);
    if (shape === "foreign preview") Reflect.set(invalid.renderer, "previewEl", f.sourceCanvas.wrapperEl);
    if (shape === "accessor queue") Object.defineProperty(invalid.renderer, "queued", { get: getter, configurable: true });
    if (shape === "missing method") Reflect.set(invalid.renderer, "onRender", undefined);
    if (shape === "missing child") Reflect.deleteProperty(invalid.node, "child");
    const background = createExportCanvas(f.sourceView, { nodes: [], edges: [] }, f.document as unknown as Document);
    await expect(settleExportMarkdown(f.canvas, new AbortController().signal)).rejects.toThrow();
    expect(valid.originalQueue.cancel).not.toHaveBeenCalled();
    expect(invalid.originalQueue.cancel).not.toHaveBeenCalled();
    expect(getter).not.toHaveBeenCalled();
    expect(valid.renderer.onRender).not.toHaveBeenCalled();
    background.dispose();
  });

  it("propagates the exact native renderer error and refuses unregistered source canvases", async () => {
    const f = fixture();
    const child = markdownNode(f);
    const failure = new Error("Markdown postprocessor failed");
    child.renderer.onRender.mockImplementation(() => { throw failure; });
    const background = createExportCanvas(f.sourceView, { nodes: [], edges: [] }, f.document as unknown as Document);
    await expect(settleExportMarkdown(f.canvas, new AbortController().signal)).rejects.toBe(failure);
    await settleExportMarkdown(f.sourceCanvas, new AbortController().signal);
    expect(f.sourceCanvas.requestFrame).not.toHaveBeenCalled();
    background.dispose();
  });

  it("a bounded batch of parsing cards does not starve later card text", async () => {
    vi.useFakeTimers();
    const f = fixture();
    for (let index = 0; index < 32; index++) markdownNode(f, `pending-${index}`).renderer.parsing = true;
    const last = markdownNode(f, "last");
    const background = createExportCanvas(f.sourceView, { nodes: [], edges: [] }, f.document as unknown as Document);
    const controller = new AbortController();
    const rejected = expect(settleExportMarkdown(f.canvas, controller.signal)).rejects.toThrow();
    expect(last.renderer.onRender).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(16);
    expect(last.preview.textContent).toContain("Launch card");
    controller.abort();
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
    background.dispose();
  });
});

describe("independent native export surface", () => {
  it("registers scoped snippet isolation before native data rendering and releases it on disposal", () => {
    const f = fixture();
    const release = vi.fn();
    const register = vi.fn((scope: HTMLElement) => {
      expect(f.canvas.setData).not.toHaveBeenCalled();
      expect(f.document.body.contains(scope as unknown as Element)).toBe(true);
      return release;
    });
    const background = createExportCanvas(f.sourceView, { nodes: [], edges: [] }, f.document as unknown as Document, register);
    expect(register).toHaveBeenCalledOnce();
    background.dispose();
    background.dispose();
    expect(release).toHaveBeenCalledOnce();
  });

  it("uses an unregistered view with disabled persistence and no global key binding", () => {
    const f = fixture();
    const snapshot = { nodes: [], edges: [], miroSource: { evidence: "keep" }, future: { keep: true } };
    const renderer = createExportCanvas(f.sourceView, snapshot, f.document as unknown as Document);
    expect(f.canvas.setData).toHaveBeenCalledWith(snapshot);
    expect(f.canvas.setData.mock.calls[0]![0]).not.toBe(snapshot);
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

  it.each(["view", "canvas", "late canvas", "leaf", "leaf DOM", "view DOM", "content DOM", "wrapper DOM", "late wrapper DOM", "canvas DOM"])("refuses an active %s alias without changing or unloading it", alias => {
    const f = fixture();
    const activeSave = f.sourceView.requestSave;
    const activeLocalSave = f.sourceView.saveLocalData;
    if (alias === "view") f.factory.mockReturnValue(f.sourceView as unknown as typeof f.view);
    if (alias === "canvas") Reflect.set(f.view, "canvas", f.sourceCanvas);
    if (alias === "late canvas") f.view.load.mockImplementation(() => { Reflect.set(f.view, "canvas", f.sourceCanvas); });
    if (alias === "leaf") Reflect.set(f.sourceView.leaf, "constructor", function () { return f.sourceView.leaf; });
    if (alias === "leaf DOM") Reflect.set(f.sourceView.leaf, "constructor", function () { return { ...f.sourceView.leaf }; });
    if (alias === "view DOM") f.view.containerEl = f.sourceView.containerEl;
    if (alias === "content DOM") f.view.contentEl = f.sourceView.contentEl;
    if (alias === "wrapper DOM") f.canvas.wrapperEl = f.sourceCanvas.wrapperEl;
    if (alias === "late wrapper DOM") f.view.load.mockImplementation(() => { f.canvas.wrapperEl = f.sourceCanvas.wrapperEl; });
    if (alias === "canvas DOM") f.canvas.canvasEl = f.sourceCanvas.canvasEl;
    expect(() => createExportCanvas(f.sourceView, { nodes: [], edges: [] }, f.document as unknown as Document)).toThrow();
    expect(f.sourceView.requestSave).toBe(activeSave);
    expect(f.sourceView.saveLocalData).toBe(activeLocalSave);
    expect(f.sourceView.load).not.toHaveBeenCalled();
    expect(f.sourceView.unload).not.toHaveBeenCalled();
    expect(f.sourceView.leaf.resizeObserver.disconnect).not.toHaveBeenCalled();
    expect(f.sourceView.leaf._empty.unload).not.toHaveBeenCalled();
    expect(f.sourceCanvas.unload).not.toHaveBeenCalled();
    expect(f.sourceCanvas.setData).not.toHaveBeenCalled();
    expect(f.sourceCanvas.wrapperEl.attributes.size).toBe(0);
    expect(f.sourceCanvas.wrapperEl.parent).toBeUndefined();
    expect(f.sourceCanvas).toMatchObject({ x: 17, y: 29, zoom: 2 });
    expect([...f.sourceCanvas.selection]).toEqual(["original"]);
    expect(f.document.body.children).toHaveLength(0);
  });

  it("gives native setData a detached board with styles, palette and collapse intent intact", () => {
    const f = fixture();
    const snapshot = {
      nodes: [{ id: "group", type: "group", x: 0, y: 0, width: 900, height: 700 }, { id: "card", type: "text", x: 20, y: 20, width: 100, height: 100, text: "Keep" }],
      edges: [], miroSource: { immutable: [1, 2] }, future: { keep: true },
      miroCanvas: { schemaVersion: 1, settings: { palette: [{ id: "red", label: "Red", color: "#ff0000", source: "custom" }] }, localOverrides: {
        group: { groupCollapse: { width: 900, height: 700, children: ["card"] } }, card: { customStyles: ["style-1"], future: { keep: true } },
      } },
    };
    const before = JSON.stringify(snapshot);
    const renderer = createExportCanvas(f.sourceView, snapshot, f.document as unknown as Document);
    const nativeData = f.canvas.setData.mock.calls[0]![0] as unknown as typeof snapshot;
    expect(nativeData).toEqual(snapshot);
    expect(collapsedGroupOwners(nativeData).get("card")).toBe("group");
    expect((projectCollapsedGroups(nativeData).nodes as typeof snapshot.nodes)[0]).toMatchObject({ width: 280, height: 64 });
    nativeData.nodes[0]!.width = 280;
    nativeData.miroCanvas.localOverrides.card.customStyles.push("runtime-only");
    nativeData.miroCanvas.settings.palette[0]!.label = "Runtime";
    nativeData.miroSource.immutable.push(3);
    expect(JSON.stringify(snapshot)).toBe(before);
    expect(f.canvas.getData()).toBe(snapshot);
    renderer.dispose();
    expect(JSON.stringify(snapshot)).toBe(before);
  });

  it("rejects non-JSON snapshots before constructing any native surface", () => {
    const f = fixture();
    const getter = vi.fn();
    const snapshot = Object.defineProperty({}, "nodes", { get: getter, enumerable: true });
    expect(() => createExportCanvas(f.sourceView, snapshot, f.document as unknown as Document)).toThrow();
    expect(getter).not.toHaveBeenCalled();
    expect(f.factory).not.toHaveBeenCalled();
    expect(f.document.body.children).toHaveLength(0);
  });

  it.each(["requestSave", "saveLocalData"])("fails closed if %s cannot be disabled", name => {
    const f = fixture();
    Object.defineProperty(f.view, name, { writable: false });
    expect(() => createExportCanvas(f.sourceView, { nodes: [], edges: [] }, f.document as unknown as Document)).toThrow();
    expect(f.view.load).not.toHaveBeenCalled();
    expect(f.canvas.setData).not.toHaveBeenCalled();
    expect(f.realSave).not.toHaveBeenCalled();
    expect(f.realLocalSave).not.toHaveBeenCalled();
    expect(f.document.body.children).toHaveLength(0);
  });

  it("paints native nodes and tile transforms on the independent frame host while global RAF is suspended", () => {
    vi.useFakeTimers();
    const f = fixture();
    const globalRaf = f.document.defaultView.requestAnimationFrame;
    const globalCancel = f.document.defaultView.cancelAnimationFrame;
    const frames: { host?: typeof f.document.defaultView; id: number } = { id: 0 };
    let x = 10;
    let zoom = .5;
    let painted = 0;
    const nativeRender = vi.fn(() => {
      f.canvas.canvasEl.styles.set("transform", `translate(${-x}px) scale(${zoom})`);
      if (painted++ === 0) f.canvas.canvasEl.appendChild(new Element(f.document));
      f.canvas.requestFrame();
    });
    f.canvas.requestFrame.mockImplementation(() => {
      if (frames.id) return;
      frames.host = f.canvas.canvasEl.win;
      frames.id = (frames.host.requestAnimationFrame as unknown as (run: FrameRequestCallback) => number)(() => {
        frames.id = 0;
        nativeRender();
      });
    });
    f.canvas.cancelFrame.mockImplementation(() => {
      if (frames.id) frames.host!.cancelAnimationFrame(frames.id);
      frames.id = 0;
    });
    f.canvas.onResize.mockImplementation(() => { f.canvas.requestFrame(); });
    const background = createExportCanvas(f.sourceView, { nodes: [], edges: [] }, f.document as unknown as Document);
    expect(f.canvas.canvasEl.win).not.toBe(f.document.defaultView);
    expect(f.canvas.canvasEl.win.receiverCheck()).toBe(f.document.defaultView);
    expect(f.canvas.canvasEl.win.HTMLElement).toBe(Element);
    vi.advanceTimersByTime(16);
    expect(f.canvas.canvasEl.children).toHaveLength(1);
    expect(f.canvas.canvasEl.styles.get("transform")).toBe("translate(-10px) scale(0.5)");
    x = 200;
    zoom = 1.25;
    vi.advanceTimersByTime(16);
    expect(f.canvas.canvasEl.styles.get("transform")).toBe("translate(-200px) scale(1.25)");
    expect(globalRaf).not.toHaveBeenCalled();
    expect(globalCancel).not.toHaveBeenCalled();
    expect(f.sourceCanvas.requestFrame).not.toHaveBeenCalled();
    const timerHost = f.canvas.canvasEl.win;
    background.dispose();
    background.dispose();
    expect(f.canvas.canvasEl.win).toBe(f.document.defaultView);
    expect(Object.prototype.hasOwnProperty.call(f.canvas.canvasEl, "win")).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    expect(timerHost.requestAnimationFrame(() => undefined)).toBe(0);
    vi.advanceTimersByTime(100);
    expect(nativeRender).toHaveBeenCalledTimes(2);
    expect(f.document.defaultView.requestAnimationFrame).toBe(globalRaf);
    expect(f.document.defaultView.cancelAnimationFrame).toBe(globalCancel);
  });

  it("preserves an own frame-host descriptor and cancels a native queued frame before bridging", () => {
    const f = fixture();
    const getter = () => f.document.defaultView;
    Object.defineProperty(f.canvas.canvasEl, "win", { get: getter, configurable: true, enumerable: true });
    const before = Object.getOwnPropertyDescriptor(f.canvas.canvasEl, "win");
    f.canvas.cancelFrame.mockImplementationOnce(() => { f.document.defaultView.cancelAnimationFrame(87); });
    const background = createExportCanvas(f.sourceView, { nodes: [], edges: [] }, f.document as unknown as Document);
    expect(f.document.defaultView.cancelAnimationFrame).toHaveBeenCalledWith(87);
    background.dispose();
    expect(Object.getOwnPropertyDescriptor(f.canvas.canvasEl, "win")).toEqual(before);
  });

  it.each(["nonconfigurable", "foreign host", "missing cancellation"])("refuses unsupported %s scheduling before setData", shape => {
    const f = fixture();
    if (shape === "nonconfigurable") Object.defineProperty(f.canvas.canvasEl, "win", { value: f.document.defaultView, configurable: false });
    if (shape === "foreign host") Object.defineProperty(f.canvas.canvasEl, "win", { value: {}, configurable: true });
    if (shape === "missing cancellation") Reflect.set(f.canvas, "cancelFrame", undefined);
    const before = Object.getOwnPropertyDescriptor(f.canvas.canvasEl, "win");
    expect(() => createExportCanvas(f.sourceView, { nodes: [], edges: [] }, f.document as unknown as Document)).toThrow();
    expect(f.canvas.setData).not.toHaveBeenCalled();
    expect(Object.getOwnPropertyDescriptor(f.canvas.canvasEl, "win")).toEqual(before);
    expect(f.document.body.children).toHaveLength(0);
  });

  it("reports a native paint failure and clears queued callbacks rather than returning a blank success", () => {
    vi.useFakeTimers();
    const f = fixture();
    const background = createExportCanvas(f.sourceView, { nodes: [], edges: [] }, f.document as unknown as Document);
    const host = f.canvas.canvasEl.win;
    (host.requestAnimationFrame as unknown as (run: FrameRequestCallback) => number)(() => { throw new Error("native paint failed"); });
    (host.requestAnimationFrame as unknown as (run: FrameRequestCallback) => number)(vi.fn());
    vi.advanceTimersByTime(16);
    expect(() => checkExportCanvasFrame(f.canvas)).toThrow("native paint failed");
    expect(vi.getTimerCount()).toBe(0);
    background.dispose();
    expect(() => checkExportCanvasFrame(f.canvas)).not.toThrow();
  });

  it("native frame cancellation clears only its own callback and construction failure restores the host", () => {
    vi.useFakeTimers();
    const f = fixture();
    const background = createExportCanvas(f.sourceView, { nodes: [], edges: [] }, f.document as unknown as Document);
    const host = f.canvas.canvasEl.win;
    const cancelled = vi.fn();
    const retained = vi.fn();
    const first = host.requestAnimationFrame(cancelled);
    host.requestAnimationFrame(retained);
    host.cancelAnimationFrame(first);
    vi.advanceTimersByTime(16);
    expect(cancelled).not.toHaveBeenCalled();
    expect(retained).toHaveBeenCalledOnce();
    background.dispose();
    const failed = fixture();
    failed.canvas.setData.mockImplementation(() => {
      failed.canvas.canvasEl.win.requestAnimationFrame(vi.fn());
      throw new Error("setData failed");
    });
    expect(() => createExportCanvas(failed.sourceView, { nodes: [], edges: [] }, failed.document as unknown as Document)).toThrow("setData failed");
    expect(failed.canvas.canvasEl.win).toBe(failed.document.defaultView);
    expect(vi.getTimerCount()).toBe(0);
    expect(failed.document.body.children).toHaveLength(0);
  });
});

describe("export presentation settings", () => {
  it("keeps every card kind visible at a low raster scale without changing interactive thresholds", () => {
    const settings = { ...DEFAULT_SETTINGS, contentTextThreshold: .5, contentFileThreshold: .6, contentLinkThreshold: .7, contentPluginThreshold: .8 };
    const capture = planCapture([{ x: 0, y: 0, width: 10_000, height: 8000 }], "standard", { width: 1000, height: 800 }, 1, 1)[0]!;
    const exported = exportCanvasSettings(settings);
    expect(exported.shapeRadiusControlEnabled).toBe(false);
    expect(settings.shapeRadiusControlEnabled).toBe(true);
    const thresholds = (value: typeof settings) => ({ text: value.contentTextThreshold, file: value.contentFileThreshold, link: value.contentLinkThreshold, plugin: value.contentPluginThreshold });
    expect(capture.scale).toBe(.2);
    expect(contentThresholdBand(2 ** capture.tiles[0]!.zoom, thresholds(settings))).toBe("0000");
    expect(contentThresholdBand(2 ** capture.tiles[0]!.zoom, thresholds(exported))).toBe("1111");
    expect(settings.contentTextThreshold).toBe(.5);
    expect(exported.zoomStep).toBe(settings.zoomStep);
  });

  it("detaches ordered global styles and palette from settings edits during capture", () => {
    const settings = { ...DEFAULT_SETTINGS, customStyles: [{ id: "stable", name: "Named", declarations: "color: var(--text-normal); opacity: .6" }], permanentPalette: [{ id: "blue", label: "Blue", color: "#0000ff", source: "custom" as const }] };
    const exported = exportCanvasSettings(settings);
    expect(exported.shapeRadiusControlEnabled).toBe(false);
    expect(settings.shapeRadiusControlEnabled).toBe(true);
    settings.customStyles[0]!.name = "Changed";
    settings.customStyles.reverse();
    settings.permanentPalette[0]!.color = "#ff0000";
    expect(exported.customStyles).toEqual([{ id: "stable", name: "Named", declarations: "color: var(--text-normal); opacity: .6" }]);
    expect(exported.permanentPalette).toEqual([{ id: "blue", label: "Blue", color: "#0000ff", source: "custom" }]);
    expect(exportCanvasSettings(DEFAULT_SETTINGS).permanentPalette).toBeUndefined();
  });
});
