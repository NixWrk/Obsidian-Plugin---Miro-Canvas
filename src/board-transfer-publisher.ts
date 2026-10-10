/** Checked publication only; the parent supplies the plan, vault and native CAS. */
type Awaitable<T> = T | Promise<T>;

export const BOARD_TRANSFER_PUBLISH_LIMITS = { textCharacters: 16 * 1024 * 1024, pathCharacters: 4096 } as const;

export interface TransferFileStat {
  /** Stable file-instance identity, not its path; changes on deletion/recreation. */
  readonly identity: object | string;
  readonly mtime: number;
  readonly size: number;
  readonly revision?: string | number;
}

export interface TransferFileFingerprint {
  readonly stat: TransferFileStat;
  readonly text: string;
}

export type TransferCreateResult =
  | { readonly status: "created"; readonly stat: TransferFileStat }
  | { readonly status: "exists" }
  | { readonly status: "failed"; readonly created?: TransferFileStat };

export type TransferApplyResult<Snapshot> =
  | { readonly status: "applied"; readonly snapshot: Snapshot; readonly rollbackSafe: boolean }
  | { readonly status: "refused" }
  | { readonly status: "failed"; readonly snapshot?: Snapshot; readonly rollbackSafe?: boolean };

export type TransferSaveResult =
  | { readonly status: "saved"; readonly fingerprint: TransferFileFingerprint }
  | { readonly status: "failed"; readonly fingerprint?: TransferFileFingerprint };

export interface TransferSourceGuard<Snapshot> {
  readonly path: string;
  readonly snapshot: Snapshot;
  readonly fingerprint: TransferFileFingerprint;
}

export interface BoardTransferAdapter<Snapshot> {
  readonly stat: (path: string, signal: AbortSignal) => Awaitable<TransferFileStat | undefined>;
  readonly read: (path: string, signal: AbortSignal) => Promise<string>;
  /** Detached snapshot scoped to the source view/file and its native history revision. */
  readonly snapshotSource: (path: string, signal: AbortSignal) => Awaitable<Snapshot>;
  readonly sameSnapshot: (left: Snapshot, right: Snapshot) => boolean;
  /** Exclusive exact-path create. Failed post-create operations must retain an identity receipt. */
  readonly createTarget: (path: string, text: string, signal: AbortSignal) => Promise<TransferCreateResult>;
  /** One native history/CAS action, with an owned verified after-snapshot receipt. */
  readonly applySource: (path: string, next: Snapshot, expected: TransferSourceGuard<Snapshot>, signal: AbortSignal) => Awaitable<TransferApplyResult<Snapshot>>;
  /** Durable save of this snapshot, not requestSave scheduling; receipt identifies the written version. */
  readonly awaitSourceSave: (path: string, expected: Snapshot, signal: AbortSignal) => Promise<TransferSaveResult>;
  /** Recheck the owned history step, source snapshot and disk fingerprint atomically before restoring. */
  readonly rollbackSource: (before: Snapshot, expected: TransferSourceGuard<Snapshot>, signal: AbortSignal) => Awaitable<boolean>;
  /** Conditional deletion: recheck exact target identity/version/text AND the source guard. */
  readonly deleteTarget: (path: string, expected: TransferFileFingerprint, source: TransferSourceGuard<Snapshot>, signal: AbortSignal) => Promise<boolean>;
}

export interface BoardTransferPublication<Snapshot> {
  readonly sourcePath: string;
  /** Already chosen by the planner. Collisions refuse; the publisher never rewrites this path. */
  readonly targetPath: string;
  readonly sourceFingerprint: TransferFileFingerprint;
  readonly sourceBefore: Snapshot;
  readonly sourceAfter: Snapshot;
  readonly targetText: string;
}

export type TransferPublishCode = "invalid-request" | "busy" | "cancelled" | "disposed" | "source-changed" | "source-check-failed"
  | "target-exists" | "target-changed" | "target-check-failed" | "create-failed" | "create-unverified" | "apply-refused"
  | "apply-failed" | "apply-unverified" | "save-failed" | "save-unverified" | "rollback-unsafe" | "rollback-refused"
  | "rollback-failed" | "rollback-unverified" | "rollback-save-failed" | "delete-refused" | "delete-failed" | "delete-unverified";

export interface BoardTransferPublishResult {
  readonly status: "applied" | "refused" | "recovered" | "partial";
  readonly sourcePath: string;
  readonly targetPath: string;
  /** Last verified source runtime state; unknown receipts never imply restoration. */
  readonly source: "unchanged" | "applied" | "restored" | "changed" | "unknown";
  readonly target: "absent" | "existing" | "created" | "retained" | "changed" | "unknown";
  readonly diagnostics: readonly TransferPublishCode[];
}

class PublicationFailure extends Error {
  public constructor(public readonly code: TransferPublishCode) { super(code); }
}

function validPath(path: string): boolean {
  if (path.length === 0 || path.length > BOARD_TRANSFER_PUBLISH_LIMITS.pathCharacters || !path.endsWith(".canvas")
    || path.includes("\\") || path.includes(":")) return false;
  for (const character of path) {
    const code = character.charCodeAt(0);
    if (code < 32 || code === 127) return false;
  }
  return path.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

function validStat(stat: TransferFileStat): boolean {
  return (typeof stat.identity === "string" && stat.identity !== "" || typeof stat.identity === "object" && stat.identity !== null)
    && Number.isFinite(stat.mtime) && Number.isFinite(stat.size) && stat.size >= 0
    && stat.size <= BOARD_TRANSFER_PUBLISH_LIMITS.textCharacters;
}

function validFingerprint(fingerprint: TransferFileFingerprint): boolean {
  return validStat(fingerprint.stat) && typeof fingerprint.text === "string"
    && fingerprint.text.length <= BOARD_TRANSFER_PUBLISH_LIMITS.textCharacters;
}

function sameStat(left: TransferFileStat, right: TransferFileStat | undefined): boolean {
  return right !== undefined && left.identity === right.identity && left.mtime === right.mtime
    && left.size === right.size && left.revision === right.revision;
}

/** No subscriptions or Undo ownership; dispose prevents every subsequent write. */
export class BoardTransferPublisher<Snapshot> {
  private active: AbortController | undefined;
  private disposed = false;

  public constructor(private readonly adapter: BoardTransferAdapter<Snapshot>) {}

  public dispose(): void {
    this.disposed = true;
    this.active?.abort();
  }

  public async publish(request: BoardTransferPublication<Snapshot>, signal?: AbortSignal): Promise<BoardTransferPublishResult> {
    const diagnostics: TransferPublishCode[] = [];
    let source: BoardTransferPublishResult["source"] = "unknown";
    let target: BoardTransferPublishResult["target"] = "unknown";
    const result = (status: BoardTransferPublishResult["status"], code?: TransferPublishCode): BoardTransferPublishResult => {
      if (code !== undefined && !diagnostics.includes(code)) diagnostics.push(code);
      return { status, sourcePath: request.sourcePath, targetPath: request.targetPath, source, target, diagnostics: [...diagnostics] };
    };
    if (this.disposed) return result("refused", "disposed");
    if (this.active !== undefined) return result("refused", "busy");
    if (signal?.aborted === true) return result("refused", "cancelled");
    if (!validPath(request.sourcePath) || !validPath(request.targetPath)
      || request.sourcePath.normalize("NFC").toLowerCase() === request.targetPath.normalize("NFC").toLowerCase()
      || !validFingerprint(request.sourceFingerprint) || typeof request.targetText !== "string" || request.targetText.length === 0
      || request.targetText.length > BOARD_TRANSFER_PUBLISH_LIMITS.textCharacters) return result("refused", "invalid-request");
    request = { ...request, sourceFingerprint: { stat: { ...request.sourceFingerprint.stat }, text: request.sourceFingerprint.text } };
    const controller = new AbortController();
    const cancel = (): void => controller.abort();
    signal?.addEventListener("abort", cancel, { once: true });
    this.active = controller;
    const live = controller.signal;
    let creationAttempted = false;
    let applyAttempted = false;
    let created: TransferFileFingerprint | undefined;
    let applied: TransferApplyResult<Snapshot> | undefined;
    let saved: TransferSaveResult | undefined;
    let phase: TransferPublishCode = "source-check-failed";
    const gate = (): void => {
      if (this.disposed) throw new PublicationFailure("disposed");
      if (live.aborted) throw new PublicationFailure("cancelled");
    };
    const checkFile = async (path: string, fingerprint: TransferFileFingerprint): Promise<boolean> => {
      gate();
      const before = await this.adapter.stat(path, live);
      gate();
      if (!sameStat(fingerprint.stat, before)) return false;
      const text = await this.adapter.read(path, live);
      gate();
      if (text.length > BOARD_TRANSFER_PUBLISH_LIMITS.textCharacters || text !== fingerprint.text) return false;
      const after = await this.adapter.stat(path, live);
      gate();
      return sameStat(fingerprint.stat, after);
    };
    const checkSource = async (snapshot: Snapshot, fingerprint: TransferFileFingerprint): Promise<boolean> => {
      if (!await checkFile(request.sourcePath, fingerprint)) return false;
      const current = await this.adapter.snapshotSource(request.sourcePath, live);
      gate();
      return this.adapter.sameSnapshot(current, snapshot);
    };
    const sourceGuard = (snapshot: Snapshot, fingerprint: TransferFileFingerprint): TransferSourceGuard<Snapshot> => ({
      path: request.sourcePath, snapshot, fingerprint,
    });
    const ownedSourceFingerprint = (fingerprint: TransferFileFingerprint | undefined): fingerprint is TransferFileFingerprint => {
      return fingerprint !== undefined && validFingerprint(fingerprint) && fingerprint.stat.identity === request.sourceFingerprint.stat.identity;
    };
    const compensate = async (): Promise<BoardTransferPublishResult> => {
      gate();
      if (created === undefined) return result(creationAttempted ? "partial" : "refused");
      target = "retained";
      let restoredFingerprint = request.sourceFingerprint;
      if (applyAttempted && applied?.status !== "refused") {
        if (applied === undefined || applied.status === "failed" && applied.snapshot === undefined || applied.rollbackSafe !== true) {
          source = "unknown";
          return result("partial", "rollback-unsafe");
        }
        const after = applied.snapshot as Snapshot;
        const disk = ownedSourceFingerprint(saved?.fingerprint) ? saved.fingerprint : request.sourceFingerprint;
        phase = "source-check-failed";
        if (!await checkSource(after, disk)) {
          source = "changed";
          return result("partial", "source-changed");
        }
        phase = "rollback-failed";
        gate();
        const rolledBack = await this.adapter.rollbackSource(request.sourceBefore, sourceGuard(after, disk), live);
        if (rolledBack) source = "restored";
        gate();
        if (!rolledBack) return result("partial", "rollback-refused");
        const restored = await this.adapter.snapshotSource(request.sourcePath, live);
        gate();
        if (!this.adapter.sameSnapshot(restored, request.sourceBefore)) {
          source = "changed";
          return result("partial", "rollback-unverified");
        }
        phase = "rollback-save-failed";
        gate();
        const rollbackSave = await this.adapter.awaitSourceSave(request.sourcePath, request.sourceBefore, live);
        gate();
        if (rollbackSave.status !== "saved" || !ownedSourceFingerprint(rollbackSave.fingerprint)) return result("partial", "rollback-save-failed");
        restoredFingerprint = rollbackSave.fingerprint;
      }
      phase = "source-check-failed";
      if (!await checkSource(request.sourceBefore, restoredFingerprint)) {
        source = "changed";
        return result("partial", "source-changed");
      }
      if (source !== "restored") source = "unchanged";
      phase = "target-check-failed";
      gate();
      const targetStat = await this.adapter.stat(request.targetPath, live);
      gate();
      if (targetStat === undefined) {
        target = "absent";
        return result("recovered");
      }
      if (!await checkFile(request.targetPath, created)) {
        target = "changed";
        return result("partial", "target-changed");
      }
      phase = "source-check-failed";
      if (!await checkSource(request.sourceBefore, restoredFingerprint)) {
        source = "changed";
        return result("partial", "source-changed");
      }
      phase = "delete-failed";
      gate();
      const deleted = await this.adapter.deleteTarget(request.targetPath, created, sourceGuard(request.sourceBefore, restoredFingerprint), live);
      if (deleted) target = "absent";
      gate();
      if (!deleted) return result("partial", "delete-refused");
      phase = "target-check-failed";
      const remaining = await this.adapter.stat(request.targetPath, live);
      gate();
      if (remaining !== undefined) {
        target = "changed";
        return result("partial", "delete-unverified");
      }
      return result("recovered");
    };
    try {
      gate();
      if (!await checkSource(request.sourceBefore, request.sourceFingerprint)) {
        source = "changed";
        return result("refused", "source-changed");
      }
      source = "unchanged";
      phase = "target-check-failed";
      gate();
      if (await this.adapter.stat(request.targetPath, live) !== undefined) {
        target = "existing";
        gate();
        return result("refused", "target-exists");
      }
      target = "absent";
      phase = "source-check-failed";
      if (!await checkSource(request.sourceBefore, request.sourceFingerprint)) {
        source = "changed";
        return result("refused", "source-changed");
      }
      phase = "create-failed";
      gate();
      creationAttempted = true;
      const creation = await this.adapter.createTarget(request.targetPath, request.targetText, live);
      if (creation.status === "created" || creation.status === "failed" && creation.created !== undefined) {
        const stat = creation.status === "created" ? creation.stat : creation.created;
        if (stat !== undefined && validStat(stat)) {
          created = { stat: { ...stat }, text: request.targetText };
          target = "created";
        } else target = "unknown";
      } else if (creation.status === "exists") target = "existing";
      gate();
      if (creation.status === "exists") return result("refused", "target-exists");
      if (creation.status === "failed") throw new PublicationFailure("create-failed");
      if (created === undefined) throw new PublicationFailure("create-unverified");
      phase = "target-check-failed";
      if (!await checkFile(request.targetPath, created)) {
        target = "changed";
        throw new PublicationFailure("target-changed");
      }
      phase = "source-check-failed";
      if (!await checkSource(request.sourceBefore, request.sourceFingerprint)) {
        source = "changed";
        throw new PublicationFailure("source-changed");
      }
      phase = "apply-failed";
      gate();
      applyAttempted = true;
      applied = await this.adapter.applySource(request.sourcePath, request.sourceAfter, sourceGuard(request.sourceBefore, request.sourceFingerprint), live);
      if (applied.status === "applied") source = "applied";
      else if (applied.status === "failed") source = "unknown";
      gate();
      if (applied.status === "refused") throw new PublicationFailure("apply-refused");
      if (applied.status === "failed") throw new PublicationFailure("apply-failed");
      if (!this.adapter.sameSnapshot(applied.snapshot, request.sourceAfter)) throw new PublicationFailure("apply-unverified");
      phase = "source-check-failed";
      const after = await this.adapter.snapshotSource(request.sourcePath, live);
      gate();
      if (!this.adapter.sameSnapshot(after, applied.snapshot)) {
        source = "changed";
        throw new PublicationFailure("source-changed");
      }
      phase = "save-failed";
      gate();
      saved = await this.adapter.awaitSourceSave(request.sourcePath, applied.snapshot, live);
      gate();
      if (saved.status !== "saved") throw new PublicationFailure("save-failed");
      if (!ownedSourceFingerprint(saved.fingerprint) || !await checkSource(applied.snapshot, saved.fingerprint)) throw new PublicationFailure("save-unverified");
      phase = "target-check-failed";
      if (!await checkFile(request.targetPath, created)) {
        target = "changed";
        throw new PublicationFailure("target-changed");
      }
      // Recheck disk and runtime after target reads; later Undo owns no target cleanup.
      phase = "source-check-failed";
      if (!await checkSource(applied.snapshot, saved.fingerprint)) {
        source = "changed";
        throw new PublicationFailure("source-changed");
      }
      return result("applied");
    } catch (error) {
      const code = error instanceof PublicationFailure ? error.code : phase;
      if (!diagnostics.includes(code)) diagnostics.push(code);
      if (code === "cancelled" || code === "disposed") {
        if (creationAttempted && created === undefined && target !== "existing") target = "unknown";
        return result(creationAttempted || applyAttempted ? "partial" : "refused");
      }
      if (creationAttempted && created === undefined && target !== "existing") target = "unknown";
      try {
        return await compensate();
      } catch (recoveryError) {
        const recoveryCode = recoveryError instanceof PublicationFailure ? recoveryError.code : phase;
        return result(created !== undefined || creationAttempted || applyAttempted ? "partial" : "refused", recoveryCode);
      }
    } finally {
      signal?.removeEventListener("abort", cancel);
      if (this.active === controller) this.active = undefined;
    }
  }
}
