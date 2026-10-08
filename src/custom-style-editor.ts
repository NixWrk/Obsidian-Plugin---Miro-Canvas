import { hasAsciiControl } from "./control-characters";
import { localCssSupport, parseLocalCss, type CssDeclarationError, type CssSupport, type CustomBoardStyle } from "./custom-board-styles";
import { createHtmlElement } from "./dom-elements";

export type CustomStyleEditorError = "invalidName" | "invalidId" | "duplicateId" | "invalidCss" | "missing" | "busy" | "saveFailed";
export type CustomStyleOperation = { readonly type: "add"; readonly name: string; readonly declarations: string }
  | { readonly type: "edit"; readonly id: string; readonly name: string; readonly declarations: string }
  | { readonly type: "delete"; readonly id: string }
  | { readonly type: "move"; readonly id: string; readonly direction: -1 | 1 };
export interface CustomStyleEditorHost {
  /** Persist the full ordered settings.customStyles atomically. False/rejection retains the old snapshot. */
  readonly onChange: (definitions: readonly CustomBoardStyle[]) => void | boolean | Promise<void | boolean>;
  readonly createId?: () => string;
}
export interface CustomStyleEditorLabels {
  readonly ariaLabel: string;
  readonly name: string;
  readonly declarations: string;
  readonly declarationHelp: string;
  readonly add: string;
  readonly save: string;
  readonly cancel: string;
  readonly edit: string;
  readonly delete: string;
  readonly moveUp: string;
  readonly moveDown: string;
  readonly empty: string;
  readonly saving: string;
  readonly saved: string;
  readonly errors: Readonly<Record<CustomStyleEditorError, string>>;
  readonly cssReasons: Readonly<Record<CssDeclarationError["reason"], string>>;
  /** Localized message including the 1-based declaration number and its reason. */
  readonly declarationError: (index: number, reason: string) => string;
}
export interface CustomStyleEditorResult {
  readonly changed: boolean;
  readonly error?: CustomStyleEditorError;
  readonly cssErrors?: readonly CssDeclarationError[];
}

/** IDs are opaque data keys, never interpolated into selectors or declarations. */
function safeStyleId(id: string): boolean {
  return typeof id === "string" && id.trim().length > 0 && id.length <= 256 && !hasAsciiControl(id)
    && !["__proto__", "constructor", "prototype"].includes(id.trim());
}
function validStyleName(name: string): boolean {
  return typeof name === "string" && name.trim().length > 0 && name.length <= 256 && !hasAsciiControl(name);
}
function definitionSnapshot(definitions: readonly CustomBoardStyle[]): readonly CustomBoardStyle[] {
  const ids = new Set<string>();
  return Object.freeze(definitions.map(definition => {
    if (!safeStyleId(definition.id) || ids.has(definition.id) || typeof definition.name !== "string"
      || typeof definition.declarations !== "string") throw new Error("Invalid custom style definition identity or shape.");
    ids.add(definition.id);
    // Keep existing text verbatim, including CSS needing repair in this browser.
    return Object.freeze({ ...definition });
  }));
}

/** Ordered settings transactions; rendering and board assignments stay with the parent. */
export class CustomStyleEditorModel {
  private definitionsValue: readonly CustomBoardStyle[];
  private sequence = 0;
  private saving = false;
  private disposed = false;

  public constructor(definitions: readonly CustomBoardStyle[], private readonly host: CustomStyleEditorHost,
    private readonly supports: CssSupport) {
    this.definitionsValue = definitionSnapshot(definitions);
  }
  public get definitions(): readonly CustomBoardStyle[] { return this.definitionsValue; }
  public get busy(): boolean { return this.saving; }
  public dispose(): void { this.disposed = true; }

  /** Refresh on parent undo/reopen only after an in-flight save has settled. */
  public replace(definitions: readonly CustomBoardStyle[]): boolean {
    if (this.saving || this.disposed) return false;
    this.definitionsValue = definitionSnapshot(definitions);
    return true;
  }

  public async apply(operation: CustomStyleOperation): Promise<CustomStyleEditorResult> {
    if (this.saving || this.disposed) return { changed: false, error: "busy" };
    const definitions = [...this.definitionsValue];
    const index = operation.type === "add" ? -1 : definitions.findIndex(definition => definition.id === operation.id);
    if (operation.type !== "add" && index < 0) return { changed: false, error: "missing" };
    if (operation.type === "add" || operation.type === "edit") {
      if (!validStyleName(operation.name)) return { changed: false, error: "invalidName" };
      const result = parseLocalCss(operation.declarations, (property, value) => {
        try { return this.supports(property, value); }
        catch { return false; }
      });
      if (!result.valid) return { changed: false, error: "invalidCss", cssErrors: result.errors };
      const previous = definitions[index];
      let id = previous?.id;
      if (id === undefined) {
        try {
          if (this.host.createId !== undefined) id = this.host.createId();
          else {
            do { id = `custom-style-${++this.sequence}`; }
            while (definitions.some(definition => definition.id === id));
          }
        } catch {
          return { changed: false, error: "invalidId" };
        }
        if (!safeStyleId(id)) return { changed: false, error: "invalidId" };
        if (definitions.some(definition => definition.id === id)) return { changed: false, error: "duplicateId" };
      }
      const definition = { ...previous, id, name: operation.name, declarations: operation.declarations };
      if (previous !== undefined) {
        if (previous.name === definition.name && previous.declarations === definition.declarations) return { changed: false };
        definitions[index] = definition;
      } else definitions.push(definition);
    } else if (operation.type === "delete") definitions.splice(index, 1);
    else {
      const next = index + operation.direction;
      if (next < 0 || next >= definitions.length || (operation.direction !== -1 && operation.direction !== 1)) return { changed: false };
      [definitions[index], definitions[next]] = [definitions[next], definitions[index]];
    }
    const next = definitionSnapshot(definitions);
    this.saving = true;
    try {
      const accepted = await this.host.onChange(next);
      if (accepted === false) return { changed: false, error: "saveFailed" };
      if (this.disposed) return { changed: false };
      this.definitionsValue = next;
      return { changed: true };
    } catch {
      return { changed: false, error: "saveFailed" };
    } finally {
      this.saving = false;
    }
  }
}

type RowAction = "edit" | "delete" | "moveUp" | "moveDown";
let editorSequence = 0;

/** Native fields/buttons for an existing settings row or dialog; user CSS is never previewed here. */
export class CustomStyleEditor {
  public readonly element: HTMLElement;
  public readonly model: CustomStyleEditorModel;
  private readonly list: HTMLElement;
  private readonly form: HTMLFormElement;
  private readonly nameInput: HTMLInputElement;
  private readonly declarationsInput: HTMLTextAreaElement;
  private readonly submit: HTMLButtonElement;
  private readonly cancel: HTMLButtonElement;
  private readonly status: HTMLElement;
  private readonly errors: HTMLElement;
  private readonly rows = new Map<HTMLButtonElement, { readonly action: RowAction; readonly id: string }>();
  private readonly cleanups: (() => void)[] = [];
  private editing: string | undefined;
  private disposed = false;

  public constructor(private readonly document: Document, definitions: readonly CustomBoardStyle[],
    private readonly labels: CustomStyleEditorLabels, host: CustomStyleEditorHost,
    supports: CssSupport = localCssSupport(document)) {
    this.model = new CustomStyleEditorModel(definitions, host, supports);
    const id = `miro-custom-style-editor-${++editorSequence}`;
    this.element = this.make("div", "miro-canvas-custom-style-editor");
    this.element.setAttribute("role", "group");
    this.element.setAttribute("aria-label", labels.ariaLabel);
    this.list = this.element.appendChild(this.make("div", "miro-canvas-custom-style-editor__list"));
    this.form = this.element.appendChild(this.make("form", "miro-canvas-custom-style-editor__form"));
    const nameLabel = this.form.appendChild(this.label(labels.name));
    this.nameInput = nameLabel.appendChild(this.make("input"));
    this.nameInput.type = "text";
    this.nameInput.maxLength = 256;
    const declarationsLabel = this.form.appendChild(this.label(labels.declarations));
    this.declarationsInput = declarationsLabel.appendChild(this.make("textarea", "miro-canvas-custom-style-editor__declarations"));
    this.declarationsInput.rows = 5;
    this.declarationsInput.setAttribute("spellcheck", "false");
    this.declarationsInput.setAttribute("autocapitalize", "off");
    this.declarationsInput.setAttribute("autocomplete", "off");
    const help = this.form.appendChild(this.make("p", "miro-canvas-custom-style-editor__help"));
    help.id = `${id}-help`;
    help.textContent = labels.declarationHelp;
    this.submit = this.form.appendChild(this.button(labels.add));
    this.submit.type = "submit";
    this.cancel = this.form.appendChild(this.button(labels.cancel));
    this.cancel.hidden = true;
    this.status = this.element.appendChild(this.make("div", "miro-canvas-custom-style-editor__status"));
    this.status.id = `${id}-status`;
    this.status.setAttribute("role", "status");
    this.status.setAttribute("aria-live", "polite");
    this.errors = this.element.appendChild(this.make("ul", "miro-canvas-custom-style-editor__errors"));
    this.errors.id = `${id}-errors`;
    this.nameInput.setAttribute("aria-describedby", this.status.id);
    this.declarationsInput.setAttribute("aria-describedby", `${help.id} ${this.status.id} ${this.errors.id}`);
    this.listen(this.form, "submit", event => {
      event.preventDefault();
      event.stopPropagation();
      void this.run(this.editing === undefined
        ? { type: "add", name: this.nameInput.value, declarations: this.declarationsInput.value }
        : { type: "edit", id: this.editing, name: this.nameInput.value, declarations: this.declarationsInput.value });
    });
    this.listen(this.cancel, "click", () => {
      if (this.model.busy) return;
      this.clearForm();
      this.clearFeedback();
      this.nameInput.focus();
    });
    this.listen(this.element, "pointerdown", event => event.stopPropagation());
    this.listen(this.element, "click", event => event.stopPropagation());
    this.listen(this.element, "keydown", event => {
      event.stopPropagation();
      const key = event as KeyboardEvent;
      if (key.key === "Escape" && this.editing !== undefined && !this.model.busy) {
        key.preventDefault();
        this.clearForm();
        this.clearFeedback();
        this.nameInput.focus();
      }
    });
    this.listen(this.list, "click", event => {
      const button = (event.target as Element | null)?.closest("button") as HTMLButtonElement | null;
      const choice = button === null ? undefined : this.rows.get(button);
      if (choice === undefined || this.model.busy || button?.disabled) return;
      if (choice.action === "edit") {
        const definition = this.model.definitions.find(entry => entry.id === choice.id);
        if (definition === undefined) return;
        this.editing = definition.id;
        this.nameInput.value = definition.name;
        this.declarationsInput.value = definition.declarations;
        this.submit.textContent = labels.save;
        this.cancel.hidden = false;
        this.clearFeedback();
        this.nameInput.focus();
      } else void this.run(choice.action === "delete" ? { type: "delete", id: choice.id }
        : { type: "move", id: choice.id, direction: choice.action === "moveUp" ? -1 : 1 });
    });
    this.render();
  }

  public replace(definitions: readonly CustomBoardStyle[]): boolean {
    if (!this.model.replace(definitions)) return false;
    this.clearForm();
    this.clearFeedback();
    this.render();
    return true;
  }
  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.model.dispose();
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    this.rows.clear();
    this.element.remove();
  }
  private async run(operation: CustomStyleOperation): Promise<void> {
    if (this.model.busy || this.disposed) return;
    const active = this.document.activeElement as HTMLButtonElement | null;
    const focused = active === null ? undefined : this.rows.get(active);
    const pending = this.model.apply(operation);
    this.setBusy(this.model.busy);
    const result = await pending;
    if (this.disposed) return;
    this.setBusy(false);
    this.clearFeedback();
    this.status.textContent = result.error === undefined ? result.changed ? this.labels.saved : "" : this.labels.errors[result.error];
    if (result.error === "invalidName") {
      this.nameInput.setAttribute("aria-invalid", "true");
      this.nameInput.focus();
    }
    if (result.error === "invalidCss") {
      this.declarationsInput.setAttribute("aria-invalid", "true");
      for (const error of result.cssErrors ?? []) {
        const item = this.errors.appendChild(this.make("li"));
        const reason = this.labels.cssReasons[error.reason];
        item.textContent = this.labels.declarationError(error.index + 1, error.property === undefined ? reason : `${reason} (${error.property})`);
      }
      this.declarationsInput.focus();
    }
    if (result.error !== undefined) return;
    const editingDeleted = operation.type === "delete" && operation.id === this.editing;
    if (operation.type === "add" || operation.type === "edit" || editingDeleted) this.clearForm();
    if (!result.changed) return;
    this.render();
    if (focused !== undefined) {
      const replacement = [...this.rows].find(([, choice]) => choice.id === focused.id && choice.action === focused.action)?.[0];
      if (replacement !== undefined && !replacement.disabled) replacement.focus();
      else this.nameInput.focus();
    }
  }
  private setBusy(busy: boolean): void {
    this.element.setAttribute("aria-busy", String(busy));
    this.element.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement>("input, textarea, button")
      .forEach(control => { control.disabled = busy; });
    if (busy) this.status.textContent = this.labels.saving;
    else this.refreshButtons();
  }
  private clearFeedback(): void {
    this.status.textContent = "";
    this.errors.replaceChildren();
    this.nameInput.setAttribute("aria-invalid", "false");
    this.declarationsInput.setAttribute("aria-invalid", "false");
  }
  private clearForm(): void {
    this.editing = undefined;
    this.nameInput.value = "";
    this.declarationsInput.value = "";
    this.submit.textContent = this.labels.add;
    this.cancel.hidden = true;
  }
  private refreshButtons(): void {
    for (const [button, choice] of this.rows) {
      const index = this.model.definitions.findIndex(definition => definition.id === choice.id);
      button.disabled = this.model.busy || (choice.action === "moveUp" && index === 0)
        || (choice.action === "moveDown" && index === this.model.definitions.length - 1);
    }
  }
  private render(): void {
    this.rows.clear();
    this.list.replaceChildren();
    if (this.model.definitions.length === 0) {
      const empty = this.list.appendChild(this.make("p", "miro-canvas-custom-style-editor__empty"));
      empty.textContent = this.labels.empty;
    }
    for (const definition of this.model.definitions) {
      const row = this.list.appendChild(this.make("div", "miro-canvas-custom-style-editor__row"));
      const name = row.appendChild(this.make("span", "miro-canvas-custom-style-editor__name"));
      name.textContent = definition.name;
      for (const action of ["edit", "delete", "moveUp", "moveDown"] as const) {
        const button = row.appendChild(this.button(this.labels[action]));
        button.setAttribute("aria-label", `${this.labels[action]}: ${definition.name}`);
        this.rows.set(button, { action, id: definition.id });
      }
    }
    this.refreshButtons();
  }
  private label(text: string): HTMLLabelElement {
    const label = this.make("label", "miro-canvas-custom-style-editor__field");
    const span = label.appendChild(this.make("span"));
    span.textContent = text;
    return label;
  }
  private button(text: string): HTMLButtonElement {
    const button = this.make("button", "miro-canvas-custom-style-editor__button");
    button.type = "button";
    button.textContent = text;
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
