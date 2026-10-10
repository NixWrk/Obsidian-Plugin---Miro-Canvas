/** Read-only preflight. The inspected native queue does not support safe property projection. */

type NativeObject = Record<string, unknown>;
export type CanvasPropertySearchDiagnostic =
  | "native-search-host-unreadable"
  | "native-search-shape-unverified"
  | "native-search-boundary-unsupported";
export type CanvasPropertySearchRequirement =
  | "request-local-content-reader"
  | "board-property-result-renderer"
  | "real-board-result-navigation"
  | "normal-query-and-concurrent-read-isolation";
export interface CanvasPropertySearchBoundaryReport {
  /** No verified installer exists for the inspected queue-only approach. */
  readonly supported: false;
  readonly code: CanvasPropertySearchDiagnostic;
  /** Structural resemblance only; never an acceptance or version guarantee. */
  readonly resemblesInspectedQueue: boolean;
  readonly queueFields: readonly string[];
  readonly queryState: "idle" | "active" | "unverified";
  readonly contentRequested: boolean | undefined;
  readonly requirements: readonly CanvasPropertySearchRequirement[];
}
const REQUIREMENTS: readonly CanvasPropertySearchRequirement[] = Object.freeze([
  "request-local-content-reader",
  "board-property-result-renderer",
  "real-board-result-navigation",
  "normal-query-and-concurrent-read-isolation",
]);
const ABSENT = Symbol("property-search-absent");

function object(value: unknown): value is NativeObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
/** Never invoke a getter, including private fields added by another owner. */
function own(value: NativeObject, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined) return ABSENT;
  if (!("value" in descriptor)) throw new Error("Native search accessors are unverified.");
  return descriptor.value;
}
/** Native methods may live on prototypes; cycles/deep chains remain bounded. */
function method(value: NativeObject, key: string): boolean {
  const visited = new Set<object>();
  let current: NativeObject | null = value;
  for (let depth = 0; current !== null && depth < 16; depth += 1) {
    if (current === Object.prototype || visited.has(current)) return false;
    visited.add(current);
    const descriptor = Object.getOwnPropertyDescriptor(current, key);
    if (descriptor !== undefined) {
      if (!("value" in descriptor)) throw new Error("Native search method accessors are unverified.");
      return typeof descriptor.value === "function";
    }
    const prototype: unknown = Object.getPrototypeOf(current);
    if (prototype === null) return false;
    if (!object(prototype)) return false;
    current = prototype;
  }
  return false;
}
function report(
  code: CanvasPropertySearchDiagnostic,
  queueFields: readonly string[] = [],
  queryState: CanvasPropertySearchBoundaryReport["queryState"] = "unverified",
  contentRequested?: boolean,
): CanvasPropertySearchBoundaryReport {
  return {
    supported: false, code, resemblesInspectedQueue: code === "native-search-boundary-unsupported",
    queueFields: [...queueFields], queryState, contentRequested, requirements: [...REQUIREMENTS],
  };
}

/**
 * Inspect the known search-view/queue shape without installing anything. The
 * queue cannot scope cachedRead to native search, and virtual Canvas property
 * nodes lack a verified native property-result/navigation route. Accordingly
 * this function never reports support, even when the structural probe matches.
 * It does not invoke searches, vault readers, index getters or lifecycle hooks.
 */
export function inspectCanvasPropertySearchBoundary(view: unknown): CanvasPropertySearchBoundaryReport {
  try {
    if (!object(view)) return report("native-search-shape-unverified");
    const queue = own(view, "queue");
    const app = own(view, "app");
    const dom = own(view, "dom");
    if (!object(queue) || !object(app) || !object(dom)) return report("native-search-shape-unverified");
    const queueFields = Object.getOwnPropertyNames(queue);
    const query = own(view, "searchQuery");
    let queryState: CanvasPropertySearchBoundaryReport["queryState"] = "unverified";
    let contentRequested: boolean | undefined;
    if (query === null) queryState = "idle";
    else if (object(query)) {
      const inputs = own(query, "requiredInputs");
      const matcher = own(query, "matcher");
      if (object(inputs) && object(matcher) && method(query, "match")) {
        const content = own(inputs, "content");
        if (content === ABSENT || typeof content === "boolean") {
          queryState = "active";
          contentRequested = content === ABSENT ? false : content;
        }
      }
    }
    if (queryState === "unverified" || own(view, "_loaded") !== true
      || own(queue, "_loaded") !== true || own(queue, "app") !== app || own(queue, "dom") !== dom
      || !method(view, "startSearch") || !method(view, "stopSearch") || !method(queue, "start") || !method(queue, "stop")) {
      return report("native-search-shape-unverified", queueFields, queryState, contentRequested);
    }
    const handle = own(queue, "queue");
    if (handle !== null && (!object(handle) || !method(handle, "generator") || !method(handle, "cancel")
      || !object(own(handle, "runnable")))) return report("native-search-shape-unverified", queueFields, queryState, contentRequested);
    return report("native-search-boundary-unsupported", queueFields, queryState, contentRequested);
  } catch {
    return report("native-search-host-unreadable");
  }
}
