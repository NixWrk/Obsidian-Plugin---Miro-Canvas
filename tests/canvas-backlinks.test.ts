import { describe, expect, it, vi } from "vitest";
import type { App, TFile } from "obsidian";
import { extractBoardKnowledge } from "../src/board-knowledge";
import { CanvasBacklinks, canvasBacklinkResultCount, type CanvasBacklinksOptions } from "../src/canvas-backlinks";

vi.mock("obsidian", () => ({
  Keymap: { isModEvent: (event: { ctrlKey?: boolean; button?: number }) => event.ctrlKey || event.button === 1 ? "tab" : false },
}));

class Element {
  nodeType = 1;
  textContent: string | null = "";
  className = "";
  tabIndex = -1;
  hidden = false;
  children: Element[] = [];
  parent?: Element;
  attributes = new Map<string, string>();
  listeners = new Map<string, Set<(event: unknown) => void>>();
  constructor(readonly ownerDocument: Document) {}
  appendChild(child: Element): void { child.remove(); child.parent = this; this.children.push(child); }
  get parentElement(): Element | null { return this.parent ?? null; }
  insertAdjacentElement(position: string, el: Element): Element | null {
    if (position !== "afterend" || !this.parent) return null;
    el.remove(); const parent = this.parent; el.parent = parent; parent.children.splice(parent.children.indexOf(this) + 1, 0, el); return el;
  }
  remove(): void { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); this.parent = undefined; }
  contains(child: Element): boolean { return child === this || this.children.some(el => el.contains(child)); }
  setAttribute(key: string, value: string): void { this.attributes.set(key, value); }
  addEventListener(name: string, callback: (event: unknown) => void): void {
    const listeners = this.listeners.get(name) ?? new Set(); listeners.add(callback); this.listeners.set(name, listeners);
  }
  removeEventListener(name: string, callback: (event: unknown) => void): void { this.listeners.get(name)?.delete(callback); }
  emit(name: string, fields: Record<string, unknown> = {}): void {
    const event = { button: 0, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...fields };
    for (const listener of this.listeners.get(name) ?? []) listener(event);
  }
  get listenerCount(): number { return [...this.listeners.values()].reduce((count, listeners) => count + listeners.size, 0); }
  get text(): string { return (this.textContent ?? "") + this.children.map(el => el.text).join(""); }
}
class Document {
  defaultView = {};
  createElement(): Element { return new Element(this); }
}
interface Child { el: Element; matches?: unknown[] }
function group() {
  return {
    children: [] as Child[],
    addChild(child: Child): void { this.children.push(child); },
    setChildren(children: Child[]): void { this.children = children; },
  };
}
function emitter() {
  const handlers = new Map<string, Set<(...args: unknown[]) => void>>();
  return {
    on(name: string, callback: (...args: unknown[]) => void) {
      const listeners = handlers.get(name) ?? new Set(); listeners.add(callback); handlers.set(name, listeners); return { name, callback };
    },
    offref(ref: { name: string; callback: (...args: unknown[]) => void }) { handlers.get(ref.name)?.delete(ref.callback); },
    trigger(name: string, ...args: unknown[]) { for (const listener of handlers.get(name) ?? []) listener(...args); },
    listenerCount: () => [...handlers.values()].reduce((count, listeners) => count + listeners.size, 0),
  };
}

function fixture(options: CanvasBacklinksOptions = {}, discovery = false) {
  const document = new Document();
  const target = { path: "Notes/Target.md", extension: "md" } as TFile;
  const board = { path: "Board.canvas", extension: "canvas" } as TFile;
  const count = document.createElement();
  count.textContent = "0";
  const root = document.createElement();
  const paneEl = document.createElement();
  const header = document.createElement();
  const empty = document.createElement();
  paneEl.appendChild(header); paneEl.appendChild(root);
  type Result = ReturnType<typeof makeResult>;
  const lookup = new Map<TFile, Result>();
  const nativeProperties = new Map<TFile, unknown[]>();
  let futureCount: number | undefined;
  function paint(): void {
    for (const el of [...root.children]) el.remove();
    for (const result of dom.vChildren.children as Result[]) {
      root.appendChild(result.el);
      for (const el of [...result.childrenEl.children]) el.remove();
      for (const child of result.vChildren.children) result.childrenEl.appendChild(child.el);
    }
  }
  const dom = {
    el: root, emptyStateEl: empty, info: { computed: false }, vChildren: group(), resultDomLookup: lookup,
    infinityScroll: {} as { rootEl: unknown },
    changed: vi.fn(paint),
    getMatchCount: vi.fn(function () {
      if (futureCount !== undefined) return futureCount;
      return (dom.vChildren.children as Result[]).reduce((sum, child) => sum + ["filename", "filepath", "content", "propertyName", "tag", "properties"]
        .reduce((total, key) => total + (child.result[key]?.length ?? 0), 0), 0);
    }),
    addResult(file: TFile, matches: Record<string, unknown[]>, source = "native full source"): Result {
      dom.removeResult(file);
      const result = makeResult(file, matches, source);
      lookup.set(file, result);
      dom.vChildren.addChild(result);
      dom.changed();
      return result;
    },
    removeResult(file: TFile): Result | undefined {
      const result = lookup.get(file);
      if (result) { dom.vChildren.setChildren(dom.vChildren.children.filter(child => child !== result)); lookup.delete(file); }
      dom.changed();
      return result;
    },
    emptyResults(): void { dom.vChildren.setChildren([]); lookup.clear(); dom.changed(); },
  };
  dom.infinityScroll.rootEl = dom;
  function makeResult(file: TFile, matches: Record<string, unknown[]>, source: string) {
    const el = document.createElement();
    const childrenEl = document.createElement();
    el.appendChild(childrenEl);
    const result = {
      file, result: matches, content: source, el, childrenEl, info: { computed: false },
      vChildren: group(), rendered: false,
      invalidate: vi.fn(paint),
      renderContentMatches: vi.fn(function () {
        result.vChildren.setChildren([]);
        for (const [key, ranges] of Object.entries(matches)) {
          if (!(file.extension === "canvas" ? key.startsWith("canvas-") : key === "content")) continue;
          for (const range of ranges) {
            const row = document.createElement(); row.textContent = `native ${key}`;
            result.vChildren.addChild({ el: row, matches: [range] });
          }
        }
        for (const match of nativeProperties.get(file) ?? []) {
          const row = document.createElement(); row.textContent = "future native property";
          result.vChildren.addChild({ el: row, matches: [match] });
        }
        result.invalidate();
      }),
      onRender(): void { if (!result.rendered) { result.rendered = true; result.renderContentMatches(); } },
    };
    return result;
  }
  const component = { file: target, backlinkDom: dom, backlinkCountEl: count, backlinkHeaderEl: header,
    backlinkCollapsed: false, collapseAll: false, searchQuery: null as null | { match(file: TFile, content: string): boolean },
    searchComponent: { value: "", getValue() { return this.value; } },
    passSearchFilter(file: TFile, content: string) { return !this.searchQuery || this.searchQuery.match(file, content); },
    update: vi.fn(), updateSearch: vi.fn(() => dom.emptyResults()),
    setBacklinkCollapsed(collapsed: boolean) { this.backlinkCollapsed = collapsed; },
    setCollapseAll(collapsed: boolean) { this.collapseAll = collapsed; }, onunload: vi.fn() };
  const leaves = [{ view: { backlink: component } }];
  const openFile = vi.fn(async (_file: TFile) => {});
  const workspace = { ...emitter(), getLeavesOfType: vi.fn(() => leaves), getLeaf: vi.fn((_mode: unknown) => ({ openFile })) };
  const files = new Map<string, TFile>([[target.path, target], [board.path, board]]);
  const vault = { ...emitter(), getAbstractFileByPath: vi.fn((path: string) => files.get(path) ?? null) };
  const app = { workspace, ...(discovery ? { vault } : {}), metadataCache: { ...emitter(), resolvedLinks: {} as Record<string, Record<string, number>>,
    getFirstLinkpathDest: vi.fn((path: string, _from: string) => path === "Target" ? target : null) } };
  const knowledge = extractBoardKnowledge({ nodes: [], edges: [], miroCanvas: { properties: { related: "[[Target]]" } } })!;
  const index = { status: "ready" as "ready" | "disposed", getKnowledge: vi.fn(() => knowledge) };
  const bridge = new CanvasBacklinks(app as unknown as Pick<App, "workspace" | "metadataCache">, index, options);
  return { bridge, document, board, target, count, root, dom, component, leaves, app, index, knowledge, openFile, nativeProperties,
    vault, files, paneEl, empty, futureCount: (value: number) => { futureCount = value; } };
}

describe("Canvas native backlink supplement", () => {
  it("discovers a property-only source which native never adds, outside its virtual tree", () => {
    const h = fixture({}, true);
    h.app.metadataCache.resolvedLinks[h.board.path] = { [h.target.path]: 1 };
    const add = vi.spyOn(h.dom, "addResult"); h.bridge.start();
    const supplement = h.paneEl.children.find(el => el.attributes.has("data-miro-canvas-property-backlinks"))!;
    expect(supplement).toBeDefined(); expect(supplement.parent).toBe(h.paneEl);
    expect(h.paneEl.children.indexOf(supplement)).toBe(h.paneEl.children.indexOf(h.root) + 1);
    expect(supplement.text).toBe("Board.canvasrelated: [[Target]]");
    expect(h.dom.vChildren.children).toEqual([]); expect(h.dom.resultDomLookup.size).toBe(0);
    expect(add).not.toHaveBeenCalled(); expect(h.count.textContent).toBe("1");
    expect(h.vault.getAbstractFileByPath).toHaveBeenCalledWith(h.board.path);
    const row = supplement.children[0].children[1].children[0]; row.emit("click");
    expect(h.openFile.mock.calls).toEqual([[h.board]]); expect(h.empty.hidden).toBe(true);
    h.bridge.dispose(); expect(row.listenerCount).toBe(0); expect(supplement.parent).toBeUndefined(); expect(h.empty.hidden).toBe(false);
  });

  it("batches native removals and resolves without needing a native source result", async () => {
    const h = fixture({}, true); h.bridge.start(); h.index.getKnowledge.mockClear();
    h.app.metadataCache.resolvedLinks[h.board.path] = { [h.target.path]: 1 };
    h.dom.removeResult(h.board); h.app.metadataCache.trigger("resolve", h.board); h.app.metadataCache.trigger("resolve", h.board);
    expect(h.index.getKnowledge).not.toHaveBeenCalled(); await Promise.resolve();
    expect(h.index.getKnowledge).toHaveBeenCalledOnce(); expect(h.count.textContent).toBe("1");
    expect(h.paneEl.text).toContain("Board.canvasrelated: [[Target]]"); h.bridge.dispose();
  });

  it("counts property mentions once as a real native card result arrives and disappears", async () => {
    const h = fixture({}, true); h.app.metadataCache.resolvedLinks[h.board.path] = { [h.target.path]: 2 }; h.bridge.start();
    expect(h.dom.getMatchCount()).toBe(1);
    const result = h.dom.addResult(h.board, { "canvas-a": [[0, 21]] }); result.onRender();
    expect(h.dom.getMatchCount()).toBe(2); await Promise.resolve();
    expect(h.count.textContent).toBe("2");
    expect(h.paneEl.children.filter(el => el.attributes.has("data-miro-canvas-property-backlinks"))).toHaveLength(0);
    expect(result.result).toEqual({ "canvas-a": [[0, 21]] }); expect(result.content).toBe("native full source");
    h.dom.removeResult(h.board); await Promise.resolve();
    expect(h.count.textContent).toBe("1"); expect(h.paneEl.text).toContain("related: [[Target]]"); h.bridge.dispose();
  });

  it("fails closed on active, invalid or unsupported filters for missing-source rows", async () => {
    const h = fixture({}, true); h.app.metadataCache.resolvedLinks[h.board.path] = { [h.target.path]: 1 }; h.bridge.start();
    h.component.searchComponent.value = "path:Board"; h.component.searchQuery = { match: vi.fn(() => true) };
    h.component.updateSearch(); await Promise.resolve();
    expect(h.paneEl.text).not.toContain("related"); expect(h.dom.getMatchCount()).toBe(0);
    expect(h.component.searchQuery.match).not.toHaveBeenCalled();
    h.component.searchQuery = null; h.bridge.refresh(); expect(h.paneEl.text).not.toContain("related");
    h.component.searchComponent.value = ""; h.component.updateSearch(); await Promise.resolve(); expect(h.count.textContent).toBe("1");
    h.component.searchComponent.getValue = undefined as unknown as typeof h.component.searchComponent.getValue;
    h.bridge.refresh(); expect(h.paneEl.text).not.toContain("related"); expect(h.count.textContent).toBe("0"); h.bridge.dispose();
  });

  it("passes an existing native source to its actual filter without reading or fabricating JSON", () => {
    const h = fixture(); const match = vi.fn((file: TFile, source: string) => file === h.board && source === "exact native source");
    h.component.searchQuery = { match }; h.component.searchComponent.value = "native query"; h.bridge.start();
    const result = h.dom.addResult(h.board, { "canvas-a": [[0, 21]] }, "exact native source"); result.onRender();
    expect(match).toHaveBeenCalledWith(h.board, "exact native source"); expect(h.count.textContent).toBe("2");
    h.component.searchQuery = { match: () => false }; h.bridge.refresh(); expect(result.childrenEl.text).not.toContain("related"); h.bridge.dispose();
  });

  it("removes stale sources on delete/rename and binds recreated paths to the new genuine file", async () => {
    const h = fixture({}, true); h.app.metadataCache.resolvedLinks[h.board.path] = { [h.target.path]: 1 }; h.bridge.start();
    const supplement = h.paneEl.children[2]; const row = supplement.children[0].children[1].children[0];
    h.files.delete(h.board.path); h.vault.trigger("delete", h.board); await Promise.resolve();
    expect(row.listenerCount).toBe(0); expect(h.count.textContent).toBe("0");
    const recreated = { path: h.board.path, extension: "canvas" } as TFile; h.files.set(recreated.path, recreated);
    h.vault.trigger("create", recreated); await Promise.resolve();
    h.paneEl.children[2].children[0].children[1].children[0].emit("click"); expect(h.openFile).toHaveBeenLastCalledWith(recreated);
    h.files.delete(recreated.path); const moved = { path: "Moved.canvas", extension: "canvas" } as TFile; h.files.set(moved.path, moved);
    delete h.app.metadataCache.resolvedLinks[recreated.path]; h.app.metadataCache.resolvedLinks[moved.path] = { [h.target.path]: 1 };
    h.vault.trigger("rename", moved, recreated.path); await Promise.resolve();
    expect(h.paneEl.text).toContain("Moved.canvas"); expect(h.paneEl.text).not.toContain("Board.canvas"); h.bridge.dispose();
  });

  it("clears changed/unresolved properties, target switches and disabled index rows", async () => {
    const h = fixture({}, true); h.app.metadataCache.resolvedLinks[h.board.path] = { [h.target.path]: 1 }; h.bridge.start();
    const next = extractBoardKnowledge({ nodes: [], edges: [], miroCanvas: { properties: { relation: "[[Missing]]" } } })!;
    h.index.getKnowledge.mockReturnValue(next); h.app.metadataCache.trigger("resolve", h.board); await Promise.resolve();
    expect(h.count.textContent).toBe("0"); expect(h.paneEl.text).not.toContain("related");
    h.index.getKnowledge.mockReturnValue(h.knowledge); h.bridge.refresh(); expect(h.count.textContent).toBe("1");
    h.component.file = { path: "Other.md", extension: "md" } as TFile; h.component.update(); await Promise.resolve();
    expect(h.count.textContent).toBe("0"); expect(h.paneEl.text).not.toContain("related");
    h.component.file = h.target; h.bridge.refresh(); const row = h.paneEl.children[2].children[0].children[1].children[0];
    h.index.status = "disposed"; h.bridge.refresh(); expect(row.listenerCount).toBe(0); expect(h.count.textContent).toBe("0");
    h.bridge.dispose(); expect(h.vault.listenerCount()).toBe(0); expect(h.app.metadataCache.listenerCount()).toBe(0);
  });

  it("tracks section collapse and restores only its owned native empty-state flag", async () => {
    const h = fixture({}, true); h.app.metadataCache.resolvedLinks[h.board.path] = { [h.target.path]: 1 }; h.bridge.start();
    h.component.setBacklinkCollapsed(true); await Promise.resolve(); expect(h.paneEl.children[2].hidden).toBe(true);
    h.component.setBacklinkCollapsed(false); await Promise.resolve(); expect(h.paneEl.children[2].hidden).toBe(false);
    h.component.setCollapseAll(true); await Promise.resolve(); expect(h.paneEl.children[2].children[0].children[1].hidden).toBe(true);
    h.empty.hidden = false; h.bridge.dispose(); expect(h.empty.hidden).toBe(false);
  });

  it("bounds candidate paths and property reference inspections and cancels queued unload work", async () => {
    const diagnose = vi.fn(); const h = fixture({ maxCandidatePaths: 1, maxReferencesPerResult: 1, onDiagnostic: diagnose }, true);
    h.knowledge.frontmatterLinks.unshift({ key: "missing", link: "Missing", original: "[[Missing]]", displayText: "Missing" });
    h.app.metadataCache.resolvedLinks[h.board.path] = { [h.target.path]: 1 };
    h.app.metadataCache.resolvedLinks["Beyond.canvas"] = { [h.target.path]: 1 }; h.bridge.start();
    expect(diagnose).toHaveBeenCalledWith("canvas-backlinks-reference-limit", h.board.path);
    expect(diagnose).toHaveBeenCalledWith("canvas-backlinks-candidate-limit", undefined);
    expect(h.count.textContent).toBe("0"); h.index.getKnowledge.mockClear();
    h.app.metadataCache.trigger("resolve", h.board); h.bridge.dispose(); await Promise.resolve(); expect(h.index.getKnowledge).not.toHaveBeenCalled();
  });

  it("does not substitute a file-shaped cache record when vault lookup or mounting is unsupported", () => {
    const h = fixture({}, true); h.app.metadataCache.resolvedLinks[h.board.path] = { [h.target.path]: 1 };
    h.files.delete(h.board.path); h.bridge.start(); expect(h.count.textContent).toBe("0");
    h.files.set(h.board.path, h.board); h.component.backlinkHeaderEl.remove(); h.bridge.refresh();
    expect(h.paneEl.text).not.toContain("related"); expect(h.dom.vChildren.children).toEqual([]); h.bridge.dispose();
  });

  it("corrects the observed card count omission and keeps the real native card renderer", () => {
    const h = fixture(); h.knowledge.frontmatterLinks = [];
    const result = h.dom.addResult(h.board, { "canvas-a": [[0, 21]] }); result.onRender();
    const nativeRenderer = result.renderContentMatches;
    h.bridge.start();
    expect(h.dom.getMatchCount()).toBe(1);
    expect(h.count.textContent).toBe("1");
    expect(h.root.text).toBe("native canvas-a");
    expect(result.result).toEqual({ "canvas-a": [[0, 21]] });
    result.renderContentMatches();
    expect(nativeRenderer).toHaveBeenCalledTimes(2);
    h.bridge.dispose();
    expect(result.renderContentMatches).toBe(nativeRenderer);
    expect(h.dom.getMatchCount()).toBe(0);
    expect(h.count.textContent).toBe("0");
    expect(h.root.text).toBe("native canvas-a");
  });

  it("counts card and board-property mentions and shows the genuine property key", () => {
    const h = fixture(); h.bridge.start();
    const result = h.dom.addResult(h.board, { "canvas-a": [[0, 21]] }); result.onRender();
    expect(h.dom.getMatchCount()).toBe(2);
    expect(h.count.textContent).toBe("2");
    expect(result.childrenEl.text).toBe("native canvas-arelated: [[Target]]");
    expect(result.vChildren.children).toHaveLength(2);
    expect(h.app.metadataCache.getFirstLinkpathDest).toHaveBeenCalledWith("Target", "Board.canvas");
    h.bridge.dispose();
  });

  it("renders property-only mentions without fabricated ranges and opens the board without eState", async () => {
    const h = fixture(); h.bridge.start();
    const result = h.dom.addResult(h.board, {}); result.onRender();
    const row = result.childrenEl.children[0];
    expect(h.root.text).toBe("related: [[Target]]");
    expect(h.count.textContent).toBe("1");
    expect(row.attributes.get("data-miro-canvas-property-key")).toBe("related");
    expect(result.result).toEqual({});
    expect(result.content).toBe("native full source");
    expect(row.tabIndex).toBe(0);
    row.emit("click"); row.emit("auxclick", { button: 1 }); row.emit("keydown", { key: "Enter", ctrlKey: true });
    await Promise.resolve();
    expect(h.openFile.mock.calls).toEqual([[h.board], [h.board], [h.board]]);
    expect(h.app.workspace.getLeaf.mock.calls).toEqual([[false], ["tab"], ["tab"]]);
    const hover = vi.fn(); h.app.workspace.on("hover-link", hover); row.emit("mouseover");
    expect(hover).toHaveBeenCalledWith(expect.objectContaining({ linktext: h.board.path, targetEl: row }));
    expect(hover.mock.calls[0][0]).not.toHaveProperty("match");
    h.bridge.dispose(); expect(row.listenerCount).toBe(0);
  });

  it("hands property-key navigation to the parent and does not open a note on its behalf", () => {
    const open = vi.fn(); const h = fixture({ onOpenProperty: open }); h.bridge.start();
    const result = h.dom.addResult(h.board, {}); result.onRender();
    result.childrenEl.children[0].emit("keydown", { key: " " });
    expect(open).toHaveBeenCalledWith(h.board, { key: "related", original: "[[Target]]", link: "Target", count: 1 }, expect.anything());
    expect(h.openFile).not.toHaveBeenCalled(); h.bridge.dispose();
  });

  it("leaves Markdown count, renderer, arguments and navigation unchanged", () => {
    const h = fixture(); const note = { path: "Other.md", extension: "md" } as TFile;
    const result = h.dom.addResult(note, { content: [[1, 4]] }); result.onRender();
    const renderer = result.renderContentMatches; h.bridge.start();
    expect(h.count.textContent).toBe("1"); expect(result.renderContentMatches).toBe(renderer);
    expect(h.root.text).toBe("native content"); expect(h.index.getKnowledge).not.toHaveBeenCalled();
    expect(h.dom.getMatchCount()).toBe(1); h.bridge.dispose(); expect(h.count.textContent).toBe("1");
  });

  it("does not double future native counts or duplicate native property children", () => {
    for (const properties of [undefined, [{ key: "related" }]]) {
      const h = fixture(); h.futureCount(2); h.nativeProperties.set(h.board, [{ key: "related" }]); h.bridge.start();
      const result = h.dom.addResult(h.board, { "canvas-a": [[0, 21]], ...(properties ? { properties } : {}) }); result.onRender();
      expect(h.dom.getMatchCount()).toBe(2); expect(h.count.textContent).toBe("2");
      expect(result.childrenEl.text).toBe("native canvas-afuture native property");
      expect(result.vChildren.children).toHaveLength(2); h.bridge.dispose();
    }
  });

  it("does not treat positioned card-frontmatter references as root board properties", () => {
    const h = fixture(); h.knowledge.frontmatterLinks = [Object.assign(h.knowledge.frontmatterLinks[0], { nodeId: "a" })];
    h.bridge.start(); const result = h.dom.addResult(h.board, { "canvas-a": [[0, 21]] }); result.onRender();
    expect(result.childrenEl.text).toBe("native canvas-a"); expect(h.count.textContent).toBe("1"); h.bridge.dispose();
  });

  it("rebuilds owned rows on native rerender and disposes the previous handlers", () => {
    const h = fixture(); h.bridge.start(); const result = h.dom.addResult(h.board, {}); result.onRender();
    const row = result.childrenEl.children[0]; result.renderContentMatches();
    expect(row.listenerCount).toBe(0); expect(result.childrenEl.children).toHaveLength(1);
    expect(result.childrenEl.children[0]).not.toBe(row); expect(h.count.textContent).toBe("1"); h.bridge.dispose();
  });

  it("restores owned instance descriptors and rows on pane close and plugin unload", () => {
    for (const close of ["component", "layout", "plugin"]) {
      const h = fixture(); const originals = [h.dom.getMatchCount, h.dom.addResult, h.dom.removeResult, h.dom.emptyResults, h.component.onunload];
      h.bridge.start(); const result = h.dom.addResult(h.board, {}); const renderer = result.renderContentMatches; result.onRender();
      const row = result.childrenEl.children[0];
      if (close === "component") h.component.onunload();
      else if (close === "layout") { h.leaves.pop(); h.app.workspace.trigger("layout-change"); }
      else h.bridge.dispose();
      expect([h.dom.getMatchCount, h.dom.addResult, h.dom.removeResult, h.dom.emptyResults, h.component.onunload]).toEqual(originals);
      expect(result.renderContentMatches).not.toBe(renderer); expect(row.listenerCount).toBe(0);
      expect(result.vChildren.children).toEqual([]); expect(h.count.textContent).toBe("0");
      h.bridge.dispose(); expect(h.app.workspace.listenerCount()).toBe(0);
    }
  });

  it("removes owned listeners before native remove/empty or source result replacement", () => {
    for (const action of ["remove", "empty", "replace"]) {
      const h = fixture(); h.bridge.start(); const result = h.dom.addResult(h.board, {}); result.onRender();
      const row = result.childrenEl.children[0];
      if (action === "remove") h.dom.removeResult(h.board);
      else if (action === "empty") h.dom.emptyResults();
      else { const next = h.dom.addResult(h.board, {}); next.onRender(); }
      expect(row.listenerCount).toBe(0); expect(result.vChildren.children).toEqual([]);
      expect(h.count.textContent).toBe(action === "replace" ? "1" : "0"); h.bridge.dispose();
    }
  });

  it("attaches panes opened later and ignores unloaded components still in the leaf inventory", () => {
    const h = fixture(); const leaf = h.leaves.pop()!; const original = h.dom.getMatchCount;
    h.bridge.start(); h.leaves.push(leaf); h.app.workspace.trigger("layout-change");
    const result = h.dom.addResult(h.board, {}); result.onRender(); expect(h.root.text).toContain("related");
    Object.assign(h.component, { _loaded: false }); h.app.workspace.trigger("layout-change");
    expect(h.dom.getMatchCount).toBe(original); h.app.workspace.trigger("layout-change"); expect(h.dom.getMatchCount).toBe(original); h.bridge.dispose();
  });

  it("preserves foreign rows/counts and later wrappers, which safely delegate after disposal", () => {
    const h = fixture(); h.bridge.start(); const result = h.dom.addResult(h.board, {}); result.onRender();
    const installed = h.dom.getMatchCount; const later = vi.fn(() => installed()); h.dom.getMatchCount = later;
    const foreign = { el: h.document.createElement() }; result.vChildren.addChild(foreign); h.count.textContent = "99";
    h.bridge.dispose(); expect(h.dom.getMatchCount).toBe(later); expect(later()).toBe(0);
    expect(result.vChildren.children).toEqual([foreign]); expect(h.count.textContent).toBe("99");
  });

  it("fails closed on unsupported panes, result contracts and inactive indexes without changing prototypes", () => {
    const h = fixture(); const original = h.dom.getMatchCount; const prototype = Object.getPrototypeOf(h.dom);
    h.dom.infinityScroll.rootEl = {}; h.bridge.start(); expect(h.dom.getMatchCount).toBe(original);
    expect(Object.getPrototypeOf(h.dom)).toBe(prototype); h.bridge.dispose();
    const inactive = fixture(); inactive.index.status = "disposed"; inactive.bridge.start();
    expect(inactive.bridge.status).toBe("unsupported"); expect(inactive.app.workspace.listenerCount()).toBe(0);
    const unsupported = fixture(); const result = unsupported.dom.addResult(unsupported.board, {}); result.onRender();
    Object.defineProperty(result, "renderContentMatches", { configurable: false }); const render = result.renderContentMatches;
    unsupported.bridge.start(); expect(result.renderContentMatches).toBe(render); expect(result.vChildren.children).toEqual([]); unsupported.bridge.dispose();
  });

  it("bounds property rows and result tracking and excludes unresolved/wrong-target references", () => {
    const diagnostics = vi.fn(); const h = fixture({ maxPropertiesPerResult: 1, maxResults: 1, onDiagnostic: diagnostics });
    h.knowledge.frontmatterLinks.push({ key: "other", original: "[[Target]]", link: "Target", displayText: "Target" },
      { key: "wrong", original: "[[Missing]]", link: "Missing", displayText: "Missing" });
    h.bridge.start(); const result = h.dom.addResult(h.board, {}); result.onRender();
    const other = h.dom.addResult({ path: "Other.canvas", extension: "canvas" } as TFile, {}); other.onRender();
    expect(result.childrenEl.text).toBe("related: [[Target]]"); expect(other.childrenEl.text).toBe("");
    expect(diagnostics).toHaveBeenCalledWith("canvas-backlinks-property-limit", h.board.path);
    expect(diagnostics).toHaveBeenCalledWith("canvas-backlinks-result-limit", "Other.canvas"); h.bridge.dispose();
  });

  it("restores inherited methods by removing only the owned shadows", () => {
    const h = fixture(); const original = h.dom.getMatchCount;
    delete (h.dom as Partial<typeof h.dom>).getMatchCount;
    Object.setPrototypeOf(h.dom, { getMatchCount: original });
    h.bridge.start(); expect(Object.prototype.hasOwnProperty.call(h.dom, "getMatchCount")).toBe(true);
    h.bridge.dispose(); expect(Object.prototype.hasOwnProperty.call(h.dom, "getMatchCount")).toBe(false); expect(h.dom.getMatchCount).toBe(original);
  });

  it("fails closed for unfamiliar result ranges and preserves a future larger native count", () => {
    expect(canvasBacklinkResultCount({ "canvas-a": [[0, 21]], content: [[1, 2]] })).toBe(2);
    expect(canvasBacklinkResultCount({ "canvas-a": [[21, 0]] })).toBeUndefined();
    expect(canvasBacklinkResultCount({ "canvas-a": [{ start: 0, end: 21 }] })).toBeUndefined();
    expect(canvasBacklinkResultCount({ properties: {} })).toBeUndefined();
    const h = fixture(); h.futureCount(7); h.bridge.start(); h.dom.addResult(h.board, { "canvas-a": [[0, 21]] }).onRender();
    expect(h.count.textContent).toBe("7"); h.bridge.dispose();
  });
});
