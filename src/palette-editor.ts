import { APPEARANCE_ACTIONS, MAX_PALETTE_COLORS, type AppearanceAction, type PaletteColor } from "./appearance";
import { createHtmlElement } from "./dom-elements";
import { hasAsciiControl } from "./control-characters";

export type PaletteError = "invalidName" | "invalidHex" | "duplicate" | "capacity" | "lastColor" | "missing" | "busy" | "saveFailed";
export type PaletteOperation = { readonly type: "add"; readonly label: string; readonly color: string }
  | { readonly type: "edit"; readonly id: string; readonly label: string; readonly color: string }
  | { readonly type: "delete"; readonly id: string }
  | { readonly type: "move"; readonly id: string; readonly direction: -1 | 1 }
  | { readonly type: "reset" };
export interface PaletteChange {
  readonly operation: PaletteOperation;
  /** Existing appearance actions for add/delete/edit; full snapshot remains authoritative for order/reset. */
  readonly actions: readonly AppearanceAction[];
}
export interface PaletteEditorHost {
  /** Atomically merge settings.palette through the board writer; false/rejection keeps the old palette. */
  readonly onChange: (palette: readonly PaletteColor[], change: PaletteChange) => void | boolean | Promise<void | boolean>;
  readonly createId?: () => string;
}
export interface PaletteEditorLabels {
  readonly ariaLabel: string;
  readonly name: string;
  readonly hex: string;
  readonly add: string;
  readonly save: string;
  readonly cancel: string;
  readonly edit: string;
  readonly delete: string;
  readonly moveUp: string;
  readonly moveDown: string;
  readonly reset: string;
  readonly saving: string;
  readonly saved: string;
  readonly errors: Readonly<Record<PaletteError, string>>;
}
export interface PaletteResult {
  readonly changed: boolean;
  readonly error?: PaletteError;
}

export function paletteHex(value: string): string | undefined {
  const trimmed = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/u.test(trimmed)) return trimmed;
  if (/^#[0-9a-f]{3}(?:[0-9a-f])?$/u.test(trimmed)) return `#${[...trimmed.slice(1)].map(character => character + character).join("")}`;
  return undefined;
}
function validName(value: string): boolean {
  return value.trim().length > 0 && value.trim().length <= 256 && !hasAsciiControl(value);
}
function checkedPalette(palette: readonly PaletteColor[]): readonly PaletteColor[] {
  if (palette.length === 0 || palette.length > MAX_PALETTE_COLORS) throw new Error("Palette must contain 1..128 colors.");
  const colors = new Set<string>();
  const ids = new Set<string>();
  return Object.freeze(palette.map(entry => {
    const color = paletteHex(entry.color);
    if (!validName(entry.label) || color === undefined || colors.has(color) || ids.has(entry.id)
      || !validName(entry.id) || ["__proto__", "constructor", "prototype"].includes(entry.id)
      || !["custom", "miro", "obsidian"].includes(entry.source)) throw new Error("Invalid palette entry.");
    colors.add(color);
    ids.add(entry.id);
    return Object.freeze({ ...entry, label: entry.label.trim(), color });
  }));
}

/** Framework-free ordered palette transactions, using the existing board palette shape. */
export class PaletteEditorModel {
  private palette: readonly PaletteColor[];
  private readonly defaults: readonly PaletteColor[];
  private sequence = 0;
  private saving = false;
  private disposed = false;

  public constructor(palette: readonly PaletteColor[], defaults: readonly PaletteColor[], private readonly host: PaletteEditorHost) {
    this.palette = checkedPalette(palette);
    this.defaults = checkedPalette(defaults);
  }
  public get colors(): readonly PaletteColor[] { return this.palette; }
  public get busy(): boolean { return this.saving; }
  public dispose(): void { this.disposed = true; }

  /** Parent can refresh after undo/reopen. In-flight saves must finish first. */
  public replace(palette: readonly PaletteColor[]): boolean {
    if (this.saving || this.disposed) return false;
    this.palette = checkedPalette(palette);
    return true;
  }

  public async apply(operation: PaletteOperation): Promise<PaletteResult> {
    if (this.saving || this.disposed) return { changed: false, error: "busy" };
    const palette = [...this.palette];
    const actions: AppearanceAction[] = [];
    if (operation.type === "reset") {
      palette.splice(0, palette.length, ...this.defaults);
    } else {
      const index = operation.type === "add" ? -1 : palette.findIndex(entry => entry.id === operation.id);
      if (operation.type !== "add" && index < 0) return { changed: false, error: "missing" };
      if (operation.type === "add" || operation.type === "edit") {
        if (!validName(operation.label)) return { changed: false, error: "invalidName" };
        const color = paletteHex(operation.color);
        if (color === undefined) return { changed: false, error: "invalidHex" };
        if (palette.some((entry, at) => at !== index && entry.color === color)) return { changed: false, error: "duplicate" };
        if (operation.type === "add" && palette.length >= MAX_PALETTE_COLORS) return { changed: false, error: "capacity" };
        const previous = palette[index];
        let generatedId: string;
        do { generatedId = `custom-palette-${++this.sequence}`; }
        while (palette.some(entry => entry.id === generatedId));
        const id = previous?.id ?? this.host.createId?.() ?? generatedId;
        if (previous === undefined && palette.some(entry => entry.id === id)) return { changed: false, error: "duplicate" };
        const entry: PaletteColor = { ...previous, id, label: operation.label.trim(), color, source: "custom" };
        if (operation.type === "edit") {
          palette[index] = entry;
          actions.push({ type: APPEARANCE_ACTIONS.removePaletteColor, id });
        } else palette.push(entry);
        actions.push({ type: APPEARANCE_ACTIONS.addPaletteColor, ...entry });
      } else if (operation.type === "delete") {
        if (palette.length === 1) return { changed: false, error: "lastColor" };
        palette.splice(index, 1);
        actions.push({ type: APPEARANCE_ACTIONS.removePaletteColor, id: operation.id });
      } else {
        const next = index + operation.direction;
        if (next < 0 || next >= palette.length) return { changed: false };
        [palette[index], palette[next]] = [palette[next], palette[index]];
      }
    }
    if (palette.length === this.palette.length && palette.every((entry, index) => {
      const previous = this.palette[index];
      return entry.id === previous.id && entry.label === previous.label && entry.color === previous.color && entry.source === previous.source;
    })) return { changed: false };
    let next: readonly PaletteColor[];
    try { next = checkedPalette(palette); }
    catch { return { changed: false, error: "invalidName" }; }
    this.saving = true;
    try {
      const accepted = await this.host.onChange(next, { operation, actions: Object.freeze(actions) });
      if (accepted === false) return { changed: false, error: "saveFailed" };
      if (this.disposed) return { changed: false };
      this.palette = next;
      return { changed: true };
    } catch {
      return { changed: false, error: "saveFailed" };
    } finally {
      this.saving = false;
    }
  }
}

/** Compact native form: buttons work with touch, Enter/Space and ordinary Tab order. */
export class PaletteEditor {
  public readonly element: HTMLElement;
  public readonly model: PaletteEditorModel;
  private readonly list: HTMLElement;
  private readonly form: HTMLFormElement;
  private readonly nameInput: HTMLInputElement;
  private readonly hexInput: HTMLInputElement;
  private readonly submit: HTMLButtonElement;
  private readonly cancel: HTMLButtonElement;
  private readonly status: HTMLElement;
  private readonly buttons = new Map<HTMLButtonElement, { readonly action: "edit" | "delete" | "moveUp" | "moveDown"; readonly id: string }>();
  private readonly cleanups: (() => void)[] = [];
  private editing: string | undefined;
  private disposed = false;

  public constructor(private readonly document: Document, palette: readonly PaletteColor[], defaults: readonly PaletteColor[],
    private readonly labels: PaletteEditorLabels, host: PaletteEditorHost) {
    this.model = new PaletteEditorModel(palette, defaults, host);
    this.element = this.make("div", "miro-canvas-palette-editor");
    this.element.setAttribute("role", "group");
    this.element.setAttribute("aria-label", labels.ariaLabel);
    this.list = this.element.appendChild(this.make("div", "miro-canvas-palette-editor__list"));
    this.form = this.element.appendChild(this.make("form", "miro-canvas-palette-editor__form"));
    this.nameInput = this.field(labels.name, 256);
    this.hexInput = this.field(labels.hex, 9);
    this.hexInput.setAttribute("spellcheck", "false");
    this.hexInput.setAttribute("autocomplete", "off");
    this.submit = this.form.appendChild(this.button(labels.add));
    this.submit.type = "submit";
    this.cancel = this.form.appendChild(this.button(labels.cancel));
    this.cancel.hidden = true;
    const reset = this.element.appendChild(this.button(labels.reset));
    this.status = this.element.appendChild(this.make("div", "miro-canvas-palette-editor__status"));
    this.status.setAttribute("role", "status");
    this.status.setAttribute("aria-live", "polite");
    this.listen(this.form, "submit", event => {
      event.preventDefault();
      event.stopPropagation();
      void this.run(this.editing === undefined
        ? { type: "add", label: this.nameInput.value, color: this.hexInput.value }
        : { type: "edit", id: this.editing, label: this.nameInput.value, color: this.hexInput.value });
    });
    this.listen(this.cancel, "click", () => this.clearForm());
    this.listen(reset, "click", () => { void this.run({ type: "reset" }); });
    this.listen(this.element, "pointerdown", event => event.stopPropagation());
    this.listen(this.element, "keydown", event => {
      event.stopPropagation();
      const key = event as KeyboardEvent;
      if (key.key === "Escape" && this.editing !== undefined) {
        key.preventDefault();
        this.clearForm();
        this.nameInput.focus();
      }
    });
    this.listen(this.list, "click", event => {
      const button = (event.target as Element | null)?.closest("button") as HTMLButtonElement | null;
      const choice = button === null ? undefined : this.buttons.get(button);
      if (choice === undefined || this.model.busy) return;
      if (choice.action === "edit") {
        const entry = this.model.colors.find(color => color.id === choice.id);
        if (entry === undefined) return;
        this.editing = entry.id;
        this.nameInput.value = entry.label;
        this.hexInput.value = entry.color;
        this.submit.textContent = labels.save;
        this.cancel.hidden = false;
        this.nameInput.focus();
      } else void this.run(choice.action === "delete" ? { type: "delete", id: choice.id }
        : { type: "move", id: choice.id, direction: choice.action === "moveUp" ? -1 : 1 });
    });
    this.render();
  }

  public replace(palette: readonly PaletteColor[]): boolean {
    if (!this.model.replace(palette)) return false;
    this.clearForm();
    this.render();
    return true;
  }
  public dispose(): void {
    this.disposed = true;
    this.model.dispose();
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    this.buttons.clear();
    this.element.remove();
  }
  private async run(operation: PaletteOperation): Promise<void> {
    if (this.model.busy || this.disposed) return;
    const active = this.document.activeElement as HTMLButtonElement | null;
    const focused = active === null ? undefined : this.buttons.get(active);
    const pending = this.model.apply(operation);
    this.setBusy(this.model.busy);
    const result = await pending;
    if (this.disposed) return;
    this.setBusy(false);
    this.status.textContent = result.error === undefined ? result.changed ? this.labels.saved : "" : this.labels.errors[result.error];
    this.nameInput.setAttribute("aria-invalid", String(result.error === "invalidName"));
    this.hexInput.setAttribute("aria-invalid", String(result.error === "invalidHex" || result.error === "duplicate"));
    if (!result.changed) return;
    if (operation.type !== "move") this.clearForm();
    this.render();
    if (focused !== undefined) {
      const replacement = [...this.buttons].find(([, choice]) => choice.id === focused.id && choice.action === focused.action)?.[0];
      if (replacement !== undefined && !replacement.disabled) replacement.focus();
      else this.nameInput.focus();
    }
  }
  private setBusy(busy: boolean): void {
    this.element.setAttribute("aria-busy", String(busy));
    this.element.querySelectorAll<HTMLInputElement | HTMLButtonElement>("input, button").forEach(control => { control.disabled = busy; });
    if (busy) this.status.textContent = this.labels.saving;
    else this.renderButtons();
  }
  private clearForm(): void {
    this.editing = undefined;
    this.nameInput.value = "";
    this.hexInput.value = "";
    this.submit.textContent = this.labels.add;
    this.cancel.hidden = true;
    this.nameInput.setAttribute("aria-invalid", "false");
    this.hexInput.setAttribute("aria-invalid", "false");
  }
  private renderButtons(): void {
    const colors = this.model.colors;
    for (const [button, choice] of this.buttons) {
      const index = colors.findIndex(entry => entry.id === choice.id);
      button.disabled = this.model.busy || (choice.action === "moveUp" && index === 0)
        || (choice.action === "moveDown" && index === colors.length - 1) || (choice.action === "delete" && colors.length === 1);
    }
  }
  private render(): void {
    this.buttons.clear();
    this.list.replaceChildren();
    for (const entry of this.model.colors) {
      const row = this.list.appendChild(this.make("div", "miro-canvas-palette-editor__row"));
      const swatch = row.appendChild(this.make("span", "miro-canvas-palette-editor__swatch"));
      swatch.style.setProperty("background-color", entry.color);
      swatch.setAttribute("aria-hidden", "true");
      const text = row.appendChild(this.make("span", "miro-canvas-palette-editor__label"));
      text.textContent = `${entry.label} ${entry.color}`;
      for (const action of ["edit", "delete", "moveUp", "moveDown"] as const) {
        const button = row.appendChild(this.button(this.labels[action]));
        button.setAttribute("aria-label", `${this.labels[action]}: ${entry.label}`);
        this.buttons.set(button, { action, id: entry.id });
      }
    }
    this.renderButtons();
  }
  private field(labelText: string, maxLength: number): HTMLInputElement {
    const label = this.form.appendChild(this.make("label", "miro-canvas-palette-editor__field"));
    const text = label.appendChild(this.make("span"));
    text.textContent = labelText;
    const input = label.appendChild(this.make("input"));
    input.type = "text";
    input.maxLength = maxLength;
    return input;
  }
  private button(label: string): HTMLButtonElement {
    const button = this.make("button", "miro-canvas-palette-editor__button");
    button.type = "button";
    button.textContent = label;
    return button;
  }
  private make<Tag extends keyof HTMLElementTagNameMap>(tag: Tag, className?: string): HTMLElementTagNameMap[Tag] {
    const element = createHtmlElement(this.document, tag);
    if (className !== undefined) element.className = className;
    return element;
  }
  private listen(element: HTMLElement, type: string, listener: (event: Event) => void): void {
    element.addEventListener(type, listener);
    this.cleanups.push(() => element.removeEventListener(type, listener));
  }
}
