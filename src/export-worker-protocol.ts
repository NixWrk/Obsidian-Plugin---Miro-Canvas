import type { ExportInfo, ExportPage } from "./export-files";

export type ExportWorkerKind = "pdf" | "pptx";

export const MAX_EXPORT_WORKER_PAGES = 200;
export const MAX_EXPORT_WORKER_INPUT_BYTES = 128 * 1024 * 1024;
export const MAX_MOBILE_EXPORT_WORKER_INPUT_BYTES = 64 * 1024 * 1024;
export const EXPORT_WORKER_TIMEOUT_MS = 60_000;
const MAX_POINT_EXTENT = 1_000_000;
const MAX_TEXT_LENGTH = 4096;

export type ExportWorkerDiagnostic =
  | "invalid-request"
  | "invalid-pages"
  | "invalid-page"
  | "invalid-placement"
  | "invalid-info"
  | "input-budget-exceeded"
  | "packing-failed";

export class ExportWorkerProtocolError extends Error {
  public constructor(public readonly code: ExportWorkerDiagnostic) {
    super(code);
  }
}

export interface ExportWorkerPage extends Omit<ExportPage, "image"> {
  readonly image: ArrayBuffer;
}

export interface ExportWorkerRequest {
  readonly type: "pack";
  readonly jobId: number;
  readonly kind: ExportWorkerKind;
  readonly pages: readonly ExportWorkerPage[];
  readonly info: ExportInfo;
}

export type ExportWorkerResponse =
  | { readonly type: "ready" }
  | { readonly type: "result"; readonly jobId: number; readonly bytes: ArrayBuffer }
  | { readonly type: "error"; readonly jobId: number; readonly code: ExportWorkerDiagnostic };

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Accept buffers from another browser window, but never a SharedArrayBuffer. */
export function isExportBuffer(value: unknown): value is ArrayBuffer {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, "byteLength");
    return descriptor?.get !== undefined && typeof descriptor.get.call(value) === "number";
  } catch {
    return false;
  }
}

function positivePoint(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= MAX_POINT_EXTENT;
}

function coordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= MAX_POINT_EXTENT;
}

function pixelSize(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 65535;
}

function text(value: unknown): boolean {
  return value === undefined || (typeof value === "string" && value.length <= MAX_TEXT_LENGTH);
}

function validateGeometry(page: Record<string, unknown>): void {
  if (!positivePoint(page.width) || !positivePoint(page.height)
    || !pixelSize(page.pixelWidth) || !pixelSize(page.pixelHeight) || !text(page.title)) {
    throw new ExportWorkerProtocolError("invalid-page");
  }
  if (page.placement !== undefined) {
    const box = page.placement;
    if (!record(box) || !coordinate(box.x) || !coordinate(box.y)
      || !positivePoint(box.width) || !positivePoint(box.height)) {
      throw new ExportWorkerProtocolError("invalid-placement");
    }
  }
}

function validateInfo(info: unknown): asserts info is ExportInfo {
  if (!record(info) || !text(info.title) || !text(info.author)) {
    throw new ExportWorkerProtocolError("invalid-info");
  }
}

function validatePages(pages: unknown, transferred: boolean, inputBudget = MAX_EXPORT_WORKER_INPUT_BYTES): void {
  if (!Array.isArray(pages) || pages.length === 0 || pages.length > MAX_EXPORT_WORKER_PAGES) {
    throw new ExportWorkerProtocolError("invalid-pages");
  }
  let total = 0;
  for (const candidate of pages as unknown[]) {
    if (!record(candidate)) throw new ExportWorkerProtocolError("invalid-page");
    validateGeometry(candidate);
    const image = candidate.image;
    const valid = transferred ? isExportBuffer(image)
      : ArrayBuffer.isView(image) && Object.prototype.toString.call(image) === "[object Uint8Array]";
    if (!valid) throw new ExportWorkerProtocolError("invalid-page");
    const length = transferred ? (image as ArrayBuffer).byteLength : (image as Uint8Array).byteLength;
    if (length === 0) throw new ExportWorkerProtocolError("invalid-page");
    total += length;
    if (total > inputBudget) {
      throw new ExportWorkerProtocolError("input-budget-exceeded");
    }
  }
}

export function validateExportWorkerRequest(value: unknown): asserts value is ExportWorkerRequest {
  if (!record(value) || value.type !== "pack" || !Number.isSafeInteger(value.jobId)
    || (value.jobId as number) < 1 || (value.kind !== "pdf" && value.kind !== "pptx")) {
    throw new ExportWorkerProtocolError("invalid-request");
  }
  validateInfo(value.info);
  validatePages(value.pages, true);
}

/** Check the whole input before allocating or detaching any page bytes. */
export function prepareExportWorkerRequest(
  jobId: number,
  kind: ExportWorkerKind,
  pages: readonly ExportPage[],
  info: ExportInfo,
  inputBudget = MAX_EXPORT_WORKER_INPUT_BYTES,
): ExportWorkerRequest {
  if (!Number.isSafeInteger(jobId) || jobId < 1 || (kind !== "pdf" && kind !== "pptx")) {
    throw new ExportWorkerProtocolError("invalid-request");
  }
  validateInfo(info);
  if (!Number.isSafeInteger(inputBudget) || inputBudget <= 0 || inputBudget > MAX_EXPORT_WORKER_INPUT_BYTES) {
    throw new ExportWorkerProtocolError("invalid-request");
  }
  validatePages(pages, false, inputBudget);
  const copied = pages.map((page): ExportWorkerPage => {
    // Copy only this view. Shared or overlapping input buffers stay with their owner.
    const bytes = new Uint8Array(page.image.byteLength);
    bytes.set(page.image);
    return {
      width: page.width,
      height: page.height,
      pixelWidth: page.pixelWidth,
      pixelHeight: page.pixelHeight,
      image: bytes.buffer,
      ...(page.title === undefined ? {} : { title: page.title }),
      ...(page.placement === undefined ? {} : { placement: { ...page.placement } }),
    };
  });
  return {
    type: "pack",
    jobId,
    kind,
    pages: copied,
    info: {
      ...(info.title === undefined ? {} : { title: info.title }),
      ...(info.author === undefined ? {} : { author: info.author }),
    },
  };
}
