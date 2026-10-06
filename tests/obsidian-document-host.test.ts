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
    const pdf = { currentScaleValue: "page-width" };
    const openFile = vi.fn();
    const leaf = { openFile, view: { viewer: Promise.resolve({ pdfViewer: { pdfViewer: pdf } }) } };
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
    const pdf = { currentScaleValue: "auto" };
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
    const pdf = { currentScaleValue: "auto" };
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
