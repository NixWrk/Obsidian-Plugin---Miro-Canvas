/** Separate board-property file results beside native search rows. No reader/index/matcher hooks. */
import { Keymap, type App, type EventRef, type TFile } from "obsidian";
import type { ObsidianBoardIndex } from "./obsidian-board-index";
import { createHtmlElement } from "./dom-elements";
import { hasAsciiControl } from "./control-characters";

type Data = Record<string, unknown>;
type Method = (this: Data, ...args: unknown[]) => unknown;
interface Literal { text: string; quoted: boolean }
type Predicate = { kind: "tag"; value: string } | { kind: "property"; key: Literal; value?: Literal };
export type CanvasPropertyQueryReason = "empty-query" | "unsupported-syntax" | "query-limit";
export type CanvasPropertyMatch = { readonly ok: true; readonly matches: boolean }
  | { readonly ok: false; readonly matches: false; readonly reason: "invalid-properties" | "property-limit" };
export type CanvasPropertyQuery =
  | { readonly supported: false; readonly reason: CanvasPropertyQueryReason }
  | { readonly supported: true; readonly query: string; readonly caseSensitive: boolean; match(properties: unknown): CanvasPropertyMatch };

const object = (value: unknown): value is Data => value !== null && typeof value === "object" && !Array.isArray(value);
const plain = (value: unknown): value is Data => object(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const MAX_QUERY = 4096;
const MAX_PREDICATES = 64;
const MAX_DEPTH = 24;
const MAX_VALUES = 8192;
const MAX_CHARACTERS = 131072;
class QueryError extends Error {
  constructor(readonly reason: CanvasPropertyQueryReason) { super(reason); }
}
class PropertyError extends Error {
  constructor(readonly reason: "invalid-properties" | "property-limit") { super(reason); }
}

/** Native whitespace-AND subset. OR/negation/content operators are intentionally unsupported. */
export function parseCanvasPropertyQuery(query: string, caseSensitive = false): CanvasPropertyQuery {
  try {
    if (typeof query !== "string" || query.length > MAX_QUERY) throw new QueryError("query-limit");
    if (!query.trim()) throw new QueryError("empty-query");
    if (hasAsciiControl(query)) throw new QueryError("unsupported-syntax");
    let position = 0;
    const predicates: Predicate[] = [];
    const skip = (): void => { while (query[position] === " ") position += 1; };
    const literal = (): Literal => {
      skip();
      let text = "";
      const quoted = query[position] === '"';
      if (quoted) {
        position += 1;
        let closed = false;
        while (position < query.length) {
          const char = query[position++];
          if (char === '"') { closed = true; break; }
          if (char === "\\") {
            if (position >= query.length) throw new QueryError("unsupported-syntax");
            text += query[position++];
          } else text += char;
        }
        if (!closed) throw new QueryError("unsupported-syntax");
      } else {
        if (query[position] === "-" || query[position] === "/") throw new QueryError("unsupported-syntax");
        while (position < query.length && !' []():"<>'.includes(query[position])) text += query[position++];
      }
      if (!text || (!quoted && ["OR", "TRUE", "FALSE", "EMPTY"].includes(text))) throw new QueryError("unsupported-syntax");
      return { text, quoted };
    };
    const conjunction = (depth: number, grouped: boolean): void => {
      if (depth > MAX_DEPTH) throw new QueryError("query-limit");
      let count = 0;
      skip();
      while (position < query.length && query[position] !== ")") {
        if (query[position] === "(") {
          position += 1;
          conjunction(depth + 1, true);
        } else if (query[position] === "[") {
          position += 1;
          const key = literal();
          skip();
          let value: Literal | undefined;
          if (query[position] === ":") { position += 1; value = literal(); skip(); }
          if (query[position++] !== "]") throw new QueryError("unsupported-syntax");
          predicates.push({ kind: "property", key, ...(value === undefined ? {} : { value }) });
        } else {
          const operator = literal();
          if (operator.quoted || operator.text.toLowerCase() !== "tag" || query[position++] !== ":") throw new QueryError("unsupported-syntax");
          const value = literal();
          if (value.quoted || !/^#?[\p{L}\p{N}_/-]+$/u.test(value.text) || value.text === "#") throw new QueryError("unsupported-syntax");
          predicates.push({ kind: "tag", value: value.text.replace(/^#/u, "").toLowerCase() });
        }
        count += 1;
        if (predicates.length > MAX_PREDICATES) throw new QueryError("query-limit");
        skip();
      }
      if (count === 0 || (grouped && query[position++] !== ")")) throw new QueryError("unsupported-syntax");
    };
    conjunction(0, false);
    skip();
    if (position !== query.length || predicates.length === 0) throw new QueryError("unsupported-syntax");
    return { supported: true, query, caseSensitive, match: properties => matchProperties(properties, predicates, caseSensitive) };
  } catch (error) {
    return { supported: false, reason: error instanceof QueryError ? error.reason : "unsupported-syntax" };
  }
}

interface PropertyEntry { key: string; values: string[]; raw: unknown }
function matchProperties(input: unknown, predicates: readonly Predicate[], caseSensitive: boolean): CanvasPropertyMatch {
  try {
    if (!plain(input)) throw new PropertyError("invalid-properties");
    const visited = new Set<object>();
    let items = 0;
    let characters = 0;
    const values = (value: unknown, depth: number): string[] => {
      if (++items > MAX_VALUES || depth > MAX_DEPTH) throw new PropertyError("property-limit");
      if (value === null) return [];
      if (typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) {
        const text = String(value);
        characters += text.length;
        if (characters > MAX_CHARACTERS) throw new PropertyError("property-limit");
        return [text];
      }
      if (!Array.isArray(value) && !plain(value)) throw new PropertyError("invalid-properties");
      const container = value as object;
      if (visited.has(container)) throw new PropertyError("invalid-properties");
      visited.add(container);
      const leaves: string[] = [];
      const keys = Object.keys(container);
      if (Array.isArray(value) && (value.length > MAX_VALUES || keys.length !== value.length || keys.some((key) => !/^\d+$/u.test(key) || String(Number(key)) !== key))) throw new PropertyError("invalid-properties");
      if (Object.getOwnPropertySymbols(container).some((key) => Object.getOwnPropertyDescriptor(container, key)?.enumerable)) throw new PropertyError("invalid-properties");
      for (const key of keys) {
        const descriptor = Object.getOwnPropertyDescriptor(container, key);
        if (descriptor === undefined || !("value" in descriptor)) throw new PropertyError("invalid-properties");
        leaves.push(...values(descriptor.value, depth + 1));
      }
      visited.delete(container);
      return leaves;
    };
    const entries: PropertyEntry[] = [];
    const keys = Object.keys(input);
    if (keys.length > 256) throw new PropertyError("property-limit");
    if (Object.getOwnPropertySymbols(input).some((key) => Object.getOwnPropertyDescriptor(input, key)?.enumerable)) throw new PropertyError("invalid-properties");
    visited.add(input);
    for (const key of keys) {
      characters += key.length;
      if (characters > MAX_CHARACTERS) throw new PropertyError("property-limit");
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (descriptor === undefined || !("value" in descriptor)) throw new PropertyError("invalid-properties");
      entries.push({ key, values: values(descriptor.value, 1), raw: descriptor.value });
    }
    const fold = (text: string): string => caseSensitive ? text : text.toLowerCase();
    const matches = predicates.every((predicate) => {
      if (predicate.kind === "property") {
        return entries.some((entry) => {
          const keyMatches = predicate.key.quoted ? entry.key.toLowerCase() === predicate.key.text.toLowerCase() : fold(entry.key) === fold(predicate.key.text);
          if (!keyMatches) return false;
          const value = predicate.value;
          return value === undefined || entry.values.some((leaf) => value.quoted ? fold(leaf) === fold(value.text) : fold(leaf).includes(fold(value.text)));
        });
      }
      const tags = entries.find((entry) => entry.key === "tags") ?? entries.find((entry) => entry.key.toLowerCase() === "tags")
        ?? entries.find((entry) => entry.key === "tag") ?? entries.find((entry) => entry.key.toLowerCase() === "tag");
      if (!tags) return false;
      if (typeof tags.raw !== "string" && (!Array.isArray(tags.raw) || !tags.raw.every((tag: unknown) => typeof tag === "string"))) throw new PropertyError("invalid-properties");
      return tags.values.flatMap((value) => value.split(/[\s,]+/u)).some((value) => {
        const tag = value.replace(/^#/u, "").toLowerCase();
        return tag === predicate.value || tag.startsWith(`${predicate.value}/`);
      });
    });
    return { ok: true, matches };
  } catch (error) {
    return { ok: false, matches: false, reason: error instanceof PropertyError ? error.reason : "invalid-properties" };
  }
}

export interface CanvasPropertyResultsLabels {
  readonly title: string;
  readonly loading: string;
  readonly empty: string;
  readonly limited: string;
  readonly count: (count: number) => string;
}
export interface CanvasPropertyResultsOptions {
  readonly labels: () => CanvasPropertyResultsLabels;
  readonly registerEvent?: (event: EventRef) => void;
  readonly registerCleanup?: (cleanup: () => void) => void;
  readonly onDiagnostic?: (code: string, path?: string) => void;
  readonly maxFiles?: number;
  readonly maxRows?: number;
  readonly batchSize?: number;
  readonly debounceMs?: number;
}
interface Emitter { on(name: string, callback: (...args: unknown[]) => void): EventRef; offref(event: EventRef): void }
interface Row { element: HTMLElement; remove(): void }
interface Pane {
  view: Data;
  dom: Data;
  native: HTMLElement;
  container: HTMLElement;
  owner: Window;
  descriptors: Map<string, PropertyDescriptor | undefined>;
  wrappers: Map<string, Method>;
  generation: number;
  timer?: number;
  observer?: MutationObserver;
  section?: HTMLElement;
  list?: HTMLElement;
  message?: HTMLElement;
  count?: HTMLElement;
  completed: boolean;
  limited: boolean;
  files: Map<string, TFile>;
  rows: Map<string, Row>;
}
function data(target: Data, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  if (descriptor === undefined) return undefined;
  if (!("value" in descriptor)) throw new Error("Unverified native accessor");
  return descriptor.value;
}
function method(target: Data, key: string): Method | undefined {
  let current: Data | null = target;
  const visited = new Set<object>();
  for (let depth = 0; current !== null && depth < 16; depth += 1) {
    if (current === Object.prototype || visited.has(current)) return undefined;
    visited.add(current);
    const descriptor = Object.getOwnPropertyDescriptor(current, key);
    if (descriptor !== undefined) return "value" in descriptor && typeof descriptor.value === "function" ? descriptor.value as Method : undefined;
    const prototype: unknown = Object.getPrototypeOf(current);
    current = object(prototype) ? prototype : null;
  }
  return undefined;
}
function element(value: unknown): value is HTMLElement {
  return object(value) && value.nodeType === 1 && object(value.ownerDocument) && typeof value.appendChild === "function" && typeof value.remove === "function";
}
function file(value: unknown): value is TFile {
  return object(value) && typeof value.path === "string" && value.extension === "canvas";
}
function bound(value: number | undefined, maximum: number): number {
  return value !== undefined && Number.isFinite(value) && value >= 1 ? Math.min(maximum, Math.floor(value)) : maximum;
}

/** Instance wrappers own only the supplemental section. Native query/rows/readers remain untouched. */
export class CanvasPropertyResults {
  private state: "stopped" | "ready" | "unsupported" | "disposed" = "stopped";
  private readonly panes = new Map<Data, Pane>();
  private readonly removers: (() => void)[] = [];
  private readonly maxFiles: number;
  private readonly maxRows: number;
  private readonly batchSize: number;
  private readonly debounceMs: number;
  constructor(
    private readonly app: Pick<App, "workspace" | "vault" | "metadataCache">,
    private readonly index: Pick<ObsidianBoardIndex, "status" | "getKnowledge">,
    private readonly options: CanvasPropertyResultsOptions,
  ) {
    this.maxFiles = bound(options.maxFiles, 100000);
    this.maxRows = bound(options.maxRows, 512);
    this.batchSize = bound(options.batchSize, 64);
    this.debounceMs = options.debounceMs !== undefined && Number.isFinite(options.debounceMs) ? Math.max(0, Math.min(500, options.debounceMs)) : 100;
  }
  get status(): "stopped" | "ready" | "unsupported" | "disposed" { return this.state; }
  start(): void {
    if (this.state !== "stopped") return;
    const cache = this.app.metadataCache as unknown as Data;
    if (this.index.status !== "ready" || typeof this.options.labels !== "function" || typeof this.app.vault.getFiles !== "function"
      || typeof this.app.vault.getAbstractFileByPath !== "function" || typeof this.app.workspace.getLeavesOfType !== "function"
      || typeof this.app.workspace.getLeaf !== "function" || !method(cache, "isUserIgnored") || !method(cache, "isSupportedFile")) {
      this.state = "unsupported";
      this.diagnose("canvas-property-results-host-unready");
      return;
    }
    this.state = "ready";
    try {
      const listen = (source: Emitter, name: string, callback: (...args: unknown[]) => void): void => {
        const event = source.on(name, callback);
        this.removers.push(() => source.offref(event));
        this.options.registerEvent?.(event);
      };
      listen(this.app.workspace, "layout-change", () => this.refresh());
      for (const name of ["changed", "resolve", "resolved"]) listen(this.app.metadataCache, name, () => this.refreshResults());
      for (const name of ["create", "modify", "rename", "delete"]) listen(this.app.vault, name, () => this.refreshResults());
      this.options.registerCleanup?.(() => this.dispose());
      this.refresh();
    } catch {
      this.dispose();
      this.state = "unsupported";
      this.diagnose("canvas-property-results-install-failed");
    }
  }
  /** Discover panes and refresh indexed results; parent may call after onIndexed. */
  refresh(): void {
    if (this.state !== "ready") return;
    const live = new Set<Data>();
    try {
      for (const leaf of this.app.workspace.getLeavesOfType("search")) {
        const view: unknown = leaf.view;
        if (!object(view) || data(view, "_loaded") === false) continue;
        live.add(view);
        const known = this.panes.get(view);
        if (known) {
          if (data(view, "dom") === known.dom && data(view, "containerEl") === known.container
            && data(known.dom, "el") === known.native && known.native.parentElement === known.container) continue;
          this.detach(known);
        }
        const pane = this.probe(view);
        if (!pane) { this.diagnose("canvas-property-results-pane-unsupported"); continue; }
        this.attach(pane);
      }
      for (const [view, pane] of this.panes) if (!live.has(view)) this.detach(pane);
      this.refreshResults();
    } catch { this.diagnose("canvas-property-results-discovery-failed"); }
  }
  dispose(): void {
    if (this.state === "disposed") return;
    this.state = "disposed";
    for (const remove of this.removers.splice(0)) { try { remove(); } catch { /* Native event teardown is independent. */ } }
    for (const pane of [...this.panes.values()]) this.detach(pane);
  }
  private diagnose(code: string, path?: string): void {
    try { this.options.onDiagnostic?.(code, path); } catch { /* Diagnostics cannot change native search. */ }
  }
  private probe(view: Data): Pane | undefined {
    if (data(view, "app") !== this.app || data(view, "_loaded") !== true) return undefined;
    const dom = data(view, "dom");
    const container = data(view, "containerEl");
    const component = data(view, "searchComponent");
    if (!object(dom) || !element(container) || typeof container.insertBefore !== "function" || !element(data(view, "searchInfoEl")) || !object(component) || !element(data(component, "inputEl"))) return undefined;
    const native = data(dom, "el");
    const lookup = data(dom, "resultDomLookup");
    const owner = container.ownerDocument.defaultView;
    if (!element(native) || native.parentElement !== container || !object(lookup) || !method(lookup, "has")
      || !owner || typeof owner.setTimeout !== "function" || typeof owner.clearTimeout !== "function") return undefined;
    for (const name of ["startSearch", "stopSearch", "renderSearchInfo", "onunload"]) {
      const descriptor = Object.getOwnPropertyDescriptor(view, name);
      if (!method(view, name) || (descriptor ? descriptor.configurable !== true || !("value" in descriptor) : !Object.isExtensible(view))) return undefined;
    }
    return { view, dom, native, container, owner, descriptors: new Map(), wrappers: new Map(), generation: 0, completed: false, limited: false, files: new Map(), rows: new Map() };
  }
  private attach(pane: Pane): void {
    const detachPane = this.detach.bind(this);
    const ownerPane = (): Pane | undefined => this.panes.get(pane.view);
    const afterNative = (receiver: Data, name: string, args: unknown[]): void => {
      if (receiver !== pane.view || this.state !== "ready" || this.panes.get(pane.view) !== pane) return;
      try {
        const query = data(pane.view, "searchQuery");
        const rootInfo = name === "renderSearchInfo" && object(query)
          && args[0] === data(query, "matcher") && args[1] === data(pane.view, "searchInfoEl");
        if (name === "startSearch" || rootInfo) this.restart(pane, 0);
        else if (name === "stopSearch") this.clear(pane);
      }
      catch { this.clear(pane); this.diagnose("canvas-property-results-update-failed"); }
    };
    try {
      for (const name of ["startSearch", "stopSearch", "renderSearchInfo", "onunload"]) {
        const original = method(pane.view, name)!;
        pane.descriptors.set(name, Object.getOwnPropertyDescriptor(pane.view, name));
        const wrapper: Method = function (...args) {
          if (name === "onunload" && this === pane.view && ownerPane() === pane) detachPane(pane);
          const result = original.apply(this, args);
          afterNative(this, name, args);
          return result;
        };
        pane.wrappers.set(name, wrapper);
        Object.defineProperty(pane.view, name, { value: wrapper, configurable: true, writable: true });
      }
      this.panes.set(pane.view, pane);
      const Observer = (pane.owner as Window & { MutationObserver?: typeof MutationObserver }).MutationObserver;
      if (typeof Observer === "function") {
        pane.observer = new Observer(() => {
          try { if (this.panes.get(pane.view) === pane) this.deduplicate(pane); } catch { this.clear(pane); }
        });
        pane.observer.observe(pane.native, { childList: true, subtree: true });
      }
    } catch {
      this.detach(pane);
      this.diagnose("canvas-property-results-pane-install-failed");
    }
  }
  private detach(pane: Pane): void {
    this.clear(pane);
    pane.observer?.disconnect();
    for (const [name, wrapper] of pane.wrappers) {
      if (data(pane.view, name) !== wrapper) continue;
      const descriptor = pane.descriptors.get(name);
      if (descriptor) Object.defineProperty(pane.view, name, descriptor);
      else delete pane.view[name];
    }
    if (this.panes.get(pane.view) === pane) this.panes.delete(pane.view);
  }
  private clear(pane: Pane): void {
    pane.generation += 1;
    if (pane.timer !== undefined) pane.owner.clearTimeout(pane.timer);
    pane.timer = undefined;
    for (const row of pane.rows.values()) row.remove();
    pane.rows.clear();
    pane.files.clear();
    pane.section?.remove();
    pane.section = undefined;
    pane.list = undefined;
    pane.message = undefined;
    pane.count = undefined;
    pane.completed = false;
    pane.limited = false;
  }
  private refreshResults(): void {
    if (this.state !== "ready") return;
    for (const pane of this.panes.values()) {
      try { this.restart(pane, this.debounceMs); } catch { this.clear(pane); this.diagnose("canvas-property-results-refresh-failed"); }
    }
  }
  private query(pane: Pane): Extract<CanvasPropertyQuery, { supported: true }> | undefined {
    const query = data(pane.view, "searchQuery");
    const component = data(pane.view, "searchComponent");
    const input = object(component) ? data(component, "inputEl") : undefined;
    if (!object(query) || !element(input) || !object(data(query, "matcher"))) return undefined;
    const text = data(query, "query");
    const sensitive = data(query, "caseSensitive");
    if (typeof text !== "string" || typeof sensitive !== "boolean" || text !== (input as HTMLInputElement).value) return undefined;
    const parsed = parseCanvasPropertyQuery(text, sensitive);
    if (!parsed.supported) { this.diagnose(`canvas-property-query-${parsed.reason}`); return undefined; }
    return parsed;
  }
  private restart(pane: Pane, delay: number): void {
    this.clear(pane);
    if (this.index.status !== "ready" || data(pane.view, "_loaded") !== true || data(pane.view, "dom") !== pane.dom) return;
    const query = this.query(pane);
    if (!query) return;
    const generation = pane.generation;
    pane.timer = pane.owner.setTimeout(() => {
      pane.timer = undefined;
      try { this.scan(pane, query, generation); }
      catch { this.clear(pane); this.diagnose("canvas-property-results-scan-failed"); }
    }, delay);
  }
  private current(pane: Pane, query: Extract<CanvasPropertyQuery, { supported: true }>, generation: number): boolean {
    if (this.state !== "ready" || this.index.status !== "ready" || this.panes.get(pane.view) !== pane || pane.generation !== generation) return false;
    const current = this.query(pane);
    return this.state === "ready" && this.index.status === "ready" && this.panes.get(pane.view) === pane && pane.generation === generation
      && data(pane.view, "_loaded") === true && current?.query === query.query && current.caseSensitive === query.caseSensitive;
  }
  private section(pane: Pane): void {
    const labels = this.options.labels();
    const document = pane.container.ownerDocument;
    const section = createHtmlElement(document, "section");
    section.className = "miro-canvas-property-results";
    section.setAttribute("role", "region");
    section.setAttribute("aria-label", labels.title);
    const heading = section.appendChild(createHtmlElement(document, "div"));
    heading.className = "search-info";
    heading.textContent = labels.title;
    pane.count = section.appendChild(createHtmlElement(document, "div"));
    pane.count.className = "search-info";
    pane.count.setAttribute("aria-live", "polite");
    pane.message = section.appendChild(createHtmlElement(document, "div"));
    pane.message.className = "search-info";
    pane.message.textContent = labels.loading;
    pane.list = section.appendChild(createHtmlElement(document, "div"));
    pane.list.className = "tree-item-children";
    pane.section = pane.container.insertBefore(section, pane.native);
  }
  private scan(pane: Pane, query: Extract<CanvasPropertyQuery, { supported: true }>, generation: number): void {
    if (!this.current(pane, query, generation)) return;
    this.section(pane);
    const files = this.app.vault.getFiles();
    const cache = this.app.metadataCache as unknown as Data;
    const ignored = method(cache, "isUserIgnored")!;
    const supported = method(cache, "isSupportedFile")!;
    let position = 0;
    let limited = files.length > this.maxFiles;
    const batch = (): void => {
      pane.timer = undefined;
      try {
        if (!this.current(pane, query, generation)) { if (pane.generation === generation) this.clear(pane); return; }
        const end = Math.min(files.length, this.maxFiles, position + this.batchSize);
        for (; position < end; position += 1) {
          const candidate = files[position];
          if (!file(candidate) || ignored.call(cache, candidate.path) || !supported.call(cache, candidate)) continue;
          const knowledge = this.index.getKnowledge(candidate.path);
          if (this.state !== "ready" || pane.generation !== generation || this.panes.get(pane.view) !== pane) return;
          if (!knowledge?.frontmatter) continue;
          const match = query.match(knowledge.frontmatter);
          if (!match.ok) { this.diagnose(`canvas-property-${match.reason}`, candidate.path); continue; }
          if (!match.matches || pane.files.has(candidate.path)) continue;
          if (pane.files.size >= this.maxRows) { limited = true; break; }
          pane.files.set(candidate.path, candidate);
        }
        this.deduplicate(pane);
        if (pane.files.size < this.maxRows && position < Math.min(files.length, this.maxFiles)) pane.timer = pane.owner.setTimeout(batch, 0);
        else {
          // Hitting the row cap is conservative: disclose possible remaining matches.
          limited ||= position < Math.min(files.length, this.maxFiles);
          pane.completed = true;
          pane.limited = limited;
          this.updateMessage(pane);
        }
      } catch { this.clear(pane); this.diagnose("canvas-property-results-batch-failed"); }
    };
    batch();
  }
  private deduplicate(pane: Pane): void {
    if (!pane.list || !pane.count) return;
    const lookup = data(pane.dom, "resultDomLookup");
    if (!object(lookup)) throw new Error("Native result lookup changed");
    const has = method(lookup, "has");
    if (!has) throw new Error("Native result lookup changed");
    const nativePaths = new Set<string>();
    for (const [path, candidate] of pane.files) if (has.call(lookup, candidate)) nativePaths.add(path);
    for (const [path, row] of pane.rows) if (nativePaths.has(path) || !pane.files.has(path)) { row.remove(); pane.rows.delete(path); }
    for (const [path, candidate] of pane.files) {
      if (nativePaths.has(path) || pane.rows.has(path)) continue;
      const row = this.row(pane, candidate, path);
      pane.rows.set(path, row);
      pane.list.appendChild(row.element);
    }
    pane.count.textContent = this.options.labels().count(pane.rows.size);
    this.updateMessage(pane);
  }
  private updateMessage(pane: Pane): void {
    if (!pane.message) return;
    const labels = this.options.labels();
    pane.message.textContent = !pane.completed ? labels.loading : pane.limited ? labels.limited : pane.rows.size === 0 ? labels.empty : "";
  }
  private row(pane: Pane, candidate: TFile, path: string): Row {
    const element = createHtmlElement(pane.container.ownerDocument, "a");
    element.className = "tree-item-self is-clickable";
    element.tabIndex = 0;
    element.setAttribute("role", "link");
    element.setAttribute("aria-label", path);
    element.setAttribute("data-canvas-property-path", path);
    element.textContent = path;
    const removers: (() => void)[] = [];
    const listen = (name: string, callback: EventListener): void => {
      element.addEventListener(name, callback);
      removers.push(() => element.removeEventListener(name, callback));
    };
    const open = (event: MouseEvent | KeyboardEvent): void => {
      if (event.defaultPrevented || this.state !== "ready" || this.panes.get(pane.view) !== pane) return;
      event.preventDefault();
      event.stopPropagation();
      const current = this.app.vault.getAbstractFileByPath(path);
      if (current !== candidate || !file(current)) { this.diagnose("canvas-property-result-stale", path); return; }
      try {
        void this.app.workspace.getLeaf(Keymap.isModEvent(event)).openFile(current)
          .catch(() => this.diagnose("canvas-property-result-open-failed", path));
      } catch { this.diagnose("canvas-property-result-open-failed", path); }
    };
    listen("click", event => { if ((event as MouseEvent).button === 0) open(event as MouseEvent); });
    listen("auxclick", event => { if ((event as MouseEvent).button === 1) open(event as MouseEvent); });
    listen("keydown", event => { if ((event as KeyboardEvent).key === "Enter") open(event as KeyboardEvent); });
    return { element, remove: () => { for (const remove of removers.splice(0)) remove(); element.remove(); } };
  }
}
