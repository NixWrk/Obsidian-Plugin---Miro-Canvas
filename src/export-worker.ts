import { makePdf, makePptx } from "./export-files";
import {
  ExportWorkerProtocolError,
  isExportBuffer,
  validateExportWorkerRequest,
  type ExportWorkerResponse,
} from "./export-worker-protocol";

/** The worker owns only JPEG bytes and page geometry, never the working board. */
export function packExportWorkerRequest(value: unknown): ExportWorkerResponse {
  let jobId = 0;
  if (value !== null && typeof value === "object" && "jobId" in value
    && typeof value.jobId === "number" && Number.isSafeInteger(value.jobId)) {
    jobId = value.jobId;
  }
  try {
    validateExportWorkerRequest(value);
    const pages = value.pages.map((page) => ({ ...page, image: new Uint8Array(page.image) }));
    const bytes = value.kind === "pdf" ? makePdf(pages, value.info) : makePptx(pages, value.info);
    const buffer = bytes.buffer;
    if (!isExportBuffer(buffer)) throw new ExportWorkerProtocolError("packing-failed");
    return { type: "result", jobId: value.jobId, bytes: buffer };
  } catch (error) {
    return {
      type: "error",
      jobId,
      code: error instanceof ExportWorkerProtocolError ? error.code : "packing-failed",
    };
  }
}

interface ExportWorkerScope {
  addEventListener(type: "message", listener: (event: { readonly data: unknown }) => void): void;
  postMessage(message: ExportWorkerResponse, transfer?: ArrayBuffer[]): void;
}

const scope = typeof self === "undefined" ? undefined : self as unknown as Partial<ExportWorkerScope>;
if (typeof scope?.addEventListener === "function" && typeof scope.postMessage === "function") {
  const post = scope.postMessage.bind(scope);
  scope.addEventListener("message", (event) => {
    const response = packExportWorkerRequest(event.data);
    post(response, response.type === "result" ? [response.bytes] : []);
  });
  post({ type: "ready" });
}
