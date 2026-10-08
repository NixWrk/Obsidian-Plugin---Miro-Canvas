import type { Component, OpenViewState, PaneType } from "obsidian";
import { createHtmlElement } from "./dom-elements";

type CardRecord = Readonly<Record<string, unknown>>;
type Cleanup = () => void;

export const BOARD_CARD_LINK_LIMITS = {
  linkLength: 8192,
  nodeIdLength: 256,
  boardBytes: 4 * 1024 * 1024,
  boardNodes: 20_000,
  cachedBoards: 8,
  cachedCharacters: 8 * 1024 * 1024,
  concurrentReads: 4,
  redirectHops: 16,
  mountedEmbeds: 32,
  cardCharacters: 256 * 1024,
  embedDepth: 5,
  groupItems: 100,
} as const;

export interface CanvasCardDestination {
  readonly path: string;
  readonly nodeId: string;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validNodeId(id: string): boolean {
  return id.length > 0 && id.length <= BOARD_CARD_LINK_LIMITS.nodeIdLength && !controlCharacters(id);
}

function controlCharacters(text: string): boolean {
  for (const character of text) {
    const code = character.charCodeAt(0);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

function vaultPath(path: string): boolean {
  return path.length > 0 && path.length <= 4096 && !path.includes("\\") && !path.includes(":") && !controlCharacters(path)
    && path.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

/** Input is native linktext, without [[brackets]] or a wiki alias. */
export function parseCanvasCardLink(linktext: string): CanvasCardDestination | undefined {
  if (linktext.length > BOARD_CARD_LINK_LIMITS.linkLength || linktext.includes("|") || linktext.includes("[[")) return undefined;
  const hash = linktext.indexOf("#");
  if (hash < 0 || !linktext.slice(hash).startsWith("#node-")) return undefined;
  try {
    const path = decodeURIComponent(linktext.slice(0, hash));
    const nodeId = decodeURIComponent(linktext.slice(hash + 6));
    if (!validNodeId(nodeId) || (path !== "" && !vaultPath(path))) return undefined;
    // An additional literal # is another subpath, not part of this destination.
    if (linktext.slice(hash + 6).includes("#")) return undefined;
    return { path, nodeId };
  } catch {
    return undefined;
  }
}

export function canvasCardLink(path: string, nodeId: string): string | undefined {
  if (!vaultPath(path) || !/\.canvas$/iu.test(path) || !validNodeId(nodeId)) return undefined;
  // Wiki paths use literal spaces/Unicode: native destination lookup does not decode them.
  // Reserved delimiters and percent escapes cannot round-trip unambiguously here.
  if (["#", "[", "]", "|", "%"].some((character) => path.includes(character)) || path.trim() !== path) return undefined;
  try {
    const link = `${path}#node-${encodeURIComponent(nodeId)}`;
    return link.length <= BOARD_CARD_LINK_LIMITS.linkLength ? link : undefined;
  } catch {
    return undefined;
  }
}

export interface CardBoardStat {
  readonly mtime: number;
  readonly size: number;
}

export interface BoardCardAdapter {
  /** Native metadata-cache destination lookup; a vault-relative path, never a URL. */
  readonly resolvePath: (linkpath: string, sourcePath: string) => string | undefined;
  readonly stat: (path: string) => CardBoardStat | undefined;
  readonly read: (path: string, signal: AbortSignal) => Promise<string>;
}

export type CardLinkErrorCode = "missing-board" | "missing-card" | "invalid-board" | "too-large" | "read-failed"
  | "redirect-loop" | "redirect-limit" | "stale" | "disposed" | "unsupported-card" | "render-failed" | "embed-limit" | "recursion-limit";

interface BoardSnapshot {
  readonly path: string;
  readonly stat: CardBoardStat;
  readonly document: CardRecord;
  readonly nodes: ReadonlyMap<string, CardRecord>;
  readonly characters: number;
}

interface BoardRevision {
  readonly path: string;
  readonly stat: CardBoardStat;
}

type BoardLoad = { readonly board: BoardSnapshot; readonly error?: undefined }
  | { readonly error: CardLinkErrorCode; readonly board?: undefined };

export interface ResolvedCanvasCard {
  readonly path: string;
  readonly nodeId: string;
  readonly node: CardRecord;
  readonly board: BoardSnapshot;
  readonly chain: readonly BoardRevision[];
  readonly epoch: number;
}

export type CardLinkResolution = { readonly status: "resolved"; readonly target: ResolvedCanvasCard }
  | { readonly status: "ignored" }
  | { readonly status: "error"; readonly error: CardLinkErrorCode };

function sameStat(left: CardBoardStat, right: CardBoardStat | undefined): boolean {
  return right !== undefined && left.mtime === right.mtime && left.size === right.size;
}

async function withAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T | undefined> {
  if (signal.aborted) return undefined;
  let cancel: Cleanup | undefined;
  const cancelled = new Promise<undefined>((resolve) => {
    cancel = () => resolve(undefined);
    signal.addEventListener("abort", cancel, { once: true });
  });
  try {
    return await Promise.race([promise, cancelled]);
  } finally {
    if (cancel !== undefined) signal.removeEventListener("abort", cancel);
  }
}

function parseBoard(path: string, text: string, stat: CardBoardStat): BoardLoad {
  if (text.length > BOARD_CARD_LINK_LIMITS.boardBytes) return { error: "too-large" };
  let document: unknown;
  try {
    document = JSON.parse(text);
  } catch {
    return { error: "invalid-board" };
  }
  if (!record(document) || !Array.isArray(document.nodes) || !Array.isArray(document.edges)) return { error: "invalid-board" };
  if (document.nodes.length > BOARD_CARD_LINK_LIMITS.boardNodes) return { error: "too-large" };
  const nodes = new Map<string, CardRecord>();
  for (const node of document.nodes as unknown[]) {
    if (!record(node) || typeof node.id !== "string" || node.id === "" || nodes.has(node.id)
      || typeof node.type !== "string" || !["text", "file", "link", "group"].includes(node.type)) return { error: "invalid-board" };
    for (const key of ["x", "y", "width", "height"]) {
      if (typeof node[key] !== "number" || !Number.isFinite(node[key])) return { error: "invalid-board" };
    }
    if (node.type === "text" && typeof node.text !== "string" || node.type === "file" && typeof node.file !== "string"
      || node.type === "link" && typeof node.url !== "string") return { error: "invalid-board" };
    nodes.set(node.id, node);
  }
  return { board: { path, stat, document, nodes, characters: text.length } };
}

interface PendingBoard {
  readonly stat: CardBoardStat;
  readonly controller: AbortController;
  readonly promise: Promise<BoardLoad>;
}

/** One shared instance per plugin; reads are demand-driven, never per frame. */
export class BoardCardResolver {
  private readonly cache = new Map<string, BoardSnapshot>();
  private readonly pending = new Map<string, PendingBoard>();
  private readonly active = new Set<Promise<BoardLoad>>();
  private readonly lifetime = new AbortController();
  private epoch = 0;

  public constructor(private readonly adapter: BoardCardAdapter) {}

  public destination(linktext: string, sourcePath: string): CanvasCardDestination | undefined {
    const parsed = parseCanvasCardLink(linktext);
    if (parsed === undefined) return undefined;
    let path: string | undefined;
    try {
      path = parsed.path === "" ? sourcePath : this.adapter.resolvePath(parsed.path, sourcePath);
    } catch {
      path = undefined;
    }
    // A deleted explicit board link must report missing, not create a new board.
    if (path === undefined && /\.canvas$/iu.test(parsed.path)) path = parsed.path;
    return path !== undefined && vaultPath(path) && /\.canvas$/iu.test(path) ? { path, nodeId: parsed.nodeId } : undefined;
  }

  public async resolve(linktext: string, sourcePath: string, signal?: AbortSignal): Promise<CardLinkResolution> {
    const destination = this.destination(linktext, sourcePath);
    if (destination === undefined) return { status: "ignored" };
    const epoch = this.epoch;
    const chain: BoardRevision[] = [];
    const visited = new Set<string>();
    let path = destination.path;
    let nodeId = destination.nodeId;
    for (let hop = 0; hop <= BOARD_CARD_LINK_LIMITS.redirectHops; hop += 1) {
      if (this.lifetime.signal.aborted) return { status: "error", error: "disposed" };
      if (signal?.aborted === true || epoch !== this.epoch) return { status: "error", error: "stale" };
      const key = `${path}\0${nodeId}`;
      if (visited.has(key)) return { status: "error", error: "redirect-loop" };
      visited.add(key);
      const promise = this.load(path);
      const loaded = signal === undefined ? await promise : await withAbort(promise, signal);
      if (this.lifetime.signal.aborted) return { status: "error", error: "disposed" };
      if (loaded === undefined || signal?.aborted || epoch !== this.epoch) return { status: "error", error: "stale" };
      if (loaded.error !== undefined) return { status: "error", error: loaded.error };
      const board = loaded.board;
      chain.push({ path: board.path, stat: board.stat });
      const node = board.nodes.get(nodeId);
      if (node !== undefined) {
        const target = { path, nodeId, node, board, chain, epoch };
        return this.isCurrent(target) ? { status: "resolved", target } : { status: "error", error: "stale" };
      }
      const metadata = board.document.miroCanvas;
      const redirects = record(metadata) && metadata.schemaVersion === 1 ? metadata.nodeRedirects : undefined;
      const redirect = record(redirects) && Object.prototype.hasOwnProperty.call(redirects, nodeId) ? redirects[nodeId] : undefined;
      if (redirect === undefined) return { status: "error", error: "missing-card" };
      if (!record(redirect) || typeof redirect.file !== "string" || !vaultPath(redirect.file) || !/\.canvas$/iu.test(redirect.file)
        || typeof redirect.nodeId !== "string" || !validNodeId(redirect.nodeId)) return { status: "error", error: "invalid-board" };
      if (hop === BOARD_CARD_LINK_LIMITS.redirectHops) return { status: "error", error: "redirect-limit" };
      path = redirect.file;
      nodeId = redirect.nodeId;
    }
    return { status: "error", error: "redirect-limit" };
  }

  public isCurrent(target: ResolvedCanvasCard): boolean {
    return !this.lifetime.signal.aborted && target.epoch === this.epoch
      && target.chain.every((board) => sameStat(board.stat, this.stat(board.path)));
  }

  /** Invalidate modified/deleted boards and both paths on rename, then refresh embeds. */
  public invalidate(path: string): void {
    this.epoch += 1;
    this.evict(path);
  }

  public dispose(): void {
    this.lifetime.abort();
    this.epoch += 1;
    for (const pending of this.pending.values()) pending.controller.abort();
    this.pending.clear();
    this.cache.clear();
  }

  private stat(path: string): CardBoardStat | undefined {
    try {
      const stat = this.adapter.stat(path);
      return stat === undefined ? undefined : { ...stat };
    } catch {
      return undefined;
    }
  }

  private evict(path: string): void {
    this.cache.delete(path);
    this.pending.get(path)?.controller.abort();
    this.pending.delete(path);
  }

  private async load(path: string): Promise<BoardLoad> {
    if (this.lifetime.signal.aborted) return { error: "disposed" };
    const stat = this.stat(path);
    if (stat === undefined) {
      this.evict(path);
      return { error: "missing-board" };
    }
    if (!Number.isFinite(stat.mtime) || !Number.isFinite(stat.size) || stat.size < 0 || stat.size > BOARD_CARD_LINK_LIMITS.boardBytes) return { error: "too-large" };
    const cached = this.cache.get(path);
    if (cached !== undefined && sameStat(stat, cached.stat)) {
      this.cache.delete(path);
      this.cache.set(path, cached);
      return { board: cached };
    }
    const pending = this.pending.get(path);
    if (pending !== undefined && sameStat(stat, pending.stat)) {
      return this.awaitRead(pending);
    }
    this.evict(path);
    while (this.active.size >= BOARD_CARD_LINK_LIMITS.concurrentReads) {
      await withAbort(Promise.race(this.active), this.lifetime.signal);
      if (this.lifetime.signal.aborted) return { error: "disposed" };
    }
    // Another waiter can have started this same revision while a slot was busy.
    const existing = this.pending.get(path);
    if (existing !== undefined && sameStat(stat, existing.stat)) return this.awaitRead(existing);
    if (!sameStat(stat, this.stat(path))) return { error: "stale" };
    const controller = new AbortController();
    const promise: Promise<BoardLoad> = Promise.resolve().then(async () => {
      if (controller.signal.aborted || this.lifetime.signal.aborted) return { error: "disposed" };
      try {
        const text = await this.adapter.read(path, controller.signal);
        if (controller.signal.aborted || this.lifetime.signal.aborted || !sameStat(stat, this.stat(path))) return { error: "stale" };
        const loaded = parseBoard(path, text, stat);
        if (loaded.board !== undefined) {
          this.cache.set(path, loaded.board);
          this.trimCache();
        }
        return loaded;
      } catch {
        return { error: "read-failed" };
      }
    });
    const entry = { stat, controller, promise };
    this.pending.set(path, entry);
    this.active.add(promise);
    void promise.then(() => {
      this.active.delete(promise);
      if (this.pending.get(path)?.promise === promise) this.pending.delete(path);
    });
    return this.awaitRead(entry);
  }

  private async awaitRead(pending: PendingBoard): Promise<BoardLoad> {
    return await withAbort(withAbort(pending.promise, pending.controller.signal), this.lifetime.signal)
      ?? { error: this.lifetime.signal.aborted ? "disposed" : "stale" };
  }

  private trimCache(): void {
    let characters = 0;
    for (const board of this.cache.values()) characters += board.characters;
    for (const [path, board] of this.cache) {
      if (this.cache.size <= BOARD_CARD_LINK_LIMITS.cachedBoards && characters <= BOARD_CARD_LINK_LIMITS.cachedCharacters) break;
      this.cache.delete(path);
      characters -= board.characters;
    }
  }
}

export interface CardLinkWorkspace {
  openLinkText(linktext: string, sourcePath: string, newLeaf?: PaneType | boolean, state?: OpenViewState): Promise<void>;
}

/** Native openFile supplies selection/pan from eState.match; the wrapper opens no leaf itself. */
export function installCanvasCardLinkOpener(
  workspace: CardLinkWorkspace,
  resolver: BoardCardResolver,
  onError: (code: CardLinkErrorCode, linktext: string) => void,
): { readonly installed: boolean; readonly dispose: Cleanup } {
  const original = Reflect.get(workspace, "openLinkText");
  if (typeof original !== "function") return { installed: false, dispose: () => {} };
  const descriptor = Object.getOwnPropertyDescriptor(workspace, "openLinkText");
  let disposed = false;
  const lifetime = new AbortController();
  const wrapper: CardLinkWorkspace["openLinkText"] = async function (this: CardLinkWorkspace, ...args) {
    if (disposed || resolver.destination(args[0], args[1]) === undefined) return original.apply(this, args);
    const result = await resolver.resolve(args[0], args[1], lifetime.signal);
    if (disposed) return;
    if (result.status === "ignored") return original.apply(this, args);
    if (result.status === "error") {
      onError(result.error, args[0]);
      return;
    }
    if (!resolver.isCurrent(result.target)) {
      onError("stale", args[0]);
      return;
    }
    const target = result.target;
    const state: OpenViewState = {
      ...args[3],
      eState: {
        ...args[3]?.eState,
        match: { nodeId: target.nodeId, content: typeof target.node.text === "string" ? target.node.text : "", matches: [] },
      },
    };
    await original.call(this, target.path, args[1], args[2], state);
  };
  try {
    workspace.openLinkText = wrapper;
  } catch {
    return { installed: false, dispose: () => {} };
  }
  return {
    installed: workspace.openLinkText === wrapper,
    dispose: () => {
      disposed = true;
      lifetime.abort();
      if (workspace.openLinkText !== wrapper) return;
      if (descriptor !== undefined) Object.defineProperty(workspace, "openLinkText", descriptor);
      else Reflect.deleteProperty(workspace, "openLinkText");
    },
  };
}

export interface CardEmbedLabels {
  readonly loading: string;
  readonly openCard: string;
  readonly groupTitle: (label: string, count: number) => string;
  readonly groupOverflow: (count: number) => string;
  readonly unsupported: (kind: string) => string;
  readonly error: (code: CardLinkErrorCode) => string;
}

export interface CardRenderContext {
  readonly container: HTMLElement;
  /** Relative links/embeds resolve from the destination board, including redirects. */
  readonly sourcePath: string;
  readonly signal: AbortSignal;
  readonly depth: number;
  /** Register native Component/unload ownership BEFORE awaiting its rendering. */
  readonly registerCleanup: (cleanup: Cleanup) => void;
}

export interface CardEmbedHost {
  readonly labels: CardEmbedLabels;
  /** Parent uses MarkdownRenderer.render with a fresh child Component. */
  readonly renderMarkdown: (text: string, context: CardRenderContext) => Promise<void>;
  /** Parent uses a guarded native embed creator; false means unsupported/missing file. */
  readonly renderFile: (path: string, subpath: string, context: CardRenderContext) => Promise<boolean>;
  /** Optional cancellation/unload of a native embed that has already claimed this span. */
  readonly suspendOriginal?: (element: HTMLElement) => Cleanup;
  readonly onDiagnostic?: (code: string) => void;
}

export interface CardEmbedHandle {
  readonly element: HTMLElement;
  readonly ready: Promise<void>;
  refresh(): Promise<void>;
  dispose(): void;
}

/** Native 1.14.4 factory context; source/depth are already supplied by its loader. */
export interface CanvasCardEmbedCreatorContext {
  readonly containerEl: HTMLElement;
  readonly sourcePath: string;
  readonly linktext: string;
  readonly depth: number;
  readonly app?: unknown;
  readonly displayMode?: boolean;
  readonly showInline?: boolean;
  readonly state?: unknown;
  readonly [key: string]: unknown;
}

export interface CanvasCardEmbedCreatorFile {
  readonly path: string;
  readonly extension: string;
}

export interface CanvasCardEmbedCreatorRequest {
  readonly context: CanvasCardEmbedCreatorContext;
  readonly file: CanvasCardEmbedCreatorFile;
  readonly subpath: string;
  readonly nodeId: string;
  /** Abort on native component unload and helper/plugin disposal, including pending loadFile. */
  readonly signal: AbortSignal;
  /** Register handle disposal before awaiting it; late registrations are disposed immediately. */
  readonly registerCleanup: (cleanup: Cleanup) => void;
}

export type CanvasCardEmbedComponent = Component & { loadFile(): Promise<void> };
export type CanvasCardEmbedCreatorError = "creator-failed" | "component-invalid" | "component-load-failed";

export interface CanvasCardEmbedCreatorOptions {
  /** Actual native SDK Component constructor, also used for a non-Canvas error component. */
  readonly Component: new () => Component;
  /** Construct only; start rendering in loadFile and register handle disposal with this component. */
  readonly create: (request: CanvasCardEmbedCreatorRequest) => CanvasCardEmbedComponent;
  /** Parent supplies localized feedback; a failed card factory never falls back to the whole board. */
  readonly onError: (request: CanvasCardEmbedCreatorRequest, code: CanvasCardEmbedCreatorError) => void;
}

const CARD_CREATOR_OWNER = "data-miro-canvas-card-creator";
const cardCreatorOwners = new WeakMap<HTMLElement, Cleanup>();

/**
 * Native evidence: getEmbedCreator indexes embedByExtension[file.extension];
 * its canvas factory constructs a Component with loadFile(), and callers attach
 * it before invoking loadFile() without arguments. Intercept before construction,
 * so no original Canvas listener, cachedRead or whole-board SVG is started.
 */
export function installCanvasCardEmbedCreator(
  app: unknown,
  options: CanvasCardEmbedCreatorOptions,
): { readonly installed: boolean; readonly dispose: Cleanup } {
  const unsupported = { installed: false, dispose: () => {} };
  if (!record(app) || !record(app.embedRegistry)) return unsupported;
  const registry = app.embedRegistry;
  if (!record(registry.embedByExtension) || typeof registry.getEmbedCreator !== "function") return unsupported;
  const creators = registry.embedByExtension;
  const descriptor = Object.getOwnPropertyDescriptor(creators, "canvas");
  if (descriptor === undefined || descriptor.writable !== true || typeof descriptor.value !== "function") return unsupported;
  type Creator = (this: unknown, context: unknown, file: unknown, subpath?: unknown) => unknown;
  const original = descriptor.value as Creator;
  try {
    if (Reflect.apply(registry.getEmbedCreator, registry, [{ extension: "canvas" }]) !== original) return unsupported;
  } catch {
    return unsupported;
  }
  let disposed = false;
  const releases = new Set<Cleanup>();
  const wrapper: Creator = function (this: unknown, ...args) {
    const [context, file, subpath] = args;
    const parsed = typeof subpath === "string" ? parseCanvasCardLink(`card.canvas${subpath}`) : undefined;
    if (disposed || parsed === undefined || !record(context) || !record(file)
      || file.extension !== "canvas" || typeof file.path !== "string" || !vaultPath(file.path)
      || typeof context.sourcePath !== "string" || typeof context.linktext !== "string"
      || typeof context.depth !== "number" || !Number.isFinite(context.depth)
      || !record(context.containerEl) || context.containerEl.nodeType !== 1) return Reflect.apply(original, this, args);
    const owner = context as unknown as CanvasCardEmbedCreatorContext;
    const container = owner.containerEl;
    cardCreatorOwners.get(container)?.();
    const controller = new AbortController();
    const cleanups: Cleanup[] = [];
    let stopped = false;
    let factoryFailed = false;
    const clean = (): void => {
      for (const cleanup of cleanups.splice(0)) {
        try {
          cleanup();
        } catch {
          // Release the remaining card children even if one native cleanup fails.
        }
      }
    };
    const request: CanvasCardEmbedCreatorRequest = {
      context: owner, file: file as unknown as CanvasCardEmbedCreatorFile,
      subpath: subpath as string, nodeId: parsed.nodeId, signal: controller.signal,
      registerCleanup: (cleanup) => {
        if (stopped || disposed || factoryFailed) {
          try { cleanup(); } catch { /* A closed card cannot retain late resources. */ }
        } else cleanups.push(cleanup);
      },
    };
    const previousOwner = container.getAttribute(CARD_CREATOR_OWNER);
    container.setAttribute(CARD_CREATOR_OWNER, "true");
    let component: CanvasCardEmbedComponent;
    let factoryError: CanvasCardEmbedCreatorError | undefined;
    try {
      component = options.create(request);
      if (!(component instanceof options.Component) || typeof component.loadFile !== "function") {
        factoryError = "component-invalid";
        if (component instanceof options.Component) {
          try { component.load(); } finally { component.unload(); }
        }
        component = Object.assign(new options.Component(), { loadFile: async () => {} });
      }
    } catch {
      factoryError = "creator-failed";
      component = Object.assign(new options.Component(), { loadFile: async () => {} });
    }
    if (factoryError !== undefined) {
      factoryFailed = true;
      clean();
    }
    const originalLoad = Reflect.get(component, "load");
    const originalUnload = Reflect.get(component, "unload");
    const originalLoadFile = Reflect.get(component, "loadFile");
    const release: Cleanup = () => {
      if (stopped) return;
      stopped = true;
      controller.abort();
      releases.delete(unload);
      clean();
      if (cardCreatorOwners.get(container) === unload) {
        cardCreatorOwners.delete(container);
        if (previousOwner === null) container.removeAttribute(CARD_CREATOR_OWNER);
        else container.setAttribute(CARD_CREATOR_OWNER, previousOwner);
      }
    };
    // Native unload releases the job even if another caller retains loadFile.
    component.register(release);
    const unload: Cleanup = () => {
      release();
      try {
        Reflect.apply(originalUnload, component, []);
      } catch {
        // Job ownership was released before native child unload could fail.
      }
    };
    component.unload = unload;
    releases.add(unload);
    cardCreatorOwners.set(container, unload);
    let componentLoading: Promise<void> | undefined;
    const startLoad = (): Promise<void> | undefined => {
      if (disposed || stopped) return undefined;
      if (componentLoading !== undefined) return componentLoading;
      try {
        // Runtime Component.load may return a promise although public typings say void.
        componentLoading = Promise.resolve(Reflect.apply(originalLoad, component, [])).then(() => {});
      } catch {
        componentLoading = Promise.reject(new Error("component-load-failed"));
      }
      componentLoading = componentLoading.catch(() => {
        const report = !disposed && !stopped;
        unload();
        if (report) options.onError(request, "component-load-failed");
      });
      return componentLoading;
    };
    component.load = () => { void startLoad(); };
    let loading: Promise<void> | undefined;
    const loadFile = (): Promise<void> => {
      if (disposed || stopped) return Promise.resolve();
      if (loading !== undefined) return loading;
      loading = (async () => {
        try {
          // addChild on an unloaded parent need not load us before loadFile.
          await startLoad();
          if (disposed || stopped) return;
          if (factoryError !== undefined) {
            options.onError(request, factoryError);
            return;
          }
          await Reflect.apply(originalLoadFile, component, []);
        } catch {
          const report = !disposed && !stopped;
          unload();
          if (report) options.onError(request, "component-load-failed");
        }
      })();
      return loading;
    };
    component.loadFile = loadFile;
    if (disposed) unload();
    return component;
  };
  try {
    Object.defineProperty(creators, "canvas", { ...descriptor, value: wrapper });
  } catch {
    return unsupported;
  }
  return {
    installed: true,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      if (creators.canvas === wrapper) Object.defineProperty(creators, "canvas", descriptor);
      for (const release of [...releases]) release();
      releases.clear();
    },
  };
}

interface RenderOwner {
  readonly depth: number;
  readonly ancestors: readonly string[];
  readonly registerCleanup?: (cleanup: Cleanup) => void;
}

function groupMembers(target: ResolvedCanvasCard): readonly CardRecord[] {
  const group = target.node;
  const x = group.x as number;
  const y = group.y as number;
  const right = x + (group.width as number);
  const bottom = y + (group.height as number);
  const members: CardRecord[] = [];
  for (const card of target.board.nodes.values()) {
    if (card.id === group.id) continue;
    if ((card.x as number) >= x && (card.y as number) >= y && (card.x as number) + (card.width as number) <= right
      && (card.y as number) + (card.height as number) <= bottom) members.push(card);
  }
  return members;
}

function cardLabel(card: CardRecord): string {
  const label = card.type === "text" ? card.text : card.type === "file" ? card.file : card.type === "link" ? card.url : card.label;
  return typeof label === "string" && label.trim() !== "" ? label.split(/\r?\n/u, 1)[0].slice(0, 160) : String(card.id);
}

function unsupportedTextKind(target: ResolvedCanvasCard): string | undefined {
  const metadata = target.board.document.miroCanvas;
  const overrides = record(metadata) ? metadata.localOverrides : undefined;
  const override = record(overrides) && Object.prototype.hasOwnProperty.call(overrides, target.nodeId) ? overrides[target.nodeId] : undefined;
  if (!record(override)) return undefined;
  if (record(override.item) && ["drawing", "line"].includes(String(override.item.type))) return "drawing";
  return target.node.text === "" && record(override.shape) ? "shape" : undefined;
}

/** Replaces only Canvas card embeds; never obtains, activates or opens a Canvas leaf. */
export class BoardCardEmbeds {
  private readonly mounted = new Set<CardEmbedHandle>();
  private readonly admitted = new Set<CardEmbedHandle>();
  private readonly owners = new WeakMap<HTMLElement, RenderOwner>();
  private readonly nativeMounted = new WeakMap<HTMLElement, CardEmbedHandle>();
  private disposed = false;

  public constructor(private readonly resolver: BoardCardResolver, private readonly host: CardEmbedHost) {}

  /** Parent registers every returned handle with context.addChild/MarkdownRenderChild. */
  public postprocess(root: HTMLElement, sourcePath: string): readonly CardEmbedHandle[] {
    if (this.disposed) return [];
    const elements = Array.from(root.querySelectorAll<HTMLElement>(".internal-embed[src]"));
    if (root.matches(".internal-embed[src]")) elements.unshift(root);
    const handles: CardEmbedHandle[] = [];
    for (const element of elements) {
      const linktext = element.getAttribute("src");
      if (this.nativeOwned(element) || linktext === null
        || this.resolver.destination(linktext, sourcePath) === undefined) continue;
      const handle = this.mount(element, linktext, sourcePath);
      if (handle !== undefined) handles.push(handle);
    }
    return handles;
  }

  /** Native ctx.depth already includes this embed. Keep its container and own only a child. */
  public mountNative(
    container: HTMLElement,
    linktext: string,
    sourcePath: string,
    depth: number,
    registerCleanup?: (cleanup: Cleanup) => void,
  ): CardEmbedHandle | undefined {
    if (this.disposed || !Number.isInteger(depth) || depth < 0
      || this.resolver.destination(linktext, sourcePath) === undefined) return undefined;
    this.nativeMounted.get(container)?.dispose();
    const inherited = this.owner(container);
    const child = createHtmlElement(container.ownerDocument, "span");
    this.owners.set(child, {
      depth: Math.max(inherited.depth, Math.max(0, depth - 1)),
      ancestors: inherited.ancestors,
      registerCleanup: (cleanup) => {
        inherited.registerCleanup?.(cleanup);
        if (registerCleanup !== inherited.registerCleanup) registerCleanup?.(cleanup);
      },
    });
    container.appendChild(child);
    return this.mount(child, linktext, sourcePath, container);
  }

  private nativeOwned(element: HTMLElement): boolean {
    for (let parent: HTMLElement | null = element; parent !== null; parent = parent.parentElement) {
      if (parent.getAttribute(CARD_CREATOR_OWNER) === "true" || this.nativeMounted.has(parent)) return true;
    }
    return false;
  }

  public async refresh(): Promise<void> {
    await Promise.all([...this.mounted].map((handle) => handle.refresh()));
  }

  public dispose(): void {
    this.disposed = true;
    for (const handle of [...this.mounted]) handle.dispose();
  }

  private owner(element: HTMLElement): RenderOwner {
    for (let parent: HTMLElement | null = element; parent !== null; parent = parent.parentElement) {
      const owner = this.owners.get(parent);
      if (owner !== undefined) return owner;
    }
    return { depth: 0, ancestors: [] };
  }

  private cleanup(cleanup: Cleanup): void {
    try {
      cleanup();
    } catch {
      this.host.onDiagnostic?.("card-embed-cleanup-failed");
    }
  }

  private mount(original: HTMLElement, linktext: string, sourcePath: string, nativeContainer?: HTMLElement): CardEmbedHandle | undefined {
    const inherited = this.owner(original);
    const document = original.ownerDocument;
    const wrapper = createHtmlElement(document, "span");
    wrapper.className = "miro-canvas-card-embed";
    wrapper.setAttribute("data-card-link", linktext);
    wrapper.setAttribute("role", "group");
    let restoreOriginal: Cleanup | undefined;
    let suspensionFailed = false;
    try {
      if (nativeContainer === undefined) restoreOriginal = this.host.suspendOriginal?.(original);
    } catch {
      suspensionFailed = true;
      this.host.onDiagnostic?.("card-embed-suspend-failed");
    }
    original.replaceWith(wrapper);
    let generation = 0;
    let ready = Promise.resolve();
    let current: AbortController | undefined;
    let cleanups: Cleanup[] = [];
    let disposed = false;
    const clear = (): void => {
      current?.abort();
      for (const cleanup of cleanups.splice(0)) this.cleanup(cleanup);
      wrapper.replaceChildren();
    };
    const error = (code: CardLinkErrorCode): void => {
      current?.abort();
      for (const cleanup of cleanups.splice(0)) this.cleanup(cleanup);
      wrapper.replaceChildren();
      wrapper.textContent = this.host.labels.error(code);
      wrapper.setAttribute("data-card-state", "error");
    };
    const handle: CardEmbedHandle = {
      element: wrapper,
      get ready() { return ready; },
      refresh: async () => {
        if (disposed || this.disposed) return;
        generation += 1;
        const thisGeneration = generation;
        clear();
        current = new AbortController();
        const controller = current;
        const ownedCleanups: Cleanup[] = [];
        cleanups = ownedCleanups;
        const cleanupOwned = (): void => {
          for (const cleanup of ownedCleanups.splice(0)) this.cleanup(cleanup);
        };
        const alive = (): boolean => !disposed && !this.disposed && generation === thisGeneration && !controller.signal.aborted;
        wrapper.textContent = this.host.labels.loading;
        wrapper.setAttribute("data-card-state", "loading");
        if (suspensionFailed) {
          error("render-failed");
          return;
        }
        if (!this.admitted.has(handle) && this.admitted.size < BOARD_CARD_LINK_LIMITS.mountedEmbeds) this.admitted.add(handle);
        if (!this.admitted.has(handle)) {
          error("embed-limit");
          return;
        }
        if (inherited.depth >= BOARD_CARD_LINK_LIMITS.embedDepth) {
          error("recursion-limit");
          return;
        }
        const result = await this.resolver.resolve(linktext, sourcePath, controller.signal);
        if (!alive()) return;
        if (result.status !== "resolved") {
          error(result.status === "error" ? result.error : "unsupported-card");
          return;
        }
        const target = result.target;
        const key = `${target.path}\0${target.nodeId}`;
        if (inherited.ancestors.includes(key)) {
          error("recursion-limit");
          return;
        }
        const stage = createHtmlElement(document, "span");
        stage.className = "miro-canvas-card-embed__body";
        const context: CardRenderContext = {
          container: stage,
          sourcePath: target.path,
          signal: controller.signal,
          depth: inherited.depth + 1,
          registerCleanup: (cleanup) => {
            if (!alive()) this.cleanup(cleanup);
            else ownedCleanups.push(cleanup);
          },
        };
        this.owners.set(stage, { depth: inherited.depth + 1, ancestors: [...inherited.ancestors, key], registerCleanup: context.registerCleanup });
        try {
          if (target.node.type === "text" && unsupportedTextKind(target) === undefined) {
            if ((target.node.text as string).length > BOARD_CARD_LINK_LIMITS.cardCharacters) {
              error("too-large");
              return;
            }
            await this.host.renderMarkdown(target.node.text as string, context);
          } else if (target.node.type === "file" && typeof target.node.file === "string" && vaultPath(target.node.file)) {
            const subpath = typeof target.node.subpath === "string" ? target.node.subpath : "";
            if (subpath.length > 4096) {
              error("too-large");
              return;
            }
            const rendered = await this.host.renderFile(target.node.file, subpath, context);
            if (!rendered) {
              cleanupOwned();
              if (alive()) error("unsupported-card");
              return;
            }
          } else if (target.node.type === "group") {
            const members = groupMembers(target);
            const title = createHtmlElement(document, "strong");
            title.textContent = this.host.labels.groupTitle(typeof target.node.label === "string" ? target.node.label : "", members.length);
            stage.appendChild(title);
            const list = createHtmlElement(document, "ul");
            for (const card of members.slice(0, BOARD_CARD_LINK_LIMITS.groupItems)) {
              const item = createHtmlElement(document, "li");
              item.textContent = cardLabel(card);
              list.appendChild(item);
            }
            stage.appendChild(list);
            if (members.length > BOARD_CARD_LINK_LIMITS.groupItems) {
              const remainder = createHtmlElement(document, "span");
              remainder.textContent = this.host.labels.groupOverflow(members.length - BOARD_CARD_LINK_LIMITS.groupItems);
              stage.appendChild(remainder);
            }
          } else {
            stage.textContent = this.host.labels.unsupported(unsupportedTextKind(target) ?? String(target.node.type));
            wrapper.setAttribute("data-card-state", "unsupported");
          }
          if (!alive()) {
            cleanupOwned();
            return;
          }
          if (!this.resolver.isCurrent(target)) {
            cleanupOwned();
            error("stale");
            return;
          }
          const open = createHtmlElement(document, "a");
          const href = canvasCardLink(target.path, target.nodeId);
          if (href !== undefined) {
            open.className = "internal-link miro-canvas-card-embed__open";
            open.textContent = this.host.labels.openCard;
            open.setAttribute("href", href);
            open.setAttribute("data-href", href);
            wrapper.replaceChildren(open, stage);
          } else wrapper.replaceChildren(stage);
          if (wrapper.getAttribute("data-card-state") !== "unsupported") wrapper.setAttribute("data-card-state", "ready");
        } catch {
          cleanupOwned();
          if (alive()) error("render-failed");
        }
      },
      dispose: () => {
        if (disposed) return;
        disposed = true;
        generation += 1;
        clear();
        this.mounted.delete(handle);
        this.admitted.delete(handle);
        if (nativeContainer !== undefined) {
          wrapper.remove();
          if (this.nativeMounted.get(nativeContainer) === handle) this.nativeMounted.delete(nativeContainer);
        } else if (wrapper.parentNode !== null) wrapper.replaceWith(original);
        if (restoreOriginal !== undefined) this.cleanup(restoreOriginal);
      },
    };
    this.mounted.add(handle);
    if (nativeContainer !== undefined) this.nativeMounted.set(nativeContainer, handle);
    inherited.registerCleanup?.(() => handle.dispose());
    ready = handle.refresh();
    return handle;
  }
}
