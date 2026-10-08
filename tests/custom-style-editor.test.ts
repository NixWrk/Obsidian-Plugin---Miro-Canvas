import { describe, expect, it, vi } from "vitest";
import { CustomStyleEditor, CustomStyleEditorModel, type CustomStyleEditorHost, type CustomStyleEditorLabels } from "../src/custom-style-editor";
import type { CssSupport, CustomBoardStyle } from "../src/custom-board-styles";

const initial: readonly CustomBoardStyle[] = [
  { id: "legacy one", name: " Existing name ", declarations: "color: red;" },
  { id: "custom-style-1", name: "Blue", declarations: "color: blue;" },
];
const supports: CssSupport = (property, value) => property !== "unknown" && value !== "invalid";
const labels: CustomStyleEditorLabels = {
  ariaLabel: "Named styles", name: "Name", declarations: "Declarations", declarationHelp: "Enter local declarations only.",
  add: "Add", save: "Save", cancel: "Cancel", edit: "Edit", delete: "Delete", moveUp: "Move up", moveDown: "Move down",
  empty: "No styles", saving: "Saving", saved: "Saved",
  errors: { invalidName: "Invalid name", invalidId: "Invalid ID", duplicateId: "Duplicate ID", invalidCss: "Invalid CSS", missing: "Missing", busy: "Busy", saveFailed: "Save failed" },
  cssReasons: { syntax: "Malformed declaration", unsafe: "Unsafe declaration", unsupported: "Unsupported declaration" },
  declarationError: (index, reason) => `Declaration ${index}: ${reason}`,
};

class EditorDocument {
  activeElement: EditorElement | null = null;
  readonly defaultView = null;
  createElement(tag: string): EditorElement { return new EditorElement(tag, this); }
}
class EditorElement {
  children: EditorElement[] = [];
  parent: EditorElement | undefined;
  className = "";
  type = "";
  id = "";
  value = "";
  textContent = "";
  maxLength = 0;
  rows = 0;
  hidden = false;
  disabled = false;
  readonly attrs = new Map<string, string>();
  readonly listeners = new Map<string, (event: Event) => void>();
  constructor(readonly tag: string, readonly document: EditorDocument) {}
  appendChild(child: EditorElement): EditorElement { child.parent = this; this.children.push(child); return child; }
  replaceChildren(): void { for (const child of this.children) child.parent = undefined; this.children = []; }
  setAttribute(name: string, value: string): void { this.attrs.set(name, value); }
  addEventListener(name: string, listener: (event: Event) => void): void { this.listeners.set(name, listener); }
  removeEventListener(name: string): void { this.listeners.delete(name); }
  closest(selector: string): EditorElement | null { return this.tag === selector ? this : this.parent?.closest(selector) ?? null; }
  all(): EditorElement[] { return [this, ...this.children.flatMap(child => child.all())]; }
  querySelectorAll(_selector: string): EditorElement[] { return this.all().filter(element => ["input", "textarea", "button"].includes(element.tag)); }
  focus(): void { this.document.activeElement = this; }
  remove(): void { if (this.parent !== undefined) this.parent.children = this.parent.children.filter(child => child !== this); }
  fire(type: string, details: Record<string, unknown> = {}) {
    const event = { type, target: this, stopPropagation: vi.fn(), preventDefault: vi.fn(), ...details };
    this.listeners.get(type)?.(event as unknown as Event);
    return event;
  }
}
function fixture(host: CustomStyleEditorHost = { onChange: vi.fn(() => true) }, definitions = initial) {
  const document = new EditorDocument();
  const editor = new CustomStyleEditor(document as unknown as Document, definitions, labels, host, supports);
  const root = editor.element as unknown as EditorElement;
  const form = root.all().find(element => element.tag === "form")!;
  const name = root.all().find(element => element.tag === "input")!;
  const declarations = root.all().find(element => element.tag === "textarea")!;
  const status = root.all().find(element => element.attrs.get("role") === "status")!;
  const errors = root.all().find(element => element.tag === "ul")!;
  const rowButton = (action: string, name: string) => root.all().find(element => element.attrs.get("aria-label") === `${action}: ${name}`)!;
  const clickRow = (button: EditorElement) => root.children[0].fire("click", { target: button });
  return { document, editor, root, form, name, declarations, status, errors, rowButton, clickRow };
}
async function flush(): Promise<void> { for (let index = 0; index < 5; index++) await Promise.resolve(); }

describe("named style settings transactions", () => {
  it("adds safe non-colliding IDs and immutable snapshots without normalizing existing text", async () => {
    const onChange = vi.fn<CustomStyleEditorHost["onChange"]>(() => true);
    const model = new CustomStyleEditorModel(initial, { onChange }, supports);
    expect(await model.apply({ type: "add", name: "New", declarations: "border: 1px solid red" })).toEqual({ changed: true });
    expect(model.definitions.map(definition => definition.id)).toEqual(["legacy one", "custom-style-1", "custom-style-2"]);
    expect(model.definitions[0]).toEqual(initial[0]);
    expect(onChange.mock.calls[0][0]).toEqual(model.definitions);
    expect(Object.isFrozen(onChange.mock.calls[0][0])).toBe(true);
    expect(Object.isFrozen(onChange.mock.calls[0][0][0])).toBe(true);
    expect(initial).toHaveLength(2);
  });
  it("edits in place, retaining ID/name and unknown fields; no-op edits do not save", async () => {
    const onChange = vi.fn<CustomStyleEditorHost["onChange"]>(() => true);
    const entry = { ...initial[0], future: { preserve: true } };
    const model = new CustomStyleEditorModel([entry, initial[1]], { onChange, createId: () => { throw Error("IDs must stay stable"); } }, supports);
    const edit = { type: "edit" as const, id: entry.id, name: entry.name, declarations: "font-family: serif; color: var(--text-normal)" };
    expect(await model.apply(edit)).toEqual({ changed: true });
    expect(model.definitions[0]).toEqual({ ...entry, declarations: edit.declarations });
    expect(await model.apply(edit)).toEqual({ changed: false });
    expect(onChange).toHaveBeenCalledOnce();
  });
  it("reorders full snapshots, refuses boundary no-ops, and permits deleting all definitions", async () => {
    const onChange = vi.fn<CustomStyleEditorHost["onChange"]>(() => true);
    const model = new CustomStyleEditorModel(initial, { onChange }, supports);
    expect(await model.apply({ type: "move", id: initial[1].id, direction: -1 })).toEqual({ changed: true });
    expect(model.definitions).toEqual([initial[1], initial[0]]);
    expect(await model.apply({ type: "move", id: initial[1].id, direction: -1 })).toEqual({ changed: false });
    await model.apply({ type: "delete", id: initial[0].id });
    await model.apply({ type: "delete", id: initial[1].id });
    expect(onChange.mock.calls[2][0]).toEqual([]);
    expect(model.definitions).toEqual([]);
    expect(await model.apply({ type: "delete", id: "missing" })).toMatchObject({ error: "missing" });
    expect(onChange).toHaveBeenCalledTimes(3);
  });
  it.each([" ", "bad\u0000name", "x".repeat(257)])("rejects invalid names without saving: %s", async name => {
    const onChange = vi.fn();
    const model = new CustomStyleEditorModel([], { onChange }, supports);
    expect(await model.apply({ type: "add", name, declarations: "color: red" })).toMatchObject({ error: "invalidName" });
    expect(onChange).not.toHaveBeenCalled();
  });
  it.each(["__proto__", "constructor", "prototype", " __proto__ ", " constructor ", "", "bad\u0000id", "x".repeat(257)])("rejects unsafe generated IDs: %s", async id => {
    const onChange = vi.fn();
    const model = new CustomStyleEditorModel(initial, { onChange, createId: () => id }, supports);
    expect(await model.apply({ type: "add", name: "New", declarations: "color: red" })).toMatchObject({ error: "invalidId" });
    expect(onChange).not.toHaveBeenCalled();
  });
  it("reports duplicate and failed ID factories without persisting", async () => {
    const onChange = vi.fn();
    const collision = new CustomStyleEditorModel(initial, { onChange, createId: () => initial[0].id }, supports);
    expect(await collision.apply({ type: "add", name: "New", declarations: "color: red" })).toMatchObject({ error: "duplicateId" });
    const failing = new CustomStyleEditorModel([], { onChange, createId: () => { throw Error("ID failure"); } }, supports);
    expect(await failing.apply({ type: "add", name: "New", declarations: "" })).toMatchObject({ error: "invalidId" });
    expect(onChange).not.toHaveBeenCalled();
  });
  it("rejects every unsafe/invalid declaration atomically with indexed errors", async () => {
    const onChange = vi.fn();
    const model = new CustomStyleEditorModel(initial, { onChange }, supports);
    const result = await model.apply({ type: "edit", id: initial[0].id, name: "New", declarations: "color: red; broken; background:url(x); unknown: nope" });
    expect(result).toMatchObject({ changed: false, error: "invalidCss", cssErrors: [
      { index: 1, reason: "syntax" }, { index: 2, reason: "unsafe" }, { index: 3, reason: "unsupported" },
    ] });
    expect(model.definitions).toEqual(initial);
    expect(onChange).not.toHaveBeenCalled();
  });
  it("fails closed with visible unsupported diagnostics if an injected CSS host throws", async () => {
    const onChange = vi.fn();
    const model = new CustomStyleEditorModel([], { onChange }, () => { throw Error("CSS host unavailable"); });
    expect(await model.apply({ type: "add", name: "New", declarations: "color:red; border:1px solid blue" })).toMatchObject({
      changed: false, error: "invalidCss", cssErrors: [{ index: 0, reason: "unsupported" }, { index: 1, reason: "unsupported" }],
    });
    expect(onChange).not.toHaveBeenCalled();
  });
  it.each(["body { color:red }", "@import 'remote';", "background:u\\72l(x)", "background:image-set('x' 1x)", "cursor:var(--remote)"])("rejects network/global/obfuscated CSS: %s", async declarations => {
    const onChange = vi.fn();
    const model = new CustomStyleEditorModel([], { onChange }, supports);
    expect(await model.apply({ type: "add", name: "Unsafe", declarations })).toMatchObject({ error: "invalidCss" });
    expect(onChange).not.toHaveBeenCalled();
  });
  it("permits empty declarations and duplicate display names distinguished by stable IDs", async () => {
    const model = new CustomStyleEditorModel(initial, { onChange: () => true }, supports);
    expect(await model.apply({ type: "add", name: initial[0].name, declarations: "" })).toEqual({ changed: true });
    expect(model.definitions[2].name).toBe(initial[0].name);
    expect(model.definitions[2].id).not.toBe(initial[0].id);
  });
  it("loads invalid existing CSS for repair/removal and preserves exact names on reorder", async () => {
    const bad = { ...initial[0], declarations: "@import 'old';" };
    const model = new CustomStyleEditorModel([bad, initial[1]], { onChange: () => true }, supports);
    await model.apply({ type: "move", id: bad.id, direction: 1 });
    expect(model.definitions[1]).toEqual(bad);
    await model.apply({ type: "edit", id: bad.id, name: bad.name, declarations: "color:red" });
    expect(model.definitions[1].name).toBe(bad.name);
    await model.apply({ type: "delete", id: bad.id });
    expect(model.definitions).toEqual([initial[1]]);
  });
  it("serializes asynchronous writes, rejects refresh while saving and rolls back false/rejection", async () => {
    let finish: (accepted: boolean) => void = () => undefined;
    const model = new CustomStyleEditorModel(initial, { onChange: () => new Promise<boolean>(resolve => { finish = resolve; }) }, supports);
    const pending = model.apply({ type: "delete", id: initial[0].id });
    expect(model.busy).toBe(true);
    expect(model.definitions).toEqual(initial);
    expect(await model.apply({ type: "move", id: initial[1].id, direction: -1 })).toMatchObject({ error: "busy" });
    expect(model.replace([])).toBe(false);
    finish(false);
    expect(await pending).toMatchObject({ error: "saveFailed" });
    expect(model.definitions).toEqual(initial);
    const failure = new CustomStyleEditorModel(initial, { onChange: () => { throw Error("save failed"); } }, supports);
    expect(await failure.apply({ type: "delete", id: initial[0].id })).toMatchObject({ error: "saveFailed" });
    expect(failure.definitions).toEqual(initial);
  });
  it("suppresses late state updates after disposal and rejects invalid identity refreshes atomically", async () => {
    let finish: () => void = () => undefined;
    const model = new CustomStyleEditorModel(initial, { onChange: () => new Promise<void>(resolve => { finish = resolve; }) }, supports);
    expect(() => model.replace([initial[0], initial[0]])).toThrow();
    expect(model.definitions).toEqual(initial);
    const pending = model.apply({ type: "delete", id: initial[0].id });
    model.dispose();
    finish();
    expect(await pending).toEqual({ changed: false });
    expect(model.definitions).toEqual(initial);
    expect(model.replace([])).toBe(false);
  });
});

describe("named style native controls", () => {
  it("uses injected labels and associated native fields; IDs/descriptions do not overlap editors", () => {
    const first = fixture();
    const second = fixture();
    expect(first.root.attrs.get("aria-label")).toBe(labels.ariaLabel);
    expect(first.form.children.filter(child => child.tag === "label").map(label => label.children[0].textContent)).toEqual([labels.name, labels.declarations]);
    expect(first.declarations.tag).toBe("textarea");
    expect(first.declarations.rows).toBe(5);
    expect(first.declarations.attrs.get("aria-describedby")).toContain(first.errors.id);
    expect(first.errors.id).not.toBe(second.errors.id);
    expect(first.rowButton("Move up", initial[0].name).disabled).toBe(true);
    expect(first.rowButton("Move down", initial[1].name).disabled).toBe(true);
  });
  it("submits only valid input, shows all localized declaration errors and retains the form", async () => {
    const onChange = vi.fn();
    const { form, name, declarations, status, errors, document } = fixture({ onChange });
    name.value = "New";
    declarations.value = "color:red; broken; cursor:var(--remote); unknown:x";
    const event = form.fire("submit");
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    await flush();
    expect(onChange).not.toHaveBeenCalled();
    expect(status.textContent).toBe("Invalid CSS");
    expect(errors.children.map(child => child.textContent)).toEqual([
      "Declaration 2: Malformed declaration", "Declaration 3: Unsafe declaration (cursor)", "Declaration 4: Unsupported declaration (unknown)",
    ]);
    expect(declarations.attrs.get("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(declarations);
    expect(name.value).toBe("New");
    expect(declarations.value).toContain("broken");
  });
  it("keeps names/IDs and failed-save edit input, then succeeds with one full ordered callback", async () => {
    let accepted = false;
    const onChange = vi.fn<CustomStyleEditorHost["onChange"]>(() => accepted);
    const { editor, clickRow, rowButton, form, name, declarations, status } = fixture({ onChange });
    clickRow(rowButton("Edit", initial[0].name));
    expect(name.value).toBe(initial[0].name);
    expect(declarations.value).toBe(initial[0].declarations);
    declarations.value = "border: 2px solid blue";
    form.fire("submit");
    await flush();
    expect(editor.model.definitions).toEqual(initial);
    expect(status.textContent).toBe("Save failed");
    expect(name.value).toBe(initial[0].name);
    expect(declarations.value).toBe("border: 2px solid blue");
    accepted = true;
    form.fire("submit");
    await flush();
    expect(editor.model.definitions[0]).toEqual({ ...initial[0], declarations: "border: 2px solid blue" });
    expect(onChange.mock.calls[1][0][1]).toEqual(initial[1]);
    expect(name.value).toBe("");
    expect(status.textContent).toBe("Saved");
  });
  it("names rejected geometry/gesture properties through existing localized labels without saving", async () => {
    const onChange = vi.fn();
    const { form, name, declarations, errors, editor } = fixture({ onChange });
    name.value = "Visual";
    declarations.value = "font-size:20px; Transform:rotate(20deg); pointer-events:none; width:100px";
    form.fire("submit");
    await flush();
    expect(errors.children.map(item => item.textContent)).toEqual([
      "Declaration 2: Unsafe declaration (transform)", "Declaration 3: Unsafe declaration (pointer-events)", "Declaration 4: Unsafe declaration (width)",
    ]);
    expect(onChange).not.toHaveBeenCalled();
    expect(editor.model.definitions).toEqual(initial);
    expect(name.value).toBe("Visual");
    expect(declarations.value).toContain("Transform");
    expect(Object.keys(labels.cssReasons).sort()).toEqual(["syntax", "unsafe", "unsupported"]);
  });
  it("keeps keyboard/newline defaults and touch ownership; Escape cancels editing", () => {
    const { root, name, declarations, document, clickRow, rowButton } = fixture();
    clickRow(rowButton("Edit", initial[1].name));
    const enter = root.fire("keydown", { key: "Enter", target: declarations });
    expect(enter.stopPropagation).toHaveBeenCalledOnce();
    expect(enter.preventDefault).not.toHaveBeenCalled();
    expect(root.fire("pointerdown").stopPropagation).toHaveBeenCalledOnce();
    expect(root.fire("click").stopPropagation).toHaveBeenCalledOnce();
    expect(root.fire("keydown", { key: "Escape" }).preventDefault).toHaveBeenCalledOnce();
    expect(name.value).toBe("");
    expect(declarations.value).toBe("");
    expect(document.activeElement).toBe(name);
  });
  it("blocks Escape/replace/row actions during a save without losing submitted input", async () => {
    let finish: () => void = () => undefined;
    const onChange = vi.fn<CustomStyleEditorHost["onChange"]>(() => new Promise<void>(resolve => { finish = resolve; }));
    const { editor, root, form, name, declarations, status, clickRow, rowButton } = fixture({ onChange });
    clickRow(rowButton("Edit", initial[0].name));
    declarations.value = "color:green";
    form.fire("submit");
    expect(root.attrs.get("aria-busy")).toBe("true");
    expect(name.disabled).toBe(true);
    expect(declarations.disabled).toBe(true);
    expect(status.textContent).toBe("Saving");
    root.fire("keydown", { key: "Escape" });
    expect(name.value).toBe(initial[0].name);
    expect(editor.replace([])).toBe(false);
    clickRow(rowButton("Delete", initial[1].name));
    expect(onChange).toHaveBeenCalledOnce();
    finish();
    await flush();
    expect(root.attrs.get("aria-busy")).toBe("false");
    expect(name.disabled).toBe(false);
  });
  it("reorders while preserving unsaved draft and restores focus; deleting the edited row clears it", async () => {
    const { editor, document, name, declarations, clickRow, rowButton } = fixture();
    clickRow(rowButton("Edit", initial[0].name));
    declarations.value = "unsaved draft";
    const up = rowButton("Move up", initial[1].name);
    up.focus();
    clickRow(up);
    await flush();
    expect(editor.model.definitions).toEqual([initial[1], initial[0]]);
    expect(name.value).toBe(initial[0].name);
    expect(declarations.value).toBe("unsaved draft");
    expect(document.activeElement).toBe(name);
    clickRow(rowButton("Delete", initial[0].name));
    await flush();
    expect(name.value).toBe("");
    expect(declarations.value).toBe("");
  });
  it("allows deleting the final row, renders localized empty state and supports external refresh", async () => {
    const { editor, root, clickRow, rowButton } = fixture(undefined, [initial[0]]);
    const deletion = rowButton("Delete", initial[0].name);
    expect(deletion.disabled).toBe(false);
    clickRow(deletion);
    await flush();
    expect(editor.model.definitions).toEqual([]);
    expect(root.all().some(element => element.textContent === labels.empty)).toBe(true);
    expect(editor.replace(initial)).toBe(true);
    expect(rowButton("Edit", initial[1].name)).toBeDefined();
  });
  it("focuses invalid names and never parses persisted names as markup", async () => {
    const { root, form, name, declarations, document, status } = fixture();
    name.value = "";
    declarations.value = "color:red";
    form.fire("submit");
    await flush();
    expect(name.attrs.get("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(name);
    expect(status.textContent).toBe(labels.errors.invalidName);
    name.value = "<img src='https://example.invalid/x'>";
    form.fire("submit");
    await flush();
    expect(root.all().some(element => element.textContent === "<img src='https://example.invalid/x'>")).toBe(true);
    expect(root.all().some(element => element.tag === "img")).toBe(false);
  });
  it("removes listeners and leaves closed UI untouched when a pending save resolves", async () => {
    let finish: () => void = () => undefined;
    const { editor, root, form, name, declarations, status } = fixture({ onChange: () => new Promise<void>(resolve => { finish = resolve; }) });
    name.value = "New";
    declarations.value = "color:red";
    form.fire("submit");
    const previousStatus = status.textContent;
    editor.dispose();
    editor.dispose();
    finish();
    await flush();
    expect(status.textContent).toBe(previousStatus);
    expect(root.all().every(element => element.listeners.size === 0)).toBe(true);
    expect(editor.replace(initial)).toBe(false);
  });
});
