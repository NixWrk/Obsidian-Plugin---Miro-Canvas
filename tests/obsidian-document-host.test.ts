import { afterEach, describe, expect, it, vi } from "vitest";

import type { TFile, App } from "obsidian";
import { applyNativePdfFit, createObsidianDocumentHost } from "../src/obsidian-document-host";
import { describeLocalDocument } from "../src/document-viewer";

function receiverSensitiveWindow() {
  const handles = new Map<number, ReturnType<typeof setTimeout>>();
  let nextHandle = 0;
  const owner = {
    setTimeout: vi.fn(function (this: unknown, callback: () => void, delay: number) {
      if (this !== owner) throw new Error("Wrong scheduling receiver");
      const handle = nextHandle++;
      handles.set(handle, setTimeout(callback, delay));
      return handle;
    }),
    clearTimeout: vi.fn(function (this: unknown, handle: number) {
      if (this !== owner) throw new Error("Wrong cleanup receiver");
      const timer = handles.get(handle);
      if (timer !== undefined) clearTimeout(timer);
      handles.delete(handle);
    }),
  };
  return owner;
}

function pendingViewer() {
  let resolve!: (value: unknown) => void;
  let reject!: (reason: Error) => void;
  const viewer = new Promise<unknown>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { viewer, resolve, reject };
}

function expectOwnerCleanup(owner: ReturnType<typeof receiverSensitiveWindow>) {
  expect(owner.setTimeout).toHaveBeenCalledOnce();
  expect(owner.setTimeout).toHaveBeenCalledWith(expect.any(Function), 2000);
  expect(owner.setTimeout.mock.contexts).toEqual([owner]);
  expect(owner.clearTimeout).toHaveBeenCalledExactlyOnceWith(0);
  expect(owner.clearTimeout.mock.contexts).toEqual([owner]);
  expect(vi.getTimerCount()).toBe(0);
}

describe("native document host", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  it("uses native page navigation and an explicitly detected PDF fit bridge", async () => {
    const file = {} as TFile;
    const pdf = { currentScaleValue: "page-width", pdfDocument: {}, firstPagePromise: Promise.resolve(), pagesPromise: Promise.resolve() };
    const openFile = vi.fn();
    const leaf = { openFile, view: { file, viewer: Promise.resolve({ pdfViewer: { pdfViewer: pdf } }) } };
    const app = {
      vault: { getAbstractFileByPath: (path: string) => path === "local.pdf" ? file : null },
      workspace: { getLeaf: vi.fn(() => leaf) },
    } as unknown as App;
    const diagnostic = vi.fn();
    const host = createObsidianDocumentHost(app, diagnostic, (value): value is TFile => value === file);
    expect(host.hasFile("local.pdf")).toBe(true);
    expect(host.hasFile("missing.pdf")).toBe(false);
    expect(openFile).not.toHaveBeenCalled();
    await host.openFile(describeLocalDocument("local.pdf", { page: 3 })!);
    expect(openFile).toHaveBeenCalledWith(file, { active: true, eState: { subpath: "#page=3" } });
    expect(pdf.currentScaleValue).toBe("page-fit");
    expect(diagnostic).not.toHaveBeenCalled();
  });

  it("does not pretend unknown native fit fields were supported", async () => {
    expect(await applyNativePdfFit({}, describeLocalDocument("local.pdf")!)).toBe(false);
    expect(await applyNativePdfFit({ viewer: Promise.reject(new Error("closed")) }, describeLocalDocument("local.pdf")!)).toBe(false);
    expect(await applyNativePdfFit({}, describeLocalDocument("local.md")!)).toBe(true);
  });

  it("reuses a document tab and preserves Markdown heading navigation", async () => {
    const file = {} as TFile;
    const leaf = { openFile: vi.fn(), view: { file } };
    const getLeaf = vi.fn();
    const app = {
      vault: { getAbstractFileByPath: () => file },
      workspace: { getLeavesOfType: vi.fn(() => [leaf]), getLeaf },
    } as unknown as App;
    const host = createObsidianDocumentHost(app, vi.fn(), (value): value is TFile => value === file);
    await host.openFile(describeLocalDocument("note.md", { subpath: "#Heading" })!);
    expect(leaf.openFile).toHaveBeenCalledWith(file, { active: true, eState: { subpath: "#Heading" } });
    expect(getLeaf).not.toHaveBeenCalled();
  });

  it("times out a never-ready PDF viewer without writing anything", async () => {
    vi.useFakeTimers();
    try {
      const result = applyNativePdfFit({ viewer: new Promise(() => {}) }, describeLocalDocument("local.pdf")!);
      expect(typeof window).toBe("undefined");
      expect(vi.getTimerCount()).toBe(1);
      await vi.advanceTimersByTimeAsync(2000);
      expect(await result).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });

  it.each(["page", "width"] as const)("fits a ready PDF to %s and clears on its owner with handle zero", async (fit) => {
    vi.useFakeTimers();
    const owner = receiverSensitiveWindow();
    const fallback = receiverSensitiveWindow();
    vi.stubGlobal("window", fallback);
    const pdf = { currentScaleValue: "auto", pdfDocument: {}, firstPagePromise: Promise.resolve(), pagesPromise: Promise.resolve() };
    const view = {
      containerEl: { ownerDocument: { defaultView: owner } },
      viewer: Promise.resolve({ pdfViewer: { pdfViewer: pdf } }),
    };
    expect(await applyNativePdfFit(view, describeLocalDocument("local.pdf", { fit })!)).toBe(true);
    expect(pdf.currentScaleValue).toBe(fit === "width" ? "page-width" : "page-fit");
    expectOwnerCleanup(owner);
    expect(fallback.setTimeout).not.toHaveBeenCalled();
    expect(fallback.clearTimeout).not.toHaveBeenCalled();
  });

  it.each(["resolve", "reject", "unsupported", "timeout"] as const)("keeps the same timer owner after a view moves or closes: %s", async (settlement) => {
    vi.useFakeTimers();
    const owner = receiverSensitiveWindow();
    const otherWindow = receiverSensitiveWindow();
    const pending = pendingViewer();
    const ownerDocument = { defaultView: owner };
    const view = { containerEl: { ownerDocument }, viewer: pending.viewer };
    const pdf = { currentScaleValue: "auto", pdfDocument: {}, firstPagePromise: Promise.resolve(), pagesPromise: Promise.resolve() };
    const result = applyNativePdfFit(view, describeLocalDocument("local.pdf")!);
    ownerDocument.defaultView = otherWindow;
    vi.stubGlobal("window", otherWindow);
    if (settlement === "resolve") pending.resolve({ pdfViewer: { pdfViewer: pdf } });
    if (settlement === "reject") pending.reject(new Error("Tab closed"));
    if (settlement === "unsupported") pending.resolve({ pdfViewer: {} });
    if (settlement === "timeout") {
      let settled = false;
      void result.then(() => { settled = true; });
      await vi.advanceTimersByTimeAsync(1999);
      expect(settled).toBe(false);
      expect(owner.clearTimeout).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
    }
    expect(await result).toBe(settlement === "resolve");
    expectOwnerCleanup(owner);
    expect(otherWindow.setTimeout).not.toHaveBeenCalled();
    expect(otherWindow.clearTimeout).not.toHaveBeenCalled();
    if (settlement === "timeout") {
      pending.resolve({ pdfViewer: { pdfViewer: pdf } });
      await Promise.resolve();
      expect(pdf.currentScaleValue).toBe("auto");
      expectOwnerCleanup(owner);
    }
  });

  it.each([undefined, null, { setTimeout: vi.fn() }, { clearTimeout: vi.fn() }])("uses a bounded window fallback when no compatible owner pair exists: %s", async (defaultView) => {
    vi.useFakeTimers();
    const fallback = receiverSensitiveWindow();
    const otherWindow = receiverSensitiveWindow();
    vi.stubGlobal("window", fallback);
    const view = {
      containerEl: { ownerDocument: { defaultView } },
      viewer: new Promise(() => {}),
    };
    const result = applyNativePdfFit(view, describeLocalDocument("local.pdf")!);
    vi.stubGlobal("window", otherWindow);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await result).toBe(false);
    expectOwnerCleanup(fallback);
    expect(otherWindow.clearTimeout).not.toHaveBeenCalled();
    if (defaultView && "setTimeout" in defaultView) expect(defaultView.setTimeout).not.toHaveBeenCalled();
    if (defaultView && "clearTimeout" in defaultView) expect(defaultView.clearTimeout).not.toHaveBeenCalled();
  });

  it("falls back when private owner access throws, and clears after readiness rejects", async () => {
    vi.useFakeTimers();
    const fallback = receiverSensitiveWindow();
    vi.stubGlobal("window", fallback);
    const view = {
      get containerEl(): never { throw new Error("Detached view"); },
      viewer: Promise.reject(new Error("Viewer unloaded")),
    };
    expect(await applyNativePdfFit(view, describeLocalDocument("local.pdf")!)).toBe(false);
    expectOwnerCleanup(fallback);
  });

  it("does not read the owner or create a timer for non-PDF and absent viewer promises", async () => {
    vi.useFakeTimers();
    const owner = receiverSensitiveWindow();
    const readContainer = vi.fn(() => { throw new Error("Owner should not be probed"); });
    const view = { get containerEl() { return readContainer(); } };
    vi.stubGlobal("window", owner);
    expect(await applyNativePdfFit(view, describeLocalDocument("local.md")!)).toBe(true);
    expect(await applyNativePdfFit(view, describeLocalDocument("local.pdf")!)).toBe(false);
    expect(readContainer).not.toHaveBeenCalled();
    expect(owner.setTimeout).not.toHaveBeenCalled();
    expect(owner.clearTimeout).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});


describe("PDF file readiness within one owner deadline", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function readyPdf() {
    return { pdfDocument: {} as unknown, currentScaleValue: "auto", firstPagePromise: Promise.resolve() as Promise<unknown>, pagesPromise: Promise.resolve() as Promise<unknown> };
  }
  function viewWith(pdf: unknown, owner = receiverSensitiveWindow()) {
    const application = { pdfViewer: pdf, initializedPromise: Promise.resolve() as Promise<unknown>, isInitialViewSet: true };
    const renderer = { pdfViewer: application };
    const view = { containerEl: { ownerDocument: { defaultView: owner } }, viewer: Promise.resolve(renderer) };
    return { view, renderer, application, owner };
  }
  function expectClean(owner: ReturnType<typeof receiverSensitiveWindow>) {
    expect(vi.getTimerCount()).toBe(0);
    expect(owner.setTimeout.mock.contexts.every(receiver => receiver === owner)).toBe(true);
    expect(owner.clearTimeout.mock.contexts.every(receiver => receiver === owner)).toBe(true);
    expect(owner.clearTimeout).toHaveBeenCalledWith(0);
  }

  it.each(["page", "width"] as const)("waits for late file/page capabilities and native initial scale before fitting %s", async (fit) => {
    vi.useFakeTimers();
    const first = pendingViewer(), pages = pendingViewer();
    const pdf = { pdfDocument: null as unknown, currentScaleValue: null as string | null, firstPagePromise: null as Promise<unknown> | null, pagesPromise: null as Promise<unknown> | null };
    const f = viewWith(pdf);
    f.application.isInitialViewSet = false;
    const result = applyNativePdfFit(f.view, describeLocalDocument("local.pdf", { fit })!);
    await vi.advanceTimersByTimeAsync(250);
    expect(pdf.currentScaleValue).toBeNull();
    pdf.pdfDocument = {};
    pdf.firstPagePromise = first.viewer;
    pdf.pagesPromise = pages.viewer;
    // Native initialization is still allowed to set its default before fitting.
    void first.viewer.then(() => { pdf.currentScaleValue = "page-width"; });
    await vi.advanceTimersByTimeAsync(25);
    first.resolve(undefined);
    await vi.advanceTimersByTimeAsync(0);
    expect(pdf.currentScaleValue).toBe("page-width");
    let settled = false;
    void result.then(() => { settled = true; });
    expect(settled).toBe(false);
    pages.resolve(undefined);
    await vi.advanceTimersByTimeAsync(25);
    expect(settled).toBe(false);
    f.application.isInitialViewSet = true;
    await vi.advanceTimersByTimeAsync(25);
    expect(await result).toBe(true);
    expect(pdf.currentScaleValue).toBe(fit === "width" ? "page-width" : "page-fit");
    expectClean(f.owner);
  });

  it("shares the exact 2000ms deadline across renderer and file loading, ignoring late readiness", async () => {
    vi.useFakeTimers();
    const owner = receiverSensitiveWindow();
    const rendererReady = pendingViewer(), first = pendingViewer(), pages = pendingViewer();
    const pdf = readyPdf();
    pdf.firstPagePromise = first.viewer;
    pdf.pagesPromise = pages.viewer;
    const view = { containerEl: { ownerDocument: { defaultView: owner } }, viewer: rendererReady.viewer };
    const result = applyNativePdfFit(view, describeLocalDocument("local.pdf")!);
    let settled = false;
    void result.then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(1500);
    rendererReady.resolve({ pdfViewer: { pdfViewer: pdf } });
    await vi.advanceTimersByTimeAsync(499);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toBe(false);
    expectClean(owner);
    first.resolve(undefined);
    pages.resolve(undefined);
    await vi.advanceTimersByTimeAsync(0);
    expect(pdf.currentScaleValue).toBe("auto");
    expectClean(owner);
  });

  it("never calls a scale setter without a loaded document, even when it exists", async () => {
    vi.useFakeTimers();
    const setter = vi.fn();
    const pdf = { pdfDocument: null, firstPagePromise: Promise.resolve(), pagesPromise: Promise.resolve() };
    Object.defineProperty(pdf, "currentScaleValue", { get: () => "auto", set: setter });
    const f = viewWith(pdf);
    const result = applyNativePdfFit(f.view, describeLocalDocument("local.pdf")!);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await result).toBe(false);
    expect(setter).not.toHaveBeenCalled();
    expectClean(f.owner);
    // The outstanding 25ms poll was cancelled along with the deadline timer.
    expect(f.owner.clearTimeout.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it.each(["initialize", "first", "pages"] as const)("fails closed and clears timers when %s rejects", async (stage) => {
    vi.useFakeTimers();
    const failure = pendingViewer();
    const pdf = readyPdf();
    const f = viewWith(pdf);
    if (stage === "initialize") f.application.initializedPromise = failure.viewer;
    if (stage === "first") pdf.firstPagePromise = failure.viewer;
    if (stage === "pages") pdf.pagesPromise = failure.viewer;
    const result = applyNativePdfFit(f.view, describeLocalDocument("local.pdf")!);
    await vi.advanceTimersByTimeAsync(0);
    failure.reject(new Error("Closed during load"));
    expect(await result).toBe(false);
    expect(pdf.currentScaleValue).toBe("auto");
    expectClean(f.owner);
  });

  it("times out pending application initialization without starting an unbounded second stage", async () => {
    vi.useFakeTimers();
    const pdf = readyPdf();
    const f = viewWith(pdf);
    const initialized = pendingViewer();
    f.application.initializedPromise = initialized.viewer;
    const result = applyNativePdfFit(f.view, describeLocalDocument("local.pdf")!);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await result).toBe(false);
    initialized.resolve(undefined);
    await vi.advanceTimersByTimeAsync(0);
    expect(pdf.currentScaleValue).toBe("auto");
    expectClean(f.owner);
  });

  it.each(["application", "viewer", "document"] as const)("refuses a closed or replaced %s after page readiness", async (replacement) => {
    vi.useFakeTimers();
    const first = pendingViewer();
    const pdf = readyPdf();
    pdf.firstPagePromise = first.viewer;
    const f = viewWith(pdf);
    const result = applyNativePdfFit(f.view, describeLocalDocument("local.pdf")!);
    await vi.advanceTimersByTimeAsync(0);
    if (replacement === "application") Object.assign(f.renderer, { pdfViewer: null });
    if (replacement === "viewer") f.application.pdfViewer = null;
    if (replacement === "document") pdf.pdfDocument = {};
    first.resolve(undefined);
    expect(await result).toBe(false);
    expect(pdf.currentScaleValue).toBe("auto");
    expectClean(f.owner);
  });

  it("fails closed when owner cleanup throws after clearing its timer", async () => {
    vi.useFakeTimers();
    const f = viewWith(readyPdf());
    const clear = f.owner.clearTimeout.getMockImplementation()!;
    f.owner.clearTimeout.mockImplementation(function (this: unknown, handle: number) {
      clear.call(this, handle);
      throw new Error("Window closed");
    });
    expect(await applyNativePdfFit(f.view, describeLocalDocument("local.pdf")!)).toBe(false);
    expectClean(f.owner);
  });

  it.each(["noop", "throw"] as const)("does not report fit success for a %s scale setter", async (behavior) => {
    vi.useFakeTimers();
    const pdf = readyPdf();
    const setter = vi.fn(() => { if (behavior === "throw") throw new Error("Unavailable"); });
    Object.defineProperty(pdf, "currentScaleValue", { get: () => "auto", set: setter });
    const f = viewWith(pdf);
    expect(await applyNativePdfFit(f.view, describeLocalDocument("local.pdf")!)).toBe(false);
    expect(setter).toHaveBeenCalledOnce();
    expectClean(f.owner);
  });

  it("only applies the newest fit after rapid repeated opens of the same native PDF tab", async () => {
    vi.useFakeTimers();
    const file = {} as TFile;
    const first = pendingViewer();
    const pdf = readyPdf();
    pdf.firstPagePromise = first.viewer;
    const f = viewWith(pdf);
    const writes = vi.fn();
    let scale = "auto";
    Object.defineProperty(pdf, "currentScaleValue", { get: () => scale, set: (value: string) => { scale = value; writes(value); } });
    const view = { ...f.view, file };
    const leaf = { view, openFile: vi.fn() };
    const app = { vault: { getAbstractFileByPath: () => file }, workspace: { getLeavesOfType: () => [leaf], getLeaf: vi.fn() } } as unknown as App;
    const diagnostic = vi.fn();
    const host = createObsidianDocumentHost(app, diagnostic, (value): value is TFile => value === file);
    const old = host.openFile(describeLocalDocument("local.pdf", { page: 1, fit: "page" })!);
    await vi.advanceTimersByTimeAsync(0);
    const latest = host.openFile(describeLocalDocument("local.pdf", { page: 3, fit: "width" })!);
    await vi.advanceTimersByTimeAsync(0);
    first.resolve(undefined);
    await Promise.all([old, latest]);
    expect(writes).toHaveBeenCalledExactlyOnceWith("page-width");
    expect(leaf.openFile).toHaveBeenLastCalledWith(file, { active: true, eState: { subpath: "#page=3" } });
    expect(app.workspace.getLeaf).not.toHaveBeenCalled();
    expect(diagnostic).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["file", "view"] as const)("ignores a stale native %s while a requested fit is loading", async (replacement) => {
    vi.useFakeTimers();
    const file = {} as TFile;
    const first = pendingViewer();
    const pdf = readyPdf();
    pdf.firstPagePromise = first.viewer;
    const f = viewWith(pdf);
    const view = { ...f.view, file };
    const leaf = { view, openFile: vi.fn() };
    const app = { vault: { getAbstractFileByPath: () => file }, workspace: { getLeaf: () => leaf } } as unknown as App;
    const diagnostic = vi.fn();
    const host = createObsidianDocumentHost(app, diagnostic, (value): value is TFile => value === file);
    const result = host.openFile(describeLocalDocument("local.pdf")!);
    await vi.advanceTimersByTimeAsync(0);
    if (replacement === "file") view.file = {} as TFile;
    if (replacement === "view") leaf.view = { ...view };
    first.resolve(undefined);
    await result;
    expect(pdf.currentScaleValue).toBe("auto");
    expect(diagnostic).not.toHaveBeenCalled();
    expectClean(f.owner);
  });
});


describe("PDF owner teardown (timers stop with the native window)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function closableWindow() {
    const timers = new Map<number, ReturnType<typeof setTimeout>>();
    const listeners = new Map<string, Set<EventListener>>();
    const target = new EventTarget();
    let nextHandle = 0;
    const owner = {
      closed: false,
      timers,
      setTimeout: vi.fn(function (this: unknown, callback: () => void, delay: number) {
        expect(this).toBe(owner);
        if (owner.closed) throw new Error("Closed owner cannot run timers");
        const handle = nextHandle++;
        timers.set(handle, setTimeout(() => { timers.delete(handle); callback(); }, delay));
        return handle;
      }),
      clearTimeout: vi.fn(function (this: unknown, handle: number) {
        expect(this).toBe(owner);
        const timer = timers.get(handle);
        if (timer !== undefined) clearTimeout(timer);
        timers.delete(handle);
      }),
      addEventListener: vi.fn(function (this: unknown, type: string, listener: EventListener, capture: boolean) {
        expect(this).toBe(owner);
        target.addEventListener(type, listener, capture);
        const existing = listeners.get(type) ?? new Set<EventListener>();
        existing.add(listener);
        listeners.set(type, existing);
      }),
      removeEventListener: vi.fn(function (this: unknown, type: string, listener: EventListener, capture: boolean) {
        expect(this).toBe(owner);
        target.removeEventListener(type, listener, capture);
        listeners.get(type)?.delete(listener);
      }),
      close(event: "pagehide" | "unload") {
        owner.closed = true;
        // Match the failed native probe: owner teardown cancels ALL timers.
        for (const timer of timers.values()) clearTimeout(timer);
        timers.clear();
        target.dispatchEvent(new Event(event));
      },
      listenerCount() { return [...listeners.values()].reduce((count, set) => count + set.size, 0); },
    };
    return owner;
  }

  function state(stage: string) {
    const pending = pendingViewer();
    const setter = vi.fn();
    let scale = "auto";
    const pdf = {
      pdfDocument: {} as unknown,
      firstPagePromise: Promise.resolve() as Promise<unknown>,
      pagesPromise: Promise.resolve() as Promise<unknown>,
    };
    Object.defineProperty(pdf, "currentScaleValue", { get: () => scale, set: (value: string) => { scale = value; setter(value); } });
    const application = { pdfViewer: pdf, initializedPromise: Promise.resolve() as Promise<unknown>, isInitialViewSet: true };
    const renderer = { pdfViewer: application };
    if (stage === "initialize") application.initializedPromise = pending.viewer;
    if (stage === "first") pdf.firstPagePromise = pending.viewer;
    if (stage === "pages") pdf.pagesPromise = pending.viewer;
    if (stage === "before-load") pdf.pdfDocument = null;
    if (stage === "initial-view") application.isInitialViewSet = false;
    const owner = closableWindow();
    const view = { containerEl: { ownerDocument: { defaultView: owner } }, viewer: stage === "renderer" ? pending.viewer : Promise.resolve(renderer) };
    return { owner, view, renderer, application, pdf, pending, setter };
  }

  function expectNoWaits(owner: ReturnType<typeof closableWindow>) {
    expect(owner.timers.size).toBe(0);
    expect(owner.listenerCount()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(owner.addEventListener.mock.contexts.every(receiver => receiver === owner)).toBe(true);
    expect(owner.removeEventListener.mock.contexts.every(receiver => receiver === owner)).toBe(true);
    expect(owner.removeEventListener.mock.calls).toEqual(owner.addEventListener.mock.calls);
  }

  it.each(["renderer", "initialize", "first", "pages", "before-load", "initial-view"])("settles promptly when close destroys timers while waiting at %s", async (stage) => {
    vi.useFakeTimers();
    const f = state(stage);
    const result = applyNativePdfFit(f.view, describeLocalDocument("local.pdf")!);
    await vi.advanceTimersByTimeAsync(100);
    expect(f.owner.listenerCount()).toBe(2);
    f.owner.close("pagehide");
    // No advancing time to the deadline: the lifecycle event must settle it.
    await expect(result).resolves.toBe(false);
    expect(f.setter).not.toHaveBeenCalled();
    expectNoWaits(f.owner);
    f.pending.resolve(stage === "renderer" ? f.renderer : undefined);
    await vi.advanceTimersByTimeAsync(0);
    expect(f.setter).not.toHaveBeenCalled();
    expectNoWaits(f.owner);
  });

  it.each(["renderer", "initialize", "first", "pages"])("consumes late rejection after unload at %s", async (stage) => {
    vi.useFakeTimers();
    const f = state(stage);
    const result = applyNativePdfFit(f.view, describeLocalDocument("local.pdf")!);
    await vi.advanceTimersByTimeAsync(0);
    f.owner.close("unload");
    await expect(result).resolves.toBe(false);
    f.pending.reject(new Error("Late unloaded viewer"));
    await vi.advanceTimersByTimeAsync(0);
    expect(f.setter).not.toHaveBeenCalled();
    expectNoWaits(f.owner);
  });

  it("returns false for an already-closed owner without registering or scheduling", async () => {
    vi.useFakeTimers();
    const f = state("renderer");
    f.owner.close("unload");
    await expect(applyNativePdfFit(f.view, describeLocalDocument("local.pdf")!)).resolves.toBe(false);
    expect(f.owner.setTimeout).not.toHaveBeenCalled();
    expect(f.owner.addEventListener).not.toHaveBeenCalled();
    f.pending.reject(new Error("Late preclosed renderer"));
    await vi.advanceTimersByTimeAsync(0);
    expect(f.setter).not.toHaveBeenCalled();
    expectNoWaits(f.owner);
  });

  it("handles owner teardown synchronously during listener registration", async () => {
    vi.useFakeTimers();
    const f = state("renderer");
    const add = f.owner.addEventListener.getMockImplementation()!;
    f.owner.addEventListener.mockImplementation(function (this: unknown, type: string, listener: EventListener, capture: boolean) {
      add.call(this, type, listener, capture);
      f.owner.close("pagehide");
    });
    await expect(applyNativePdfFit(f.view, describeLocalDocument("local.pdf")!)).resolves.toBe(false);
    expect(f.owner.setTimeout).not.toHaveBeenCalled();
    expect(f.setter).not.toHaveBeenCalled();
    expectNoWaits(f.owner);
  });

  it.each(["initialize", "first", "pages"])("rechecks closed after %s resumes even if no close event was delivered", async (stage) => {
    vi.useFakeTimers();
    const f = state(stage);
    const result = applyNativePdfFit(f.view, describeLocalDocument("local.pdf")!);
    await vi.advanceTimersByTimeAsync(0);
    f.owner.closed = true;
    f.pending.resolve(undefined);
    await expect(result).resolves.toBe(false);
    expect(f.setter).not.toHaveBeenCalled();
    expectNoWaits(f.owner);
  });

  it("removes captured methods/listeners on the original owner after document/window changes", async () => {
    vi.useFakeTimers();
    const f = state("renderer");
    const other = closableWindow();
    const result = applyNativePdfFit(f.view, describeLocalDocument("local.pdf")!);
    f.view.containerEl.ownerDocument.defaultView = other;
    vi.stubGlobal("window", other);
    const originalRemove = f.owner.removeEventListener;
    f.owner.removeEventListener = vi.fn(() => { throw new Error("Replacement remover must not be used"); });
    f.owner.close("unload");
    await expect(result).resolves.toBe(false);
    expect(originalRemove.mock.calls).toEqual(f.owner.addEventListener.mock.calls);
    expect(f.owner.removeEventListener).not.toHaveBeenCalled();
    expect(f.owner.listenerCount()).toBe(0);
    expect(other.addEventListener).not.toHaveBeenCalled();
    expect(other.removeEventListener).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["ready", "reject", "timeout"])("removes both lifecycle listeners on normal %s settlement", async (settlement) => {
    vi.useFakeTimers();
    const f = state(settlement === "ready" ? "ready" : "renderer");
    const result = applyNativePdfFit(f.view, describeLocalDocument("local.pdf")!);
    if (settlement === "reject") f.pending.reject(new Error("Viewer failed"));
    if (settlement === "timeout") await vi.advanceTimersByTimeAsync(2000);
    expect(await result).toBe(settlement === "ready");
    expectNoWaits(f.owner);
    expect(f.owner.clearTimeout).toHaveBeenCalledWith(0);
    const writes = f.setter.mock.calls.length;
    f.owner.close("unload");
    expect(f.setter.mock.calls.length).toBe(writes);
  });

  it("does not emit stale diagnostics when owner closes before the native leaf identity changes", async () => {
    vi.useFakeTimers();
    const f = state("pages");
    const file = {} as TFile;
    const view = { ...f.view, file };
    const leaf = { view, openFile: vi.fn() };
    const app = { vault: { getAbstractFileByPath: () => file }, workspace: { getLeaf: () => leaf } } as unknown as App;
    const diagnostic = vi.fn();
    const host = createObsidianDocumentHost(app, diagnostic, (value): value is TFile => value === file);
    const result = host.openFile(describeLocalDocument("local.pdf")!);
    await vi.advanceTimersByTimeAsync(100);
    f.owner.close("unload");
    await result;
    expect(diagnostic).not.toHaveBeenCalled();
    expect(f.setter).not.toHaveBeenCalled();
    expectNoWaits(f.owner);
    f.pending.resolve(undefined);
    await vi.advanceTimersByTimeAsync(0);
    expect(diagnostic).not.toHaveBeenCalled();
    expect(f.setter).not.toHaveBeenCalled();
  });

  it("keeps the Node/minimal host deadline without a complete listener pair", async () => {
    vi.useFakeTimers();
    const owner = receiverSensitiveWindow();
    const add = vi.fn();
    Object.assign(owner, { addEventListener: add });
    const result = applyNativePdfFit({ containerEl: { ownerDocument: { defaultView: owner } }, viewer: new Promise(() => {}) }, describeLocalDocument("local.pdf")!);
    await vi.advanceTimersByTimeAsync(1999);
    expect(owner.clearTimeout).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toBe(false);
    expect(add).not.toHaveBeenCalled();
    expectOwnerCleanup(owner);
  });
});
