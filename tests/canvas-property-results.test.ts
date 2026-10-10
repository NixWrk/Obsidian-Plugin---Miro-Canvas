import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { App, TFile } from "obsidian";
import { CanvasPropertyResults, parseCanvasPropertyQuery } from "../src/canvas-property-results";

vi.mock("obsidian", () => ({ Keymap: { isModEvent: (event: { ctrlKey?: boolean; metaKey?: boolean; button?: number }) => event.ctrlKey || event.metaKey || event.button === 1 ? "tab" : false } }));

function matches(query: string, properties: unknown, sensitive = false): boolean {
  const plan = parseCanvasPropertyQuery(query, sensitive);
  expect(plan.supported, query).toBe(true);
  if (!plan.supported) throw new Error(plan.reason);
  const result = plan.match(properties);
  expect(result.ok).toBe(true);
  return result.matches;
}

describe("bounded positive board-property queries", () => {
  it("matches tags, presence and recursive scalar values in a positive conjunction", () => {
    const properties = { tags: ["#Work/Project", "other"], status: "Ready", owner: { names: ["Alex", "Mira"] }, count: 123, approved: true, nullable: null };
    expect(matches('tag:work ([status:ready] [owner:alex]) [count:23] [approved:true] [nullable]', properties)).toBe(true);
    expect(matches('tag:work [status:missing]', properties)).toBe(false);
    expect(matches('tag:wor', properties)).toBe(false);
    expect(matches('[missing]', properties)).toBe(false);
    expect(matches('[status:ready]', { cardOnly: "ready" })).toBe(false);
  });
  it("supports quoted literal keys/values and escaped quotes without inventing offsets", () => {
    expect(matches('["project name":"In progress"]', { "project name": "In progress" })).toBe(true);
    expect(matches('["project name":"In progress"]', { "project name": "Still In progress today" })).toBe(false);
    expect(matches('[quote:"Say \\"hello\\""]', { quote: 'Say "hello"' })).toBe(true);
    expect(matches('["STATUS":Done]', { status: "Done" }, true)).toBe(true);
  });
  it("honors native case fields for property literals while tags stay case insensitive", () => {
    expect(matches('[status:done]', { Status: "Done" })).toBe(true);
    expect(matches('[status:done]', { Status: "Done" }, true)).toBe(false);
    expect(matches('[Status:Done]', { Status: "Done" }, true)).toBe(true);
    expect(matches('tag:WORK', { tags: ["work/sub"] }, true)).toBe(true);
    expect(matches('tag:wanted', { TAGS: ["wanted"], tags: ["other"] })).toBe(false);
  });
  it.each(['ordinary text', 'tag:work OR [status:done]', 'tag:work AND [status:done]', 'NOT [status]', '-[status]', '[n:>3]', '[n:TRUE]', '[n:FALSE]', '[n:EMPTY]', 'tag:/work/', 'tag:"work"', '[status:/done/]', '[status] file:Board', '[status] content:word', '[status] path:Folder', '[status] "word"', '[status:two words]', '[status:', '()', '(tag:work', '[status])', '[status]\n[tag]', '[status] ) garbage'])
    ("explicitly rejects unsupported/native syntax: %s", query => {
      expect(parseCanvasPropertyQuery(query)).toMatchObject({ supported: false });
    });
  it("enforces query limits and skips invalid/over-budget JSON without getters or false positives", () => {
    expect(parseCanvasPropertyQuery("")).toMatchObject({ supported: false, reason: "empty-query" });
    expect(parseCanvasPropertyQuery("[a]".repeat(2000))).toMatchObject({ supported: false, reason: "query-limit" });
    expect(parseCanvasPropertyQuery("[a] ".repeat(65))).toMatchObject({ supported: false, reason: "query-limit" });
    expect(parseCanvasPropertyQuery("(".repeat(30) + "[a]" + ")".repeat(30))).toMatchObject({ supported: false, reason: "query-limit" });
    const plan = parseCanvasPropertyQuery("[a]");
    if (!plan.supported) throw new Error(plan.reason);
    const getter = vi.fn(() => "yes");
    const properties = {};
    Object.defineProperty(properties, "a", { get: getter, enumerable: true });
    expect(plan.match(properties)).toMatchObject({ ok: false, matches: false });
    expect(getter).not.toHaveBeenCalled();
    const cyclic: Record<string, unknown> = { a: "yes" };
    cyclic.cycle = cyclic;
    for (const invalid of [cyclic, { a: NaN }, { a: new Date() }, { a: () => 1 }, { a: Array(2) }, { a: "x".repeat(131073) }]) expect(plan.match(invalid)).toMatchObject({ ok: false, matches: false });
  });
});

type Callback = (...args: any[]) => void;
function emitter() {
  const callbacks = new Map<string, Set<Callback>>();
  return {
    on(name: string, callback: Callback) { const set = callbacks.get(name) ?? new Set(); set.add(callback); callbacks.set(name, set); return { name, callback }; },
    offref(ref: { name: string; callback: Callback }) { callbacks.get(ref.name)?.delete(ref.callback); },
    trigger(name: string, ...args: unknown[]) { for (const callback of callbacks.get(name) ?? []) callback(...args); },
    count() { return [...callbacks.values()].reduce((count, set) => count + set.size, 0); },
  };
}
class FakeElement {
  readonly nodeType = 1;
  children: FakeElement[] = [];
  parentElement: FakeElement | null = null;
  textContent = "";
  className = "";
  value = "";
  tabIndex = -1;
  attributes = new Map<string, string>();
  listeners = new Map<string, Set<Callback>>();
  constructor(readonly ownerDocument: FakeDocument, readonly tag: string) {}
  appendChild(child: FakeElement) { return this.insertBefore(child, null); }
  insertBefore(child: FakeElement, reference: FakeElement | null) {
    if (reference !== null && reference.parentElement !== this) throw new Error("NotFoundError");
    if (child === reference) return child;
    for (let ancestor: FakeElement | null = this; ancestor !== null; ancestor = ancestor.parentElement) {
      if (ancestor === child) throw new Error("HierarchyRequestError");
    }
    child.remove();
    const position = reference === null ? this.children.length : this.children.indexOf(reference);
    child.parentElement = this;
    this.children.splice(position, 0, child);
    return child;
  }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this); this.parentElement = null; }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  addEventListener(name: string, callback: Callback) { const set = this.listeners.get(name) ?? new Set(); set.add(callback); this.listeners.set(name, set); }
  removeEventListener(name: string, callback: Callback) { this.listeners.get(name)?.delete(callback); }
  emit(name: string, fields: Record<string, unknown> = {}) { const event = { button: 0, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...fields }; for (const callback of this.listeners.get(name) ?? []) callback(event); }
  get text(): string { return this.textContent + this.children.map(child => child.text).join(""); }
  get listenerCount(): number { return [...this.listeners.values()].reduce((total, set) => total + set.size, 0); }
}
class FakeObserver {
  static instances: FakeObserver[] = [];
  disconnected = false;
  constructor(readonly callback: () => void) { FakeObserver.instances.push(this); }
  observe(_target: FakeElement) {}
  disconnect() { this.disconnected = true; }
  emit() { if (!this.disconnected) this.callback(); }
}
class FakeDocument {
  defaultView = { setTimeout, clearTimeout, MutationObserver: FakeObserver };
  createElement(tag: string) { return new FakeElement(this, tag); }
}

function fixture(options: { maxRows?: number; batchSize?: number; maxFiles?: number } = {}) {
  const document = new FakeDocument();
  const container = document.createElement("div");
  const native = container.appendChild(document.createElement("div"));
  native.className = "search-result-container mod-global-search";
  const counter = container.appendChild(document.createElement("span"));
  const input = document.createElement("input");
  const files = ["A.canvas", "B.canvas", "C.canvas", "Note.md"].map(path => ({ path, extension: path.endsWith("canvas") ? "canvas" : "md" } as TFile));
  const knowledge = new Map<string, any>([
    ["A.canvas", { frontmatter: { tags: ["work/project"], status: "Done" }, tags: [{ tag: "#body-only" }] }],
    ["B.canvas", { frontmatter: { tags: ["other"], status: "Pending" } }],
    ["C.canvas", { frontmatter: { tags: ["work"], status: "Done" } }],
  ]);
  const workspaceEvents = emitter();
  const vaultEvents = emitter();
  const metadataEvents = emitter();
  const ignored = new Set<string>();
  const openFile = vi.fn(async (_file: TFile) => {});
  const leaves: any[] = [];
  const app = {
    workspace: { ...workspaceEvents, getLeavesOfType: vi.fn(() => leaves), getLeaf: vi.fn((_mod: unknown) => ({ openFile })) },
    vault: { ...vaultEvents, getFiles: vi.fn(() => files), getAbstractFileByPath: vi.fn((path: string) => files.find(file => file.path === path) ?? null), cachedRead: vi.fn(), read: vi.fn(), modify: vi.fn() },
    metadataCache: { ...metadataEvents, isUserIgnored: vi.fn((path: string) => ignored.has(path)), isSupportedFile: vi.fn(() => true) },
  };
  const lookup = new Map<TFile, unknown>();
  const dom = { el: native, resultDomLookup: lookup, addResult: vi.fn(), removeResult: vi.fn() };
  const sentinel = { native: "return" };
  const originalStop = vi.fn(function () { counter.textContent = "native-only-count"; });
  const originalInfo = vi.fn(() => sentinel);
  const originalStart = vi.fn(function (this: any, ..._args: unknown[]) {
    this.stopSearch();
    if (this.searchComponent.inputEl.value === "native parse error") return sentinel;
    this.searchQuery = { query: this.searchComponent.inputEl.value, caseSensitive: this.matchingCase, matcher: {}, requiredInputs: {} };
    this.renderSearchInfo(this.searchQuery.matcher, this.searchInfoEl);
    return sentinel;
  });
  const originalUnload = vi.fn(() => sentinel);
  const view: any = { _loaded: true, app, containerEl: container, dom, searchInfoEl: document.createElement("div"), renderSearchInfo: originalInfo, searchComponent: { inputEl: input }, searchQuery: null, matchingCase: false, startSearch: originalStart, stopSearch: originalStop, onunload: originalUnload };
  leaves.push({ view });
  const index = { status: "ready" as "ready" | "stopped" | "disposed", getKnowledge: vi.fn((path: string) => knowledge.get(path)) };
  const diagnostic = vi.fn();
  const registerEvent = vi.fn();
  const registerCleanup = vi.fn();
  const bridge = new CanvasPropertyResults(app as unknown as Pick<App, "workspace" | "vault" | "metadataCache">, index, {
    labels: () => ({ title: "Board properties", loading: "Loading", empty: "No additional boards", limited: "Result limit", count: count => `${count} additional boards` }),
    onDiagnostic: diagnostic, registerEvent, registerCleanup, ...options,
  });
  const search = (query: string) => { input.value = query; return view.startSearch("native-arg"); };
  const rows = () => container.children.filter(child => child.className === "miro-canvas-property-results").flatMap(section => section.children.flatMap(list => list.children)).filter(child => child.attributes.has("data-canvas-property-path"));
  const section = () => container.children.find(child => child.className === "miro-canvas-property-results");
  return { bridge, app, view, dom, native, container, counter, input, files, knowledge, index, lookup, ignored, openFile, sentinel, originalStart, originalStop, originalUnload, diagnostic, registerEvent, registerCleanup, search, rows, section };
}

beforeEach(() => { vi.useFakeTimers(); FakeObserver.instances = []; });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe("owned board result section", () => {
  it("places one owned section before the untouched native results and restores sibling order", () => {
    const h = fixture();
    const header = new FakeElement(h.container.ownerDocument, "header");
    h.container.appendChild(header);
    h.container.insertBefore(header, h.native);
    expect(h.container.insertBefore(header, header)).toBe(header);
    const siblings = [...h.container.children];
    const foreign = new FakeElement(h.container.ownerDocument, "div");
    expect(() => h.container.insertBefore(header, foreign)).toThrow("NotFoundError");
    expect(h.container.children).toEqual(siblings);
    const nativeRow = h.native.appendChild(new FakeElement(h.container.ownerDocument, "div"));
    h.bridge.start();
    h.search("tag:work");
    vi.runAllTimers();
    expect(h.container.children).toEqual([header, h.section(), ...siblings.slice(1)]);
    expect(h.native.children).toEqual([nativeRow]);
    expect(h.native.parentElement).toBe(h.container);
    h.bridge.refresh();
    vi.runAllTimers();
    expect(h.container.children).toEqual([header, h.section(), ...siblings.slice(1)]);
    expect(h.native.children).toEqual([nativeRow]);
    h.view.stopSearch();
    expect(h.container.children).toEqual(siblings);
    h.search("tag:work");
    vi.runAllTimers();
    h.bridge.dispose();
    expect(h.container.children).toEqual(siblings);
    expect(h.native.children).toEqual([nativeRow]);
    const unsupported = fixture();
    Object.defineProperty(unsupported.container, "insertBefore", { value: undefined });
    unsupported.bridge.start();
    expect(unsupported.view.startSearch).toBe(unsupported.originalStart);
    unsupported.bridge.dispose();
  });
  it("handles the original search start captured by native input debounce before installation", () => {
    const h = fixture();
    const capturedStart = h.view.startSearch.bind(h.view);
    h.bridge.start();
    h.input.value = "tag:work";
    h.view.stopSearch();
    expect(capturedStart("typed-input")).toBe(h.sentinel);
    vi.runAllTimers();
    expect(h.rows().map(row => row.text)).toEqual(["A.canvas", "C.canvas"]);
    h.input.value = "native parse error";
    capturedStart();
    vi.runAllTimers();
    expect(h.section()).toBeUndefined();
    h.bridge.dispose();
  });
  it("starts only after successful root info rendering and restores its owned boundary", () => {
    const h = fixture();
    const childMatcher = {};
    const childInfo = new FakeElement(h.container.ownerDocument, "div");
    const render = vi.fn(function (this: any, matcher: unknown, _info: unknown) {
      if (matcher === this.searchQuery.matcher) {
        expect(this.renderSearchInfo(childMatcher, childInfo)).toBe(h.sentinel);
        expect(vi.getTimerCount()).toBe(0);
      }
      return h.sentinel;
    });
    h.view.renderSearchInfo = render;
    const descriptor = Object.getOwnPropertyDescriptor(h.view, "renderSearchInfo");
    const capturedStart = h.view.startSearch.bind(h.view);
    h.bridge.start();
    h.input.value = "tag:work";
    capturedStart();
    expect(vi.getTimerCount()).toBe(1);
    vi.runAllTimers();
    expect(h.rows()).toHaveLength(2);
    expect(render).toHaveBeenCalledTimes(2);
    h.view.stopSearch();
    render.mockImplementationOnce(() => { throw new Error("native info failure"); });
    expect(() => capturedStart()).toThrow("native info failure");
    expect(vi.getTimerCount()).toBe(0);
    expect(h.section()).toBeUndefined();
    h.bridge.dispose();
    expect(Object.getOwnPropertyDescriptor(h.view, "renderSearchInfo")).toEqual(descriptor);
  });
  it("refuses absent root-info boundaries and retains later foreign info wrappers", () => {
    const unsupported = fixture();
    delete unsupported.view.renderSearchInfo;
    unsupported.bridge.start();
    expect(unsupported.view.startSearch).toBe(unsupported.originalStart);
    unsupported.bridge.dispose();
    const h = fixture();
    h.bridge.start();
    const owned = h.view.renderSearchInfo;
    const foreign = vi.fn((...args: unknown[]) => owned.apply(h.view, args));
    h.view.renderSearchInfo = foreign;
    h.bridge.dispose();
    expect(h.view.renderSearchInfo).toBe(foreign);
    h.input.value = "tag:work";
    expect(h.originalStart.call(h.view)).toBe(h.sentinel);
    vi.runAllTimers();
    expect(h.section()).toBeUndefined();
  });
  it("renders genuine file rows from ready root properties, keeping native methods/rows/counts exact", () => {
    const h = fixture();
    const nativeRow = h.native.appendChild(new FakeElement(h.native.ownerDocument, "div"));
    nativeRow.textContent = "Native result";
    const prototype = Object.getPrototypeOf(h.view);
    h.bridge.start();
    expect(h.bridge.status).toBe("ready");
    expect(h.search('tag:work [status:done]')).toBe(h.sentinel);
    vi.runAllTimers();
    expect(h.originalStart).toHaveBeenCalledWith("native-arg");
    expect(h.rows().map(row => row.text)).toEqual(["A.canvas", "C.canvas"]);
    expect(h.section()?.attributes.get("role")).toBe("region");
    expect(h.section()?.text).toContain("2 additional boards");
    expect(h.native.children).toEqual([nativeRow]);
    expect(h.counter.textContent).toBe("native-only-count");
    expect(h.dom.addResult).not.toHaveBeenCalled();
    expect(h.dom.removeResult).not.toHaveBeenCalled();
    expect(h.view.searchQuery.requiredInputs).toEqual({});
    expect(Object.getPrototypeOf(h.view)).toBe(prototype);
    for (const reader of [h.app.vault.cachedRead, h.app.vault.read, h.app.vault.modify]) expect(reader).not.toHaveBeenCalled();
    h.bridge.dispose();
  });
  it("leaves plain and unsupported native queries alone and never uses aggregate body tags", () => {
    const h = fixture();
    h.bridge.start();
    h.search("ordinary text");
    vi.runAllTimers();
    expect(h.app.vault.getFiles).not.toHaveBeenCalled();
    expect(h.section()).toBeUndefined();
    h.search("tag:body-only");
    vi.runAllTimers();
    expect(h.rows()).toEqual([]);
    h.search("tag:work OR [status:done]");
    vi.runAllTimers();
    expect(h.section()).toBeUndefined();
    expect(h.originalStart).toHaveBeenCalledTimes(3);
    h.bridge.dispose();
  });
  it("opens actual board files with click, middle-click and Enter modifiers and no fake state", async () => {
    const h = fixture();
    h.bridge.start();
    h.search("[status:done]");
    vi.runAllTimers();
    const row = h.rows()[0];
    row.emit("click");
    row.emit("auxclick", { button: 1 });
    const stopPropagation = vi.fn();
    row.emit("keydown", { key: "Enter", ctrlKey: true, stopPropagation });
    await Promise.resolve();
    expect(h.app.workspace.getLeaf.mock.calls).toEqual([[false], ["tab"], ["tab"]]);
    expect(h.openFile.mock.calls).toEqual([[h.files[0]], [h.files[0]], [h.files[0]]]);
    expect(stopPropagation).toHaveBeenCalledOnce();
    h.files.splice(0, 1);
    row.emit("click");
    expect(h.openFile).toHaveBeenCalledTimes(3);
    expect(h.diagnostic).toHaveBeenCalledWith("canvas-property-result-stale", "A.canvas");
    h.bridge.dispose();
    expect(row.listenerCount).toBe(0);
  });
  it("deduplicates native board file rows and updates only owned rows on native mutations", () => {
    const h = fixture();
    h.lookup.set(h.files[0], { native: "row" });
    h.bridge.start();
    h.search("tag:work");
    vi.runAllTimers();
    expect(h.rows().map(row => row.text)).toEqual(["C.canvas"]);
    h.lookup.set(h.files[2], { native: "row" });
    FakeObserver.instances[0].emit();
    expect(h.rows()).toEqual([]);
    expect(h.section()?.text).toContain("No additional boards");
    h.lookup.delete(h.files[0]);
    FakeObserver.instances[0].emit();
    expect(h.rows().map(row => row.text)).toEqual(["A.canvas"]);
    expect(h.section()?.text).not.toContain("No additional boards");
    expect(h.lookup.size).toBe(1);
    h.bridge.dispose();
  });
  it("honors ignored files, supported-file filtering and missing index entries", () => {
    const h = fixture();
    h.ignored.add("C.canvas");
    h.knowledge.delete("B.canvas");
    h.bridge.start();
    h.search("[status]");
    vi.runAllTimers();
    expect(h.rows().map(row => row.text)).toEqual(["A.canvas"]);
    expect(h.index.getKnowledge).not.toHaveBeenCalledWith("C.canvas");
    expect(h.index.getKnowledge).not.toHaveBeenCalledWith("Note.md");
    h.app.metadataCache.isSupportedFile.mockReturnValue(false);
    h.bridge.refresh();
    vi.runAllTimers();
    expect(h.rows()).toEqual([]);
    h.bridge.dispose();
  });
  it("fails closed before installation and mid-scan when the index is not ready", () => {
    const h = fixture();
    h.index.status = "stopped";
    h.bridge.start();
    expect(h.bridge.status).toBe("unsupported");
    expect(h.view.startSearch).toBe(h.originalStart);
    expect(h.registerEvent).not.toHaveBeenCalled();
    const active = fixture({ batchSize: 1 });
    active.bridge.start();
    active.search("tag:work");
    vi.advanceTimersToNextTimer();
    active.index.status = "disposed";
    vi.runAllTimers();
    expect(active.section()).toBeUndefined();
    active.bridge.dispose();
  });
  it("cancels stale batches after query/input/case changes and native stop", () => {
    const h = fixture({ batchSize: 1 });
    h.bridge.start();
    h.search("[status:done]");
    vi.advanceTimersToNextTimer();
    h.input.value = "different query";
    vi.runAllTimers();
    expect(h.section()).toBeUndefined();
    h.search("[status:done]");
    vi.advanceTimersToNextTimer();
    h.view.searchQuery.caseSensitive = true;
    vi.runAllTimers();
    expect(h.section()).toBeUndefined();
    h.view.matchingCase = true;
    h.search("[status:done]");
    vi.runAllTimers();
    expect(h.rows()).toEqual([]);
    h.view.stopSearch();
    expect(h.section()).toBeUndefined();
    h.bridge.dispose();
  });
  it("does not reuse an old native query after a caught native parse error", () => {
    const h = fixture();
    h.bridge.start();
    h.search("tag:work");
    vi.runAllTimers();
    h.search("native parse error");
    vi.runAllTimers();
    expect(h.section()).toBeUndefined();
    h.bridge.dispose();
  });
  it("refreshes only the supplement on metadata/rename/delete events and parent index callbacks", () => {
    const h = fixture();
    h.bridge.start();
    h.search("tag:work");
    vi.runAllTimers();
    h.knowledge.get("A.canvas").frontmatter.tags = ["other"];
    h.app.metadataCache.trigger("resolve", h.files[0]);
    vi.runAllTimers();
    expect(h.rows().map(row => row.text)).toEqual(["C.canvas"]);
    h.files[2].path = "Renamed.canvas";
    h.knowledge.set("Renamed.canvas", h.knowledge.get("C.canvas"));
    h.app.vault.trigger("rename", h.files[2], "C.canvas");
    vi.runAllTimers();
    expect(h.rows().map(row => row.text)).toEqual(["Renamed.canvas"]);
    h.files.splice(2, 1);
    h.app.vault.trigger("delete");
    vi.runAllTimers();
    expect(h.rows()).toEqual([]);
    expect(h.originalStart).toHaveBeenCalledOnce();
    h.bridge.refresh();
    vi.runAllTimers();
    expect(h.originalStart).toHaveBeenCalledOnce();
    h.bridge.dispose();
  });
  it("discloses result/file budgets and bounds scans in cancellable batches", () => {
    const h = fixture({ maxRows: 1, batchSize: 1 });
    h.bridge.start();
    h.search("tag:work");
    vi.runAllTimers();
    expect(h.rows()).toHaveLength(1);
    expect(h.section()?.text).toContain("Result limit");
    h.bridge.dispose();
    const bounded = fixture({ maxFiles: 1 });
    bounded.bridge.start();
    bounded.search("tag:work");
    vi.runAllTimers();
    expect(bounded.index.getKnowledge).toHaveBeenCalledOnce();
    expect(bounded.section()?.text).toContain("Result limit");
    bounded.bridge.dispose();
  });
  it("restores descriptors/events and preserves later foreign wrappers on unload/dispose", () => {
    const h = fixture();
    const descriptor = Object.getOwnPropertyDescriptor(h.view, "startSearch");
    h.bridge.start();
    expect(h.registerCleanup).toHaveBeenCalledOnce();
    h.search("tag:work");
    vi.runAllTimers();
    const ownedStart = h.view.startSearch;
    const foreign = vi.fn((...args: unknown[]) => ownedStart.apply(h.view, args));
    h.view.startSearch = foreign;
    h.view.onunload();
    expect(h.view.startSearch).toBe(foreign);
    expect(h.view.stopSearch).toBe(h.originalStop);
    expect(h.view.onunload).toBe(h.originalUnload);
    expect(h.originalUnload).toHaveBeenCalledOnce();
    expect(h.section()).toBeUndefined();
    h.bridge.dispose();
    expect(h.app.workspace.count() + h.app.vault.count() + h.app.metadataCache.count()).toBe(0);
    expect(FakeObserver.instances.every(observer => observer.disconnected)).toBe(true);
    const clean = fixture();
    const original = Object.getOwnPropertyDescriptor(clean.view, "startSearch");
    clean.bridge.start();
    clean.bridge.dispose();
    expect(Object.getOwnPropertyDescriptor(clean.view, "startSearch")).toEqual(original);
    expect(descriptor?.enumerable).toBe(true);
  });
  it("preserves native throws and delegates borrowed receivers without creating supplement rows", () => {
    const h = fixture();
    h.bridge.start();
    const other = { stopSearch: vi.fn(), renderSearchInfo: vi.fn(), searchComponent: { inputEl: { value: "tag:work" } }, matchingCase: false, searchQuery: null };
    expect(h.view.startSearch.call(other, "borrowed")).toBe(h.sentinel);
    vi.runAllTimers();
    expect(h.section()).toBeUndefined();
    h.originalStart.mockImplementationOnce(() => { throw new Error("native failure"); });
    expect(() => h.search("tag:work")).toThrow("native failure");
    h.bridge.dispose();
  });
  it("refuses unknown pane shapes and handles independently discovered panes", () => {
    const h = fixture();
    h.native.parentElement = null;
    h.bridge.start();
    expect(h.view.startSearch).toBe(h.originalStart);
    expect(h.diagnostic).toHaveBeenCalledWith("canvas-property-results-pane-unsupported", undefined);
    h.native.parentElement = h.container;
    h.bridge.refresh();
    h.search("tag:work");
    vi.runAllTimers();
    expect(h.rows()).toHaveLength(2);
    h.bridge.dispose();
  });
  it("keeps multiple panes independent and detaches a closed pane without resetting native search", () => {
    const h = fixture();
    const document = new FakeDocument();
    const container = document.createElement("div");
    const native = container.appendChild(document.createElement("div"));
    const input = document.createElement("input");
    const second = { ...h.view, containerEl: container, dom: { el: native, resultDomLookup: new Map() }, searchComponent: { inputEl: input }, searchQuery: null };
    const leaves = h.app.workspace.getLeavesOfType();
    leaves.push({ view: second });
    h.bridge.start();
    h.search("tag:work");
    input.value = "tag:other";
    second.startSearch();
    vi.runAllTimers();
    expect(h.rows().map(row => row.text)).toEqual(["A.canvas", "C.canvas"]);
    expect(container.text).toContain("B.canvas");
    expect(container.text).not.toContain("A.canvas");
    leaves.splice(1, 1);
    h.app.workspace.trigger("layout-change");
    vi.runAllTimers();
    expect(container.children).toEqual([native]);
    expect(second.startSearch).toBe(h.originalStart);
    expect(h.rows()).toHaveLength(2);
    expect(h.originalStart).toHaveBeenCalledTimes(2);
    h.bridge.dispose();
  });
  it("reprobes a replaced native pane root and releases old row listeners/observer", () => {
    const h = fixture();
    h.bridge.start();
    h.search("tag:work");
    vi.runAllTimers();
    const oldRow = h.rows()[0];
    const document = new FakeDocument();
    const container = document.createElement("div");
    const native = container.appendChild(document.createElement("div"));
    h.view.containerEl = container;
    h.view.dom = { el: native, resultDomLookup: new Map() };
    h.bridge.refresh();
    vi.runAllTimers();
    expect(h.section()).toBeUndefined();
    expect(oldRow.listenerCount).toBe(0);
    expect(FakeObserver.instances[0].disconnected).toBe(true);
    expect(container.text).toContain("A.canvas");
    expect(h.originalStart).toHaveBeenCalledOnce();
    h.bridge.dispose();
  });
  it("contains provider/open failures in the supplement without changing the native return", async () => {
    const h = fixture();
    h.bridge.start();
    h.index.getKnowledge.mockImplementationOnce(() => { throw new Error("index failure"); });
    expect(h.search("tag:work")).toBe(h.sentinel);
    vi.runAllTimers();
    expect(h.section()).toBeUndefined();
    expect(h.counter.textContent).toBe("native-only-count");
    h.search("tag:work");
    vi.runAllTimers();
    h.openFile.mockRejectedValueOnce(new Error("open failure"));
    h.rows()[0].emit("click");
    await Promise.resolve();
    expect(h.diagnostic).toHaveBeenCalledWith("canvas-property-result-open-failed", "A.canvas");
    h.bridge.dispose();
  });
  it("does not revive a retired pane through a retained foreign startSearch chain", () => {
    const h = fixture();
    h.bridge.start();
    const retired = h.view.startSearch;
    const foreign = vi.fn(function (this: any, ...args: unknown[]) { return retired.apply(this, args); });
    h.view.startSearch = foreign;
    const container = h.native.ownerDocument.createElement("div");
    container.appendChild(h.native);
    h.view.containerEl = container;
    h.bridge.refresh();
    h.search("tag:work");
    vi.runAllTimers();
    expect(h.section()).toBeUndefined();
    expect(container.text).toContain("A.canvas");
    expect(container.children.filter(child => child.className === "miro-canvas-property-results")).toHaveLength(1);
    expect(h.app.vault.getFiles).toHaveBeenCalledOnce();
    h.bridge.dispose();
    expect(h.view.startSearch).toBe(foreign);
  });
  it("does not leave pending work when disposal occurs during an index callback", () => {
    const h = fixture({ batchSize: 1 });
    h.bridge.start();
    const knowledge = h.knowledge.get("A.canvas");
    h.index.getKnowledge.mockImplementationOnce(() => { h.bridge.dispose(); return knowledge; });
    h.search("tag:work");
    vi.advanceTimersToNextTimer();
    expect(h.section()).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
    expect(h.view.startSearch).toBe(h.originalStart);
  });
});
