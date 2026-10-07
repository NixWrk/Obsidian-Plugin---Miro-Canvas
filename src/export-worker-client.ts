import type { ExportInfo, ExportPage } from "./export-files";
import {
  EXPORT_WORKER_TIMEOUT_MS,
  MAX_EXPORT_WORKER_INPUT_BYTES,
  MAX_MOBILE_EXPORT_WORKER_INPUT_BYTES,
  ExportWorkerProtocolError,
  isExportBuffer,
  prepareExportWorkerRequest,
  type ExportWorkerKind,
  type ExportWorkerRequest,
} from "./export-worker-protocol";
import { words } from "./i18n";

// esbuild injects the reviewed worker bundle; it is never assembled at runtime.
declare const __MIRO_EXPORT_WORKER_SOURCE__: string;

type ExportWindow = Window & {
  readonly Worker?: typeof Worker;
  readonly Blob?: typeof Blob;
  readonly URL?: typeof URL;
};

let nextJobId = 0;

/** Pack independent page pictures off the UI thread; never fall back to live capture. */
export async function packExport(
  kind: ExportWorkerKind,
  pages: readonly ExportPage[],
  info: ExportInfo,
  document: Document,
  signal: AbortSignal,
): Promise<Uint8Array> {
  if (signal.aborted) throw new Error(words().export.exportStopped);
  const view = document.defaultView as ExportWindow | null;
  const source = typeof __MIRO_EXPORT_WORKER_SOURCE__ === "string" ? __MIRO_EXPORT_WORKER_SOURCE__ : "";
  if (view === null || typeof view.Worker !== "function" || typeof view.Blob !== "function"
    || typeof view.URL?.createObjectURL !== "function" || typeof view.URL.revokeObjectURL !== "function"
    || source.length === 0) {
    throw new Error(words().export.unavailable);
  }
  const WorkerConstructor = view.Worker;
  const BlobConstructor = view.Blob;
  const urls = view.URL;
  const jobId = ++nextJobId;
  let request: ExportWorkerRequest;
  try {
    const classes = document.body?.classList;
    const mobile = classes?.contains("is-mobile") === true || classes?.contains("is-tablet") === true
      || classes?.contains("is-phone") === true;
    request = prepareExportWorkerRequest(jobId, kind, pages, info,
      mobile ? MAX_MOBILE_EXPORT_WORKER_INPUT_BYTES : MAX_EXPORT_WORKER_INPUT_BYTES);
  } catch (error) {
    throw new Error(error instanceof ExportWorkerProtocolError && error.code === "input-budget-exceeded"
      ? words().export.tooLarge : words().export.exportFailed);
  }
  if (signal.aborted) throw new Error(words().export.exportStopped);

  return new Promise<Uint8Array>((resolve, reject) => {
    let worker: Worker | undefined;
    let url: string | undefined;
    let timeout: number | undefined;
    let settled = false;
    let submitted = false;
    const cleanup = (): void => {
      if (timeout !== undefined) view.clearTimeout(timeout);
      signal.removeEventListener("abort", onAbort);
      if (worker !== undefined) {
        worker.removeEventListener("message", onMessage);
        worker.removeEventListener("error", onError);
        worker.removeEventListener("messageerror", onMessageError);
        worker.terminate();
      }
      if (url !== undefined) urls.revokeObjectURL(url);
    };
    const finish = (value: Uint8Array | Error): void => {
      if (settled) return;
      settled = true;
      cleanup();
      if (value instanceof Error) reject(value);
      else resolve(value);
    };
    const fail = (): void => finish(new Error(words().export.exportFailed));
    const onAbort = (): void => finish(new Error(words().export.exportStopped));
    const onError = (event: ErrorEvent): void => {
      event.preventDefault();
      finish(new Error(submitted ? words().export.exportFailed : words().export.unavailable));
    };
    const onMessageError = (): void => fail();
    const onMessage = (event: MessageEvent<unknown>): void => {
      if (settled) return;
      const value = event.data;
      if (value === null || typeof value !== "object" || !("type" in value)) {
        fail();
        return;
      }
      if (value.type === "ready") {
        if (submitted) return;
        if (signal.aborted) {
          onAbort();
          return;
        }
        submitted = true;
        try {
          worker?.postMessage(request, request.pages.map((page) => page.image));
        } catch {
          fail();
        }
        return;
      }
      if (!("jobId" in value) || value.jobId !== jobId) return;
      if (!submitted || value.type !== "result" || !("bytes" in value)
        || !isExportBuffer(value.bytes) || value.bytes.byteLength === 0) {
        fail();
        return;
      }
      finish(new Uint8Array(value.bytes));
    };
    try {
      url = urls.createObjectURL(new BlobConstructor([source], { type: "text/javascript" }));
      worker = new WorkerConstructor(url, { name: "miro-canvas-export", type: "classic" });
      worker.addEventListener("message", onMessage);
      worker.addEventListener("error", onError);
      worker.addEventListener("messageerror", onMessageError);
      signal.addEventListener("abort", onAbort, { once: true });
      timeout = view.setTimeout(fail, EXPORT_WORKER_TIMEOUT_MS);
      if (signal.aborted) onAbort();
    } catch {
      finish(new Error(words().export.unavailable));
    }
  });
}
