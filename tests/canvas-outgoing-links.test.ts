import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { App, TFile } from "obsidian";
import { extractBoardKnowledge } from "../src/board-knowledge";
import { CanvasOutgoingLinks, canvasOutgoingEntries } from "../src/canvas-outgoing-links";

vi.mock("obsidian", () => ({
  Keymap: { isModEvent: (event: { ctrlKey?: boolean; button?: number }) => event.ctrlKey || event.button === 1 ? "tab" : false },
  resolveSubpath: (cache: { headings?: { heading: string }[] }, subpath: string) => cache.headings?.length && subpath === "#Heading"
    ? { type: "heading", current: cache.headings[0] } : null,
  setIcon: (el: FakeElement, icon: string) => el.setAttribute("data-icon", icon),
}));

class FakeElement {
  nodeType = 1;
  children: FakeElement[] = [];
  parent: FakeElement | undefined;
  textContent: string | null = "";
  className = "";
  tabIndex = -1;
  attributes = new Map<string, string>();
  listeners = new Map<string, Set<(event: unknown) => void>>();
  constructor(readonly ownerDocument: FakeDocument, readonly tag: string) {}
  appendChild(el: FakeElement): FakeElement { el.remove(); this.children.push(el); el.parent = this; return el; }
  remove(): void { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); this.parent = undefined; }
  contains(el: FakeElement): boolean { return el === this || this.children.some(child => child.contains(el)); }
  setAttribute(key: string, value: string): void { this.attributes.set(key, value); }
  addEventListener(name: string, callback: (event: unknown) => void): void {
    const set = this.listeners.get(name) ?? new Set(); set.add(callback); this.listeners.set(name, set);
  }
  removeEventListener(name: string, callback: (event: unknown) => void): void { this.listeners.get(name)?.delete(callback); }
  emit(name: string, additions: Record<string, unknown> = {}): void {
    const event = { button: 0, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...additions };
    for (const callback of this.listeners.get(name) ?? []) callback(event);
  }
  get text(): string { return (this.textContent ?? "") + this.children.map(child => child.text).join(""); }
  get listenerCount(): number { return [...this.listeners.values()].reduce((total, set) => total + set.size, 0); }
}

class FakeDocument {
  defaultView = { setTimeout, clearTimeout };
  createElement(tag: string): FakeElement { return new FakeElement(this, tag); }
}

function emitter() {
  const handlers = new Map<string, Set<(...args: unknown[]) => void>>();
  return {
    on(name: string, callback: (...args: unknown[]) => void) {
      const set = handlers.get(name) ?? new Set(); set.add(callback); handlers.set(name, set); return { name, callback };
    },
    offref(ref: { name: string; callback: (...args: unknown[]) => void }) { handlers.get(ref.name)?.delete(ref.callback); },
    trigger(name: string, ...args: unknown[]) { for (const callback of handlers.get(name) ?? []) callback(...args); },
    count: () => [...handlers.values()].reduce((total, set) => total + set.size, 0),
  };
}

function fixture(extension = "canvas") {
  const document = new FakeDocument();
  const list = document.createElement("div");
  const count = document.createElement("span");
  const root = { el: list, childrenEl: list, pusherEl: document.createElement("div"), info: { computed: false },
    vChildren: { children: [] as { el: FakeElement; entry?: unknown }[],
      addChild(child: { el: FakeElement }) { this.children.push(child); },
      setChildren(children: { el: FakeElement }[]) { this.children = children; },
    } };
  // A synthetic implementation of the inspected native scroller leaf contract.
  const scroller = { rootEl: root, queueCompute: vi.fn(() => {
    for (const child of [...list.children]) child.remove();
    for (const child of root.vChildren.children) list.appendChild(child.el);
  }) };
  const source = { path: `Board.${extension}`, extension } as TFile;
  const component = {
    file: source, linksCollapsed: false, outgoingFile: null as TFile | null, linksQueue: null,
    outgoingLinkDom: root, outgoingLinkInfinityScroller: scroller, linksCountEl: count,
    recomputeLinks: vi.fn(function (this: { file: TFile; outgoingFile: TFile | null }, ..._args: unknown[]) {
      this.outgoingFile = this.file;
      root.vChildren.setChildren([]);
      count.textContent = "0";
      scroller.queueCompute();
    }),
    onunload: vi.fn(),
  };
  const view = { outgoingLink: component };
  const leaves = [{ view }];
  const metadataEvents = emitter();
  const workspaceEvents = emitter();
  const target = { path: "Notes/Target.md", extension: "md", parent: { path: "Notes" } } as TFile;
  const files = new Map<string, TFile>([["Target", target], ["Notes/Target.md", target], [source.path, source]]);
  const app = { workspace: { ...workspaceEvents, getLeavesOfType: vi.fn(() => leaves), openLinkText: vi.fn(async () => {}) },
    metadataCache: { ...metadataEvents, getFirstLinkpathDest: vi.fn((path: string, from: string) => files.get(path || from) ?? null),
      getFileCache: vi.fn(() => ({ headings: [{ heading: "Heading" }] })) } };
  app.metadataCache.on("resolve", resolved => { if (resolved === component.file) { component.outgoingFile = null; component.recomputeLinks(); } });
  const knowledge = extractBoardKnowledge({ nodes: [
    { id: "a", type: "text", text: "[[Target#Heading]] [[Missing]] ![[Target#Heading]]" },
    { id: "f", type: "file", file: "Notes/Target.md" },
  ], edges: [], miroCanvas: { properties: { relation: "[[Target]]" } } })!;
  const index = { status: "ready" as "ready" | "disposed", getKnowledge: vi.fn(() => knowledge) };
  const bridge = new CanvasOutgoingLinks(app as unknown as Pick<App, "workspace" | "metadataCache">, index);
  return { bridge, app, index, knowledge, component, root, list, count, leaves, document, source };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("Canvas outgoing pane compatibility", () => {
  it("renders actual destination children into the pane, deduplicates subpaths and keeps source node positions", () => {
    const h = fixture();
    const original = h.component.recomputeLinks;
    h.bridge.start();
    expect(h.bridge.status).toBe("ready");
    expect(original).toHaveBeenCalledOnce();
    expect(h.count.textContent).toBe("3");
    expect(h.list.children).toHaveLength(3);
    expect(h.list.text).toContain("HeadingNotes/Target.md");
    expect(h.list.text).toContain("Missing");
    expect(h.root.vChildren.children[0].entry).toMatchObject({ subpath: "#Heading", positions: [
      { nodeId: "a", start: { offset: 0 } }, { nodeId: "a" },
    ] });
    expect(h.root.vChildren.children[2].entry).toMatchObject({ propertyKeys: ["relation"] });
    expect(h.list.children[0].attributes.get("role")).toBe("link");
    expect(h.list.children[0].tabIndex).toBe(0);
    expect(h.component.file).toBe(h.source);
    expect(h.source.extension).toBe("canvas");
    h.bridge.dispose();
  });

  it("delegates Markdown calls with their original arguments and creates no owned rows", () => {
    const h = fixture("md");
    const original = h.component.recomputeLinks;
    h.bridge.start();
    expect(original).not.toHaveBeenCalled();
    h.component.recomputeLinks("native-argument");
    expect(original).toHaveBeenCalledWith("native-argument");
    expect(h.index.getKnowledge).not.toHaveBeenCalled();
    expect(h.list.children).toEqual([]);
    const receiver = { file: { path: "Other.md", extension: "md" } as TFile, outgoingFile: null as TFile | null };
    h.component.recomputeLinks.call(receiver, "borrowed-argument");
    expect(receiver.outgoingFile).toBe(receiver.file);
    expect(h.component.outgoingFile).toBe(h.source);
    h.bridge.dispose();
    expect(h.component.recomputeLinks).toBe(original);
  });

  it("opens destinations with native modifier behavior and forwards hover source paths", async () => {
    const h = fixture();
    h.bridge.start();
    const row = h.list.children[0];
    row.emit("click");
    row.emit("auxclick", { button: 1 });
    row.emit("keydown", { key: "Enter", ctrlKey: true });
    row.emit("mouseover");
    await Promise.resolve();
    expect(h.app.workspace.openLinkText.mock.calls).toEqual([
      ["Target#Heading", "Board.canvas", false], ["Target#Heading", "Board.canvas", "tab"], ["Target#Heading", "Board.canvas", "tab"],
    ]);
    const hover = vi.fn();
    h.app.workspace.on("hover-link", hover);
    row.emit("mouseover");
    expect(hover).toHaveBeenCalledWith(expect.objectContaining({ source: "search", linktext: "Target#Heading", sourcePath: "Board.canvas", targetEl: row }));
    row.emit("mouseover", { relatedTarget: row.children[0] });
    expect(hover).toHaveBeenCalledOnce();
    h.bridge.dispose();
    expect(row.listenerCount).toBe(0);
  });

  it("lets native collapse and subsequent recompute clear and rebuild Canvas results", () => {
    const h = fixture();
    h.bridge.start();
    const row = h.list.children[0];
    h.component.linksCollapsed = true;
    h.component.recomputeLinks();
    expect(h.list.children).toEqual([]);
    expect(row.listenerCount).toBe(0);
    h.component.linksCollapsed = false;
    h.component.recomputeLinks();
    expect(h.list.children).toHaveLength(3);
    h.bridge.dispose();
  });

  it("restores instance methods, list rows, count and subscriptions when the pane closes", () => {
    const h = fixture();
    const original = h.component.recomputeLinks;
    const unloaded = h.component.onunload;
    h.bridge.start();
    const rows = [...h.list.children];
    h.component.onunload();
    expect(unloaded).toHaveBeenCalledOnce();
    expect(h.component.recomputeLinks).toBe(original);
    expect(h.component.onunload).toBe(unloaded);
    expect(h.list.children).toEqual([]);
    expect(rows.every(row => row.listenerCount === 0)).toBe(true);
    expect(h.count.textContent).toBe("0");
    h.bridge.dispose();
    expect(h.app.workspace.count()).toBe(0);
  });

  it("supports newly opened panes and removes detached ones on layout change", () => {
    const h = fixture();
    const leaf = h.leaves.pop()!;
    const original = h.component.recomputeLinks;
    h.bridge.start();
    h.leaves.push(leaf);
    h.app.workspace.trigger("layout-change");
    expect(h.list.children).toHaveLength(3);
    h.leaves.pop();
    h.app.workspace.trigger("layout-change");
    expect(h.component.recomputeLinks).toBe(original);
    expect(h.list.children).toEqual([]);
    h.bridge.dispose();
  });

  it("does not reattach a closed native component that briefly remains in the leaf inventory", () => {
    const h = fixture();
    const original = h.component.recomputeLinks;
    h.bridge.start();
    Object.assign(h.component, { _loaded: false });
    h.app.workspace.trigger("layout-change");
    expect(h.component.recomputeLinks).toBe(original);
    h.app.workspace.trigger("layout-change");
    expect(h.component.recomputeLinks).toBe(original);
    h.bridge.dispose();
  });

  it("renders bounded batches and cancels late rows on unload, board switch or index disposal", async () => {
    for (const action of ["unload", "switch", "index"] as const) {
      const h = fixture();
      const bridge = new CanvasOutgoingLinks(h.app as unknown as Pick<App, "workspace" | "metadataCache">, h.index, { batchSize: 1 });
      bridge.start();
      expect(h.list.children).toHaveLength(1);
      if (action === "unload") bridge.dispose();
      else if (action === "switch") { h.component.file = { path: "Note.md", extension: "md" } as TFile; h.component.recomputeLinks(); }
      else h.index.status = "disposed";
      await vi.runAllTimersAsync();
      expect(h.list.children).toHaveLength(0);
      bridge.dispose();
    }
  });

  it("preserves foreign rows/counts and later method wrappers on disposal", () => {
    const h = fixture();
    h.bridge.start();
    const installed = h.component.recomputeLinks;
    const later = vi.fn(function (this: typeof h.component, ...args: unknown[]) { return installed.apply(this, args); });
    h.component.recomputeLinks = later;
    const foreign = { el: h.document.createElement("div") };
    h.root.vChildren.addChild(foreign);
    h.count.textContent = "99";
    h.bridge.dispose();
    expect(h.component.recomputeLinks).toBe(later);
    expect(h.root.vChildren.children).toEqual([foreign]);
    expect(h.count.textContent).toBe("99");
    h.component.file = { path: "Note.md", extension: "md" } as TFile;
    h.component.recomputeLinks();
    expect(h.component.outgoingFile).toBe(h.component.file);
    expect(h.index.getKnowledge).toHaveBeenCalledOnce();
  });

  it("fails closed on unsupported pane shape or inactive board index without prototype changes", () => {
    const h = fixture();
    const original = h.component.recomputeLinks;
    const prototype = Object.getPrototypeOf(h.component);
    h.root.vChildren.addChild = undefined as unknown as typeof h.root.vChildren.addChild;
    h.bridge.start();
    expect(h.component.recomputeLinks).toBe(original);
    expect(Object.getPrototypeOf(h.component)).toBe(prototype);
    expect(h.index.getKnowledge).not.toHaveBeenCalled();
    h.bridge.dispose();
    const unsupported = fixture();
    unsupported.index.status = "disposed";
    unsupported.bridge.start();
    expect(unsupported.bridge.status).toBe("unsupported");
    expect(unsupported.app.workspace.count()).toBe(0);
  });

  it("leaves future native Canvas renderers alone if their own children are already present", () => {
    const h = fixture();
    const native = { el: h.document.createElement("div") };
    h.component.recomputeLinks.mockImplementation(() => { h.root.vChildren.setChildren([native]); h.component.outgoingLinkInfinityScroller.queueCompute(); });
    h.bridge.start();
    expect(h.root.vChildren.children).toEqual([native]);
    expect(h.index.getKnowledge).not.toHaveBeenCalled();
    h.bridge.dispose();
    expect(h.root.vChildren.children).toEqual([native]);
  });

  it("caps destination rows and reports the limit without reading files", () => {
    const h = fixture();
    const diagnostics = vi.fn();
    const bridge = new CanvasOutgoingLinks(h.app as unknown as Pick<App, "workspace" | "metadataCache">, h.index, { maxRows: 1, onDiagnostic: diagnostics });
    bridge.start();
    expect(h.list.children).toHaveLength(1);
    expect(diagnostics).toHaveBeenCalledWith("canvas-outgoing-row-limit", "Board.canvas");
    bridge.dispose();
  });

  it("refreshes through the native resolve listener, including late target resolution", () => {
    const h = fixture();
    h.bridge.start();
    const rows = [...h.list.children];
    h.knowledge.links.push({ link: "Other", original: "[[Other]]", displayText: "Other",
      position: { nodeId: "a", start: { line: 0, col: 100, offset: 100 }, end: { line: 0, col: 109, offset: 109 } } });
    h.app.metadataCache.trigger("resolve", h.source);
    expect(h.list.children).toHaveLength(4);
    expect(rows.every(row => row.listenerCount === 0)).toBe(true);
    h.bridge.dispose();
  });

  it("keeps unresolved destinations visible without invoking native note creation", () => {
    const h = fixture();
    h.bridge.start();
    h.list.children[1].emit("click");
    expect(h.app.workspace.openLinkText).not.toHaveBeenCalled();
    expect(h.list.text).toContain("Missing");
    h.bridge.dispose();
  });

  it("deduplicates properties and file cards by resolved destination while retaining heading/block targets", () => {
    const h = fixture();
    const entries = canvasOutgoingEntries(h.knowledge, h.source.path, h.app.metadataCache.getFirstLinkpathDest);
    expect(entries).toHaveLength(3);
    expect(entries[0].positions).toHaveLength(2);
    expect(entries[2].propertyKeys).toEqual(["relation"]);
    expect(entries[2].positions[0].nodeId).toBe("f");
  });
});
