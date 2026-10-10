import { describe, expect, it, vi } from "vitest";
import type { Component } from "obsidian";
import {
  BOARD_CARD_LINK_LIMITS, BoardCardEmbeds, BoardCardResolver, canvasCardLink, installCanvasCardEmbedCreator, installCanvasCardLinkOpener, parseCanvasCardLink,
  type CanvasCardEmbedComponent, type CanvasCardEmbedCreatorRequest,
  type CardBoardStat, type CardEmbedHost, type CardEmbedLabels, type CardLinkWorkspace, type CardRenderContext,
} from "../src/board-card-links";

function card(id = "a", type = "text", extra: Record<string, unknown> = {}) {
  return { id, type, x: 0, y: 0, width: 100, height: 60, ...(type === "text" ? { text: "**Actual** [[Sibling]]" } : {}), ...extra };
}

function board(nodes = [card()], extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ nodes, edges: [], ...extra });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((fulfil, fail) => { resolve = fulfil; reject = fail; });
  return { promise, resolve, reject };
}

async function settle(): Promise<void> {
  for (let count = 0; count < 35; count += 1) await Promise.resolve();
}

function fixture() {
  const files = new Map<string, { text: string; stat: CardBoardStat }>();
  const put = (path: string, text = board(), mtime = 1) => files.set(path, { text, stat: { mtime, size: text.length } });
  put("boards/Plan.canvas");
  const stat = vi.fn((path: string) => files.get(path)?.stat);
  const read = vi.fn(async (path: string, _signal: AbortSignal) => files.get(path)?.text ?? "");
  const resolvePath = vi.fn((path: string, _source: string): string | undefined => path === "Alias" ? "boards/Plan.canvas" : path);
  const resolver = new BoardCardResolver({ stat, read, resolvePath });
  return { files, put, stat, read, resolvePath, resolver };
}

describe("Canvas card destinations", () => {
  it("round-trips vault paths, Unicode/space/punctuation IDs and empty-path references", () => {
    const link = canvasCardLink("boards/План дня.canvas", "task #1");
    expect(link).toBe("boards/План дня.canvas#node-task%20%231");
    expect(parseCanvasCardLink(link!)).toEqual({ path: "boards/План дня.canvas", nodeId: "task #1" });
    expect(parseCanvasCardLink("#node-a")).toEqual({ path: "", nodeId: "a" });
    expect(parseCanvasCardLink("Plan.canvas#node-%00")).toBeUndefined();
    expect(parseCanvasCardLink("Plan%0A.canvas#node-a")).toBeUndefined();
  });

  it("does not consume normal headings/blocks/aliases, malformed fragments or external paths", () => {
    for (const link of ["Note.md#Heading", "Plan.canvas#Heading", "Plan.canvas#^block", "Plan.canvas#node-", "Plan.canvas#node-a#Other",
      "Plan.canvas#node-%XX", "../Plan.canvas#node-a", "https://x.test/Plan.canvas#node-a", "[[Plan.canvas#node-a]]", "Plan.canvas#node-a|Alias"]) {
      expect(parseCanvasCardLink(link), link).toBeUndefined();
    }
    expect(canvasCardLink("Note.md", "a")).toBeUndefined();
    expect(canvasCardLink("Plan.canvas", "a".repeat(BOARD_CARD_LINK_LIMITS.nodeIdLength + 1))).toBeUndefined();
  });

  it("copies native wiki linktexts whose literal paths resolve without URI decoding", () => {
    const path = "Project Boards/Café план.canvas";
    const nodeId = "task ] | # ё";
    const copied = canvasCardLink(path, nodeId)!;
    expect(`[[${copied}]]`).toBe(`[[${path}#node-${encodeURIComponent(nodeId)}]]`);
    // Native parseLinktext/getFirstLinkpathDest uses the path before # literally.
    const nativeLinkpath = copied.slice(0, copied.indexOf("#"));
    const nativePaths = new Map([[path, "board"]]);
    expect(nativePaths.get(nativeLinkpath)).toBe("board");
    expect(nativePaths.get(encodeURIComponent(path))).toBeUndefined();
    expect(parseCanvasCardLink(copied)).toEqual({ path, nodeId });
  });

  it("refuses ambiguous wiki paths rather than copying a different destination", () => {
    for (const path of ["Boards/Plan#draft.canvas", "Boards/Plan].canvas", "Boards/Plan[.canvas", "Boards/Plan|alias.canvas",
      "Boards/Plan%20draft.canvas", "Boards/100%.canvas", " Plan.canvas"]) {
      expect(canvasCardLink(path, "a"), path).toBeUndefined();
    }
    expect(canvasCardLink("Plan.canvas", "\ud800")).toBeUndefined();
  });

  it("keeps reading earlier encoded card paths and ignores ordinary Markdown links", () => {
    expect(parseCanvasCardLink("Project%20Boards/Plan.canvas#node-task%20one"))
      .toEqual({ path: "Project Boards/Plan.canvas", nodeId: "task one" });
    expect(parseCanvasCardLink("Note%20Name.md#Heading")).toBeUndefined();
  });
});

describe("board card resolver and bounded cache", () => {
  it("resolves aliases/current-board links but ignores Markdown note node fragments", async () => {
    const { resolver, read } = fixture();
    expect((await resolver.resolve("Alias#node-a", "Page.md")).status).toBe("resolved");
    expect((await resolver.resolve("#node-a", "boards/Plan.canvas")).status).toBe("resolved");
    expect(await resolver.resolve("Note.md#node-a", "Page.md")).toEqual({ status: "ignored" });
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("shares a single in-flight read, caches by revision and rejects changed snapshots", async () => {
    const { resolver, read, put } = fixture();
    const response = deferred<string>();
    read.mockImplementationOnce(() => response.promise);
    const first = resolver.resolve("Alias#node-a", "Page.md");
    const second = resolver.resolve("Alias#node-a", "Other.md");
    await settle();
    expect(read).toHaveBeenCalledTimes(1);
    response.resolve(board());
    const one = await first;
    expect((await second).status).toBe("resolved");
    await resolver.resolve("Alias#node-a", "Page.md");
    expect(read).toHaveBeenCalledTimes(1);
    put("boards/Plan.canvas", board([card("a", "text", { text: "changed" })]), 2);
    if (one.status !== "resolved") throw new Error("expected card");
    expect(resolver.isCurrent(one.target)).toBe(false);
    const changed = await resolver.resolve("Alias#node-a", "Page.md");
    expect(changed.status).toBe("resolved");
    if (changed.status === "resolved") expect(changed.target.node.text).toBe("changed");
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("follows redirects and rechecks every hop; an existing card wins over its old redirect", async () => {
    const { resolver, put, files } = fixture();
    put("boards/Plan.canvas", board([], { miroCanvas: { schemaVersion: 1, nodeRedirects: { a: { file: "Moved.canvas", nodeId: "b", custom: true } } } }));
    put("Moved.canvas", board([card("b")]));
    const result = await resolver.resolve("Alias#node-a", "Page.md");
    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") throw new Error("expected redirect");
    expect(result.target.path).toBe("Moved.canvas");
    expect(result.target.nodeId).toBe("b");
    expect(result.target.chain.map((entry) => entry.path)).toEqual(["boards/Plan.canvas", "Moved.canvas"]);
    files.delete("boards/Plan.canvas");
    expect(resolver.isCurrent(result.target)).toBe(false);
    put("boards/Plan.canvas", board([card()], { miroCanvas: { schemaVersion: 1, nodeRedirects: { a: { file: "Missing.canvas", nodeId: "b" } } } }), 2);
    expect((await resolver.resolve("Alias#node-a", "Page.md")).status).toBe("resolved");
  });

  it("rejects a changed intermediate board before a pending redirected target can publish", async () => {
    const { resolver, put, read } = fixture();
    const source = board([], { miroCanvas: { schemaVersion: 1, nodeRedirects: { a: { file: "Moved.canvas", nodeId: "b" } } } });
    put("boards/Plan.canvas", source);
    put("Moved.canvas", board([card("b")]));
    const target = deferred<string>();
    read.mockImplementation(async (path) => path === "Moved.canvas" ? target.promise : source);
    const resolving = resolver.resolve("Alias#node-a", "Page.md");
    await settle();
    put("boards/Plan.canvas", source, 2);
    target.resolve(board([card("b")]));
    expect(await resolving).toEqual({ status: "error", error: "stale" });
  });

  it("rejects cycles, too many redirects and non-vault redirect targets", async () => {
    const { resolver, put } = fixture();
    const redirect = (file: string, nodeId = "a") => board([], { miroCanvas: { schemaVersion: 1, nodeRedirects: { a: { file, nodeId } } } });
    put("boards/Plan.canvas", redirect("Loop.canvas"));
    put("Loop.canvas", redirect("boards/Plan.canvas"));
    expect(await resolver.resolve("Alias#node-a", "Page.md")).toEqual({ status: "error", error: "redirect-loop" });
    put("boards/Plan.canvas", redirect("../Outside.canvas"), 2);
    expect(await resolver.resolve("Alias#node-a", "Page.md")).toEqual({ status: "error", error: "invalid-board" });
    put("boards/Plan.canvas", redirect("0.canvas"), 3);
    for (let index = 0; index <= BOARD_CARD_LINK_LIMITS.redirectHops; index += 1) put(`${index}.canvas`, redirect(`${index + 1}.canvas`));
    expect(await resolver.resolve("Alias#node-a", "Page.md")).toEqual({ status: "error", error: "redirect-limit" });
  });

  it("does not follow inherited redirect keys or unsupported schema versions", async () => {
    const { resolver, put } = fixture();
    put("boards/Plan.canvas", board([], { miroCanvas: { schemaVersion: 1, nodeRedirects: {} } }));
    expect(await resolver.resolve("Alias#node-toString", "Page.md")).toEqual({ status: "error", error: "missing-card" });
    put("boards/Plan.canvas", board([], { miroCanvas: { schemaVersion: 2, nodeRedirects: { a: { file: "Other.canvas", nodeId: "b" } } } }), 2);
    expect(await resolver.resolve("Alias#node-a", "Page.md")).toEqual({ status: "error", error: "missing-card" });
  });

  it("rejects malformed/native-invalid/oversized documents and reports read errors", async () => {
    const { resolver, put, files, read } = fixture();
    for (const text of ["{", JSON.stringify({ nodes: [], edges: null }), board([card(), card()]), board([card("a", "shape")]), board([card("a", "file")])]) {
      put("boards/Plan.canvas", text, Math.random());
      expect(await resolver.resolve("Alias#node-a", "Page.md")).toEqual({ status: "error", error: "invalid-board" });
    }
    files.set("boards/Plan.canvas", { text: "unused", stat: { mtime: 2, size: BOARD_CARD_LINK_LIMITS.boardBytes + 1 } });
    const count = read.mock.calls.length;
    expect(await resolver.resolve("Alias#node-a", "Page.md")).toEqual({ status: "error", error: "too-large" });
    expect(read.mock.calls.length).toBe(count);
    put("boards/Plan.canvas", board(), 3);
    read.mockRejectedValueOnce(new Error("denied"));
    expect(await resolver.resolve("Alias#node-a", "Page.md")).toEqual({ status: "error", error: "read-failed" });
  });

  it("settles invalidated/disposed reads immediately even if adapters ignore abort", async () => {
    const { resolver, read } = fixture();
    const response = deferred<string>();
    read.mockImplementationOnce(() => response.promise);
    const loading = resolver.resolve("Alias#node-a", "Page.md");
    await settle();
    resolver.invalidate("boards/Plan.canvas");
    expect(await loading).toEqual({ status: "error", error: "stale" });
    expect(read.mock.calls[0][1].aborted).toBe(true);
    response.resolve(board([card("a", "text", { text: "stale" })]));
    await settle();
    const current = await resolver.resolve("Alias#node-a", "Page.md");
    if (current.status !== "resolved") throw new Error("expected card");
    expect(current.target.node.text).not.toBe("stale");
    const next = deferred<string>();
    resolver.invalidate("boards/Plan.canvas");
    read.mockImplementationOnce(() => next.promise);
    const closing = resolver.resolve("Alias#node-a", "Page.md");
    await settle();
    resolver.dispose();
    expect(await closing).toEqual({ status: "error", error: "disposed" });
    next.resolve(board());
    await settle();
    expect(await resolver.resolve("Alias#node-a", "Page.md")).toEqual({ status: "error", error: "disposed" });
  });

  it("rejects a board deleted/modified while reading and retires caller-aborted results", async () => {
    const { resolver, read, files } = fixture();
    const response = deferred<string>();
    read.mockImplementationOnce(() => response.promise);
    const loading = resolver.resolve("Alias#node-a", "Page.md");
    await settle();
    files.delete("boards/Plan.canvas");
    response.resolve(board());
    expect(await loading).toEqual({ status: "error", error: "stale" });
    expect(await resolver.resolve("Alias#node-a", "Page.md")).toEqual({ status: "error", error: "missing-board" });
    const controller = new AbortController();
    controller.abort();
    expect(await resolver.resolve("Alias#node-a", "Page.md", controller.signal)).toEqual({ status: "error", error: "stale" });
  });

  it("bounds cache entries with LRU eviction and active reads including ignored aborts", async () => {
    const { resolver, put, read } = fixture();
    for (let index = 0; index <= BOARD_CARD_LINK_LIMITS.cachedBoards; index += 1) {
      put(`${index}.canvas`);
      await resolver.resolve(`${index}.canvas#node-a`, "Page.md");
    }
    const count = read.mock.calls.length;
    await resolver.resolve("0.canvas#node-a", "Page.md");
    expect(read.mock.calls.length).toBe(count + 1);
    const responses: ReturnType<typeof deferred<string>>[] = [];
    read.mockImplementation(() => {
      const response = deferred<string>();
      responses.push(response);
      return response.promise;
    });
    const loads = [];
    for (let index = 0; index < BOARD_CARD_LINK_LIMITS.concurrentReads + 1; index += 1) {
      put(`pending-${index}.canvas`);
      loads.push(resolver.resolve(`pending-${index}.canvas#node-a`, "Page.md"));
      await settle();
    }
    expect(responses.length).toBe(BOARD_CARD_LINK_LIMITS.concurrentReads);
    resolver.dispose();
    await Promise.all(loads);
    for (const response of responses) response.resolve(board());
    await settle();
    expect(responses.length).toBe(BOARD_CARD_LINK_LIMITS.concurrentReads);
  });

  it("bounds serialized cache characters and actual file content, not only declared byte size", async () => {
    const { resolver, put, read } = fixture();
    for (let index = 0; index < 5; index += 1) {
      put(`large-${index}.canvas`, board([card("a", "text", { text: "x".repeat(2_000_000) })]));
      expect((await resolver.resolve(`large-${index}.canvas#node-a`, "Page.md")).status).toBe("resolved");
    }
    const count = read.mock.calls.length;
    await resolver.resolve("large-0.canvas#node-a", "Page.md");
    expect(read.mock.calls.length).toBe(count + 1);
    resolver.invalidate("boards/Plan.canvas");
    read.mockResolvedValueOnce("x".repeat(BOARD_CARD_LINK_LIMITS.boardBytes + 1));
    expect(await resolver.resolve("Alias#node-a", "Page.md")).toEqual({ status: "error", error: "too-large" });
  });

  it("bounds native node count and keeps unknown fields without rewriting the board", async () => {
    const { resolver, put, files } = fixture();
    const text = board([card("a", "text", { custom: { preserved: true } })], { miroSource: { evidence: "retained" }, other: "field" });
    put("boards/Plan.canvas", text);
    const resolved = await resolver.resolve("Alias#node-a", "Page.md");
    if (resolved.status !== "resolved") throw new Error("expected card");
    expect(resolved.target.node.custom).toEqual({ preserved: true });
    expect(resolved.target.board.document.miroSource).toEqual({ evidence: "retained" });
    expect(files.get("boards/Plan.canvas")?.text).toBe(text);
    put("boards/Plan.canvas", JSON.stringify({ nodes: Array.from({ length: BOARD_CARD_LINK_LIMITS.boardNodes + 1 }, (_, index) => ({ id: String(index) })), edges: [] }), 2);
    expect(await resolver.resolve("Alias#node-a", "Page.md")).toEqual({ status: "error", error: "too-large" });
  });
});

describe("reversible native card-link opener", () => {
  it("preserves normal calls, receiver, arguments and open state; injects native match for cards", async () => {
    const { resolver } = fixture();
    const calls: unknown[][] = [];
    const receivers: unknown[] = [];
    const original: CardLinkWorkspace["openLinkText"] = async function (this: CardLinkWorkspace, ...args) { calls.push(args); receivers.push(this); };
    const workspace = { openLinkText: original };
    const errors = vi.fn();
    const installed = installCanvasCardLinkOpener(workspace, resolver, errors);
    expect(installed.installed).toBe(true);
    const options = { active: false, state: { mode: "preview" }, eState: { keep: "value" } };
    await workspace.openLinkText("Note.md#Heading", "Page.md", "split", options);
    expect(calls[0]).toEqual(["Note.md#Heading", "Page.md", "split", options]);
    expect(calls[0][3]).toBe(options);
    await workspace.openLinkText("Alias#node-a", "Page.md", "tab", options);
    expect(calls[1]).toEqual(["boards/Plan.canvas", "Page.md", "tab", { ...options, eState: { keep: "value", match: { nodeId: "a", content: "**Actual** [[Sibling]]", matches: [] } } }]);
    expect(receivers).toEqual([workspace, workspace]);
    expect(options.eState).toEqual({ keep: "value" });
    expect(errors).not.toHaveBeenCalled();
    installed.dispose();
    expect(workspace.openLinkText).toBe(original);
  });

  it("does not open an entire board for missing/stale cards and suppresses opens after unload", async () => {
    const { resolver, read } = fixture();
    const original = vi.fn(async (..._args: Parameters<CardLinkWorkspace["openLinkText"]>) => {});
    const workspace = { openLinkText: original };
    const errors = vi.fn();
    const installed = installCanvasCardLinkOpener(workspace, resolver, errors);
    await workspace.openLinkText("Alias#node-missing", "Page.md");
    expect(errors).toHaveBeenCalledWith("missing-card", "Alias#node-missing");
    expect(original).not.toHaveBeenCalled();
    resolver.invalidate("boards/Plan.canvas");
    const response = deferred<string>();
    read.mockImplementationOnce(() => response.promise);
    const opening = workspace.openLinkText("Alias#node-a", "Page.md");
    await settle();
    installed.dispose();
    await opening;
    response.resolve(board());
    await settle();
    expect(original).not.toHaveBeenCalled();
  });

  it("restores inherited methods and leaves another plugin's later wrapper intact", () => {
    const { resolver } = fixture();
    const original = vi.fn(async () => {});
    const workspace = Object.create({ openLinkText: original }) as CardLinkWorkspace;
    const installed = installCanvasCardLinkOpener(workspace, resolver, () => {});
    installed.dispose();
    expect(Object.prototype.hasOwnProperty.call(workspace, "openLinkText")).toBe(false);
    const next = installCanvasCardLinkOpener(workspace, resolver, () => {});
    const other = vi.fn(async () => {});
    workspace.openLinkText = other;
    next.dispose();
    expect(workspace.openLinkText).toBe(other);
  });

  it("fails closed for a non-writable method", () => {
    const { resolver } = fixture();
    const workspace = {} as CardLinkWorkspace;
    Object.defineProperty(workspace, "openLinkText", { value: async () => {}, writable: false });
    expect(installCanvasCardLinkOpener(workspace, resolver, () => {}).installed).toBe(false);
  });

  it("reports a deleted explicit board instead of allowing native missing-file creation", async () => {
    const { resolver, resolvePath } = fixture();
    resolvePath.mockReturnValue(undefined);
    const original = vi.fn(async (..._args: Parameters<CardLinkWorkspace["openLinkText"]>) => {});
    const workspace = { openLinkText: original };
    const errors = vi.fn();
    const installed = installCanvasCardLinkOpener(workspace, resolver, errors);
    await workspace.openLinkText("Deleted.canvas#node-a", "Page.md");
    expect(errors).toHaveBeenCalledWith("missing-board", "Deleted.canvas#node-a");
    expect(original).not.toHaveBeenCalled();
    await workspace.openLinkText("Note.md#node-a", "Page.md");
    expect(original).toHaveBeenCalledTimes(1);
    installed.dispose();
  });
});

class Element {
  public readonly nodeType = 1;
  public readonly children: Element[] = [];
  public readonly attributes = new Map<string, string>();
  public parentNode: Element | null = null;
  public className = "";
  public textContent = "";
  public constructor(public readonly tagName: string, public readonly ownerDocument: FakeDocument) {}
  public get parentElement(): Element | null { return this.parentNode; }
  public appendChild(child: Element): Element { child.remove(); this.children.push(child); child.parentNode = this; return child; }
  public remove(): void {
    const parent = this.parentNode;
    if (parent !== null) { parent.children.splice(parent.children.indexOf(this), 1); this.parentNode = null; }
  }
  public replaceWith(child: Element): void {
    const parent = this.parentNode;
    if (parent === null) return;
    const position = parent.children.indexOf(this);
    child.remove();
    parent.children[position] = child;
    child.parentNode = parent;
    this.parentNode = null;
  }
  public replaceChildren(...children: Element[]): void {
    for (const child of [...this.children]) child.remove();
    this.textContent = "";
    for (const child of children) this.appendChild(child);
  }
  public setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
  public getAttribute(name: string): string | null { return this.attributes.get(name) ?? null; }
  public removeAttribute(name: string): void { this.attributes.delete(name); }
  public matches(selector: string): boolean { return selector === ".internal-embed[src]" && this.className.split(" ").includes("internal-embed") && this.attributes.has("src"); }
  public querySelectorAll(selector: string): Element[] { return this.children.flatMap((child) => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
  public text(): string { return this.textContent + this.children.map((child) => child.text()).join(" "); }
}

class FakeDocument {
  public readonly defaultView = null;
  public createElement(tag: string): Element { return new Element(tag, this); }
}

const labels: CardEmbedLabels = {
  loading: "Loading card",
  openCard: "Open card",
  groupTitle: (label, count) => `Read-only group ${label}, ${count} cards`,
  groupOverflow: (count) => `${count} more`,
  unsupported: (kind) => `Unsupported ${kind} card`,
  error: (code) => `Card error: ${code}`,
};

function embeds() {
  const data = fixture();
  const document = new FakeDocument();
  const root = document.createElement("div");
  const markdown = vi.fn(async (text: string, context: CardRenderContext) => { context.container.textContent = text; });
  const file = vi.fn(async (_path: string, _subpath: string, context: CardRenderContext) => { context.container.textContent = "Native file"; return true; });
  const host: CardEmbedHost = { labels, renderMarkdown: markdown, renderFile: file };
  const renderer = new BoardCardEmbeds(data.resolver, host);
  const add = (src = "Alias#node-a") => { const original = document.createElement("span"); original.className = "internal-embed"; original.setAttribute("src", src); root.appendChild(original); return original; };
  const process = () => renderer.postprocess(root as unknown as HTMLElement, "pages/Page.md");
  return { ...data, document, root, markdown, file, host, renderer, add, process };
}

describe("native card mount boundary", () => {
  it("preserves the native container/attributes/siblings and registers cleanup before rendering", async () => {
    const { add, renderer, root, markdown, host } = embeds();
    const container = add();
    container.setAttribute("native-state", "unchanged");
    const sibling = container.ownerDocument.createElement("strong");
    container.appendChild(sibling);
    const suspend = vi.fn(() => () => {});
    Object.assign(host, { suspendOriginal: suspend });
    const cleanups: Array<() => void> = [];
    markdown.mockImplementation(async (_text, context) => {
      expect(cleanups).toHaveLength(1);
      expect(context.depth).toBe(3);
      context.container.textContent = "Only this card";
    });
    const handle = renderer.mountNative(container as unknown as HTMLElement, "Alias#node-a", "Page.md", 3, (cleanup) => cleanups.push(cleanup))!;
    await handle.ready;
    expect(root.children).toEqual([container]);
    expect(container.children).toContain(sibling);
    expect(container.getAttribute("native-state")).toBe("unchanged");
    expect(suspend).not.toHaveBeenCalled();
    expect(renderer.postprocess(root as unknown as HTMLElement, "Page.md")).toEqual([]);
    const body = (handle.element as unknown as Element).children[1];
    const alreadyOwnedChild = container.ownerDocument.createElement("span");
    alreadyOwnedChild.className = "internal-embed";
    alreadyOwnedChild.setAttribute("src", "Alias#node-a");
    body.appendChild(alreadyOwnedChild);
    expect(renderer.postprocess(body as unknown as HTMLElement, "Page.md")).toEqual([]);
    cleanups[0]();
    handle.dispose();
    expect(container.children).toEqual([sibling]);
    expect(root.children).toEqual([container]);
  });

  it("cancels pending native rendering and immediately cleans late children", async () => {
    const { add, renderer, markdown } = embeds();
    const pending = deferred<void>();
    const cleanup = vi.fn();
    const late = vi.fn();
    const cleanups: Array<() => void> = [];
    markdown.mockImplementation(async (_text, context) => {
      context.registerCleanup(cleanup);
      await pending.promise;
      context.container.textContent = "Late content";
      context.registerCleanup(late);
    });
    const container = add();
    const handle = renderer.mountNative(container as unknown as HTMLElement, "Alias#node-a", "Page.md", 1, (cb) => cleanups.push(cb))!;
    await settle();
    cleanups[0]();
    expect(markdown.mock.calls[0][1].signal.aborted).toBe(true);
    pending.resolve();
    await handle.ready;
    expect(container.children).toEqual([]);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(late).toHaveBeenCalledTimes(1);
  });

  it("retires prior mounts and old cleanup cannot dispose the replacement", async () => {
    const { add, renderer, put, markdown } = embeds();
    put("boards/Plan.canvas", board([card(), card("b", "text", { text: "Replacement" })]));
    const container = add();
    const first = renderer.mountNative(container as unknown as HTMLElement, "Alias#node-a", "Page.md", 1)!;
    await first.ready;
    const second = renderer.mountNative(container as unknown as HTMLElement, "Alias#node-b", "Page.md", 1)!;
    await second.ready;
    first.dispose();
    expect(container.children).toHaveLength(1);
    expect(container.text()).toContain("Replacement");
    await second.refresh();
    expect(markdown).toHaveBeenCalledTimes(3);
    renderer.dispose();
    expect(container.children).toEqual([]);
    expect(renderer.mountNative(container as unknown as HTMLElement, "Alias#node-a", "Page.md", 1)).toBeUndefined();
  });

  it("rejects invalid destinations/depth and native excessive depth before I/O", async () => {
    const { add, renderer, read } = embeds();
    const container = add();
    for (const depth of [-1, NaN, Infinity, 1.5]) {
      expect(renderer.mountNative(container as unknown as HTMLElement, "Alias#node-a", "Page.md", depth)).toBeUndefined();
    }
    expect(renderer.mountNative(container as unknown as HTMLElement, "Note.md#Heading", "Page.md", 1)).toBeUndefined();
    const handle = renderer.mountNative(container as unknown as HTMLElement, "Alias#node-a", "Page.md", BOARD_CARD_LINK_LIMITS.embedDepth + 1)!;
    await handle.ready;
    expect(container.text()).toContain("recursion-limit");
    expect(read).not.toHaveBeenCalled();
  });

  it("registers immediate native unload before starting reads", async () => {
    const { add, renderer, read } = embeds();
    const container = add();
    const handle = renderer.mountNative(container as unknown as HTMLElement, "Alias#node-a", "Page.md", 1, (cleanup) => cleanup())!;
    await handle.ready;
    expect(read).not.toHaveBeenCalled();
    expect(container.children).toEqual([]);
  });

  it("propagates ancestor keys through detached native children and releases them on refresh", async () => {
    const { add, renderer, markdown, put, document } = embeds();
    put("boards/Plan.canvas", board([], { miroCanvas: { schemaVersion: 1, nodeRedirects: { a: { file: "Moved.canvas", nodeId: "b" } } } }));
    put("Moved.canvas", board([card("b")]));
    const childCleanup = vi.fn();
    markdown.mockImplementation(async (_text, context) => {
      const nested = document.createElement("span");
      (context.container as unknown as Element).appendChild(nested);
      const child = renderer.mountNative(nested as unknown as HTMLElement, "Alias#node-a", context.sourcePath, context.depth + 1, (cleanup) => {
        context.registerCleanup(() => { childCleanup(); cleanup(); });
      })!;
      await child.ready;
    });
    const container = add();
    const handle = renderer.mountNative(container as unknown as HTMLElement, "Alias#node-a", "Page.md", 1)!;
    await handle.ready;
    expect(markdown).toHaveBeenCalledTimes(1);
    expect(container.text()).toContain("recursion-limit");
    await handle.refresh();
    expect(childCleanup).toHaveBeenCalledTimes(1);
    handle.dispose();
    expect(childCleanup).toHaveBeenCalledTimes(2);
    expect(container.children).toEqual([]);
  });
});

class NativeComponent {
  public loaded = false;
  public readonly callbacks: Array<() => void> = [];
  public register(callback: () => void): void { this.callbacks.push(callback); }
  public load(): void { this.loaded = true; }
  public unload(): void {
    if (!this.loaded) return;
    this.loaded = false;
    for (const callback of this.callbacks.splice(0).reverse()) callback();
  }
}

function creatorFixture() {
  const data = embeds();
  const container = data.add("boards/Plan.canvas#node-a");
  const context = { containerEl: container as unknown as HTMLElement, sourcePath: "pages/Page.md", linktext: "boards/Plan.canvas#node-a", depth: 1 };
  const file = { path: "boards/Plan.canvas", extension: "canvas" };
  const original = vi.fn((..._args: unknown[]) => ({ original: true }));
  const creators = { canvas: original };
  const registry = { embedByExtension: creators, getEmbedCreator: () => creators.canvas };
  const requests: CanvasCardEmbedCreatorRequest[] = [];
  const load = vi.fn();
  const loadFile = vi.fn();
  const create = vi.fn((request: CanvasCardEmbedCreatorRequest): CanvasCardEmbedComponent => {
    requests.push(request);
    class CardComponent extends NativeComponent {
      public override load(): void { load(); super.load(); }
      public async loadFile(): Promise<void> {
        loadFile();
        const handle = data.renderer.mountNative(request.context.containerEl, request.context.linktext,
          request.context.sourcePath, request.context.depth, request.registerCleanup);
        if (handle !== undefined) { this.register(() => handle.dispose()); await handle.ready; }
      }
    }
    return new CardComponent() as unknown as CanvasCardEmbedComponent;
  });
  const options = { Component: NativeComponent as unknown as new () => Component, create, onError: vi.fn() };
  const install = () => installCanvasCardEmbedCreator({ embedRegistry: registry }, options);
  const invoke = (subpath = "#node-a") => Reflect.apply(creators.canvas, registry, [context, file, subpath]) as unknown as CanvasCardEmbedComponent;
  return { ...data, context, container, file, registry, creators, original, requests, load, loadFile, options, install, invoke };
}

describe("early native Canvas card creator", () => {
  it("intercepts copied raw-space wiki/Markdown link and embed destinations before original construction", async () => {
    const data = creatorFixture();
    const path = "Project Boards/Café план.canvas";
    data.put(path);
    const copied = canvasCardLink(path, "a")!;
    expect(`[[${copied}]]`).toContain(path);
    expect(`![[${copied}]]`).toContain(path);
    expect(`[Card](<${copied}>)`).toContain(path);
    expect(`![Card](<${copied}>)`).toContain(path);
    data.context.linktext = copied;
    data.file.path = path;
    const descriptor = Object.getOwnPropertyDescriptor(data.creators, "canvas");
    const helper = data.install();
    expect(helper.installed).toBe(true);
    const component = data.invoke();
    component.load();
    await Promise.all([component.loadFile(), component.loadFile()]);
    expect(data.original).not.toHaveBeenCalled();
    expect(data.load).toHaveBeenCalledTimes(1);
    expect(data.loadFile).toHaveBeenCalledTimes(1);
    expect(data.markdown.mock.calls[0][1].sourcePath).toBe(path);
    expect(data.root.children).toEqual([data.container]);
    expect(data.process()).toEqual([]);
    helper.dispose();
    expect(data.requests[0].signal.aborted).toBe(true);
    expect(data.container.children).toEqual([]);
    expect(data.container.getAttribute("data-miro-canvas-card-creator")).toBeNull();
    expect(Object.getOwnPropertyDescriptor(data.creators, "canvas")).toEqual(descriptor);
  });

  it("passes ordinary embeds through with exact receiver and arguments", () => {
    const data = creatorFixture();
    const helper = data.install();
    for (const fragment of [undefined, "", "#Heading", "#^block", "#node-", "#node-%XX", "#node-a#other"]) {
      const args = [data.context, data.file, fragment];
      expect(Reflect.apply(data.creators.canvas, data.registry, args)).toEqual({ original: true });
      expect(data.original.mock.calls.at(-1)).toEqual(args);
      expect(data.original.mock.contexts.at(-1)).toBe(data.registry);
    }
    expect(data.options.create).not.toHaveBeenCalled();
    helper.dispose();
  });

  it("unloads a pending native render and disposes late resources without publishing", async () => {
    const data = creatorFixture();
    const pending = deferred<void>();
    const late = vi.fn();
    data.markdown.mockImplementation(async (_text, context) => {
      await pending.promise;
      context.container.textContent = "Late native card";
      context.registerCleanup(late);
    });
    const helper = data.install();
    const component = data.invoke();
    const loading = component.loadFile();
    await settle();
    component.unload();
    pending.resolve();
    await loading;
    expect(late).toHaveBeenCalledTimes(1);
    expect(data.requests[0].signal.aborted).toBe(true);
    expect(data.container.children).toEqual([]);
    const afterUnload = vi.fn();
    data.requests[0].registerCleanup(afterUnload);
    expect(afterUnload).toHaveBeenCalledTimes(1);
    helper.dispose();
  });

  it("cleans failed factories without invoking the original whole-board creator", async () => {
    const data = creatorFixture();
    const cleanup = vi.fn();
    data.options.create.mockImplementation((request) => { request.registerCleanup(cleanup); throw new Error("failed"); });
    const helper = data.install();
    const component = data.invoke();
    await component.loadFile();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(data.options.onError).toHaveBeenCalledWith(expect.anything(), "creator-failed");
    expect(data.original).not.toHaveBeenCalled();
    component.unload();
    helper.dispose();
  });

  it("reports loadFile failure and aborts component ownership", async () => {
    const data = creatorFixture();
    const helper = data.install();
    data.options.create.mockImplementation((request) => {
      data.requests.push(request);
      return Object.assign(new NativeComponent(), { loadFile: async () => { throw new Error("failed"); } }) as unknown as CanvasCardEmbedComponent;
    });
    const component = data.invoke();
    await component.loadFile();
    expect(data.options.onError).toHaveBeenCalledWith(data.requests[0], "component-load-failed");
    expect(data.requests[0].signal.aborted).toBe(true);
    expect(data.container.getAttribute("data-miro-canvas-card-creator")).toBeNull();
    helper.dispose();
  });

  it("rejects non-native component results without constructing the whole board", async () => {
    const data = creatorFixture();
    data.options.create.mockReturnValue({ loadFile: async () => {} } as CanvasCardEmbedComponent);
    const helper = data.install();
    const component = data.invoke();
    await component.loadFile();
    expect(data.options.onError).toHaveBeenCalledWith(expect.anything(), "component-invalid");
    expect(data.original).not.toHaveBeenCalled();
    helper.dispose();
  });

  it("keeps public load synchronous while loadFile awaits verified runtime loading", async () => {
    const data = creatorFixture();
    const pending = deferred<void>();
    const render = vi.fn(async () => {});
    const lifecycle = vi.fn(() => pending.promise);
    data.options.create.mockImplementation(() => {
      const component = Object.assign(new NativeComponent(), { loadFile: render });
      Reflect.set(component, "load", lifecycle);
      return component as unknown as CanvasCardEmbedComponent;
    });
    const helper = data.install();
    const component = data.invoke();
    expect(component.load()).toBeUndefined();
    const ready = component.loadFile();
    await settle();
    expect(render).not.toHaveBeenCalled();
    pending.resolve();
    await ready;
    expect(lifecycle).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledTimes(1);
    helper.dispose();
  });

  it("retires an old same-container owner and preserves a later extension hook", async () => {
    const data = creatorFixture();
    const helper = data.install();
    const first = data.invoke();
    await first.loadFile();
    const second = data.invoke();
    expect(data.requests[0].signal.aborted).toBe(true);
    await second.loadFile();
    first.unload();
    expect(data.container.getAttribute("data-miro-canvas-card-creator")).toBe("true");
    const later = vi.fn(() => ({ original: true }));
    data.creators.canvas = later;
    helper.dispose();
    expect(data.creators.canvas).toBe(later);
    expect(data.requests[1].signal.aborted).toBe(true);
  });

  it("fails closed when registry identity or writable slot is unverified", () => {
    const data = creatorFixture();
    data.registry.getEmbedCreator = () => vi.fn();
    expect(data.install().installed).toBe(false);
    data.registry.getEmbedCreator = () => data.creators.canvas;
    Object.defineProperty(data.creators, "canvas", { writable: false });
    expect(data.install().installed).toBe(false);
  });
});

describe("single card Markdown embeds", () => {
  it("renders only selected text from the destination board, preserving Markdown/sourcePath and page focus", async () => {
    const { process, add, root, markdown, file, put } = embeds();
    put("boards/Plan.canvas", board([card(), card("other", "text", { text: "Do not show" })]));
    const original = add();
    const normal = add("Note.md#Heading");
    const whole = add("boards/Plan.canvas");
    const handles = process();
    await settle();
    expect(handles).toHaveLength(1);
    expect(markdown).toHaveBeenCalledTimes(1);
    expect(markdown.mock.calls[0][0]).toBe("**Actual** [[Sibling]]");
    expect(markdown.mock.calls[0][1].sourcePath).toBe("boards/Plan.canvas");
    expect(root.text()).not.toContain("Do not show");
    expect(root.children).toContain(normal);
    expect(root.children).toContain(whole);
    expect(root.children).not.toContain(original);
    expect(file).not.toHaveBeenCalled();
    expect(handles[0].element.getAttribute("data-card-state")).toBe("ready");
    expect((handles[0].element as unknown as Element).children[0].getAttribute("data-href")).toBe("boards/Plan.canvas#node-a");
  });

  it("uses native file embeds with the exact path/subpath and destination sourcePath", async () => {
    const { put, add, process, file, markdown } = embeds();
    put("boards/Plan.canvas", board([card("f", "file", { file: "notes/Report.md", subpath: "#^item", custom: { preserve: true } })]));
    add("Alias#node-f");
    const handles = process();
    await settle();
    expect(file.mock.calls[0].slice(0, 2)).toEqual(["notes/Report.md", "#^item"]);
    expect(file.mock.calls[0][2].sourcePath).toBe("boards/Plan.canvas");
    expect(markdown).not.toHaveBeenCalled();
    expect(handles[0].element.getAttribute("data-card-state")).toBe("ready");
  });

  it("renders scoped read-only group summaries, never the whole board or arbitrary child content", async () => {
    const { put, add, process, root, markdown, file } = embeds();
    put("boards/Plan.canvas", board([card("g", "group", { width: 300, height: 300, label: "Team" }), card(), card("outside", "text", { x: 999, text: "Outside secret" })]));
    add("Alias#node-g");
    process();
    await settle();
    expect(root.text()).toContain("Read-only group Team, 1 cards");
    expect(root.text()).toContain("Actual");
    expect(root.text()).not.toContain("Outside secret");
    expect(markdown).not.toHaveBeenCalled();
    expect(file).not.toHaveBeenCalled();
  });

  it("reports unsupported drawings/web cards without falling back to a board preview", async () => {
    const { put, add, process, root, markdown, file } = embeds();
    put("boards/Plan.canvas", board([card(), card("web", "link", { url: "https://example.test" })], {
      miroCanvas: { schemaVersion: 1, localOverrides: { a: { item: { type: "drawing", stroke: { points: [] } } } } },
    }));
    add();
    add("Alias#node-web");
    const handles = process();
    await settle();
    expect(root.text()).toContain("Unsupported drawing card");
    expect(root.text()).toContain("Unsupported link card");
    expect(handles.map((handle) => handle.element.getAttribute("data-card-state"))).toEqual(["unsupported", "unsupported"]);
    expect(markdown).not.toHaveBeenCalled();
    expect(file).not.toHaveBeenCalled();
  });

  it("rejects missing/file-unsupported/render-failed content with injected feedback and cleanup", async () => {
    const { put, add, process, file, markdown, root, renderer } = embeds();
    const cleanup = vi.fn();
    file.mockImplementationOnce(async (_path, _subpath, context) => { context.registerCleanup(cleanup); return false; });
    put("boards/Plan.canvas", board([card("file", "file", { file: "missing.md" }), card()]));
    add("Alias#node-missing");
    add("Alias#node-file");
    add();
    markdown.mockRejectedValueOnce(new Error("renderer failed"));
    process();
    await settle();
    expect(root.text()).toContain("Card error: missing-card");
    expect(root.text()).toContain("Card error: unsupported-card");
    expect(root.text()).toContain("Card error: render-failed");
    expect(cleanup).toHaveBeenCalledTimes(1);
    renderer.dispose();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("ignores late generations, cleans their children and restores original embeds on unload", async () => {
    const { add, process, markdown, renderer, root } = embeds();
    const first = deferred<void>();
    const cleaned: string[] = [];
    markdown.mockImplementationOnce(async (_text, context) => {
      context.registerCleanup(() => cleaned.push("first"));
      await first.promise;
      context.container.textContent = "OLD";
      context.registerCleanup(() => cleaned.push("late"));
    });
    const original = add();
    const handles = process();
    await settle();
    expect(markdown).toHaveBeenCalledTimes(1);
    await handles[0].refresh();
    expect(cleaned).toEqual(["first"]);
    expect(root.text()).toContain("Actual");
    first.resolve();
    await settle();
    expect(root.text()).not.toContain("OLD");
    expect(cleaned).toEqual(["first", "late"]);
    renderer.dispose();
    expect(root.children).toEqual([original]);
  });

  it("will not commit rendering after a board changes and aborts/disposes detached page jobs", async () => {
    const { add, process, markdown, put, root, renderer } = embeds();
    const response = deferred<void>();
    const cleanup = vi.fn();
    markdown.mockImplementationOnce(async (_text, context) => { context.registerCleanup(cleanup); await response.promise; context.container.textContent = "stale"; });
    add();
    const handles = process();
    await settle();
    put("boards/Plan.canvas", board(), 2);
    response.resolve();
    await settle();
    expect(root.text()).toContain("Card error: stale");
    expect(cleanup).toHaveBeenCalledTimes(1);
    (handles[0].element as unknown as Element).remove();
    handles[0].dispose();
    renderer.dispose();
    expect(root.children).toEqual([]);
  });

  it("refreshes changed/redirected content and releases native child ownership exactly once", async () => {
    const { add, process, markdown, resolver, put, renderer, root } = embeds();
    const cleanup = vi.fn();
    markdown.mockImplementation(async (text, context) => { context.registerCleanup(cleanup); context.container.textContent = text; });
    add();
    process();
    await settle();
    put("boards/Plan.canvas", board([], { miroCanvas: { schemaVersion: 1, nodeRedirects: { a: { file: "Moved.canvas", nodeId: "b" } } } }), 2);
    put("Moved.canvas", board([card("b", "text", { text: "Moved actual" })]));
    resolver.invalidate("boards/Plan.canvas");
    await renderer.refresh();
    expect(root.text()).toContain("Moved actual");
    expect(markdown.mock.calls[1][1].sourcePath).toBe("Moved.canvas");
    expect(cleanup).toHaveBeenCalledTimes(1);
    renderer.dispose();
    expect(cleanup).toHaveBeenCalledTimes(2);
  });

  it("bounds admitted embeds and group summaries, using explicit limit feedback", async () => {
    const { add, process, markdown, root } = embeds();
    for (let count = 0; count <= BOARD_CARD_LINK_LIMITS.mountedEmbeds; count += 1) add();
    process();
    await settle();
    expect(markdown).toHaveBeenCalledTimes(BOARD_CARD_LINK_LIMITS.mountedEmbeds);
    expect(root.text()).toContain("Card error: embed-limit");
  });

  it("caps flat group items and labels the remainder, including an empty group", async () => {
    const { add, put, process, root } = embeds();
    const members = Array.from({ length: BOARD_CARD_LINK_LIMITS.groupItems + 1 }, (_, index) => card(`member-${index}`, "text", { text: `Member ${index}` }));
    put("boards/Plan.canvas", board([card("group", "group", { label: "Team", width: 200, height: 200 }), ...members,
      card("empty", "group", { x: 999, label: "Empty" })]));
    add("Alias#node-group");
    add("Alias#node-empty");
    const handles = process();
    await settle();
    expect(root.text()).toContain("Read-only group Team, 101 cards");
    expect(root.text()).toContain("1 more");
    expect(root.text()).not.toContain("Member 100");
    expect(root.text()).toContain("Read-only group Empty, 0 cards");
    const body = (handles[0].element as unknown as Element).children[1];
    expect(body.children.find((element) => element.tagName === "ul")?.children).toHaveLength(BOARD_CARD_LINK_LIMITS.groupItems);
  });

  it("uses explicit feedback for blank styled shapes and unsafe file destinations", async () => {
    const { add, put, process, root, file, markdown } = embeds();
    put("boards/Plan.canvas", board([card("shape", "text", { text: "" }), card("file", "file", { file: "https://remote.test/file.png" })],
      { miroCanvas: { schemaVersion: 1, localOverrides: { shape: { shape: { kind: "circle" } } } } }));
    add("Alias#node-shape");
    add("Alias#node-file");
    process();
    await settle();
    expect(root.text()).toContain("Unsupported shape card");
    expect(root.text()).toContain("Unsupported file card");
    expect(file).not.toHaveBeenCalled();
    expect(markdown).not.toHaveBeenCalled();
  });

  it("continues restoring other children when a native child cleanup fails", async () => {
    const { add, process, markdown, host, root, renderer } = embeds();
    const diagnostics = vi.fn();
    Object.assign(host, { onDiagnostic: diagnostics });
    const second = vi.fn();
    markdown.mockImplementation(async (_text, context) => {
      context.registerCleanup(() => { throw new Error("child already closed"); });
      context.registerCleanup(second);
    });
    const original = add();
    process();
    await settle();
    renderer.dispose();
    expect(second).toHaveBeenCalledTimes(1);
    expect(diagnostics).toHaveBeenCalledWith("card-embed-cleanup-failed");
    expect(root.children).toEqual([original]);
  });

  it("suspends/restores a preexisting native owner exactly once", async () => {
    const { add, process, host, renderer } = embeds();
    const restore = vi.fn();
    const suspend = vi.fn(() => restore);
    Object.assign(host, { suspendOriginal: suspend });
    const original = add();
    const handles = process();
    await settle();
    expect(suspend).toHaveBeenCalledWith(original);
    handles[0].dispose();
    renderer.dispose();
    expect(restore).toHaveBeenCalledTimes(1);
  });

  it("shows a suspension failure explicitly without reading/rendering a whole-board fallback", async () => {
    const { add, process, host, root, read, markdown } = embeds();
    Object.assign(host, { suspendOriginal: () => { throw new Error("unsupported native owner"); } });
    const original = add();
    const handles = process();
    await handles[0].ready;
    expect(root.text()).toContain("Card error: render-failed");
    expect(read).not.toHaveBeenCalled();
    expect(markdown).not.toHaveBeenCalled();
    handles[0].dispose();
    expect(root.children).toEqual([original]);
  });

  it("detects recursive card embeds through detached Markdown staging containers", async () => {
    const { add, process, markdown, renderer, document, root } = embeds();
    const rendered = deferred<void>();
    markdown.mockImplementation(async (_text, context) => {
      const nested = document.createElement("span");
      nested.className = "internal-embed";
      nested.setAttribute("src", "Alias#node-a");
      (context.container as unknown as Element).appendChild(nested);
      renderer.postprocess(context.container, context.sourcePath);
      await settle();
      rendered.resolve();
    });
    add();
    process();
    await rendered.promise;
    await settle();
    expect(markdown).toHaveBeenCalledTimes(1);
    expect(root.text()).toContain("Card error: recursion-limit");
  });

  it("bounds individual text/subpath rendering and exposes initial completion without opening a leaf", async () => {
    const { add, put, process, root, markdown, file } = embeds();
    put("boards/Plan.canvas", board([card("big", "text", { text: "x".repeat(BOARD_CARD_LINK_LIMITS.cardCharacters + 1) }),
      card("file", "file", { file: "Report.md", subpath: "#".repeat(4097) })]));
    add("Alias#node-big");
    add("Alias#node-file");
    const handles = process();
    await Promise.all(handles.map((handle) => handle.ready));
    expect(root.text()).toContain("Card error: too-large");
    expect(markdown).not.toHaveBeenCalled();
    expect(file).not.toHaveBeenCalled();
  });

  it("caps noncyclic nested card depth and releases nested handles with their staging owner", async () => {
    const { add, put, process, document, markdown, renderer, root } = embeds();
    put("boards/Plan.canvas", board(Array.from({ length: BOARD_CARD_LINK_LIMITS.embedDepth + 2 }, (_, index) => card(String(index), "text", { text: String(index + 1) }))));
    markdown.mockImplementation(async (text, context) => {
      const nested = document.createElement("span");
      nested.className = "internal-embed";
      nested.setAttribute("src", `Alias#node-${text}`);
      (context.container as unknown as Element).appendChild(nested);
      const children = renderer.postprocess(context.container, context.sourcePath);
      await Promise.all(children.map((child) => child.ready));
    });
    const original = add("Alias#node-0");
    const handles = process();
    await handles[0].ready;
    expect(markdown).toHaveBeenCalledTimes(BOARD_CARD_LINK_LIMITS.embedDepth);
    expect(root.text()).toContain("Card error: recursion-limit");
    handles[0].dispose();
    renderer.dispose();
    expect(root.children).toEqual([original]);
  });
});
