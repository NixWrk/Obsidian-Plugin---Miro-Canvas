/** Canvas destinations in Obsidian's existing outgoing pane. No vault writes. */
import { Keymap, resolveSubpath, setIcon, type App, type EventRef, type TFile } from "obsidian";
import type { BoardKnowledge, BoardPosition } from "./board-knowledge";
import type { ObsidianBoardIndex } from "./obsidian-board-index";
import { createHtmlElement } from "./dom-elements";

type PrivateObject = Record<string, unknown>;
type Method = (this: PrivateObject, ...args: unknown[]) => unknown;

export interface CanvasOutgoingEntry {
  readonly linktext: string;
  readonly path: string;
  readonly subpath: string;
  readonly sourcePath: string;
  readonly destination: TFile | null;
  readonly positions: BoardPosition[];
  readonly propertyKeys: string[];
}

export interface CanvasOutgoingLinksOptions {
  registerEvent?: (event: EventRef) => void;
  registerCleanup?: (cleanup: () => void) => void;
  onDiagnostic?: (code: string, path?: string) => void;
  /** Reducible bounds; omitted uses 4096 destination rows in batches of 64. */
  maxRows?: number;
  batchSize?: number;
}

interface VirtualChild {
  el: HTMLElement;
  info: {
    height: number;
    width: number;
    childLeft: number;
    childLeftPadding: number;
    childTop: number;
    computed: boolean;
    queued: boolean;
    hidden: boolean;
    next: boolean;
  };
  pos: number;
  invalidated: boolean;
  sourcePath: string;
  entry: CanvasOutgoingEntry;
  dispose(): void;
}

interface Children extends PrivateObject {
  children: unknown[];
  addChild: (child: VirtualChild) => void;
  setChildren: (children: unknown[]) => void;
}

interface Pane {
  component: PrivateObject;
  root: PrivateObject;
  children: Children;
  scroller: PrivateObject;
  count: HTMLElement;
  document: Document;
  timerOwner: Window;
  recompute: Method;
  unload: Method;
  descriptors: Map<string, PropertyDescriptor | undefined>;
  wrappers: Map<string, Method>;
  rows: Set<VirtualChild>;
  generation: number;
  timer?: number;
  countBefore?: string | null;
  countInstalled?: string;
}

function object(value: unknown): value is PrivateObject {
  return value !== null && typeof value === "object";
}

function methodOwnerSafe(target: PrivateObject, name: string): boolean {
  if (typeof target[name] !== "function") return false;
  const descriptor = Object.getOwnPropertyDescriptor(target, name);
  return descriptor ? descriptor.configurable === true && "value" in descriptor : Object.isExtensible(target);
}

function element(value: unknown): value is HTMLElement {
  return object(value) && value.nodeType === 1 && object(value.ownerDocument)
    && typeof value.appendChild === "function" && typeof value.remove === "function";
}

function file(value: unknown): value is TFile {
  return object(value) && typeof value.path === "string" && typeof value.extension === "string";
}

function limit(value: number | undefined, maximum: number): number {
  return value !== undefined && Number.isFinite(value) && value >= 1 ? Math.min(Math.floor(value), maximum) : maximum;
}

/** Like native outgoing rows, deduplicate resolved destination plus subpath. */
export function canvasOutgoingEntries(
  knowledge: BoardKnowledge,
  sourcePath: string,
  resolve: (linkpath: string, sourcePath: string) => TFile | null,
  maxRows = 4096,
): CanvasOutgoingEntry[] {
  const entries = new Map<string, CanvasOutgoingEntry>();
  for (const ref of [...knowledge.links, ...knowledge.embeds, ...knowledge.frontmatterLinks]) {
    const split = ref.link.indexOf("#");
    const linkpath = split < 0 ? ref.link : ref.link.slice(0, split);
    const subpath = split < 0 ? "" : ref.link.slice(split);
    const destination = resolve(linkpath, sourcePath);
    const path = destination?.path ?? linkpath.replace(/\.md$/iu, "");
    const key = JSON.stringify([path, subpath]);
    let entry = entries.get(key);
    if (!entry) {
      if (entries.size >= maxRows) continue;
      entry = { linktext: ref.link, path, subpath, sourcePath, destination, positions: [], propertyKeys: [] };
      entries.set(key, entry);
    }
    if ("position" in ref) entry.positions.push(ref.position);
    if ("key" in ref) entry.propertyKeys.push(ref.key);
  }
  return [...entries.values()];
}

/** Attach once after the board index starts; no prototypes or function rewriting. */
export class CanvasOutgoingLinks {
  private state: "stopped" | "ready" | "unsupported" | "disposed" = "stopped";
  private readonly panes = new Map<PrivateObject, Pane>();
  private readonly removers: (() => void)[] = [];
  private readonly maxRows: number;
  private readonly batchSize: number;

  constructor(
    private readonly app: Pick<App, "workspace" | "metadataCache">,
    private readonly index: Pick<ObsidianBoardIndex, "status" | "getKnowledge">,
    private readonly options: CanvasOutgoingLinksOptions = {},
  ) {
    this.maxRows = limit(options.maxRows, 4096);
    this.batchSize = limit(options.batchSize, 64);
  }

  get status(): "stopped" | "ready" | "unsupported" | "disposed" { return this.state; }

  start(): void {
    if (this.state !== "stopped") return;
    if (this.index.status !== "ready" || typeof this.app.workspace.getLeavesOfType !== "function"
      || typeof this.app.workspace.on !== "function" || typeof this.app.workspace.offref !== "function"
      || typeof this.app.workspace.openLinkText !== "function") {
      this.state = "unsupported";
      this.diagnose("canvas-outgoing-host-unsupported");
      return;
    }
    this.state = "ready";
    try {
      const event = this.app.workspace.on("layout-change", () => this.refresh());
      this.removers.push(() => this.app.workspace.offref(event));
      this.options.registerEvent?.(event);
      this.options.registerCleanup?.(() => this.dispose());
      this.refresh();
    } catch {
      this.dispose();
      this.diagnose("canvas-outgoing-install-failed");
    }
  }

  /** Discover new panes; native resolve events call their instance recompute hook. */
  refresh(): void {
    if (this.state !== "ready") return;
    const live = new Set<PrivateObject>();
    for (const leaf of this.app.workspace.getLeavesOfType("outgoing-link")) {
      const view = leaf.view as unknown;
      if (!object(view) || !object(view.outgoingLink)) continue;
      const component = view.outgoingLink;
      if (component._loaded === false) continue;
      live.add(component);
      if (this.panes.has(component)) continue;
      const pane = this.probe(component);
      if (!pane) {
        this.diagnose("canvas-outgoing-pane-unsupported");
        continue;
      }
      try {
        const recomputePane = this.recompute.bind(this);
        const detachPane = this.detach.bind(this);
        const recompute: Method = function (...args) {
          return this === component ? recomputePane(pane, args) : pane.recompute.apply(this, args);
        };
        const unload: Method = function (...args) {
          if (this === component) detachPane(pane);
          return pane.unload.apply(this, args);
        };
        for (const [name, wrapper] of [["recomputeLinks", recompute], ["onunload", unload]] as const) {
          pane.descriptors.set(name, Object.getOwnPropertyDescriptor(component, name));
          pane.wrappers.set(name, wrapper);
          Object.defineProperty(component, name, { value: wrapper, configurable: true, writable: true });
        }
        this.panes.set(component, pane);
        if (file(component.file) && component.file.extension === "canvas") recompute.call(component);
      } catch {
        this.detach(pane);
        this.diagnose("canvas-outgoing-pane-install-failed");
      }
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
    try { this.options.onDiagnostic?.(code, path); } catch { /* Diagnostics cannot own the pane. */ }
  }

  private probe(component: PrivateObject): Pane | undefined {
    if (!methodOwnerSafe(component, "recomputeLinks") || !methodOwnerSafe(component, "onunload")) return undefined;
    if (typeof component.linksCollapsed !== "boolean") return undefined;
    const root = component.outgoingLinkDom;
    const scroller = component.outgoingLinkInfinityScroller;
    const count = component.linksCountEl;
    if (!object(root) || !object(root.info) || typeof root.info.computed !== "boolean"
      || !element(root.el) || !element(root.childrenEl) || !element(root.pusherEl) || !element(count)
      || !object(root.vChildren) || !object(scroller) || scroller.rootEl !== root
      || typeof scroller.queueCompute !== "function") return undefined;
    const children = root.vChildren;
    if (!Array.isArray(children.children) || typeof children.addChild !== "function" || typeof children.setChildren !== "function") return undefined;
    const document = root.el.ownerDocument;
    const timerOwner = document.defaultView;
    if (!timerOwner || typeof timerOwner.setTimeout !== "function" || typeof timerOwner.clearTimeout !== "function") return undefined;
    return { component, root, children: children as Children, scroller, count, document, timerOwner,
      recompute: component.recomputeLinks as Method, unload: component.onunload as Method,
      descriptors: new Map(), wrappers: new Map(), rows: new Set(), generation: 0 };
  }

  private clear(pane: Pane): void {
    pane.generation++;
    if (pane.timer !== undefined) pane.timerOwner.clearTimeout(pane.timer);
    pane.timer = undefined;
    if (pane.rows.size) {
      const owned = pane.rows;
      pane.children.setChildren(pane.children.children.filter(child => !owned.has(child as VirtualChild)));
      for (const row of owned) row.dispose();
      owned.clear();
      (pane.root.info as PrivateObject).computed = false;
      (pane.scroller.queueCompute as Method).call(pane.scroller);
    }
    if (pane.countInstalled !== undefined && pane.count.textContent === pane.countInstalled) pane.count.textContent = pane.countBefore ?? null;
    pane.countBefore = undefined;
    pane.countInstalled = undefined;
  }

  private detach(pane: Pane): void {
    this.clear(pane);
    for (const [name, wrapper] of pane.wrappers) {
      if (pane.component[name] !== wrapper) continue;
      const descriptor = pane.descriptors.get(name);
      if (descriptor) Object.defineProperty(pane.component, name, descriptor);
      else delete pane.component[name];
    }
    this.panes.delete(pane.component);
  }

  private recompute(pane: Pane, args: unknown[]): unknown {
    this.clear(pane);
    const result = pane.recompute.apply(pane.component, args);
    const source = pane.component.file;
    if (this.state !== "ready" || this.index.status !== "ready" || !file(source)
      || source.extension !== "canvas" || pane.component.linksCollapsed) return result;
    // If a future native renderer owns Canvas results or async work, let it finish.
    if (result !== undefined || pane.component.linksQueue || pane.children.children.length) return result;
    const knowledge = this.index.getKnowledge(source.path);
    if (!knowledge) return result;
    const entries = canvasOutgoingEntries(knowledge, source.path,
      (linkpath, path) => this.app.metadataCache.getFirstLinkpathDest(linkpath, path), this.maxRows + 1);
    if (entries.length > this.maxRows) {
      entries.length = this.maxRows;
      this.diagnose("canvas-outgoing-row-limit", source.path);
    }
    pane.countBefore = pane.count.textContent;
    const generation = pane.generation;
    let next = 0;
    const batch = (): void => {
      pane.timer = undefined;
      if (this.state !== "ready" || !this.panes.has(pane.component) || pane.generation !== generation) return;
      if (pane.component.file !== source || (source.path !== entries[0]?.sourcePath && entries.length > 0)
        || pane.component.linksCollapsed || this.index.status !== "ready") {
        this.clear(pane);
        return;
      }
      const stop = Math.min(next + this.batchSize, entries.length);
      try {
        for (; next < stop; next++) {
          const row = this.row(pane, entries[next], next);
          pane.rows.add(row);
          pane.children.addChild(row);
        }
        pane.countInstalled = String(pane.rows.size);
        pane.count.textContent = pane.countInstalled;
        (pane.root.info as PrivateObject).computed = false;
        (pane.scroller.queueCompute as Method).call(pane.scroller);
        if (next < entries.length) pane.timer = pane.timerOwner.setTimeout(batch, 0);
      } catch {
        this.clear(pane);
        this.diagnose("canvas-outgoing-render-failed", source.path);
      }
    };
    batch();
    return result;
  }

  private row(pane: Pane, entry: CanvasOutgoingEntry, pos: number): VirtualChild {
    const el = createHtmlElement(pane.document, "div");
    el.className = "tree-item-self is-clickable outgoing-link-item";
    el.setAttribute("role", "link");
    el.tabIndex = entry.destination ? 0 : -1;
    if (!entry.destination) el.setAttribute("aria-disabled", "true");
    const icon = el.appendChild(createHtmlElement(pane.document, "span"));
    icon.className = "tree-item-icon";
    let glyph = entry.destination ? "lucide-link" : "lucide-file-plus";
    let label = entry.linktext.split("#", 1)[0] || entry.path;
    let detail = entry.destination?.parent?.path;
    if (detail === "/") detail = undefined;
    if (entry.subpath) {
      const cache = entry.destination && this.app.metadataCache.getFileCache(entry.destination);
      const resolved = cache ? resolveSubpath(cache, entry.subpath) : null;
      glyph = resolved?.type === "heading" ? "heading-glyph" : resolved?.type === "block" ? "lucide-layout-list" : "lucide-file-question";
      label = resolved?.type === "heading" ? resolved.current.heading : resolved?.type === "block" ? resolved.block.id : entry.subpath;
      detail = entry.path;
    }
    setIcon(icon, glyph);
    const inner = el.appendChild(createHtmlElement(pane.document, "div"));
    inner.className = "tree-item-inner";
    const text = inner.appendChild(createHtmlElement(pane.document, "div"));
    text.className = "tree-item-inner-text";
    text.textContent = label;
    if (detail) {
      const subtext = inner.appendChild(createHtmlElement(pane.document, "div"));
      subtext.className = "tree-item-inner-subtext";
      subtext.textContent = detail;
    }
    el.setAttribute("aria-label", entry.linktext);
    const removers: (() => void)[] = [];
    const listen = (name: string, callback: EventListener): void => {
      el.addEventListener(name, callback);
      removers.push(() => el.removeEventListener(name, callback));
    };
    const open = (event: MouseEvent | KeyboardEvent): void => {
      event.preventDefault();
      const destination = this.app.metadataCache.getFirstLinkpathDest(entry.linktext.split("#", 1)[0], entry.sourcePath);
      if (!destination) {
        this.diagnose("canvas-outgoing-target-unresolved", entry.sourcePath);
        return;
      }
      void this.app.workspace.openLinkText(entry.linktext, entry.sourcePath, Keymap.isModEvent(event))
        .catch(() => this.diagnose("canvas-outgoing-open-failed", entry.sourcePath));
    };
    listen("click", event => { const mouse = event as MouseEvent; if (mouse.button === 0) open(mouse); });
    listen("auxclick", event => { const mouse = event as MouseEvent; if (mouse.button === 1) open(mouse); });
    listen("keydown", event => { const key = event as KeyboardEvent; if (key.key === "Enter" || key.key === " ") open(key); });
    listen("mouseover", event => {
      if (event.defaultPrevented) return;
      const related = (event as MouseEvent).relatedTarget;
      if (related && object(related) && "nodeType" in related && el.contains(related as unknown as Node)) return;
      event.preventDefault();
      this.app.workspace.trigger("hover-link", { event, source: "search", hoverParent: pane.component,
        targetEl: el, linktext: entry.linktext, sourcePath: entry.sourcePath });
    });
    return { el, pos, sourcePath: entry.sourcePath, entry, invalidated: false,
      info: { height: 0, width: 0, childLeft: 0, childLeftPadding: 0, childTop: 0, computed: false, queued: false, hidden: false, next: false },
      dispose() { for (const remove of removers.splice(0)) remove(); el.remove(); } };
  }
}
