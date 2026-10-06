import type { TFile, App } from "obsidian";
import type { DocumentHost, LocalDocument } from "./document-viewer";

function get(value: unknown, key: string): unknown {
  try { return value && typeof value === "object" ? Reflect.get(value, key) : undefined; }
  catch { return undefined; }
}

interface PdfTimerHost {
  setTimeout(callback: () => void, delay: number): number | ReturnType<typeof setTimeout>;
  clearTimeout(timer: number | ReturnType<typeof setTimeout>): void;
}

function pdfTimerHost(view: unknown): PdfTimerHost {
  const ownerWindow = get(get(get(view, "containerEl"), "ownerDocument"), "defaultView");
  if (typeof get(ownerWindow, "setTimeout") === "function" && typeof get(ownerWindow, "clearTimeout") === "function") {
    return ownerWindow as PdfTimerHost;
  }
  // The type-only bridge also runs in Node tests, without a DOM or Obsidian.
  return typeof window === "undefined" ? { setTimeout, clearTimeout } : window;
}

interface PdfFitResult {
  readonly fitted: boolean;
  readonly ownerClosed: boolean;
}

/** Only the native PDF fit bridge uses private fields, and fails to native UI. */
export function applyNativePdfFit(view: unknown, document: LocalDocument): Promise<boolean> {
  return fitReadyNativePdf(view, document, () => true).then(result => result.fitted);
}

async function fitReadyNativePdf(view: unknown, document: LocalDocument, isCurrent: () => boolean): Promise<PdfFitResult> {
  if (document.kind !== "pdf") return { fitted: true, ownerClosed: false };
  let deadlineTimer: ReturnType<PdfTimerHost["setTimeout"]> | undefined;
  let pollTimer: ReturnType<PdfTimerHost["setTimeout"]> | undefined;
  let finishPoll: (() => void) | undefined;
  let stopped = false;
  let fitted = false;
  let timerHost: PdfTimerHost | undefined;
  let ownerClosed = false;
  let removeCloseListeners: (() => void) | undefined;
  try {
    const ready = get(view, "viewer");
    if (typeof get(ready, "then") !== "function") return { fitted: false, ownerClosed: false };
    timerHost = pdfTimerHost(view);
    const host = timerHost;
    let resolveClosed: (() => void) | undefined;
    const closed = new Promise<undefined>((resolve) => { resolveClosed = () => resolve(undefined); });
    const cancelForClose = (): void => {
      ownerClosed = true;
      stopped = true;
      resolveClosed?.();
    };
    const stoppedOrClosed = (): boolean => {
      if (get(host, "closed") === true) cancelForClose();
      return stopped;
    };
    if (!stoppedOrClosed()) {
      const addListener = get(host, "addEventListener");
      const removeListener = get(host, "removeEventListener");
      if (typeof addListener === "function" && typeof removeListener === "function") {
        const registered: string[] = [];
        removeCloseListeners = () => {
          for (const event of registered) {
            try { Reflect.apply(removeListener, host, [event, cancelForClose, false]); }
            catch { fitted = false; }
          }
        };
        for (const event of ["pagehide", "unload"]) {
          if (stoppedOrClosed()) break;
          registered.push(event);
          Reflect.apply(addListener, host, [event, cancelForClose, false]);
        }
      }
    }
    const deadline = new Promise<undefined>((resolve) => {
      if (!stoppedOrClosed()) deadlineTimer = host.setTimeout(() => { stopped = true; resolve(undefined); }, 2000);
    });
    const pause = (): Promise<void> => new Promise((resolve) => {
      if (stoppedOrClosed()) { resolve(); return; }
      finishPoll = resolve;
      pollTimer = host.setTimeout(() => {
        pollTimer = undefined;
        finishPoll = undefined;
        resolve();
      }, 25);
    });
    const fit = async (): Promise<boolean> => {
      const renderer = await Promise.race([Promise.resolve(ready), deadline, closed]);
      if (stoppedOrClosed() || !isCurrent()) return false;
      const application = get(renderer, "pdfViewer");
      const pdf = get(application, "pdfViewer");
      if (!pdf || typeof pdf !== "object") return false;
      const initialized = get(application, "initializedPromise");
      if (typeof get(initialized, "then") === "function") {
        await Promise.race([Promise.resolve(initialized), deadline, closed]);
      }
      if (stoppedOrClosed() || !isCurrent()) return false;
      while (!stoppedOrClosed() && isCurrent()) {
        if (get(renderer, "pdfViewer") !== application || get(application, "pdfViewer") !== pdf) return false;
        const pdfDocument = get(pdf, "pdfDocument");
        const firstPage = get(pdf, "firstPagePromise");
        const pages = get(pdf, "pagesPromise");
        if (pdfDocument && typeof pdfDocument === "object"
          && typeof get(firstPage, "then") === "function" && typeof get(pages, "then") === "function") {
          await Promise.race([Promise.all([Promise.resolve(firstPage), Promise.resolve(pages)]), deadline, closed]);
          if (stoppedOrClosed() || !isCurrent()) return false;
          if (get(renderer, "pdfViewer") !== application || get(application, "pdfViewer") !== pdf
            || get(pdf, "pdfDocument") !== pdfDocument) return false;
          if (get(application, "isInitialViewSet") !== false && typeof get(pdf, "currentScaleValue") === "string") {
            const scale = document.fit === "width" ? "page-width" : "page-fit";
            return !stoppedOrClosed() && isCurrent()
              && Reflect.set(pdf, "currentScaleValue", scale) && get(pdf, "currentScaleValue") === scale;
          }
        }
        await pause();
      }
      return false;
    };
    fitted = await Promise.race([fit(), deadline, closed]) ?? false;
  } catch { fitted = false; }
  finally {
    stopped = true;
    if (get(timerHost, "closed") === true) ownerClosed = true;
    removeCloseListeners?.();
    try { if (deadlineTimer !== undefined) timerHost?.clearTimeout(deadlineTimer); }
    catch { fitted = false; }
    try { if (pollTimer !== undefined) timerHost?.clearTimeout(pollTimer); }
    catch { fitted = false; }
    finishPoll?.();
  }
  return { fitted: fitted && !ownerClosed, ownerClosed };
}

export function createObsidianDocumentHost(
  app: App,
  diagnostic: (message: string) => void,
  isFile: (value: unknown) => value is TFile,
): DocumentHost {
  let openSequence = 0;
  return {
    hasFile: (path) => isFile(app.vault.getAbstractFileByPath(path)),
    async openFile(document) {
      const sequence = ++openSequence;
      const file = app.vault.getAbstractFileByPath(document.path);
      if (!isFile(file)) throw new Error("Local file is unavailable.");
      // Reuse a native document tab, never replace the current Canvas leaf.
      const existing = typeof app.workspace.getLeavesOfType === "function"
        ? app.workspace.getLeavesOfType(document.kind).find((candidate) => get(candidate.view, "file") === file)
        : undefined;
      const leaf = existing ?? app.workspace.getLeaf("tab");
      await leaf.openFile(file, { active: true, ...(document.subpath
        ? { eState: { subpath: document.subpath } } : {}) });
      if (sequence !== openSequence) return;
      const view = leaf.view;
      const isCurrent = (): boolean => sequence === openSequence && leaf.view === view
        && get(view, "file") === file;
      const fitted = await fitReadyNativePdf(view, document, isCurrent);
      if (fitted.ownerClosed || !isCurrent()) return;
      if (!fitted.fitted) {
        diagnostic("PDF opened. Automatic fit is unavailable in this Obsidian version; use the native viewer controls.");
      }
    },
  };
}
