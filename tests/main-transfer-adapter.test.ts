import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { transformSync } from "esbuild";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { BoardTransferPublisher, type BoardTransferAdapter, type BoardTransferPublication, type BoardTransferPublishResult, type TransferFileFingerprint } from "../src/board-transfer-publisher";
import { canvasCardLink } from "../src/board-card-links";
import { graphDrift } from "../src/native-graph";
import { CanvasAuthoring } from "../src/canvas-authoring";
import { words } from "../src/i18n";

type Snapshot = Readonly<Record<string, unknown>>;
type Adapter = BoardTransferAdapter<Snapshot>;
type Request = BoardTransferPublication<Snapshot>;
type Operation = (adapter: Adapter, request: Request, signal: AbortSignal) => Promise<BoardTransferPublishResult>;

// Run the actual bounded main methods, following the existing main-platform probe.
const source = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
const ast = ts.createSourceFile("main.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const plugin = ast.statements.find(ts.isClassDeclaration)!;
const names = ["shellDisposed", "enhancementModals", "publishSelectionTransfer", "copyCardReference", "enhancementModal"];
const methods = names.map((name) => plugin.members.find((member) => member.name?.getText(ast) === name)!.getText(ast)).join("\n");
const code = transformSync(`class TransferProbe { ${methods} } this.TransferProbe = TransferProbe;`, { loader: "ts", target: "es2020" }).code;

class File {
  public stat: { mtime: number; size: number };
  public constructor(public path: string, public text: string) { this.stat = { mtime: 1, size: text.length }; }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { resolve, promise };
}

function result(request: Request, status: BoardTransferPublishResult["status"]): BoardTransferPublishResult {
  return { status, sourcePath: request.sourcePath, targetPath: request.targetPath, source: "unchanged", target: "retained", diagnostics: [] };
}

function fixture(operation?: Operation) {
  const before: Snapshot = { nodes: [{ id: "a", type: "text", x: 0, y: 0, width: 100, height: 60, text: "Card" }], edges: [] };
  const after: Snapshot = { nodes: [], edges: [] };
  const sourceFile = new File("boards/Source.canvas", JSON.stringify(before));
  const files = new Map([[sourceFile.path, sourceFile]]);
  const listeners = new Map<string, Set<(file: File, oldPath?: string) => void>>();
  const emit = (name: string, file: File, oldPath?: string) => {
    for (const callback of listeners.get(name) ?? []) callback(file, oldPath);
  };
  const vault = {
    getAbstractFileByPath: vi.fn((path: string) => files.get(path) ?? null),
    read: vi.fn(async (file: File) => file.text),
    create: vi.fn(async (path: string, text: string) => {
      if (files.has(path)) throw new Error("exists");
      const file = new File(path, text);
      files.set(path, file);
      emit("create", file);
      return file;
    }),
    on: vi.fn((name: string, callback: (file: File, oldPath?: string) => void) => {
      const callbacks = listeners.get(name) ?? new Set();
      callbacks.add(callback);
      listeners.set(name, callbacks);
      return { name, callback };
    }),
    offref: vi.fn((ref: { name: string; callback: (file: File, oldPath?: string) => void }) => { listeners.get(ref.name)?.delete(ref.callback); }),
  };
  const state = { current: before, adapter: undefined as Adapter | undefined, publisher: undefined as ObservedPublisher | undefined };
  class ObservedPublisher extends BoardTransferPublisher<Snapshot> {
    public readonly disposal = vi.fn();
    public constructor(adapter: Adapter) { super(adapter); state.adapter = adapter; state.publisher = this; }
    public override publish(request: Request, signal?: AbortSignal): Promise<BoardTransferPublishResult> {
      return operation === undefined ? super.publish(request, signal) : operation(state.adapter!, request, signal!);
    }
    public override dispose(): void { this.disposal(); super.dispose(); }
  }
  const session = {
    actionSnapshot: vi.fn(() => state.current),
    featureBusy: () => false,
    applyFeatureDocument: vi.fn((next: Snapshot, expected: Snapshot) => {
      if (JSON.stringify(state.current) !== JSON.stringify(expected)) return false;
      state.current = next;
      return true;
    }),
    rollbackFeatureDocument: vi.fn(() => { state.current = before; return true; }),
  };
  const controller = new AbortController();
  const view = {
    file: sourceFile,
    saving: false,
    save: vi.fn(async () => {
      sourceFile.text = JSON.stringify(state.current);
      sourceFile.stat = { mtime: sourceFile.stat.mtime + 1, size: sourceFile.text.length };
      emit("modify", sourceFile);
    }),
  };
  const trashFile = vi.fn(async (file: File) => { files.delete(file.path); emit("delete", file); });
  const notices: string[] = [];
  const clipboard = vi.fn(async (_text: string) => {});
  class Modal {
    public readonly containerEl = { classList: { add: vi.fn() } };
    public readonly modalEl = { classList: { add: vi.fn() } };
    public readonly contentEl = { addClass: vi.fn(), empty: vi.fn() };
    public readonly setTitle = vi.fn();
    public onClose = () => {};
  }
  const context = createContext({
    TFile: File, BoardTransferPublisher: ObservedPublisher, CanvasAuthoring, graphDrift, canvasCardLink, words,
    navigator: { clipboard: { writeText: clipboard } }, Notice: class { public constructor(text: string) { notices.push(text); } },
    window: { setTimeout }, AbortController, Modal,
  });
  runInContext(code, context);
  const instance = new context.TransferProbe();
  instance.app = { vault, fileManager: { trashFile } };
  instance.activeM1Session = () => session;
  instance.currentCanvasView = view;
  const publish = () => instance.publishSelectionTransfer(session, view, sourceFile, before, after, "boards/Target.canvas", before, controller.signal) as Promise<string>;
  const rewriteSameStat = (file: File, text = file.text) => { file.text = text; emit("modify", file); };
  const cleanupCheck = () => {
    expect([...listeners.values()].reduce((sum, set) => sum + set.size, 0)).toBe(0);
    expect(vault.offref).toHaveBeenCalledTimes(vault.on.mock.results.filter((item) => item.type === "return").length);
  };
  return { instance, files, vault, sourceFile, before, after, state, session, view, controller, emit, rewriteSameStat, trashFile, notices, clipboard, publish, cleanupCheck };
}

async function targetFingerprint(adapter: Adapter, request: Request, signal: AbortSignal): Promise<TransferFileFingerprint> {
  const created = await adapter.createTarget(request.targetPath, request.targetText, signal);
  if (created.status !== "created") throw new Error("Expected target creation");
  return { stat: created.stat, text: request.targetText };
}

describe("actual main transfer adapter with injected vault events", () => {
  it("publishes durably once, fingerprints per-file event revision and releases all listeners", async () => {
    const f = fixture();
    expect(await f.publish()).toBe("applied");
    expect(f.session.applyFeatureDocument).toHaveBeenCalledTimes(1);
    expect(f.view.save).toHaveBeenCalledTimes(1);
    expect(f.sourceFile.text).toBe(JSON.stringify(f.after));
    expect(f.files.has("boards/Target.canvas")).toBe(true);
    expect(f.trashFile).not.toHaveBeenCalled();
    expect(f.state.publisher?.disposal).toHaveBeenCalledTimes(1);
    expect(f.instance.transferReceipt.result.status).toBe("applied");
    expect(f.instance.transferReceipt.saveChecks).toEqual([{ status: "saved", reason: "verified" }]);
    f.cleanupCheck();
  });

  it("recovers an apply refusal by trashing only the unchanged owned target", async () => {
    const f = fixture();
    f.session.applyFeatureDocument.mockReturnValue(false);
    expect(await f.publish()).toBe("recovered");
    expect(f.trashFile).toHaveBeenCalledTimes(1);
    expect(f.files.has("boards/Target.canvas")).toBe(false);
    f.cleanupCheck();
  });

  it("refuses a source same-stat ABA rewrite during the initial fingerprint read", async () => {
    const f = fixture();
    f.vault.read.mockImplementationOnce(async (file) => {
      const text = file.text;
      f.rewriteSameStat(file, "intermediate");
      f.rewriteSameStat(file, text);
      return text;
    });
    expect(await f.publish()).toBe("refused");
    expect(f.vault.create).not.toHaveBeenCalled();
    f.cleanupCheck();
  });

  it("retains the target after a source same-stat rewrite during creation", async () => {
    const f = fixture();
    const create = f.vault.create.getMockImplementation()!;
    f.vault.create.mockImplementation(async (path, text) => {
      const created = await create(path, text);
      f.rewriteSameStat(f.sourceFile);
      return created;
    });
    expect(await f.publish()).toBe("partial");
    expect(f.session.applyFeatureDocument).not.toHaveBeenCalled();
    expect(f.trashFile).not.toHaveBeenCalled();
    expect(f.files.has("boards/Target.canvas")).toBe(true);
    f.cleanupCheck();
  });

  it.each(["same-body", "replaced", "missing-event"])("does not claim a %s target while creation resolves", async (race) => {
    const f = fixture();
    f.session.applyFeatureDocument.mockReturnValue(false);
    const create = f.vault.create.getMockImplementation()!;
    f.vault.create.mockImplementation(async (path, text) => {
      if (race === "missing-event") {
        const target = new File(path, text);
        f.files.set(path, target);
        return target;
      }
      const original = await create(path, text);
      if (race === "same-body") f.rewriteSameStat(original);
      else {
        f.files.delete(path);
        f.emit("delete", original);
        const replacement = new File(path, text);
        f.files.set(path, replacement);
        f.emit("create", replacement);
      }
      return original;
    });
    expect(await f.publish()).toBe("partial");
    expect(f.trashFile).not.toHaveBeenCalled();
    expect(f.files.has("boards/Target.canvas")).toBe(true);
    expect(f.session.applyFeatureDocument).not.toHaveBeenCalled();
    f.cleanupCheck();
  });

  it.each(["modify", "ABA", "rename", "recreate", "cancel", "undo", "unload"])("retains the artifact for %s during final source read before trash", async (race) => {
    const started = deferred<void>();
    const proceed = deferred<void>();
    const f = fixture(async (adapter, request, signal) => {
      const expected = await targetFingerprint(adapter, request, signal);
      const read = f.vault.read.getMockImplementation()!;
      f.vault.read.mockImplementation(async (file) => {
        const text = file.text;
        if (file === f.sourceFile) { started.resolve(); await proceed.promise; }
        return text;
      });
      const deleting = adapter.deleteTarget(request.targetPath, expected,
        { path: request.sourcePath, snapshot: request.sourceBefore, fingerprint: request.sourceFingerprint }, signal);
      await started.promise;
      const target = f.files.get(request.targetPath)!;
      if (race === "modify") f.rewriteSameStat(target);
      if (race === "ABA") { f.rewriteSameStat(target, "changed"); f.rewriteSameStat(target, request.targetText); }
      if (race === "rename") { f.files.delete(target.path); target.path = "Moved.canvas"; f.files.set(target.path, target); f.emit("rename", target, request.targetPath); }
      if (race === "recreate") { f.files.delete(target.path); f.emit("delete", target); const replacement = new File(target.path, target.text); f.files.set(target.path, replacement); f.emit("create", replacement); }
      if (race === "cancel") f.controller.abort();
      if (race === "undo") f.state.current = { ...f.before, undo: true };
      if (race === "unload") f.instance.shellDisposed = true;
      proceed.resolve();
      const removed = await deleting;
      f.vault.read.mockImplementation(read);
      return result(request, removed ? "recovered" : "partial");
    });
    expect(await f.publish()).toBe("partial");
    expect(f.trashFile).not.toHaveBeenCalled();
    expect(f.files.size).toBe(2);
    f.cleanupCheck();
  });

  it("rechecks source revision after its awaited deletion read", async () => {
    const f = fixture(async (adapter, request, signal) => {
      const expected = await targetFingerprint(adapter, request, signal);
      f.vault.read.mockImplementation(async (file) => {
        const text = file.text;
        if (file === f.sourceFile) f.rewriteSameStat(file);
        return text;
      });
      const removed = await adapter.deleteTarget(request.targetPath, expected,
        { path: request.sourcePath, snapshot: request.sourceBefore, fingerprint: request.sourceFingerprint }, signal);
      return result(request, removed ? "recovered" : "partial");
    });
    expect(await f.publish()).toBe("partial");
    expect(f.trashFile).not.toHaveBeenCalled();
    f.cleanupCheck();
  });

  it.each(["apply", "rollback"])("checks cancellation after %s disk reads before native mutation", async (phase) => {
    const f = fixture(async (adapter, request, signal) => {
      f.vault.read.mockImplementation(async (file) => { f.controller.abort(); return file.text; });
      const guard = { path: request.sourcePath, snapshot: request.sourceBefore, fingerprint: request.sourceFingerprint };
      if (phase === "apply") expect(await adapter.applySource(request.sourcePath, request.sourceAfter, guard, signal)).toEqual({ status: "refused" });
      else expect(await adapter.rollbackSource(request.sourceBefore, guard, signal)).toBe(false);
      return result(request, "partial");
    });
    expect(await f.publish()).toBe("partial");
    expect(f.session.applyFeatureDocument).not.toHaveBeenCalled();
    expect(f.session.rollbackFeatureDocument).not.toHaveBeenCalled();
    f.cleanupCheck();
  });

  it("refuses rollback when a same-stat event occurs during the disk read", async () => {
    const f = fixture(async (adapter, request, signal) => {
      f.vault.read.mockImplementation(async (file) => { f.rewriteSameStat(file); return file.text; });
      expect(await adapter.rollbackSource(request.sourceBefore,
        { path: request.sourcePath, snapshot: request.sourceBefore, fingerprint: request.sourceFingerprint }, signal)).toBe(false);
      return result(request, "partial");
    });
    expect(await f.publish()).toBe("partial");
    expect(f.session.rollbackFeatureDocument).not.toHaveBeenCalled();
    f.cleanupCheck();
  });

  it("fails durable save certification if a revision changes during its final read", async () => {
    const f = fixture(async (adapter, request, signal) => {
      f.state.current = request.sourceAfter;
      f.vault.read.mockImplementation(async (file) => { f.rewriteSameStat(file); return file.text; });
      expect(await adapter.awaitSourceSave(request.sourcePath, request.sourceAfter, signal)).toEqual({ status: "failed" });
      return result(request, "partial");
    });
    expect(await f.publish()).toBe("partial");
    expect(f.view.save).toHaveBeenCalledTimes(1);
    f.cleanupCheck();
  });

  it("does not certify or initiate recovery writes after cancellation during native save", async () => {
    const f = fixture();
    f.view.save.mockImplementation(async () => { f.controller.abort(); });
    expect(await f.publish()).toBe("partial");
    expect(f.trashFile).not.toHaveBeenCalled();
    expect(f.session.rollbackFeatureDocument).not.toHaveBeenCalled();
    f.cleanupCheck();
  });

  it("awaits a native saveAgain follow-up before certifying disk persistence", async () => {
    const f = fixture();
    f.view.save.mockImplementation(async () => {
      f.view.saving = true;
      setTimeout(() => {
        f.sourceFile.text = JSON.stringify(f.state.current);
        f.sourceFile.stat = { mtime: 2, size: f.sourceFile.text.length };
        f.emit("modify", f.sourceFile);
        f.view.saving = false;
      }, 5);
    });
    expect(await f.publish()).toBe("applied");
    expect(f.view.saving).toBe(false);
    expect(f.sourceFile.text).toBe(JSON.stringify(f.after));
    f.cleanupCheck();
  });

  it("accepts native graph/default/geometry and root-key reordering without relaxing metadata", async () => {
    const f = fixture(async (adapter, request, signal) => {
      const expected = {
        nodes: [...(request.sourceBefore.nodes as Array<Record<string, unknown>>).map((node) => ({ ...node, x: 10.4 })),
          { id: "b", type: "text", x: 15, y: 30, width: 20, height: 40, text: "Second" }],
        edges: [{ id: "external", fromNode: "b", toNode: "a" }, { id: "internal", fromNode: "a", toNode: "b" }],
        miroCanvas: { schemaVersion: 1, properties: { z: 2, a: 1 } },
        miroSource: { evidence: { z: 2, a: 1 } }, future: { z: 2, a: 1 },
      };
      f.state.current = expected;
      f.view.save.mockImplementation(async () => {
        f.sourceFile.text = JSON.stringify({
          future: { a: 1, z: 2 }, miroSource: { evidence: { a: 1, z: 2 } },
          miroCanvas: { properties: { a: 1, z: 2 }, schemaVersion: 1 }, edges: [...expected.edges].reverse(),
          nodes: [...expected.nodes].reverse().map((node) => ({ ...node, x: Math.round(Number(node.x)), color: "" })),
        });
        f.sourceFile.stat = { mtime: 2, size: f.sourceFile.text.length };
        f.emit("modify", f.sourceFile);
      });
      expect((await adapter.awaitSourceSave(request.sourcePath, expected, signal)).status).toBe("saved");
      return result(request, "applied");
    });
    expect(await f.publish()).toBe("applied");
    expect(f.instance.transferReceipt.saveChecks).toEqual([{ status: "saved", reason: "verified" }]);
    f.cleanupCheck();
  });

  it.each(["miroSource", "miroCanvas", "future", "nodes"])("records and rejects actual %s disk drift", async (field) => {
    const f = fixture(async (adapter, request, signal) => {
      const expected: Snapshot = { ...request.sourceBefore, miroSource: { exact: true }, miroCanvas: { schemaVersion: 1 }, future: { keep: true } };
      f.state.current = expected;
      f.view.save.mockImplementation(async () => {
        f.sourceFile.text = JSON.stringify({ ...expected, [field]: field === "nodes" ? [] : { changed: true } });
        f.sourceFile.stat = { mtime: 2, size: f.sourceFile.text.length };
        f.emit("modify", f.sourceFile);
      });
      expect(await adapter.awaitSourceSave(request.sourcePath, expected, signal)).toEqual({ status: "failed" });
      return result(request, "partial");
    });
    expect(await f.publish()).toBe("partial");
    expect(f.instance.transferReceipt.result.status).toBe("partial");
    expect(f.instance.transferReceipt.saveChecks[0].reason).toBe(field === "nodes" ? "disk-graph-drift" : "disk-root-drift");
    expect(f.trashFile).not.toHaveBeenCalled();
    f.cleanupCheck();
  });

  it("freezes source path and refuses an initial read-time rename", async () => {
    const f = fixture();
    f.vault.read.mockImplementationOnce(async (file) => {
      const oldPath = file.path;
      f.files.delete(oldPath);
      file.path = "Moved.canvas";
      f.files.set(file.path, file);
      f.emit("rename", file, oldPath);
      return file.text;
    });
    expect(await f.publish()).toBe("refused");
    expect(f.vault.create).not.toHaveBeenCalled();
    f.cleanupCheck();
  });

  it("releases event subscriptions for read failure and publisher exceptions", async () => {
    const readFailure = fixture();
    readFailure.vault.read.mockRejectedValueOnce(new Error("read failed"));
    expect(await readFailure.publish()).toBe("refused");
    readFailure.cleanupCheck();
    const publisherFailure = fixture(async () => { throw new Error("publisher failed"); });
    await expect(publisherFailure.publish()).rejects.toThrow("publisher failed");
    expect(publisherFailure.state.publisher?.disposal).toHaveBeenCalledTimes(1);
    publisherFailure.cleanupCheck();
  });

  it.each(["cancelled-before-read", "source-disk-fingerprint-changed", "source-disk-read-failed", "cancelled-after-read", "source-revision-after-read", "inactive-session", "native-feature-refused"])("records the exact %s apply guard without leaking source text", async (reason) => {
    const f = fixture(async (adapter, request, signal) => {
      const fingerprint = request.sourceFingerprint;
      if (reason === "cancelled-before-read") f.controller.abort();
      if (reason === "source-disk-fingerprint-changed") f.rewriteSameStat(f.sourceFile);
      if (reason === "source-disk-read-failed") f.vault.read.mockRejectedValueOnce(new Error("failed"));
      if (reason === "cancelled-after-read") f.vault.read.mockImplementationOnce(async (file) => { f.controller.abort(); return file.text; });
      if (reason === "inactive-session") f.instance.activeM1Session = () => null;
      if (reason === "native-feature-refused") f.session.applyFeatureDocument.mockReturnValue(false);
      if (reason === "source-revision-after-read") {
        const lookup = f.vault.getAbstractFileByPath.getMockImplementation()!;
        let armed = false;
        let lookups = 0;
        f.vault.read.mockImplementationOnce(async (file) => { armed = true; return file.text; });
        f.vault.getAbstractFileByPath.mockImplementation((path) => {
          // checkDisk's post-read stat is the first lookup, final apply stat the second.
          if (armed && ++lookups === 2) f.rewriteSameStat(f.sourceFile);
          return lookup(path);
        });
      }
      const applying = adapter.applySource(request.sourcePath, request.sourceAfter,
        { path: request.sourcePath, snapshot: request.sourceBefore, fingerprint }, signal);
      if (reason === "source-disk-read-failed") await expect(applying).rejects.toThrow("failed");
      else expect(await applying).toEqual({ status: "refused" });
      return result(request, "partial");
    });
    expect(await f.publish()).toBe("partial");
    const check = f.instance.transferReceipt.applyChecks[0];
    expect(check.reason).toBe(reason);
    expect(check.expected.revision).toBe(0);
    expect(check).not.toHaveProperty("text");
    expect(f.session.applyFeatureDocument).toHaveBeenCalledTimes(reason === "native-feature-refused" ? 1 : 0);
    f.cleanupCheck();
  });

  it("captures bounded authoring refusal codes and restores the exact prior instance method", async () => {
    const f = fixture();
    const authoring = Object.create(CanvasAuthoring.prototype) as CanvasAuthoring;
    const rejected = { ok: false, status: "rejected", diagnostics: [{ code: "native-import-verification-failed", severity: "error", message: "not retained in receipt" }] };
    const original = vi.fn(() => rejected);
    Object.defineProperty(authoring, "applyDocument", { value: original, configurable: true, writable: true, enumerable: true });
    const descriptor = Object.getOwnPropertyDescriptor(authoring, "applyDocument");
    Object.assign(f.session, { authoring });
    f.session.applyFeatureDocument.mockImplementation((next, expected) => authoring.applyDocument(next, expected).ok);
    expect(await f.publish()).toBe("recovered");
    expect(f.instance.transferReceipt.applyChecks[0]).toMatchObject({
      reason: "native-feature-refused", authoring: { ok: false, status: "rejected", diagnostics: ["native-import-verification-failed"] },
    });
    expect(JSON.stringify(f.instance.transferReceipt.applyChecks)).not.toContain("not retained in receipt");
    expect(original).toHaveBeenCalledTimes(1);
    expect(Object.getOwnPropertyDescriptor(authoring, "applyDocument")).toEqual(descriptor);
    f.cleanupCheck();
  });

  it("captures authoring throws and preserves a later instance wrapper", async () => {
    const f = fixture();
    const authoring = Object.create(CanvasAuthoring.prototype) as CanvasAuthoring;
    const later = vi.fn();
    const original = vi.fn(() => { Object.defineProperty(authoring, "applyDocument", { value: later, configurable: true }); throw new Error("native failed"); });
    Object.defineProperty(authoring, "applyDocument", { value: original, configurable: true, writable: true });
    Object.assign(f.session, { authoring });
    f.session.applyFeatureDocument.mockImplementation((next, expected) => authoring.applyDocument(next, expected).ok);
    expect(await f.publish()).toBe("partial");
    expect(f.instance.transferReceipt.applyChecks[0].reason).toBe("native-feature-threw");
    expect(authoring.applyDocument).toBe(later);
    f.cleanupCheck();
  });
});

describe("actual main card reference copy feedback", () => {
  it("exposes scoped native modal containers for the parent's tablet keyboard CSS", () => {
    const f = fixture();
    const cleanup = vi.fn();
    const modal = f.instance.enhancementModal("Title", cleanup);
    expect(modal.containerEl.classList.add).toHaveBeenCalledWith("miro-canvas-enhancement-container");
    expect(modal.modalEl.classList.add).toHaveBeenCalledWith("miro-canvas-enhancement-dialog");
    expect(modal.contentEl.addClass).toHaveBeenCalledWith("miro-canvas-enhancement-modal");
    expect(f.instance.enhancementModals.has(modal)).toBe(true);
    modal.onClose();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(f.instance.enhancementModals.has(modal)).toBe(false);
    expect(modal.contentEl.empty).toHaveBeenCalledTimes(1);
  });
  it.each([false, true])("copies a raw-space %s embed reference with the localized success notice", async (embed) => {
    const f = fixture();
    f.sourceFile.path = "Boards/План дня.canvas";
    await f.instance.copyCardReference("task #1", embed);
    expect(f.clipboard).toHaveBeenCalledWith(`${embed ? "!" : ""}[[Boards/План дня.canvas#node-task%20%231]]`);
    expect(f.notices).toEqual([words().enhancements.copied]);
  });

  it.each(["Boards/Plan#draft.canvas", "Boards/Plan].canvas", "Boards/100%.canvas"])("reports localized formatter failure for %s without clipboard access", async (path) => {
    const f = fixture();
    f.sourceFile.path = path;
    await f.instance.copyCardReference("a", false);
    expect(f.clipboard).not.toHaveBeenCalled();
    expect(f.notices).toEqual([words().enhancements.copyFailed]);
  });

  it("reports localized missing-board and clipboard-rejection failures", async () => {
    const f = fixture();
    f.instance.currentCanvasView = null;
    await f.instance.copyCardReference("a", true);
    f.instance.currentCanvasView = f.view;
    f.clipboard.mockRejectedValueOnce(new Error("denied"));
    await f.instance.copyCardReference("a", true);
    expect(f.notices).toEqual([words().enhancements.copyFailed, words().enhancements.copyFailed]);
  });
});
