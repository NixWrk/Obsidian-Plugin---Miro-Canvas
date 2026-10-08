import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderExportPages } from "../src/board-export";
import * as exportHelpers from "../src/export-canvas";

const mock = vi.hoisted(() => ({ render: vi.fn() }));
vi.mock("html2canvas-pro", () => ({ default: mock.render }));

class Element {
  public parent?: Element;
  public children: Element[] = [];
  public className = "";
  public textContent = "";
  public type = "";
  public attributes = new Map<string, string>();
  public readonly classes = new Set<string>();
  public readonly computed = new Map<string, string>();
  public readonly styles = new Map<string, string>();
  public readonly style = { setProperty: (name: string, value: string) => this.styles.set(name, value) };
  public readonly classList = {
    add: (...names: string[]) => names.forEach(name => this.classes.add(name)),
    remove: (...names: string[]) => names.forEach(name => this.classes.delete(name)),
    contains: (name: string) => this.classes.has(name),
  };
  constructor(public ownerDocument: Host) {}
  append(...elements: Element[]) { elements.forEach(element => { element.parent = this; this.children.push(element); }); }
  appendChild(element: Element) { this.append(element); return element; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  addEventListener() {}
  querySelectorAll(_selector?: string): Element[] { return []; }
  getBoundingClientRect() { return { left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800 }; }
}

class Svg extends Element {
  public hiddenByGroup = false;
  closest(): Element | null { return this.hiddenByGroup ? this : null; }
  override querySelectorAll(): Element[] { return this.children; }
  getScreenCTM() { return { inverse: () => ({}) }; }
  createSVGPoint() {
    return { x: 0, y: 0, matrixTransform() { return { x: this.x / 2 - 10, y: this.y / 2 - 20 }; } };
  }
}

class Sheet extends Element {
  public width = 0;
  public height = 0;
  getContext() { return { drawImage: vi.fn() }; }
  toBlob(done: (blob: Blob) => void) { done(new Blob(["jpeg"])); }
}

class Host {
  public body = new Element(this);
  public fonts = { ready: Promise.resolve() };
  public defaultView = {
    setTimeout: (run: () => void, _ms: number) => { run(); return 1; },
    clearTimeout: vi.fn((_id: number) => undefined),
    requestAnimationFrame: (run: FrameRequestCallback) => { run(0); return 1; },
    cancelAnimationFrame: vi.fn((_id: number) => undefined),
    getComputedStyle: (element: Element) => ({ backgroundColor: "rgb(20, 20, 20)", getPropertyValue: (name: string) => element.computed.get(name) ?? "" }),
  };
  createElement(name: string) { return name === "canvas" ? new Sheet(this) : new Element(this); }
}

function board() {
  const document = new Host();
  const wrapper = new Element(document);
  wrapper.setAttribute("data-miro-canvas-export-renderer", "true");
  const canvas = {
    x: 17, y: 29, tx: 17, ty: 29, zoom: -1, tZoom: -1, screenshotting: false,
    wrapperEl: wrapper as unknown as HTMLElement,
    deselectAll: vi.fn(), requestFrame: vi.fn(), setViewport: vi.fn(),
  };
  return { document, wrapper, canvas };
}

function restored(fixture: ReturnType<typeof board>) {
  expect(fixture.canvas).toMatchObject({ x: 17, y: 29, tx: 17, ty: 29, zoom: -1, tZoom: -1, screenshotting: false });
  expect(fixture.wrapper.classes.size).toBe(0);
  expect(fixture.document.body.children).toHaveLength(0);
}

beforeEach(() => {
  mock.render.mockReset();
  mock.render.mockImplementation(() => Promise.resolve({ width: 1000, height: 800 }));
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

function suspendedFrames(fixture: ReturnType<typeof board>) {
  vi.useFakeTimers();
  const callbacks: FrameRequestCallback[] = [];
  const view = fixture.document.defaultView;
  view.setTimeout = (run, ms) => globalThis.setTimeout(run, ms) as unknown as number;
  view.clearTimeout.mockImplementation(id => { globalThis.clearTimeout(id); return undefined; });
  view.requestAnimationFrame = vi.fn(run => { callbacks.push(run); return 17; });
  fixture.wrapper.getBoundingClientRect = () => ({ left: 0, top: 0, right: 3000, bottom: 3000, width: 3000, height: 3000 });
  return { callbacks, view };
}

describe("browser export", () => {
  it("awaits native Markdown readiness before final style preparation and raster cloning", async () => {
    const fixture = board();
    let complete!: () => void;
    const settled = new Promise<void>(resolve => { complete = resolve; });
    const readiness = vi.spyOn(exportHelpers, "settleExportMarkdown").mockImplementationOnce(async (canvas, signal) => {
      expect(canvas).toBe(fixture.canvas);
      expect(signal.aborted).toBe(false);
      await settled;
      fixture.wrapper.textContent = "Feature Reference Launch card";
    });
    const prepare = vi.fn(() => expect(fixture.wrapper.textContent).toContain("Launch card"));
    mock.render.mockImplementation(() => {
      expect(fixture.wrapper.textContent).toContain("Launch card");
      return Promise.resolve({ width: 1000, height: 800 });
    });
    const job = renderExportPages(fixture.canvas, [{ x: 0, y: 0, width: 500, height: 400 }], "standard", () => true, undefined, prepare);
    for (let round = 0; round < 12 && readiness.mock.calls.length === 0; round++) await Promise.resolve();
    expect(readiness).toHaveBeenCalledOnce();
    expect(prepare).not.toHaveBeenCalled();
    expect(mock.render).not.toHaveBeenCalled();
    complete();
    await job;
    expect(prepare).toHaveBeenCalledTimes(4);
    restored(fixture);
  });

  it("propagates native Markdown failure without producing a blank raster", async () => {
    const fixture = board();
    const failure = new Error("native Markdown unavailable");
    vi.spyOn(exportHelpers, "settleExportMarkdown").mockRejectedValueOnce(failure);
    await expect(renderExportPages(fixture.canvas, [{ x: 0, y: 0, width: 500, height: 400 }], "standard", () => true)).rejects.toBe(failure);
    expect(mock.render).not.toHaveBeenCalled();
    restored(fixture);
  });
  it("refuses the working board before deselection, camera mutation or rendering", async () => {
    const fixture = board();
    fixture.wrapper.attributes.delete("data-miro-canvas-export-renderer");
    await expect(renderExportPages(fixture.canvas, [{ x: 0, y: 0, width: 500, height: 400 }], "standard", () => true)).rejects.toThrow();
    expect(fixture.canvas.deselectAll).not.toHaveBeenCalled();
    expect(fixture.canvas.requestFrame).not.toHaveBeenCalled();
    expect(mock.render).not.toHaveBeenCalled();
    restored(fixture);
  });

  it("aborts an in-flight independent raster without touching another board", async () => {
    const fixture = board();
    const other = board();
    const controller = new AbortController();
    mock.render.mockImplementationOnce((_root, options) => new Promise((_, reject) => {
      options.signal.addEventListener("abort", () => reject(new Error("aborted")));
      controller.abort();
    }));
    await expect(renderExportPages(fixture.canvas, [{ x: 0, y: 0, width: 500, height: 400 }], "standard", () => true, controller.signal)).rejects.toThrow();
    restored(fixture);
    restored(other);
    expect(other.canvas.deselectAll).not.toHaveBeenCalled();
    expect(other.canvas.requestFrame).not.toHaveBeenCalled();
  });

  it("can stop while waiting for fonts without starting a raster", async () => {
    const fixture = board();
    fixture.document.fonts.ready = new Promise(() => undefined);
    const controller = new AbortController();
    const job = renderExportPages(fixture.canvas, [{ x: 0, y: 0, width: 500, height: 400 }], "standard", () => true, controller.signal);
    controller.abort();
    await expect(job).rejects.toThrow();
    expect(mock.render).not.toHaveBeenCalled();
    restored(fixture);
  });

  it("reports a non-Error font failure as an Error and clears its owned state", async () => {
    const fixture = board();
    fixture.document.fonts.ready = Promise.reject("font unavailable");
    await expect(renderExportPages(fixture.canvas, [{ x: 0, y: 0, width: 500, height: 400 }], "standard", () => true)).rejects.toBeInstanceOf(Error);
    restored(fixture);
  });

  it("renders multiple pages with explicit pixel scale and restores the board", async () => {
    const fixture = board();
    const progress = vi.fn(() => true);
    const pages = await renderExportPages(fixture.canvas, [
      { x: 0, y: 0, width: 500, height: 400 },
      { x: 700, y: 0, width: 500, height: 400 },
    ], "standard", progress);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toMatchObject({ width: 2000, height: 1600 });
    expect(pages[0]!.jpeg.length).toBeGreaterThan(0);
    expect(mock.render).toHaveBeenCalledTimes(8);
    expect(mock.render.mock.calls[0]![1]).toMatchObject({ scale: 1, allowTaint: false, useCORS: false });
    expect(progress).toHaveBeenLastCalledWith(8, 8);
    restored(fixture);
  });

  it("restores the camera and progress UI after renderer failure", async () => {
    const fixture = board();
    mock.render.mockRejectedValueOnce(new Error("image failed"));
    await expect(renderExportPages(fixture.canvas, [{ x: 0, y: 0, width: 500, height: 400 }], "standard", () => true)).rejects.toThrow("image failed");
    restored(fixture);
  });

  it("renders after the bounded fallback when hidden-window RAF never fires, without another board mutation", async () => {
    const fixture = board();
    const other = board();
    const { callbacks, view } = suspendedFrames(fixture);
    const job = renderExportPages(fixture.canvas, [{ x: 0, y: 0, width: 500, height: 400 }], "standard", () => true);
    await vi.advanceTimersByTimeAsync(120);
    expect(callbacks).toHaveLength(1);
    expect(mock.render).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(149);
    expect(mock.render).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(await job).toHaveLength(1);
    expect(view.cancelAnimationFrame).toHaveBeenCalledWith(17);
    expect(mock.render).toHaveBeenCalledTimes(1);
    callbacks[0]!(999);
    await Promise.resolve();
    expect(mock.render).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    restored(fixture);
    restored(other);
    expect(other.canvas.requestFrame).not.toHaveBeenCalled();
    expect(other.canvas.deselectAll).not.toHaveBeenCalled();
  });

  it("clears the fallback timer when RAF wins the race", async () => {
    const fixture = board();
    const { callbacks } = suspendedFrames(fixture);
    const job = renderExportPages(fixture.canvas, [{ x: 0, y: 0, width: 500, height: 400 }], "standard", () => true);
    await vi.advanceTimersByTimeAsync(120);
    callbacks[0]!(120);
    expect(await job).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(500);
    expect(mock.render).toHaveBeenCalledTimes(1);
    restored(fixture);
  });

  it("Stop cancels both frame and fallback while RAF is suspended and prevents late raster", async () => {
    const fixture = board();
    const { callbacks, view } = suspendedFrames(fixture);
    const controller = new AbortController();
    const job = renderExportPages(fixture.canvas, [{ x: 0, y: 0, width: 500, height: 400 }], "standard", () => true, controller.signal);
    const stopped = expect(job).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(120);
    controller.abort();
    await stopped;
    expect(view.cancelAnimationFrame).toHaveBeenCalledWith(17);
    expect(vi.getTimerCount()).toBe(0);
    callbacks[0]!(999);
    await vi.advanceTimersByTimeAsync(500);
    expect(mock.render).not.toHaveBeenCalled();
    restored(fixture);
  });

  it("settles scoped paint reapplication after every tile preparation before cloning", async () => {
    const fixture = board();
    let paint = "native";
    const prepare = vi.fn(() => {
      paint = "native";
      queueMicrotask(() => { paint = "custom"; });
    });
    mock.render.mockImplementation(() => {
      expect(paint).toBe("custom");
      return Promise.resolve({ width: 1000, height: 800 });
    });
    await renderExportPages(fixture.canvas, [{ x: 0, y: 0, width: 500, height: 400 }], "standard", () => true, undefined, prepare);
    expect(prepare).toHaveBeenCalledTimes(4);
    expect(mock.render).toHaveBeenCalledTimes(4);
    restored(fixture);
  });

  it.each(["prepare", "paint microtask"])("honors Stop during %s before starting a raster", async stage => {
    const fixture = board();
    const controller = new AbortController();
    const prepare = () => {
      if (stage === "prepare") controller.abort();
      else queueMicrotask(() => controller.abort());
    };
    await expect(renderExportPages(fixture.canvas, [{ x: 0, y: 0, width: 500, height: 400 }], "standard", () => true, controller.signal, prepare)).rejects.toThrow();
    expect(mock.render).not.toHaveBeenCalled();
    restored(fixture);
  });

  it("serializes collapsed visibility, custom paint and typography onto SVG clones only", async () => {
    const fixture = board();
    const original = new Svg(fixture.document);
    const path = new Element(fixture.document);
    original.append(path);
    original.classes.add("canvas-edges");
    original.hiddenByGroup = true;
    original.computed.set("visibility", "visible");
    original.computed.set("display", "block");
    original.computed.set("opacity", "0.6");
    path.computed.set("visibility", "visible");
    path.computed.set("opacity", "1");
    path.computed.set("stroke", "rgb(255, 0, 0)");
    path.computed.set("stroke-width", "7px");
    path.computed.set("font-family", "Host font");
    path.computed.set("font-weight", "700");
    path.computed.set("font-style", "italic");
    path.computed.set("letter-spacing", "2px");
    const decoration = new Svg(fixture.document);
    decoration.computed.set("display", "none");
    const cloned = new Element(fixture.document);
    const copy = new Svg(fixture.document);
    const copiedPath = new Element(fixture.document);
    copy.append(copiedPath);
    const copiedDecoration = new Svg(fixture.document);
    fixture.wrapper.querySelectorAll = () => [original, decoration];
    cloned.querySelectorAll = () => [copy, copiedDecoration];
    mock.render.mockImplementation((_root, options) => {
      options.onclone(fixture.document, cloned);
      return Promise.resolve({ width: 1000, height: 800 });
    });
    await renderExportPages(fixture.canvas, [{ x: 0, y: 0, width: 500, height: 400 }], "standard", () => true);
    expect(copy.styles.get("visibility")).toBe("hidden");
    expect(copiedPath.styles.get("visibility")).toBe("hidden");
    expect(copy.styles.get("opacity")).toBe("0.6");
    expect(copiedPath.styles.get("opacity")).toBe("1");
    expect(copiedPath.styles.get("stroke")).toBe("rgb(255, 0, 0)");
    expect(copiedPath.styles.get("stroke-width")).toBe("7px");
    expect(copiedPath.styles.get("font-family")).toBe("Host font");
    expect(copiedPath.styles.get("font-weight")).toBe("700");
    expect(copiedPath.styles.get("font-style")).toBe("italic");
    expect(copiedPath.styles.get("letter-spacing")).toBe("2px");
    expect(copiedDecoration.styles.get("display")).toBe("none");
    expect(copy.getAttribute("viewBox")).toBe("-10 -20 500 400");
    expect(copy.getAttribute("width")).toBe("500");
    expect(copy.styles.get("left")).toBe("-10px");
    expect(original.styles.size).toBe(0);
    expect(path.styles.size).toBe(0);
    expect(original.attributes.size).toBe(0);
    restored(fixture);
  });

  it("cancels before rendering and does not return a partial document", async () => {
    const fixture = board();
    await expect(renderExportPages(fixture.canvas, [{ x: 0, y: 0, width: 500, height: 400 }], "standard", () => false)).rejects.toThrow();
    expect(mock.render).not.toHaveBeenCalled();
    restored(fixture);
  });

  it("cleans up even if the native board refuses to start capture", async () => {
    const fixture = board();
    fixture.canvas.deselectAll.mockImplementation(() => { throw new Error("board closed"); });
    await expect(renderExportPages(fixture.canvas, [{ x: 0, y: 0, width: 500, height: 400 }], "standard", () => true)).rejects.toThrow("board closed");
    restored(fixture);
  });
});
