import { describe, expect, it, vi, type Mock } from "vitest";

import { arrangeTrayPlacement, dropIndexFromPointer, PanelArrangeMode, pressIsOutside, rectContainsPoint, type PanelArrangeHost } from "../src/panel-arrange";
import type { PanelId, PanelPosition } from "../src/panel-layout";
import type { ToolbarItem } from "../src/quick-tools";

type Rect = { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number; readonly width: number; readonly height: number };

describe("spare tools stay next to the toolbar", () => {
  const view = { left: 8, top: 80, width: 737, height: 1000 };
  const tray = { width: 320, height: 160 };

  it("places the tray beside a left or right column", () => {
    const left = arrangeTrayPlacement(view, { left: 0, top: 339, width: 50, height: 560 }, tray, true);
    expect(left.left).toBe(62);
    expect(left.top).toBe(339);
    const right = arrangeTrayPlacement(view, { left: 695, top: 339, width: 50, height: 560 }, tray, true);
    expect(right.left).toBe(363);
    expect(right.top).toBe(339);
  });

  it("reserves room for the separated drag and turn controls above or below a row", () => {
    const bottom = arrangeTrayPlacement(view, { left: 200, top: 1000, width: 400, height: 50 }, tray, false);
    expect(bottom.top).toBe(776);
    expect(bottom.left).toBe(240);
    const top = arrangeTrayPlacement(view, { left: 200, top: 80, width: 400, height: 50 }, tray, false);
    expect(top.top).toBe(194);
  });

  it("limits a phone's side tray to the space beside its column", () => {
    const phone = { left: 8, top: 140, width: 368, height: 600 };
    const result = arrangeTrayPlacement(phone, { left: 12, top: 240, width: 50, height: 440 }, tray, true);
    expect(result.left).toBe(74);
    expect(result.maxWidth).toBe(302);
    expect(result.top + Math.min(tray.height, result.maxHeight)).toBeLessThanOrEqual(740);
  });

  it("keeps a large tray inside the available height at a lower corner", () => {
    const result = arrangeTrayPlacement(view, { left: 0, top: 900, width: 50, height: 120 }, { width: 320, height: 1400 }, true);
    expect(result.top).toBe(view.top);
    expect(result.maxHeight).toBe(view.height);
  });

  it("does not cover the other panel's controls above a phone toolbar", () => {
    const phone = { left: 8, top: 140, width: 368, height: 600 };
    const result = arrangeTrayPlacement(phone, { left: 16, top: 695, width: 352, height: 49 }, { width: 320, height: 300 }, false,
      [{ left: 268, top: 588, width: 100, height: 44 }]);
    expect(result.top + 300).toBeLessThanOrEqual(580);
    expect(result.top).toBeGreaterThanOrEqual(phone.top);
  });
});

function rect(left: number, top: number, width: number, height: number): Rect {
  return { left, top, right: left + width, bottom: top + height, width, height };
}

/** A node and everything under it - the flip button now sits inside its own handle, not straight under the panel. */
function descendants(root: FakeNode): FakeNode[] {
  return [root, ...root.children.flatMap((child) => descendants(child))];
}

/** Just enough of a DOM node to drive `PanelArrangeMode`: attributes, a style map, listeners it can fire, and a settable rect. */
class FakeNode {
  public readonly children: FakeNode[] = [];
  public parentNode: FakeNode | undefined;
  public textContent = "";
  public type = "";
  public rect: Rect = rect(0, 0, 0, 0);
  private readonly attributes = new Map<string, string>();
  private readonly listeners = new Map<string, Set<(event: unknown) => void>>();
  public readonly style = {
    map: new Map<string, string>(),
    setProperty: (name: string, value: string) => { this.style.map.set(name, value); },
    removeProperty: (name: string) => { this.style.map.delete(name); },
  };

  public constructor(public readonly tagName = "div") {}

  public set className(value: string) {
    this.setAttribute("class", value);
  }

  public get className(): string {
    return this.attributes.get("class") ?? "";
  }

  public get classList(): { contains: (name: string) => boolean } {
    return { contains: (name: string) => (this.className.split(" ").includes(name)) };
  }

  public setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
  public getAttribute(name: string): string | null { return this.attributes.get(name) ?? null; }
  public removeAttribute(name: string): void { this.attributes.delete(name); }

  public appendChild<T extends FakeNode>(child: T): T {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  public prepend<T extends FakeNode>(child: T): T {
    child.parentNode = this;
    this.children.unshift(child);
    return child;
  }

  /** Only the one position `PanelArrangeMode` actually uses: right after this node, among its own siblings. */
  public insertAdjacentElement<T extends FakeNode>(position: "afterend", sibling: T): T {
    const parent = this.parentNode;
    if (parent === undefined) return sibling;
    sibling.parentNode = parent;
    parent.children.splice(parent.children.indexOf(this) + 1, 0, sibling);
    return sibling;
  }

  public get firstChild(): FakeNode | null {
    return this.children[0] ?? null;
  }

  public removeChild<T extends FakeNode>(child: T): T {
    child.remove();
    return child;
  }

  public remove(): void {
    const parent = this.parentNode;
    if (parent === undefined) return;
    const index = parent.children.indexOf(this);
    if (index !== -1) parent.children.splice(index, 1);
    this.parentNode = undefined;
  }

  public contains(node: FakeNode | null | undefined): boolean {
    if (node === undefined || node === null) return false;
    let current: FakeNode | undefined = node;
    while (current !== undefined) {
      if (current === this) return true;
      current = current.parentNode;
    }
    return false;
  }

  public getBoundingClientRect(): Rect {
    return this.rect;
  }

  public closest(selector: string): FakeNode | null {
    if (selector.startsWith(".") && this.classList.contains(selector.slice(1))) return this;
    return this.parentNode?.closest(selector) ?? null;
  }

  public querySelector(selector: string): FakeNode | null {
    if (selector === ".miro-canvas-toolbar__panel") return descendants(this).slice(1).find((node) => node.classList.contains("miro-canvas-toolbar__panel")) ?? null;
    if (selector !== "[data-tool]") return null;
    return descendants(this).slice(1).find((node) => node.getAttribute("data-tool") !== null) ?? null;
  }

  public addEventListener(type: string, handler: (event: unknown) => void): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(handler);
  }

  public removeEventListener(type: string, handler: (event: unknown) => void): void {
    this.listeners.get(type)?.delete(handler);
  }

  public dispatch(type: string, event: Record<string, unknown>): void {
    for (const handler of [...(this.listeners.get(type) ?? [])]) handler({ ...event, target: event.target });
  }
}

class FakeDocument extends FakeNode {
  public readonly body = new FakeNode("body");

  public createElement(tagName: string): FakeNode {
    return new FakeNode(tagName);
  }
}

interface FakePointerEvent {
  [key: string]: unknown;
  target: FakeNode;
  clientX: number;
  clientY: number;
  button: number;
  prevented: boolean;
  stopped: boolean;
  preventDefault: () => void;
  stopPropagation: () => void;
}

function pointerEvent(target: FakeNode, x: number, y: number, extra: Record<string, unknown> = {}): FakePointerEvent {
  const event: FakePointerEvent = {
    target, clientX: x, clientY: y, button: 0, prevented: false, stopped: false,
    preventDefault: () => { event.prevented = true; },
    stopPropagation: () => { event.stopped = true; },
    ...extra,
  };
  return event;
}

/** A bar item: a row carrying the item's own `data-tool`/`data-native`, as `barItemElements` reads it. */
function barItem(item: ToolbarItem, x: number, width = 40): FakeNode {
  const node = new FakeNode("button");
  node.setAttribute("data-tool", item);
  node.rect = rect(x, 0, width, 32);
  return node;
}

interface Rig {
  readonly document: FakeDocument;
  readonly boardRoot: FakeNode;
  readonly bar: FakeNode;
  readonly toolbar: FakeNode;
  readonly dockBar: FakeNode;
  readonly minimap: FakeNode;
  mode: PanelArrangeMode;
  host: PanelArrangeHost;
  items: readonly ToolbarItem[];
  /** What `panelPosition` reports for each id - empty until a test stores one, as a fresh board keeps every panel at its CSS default. */
  positions: Partial<Record<PanelId, PanelPosition>>;
  readonly savedPositions: Array<{ readonly id: PanelId; readonly position: PanelPosition }>;
  readonly savedToolbarItems: (readonly ToolbarItem[])[];
  readonly resetLayout: Mock<() => void>;
  readonly onExit: Mock<() => void>;
}

function buildRig(initialItems: readonly ToolbarItem[] = ["select", "text", "sticky"]): Rig {
  const document = new FakeDocument();
  const boardRoot = new FakeNode("div");
  boardRoot.rect = rect(0, 0, 1200, 800);
  const bar = new FakeNode("div");
  bar.rect = rect(400, 750, 400, 32);
  const toolbar = new FakeNode("div");
  toolbar.rect = bar.rect;
  toolbar.appendChild(bar);
  const dockBar = new FakeNode("div");
  dockBar.rect = rect(1000, 700, 150, 40);
  const minimap = new FakeNode("div");
  minimap.rect = rect(1000, 600, 220, 146);
  boardRoot.appendChild(toolbar);
  boardRoot.appendChild(dockBar);
  boardRoot.appendChild(minimap);

  const rig: Rig = {
    document, boardRoot, bar, toolbar, dockBar, minimap,
    items: initialItems,
    positions: {},
    savedPositions: [],
    savedToolbarItems: [],
    resetLayout: vi.fn(),
    onExit: vi.fn(),
    host: undefined as unknown as PanelArrangeHost,
    mode: undefined as unknown as PanelArrangeMode,
  };
  layoutBar(rig);
  const host: PanelArrangeHost = {
    document: document as unknown as Document,
    boardRoot: boardRoot as unknown as HTMLElement,
    panels: () => ({ toolbar: toolbar as unknown as HTMLElement, dockBar: dockBar as unknown as HTMLElement, minimap: minimap as unknown as HTMLElement }),
    toolbarBar: () => bar as unknown as HTMLElement,
    toolbarItems: () => rig.items,
    panelPosition: (id) => rig.positions[id],
    savePanelPosition: (id, position) => { rig.savedPositions.push({ id, position }); rig.positions = { ...rig.positions, [id]: position }; },
    saveToolbarItems: (next) => { rig.items = next; rig.savedToolbarItems.push(next); },
    resetLayout: rig.resetLayout,
    onExit: rig.onExit,
  };
  rig.host = host;
  rig.mode = new PanelArrangeMode(host);
  return rig;
}

/** Lays the bar's item rows out left to right, 40px apart, matching `rig.items`. */
function layoutBar(rig: Rig): void {
  rig.bar.children.splice(0, rig.bar.children.length);
  rig.items.forEach((item, index) => {
    const node = barItem(item, rig.bar.rect.left + index * 40);
    node.rect = rect(node.rect.left, rig.bar.rect.top, node.rect.width, node.rect.height);
    rig.bar.appendChild(node);
  });
}

describe("resizing the minimap", () => {
  it("previews the chosen size and saves it only on release", () => {
    const rig = buildRig();
    rig.minimap.rect = rect(100, 100, 220, 146);
    rig.mode.enter();
    const handle = descendants(rig.minimap).find(child => child.className.includes("arrange-resize"))!;
    rig.document.dispatch("pointerdown", pointerEvent(handle, 320, 246, { pointerId: 1 }));
    rig.document.dispatch("pointermove", pointerEvent(handle, 380, 286, { pointerId: 1 }));
    expect(rig.minimap.style.map.get("--miro-canvas-minimap-width")).toBe("272px");
    expect(rig.savedPositions).toHaveLength(0);
    rig.document.dispatch("pointerup", pointerEvent(handle, 380, 286, { pointerId: 1 }));
    expect(rig.savedPositions[0]).toMatchObject({ id: "minimap", position: { width: 272, height: 178 } });
    rig.mode.exit();
    expect(descendants(rig.minimap).some(child => child.className.includes("arrange-resize"))).toBe(false);
  });
  it("restores the prior size when the resize is cancelled", () => {
    const rig = buildRig();
    rig.positions.minimap = { anchor: "top-left", dx: 100, dy: 100, width: 210, height: 136 };
    rig.minimap.rect = rect(100, 100, 220, 146);
    rig.mode.enter();
    const handle = descendants(rig.minimap).find(child => child.className.includes("arrange-resize"))!;
    rig.document.dispatch("pointerdown", pointerEvent(handle, 320, 246, { pointerId: 1 }));
    rig.document.dispatch("pointermove", pointerEvent(handle, 380, 286, { pointerId: 1 }));
    rig.document.dispatch("pointercancel", pointerEvent(handle, 380, 286, { pointerId: 1 }));
    expect(rig.minimap.style.map.get("--miro-canvas-minimap-width")).toBe("210px");
    expect(rig.savedPositions).toHaveLength(0);
    rig.mode.exit();
  });
});

describe("dropIndexFromPointer", () => {
  const rects = [rect(0, 0, 40, 20), rect(40, 0, 40, 20), rect(80, 0, 40, 20)];

  it("finds the slot whose midpoint the pointer has not yet passed", () => {
    expect(dropIndexFromPointer(rects, { x: 5, y: 0 }, false)).toBe(0);
    expect(dropIndexFromPointer(rects, { x: 25, y: 0 }, false)).toBe(1);
    expect(dropIndexFromPointer(rects, { x: 65, y: 0 }, false)).toBe(2);
    expect(dropIndexFromPointer(rects, { x: 200, y: 0 }, false)).toBe(3);
  });

  it("reads the vertical coordinate instead, once the bar has turned vertical", () => {
    const stacked = [rect(0, 0, 20, 40), rect(0, 40, 20, 40)];
    expect(dropIndexFromPointer(stacked, { x: 0, y: 10 }, true)).toBe(0);
    expect(dropIndexFromPointer(stacked, { x: 0, y: 70 }, true)).toBe(2);
  });
});

describe("rectContainsPoint", () => {
  it("is true on the rectangle's own edge, false just past it", () => {
    const box = rect(10, 10, 100, 50);
    expect(rectContainsPoint(box, 10, 10)).toBe(true);
    expect(rectContainsPoint(box, 110, 60)).toBe(true);
    expect(rectContainsPoint(box, 9, 10)).toBe(false);
    expect(rectContainsPoint(box, 10, 61)).toBe(false);
  });
});

describe("pressIsOutside", () => {
  it("is false for the zone itself and for one of its descendants", () => {
    const zone = new FakeNode();
    const child = zone.appendChild(new FakeNode());
    expect(pressIsOutside(zone as unknown as Node, [zone as unknown as Node])).toBe(false);
    expect(pressIsOutside(child as unknown as Node, [zone as unknown as Node])).toBe(false);
  });

  it("is true for a press outside every given zone, and for no target at all", () => {
    const zone = new FakeNode();
    const elsewhere = new FakeNode();
    expect(pressIsOutside(elsewhere as unknown as Node, [zone as unknown as Node])).toBe(true);
    expect(pressIsOutside(null, [zone as unknown as Node])).toBe(true);
  });
});

describe("PanelArrangeMode: entering and leaving", () => {
  it("mounts the banner and the tray, and marks each panel with the drag attribute", () => {
    const rig = buildRig();
    rig.mode.enter();
    expect(rig.boardRoot.children.some((child) => child.className.includes("banner"))).toBe(true);
    expect(rig.boardRoot.children.some((child) => child.className.includes("tray"))).toBe(true);
    for (const panel of [rig.toolbar, rig.dockBar, rig.minimap]) {
      expect(panel.getAttribute("data-miro-canvas-arrange")).toBe("true");
    }
    expect(rig.mode.active).toBe(true);
  });

  it("lists every item not on the bar in the tray", () => {
    const rig = buildRig(["select", "text"]);
    rig.mode.enter();
    const tray = rig.boardRoot.children.find((child) => child.className.includes("tray"))!;
    const list = tray.children.find((child) => child.className.includes("list"))!;
    const listed = list.children.map((row) => row.getAttribute("data-tool"));
    expect(listed).not.toContain("select");
    expect(listed).not.toContain("text");
    expect(listed).toContain("frame");
  });

  it("unmounts the banner and the tray and clears the drag attribute on exit", () => {
    const rig = buildRig();
    rig.mode.enter();
    rig.mode.exit();
    expect(rig.boardRoot.children.some((child) => child.className.includes("banner"))).toBe(false);
    expect(rig.boardRoot.children.some((child) => child.className.includes("tray"))).toBe(false);
    expect(rig.toolbar.getAttribute("data-miro-canvas-arrange")).toBeNull();
    expect(rig.onExit).toHaveBeenCalledOnce();
  });

  it("leaves the mode on Escape", () => {
    const rig = buildRig();
    rig.mode.enter();
    rig.document.dispatch("keydown", { key: "Escape" });
    expect(rig.mode.active).toBe(false);
    expect(rig.onExit).toHaveBeenCalledOnce();
  });
});

describe("PanelArrangeMode: the board ignores presses while it is on", () => {
  it("swallows a press that lands directly on the board", () => {
    const rig = buildRig();
    rig.mode.enter();
    const target = new FakeNode();
    rig.boardRoot.appendChild(target);
    const event = pointerEvent(target, 5, 5);
    rig.document.dispatch("pointerdown", event);
    expect(event.prevented).toBe(true);
    expect(event.stopped).toBe(true);
  });

  it("does not swallow a press on the banner's own buttons", () => {
    const rig = buildRig();
    rig.mode.enter();
    const banner = rig.boardRoot.children.find((child) => child.className.includes("banner"))!;
    const doneButton = banner.children.find((child) => child.className.includes("done"))!;
    const event = pointerEvent(doneButton, 0, 0);
    rig.document.dispatch("pointerdown", event);
    expect(event.prevented).toBe(false);
  });
});

describe("PanelArrangeMode: dragging a panel", () => {
  it("moves the panel to where the pointer released it", () => {
    const rig = buildRig();
    rig.mode.enter();
    const start = pointerEvent(rig.dockBar, rig.dockBar.rect.left + 5, rig.dockBar.rect.top + 5);
    rig.document.dispatch("pointerdown", start);
    rig.document.dispatch("pointerup", pointerEvent(rig.dockBar, 20, 20));
    expect(rig.savedPositions).toHaveLength(1);
    expect(rig.savedPositions[0]!.id).toBe("dockBar");
  });

  it("carries a panel's own chosen orientation along, rather than reverting to the new anchor's default", () => {
    const rig = buildRig();
    rig.positions.dockBar = { anchor: "bottom-right", dx: 12, dy: 40, orientation: "vertical" };
    rig.mode.enter();
    const start = pointerEvent(rig.dockBar, rig.dockBar.rect.left + 5, rig.dockBar.rect.top + 5);
    rig.document.dispatch("pointerdown", start);
    // Dropped at the bottom centre - a horizontal anchor by the old default rule.
    rig.document.dispatch("pointerup", pointerEvent(rig.dockBar, 600, 799));
    expect(rig.savedPositions).toHaveLength(1);
    const saved = rig.savedPositions[0]!.position;
    expect(saved.orientation).toBe("vertical");
    expect(saved.anchor).not.toBe("left-middle");
    expect(saved.anchor).not.toBe("right-middle");
  });
});

describe("PanelArrangeMode: dragging a bar item", () => {
  it("shows the insertion slot before release and commits that order", () => {
    const rig = buildRig(["select", "text", "sticky"]);
    rig.mode.enter();
    const text = rig.bar.children[1]!;
    rig.document.dispatch("pointerdown", pointerEvent(text, text.rect.left + 5, text.rect.top + 5));
    rig.document.dispatch("pointermove", pointerEvent(text, rig.bar.rect.left + 115, rig.bar.rect.top + 5));
    const marker = rig.bar.children.find((child) => child.className === "miro-canvas-arrange-insertion")!;
    expect(marker.getAttribute("data-insert-index")).toBe("2");
    expect(marker.style.map.get("width")).toBe("3px");
    expect(rig.savedToolbarItems).toHaveLength(0);
    rig.document.dispatch("pointerup", pointerEvent(text, rig.bar.rect.left + 115, rig.bar.rect.top + 5));
    expect(rig.savedToolbarItems).toEqual([["select", "sticky", "text"]]);
    expect(rig.bar.children).not.toContain(marker);
  });

  it("uses a horizontal line for a column and clears it on cancellation", () => {
    const rig = buildRig(["select", "text", "sticky"]);
    rig.bar.rect = rect(400, 600, 40, 120);
    rig.toolbar.rect = rig.bar.rect;
    rig.bar.children.forEach((node, index) => {
      node.rect = rect(400, 600 + index * 40, 40, 32);
    });
    rig.toolbar.setAttribute("data-miro-canvas-panel-orientation", "vertical");
    rig.mode.enter();
    const text = rig.bar.children[1]!;
    rig.document.dispatch("pointerdown", pointerEvent(text, text.rect.left + 5, text.rect.top + 5));
    const marker = rig.bar.children.find((child) => child.className === "miro-canvas-arrange-insertion")!;
    expect(marker.style.map.get("height")).toBe("3px");
    rig.document.dispatch("pointermove", pointerEvent(text, 0, 0));
    expect((marker as unknown as HTMLElement).hidden).toBe(true);
    rig.document.dispatch("pointercancel", pointerEvent(text, 0, 0));
    expect(rig.savedToolbarItems).toHaveLength(0);
    expect(rig.bar.children).not.toContain(marker);
    expect(rig.document.body.children.some((child) => child.className === "miro-canvas-arrange-ghost")).toBe(false);
  });

  it("reorders an item dropped back inside the bar", () => {
    const rig = buildRig(["select", "text", "sticky"]);
    rig.mode.enter();
    const selectRow = rig.bar.children[0]!;
    const start = pointerEvent(selectRow, selectRow.rect.left + 5, selectRow.rect.top + 5);
    rig.document.dispatch("pointerdown", start);
    // Dropped past the third slot's midpoint: it becomes the last item.
    const dropX = rig.bar.rect.left + 2 * 40 + 30;
    rig.document.dispatch("pointerup", pointerEvent(selectRow, dropX, rig.bar.rect.top + 5));
    expect(rig.savedToolbarItems).toHaveLength(1);
    expect(rig.savedToolbarItems[0]).toEqual(["text", "sticky", "select"]);
  });

  it("removes an item dropped outside the bar", () => {
    const rig = buildRig(["select", "text", "sticky"]);
    rig.mode.enter();
    const textRow = rig.bar.children[1]!;
    rig.document.dispatch("pointerdown", pointerEvent(textRow, textRow.rect.left + 5, textRow.rect.top + 5));
    rig.document.dispatch("pointerup", pointerEvent(textRow, 5, 5));
    expect(rig.savedToolbarItems).toEqual([["select", "sticky"]]);
  });

  it("adds a tray item onto the bar at the dropped index", () => {
    const rig = buildRig(["select", "text"]);
    rig.mode.enter();
    const tray = rig.boardRoot.children.find((child) => child.className.includes("tray"))!;
    const list = tray.children.find((child) => child.className.includes("list"))!;
    const frameRow = list.children.find((row) => row.getAttribute("data-tool") === "frame")!;
    frameRow.dispatch("pointerdown", pointerEvent(frameRow, 0, 0));
    const dropX = rig.bar.rect.left + 5;
    rig.document.dispatch("pointerup", pointerEvent(frameRow, dropX, rig.bar.rect.top + 5));
    expect(rig.savedToolbarItems).toEqual([["frame", "select", "text"]]);
  });
});

describe("PanelArrangeMode: the flip button", () => {
  it("shows a flip button beside the grip on the tool bar and the dock row, not on the minimap", () => {
    const rig = buildRig();
    rig.mode.enter();
    for (const panel of [rig.toolbar, rig.dockBar]) {
      expect(descendants(panel).some((child) => child.className.includes("flip"))).toBe(true);
    }
    expect(descendants(rig.minimap).some((child) => child.className.includes("flip"))).toBe(false);
  });

  it("flips the panel's orientation at once, on the press alone, without starting a panel drag", () => {
    const rig = buildRig();
    rig.mode.enter();
    const flip = descendants(rig.dockBar).find((child) => child.className.includes("flip"))!;
    rig.document.dispatch("pointerdown", pointerEvent(flip, rig.dockBar.rect.left, rig.dockBar.rect.top));
    // A drag would wait for pointerup; the flip already saved by itself.
    expect(rig.savedPositions).toHaveLength(1);
    expect(rig.savedPositions[0]!.id).toBe("dockBar");
    expect(rig.savedPositions[0]!.position.orientation).toBe("vertical");
  });

  it("flips back on a second press, keeping the same anchor and offsets", () => {
    const rig = buildRig();
    rig.mode.enter();
    const flip = descendants(rig.dockBar).find((child) => child.className.includes("flip"))!;
    rig.document.dispatch("pointerdown", pointerEvent(flip, 0, 0));
    rig.document.dispatch("pointerdown", pointerEvent(flip, 0, 0));
    expect(rig.savedPositions).toHaveLength(2);
    const [first, second] = rig.savedPositions;
    expect(second!.position.orientation).toBe("horizontal");
    expect(second!.position.anchor).toBe(first!.position.anchor);
  });

  it("does not swallow the press as a panel drag, so no drag cleanup is left running", () => {
    const rig = buildRig();
    rig.mode.enter();
    const flip = descendants(rig.toolbar).find((child) => child.className.includes("flip"))!;
    const event = pointerEvent(flip, 0, 0);
    rig.document.dispatch("pointerdown", event);
    expect(event.prevented).toBe(true);
    // Releasing the pointer elsewhere must not also move the toolbar, as it would mid-drag.
    rig.document.dispatch("pointerup", pointerEvent(rig.toolbar, 999, 999));
    expect(rig.savedPositions).toHaveLength(1);
  });
});

describe("PanelArrangeMode: Reset", () => {
  it("calls the host's resetLayout", () => {
    const rig = buildRig();
    rig.mode.enter();
    const banner = rig.boardRoot.children.find((child) => child.className.includes("banner"))!;
    const resetButton = banner.children.find((child) => child.className.includes("button") && !child.className.includes("done"))!;
    resetButton.dispatch("click", {});
    expect(rig.resetLayout).toHaveBeenCalledOnce();
  });
});


describe("arranging tools from More", () => {
  function spareRig(native: boolean) {
    const rig = buildRig();
    const more = rig.bar.appendChild(new FakeNode("span"));
    more.className = "miro-canvas-tools__more";
    const plus = more.appendChild(new FakeNode("button"));
    const choices = more.appendChild(new FakeNode("div"));
    choices.className = "miro-canvas-toolbar__panel";
    const spare = choices.appendChild(new FakeNode(native ? "span" : "button"));
    spare.setAttribute(native ? "data-native" : "data-tool", native ? "media" : "comment");
    const inner = spare.appendChild(new FakeNode("span"));
    const close = vi.fn();
    rig.mode = new PanelArrangeMode({ ...rig.host, closeToolChoices: close });
    rig.mode.enter();
    return { rig, plus, inner, close };
  }

  it("lets the Plus button open its own choices", () => {
    const { rig, plus } = spareRig(false);
    const press = pointerEvent(plus, 600, 750);
    rig.document.dispatch("pointerdown", press);
    expect(press.prevented).toBe(false);
    expect(rig.savedPositions).toEqual([]);
    rig.mode.exit();
  });

  it.each([false, true])("adds a spare tool from Plus, including native=%s", (native) => {
    const { rig, inner, close } = spareRig(native);
    rig.document.dispatch("pointerdown", pointerEvent(inner, 600, 600));
    rig.document.dispatch("pointermove", pointerEvent(inner, 450, 760));
    expect(rig.savedToolbarItems).toEqual([]);
    expect(descendants(rig.bar).find((node) => node.className === "miro-canvas-arrange-insertion")?.getAttribute("data-insert-index")).toBe("1");
    rig.document.dispatch("pointerup", pointerEvent(inner, 450, 760));
    expect(close).toHaveBeenCalledOnce();
    expect(rig.savedPositions).toEqual([]);
    expect(rig.savedToolbarItems).toEqual([["select", native ? "media" : "comment", "text", "sticky"]]);
    rig.mode.exit();
  });

  it("cancels without adding a tool or moving a panel", () => {
    const { rig, inner } = spareRig(false);
    rig.document.dispatch("pointerdown", pointerEvent(inner, 600, 600));
    rig.document.dispatch("pointercancel", pointerEvent(inner, 450, 760));
    expect(rig.savedToolbarItems).toEqual([]);
    expect(rig.savedPositions).toEqual([]);
    rig.mode.exit();
  });
});
