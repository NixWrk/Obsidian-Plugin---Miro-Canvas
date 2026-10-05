import { describe, expect, it } from "vitest";

import { ConnectorLabels, type ConnectorLabel, type ConnectorLabelsHost } from "../src/connector-labels";

class FakeStyle {
  public transform = "";
  public visibility = "";
  private readonly props = new Map<string, string>();
  public setProperty(name: string, value: string): void {
    this.props.set(name, value);
    // CSSStyleDeclaration exposes the same value through named properties.
    if (name === "visibility" || name === "transform") Reflect.set(this, name, value);
  }
  public removeProperty(name: string): void {
    this.props.delete(name);
  }
  public getPropertyValue(name: string): string {
    return this.props.get(name) ?? "";
  }
  public has(name: string): boolean {
    return this.props.has(name);
  }
}

class FakeElement {
  public readonly children: FakeElement[] = [];
  public readonly attributes = new Map<string, string>();
  public readonly listeners = new Map<string, Array<(event: unknown) => void>>();
  public readonly style = new FakeStyle();
  public parentNode: FakeElement | undefined;
  public textContent = "";
  public className = "";
  public hidden = false;

  public constructor(public readonly tagName: string) {}

  public get parentElement(): FakeElement | null {
    return this.parentNode ?? null;
  }

  public get nextElementSibling(): FakeElement | null {
    const siblings = this.parentNode?.children;
    if (siblings === undefined) return null;
    return siblings[siblings.indexOf(this) + 1] ?? null;
  }

  public get classList(): { contains: (name: string) => boolean } {
    return { contains: (name) => this.className.split(" ").includes(name) };
  }

  public appendChild(child: FakeElement): FakeElement {
    child.parentNode?.removeChild(child);
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  public removeChild(child: FakeElement): FakeElement {
    this.children.splice(this.children.indexOf(child), 1);
    child.parentNode = undefined;
    return child;
  }

  public remove(): void {
    this.parentNode?.removeChild(this);
  }

  public setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  public getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  public addEventListener(name: string, listener: (event: unknown) => void): void {
    const listeners = this.listeners.get(name) ?? [];
    listeners.push(listener);
    this.listeners.set(name, listeners);
  }

  public removeEventListener(name: string, listener: (event: unknown) => void): void {
    this.listeners.set(name, (this.listeners.get(name) ?? []).filter((item) => item !== listener));
  }

  public querySelector(): null {
    return null;
  }
}

class FakeDocument {
  public createElement(tagName: string): FakeElement {
    return new FakeElement(tagName);
  }
}

function labelOf(root: FakeElement, id: string): FakeElement {
  const wrapper = root.children.find((item) => item.attributes.get("data-connector-id") === id)!;
  return wrapper.children[0]!;
}

function host(overrides: Partial<ConnectorLabelsHost> = {}): ConnectorLabelsHost {
  return {
    editable: () => true,
    move: () => undefined,
    edit: () => undefined,
    select: () => undefined,
    board: (point) => point,
    ...overrides,
  };
}

function item(patch: Partial<ConnectorLabel> = {}): ConnectorLabel {
  return {
    id: "c1", text: "connects", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], t: 0.5,
    ...patch,
  };
}

describe("connector labels", () => {
  it("paints a label's font from the item and clears a property the item stops setting", () => {
    const labels = new ConnectorLabels(new FakeDocument() as unknown as Document, host());
    const root = labels.element as unknown as FakeElement;
    labels.update([item({
      font: { "font-family": "Georgia, serif", "font-size": "24px", "font-weight": "700", "font-style": "italic", "text-decoration": "underline" },
    })]);
    const label = labelOf(root, "c1");
    expect(label.style.getPropertyValue("font-family")).toBe("Georgia, serif");
    expect(label.style.getPropertyValue("font-size")).toBe("24px");
    expect(label.style.getPropertyValue("font-weight")).toBe("700");
    expect(label.style.getPropertyValue("font-style")).toBe("italic");
    expect(label.style.getPropertyValue("text-decoration")).toBe("underline");

    // Only bold now: every other property a card's default typography would
    // still set (normal style, no decoration) is written explicitly, and a
    // property the item no longer carries is cleared, not left stale.
    labels.update([item({ font: { "font-family": "Inter, sans-serif", "font-size": "16px", "font-weight": "700", "font-style": "normal", "text-decoration": "none" } })]);
    expect(label.style.getPropertyValue("font-family")).toBe("Inter, sans-serif");
    expect(label.style.getPropertyValue("font-weight")).toBe("700");
    expect(label.style.getPropertyValue("font-style")).toBe("normal");
    expect(label.style.getPropertyValue("text-decoration")).toBe("none");

    // No font at all: an import or override that never named one leaves
    // every property clear, so Canvas's own label rule paints it.
    labels.update([item()]);
    for (const property of ["font-family", "font-size", "font-weight", "font-style", "text-decoration"]) {
      expect(label.style.has(property)).toBe(false);
    }
  });

  it("asks to be laid again when native Canvas makes an edge's own label after them", () => {
    const labels = new ConnectorLabels(new FakeDocument() as unknown as Document, host());
    const document = new FakeDocument();
    const board = document.createElement("div");
    const ours = labels.element as unknown as FakeElement;

    // Mounted for the first time: laid, and last in the moving layer.
    expect(labels.mount(board as unknown as Element)).toBe(true);
    expect(board.children.at(-1)).toBe(ours);
    expect(labels.mount(board as unknown as Element)).toBe(false);

    // A card coming into view goes after the labels: they go back over it,
    // with nothing to lay again.
    const card = board.appendChild(document.createElement("div"));
    card.className = "canvas-node";
    expect(labels.mount(board as unknown as Element)).toBe(false);
    expect(board.children.at(-1)).toBe(ours);

    // An edge drawn for the first time gets its own label only now.
    const nativeLabel = board.appendChild(document.createElement("div"));
    nativeLabel.className = "canvas-path-label-wrapper";
    expect(labels.mount(board as unknown as Element)).toBe(true);
    expect(board.children.at(-1)).toBe(ours);
    expect(labels.mount(board as unknown as Element)).toBe(false);
  });

  it("hides an edge's own label that native Canvas made after the edge's label was first laid", () => {
    const labels = new ConnectorLabels(new FakeDocument() as unknown as Document, host());
    const root = labels.element as unknown as FakeElement;
    // Laid before native Canvas drew the edge: there is no native label yet.
    labels.update([item()]);
    const first = root.children[0];

    const nativeLabel = new FakeElement("div");
    nativeLabel.className = "canvas-path-label-wrapper";
    labels.update([item({ native: nativeLabel as unknown as HTMLElement })]);
    expect(nativeLabel.style.visibility).toBe("hidden");
    expect(root.children).toHaveLength(1);
    expect(root.children[0]).not.toBe(first);

    // Gone from the board: the edge's own label shows again.
    labels.update([]);
    expect(nativeLabel.style.visibility).toBe("");
  });

  it("leaves a label with no font untouched, wearing native Canvas's own rule", () => {
    const labels = new ConnectorLabels(new FakeDocument() as unknown as Document, host());
    const root = labels.element as unknown as FakeElement;
    labels.update([item()]);
    const label = labelOf(root, "c1");
    expect(label.style.getPropertyValue("font-family")).toBe("");
    expect(label.style.has("font-family")).toBe(false);
  });
});
