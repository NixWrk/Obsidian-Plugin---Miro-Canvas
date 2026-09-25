import { afterEach, describe, expect, it } from "vitest";

import { setLocale } from "../src/i18n";
import {
  ALL_TOOLBAR_ITEMS, DRAG_CREATE_TOOLS, QUICK_TOOLS, QUICK_TOOL_KEYS, QuickTools,
  isDragCreateTool, moveToolbarItem, removeToolbarItem,
  type NativeToolbarItem, type QuickTool, type ToolbarItem,
} from "../src/quick-tools";

/** A plain inline-style stand-in: `setProperty`/`removeProperty` alongside ordinary named properties, as a real `CSSStyleDeclaration` allows both. */
function fakeStyle(): Record<string, string> & { setProperty: (name: string, value: string) => void; removeProperty: (name: string) => void } {
  const style = {} as Record<string, string> & { setProperty: (name: string, value: string) => void; removeProperty: (name: string) => void };
  style.setProperty = (name, value) => { style[name] = value; };
  style.removeProperty = (name) => { delete style[name]; };
  return style;
}

class FakeElement {
  public readonly nodeType = 1;
  public readonly children: FakeElement[] = [];
  public readonly attributes = new Map<string, string>();
  public readonly classes = new Set<string>();
  public readonly classList = {
    add: (name: string) => { this.classes.add(name); },
    remove: (name: string) => { this.classes.delete(name); },
    contains: (name: string) => this.classes.has(name),
  };
  public readonly style = fakeStyle();
  public readonly listeners = new Map<string, Array<(event: unknown) => void>>();
  public parentNode: FakeElement | undefined;
  public textContent = "";
  public type = "";
  public hidden = false;
  public disabled = false;

  public constructor(public readonly tagName: string) {}

  public set className(value: string) {
    for (const name of value.split(" ")) if (name !== "") this.classes.add(name);
  }

  public get className(): string {
    return [...this.classes].join(" ");
  }

  public get parentElement(): FakeElement | null {
    return this.parentNode ?? null;
  }

  public get firstChild(): FakeElement | null {
    return this.children[0] ?? null;
  }

  public appendChild(child: FakeElement): FakeElement {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  public prepend(child: FakeElement): void {
    child.parentNode = this;
    this.children.unshift(child);
  }

  public removeChild(child: FakeElement): FakeElement {
    this.children.splice(this.children.indexOf(child), 1);
    child.parentNode = undefined;
    return child;
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

  public dispatch(name: string, props: Record<string, unknown> = {}): void {
    for (const listener of [...(this.listeners.get(name) ?? [])]) {
      listener({ type: name, target: this, ...props });
    }
  }

  public remove(): void {
    this.parentNode?.children.splice(this.parentNode.children.indexOf(this), 1);
    this.parentNode = undefined;
  }

  /** True for itself or any element reachable by walking up `other`'s own parents. */
  public contains(other: FakeElement): boolean {
    for (let node: FakeElement | undefined = other; node !== undefined; node = node.parentNode) {
      if (node === this) return true;
    }
    return false;
  }
}

class FakeDocument {
  /** Where a dragged tool's ghost mounts, clear of the bar's own layout. */
  public readonly body = new FakeElement("body");
  private readonly listeners = new Map<string, Array<(event: unknown) => void>>();

  public createElement(tagName: string): FakeElement {
    return new FakeElement(tagName);
  }

  // Shape pictures are made through the namespaced call; the fake does not
  // need a real SVG namespace to stand in for one.
  public createElementNS(_namespace: string, tagName: string): FakeElement {
    return new FakeElement(tagName);
  }

  // A drag off the bar listens for Escape at the document, the way the
  // board's own tools do.
  public addEventListener(name: string, listener: (event: unknown) => void): void {
    const listeners = this.listeners.get(name) ?? [];
    listeners.push(listener);
    this.listeners.set(name, listeners);
  }

  public removeEventListener(name: string, listener: (event: unknown) => void): void {
    this.listeners.set(name, (this.listeners.get(name) ?? []).filter((item) => item !== listener));
  }

  public dispatch(name: string, props: Record<string, unknown> = {}): void {
    for (const listener of [...(this.listeners.get(name) ?? [])]) listener({ type: name, ...props });
  }
}

function descendants(root: FakeElement): FakeElement[] {
  return [root, ...root.children.flatMap((child) => descendants(child))];
}

function toolButton(root: FakeElement, tool: QuickTool): FakeElement {
  const matches = descendants(root).filter((item) => item.attributes.get("data-tool") === tool);
  if (matches.length !== 1) throw new Error(`expected one button for ${tool}, found ${matches.length}`);
  return matches[0]!;
}

function byLabel(root: FakeElement, label: string): FakeElement {
  const matches = descendants(root).filter((item) => item.attributes.get("aria-label") === label);
  if (matches.length !== 1) throw new Error(`expected one control labelled ${label}, found ${matches.length}`);
  return matches[0]!;
}

function shapeOption(root: FakeElement, kind: string): FakeElement {
  const matches = descendants(root).filter((item) => item.attributes.get("data-shape") === kind);
  if (matches.length !== 1) throw new Error(`expected one shape option for ${kind}, found ${matches.length}`);
  return matches[0]!;
}

/** The panel a popover button owns is its sibling inside the popover host. */
function panelOf(button: FakeElement): FakeElement {
  return button.parentElement!.children.find((child) => child.className.includes("__panel"))!;
}

type Call =
  | { readonly kind: "arm"; readonly tool: QuickTool }
  | { readonly kind: "shape"; readonly shape: string }
  | { readonly kind: "pen"; readonly settings: { readonly color?: string; readonly width?: number } };

/** What the bar is told about the board when nothing in particular is set. */
const STATE = { editable: true, armed: "select", shape: "rectangle", penColor: "#1a1a1a", penWidth: 5, eraserSize: 32 } as const;

function build(): { readonly tools: QuickTools; readonly root: FakeElement; readonly calls: Call[] } {
  const calls: Call[] = [];
  const tools = new QuickTools(
    {
      onArm: (tool) => calls.push({ kind: "arm", tool }),
      onShape: (shape) => calls.push({ kind: "shape", shape }),
      onPen: (settings) => calls.push({ kind: "pen", settings }),
    },
    { document: new FakeDocument() as unknown as Document },
  );
  return { tools, root: tools.element as unknown as FakeElement, calls };
}

function buildWithItems(toolbarItems: readonly ToolbarItem[]): { readonly tools: QuickTools; readonly root: FakeElement } {
  const tools = new QuickTools(
    { onArm: () => {}, onShape: () => {}, onPen: () => {} },
    { document: new FakeDocument() as unknown as Document, toolbarItems },
  );
  return { tools, root: tools.element as unknown as FakeElement };
}

/** The one direct child of root that is the bar itself, not the pen's row or the connector's. */
function mainBar(root: FakeElement): FakeElement {
  const candidates = root.children.filter((child) => child.classes.has("miro-canvas-toolbar__bar")
    && !child.classes.has("miro-canvas-tools__connectors") && !child.classes.has("miro-canvas-tools__drawing"));
  if (candidates.length !== 1) throw new Error(`expected one main bar, found ${candidates.length}`);
  return candidates[0]!;
}

/** Which toolbar item a bar or More element stands for: its own attribute, or - for the shape popover - its inner button's. */
function itemOf(node: FakeElement): ToolbarItem | undefined {
  const native = node.attributes.get("data-native");
  if (native !== undefined) return native as ToolbarItem;
  const tool = node.attributes.get("data-tool");
  if (tool !== undefined) return tool as ToolbarItem;
  if (node.attributes.get("data-tool-group") === "drawing") return "pen";
  const inner = node.children.find((child) => child.attributes.get("data-tool") !== undefined);
  return inner?.attributes.get("data-tool") as ToolbarItem | undefined;
}

/** The bar's own items, left to right, stopping at the "More" popover. */
function barOrder(root: FakeElement): ToolbarItem[] {
  const items: ToolbarItem[] = [];
  for (const child of mainBar(root).children) {
    if (child.classes.has("miro-canvas-tools__more")) break;
    const item = itemOf(child);
    if (item !== undefined) items.push(item);
  }
  return items;
}

/** What sits under More, in the order its panel lists them. */
function moreOrder(root: FakeElement): ToolbarItem[] {
  const moreHost = mainBar(root).children.find((child) => child.classes.has("miro-canvas-tools__more"))!;
  const panel = moreHost.children.find((child) => child.classes.has("miro-canvas-tools__menu"))!;
  return panel.children.map((child) => itemOf(child)).filter((item): item is ToolbarItem => item !== undefined);
}

describe("quick tools", () => {
  it("reports valid head sizes separately from width and supports optional hosts", () => {
    const patches: unknown[] = [];
    const tools = new QuickTools({onArm:()=>{}, onShape:()=>{}, onPen:()=>{}, onConnector:p=>patches.push(p)}, {document:new FakeDocument() as unknown as Document});
    const root = tools.element as unknown as FakeElement;
    const input = byLabel(root, "New connector arrowhead size") as unknown as HTMLInputElement;
    tools.update({...STATE, armed:"connector"});
    expect(input.value).toBe("");
    for (const value of ["0", "1001", "", "NaN"]) {
      input.value=value;(input as unknown as FakeElement).dispatch("change");
    }
    expect(patches).toEqual([]);
    input.value="24.5";(input as unknown as FakeElement).dispatch("change");
    expect(patches).toEqual([{headSize:24.5}]);
    tools.update({...STATE, connectorHeadSize:24.5, connectorWidth:50, editable:false});
    expect(input.value).toBe("24.5");expect(input.disabled).toBe(true);
    (input as unknown as FakeElement).dispatch("change");
    expect(patches).toHaveLength(1);
    const optional=build();
    const optionalInput=byLabel(optional.root,"New connector arrowhead size") as unknown as HTMLInputElement;
    optionalInput.value="20";
    expect(()=>(optionalInput as unknown as FakeElement).dispatch("change")).not.toThrow();
  });
  it("offers a custom drawing color alongside the connector color picker", () => {
    const {tools, root, calls} = build();
    tools.update({...STATE, armed: "pen", penColor: "#abcdef"});
    const picker = byLabel(root, "New drawing color") as unknown as HTMLInputElement;
    expect(picker.value).toBe("#abcdef");
    picker.value = "#123456";
    (picker as unknown as FakeElement).dispatch("input");
    expect(calls).toEqual([{kind: "pen", settings: {color: "#123456"}}]);
    expect(byLabel(root, "New connector color").type).toBe("color");
    tools.update({...STATE, editable: false});
    expect(picker.disabled).toBe(true);
  });
  it("offers one button per tool, with code and link inside the more panel", () => {
    const { root } = build();
    for (const tool of QUICK_TOOLS) toolButton(root, tool);
    const more = panelOf(byLabel(root, "More tools"));
    expect(descendants(more)).toContain(toolButton(root, "code"));
    expect(descendants(more)).toContain(toolButton(root, "link"));
  });

  it("arms the tool a bar button names when it is clicked", () => {
    const { root, calls } = build();
    for (const tool of ["select", "text", "sticky", "connector", "comment", "frame"] as const) {
      toolButton(root, tool).dispatch("click");
    }
    expect(calls).toEqual(
      ["select", "text", "sticky", "connector", "comment", "frame"].map((tool) => ({ kind: "arm", tool })),
    );
  });

  it("arms a tool from the more panel and closes the panel behind it", () => {
    const { root, calls } = build();
    const more = byLabel(root, "More tools");
    more.dispatch("click");
    expect(panelOf(more).hidden).toBe(false);
    toolButton(root, "link").dispatch("click");
    expect(calls).toEqual([{ kind: "arm", tool: "link" }]);
    expect(panelOf(more).hidden).toBe(true);
    expect(more.getAttribute("aria-expanded")).toBe("false");
  });

  it("picks a shape from the shape panel, arms the shape tool and closes the panel", () => {
    const { root, calls } = build();
    const shapeButton = toolButton(root, "shape");
    shapeButton.dispatch("click");
    expect(panelOf(shapeButton).hidden).toBe(false);
    shapeOption(root, "rectangle").dispatch("click");
    expect(calls).toEqual([{ kind: "arm", tool: "shape" }, { kind: "shape", shape: "rectangle" }, { kind: "arm", tool: "shape" }]);
    expect(panelOf(shapeButton).hidden).toBe(true);
  });

  it("opens one panel at a time and marks the open one expanded", () => {
    const { root } = build();
    const shapeButton = toolButton(root, "shape");
    const more = byLabel(root, "More tools");
    shapeButton.dispatch("click");
    expect(panelOf(shapeButton).hidden).toBe(false);
    expect(shapeButton.getAttribute("aria-expanded")).toBe("true");
    more.dispatch("click");
    expect(panelOf(shapeButton).hidden).toBe(true);
    expect(shapeButton.getAttribute("aria-expanded")).toBe("false");
    expect(panelOf(more).hidden).toBe(false);
    expect(more.getAttribute("aria-expanded")).toBe("true");
    // A second click on the open panel's own button closes it again.
    more.dispatch("click");
    expect(panelOf(more).hidden).toBe(true);
  });

  it("closes shape popovers when a different tool is armed", () => {
    const { root, tools } = build();
    tools.update({ ...STATE, armed: "shape" });
    const button = toolButton(root, "shape");
    button.dispatch("click");
    expect(panelOf(button).hidden).toBe(false);
    tools.update({ ...STATE, armed: "connector" });
    expect(panelOf(button).hidden).toBe(true);
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("disables every tool but the selecting ones and closes open panels when the board stops being editable", () => {
    const { root, tools } = build();
    toolButton(root, "shape").dispatch("click");
    tools.update({ ...STATE, editable: false });
    expect(panelOf(toolButton(root, "shape")).hidden).toBe(true);
    for (const tool of QUICK_TOOLS) {
      // Selecting changes nothing, so Select and the lasso stay live.
      expect(toolButton(root, tool).disabled).toBe(tool !== "select" && tool !== "lasso");
    }
  });

  it("marks the armed tool and the chosen shape as pressed", () => {
    const { root, tools } = build();
    tools.update({ ...STATE, armed: "text", shape: "rhombus" });
    for (const tool of QUICK_TOOLS) {
      expect(toolButton(root, tool).getAttribute("aria-pressed")).toBe(tool === "text" ? "true" : "false");
    }
    expect(shapeOption(root, "rhombus").getAttribute("aria-pressed")).toBe("true");
    expect(shapeOption(root, "rectangle").getAttribute("aria-pressed")).toBe("false");
    // A second, different shape swaps the picture the bar button already shows.
    tools.update({ ...STATE, armed: "frame" });
    expect(toolButton(root, "frame").getAttribute("aria-pressed")).toBe("true");
    expect(toolButton(root, "text").getAttribute("aria-pressed")).toBe("false");
    expect(shapeOption(root, "rectangle").getAttribute("aria-pressed")).toBe("true");
    expect(shapeOption(root, "rhombus").getAttribute("aria-pressed")).toBe("false");
  });

  it("maps each bar shortcut letter to its tool", () => {
    expect([...QUICK_TOOL_KEYS.entries()]).toEqual([
      ["V", "select"], ["T", "text"], ["N", "sticky"], ["S", "shape"], ["P", "pen"],
      ["L", "connector"], ["C", "comment"], ["F", "frame"],
    ]);
  });

  it("stops answering clicks once disposed", () => {
    const { root, tools, calls } = build();
    tools.dispose();
    toolButton(root, "select").dispatch("click");
    expect(calls).toEqual([]);
  });

  it("builds the bar in the order it is given, everything else under More in ALL_TOOLBAR_ITEMS order", () => {
    const items: readonly ToolbarItem[] = ["frame", "select", "card", "table"];
    const { root } = buildWithItems(items);
    expect(barOrder(root)).toEqual(items);
    expect(moreOrder(root)).toEqual(ALL_TOOLBAR_ITEMS.filter((item) => !items.includes(item)));
  });

  it("keeps native Canvas's three items in their own place among the plugin's tools", () => {
    const { root } = buildWithItems(["card", "sticky", "note", "media"]);
    expect(barOrder(root)).toEqual(["card", "sticky", "note", "media"]);
  });

  it("draws the sticky note as a plain square and the shape tool as Miro's square and circle", () => {
    const setIconCalls: string[] = [];
    const tools = new QuickTools(
      { onArm: () => {}, onShape: () => {}, onPen: () => {} },
      { document: new FakeDocument() as unknown as Document, setIcon: (_element, icon) => { setIconCalls.push(icon); } },
    );
    const root = tools.element as unknown as FakeElement;
    // A plain square, in the icons' own colour: never native Canvas's card icon ("sticky-note").
    expect(setIconCalls).toContain("square");
    expect(setIconCalls).not.toContain("sticky-note");
    const shape = toolButton(root, "shape");
    const picture = shape.children.find((child) => (child.attributes.get("class") ?? "").includes("miro-canvas-shapes-icon"));
    expect(picture).toBeDefined();
    // Choosing a shape leaves the picture as it is.
    tools.update({ ...STATE, shape: "circle" });
    expect(shape.children).toContain(picture);
  });

  it("moves native Canvas's own buttons - the very elements, never copies - into their configured slot", () => {
    const { tools, root } = buildWithItems(["select", "card", "text"]);
    const cardButton = new FakeElement("div");
    tools.placeNativeButton("card", cardButton as unknown as HTMLElement);
    const slot = descendants(root).find((item) => item.attributes.get("data-native") === "card")!;
    expect(slot.children).toContain(cardButton);
    expect(tools.nativeSlot("card")).toBe(slot as unknown as HTMLElement);
    // Left off the bar entirely: note and media both land under More instead.
    const note = new FakeElement("div");
    tools.placeNativeButton("note", note as unknown as HTMLElement);
    const noteSlot = descendants(root).find((item) => item.attributes.get("data-native") === "note")!;
    expect(noteSlot.classes.has("miro-canvas-tools__native")).toBe(true);
    expect(noteSlot.children).toContain(note);
  });

  it("keeps More itself open when a popover nested inside it - shape, moved under More - opens", () => {
    // Neither shape nor code is on this bar, so both sit nested inside More.
    const { root } = buildWithItems(["select", "text"]);
    const more = byLabel(root, "More tools");
    more.dispatch("click");
    expect(panelOf(more).hidden).toBe(false);
    const shapeButton = toolButton(root, "shape");
    shapeButton.dispatch("click");
    expect(panelOf(shapeButton).hidden).toBe(false);
    // More holds the shape button, so closing "every other panel" must spare it.
    expect(panelOf(more).hidden).toBe(false);
  });
});

describe("dragging a tool off the bar to create it", () => {
  it("lists exactly the tools that make one item with a single drop", () => {
    expect(DRAG_CREATE_TOOLS).toEqual(["text", "sticky", "shape", "comment", "frame", "code", "table", "link"]);
    for (const tool of QUICK_TOOLS) {
      expect(isDragCreateTool(tool)).toBe((DRAG_CREATE_TOOLS as readonly QuickTool[]).includes(tool));
    }
  });

  it("still arms the tool on a plain press and release, with no movement at all", () => {
    const { root, calls } = build();
    const button = toolButton(root, "text");
    button.dispatch("pointerdown", { pointerId: 1, clientX: 10, clientY: 10, button: 0, pointerType: "mouse" });
    button.dispatch("pointerup", { pointerId: 1, clientX: 10, clientY: 10 });
    button.dispatch("click");
    expect(calls).toEqual([{ kind: "arm", tool: "text" }]);
  });

  it("stays a click below the drag threshold", () => {
    const { root, calls } = build();
    const button = toolButton(root, "sticky");
    button.dispatch("pointerdown", { pointerId: 1, clientX: 100, clientY: 100, button: 0, pointerType: "mouse" });
    button.dispatch("pointermove", { pointerId: 1, clientX: 103, clientY: 100 });
    button.dispatch("pointerup", { pointerId: 1, clientX: 103, clientY: 100 });
    button.dispatch("click");
    expect(calls).toEqual([{ kind: "arm", tool: "sticky" }]);
  });

  it("starts a drag past the threshold, drops through onDragCreate at the release point, and never arms it", () => {
    const dragged: Array<{ tool: QuickTool; point: { x: number; y: number } }> = [];
    const tools = new QuickTools(
      {
        onArm: () => { throw new Error("a dragged-and-dropped tool must not also arm"); },
        onShape: () => {}, onPen: () => {},
        onDragCreate: (tool, point) => dragged.push({ tool, point }),
      },
      { document: new FakeDocument() as unknown as Document },
    );
    const root = tools.element as unknown as FakeElement;
    const document = (tools as unknown as { document: FakeDocument }).document;
    const button = toolButton(root, "frame");
    button.dispatch("pointerdown", { pointerId: 7, clientX: 50, clientY: 50, button: 0, pointerType: "mouse" });
    // 10 screen px down: past DRAG_THRESHOLD (4px), so the ghost appears.
    button.dispatch("pointermove", { pointerId: 7, clientX: 50, clientY: 60 });
    expect(document.body.children.some((child) => child.className.includes("miro-canvas-bar-ghost"))).toBe(true);
    button.dispatch("pointerup", { pointerId: 7, clientX: 200, clientY: 300 });
    expect(dragged).toEqual([{ tool: "frame", point: { x: 200, y: 300 } }]);
    // The ghost is gone, and the click that follows the drop does not arm it.
    expect(document.body.children.some((child) => child.className.includes("miro-canvas-bar-ghost"))).toBe(false);
    expect(() => button.dispatch("click")).not.toThrow();
  });

  it("cancels on Escape while dragging: no drop, and the eventual release makes nothing either", () => {
    const dragged: unknown[] = [];
    const tools = new QuickTools(
      { onArm: () => {}, onShape: () => {}, onPen: () => {}, onDragCreate: (tool, point) => dragged.push({ tool, point }) },
      { document: new FakeDocument() as unknown as Document },
    );
    const root = tools.element as unknown as FakeElement;
    const document = (tools as unknown as { document: FakeDocument }).document;
    const button = toolButton(root, "table");
    button.dispatch("pointerdown", { pointerId: 3, clientX: 0, clientY: 0, button: 0, pointerType: "mouse" });
    button.dispatch("pointermove", { pointerId: 3, clientX: 0, clientY: 20 });
    document.dispatch("keydown", { key: "Escape" });
    expect(document.body.children.some((child) => child.className.includes("miro-canvas-bar-ghost"))).toBe(false);
    // The pointer is physically still down until this release; Escape already tore the gesture down.
    button.dispatch("pointerup", { pointerId: 3, clientX: 0, clientY: 300 });
    expect(dragged).toEqual([]);
  });

  it("forgets an Escape-cancelled drag on the next press, so that press's click still arms", () => {
    const { tools, root, calls } = build();
    const document = (tools as unknown as { document: FakeDocument }).document;
    const table = toolButton(root, "table");
    table.dispatch("pointerdown", { pointerId: 3, clientX: 0, clientY: 0, button: 0, pointerType: "mouse" });
    table.dispatch("pointermove", { pointerId: 3, clientX: 0, clientY: 20 });
    document.dispatch("keydown", { key: "Escape" });
    // The release lands off the button, so no click ever consumes the drag's suppression.
    const select = toolButton(root, "select");
    root.dispatch("pointerdown", { pointerId: 4, stopPropagation: () => {} });
    select.dispatch("click");
    expect(calls).toEqual([{ kind: "arm", tool: "select" }]);
  });

  it("scales the ghost by the board's own zoom, read once the drag starts", () => {
    const tools = new QuickTools(
      { onArm: () => {}, onShape: () => {}, onPen: () => {}, dragZoom: () => 2 },
      { document: new FakeDocument() as unknown as Document },
    );
    const root = tools.element as unknown as FakeElement;
    const document = (tools as unknown as { document: FakeDocument }).document;
    const button = toolButton(root, "code");
    button.dispatch("pointerdown", { pointerId: 1, clientX: 0, clientY: 0, button: 0, pointerType: "mouse" });
    button.dispatch("pointermove", { pointerId: 1, clientX: 0, clientY: 20 });
    const ghost = document.body.children.find((child) => child.className.includes("miro-canvas-bar-ghost"))!;
    // code's own default box is 480x120; at zoom 2 the ghost is twice that.
    expect((ghost as unknown as HTMLElement).style.width).toBe("960px");
    expect((ghost as unknown as HTMLElement).style.height).toBe("240px");
  });

  it("does not drag the tools left off this list - select stays a plain click", () => {
    const { root, calls } = build();
    const button = toolButton(root, "select");
    button.dispatch("pointerdown", { pointerId: 1, clientX: 0, clientY: 0, button: 0, pointerType: "mouse" });
    button.dispatch("pointermove", { pointerId: 1, clientX: 0, clientY: 50 });
    button.dispatch("pointerup", { pointerId: 1, clientX: 0, clientY: 50 });
    button.dispatch("click");
    expect(calls).toEqual([{ kind: "arm", tool: "select" }]);
  });
});

describe("moving items on and off the bar - what the arrange mode and the settings list both write", () => {
  it("reorders an item already on the bar", () => {
    const items: readonly ToolbarItem[] = ["select", "text", "sticky"];
    expect(moveToolbarItem(items, "sticky", 0)).toEqual(["sticky", "select", "text"]);
    expect(moveToolbarItem(items, "select", 2)).toEqual(["text", "sticky", "select"]);
  });

  it("adds an item from the tray at a given index, without duplicating it", () => {
    const items: readonly ToolbarItem[] = ["select", "text"];
    expect(moveToolbarItem(items, "frame", 1)).toEqual(["select", "frame", "text"]);
    expect(moveToolbarItem(items, "frame", 0)).toEqual(["frame", "select", "text"]);
  });

  it("clamps an out-of-range index to the bar's own ends", () => {
    const items: readonly ToolbarItem[] = ["select", "text"];
    expect(moveToolbarItem(items, "frame", 99)).toEqual(["select", "text", "frame"]);
    expect(moveToolbarItem(items, "frame", -5)).toEqual(["frame", "select", "text"]);
  });

  it("removes an item, sending it back to the tray under More", () => {
    const items: readonly ToolbarItem[] = ["select", "text", "sticky"];
    expect(removeToolbarItem(items, "text")).toEqual(["select", "sticky"]);
    // Removing an item not on the bar changes nothing.
    expect(removeToolbarItem(items, "frame")).toEqual(items);
  });
});

describe("quick tools in Russian", () => {
  afterEach(() => setLocale("en"));

  it("builds its tool names from the Russian word table", () => {
    setLocale("ru");
    const { root } = build();
    expect(root.getAttribute("aria-label")).toBe("Инструменты доски");
    expect(byLabel(root, "Другие инструменты")).toBeDefined();
    expect(byLabel(root, "Выделение\nV")).toBeDefined();
    expect(byLabel(root, "Фрейм\nF")).toBeDefined();
    expect(byLabel(root, "Цвет новых линий")).toBeDefined();
  });
});
