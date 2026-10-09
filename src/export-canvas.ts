import { createHtmlElement } from "./dom-elements";
import { words } from "./i18n";
import { cloneCanvasJson } from "./canvas-json";
import type { MiroCanvasSettings } from "./settings";

/** Raster scale must not hide card text; freeze the export's style/color choices. */
export function exportCanvasSettings(settings: MiroCanvasSettings): MiroCanvasSettings {
  return {
    ...settings,
    contentTextThreshold: 0,
    contentFileThreshold: 0,
    contentLinkThreshold: 0,
    contentPluginThreshold: 0,
    customStyles: cloneCanvasJson(settings.customStyles),
    allowedCanvasSnippets: [...settings.allowedCanvasSnippets],
    permanentPalette: settings.permanentPalette === undefined ? undefined : cloneCanvasJson(settings.permanentPalette),
  };
}

interface BackgroundCanvas {
  readonly view: unknown;
  readonly canvas: unknown;
  dispose(): void;
}

function property(value: unknown, name: string): unknown {
  if (typeof value !== "object" || value === null) return undefined;
  try {
    return Reflect.get(value, name);
  } catch {
    return undefined;
  }
}

function call(value: unknown, name: string, ...args: unknown[]): unknown {
  const method = property(value, name);
  if (typeof method !== "function") throw new Error(words().export.unavailable);
  return Reflect.apply(method, value, args);
}

interface ExportFrameState {
  readonly root: HTMLElement;
  readonly settlers: Set<() => void>;
  error?: Error;
}
const exportFrames = new WeakMap<object, ExportFrameState>();

/** Surface native timer-frame failures before cloning an independent board. */
export function checkExportCanvasFrame(canvas: unknown): void {
  if (typeof canvas !== "object" || canvas === null) return;
  const error = exportFrames.get(canvas)?.error;
  if (error !== undefined) throw error;
}

function own(value: unknown, name: string): unknown {
  if (typeof value !== "object" || value === null) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, name);
  return descriptor !== undefined && "value" in descriptor ? descriptor.value : undefined;
}

type NativeMethod = (...args: unknown[]) => unknown;
function nativeMethod(value: unknown, name: string): NativeMethod | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  let owner: object | null = value;
  for (let depth = 0; owner !== null && depth < 8; depth += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(owner, name);
    if (descriptor !== undefined) return "value" in descriptor && typeof descriptor.value === "function" ? descriptor.value as NativeMethod : undefined;
    owner = Object.getPrototypeOf(owner) as object | null;
  }
  return undefined;
}

interface MarkdownTarget {
  readonly renderer: object;
  readonly preview: HTMLElement;
  readonly onRender: NativeMethod;
  readonly onResize: NativeMethod;
}
interface MarkdownReading {
  readonly ready: boolean;
  readonly parsing: boolean;
  readonly waitingAsync: boolean;
  readonly queued: object | undefined;
}

function markdownReading(renderer: object): MarkdownReading {
  const sections = own(renderer, "sections");
  const asynchronous = own(renderer, "asyncSections");
  const rendered = own(renderer, "rendered");
  const parsing = own(renderer, "parsing");
  const text = own(renderer, "text");
  const lastText = own(renderer, "lastText");
  const queued = own(renderer, "queued");
  const queueDescriptor = Object.getOwnPropertyDescriptor(renderer, "queued");
  if (!Array.isArray(sections) || !Array.isArray(asynchronous) || (rendered !== null && !Array.isArray(rendered))
    || typeof parsing !== "boolean" || typeof text !== "string" || (lastText !== null && typeof lastText !== "string")
    || sections.some(section => typeof own(section, "rendered") !== "boolean")
    || queueDescriptor === undefined || !("value" in queueDescriptor)
    || (queued !== null && queued !== undefined && (typeof queued !== "object"
      || typeof own(queued, "high") !== "boolean" || nativeMethod(queued, "cancel") === undefined))) throw new Error(words().export.unavailable);
  const unrendered = sections.some(section => own(section, "rendered") !== true);
  return {
    ready: lastText === text && !parsing && asynchronous.length === 0 && !unrendered && rendered === null && queued == null,
    parsing,
    waitingAsync: asynchronous.length > 0 && !unrendered && lastText === text,
    queued: queued == null ? undefined : queued,
  };
}

function cancelMarkdownQueue(renderer: object, cancelled: Set<object>): void {
  const queued = markdownReading(renderer).queued;
  if (queued === undefined || cancelled.has(queued)) return;
  Reflect.apply(nativeMethod(queued, "cancel")!, queued, []);
  cancelled.add(queued);
}

/** Advance only verified native Markdown children; their queue uses global activeWindow RAF. */
export async function settleExportMarkdown(canvas: unknown, signal: AbortSignal): Promise<void> {
  if (typeof canvas !== "object" || canvas === null) return;
  const state = exportFrames.get(canvas);
  if (state === undefined) return;
  const root = state.root;
  const view = root.ownerDocument.defaultView;
  if (view === null || root.getAttribute("data-miro-canvas-export-renderer") !== "true") throw new Error(words().export.unavailable);
  if (signal.aborted) throw new Error(words().export.exportStopped);
  const nodes = own(canvas, "nodes");
  if (!(nodes instanceof Map)) throw new Error(words().export.unavailable);
  const targets = new Set<MarkdownTarget>();
  const deadline = view.performance.now() + 5000;
  for (const node of nodes.values() as Iterable<unknown>) {
    if (view.performance.now() >= deadline) throw new Error(words().export.pageNotDrawn);
    const child = own(node, "child");
    const expectedText = own(node, "text");
    const content = own(node, "contentEl");
    if (content instanceof view.HTMLElement && root.contains(content) && content.closest(".miro-canvas-group-hidden") !== null) continue;
    const renderer = own(own(child, "previewMode"), "renderer") ?? own(child, "renderer");
    if (renderer === undefined && (typeof expectedText !== "string" || expectedText === "")) continue;
    const preview = own(renderer, "previewEl");
    const childContainer = own(child, "containerEl");
    const onRender = nativeMethod(renderer, "onRender");
    const onResize = nativeMethod(renderer, "onResize");
    if (typeof renderer !== "object" || renderer === null || own(node, "canvas") !== canvas
      || !(content instanceof view.HTMLElement) || !root.contains(content)
      || !(childContainer instanceof view.HTMLElement) || !content.contains(childContainer)
      || !(preview instanceof view.HTMLElement) || !childContainer.contains(preview)
      || onRender === undefined || onResize === undefined
      || (typeof expectedText === "string" && expectedText !== own(renderer, "text"))) throw new Error(words().export.unavailable);
    markdownReading(renderer);
    targets.add({ renderer, preview, onRender, onResize });
  }
  if (targets.size === 0) return;
  await new Promise<void>((resolve, reject) => {
    let poll: number | undefined;
    let timeout: number | undefined;
    let finished = false;
    let rounds = 0;
    const cancelled = new Set<object>();
    const finish = (error?: Error): void => {
      if (finished) return;
      finished = true;
      if (poll !== undefined) view.clearTimeout(poll);
      if (timeout !== undefined) view.clearTimeout(timeout);
      signal.removeEventListener("abort", abort);
      state.settlers.delete(abort);
      if (error !== undefined) {
        for (const target of targets) {
          try { cancelMarkdownQueue(target.renderer, cancelled); } catch { /* Preserve the render/Stop error. */ }
        }
        reject(error);
      } else resolve();
    };
    const abort = (): void => finish(new Error(words().export.exportStopped));
    const pending = new Set(targets);
    const resized = new Set<MarkdownTarget>();
    const advance = (): void => {
      if (finished) return;
      try {
        if (exportFrames.get(canvas) !== state || signal.aborted) { abort(); return; }
        checkExportCanvasFrame(canvas);
        if (++rounds > 320 || view.performance.now() >= deadline) throw new Error(words().export.pageNotDrawn);
        const batch: MarkdownTarget[] = [];
        for (const target of pending) {
          batch.push(target);
          if (batch.length === 32) break;
        }
        const visited: MarkdownTarget[] = [];
        const roundEnd = view.performance.now() + 12;
        for (const target of batch) {
          if (visited.length > 0 && view.performance.now() >= roundEnd) break;
          if (view.performance.now() >= deadline) throw new Error(words().export.pageNotDrawn);
          visited.push(target);
          if (!root.contains(target.preview)) throw new Error(words().export.unavailable);
          let reading = markdownReading(target.renderer);
          cancelMarkdownQueue(target.renderer, cancelled);
          if (target.preview.offsetParent === null || target.preview.offsetWidth <= 0) continue;
          if (!resized.has(target)) {
            resized.add(target);
            if (own(target.renderer, "renderedWidth") !== target.preview.offsetWidth
              || own(target.renderer, "viewportHeight") !== target.preview.clientHeight) {
              Reflect.apply(target.onResize, target.renderer, []);
              reading = markdownReading(target.renderer);
            }
          }
          if (!reading.ready && !reading.parsing && !reading.waitingAsync) {
            cancelMarkdownQueue(target.renderer, cancelled);
            Reflect.apply(target.onRender, target.renderer, []);
            cancelMarkdownQueue(target.renderer, cancelled);
          }
          if (markdownReading(target.renderer).ready) pending.delete(target);
        }
        // Async children yield their place so a slow first card cannot starve later cards.
        for (const target of visited) if (pending.delete(target)) pending.add(target);
        if (pending.size === 0) { finish(); return; }
        poll = view.setTimeout(advance, 16);
      } catch (error) { finish(error instanceof Error ? error : new Error(words().export.pageNotDrawn)); }
    };
    signal.addEventListener("abort", abort, { once: true });
    state.settlers.add(abort);
    timeout = view.setTimeout(() => finish(new Error(words().export.pageNotDrawn)), Math.max(0, deadline - view.performance.now()));
    advance();
  });
}

/** Native requestFrame/cancelFrame use canvasEl.win; never replace window RAF. */
function installExportFrames(canvas: object, element: HTMLElement, root: HTMLElement, view: Window): () => void {
  const originalHost = property(element, "win");
  const descriptor = Object.getOwnPropertyDescriptor(element, "win");
  if (originalHost !== view || descriptor?.configurable === false
    || typeof property(originalHost, "requestAnimationFrame") !== "function"
    || typeof property(originalHost, "cancelAnimationFrame") !== "function"
    || typeof property(canvas, "requestFrame") !== "function"
    || typeof property(canvas, "cancelFrame") !== "function") throw new Error(words().export.unavailable);
  const state: ExportFrameState = { root, settlers: new Set() };
  const timers = new Map<number, number>();
  type HostMethod = (...args: unknown[]) => unknown;
  const bound = new Map<HostMethod, HostMethod>();
  let active = true;
  let nextFrame = 0;
  const cancel = (id: number): void => {
    const timer = timers.get(id);
    if (timer === undefined) return;
    timers.delete(id);
    view.clearTimeout(timer);
  };
  const request = (callback: FrameRequestCallback): number => {
    if (!active || state.error !== undefined) return 0;
    const id = ++nextFrame;
    timers.set(id, view.setTimeout(() => {
      timers.delete(id);
      if (!active) return;
      try { callback(view.performance.now()); }
      catch (error) {
        state.error = error instanceof Error ? error : new Error(words().export.pageNotDrawn);
        for (const pending of [...timers.keys()]) cancel(pending);
      }
    }, 16));
    return id;
  };
  const host = new Proxy(view, {
    get(target, key) {
      if (key === "requestAnimationFrame") return request;
      if (key === "cancelAnimationFrame") return cancel;
      const value: unknown = Reflect.get(target, key, target);
      // Window accessors/methods require their original receiver; constructors keep identity.
      if (typeof value !== "function" || Object.prototype.hasOwnProperty.call(value, "prototype")) return value;
      const original = value as HostMethod;
      let method = bound.get(original);
      if (method === undefined) {
        method = original.bind(target);
        bound.set(original, method);
      }
      return method;
    },
    set: () => false,
    defineProperty: () => false,
    deleteProperty: () => false,
  });
  if (!Reflect.defineProperty(element, "win", { value: host, configurable: true, enumerable: descriptor?.enumerable ?? false })) {
    throw new Error(words().export.unavailable);
  }
  const restore = (): void => {
    if (!active) return;
    active = false;
    for (const abort of [...state.settlers]) abort();
    try { call(canvas, "cancelFrame"); }
    finally {
      for (const pending of [...timers.keys()]) cancel(pending);
      exportFrames.delete(canvas);
      if (descriptor === undefined) Reflect.deleteProperty(element, "win");
      else Reflect.defineProperty(element, "win", descriptor);
    }
  };
  try { call(canvas, "cancelFrame"); }
  catch (error) {
    try { restore(); } catch { /* Preserve the initial native cancellation failure. */ }
    throw error;
  }
  exportFrames.set(canvas, state);
  return restore;
}

/** An unregistered native view: never open a workspace leaf or bind global keys. */
export function createExportCanvas(sourceView: unknown, snapshot: unknown, document: Document, registerScope?: (scope: HTMLElement) => (() => void)): BackgroundCanvas {
  const sourceLeaf = property(sourceView, "leaf");
  const sourceCanvas = property(sourceView, "canvas");
  const app = property(sourceView, "app");
  const Leaf = property(sourceLeaf, "constructor");
  const registry = property(app, "viewRegistry");
  const factory = property(property(registry, "viewByType"), "canvas");
  if (typeof Leaf !== "function" || typeof factory !== "function" || document.defaultView === null) {
    throw new Error(words().export.unavailable);
  }
  const nativeData = cloneCanvasJson(snapshot);
  const WindowElement = document.defaultView.HTMLElement;
  const sourceElements = [property(sourceLeaf, "containerEl"), property(sourceView, "containerEl"),
    property(sourceView, "contentEl"), property(sourceCanvas, "wrapperEl"), property(sourceCanvas, "canvasEl")]
    .filter((element): element is HTMLElement => element instanceof WindowElement);
  const independentElement = (element: unknown): element is HTMLElement => element instanceof WindowElement
    && sourceElements.every(source => element !== source && !element.contains(source) && !source.contains(element));
  const host = createHtmlElement(document, "div");
  host.className = "miro-canvas-export-renderer";
  host.setAttribute("inert", "");
  host.setAttribute("aria-hidden", "true");
  let leaf: unknown;
  let view: unknown;
  let canvas: unknown;
  let restoreFrames: (() => void) | undefined;
  let releaseScope: (() => void) | undefined;
  let disposed = false;
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    try { restoreFrames?.(); } catch { /* Continue native disposal after a failed frame cancel. */ }
    for (const [owner, method] of [
      [canvas, "unload"],
      [view, "unload"],
      [property(leaf, "resizeObserver"), "disconnect"],
      [property(leaf, "_empty"), "unload"],
    ] as const) {
      try {
        if (owner === sourceCanvas || owner === sourceView || owner === sourceLeaf) continue;
        if (owner === view && sourceCanvas !== undefined && property(view, "canvas") === sourceCanvas) continue;
        if (owner === view && sourceElements.includes(property(property(view, "canvas"), "wrapperEl") as HTMLElement)) continue;
        if (typeof property(owner, method) === "function") call(owner, method);
      } catch {
        // A failed render must still remove the independently owned surface.
      }
    }
    try { releaseScope?.(); } finally { host.remove(); }
  };
  try {
    const candidateLeaf: unknown = Reflect.construct(Leaf, [app]);
    const leafElement = property(candidateLeaf, "containerEl");
    if (candidateLeaf === sourceLeaf || !independentElement(leafElement)
      || ["resizeObserver", "_empty"].some(name => property(sourceLeaf, name) !== undefined
        && property(candidateLeaf, name) === property(sourceLeaf, name))) throw new Error(words().export.unavailable);
    leaf = candidateLeaf;
    call(property(leaf, "resizeObserver"), "disconnect");
    host.appendChild(leafElement);
    document.body.appendChild(host);
    const candidateView: unknown = Reflect.apply(factory, registry, [leaf]);
    if (typeof candidateView !== "object" || candidateView === null || candidateView === sourceView
      || (sourceCanvas !== undefined && property(candidateView, "canvas") === sourceCanvas)) throw new Error(words().export.unavailable);
    const viewElement = property(candidateView, "containerEl");
    const content = property(candidateView, "contentEl");
    const candidateWrapper = property(property(candidateView, "canvas"), "wrapperEl");
    if (!independentElement(viewElement) || !independentElement(content)
      || (candidateWrapper !== undefined && !independentElement(candidateWrapper))) throw new Error(words().export.unavailable);
    view = candidateView;
    if (typeof leaf !== "object" || leaf === null) throw new Error(words().export.unavailable);
    if (!Reflect.set(leaf, "view", view)) throw new Error(words().export.unavailable);
    // Native file rendering may request a save; this view must never write a file.
    if (!Reflect.set(candidateView, "requestSave", () => undefined)
      || !Reflect.set(candidateView, "saveLocalData", () => undefined)
      || !Reflect.set(candidateView, "file", property(sourceView, "file"))) throw new Error(words().export.unavailable);
    leafElement.appendChild(viewElement);
    content.classList.add("miro-canvas-export-renderer__content");
    // Component.load enables native Markdown children. onOpen would bind global keys.
    call(view, "load");
    const candidateCanvas = property(view, "canvas");
    const wrapper = property(candidateCanvas, "wrapperEl");
    if (typeof candidateCanvas !== "object" || candidateCanvas === null || candidateCanvas === sourceCanvas
      || !independentElement(wrapper)) throw new Error(words().export.unavailable);
    canvas = candidateCanvas;
    const canvasElement = property(canvas, "canvasEl");
    if (!independentElement(canvasElement) || !wrapper.contains(canvasElement)) throw new Error(words().export.unavailable);
    restoreFrames = installExportFrames(candidateCanvas, canvasElement, wrapper, document.defaultView);
    wrapper.setAttribute("data-miro-canvas-export-renderer", "true");
    const sourceWrapper = property(sourceCanvas, "wrapperEl");
    if (sourceWrapper instanceof document.defaultView.HTMLElement) {
      const palette = document.defaultView.getComputedStyle(sourceWrapper);
      for (let index = 0; index < palette.length; index += 1) {
        const name = palette.item(index);
        if (name.startsWith("--")) wrapper.style.setProperty(name, palette.getPropertyValue(name));
      }
    }
    releaseScope = registerScope?.(leafElement);
    call(canvas, "setData", nativeData);
    if (!Reflect.set(candidateCanvas, "getData", () => snapshot)) throw new Error(words().export.unavailable);
    call(canvas, "onResize");
    return { view, canvas, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
