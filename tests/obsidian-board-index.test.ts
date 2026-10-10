import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { App, TFile } from "obsidian";
import { createObsidianBoardIndex } from "../src/obsidian-board-index";
import { extractMarkdownKnowledge, type BoardKnowledge } from "../src/board-knowledge";
import { planBoardLinkRename } from "../src/board-link-lifecycle";

beforeAll(() => vi.stubGlobal("window", { setTimeout, clearTimeout }));
afterAll(() => vi.unstubAllGlobals());

function events() {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  return {
    on(name: string, fn: (...args: unknown[]) => void) {
      const set = listeners.get(name) ?? new Set();
      listeners.set(name, set);
      set.add(fn);
      return { name, fn };
    },
    offref(ref: { name: string; fn: (...args: unknown[]) => void }) { listeners.get(ref.name)?.delete(ref.fn); },
    trigger(name: string, ...args: unknown[]) { for (const fn of listeners.get(name) ?? []) fn(...args); },
    count() { return [...listeners.values()].reduce((sum, set) => sum + set.size, 0); },
  };
}

function host(documents: Record<string, unknown> = { "board.canvas": {
  nodes: [{ id: "text", type: "text", text: "[[Target#Heading]] ![[Missing#^block]] #project" },
    { id: "file", type: "file", file: "Target.md", subpath: "#^block" }],
  edges: [], miroCanvas: { properties: { related: "[[Target]]", aliases: ["Board alias"], tags: ["board"] } },
} }) {
  const files = new Map<string, TFile>();
  const data = new Map<string, string>();
  for (const [path, document] of Object.entries(documents)) {
    const value = JSON.stringify(document);
    data.set(path, value);
    files.set(path, { path, name: path.split("/").at(-1), extension: path.split(".").at(-1), stat: { mtime: 1, size: value.length } } as TFile);
  }
  files.set("Target.md", { path: "Target.md", extension: "md", stat: { mtime: 1, size: 0 } } as TFile);
  const vault = {
    ...events(), getFiles: () => [...files.values()], getAbstractFileByPath: (path: string) => files.get(path),
    cachedRead: vi.fn(async (file: TFile) => data.get(file.path)!),
  };
  const nativeCache: Record<string, unknown> = {};
  const nativeRefs: Record<string, unknown[]> = {};
  const refNodeIds = new WeakMap<object, string>();
  const cache = {
    ...events(), fileCache: {}, metadataCache: {}, resolvedLinks: {} as Record<string, unknown>, unresolvedLinks: {} as Record<string, unknown>,
    linkUpdaters: { canvas: { canvas: { index: {
      refNodeIds,
      getForPath: (_path: string) => ({ caches: {}, embeds: [{ file: "Target.md", subpath: "#^block" }], foreign: true }),
    } } } },
    getCache: vi.fn((path: string) => nativeCache[path] ?? {}),
    getFirstLinkpathDest: vi.fn((link: string, source: string) => files.get(link === "" ? source : link) ?? files.get(`${link}.md`) ?? null),
    getLinks: () => ({ "native.md": [{ link: "untouched" }] }),
    iterateFileCache: (visit: (path: string, value: unknown) => void) => { for (const [path, value] of Object.entries(nativeCache)) visit(path, value); },
    iterateAllRefs: (visit: (path: string, value: unknown) => void) => { for (const [path, refs] of Object.entries(nativeRefs)) for (const ref of refs) visit(path, ref); },
    iterateRefsForFile: (file: TFile, visit: (value: unknown) => void) => { for (const ref of nativeRefs[file.path] ?? []) visit(ref); },
    computeMetadataAsync: vi.fn(async (bytes: ArrayBuffer) => extractMarkdownKnowledge(new TextDecoder().decode(bytes))),
    offref: events().offref,
  };
  // Use the same emitter owner for metadata subscription cleanup.
  const emitter = events();
  Object.assign(cache, emitter);
  const app = { vault, metadataCache: cache } as unknown as Pick<App, "vault" | "metadataCache">;
  return { app, vault, cache, files, data, nativeCache, nativeRefs, refNodeIds };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(accept => { resolve = accept; });
  return { promise, resolve };
}

describe("transient Obsidian board metadata", () => {
  it("supplements the inspected raw-store tag API with board/card tags, parents and native case aggregation", async () => {
    const h = host({ "board.canvas": { nodes: [{ id: "n", type: "text", text: "#PROJECT #PROJECT" }], edges: [],
      miroCanvas: { properties: { tags: ["board/phase"] } } } });
    const native = Object.freeze({ "#Project": 1, "#native": 4 });
    const methods = Object.assign(h.cache, { getTags: vi.fn(() => native), isUserIgnored: vi.fn(() => false) });
    h.cache.computeMetadataAsync.mockImplementation(async bytes => ({ ...extractMarkdownKnowledge(new TextDecoder().decode(bytes)), frontmatter: { tags: ["card/nested"] } }));
    const original = methods.getTags; const index = createObsidianBoardIndex(h.app); index.start(); await index.flush();
    expect(methods.getTags()).toEqual({ "#PROJECT": 3, "#native": 4, "#board/phase": 1, "#board": 1, "#card/nested": 1, "#card": 1 });
    expect(native).toEqual({ "#Project": 1, "#native": 4 });
    expect(h.cache.fileCache).toEqual({}); expect(h.cache.metadataCache).toEqual({});
    const reads = h.vault.cachedRead.mock.calls.length; methods.getTags(); expect(h.vault.cachedRead).toHaveBeenCalledTimes(reads);
    index.dispose(); expect(methods.getTags).toBe(original); expect(methods.getTags()).toBe(native);
  });

  it.each(["getter", "iterator"] as const)("does not double future native tag counts using the %s route", async route => {
    const h = host(); const native = { "#board": 1, "#project": 1 };
    const methods = Object.assign(h.cache, { getTags: vi.fn(() => {
      if (route === "getter") h.cache.getCache("board.canvas");
      else h.cache.iterateFileCache(() => {});
      return native;
    }), isUserIgnored: vi.fn(() => false) });
    const index = createObsidianBoardIndex(h.app); index.start(); await index.flush();
    expect(methods.getTags()).toEqual(native); expect(methods.getTags()).toEqual(native); index.dispose();
  });

  it("preserves ignored paths and already-counted native hash rows in global tag inventories", async () => {
    const doc = { nodes: [], edges: [], miroCanvas: { properties: { tags: ["board"] } } };
    const h = host({ "board.canvas": doc, "ignored.canvas": doc });
    Object.assign(h.cache.fileCache, { "board.canvas": { hash: "native-hash" } });
    Object.assign(h.cache.metadataCache, { "native-hash": { tags: [{ tag: "#nativeboard" }] } });
    const methods = Object.assign(h.cache, { getTags: vi.fn(() => ({ "#nativeboard": 1 })), isUserIgnored: vi.fn(path => path === "ignored.canvas") });
    const index = createObsidianBoardIndex(h.app); index.start(); await index.flush();
    expect(methods.getTags()).toEqual({ "#nativeboard": 1 }); expect(methods.isUserIgnored).toHaveBeenCalledWith("ignored.canvas"); index.dispose();
  });

  it("fails closed on unfamiliar tag output and bounded inventory work, without losing native counts", async () => {
    const h = host(); const native: Record<string, unknown> = { bad: [] };
    const methods = Object.assign(h.cache, { getTags: vi.fn(() => native), isUserIgnored: vi.fn(() => false) });
    const diagnostic = vi.fn(); const index = createObsidianBoardIndex(h.app, { onDiagnostic: diagnostic, limits: { maxTextCharacters: 100 } });
    index.start(); await index.flush(); expect(methods.getTags()).toBe(native);
    delete native.bad;
    const getter = vi.fn(() => 1); Object.defineProperty(native, "#accessor", { get: getter, enumerable: true, configurable: true });
    expect(methods.getTags()).toBe(native); expect(getter).not.toHaveBeenCalled(); delete native["#accessor"];
    native[`#${"x".repeat(101)}`] = 2;
    expect(methods.getTags()).toBe(native); expect(diagnostic).toHaveBeenCalledWith("board-tag-limit", undefined); index.dispose();
  });

  it("requires the observed ignore predicate and preserves later global tag wrappers on unload", async () => {
    const unsupported = host(); Object.assign(unsupported.cache, { getTags: () => ({}) });
    const refused = createObsidianBoardIndex(unsupported.app); refused.start(); expect(refused.status).toBe("unsupported"); refused.dispose();
    const h = host(); const methods = Object.assign(h.cache, { getTags: vi.fn(() => ({ "#native": 1 })), isUserIgnored: vi.fn(() => false) });
    const index = createObsidianBoardIndex(h.app); index.start(); await index.flush();
    const installed = methods.getTags; const later = vi.fn(() => installed()); methods.getTags = later;
    index.dispose(); expect(methods.getTags).toBe(later); expect(later()).toEqual({ "#native": 1 });
  });

  it("supports the inspected 1.13.8 inherited Canvas getter with no newer cache iterator", async () => {
    const h = host(); const wrapper = h.cache.linkUpdaters.canvas.canvas.index;
    const dictionary = { "board.canvas": { caches: {}, embeds: [{ file: "Target.md", subpath: "#^block" }], future: { native: true } } };
    const base = {
      getForPath(this: { index: typeof dictionary }, path: string) { return Object.prototype.hasOwnProperty.call(this.index, path) ? this.index[path as keyof typeof dictionary] : null; },
      get(this: { getForPath(path: string): unknown }, file: TFile) { return this.getForPath(file.path); },
      getAll(this: { index: typeof dictionary }) { return this.index; },
    };
    delete (wrapper as Partial<typeof wrapper>).getForPath;
    Object.assign(wrapper, { index: dictionary }); Object.setPrototypeOf(wrapper, base);
    delete (h.cache as Partial<typeof h.cache>).iterateFileCache;
    const fileCache = (file: TFile) => h.cache.getCache(file.path);
    // Exact observed alias route: getFileCache -> the instance's getCache.
    const suggestions = () => [...h.files.values()].flatMap(file => {
      const metadata = fileCache(file) as { frontmatter?: { aliases?: string[] } };
      return [{ file, path: file.path, alias: undefined }, ...(metadata.frontmatter?.aliases ?? []).map(alias => ({ file, path: file.path, alias }))];
    });
    const original = base.getForPath; const index = createObsidianBoardIndex(h.app); index.start(); await index.flush();
    expect(index.status).toBe("ready");
    expect(Object.prototype.hasOwnProperty.call(h.cache, "iterateFileCache")).toBe(false);
    expect((h.cache as Partial<typeof h.cache>).iterateFileCache).toBeUndefined();
    const file = h.files.get("board.canvas")!; const knowledge = index.getKnowledge(file.path)!;
    expect(fileCache(file)).toBe(knowledge);
    expect(suggestions()).toContainEqual({ file, path: file.path, alias: "Board alias" });
    expect(wrapper.getForPath(file.path)).toMatchObject({ caches: { text: knowledge.nodes.text }, future: { native: true } });
    expect(base.getAll.call(wrapper as unknown as { index: typeof dictionary })).toBe(dictionary);
    expect(dictionary[file.path as keyof typeof dictionary]).not.toHaveProperty("frontmatter");
    const refs: unknown[] = []; h.cache.iterateAllRefs((_path, ref) => refs.push(ref));
    expect(refs).toContain(knowledge.frontmatterLinks[0]);
    const perFile: unknown[] = []; h.cache.iterateRefsForFile(file, ref => perFile.push(ref)); expect(perFile).toEqual(refs);
    const live = JSON.parse(h.data.get(file.path)!); live.miroCanvas.properties.aliases = ["Live Android alias"];
    expect(index.ingestLiveDocument(file, live, { owner: {}, identity: {} })).toBe("published");
    expect(suggestions()).toContainEqual({ file, path: file.path, alias: "Live Android alias" });
    expect(h.cache.resolvedLinks[file.path]).toEqual({ "Target.md": 3 });
    dictionary["board.canvas"] = { caches: {}, embeds: [], future: { native: false } };
    expect(wrapper.getForPath(file.path)).toMatchObject({ caches: { text: expect.anything() }, future: { native: false } });
    const currentRef = index.getKnowledge(file.path)!.links[0]; expect(h.refNodeIds.get(currentRef)).toBe("text");
    index.dispose();
    expect(Object.prototype.hasOwnProperty.call(wrapper, "getForPath")).toBe(false); expect(wrapper.getForPath).toBe(original);
    expect(Object.getPrototypeOf(wrapper)).toBe(base); expect(base.getAll.call(wrapper as unknown as { index: typeof dictionary })).toBe(dictionary);
    expect(wrapper.getForPath(file.path)).toBe(dictionary["board.canvas"]);
    expect(h.refNodeIds.get(currentRef)).toBeUndefined(); expect(h.cache.resolvedLinks[file.path]).toBeUndefined();
    expect((h.cache as Partial<typeof h.cache>).iterateFileCache).toBeUndefined();
  });

  it.each(["accessor", "inherited-accessor", "nonfunction", "frozen"] as const)("fails closed on an existing incompatible optional cache iterator (%s)", async kind => {
    const h = host(); const original = h.cache.getCache; const getter = vi.fn(() => undefined);
    if (kind === "accessor") Object.defineProperty(h.cache, "iterateFileCache", { configurable: true, get: getter });
    else if (kind === "inherited-accessor") {
      delete (h.cache as Partial<typeof h.cache>).iterateFileCache;
      const prototype = {}; Object.defineProperty(prototype, "iterateFileCache", { get: getter }); Object.setPrototypeOf(h.cache, prototype);
    } else if (kind === "nonfunction") Object.assign(h.cache, { iterateFileCache: null });
    else Object.defineProperty(h.cache, "iterateFileCache", { configurable: false });
    const index = createObsidianBoardIndex(h.app); index.start(); await index.flush();
    expect(index.status).toBe("unsupported"); expect(getter).not.toHaveBeenCalled(); expect(h.cache.getCache).toBe(original);
    expect(h.vault.cachedRead).not.toHaveBeenCalled(); expect(h.vault.count()).toBe(0); index.dispose();
  });

  it("publishes committed live properties and card references before disk save, including Undo", async () => {
    const h = host(); const onIndexed = vi.fn(); const changed = vi.fn(); h.cache.on("changed", changed);
    const index = createObsidianBoardIndex(h.app, { onIndexed }); index.start(); await index.flush();
    h.vault.cachedRead.mockClear(); h.cache.computeMetadataAsync.mockClear(); changed.mockClear(); onIndexed.mockClear();
    const file = h.files.get("board.canvas")!; const disk = h.data.get(file.path)!; const before = JSON.parse(disk);
    const after = structuredClone(before); const owner = {};
    after.nodes[0].text = "[[Target]] changed card";
    after.miroCanvas.properties = { related: "[[Target#Heading]]", aliases: ["Live alias"], tags: ["live"], cssclasses: ["live-class"], future: { keep: 1 } };
    after.miroCanvas.nodeRedirects = { old: { file: "Moved.canvas", nodeId: "same", future: true } };
    const inputBytes = JSON.stringify(after);
    expect(index.ingestLiveDocument(file, after, { owner, identity: {} })).toBe("published");
    const immediate = index.getKnowledge(file.path)!;
    expect(h.cache.getCache(file.path)).toBe(immediate);
    expect(immediate.aliases).toEqual(["Live alias"]); expect(immediate.cssclasses).toEqual(["live-class"]);
    expect(immediate.tags.some(tag => tag.tag === "#live")).toBe(true);
    expect(immediate.frontmatterLinks[0]).toMatchObject({ link: "Target#Heading", resolvedPath: "Target.md" });
    expect(immediate.nodeRedirects?.old).toMatchObject({ file: "Moved.canvas", nodeId: "same", future: true });
    expect(immediate.links[0]).toMatchObject({ position: { nodeId: "text", start: { offset: 0 }, end: { offset: 10 } } });
    expect(h.refNodeIds.get(immediate.links[0])).toBe("text");
    expect(h.cache.linkUpdaters.canvas.canvas.index.getForPath(file.path)).toMatchObject({
      caches: { text: { links: [{ position: { nodeId: "text" } }] } },
    });
    expect(h.vault.cachedRead).not.toHaveBeenCalled(); expect(changed).not.toHaveBeenCalled();
    expect(onIndexed).toHaveBeenCalledWith(file, immediate);
    await index.flush(); expect(h.cache.computeMetadataAsync).toHaveBeenCalledOnce();
    expect(index.ingestLiveDocument(file, before, { owner, identity: {} })).toBe("published");
    expect(index.getKnowledge(file.path)?.aliases).toEqual(["Board alias"]);
    expect(index.getKnowledge(file.path)?.nodeRedirects).toBeUndefined();
    expect(index.getKnowledge(file.path)?.nodes.text.links[0].link).toBe("Target#Heading");
    await index.flush(); expect(h.data.get(file.path)).toBe(disk); expect(JSON.stringify(after)).toBe(inputBytes);
    expect(h.vault.cachedRead).not.toHaveBeenCalled(); expect(changed).not.toHaveBeenCalled(); index.dispose();
  });

  it("coalesces startup/live work, deduplicates revision identities and reuses exact native Markdown memos", async () => {
    const h = host(); const index = createObsidianBoardIndex(h.app); index.start();
    const file = h.files.get("board.canvas")!; const doc = JSON.parse(h.data.get(file.path)!); const owner = {}; const identity = {};
    expect(index.ingestLiveDocument(file, doc, { owner, identity })).toBe("published");
    await index.flush(); expect(h.vault.cachedRead).not.toHaveBeenCalled(); expect(h.cache.computeMetadataAsync).toHaveBeenCalledOnce();
    const knowledge = index.getKnowledge(file.path);
    expect(index.ingestLiveDocument(file, doc, { owner, identity })).toBe("unchanged"); expect(index.getKnowledge(file.path)).toBe(knowledge);
    doc.nodes[0].x = 120; doc.miroCanvas.properties.aliases = ["Metadata change"];
    expect(index.ingestLiveDocument(file, doc, { owner, identity: {} })).toBe("published"); await index.flush();
    expect(h.cache.computeMetadataAsync).toHaveBeenCalledOnce(); expect(index.getKnowledge(file.path)?.aliases).toEqual(["Metadata change"]);
    doc.nodes[0].text = "[[Other#Heading]] ![[Missing#^block]] #project";
    index.ingestLiveDocument(file, doc, { owner, identity: {} }); await index.flush();
    expect(h.cache.computeMetadataAsync).toHaveBeenCalledTimes(2); expect(h.vault.cachedRead).not.toHaveBeenCalled(); index.dispose();
  });

  it("rejects stale disk reads and refuses stale disk overwrite during live authority and modify bursts", async () => {
    const h = host(); const read = deferred<string>(); h.vault.cachedRead.mockImplementationOnce(() => read.promise);
    const index = createObsidianBoardIndex(h.app); index.start(); const draining = index.flush();
    const file = h.files.get("board.canvas")!; const doc = JSON.parse(h.data.get(file.path)!);
    doc.nodes[0].text = "[[Live target]]"; doc.miroCanvas.properties.aliases = ["Live"];
    expect(index.ingestLiveDocument(file, doc, { owner: {}, identity: {} })).toBe("published");
    expect(index.getKnowledge(file.path)?.links[0].link).toBe("Live target");
    for (let i = 0; i < 12; i++) h.vault.trigger("modify", file);
    index.reindex(file.path); file.stat.mtime += 1;
    read.resolve("invalid stale disk text"); await draining;
    expect(index.getKnowledge(file.path)?.aliases).toEqual(["Live"]); expect(h.vault.cachedRead).toHaveBeenCalledOnce();
    index.reindex(); await index.flush(); expect(h.vault.cachedRead).toHaveBeenCalledOnce();
    expect(index.getKnowledge(file.path)?.links[0].link).toBe("Live target"); index.dispose();
  });

  it("checks live revisions after native parsing and preserves a valid pure projection when refinement fails", async () => {
    const h = host(); const index = createObsidianBoardIndex(h.app); index.start(); await index.flush();
    const parser = deferred<ReturnType<typeof extractMarkdownKnowledge>>(); h.cache.computeMetadataAsync.mockImplementationOnce(() => parser.promise);
    const file = h.files.get("board.canvas")!; const doc = JSON.parse(h.data.get(file.path)!); const owner = {};
    doc.nodes[0].text = "[[Old pending]]"; index.ingestLiveDocument(file, doc, { owner, identity: {} }); const parsing = index.flush();
    await vi.waitFor(() => expect(h.cache.computeMetadataAsync).toHaveBeenCalledTimes(2));
    doc.nodes[0].text = "[[Newest]]"; doc.miroCanvas.properties.aliases = ["Newest"];
    index.ingestLiveDocument(file, doc, { owner, identity: {} }); expect(index.getKnowledge(file.path)?.links[0].link).toBe("Newest");
    parser.resolve(extractMarkdownKnowledge("[[Old pending]]")); await parsing;
    expect(index.getKnowledge(file.path)?.links[0].link).toBe("Newest"); expect(index.getKnowledge(file.path)?.aliases).toEqual(["Newest"]);
    h.cache.computeMetadataAsync.mockRejectedValueOnce(new Error("native parse failed"));
    doc.nodes[0].text = "[[Pure fallback]]"; index.ingestLiveDocument(file, doc, { owner, identity: {} }); await index.flush();
    expect(index.getKnowledge(file.path)?.links[0].link).toBe("Pure fallback"); index.dispose();
  });

  it("releases only the current view owner and resumes genuine disk indexing", async () => {
    const h = host(); const index = createObsidianBoardIndex(h.app); index.start(); await index.flush(); h.vault.cachedRead.mockClear();
    const file = h.files.get("board.canvas")!; const doc = JSON.parse(h.data.get(file.path)!); const first = {}; const second = {};
    doc.miroCanvas.properties.aliases = ["Live owner"];
    index.ingestLiveDocument(file, doc, { owner: first, identity: {} }); index.ingestLiveDocument(file, doc, { owner: second, identity: {} });
    index.releaseLiveDocument(file, first); index.reindex(file.path); await index.flush();
    expect(index.getKnowledge(file.path)?.aliases).toEqual(["Live owner"]); expect(h.vault.cachedRead).not.toHaveBeenCalled();
    index.releaseLiveDocument(file, second); await index.flush(); expect(index.getKnowledge(file.path)?.aliases).toEqual(["Board alias"]);
    expect(h.vault.cachedRead).toHaveBeenCalledOnce(); index.dispose();
  });

  it("detaches live inputs and retains no full board/source or strong identity/session reference", async () => {
    const h = host(); const index = createObsidianBoardIndex(h.app); index.start(); await index.flush();
    const retained: Record<string, unknown>[] = []; const originalSet = Map.prototype.set;
    const probe = vi.spyOn(Map.prototype, "set").mockImplementation(function (this: Map<unknown, unknown>, key, value) {
      if (value && typeof value === "object" && ("projection" in value || ("knowledge" in value && "memo" in value))) retained.push(value);
      return originalSet.call(this, key, value);
    });
    try {
      const file = h.files.get("board.canvas")!; const doc = JSON.parse(h.data.get(file.path)!);
      doc.miroSource = { noise: "live-irrelevant-source!".repeat(160_000) }; doc.futureRoot = doc.miroSource;
      doc.nodes[0].futureCard = doc.miroSource; doc.nodes[0].x = 444; const owner = { session: doc };
      expect(index.ingestLiveDocument(file, doc, { owner, identity: doc })).toBe("published");
      doc.nodes[0].text = "[[Caller mutation]]"; doc.miroCanvas.properties.aliases[0] = "Caller mutation";
      await index.flush(); expect(index.getKnowledge(file.path)?.links[0].link).toBe("Target#Heading");
      expect(index.getKnowledge(file.path)?.aliases).toEqual(["Board alias"]);
      expect(retained.length).toBeGreaterThan(0);
      for (const stored of retained) {
        const json = JSON.stringify(stored, (_key, value) => value instanceof Map ? [...value] : value);
        expect(json).not.toContain("live-irrelevant-source"); expect(json).not.toContain("futureCard");
        if ("projection" in stored) {
          expect(typeof stored.owner).toBe("number"); expect(typeof stored.identity).toBe("number");
          expect(stored.projection).not.toHaveProperty("miroSource"); expect(stored.projection).not.toHaveProperty("futureRoot");
        }
      }
    } finally { probe.mockRestore(); index.dispose(); }
  });

  it("fails closed for malformed/bounded live inputs and foreign native cache owners", async () => {
    const h = host(); const diagnostic = vi.fn(); const index = createObsidianBoardIndex(h.app, { onDiagnostic: diagnostic, limits: { maxTextCharacters: 100 } });
    const file = h.files.get("board.canvas")!; const doc = JSON.parse(h.data.get(file.path)!); const context = { owner: {}, identity: {} };
    expect(index.ingestLiveDocument(file, doc, context)).toBe("refused"); index.start(); await index.flush(); const prior = index.getKnowledge(file.path);
    const oversized = structuredClone(doc); oversized.nodes[0].text = "x".repeat(101);
    expect(index.ingestLiveDocument(file, oversized, context)).toBe("refused"); expect(index.getKnowledge(file.path)).toBe(prior);
    const getter = vi.fn(() => "[[Target]]"); const accessor = structuredClone(doc);
    Object.defineProperty(accessor.nodes[0], "text", { enumerable: true, get: getter });
    expect(index.ingestLiveDocument(file, accessor, context)).toBe("refused"); expect(getter).not.toHaveBeenCalled();
    const cyclic = structuredClone(doc); cyclic.miroCanvas.properties.loop = cyclic.miroCanvas.properties;
    expect(index.ingestLiveDocument(file, cyclic, context)).toBe("refused");
    h.nativeCache[file.path] = { foreign: { keep: true } };
    expect(index.ingestLiveDocument(file, doc, context)).toBe("refused"); expect(h.cache.getCache(file.path)).toBe(h.nativeCache[file.path]);
    expect(diagnostic).toHaveBeenCalledWith("board-text-limit", file.path); index.dispose();
    expect(index.ingestLiveDocument(file, doc, { owner: {}, identity: {} })).toBe("refused");
  });

  it("invalidates live work on delete/recreate, folder rename and unload", async () => {
    for (const action of ["delete", "rename", "unload"] as const) {
      const h = host(); const index = createObsidianBoardIndex(h.app); index.start(); await index.flush();
      const file = h.files.get("board.canvas")!; const doc = JSON.parse(h.data.get(file.path)!); const owner = {};
      const parser = deferred<ReturnType<typeof extractMarkdownKnowledge>>(); h.cache.computeMetadataAsync.mockImplementationOnce(() => parser.promise);
      doc.nodes[0].text = "[[Stale live parse]]"; index.ingestLiveDocument(file, doc, { owner, identity: {} }); const parsing = index.flush();
      await vi.waitFor(() => expect(h.cache.computeMetadataAsync).toHaveBeenCalledTimes(2));
      if (action === "delete") { h.files.delete(file.path); h.vault.trigger("delete", file); }
      else if (action === "rename") {
        h.files.delete(file.path); file.path = "Moved.canvas"; h.files.set(file.path, file);
        h.data.set(file.path, h.data.get("board.canvas")!); h.vault.trigger("rename", file, "board.canvas");
      } else index.dispose();
      parser.resolve(extractMarkdownKnowledge("[[Stale live parse]]")); await parsing;
      expect(index.getKnowledge("board.canvas")).toBeUndefined();
      if (action === "rename") expect(index.getKnowledge(file.path)?.links[0].link).toBe("Target#Heading");
      if (action === "delete") {
        const recreated = { ...file, stat: { ...file.stat } } as TFile; h.files.set(recreated.path, recreated);
        expect(index.ingestLiveDocument(file, doc, { owner, identity: {} })).toBe("refused");
        expect(index.ingestLiveDocument(recreated, doc, { owner: {}, identity: {} })).toBe("published");
        index.releaseLiveDocument(file, owner); expect(index.getKnowledge(recreated.path)?.links[0].link).toBe("Stale live parse");
      }
      index.dispose(); await index.flush(); expect(h.cache.resolvedLinks[file.path]).toBeUndefined();
    }
  });

  it("projects properties, per-node references and graph/backlink iterators without persistent cache writes or duplicates", async () => {
    const h = host();
    const diagnostic = vi.fn();
    h.nativeRefs["board.canvas"] = [{ link: "Target", original: "native" }];
    const original = h.cache.getCache;
    const getLinks = h.cache.getLinks;
    const index = createObsidianBoardIndex(h.app, { onDiagnostic: diagnostic });
    expect(index.status).toBe("stopped");
    index.start();
    await index.flush();
    expect(index.status).toBe("ready");
    expect(diagnostic).not.toHaveBeenCalled();
    const knowledge = index.getKnowledge("board.canvas")!;
    expect(h.cache.getCache("board.canvas")).toBe(knowledge);
    expect(knowledge.frontmatter).toMatchObject({ aliases: ["Board alias"], related: "[[Target]]" });
    expect(knowledge.nodes.text.links[0].position.nodeId).toBe("text");
    expect(knowledge.links[0].resolvedPath).toBe("Target.md");
    expect(knowledge.nodes.text.links[0].resolvedPath).toBe("Target.md");
    expect(knowledge.nodes.text.links[0]).toBe(knowledge.links[0]);
    expect(knowledge.embeds.find(ref => ref.position.nodeId === "file")?.link).toBe("Target.md#^block");
    const refs: unknown[] = [];
    h.cache.iterateAllRefs((_path, ref) => refs.push(ref));
    expect(refs).toHaveLength(4);
    expect(refs).not.toContain(h.nativeRefs["board.canvas"][0]);
    expect(h.cache.resolvedLinks["board.canvas"]).toEqual({ "Target.md": 3 });
    expect(h.cache.unresolvedLinks["board.canvas"]).toEqual({ Missing: 1 });
    expect((h.cache.resolvedLinks["board.canvas"] as Record<string, number>).hasOwnProperty("Target.md")).toBe(true);
    expect(h.cache.linkUpdaters.canvas.canvas.index.getForPath("board.canvas")).toMatchObject({
      caches: { text: knowledge.nodes.text }, embeds: [{ file: "Target.md", subpath: "#^block" }, { file: "Target", subpath: "" }], foreign: true,
    });
    expect(h.cache.linkUpdaters.canvas.canvas.index.getForPath("board.canvas").caches).not.toHaveProperty("file");
    expect(h.cache.fileCache).toEqual({});
    expect(h.cache.metadataCache).toEqual({});
    expect(h.refNodeIds.get(knowledge.links[0])).toBe("text");
    const perFile: unknown[] = [];
    h.cache.iterateRefsForFile(h.files.get("board.canvas")!, ref => perFile.push(ref));
    expect(perFile).toEqual(refs);
    expect(h.cache.getLinks()).toMatchObject({ "native.md": [{ link: "untouched" }], "board.canvas": knowledge.links.concat(knowledge.embeds) });
    const caches: unknown[] = [];
    h.cache.iterateFileCache((_path, value) => caches.push(value));
    expect(caches).toContain(knowledge);
    index.dispose();
    expect(h.cache.getCache).toBe(original);
    expect(h.cache.getLinks).toBe(getLinks);
    expect(h.refNodeIds.get(knowledge.links[0])).toBeUndefined();
    expect(h.vault.count()).toBe(0);
    expect(h.cache.count()).toBe(0);
  });

  it("passes through unsupported private shapes without registering hooks/events or reading boards", async () => {
    const h = host();
    const original = h.cache.getCache;
    delete (h.cache as Partial<typeof h.cache>).linkUpdaters;
    const report = vi.fn();
    const index = createObsidianBoardIndex(h.app, { onDiagnostic: report });
    index.start();
    await index.flush();
    expect(index.status).toBe("unsupported");
    expect(report).toHaveBeenCalledWith("metadata-private-shape-unsupported", undefined);
    expect(h.cache.getCache).toBe(original);
    expect(h.vault.cachedRead).not.toHaveBeenCalled();
    expect(h.vault.count()).toBe(0);
    index.dispose();
  });

  it("debounces board bursts and reuses per-card parse results for geometric edits", async () => {
    const h = host();
    const index = createObsidianBoardIndex(h.app);
    index.start();
    for (let event = 0; event < 20; event++) h.vault.trigger("modify", h.files.get("board.canvas"));
    await index.flush();
    expect(h.vault.cachedRead).toHaveBeenCalledTimes(1);
    expect(h.cache.computeMetadataAsync).toHaveBeenCalledTimes(1);
    const changed = JSON.parse(h.data.get("board.canvas")!);
    changed.nodes[0].x = 200;
    h.data.set("board.canvas", JSON.stringify(changed));
    h.vault.trigger("modify", h.files.get("board.canvas"));
    await index.flush();
    expect(h.vault.cachedRead).toHaveBeenCalledTimes(2);
    expect(h.cache.computeMetadataAsync).toHaveBeenCalledTimes(1);
    index.dispose();
  });

  it("retains native per-node metadata and registers property references with the card updater", async () => {
    const h = host();
    const position = { start: { line: 5, col: 0, offset: 45 }, end: { line: 5, col: 10, offset: 55 } };
    const metadata = { links: [{ link: "Target#Native", original: "[[Target]]", displayText: "Native", position }],
      embeds: [], tags: [{ tag: "#native", position }],
      frontmatterLinks: [{ key: "related.0", link: "Target", original: "[[Target]]", displayText: "Target" }],
      frontmatter: { related: ["[[Target]]"] }, headings: [{ heading: "Heading", level: 1, position }],
      blocks: { block: { id: "block", position } }, foreign: { keep: true } };
    h.cache.computeMetadataAsync.mockResolvedValueOnce(metadata);
    const index = createObsidianBoardIndex(h.app);
    index.start();
    await index.flush();
    const knowledge = index.getKnowledge("board.canvas")!;
    expect(knowledge.nodes.text).toMatchObject({ headings: metadata.headings, blocks: metadata.blocks, foreign: { keep: true } });
    expect(knowledge.links[0].link).toBe("Target#Native");
    expect(knowledge.tags.find(tag => tag.position.nodeId === "text")?.tag).toBe("#native");
    expect(knowledge.tags.some(tag => tag.tag === "#project")).toBe(false);
    const property = knowledge.frontmatterLinks.find(ref => ref.key === "related.0")!;
    expect(h.refNodeIds.get(property)).toBe("text");
    expect(h.refNodeIds.get(metadata.frontmatterLinks[0])).toBeUndefined();
    expect(metadata.links[0].position).not.toHaveProperty("nodeId");
    index.dispose();
    expect(h.refNodeIds.get(property)).toBeUndefined();
  });

  it("does not retain large irrelevant source payloads and invalidates by exact text rather than a digest", async () => {
    const noise = "irrelevant-source-sentinel!".repeat(80_000);
    const document = { nodes: [{ id: "text", type: "text", text: "[[Target]]" }, { id: "file", type: "file", file: "Target.md" }], edges: [],
      miroCanvas: { properties: { related: "[[Target]]", aliases: ["Alpha"], tags: ["one"] },
        nodeRedirects: { old: { file: "Old.canvas", nodeId: "same" } } }, miroSource: { noise }, futureRoot: { noise } };
    const h = host({ "board.canvas": document });
    const retained: Record<string, unknown>[] = [];
    const nativeSet = Map.prototype.set;
    // Inspect actual stored entries, so the old full-source retention bug fails.
    const storeProbe = vi.spyOn(Map.prototype, "set").mockImplementation(function (this: Map<unknown, unknown>, key, value) {
      if (value && typeof value === "object" && "knowledge" in value && "memo" in value && value.memo instanceof Map) {
        retained.push(value as Record<string, unknown>);
      }
      return nativeSet.call(this, key, value);
    });
    const index = createObsidianBoardIndex(h.app);
    const strings = (value: unknown, seen = new Set<object>()): string[] => {
      if (typeof value === "string") return [value];
      if (!value || typeof value !== "object" || seen.has(value)) return [];
      seen.add(value);
      if (value instanceof Map) return [...value].flatMap(([key, item]) => [...strings(key, seen), ...strings(item, seen)]);
      if (value instanceof Set) return [...value].flatMap(item => strings(item, seen));
      return Object.values(value).flatMap(item => strings(item, seen));
    };
    try {
      index.start();
      await index.flush();
      expect(retained).toHaveLength(1);
      expect(retained[0]).not.toHaveProperty("data");
      expect(strings(retained[0]).some(value => value.includes("irrelevant-source-sentinel"))).toBe(false);
      expect(strings(retained[0]).reduce((total, value) => total + value.length, 0)).toBeLessThan(5000);
      expect(index.getKnowledge("board.canvas")?.aliases).toEqual(["Alpha"]);
      const stat = { ...h.files.get("board.canvas")!.stat };
      document.miroSource.noise = "irrelevant-changed-payload!".repeat(80_000);
      h.data.set("board.canvas", JSON.stringify(document));
      index.reindex("board.canvas");
      await index.flush();
      expect(h.cache.computeMetadataAsync).toHaveBeenCalledTimes(1);
      document.nodes[0].text = "[[Other_]]";
      document.nodes[1].file = "Other_.md";
      document.miroCanvas.properties.related = "[[Other_]]";
      document.miroCanvas.properties.aliases = ["Bravo"];
      document.miroCanvas.properties.tags = ["two"];
      document.miroCanvas.nodeRedirects.old.file = "New.canvas";
      h.data.set("board.canvas", JSON.stringify(document));
      expect(h.files.get("board.canvas")!.stat).toEqual(stat);
      index.reindex("board.canvas");
      await index.flush();
      expect(h.cache.computeMetadataAsync).toHaveBeenCalledTimes(2);
      const current = index.getKnowledge("board.canvas")!;
      expect(current.links[0].link).toBe("Other_");
      expect(current.embeds[0].link).toBe("Other_.md");
      expect(current.frontmatterLinks[0].link).toBe("Other_");
      expect(current.aliases).toEqual(["Bravo"]);
      expect(current.tags.some(tag => tag.tag === "#two")).toBe(true);
      expect(current.nodeRedirects?.old.file).toBe("New.canvas");
      expect(strings(retained.at(-1)).some(value => value.includes("irrelevant-source-sentinel") || value.includes("irrelevant-changed-payload"))).toBe(false);
    } finally {
      storeProbe.mockRestore();
      index.dispose();
    }
  });

  it("refreshes target creation/deletion without rereading boards and batches note-property callbacks", async () => {
    const h = host();
    const onNotes = vi.fn();
    const index = createObsidianBoardIndex(h.app, { onNotePropertiesChanged: onNotes });
    index.start();
    await index.flush();
    const missing = { path: "Missing.md", extension: "md", stat: { mtime: 1, size: 1 } } as TFile;
    h.files.set(missing.path, missing);
    h.vault.trigger("create", missing);
    for (let event = 0; event < 5; event++) h.cache.trigger("changed", missing, "", {});
    await index.flush();
    expect(h.cache.resolvedLinks["board.canvas"]).toEqual({ "Target.md": 3, "Missing.md": 1 });
    expect(onNotes).toHaveBeenCalledTimes(1);
    expect(onNotes).toHaveBeenCalledWith([missing]);
    h.files.delete("Target.md");
    h.vault.trigger("delete", { path: "Target.md", extension: "md" });
    await index.flush();
    expect(h.cache.unresolvedLinks["board.canvas"]).toEqual({ Target: 3 });
    expect(index.getKnowledge("board.canvas")?.frontmatterLinks[0]).not.toHaveProperty("resolvedPath");
    expect(index.getKnowledge("board.canvas")?.links[0]).not.toHaveProperty("resolvedPath");
    expect(index.getKnowledge("board.canvas")?.nodes.text.links[0]).not.toHaveProperty("resolvedPath");
    expect(h.vault.cachedRead).toHaveBeenCalledTimes(1);
    index.dispose();
  });

  it("rejects stale read and parse completions after a modify/delete/unload", async () => {
    const h = host();
    const read = deferred<string>();
    h.vault.cachedRead.mockImplementationOnce(() => read.promise);
    const index = createObsidianBoardIndex(h.app);
    index.start();
    const draining = index.flush();
    h.vault.trigger("modify", h.files.get("board.canvas"));
    const updated = JSON.parse(h.data.get("board.canvas")!);
    updated.nodes[0].text = "[[New target]]";
    h.data.set("board.canvas", JSON.stringify(updated));
    read.resolve("invalid JSON from stale generation");
    await draining;
    expect(index.getKnowledge("board.canvas")?.links[0].link).toBe("New target");
    const parser = deferred<ReturnType<typeof extractMarkdownKnowledge>>();
    h.cache.computeMetadataAsync.mockImplementationOnce(() => parser.promise);
    updated.nodes[0].text = "[[Should never publish]]";
    h.data.set("board.canvas", JSON.stringify(updated));
    index.reindex("board.canvas");
    const parsing = index.flush();
    await vi.waitFor(() => expect(h.cache.computeMetadataAsync).toHaveBeenCalledTimes(2));
    h.files.delete("board.canvas");
    h.vault.trigger("delete", { path: "board.canvas", extension: "canvas" });
    index.dispose();
    parser.resolve(extractMarkdownKnowledge("[[Should never publish]]"));
    await parsing;
    expect(index.getKnowledge("board.canvas")).toBeUndefined();
    expect(h.cache.resolvedLinks["board.canvas"]).toBeUndefined();
  });

  it("bounds concurrent reads and worker parser calls", async () => {
    const docs = Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`board${i}.canvas`, {
      nodes: Array.from({ length: 3 }, (_, card) => ({ id: `n${i}-${card}`, type: "text", text: "[[Target]]" })), edges: [],
    }]));
    const h = host(docs);
    let reads = 0;
    let maxReads = 0;
    let parsers = 0;
    let maxParsers = 0;
    h.vault.cachedRead.mockImplementation(async file => {
      reads++;
      maxReads = Math.max(maxReads, reads);
      await new Promise(accept => setTimeout(accept, 5));
      reads--;
      return h.data.get(file.path)!;
    });
    h.cache.computeMetadataAsync.mockImplementation(async bytes => {
      parsers++;
      maxParsers = Math.max(maxParsers, parsers);
      await new Promise(accept => setTimeout(accept, 5));
      parsers--;
      return extractMarkdownKnowledge(new TextDecoder().decode(bytes));
    });
    const index = createObsidianBoardIndex(h.app, { limits: { concurrentReads: 2, concurrentParsers: 1 } });
    index.start();
    await index.flush();
    expect(maxReads).toBe(2);
    expect(maxParsers).toBe(1);
    expect(h.vault.cachedRead).toHaveBeenCalledTimes(7);
    expect(h.cache.computeMetadataAsync).toHaveBeenCalledTimes(21);
    index.dispose();
  });

  it("restores previous map rows only when still owned and leaves a later wrapper operational on unload", async () => {
    const h = host();
    const originalRow = { "native.md": 1 };
    h.cache.resolvedLinks["board.canvas"] = originalRow;
    const index = createObsidianBoardIndex(h.app);
    index.start();
    await index.flush();
    const ownedHook = h.cache.getCache;
    const knowledge = index.getKnowledge("board.canvas")!;
    h.refNodeIds.set(knowledge.links[0], "other-owner");
    h.refNodeIds.set(knowledge.frontmatterLinks[0], "property-owner");
    const laterHook = vi.fn((path: string) => ownedHook(path));
    h.cache.getCache = laterHook;
    const competitor = { "other.md": 4 };
    h.cache.unresolvedLinks["board.canvas"] = competitor;
    index.dispose();
    expect(h.cache.resolvedLinks["board.canvas"]).toBe(originalRow);
    expect(h.cache.unresolvedLinks["board.canvas"]).toBe(competitor);
    expect(h.cache.getCache).toBe(laterHook);
    expect(h.cache.getCache("board.canvas")).toEqual({});
    expect(h.refNodeIds.get(knowledge.links[0])).toBe("other-owner");
    expect(h.refNodeIds.get(knowledge.frontmatterLinks[0])).toBe("property-owner");
  });

  it("defers to a competing native board cache and preserves its unknown fields", async () => {
    const h = host();
    h.nativeCache["board.canvas"] = { frontmatter: { another: true }, foreign: { keep: true } };
    const index = createObsidianBoardIndex(h.app);
    index.start();
    await index.flush();
    expect(index.getKnowledge("board.canvas")).toBeUndefined();
    expect(h.cache.getCache("board.canvas")).toBe(h.nativeCache["board.canvas"]);
    expect(h.cache.resolvedLinks["board.canvas"]).toBeUndefined();
    index.dispose();
  });

  it("invalidates moved boards and stale reads when a containing folder is renamed", async () => {
    const h = host({ "folder/board.canvas": { nodes: [{ id: "n", type: "text", text: "[[Target]]" }], edges: [] } });
    const rename = vi.fn();
    const index = createObsidianBoardIndex(h.app, { onRename: rename });
    index.start();
    await index.flush();
    const board = h.files.get("folder/board.canvas")!;
    h.files.delete(board.path);
    const oldData = h.data.get(board.path)!;
    board.path = "moved/board.canvas";
    h.files.set(board.path, board);
    h.data.set(board.path, oldData);
    // Obsidian moves its native row before plugin vault handlers run.
    h.cache.resolvedLinks[board.path] = h.cache.resolvedLinks["folder/board.canvas"];
    delete h.cache.resolvedLinks["folder/board.canvas"];
    h.vault.trigger("rename", { path: "moved" }, "folder");
    await index.flush();
    expect(rename).toHaveBeenCalledOnce();
    expect(index.getKnowledge("folder/board.canvas")).toBeUndefined();
    expect(index.getKnowledge(board.path)).toBeDefined();
    expect(h.cache.resolvedLinks["folder/board.canvas"]).toBeUndefined();
    index.dispose();
    expect(h.cache.resolvedLinks[board.path]).toBeUndefined();
  });

  it.each([
    { oldPath: "One/Note.md", renamedPath: "One/Renamed.md", eventPath: "One/Renamed.md", folder: false },
    { oldPath: "One", renamedPath: "Moved/Note.md", eventPath: "Moved", folder: true },
  ])("detaches pre-rename property targets with duplicate note names ($oldPath)", async ({ oldPath, renamedPath, eventPath, folder }) => {
    const h = host({
      "board.canvas": {
        nodes: [{ id: "n", type: "text", text: "[[Note]]" }],
        edges: [],
        miroCanvas: { properties: { related: ["[[Note#Heading]]", "[[Two/Note]]", "[[Missing]]"], future: { keep: [1, 2] } } },
      },
    });
    const first = { path: "One/Note.md", extension: "md", stat: { mtime: 1, size: 0 } } as TFile;
    const second = { path: "Two/Note.md", extension: "md", stat: { mtime: 1, size: 0 } } as TFile;
    h.files.set(first.path, first);
    h.files.set(second.path, second);
    h.cache.getFirstLinkpathDest.mockImplementation((link, source) => {
      if (link === "Note") return h.files.get("One/Note.md") ?? second;
      return h.files.get(link === "" ? source : link) ?? h.files.get(`${link}.md`) ?? null;
    });
    let snapshot: BoardKnowledge | undefined;
    const onRename = vi.fn((_file, path, boards: ReadonlyMap<string, BoardKnowledge>) => {
      expect(path).toBe(oldPath);
      snapshot = boards.get("board.canvas");
    });
    const index = createObsidianBoardIndex(h.app, { onRename });
    index.start();
    await index.flush();
    const before = index.getKnowledge("board.canvas")!;
    const originalJson = h.data.get("board.canvas");
    expect(before.frontmatterLinks.map(ref => ref.resolvedPath)).toEqual(["One/Note.md", "Two/Note.md", undefined]);
    expect(before.links[0].resolvedPath).toBe("One/Note.md");
    expect(before.nodes.n.links[0].resolvedPath).toBe("One/Note.md");
    h.files.delete(first.path);
    first.path = renamedPath;
    h.files.set(first.path, first);
    // Native file lookup now selects the other same-named note for the bare link.
    expect(h.cache.getFirstLinkpathDest("Note", "board.canvas")).toBe(second);
    h.vault.trigger("rename", folder ? { path: eventPath } : first, oldPath);
    expect(onRename).toHaveBeenCalledOnce();
    expect(snapshot).not.toBe(before);
    expect(snapshot?.frontmatter).not.toBe(before.frontmatter);
    expect(snapshot?.frontmatterLinks[0]).not.toBe(before.frontmatterLinks[0]);
    expect(snapshot?.links[0].position).not.toBe(before.links[0].position);
    await index.flush();
    expect(index.getKnowledge("board.canvas")?.frontmatterLinks[0].resolvedPath).toBe("Two/Note.md");
    expect(snapshot?.frontmatterLinks.map(ref => ref.resolvedPath)).toEqual(["One/Note.md", "Two/Note.md", undefined]);
    expect(snapshot?.links[0].resolvedPath).toBe("One/Note.md");
    expect(snapshot?.nodes.n.links[0].resolvedPath).toBe("One/Note.md");
    expect(index.getKnowledge("board.canvas")?.links[0].resolvedPath).toBe("Two/Note.md");
    const renamePlan = planBoardLinkRename(JSON.parse(originalJson!), {
      sourcePath: "board.canvas", oldPath, newPath: eventPath, folder, preRename: snapshot!,
    });
    expect(renamePlan.ok).toBe(true);
    if (renamePlan.ok) expect((renamePlan.document.nodes as { text: string }[])[0].text)
      .toBe(folder ? "[[Moved/Note]]" : "[[One/Renamed]]");
    expect(snapshot?.frontmatter?.future).toEqual({ keep: [1, 2] });
    const affected = snapshot?.frontmatterLinks.filter(ref => ref.resolvedPath === oldPath || ref.resolvedPath?.startsWith(`${oldPath}/`));
    expect(affected?.map(ref => ref.link)).toEqual(["Note#Heading"]);
    if (snapshot?.frontmatter) snapshot.frontmatter.future = "parent draft";
    expect(before.frontmatter?.future).toEqual({ keep: [1, 2] });
    expect(h.data.get("board.canvas")).toBe(originalJson);
    index.dispose();
  });

  it("removes an invalid or oversized board projection and never writes input", async () => {
    const h = host();
    const report = vi.fn();
    const index = createObsidianBoardIndex(h.app, { onDiagnostic: report, limits: { maxBoardBytes: 1000 } });
    index.start();
    await index.flush();
    const original = h.data.get("board.canvas");
    const file = h.files.get("board.canvas")!;
    file.stat.size = 2000;
    index.reindex(file.path);
    await index.flush();
    expect(index.getKnowledge(file.path)).toBeUndefined();
    expect(report).toHaveBeenCalledWith("board-byte-limit", file.path);
    expect(h.data.get(file.path)).toBe(original);
    index.dispose();
  });
});
