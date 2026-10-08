/** Correct Canvas counts and render property mentions in the native backlink pane. */
import { Keymap, type App, type EventRef, type TFile } from "obsidian";
import type { ObsidianBoardIndex } from "./obsidian-board-index";
import type { BoardKnowledge } from "./board-knowledge";
import { createHtmlElement } from "./dom-elements";

type PrivateObject = Record<string, unknown>;
type Method = (this: PrivateObject, ...args: unknown[]) => unknown;
const STANDARD_MATCH_KEYS = ["filename", "filepath", "content", "propertyName", "tag"];

export interface CanvasBacklinkProperty {
  readonly key: string;
  readonly original: string;
  readonly link: string;
  readonly count: number;
}

export interface CanvasBacklinksOptions {
  registerEvent?: (event: EventRef) => void;
  registerCleanup?: (cleanup: () => void) => void;
  /** Optional parent property-panel navigation; default opens the genuine board. */
  onOpenProperty?: (file: TFile, property: CanvasBacklinkProperty, event: MouseEvent | KeyboardEvent) => void | Promise<void>;
  onDiagnostic?: (code: string, path?: string) => void;
  /** Bounds may only decrease: 256 results and 128 property rows per result. */
  maxResults?: number;
  maxPropertiesPerResult?: number;
  /** Candidate paths/reference inspections are bounded, without file reads. */
  maxCandidatePaths?: number;
  maxReferencesPerResult?: number;
}

interface Hook { target: PrivateObject; name: string; wrapper: Method; before?: PropertyDescriptor }
interface PropertyRow {
  el: HTMLElement;
  property: CanvasBacklinkProperty;
  info: PrivateObject;
  dispose(): void;
}
interface ResultState {
  result: PrivateObject;
  file: TFile;
  mentions: CanvasBacklinkProperty[];
  rows: Set<PropertyRow>;
  hook?: Hook;
  knowledge: BoardKnowledge;
  targetPath: string;
}
interface SourceGroup { file: TFile; el: HTMLElement; rows: PropertyRow[]; count: number }
interface Supplement {
  el: HTMLElement;
  groups: Map<string, SourceGroup>;
  empty: HTMLElement;
  emptyBefore?: boolean;
  targetPath: string;
}
interface Pane {
  component: PrivateObject;
  dom: PrivateObject;
  count: HTMLElement;
  hooks: Hook[];
  results: Map<PrivateObject, ResultState>;
  active: boolean;
  countBefore?: string | null;
  countInstalled?: string;
  countTarget?: unknown;
  originalCount: Method;
  supplement?: Supplement;
}

function object(value: unknown): value is PrivateObject { return value !== null && typeof value === "object"; }
function element(value: unknown): value is HTMLElement {
  return object(value) && value.nodeType === 1 && object(value.ownerDocument)
    && typeof value.addEventListener === "function" && typeof value.remove === "function";
}
function file(value: unknown): value is TFile {
  return object(value) && typeof value.path === "string" && typeof value.extension === "string";
}
function mutableMethod(target: PrivateObject, name: string): boolean {
  if (typeof target[name] !== "function") return false;
  const descriptor = Object.getOwnPropertyDescriptor(target, name);
  return descriptor ? descriptor.configurable === true && "value" in descriptor : Object.isExtensible(target);
}
function children(value: unknown): unknown[] | undefined {
  return object(value) && object(value.vChildren) && Array.isArray(value.vChildren.children) ? value.vChildren.children : undefined;
}
function matchKey(value: unknown): string | undefined {
  if (!object(value) || typeof value.key !== "string") return undefined;
  return value.key + (Array.isArray(value.subkey) ? value.subkey.map(part => `.${String(part)}`).join("") : "");
}
function represented(properties: unknown, mention: CanvasBacklinkProperty): boolean {
  return Array.isArray(properties) && properties.some(match => matchKey(match) === mention.key);
}
function bound(value: number | undefined, maximum: number): number {
  return value !== undefined && Number.isFinite(value) && value >= 1 ? Math.min(Math.floor(value), maximum) : maximum;
}

/** Data counts only: never synthesize a range to make native QI count a property. */
export function canvasBacklinkResultCount(result: unknown): number | undefined {
  if (!object(result) || Array.isArray(result)) return undefined;
  let count = 0;
  for (const key of [...STANDARD_MATCH_KEYS, "properties"]) {
    const matches = result[key];
    if (matches !== undefined && !Array.isArray(matches)) return undefined;
    if (Array.isArray(matches)) count += matches.length;
  }
  for (const [key, value] of Object.entries(result)) {
    if (!key.startsWith("canvas-")) continue;
    if (!Array.isArray(value) || !value.every(range => Array.isArray(range) && range.length === 2
      && Number.isFinite(range[0]) && Number.isFinite(range[1]) && range[0] >= 0 && range[1] >= range[0])) return undefined;
    count += value.length;
  }
  return count;
}

/** One instance per plugin; attach after the board index, without opening a pane. */
export class CanvasBacklinks {
  private state: "stopped" | "ready" | "unsupported" | "disposed" = "stopped";
  private readonly panes = new Map<PrivateObject, Pane>();
  private readonly removers: (() => void)[] = [];
  private readonly maxResults: number;
  private readonly maxProperties: number;
  private readonly maxCandidates: number;
  private readonly maxReferences: number;
  private refreshQueued = false;

  constructor(private readonly app: Pick<App, "workspace" | "metadataCache"> & Partial<Pick<App, "vault">>,
    private readonly index: Pick<ObsidianBoardIndex, "status" | "getKnowledge">,
    private readonly options: CanvasBacklinksOptions = {}) {
    this.maxResults = bound(options.maxResults, 256);
    this.maxProperties = bound(options.maxPropertiesPerResult, 128);
    this.maxCandidates = bound(options.maxCandidatePaths, 8192);
    this.maxReferences = bound(options.maxReferencesPerResult, 4096);
  }
  get status(): "stopped" | "ready" | "unsupported" | "disposed" { return this.state; }

  start(): void {
    if (this.state !== "stopped") return;
    if (this.index.status !== "ready" || typeof this.app.workspace.getLeavesOfType !== "function"
      || typeof this.app.workspace.on !== "function" || typeof this.app.workspace.offref !== "function"
      || typeof this.app.metadataCache.getFirstLinkpathDest !== "function") {
      this.state = "unsupported";
      this.diagnose("canvas-backlinks-host-unsupported");
      return;
    }
    this.state = "ready";
    try {
      const event = this.app.workspace.on("layout-change", () => this.refresh());
      this.removers.push(() => this.app.workspace.offref(event));
      this.options.registerEvent?.(event);
      if (typeof this.app.metadataCache.on === "function" && typeof this.app.metadataCache.offref === "function") {
        const resolved = this.app.metadataCache.on("resolve", () => this.scheduleRefresh());
        this.removers.push(() => this.app.metadataCache.offref(resolved));
        this.options.registerEvent?.(resolved);
      }
      if (this.app.vault && typeof this.app.vault.on === "function" && typeof this.app.vault.offref === "function") {
        const events = [this.app.vault.on("create", () => this.scheduleRefresh()),
          this.app.vault.on("rename", () => this.scheduleRefresh()), this.app.vault.on("delete", () => this.scheduleRefresh())];
        for (const changed of events) {
          this.removers.push(() => this.app.vault?.offref(changed));
          this.options.registerEvent?.(changed);
        }
      }
      this.options.registerCleanup?.(() => this.dispose());
      this.refresh();
    } catch { this.dispose(); this.diagnose("canvas-backlinks-install-failed"); }
  }

  refresh(): void {
    if (this.state !== "ready") return;
    if (this.index.status !== "ready") {
      for (const pane of [...this.panes.values()]) this.detach(pane);
      return;
    }
    const live = new Set<PrivateObject>();
    for (const leaf of this.app.workspace.getLeavesOfType("backlink")) {
      const view: unknown = leaf.view;
      if (!object(view) || !object(view.backlink) || view.backlink._loaded === false) continue;
      const component = view.backlink;
      live.add(component);
      const existing = this.panes.get(component);
      if (existing) { this.discover(existing); continue; }
      const pane = this.probe(component);
      if (!pane) { this.diagnose("canvas-backlinks-pane-unsupported"); continue; }
      this.panes.set(component, pane);
      try { this.install(pane); this.discover(pane); }
      catch { this.detach(pane); this.diagnose("canvas-backlinks-pane-install-failed"); }
    }
    for (const [component, pane] of this.panes) if (!live.has(component)) this.detach(pane);
  }

  dispose(): void {
    if (this.state === "disposed") return;
    this.state = "disposed";
    for (const remove of this.removers.splice(0)) remove();
    for (const pane of [...this.panes.values()]) this.detach(pane);
  }

  private diagnose(code: string, path?: string): void {
    try { this.options.onDiagnostic?.(code, path); } catch { /* Diagnostics do not own the view. */ }
  }
  private scheduleRefresh(): void {
    if (this.refreshQueued || this.state !== "ready") return;
    this.refreshQueued = true;
    queueMicrotask(() => {
      this.refreshQueued = false;
      if (this.state === "ready") this.refresh();
    });
  }
  private probe(component: PrivateObject): Pane | undefined {
    const dom = component.backlinkDom;
    if (!object(dom) || !element(component.backlinkCountEl) || !element(dom.el)
      || !object(dom.info) || typeof dom.info.computed !== "boolean" || !children(dom)
      || !object(dom.infinityScroll) || dom.infinityScroll.rootEl !== dom || typeof dom.changed !== "function"
      || !mutableMethod(component, "onunload")) return undefined;
    for (const name of ["getMatchCount", "addResult", "removeResult", "emptyResults"]) if (!mutableMethod(dom, name)) return undefined;
    return { component, dom, count: component.backlinkCountEl, hooks: [], results: new Map(), active: true,
      originalCount: dom.getMatchCount as Method };
  }
  private hook(target: PrivateObject, name: string, handler: (receiver: PrivateObject, original: Method, args: unknown[]) => unknown): Hook {
    const before = Object.getOwnPropertyDescriptor(target, name);
    const original = target[name] as Method;
    const wrapper: Method = function (...args) { return handler(this, original, args); };
    Object.defineProperty(target, name, { value: wrapper, configurable: true, writable: true });
    return { target, name, wrapper, before };
  }
  private unhook(hook: Hook): void {
    if (hook.target[hook.name] !== hook.wrapper) return;
    if (hook.before) Object.defineProperty(hook.target, hook.name, hook.before);
    else delete hook.target[hook.name];
  }
  private enabled(pane: Pane): boolean { return this.state === "ready" && pane.active && this.index.status === "ready"; }

  private install(pane: Pane): void {
    pane.hooks.push(this.hook(pane.dom, "getMatchCount", (receiver, original, args) => {
      const native = original.apply(receiver, args);
      if (receiver !== pane.dom || !this.enabled(pane) || typeof native !== "number" || !Number.isFinite(native)) return native;
      let expected = 0;
      let canvas = false;
      for (const child of children(pane.dom) ?? []) {
        if (!object(child)) return native;
        const count = canvasBacklinkResultCount(child.result);
        if (count === undefined) return native;
        expected += count;
        if (file(child.file) && child.file.extension === "canvas") canvas = true;
        const state = pane.results.get(child);
        if (state) expected += state.mentions.filter(mention => !represented((child.result as PrivateObject).properties, mention)).reduce((sum, mention) => sum + mention.count, 0);
      }
      const missing = this.supplementCount(pane);
      return (canvas ? Math.max(native, expected) : native) + missing;
    }));
    pane.hooks.push(this.hook(pane.dom, "addResult", (receiver, original, args) => {
      const result = original.apply(receiver, args);
      if (receiver === pane.dom && this.enabled(pane) && object(result)) this.attachResult(pane, result);
      if (receiver === pane.dom) this.scheduleRefresh();
      return result;
    }));
    for (const name of ["emptyResults", "removeResult"]) {
      pane.hooks.push(this.hook(pane.dom, name, (receiver, original, args) => {
        if (receiver === pane.dom && pane.active) {
          for (const state of [...pane.results.values()]) if (name === "emptyResults" || state.file === args[0]) this.releaseResult(pane, state);
        }
        const result = original.apply(receiver, args);
        if (receiver === pane.dom && this.enabled(pane)) this.updateCount(pane);
        if (receiver === pane.dom) this.scheduleRefresh();
        return result;
      }));
    }
    pane.hooks.push(this.hook(pane.component, "onunload", (receiver, original, args) => {
      if (receiver === pane.component) this.detach(pane);
      return original.apply(receiver, args);
    }));
    for (const name of ["update", "updateSearch", "setBacklinkCollapsed", "setCollapseAll"]) {
      if (!mutableMethod(pane.component, name)) continue;
      pane.hooks.push(this.hook(pane.component, name, (receiver, original, args) => {
        if (receiver === pane.component && name === "updateSearch") this.clearSupplement(pane);
        const value = original.apply(receiver, args);
        if (receiver === pane.component) this.scheduleRefresh();
        return value;
      }));
    }
  }

  private discover(pane: Pane): void {
    for (const result of children(pane.dom) ?? []) if (object(result)) this.attachResult(pane, result);
    this.refreshSupplement(pane);
    this.updateCount(pane);
  }

  private attachResult(pane: Pane, result: PrivateObject): void {
    if (!this.enabled(pane) || !file(result.file) || result.file.extension !== "canvas") return;
    const previous = pane.results.get(result);
    const knowledge = this.index.getKnowledge(result.file.path);
    const target = pane.component.file;
    if (!knowledge || !file(target) || result.file.path === target.path || !this.nativeFilterAllows(pane, result)) {
      if (previous) this.releaseResult(pane, previous);
      return;
    }
    if (previous?.knowledge === knowledge && previous.targetPath === target.path) return;
    if (previous) this.releaseResult(pane, previous);
    if (pane.results.size >= this.maxResults) { this.diagnose("canvas-backlinks-result-limit", result.file.path); return; }
    if (!children(result) || !object(result.vChildren) || typeof result.vChildren.addChild !== "function"
      || typeof result.vChildren.setChildren !== "function" || !element(result.el) || !element(result.childrenEl)
      || !object(result.info) || typeof result.invalidate !== "function" || !mutableMethod(result, "renderContentMatches")) {
      this.diagnose("canvas-backlinks-result-unsupported", result.file.path); return;
    }
    const state: ResultState = { result, file: result.file, mentions: this.propertyMentions(knowledge, result.file, target),
      rows: new Set(), knowledge, targetPath: target.path };
    state.hook = this.hook(result, "renderContentMatches", (receiver, original, args) => {
      if (receiver === result && pane.active) this.clearRows(state);
      const value = original.apply(receiver, args);
      if (receiver === result && this.enabled(pane) && pane.results.get(result) === state) this.appendProperties(pane, state);
      return value;
    });
    pane.results.set(result, state);
    if (result.rendered === true) this.appendProperties(pane, state);
    this.updateCount(pane);
  }

  private propertyMentions(knowledge: BoardKnowledge, source: TFile, target: TFile): CanvasBacklinkProperty[] {
    const grouped = new Map<string, CanvasBacklinkProperty>();
    let limited = false;
    let inspected = 0;
    for (const ref of knowledge.frontmatterLinks) {
      if (++inspected > this.maxReferences) { this.diagnose("canvas-backlinks-reference-limit", source.path); break; }
      // Positioned card-frontmatter mentions remain the native card renderer's work.
      if ((ref as unknown as PrivateObject).nodeId !== undefined) continue;
      if (this.app.metadataCache.getFirstLinkpathDest(ref.link.split("#", 1)[0], source.path)?.path !== target.path) continue;
      const key = JSON.stringify([ref.key, ref.link, ref.original]);
      const prior = grouped.get(key);
      if (prior) grouped.set(key, { ...prior, count: prior.count + 1 });
      else if (grouped.size < this.maxProperties) grouped.set(key, { key: ref.key, original: ref.original, link: ref.link, count: 1 });
      else limited = true;
    }
    if (limited) this.diagnose("canvas-backlinks-property-limit", source.path);
    return [...grouped.values()];
  }

  private emptyFilter(pane: Pane): boolean {
    const search = pane.component.searchComponent;
    if (pane.component.searchQuery !== null || !object(search) || typeof search.getValue !== "function") return false;
    try { return (search.getValue as Method).call(search) === ""; } catch { return false; }
  }

  private nativeFilterAllows(pane: Pane, result: PrivateObject): boolean {
    if (this.emptyFilter(pane)) return true;
    if (!object(pane.component.searchQuery) || typeof pane.component.passSearchFilter !== "function" || typeof result.content !== "string") return false;
    try { return (pane.component.passSearchFilter as Method).call(pane.component, result.file, result.content) === true; }
    catch { return false; }
  }

  private nativePaths(pane: Pane): Set<string> {
    const paths = new Set<string>();
    for (const result of children(pane.dom) ?? []) if (object(result) && file(result.file)) paths.add(result.file.path);
    return paths;
  }

  private refreshSupplement(pane: Pane): void {
    this.clearSupplement(pane);
    const target = pane.component.file;
    const vault = this.app.vault;
    const resolved: unknown = this.app.metadataCache.resolvedLinks;
    const host = pane.dom.el;
    const empty = pane.dom.emptyStateEl;
    const header = pane.component.backlinkHeaderEl;
    if (!this.enabled(pane) || !this.emptyFilter(pane) || !file(target)
      || !vault || typeof vault.getAbstractFileByPath !== "function" || !object(resolved) || Array.isArray(resolved)
      || vault.getAbstractFileByPath(target.path) !== target || !element(host) || !element(host.parentElement)
      || typeof host.insertAdjacentElement !== "function" || !element(header) || header.parentElement !== host.parentElement
      || !element(empty) || typeof empty.hidden !== "boolean" || typeof pane.component.backlinkCollapsed !== "boolean"
      || typeof pane.component.collapseAll !== "boolean") return;
    const nativePaths = this.nativePaths(pane);
    const supplement: Supplement = { el: createHtmlElement(host.ownerDocument, "div"), groups: new Map(), empty, targetPath: target.path };
    supplement.el.className = "search-result-container";
    supplement.el.setAttribute("data-miro-canvas-property-backlinks", "true");
    supplement.el.hidden = pane.component.backlinkCollapsed;
    let inspected = 0;
    for (const path in resolved) {
      if (!Object.prototype.hasOwnProperty.call(resolved, path)) continue;
      if (++inspected > this.maxCandidates) { this.diagnose("canvas-backlinks-candidate-limit"); break; }
      const destinations = resolved[path];
      if (!path.endsWith(".canvas") || path === target.path || nativePaths.has(path) || !object(destinations)
        || !Object.prototype.hasOwnProperty.call(destinations, target.path)) continue;
      const frequency = destinations[target.path];
      if (typeof frequency !== "number" || frequency <= 0) continue;
      if (pane.results.size + supplement.groups.size >= this.maxResults) { this.diagnose("canvas-backlinks-result-limit", path); break; }
      const source = vault.getAbstractFileByPath(path);
      if (!file(source) || source.extension !== "canvas") continue;
      const knowledge = this.index.getKnowledge(path);
      if (!knowledge) continue;
      const mentions = this.propertyMentions(knowledge, source, target);
      if (!mentions.length) continue;
      const el = createHtmlElement(host.ownerDocument, "div");
      el.className = "tree-item search-result";
      const title = createHtmlElement(host.ownerDocument, "div");
      title.className = "search-result-file-title";
      title.textContent = source.path;
      el.appendChild(title);
      const content = createHtmlElement(host.ownerDocument, "div");
      content.className = "search-result-file-matches";
      content.hidden = pane.component.collapseAll;
      el.appendChild(content);
      const rows = mentions.map(mention => this.propertyRow(pane, source, host.ownerDocument, mention));
      for (const row of rows) content.appendChild(row.el);
      supplement.el.appendChild(el);
      supplement.groups.set(path, { file: source, el, rows, count: mentions.reduce((sum, mention) => sum + mention.count, 0) });
    }
    if (!supplement.groups.size) return;
    host.insertAdjacentElement("afterend", supplement.el);
    supplement.emptyBefore = empty.hidden;
    empty.hidden = true;
    pane.supplement = supplement;
  }

  private supplementCount(pane: Pane): number {
    const supplement = pane.supplement;
    const target = pane.component.file;
    if (!supplement || !this.emptyFilter(pane) || !file(target) || target.path !== supplement.targetPath) return 0;
    const native = this.nativePaths(pane);
    let count = 0;
    for (const [path, group] of supplement.groups) {
      if (!native.has(path) && this.app.vault?.getAbstractFileByPath(path) === group.file) count += group.count;
    }
    return count;
  }

  private clearSupplement(pane: Pane): void {
    const supplement = pane.supplement;
    if (!supplement) return;
    pane.supplement = undefined;
    for (const group of supplement.groups.values()) for (const row of group.rows) row.dispose();
    supplement.el.remove();
    if (supplement.emptyBefore !== undefined && supplement.empty.hidden === true) supplement.empty.hidden = supplement.emptyBefore;
  }

  private appendProperties(pane: Pane, state: ResultState): void {
    const group = state.result.vChildren as PrivateObject;
    for (const mention of state.mentions) {
      if ((children(state.result) ?? []).some(child => object(child) && represented(child.matches, mention))) continue;
      const row = this.propertyRow(pane, state.file, (state.result.el as HTMLElement).ownerDocument, mention);
      state.rows.add(row);
      (group.addChild as Method).call(group, row);
    }
    if (state.rows.size) (state.result.invalidate as Method).call(state.result);
    this.updateCount(pane);
  }
  private clearRows(state: ResultState): void {
    if (!state.rows.size) return;
    const group = state.result.vChildren as PrivateObject;
    (group.setChildren as Method).call(group, (children(state.result) ?? []).filter(child => !state.rows.has(child as PropertyRow)));
    for (const row of state.rows) row.dispose();
    state.rows.clear();
  }
  private releaseResult(pane: Pane, state: ResultState): void {
    this.clearRows(state);
    if (state.hook) this.unhook(state.hook);
    pane.results.delete(state.result);
  }

  private updateCount(pane: Pane): void {
    if (!this.enabled(pane)) return;
    const value = (pane.dom.getMatchCount as Method).call(pane.dom);
    if (typeof value !== "number" || !Number.isFinite(value)) return;
    if (pane.countInstalled === undefined || pane.countTarget !== pane.component.file) pane.countBefore = pane.count.textContent;
    pane.countTarget = pane.component.file;
    pane.countInstalled = String(value);
    pane.count.textContent = pane.countInstalled;
    (pane.dom.changed as Method).call(pane.dom);
  }
  private detach(pane: Pane): void {
    pane.active = false;
    this.clearSupplement(pane);
    for (const state of [...pane.results.values()]) this.releaseResult(pane, state);
    for (const hook of pane.hooks.reverse()) this.unhook(hook);
    if (pane.countTarget === pane.component.file && pane.countInstalled !== undefined && pane.count.textContent === pane.countInstalled) {
      const native = pane.originalCount.call(pane.dom);
      pane.count.textContent = typeof native === "number" ? String(native) : pane.countBefore ?? null;
    }
    this.panes.delete(pane.component);
    (pane.dom.changed as Method).call(pane.dom);
  }

  private propertyRow(pane: Pane, source: TFile, document: Document, property: CanvasBacklinkProperty): PropertyRow {
    const el = createHtmlElement(document, "div");
    el.className = "search-result-file-match tappable";
    el.setAttribute("role", "link");
    el.setAttribute("data-miro-canvas-property-key", property.key);
    el.tabIndex = 0;
    el.textContent = `${property.key}: ${property.original}`;
    const removers: (() => void)[] = [];
    const listen = (name: string, callback: EventListener): void => {
      el.addEventListener(name, callback);
      removers.push(() => el.removeEventListener(name, callback));
    };
    const open = (event: MouseEvent | KeyboardEvent): void => {
      event.preventDefault();
      try {
        const opened = this.options.onOpenProperty ? this.options.onOpenProperty(source, property, event)
          : this.app.workspace.getLeaf(Keymap.isModEvent(event)).openFile(source);
        if (opened) void Promise.resolve(opened).catch(() => this.diagnose("canvas-backlinks-open-failed", source.path));
      } catch { this.diagnose("canvas-backlinks-open-failed", source.path); }
    };
    listen("click", event => { if ((event as MouseEvent).button === 0) open(event as MouseEvent); });
    listen("auxclick", event => { if ((event as MouseEvent).button === 1) open(event as MouseEvent); });
    listen("keydown", event => { const key = event as KeyboardEvent; if (key.key === "Enter" || key.key === " ") open(key); });
    listen("mouseover", event => {
      if (event.defaultPrevented) return;
      const related = (event as MouseEvent).relatedTarget;
      if (related && object(related) && "nodeType" in related && el.contains(related as unknown as Node)) return;
      event.preventDefault();
      this.app.workspace.trigger("hover-link", { event, source: "search", hoverParent: pane.dom, targetEl: el, linktext: source.path });
    });
    return { el, property, info: { height: 0, width: 0, childLeft: 0, childLeftPadding: 0, childTop: 0,
      computed: false, queued: false, hidden: false, next: false },
      dispose() { for (const remove of removers.splice(0)) remove(); el.remove(); } };
  }
}
