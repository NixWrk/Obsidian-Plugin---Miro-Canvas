import { beforeEach, describe, expect, it, vi } from "vitest";
import { M2CanvasTools } from "../src/m2-tools";
import type { M1CanvasSession } from "../src/m1-session";
import { DocumentControls } from "../src/document-controls";
import { PanelArrangeMode } from "../src/panel-arrange";
import { PanelVisibility } from "../src/panel-visibility";
import { SlideShow } from "../src/slide-show";
import { ExportPanel, ExportOverlay, capturePages } from "../src/board-export";
import { DEFAULT_EXPORT_STATE } from "../src/export-pages";
import { ALL_TOOLBAR_ITEMS } from "../src/quick-tools";
import { words } from "../src/i18n";

const renderer = vi.hoisted(() => ({ render: vi.fn() }));
vi.mock("html2canvas-pro", () => ({ default: renderer.render }));
// The comments child has a separate file owner; keep this suite on the leased controls.
vi.mock("../src/comments-panel", () => ({
  CommentsPanel: class {
    readonly element: TestNode;
    constructor(_actions: unknown, options: { document: TestDocument }) { this.element = options.document.node("aside"); }
    update(): void {}
    focusThread(): boolean { return false; }
    destroy(): void { this.element.remove(); }
  },
}));

type TestEvent = Record<string, unknown> & { preventDefault: () => void; stopPropagation: () => void };
class TestTarget {
  readonly listeners = new Map<string, Set<(event: TestEvent) => void>>();
  addEventListener(name: string, listener: (event: TestEvent) => void): void {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name)!.add(listener);
  }
  removeEventListener(name: string, listener: (event: TestEvent) => void): void { this.listeners.get(name)?.delete(listener); }
  fire(name: string, values: Record<string, unknown> = {}): void {
    const event = { preventDefault: vi.fn(), stopPropagation: vi.fn(), ...values };
    for (const listener of [...this.listeners.get(name) ?? []]) listener(event);
  }
}

class TestNode extends TestTarget {
  readonly children: TestNode[] = [];
  readonly attributes = new Map<string, string>();
  parentNode: TestNode | null = null;
  className = "";
  value = "";
  type = "";
  min = "";
  max = "";
  step = "";
  title = "";
  hidden = false;
  disabled = false;
  width = 0;
  height = 0;
  private text = "";
  readonly properties = new Map<string, string>();
  readonly style = {
    setProperty: (key: string, value: string): void => { this.properties.set(key, value); },
    getPropertyValue: (key: string): string => this.properties.get(key) ?? "",
    removeProperty: (key: string): void => { this.properties.delete(key); },
  };
  readonly classList = {
    add: (...names: string[]): void => { this.className = [...new Set([...this.className.split(" ").filter(Boolean), ...names])].join(" "); },
    remove: (...names: string[]): void => { this.className = this.className.split(" ").filter(name => !names.includes(name)).join(" "); },
    contains: (name: string): boolean => this.className.split(" ").includes(name),
  };
  constructor(readonly ownerDocument: TestDocument, readonly tagName: string) { super(); }
  get firstChild(): TestNode | null { return this.children[0] ?? null; }
  get textContent(): string { return this.text; }
  set textContent(value: string) { this.text = value; for (const child of this.children.splice(0)) child.parentNode = null; }
  appendChild(child: TestNode): TestNode {
    expect(child.ownerDocument).toBe(this.ownerDocument);
    child.remove();
    child.parentNode = this;
    this.children.push(child);
    if (this.tagName === "select" && this.children.length === 1) this.value = child.value;
    return child;
  }
  append(...children: TestNode[]): void { children.forEach(child => this.appendChild(child)); }
  prepend(child: TestNode): void { this.appendChild(child); this.children.splice(this.children.indexOf(child), 1); this.children.unshift(child); }
  removeChild(child: TestNode): TestNode { child.remove(); return child; }
  remove(): void { if (this.parentNode !== null) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; }
  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
  getAttribute(name: string): string | null { return this.attributes.get(name) ?? null; }
  removeAttribute(name: string): void { this.attributes.delete(name); }
  querySelector(selector: string): TestNode | null { return this.querySelectorAll(selector)[0] ?? null; }
  querySelectorAll(selector: string): TestNode[] {
    return this.children.flatMap(child => descendants(child)).filter(child => selector.startsWith(".")
      ? child.classList.contains(selector.slice(1)) : selector === "[data-tool]" && child.getAttribute("data-tool") !== null);
  }
  getBoundingClientRect() { return { left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800 }; }
  getContext() { return { drawImage: vi.fn() }; }
  toBlob(done: (blob: Blob) => void): void { done(new Blob(["jpeg"])); }
}

class TestDocument extends TestTarget {
  readonly body = new TestNode(this, "body");
  readonly fonts = { ready: Promise.resolve() };
  readonly created: TestNode[] = [];
  readonly defaultViewTarget = new TestTarget();
  readonly defaultView: {
    createEl?: (tag: string) => TestNode;
    addEventListener: (name: string, listener: (event: TestEvent) => void) => void;
    removeEventListener: (name: string, listener: (event: TestEvent) => void) => void;
    getComputedStyle: () => { backgroundColor: string; getPropertyValue: () => string };
    setInterval: ReturnType<typeof vi.fn>;
    clearInterval: ReturnType<typeof vi.fn>;
    setTimeout: (run: () => void) => number;
    requestAnimationFrame: (run: () => void) => number;
    cancelAnimationFrame: ReturnType<typeof vi.fn>;
  } = {
    addEventListener: (name, listener) => this.defaultViewTarget.addEventListener(name, listener),
    removeEventListener: (name, listener) => this.defaultViewTarget.removeEventListener(name, listener),
    getComputedStyle: () => ({ backgroundColor: "rgb(20,20,20)", getPropertyValue: () => "0" }),
    setInterval: vi.fn(() => 37), clearInterval: vi.fn(),
    setTimeout: run => { run(); return 1; }, requestAnimationFrame: run => { run(); return 1; }, cancelAnimationFrame: vi.fn(),
  };
  readonly createElement = vi.fn(function (this: TestDocument, tag: string): TestNode {
    expect(this.defaultView.createEl).toBeUndefined();
    return this.node(tag);
  });
  constructor(helper: boolean) {
    super();
    if (helper) {
      const owner = this.defaultView;
      const document = this;
      owner.createEl = vi.fn(function (this: typeof owner, tag: string): TestNode {
        expect(this).toBe(owner);
        const node = document.node(tag);
        expect(node.parentNode).toBeNull();
        expect(node.children).toHaveLength(0);
        expect(node.attributes.size).toBe(0);
        return node;
      });
    }
  }
  node(tag: string): TestNode { const node = new TestNode(this, tag); this.created.push(node); return node; }
  asDocument(): Document { return this as unknown as Document; }
}

function descendants(node: TestNode): TestNode[] { return [node, ...node.children.flatMap(descendants)]; }
function byLabel(root: TestNode, label: string): TestNode {
  const found = descendants(root).find(node => node.getAttribute("aria-label") === label || node.tagName === "button" && node.textContent === label);
  if (found === undefined) throw new Error(`Missing control ${label}`);
  return found;
}
function asNode(element: HTMLElement): TestNode { return element as unknown as TestNode; }
function fixture(helper: boolean) { const document = new TestDocument(helper); const root = document.node("div"); return { document, root }; }
function requireOwnerPath(document: TestDocument, helper: boolean): void {
  if (helper) { expect(document.defaultView.createEl).toHaveBeenCalled(); expect(document.createElement).not.toHaveBeenCalled(); }
  else expect(document.createElement).toHaveBeenCalled();
}

beforeEach(() => { renderer.render.mockReset(); renderer.render.mockResolvedValue({ width: 1000, height: 800 }); });

describe.each([false, true])("leased controls use the injected document (owner helper=%s)", helper => {
  it("builds M2 fields in order, creates one native shape, keeps target selection and disposes its timer", () => {
    const { document } = fixture(helper);
    let board: Record<string, unknown> = {
      nodes: [{ id: "a", type: "text", text: "A", x: 0, y: 0, width: 100, height: 80 }], edges: [],
      miroSource: { evidence: ["keep"] }, future: { nested: ["keep"] },
    };
    const saved = structuredClone(board);
    const history: unknown[] = [];
    const runtime = {
      getData: () => structuredClone(board),
      importData: (next: Record<string, unknown>) => { board = structuredClone(next); },
      requestSave: vi.fn((add: boolean) => { if (add) history.push(structuredClone(board)); }),
    };
    const session = {
      view: runtime, refresh: vi.fn(), snapshot: { selectedIds: ["a"], reviewMode: false },
      adapter: { getNodes: () => board.nodes, getEdges: () => board.edges }, commentThreads: () => [],
      setElementRotation: vi.fn(() => ({ ok: true })),
    };
    const tools = new M2CanvasTools(session as unknown as M1CanvasSession, { hasFile: () => false, openFile: () => {} }, document.asDocument());
    const root = asNode(tools.element);
    expect(root.children.map(child => child.tagName)).toEqual(["p", "fieldset", "fieldset", "fieldset", "fieldset", "aside", "p"]);
    expect(root.children[0]!.getAttribute("role")).toBe("status");
    const shape = byLabel(root, words().localTools.shapeKind);
    expect(shape.children.length).toBeGreaterThan(10);
    shape.value = "rectangle";
    byLabel(root, words().localTools.createShape).fire("click");
    expect(history).toHaveLength(1);
    expect(runtime.requestSave).toHaveBeenCalledWith(true);
    expect(board.miroSource).toEqual(saved.miroSource);
    expect(board.future).toEqual(saved.future);
    const target = byLabel(root, words().localTools.anchorTarget);
    target.value = "a";
    tools.refresh();
    expect(target.value).toBe("a");
    byLabel(root, words().localTools.shapeWidth).value = "0";
    byLabel(root, words().localTools.createShape).fire("click");
    expect(history).toHaveLength(1);
    byLabel(root, words().localTools.rotationDegrees).value = "45";
    byLabel(root, words().localTools.applyRotation).fire("click");
    expect(session.setElementRotation).toHaveBeenCalledWith("a", 45);
    byLabel(root, words().localTools.shapeWidth).value = "240";
    board.miroCanvas = { schemaVersion: 1, settings: { reviewMode: true } };
    byLabel(root, words().localTools.createShape).fire("click");
    expect(history).toHaveLength(1);
    requireOwnerPath(document, helper);
    tools.dispose();
    expect(document.defaultView.clearInterval).toHaveBeenCalledWith(37);
  });

  it("preserves PDF child order, page/fit labels, invalid page refusal and disabled/non-PDF controls", async () => {
    const { document } = fixture(helper);
    const host = { hasFile: vi.fn(() => true), openFile: vi.fn(async () => {}) };
    const controls = new DocumentControls(host, "Docs/Plan.pdf", document.asDocument(), "#page=3");
    const root = asNode(controls.element);
    expect(root.children.map(child => child.tagName)).toEqual(["h3", "p", "input", "select", "button", "button", "button", "button"]);
    const page = byLabel(root, words().documents.pageAriaLabel);
    const fit = byLabel(root, words().documents.fitAriaLabel);
    expect([page.min, page.max, page.step, page.value]).toEqual(["1", "1000000", "1", "3"]);
    expect(fit.children.map(child => child.value)).toEqual(["page", "width"]);
    page.value = "7";
    fit.value = "width";
    byLabel(root, words().documents.nextPage).fire("click");
    await Promise.resolve();
    expect(host.openFile).toHaveBeenCalledWith(expect.objectContaining({ path: "Docs/Plan.pdf", page: 8, fit: "width", subpath: "#page=8" }));
    page.value = "0";
    byLabel(root, words().documents.openPage).fire("click");
    expect(host.openFile).toHaveBeenCalledTimes(1);
    const invalid = new DocumentControls(host, "../bad.pdf", document.asDocument());
    expect(asNode(invalid.element).children.at(-1)!.disabled).toBe(true);
    const markdown = new DocumentControls(host, "Docs/Note.md", document.asDocument());
    expect(asNode(markdown.element).children.map(child => child.tagName)).toEqual(["h3", "p", "button"]);
    requireOwnerPath(document, helper);
    controls.dispose();
    byLabel(root, words().documents.nextPage).fire("click");
    expect(host.openFile).toHaveBeenCalledTimes(1);
  });

  it("ignores an older PDF open failure and pending viewer results after disposal", async () => {
    const { document } = fixture(helper);
    const pending: Array<{ resolve: () => void; reject: (error: unknown) => void }> = [];
    const host = { hasFile: () => true, openFile: vi.fn(() => new Promise<void>((resolve, reject) => pending.push({ resolve, reject }))) };
    const controls = new DocumentControls(host, "Docs/Plan.pdf", document.asDocument());
    const root = asNode(controls.element);
    const page = byLabel(root, words().documents.pageAriaLabel);
    const open = byLabel(root, words().documents.openPage);
    page.value = "4";
    open.fire("click");
    page.value = "5";
    open.fire("click");
    pending[1]!.resolve();
    await vi.waitFor(() => expect(root.children[1]!.textContent).toBe(words().documents.openedInViewer));
    pending[0]!.reject(new Error("older viewer failed"));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(root.children[1]!.textContent).toBe(words().documents.openedInViewer);
    page.value = "6";
    open.fire("click");
    controls.dispose();
    pending[2]!.reject(new Error("viewer closed"));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(root.children[1]!.textContent).toBe(words().documents.openedInViewer);
    requireOwnerPath(document, helper);
  });

  it("keeps arrange handles/tray order and cancels a spare-item drag without saving", () => {
    const { document, root } = fixture(helper);
    const toolbar = document.node("div");
    const bar = document.node("div");
    root.append(toolbar);
    toolbar.append(bar);
    const saveItems = vi.fn();
    const onExit = vi.fn();
    const mode = new PanelArrangeMode({
      document: document.asDocument(), boardRoot: root as unknown as HTMLElement,
      panels: () => ({ toolbar: toolbar as unknown as HTMLElement }), toolbarBar: () => bar as unknown as HTMLElement,
      toolbarItems: () => ALL_TOOLBAR_ITEMS.filter(item => item !== "sticky"), panelPosition: () => undefined,
      savePanelPosition: vi.fn(), saveToolbarItems: saveItems, resetLayout: vi.fn(), onExit, setIcon: vi.fn(),
    });
    mode.enter();
    expect(toolbar.children[0]!.className).toBe("miro-canvas-arrange-handle");
    const row = descendants(root).find(node => node.getAttribute("data-tool") === "sticky")!;
    expect(row.children.map(child => child.tagName)).toEqual(["span", "span"]);
    row.fire("pointerdown", { button: 0, target: row, clientX: 20, clientY: 20 });
    expect(document.body.children[0]!.className).toBe("miro-canvas-arrange-ghost");
    expect(bar.children.at(-1)!.className).toBe("miro-canvas-arrange-insertion");
    document.fire("pointercancel");
    expect(document.body.children).toHaveLength(0);
    expect(saveItems).not.toHaveBeenCalled();
    requireOwnerPath(document, helper);
    byLabel(root, words().arrange.done).fire("click");
    expect(mode.active).toBe(false);
    expect(onExit).toHaveBeenCalledOnce();
    expect(toolbar.children).toEqual([bar]);
  });

  it("mounts one labelled fold toggle and removes it on dispose", () => {
    const { document, root } = fixture(helper);
    const panel = document.node("div");
    root.append(panel);
    const save = vi.fn();
    const controls = new PanelVisibility({
      document: document.asDocument(), boardRoot: root as unknown as HTMLElement,
      panels: () => ({ toolbar: panel as unknown as HTMLElement }),
      position: () => ({ anchor: "top-left", dx: 0, dy: 0, collapsed: false }), savePosition: save,
    });
    controls.mount();
    controls.refresh();
    expect(panel.children).toHaveLength(1);
    const button = panel.children[0]!;
    expect(button.type).toBe("button");
    expect(button.getAttribute("aria-expanded")).toBe("true");
    button.fire("click");
    expect(save).toHaveBeenCalledWith("toolbar", expect.objectContaining({ collapsed: true }));
    requireOwnerPath(document, helper);
    controls.dispose();
    expect(panel.children).toHaveLength(0);
    expect(document.defaultView.cancelAnimationFrame).toHaveBeenCalledWith(1);
  });

  it("builds presentation buttons/counter in order and ends the same owner-document key listener", () => {
    const { document, root } = fixture(helper);
    const show = vi.fn();
    const deck = new SlideShow(root as unknown as HTMLElement, { rectOf: () => ({ x: 0, y: 0, width: 100, height: 50 }), show });
    deck.start(["a", "b"]);
    const bar = root.children[0]!;
    expect(bar.children.map(child => child.tagName)).toEqual(["button", "span", "button", "button"]);
    expect(bar.getAttribute("role")).toBe("toolbar");
    expect(bar.children[1]!.textContent).toBe("1 / 2");
    byLabel(bar, words().slideShow.nextSlide).fire("click");
    expect(bar.children[1]!.textContent).toBe("2 / 2");
    expect(show).toHaveBeenCalledTimes(2);
    requireOwnerPath(document, helper);
    document.fire("keydown", { key: "Escape" });
    expect(root.children).toHaveLength(0);
    expect(document.listeners.get("keydown")!.size).toBe(0);
    expect(root.classList.contains("miro-canvas-presenting")).toBe(false);
  });

  it("preserves export panel actions and overlay preview/commit without duplicate listeners", () => {
    const { document } = fixture(helper);
    const onExport = vi.fn();
    const onClose = vi.fn();
    const panel = new ExportPanel(document.asDocument(), {
      onFormat: vi.fn(), onQuality: vi.fn(), onAddPage: vi.fn(), onAddFramePages: vi.fn(), onRemovePage: vi.fn(),
      onMovePage: vi.fn(), onShowPage: vi.fn(), onExport, onClose,
    });
    const state = { ...DEFAULT_EXPORT_STATE, pages: [{ id: "p", x: 0, y: 0, width: 100, height: 50 }] };
    panel.update({ mode: "board", title: "Plan", state });
    const root = asNode(panel.element);
    expect(root.getAttribute("role")).toBe("dialog");
    const oldPdf = byLabel(root, words().export.exportPdf);
    oldPdf.fire("click");
    expect(onExport).toHaveBeenCalledWith("pdf");
    panel.update({ mode: "board", title: "Plan", state, busy: "Capturing" });
    oldPdf.fire("click");
    expect(onExport).toHaveBeenCalledTimes(1);
    expect(byLabel(root, words().export.exportPdf).disabled).toBe(true);
    byLabel(root, words().export.close).fire("click");
    expect(onClose).toHaveBeenCalledOnce();
    const change = vi.fn();
    const overlay = new ExportOverlay(document.asDocument(), change, () => undefined);
    overlay.update([{ id: "p", left: 1, top: 2, width: 100, height: 50, label: "Page" }], true);
    const frame = asNode(overlay.element).children[0]!;
    expect(frame.children.map(child => child.className)).toEqual(["miro-canvas-export-page__tab", "miro-canvas-export-page__corner"]);
    frame.children[0]!.fire("pointerdown", { button: 0, clientX: 10, clientY: 20 });
    document.defaultViewTarget.fire("pointermove", { clientX: 30, clientY: 40 });
    expect(change).toHaveBeenLastCalledWith("p", expect.objectContaining({ left: 21, top: 22 }), false);
    document.defaultViewTarget.fire("pointerup", { clientX: 30, clientY: 40 });
    expect(change).toHaveBeenLastCalledWith("p", expect.objectContaining({ left: 21, top: 22 }), true);
    requireOwnerPath(document, helper);
    overlay.dispose();
    panel.dispose();
  });

  it.each(["success", "stop", "failure"])("captures with owner canvas and restores progress/camera on %s", async mode => {
    const { document, root } = fixture(helper);
    const canvas = { x: 17, y: 29, tx: 17, ty: 29, zoom: -1, tZoom: -1, screenshotting: false,
      wrapperEl: root as unknown as HTMLElement, deselectAll: vi.fn(), requestFrame: vi.fn(), setViewport: vi.fn() };
    if (mode === "stop") renderer.render.mockImplementationOnce(() => {
      byLabel(document.body, words().export.stop).fire("click");
      return Promise.resolve({ width: 1000, height: 800 });
    });
    if (mode === "failure") renderer.render.mockRejectedValueOnce(new Error("paint failed"));
    const result = capturePages(canvas, [{ x: 0, y: 0, width: 500, height: 400 }], "standard", () => true);
    if (mode === "success") expect(await result).toHaveLength(1);
    else await expect(result).rejects.toThrow(mode === "stop" ? words().export.exportStopped : "paint failed");
    requireOwnerPath(document, helper);
    expect(document.created.some(node => node.tagName === "canvas")).toBe(true);
    expect(document.body.children).toHaveLength(0);
    expect(root.className).toBe("");
    expect(canvas).toMatchObject({ x: 17, y: 29, zoom: -1, screenshotting: false });
    expect(canvas.setViewport).toHaveBeenCalledWith(17, 29, -1);
  });
});
