/**
 * Exporting a board: the panel that sets it up, the pages drawn over the
 * board while it is open, and the capture that turns each page into a
 * picture.
 *
 * Pages are marked on the board, not made of it: they are rectangles over
 * it, stored with the board, so what is exported is chosen without moving,
 * copying or resizing a single item.  A presentation's slides are pages
 * already.
 *
 * The browser renders each visible tile into a picture on desktop and mobile.
 * The camera is restored after success, failure or cancellation.
 */

import { createHtmlElement } from "./dom-elements";
import {
  PAPER_FORMATS, captureTiles, exportPixels, paperLabels, type ExportPageRecord, type ExportQuality, type ExportRect,
  type ExportState, type PaperFormat, type PaperOrientation,
} from "./export-pages";
import { words } from "./i18n";
import html2canvas from "html2canvas-pro";

export type ExportKind = "pdf" | "pptx";


export interface ExportPanelState {
  /** A board's own pages, or a presentation's slides, which set their own size. */
  readonly mode: "board" | "slides";
  readonly title: string;
  readonly state: ExportState;
  /** What the export is doing, while it runs. */
  readonly busy?: string;
  /** Why exporting is not possible here, when it is not. */
  readonly unavailable?: string;
}

export interface ExportPanelActions {
  readonly onFormat: (format: PaperFormat, orientation: PaperOrientation) => void;
  readonly onQuality: (quality: ExportQuality) => void;
  readonly onAddPage: () => void;
  readonly onAddFramePages: () => void;
  readonly onRemovePage: (id: string) => void;
  readonly onMovePage: (id: string, step: -1 | 1) => void;
  readonly onShowPage: (id: string) => void;
  readonly onExport: (kind: ExportKind) => void;
  readonly onClose: () => void;
}

/** The export panel: paper, pages, quality and the two ways out. */
export class ExportPanel {
  public readonly element: HTMLElement;
  private readonly listeners: (() => void)[] = [];

  public constructor(private readonly document: Document, private readonly actions: ExportPanelActions) {
    this.element = createHtmlElement(document, "div");
    this.element.className = "miro-canvas-export";
    this.element.setAttribute("role", "dialog");
    this.element.setAttribute("aria-label", words().export.dialogLabel);
  }

  public update(view: ExportPanelState): void {
    const root = this.element;
    for (const remove of this.listeners.splice(0)) remove();
    while (root.firstChild !== null) root.removeChild(root.firstChild);
    const header = this.add(root, "div", "miro-canvas-export__header");
    this.add(header, "div", "miro-canvas-export__title", view.title);
    const close = this.button(header, "×", words().export.close, "miro-canvas-export__close clickable-icon");
    this.on(close, "click", () => this.actions.onClose());
    const busy = view.busy !== undefined;

    if (view.mode === "board") {
      const paper = this.row(root, words().export.paperLabel);
      const format = this.add(paper, "select", "dropdown") as HTMLSelectElement;
      for (const value of PAPER_FORMATS) {
        const option = this.add(format, "option", "", paperLabels()[value]) as HTMLOptionElement;
        option.value = value;
      }
      format.value = view.state.format;
      format.disabled = busy;
      this.on(format, "change", () => this.actions.onFormat(format.value as PaperFormat, view.state.orientation));
      if (view.state.format !== "free") {
        const turns = this.add(paper, "div", "miro-canvas-export__segments");
        for (const [value, label] of [["landscape", words().export.landscape], ["portrait", words().export.portrait]] as const) {
          const choice = this.button(turns, label, label, "miro-canvas-export__segment");
          choice.setAttribute("aria-pressed", String(view.state.orientation === value));
          choice.disabled = busy;
          this.on(choice, "click", () => this.actions.onFormat(view.state.format, value));
        }
      }
    }

    if (view.mode === "board") this.add(root, "p", "miro-canvas-export__layout-hint", words().export.layoutHint);
    const pages = this.add(root, "div", "miro-canvas-export__pages");
    this.add(pages, "div", "miro-canvas-export__label", view.mode === "slides" ? words().export.slidesLabel : words().export.pagesLabel);
    if (view.state.pages.length === 0) {
      this.add(pages, "div", "miro-canvas-export__empty", words().export.noPages);
    }
    view.state.pages.forEach((page, index) => {
      const item = this.add(pages, "div", "miro-canvas-export__page");
      const name = this.button(item, `${index + 1}. ${page.name ?? words().export.pageFallback(index + 1)}`, words().export.showPage, "miro-canvas-export__page-name");
      this.on(name, "click", () => this.actions.onShowPage(page.id));
      if (view.mode !== "board") return;
      for (const [glyph, label, step] of [["↑", words().export.earlier, -1], ["↓", words().export.later, 1]] as const) {
        const move = this.button(item, glyph, label, "miro-canvas-export__page-action clickable-icon");
        move.disabled = busy || (step === -1 ? index === 0 : index === view.state.pages.length - 1);
        this.on(move, "click", () => this.actions.onMovePage(page.id, step));
      }
      const remove = this.button(item, "✕", words().export.removePage, "miro-canvas-export__page-action clickable-icon");
      remove.disabled = busy;
      this.on(remove, "click", () => this.actions.onRemovePage(page.id));
    });
    if (view.mode === "board") {
      const adding = this.add(pages, "div", "miro-canvas-export__actions");
      const add = this.button(adding, words().export.addPage, words().export.addPageHint);
      add.disabled = busy;
      this.on(add, "click", () => this.actions.onAddPage());
      const frames = this.button(adding, words().export.addFramePages, words().export.addFramePagesHint);
      frames.disabled = busy;
      this.on(frames, "click", () => this.actions.onAddFramePages());
    }

    const quality = this.row(root, words().export.qualityLabel);
    const levels = this.add(quality, "div", "miro-canvas-export__segments");
    for (const [value, label, hint] of [
      ["standard", words().export.standard, words().export.standardHint], ["high", words().export.high, words().export.highHint],
    ] as const) {
      const choice = this.button(levels, label, hint, "miro-canvas-export__segment");
      choice.setAttribute("aria-pressed", String(view.state.quality === value));
      choice.disabled = busy;
      this.on(choice, "click", () => this.actions.onQuality(value));
    }

    const out = this.add(root, "div", "miro-canvas-export__actions miro-canvas-export__out");
    for (const [kind, label] of [["pdf", words().export.exportPdf], ["pptx", words().export.exportPptx]] as const) {
      const run = this.button(out, label, label, kind === "pdf" ? "mod-cta" : "");
      run.disabled = busy || view.unavailable !== undefined || view.state.pages.length === 0;
      this.on(run, "click", () => this.actions.onExport(kind));
    }
    const status = view.busy ?? view.unavailable;
    if (status !== undefined) this.add(root, "div", "miro-canvas-export__status", status).setAttribute("role", "status");
  }

  public dispose(): void {
    for (const remove of this.listeners.splice(0)) remove();
    this.element.remove();
  }

  private row(parent: HTMLElement, label: string): HTMLElement {
    const row = this.add(parent, "div", "miro-canvas-export__row");
    this.add(row, "div", "miro-canvas-export__label", label);
    return row;
  }

  private add(parent: Element, tag: keyof HTMLElementTagNameMap, className: string, text?: string): HTMLElement {
    const element = createHtmlElement(this.document, tag);
    if (className !== "") element.className = className;
    if (text !== undefined) element.textContent = text;
    parent.appendChild(element);
    return element;
  }

  private button(parent: Element, text: string, label: string, className = ""): HTMLButtonElement {
    const button = this.add(parent, "button", className, text) as HTMLButtonElement;
    button.type = "button";
    button.setAttribute("aria-label", label);
    return button;
  }

  private on(target: EventTarget, type: string, handler: EventListener): void {
    target.addEventListener(type, handler);
    this.listeners.push(() => target.removeEventListener(type, handler));
  }
}

export interface OverlayPage {
  readonly id: string;
  readonly label: string;
  /** Where the page is, in the overlay's own pixels. */
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** One page already drawn over the board: its DOM, and the page it now shows. */
interface OverlayEntry {
  readonly id: string;
  readonly frame: HTMLElement;
  readonly tab: HTMLElement;
  /** Kept live so a drag begun after a pan or a resize starts from where the page now is. */
  page: OverlayPage;
}

/**
 * The pages drawn over the board.  A page is moved by its tab and resized
 * by its corner, keeping its paper's shape unless it is free; its inside
 * lets presses through to the board.
 *
 * `update` runs on every refresh and every pan or zoom, so it does not tear
 * down and rebuild the pages each time: while the same pages are shown in
 * the same order it only moves and relabels what is already there.
 */
export class ExportOverlay {
  public readonly element: HTMLElement;
  private known: OverlayEntry[] = [];
  private editable = false;
  private drag: {
    readonly id: string; readonly mode: "move" | "resize"; readonly start: { x: number; y: number };
    readonly page: OverlayPage; readonly end: () => void;
  } | undefined;

  public constructor(
    private readonly document: Document,
    private readonly onChange: (id: string, rect: { left: number; top: number; width: number; height: number }, commit: boolean) => void,
    private readonly ratio: () => number | undefined,
  ) {
    this.element = createHtmlElement(document, "div");
    this.element.className = "miro-canvas-export-pages";
    this.element.setAttribute("aria-hidden", "true");
  }

  public update(pages: readonly OverlayPage[], editable: boolean): void {
    if (this.drag !== undefined) return;
    const unchanged = editable === this.editable && this.known.length === pages.length
      && this.known.every((entry, index) => entry.id === pages[index].id);
    if (!unchanged) {
      const root = this.element;
      while (root.firstChild !== null) root.removeChild(root.firstChild);
      this.editable = editable;
      this.known = pages.map((page) => this.buildPage(page, editable));
      return;
    }
    // Same pages, same order: move and relabel what is already drawn.
    pages.forEach((page, index) => {
      const entry = this.known[index];
      entry.page = page;
      Object.assign(entry.frame.style, { left: `${page.left}px`, top: `${page.top}px`, width: `${page.width}px`, height: `${page.height}px` });
      entry.tab.textContent = page.label;
    });
  }

  public dispose(): void {
    this.drag?.end();
    this.element.remove();
  }

  private buildPage(page: OverlayPage, editable: boolean): OverlayEntry {
    const frame = this.element.appendChild(createHtmlElement(this.document, "div"));
    frame.className = "miro-canvas-export-page";
    Object.assign(frame.style, { left: `${page.left}px`, top: `${page.top}px`, width: `${page.width}px`, height: `${page.height}px` });
    const tab = frame.appendChild(createHtmlElement(this.document, "div"));
    tab.className = "miro-canvas-export-page__tab";
    tab.textContent = page.label;
    tab.title = words().export.movePageHint;
    const entry: OverlayEntry = { id: page.id, frame, tab, page };
    if (editable) {
      const corner = frame.appendChild(createHtmlElement(this.document, "div"));
      corner.className = "miro-canvas-export-page__corner";
      corner.title = words().export.resizePageHint;
      // Read the page fresh from `entry`: it is kept up to date between drags.
      tab.addEventListener("pointerdown", (event) => this.begin(event, entry.page, "move", frame));
      corner.addEventListener("pointerdown", (event) => this.begin(event, entry.page, "resize", frame));
    }
    return entry;
  }

  private begin(event: PointerEvent, page: OverlayPage, mode: "move" | "resize", frame: HTMLElement): void {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const view = this.document.defaultView;
    const start = { x: event.clientX, y: event.clientY };
    const shaped = (point: { x: number; y: number }): { left: number; top: number; width: number; height: number } => {
      const dx = point.x - start.x, dy = point.y - start.y;
      if (mode === "move") return { left: page.left + dx, top: page.top + dy, width: page.width, height: page.height };
      const ratio = this.ratio();
      let width = Math.max(24, page.width + dx), height = Math.max(24, page.height + dy);
      if (ratio !== undefined) {
        // The corner follows whichever way it was pulled further.
        if (width / ratio >= height) height = width / ratio;
        else width = height * ratio;
      }
      return { left: page.left, top: page.top, width, height };
    };
    const move = (moved: PointerEvent): void => {
      const rect = shaped({ x: moved.clientX, y: moved.clientY });
      Object.assign(frame.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
      this.onChange(page.id, rect, false);
    };
    const up = (released: PointerEvent): void => {
      end();
      this.onChange(page.id, shaped({ x: released.clientX, y: released.clientY }), true);
    };
    const end = (): void => {
      view?.removeEventListener("pointermove", move, true);
      view?.removeEventListener("pointerup", up, true);
      this.drag = undefined;
    };
    view?.addEventListener("pointermove", move, true);
    view?.addEventListener("pointerup", up, true);
    this.drag = { id: page.id, mode, start, page, end };
  }
}

/** A page's picture, as the capture made it. */
export interface CapturedPage {
  readonly jpeg: Uint8Array;
  readonly width: number;
  readonly height: number;
}

/** One tile of one page's capture, worked out without touching the DOM. */
export interface CaptureTilePlan {
  /** The board rectangle this tile covers. */
  readonly tile: ExportRect;
  /** Where the view is centred - `canvas.x/tx` and `y/ty` - while this tile is shot. */
  readonly center: { readonly x: number; readonly y: number };
  /** `canvas.zoom` and `tZoom`: log2 of the board-to-window scale over the window's own zoom factor. */
  readonly zoom: number;
  /** Where the tile lands on the page's own sheet, in pixels. */
  readonly draw: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
}

/** One page's whole capture plan: its output size and every tile it takes. */
export interface CapturePagePlan {
  readonly page: ExportRect;
  readonly pixels: { readonly width: number; readonly height: number; readonly scale: number };
  /** Window pixels per board unit, at which this page is shot. */
  readonly scale: number;
  readonly tiles: readonly CaptureTilePlan[];
}

/**
 * How each page is captured, worked out purely from the pages, the quality,
 * the window rectangle being photographed, and the window's own pixel and
 * zoom scaling - no DOM, no Electron.  `capturePages` drives the camera
 * with this; tests check the arithmetic without either.
 */
export function planCapture(
  pages: readonly ExportRect[],
  quality: ExportQuality,
  capture: { readonly width: number; readonly height: number },
  devicePixelRatio: number,
  zoomFactor: number,
): readonly CapturePagePlan[] {
  // Window pixels per board unit, once Chromium's own scaling is undone.
  const ratio = devicePixelRatio / zoomFactor;
  return pages.map((page): CapturePagePlan => {
    const pixels = exportPixels(page, quality);
    const scale = pixels.scale / ratio;
    const across = capture.width / scale, down = capture.height / scale;
    const tiles = captureTiles(page, { width: across, height: down }).map((tile): CaptureTilePlan => ({
      tile,
      center: { x: tile.x + across / 2, y: tile.y + down / 2 },
      zoom: Math.log2(scale / zoomFactor),
      draw: {
        x: Math.round((tile.x - page.x) * pixels.scale), y: Math.round((tile.y - page.y) * pixels.scale),
        width: Math.round(tile.width * pixels.scale), height: Math.round(tile.height * pixels.scale),
      },
    }));
    return { page, pixels, scale, tiles };
  });
}

/** The part of native Canvas the capture drives. */
interface CaptureCanvas {
  x: number; y: number; tx: number; ty: number; zoom: number; tZoom: number;
  screenshotting?: boolean;
  viewportChanged?: boolean;
  readonly wrapperEl: HTMLElement;
  deselectAll(): void;
  requestFrame(): void;
  onResize?(): void;
  setViewport?(x: number, y: number, zoom: number): void;
}

/** Render pages in the browser; no desktop capture or filesystem is needed. */
export async function capturePages(
  canvas: CaptureCanvas,
  pages: readonly ExportRect[],
  quality: ExportQuality,
  progress: (done: number, total: number) => boolean,
): Promise<CapturedPage[]> {
  const wrapper = canvas.wrapperEl;
  const document = wrapper.ownerDocument;
  const view = document.defaultView;
  if (view === null) throw new Error(words().export.unavailable);
  const saved = { x: canvas.x, y: canvas.y, zoom: canvas.zoom, screenshotting: canvas.screenshotting };
  const status = createHtmlElement(document, "div");
  status.className = "miro-canvas-export-progress miro-canvas-theme-surface";
  const boardTheme = wrapper.getAttribute("data-miro-canvas-resolved-theme");
  if (boardTheme === "dark" || boardTheme === "light") {
    status.setAttribute("data-miro-canvas-resolved-theme", boardTheme);
  }
  status.setAttribute("role", "status");
  const label = createHtmlElement(document, "span");
  const stop = createHtmlElement(document, "button");
  stop.type = "button";
  stop.textContent = words().export.stop;
  status.append(label, stop);
  document.body.appendChild(status);
  let stopped = false;
  const controller = new AbortController();
  stop.addEventListener("click", () => {
    stopped = true;
    controller.abort();
  });
  const pause = (ms: number): Promise<void> => new Promise(resolve => view.setTimeout(resolve, ms));
  const results: CapturedPage[] = [];
  let activeSheet: HTMLCanvasElement | undefined;
  let activePicture: HTMLCanvasElement | undefined;
  try {
    canvas.deselectAll();
    wrapper.classList.add("is-screenshotting", "miro-canvas-exporting");
    canvas.screenshotting = true;
    await document.fonts.ready;
    const bounds = wrapper.getBoundingClientRect();
    const capture = { width: Math.floor(bounds.width), height: Math.floor(bounds.height) };
    if (capture.width < 1 || capture.height < 1) throw new Error(words().export.pageNotDrawn);
    const plans = planCapture(pages, quality, capture, 1, 1);
    const total = plans.reduce((sum, plan) => sum + plan.tiles.length, 0);
    let done = 0;
    for (const { pixels, tiles } of plans) {
      const sheet = createHtmlElement(document, "canvas");
      activeSheet = sheet;
      sheet.width = pixels.width;
      sheet.height = pixels.height;
      const context = sheet.getContext("2d");
      if (context === null) throw new Error(words().export.pageNotDrawn);
      for (const { center, zoom, draw } of tiles) {
        label.textContent = words().export.capturingProgress(done, total);
        if (stopped || !progress(done, total)) throw new Error(words().export.exportStopped);
        canvas.x = canvas.tx = center.x;
        canvas.y = canvas.ty = center.y;
        canvas.zoom = canvas.tZoom = zoom;
        canvas.viewportChanged = true;
        canvas.requestFrame();
        await pause(120);
        await new Promise<void>(resolve => view.requestAnimationFrame(() => resolve()));
        const picture = await html2canvas(wrapper, {
          signal: controller.signal,
          scale: 1, logging: false, backgroundColor: view.getComputedStyle(wrapper).backgroundColor,
          width: capture.width, height: capture.height,
          allowTaint: false, useCORS: false, imageTimeout: 10000,
          ignoreElements: element => element.matches("iframe, video, .miro-canvas-export-progress"),
          onclone: (_document, cloned) => prepareExportSvgs(wrapper, cloned),
        });
        activePicture = picture;
        if (stopped || !progress(done, total)) throw new Error(words().export.exportStopped);
        context.drawImage(picture, 0, 0, Math.min(picture.width, draw.width), Math.min(picture.height, draw.height),
          draw.x, draw.y, Math.min(picture.width, draw.width), Math.min(picture.height, draw.height));
        picture.width = picture.height = 0;
        activePicture = undefined;
        done += 1;
      }
      results.push({ jpeg: await jpegOf(sheet), width: pixels.width, height: pixels.height });
      sheet.width = sheet.height = 0;
      activeSheet = undefined;
    }
    progress(total, total);
  } catch (error) {
    if (stopped) throw new Error(words().export.exportStopped);
    throw error;
  } finally {
    if (activePicture !== undefined) activePicture.width = activePicture.height = 0;
    if (activeSheet !== undefined) activeSheet.width = activeSheet.height = 0;
    status.remove();
    wrapper.classList.remove("is-screenshotting", "miro-canvas-exporting");
    canvas.screenshotting = saved.screenshotting;
    canvas.x = canvas.tx = saved.x;
    canvas.y = canvas.ty = saved.y;
    canvas.zoom = canvas.tZoom = saved.zoom;
    canvas.setViewport?.(saved.x, saved.y, saved.zoom);
    canvas.requestFrame();
  }
  return results;
}

/** SVG image serialization loses inherited CSS and clips overflowing edges. */
function prepareExportSvgs(source: HTMLElement, cloned: HTMLElement): void {
  const view = source.ownerDocument.defaultView;
  if (view === null) return;
  const originals = Array.from(source.querySelectorAll("svg"));
  const copies = Array.from(cloned.querySelectorAll("svg"));
  const viewport = source.getBoundingClientRect();
  for (let index = 0; index < originals.length; index += 1) {
    const original = originals[index];
    const copy = copies[index];
    if (copy === undefined || original.getBoundingClientRect().width === 0) continue;
    const elements = [original, ...Array.from(original.querySelectorAll("*"))];
    const targets = [copy, ...Array.from(copy.querySelectorAll("*"))];
    elements.forEach((element, at) => {
      const target = targets[at] as SVGElement | undefined;
      if (target === undefined) return;
      const computed = view.getComputedStyle(element);
      for (const property of ["color", "fill", "stroke", "stroke-width", "stroke-dasharray", "stroke-dashoffset", "stroke-linecap", "stroke-linejoin", "opacity", "fill-opacity", "stroke-opacity", "font-family", "font-size"]) {
        target.style.setProperty(property, computed.getPropertyValue(property));
      }
    });
    if (!original.classList.contains("canvas-edges")) continue;
    const matrix = original.getScreenCTM();
    if (matrix === null) continue;
    const inverse = matrix.inverse();
    const first = original.createSVGPoint();
    first.x = viewport.left;
    first.y = viewport.top;
    const last = original.createSVGPoint();
    last.x = viewport.right;
    last.y = viewport.bottom;
    const a = first.matrixTransform(inverse);
    const b = last.matrixTransform(inverse);
    const width = b.x - a.x;
    const height = b.y - a.y;
    copy.setAttribute("viewBox", `${a.x} ${a.y} ${width} ${height}`);
    copy.setAttribute("width", String(width));
    copy.setAttribute("height", String(height));
    for (const [property, value] of Object.entries({ left: `${a.x}px`, top: `${a.y}px`, width: `${width}px`, height: `${height}px` })) copy.style.setProperty(property, value);
  }
}

function jpegOf(sheet: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    sheet.toBlob((blob) => {
      if (blob === null) {
        reject(new Error(words().export.pageNotEncoded));
        return;
      }
      blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)), reject);
    }, "image/jpeg", 0.92);
  });
}

export type { ExportPageRecord };
