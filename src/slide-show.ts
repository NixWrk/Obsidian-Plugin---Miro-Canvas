/**
 * Shows a presentation's slides one at a time, as Miro's presenter does:
 * each slide fills the view, the keyboard moves between them and Escape ends
 * the show.  The board's own controls step aside meanwhile.  The host frames
 * a slide; this module owns only the show's state, its small bar and its
 * keyboard listener.
 */

import { createHtmlElement, createSvgElement } from "./dom-elements";
import { words } from "./i18n";
import { TOOLTIP_DELAY } from "./tooltips";

export interface SlideRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface SlideShowHost {
  /** Where a slide is on the board now, or nothing once it is gone. */
  readonly rectOf: (id: string) => SlideRect | undefined;
  /** Brings a board rectangle into view. */
  readonly show: (rect: SlideRect) => void;
  readonly setIcon?: (element: HTMLElement, icon: string) => void;
  readonly onActiveChange?: (active: boolean) => void;
  readonly onLaserToggle?: () => void;
  readonly isLaserEnabled?: () => boolean;
}

const EDITABLE_SELECTOR = 'input, textarea, select, button, a, [role="textbox"], [role="slider"],'
  + ' [contenteditable]:not([contenteditable="false"])';
const PRESENTING_CLASS = "miro-canvas-presenting";
const NEXT_KEYS = new Set(["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"]);
const PREVIOUS_KEYS = new Set(["ArrowLeft", "ArrowUp", "PageUp", "Backspace"]);

export class SlideShow {
  private slides: readonly string[] = [];
  private index = 0;
  private bar: HTMLElement | undefined;
  private counter: HTMLElement | undefined;
  private laserButton: HTMLButtonElement | undefined;
  private ownsPresentingClass = false;
  private reportedActive = false;
  private disposed = false;
  private readonly onKey = (event: KeyboardEvent): void => this.handleKey(event);

  public constructor(
    private readonly root: HTMLElement,
    private readonly host: SlideShowHost,
  ) {}

  public get active(): boolean {
    return this.bar !== undefined;
  }

  public get current(): number {
    return this.index;
  }

  /** Starts at a slide; slides that no longer exist are skipped. */
  public start(slides: readonly string[], from = 0): boolean {
    if (this.disposed) return false;
    const shown = slides.filter((id) => this.host.rectOf(id) !== undefined);
    if (shown.length === 0) return false;
    this.stop();
    this.slides = shown;
    try {
      this.mount();
      this.go(Math.max(0, shown.indexOf(slides[from] ?? "")));
      this.reportedActive = true;
      this.host.onActiveChange?.(true);
      return true;
    } catch (error) {
      this.stop();
      throw error;
    }
  }

  public next(): void {
    this.go(this.index + 1);
  }

  public previous(): void {
    this.go(this.index - 1);
  }

  public go(index: number): void {
    if (!this.active) return;
    this.index = Math.min(Math.max(index, 0), this.slides.length - 1);
    const rect = this.host.rectOf(this.slides[this.index]);
    if (rect !== undefined) this.host.show(rect);
    if (this.counter !== undefined) this.counter.textContent = `${this.index + 1} / ${this.slides.length}`;
    this.bar?.setAttribute("data-first", String(this.index === 0));
    this.bar?.setAttribute("data-last", String(this.index === this.slides.length - 1));
  }

  public stop(): void {
    if (this.bar === undefined) return;
    this.root.ownerDocument.removeEventListener("keydown", this.onKey, true);
    this.bar.remove();
    this.bar = undefined;
    this.counter = undefined;
    this.laserButton = undefined;
    this.slides = [];
    if (this.ownsPresentingClass) this.root.classList.remove(PRESENTING_CLASS);
    this.ownsPresentingClass = false;
    if (this.reportedActive) {
      this.reportedActive = false;
      this.host.onActiveChange?.(false);
    }
  }

  /** Reconcile a laser change initiated by another board control. */
  public refreshLaser(): void {
    this.laserButton?.setAttribute("aria-pressed", String(this.host.isLaserEnabled?.() === true));
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
  }

  private mount(): void {
    const document = this.root.ownerDocument;
    const bar = createHtmlElement(document, "div");
    this.bar = bar;
    bar.className = "miro-canvas-slideshow";
    bar.setAttribute("role", "toolbar");
    bar.setAttribute("aria-label", words().slideShow.ariaLabel);
    const button = (label: string, icon: string, glyph: string, run: () => void): HTMLButtonElement => {
      const element = createHtmlElement(document, "button");
      element.type = "button";
      element.className = "miro-canvas-slideshow__button";
      element.setAttribute("aria-label", label);
      element.setAttribute("data-tooltip-delay", TOOLTIP_DELAY);
      if (this.host.setIcon !== undefined) this.host.setIcon(element, icon);
      else element.textContent = glyph;
      element.addEventListener("click", run);
      bar.appendChild(element);
      return element;
    };
    button(words().slideShow.previousSlide, "chevron-left", "‹", () => this.previous()).classList.add("miro-canvas-slideshow__previous");
    const counter = createHtmlElement(document, "span");
    counter.className = "miro-canvas-slideshow__counter";
    bar.appendChild(counter);
    button(words().slideShow.nextSlide, "chevron-right", "›", () => this.next()).classList.add("miro-canvas-slideshow__next");
    if (this.host.onLaserToggle !== undefined) {
      this.laserButton = button(words().slideShow.laserPointer, "mouse-pointer-2", "", () => {
        this.host.onLaserToggle?.();
        this.refreshLaser();
      });
      this.laserButton.classList.add("miro-canvas-slideshow__laser");
      if (this.host.setIcon === undefined) {
        const svg = createSvgElement(document, "svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("class", "svg-icon");
        svg.setAttribute("width", "18");
        svg.setAttribute("height", "18");
        svg.setAttribute("aria-hidden", "true");
        svg.setAttribute("focusable", "false");
        svg.setAttribute("fill", "none");
        svg.setAttribute("stroke", "currentColor");
        svg.setAttribute("stroke-width", "2");
        svg.setAttribute("stroke-linejoin", "round");
        const path = createSvgElement(document, "path");
        path.setAttribute("d", "M4 4l7.07 17 2.51-7.39L21 11.07Z");
        svg.appendChild(path);
        this.laserButton.appendChild(svg);
      }
      this.refreshLaser();
    }
    button(words().slideShow.endPresentation, "x", "×", () => this.stop());
    // The board must not start a drag or select under the bar.
    bar.addEventListener("pointerdown", (event) => event.stopPropagation());
    this.root.appendChild(bar);
    this.bar = bar;
    this.counter = counter;
    this.ownsPresentingClass = !this.root.classList.contains(PRESENTING_CLASS);
    this.root.classList.add(PRESENTING_CLASS);
    document.addEventListener("keydown", this.onKey, true);
  }

  private isEditing(event: KeyboardEvent): boolean {
    const targets = typeof event.composedPath === "function" ? event.composedPath() : [event.target];
    return targets.some(target => typeof (target as Element | null)?.closest === "function"
      && (target as Element).closest(EDITABLE_SELECTOR) !== null);
  }

  private handleKey(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      this.stop();
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing || this.isEditing(event)) return;
    let handled = true;
    if (NEXT_KEYS.has(event.key)) this.next();
    else if (PREVIOUS_KEYS.has(event.key)) this.previous();
    else if (event.key === "Home") this.go(0);
    else if (event.key === "End") this.go(this.slides.length - 1);
    else handled = false;
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  }
}
