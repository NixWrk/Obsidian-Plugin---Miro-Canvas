/**
 * Trace before implementation, 2026-10-08.
 * Parent native Windows 9346 finding: viewport width 380, center (140,32),
 * scale 1; compact header 280x64 but hidden cards retain (350,200)/(580,200).
 * External SVG stays at M510255 because its raw edge bounds are offscreen.
 * Readonly native source inspection: virtualize calls getIntersectingEdges,
 * backed by edgeIndex.search; edge.getBBox uses raw node-side endpoints.
 * It attaches both SVG groups and tracks lastEdgesInViewport. isAttached is
 * lineGroupEl.parentNode; render initializes paths. Native requestFrame calls
 * virtualize before rendering dirty attached items. No native mutations made.
 * Fix contract: reversible instance query/virtualize hooks, cached projected
 * bounds index, native attach/detach and hit paths, no raw/index/source writes.
 * Checks: narrow viewport/zoom/pan, native+styled+chained routes, hidden internal
 * edges, preview/cancel/expand/dispose, unknown private shape/foreign hooks,
 * no hidden-route paint or full index rebuild on unchanged native frames.
 * Native Windows input and physical Android checks remain parent-owned/pending;
 * synthetic evidence below is not device acceptance.
 * Lint trace before cleanup: typed native delegation and array narrowing are
 * on every scoped query/virtualize call. Remove redundant assertions and use
 * unknown element types; preserve original receivers/results/throws and test
 * native query passthrough, attachment, restoration and repeated frames.
 */
import { describe, expect, it, vi } from "vitest";
import { SourceRenderer } from "../src/source-renderer";
import { collapsedGroupOwners, toggleGroupCollapse } from "../src/board-groups";
import { buildCanvasAnchorGeometry } from "../src/connector-endpoints";

class Element {
  nodeType = 1;
  parentNode?: Element;
  children: Element[] = [];
  root = false;
  attributes = new Map<string, string>();
  classes = new Set<string>();
  values = new Map<string, string>();
  classList = { contains: (key: string) => this.classes.has(key), add: (key: string) => this.classes.add(key), remove: (key: string) => this.classes.delete(key) };
  style = {
    getPropertyValue: (key: string) => this.values.get(key) ?? "",
    getPropertyPriority: () => "",
    setProperty: (key: string, value: string) => { this.values.set(key, value); },
    removeProperty: (key: string) => { this.values.delete(key); },
  };
  constructor(public tagName: string) {}
  get isConnected(): boolean { return this.root || this.parentNode?.isConnected === true; }
  setAttribute(key: string, value: string) { this.attributes.set(key, value); }
  getAttribute(key: string) { return this.attributes.get(key) ?? null; }
  removeAttribute(key: string) { this.attributes.delete(key); }
  appendChild(child: Element) { child.parentNode?.removeChild(child); child.parentNode = this; this.children.push(child); return child; }
  removeChild(child: Element) { this.children.splice(this.children.indexOf(child), 1); child.parentNode = undefined; }
  detach() { this.parentNode?.removeChild(this); }
  contains(child: Element): boolean { return this === child || this.children.some((item) => item.contains(child)); }
  querySelectorAll(selector: string): Element[] { return this.children.flatMap((child) => [...(child.tagName === selector ? [child] : []), ...child.querySelectorAll(selector)]); }
  closest(selector: string): Element | null { return selector.split(", ").includes(this.tagName) ? this : this.parentNode?.closest(selector) ?? null; }
}

const document = { createElement: (tag: string) => new Element(tag), createElementNS: (_namespace: string, tag: string) => new Element(tag) } as unknown as Document;
type Box = { minX: number; minY: number; maxX: number; maxY: number };
const intersects = (left: Box, right: Box) => left.minX <= right.maxX && left.maxX >= right.minX && left.minY <= right.maxY && left.maxY >= right.minY;

function fixture(farCount = 0, defaultView?: unknown) {
  let data: any = {
    nodes: [
      { id: "group", type: "group", x: 0, y: 0, width: 900, height: 500 },
      { id: "a", type: "text", x: 350, y: 200, width: 160, height: 110 },
      { id: "b", type: "text", x: 580, y: 200, width: 160, height: 110 },
      { id: "outside", type: "text", x: 1200, y: 200, width: 160, height: 110 },
    ],
    edges: [
      { id: "external", fromNode: "a", fromSide: "right", toNode: "outside", toSide: "left", future: { retain: true } },
      { id: "internal", fromNode: "a", fromSide: "right", toNode: "b", toSide: "left" },
      { id: "styled", fromNode: "a", fromSide: "right", toNode: "outside", toSide: "left" },
      { id: "chain", fromNode: "b", fromSide: "right", toNode: "outside", toSide: "left" },
      { id: "normal", fromNode: "outside", fromSide: "right", toNode: "outside", toSide: "left" },
    ],
    miroCanvas: { schemaVersion: 1, localOverrides: {
      styled: { connector: { route: "straight", color: "#2385d7" } },
      chain: { connector: { route: "straight" }, connectorAnchors: { from: { type: "edge", edgeId: "styled", t: 0 }, to: { type: "free", x: 200, y: 100 } } },
    } },
    miroSource: { opaque: ["source evidence"] }, future: { retain: true },
  };
  for (let index = 0; index < farCount; index += 1) {
    data.nodes.push({ id: `far${index}`, type: "text", x: 10000 + index * 400, y: 10000, width: 100, height: 100 });
    data.edges.push({ id: `route${index}`, fromNode: `far${index}`, fromSide: "right", toNode: `far${index}`, toSide: "left" });
    data.miroCanvas.localOverrides[`route${index}`] = { connector: { route: "straight", color: "#2385d7" } };
  }
  data = toggleGroupCollapse(data, "group")!;
  const canvas: any = {
    edges: new Map(), lastEdgesInViewport: new Set(), edgeContainerEl: new Element("svg"), edgeEndContainerEl: new Element("svg"),
    viewport: { minX: -50, minY: -120, maxX: 330, maxY: 184 },
    getViewportBBox() { return this.viewport; },
    getIntersectingEdges(bounds: Box) { return [...this.edges.values()].filter((edge: any) => intersects(edge.bbox, bounds)); },
    virtualize() {
      const visible = new Set(this.getIntersectingEdges(this.getViewportBBox()));
      for (const edge of visible as Set<any>) edge.attach();
      for (const edge of this.lastEdgesInViewport) if (!visible.has(edge)) edge.detach();
      this.lastEdgesInViewport = visible;
      return "native-return";
    },
  };
  canvas.edgeContainerEl.root = true;
  canvas.edgeEndContainerEl.root = true;
  const nodes = new Map<string, any>(data.nodes.map((node: any) => [node.id, { ...node }]));
  for (const edge of data.edges) {
    const from = nodes.get(edge.fromNode), to = nodes.get(edge.toNode);
    const raw = `M${from.x + from.width} ${from.y + from.height / 2} L${to.x} ${to.y + to.height / 2}`;
    const lineGroupEl = new Element("g"), lineEndGroupEl = new Element("g");
    const display = new Element("path"), hit = new Element("path"), head = new Element("g");
    hit.classList.add("canvas-interaction-path");
    hit.style.setProperty("stroke-width", "24");
    display.setAttribute("d", raw);
    hit.setAttribute("d", raw);
    lineGroupEl.appendChild(display);
    lineGroupEl.appendChild(hit);
    lineEndGroupEl.appendChild(head);
    const runtime = {
      id: edge.id, canvas, initialized: true, lineGroupEl, lineEndGroupEl, display, hit, raw,
      from: { node: from, side: edge.fromSide, end: "none" }, to: { node: to, side: edge.toSide, end: "arrow" }, toLineEnd: { el: head },
      bbox: { minX: Math.min(from.x + from.width, to.x), minY: Math.min(from.y + from.height / 2, to.y + to.height / 2), maxX: Math.max(from.x + from.width, to.x), maxY: Math.max(from.y + from.height / 2, to.y + to.height / 2) },
      attach() { if (!lineGroupEl.parentNode) { canvas.edgeContainerEl.appendChild(lineGroupEl); canvas.edgeEndContainerEl.appendChild(lineEndGroupEl); } },
      detach() { if (lineGroupEl.parentNode) { lineGroupEl.detach(); lineEndGroupEl.detach(); } },
      updatePath: vi.fn(() => { display.setAttribute("d", raw); hit.setAttribute("d", raw); }),
      render: vi.fn(function(this: any) { this.initialized = true; this.updatePath(); }),
    };
    canvas.edges.set(edge.id, runtime);
  }
  let geometry = buildCanvasAnchorGeometry(data, undefined, undefined, undefined, collapsedGroupOwners(data));
  const getDocument = vi.fn(() => data);
  const renderer = new SourceRenderer({ getDocument, getNodes: () => [], getEdges: () => [...canvas.edges.values()], getCollapsedNodeOwners: () => collapsedGroupOwners(data), getAnchorGeometry: () => geometry }, defaultView === undefined ? document : { ...document, defaultView } as Document);
  canvas.virtualize();
  return {
    canvas, renderer, nodes, getDocument,
    edge: (id: string): any => canvas.edges.get(id),
    get data() { return data; },
    set data(next: any) { data = next; geometry = buildCanvasAnchorGeometry(data, undefined, undefined, undefined, collapsedGroupOwners(data)); },
  };
}

describe("collapsed native route virtualization", () => {
  it("attaches the projected external route in a narrow viewport and preserves raw geometry/evidence", () => {
    const f = fixture(), edge = f.edge("external"), bbox = edge.bbox;
    const before = JSON.stringify(f.data), rawNodes = JSON.stringify([...f.nodes]);
    expect(edge.lineGroupEl.isConnected).toBe(false);
    expect(edge.display.getAttribute("d")).toMatch(/^M510 255/);
    f.renderer.refresh();
    expect(edge.lineGroupEl.isConnected).toBe(true);
    expect(edge.lineEndGroupEl.isConnected).toBe(true);
    expect(edge.display.getAttribute("d")).toMatch(/^M 280 32/);
    expect(edge.hit.getAttribute("d")).toBe(edge.display.getAttribute("d"));
    expect(edge.hit.style.getPropertyValue("stroke-width")).toBe("24");
    expect(edge.toLineEnd.el.style.getPropertyValue("transform")).toContain("1200px");
    expect(f.edge("internal").lineGroupEl.isConnected).toBe(false);
    expect(edge.bbox).toBe(bbox);
    expect(JSON.stringify(f.data)).toBe(before);
    expect(JSON.stringify([...f.nodes])).toBe(rawNodes);
    f.renderer.dispose();
  });

  it("uses displayed styled and chained paths for attachment and hit paths", () => {
    const f = fixture();
    f.renderer.refresh();
    for (const id of ["styled", "chain"]) {
      const edge = f.edge(id);
      expect(edge.lineGroupEl.isConnected).toBe(true);
      expect(edge.display.getAttribute("d")).toMatch(/^M 280 32/);
      expect(edge.hit.getAttribute("d")).toBe(edge.display.getAttribute("d"));
    }
    expect(f.edge("chain").display.getAttribute("d")).toContain("200 100");
    f.renderer.dispose();
  });

  it("recovers display, hit and arrowhead placement after native dirty render", () => {
    const observers: { callback: (records: unknown[]) => void; targets: unknown[] }[] = [];
    class Observer {
      targets: unknown[] = [];
      constructor(public callback: (records: unknown[]) => void) { observers.push(this); }
      observe(target: unknown) { this.targets.push(target); }
      disconnect() {}
    }
    const f = fixture(0, { MutationObserver: Observer }), edge = f.edge("external");
    edge.from.end = "arrow";
    edge.fromLineEnd = { el: new Element("g") };
    edge.lineEndGroupEl.appendChild(edge.fromLineEnd.el);
    f.renderer.refresh();
    const expected = edge.display.getAttribute("d");
    edge.render();
    edge.fromLineEnd.el.style.setProperty("transform", "translate(510px, 255px)");
    expect(edge.display.getAttribute("d")).toBe(edge.raw);
    const observer = observers.find((item) => item.targets.includes(edge.display))!;
    observer.callback([{ type: "attributes", target: edge.display, attributeName: "d" }]);
    expect(edge.display.getAttribute("d")).toBe(expected);
    expect(edge.hit.getAttribute("d")).toBe(expected);
    expect(edge.fromLineEnd.el.style.getPropertyValue("transform")).toContain("translate(280px, 32px)");
    expect(edge.toLineEnd.el.style.getPropertyValue("transform")).toContain("1200px");
    f.renderer.dispose();
  });

  it("keeps internal native lines detached even when their raw bounds intersect the viewport", () => {
    const f = fixture(), nativeQuery = f.canvas.getIntersectingEdges;
    f.canvas.viewport = { minX: 0, minY: 0, maxX: 900, maxY: 500 };
    expect(nativeQuery.call(f.canvas, f.canvas.viewport)).toContain(f.edge("internal"));
    const writes = vi.spyOn(f.edge("internal").display, "setAttribute");
    f.renderer.refresh();
    f.canvas.virtualize();
    expect(f.canvas.lastEdgesInViewport.has(f.edge("internal"))).toBe(false);
    expect(f.edge("internal").lineGroupEl.isConnected).toBe(false);
    expect(f.edge("internal").lineEndGroupEl.isConnected).toBe(false);
    expect(writes).not.toHaveBeenCalled();
    f.renderer.dispose();
  });

  it("retains unrelated native rows and deduplicates a projected route that also has raw intersection", () => {
    const f = fixture();
    f.renderer.refresh();
    const bounds = { minX: 1190, minY: 190, maxX: 1400, maxY: 310 };
    const visible = f.canvas.getIntersectingEdges(bounds);
    expect(visible).toContain(f.edge("normal"));
    expect(visible.filter((edge: unknown) => edge === f.edge("external"))).toHaveLength(1);
    expect(visible).not.toContain(f.edge("internal"));
    f.renderer.dispose();
  });

  it.each([0.5, 1, 1.25])("repaints newly visible routes after pan at scale %s and retains native return", (scale) => {
    const f = fixture();
    f.canvas.viewport = { minX: -1200, minY: -1200, maxX: -800, maxY: -800 };
    f.renderer.refresh();
    expect(f.edge("external").lineGroupEl.isConnected).toBe(false);
    f.canvas.viewport = { minX: 140 - 190 / scale, minY: 32 - 150 / scale, maxX: 140 + 190 / scale, maxY: 32 + 150 / scale };
    expect(f.canvas.virtualize()).toBe("native-return");
    expect(f.edge("external").lineGroupEl.isConnected).toBe(true);
    expect(f.edge("external").display.getAttribute("d")).toMatch(/^M 280 32/);
    f.canvas.viewport = { minX: -1200, minY: -1200, maxX: -800, maxY: -800 };
    f.canvas.virtualize();
    expect(f.edge("external").lineGroupEl.isConnected).toBe(false);
    expect(f.edge("external").lineEndGroupEl.isConnected).toBe(false);
    f.renderer.dispose();
  });

  it("initializes only a newly visible native edge before projecting its paths", () => {
    const f = fixture(), edge = f.edge("external");
    edge.initialized = false;
    f.renderer.refresh();
    expect(edge.render).toHaveBeenCalledTimes(1);
    expect(edge.display.getAttribute("d")).toMatch(/^M 280 32/);
    f.canvas.virtualize();
    expect(edge.render).toHaveBeenCalledTimes(1);
    f.renderer.dispose();
  });

  it("does not paint thousands of offscreen routes or rebuild projection on unchanged native frames", () => {
    const f = fixture(2000), hidden = f.edge("route1999");
    const writes = vi.spyOn(hidden.display, "setAttribute");
    f.renderer.refresh();
    const reads = f.getDocument.mock.calls.length;
    for (let frame = 0; frame < 100; frame += 1) f.canvas.virtualize();
    expect(f.getDocument).toHaveBeenCalledTimes(reads);
    expect(writes).not.toHaveBeenCalled();
    expect(hidden.render).not.toHaveBeenCalled();
    expect(hidden.lineGroupEl.isConnected).toBe(false);
    f.renderer.dispose();
  });

  it("updates preview geometry, restores cancellation and removes hooks on expand", () => {
    const f = fixture(), nativeQuery = f.canvas.getIntersectingEdges, nativeVirtualize = f.canvas.virtualize;
    const collapsed = f.data;
    f.renderer.refresh();
    f.data = { ...collapsed, nodes: collapsed.nodes.map((node: any) => node.id === "group" ? { ...node, x: 25, y: 40 } : node) };
    f.renderer.refresh();
    expect(f.edge("external").display.getAttribute("d")).toMatch(/^M 305 72/);
    f.data = collapsed;
    f.renderer.refresh();
    expect(f.edge("external").display.getAttribute("d")).toMatch(/^M 280 32/);
    f.data = toggleGroupCollapse(f.data, "group");
    f.renderer.refresh();
    expect(f.canvas.getIntersectingEdges).toBe(nativeQuery);
    expect(f.canvas.virtualize).toBe(nativeVirtualize);
    expect(f.edge("external").lineGroupEl.isConnected).toBe(false);
    expect(f.edge("external").display.getAttribute("d")).toBe(f.edge("external").raw);
    f.renderer.dispose();
  });

  it("restores native methods and attachment on dispose without removing a later foreign hook", () => {
    const f = fixture(), nativeVirtualize = f.canvas.virtualize;
    f.renderer.refresh();
    const wrapped = f.canvas.getIntersectingEdges;
    const foreign = function(this: any, ...args: any[]) { return wrapped.apply(this, args); };
    f.canvas.getIntersectingEdges = foreign;
    f.renderer.dispose();
    expect(f.canvas.getIntersectingEdges).toBe(foreign);
    expect(f.canvas.virtualize).toBe(nativeVirtualize);
    expect(f.edge("external").lineGroupEl.isConnected).toBe(false);
    expect(f.edge("external").display.getAttribute("d")).toBe(f.edge("external").raw);
    expect(f.canvas.getIntersectingEdges(f.canvas.viewport)).not.toContain(f.edge("external"));
  });

  it.each(["viewport", "container", "method"])("fails closed on unsupported native %s shape", (shape) => {
    const f = fixture(), nativeQuery = f.canvas.getIntersectingEdges;
    if (shape === "viewport") f.canvas.getViewportBBox = () => ({ minX: NaN });
    if (shape === "container") f.canvas.edgeEndContainerEl = undefined;
    if (shape === "method") Object.defineProperty(f.canvas, "virtualize", { value: f.canvas.virtualize, configurable: false });
    expect(f.renderer.refresh()).toContain("collapsed-route-virtualization-unsupported: native Canvas shape unavailable.");
    expect(f.canvas.getIntersectingEdges).toBe(nativeQuery);
    expect(f.edge("external").lineGroupEl.isConnected).toBe(false);
    expect(f.edge("external").display.getAttribute("d")).toBe(f.edge("external").raw);
    f.renderer.dispose();
  });

  it("preserves original query receiver, arguments and errors", () => {
    const f = fixture();
    const query = vi.fn(function(this: any, ...args: any[]) { if (args[1] === "throw") throw Error("native query"); return this === f.canvas ? [] : ["borrowed"]; });
    f.canvas.getIntersectingEdges = query;
    f.renderer.refresh();
    const bounds = f.canvas.viewport;
    expect(f.canvas.getIntersectingEdges.call({}, bounds, "borrow")).toEqual(["borrowed"]);
    expect(query.mock.calls.at(-1)).toEqual([bounds, "borrow"]);
    expect(() => f.canvas.getIntersectingEdges(bounds, "throw")).toThrow("native query");
    f.renderer.dispose();
  });
});
