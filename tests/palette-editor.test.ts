import { describe, expect, it, vi } from "vitest";
import { APPEARANCE_ACTIONS, toAppearanceMetadata, type PaletteColor } from "../src/appearance";
import { PaletteEditor, PaletteEditorModel, paletteHex, type PaletteEditorLabels, type PaletteEditorHost } from "../src/palette-editor";

const initial: readonly PaletteColor[] = [
  { id: "red", label: "Red", color: "#ff0000", source: "miro", future: { preserved: true } },
  { id: "blue", label: "Blue", color: "#0000ff", source: "obsidian" },
];
const defaults: readonly PaletteColor[] = [{ id: "gray", label: "Gray", color: "#888888", source: "obsidian" }];
const labels: PaletteEditorLabels = {
  ariaLabel: "Palette", name: "Name", hex: "Hex color", add: "Add", save: "Save", cancel: "Cancel", edit: "Edit", delete: "Delete",
  moveUp: "Move up", moveDown: "Move down", reset: "Reset", saving: "Saving", saved: "Saved",
  errors: { invalidName: "Invalid name", invalidHex: "Invalid hex", duplicate: "Duplicate", capacity: "Full", lastColor: "Last color", missing: "Missing", busy: "Busy", saveFailed: "Save failed" },
};

class PaletteElement {
  children: PaletteElement[] = [];
  parent: PaletteElement | undefined;
  className = "";
  type = "";
  value = "";
  textContent = "";
  maxLength = 0;
  hidden = false;
  disabled = false;
  readonly attrs = new Map<string, string>();
  readonly listeners = new Map<string, (event: Event) => void>();
  readonly style = { setProperty: vi.fn() };
  constructor(readonly tag: string, readonly document: PaletteDocument) {}
  appendChild(child: PaletteElement): PaletteElement { this.children.push(child); child.parent = this; return child; }
  replaceChildren(): void { for (const child of this.children) child.parent = undefined; this.children = []; }
  setAttribute(name: string, value: string): void { this.attrs.set(name, value); }
  addEventListener(name: string, listener: (event: Event) => void): void { this.listeners.set(name, listener); }
  removeEventListener(name: string): void { this.listeners.delete(name); }
  closest(selector: string): PaletteElement | null { return this.tag === selector ? this : this.parent?.closest(selector) ?? null; }
  all(): PaletteElement[] { return [this, ...this.children.flatMap(child => child.all())]; }
  querySelectorAll(_selector: string): PaletteElement[] { return this.all().filter(element => ["input", "button"].includes(element.tag)); }
  focus(): void { this.document.activeElement = this; }
  remove(): void { if (this.parent !== undefined) this.parent.children = this.parent.children.filter(child => child !== this); }
  fire(type: string, details: Record<string, unknown> = {}): { stopPropagation: ReturnType<typeof vi.fn>; preventDefault: ReturnType<typeof vi.fn> } {
    const event = { type, target: this, stopPropagation: vi.fn(), preventDefault: vi.fn(), ...details };
    this.listeners.get(type)?.(event as unknown as Event);
    return event;
  }
}
class PaletteDocument {
  readonly defaultView = null;
  activeElement: PaletteElement | null = null;
  createElement(tag: string): PaletteElement { return new PaletteElement(tag, this); }
}
async function flush(): Promise<void> { for (let index = 0; index < 5; index++) await Promise.resolve(); }

describe("palette transactions", () => {
  it.each([["#AbC", "#aabbcc"], [" #ABCD ", "#aabbccdd"], ["#ABCDEF", "#abcdef"], ["#01234567", "#01234567"]])("normalizes %s", (input, result) => {
    expect(paletteHex(input)).toBe(result);
  });
  it.each(["red", "rgb(1,2,3)", "#12", "#12345", "#1234567", "#gggggg", "url(x)"])("rejects non-hex %s", value => {
    expect(paletteHex(value)).toBeUndefined();
  });
  it("adds/edits/deletes with existing appearance actions and persistable full snapshots", async () => {
    const callback = vi.fn<PaletteEditorHost["onChange"]>(() => true);
    const model = new PaletteEditorModel(initial, defaults, { onChange: callback });
    expect(await model.apply({ type: "add", label: "Green", color: "#0f0" })).toEqual({ changed: true });
    expect(callback.mock.calls[0][0]).toHaveLength(3);
    expect(callback.mock.calls[0][1].actions[0].type).toBe(APPEARANCE_ACTIONS.addPaletteColor);
    expect(await model.apply({ type: "edit", id: "red", label: "Warm", color: "#f80" })).toEqual({ changed: true });
    const edited = model.colors[0];
    expect(edited).toMatchObject({ id: "red", label: "Warm", color: "#ff8800", source: "custom", future: { preserved: true } });
    expect(callback.mock.calls[1][1].actions.map(action => action.type)).toEqual([APPEARANCE_ACTIONS.removePaletteColor, APPEARANCE_ACTIONS.addPaletteColor]);
    expect(toAppearanceMetadata({ settings: { palette: model.colors }, localOverrides: {} }).settings.palette[0]).toMatchObject(edited);
    await model.apply({ type: "delete", id: "blue" });
    expect(callback.mock.calls[2][1].actions).toEqual([{ type: APPEARANCE_ACTIONS.removePaletteColor, id: "blue" }]);
    expect(initial[0].label).toBe("Red");
    expect(Object.isFrozen(callback.mock.calls[0][0])).toBe(true);
  });
  it("reorders/resets through atomic snapshots and preserves stable ids and unknown fields", async () => {
    const callback = vi.fn<PaletteEditorHost["onChange"]>(() => true);
    const model = new PaletteEditorModel(initial, defaults, { onChange: callback });
    await model.apply({ type: "move", id: "blue", direction: -1 });
    expect(model.colors.map(entry => entry.id)).toEqual(["blue", "red"]);
    expect(model.colors[1].future).toEqual({ preserved: true });
    expect(callback.mock.calls[0][1].actions).toEqual([]);
    expect(await model.apply({ type: "move", id: "blue", direction: -1 })).toEqual({ changed: false });
    await model.apply({ type: "reset" });
    expect(model.colors).toEqual(defaults);
    expect(await model.apply({ type: "reset" })).toEqual({ changed: false });
    expect(await model.apply({ type: "delete", id: "gray" })).toEqual({ changed: false, error: "lastColor" });
    expect(callback).toHaveBeenCalledTimes(2);
  });
  it("rejects invalid/duplicate entries without invoking persistence", async () => {
    const callback = vi.fn();
    const model = new PaletteEditorModel(initial, defaults, { onChange: callback });
    expect(await model.apply({ type: "add", label: " ", color: "#123456" })).toMatchObject({ error: "invalidName" });
    expect(await model.apply({ type: "add", label: "Bad\u0000name", color: "#123456" })).toMatchObject({ error: "invalidName" });
    expect(await model.apply({ type: "add", label: "X", color: "url(x)" })).toMatchObject({ error: "invalidHex" });
    expect(await model.apply({ type: "add", label: "X", color: "#F00" })).toMatchObject({ error: "duplicate" });
    expect(await model.apply({ type: "edit", id: "absent", label: "X", color: "#abc" })).toMatchObject({ error: "missing" });
    expect(callback).not.toHaveBeenCalled();
    const full = Array.from({ length: 128 }, (_, index) => ({ id: `c${index}`, label: `C${index}`, color: `#${index.toString(16).padStart(6, "0")}`, source: "custom" as const }));
    const large = new PaletteEditorModel(full, defaults, { onChange: callback });
    expect(await large.apply({ type: "add", label: "X", color: "#ffffff" })).toMatchObject({ error: "capacity" });
    expect(callback).not.toHaveBeenCalled();
  });
  it("serializes async persistence, rolls back rejection and survives disposal during save", async () => {
    let finish: (value: boolean) => void = () => undefined;
    const model = new PaletteEditorModel(initial, defaults, { onChange: () => new Promise<boolean>(resolve => { finish = resolve; }) });
    const save = model.apply({ type: "reset" });
    expect(model.busy).toBe(true);
    expect(model.colors).toEqual(initial);
    expect(model.replace(defaults)).toBe(false);
    expect(await model.apply({ type: "delete", id: "blue" })).toMatchObject({ error: "busy" });
    finish(false);
    expect(await save).toMatchObject({ error: "saveFailed" });
    expect(model.colors).toEqual(initial);
    const next = model.apply({ type: "reset" });
    model.dispose();
    finish(true);
    expect(await next).toEqual({ changed: false });
    expect(model.colors).toEqual(initial);
  });
  it("keeps state on thrown saves and malformed refreshes", async () => {
    const callback = vi.fn(() => { throw new Error("disk full"); });
    const model = new PaletteEditorModel(initial, defaults, { onChange: callback });
    expect(await model.apply({ type: "reset" })).toMatchObject({ error: "saveFailed" });
    expect(model.colors).toEqual(initial);
    expect(() => model.replace([])).toThrow();
    expect(() => new PaletteEditorModel([{ ...initial[0], id: "__proto__" }], defaults, { onChange: callback })).toThrow();
  });
});

describe("palette native form", () => {
  it("uses supplied labels, native fields/buttons, keyboard isolation and touch event ownership", () => {
    const document = new PaletteDocument();
    const editor = new PaletteEditor(document as unknown as Document, initial, defaults, labels, { onChange: vi.fn() });
    const root = editor.element as unknown as PaletteElement;
    expect(root.attrs.get("aria-label")).toBe("Palette");
    expect(root.all().filter(element => element.tag === "label").map(element => element.children[0].textContent)).toEqual(["Name", "Hex color"]);
    expect(root.fire("keydown", { key: "Delete" }).stopPropagation).toHaveBeenCalledOnce();
    expect(root.fire("pointerdown").stopPropagation).toHaveBeenCalledOnce();
    const deleteButtons = root.all().filter(element => element.attrs.get("aria-label")?.startsWith("Delete:"));
    expect(deleteButtons).toHaveLength(2);
    editor.dispose();
    expect(root.listeners.size).toBe(0);
  });
  it("submits a validated form; preserves invalid text and reports persistence failure", async () => {
    const document = new PaletteDocument();
    const callback = vi.fn(() => false);
    const editor = new PaletteEditor(document as unknown as Document, initial, defaults, labels, { onChange: callback });
    const root = editor.element as unknown as PaletteElement;
    const form = root.all().find(element => element.tag === "form")!;
    const [name, hex] = root.all().filter(element => element.tag === "input");
    name.value = "New";
    hex.value = "url(x)";
    expect(form.fire("submit").preventDefault).toHaveBeenCalledOnce();
    await flush();
    expect(callback).not.toHaveBeenCalled();
    expect(hex.value).toBe("url(x)");
    expect(hex.attrs.get("aria-invalid")).toBe("true");
    hex.value = "#abc";
    form.fire("submit");
    await flush();
    expect(callback).toHaveBeenCalledOnce();
    expect(editor.model.colors).toEqual(initial);
    expect(root.all().find(element => element.attrs.get("role") === "status")!.textContent).toBe("Save failed");
    expect(name.value).toBe("New");
  });
  it("edits by touch/click, cancels with Escape and keeps focus after reordering", async () => {
    const document = new PaletteDocument();
    const editor = new PaletteEditor(document as unknown as Document, initial, defaults, labels, { onChange: vi.fn(() => true) });
    const root = editor.element as unknown as PaletteElement;
    const list = root.children[0];
    const edit = root.all().find(element => element.attrs.get("aria-label") === "Edit: Red")!;
    list.fire("click", { target: edit });
    const [name, hex] = root.all().filter(element => element.tag === "input");
    expect(name.value).toBe("Red");
    expect(hex.value).toBe("#ff0000");
    expect(document.activeElement).toBe(name);
    root.fire("keydown", { key: "Escape" });
    expect(name.value).toBe("");
    const down = root.all().find(element => element.attrs.get("aria-label") === "Move down: Red")!;
    down.focus();
    list.fire("click", { target: down });
    await flush();
    expect(editor.model.colors.map(entry => entry.id)).toEqual(["blue", "red"]);
    // Its moved button is now disabled at the end; focus returns to the form.
    expect(document.activeElement).toBe(name);
  });
});
