import { describe, expect, it, vi } from "vitest";
import {
  BoardTransferPublisher, BOARD_TRANSFER_PUBLISH_LIMITS,
  type BoardTransferAdapter, type BoardTransferPublication, type TransferApplyResult, type TransferCreateResult,
  type TransferFileFingerprint, type TransferFileStat, type TransferSaveResult, type TransferSourceGuard,
} from "../src/board-transfer-publisher";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error?: unknown) => void;
  const promise = new Promise<T>((fulfil, fail) => { resolve = fulfil; reject = fail; });
  return { promise, resolve, reject };
}

async function settle(): Promise<void> {
  for (let count = 0; count < 30; count += 1) await Promise.resolve();
}

function fixture() {
  const files = new Map<string, TransferFileFingerprint>();
  const operations: string[] = [];
  let identity = 0;
  let current = "before";
  const put = (path: string, text: string, recreate = false): TransferFileFingerprint => {
    const old = files.get(path);
    const stat = {
      identity: recreate || old === undefined ? `file-${identity++}` : old.stat.identity,
      mtime: (old?.stat.mtime ?? 0) + 1,
      revision: Number(old?.stat.revision ?? 0) + 1,
      size: text.length,
    };
    const fingerprint = { stat, text };
    files.set(path, fingerprint);
    return fingerprint;
  };
  const sourceFingerprint = put("Source.canvas", "before");
  const fingerprint = (path: string): TransferFileFingerprint => {
    const file = files.get(path);
    if (file === undefined) throw new Error("missing");
    return { stat: { ...file.stat }, text: file.text };
  };
  const equalFile = (path: string, expected: TransferFileFingerprint): boolean => {
    const actual = files.get(path);
    return actual !== undefined && actual.text === expected.text && actual.stat.identity === expected.stat.identity
      && actual.stat.mtime === expected.stat.mtime && actual.stat.size === expected.stat.size && actual.stat.revision === expected.stat.revision;
  };
  const stat = vi.fn(async (path: string, _signal: AbortSignal): Promise<TransferFileStat | undefined> => files.get(path)?.stat);
  const read = vi.fn(async (path: string, _signal: AbortSignal) => fingerprint(path).text);
  const snapshotSource = vi.fn(async (_path: string, _signal: AbortSignal) => current);
  const sameSnapshot = vi.fn((left: string, right: string) => left === right);
  const createTarget = vi.fn(async (path: string, text: string, signal: AbortSignal): Promise<TransferCreateResult> => {
    if (signal.aborted) return { status: "failed" };
    operations.push("create");
    if (files.has(path)) return { status: "exists" };
    return { status: "created", stat: put(path, text).stat };
  });
  const applySource = vi.fn(async (_path: string, next: string, expected: TransferSourceGuard<string>, signal: AbortSignal): Promise<TransferApplyResult<string>> => {
    if (signal.aborted || current !== expected.snapshot || !equalFile(expected.path, expected.fingerprint)) return { status: "refused" };
    operations.push("apply");
    current = next;
    return { status: "applied", snapshot: current, rollbackSafe: true };
  });
  const awaitSourceSave = vi.fn(async (path: string, expected: string, signal: AbortSignal): Promise<TransferSaveResult> => {
    if (signal.aborted || current !== expected) return { status: "failed" };
    operations.push(`save:${expected}`);
    return { status: "saved", fingerprint: put(path, expected) };
  });
  const rollbackSource = vi.fn(async (before: string, expected: TransferSourceGuard<string>, signal: AbortSignal) => {
    if (signal.aborted || current !== expected.snapshot || !equalFile(expected.path, expected.fingerprint)) return false;
    operations.push("rollback");
    current = before;
    return true;
  });
  const deleteTarget = vi.fn(async (path: string, expected: TransferFileFingerprint, source: TransferSourceGuard<string>, signal: AbortSignal) => {
    if (signal.aborted || current !== source.snapshot || !equalFile(source.path, source.fingerprint) || !equalFile(path, expected)) return false;
    operations.push("delete");
    files.delete(path);
    return true;
  });
  const adapter: BoardTransferAdapter<string> = { stat, read, snapshotSource, sameSnapshot, createTarget, applySource, awaitSourceSave, rollbackSource, deleteTarget };
  const publisher = new BoardTransferPublisher(adapter);
  const request: BoardTransferPublication<string> = {
    sourcePath: "Source.canvas", targetPath: "Moved.canvas", sourceFingerprint,
    sourceBefore: "before", sourceAfter: "after", targetText: '{"nodes":[],"edges":[],"miroSource":{"evidence":"kept"}}',
  };
  return {
    files, put, fingerprint, operations, request, publisher, adapter,
    stat, read, snapshotSource, sameSnapshot, createTarget, applySource, awaitSourceSave, rollbackSource, deleteTarget,
    setCurrent: (value: string) => { current = value; }, getCurrent: () => current,
  };
}

describe("checked two-file publication", () => {
  it("checks fingerprints before unique creation, applies once and waits for verified durable save", async () => {
    const data = fixture();
    const saving = deferred<TransferSaveResult>();
    data.awaitSourceSave.mockImplementationOnce(() => saving.promise);
    let completed = false;
    const publishing = data.publisher.publish(data.request).then((result) => { completed = true; return result; });
    await settle();
    expect(data.operations).toEqual(["create", "apply"]);
    expect(data.read.mock.calls.filter(([path]) => path === "Source.canvas").length).toBeGreaterThanOrEqual(2);
    expect(completed).toBe(false);
    const saved = data.put("Source.canvas", "after");
    saving.resolve({ status: "saved", fingerprint: saved });
    const result = await publishing;
    expect(result).toMatchObject({ status: "applied", sourcePath: "Source.canvas", targetPath: "Moved.canvas", source: "applied", target: "created", diagnostics: [] });
    expect(data.applySource).toHaveBeenCalledTimes(1);
    expect(data.rollbackSource).not.toHaveBeenCalled();
    expect(data.deleteTarget).not.toHaveBeenCalled();
  });

  it.each(["../Moved.canvas", "/Moved.canvas", "folder\\Moved.canvas", "C:/Moved.canvas", "Moved.md", "Source.canvas", "source.canvas", ""])("refuses invalid/aliased target %s without I/O", async (targetPath) => {
    const { publisher, request, stat, createTarget } = fixture();
    expect((await publisher.publish({ ...request, targetPath })).status).toBe("refused");
    expect(stat).not.toHaveBeenCalled();
    expect(createTarget).not.toHaveBeenCalled();
  });

  it("bounds text/stat sizes and never treats an invalid fingerprint as a valid source", async () => {
    const { publisher, request, stat } = fixture();
    for (const publication of [
      { ...request, targetText: "x".repeat(BOARD_TRANSFER_PUBLISH_LIMITS.textCharacters + 1) },
      { ...request, sourceFingerprint: { ...request.sourceFingerprint, stat: { ...request.sourceFingerprint.stat, mtime: NaN } } },
      { ...request, sourceFingerprint: { ...request.sourceFingerprint, stat: { ...request.sourceFingerprint.stat, identity: "" } } },
      { ...request, targetText: "" },
    ]) expect((await publisher.publish(publication)).diagnostics).toEqual(["invalid-request"]);
    expect(stat).not.toHaveBeenCalled();
  });

  it.each(["stat", "identity", "text", "snapshot", "missing"])("refuses stale source %s before target creation", async (change) => {
    const data = fixture();
    if (change === "stat") data.put("Source.canvas", "before");
    if (change === "identity") data.put("Source.canvas", "before", true);
    if (change === "text") data.files.set("Source.canvas", { ...data.fingerprint("Source.canvas"), text: "edited" });
    if (change === "snapshot") data.setCurrent("edited");
    if (change === "missing") data.files.delete("Source.canvas");
    expect(await data.publisher.publish(data.request)).toMatchObject({ status: "refused", source: "changed", diagnostics: ["source-changed"] });
    expect(data.createTarget).not.toHaveBeenCalled();
    expect(data.applySource).not.toHaveBeenCalled();
  });

  it("catches a disk change during reading and source changes during target availability lookup", async () => {
    const data = fixture();
    data.read.mockImplementationOnce(async () => { data.put("Source.canvas", "changed"); return "before"; });
    expect((await data.publisher.publish(data.request)).status).toBe("refused");
    expect(data.createTarget).not.toHaveBeenCalled();
    const next = fixture();
    next.stat.mockImplementation(async (path) => {
      if (path === "Moved.canvas") { next.setCurrent("changed"); return undefined; }
      return next.files.get(path)?.stat;
    });
    expect((await next.publisher.publish(next.request)).status).toBe("refused");
    expect(next.createTarget).not.toHaveBeenCalled();
  });

  it("preserves an existing target and refuses an exclusive-create collision without renaming", async () => {
    const data = fixture();
    const existing = data.put("Moved.canvas", "someone else's board");
    expect((await data.publisher.publish(data.request)).diagnostics).toEqual(["target-exists"]);
    expect(data.createTarget).not.toHaveBeenCalled();
    expect(data.files.get("Moved.canvas")).toBe(existing);
    const race = fixture();
    race.createTarget.mockImplementationOnce(async (path) => { race.put(path, "racing board"); return { status: "exists" }; });
    expect(await race.publisher.publish(race.request)).toMatchObject({ status: "refused", target: "existing", diagnostics: ["target-exists"] });
    expect(race.applySource).not.toHaveBeenCalled();
    expect(race.deleteTarget).not.toHaveBeenCalled();
    expect([...race.files.keys()]).toEqual(["Source.canvas", "Moved.canvas"]);
  });

  it("retains the created target if source changes during creation, before applying", async () => {
    const data = fixture();
    data.createTarget.mockImplementationOnce(async (path, text) => {
      const created = data.put(path, text);
      data.setCurrent("user edit");
      return { status: "created", stat: created.stat };
    });
    expect(await data.publisher.publish(data.request)).toMatchObject({ status: "partial", source: "changed", target: "retained", diagnostics: ["source-changed"] });
    expect(data.applySource).not.toHaveBeenCalled();
    expect(data.rollbackSource).not.toHaveBeenCalled();
    expect(data.deleteTarget).not.toHaveBeenCalled();
    expect(data.files.has("Moved.canvas")).toBe(true);
  });

  it("deletes a failed-create artifact only with a certified identity/content receipt", async () => {
    const data = fixture();
    data.createTarget.mockImplementationOnce(async (path, text) => ({ status: "failed", created: data.put(path, text).stat }));
    expect(await data.publisher.publish(data.request)).toMatchObject({ status: "recovered", source: "unchanged", target: "absent", diagnostics: ["create-failed"] });
    expect(data.applySource).not.toHaveBeenCalled();
    expect(data.deleteTarget).toHaveBeenCalledTimes(1);
    const uncertain = fixture();
    uncertain.createTarget.mockImplementationOnce(async (path, text) => { uncertain.put(path, text); throw new Error("receipt lost"); });
    expect(await uncertain.publisher.publish(uncertain.request)).toMatchObject({ status: "partial", target: "unknown", diagnostics: ["create-failed"] });
    expect(uncertain.deleteTarget).not.toHaveBeenCalled();
  });

  it("recovers a source apply refusal without a rollback or source save", async () => {
    const data = fixture();
    data.applySource.mockResolvedValueOnce({ status: "refused" });
    expect(await data.publisher.publish(data.request)).toMatchObject({ status: "recovered", source: "unchanged", target: "absent", diagnostics: ["apply-refused"] });
    expect(data.applySource).toHaveBeenCalledTimes(1);
    expect(data.rollbackSource).not.toHaveBeenCalled();
    expect(data.awaitSourceSave).not.toHaveBeenCalled();
  });

  it("passes the exact source file/snapshot guard to the apply CAS and preserves a boundary-time edit", async () => {
    const data = fixture();
    const nativeApply = data.applySource.getMockImplementation()!;
    data.applySource.mockImplementationOnce(async (path, next, expected, signal) => {
      expect(expected.path).toBe(data.request.sourcePath);
      expect(expected.snapshot).toBe("before");
      expect(expected.fingerprint).toEqual(data.request.sourceFingerprint);
      data.put(path, "user disk edit at CAS");
      return nativeApply(path, next, expected, signal);
    });
    expect(await data.publisher.publish(data.request)).toMatchObject({ status: "partial", source: "changed", target: "retained" });
    expect(data.applySource).toHaveBeenCalledTimes(1);
    expect(data.operations).toEqual(["create"]);
    expect(data.files.get("Source.canvas")?.text).toBe("user disk edit at CAS");
    expect(data.deleteTarget).not.toHaveBeenCalled();
  });

  it("does not guess rollback ownership after an apply throws or returns an unsafe receipt", async () => {
    const data = fixture();
    data.applySource.mockImplementationOnce(async () => { data.setCurrent("after"); throw new Error("unknown ownership"); });
    expect(await data.publisher.publish(data.request)).toMatchObject({ status: "partial", target: "retained", diagnostics: ["apply-failed", "rollback-unsafe"] });
    expect(data.rollbackSource).not.toHaveBeenCalled();
    expect(data.deleteTarget).not.toHaveBeenCalled();
    const unsafe = fixture();
    unsafe.applySource.mockImplementationOnce(async () => { unsafe.setCurrent("after"); return { status: "applied", snapshot: "after", rollbackSafe: false }; });
    unsafe.awaitSourceSave.mockResolvedValueOnce({ status: "failed" });
    expect((await unsafe.publisher.publish(unsafe.request)).diagnostics).toEqual(["save-failed", "rollback-unsafe"]);
    expect(unsafe.rollbackSource).not.toHaveBeenCalled();
  });

  it("recovers a checked partial apply or a save failure through CAS rollback, awaited restore save and checked deletion", async () => {
    const data = fixture();
    data.applySource.mockImplementationOnce(async () => { data.setCurrent("partial"); return { status: "failed", snapshot: "partial", rollbackSafe: true }; });
    expect(await data.publisher.publish(data.request)).toMatchObject({ status: "recovered", source: "restored", target: "absent", diagnostics: ["apply-failed"] });
    expect(data.operations).toEqual(["create", "rollback", "save:before", "delete"]);
    const saveFailure = fixture();
    saveFailure.awaitSourceSave.mockResolvedValueOnce({ status: "failed" });
    expect(await saveFailure.publisher.publish(saveFailure.request)).toMatchObject({ status: "recovered", source: "restored", target: "absent", diagnostics: ["save-failed"] });
    expect(saveFailure.operations).toEqual(["create", "apply", "rollback", "save:before", "delete"]);
    expect(saveFailure.rollbackSource.mock.calls[0][1].snapshot).toBe("after");
  });

  it("accepts a certified post-save failure fingerprint and retains a disk version with no ownership proof", async () => {
    const data = fixture();
    data.awaitSourceSave.mockImplementationOnce(async (path) => ({ status: "failed", fingerprint: data.put(path, "after") }));
    expect((await data.publisher.publish(data.request)).status).toBe("recovered");
    const unknown = fixture();
    unknown.awaitSourceSave.mockImplementationOnce(async (path) => { unknown.put(path, "after"); throw new Error("saved but no receipt"); });
    expect(await unknown.publisher.publish(unknown.request)).toMatchObject({ status: "partial", source: "changed", target: "retained" });
    expect(unknown.rollbackSource).not.toHaveBeenCalled();
    expect(unknown.deleteTarget).not.toHaveBeenCalled();
  });

  it("retains both files if runtime source or disk source changed before compensation", async () => {
    for (const change of ["runtime", "disk", "undo"]) {
      const data = fixture();
      data.awaitSourceSave.mockImplementationOnce(async (path) => {
        if (change === "runtime") data.setCurrent("user edit");
        if (change === "disk") data.put(path, "external edit");
        if (change === "undo") data.setCurrent("before");
        return { status: "failed" };
      });
      expect(await data.publisher.publish(data.request)).toMatchObject({ status: "partial", source: "changed", target: "retained" });
      expect(data.rollbackSource).not.toHaveBeenCalled();
      expect(data.deleteTarget).not.toHaveBeenCalled();
    }
  });

  it.each(["edit", "identity", "revision", "same-body-write"])("retains target %s even after safe source recovery", async (change) => {
    const data = fixture();
    data.awaitSourceSave.mockImplementationOnce(async () => {
      const target = data.fingerprint("Moved.canvas");
      if (change === "edit") data.put("Moved.canvas", "edited target");
      if (change === "identity") data.files.set("Moved.canvas", { ...target, stat: { ...target.stat, identity: "replacement" } });
      if (change === "revision") data.files.set("Moved.canvas", { ...target, stat: { ...target.stat, revision: 99 } });
      if (change === "same-body-write") data.put("Moved.canvas", target.text);
      return { status: "failed" };
    });
    expect(await data.publisher.publish(data.request)).toMatchObject({ status: "partial", source: "restored", target: "changed", diagnostics: ["save-failed", "target-changed"] });
    expect(data.deleteTarget).not.toHaveBeenCalled();
    expect(data.files.has("Moved.canvas")).toBe(true);
  });

  it.each(["refuse", "throw", "false-restore", "save-fail"])("retains target on rollback %s", async (failure) => {
    const data = fixture();
    data.awaitSourceSave.mockResolvedValueOnce({ status: "failed" });
    if (failure === "refuse") data.rollbackSource.mockResolvedValueOnce(false);
    if (failure === "throw") data.rollbackSource.mockRejectedValueOnce(new Error("rollback failed"));
    if (failure === "false-restore") data.rollbackSource.mockResolvedValueOnce(true);
    if (failure === "save-fail") data.awaitSourceSave.mockResolvedValueOnce({ status: "failed" });
    const result = await data.publisher.publish(data.request);
    expect(result.status).toBe("partial");
    expect(data.deleteTarget).not.toHaveBeenCalled();
    expect(data.files.has("Moved.canvas")).toBe(true);
  });

  it("rechecks the source during target cleanup and delegates a final coupled source/target CAS", async () => {
    const data = fixture();
    data.applySource.mockResolvedValueOnce({ status: "refused" });
    data.deleteTarget.mockImplementationOnce(async (path, expected, source) => {
      expect(expected.text).toBe(data.request.targetText);
      expect(expected.stat.identity).toBe(data.files.get(path)?.stat.identity);
      expect(source.path).toBe("Source.canvas");
      expect(source.snapshot).toBe("before");
      data.setCurrent("racing edit");
      return false;
    });
    expect(await data.publisher.publish(data.request)).toMatchObject({ status: "partial", target: "retained", diagnostics: ["apply-refused", "delete-refused"] });
    expect(data.files.has("Moved.canvas")).toBe(true);
  });

  it.each(["refuse", "throw", "lie", "recreate"])("preserves unknown targets on delete %s", async (failure) => {
    const data = fixture();
    data.applySource.mockResolvedValueOnce({ status: "refused" });
    if (failure === "refuse") data.deleteTarget.mockResolvedValueOnce(false);
    if (failure === "throw") data.deleteTarget.mockRejectedValueOnce(new Error("cannot delete"));
    if (failure === "lie") data.deleteTarget.mockResolvedValueOnce(true);
    if (failure === "recreate") data.deleteTarget.mockImplementationOnce(async (path) => { data.files.delete(path); data.put(path, "new file", true); return true; });
    expect((await data.publisher.publish(data.request)).status).toBe("partial");
    expect(data.files.has("Moved.canvas")).toBe(true);
  });

  it("leaves the successful target on a later Undo and on publisher disposal", async () => {
    const data = fixture();
    expect((await data.publisher.publish(data.request)).status).toBe("applied");
    const created = data.fingerprint("Moved.canvas");
    data.setCurrent("before");
    data.put("Source.canvas", "before");
    data.publisher.dispose();
    expect(data.fingerprint("Moved.canvas")).toEqual(created);
    expect(data.deleteTarget).not.toHaveBeenCalled();
  });

  it("detects a disk-only source edit while the final target check is pending", async () => {
    const data = fixture();
    let targetReads = 0;
    data.read.mockImplementation(async (path) => {
      if (path === "Moved.canvas" && ++targetReads === 2) data.put("Source.canvas", "external final edit");
      return data.fingerprint(path).text;
    });
    expect(await data.publisher.publish(data.request)).toMatchObject({ status: "partial", source: "changed", target: "retained" });
    expect(data.files.get("Source.canvas")?.text).toBe("external final edit");
    expect(data.rollbackSource).not.toHaveBeenCalled();
    expect(data.deleteTarget).not.toHaveBeenCalled();
  });
});

describe("transfer cancellation and disposal", () => {
  it("refuses pre-cancelled/disposed calls without I/O", async () => {
    const data = fixture();
    const controller = new AbortController();
    controller.abort();
    expect((await data.publisher.publish(data.request, controller.signal)).diagnostics).toEqual(["cancelled"]);
    data.publisher.dispose();
    expect((await data.publisher.publish(data.request)).diagnostics).toEqual(["disposed"]);
    expect(data.stat).not.toHaveBeenCalled();
  });

  it("refuses overlapping operations until an outstanding mutation settles", async () => {
    const data = fixture();
    const created = deferred<TransferCreateResult>();
    data.createTarget.mockImplementationOnce(() => created.promise);
    const publishing = data.publisher.publish(data.request);
    await settle();
    const statCalls = data.stat.mock.calls.length;
    expect((await data.publisher.publish(data.request)).diagnostics).toEqual(["busy"]);
    expect(data.stat.mock.calls.length).toBe(statCalls);
    created.resolve({ status: "created", stat: data.put("Moved.canvas", data.request.targetText).stat });
    expect((await publishing).status).toBe("applied");
    expect(data.createTarget).toHaveBeenCalledTimes(1);
  });

  it.each(["read", "availability", "create", "apply", "save", "rollback", "rollback-save", "delete"])("starts no later write after cancellation during %s", async (phase) => {
    const data = fixture();
    const controller = new AbortController();
    if (phase === "read") data.read.mockImplementationOnce(async () => { controller.abort(); return "before"; });
    if (phase === "availability") data.stat.mockImplementation(async (path) => { if (path === "Moved.canvas") controller.abort(); return data.files.get(path)?.stat; });
    if (phase === "create") data.createTarget.mockImplementationOnce(async (path, text) => { const stat = data.put(path, text).stat; controller.abort(); return { status: "created", stat }; });
    if (phase === "apply") data.applySource.mockImplementationOnce(async () => { data.setCurrent("after"); controller.abort(); return { status: "applied", snapshot: "after", rollbackSafe: true }; });
    if (phase === "save") data.awaitSourceSave.mockImplementationOnce(async () => { controller.abort(); return { status: "failed" }; });
    if (["rollback", "rollback-save", "delete"].includes(phase)) data.awaitSourceSave.mockResolvedValueOnce({ status: "failed" });
    if (phase === "rollback") data.rollbackSource.mockImplementationOnce(async () => { data.setCurrent("before"); controller.abort(); return true; });
    if (phase === "rollback-save") data.awaitSourceSave.mockImplementationOnce(async (path) => { const fingerprint = data.put(path, "before"); controller.abort(); return { status: "saved", fingerprint }; });
    if (phase === "delete") data.deleteTarget.mockImplementationOnce(async (path) => { data.files.delete(path); controller.abort(); return true; });
    const entered: boolean[] = [];
    Object.assign(data.adapter, {
      createTarget: (...args: Parameters<BoardTransferAdapter<string>["createTarget"]>) => { entered.push(args[2].aborted); return data.createTarget(...args); },
      applySource: (...args: Parameters<BoardTransferAdapter<string>["applySource"]>) => { entered.push(args[3].aborted); return data.applySource(...args); },
      awaitSourceSave: (...args: Parameters<BoardTransferAdapter<string>["awaitSourceSave"]>) => { entered.push(args[2].aborted); return data.awaitSourceSave(...args); },
      rollbackSource: (...args: Parameters<BoardTransferAdapter<string>["rollbackSource"]>) => { entered.push(args[2].aborted); return data.rollbackSource(...args); },
      deleteTarget: (...args: Parameters<BoardTransferAdapter<string>["deleteTarget"]>) => { entered.push(args[3].aborted); return data.deleteTarget(...args); },
    });
    const result = await data.publisher.publish(data.request, controller.signal);
    expect(entered.every((aborted) => !aborted)).toBe(true);
    expect(result.diagnostics).toContain("cancelled");
    expect(result.status).toBe(["read", "availability"].includes(phase) ? "refused" : "partial");
    for (const call of data.createTarget.mock.calls) expect(call[2].aborted).toBe(true);
    const started = data.operations.length;
    await settle();
    expect(data.operations).toHaveLength(started);
    if (["read", "availability", "create"].includes(phase)) expect(data.applySource).not.toHaveBeenCalled();
    if (["create", "apply", "save"].includes(phase)) expect(data.rollbackSource).not.toHaveBeenCalled();
    if (phase !== "delete") expect(data.deleteTarget).not.toHaveBeenCalled();
  });

  it("retains a late-created target after disposal and never applies or compensates afterwards", async () => {
    const data = fixture();
    const late = deferred<TransferCreateResult>();
    data.createTarget.mockImplementationOnce(() => late.promise);
    const publishing = data.publisher.publish(data.request);
    await settle();
    data.publisher.dispose();
    late.resolve({ status: "created", stat: data.put("Moved.canvas", data.request.targetText).stat });
    expect(await publishing).toMatchObject({ status: "partial", target: "created", diagnostics: ["disposed"] });
    expect(data.files.has("Moved.canvas")).toBe(true);
    expect(data.applySource).not.toHaveBeenCalled();
    expect(data.deleteTarget).not.toHaveBeenCalled();
    expect((await data.publisher.publish(data.request)).status).toBe("refused");
  });
});
