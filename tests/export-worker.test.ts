import { build, context as buildContext, type Plugin } from "esbuild";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makePdf, makePptx, type ExportInfo, type ExportPage } from "../src/export-files";
import { packExport } from "../src/export-worker-client";
import {
  EXPORT_WORKER_TIMEOUT_MS,
  MAX_EXPORT_WORKER_INPUT_BYTES,
  MAX_EXPORT_WORKER_PAGES,
  MAX_MOBILE_EXPORT_WORKER_INPUT_BYTES,
  isExportBuffer,
  prepareExportWorkerRequest,
  type ExportWorkerKind,
  type ExportWorkerRequest,
  type ExportWorkerResponse,
} from "../src/export-worker-protocol";
import { packExportWorkerRequest } from "../src/export-worker";
import { setLocale, words } from "../src/i18n";

function page(overrides: Partial<ExportPage> = {}): ExportPage {
  return {
    width: 400,
    height: 300,
    pixelWidth: 800,
    pixelHeight: 600,
    image: Uint8Array.of(0xff, 0xd8, 1, 2, 3, 0xff, 0xd9),
    title: "Страница & <one>",
    ...overrides,
  };
}

type Listener = (event: { data?: unknown; preventDefault(): void }) => void;

class FakeWorker {
  static instances: FakeWorker[] = [];
  static failConstruction = false;
  readonly listeners = new Map<string, Set<Listener>>();
  readonly terminated = vi.fn();
  readonly posted: ExportWorkerRequest[] = [];
  readonly transfers: ArrayBuffer[][] = [];
  failPost = false;

  constructor() {
    if (FakeWorker.failConstruction) throw new Error("worker creation denied");
    FakeWorker.instances.push(this);
  }

  addEventListener(type: string, listener: Listener): void {
    const listeners = this.listeners.get(type) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  postMessage(request: ExportWorkerRequest, transfers: ArrayBuffer[]): void {
    if (this.failPost) throw new Error("transfer failed");
    this.transfers.push(transfers);
    this.posted.push(structuredClone(request, { transfer: transfers }));
  }

  terminate(): void {
    this.terminated();
  }

  emit(type: string, data?: unknown): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      listener({ data, preventDefault: vi.fn() });
    }
  }

  ready(): void {
    this.emit("message", { type: "ready" });
  }

  complete(): void {
    const response = packExportWorkerRequest(this.posted[0]);
    const transferred = structuredClone(response, {
      transfer: response.type === "result" ? [response.bytes] : [],
    });
    this.emit("message", transferred);
  }
}

function environment(): {
  document: Document;
  controller: AbortController;
  revoke: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  removed: ReturnType<typeof vi.spyOn>;
} {
  const controller = new AbortController();
  const create = vi.fn(() => "blob:owned-export");
  const revoke = vi.fn();
  const view = {
    Worker: FakeWorker,
    Blob,
    URL: { createObjectURL: create, revokeObjectURL: revoke },
    setTimeout,
    clearTimeout,
  };
  return {
    document: { defaultView: view } as unknown as Document,
    controller,
    revoke,
    create,
    removed: vi.spyOn(controller.signal, "removeEventListener"),
  };
}

function expectClean(worker: FakeWorker, env: ReturnType<typeof environment>): void {
  expect(worker.terminated).toHaveBeenCalledTimes(1);
  expect([...worker.listeners.values()].every((listeners) => listeners.size === 0)).toBe(true);
  expect(env.revoke).toHaveBeenCalledExactlyOnceWith("blob:owned-export");
  expect(env.removed).toHaveBeenCalledWith("abort", expect.any(Function));
  expect(vi.getTimerCount()).toBe(0);
}

beforeEach(() => {
  setLocale("en");
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-07T12:00:00Z"));
  vi.stubGlobal("__MIRO_EXPORT_WORKER_SOURCE__", "/* reviewed bundled worker */");
  FakeWorker.instances = [];
  FakeWorker.failConstruction = false;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  setLocale("en");
});

describe("export worker input", () => {
  it.each([
    { width: 0 },
    { height: Number.POSITIVE_INFINITY },
    { pixelWidth: 1.5 },
    { pixelHeight: -1 },
    { image: new Uint8Array(0) },
    { title: "x".repeat(4097) },
    { placement: { x: Number.NaN, y: 0, width: 10, height: 10 } },
    { placement: { x: 0, y: 0, width: -1, height: 10 } },
  ])("rejects invalid geometry/bytes before packing: %j", (override) => {
    expect(() => prepareExportWorkerRequest(1, "pdf", [page(override)], {})).toThrow();
  });

  it("rejects empty/too many pages and invalid information", () => {
    expect(() => prepareExportWorkerRequest(1, "pdf", [], {})).toThrow("invalid-pages");
    expect(() => prepareExportWorkerRequest(1, "pdf", Array(MAX_EXPORT_WORKER_PAGES + 1).fill(page()), {})).toThrow("invalid-pages");
    expect(() => prepareExportWorkerRequest(1, "pdf", [page()], { title: "x".repeat(4097) })).toThrow("invalid-info");
    expect(() => prepareExportWorkerRequest(1, "bad" as ExportWorkerKind, [page()], {})).toThrow("invalid-request");
  });

  it("counts repeated shared views against the budget before any copies", () => {
    const image = new Uint8Array(1024 * 1024);
    const pages = Array(MAX_EXPORT_WORKER_INPUT_BYTES / image.length + 1).fill(page({ image }));
    const allocation = vi.spyOn(globalThis, "Uint8Array");
    expect(() => prepareExportWorkerRequest(1, "pdf", pages, {})).toThrow("input-budget-exceeded");
    expect(allocation).not.toHaveBeenCalled();
    expect(image.byteLength).toBe(1024 * 1024);
  });

  it("rejects sparse pages and honors a lower mobile budget before copies", () => {
    expect(() => prepareExportWorkerRequest(1, "pdf", new Array(2), {})).toThrow("invalid-page");
    const image = new Uint8Array(1024 * 1024);
    const pages = Array(MAX_MOBILE_EXPORT_WORKER_INPUT_BYTES / image.length + 1).fill(page({ image }));
    expect(() => prepareExportWorkerRequest(1, "pdf", pages, {}, MAX_MOBILE_EXPORT_WORKER_INPUT_BYTES)).toThrow("input-budget-exceeded");
  });

  it("copies offsets and duplicate buffers into distinct transferable allocations", () => {
    const source = Uint8Array.of(99, 1, 2, 3, 88);
    const image = source.subarray(1, 4);
    const placement = { x: 4, y: 5, width: 20, height: 30 };
    const info: ExportInfo = { title: "Before" };
    const request = prepareExportWorkerRequest(7, "pptx", [page({ image, placement }), page({ image })], info);
    const buffers = request.pages.map((item) => item.image);
    expect(new Set(buffers).size).toBe(2);
    expect(buffers.every((buffer) => buffer.byteLength === 3)).toBe(true);
    expect(new Uint8Array(buffers[0])).toEqual(Uint8Array.of(1, 2, 3));
    const received = structuredClone(request, { transfer: buffers });
    expect(buffers.every((buffer) => buffer.byteLength === 0)).toBe(true);
    expect(source).toEqual(Uint8Array.of(99, 1, 2, 3, 88));
    placement.x = 90;
    expect(received.pages[0].placement?.x).toBe(4);
  });

  it("accepts arrays/buffers from another window and copies shared-memory bytes", () => {
    const foreign = runInNewContext("new Uint8Array([1, 2, 3])") as Uint8Array;
    expect(isExportBuffer(foreign.buffer)).toBe(true);
    expect(prepareExportWorkerRequest(1, "pdf", [page({ image: foreign })], {}).pages[0].image.byteLength).toBe(3);
    const shared = new Uint8Array(new SharedArrayBuffer(3));
    shared.set([4, 5, 6]);
    const copied = prepareExportWorkerRequest(1, "pdf", [page({ image: shared })], {});
    expect(isExportBuffer(copied.pages[0].image)).toBe(true);
    expect(isExportBuffer(shared.buffer)).toBe(false);
    expect(new Uint8Array(copied.pages[0].image)).toEqual(Uint8Array.of(4, 5, 6));
  });

  it("validates worker messages again and returns diagnostic codes", () => {
    expect(packExportWorkerRequest(null)).toEqual({ type: "error", jobId: 0, code: "invalid-request" });
    const request = prepareExportWorkerRequest(1, "pdf", [page()], {});
    expect(packExportWorkerRequest({ ...request, pages: [] })).toEqual({ type: "error", jobId: 1, code: "invalid-pages" });
    expect(packExportWorkerRequest({ ...request, pages: [{ ...request.pages[0], image: new SharedArrayBuffer(1) }] })).toEqual({ type: "error", jobId: 1, code: "invalid-page" });
  });
});

describe("worker client lifecycle", () => {
  it.each(["pdf", "pptx"] as const)("transfers %s and returns equivalent bytes without touching input", async (kind) => {
    const env = environment();
    const pages = [page(), page({ width: 300, height: 100, placement: { x: 10, y: 20, width: 80, height: 60 } })];
    const before = pages.map((item) => item.image.slice());
    const info = { title: "Доска", author: "Автор" };
    const expected = kind === "pdf" ? makePdf(pages, info) : makePptx(pages, info);
    const result = packExport(kind, pages, info, env.document, env.controller.signal);
    const worker = FakeWorker.instances[0];
    expect(worker.posted).toHaveLength(0);
    worker.ready();
    expect(worker.posted).toHaveLength(1);
    expect(worker.transfers[0].every((buffer) => buffer.byteLength === 0)).toBe(true);
    worker.ready();
    expect(worker.posted).toHaveLength(1);
    worker.complete();
    expect(await result).toEqual(expected);
    expect(pages.map((item) => item.image)).toEqual(before);
    expectClean(worker, env);
    env.controller.abort();
    expect(worker.terminated).toHaveBeenCalledTimes(1);
  });

  it("rejects pre-aborted input without allocating a worker or URL", async () => {
    const env = environment();
    env.controller.abort();
    await expect(packExport("pdf", [page()], {}, env.document, env.controller.signal)).rejects.toThrow(words().export.exportStopped);
    expect(env.create).not.toHaveBeenCalled();
    expect(FakeWorker.instances).toHaveLength(0);
  });

  it.each([false, true])("terminates immediately on abort; submitted=%s", async (submitted) => {
    const env = environment();
    const result = packExport("pdf", [page()], {}, env.document, env.controller.signal);
    const failure = expect(result).rejects.toThrow(words().export.exportStopped);
    const worker = FakeWorker.instances[0];
    if (submitted) worker.ready();
    const late = [...worker.listeners.get("message")!][0];
    env.controller.abort();
    expectClean(worker, env);
    late({ data: { type: "result", jobId: worker.posted[0]?.jobId, bytes: new ArrayBuffer(1) }, preventDefault() {} });
    await failure;
    expectClean(worker, env);
  });

  it.each(["error", "messageerror", "worker-error", "malformed", "empty", "post-error"])("cleans up %s", async (mode) => {
    const env = environment();
    const result = packExport("pdf", [page()], {}, env.document, env.controller.signal);
    const failure = expect(result).rejects.toThrow(words().export.exportFailed);
    const worker = FakeWorker.instances[0];
    worker.failPost = mode === "post-error";
    worker.ready();
    const jobId = worker.posted[0]?.jobId;
    if (mode === "error" || mode === "messageerror") worker.emit(mode);
    if (mode === "worker-error") worker.emit("message", { type: "error", jobId, code: "packing-failed" });
    if (mode === "malformed") worker.emit("message", null);
    if (mode === "empty") worker.emit("message", { type: "result", jobId, bytes: new ArrayBuffer(0) });
    await failure;
    expectClean(worker, env);
  });

  it("rejects creation/startup failures without a synchronous packing fallback", async () => {
    const env = environment();
    FakeWorker.failConstruction = true;
    await expect(packExport("pdf", [page()], {}, env.document, env.controller.signal)).rejects.toThrow(words().export.unavailable);
    expect(env.revoke).toHaveBeenCalledTimes(1);
    FakeWorker.failConstruction = false;
    const result = packExport("pdf", [page()], {}, env.document, env.controller.signal);
    const failure = expect(result).rejects.toThrow(words().export.unavailable);
    const worker = FakeWorker.instances[0];
    worker.emit("error");
    await failure;
    expect(worker.posted).toHaveLength(0);
    expect(worker.terminated).toHaveBeenCalledTimes(1);
    expect(env.revoke).toHaveBeenCalledTimes(2);
  });

  it("has a deadline even when the worker never becomes ready or responds", async () => {
    for (const ready of [false, true]) {
      const env = environment();
      const result = packExport("pdf", [page()], {}, env.document, env.controller.signal);
      const failure = expect(result).rejects.toThrow(words().export.exportFailed);
      const worker = FakeWorker.instances.at(-1)!;
      if (ready) worker.ready();
      vi.advanceTimersByTime(EXPORT_WORKER_TIMEOUT_MS);
      await failure;
      expectClean(worker, env);
    }
  });

  it("ignores another job's result and exposes only localized errors", async () => {
    setLocale("ru");
    const env = environment();
    const result = packExport("pdf", [page()], {}, env.document, env.controller.signal);
    const failure = expect(result).rejects.toThrow(words().export.exportStopped);
    const worker = FakeWorker.instances[0];
    worker.ready();
    worker.emit("message", { type: "result", jobId: worker.posted[0].jobId + 1, bytes: new ArrayBuffer(1) });
    expect(worker.terminated).not.toHaveBeenCalled();
    env.controller.abort();
    await failure;
    expectClean(worker, env);
  });

  it("rejects invalid input/missing browser support without creating a worker", async () => {
    const env = environment();
    await expect(packExport("pdf", [page({ width: -1 })], {}, env.document, env.controller.signal)).rejects.toThrow(words().export.exportFailed);
    await expect(packExport("pdf", [page()], {}, { defaultView: null } as Document, env.controller.signal)).rejects.toThrow(words().export.unavailable);
    vi.stubGlobal("__MIRO_EXPORT_WORKER_SOURCE__", "");
    await expect(packExport("pdf", [page()], {}, env.document, env.controller.signal)).rejects.toThrow(words().export.unavailable);
    expect(env.create).not.toHaveBeenCalled();
    expect(FakeWorker.instances).toHaveLength(0);
  });

  it("applies the mobile budget to the actual document without allocating a URL", async () => {
    const env = environment();
    const document = {
      defaultView: env.document.defaultView,
      body: { classList: { contains: (name: string) => name === "is-tablet" } },
    } as unknown as Document;
    const image = new Uint8Array(1024 * 1024);
    const pages = Array(MAX_MOBILE_EXPORT_WORKER_INPUT_BYTES / image.length + 1).fill(page({ image }));
    await expect(packExport("pdf", pages, {}, document, env.controller.signal)).rejects.toThrow(words().export.tooLarge);
    expect(env.create).not.toHaveBeenCalled();
    expect(FakeWorker.instances).toHaveLength(0);
  });
});

it("injects the build-produced worker and registers every worker input for rebuilds", async () => {
  const configUrl = new URL("../esbuild.config.mjs", import.meta.url).href;
  const config = await import(configUrl) as { workerInjection: string; exportWorkerPlugin: Plugin };
  let loads = 0;
  let watched: string[] = [];
  const plugin: Plugin = {
    name: "observe-worker-injection",
    setup(build) {
      config.exportWorkerPlugin.setup({
        ...build,
        onLoad(options, callback) {
          build.onLoad(options, async (args) => {
            loads += 1;
            const result = await callback(args);
            watched = result?.watchFiles ?? [];
            return result;
          });
        },
      });
    },
  };
  const context = await buildContext({
    stdin: { contents: "export const source = __MIRO_EXPORT_WORKER_SOURCE__;", resolveDir: process.cwd() },
    bundle: true,
    write: false,
    platform: "browser",
    format: "cjs",
    inject: [config.workerInjection],
    plugins: [plugin],
  });
  try {
    const first = await context.rebuild();
    const module = { exports: {} as { source?: string } };
    runInNewContext(first.outputFiles![0].text, { module });
    expect(typeof module.exports.source).toBe("string");
    expect(module.exports.source).toContain("packing-failed");
    expect(watched.sort()).toEqual([
      "src/export-files.ts", "src/export-worker-protocol.ts", "src/export-worker.ts",
    ].map((file) => path.resolve(file)).sort());
    await context.rebuild();
    expect(loads).toBe(2);
  } finally {
    await context.dispose();
  }
});

it.each([false, true])("runs the actual browser IIFE with no DOM, Node, network or external modules; minified=%s", async (minify) => {
  const bundle = await build({
    entryPoints: ["src/export-worker.ts"],
    bundle: true,
    write: false,
    metafile: true,
    platform: "browser",
    format: "iife",
    target: "es2020",
    minify,
  });
  expect(Object.keys(bundle.metafile!.inputs).sort()).toEqual([
    "src/export-files.ts", "src/export-worker-protocol.ts", "src/export-worker.ts",
  ]);
  expect(Object.values(bundle.metafile!.outputs).every((output) => output.imports.length === 0)).toBe(true);
  const responses: ExportWorkerResponse[] = [];
  let listener: ((event: { data: unknown }) => void) | undefined;
  const context = {
    TextEncoder,
    Date,
    addEventListener(type: string, handler: (event: { data: unknown }) => void) {
      expect(type).toBe("message");
      listener = handler;
    },
    postMessage(response: ExportWorkerResponse, transfers: ArrayBuffer[] = []) {
      responses.push(structuredClone(response, { transfer: transfers }));
    },
  };
  Object.assign(context, { self: context });
  runInNewContext(bundle.outputFiles[0].text, context);
  expect(responses.shift()).toEqual({ type: "ready" });
  for (const kind of ["pdf", "pptx"] as const) {
    const pages = [page()];
    const request = prepareExportWorkerRequest(1, kind, pages, { title: "Доска" });
    listener!({ data: request });
    const response = responses.shift();
    expect(response?.type).toBe("result");
    if (response?.type !== "result") throw new Error("missing worker result");
    const expected = kind === "pdf" ? makePdf(pages, request.info) : makePptx(pages, request.info);
    expect(new Uint8Array(response.bytes)).toEqual(expected);
  }
});
