import { describe, expect, it, vi } from "vitest";
import { inspectCanvasPropertySearchBoundary } from "../src/canvas-property-search";

function fixture(content?: boolean) {
  const vault = { cachedRead: vi.fn(async () => "real Canvas JSON"), modify: vi.fn() };
  const index = { get: vi.fn() };
  const app = { vault, workspace: { requestSaveLayout: vi.fn() }, canvas: { index } };
  const dom = { addResult: vi.fn(), removeResult: vi.fn() };
  const methods = { start: vi.fn(), stop: vi.fn(), onunload: vi.fn() };
  const queue = Object.assign(Object.create(methods) as Record<string, unknown>, {
    _loaded: true, _events: [], _children: [], queue: null as unknown, app, dom,
  });
  const nativeResult = { "canvas-real-card": [[2, 6]], filename: [[0, 5]] };
  const queryMethods = { match: vi.fn(function (this: unknown, file: unknown, text: string) { return { receiver: this, file, text, result: nativeResult }; }) };
  const query = Object.assign(Object.create(queryMethods) as Record<string, unknown>, {
    matcher: {}, requiredInputs: content === undefined ? {} : { content },
  });
  const viewMethods = { startSearch: vi.fn(), stopSearch: vi.fn() };
  const view = Object.assign(Object.create(viewMethods) as Record<string, unknown>, {
    _loaded: true, app, dom, queue, searchQuery: query as unknown,
  });
  return { app, dom, queue, methods, query, queryMethods, view, viewMethods, nativeResult };
}

describe("read-only native property-search boundary", () => {
  it("recognizes the inspected idle queue shape but explicitly reports no safe support", () => {
    const host = fixture();
    host.view.searchQuery = null;
    const report = inspectCanvasPropertySearchBoundary(host.view);
    expect(report).toMatchObject({ supported: false, code: "native-search-boundary-unsupported", resemblesInspectedQueue: true, queryState: "idle", contentRequested: undefined });
    expect(report.queueFields).toEqual(["_loaded", "_events", "_children", "queue", "app", "dom"]);
    expect(report.requirements).toEqual(["request-local-content-reader", "board-property-result-renderer", "real-board-result-navigation", "normal-query-and-concurrent-read-isolation"]);
  });

  it.each([undefined, false, true])("leaves a native content request %s unchanged", (content) => {
    const host = fixture(content);
    const inputs = host.query.requiredInputs;
    const descriptors = Object.getOwnPropertyDescriptors(host.query);
    const report = inspectCanvasPropertySearchBoundary(host.view);
    expect(report).toMatchObject({ supported: false, resemblesInspectedQueue: true, queryState: "active", contentRequested: content ?? false });
    expect(host.query.requiredInputs).toBe(inputs);
    expect(Object.getOwnPropertyDescriptors(host.query)).toEqual(descriptors);
    expect(host.queryMethods.match).not.toHaveBeenCalled();
  });

  it("does not touch native methods, result spans, vault/index/workspace readers or lifecycle calls", async () => {
    const host = fixture(true);
    const viewDescriptors = Object.getOwnPropertyDescriptors(host.view);
    const queueDescriptors = Object.getOwnPropertyDescriptors(host.queue);
    const original = host.queryMethods.match;
    const file = { path: "board.canvas", extension: "canvas" };
    const before = original.call(host.query, file, "unchanged card text");
    original.mockClear();
    inspectCanvasPropertySearchBoundary(host.view);
    expect(Object.getOwnPropertyDescriptors(host.view)).toEqual(viewDescriptors);
    expect(Object.getOwnPropertyDescriptors(host.queue)).toEqual(queueDescriptors);
    expect(host.queryMethods.match).toBe(original);
    expect(original).not.toHaveBeenCalled();
    for (const method of [...Object.values(host.methods), ...Object.values(host.viewMethods), ...Object.values(host.dom), ...Object.values(host.app.vault), ...Object.values(host.app.workspace), host.app.canvas.index.get]) expect(method).not.toHaveBeenCalled();
    const after = original.call(host.query, file, "unchanged card text");
    expect(after).toEqual(before);
    expect(after.result).toBe(host.nativeResult);
    expect(await host.app.vault.cachedRead()).toBe("real Canvas JSON");
  });

  it("inspects frozen native objects without replacing any descriptor or reference", () => {
    const host = fixture();
    Object.freeze(host.query.requiredInputs);
    Object.freeze(host.query);
    Object.freeze(host.queue);
    Object.freeze(host.view);
    expect(inspectCanvasPropertySearchBoundary(host.view)).toMatchObject({ supported: false, resemblesInspectedQueue: true });
  });

  it("never treats an unverified reader-looking field as an installable native boundary", () => {
    const host = fixture();
    const reader = vi.fn();
    host.queue.readContent = reader;
    host.queue.projectContent = reader;
    const report = inspectCanvasPropertySearchBoundary(host.view);
    expect(report.supported).toBe(false);
    expect(report.requirements).toContain("request-local-content-reader");
    expect(reader).not.toHaveBeenCalled();
  });

  it("accepts an observed-shaped active queue handle without starting or cancelling it", () => {
    const host = fixture();
    const handle = { runnable: {}, generator: vi.fn(), cancel: vi.fn() };
    host.queue.queue = handle;
    expect(inspectCanvasPropertySearchBoundary(host.view)).toMatchObject({ supported: false, resemblesInspectedQueue: true });
    expect(handle.generator).not.toHaveBeenCalled();
    expect(handle.cancel).not.toHaveBeenCalled();
  });

  it.each(["view field", "queue field", "native method", "content request"])("refuses an accessor %s without invoking it", (kind) => {
    const host = fixture();
    const getter = vi.fn(() => { throw new Error("Must never run"); });
    if (kind === "view field") Object.defineProperty(host.view, "queue", { get: getter });
    if (kind === "queue field") Object.defineProperty(host.queue, "app", { get: getter });
    if (kind === "native method") Object.defineProperty(host.queue, "start", { get: getter });
    if (kind === "content request") Object.defineProperty(host.query.requiredInputs, "content", { get: getter });
    expect(inspectCanvasPropertySearchBoundary(host.view)).toMatchObject({ supported: false, code: "native-search-host-unreadable" });
    expect(getter).not.toHaveBeenCalled();
  });

  it.each([null, undefined, [], "view", 1, {}])("fails closed for an unrecognized host %s", (view) => {
    expect(inspectCanvasPropertySearchBoundary(view)).toMatchObject({ supported: false, resemblesInspectedQueue: false, code: "native-search-shape-unverified" });
  });

  it("refuses a revoked host without leaking its proxy exception", () => {
    const proxy = Proxy.revocable({}, {});
    proxy.revoke();
    expect(inspectCanvasPropertySearchBoundary(proxy.proxy)).toMatchObject({ supported: false, code: "native-search-host-unreadable" });
  });

  it("bounds prototype cycles and unusually deep method chains", () => {
    const host = fixture();
    let cycle: object;
    cycle = new Proxy({}, { getPrototypeOf: () => cycle });
    Object.setPrototypeOf(host.queue, cycle);
    expect(inspectCanvasPropertySearchBoundary(host.view)).toMatchObject({ supported: false, resemblesInspectedQueue: false });
    const deep = fixture();
    let prototype: object = deep.methods;
    for (let depth = 0; depth < 20; depth += 1) prototype = Object.create(prototype) as object;
    Object.setPrototypeOf(deep.queue, prototype);
    expect(inspectCanvasPropertySearchBoundary(deep.view)).toMatchObject({ supported: false, resemblesInspectedQueue: false });
  });

  it("does not retain native object references or let a caller poison later diagnostics", () => {
    const host = fixture();
    const report = inspectCanvasPropertySearchBoundary(host.view);
    (report.queueFields as string[]).push("invented");
    (report.requirements as string[]).splice(0);
    const next = inspectCanvasPropertySearchBoundary(host.view);
    expect(next.queueFields).not.toContain("invented");
    expect(next.requirements).toHaveLength(4);
    expect(JSON.stringify(next)).not.toContain("real-card");
    expect(Object.values(next).some((value) => value === host.view || value === host.queue || value === host.app)).toBe(false);
  });
});
