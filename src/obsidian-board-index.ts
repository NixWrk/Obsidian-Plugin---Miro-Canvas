/** Transient Canvas metadata, attached by main after Obsidian's layout is ready. */
import type { App, CachedMetadata, EventRef, TAbstractFile, TFile } from "obsidian";
import { extractBoardKnowledge, type BoardKnowledge, type BoardReference } from "./board-knowledge";

type RecordValue = Record<string, unknown>;
type Reference = BoardKnowledge["frontmatterLinks"][number] | BoardReference;
type RefVisitor = (reference: Reference) => unknown;
type AllRefVisitor = (path: string, reference: Reference) => unknown;
type Method = (this: RecordValue, ...args: unknown[]) => unknown;

export interface BoardIndexLimits {
  debounceMs: number;
  concurrentReads: number;
  concurrentParsers: number;
  maxBoardBytes: number;
  maxNodes: number;
  maxTextCharacters: number;
}

export const DEFAULT_BOARD_INDEX_LIMITS: Readonly<BoardIndexLimits> = {
  debounceMs: 120,
  concurrentReads: 2,
  concurrentParsers: 2,
  maxBoardBytes: 16 * 1024 * 1024,
  maxNodes: 20_000,
  maxTextCharacters: 8 * 1024 * 1024,
};

export interface ObsidianBoardIndexOptions {
  limits?: Partial<BoardIndexLimits>;
  registerEvent?: (event: EventRef) => void;
  registerCleanup?: (cleanup: () => void) => void;
  onIndexed?: (file: TFile, knowledge: BoardKnowledge) => void;
  /** Detached pre-refresh caches with earlier resolvedPath values; parent owns guarded rewrites. */
  onRename?: (file: TAbstractFile, oldPath: string, boards: ReadonlyMap<string, BoardKnowledge>) => void;
  /** Debounced note metadata changes; parent may invoke the pure relation-edge plan. */
  onNotePropertiesChanged?: (files: readonly TFile[]) => void;
  /** Maintainer diagnostics; callers must translate any UI they choose to show. */
  onDiagnostic?: (code: string, path?: string) => void;
}

export interface ObsidianBoardIndex {
  readonly status: "stopped" | "ready" | "unsupported" | "disposed";
  start(): void;
  dispose(): void;
  /** Re-read one board, or all boards. No document is ever written. */
  reindex(path?: string): void;
  /** Drain the debounced batch; useful after an explicit writer transaction. */
  flush(): Promise<void>;
  getKnowledge(path: string): BoardKnowledge | undefined;
  /** Commit/Undo snapshots only. Tokens are weakly held; repeat identities are no-ops. */
  ingestLiveDocument(file: TFile, document: unknown, context: BoardLiveDocumentContext): "published" | "unchanged" | "refused";
  /** Release only this view's authority; a newer view owner is unaffected. */
  releaseLiveDocument(file: TFile, owner: object): void;
}

export interface BoardLiveDocumentContext {
  readonly owner: object;
  /** Fresh after a committed metadata/text change, Undo or Redo; never a preview. */
  readonly identity: object;
}

function record(value: unknown): value is RecordValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function canvasFile(file: TAbstractFile): file is TFile {
  return "extension" in file && file.extension === "canvas" && "stat" in file;
}

interface Runtime {
  cache: RecordValue;
  resolved: RecordValue;
  unresolved: RecordValue;
  refNodeIds: WeakMap<object, string>;
  original: Record<string, Method>;
  canvasIndex: RecordValue;
  originalIndexGet: Method;
}

function optionalMethod(target: object, name: string): "absent" | "method" | "unsupported" {
  let prototype: object | null = target;
  const inspected = new Set<object>();
  for (let depth = 0; prototype; depth++) {
    if (depth >= 8 || inspected.has(prototype)) return "unsupported";
    inspected.add(prototype);
    const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
    if (descriptor) return "value" in descriptor && typeof descriptor.value === "function" ? "method" : "unsupported";
    prototype = Object.getPrototypeOf(prototype) as object | null;
  }
  return "absent";
}

/** Guard the observed private shape before installing any hooks. */
function probe(metadataCache: unknown): Runtime | undefined {
  if (!metadataCache || typeof metadataCache !== "object") return undefined;
  const cache = metadataCache as RecordValue;
  if (!record(cache.fileCache) || !record(cache.metadataCache)
    || !record(cache.resolvedLinks) || !record(cache.unresolvedLinks)) return undefined;
  const updaters = cache.linkUpdaters;
  if (!record(updaters)) return undefined;
  const updater = updaters.canvas;
  if (!updater || typeof updater !== "object") return undefined;
  const canvas = (updater as RecordValue).canvas;
  if (!canvas || typeof canvas !== "object") return undefined;
  const index = (canvas as RecordValue).index;
  if (!index || typeof index !== "object") return undefined;
  const refNodeIds = (index as RecordValue).refNodeIds;
  if (!(refNodeIds instanceof WeakMap)) return undefined;
  const canvasIndex = index as RecordValue;
  if (typeof canvasIndex.getForPath !== "function") return undefined;
  const indexDescriptor = Object.getOwnPropertyDescriptor(canvasIndex, "getForPath");
  if (indexDescriptor && (!indexDescriptor.configurable || indexDescriptor.get || indexDescriptor.set)) return undefined;
  if (!indexDescriptor && !Object.isExtensible(canvasIndex)) return undefined;
  const names = ["getCache", "getLinks", "iterateAllRefs", "iterateRefsForFile", "trigger"];
  // 1.13.8 consumers use getFileCache/getCache; the newer iterator is absent.
  for (const name of ["iterateFileCache", "getTags"]) {
    const optional = optionalMethod(cache, name);
    if (optional === "unsupported") return undefined;
    if (optional === "method") names.push(name);
  }
  if (names.includes("getTags") && optionalMethod(cache, "isUserIgnored") !== "method") return undefined;
  const original: Record<string, Method> = Object.create(null) as Record<string, Method>;
  for (const name of names) {
    if (typeof cache[name] !== "function") return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(cache, name);
    if (descriptor && (!descriptor.configurable || descriptor.get || descriptor.set)) return undefined;
    if (!descriptor && !Object.isExtensible(cache)) return undefined;
    original[name] = cache[name] as Method;
  }
  return { cache, resolved: cache.resolvedLinks, unresolved: cache.unresolvedLinks,
    refNodeIds: refNodeIds as WeakMap<object, string>, original, canvasIndex,
    originalIndexGet: canvasIndex.getForPath as Method };
}

interface NodeMemo {
  text: string;
  metadata: CachedMetadata;
  native: boolean;
}

interface LiveDocument {
  file: TFile;
  owner: number;
  identity: number;
  projection: RecordValue;
}

interface Entry {
  file: TFile;
  knowledge: BoardKnowledge;
  memo: Map<string, NodeMemo>;
  refs: Reference[];
  registeredRefs: Map<object, string>;
}

interface OwnedRow {
  target: RecordValue;
  path: string;
  previous: unknown;
  hadPrevious: boolean;
  installed: unknown;
}

function boundedLimits(overrides: Partial<BoardIndexLimits> | undefined): BoardIndexLimits {
  const limits = { ...DEFAULT_BOARD_INDEX_LIMITS };
  for (const key of Object.keys(limits) as (keyof BoardIndexLimits)[]) {
    const value = overrides?.[key];
    if (value !== undefined && Number.isFinite(value) && value >= (key === "debounceMs" ? 0 : 1)) {
      limits[key] = Math.min(Math.floor(value), DEFAULT_BOARD_INDEX_LIMITS[key]);
    }
  }
  return limits;
}

/** Copies only index inputs; irrelevant source/geometry is never traversed. */
function liveProjection(input: unknown, limits: BoardIndexLimits): RecordValue {
  const field = (value: RecordValue, key: string): unknown => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && !("value" in descriptor)) throw new Error("board-live-accessor");
    return descriptor?.value;
  };
  if (!record(input)) throw new Error("board-document-invalid");
  const rawNodes = field(input, "nodes");
  const rawEdges = field(input, "edges");
  if (!Array.isArray(rawNodes) || !Array.isArray(rawEdges)) throw new Error("board-document-invalid");
  if (rawNodes.length > limits.maxNodes) throw new Error("board-node-limit");
  let characters = 0;
  let values = 0;
  const visiting = new Set<object>();
  const copy = (value: unknown, depth = 0): unknown => {
    if (++values > 131072 || depth > 128) throw new Error("board-live-value-limit");
    if (typeof value === "string") {
      characters += value.length;
      if (characters > limits.maxBoardBytes) throw new Error("board-byte-limit");
      return value;
    }
    if (value === null || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) return value;
    if ((!Array.isArray(value) && !record(value)) || visiting.has(value)) throw new Error("board-live-json-invalid");
    visiting.add(value);
    const result: RecordValue | unknown[] = Array.isArray(value) ? [] : {};
    if (Array.isArray(value) && value.length > 131072) throw new Error("board-live-value-limit");
    for (const key of Reflect.ownKeys(value)) {
      if (Array.isArray(value) && key === "length") continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable) continue;
      if (typeof key !== "string" || !("value" in descriptor)) throw new Error("board-live-accessor");
      characters += key.length;
      if (characters > limits.maxBoardBytes) throw new Error("board-byte-limit");
      Object.defineProperty(result, key, { value: copy(descriptor.value, depth + 1), enumerable: true, configurable: true, writable: true });
    }
    if (Array.isArray(value) && (result as unknown[]).length !== value.length) throw new Error("board-live-json-invalid");
    visiting.delete(value);
    return result;
  };
  let textCharacters = 0;
  const nodes = rawNodes.map((raw: unknown) => {
    if (!record(raw)) throw new Error("board-document-invalid");
    const node: RecordValue = { id: copy(field(raw, "id")), type: copy(field(raw, "type")) };
    const names = node.type === "text" ? ["text"] : node.type === "file" ? ["file", "subpath"] : node.type === "group" ? ["background"] : [];
    for (const key of names) {
      const value = field(raw, key);
      if (value !== undefined) node[key] = copy(value);
    }
    if (node.type === "text" && typeof node.text === "string") textCharacters += node.text.length;
    if (textCharacters > limits.maxTextCharacters) throw new Error("board-text-limit");
    return node;
  });
  // Connections do not contribute metadata references; validate their small native shape only.
  if (rawEdges.length > 131072) throw new Error("board-live-value-limit");
  const ids = new Set<string>();
  for (const edge of rawEdges) {
    if (!record(edge)) throw new Error("board-document-invalid");
    const id = field(edge, "id");
    if (typeof id !== "string" || !id || ids.has(id) || typeof field(edge, "fromNode") !== "string" || typeof field(edge, "toNode") !== "string") throw new Error("board-document-invalid");
    ids.add(id);
  }
  const projection: RecordValue = { nodes, edges: [] };
  const metadata = field(input, "miroCanvas");
  const properties = record(metadata) ? field(metadata, "properties") : undefined;
  const redirects = record(metadata) ? field(metadata, "nodeRedirects") : undefined;
  if (properties !== undefined || redirects !== undefined) {
    projection.miroCanvas = { ...(properties === undefined ? {} : { properties: copy(properties) }),
      ...(redirects === undefined ? {} : { nodeRedirects: copy(redirects) }) };
  }
  if (!record(properties)) {
    const imported = field(input, "metadata");
    const frontmatter = record(imported) ? field(imported, "frontmatter") : undefined;
    if (frontmatter !== undefined) projection.metadata = { frontmatter: copy(frontmatter) };
  }
  return projection;
}

function mergeNodeMetadata(knowledge: BoardKnowledge, nodes: readonly unknown[], memo: Map<string, NodeMemo>): void {
  const textIds = new Set(memo.keys());
  const links = knowledge.links.filter(ref => !textIds.has(ref.position.nodeId ?? ""));
  const embeds = knowledge.embeds.filter(ref => !textIds.has(ref.position.nodeId ?? ""));
  const tags = knowledge.tags.filter(tag => !textIds.has(tag.position.nodeId ?? ""));
  for (const node of nodes) {
    if (!record(node) || typeof node.id !== "string") continue;
    const metadata = memo.get(node.id)?.metadata;
    if (!metadata) continue;
    const project = (ref: CachedMetadata["links"] extends (infer Item)[] | undefined ? Item : never): BoardReference => ({
      ...ref, displayText: ref.displayText ?? ref.link, position: { ...ref.position, nodeId: node.id as string },
    });
    const nodeLinks = (metadata.links ?? []).map(project);
    const nodeEmbeds = (metadata.embeds ?? []).map(project);
    const nodeTags = (metadata.tags ?? []).map(tag => ({ ...tag, position: { ...tag.position, nodeId: node.id as string } }));
    const propertyRefs = (metadata.frontmatterLinks ?? []).map(ref => ({ ...ref, displayText: ref.displayText ?? ref.link, nodeId: node.id as string }));
    links.push(...nodeLinks);
    embeds.push(...nodeEmbeds);
    tags.push(...nodeTags);
    knowledge.frontmatterLinks.push(...propertyRefs);
    knowledge.nodes[node.id] = { ...knowledge.nodes[node.id], ...metadata, links: nodeLinks, embeds: nodeEmbeds, tags: nodeTags, frontmatterLinks: propertyRefs };
  }
  knowledge.links = links;
  knowledge.embeds = embeds;
  knowledge.tags = tags;
}

/** Instance hooks and maps only; no cache database, filesystem writes, or settings. */
export function createObsidianBoardIndex(
  app: Pick<App, "vault" | "metadataCache">,
  options: ObsidianBoardIndexOptions = {},
): ObsidianBoardIndex {
  const limits = boundedLimits(options.limits);
  const timerOwner = window;
  const entries = new Map<string, Entry>();
  const generations = new Map<string, number>();
  const pending = new Map<string, TFile>();
  const liveDocuments = new Map<string, LiveDocument>();
  const tokens = new WeakMap<object, number>();
  let nextToken = 0;
  const token = (identity: object): number => {
    let stamp = tokens.get(identity);
    if (stamp === undefined) { stamp = ++nextToken; tokens.set(identity, stamp); }
    return stamp;
  };
  const noteChanges = new Map<string, TFile>();
  const removers: (() => void)[] = [];
  const hooks: (() => void)[] = [];
  const rows = new Map<string, OwnedRow>();
  let runtime: Runtime | undefined;
  let status: ObsidianBoardIndex["status"] = "stopped";
  let timer: number | undefined;
  let draining: Promise<void> | undefined;
  let refreshResolution = false;
  let tagReads: Set<string> | undefined;
  let parserCount = 0;
  const parserWaiters: (() => void)[] = [];

  const diagnose = (code: string, path?: string): void => {
    try { options.onDiagnostic?.(code, path); } catch { /* Diagnostics cannot change indexing. */ }
  };
  const notify = (name: string, ...args: unknown[]): void => {
    if (status !== "ready" || !runtime) return;
    try { runtime.original.trigger.call(runtime.cache, name, ...args); } catch { diagnose("metadata-event-failed"); }
  };
  const bump = (path: string): number => {
    const generation = (generations.get(path) ?? 0) + 1;
    generations.set(path, generation);
    return generation;
  };
  const visible = (path: string): Entry | undefined => {
    const entry = entries.get(path);
    if (!entry || status !== "ready" || !runtime) return undefined;
    const native: unknown = runtime.original.getCache.call(runtime.cache, path);
    // A cache supplied by a newer app or another plugin belongs to that owner.
    return native === null || (record(native) && Object.keys(native).length === 0) ? entry : undefined;
  };
  const releaseRows = (path: string): void => {
    for (const key of ["resolved", "unresolved"]) {
      const id = `${key}:${path}`;
      const row = rows.get(id);
      if (!row) continue;
      if (row.target[path] === row.installed) {
        if (row.hadPrevious) row.target[path] = row.previous;
        else delete row.target[path];
      }
      rows.delete(id);
    }
  };
  const release = (path: string): void => {
    const entry = entries.get(path);
    if (entry && runtime) {
      for (const [reference, id] of entry.registeredRefs) {
        if (runtime.refNodeIds.get(reference) === id) runtime.refNodeIds.delete(reference);
      }
    }
    entries.delete(path);
    releaseRows(path);
  };
  const ownRow = (target: RecordValue, key: string, path: string, installed: unknown): void => {
    const id = `${key}:${path}`;
    const existing = rows.get(id);
    if (!existing || existing.target !== target || target[path] !== existing.installed) {
      rows.set(id, { target, path, previous: target[path], hadPrevious: Object.prototype.hasOwnProperty.call(target, path), installed });
    } else existing.installed = installed;
    target[path] = installed;
  };
  const resolve = (path: string, entry: Entry): void => {
    if (!runtime || !visible(path)) return;
    if (runtime.cache.resolvedLinks !== runtime.resolved || runtime.cache.unresolvedLinks !== runtime.unresolved) {
      diagnose("metadata-map-replaced", path);
      return;
    }
    // Native backlink consumers call row.hasOwnProperty(), so rows need Object.prototype.
    const resolved: Record<string, number> = {};
    const unresolved: Record<string, number> = {};
    for (const ref of entry.refs) {
      const linkpath = ref.link.split("#", 1)[0];
      const target = app.metadataCache.getFirstLinkpathDest(linkpath, path);
      if (target) ref.resolvedPath = target.path;
      else delete ref.resolvedPath;
      const map = target ? resolved : unresolved;
      const key = target?.path ?? linkpath.replace(/\.md$/iu, "");
      const count = Object.prototype.hasOwnProperty.call(map, key) ? map[key] : 0;
      Object.defineProperty(map, key, { value: count + 1, configurable: true, enumerable: true, writable: true });
    }
    ownRow(runtime.resolved, "resolved", path, resolved);
    ownRow(runtime.unresolved, "unresolved", path, unresolved);
    notify("resolve", entry.file);
  };
  const schedule = (): void => {
    if (status !== "ready" || timer !== undefined) return;
    timer = timerOwner.setTimeout(() => {
      timer = undefined;
      void flush().catch(() => diagnose("board-index-batch-failed"));
    }, limits.debounceMs);
  };
  const enqueue = (file: TFile): void => {
    if (status !== "ready") return;
    bump(file.path);
    pending.set(file.path, file);
    schedule();
  };
  const parse = async (text: string): Promise<CachedMetadata> => {
    if (!runtime || typeof runtime.cache.computeMetadataAsync !== "function") return {};
    while (parserCount >= limits.concurrentParsers && status === "ready") {
      await new Promise<void>(accept => parserWaiters.push(accept));
    }
    if (status !== "ready") return {};
    parserCount++;
    try {
      const bytes = new TextEncoder().encode(text);
      const parsed: unknown = await (runtime.cache.computeMetadataAsync as Method).call(runtime.cache, bytes.buffer);
      if (!record(parsed)) throw new Error("native-parser-result-invalid");
      return parsed;
    } finally {
      parserCount--;
      parserWaiters.shift()?.();
    }
  };
  const publish = (path: string, file: TFile, knowledge: BoardKnowledge, memo: Map<string, NodeMemo>, data?: string): boolean => {
    const native: unknown = runtime?.original.getCache.call(runtime.cache, path);
    if (native !== null && (!record(native) || Object.keys(native).length > 0)) {
      release(path);
      diagnose("board-cache-already-owned", path);
      return false;
    }
    release(path);
    const refs: Reference[] = [...knowledge.links, ...knowledge.embeds, ...knowledge.frontmatterLinks];
    const registeredRefs = new Map<object, string>();
    const entry: Entry = { file, knowledge, memo, refs, registeredRefs };
    entries.set(path, entry);
    for (const ref of knowledge.links.concat(knowledge.embeds)) {
      const id = ref.position.nodeId;
      if (id && memo.has(id)) {
        runtime?.refNodeIds.set(ref, id);
        registeredRefs.set(ref, id);
      }
    }
    for (const ref of knowledge.frontmatterLinks) {
      const id = (ref as unknown as RecordValue).nodeId;
      if (typeof id === "string" && memo.has(id)) {
        runtime?.refNodeIds.set(ref, id);
        registeredRefs.set(ref, id);
      }
    }
    resolve(path, entry);
    // SDK changed requires genuine file text. Live snapshots have no fabricated raw payload.
    if (data !== undefined) notify("changed", file, data, knowledge);
    try { options.onIndexed?.(file, knowledge); } catch { diagnose("board-index-callback-failed", path); }
    return true;
  };
  const index = async (path: string, file: TFile): Promise<void> => {
    const generation = generations.get(path);
    const live = liveDocuments.get(path);
    const mtime = file.stat.mtime;
    const size = file.stat.size;
    const current = (): boolean => status === "ready" && file.path === path
      && generations.get(path) === generation && app.vault.getAbstractFileByPath(path) === file
      && liveDocuments.get(path) === live;
    try {
      if (!live && size > limits.maxBoardBytes) throw new Error("board-byte-limit");
      const data = live ? undefined : await app.vault.cachedRead(file);
      if (!current()) return;
      if (data !== undefined && data.length > limits.maxBoardBytes) throw new Error("board-byte-limit");
      const document: unknown = live?.projection ?? JSON.parse(data!);
      if (!record(document) || !Array.isArray(document.nodes)) throw new Error("board-document-invalid");
      if (document.nodes.length > limits.maxNodes) throw new Error("board-node-limit");
      let characters = 0;
      for (const node of document.nodes) {
        if (record(node) && node.type === "text" && typeof node.text === "string") characters += node.text.length;
      }
      if (characters > limits.maxTextCharacters) throw new Error("board-text-limit");
      const knowledge = extractBoardKnowledge(document);
      if (!knowledge) throw new Error("board-document-invalid");
      const old = entries.get(path);
      const memo = new Map<string, NodeMemo>();
      if (runtime && typeof runtime.cache.computeMetadataAsync === "function") {
        for (const node of document.nodes) {
          if (!record(node) || node.type !== "text" || typeof node.id !== "string" || typeof node.text !== "string") continue;
          const previous = old?.memo.get(node.id);
          const metadata = previous?.text === node.text && previous.native ? previous.metadata : await parse(node.text);
          if (!current()) return;
          memo.set(node.id, { text: node.text, metadata, native: true });
        }
        mergeNodeMetadata(knowledge, document.nodes, memo);
      } else if (live) {
        for (const node of document.nodes) {
          if (record(node) && node.type === "text" && typeof node.id === "string" && typeof node.text === "string") {
            memo.set(node.id, { text: node.text, metadata: knowledge.nodes[node.id], native: false });
          }
        }
      }
      if (!current()) return;
      if (!live && (file.stat.mtime !== mtime || file.stat.size !== size)) {
        enqueue(file);
        return;
      }
      publish(path, file, knowledge, memo, data);
    } catch (error) {
      if (!current()) return;
      // A native refinement failure must not discard a valid committed pure live projection.
      if (!live) release(path);
      diagnose(error instanceof Error ? error.message : "board-index-failed", path);
      notify("resolve", file);
    }
  };
  async function flush(): Promise<void> {
    if (timer !== undefined) {
      timerOwner.clearTimeout(timer);
      timer = undefined;
    }
    if (draining) {
      await draining;
      if (status === "ready" && (pending.size || refreshResolution || noteChanges.size)) await flush();
      return;
    }
    if (status !== "ready") return;
    draining = (async () => {
      while (status === "ready" && (pending.size || refreshResolution || noteChanges.size)) {
        const batch = [...pending];
        pending.clear();
        let next = 0;
        await Promise.all(Array.from({ length: Math.min(batch.length, limits.concurrentReads) }, async () => {
          while (next < batch.length && status === "ready") {
            const [path, file] = batch[next++];
            await index(path, file);
          }
        }));
        if (status !== "ready") break;
        if (refreshResolution) {
          refreshResolution = false;
          for (const [path, entry] of entries) resolve(path, entry);
        }
        if (noteChanges.size) {
          const files = [...noteChanges.values()].filter(file => app.vault.getAbstractFileByPath(file.path) === file);
          noteChanges.clear();
          try { if (files.length) options.onNotePropertiesChanged?.(files); } catch { diagnose("note-properties-callback-failed"); }
        }
        notify("resolved");
      }
    })();
    try { await draining; } finally { draining = undefined; }
  }

  const install = (name: string, implementation: Method): void => {
    if (!runtime) return;
    const target = runtime.cache;
    const descriptor = Object.getOwnPropertyDescriptor(target, name);
    const original = runtime.original[name];
    const wrapped: Method = function (...args) {
      return status === "ready" ? implementation.apply(this, args) : original.apply(this, args);
    };
    Object.defineProperty(target, name, { value: wrapped, configurable: true, writable: true });
    hooks.push(() => {
      if (target[name] !== wrapped) return;
      if (descriptor) Object.defineProperty(target, name, descriptor);
      else delete target[name];
    });
  };
  const listen = (name: "create" | "modify" | "delete" | "rename", callback: (file: TAbstractFile, oldPath?: string) => void): void => {
    const event = app.vault.on(name as "rename", callback);
    removers.push(() => app.vault.offref(event));
    options.registerEvent?.(event);
  };

  const api: ObsidianBoardIndex = {
    get status() { return status; },
    start() {
      if (status !== "stopped") return;
      runtime = probe(app.metadataCache);
      if (!runtime) {
        status = "unsupported";
        diagnose("metadata-private-shape-unsupported");
        return;
      }
      status = "ready";
      try {
        const target = runtime.canvasIndex;
        const descriptor = Object.getOwnPropertyDescriptor(target, "getForPath");
        const originalIndexGet = runtime.originalIndexGet;
        const getForPath: Method = function (path) {
          const native: unknown = originalIndexGet.call(this, path);
          const entry = typeof path === "string" ? visible(path) : undefined;
          if (!entry || (native !== null && !record(native))) return native;
          const originalEmbeds: readonly unknown[] = record(native) && Array.isArray(native.embeds) ? native.embeds : [];
          const properties = entry.knowledge.frontmatterLinks.filter(ref => !(ref as unknown as RecordValue).nodeId).map(ref => {
            const split = ref.link.indexOf("#");
            return { file: split < 0 ? ref.link : ref.link.slice(0, split), subpath: split < 0 ? "" : ref.link.slice(split) };
          });
          const nativeCaches = record(native) && record(native.caches) ? native.caches : {};
          const caches = { ...nativeCaches };
          for (const id of entry.memo.keys()) {
            Object.defineProperty(caches, id, { value: entry.knowledge.nodes[id], configurable: true, enumerable: true, writable: true });
          }
          // The native Canvas backlink renderer treats caches as text-card ranges.
          return { ...(record(native) ? native : {}), caches, embeds: [...originalEmbeds, ...properties] };
        };
        Object.defineProperty(target, "getForPath", { value: getForPath, configurable: true, writable: true });
        hooks.push(() => {
          if (target.getForPath !== getForPath) return;
          if (descriptor) Object.defineProperty(target, "getForPath", descriptor);
          else delete target.getForPath;
        });
        install("getCache", function (path) {
          const entry = typeof path === "string" ? visible(path) : undefined;
          if (entry && typeof path === "string") { tagReads?.add(path); return entry.knowledge; }
          return runtime?.original.getCache.call(this, path);
        });
        install("getLinks", function (...args) {
          const native: unknown = runtime?.original.getLinks.apply(this, args);
          if (!record(native)) return native;
          const result = { ...native };
          for (const [path, entry] of entries) if (visible(path)) result[path] = [...entry.knowledge.links, ...entry.knowledge.embeds];
          return result;
        });
        if (runtime.original.iterateFileCache) install("iterateFileCache", function (callback) {
          if (typeof callback !== "function") return runtime?.original.iterateFileCache.call(this, callback);
          const visit = callback as (path: string, cache: unknown) => unknown;
          runtime?.original.iterateFileCache.call(this, (path: string, cache: unknown) => {
            if (!visible(path)) return visit(path, cache);
          });
          for (const [path, entry] of entries) if (visible(path)) { tagReads?.add(path); visit(path, entry.knowledge); }
        });
        if (runtime.original.getTags) install("getTags", function (...args) {
          const previousReads = tagReads;
          const read = new Set<string>();
          tagReads = read;
          let native: unknown;
          try { native = runtime?.original.getTags.apply(this, args); }
          finally { tagReads = previousReads; for (const path of read) previousReads?.add(path); }
          if (!record(native) || !runtime || typeof runtime.cache.isUserIgnored !== "function") return native;
          const counts = new Map<string, number>();
          let visits = 0;
          let characters = 0;
          const visit = (): void => { if (++visits > 131072) throw new Error("board-tag-limit"); };
          const add = (tag: string, count = 1): void => {
            visit();
            if ((characters += tag.length) > limits.maxTextCharacters) throw new Error("board-tag-limit");
            counts.set(tag, (counts.get(tag) ?? 0) + count);
          };
          const addNested = (tag: string): void => {
            if (typeof tag !== "string" || !tag.startsWith("#")) throw new Error("board-tag-projection-invalid");
            let current = tag.endsWith("/") ? tag.slice(0, -1) : tag;
            while (current) {
              add(current);
              const slash = current.lastIndexOf("/");
              if (slash < 0) break;
              current = current.slice(0, slash);
            }
          };
          try {
            for (const key in native) if (Object.prototype.hasOwnProperty.call(native, key)) {
              const descriptor = Object.getOwnPropertyDescriptor(native, key);
              if (!descriptor || !("value" in descriptor)) return native;
              const value: unknown = descriptor.value;
              if (!key.startsWith("#") || typeof value !== "number" || !Number.isFinite(value) || value < 0) return native;
              add(key, value);
            }
            for (const [path, entry] of entries) {
              visit();
              if (read.has(path) || !visible(path) || (runtime.cache.isUserIgnored as Method).call(runtime.cache, path)) continue;
              const rowDescriptor = Object.getOwnPropertyDescriptor(runtime.cache.fileCache, path);
              if (rowDescriptor && !("value" in rowDescriptor)) continue;
              const fileRow: unknown = rowDescriptor?.value;
              const hashDescriptor = record(fileRow) ? Object.getOwnPropertyDescriptor(fileRow, "hash") : undefined;
              if (hashDescriptor && !("value" in hashDescriptor)) continue;
              const hash: unknown = hashDescriptor?.value;
              if (typeof hash === "string" && Object.getOwnPropertyDescriptor(runtime.cache.metadataCache, hash)) continue;
              for (const tag of entry.knowledge.tags) addNested(tag.tag);
              for (const node of Object.values(entry.knowledge.nodes)) {
                visit();
                const frontmatter = node.frontmatter;
                if (!frontmatter) continue;
                const tags = extractBoardKnowledge({ nodes: [], edges: [], miroCanvas: { properties: { tags: frontmatter.tags ?? frontmatter.tag ?? [] } } });
                for (const tag of tags?.tags ?? []) addNested(tag.tag);
              }
            }
            const folded = new Map<string, { tag: string; count: number; maximum: number }>();
            for (const [tag, count] of counts) {
              const key = tag.toLowerCase();
              const previous = folded.get(key);
              if (!previous) folded.set(key, { tag, count, maximum: count });
              else { previous.count += count; if (count > previous.maximum) { previous.tag = tag; previous.maximum = count; } }
            }
            return Object.fromEntries([...folded.values()].map(value => [value.tag, value.count]));
          } catch (error) {
            diagnose(error instanceof Error ? error.message : "board-tags-failed");
            return native;
          }
        });
        install("iterateAllRefs", function (callback) {
          if (typeof callback !== "function") return runtime?.original.iterateAllRefs.call(this, callback);
          const visit = callback as AllRefVisitor;
          runtime?.original.iterateAllRefs.call(this, (path: string, ref: Reference) => {
            if (!visible(path)) return visit(path, ref);
          });
          for (const [path, entry] of entries) if (visible(path)) for (const ref of entry.refs) visit(path, ref);
        });
        install("iterateRefsForFile", function (file, callback) {
          const path = file && typeof file === "object" ? (file as RecordValue).path : undefined;
          const entry = typeof path === "string" ? visible(path) : undefined;
          if (!entry || typeof callback !== "function") return runtime?.original.iterateRefsForFile.call(this, file, callback);
          for (const ref of entry.refs) (callback as RefVisitor)(ref);
        });
        listen("modify", file => { if (canvasFile(file)) enqueue(file); });
        listen("create", file => {
          if (canvasFile(file)) enqueue(file);
          refreshResolution = true;
          schedule();
        });
        listen("delete", file => {
          const prefix = `${file.path}/`;
          for (const path of new Set([...entries.keys(), ...pending.keys(), ...generations.keys(), ...liveDocuments.keys()])) {
            if (path === file.path || path.startsWith(prefix)) {
              bump(path);
              pending.delete(path);
              liveDocuments.delete(path);
              release(path);
            }
          }
          refreshResolution = true;
          schedule();
        });
        listen("rename", (file, oldPath) => {
          if (!oldPath) return;
          if (options.onRename) {
            const snapshot = new Map<string, BoardKnowledge>();
            for (const [path, entry] of entries) {
              try { snapshot.set(path, structuredClone(entry.knowledge)); }
              catch { diagnose("board-rename-snapshot-failed", path); }
            }
            try { options.onRename(file, oldPath, snapshot); } catch { diagnose("board-rename-callback-failed", oldPath); }
          }
          for (const path of new Set([...entries.keys(), ...pending.keys(), ...generations.keys(), ...liveDocuments.keys()])) {
            if (path === oldPath || path.startsWith(`${oldPath}/`)) {
              const newPath = file.path + path.slice(oldPath.length);
              for (const key of ["resolved", "unresolved"]) {
                const row = rows.get(`${key}:${path}`);
                if (row && row.target[newPath] === row.installed) {
                  if (row.hadPrevious) row.target[newPath] = row.previous;
                  else delete row.target[newPath];
                }
              }
              bump(path);
              pending.delete(path);
              liveDocuments.delete(path);
              release(path);
            }
          }
          // Folder renames can move several boards. cachedRead is bounded by the queue.
          for (const board of app.vault.getFiles()) {
            if (canvasFile(board) && (board.path === file.path || board.path.startsWith(`${file.path}/`))) enqueue(board);
          }
          refreshResolution = true;
          schedule();
        });
        const changed = app.metadataCache.on("changed", file => {
          if (status !== "ready" || file.extension !== "md" || !options.onNotePropertiesChanged) return;
          noteChanges.set(file.path, file);
          schedule();
        });
        removers.push(() => app.metadataCache.offref(changed));
        options.registerEvent?.(changed);
        const resolved = app.metadataCache.on("resolved", () => {
          if (status !== "ready") return;
          // Native resolution also uses our iterator; only restore displaced owned rows.
          for (const [path, entry] of entries) {
            const row = rows.get(`resolved:${path}`);
            if (!row || runtime?.resolved[path] !== row.installed) resolve(path, entry);
          }
        });
        removers.push(() => app.metadataCache.offref(resolved));
        options.registerEvent?.(resolved);
        options.registerCleanup?.(() => api.dispose());
        api.reindex();
      } catch {
        api.dispose();
        diagnose("metadata-hook-install-failed");
      }
    },
    dispose() {
      if (status === "disposed") return;
      status = "disposed";
      if (timer !== undefined) timerOwner.clearTimeout(timer);
      timer = undefined;
      pending.clear();
      liveDocuments.clear();
      noteChanges.clear();
      refreshResolution = false;
      for (const remove of removers.splice(0)) remove();
      for (const path of [...entries.keys()]) release(path);
      for (const unhook of hooks.splice(0).reverse()) unhook();
      for (const accept of parserWaiters.splice(0)) accept();
      generations.clear();
    },
    reindex(path) {
      if (status !== "ready") return;
      if (path !== undefined) {
        const file = app.vault.getAbstractFileByPath(path);
        if (file && canvasFile(file)) enqueue(file);
      } else {
        for (const file of app.vault.getFiles()) if (canvasFile(file)) enqueue(file);
      }
    },
    flush,
    getKnowledge(path) { return entries.get(path)?.knowledge; },
    ingestLiveDocument(file, document, context) {
      if (status !== "ready" || !runtime || !file || typeof file !== "object" || !canvasFile(file)
        || !context || typeof context !== "object" || app.vault.getAbstractFileByPath(file.path) !== file) return "refused";
      const owner: unknown = Object.getOwnPropertyDescriptor(context, "owner")?.value;
      const identity: unknown = Object.getOwnPropertyDescriptor(context, "identity")?.value;
      if (!owner || typeof owner !== "object" || !identity || typeof identity !== "object") return "refused";
      const path = file.path;
      const ownerId = token(owner);
      const identityId = token(identity);
      const previous = liveDocuments.get(path);
      if (previous?.file === file && previous.owner === ownerId && previous.identity === identityId) return "unchanged";
      try {
        const projection = liveProjection(document, limits);
        const knowledge = extractBoardKnowledge(projection);
        if (!knowledge) throw new Error("board-document-invalid");
        const old = entries.get(path);
        const memo = new Map<string, NodeMemo>();
        for (const node of projection.nodes as RecordValue[]) {
          if (node.type !== "text" || typeof node.id !== "string" || typeof node.text !== "string") continue;
          const cached = old?.memo.get(node.id);
          memo.set(node.id, cached?.text === node.text && cached.native ? cached
            : { text: node.text, metadata: knowledge.nodes[node.id], native: false });
        }
        mergeNodeMetadata(knowledge, projection.nodes as unknown[], memo);
        const live: LiveDocument = { file, owner: ownerId, identity: identityId, projection };
        liveDocuments.set(path, live);
        bump(path);
        pending.delete(path);
        if (!publish(path, file, knowledge, memo)) { liveDocuments.delete(path); return "refused"; }
        // A reentrant parent notification may have submitted a newer revision or disposed.
        if (status === "ready" && liveDocuments.get(path) === live) {
          if (typeof runtime.cache.computeMetadataAsync === "function" && [...memo.values()].some(item => !item.native)) {
            pending.set(path, file);
            schedule();
          }
          notify("resolved");
        }
        return "published";
      } catch (error) {
        diagnose(error instanceof Error ? error.message : "board-live-index-failed", path);
        return "refused";
      }
    },
    releaseLiveDocument(file, owner) {
      if (status !== "ready" || !owner || typeof owner !== "object") return;
      const live = liveDocuments.get(file.path);
      if (!live || live.file !== file || live.owner !== tokens.get(owner)) return;
      liveDocuments.delete(file.path);
      bump(file.path);
      pending.delete(file.path);
      if (app.vault.getAbstractFileByPath(file.path) === file) enqueue(file);
    },
  };
  return api;
}
