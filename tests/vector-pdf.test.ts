import { afterEach, describe, expect, it, vi } from "vitest";
import { jsPDF } from "jspdf";
import { packVectorPdf } from "../src/vector-pdf";
import { registerVectorPdfFont, vectorPdfFontStyle, vectorPdfHasGlyph } from "../src/vector-pdf-fonts";
import type { VectorDocumentPage } from "../src/vector-document";

const converter = vi.hoisted(() => vi.fn());
vi.mock("svg2pdf.js", () => ({ svg2pdf: converter }));
const ns = "http://www.w3.org/2000/svg";
class Node {
  readonly nodeType = 1;
  readonly namespaceURI: string;
  parentElement: Node | null = null;
  readonly children: Node[] = [];
  readonly values = new Map<string, string>();
  constructor(readonly localName: string, values: Record<string, string> = {}, readonly content = "", namespace = ns) {
    this.namespaceURI = namespace;
    Object.entries(values).forEach(([key, value]) => this.values.set(key, value));
  }
  get attributes() { return [...this.values].map(([name, value]) => ({ name, value, namespaceURI: null })); }
  get childNodes(): Array<Node | { nodeType: number; textContent: string }> { return this.content ? [{ nodeType: 3, textContent: this.content }, ...this.children] : this.children; }
  get textContent(): string { return this.content + this.children.map(child => child.textContent).join(""); }
  get firstElementChild() { return this.children[0] ?? null; }
  getAttribute(name: string) { return this.values.get(name) ?? null; }
  setAttribute(name: string, value: string) { this.values.set(name, value); }
  removeAttribute(name: string) { this.values.delete(name); }
  hasAttribute(name: string) { return this.values.has(name); }
  appendChild(node: Node) { this.children.push(node); node.parentElement = this; return node; }
  contains(node: Node): boolean { return node === this || this.children.some(child => child.contains(node)); }
  cloneNode(deep: boolean): Node { const node = new Node(this.localName, Object.fromEntries(this.values), this.content, this.namespaceURI); if (deep) this.children.forEach(child => node.appendChild(child.cloneNode(true))); return node; }
  remove() { if (this.parentElement !== null) this.parentElement.children.splice(this.parentElement.children.indexOf(this), 1); this.parentElement = null; }
}
function scene(...children: Node[]) { const root = new Node("svg", { xmlns: ns, width: "100", height: "50", viewBox: "0 0 100 50" }); children.forEach(child => root.appendChild(child)); return root; }
function host(root: Node, parserError = false) {
  const body = new Node("body", {}, "", "http://www.w3.org/1999/xhtml");
  const parse = vi.fn(() => ({ documentElement: root, querySelector: () => parserError ? {} : null }));
  class Parser { parseFromString = parse; }
  return { document: { body, defaultView: { DOMParser: Parser, setTimeout, clearTimeout, atob }, importNode: (node: Node, deep: boolean) => node.cloneNode(deep) } as unknown as Document, body, parse };
}
function page(overrides: Partial<VectorDocumentPage> = {}): VectorDocumentPage { return { svg: '<svg xmlns="http://www.w3.org/2000/svg"/>', width: 300, height: 150, ...overrides }; }
afterEach(() => converter.mockReset());

it("selects all four offline font styles and refuses uncovered codepoints", () => {
  expect(vectorPdfFontStyle("400", "normal")).toBe("normal");
  expect(vectorPdfFontStyle("700", "normal")).toBe("bold");
  expect(vectorPdfFontStyle("400", "italic")).toBe("italic");
  expect(vectorPdfFontStyle("700", "italic")).toBe("bolditalic");
  for (const style of ["normal", "bold", "italic", "bolditalic"] as const) {
    for (const character of "AБяЁїє—€") expect(vectorPdfHasGlyph(character.codePointAt(0)!, style)).toBe(true);
    expect(vectorPdfHasGlyph(0x1f600, style)).toBe(false);
    expect(vectorPdfHasGlyph(0x4e00, style)).toBe(false);
  }
});
it("registers actual Identity-H TTFs and emits a Unicode font and mapping", () => {
  const pdf = new jsPDF({ putOnlyUsedFonts: true });
  registerVectorPdfFont(pdf, "Fixture Noto", "normal");
  pdf.setFont("Fixture Noto", "normal").text("Привет Ёж", 10, 20);
  expect(pdf.getFont().encoding).toBe("Identity-H");
  const bytes = pdf.output();
  expect(bytes).toContain("/FontFile2");
  expect(bytes).toContain("/ToUnicode");
  expect(bytes).toContain("041f");
});
describe("fail-closed vector PDF preparation", () => {
  it.each([
    ["script", {}], ["foreignObject", {}], ["style", {}], ["filter", {}], ["iframe", {}],
    ["rect", { onclick: "alert(1)" }], ["rect", { style: "fill:red" }],
    ["rect", { fill: "url(https://example.com/x)" }], ["use", { href: "file:///vault/a.svg" }],
    ["image", { href: "data:image/svg+xml;base64,AAAA" }], ["image", { href: "https://example.com/a.png" }],
    ["path", { "vector-effect": "non-scaling-stroke" }], ["path", { "paint-order": "stroke" }],
  ] as const)("rejects unsupported %s before converter execution (%j)", async (tag, attributes) => {
    const { document } = host(scene(new Node(tag, attributes)));
    await expect(packVectorPdf([page()], {}, document)).rejects.toThrow();
    expect(converter).not.toHaveBeenCalled();
  });
  it("refuses a foreign namespace, malformed XML and declarations", async () => {
    await expect(packVectorPdf([page()], {}, host(scene(new Node("rect", {}, "", "https://example.com/ns"))).document)).rejects.toThrow("element-rect");
    await expect(packVectorPdf([page()], {}, host(scene(), true).document)).rejects.toThrow("invalid-svg");
    await expect(packVectorPdf([page({ svg: '<!DOCTYPE svg><svg/>' })], {}, host(scene()).document)).rejects.toThrow("xml-declaration");
  });
  it("refuses missing references, duplicate IDs and cyclic uses", async () => {
    await expect(packVectorPdf([page()], {}, host(scene(new Node("path", { "clip-path": "url(#missing)" }))).document)).rejects.toThrow("missing-reference");
    await expect(packVectorPdf([page()], {}, host(scene(new Node("rect", { id: "x" }), new Node("rect", { id: "x" }))).document)).rejects.toThrow("id");
    const defs = new Node("defs"); defs.appendChild(new Node("use", { id: "x", href: "#x" }));
    await expect(packVectorPdf([page()], {}, host(scene(defs)).document)).rejects.toThrow("reference-cycle");
  });
  it("refuses missing glyphs instead of substituting an empty square", async () => {
    await expect(packVectorPdf([page()], {}, host(scene(new Node("text", {}, "Hello 😀"))).document)).rejects.toThrow("missing-glyph-U+1F600");
    expect(converter).not.toHaveBeenCalled();
  });
  it("rejects unsupported multi-character tracking and group opacity", async () => {
    await expect(packVectorPdf([page()], {}, host(scene(new Node("text", { "letter-spacing": "2px" }, "two"))).document)).rejects.toThrow("letter-spacing");
    await expect(packVectorPdf([page()], {}, host(scene(new Node("g", { opacity: ".5" }))).document)).rejects.toThrow("group-opacity");
  });
  it.each([NaN, 0, -1, Infinity, 14401])("refuses invalid page geometry %s", async width => {
    await expect(packVectorPdf([page({ width })], {}, host(scene()).document)).rejects.toThrow("page-geometry");
  });
  it("refuses empty/excessive page lists and deep scenes", async () => {
    const { document } = host(scene());
    await expect(packVectorPdf([], {}, document)).rejects.toThrow("page-budget");
    await expect(packVectorPdf(Array(201).fill(page()), {}, document)).rejects.toThrow("page-budget");
    const root = scene(); let child = root; for (let index = 0; index < 49; index++) child = child.appendChild(new Node("g"));
    await expect(packVectorPdf([page()], {}, host(root).document)).rejects.toThrow("node-budget");
  });
});
it("normalizes page viewport and Noto top/central baselines without modifying source", async () => {
  const source = scene(new Node("text", { x: "20", y: "30", "font-family": "Arial", "font-size": "20px", "dominant-baseline": "text-before-edge" }, "Ж"), new Node("text", { x: "70", y: "30", "font-size": "20px", "dominant-baseline": "central" }, "1"));
  const { document } = host(source);
  converter.mockResolvedValue(undefined);
  await packVectorPdf([page()], {}, document);
  const converted = converter.mock.calls[0][0] as Node;
  expect(converted.getAttribute("width")).toBe("300");
  expect(converted.getAttribute("height")).toBe("150");
  expect(converted.getAttribute("viewBox")).toBe("0 0 100 50");
  expect(converted.children[0].getAttribute("x")).toBe("20");
  expect(Number(converted.children[0].getAttribute("y"))).toBeCloseTo(51.38);
  expect(Number(converted.children[1].getAttribute("y"))).toBeCloseTo(37.76);
  expect(converted.children[0].getAttribute("font-family")).toMatch(/^MiroPdfNoto/);
  expect(source.children[0].getAttribute("y")).toBe("30");
  expect(source.children[0].getAttribute("font-family")).toBe("Arial");
});
it("passes only consecutive small batches with original clip/transform ancestry", async () => {
  const defs = new Node("defs"); const clip = defs.appendChild(new Node("clipPath", { id: "cut" })); clip.appendChild(new Node("rect", { width: "100", height: "50" }));
  const group = new Node("g", { transform: "translate(5 6)", "clip-path": "url(#cut)" });
  for (let index = 0; index < 130; index++) group.appendChild(new Node("rect", { x: String(index), y: "2", width: "1", height: "2" }));
  converter.mockImplementation(async (_root: Node, pdf: jsPDF) => pdf.rect(1, 2, 3, 4));
  const { document, body } = host(scene(defs, group));
  const progress = vi.fn(() => true);
  const output = await packVectorPdf([page(), page({ width: 150, height: 300 })], { title: "Two pages" }, document, undefined, progress);
  expect(new TextDecoder().decode(output.slice(0, 5))).toBe("%PDF-");
  expect(converter).toHaveBeenCalledTimes(6);
  for (const [converted] of converter.mock.calls) {
    const root = converted as Node;
    expect(root.children[0].localName).toBe("defs");
    expect(root.children[1].getAttribute("transform")).toBe("translate(5 6)");
    expect(root.children[1].getAttribute("clip-path")).toBe("url(#cut)");
    expect(root.children[1].children.length).toBeLessThanOrEqual(64);
  }
  expect(progress).toHaveBeenLastCalledWith(2, 2);
  expect(body.children).toHaveLength(0);
});
it("honours Stop before work, between batches and at final progress", async () => {
  const { document } = host(scene(new Node("rect", { width: "1", height: "1" })));
  const early = new AbortController(); early.abort();
  await expect(packVectorPdf([page()], {}, document, early.signal)).rejects.toThrow("stopped");
  expect(converter).not.toHaveBeenCalled();
  const late = new AbortController(); converter.mockImplementation(async () => { late.abort(); });
  await expect(packVectorPdf([page()], {}, document, late.signal)).rejects.toThrow("stopped");
  converter.mockResolvedValue(undefined);
  await expect(packVectorPdf([page()], {}, document, undefined, done => done < 1)).rejects.toThrow("stopped");
});
it("does not report success if the SVG converter fails", async () => {
  const { document, body } = host(scene(new Node("rect", { width: "1", height: "1" })));
  converter.mockRejectedValue(new Error("converter failed"));
  await expect(packVectorPdf([page()], {}, document)).rejects.toThrow("converter failed");
  expect(body.children).toHaveLength(0);
});

it("copies only reachable resource definitions for each batch", async () => {
  const definitions = new Node("defs");
  for (let index = 0; index < 200; index++) {
    const clip = definitions.appendChild(new Node("clipPath", { id: `cut${index}` }));
    clip.appendChild(new Node("rect", { width: "100", height: "50" }));
  }
  const group = new Node("g", { "clip-path": "url(#cut17)" });
  group.appendChild(new Node("rect", { width: "20", height: "10" }));
  converter.mockResolvedValue(undefined);
  await packVectorPdf([page()], {}, host(scene(definitions, group)).document);
  const root = converter.mock.calls[0][0] as Node;
  expect(root.children[0].localName).toBe("defs");
  expect(root.children[0].children).toHaveLength(1);
  expect(root.children[0].children[0].getAttribute("id")).toBe("cut17");
});
it("refuses incorrect reference types and geometry embedded inside text", async () => {
  const root = scene(new Node("rect", { id: "cut", width: "1", height: "1" }), new Node("path", { "clip-path": "url(#cut)" }));
  await expect(packVectorPdf([page()], {}, host(root).document)).rejects.toThrow("clip-reference");
  const text = new Node("text", {}, "Words"); text.appendChild(new Node("rect", { width: "1", height: "1" }));
  await expect(packVectorPdf([page()], {}, host(scene(text)).document)).rejects.toThrow("paint-child");
});
it("rejects malformed intrinsic PNGs instead of allowing silent image omission", async () => {
  const image = new Node("image", { href: "data:image/png;base64,AAAA", "data-miro-raster-attachment": "true", width: "1", height: "1" });
  await expect(packVectorPdf([page()], {}, host(scene(image)).document)).rejects.toThrow("invalid-png");
  expect(converter).not.toHaveBeenCalled();
});

it("preserves validated native SVG viewport clipping and rejects unknown overflow", async () => {
  const nested = new Node("svg", { x: "10", y: "10", width: "30", height: "20", viewBox: "0 0 30 20", overflow: "hidden" });
  nested.appendChild(new Node("rect", { x: "20", y: "5", width: "30", height: "10" }));
  const root = scene(nested); root.setAttribute("overflow", "visible");
  converter.mockResolvedValue(undefined);
  await packVectorPdf([page()], {}, host(root).document);
  const converted = converter.mock.calls[0][0] as Node;
  expect(converted.getAttribute("overflow")).toBe("visible");
  expect(converted.children[0].getAttribute("overflow")).toBe("hidden");
  expect(converted.children[0].getAttribute("viewBox")).toBe("0 0 30 20");
  root.setAttribute("overflow", "scroll");
  await expect(packVectorPdf([page()], {}, host(root).document)).rejects.toThrow("overflow");
});

it("normalizes native OKLCH with exact alpha on the detached copy only", async () => {
  const value = "oklch(0.593064 0.0000294914 none / 0.07)";
  const source = scene(new Node("rect", { width: "20", height: "20", fill: value }));
  const { document } = host(source);
  const context = { fillStyle: "", fillRect: vi.fn(), getImageData: () => ({ data: [126, 126, 126, 255] }) };
  const canvas = { width: 0, height: 0, getContext: () => context };
  Object.assign(document.defaultView!, { CSS: { supports: () => true } });
  Object.assign(document, { createElement: () => canvas });
  converter.mockResolvedValue(undefined);
  await packVectorPdf([page()], {}, document);
  const root = converter.mock.calls[0][0] as Node;
  expect(root.children[0].getAttribute("fill")).toBe("rgba(126,126,126,0.07)");
  expect(source.children[0].getAttribute("fill")).toBe(value);
  expect(context.fillStyle).toBe("oklch(0.593064 0.0000294914 none / 1)");
  expect(canvas.width).toBe(0);
  expect(canvas.height).toBe(0);
});
