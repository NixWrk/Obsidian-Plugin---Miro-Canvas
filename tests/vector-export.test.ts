import { afterEach, describe, expect, it, vi } from "vitest";
import { renderVectorExportPages, serializeVectorTile } from "../src/vector-export";
import * as nativeExport from "../src/export-canvas";
import { words } from "../src/i18n";

const rasterizer = vi.hoisted(() => vi.fn());
vi.mock("html2canvas-pro", () => ({ default: rasterizer }));

const defaults: Record<string, string> = {
  display: "block", visibility: "visible", opacity: "1", transform: "none", width: "100px", height: "40px", boxSizing: "border-box",
  color: "rgb(20, 30, 40)", backgroundColor: "transparent", backgroundImage: "none", filter: "none", clipPath: "none",
  borderTopLeftRadius: "0px", borderTopRightRadius: "0px", borderBottomLeftRadius: "0px", borderBottomRightRadius: "0px",
  fontFamily: '"Prepared font", sans-serif', fontSize: "18px", fontWeight: "400", fontStyle: "normal", fontVariant: "normal",
  letterSpacing: "1px", textDecorationLine: "none", overflowX: "visible", overflowY: "visible", writingMode: "horizontal-tb", listStyleType: "none",
};
function property(name: string) { return name.replace(/-([a-z])/gu, (_, character: string) => character.toUpperCase()); }
function css(values: Record<string, string> = {}) {
  const result = { ...defaults, ...values };
  return new Proxy(result, { get(target, name) {
    if (name === "getPropertyValue") return (key: string) => target[property(key)] ?? (key.startsWith("border-") && key.endsWith("-width") ? "0px" : "");
    return target[String(name)] ?? "";
  } }) as unknown as CSSStyleDeclaration;
}
class Matrix {
  a = 1; b = 0; c = 0; d = 1; e = 0; f = 0; is2D = true;
  constructor(value?: string) {
    if (value?.startsWith("matrix3d(")) { this.is2D = false; return; }
    if (value?.startsWith("matrix(")) [this.a, this.b, this.c, this.d, this.e, this.f] = value.slice(7, -1).split(",").map(Number) as [number, number, number, number, number, number];
  }
  multiply(other: Matrix) {
    const result = new Matrix();
    result.a = this.a * other.a + this.c * other.b;
    result.b = this.b * other.a + this.d * other.b;
    result.c = this.a * other.c + this.c * other.d;
    result.d = this.b * other.c + this.d * other.d;
    result.e = this.a * other.e + this.c * other.f + this.e;
    result.f = this.b * other.e + this.d * other.f + this.f;
    return result;
  }
  inverse() {
    const determinant = this.a * this.d - this.b * this.c;
    if (determinant === 0) throw new Error("singular");
    const result = new Matrix();
    result.a = this.d / determinant;
    result.b = -this.b / determinant;
    result.c = -this.c / determinant;
    result.d = this.a / determinant;
    result.e = (this.c * this.f - this.d * this.e) / determinant;
    result.f = (this.b * this.e - this.a * this.f) / determinant;
    return result;
  }
}
class TextNode {
  nodeType = 3;
  constructor(public textContent: string, public parentElement: Element) {}
}
class Element {
  nodeType = 1;
  namespaceURI = "http://www.w3.org/1999/xhtml";
  parentElement: Element | null = null;
  childNodes: Array<Element | TextNode> = [];
  values = new Map<string, string>();
  computed: Record<string, string> = {};
  pseudos: Record<string, Record<string, string>> = {};
  bounds = { left: 130, top: 240, width: 100, height: 40, right: 230, bottom: 280 };
  screen = { a: 1, b: 0, c: 0, d: 1, e: 140, f: 250 };
  classList = { contains: (name: string) => this.classes.has(name), add: (...names: string[]) => names.forEach(name => this.classes.add(name)), remove: (...names: string[]) => names.forEach(name => this.classes.delete(name)) };
  classes = new Set<string>();
  complete = true; naturalWidth = 20; naturalHeight = 10; src = "image.png"; currentSrc = "";
  width = 0; height = 0;
  draw = vi.fn();
  constructor(public ownerDocument: DocumentHost, public localName = "div", className = "") { className.split(" ").filter(Boolean).forEach(name => this.classes.add(name)); }
  get children(): Element[] { return this.childNodes.filter((node): node is Element => node instanceof Element); }
  get attributes() { return [...this.values].map(([name, value]) => ({ name, value })); }
  get textContent(): string { return this.childNodes.map(node => node.textContent).join(""); }
  append(child: Element | TextNode) { child.parentElement = this; this.childNodes.push(child); return child; }
  text(value: string) { return this.append(new TextNode(value, this)); }
  setAttribute(name: string, value: string) { this.values.set(name, value); }
  getAttribute(name: string) { return this.values.get(name) ?? null; }
  hasAttribute(name: string) { return this.values.has(name); }
  matches(selector: string) { return selector.split(",").some(part => part.trim().startsWith(".") ? this.classes.has(part.trim().slice(1)) : this.localName === part.trim()); }
  closest(selector: string): Element | null { return this.matches(selector) ? this : this.parentElement?.closest(selector) ?? null; }
  contains(other: Element): boolean { return this === other || this.children.some(child => child.contains(other)); }
  querySelectorAll(selector: string): Element[] { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
  getBoundingClientRect() { return this.bounds; }
  getScreenCTM() { return this.screen; }
  getContext() { return { drawImage: this.draw }; }
  toDataURL() { return "data:image/png;base64,cGljdHVyZQ=="; }
}
class DocumentHost {
  fonts = { ready: Promise.resolve() };
  sheets: Element[] = [];
  detachedRanges = 0;
  defaultView = {
    DOMMatrix: Matrix,
    setTimeout: (callback: () => void, delay: number) => globalThis.setTimeout(callback, delay) as unknown as number,
    clearTimeout: (id: number) => globalThis.clearTimeout(id),
    requestAnimationFrame: (callback: FrameRequestCallback) => globalThis.setTimeout(() => callback(0), 0) as unknown as number,
    cancelAnimationFrame: (id: number) => globalThis.clearTimeout(id),
    getComputedStyle: (element: Element, pseudo?: string) => pseudo === undefined ? css(element.computed) : css({ content: "none", ...(element.pseudos[pseudo] ?? {}) }),
  };
  createElement(tag: string) { const element = new Element(this, tag); if (tag === "canvas") this.sheets.push(element); return element; }
  createRange() {
    let node: TextNode;
    let start = 0;
    let end = 0;
    return {
      setStart: (target: TextNode, offset: number) => { node = target; start = offset; },
      setEnd: (_target: TextNode, offset: number) => { end = offset; },
      getBoundingClientRect: () => ({ left: node.parentElement.bounds.left + 5 + start * 9, top: node.parentElement.bounds.top + 8, width: (end - start) * 9, height: 18 }),
      detach: () => { this.detachedRanges += 1; },
    };
  }
}
function fixture() {
  const document = new DocumentHost();
  const wrapper = new Element(document);
  wrapper.bounds = { left: 100, top: 200, width: 200, height: 100, right: 300, bottom: 300 };
  wrapper.setAttribute("data-miro-canvas-export-renderer", "true");
  wrapper.computed.backgroundColor = "rgb(250, 250, 250)";
  const canvas = { wrapperEl: wrapper as unknown as HTMLElement, x: 17, y: 29, tx: 19, ty: 31, zoom: -1, tZoom: -.5,
    screenshotting: false, viewportChanged: false, deselectAll: vi.fn(), requestFrame: vi.fn(), setViewport: vi.fn() };
  const card = wrapper.append(new Element(document, "div", "canvas-node")) as Element;
  card.computed.backgroundColor = "rgb(255, 220, 50)";
  card.text("A<&");
  return { document, wrapper, canvas, card };
}
function svg(parent: Element, tag: string, values: Record<string, string> = {}) {
  const element = parent.append(new Element(parent.ownerDocument, tag)) as Element;
  element.namespaceURI = "http://www.w3.org/2000/svg";
  for (const [name, value] of Object.entries(values)) element.setAttribute(name, value);
  return element;
}
function asHtml(element: Element) { return element as unknown as HTMLElement; }
function unchanged(f: ReturnType<typeof fixture>) {
  expect(f.canvas).toMatchObject({ x: 17, y: 29, tx: 19, ty: 31, zoom: -1, tZoom: -.5, screenshotting: false, viewportChanged: false });
  expect(f.wrapper.classes.has("miro-canvas-exporting")).toBe(false);
  expect(f.wrapper.classes.has("is-screenshotting")).toBe(false);
  expect(rasterizer).not.toHaveBeenCalled();
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.clearAllMocks(); });

describe("vector DOM serialization", () => {
  it.each([
    ["48px", 20, 20],
    ["80px 20px", 50, 12.5],
    ["100%", 50, 20],
    ["0px", 0, 0],
  ] as const)("normalizes overlapping uniform corners (%s) with one CSS factor", async (radius, rx, ry) => {
    const f = fixture();
    Object.assign(f.card.computed, { borderTopLeftRadius: radius, borderTopRightRadius: radius, borderBottomLeftRadius: radius, borderBottomRightRadius: radius });
    const output = await serializeVectorTile(asHtml(f.wrapper), "corners", new AbortController().signal);
    expect(output).toContain(`width="100" height="40" rx="${rx}" ry="${ry}"`);
  });

  it("refuses unresolved computed corner values instead of writing NaN geometry", async () => {
    const f = fixture();
    const radius = "calc(50% - 2px)";
    Object.assign(f.card.computed, { borderTopLeftRadius: radius, borderTopRightRadius: radius, borderBottomLeftRadius: radius, borderBottomRightRadius: radius });
    await expect(serializeVectorTile(asHtml(f.wrapper), "corners", new AbortController().signal)).rejects.toThrow("css:corner-radius");
  });

  it("emits painted geometry and escaped, positioned text with prepared typography and radius", async () => {
    const f = fixture();
    Object.assign(f.card.computed, { borderTopLeftRadius: "12px", borderTopRightRadius: "12px", borderBottomLeftRadius: "12px", borderBottomRightRadius: "12px",
      fontWeight: "700", fontStyle: "italic", overflowX: "hidden" });
    const output = await serializeVectorTile(asHtml(f.wrapper), "tile", new AbortController().signal);
    expect(output).toContain('<rect x="0" y="0" width="100" height="40" rx="12" ry="12" transform="matrix(1 0 0 1 30 40)" fill="rgb(255, 220, 50)"');
    expect(output).toContain('font-family="&quot;Prepared font&quot;, sans-serif"');
    expect(output).toContain('font-weight="700"');
    expect(output).toContain('font-style="italic"');
    expect(output).toContain('letter-spacing="1px"');
    expect(output).toContain('x="5" y="8"');
    expect(output).toContain('&lt;</text>');
    expect(output).toContain('&amp;</text>');
    expect(output).toContain('<clipPath id="tile-clip-1">');
    expect(output).not.toMatch(/foreignObject|<image/u);
    expect(f.document.detachedRanges).toBe(1);
  });

  it("preserves native/independent line paths, arrowhead IDs and shape geometry in their measured SVG matrices", async () => {
    const f = fixture();
    const edges = svg(f.wrapper, "svg");
    edges.classes.add("canvas-edges");
    const defs = svg(edges, "defs");
    const marker = svg(defs, "marker", { id: "arrow", orient: "auto", markerWidth: "10" });
    svg(marker, "path", { d: "M0 0L8 4L0 8Z" }).computed.fill = "rgb(255, 0, 0)";
    const path = svg(edges, "path", { d: "M-10 0C0 10 30 30 100 40", "marker-end": "url(#arrow)" });
    path.computed = { stroke: "rgb(255, 0, 0)", strokeWidth: "3px", markerEnd: 'url("app://obsidian/#arrow")' };
    svg(edges, "path", { d: "SHOULD-NOT-EXPORT" }).classes.add("canvas-interaction-path");
    const shape = svg(f.card, "svg");
    svg(shape, "polygon", { points: "0,0 100,0 50,100" });
    const output = await serializeVectorTile(asHtml(f.wrapper), "page-2", new AbortController().signal);
    expect(output).toContain('transform="matrix(1 0 0 1 40 50)"');
    expect(output).toContain('id="page-2-arrow"');
    expect(output).toContain('marker-end="url(#page-2-arrow)"');
    expect(output).toContain('d="M-10 0C0 10 30 30 100 40"');
    expect(output).toContain('points="0,0 100,0 50,100"');
    expect(output).not.toContain("SHOULD-NOT-EXPORT");
    expect(marker.getAttribute("id")).toBe("arrow");
  });

  it("preserves tablet-native arrow group CSS matrices and identity endpoint polygons without XML transforms", async () => {
    const f = fixture();
    const root = svg(f.wrapper, "svg");
    root.classes.add("canvas-edges");
    const rootMatrix = new Matrix("matrix(1,0,0,1,140,250)");
    root.screen = rootMatrix;
    for (const [x, y] of [[1100, 55], [580, 255]]) {
      const group = svg(root, "g");
      const native = new Matrix(`matrix(0,1,-1,0,${x},${y})`);
      group.computed = { transform: `matrix(0,1,-1,0,${x},${y})`, transformOrigin: "0px 0px", transformBox: "view-box" };
      group.screen = rootMatrix.multiply(native);
      const polygon = svg(group, "polygon", { points: "0,0 8,4 0,8" });
      polygon.classes.add("canvas-path-end");
      polygon.computed = { transform: "matrix(1,0,0,1,0,0)", transformOrigin: "6.5px 0px", transformBox: "fill-box" };
      polygon.screen = group.screen;
    }
    const output = await serializeVectorTile(asHtml(f.wrapper), "tablet", new AbortController().signal);
    expect(output).toContain('transform="matrix(0 1 -1 0 1100 55)"');
    expect(output).toContain('transform="matrix(0 1 -1 0 580 255)"');
    expect(output.match(/transform="matrix\(1 0 0 1 0 0\)"/gu)).toHaveLength(2);
    expect(output.match(/<polygon/gu)).toHaveLength(2);
    expect(root.children.every(group => !group.hasAttribute("transform"))).toBe(true);
    expect(output).not.toMatch(/foreignObject|<image/u);
  });

  it("uses the parent-relative CTM for CSS origin/reference boxes and overrides an XML transform once", async () => {
    const f = fixture();
    const root = svg(f.wrapper, "svg");
    root.classes.add("canvas-edges");
    const rootMatrix = new Matrix("matrix(2,0,0,2,140,250)");
    root.screen = rootMatrix;
    const path = svg(root, "path", { d: "M50 40L150 40L150 100Z", transform: "translate(999 888)" });
    path.computed = { transform: "matrix(0,1,-1,0,12,8)", transformOrigin: "50px 30px", transformBox: "fill-box" };
    const originAware = new Matrix("matrix(0,1,-1,0,182,-22)");
    path.screen = rootMatrix.multiply(originAware);
    const output = await serializeVectorTile(asHtml(f.wrapper), "origin", new AbortController().signal);
    expect(output).toContain('transform="matrix(0 1 -1 0 182 -22)"');
    expect(output).not.toContain("translate(999 888)");
    expect(path.getAttribute("transform")).toBe("translate(999 888)");
  });

  it("keeps marker fallback transforms and nested SVG viewport geometry without borrowing a screen CTM", async () => {
    const f = fixture();
    const root = svg(f.wrapper, "svg");
    root.classes.add("canvas-edges");
    const marker = svg(svg(root, "defs"), "marker", { id: "cap", viewBox: "0 0 10 10" });
    const cap = svg(marker, "path", { d: "M0 0L10 5L0 10Z" });
    cap.computed = { transform: "matrix(2,0,0,2,0,0)", transformOrigin: "0px 0px", transformBox: "view-box" };
    const nested = svg(root, "svg", { x: "30", y: "50", width: "40", height: "20", viewBox: "0 0 20 10" });
    nested.computed = { transform: "matrix(1,0,0,1,12,8)", transformOrigin: "20px 10px", transformBox: "fill-box" };
    svg(nested, "path", { d: "M0 0L20 10" });
    const output = await serializeVectorTile(asHtml(f.wrapper), "marker", new AbortController().signal);
    expect(output).toContain('transform="matrix(2 0 0 2 0 0)"');
    expect(output).toContain('x="30" y="50" width="40" height="20" viewBox="0 0 20 10"');
    expect(output).toContain('transform="matrix(1 0 0 1 12 8)"');
    expect(marker.getAttribute("id")).toBe("cap");
  });

  it.each(["3d", "unknown-origin"])("refuses unsupported %s SVG transforms rather than dropping their geometry", async mode => {
    const f = fixture();
    const root = svg(f.wrapper, "svg");
    root.classes.add("canvas-edges");
    const cap = svg(svg(svg(root, "defs"), "marker"), "path", { d: "M0 0L10 5" });
    cap.computed = mode === "3d" ? { transform: "matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,4,1)" }
      : { transform: "matrix(0,1,-1,0,12,8)", transformOrigin: "50px 30px", transformBox: "fill-box" };
    await expect(serializeVectorTile(asHtml(f.wrapper), "cap", new AbortController().signal)).rejects.toThrow(mode === "3d" ? "svg:3d-transform" : "svg:transform-origin");
  });

  it("excludes controls, hidden-group descendants and edited text while keeping the ordinary preview", async () => {
    const f = fixture();
    const hidden = f.wrapper.append(new Element(f.document, "div", "miro-canvas-group-hidden")) as Element;
    (hidden.append(new Element(f.document, "div", "canvas-node")) as Element).text("HIDDEN");
    (f.card.append(new Element(f.document, "div", "cm-editor")) as Element).text("EDITOR");
    (f.card.append(new Element(f.document, "div", "canvas-node-resizer")) as Element).text("CONTROL");
    const output = await serializeVectorTile(asHtml(f.wrapper), "tile", new AbortController().signal);
    expect(output).not.toMatch(/HIDDEN|EDITOR|CONTROL/u);
    expect(output).toContain('>A</text>');
  });

  it.each(["", "none", "normal", '""', "''", '" "', '" \t "'])("ignores text-free native Markdown spacers (%j) without mutating the prepared DOM", async content => {
    const f = fixture();
    const preview = f.card.append(new Element(f.document, "div", "markdown-preview-view markdown-rendered node-insert-event show-indentation-guide allow-fold-headings allow-fold-lists")) as Element;
    preview.text("Body");
    for (const pseudo of ["::before", "::after"]) preview.pseudos[pseudo] = { content, display: "block", width: "121.412px", height: "16px", backgroundColor: "rgba(0, 0, 0, 0)" };
    const before = JSON.stringify(preview.pseudos);
    const output = await serializeVectorTile(asHtml(f.wrapper), "markdown", new AbortController().signal);
    expect(output).toContain('>B</text>');
    expect(output).toContain('>y</text>');
    expect(output).not.toMatch(/foreignObject|<image/u);
    expect(JSON.stringify(preview.pseudos)).toBe(before);
  });

  it.each(['" visible text "', '"•"', 'url("icon.png")', "counter(item)", '"\u200b"'])("retains explicit failure for meaningful generated content (%j)", async content => {
    const f = fixture();
    f.card.pseudos["::before"] = { content, display: "block" };
    await expect(serializeVectorTile(asHtml(f.wrapper), "generated", new AbortController().signal)).rejects.toThrow("css:::before");
  });

  it("renders a comment bubble/initial and count badge as paths and text with the accessible thread title", async () => {
    const f = fixture();
    const pin = f.wrapper.append(new Element(f.document, "button", "miro-canvas-comment-marker")) as Element;
    pin.setAttribute("aria-label", "Comment by Author: review <this>");
    pin.setAttribute("data-comment-count", "3");
    Object.assign(pin.computed, { width: "32px", height: "32px", borderTopLeftRadius: "50%", borderTopRightRadius: "50%", borderBottomRightRadius: "50%", borderBottomLeftRadius: "0px" });
    pin.pseudos["::after"] = { content: '"3"', width: "16px", height: "16px", top: "-6px", left: "auto", right: "-8px", paddingLeft: "4px", paddingRight: "4px", fontSize: "10px", backgroundColor: "rgb(0, 0, 200)" };
    const bubble = svg(pin, "svg");
    svg(bubble, "path", { d: "M0 0L32 16L0 32Z" });
    (pin.append(new Element(f.document, "span")) as Element).text("P");
    const output = await serializeVectorTile(asHtml(f.wrapper), "tile", new AbortController().signal);
    expect(output).toContain('<title>Comment by Author: review &lt;this&gt;</title>');
    expect(output).toContain('d="M0 0L32 16L0 32Z"');
    expect(output).toContain('>P</text>');
    expect(output).toContain('>3</text>');
  });

  it("embeds only intrinsic raster attachments and releases their encoding canvas", async () => {
    const f = fixture();
    f.card.append(new Element(f.document, "img"));
    const output = await serializeVectorTile(asHtml(f.wrapper), "tile", new AbortController().signal);
    expect(output).toContain('data-miro-raster-attachment="true"');
    expect(output).toContain('href="data:image/png;base64,');
    expect(f.document.sheets).toHaveLength(1);
    expect(f.document.sheets[0]).toMatchObject({ width: 0, height: 0 });
    expect(f.document.sheets[0]!.draw).toHaveBeenCalledOnce();
  });

  it.each(["canvas", "iframe", "video", "input", "foreignObject", "svg-image", "generated-text", "rotated-text", "unordered-list", "complex-text"])("fails clearly on unsupported critical %s instead of returning an incomplete export", async feature => {
    const f = fixture();
    if (feature === "foreignObject") svg(svg(f.card, "svg"), feature);
    else if (feature === "svg-image") { const image = f.card.append(new Element(f.document, "img")) as Element; image.src = "diagram.svg"; }
    else if (feature === "generated-text") f.card.pseudos["::before"] = { content: '"critical generated text"' };
    else if (feature === "rotated-text") f.card.computed.transform = "matrix(0,1,-1,0,0,0)";
    else if (feature === "complex-text") f.card.text("العربية");
    else if (feature === "unordered-list") { const item = f.card.append(new Element(f.document, "li")) as Element; item.computed.listStyleType = "disc"; item.text("Item"); }
    else f.card.append(new Element(f.document, feature));
    await expect(serializeVectorTile(asHtml(f.wrapper), "tile", new AbortController().signal)).rejects.toThrow(words().export.vectorUnsupported(""));
    expect(rasterizer).not.toHaveBeenCalled();
  });
});

describe("independent vector pages", () => {
  it("reuses page areas, stacks unequal pages, clips viewport tiles and never calls the rasterizer", async () => {
    const f = fixture();
    const before = JSON.stringify(f.card.computed);
    const progress = vi.fn(() => true);
    const prepare = vi.fn();
    const bytes = await renderVectorExportPages(f.canvas, [{ x: -50, y: -20, width: 350, height: 80 }, { x: 900, y: 0, width: 120, height: 120 }], progress, undefined, prepare);
    const output = new TextDecoder().decode(bytes);
    expect(output).toContain('width="350" height="224" viewBox="0 0 350 224"');
    expect(output).toContain('x="0" y="104" width="120" height="120"');
    expect(output).toContain('x="200" y="0" width="150" height="80"');
    expect(output).toContain('overflow="hidden"');
    expect(output).not.toMatch(/foreignObject|<image/u);
    expect(prepare).toHaveBeenCalledTimes(4);
    expect(progress).toHaveBeenLastCalledWith(4, 4);
    expect(JSON.stringify(f.card.computed)).toBe(before);
    unchanged(f);
  });

  it("refuses a source canvas before camera mutation, deselection, frame scheduling or preparation", async () => {
    const f = fixture();
    f.wrapper.values.delete("data-miro-canvas-export-renderer");
    const prepare = vi.fn();
    await expect(renderVectorExportPages(f.canvas, [{ x: 0, y: 0, width: 100, height: 100 }], () => true, undefined, prepare)).rejects.toThrow();
    expect(f.canvas.deselectAll).not.toHaveBeenCalled();
    expect(f.canvas.requestFrame).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
    unchanged(f);
  });

  it("waits for native Markdown before preparation and serialization", async () => {
    const f = fixture();
    vi.spyOn(nativeExport, "settleExportMarkdown").mockImplementationOnce(async () => { f.card.text("READY"); });
    const prepare = vi.fn(() => expect(f.card.textContent).toContain("READY"));
    const result = await renderVectorExportPages(f.canvas, [{ x: 0, y: 0, width: 100, height: 100 }], () => true, undefined, prepare);
    expect(new TextDecoder().decode(result)).toContain('>R</text>');
    expect(prepare).toHaveBeenCalledOnce();
    unchanged(f);
  });

  it("Stop interrupts font readiness without returning bytes and restores only owned state", async () => {
    const f = fixture();
    const other = fixture();
    f.document.fonts.ready = new Promise(() => undefined);
    const controller = new AbortController();
    const job = renderVectorExportPages(f.canvas, [{ x: 0, y: 0, width: 100, height: 100 }], () => true, controller.signal);
    controller.abort();
    await expect(job).rejects.toThrow(words().export.exportStopped);
    unchanged(f);
    unchanged(other);
    expect(other.canvas.deselectAll).not.toHaveBeenCalled();
    expect(other.canvas.requestFrame).not.toHaveBeenCalled();
  });

  it.each(["prepare", "microtask", "final-progress"])("Stop at %s produces no partial document and clears frame timers", async stage => {
    vi.useFakeTimers();
    const f = fixture();
    const controller = new AbortController();
    const prepare = () => {
      if (stage === "prepare") controller.abort();
      if (stage === "microtask") queueMicrotask(() => controller.abort());
    };
    const job = renderVectorExportPages(f.canvas, [{ x: 0, y: 0, width: 100, height: 100 }], (done, total) => stage !== "final-progress" || done !== total, controller.signal, prepare);
    const rejected = expect(job).rejects.toThrow(words().export.exportStopped);
    await vi.runAllTimersAsync();
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
    unchanged(f);
  });

  it("refuses missing native/plugin scene items instead of silently omitting them", async () => {
    const f = fixture();
    Reflect.set(f.canvas, "nodes", new Map([["missing", { x: 0, y: 0, width: 100, height: 100 }]]));
    await expect(renderVectorExportPages(f.canvas, [{ x: 0, y: 0, width: 100, height: 100 }], () => true)).rejects.toThrow("node:missing-render");
    unchanged(f);
    Reflect.set(f.canvas, "nodes", new Map());
    Reflect.set(f.canvas, "edges", new Map([["missing", {}]]));
    await expect(renderVectorExportPages(f.canvas, [{ x: 0, y: 0, width: 100, height: 100 }], () => true)).rejects.toThrow("edge:missing-render");
    unchanged(f);
    Reflect.set(f.canvas, "edges", new Map());
    Reflect.set(f.canvas, "getData", () => ({ miroCanvas: { connectors: { missing: { id: "missing", from: { type: "point", x: 0, y: 0 }, to: { type: "point", x: 100, y: 100 }, route: "straight", color: "#ff0000", width: 2, startCap: "none", endCap: "none" } } } }));
    await expect(renderVectorExportPages(f.canvas, [{ x: 0, y: 0, width: 100, height: 100 }], () => true)).rejects.toThrow("connector:missing-render");
    unchanged(f);
  });

  it("Stop clears the serialization yield timer for a text-heavy card", async () => {
    vi.useFakeTimers();
    const f = fixture();
    f.card.text("Long card ".repeat(60));
    const controller = new AbortController();
    const job = serializeVectorTile(asHtml(f.wrapper), "tile", controller.signal);
    const rejected = expect(job).rejects.toThrow(words().export.exportStopped);
    for (let attempt = 0; attempt < 400 && vi.getTimerCount() === 0; attempt += 1) await Promise.resolve();
    expect(vi.getTimerCount()).toBe(1);
    controller.abort();
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
    expect(f.document.detachedRanges).toBeGreaterThan(0);
  });

  it("restores the independent camera on unsupported content failure and guards enormous geometry before tile allocation", async () => {
    const f = fixture();
    f.card.append(new Element(f.document, "iframe"));
    await expect(renderVectorExportPages(f.canvas, [{ x: 0, y: 0, width: 100, height: 100 }], () => true)).rejects.toThrow("iframe");
    unchanged(f);
    const huge = fixture();
    await expect(renderVectorExportPages(huge.canvas, [{ x: 0, y: 0, width: 1e100, height: 1e100 }], () => true)).rejects.toThrow("tile-budget");
    expect(huge.canvas.deselectAll).not.toHaveBeenCalled();
    unchanged(huge);
  });
});
