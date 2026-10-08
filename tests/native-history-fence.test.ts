import { describe, expect, it, vi } from "vitest";
import { captureNativeHistory } from "../src/native-history-fence";

function nativeFixture(entries: readonly unknown[] = [{ name: "base" }], current = entries.length - 1, max = 100) {
  const runtime = { history: { data: [...entries], current, max }, requestPushHistory: undefined as unknown };
  let pending: (() => unknown) | undefined;
  let replaceOnPush = false;
  const push = (entry: unknown): void => {
    const history = runtime.history;
    if (replaceOnPush) history.data = history.data.slice(0, history.current + 1);
    else history.data.splice(history.current + 1);
    history.data.push(entry);
    if (history.data.length > history.max) history.data.shift();
    history.current = history.data.length - 1;
  };
  const run = vi.fn(function (this: unknown): unknown {
    expect(this).toBe(request);
    const job = pending;
    pending = undefined;
    return job?.();
  });
  const cancel = vi.fn(function (this: unknown): void {
    expect(this).toBe(request);
    pending = undefined;
  });
  const request = Object.assign(function (entry: unknown): void { pending = () => push(entry); }, { run, cancel });
  runtime.requestPushHistory = request;
  return { runtime, request, run, cancel, push,
    pending: () => pending !== undefined,
    queueJob: (job: () => unknown) => { pending = job; },
    replaceOnPush: () => { replaceOnPush = true; } };
}

describe("inspected native history fence", () => {
  it("drains a prior pending step before capture and flushes this action separately", () => {
    const f = nativeFixture();
    const prior = { name: "prior native edit" };
    const own = { name: "feature action" };
    f.request(prior);
    const fence = captureNativeHistory(f.runtime)!;
    expect(fence).toBeDefined();
    expect(f.runtime.history.data).toEqual([{ name: "base" }, prior]);
    expect(f.runtime.history.current).toBe(1);
    expect(f.run).toHaveBeenCalledOnce();
    f.request(own);
    expect(fence.flush()).toBe(true);
    expect(f.runtime.history.data).toEqual([{ name: "base" }, prior, own]);
    expect(f.run).toHaveBeenCalledTimes(2);
    expect(fence.restore(true)).toBe(true);
    expect(f.runtime.history.data).toEqual([{ name: "base" }, prior]);
    expect(f.runtime.history.data[1]).toBe(prior);
    expect(f.runtime.history.current).toBe(1);
    expect(f.runtime.history.max).toBe(100);
  });
  it("restores the full prior redo branch after append then throw", () => {
    const first = { name: "first" }, current = { name: "current" }, redo = { name: "redo" };
    const f = nativeFixture([first, current, redo], 1);
    const fence = captureNativeHistory(f.runtime)!;
    f.queueJob(() => { f.push({ name: "own" }); throw Error("native append failed"); });
    expect(fence.flush()).toBe(false);
    expect(f.runtime.history.data).toHaveLength(3);
    expect(fence.restore()).toBe(true);
    expect(f.runtime.history.data).toEqual([first, current, redo]);
    expect(f.runtime.history.data[2]).toBe(redo);
    expect(f.runtime.history.current).toBe(1);
    f.runtime.history.current++;
    expect(f.runtime.history.data[f.runtime.history.current]).toBe(redo);
  });
  it("refuses rollback into an unverified replacement array after append then throw", () => {
    const before = [{ name: "base" }, { name: "redo" }];
    const f = nativeFixture(before, 0);
    const fence = captureNativeHistory(f.runtime)!;
    f.replaceOnPush();
    f.queueJob(() => { f.push({ name: "own" }); throw Error("append failed after rebranch"); });
    expect(fence.flush()).toBe(false);
    const rows = f.runtime.history.data;
    const entries = [...rows];
    expect(fence.restore()).toBe(false);
    expect(f.cancel).not.toHaveBeenCalled();
    expect(f.runtime.history.data).toBe(rows);
    expect(f.runtime.history.data).toEqual(entries);
    expect(f.runtime.history.current).toBe(1);
  });
  it("refuses flush/owned restore when the native callback replaces captured data", () => {
    const f = nativeFixture([{ name: "base" }, { name: "redo" }], 0);
    const fence = captureNativeHistory(f.runtime)!;
    f.replaceOnPush();
    f.request({ name: "own" });
    expect(fence.flush()).toBe(false);
    const rows = f.runtime.history.data;
    expect(fence.restore(true)).toBe(false);
    expect(f.cancel).not.toHaveBeenCalled();
    expect(f.runtime.history.data).toBe(rows);
    expect(f.runtime.history.data).toEqual([{ name: "base" }, { name: "own" }]);
    expect(f.runtime.history.current).toBe(1);
  });
  it("restores an entry evicted by the native max limit without changing max", () => {
    const first = { name: "first" }, second = { name: "second" };
    const f = nativeFixture([first, second], 1, 2);
    const fence = captureNativeHistory(f.runtime)!;
    f.request({ name: "own" });
    expect(fence.flush()).toBe(true);
    expect(f.runtime.history.data[0]).toBe(second);
    expect(fence.restore(true)).toBe(true);
    expect(f.runtime.history.data[0]).toBe(first);
    expect(f.runtime.history.max).toBe(2);
  });
  it("cancels only the own pending step before immediate rollback", () => {
    const f = nativeFixture();
    const fence = captureNativeHistory(f.runtime)!;
    f.request({ name: "own queued step" });
    expect(fence.restore()).toBe(true);
    expect(f.pending()).toBe(false);
    expect(f.cancel).toHaveBeenCalledOnce();
    f.request.run();
    expect(f.runtime.history.data).toHaveLength(1);
  });
  it.each(["entry", "cursor", "tail", "array", "owner", "max", "queue"] as const)("refuses owned restore after a foreign %s change without cancelling pending work", kind => {
    const f = nativeFixture();
    const fence = captureNativeHistory(f.runtime)!;
    f.request({ name: "own" });
    expect(fence.flush()).toBe(true);
    f.request({ name: "foreign pending" });
    if (kind === "entry") f.runtime.history.data[0] = { name: "foreign entry" };
    if (kind === "cursor") f.runtime.history.current = 0;
    if (kind === "tail") f.runtime.history.data.push({ name: "foreign tail" });
    if (kind === "array") f.runtime.history.data = [...f.runtime.history.data];
    if (kind === "owner") f.runtime.history = { ...f.runtime.history, data: [...f.runtime.history.data] };
    if (kind === "max") f.runtime.history.max = 99;
    if (kind === "queue") f.runtime.requestPushHistory = Object.assign(() => undefined, { run: () => undefined, cancel: () => undefined });
    const rows = f.runtime.history.data;
    const values = [...rows];
    const position = f.runtime.history.current;
    expect(fence.restore(true)).toBe(false);
    expect(f.cancel).not.toHaveBeenCalled();
    expect(f.pending()).toBe(true);
    expect(f.runtime.history.data).toBe(rows);
    expect(f.runtime.history.data).toEqual(values);
    expect(f.runtime.history.current).toBe(position);
  });
  it("does not flush twice or drain another action queued after the own receipt", () => {
    const f = nativeFixture();
    const fence = captureNativeHistory(f.runtime)!;
    f.request({ name: "own" });
    expect(fence.flush()).toBe(true);
    f.request({ name: "foreign pending" });
    fence.flush();
    expect(f.run).toHaveBeenCalledTimes(2);
    expect(f.pending()).toBe(true);
    expect(f.runtime.history.data).toHaveLength(2);
  });
  it("requires a successful own flush before asynchronous owned restore", () => {
    const f = nativeFixture();
    const fence = captureNativeHistory(f.runtime)!;
    expect(fence.restore(true)).toBe(false);
    expect(f.cancel).not.toHaveBeenCalled();
  });
  it("fails closed when cancel throws or replaces data during cancellation", () => {
    for (const mode of ["throw", "replace"] as const) {
      const f = nativeFixture();
      const fence = captureNativeHistory(f.runtime)!;
      f.request({ name: "own" });
      expect(fence.flush()).toBe(true);
      const entries = [...f.runtime.history.data];
      f.cancel.mockImplementation(() => {
        if (mode === "throw") throw Error("cancel failed");
        f.runtime.history.data = [...entries];
      });
      expect(fence.restore()).toBe(false);
      expect(f.runtime.history.data).toEqual(entries);
      expect(f.runtime.history.current).toBe(1);
    }
  });
  it("does not alter native callback/method identities or later connected-creation debounce grouping", () => {
    const f = nativeFixture();
    const callback = f.runtime.requestPushHistory;
    const run = f.request.run, cancel = f.request.cancel;
    const fence = captureNativeHistory(f.runtime)!;
    f.request({ name: "feature" });
    expect(fence.flush()).toBe(true);
    expect(fence.restore(true)).toBe(true);
    expect(f.runtime.requestPushHistory).toBe(callback);
    expect(f.request.run).toBe(run);
    expect(f.request.cancel).toBe(cancel);
    f.request({ nodes: ["a", "b"], edges: [] });
    f.request({ nodes: ["a", "b"], edges: ["connected"] });
    expect(f.runtime.history.data).toHaveLength(1);
    f.request.run();
    expect(f.runtime.history.data).toEqual([{ name: "base" }, { nodes: ["a", "b"], edges: ["connected"] }]);
  });
});

describe("hostile/unsupported history inspection", () => {
  it.each(["history", "queue", "data", "current", "max", "run", "cancel", "row"] as const)("never invokes the %s accessor", field => {
    const f = nativeFixture();
    const getter = vi.fn(() => { throw Error("accessor executed"); });
    const owner = field === "history" || field === "queue" ? f.runtime
      : field === "run" || field === "cancel" ? f.request : field === "row" ? f.runtime.history.data : f.runtime.history;
    const key = field === "queue" ? "requestPushHistory" : field === "row" ? "0" : field;
    Object.defineProperty(owner, key, { get: getter, configurable: true });
    expect(captureNativeHistory(f.runtime)).toBeUndefined();
    expect(getter).not.toHaveBeenCalled();
    expect(f.run).not.toHaveBeenCalled();
    expect(f.cancel).not.toHaveBeenCalled();
  });
  it("rejects a cursor accessor introduced after flush without rolling back any rows", () => {
    const f = nativeFixture();
    const fence = captureNativeHistory(f.runtime)!;
    f.request({ name: "own" });
    expect(fence.flush()).toBe(true);
    const entries = [...f.runtime.history.data];
    const getter = vi.fn(() => 1);
    Object.defineProperty(f.runtime.history, "current", { get: getter, configurable: true });
    expect(fence.restore(true)).toBe(false);
    expect(getter).not.toHaveBeenCalled();
    expect(f.cancel).not.toHaveBeenCalled();
    expect(f.runtime.history.data).toEqual(entries);
  });
  it("does not read overridden array slice/splice/constructor/iterator hooks", () => {
    const f = nativeFixture();
    const getter = vi.fn(() => { throw Error("array hook executed"); });
    for (const key of ["slice", "splice", "constructor"]) Object.defineProperty(f.runtime.history.data, key, { get: getter });
    Object.defineProperty(f.runtime.history.data, Symbol.iterator, { get: getter });
    const fence = captureNativeHistory(f.runtime);
    const restored = fence?.restore();
    expect(getter).not.toHaveBeenCalled();
    if (fence === undefined) expect(f.run).not.toHaveBeenCalled();
    else expect(restored).toBe(true);
  });
  it.each([undefined, 0, -1, 1.5, NaN, Infinity])("rejects invalid native max %s before draining a prior action", max => {
    const f = nativeFixture();
    Object.defineProperty(f.runtime.history, "max", { value: max, writable: true });
    f.request({ name: "prior pending" });
    expect(captureNativeHistory(f.runtime)).toBeUndefined();
    expect(f.run).not.toHaveBeenCalled();
    expect(f.pending()).toBe(true);
  });
  it.each(["frozen", "sealed", "sparse", "readonly-index", "readonly-cursor", "bad-cursor", "oversized"] as const)("refuses %s history before draining", kind => {
    const f = nativeFixture();
    if (kind === "frozen") Object.freeze(f.runtime.history.data);
    if (kind === "sealed") Object.seal(f.runtime.history.data);
    if (kind === "sparse") f.runtime.history.data = new Array(1);
    if (kind === "readonly-index") Object.defineProperty(f.runtime.history.data, "0", { writable: false });
    if (kind === "readonly-cursor") Object.defineProperty(f.runtime.history, "current", { writable: false });
    if (kind === "bad-cursor") f.runtime.history.current = 2;
    if (kind === "oversized") f.runtime.history.data = Array.from({ length: 1001 }, () => ({}));
    expect(captureNativeHistory(f.runtime)).toBeUndefined();
    expect(f.run).not.toHaveBeenCalled();
  });
  it("fails closed on throwing reflection traps and refuses unverified debounce methods", () => {
    const f = nativeFixture();
    const proxy = new Proxy(f.runtime, { getOwnPropertyDescriptor: () => { throw Error("reflection failed"); } });
    expect(captureNativeHistory(proxy)).toBeUndefined();
    expect(f.run).not.toHaveBeenCalled();
    for (const queue of [() => undefined, { run: () => undefined, cancel: () => undefined }]) {
      expect(captureNativeHistory({ ...f.runtime, requestPushHistory: queue })).toBeUndefined();
    }
  });
});

describe("synchronous array fixture compatibility", () => {
  it("restores after an immediate save throws, including prior redo entries", () => {
    const base = { name: "base" }, redo = { name: "redo" };
    const runtime = { history: [base, redo], historyIndex: 0 };
    const rows = runtime.history;
    const fence = captureNativeHistory(runtime)!;
    try {
      runtime.history.splice(runtime.historyIndex + 1);
      runtime.history.push({ name: "own" });
      runtime.historyIndex++;
      throw Error("save failed after append");
    } catch {
      expect(fence.restore()).toBe(true);
    }
    expect(runtime.history).toBe(rows);
    expect(runtime.history).toEqual([base, redo]);
    expect(runtime.history[1]).toBe(redo);
    expect(runtime.historyIndex).toBe(0);
  });
  it("supports an empty initial stack and refuses an equal but replaced array after own flush", () => {
    const runtime = { history: [] as unknown[], historyIndex: -1 };
    const fence = captureNativeHistory(runtime)!;
    runtime.history.push({ name: "own" });
    runtime.historyIndex = 0;
    expect(fence.flush()).toBe(true);
    runtime.history = [...runtime.history];
    expect(fence.restore(true)).toBe(false);
    expect(runtime.history).toEqual([{ name: "own" }]);
  });
});
