import { createHtmlElement } from "./dom-elements";
/**
 * The search bar at the board's top right: a field, a counter ("3 / 12"),
 * previous and next buttons and a close button.  It only reports what the
 * person does - the session finds the matches, moves the board to them and
 * tells the bar what to show.
 *
 * Keys typed in the field stay in it: native Canvas never sees them, so a
 * letter is not taken for a tool and Delete does not remove a card.
 */
import { words } from "./i18n";
import type { SearchError, SearchErrorCode, SearchKind, SearchOptions } from "./board-search";
import { TOOLTIP_DELAY } from "./tooltips";

export interface BoardSearchBarHost {
  /** The field's text changed; search again and show the first match. */
  readonly onQuery: (query: string, options?: SearchOptions) => void;
  /** Show the next (1) or previous (-1) match. */
  readonly onStep: (direction: 1 | -1) => void;
  /** Escape or the close button: put the bar away and give the board its keys back. */
  readonly onClose: () => void;
  /** How long to wait after a keystroke before searching; a large board waits a little. */
  readonly queryDelay?: () => number;
  readonly setIcon?: (element: HTMLElement, icon: string) => void;
}

/** Labels come from the parent's locale table, never from this component. */
export interface BoardSearchEnhancementLabels {
  readonly regex: string;
  readonly caseSensitive: string;
  readonly errors: Readonly<Record<SearchErrorCode, string>>;
}

export interface BoardSearchBarOptions {
  readonly labels: BoardSearchEnhancementLabels;
  readonly initialOptions?: SearchOptions;
}

export interface BoardSearchResult {
  /** The match shown, counted from 0; -1 when there is none. */
  readonly current: number;
  readonly total: number;
  /** What the match shown is, read out to a screen reader. */
  readonly kind?: SearchKind;
  readonly error?: SearchError;
}

type TimerHost = {
  setTimeout: (callback: () => void, delay: number) => number | ReturnType<typeof setTimeout>;
  clearTimeout: (handle: number | ReturnType<typeof setTimeout>) => void;
};

export class BoardSearchBar {
  public readonly element: HTMLElement;
  public readonly input: HTMLInputElement;
  private readonly counter: HTMLElement;
  private readonly live: HTMLElement;
  private readonly previousButton: HTMLButtonElement;
  private readonly nextButton: HTMLButtonElement;
  private readonly timers: TimerHost;
  private readonly optionButtons = new Map<keyof SearchOptions, HTMLButtonElement>();
  private searchOptions: SearchOptions = { regex: false, caseSensitive: false };
  private hasError = false;
  private disposed = false;
  private pendingQuery: ReturnType<TimerHost["setTimeout"]> | undefined;
  private readonly cleanups: (() => void)[] = [];

  public constructor(
    private readonly document: Document,
    private readonly host: BoardSearchBarHost,
    private readonly enhancements?: BoardSearchBarOptions,
  ) {
    const labels = words().search;
    const view = document.defaultView as unknown as TimerHost | null;
    this.timers = view !== null && typeof view?.setTimeout === "function" && typeof view?.clearTimeout === "function"
      ? view
      : typeof window === "undefined" ? { setTimeout, clearTimeout } : window;

    const bar = this.make("div", "miro-canvas-panel miro-canvas-search");
    bar.setAttribute("role", "search");
    bar.setAttribute("aria-label", labels.ariaLabel);
    bar.hidden = true;

    this.input = bar.appendChild(this.make("input", "miro-canvas-search__input"));
    this.input.type = "search";
    // The placeholder names the field: an aria-label would also put
    // Obsidian's tooltip over the text being typed.
    this.input.placeholder = labels.placeholder;
    this.input.setAttribute("spellcheck", "false");
    this.input.setAttribute("autocomplete", "off");

    if (enhancements !== undefined) {
      for (const [option, label, glyph, icon] of [
        ["caseSensitive", enhancements.labels.caseSensitive, "Aa", "case-sensitive"],
        ["regex", enhancements.labels.regex, ".*", "regex"],
      ] as const) {
        const button = bar.appendChild(this.button(label, icon, glyph));
        button.setAttribute("data-search-option", option);
        this.optionButtons.set(option, button);
        this.listen(button, "click", () => {
          this.setOptions({ ...this.searchOptions, [option]: this.searchOptions[option] !== true });
        });
      }
      this.setOptions(enhancements.initialOptions ?? {}, false);
    }

    this.counter = bar.appendChild(this.make("span", "miro-canvas-search__count"));
    this.previousButton = bar.appendChild(this.button(labels.previous, "chevron-up", "↑"));
    this.nextButton = bar.appendChild(this.button(labels.next, "chevron-down", "↓"));
    const closeButton = bar.appendChild(this.button(labels.close, "x", "×"));

    // Said out loud, never shown: what the match on screen is.
    this.live = bar.appendChild(this.make("span", "miro-canvas-search__live"));
    this.live.setAttribute("aria-live", "polite");

    this.listen(this.input, "input", () => this.scheduleQuery());
    this.listen(bar, "keydown", (event) => this.onKey(event as KeyboardEvent));
    this.listen(this.previousButton, "click", () => {
      if (!this.hasError) this.host.onStep(-1);
    });
    this.listen(this.nextButton, "click", () => {
      if (!this.hasError) this.host.onStep(1);
    });
    this.listen(closeButton, "click", () => this.host.onClose());

    this.element = bar;
    this.showResult({ current: -1, total: 0 });
  }

  public get isOpen(): boolean {
    return !this.element.hidden;
  }

  public get query(): string {
    return this.input.value;
  }

  public get options(): SearchOptions {
    return { ...this.searchOptions };
  }

  /** Updating a mode searches immediately, cancelling any pending literal query. */
  public setOptions(options: SearchOptions, search = true): void {
    if (this.disposed) return;
    this.searchOptions = { regex: options.regex === true, caseSensitive: options.caseSensitive === true };
    for (const [option, button] of this.optionButtons) {
      button.setAttribute("aria-pressed", String(this.searchOptions[option] === true));
    }
    if (search) {
      this.cancelPendingQuery();
      this.emitQuery();
    }
  }

  /** Show the bar with the field focused and its text selected, ready to type over. */
  public open(): void {
    this.element.hidden = false;
    this.focusInput();
  }

  public focusInput(): void {
    this.input.focus({ preventScroll: true });
    this.input.select();
  }

  /** Hide the bar; the text stays for the next time it opens. */
  public close(): void {
    this.cancelPendingQuery();
    this.element.hidden = true;
  }

  /** The counter, the buttons and what a screen reader hears, for the matches found. */
  public showResult(result: BoardSearchResult): void {
    const labels = words().search;
    const searching = this.input.value.trim() !== "";
    this.hasError = result.error !== undefined;
    this.input.setAttribute("aria-invalid", String(this.hasError));
    this.element.setAttribute("data-search-error", result.error?.code ?? "");
    if (result.error !== undefined) {
      // The fallback remains visible for legacy hosts; integrated hosts inject
      // precise, localized error labels for every structured error code.
      const message = this.enhancements?.labels.errors[result.error.code] ?? result.error.code;
      this.counter.textContent = message;
      this.live.textContent = message;
      this.element.setAttribute("data-search-state", "error");
      this.previousButton.disabled = true;
      this.nextButton.disabled = true;
      return;
    }
    const found = result.total > 0 && result.current >= 0;
    let count = "";
    if (found) count = labels.count(result.current + 1, result.total);
    else if (searching) count = labels.none;
    this.counter.textContent = count;
    this.element.setAttribute("data-search-state", found ? "found" : searching ? "none" : "empty");
    this.previousButton.disabled = result.total === 0;
    this.nextButton.disabled = result.total === 0;
    const kind = result.kind === undefined ? undefined : labels.kinds[result.kind];
    this.live.textContent = found && kind !== undefined
      ? labels.announce(kind, result.current + 1, result.total)
      : count;
  }

  public dispose(): void {
    this.disposed = true;
    this.cancelPendingQuery();
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    this.element.remove();
  }

  private onKey(event: KeyboardEvent): void {
    // Whatever is typed here is the search's own: native Canvas and the
    // board's tool letters never see it.
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      this.host.onClose();
      return;
    }
    if (event.target !== this.input) return;
    if (event.key === "Enter") {
      event.preventDefault();
      // Enter right after typing searches at once rather than skipping the first match.
      if (this.flushPendingQuery()) return;
      if (!this.hasError) this.host.onStep(event.shiftKey ? -1 : 1);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      this.flushPendingQuery();
      if (!this.hasError) this.host.onStep(event.key === "ArrowDown" ? 1 : -1);
    }
  }

  private scheduleQuery(): void {
    if (this.disposed) return;
    this.cancelPendingQuery();
    const delay = this.host.queryDelay?.() ?? 0;
    if (delay <= 0) {
      this.emitQuery();
      return;
    }
    this.pendingQuery = this.timers.setTimeout(() => {
      this.pendingQuery = undefined;
      this.emitQuery();
    }, delay);
  }

  /** Run a search still waiting for its delay; true when there was one. */
  private flushPendingQuery(): boolean {
    if (this.pendingQuery === undefined) return false;
    this.cancelPendingQuery();
    this.emitQuery();
    return true;
  }

  private emitQuery(): void {
    if (this.disposed) return;
    if (this.enhancements === undefined) this.host.onQuery(this.input.value);
    else this.host.onQuery(this.input.value, this.options);
  }

  private cancelPendingQuery(): void {
    if (this.pendingQuery === undefined) return;
    this.timers.clearTimeout(this.pendingQuery);
    this.pendingQuery = undefined;
  }

  private listen(target: HTMLElement, type: string, listener: (event: Event) => void): void {
    target.addEventListener(type, listener);
    this.cleanups.push(() => target.removeEventListener(type, listener));
  }

  private make<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
    const element = createHtmlElement(this.document, tag);
    element.className = className;
    return element;
  }

  private button(label: string, icon: string, glyph: string): HTMLButtonElement {
    const element = this.make("button", "miro-canvas-search__button");
    element.type = "button";
    element.setAttribute("aria-label", label);
    element.setAttribute("data-tooltip-delay", TOOLTIP_DELAY);
    if (this.host.setIcon !== undefined) this.host.setIcon(element, icon);
    else element.textContent = glyph;
    return element;
  }
}
