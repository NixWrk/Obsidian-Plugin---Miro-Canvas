import { describe, expect, it } from "vitest";
import { CardAppearance, hasCardCorners } from "../src/card-appearance";

function rig() {
  const attributes = new Map<string, string>();
  const properties = new Map<string, { value: string; priority: string }>();
  const descendants = new Set<unknown>();
  const root = {
    getAttribute: (name: string) => attributes.get(name) ?? null,
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    removeAttribute: (name: string) => attributes.delete(name),
    contains: (value: unknown) => descendants.has(value),
    style: {
      getPropertyValue: (name: string) => properties.get(name)?.value ?? "",
      getPropertyPriority: (name: string) => properties.get(name)?.priority ?? "",
      setProperty: (name: string, value: string, priority = "") => properties.set(name, { value, priority }),
      removeProperty: (name: string) => properties.delete(name),
    },
  };
  const card = (sourceKind?: string) => {
    const fields = new Map<string, string>(sourceKind ? [["data-miro-source-kind", sourceKind]] : []);
    const element = {
      getAttribute: (name: string) => fields.get(name) ?? null,
      setAttribute: (name: string, value: string) => fields.set(name, value),
      removeAttribute: (name: string) => fields.delete(name),
    };
    descendants.add(element);
    return { element: element as unknown as HTMLElement, fields };
  };
  return { root: root as unknown as HTMLElement, properties, descendants, card };
}

describe("card corner decoration", () => {
  it("preserves diagram, drawing, sticky and group geometry", () => {
    for (const source of ["shape", "drawing", "sticky", "text", "table", "mindmap-node"]) {
      expect(hasCardCorners("text", source, false)).toBe(false);
    }
    expect(hasCardCorners("group", null, false)).toBe(false);
    expect(hasCardCorners("text", "text", true)).toBe(true);
    for (const kind of ["text", "file", "link"]) expect(hasCardCorners(kind, null, false)).toBe(true);
  });

  it("marks only owned cards, handles a changed card kind and restores detached values", () => {
    const r = rig();
    r.root.style.setProperty("--miro-canvas-card-radius", "9px", "important");
    const appearance = new CardAppearance(r.root, { cardCornerRadius: 0 });
    const first = r.card();
    first.fields.set("data-miro-canvas-card-corners", "previous");
    appearance.mark(first.element, "text");
    expect(first.fields.get("data-miro-canvas-card-corners")).toBe("true");
    expect(r.root.style.getPropertyValue("--miro-canvas-card-radius")).toBe("0px");
    first.fields.set("data-miro-source-kind", "shape");
    appearance.mark(first.element, "text");
    expect(first.fields.get("data-miro-canvas-card-corners")).toBe("previous");
    first.fields.delete("data-miro-source-kind");
    appearance.mark(first.element, "text");
    r.descendants.delete(first.element);
    const unrelated = r.card();
    r.descendants.delete(unrelated.element);
    appearance.mark(unrelated.element, "text");
    expect(unrelated.fields.has("data-miro-canvas-card-corners")).toBe(false);
    appearance.dispose();
    expect(first.fields.get("data-miro-canvas-card-corners")).toBe("previous");
    expect(r.root.style.getPropertyValue("--miro-canvas-card-radius")).toBe("9px");
    expect(r.root.style.getPropertyPriority("--miro-canvas-card-radius")).toBe("important");
  });

  it("removes new decoration on unload", () => {
    const r = rig();
    const appearance = new CardAppearance(r.root, { cardCornerRadius: 24 });
    const card = r.card("document");
    appearance.mark(card.element, "file");
    appearance.dispose();
    expect(card.fields.has("data-miro-canvas-card-corners")).toBe(false);
    expect(r.root.style.getPropertyValue("--miro-canvas-card-radius")).toBe("");
  });
});
