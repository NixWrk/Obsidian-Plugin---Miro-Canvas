import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderExportPages } from "../src/board-export";

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
  public readonly classList = {
    add: (...names: string[]) => names.forEach(name => this.classes.add(name)),
    remove: (...names: string[]) => names.forEach(name => this.classes.delete(name)),
  };
  constructor(public ownerDocument: Host) {}
  append(...elements: Element[]) { elements.forEach(element => { element.parent = this; this.children.push(element); }); }
  appendChild(element: Element) { this.append(element); return element; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  addEventListener() {}
  querySelectorAll() { return []; }
  getBoundingClientRect() { return { width: 1000, height: 800 }; }
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
    setTimeout: (run: () => void) => { run(); return 1; },
    requestAnimationFrame: (run: () => void) => { run(); return 1; },
    getComputedStyle: () => ({ backgroundColor: "rgb(20, 20, 20)" }),
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

describe("browser export", () => {
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
