/** Prepare closed-board metadata through MetadataWriter; parent owns Vault.process CAS. */
import { cloneCanvasJson } from "./canvas-json";
import { planBoardLinkRename, type BoardLinkDiagnostic, type BoardRenameOptions } from "./board-link-lifecycle";
import { MetadataWriter, type MetadataDocumentStore, type MetadataWriteResult } from "./metadata-writer";

type Data = Record<string, unknown>;
const MAINTAINED_FIELDS = new Set(["properties", "nodeRedirects"]);
export const BOARD_METADATA_MAINTENANCE_MAX_BYTES = 16 * 1024 * 1024;

export interface BoardMetadataMaintenanceOptions extends Omit<BoardRenameOptions, "metadataOnly" | "textTargetBeforeRename"> {
  /** May reduce the 16MiB UTF-8 input bound. */
  readonly maxSourceBytes?: number;
}

export type BoardMetadataMaintenancePlan = {
  readonly status: "prepared";
  /** Exact original source string; parent must compare this inside Vault.process. */
  readonly expectedSource: string;
  readonly document: Data;
  readonly diagnostics: readonly BoardLinkDiagnostic[];
  readonly writer: MetadataWriteResult;
} | {
  readonly status: "noop";
  readonly expectedSource: string;
  readonly diagnostics: readonly BoardLinkDiagnostic[];
} | {
  readonly status: "rejected";
  readonly reason: string;
  readonly diagnostics: readonly BoardLinkDiagnostic[];
  readonly writer?: MetadataWriteResult;
};

function record(value: unknown): value is Data {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function equal(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length
      && left.every((value, index) => equal(value, right[index]));
  }
  if (!record(left) || !record(right)) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length
    && keys.every(key => Object.prototype.hasOwnProperty.call(right, key) && equal(left[key], right[key]));
}

function outsideScope(document: Data): Data {
  const result = Object.fromEntries(Object.entries(document).filter(([key]) => key !== "miroCanvas"));
  const metadata = document.miroCanvas;
  if (record(metadata)) result.miroCanvas = Object.fromEntries(Object.entries(metadata).filter(([key]) => !MAINTAINED_FIELDS.has(key)));
  else if (Object.prototype.hasOwnProperty.call(document, "miroCanvas")) result.miroCanvas = metadata;
  return result;
}

/** This is a detached persistence boundary, never a synthetic Canvas runtime. */
class DetachedMetadataStore implements MetadataDocumentStore {
  private current: Data;
  private failure: string | undefined;
  constructor(document: Data) { this.current = cloneCanvasJson(document); }
  readDocument(): Data { return cloneCanvasJson(this.current); }
  commitDocument(nextDocument: Readonly<Data>, expectedDocument: Readonly<Data>): boolean {
    if (!equal(this.current, expectedDocument)) { this.failure = "detached-source-changed"; return false; }
    if (!equal(outsideScope(this.current), outsideScope(nextDocument))) { this.failure = "outside-maintenance-scope"; return false; }
    this.current = cloneCanvasJson(nextDocument);
    this.failure = undefined;
    return true;
  }
  describeLastCommitFailure(): string | undefined { return this.failure; }
}

function oversized(source: string, maximum: number): boolean {
  if (source.length > maximum) return true;
  let bytes = 0;
  for (const character of source) {
    const code = character.codePointAt(0) ?? 0;
    bytes += code < 128 ? 1 : code < 2048 ? 2 : code < 65536 ? 3 : 4;
    if (bytes > maximum) return true;
  }
  return false;
}

/** Return a validated next document only if owned metadata actually changes. */
export function prepareBoardMetadataRename(source: string, options: BoardMetadataMaintenanceOptions): BoardMetadataMaintenancePlan {
  const requested = options.maxSourceBytes;
  const maximum = requested !== undefined && Number.isFinite(requested) && requested >= 1
    ? Math.min(Math.floor(requested), BOARD_METADATA_MAINTENANCE_MAX_BYTES) : BOARD_METADATA_MAINTENANCE_MAX_BYTES;
  if (oversized(source, maximum)) return { status: "rejected", reason: "source-byte-limit", diagnostics: [] };
  try {
    const parsed: unknown = JSON.parse(source);
    if (!record(parsed)) return { status: "rejected", reason: "invalid-document", diagnostics: [] };
    const original = cloneCanvasJson(parsed);
    const rename = planBoardLinkRename(original, { ...options, metadataOnly: true });
    if (!rename.ok) return { status: "rejected", reason: rename.reason, diagnostics: [] };
    const before = original.miroCanvas;
    const proposed = rename.document.miroCanvas;
    if (!record(before) || !record(proposed)) return { status: "noop", expectedSource: source, diagnostics: rename.diagnostics };
    if ([...MAINTAINED_FIELDS].every(key => equal(before[key], proposed[key]))) {
      return { status: "noop", expectedSource: source, diagnostics: rename.diagnostics };
    }
    const store = new DetachedMetadataStore(original);
    const writer = new MetadataWriter(store).write("maintain-renamed-board-metadata", draft => {
      for (const key of MAINTAINED_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(proposed, key)) {
          Object.defineProperty(draft, key, { value: cloneCanvasJson(proposed[key]), configurable: true, enumerable: true, writable: true });
        }
      }
    });
    if (!writer.ok || writer.status !== "applied") return { status: "rejected", reason: "metadata-writer-rejected", diagnostics: rename.diagnostics, writer };
    const document = store.readDocument();
    if (!equal(outsideScope(original), outsideScope(document))) return { status: "rejected", reason: "outside-maintenance-scope", diagnostics: rename.diagnostics, writer };
    return { status: "prepared", expectedSource: source, document, diagnostics: rename.diagnostics, writer };
  } catch { return { status: "rejected", reason: "invalid-document", diagnostics: [] }; }
}
