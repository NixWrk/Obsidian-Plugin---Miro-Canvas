import { describe, expect, it } from "vitest";
import { ConnectorLayer } from "../src/connector-layer";
import { buildCanvasAnchorGeometry } from "../src/connector-endpoints";
import type { BoardConnector } from "../src/board-connectors";

class FakeElement {
  children: FakeElement[] = [];
  parentElement: FakeElement | null = null;
  attrs = new Map<string, string>();
  styles = new Map<string, string>();
  listeners = new Map<string, (event: unknown) => void>();
  style = {
    setProperty: (name: string, value: string) => this.styles.set(name, value),
  };
  constructor(readonly tag: string) {}
  get firstChild(): FakeElement | null {
    return this.children[0] ?? null;
  }
  appendChild(child: FakeElement): FakeElement {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }
  replaceChild(next: FakeElement, old: FakeElement): void {
    this.children = this.children.map((item) => (item === old ? next : item));
    next.parentElement = this;
    old.parentElement = null;
  }
  removeChild(child: FakeElement): void {
    this.children = this.children.filter((item) => item !== child);
    child.parentElement = null;
  }
  remove(): void {
    this.parentElement?.removeChild(this);
  }
  setAttribute(key: string, value: string): void {
    this.attrs.set(key, value);
  }
  getAttribute(key: string): string | null {
    return this.attrs.get(key) ?? null;
  }
  addEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.set(type, listener);
  }
  removeEventListener(type: string): void {
    this.listeners.delete(type);
  }
  closest(selector: string): FakeElement | null {
    const attribute = /^\[(.+)\]$/u.exec(selector)?.[1];
    for (let at: FakeElement | null = this; at !== null; at = at.parentElement) {
      if (attribute !== undefined && at.attrs.has(attribute)) return at;
    }
    return null;
  }
}

const fakeDocument = {
  createElementNS: (_namespace: string, tag: string) => new FakeElement(tag),
};
const all = (element: FakeElement): FakeElement[] => [element, ...element.children.flatMap(all)];

function connector(patch: Partial<BoardConnector> = {}): BoardConnector {
  return {
    id: "a", from: { type: "free", x: 0, y: 0 }, to: { type: "free", x: 100, y: 0 },
    route: "straight", color: "#123456", width: 2, startCap: "arrow", endCap: "stealth", ...patch,
  };
}

function layerOf(connectors: readonly BoardConnector[], pressed: string[] = []) {
  let document: unknown = { nodes: [], edges: [], miroCanvas: { connectors: Object.fromEntries(connectors.map((item) => [item.id, item])) } };
  let geometry = buildCanvasAnchorGeometry(document);
  const layer = new ConnectorLayer(fakeDocument as unknown as Document, {
    document: () => document,
    geometry: () => geometry,
    press: (_event, id) => pressed.push(id),
  });
  const replace = (next: readonly BoardConnector[]) => {
    document = { nodes: [], edges: [], miroCanvas: { connectors: Object.fromEntries(next.map((item) => [item.id, item])) } };
    geometry = buildCanvasAnchorGeometry(document);
  };
  return { layer, svg: layer.element as unknown as FakeElement, replace };
}

describe("connector layer", () => {
  it("keeps arrowheads independent in two views of the same connector", () => {
    const first = layerOf([connector({ color: "#123456" })]);
    const second = layerOf([connector({ color: "#ff6600" })]);
    first.layer.render();
    second.layer.render();
    const markerIds = (svg: FakeElement) => all(svg).filter(element => element.tag === "marker").map(element => element.attrs.get("id")!);
    const firstIds = markerIds(first.svg);
    const secondIds = markerIds(second.svg);
    expect(firstIds).toHaveLength(2);
    expect(secondIds).toHaveLength(2);
    expect(firstIds.some(id => secondIds.includes(id))).toBe(false);
    const secondLine = all(second.svg).find(element => element.attrs.get("class") === "canvas-display-path")!;
    expect(secondLine.attrs.get("marker-start")).toBe(`url(#${secondIds[0]})`);
    expect(secondLine.attrs.get("marker-end")).toBe(`url(#${secondIds[1]})`);
    first.replace([connector({ color: "#abcdef" })]);
    first.layer.render();
    expect(secondLine.styles.get("stroke")).toBe("#ff6600");
    expect(markerIds(second.svg)).toEqual(secondIds);
    second.replace([connector({ color: "#ff6600", from: { type: "free", x: 40, y: 80 } })]);
    second.layer.render();
    expect(markerIds(second.svg)).toEqual(secondIds);
    first.layer.dispose();
    second.layer.dispose();
  });

  it("draws each connector as native Canvas draws an edge, in board units", () => {
    const { layer, svg } = layerOf([connector()]);
    layer.render();
    const group = all(svg).find((element) => element.tag === "g")!;
    expect(group.styles.get("--canvas-color")).toBe("#123456");
    const [, line, hit] = group.children;
    expect(hit!.attrs.get("data-connector-id")).toBe("a");
    expect(hit!.attrs.get("class")).toBe("canvas-interaction-path miro-board-connector-hit");
    expect(line!.attrs.get("class")).toBe("canvas-display-path");
    expect(line!.attrs.get("d")).toBe(hit!.attrs.get("d"));
    expect(line!.attrs.get("d")).toMatch(/^M 0 0/u);
    expect(line!.styles.get("stroke-width")).toBe("2");
  });

  it("sizes arrowheads by the line, or by the head size set on it", () => {
    const markers = (item: BoardConnector) => {
      const { layer, svg } = layerOf([item]);
      layer.render();
      return all(svg).filter((element) => element.tag === "marker").map((element) => Object.fromEntries(element.attrs));
    };
    const plain = markers(connector());
    expect(plain).toHaveLength(2);
    for (const marker of plain) expect(marker).toMatchObject({ markerWidth: "10.799999999999999", markerHeight: "9.6" });
    for (const marker of markers(connector({ width: 50, headSize: 20 }))) {
      expect(marker).toMatchObject({ markerUnits: "userSpaceOnUse", markerWidth: "36", markerHeight: "32" });
    }
  });

  it("marks the selection and draws again only what changed", () => {
    const { layer, svg, replace } = layerOf([connector(), connector({ id: "b" })]);
    layer.render();
    const [a, b] = svg.children;
    layer.render();
    expect(svg.children).toEqual([a, b]);
    layer.select(["b"]);
    expect(svg.children[0]).toBe(a);
    expect(svg.children[1]).not.toBe(b);
    const focused = all(svg).filter((element) => element.attrs.get("class")?.includes("is-focused"));
    expect(focused.map((element) => element.children[2]?.attrs.get("data-connector-id"))).toEqual(["b"]);
    replace([connector()]);
    layer.render();
    expect(layer.selection()).toEqual([]);
    expect(svg.children).toEqual([a]);
  });

  it("moves a line whose ends moved along its new course, keeping what is drawn, and draws it afresh when its look changes", () => {
    const moved = (dx: number) => connector({ from: { type: "free", x: dx, y: 0 }, to: { type: "free", x: 100 + dx, y: 0 } });
    const block = (dy: number) => connector({
      id: "b", block: true, startCap: "none", endCap: "none", width: 20,
      from: { type: "free", x: 0, y: dy }, to: { type: "free", x: 100, y: dy },
    });
    const { layer, svg, replace } = layerOf([connector(), block(0)]);
    layer.render();
    const [a, b] = svg.children;
    const markers = all(a!).filter((element) => element.tag === "marker");
    const outline = b!.children[1]!.attrs.get("d");
    // Every move of a drag: both lines follow, each the same group as before.
    for (const shift of [40, 80]) {
      replace([moved(shift), block(shift)]);
      layer.render();
      expect(svg.children[0]).toBe(a);
      expect(svg.children[1]).toBe(b);
      const [, line, hit] = a!.children;
      expect(line!.attrs.get("d")).toMatch(new RegExp(`^M ${shift} 0`, "u"));
      expect(hit!.attrs.get("d")).toBe(line!.attrs.get("d"));
      expect(all(a!).filter((element) => element.tag === "marker")).toEqual(markers);
      // A block arrow's body is its outline along the course, not the course itself.
      const [, blockLine, blockHit] = b!.children;
      expect(blockLine!.attrs.get("d")).not.toBe(outline);
      expect(blockLine!.attrs.get("d")).toMatch(/ Z$/u);
      expect(blockHit!.attrs.get("d")).toMatch(new RegExp(`^M 0 ${shift}`, "u"));
    }
    expect(layer.routeOf("a")?.start).toMatchObject({ x: 80, y: 0 });
    // Another colour is another look: the line is drawn afresh.
    replace([{ ...moved(80), color: "#654321" }]);
    layer.render();
    expect(svg.children).toHaveLength(1);
    expect(svg.children[0]).not.toBe(a);
    expect(svg.children[0]!.styles.get("--canvas-color")).toBe("#654321");
  });

  it("previews a connector where it is dragged, and says which one was pressed", () => {
    const pressed: string[] = [];
    const { layer, svg } = layerOf([connector()], pressed);
    layer.preview(connector({ from: { type: "free", x: 10, y: 10 }, to: { type: "free", x: 110, y: 10 } }));
    expect(layer.routeOf("a")?.start).toMatchObject({ x: 10, y: 10 });
    const hit = all(svg).find((element) => element.attrs.has("data-connector-id"))!;
    svg.listeners.get("pointerdown")!({ target: hit });
    expect(pressed).toEqual(["a"]);
    layer.preview(undefined);
    expect(layer.routeOf("a")?.start).toMatchObject({ x: 0, y: 0 });
  });
});
