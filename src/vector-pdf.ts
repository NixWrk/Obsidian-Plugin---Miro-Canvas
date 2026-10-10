/** Vector PDF conversion of the plugin's prepared SVG pages, never a page bitmap. */
import type { jsPDF } from "jspdf";
import { words } from "./i18n";
import { registerVectorPdfFont, vectorPdfFontStyle, vectorPdfHasGlyph, type VectorPdfFontStyle } from "./vector-pdf-fonts";
import type { VectorDocumentPage } from "./vector-document";
import { createHtmlElement } from "./dom-elements";

const SVG_NS = "http://www.w3.org/2000/svg";
const MAX_BYTES = 32 * 1024 * 1024;
const MAX_NODES = 100_000;
const MAX_PAGE_BYTES = 4 * 1024 * 1024;
const MAX_PAGE_NODES = 25_000;
const BATCH_SIZE = 64;
const RESOURCE_TAGS = new Set(["defs", "clipPath", "marker", "linearGradient", "radialGradient", "stop", "title", "desc"]);
const PAINT_TAGS = new Set(["path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "text", "image", "use"]);
const TAGS = new Set(["svg", "g", "tspan", ...RESOURCE_TAGS, ...PAINT_TAGS]);
const ATTRIBUTES = new Set([
  "id", "xmlns", "xmlns:xlink", "xml:space", "x", "y", "x1", "x2", "y1", "y2", "cx", "cy", "r", "rx", "ry", "d", "points",
  "width", "height", "viewBox", "preserveAspectRatio", "overflow", "transform", "fill", "stroke", "stroke-width", "stroke-dasharray", "stroke-dashoffset",
  "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "fill-rule", "clip-rule", "opacity", "fill-opacity", "stroke-opacity", "color",
  "font-family", "font-size", "font-weight", "font-style", "font-variant", "letter-spacing", "word-spacing", "text-decoration", "text-anchor",
  "dominant-baseline", "alignment-baseline", "marker-start", "marker-mid", "marker-end", "clip-path", "stop-color", "stop-opacity", "paint-order",
  "vector-effect", "markerWidth", "markerHeight", "markerUnits", "refX", "refY", "orient", "offset", "gradientUnits", "gradientTransform",
  "spreadMethod", "clipPathUnits", "dx", "dy", "rotate", "textLength", "lengthAdjust", "href", "xlink:href", "data-miro-page", "data-miro-raster-attachment",
]);
const NUMBERS = new Set(["x", "y", "x1", "x2", "y1", "y2", "cx", "cy", "r", "rx", "ry", "width", "height", "stroke-width", "stroke-dashoffset",
  "stroke-miterlimit", "font-size", "markerWidth", "markerHeight", "refX", "refY", "offset", "dx", "dy", "textLength"]);
let sequence = 0;

function unsupported(reason: string): never {
  throw new Error(words().export.vectorUnsupported(`pdf:${reason}`));
}

function stopped(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error(words().export.exportStopped);
}

function yieldOwned(view: Window, signal?: AbortSignal): Promise<void> {
  stopped(signal);
  return new Promise((resolve, reject) => {
    const abort = (): void => {
      view.clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(new Error(words().export.exportStopped));
    };
    const timer = view.setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, 0);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
  });
}

function number(value: string, reason: string): number {
  if (!/^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?(?:px|pt|%)?$/iu.test(value)) unsupported(reason);
  const result = Number.parseFloat(value);
  if (!Number.isFinite(result) || Math.abs(result) > 10_000_000) unsupported(reason);
  return result;
}

function numericList(value: string, reason: string): number[] {
  const parts = value.trim().split(/[\s,]+/u);
  if (parts.length > 50_000) unsupported(reason);
  return parts.map(part => number(part, reason));
}

/** Browser color conversion only: one owned pixel, never a card/page raster. */
function normalizedColor(value: string, document: Document): string {
  if (/^(?:none|transparent|currentColor|context-fill|context-stroke)$/iu.test(value) || /^url\(/u.test(value)) return value;
  if (/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/iu.test(value) || /^rgba?\(\s*[-+\d.]+\s*,\s*[-+\d.]+\s*,\s*[-+\d.]+(?:\s*,\s*[\d.]+)?\s*\)$/u.test(value)) return value;
  const view = document.defaultView;
  if (view === null || typeof view.CSS?.supports !== "function" || !view.CSS.supports("color", value)) unsupported("color");
  const canvas = createHtmlElement(document, "canvas");
  canvas.width = canvas.height = 1;
  try {
    const context = canvas.getContext("2d", { colorSpace: "srgb", willReadFrequently: true });
    if (context === null) unsupported("color-conversion");
    const match = /\/\s*([\d.]+%?)\s*\)$/u.exec(value);
    let alpha = 1;
    let opaque = value;
    if (match !== null) {
      alpha = number(match[1], "color-alpha") / (match[1].endsWith("%") ? 100 : 1);
      if (alpha < 0 || alpha > 1) unsupported("color-alpha");
      opaque = value.replace(/\/\s*[\d.]+%?\s*\)$/u, "/ 1)");
    }
    context.fillStyle = opaque;
    context.fillRect(0, 0, 1, 1);
    const [red, green, blue, actualAlpha] = context.getImageData(0, 0, 1, 1).data;
    return `rgba(${red},${green},${blue},${match === null ? actualAlpha / 255 : alpha})`;
  } finally {
    canvas.width = canvas.height = 0;
  }
}

interface PreparedPage {
  readonly root: Element;
  readonly ids: ReadonlyMap<string, Element>;
  readonly paints: Element[];
  readonly resources: Element[];
  readonly styles: Set<VectorPdfFontStyle>;
  readonly imageUrls: Set<string>;
  readonly nodes: number;
}

/** Strictly admit only material the bundled converter actually handles. */
function prepare(page: VectorDocumentPage, document: Document, family: string): PreparedPage {
  const view = document.defaultView;
  if (view === null) throw new Error(words().export.unavailable);
  if (/<!DOCTYPE|<!ENTITY|<\?/iu.test(page.svg)) unsupported("xml-declaration");
  const parsed = new view.DOMParser().parseFromString(page.svg, "image/svg+xml");
  if (parsed.querySelector("parsererror") !== null || parsed.documentElement.localName !== "svg") unsupported("invalid-svg");
  const root = document.importNode(parsed.documentElement, true);
  const colors = new Map<string, string>();
  const ids = new Map<string, Element>();
  const references: Array<{ node: Element; id: string; attribute: string }> = [];
  const paints: Element[] = [];
  const resources: Element[] = [];
  const styles = new Set<VectorPdfFontStyle>();
  const imageUrls = new Set<string>();
  let nodes = 0;
  const visit = (node: Element, depth: number, resource: boolean, textState: { weight: string; style: string; size: number; baseline: string }): void => {
    nodes += 1;
    if (nodes > MAX_PAGE_NODES || depth > 48) unsupported("node-budget");
    const tag = node.localName;
    if (node.namespaceURI !== SVG_NS || !TAGS.has(tag)) unsupported(`element-${tag}`);
    if (RESOURCE_TAGS.has(tag) && !resource) resources.push(node);
    const inResource = resource || RESOURCE_TAGS.has(tag);
    if (PAINT_TAGS.has(tag) && !resource) paints.push(node);
    const id = node.getAttribute("id");
    if (id !== null) {
      if (!/^[A-Za-z_][A-Za-z0-9_.:-]{0,159}$/u.test(id) || ids.has(id)) unsupported("id");
      ids.set(id, node);
    }
    for (const attribute of Array.from(node.attributes)) {
      const name = attribute.name;
      const value = attribute.value;
      if (!ATTRIBUTES.has(name) || (attribute.namespaceURI !== null && !["http://www.w3.org/2000/xmlns/", "http://www.w3.org/1999/xlink", "http://www.w3.org/XML/1998/namespace"].includes(attribute.namespaceURI))) unsupported(`attribute-${name}`);
      if (value.length > (name === "href" || name === "xlink:href" ? 8 * 1024 * 1024 : 200_000)) unsupported("attribute-budget");
      if (["fill", "stroke", "color", "stop-color"].includes(name)) {
        let color = colors.get(value);
        if (color === undefined) { color = normalizedColor(value, document); colors.set(value, color); }
        node.setAttribute(name, color);
      }
      if (NUMBERS.has(name)) number(value, `number-${name}`);
      if (name === "overflow" && !["hidden", "visible"].includes(value)) unsupported("overflow");
      if (["opacity", "fill-opacity", "stroke-opacity", "stop-opacity"].includes(name)) {
        const opacity = number(value, "opacity");
        if (opacity < 0 || opacity > 1 || ((tag === "g" || tag === "svg") && opacity !== 1)) unsupported("group-opacity");
      }
      if (name === "viewBox" && numericList(value, "viewbox").length !== 4) unsupported("viewbox");
      if (name === "points") numericList(value, "points");
      if (name === "stroke-dasharray" && value !== "none") numericList(value, "dasharray");
      if (name === "transform" || name === "gradientTransform") {
        if (!/^(?:\s*(?:matrix|translate|scale|rotate|skewX|skewY)\(\s*[-+\d.eE,\s]+\)\s*)+$/u.test(value)) unsupported("transform");
        numericList(value.replace(/[A-Za-z]+\(/gu, "").replace(/\)/gu, " "), "transform");
      }
      if (name === "d" && (!/^[MmZzLlHhVvCcSsQqTtAa\d.eE+\-,\s]*$/u.test(value) || value.length > 50_000)) unsupported("path");
      if (name === "rotate" && number(value, "text-rotation") !== 0) unsupported("text-rotation");
      if (name === "lengthAdjust" && value !== "spacing") unsupported("text-length-adjustment");
      if ((name === "paint-order" && value !== "normal") || (name === "vector-effect" && value !== "none") || (name === "font-variant" && value !== "normal") || (name === "text-decoration" && value !== "none")) unsupported(name);
      if (name === "href" || name === "xlink:href") {
        if (tag === "image") {
          if (node.getAttribute("data-miro-raster-attachment") !== "true" || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/u.test(value)) unsupported("image-resource");
          imageUrls.add(value);
        } else {
          if (!/^#[A-Za-z_][A-Za-z0-9_.:-]{0,159}$/u.test(value)) unsupported("external-reference");
          if (tag !== "use") unsupported("reference-element");
          references.push({ node, id: value.slice(1), attribute: name });
        }
      } else if (/url\(/iu.test(value)) {
        if (!["fill", "stroke", "clip-path", "marker-start", "marker-mid", "marker-end"].includes(name)) unsupported("resource-attribute");
        const match = /^url\(["']?#([A-Za-z_][A-Za-z0-9_.:-]{0,159})["']?\)$/u.exec(value);
        if (match === null) unsupported("external-resource");
        references.push({ node, id: match[1], attribute: name });
      }
    }
    const sizeValue = node.getAttribute("font-size");
    const size = sizeValue === null ? textState.size : number(sizeValue, "font-size") * (sizeValue.endsWith("pt") ? 4 / 3 : 1);
    if (sizeValue !== null) node.setAttribute("font-size", String(size));
    if (size <= 0 || size > 10000) unsupported("font-size");
    const state = { size, weight: node.getAttribute("font-weight") ?? textState.weight, style: node.getAttribute("font-style") ?? textState.style,
      baseline: node.getAttribute("dominant-baseline") ?? node.getAttribute("alignment-baseline") ?? textState.baseline };
    if (!/^(?:normal|bold|[1-9]00)$/u.test(state.weight) || !["normal", "italic", "oblique"].includes(state.style)) unsupported("font-style");
    if (tag === "text" || tag === "tspan") {
      const fontStyle = vectorPdfFontStyle(state.weight, state.style);
      styles.add(fontStyle);
      node.setAttribute("font-family", family);
      node.setAttribute("font-weight", fontStyle.includes("bold") ? "bold" : "normal");
      node.setAttribute("font-style", fontStyle.includes("italic") ? "italic" : "normal");
      node.setAttribute("xml:space", "preserve");
      for (const child of Array.from(node.childNodes)) {
        if (child.nodeType !== 3) continue;
        for (const character of child.textContent ?? "") {
          if (!vectorPdfHasGlyph(character.codePointAt(0) ?? -1, fontStyle)) unsupported(`missing-glyph-U+${(character.codePointAt(0) ?? 0).toString(16).toUpperCase()}`);
        }
      }
      for (const attribute of ["letter-spacing", "word-spacing"]) {
        const value = node.getAttribute(attribute);
        if (value !== null && value !== "normal" && number(value, attribute) !== 0 && Array.from(node.textContent ?? "").length > 1) unsupported(attribute);
        node.removeAttribute(attribute);
      }
      // Noto's hhea ascender/descent and x-height, in em; preserve measured x/y anchors.
      const baselineOffsets: Record<string, number> = { "text-before-edge": 1.069, "text-top": 1.069, top: 1.069,
        "text-after-edge": -.293, "text-bottom": -.293, bottom: -.293, central: .388, middle: .268,
        auto: 0, alphabetic: 0, baseline: 0 };
      const offset = baselineOffsets[state.baseline];
      if (offset === undefined) unsupported(`baseline-${state.baseline}`);
      const y = node.getAttribute("y");
      if (y !== null) node.setAttribute("y", String(number(y, "text-y") + size * offset));
      else if (tag === "text" && offset !== 0) node.setAttribute("y", String(size * offset));
      node.removeAttribute("dominant-baseline");
      node.setAttribute("alignment-baseline", "alphabetic");
    }
    if (tag === "image" && resource) unsupported("image-definition");
    if (tag === "image" && !node.hasAttribute("href") && !node.hasAttribute("xlink:href")) unsupported("image-resource");
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 1) {
        const element = child as Element;
        if (PAINT_TAGS.has(tag) && !["title", "desc", ...(tag === "text" ? ["tspan"] : [])].includes(element.localName)) unsupported("paint-child");
        visit(element, depth + 1, inResource, state);
      }
      else if (child.nodeType !== 3 && child.nodeType !== 8) unsupported("xml-node");
      else if (child.nodeType === 3 && !["text", "tspan", "title", "desc"].includes(tag) && (child.textContent ?? "").trim() !== "") unsupported("unplaced-text");
    }
  };
  visit(root, 0, false, { size: 16, weight: "normal", style: "normal", baseline: "alphabetic" });
  if (imageUrls.size > 64) unsupported("image-budget");
  const graph = new Map<Element, Element[]>();
  for (const reference of references) {
    const target = ids.get(reference.id);
    if (target === undefined) unsupported("missing-reference");
    if (reference.attribute === "clip-path" && target.localName !== "clipPath") unsupported("clip-reference");
    if (reference.attribute.startsWith("marker-") && target.localName !== "marker") unsupported("marker-reference");
    if (["fill", "stroke"].includes(reference.attribute) && !["linearGradient", "radialGradient"].includes(target.localName)) unsupported("paint-reference");
    if (["href", "xlink:href"].includes(reference.attribute) && !resources.some(resource => resource.contains(target))) unsupported("use-definition");
    const targets = graph.get(reference.node) ?? [];
    targets.push(target);
    graph.set(reference.node, targets);
  }
  const completed = new Set<Element>();
  const active = new Set<Element>();
  const checkCycle = (node: Element, depth: number): void => {
    if (depth > 48 || active.has(node)) unsupported("reference-cycle");
    if (completed.has(node)) return;
    active.add(node);
    for (const child of [...Array.from(node.children), ...(graph.get(node) ?? [])]) checkCycle(child, depth + 1);
    active.delete(node);
    completed.add(node);
  };
  checkCycle(root, 0);
  const box = root.getAttribute("viewBox");
  if (box === null) {
    const width = number(root.getAttribute("width") ?? "0", "width");
    const height = number(root.getAttribute("height") ?? "0", "height");
    if (width <= 0 || height <= 0) unsupported("viewbox");
    root.setAttribute("viewBox", `0 0 ${width} ${height}`);
  } else {
    const [, , width, height] = numericList(box, "viewbox");
    if (width <= 0 || height <= 0) unsupported("viewbox");
  }
  root.setAttribute("x", "0");
  root.setAttribute("y", "0");
  root.setAttribute("width", String(page.width));
  root.setAttribute("height", String(page.height));
  return { root, ids, paints, resources: resources.filter(node => !resources.some(other => other !== node && other.contains(node))), styles, imageUrls, nodes };
}

/** Recreate ancestor transforms/clips for a small consecutive paint batch. */
function paintBatch(page: PreparedPage, paints: readonly Element[]): Element {
  const root = page.root.cloneNode(false) as Element;
  const copies = new Map<Element, Element>([[page.root, root]]);
  const ensure = (node: Element): Element => {
    const existing = copies.get(node);
    if (existing !== undefined) return existing;
    const parent = node.parentElement;
    if (parent === null) unsupported("paint-parent");
    const copy = node.cloneNode(false) as Element;
    ensure(parent).appendChild(copy);
    copies.set(node, copy);
    return copy;
  };
  const needed = new Set<Element>();
  const pending: string[] = [];
  const findReferences = (node: Element, deep: boolean): void => {
    for (const attribute of Array.from(node.attributes)) {
      if (attribute.value.startsWith("#") && ["href", "xlink:href"].includes(attribute.name)) pending.push(attribute.value.slice(1));
      const match = /^url\(["']?#([^"')]+)["']?\)$/u.exec(attribute.value);
      if (match !== null) pending.push(match[1]);
    }
    if (deep) for (const child of Array.from(node.children)) findReferences(child, true);
  };
  for (const paint of paints) {
    findReferences(paint, true);
    for (let ancestor = paint.parentElement; ancestor !== null; ancestor = ancestor.parentElement) findReferences(ancestor, false);
  }
  while (pending.length > 0) {
    const target = page.ids.get(pending.pop() ?? "");
    if (target === undefined) unsupported("missing-reference");
    let definition = target;
    while (definition.parentElement !== null && definition.parentElement !== page.root && definition.parentElement.localName !== "defs") definition = definition.parentElement;
    if (needed.has(definition)) continue;
    needed.add(definition);
    findReferences(definition, true);
    const parent = definition.parentElement;
    if (parent?.localName === "defs") {
      const wrapper = parent.cloneNode(false) as Element;
      wrapper.appendChild(definition.cloneNode(true));
      root.appendChild(wrapper);
      findReferences(parent, false);
    } else root.appendChild(definition.cloneNode(true));
  }
  for (const paint of paints) {
    if (paint.parentElement === null) unsupported("paint-parent");
    ensure(paint.parentElement).appendChild(paint.cloneNode(true));
  }
  return root;
}

/** The library's private measurement SVG is identified by this job's unique font. */
function cleanupMeasurements(document: Document, family: string): void {
  for (const node of Array.from(document.body.children)) {
    if (node.namespaceURI !== SVG_NS || node.localName !== "svg" || node.attributes.length !== 1 || node.getAttribute("style") === null || node.children.length !== 1) continue;
    const text = node.firstElementChild;
    if (text?.localName === "text" && text.getAttribute("font-family") === family && (node as SVGSVGElement).style.position === "absolute" && (node as SVGSVGElement).style.visibility === "hidden") node.remove();
  }
}

async function validateImage(url: string, document: Document, signal?: AbortSignal): Promise<void> {
  const view = document.defaultView;
  if (view === null) throw new Error(words().export.unavailable);
  const binary = view.atob(url.slice(url.indexOf(",") + 1));
  if (binary.length < 33 || binary.slice(0, 8) !== "\x89PNG\r\n\x1a\n" || binary.slice(12, 16) !== "IHDR") unsupported("invalid-png");
  const integer = (offset: number): number => ((binary.charCodeAt(offset) * 0x1000000) + (binary.charCodeAt(offset + 1) << 16) + (binary.charCodeAt(offset + 2) << 8) + binary.charCodeAt(offset + 3));
  const width = integer(16);
  const height = integer(20);
  if (width === 0 || height === 0 || width * height > 16_000_000) unsupported("image-pixel-budget");
  stopped(signal);
  const image = createHtmlElement(document, "img");
  await new Promise<void>((resolve, reject) => {
    const finish = (error?: Error): void => {
      view.clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      image.onload = null;
      image.onerror = null;
      image.removeAttribute("src");
      if (error === undefined) resolve();
      else reject(error);
    };
    const abort = (): void => finish(new Error(words().export.exportStopped));
    const timer = view.setTimeout(() => finish(new Error(words().export.vectorUnsupported("pdf:image-decode-timeout"))), 5000);
    image.onload = () => finish(image.naturalWidth === width && image.naturalHeight === height ? undefined : new Error(words().export.vectorUnsupported("pdf:image-dimensions")));
    image.onerror = () => finish(new Error(words().export.vectorUnsupported("pdf:invalid-png")));
    signal?.addEventListener("abort", abort, { once: true });
    image.src = url;
    if (signal?.aborted) abort();
  });
}

export async function packVectorPdf(
  pages: readonly VectorDocumentPage[],
  info: { title?: string },
  document: Document,
  signal?: AbortSignal,
  progress?: (done: number, total: number) => boolean,
): Promise<Uint8Array> {
  stopped(signal);
  const view = document.defaultView;
  if (view === null || typeof view.DOMParser !== "function" || document.body === null) throw new Error(words().export.unavailable);
  if (pages.length === 0 || pages.length > 200) unsupported("page-budget");
  let bytes = 0;
  for (const page of pages) {
    if (![page.width, page.height].every(value => Number.isFinite(value) && value > 0 && value <= 14400)) unsupported("page-geometry");
    const pageBytes = new TextEncoder().encode(page.svg).length;
    if (pageBytes > MAX_PAGE_BYTES || (page.svg.match(/<[A-Za-z]/gu)?.length ?? 0) > MAX_PAGE_NODES) unsupported("page-byte-or-node-budget");
    bytes += pageBytes;
    if (bytes > MAX_BYTES) unsupported("byte-budget");
  }
  const family = `MiroPdfNoto${++sequence}`;
  const prepared: PreparedPage[] = [];
  const registered = new Set<VectorPdfFontStyle>();
  let nodes = 0;
  const check = (done: number): void => {
    stopped(signal);
    if (progress?.(done, pages.length) === false) throw new Error(words().export.exportStopped);
    stopped(signal);
  };
  check(0);
  for (const page of pages) {
    const result = prepare(page, document, family);
    prepared.push(result);
    nodes += result.nodes;
    if (nodes > MAX_NODES) unsupported("node-budget");
    await yieldOwned(view, signal);
  }
  const { jsPDF: Pdf } = await import("jspdf");
  const { svg2pdf } = await import("svg2pdf.js");
  stopped(signal);
  const first = pages[0];
  const pdf = new Pdf({ orientation: first.width > first.height ? "landscape" : "portrait", unit: "pt", format: [first.width, first.height], putOnlyUsedFonts: true, compress: true, floatPrecision: 8 });
  pdf.setProperties({ title: info.title ?? "", creator: "Miro Canvas" });
  let imageFailure: unknown;
  let writtenImages = 0;
  const addImage = pdf.addImage.bind(pdf);
  const measurementDocument = typeof window === "undefined" ? document : window.document;
  pdf.addImage = ((...args: unknown[]): jsPDF => {
    try {
      const result = (addImage as (...args: unknown[]) => jsPDF)(...args);
      writtenImages += 1;
      return result;
    }
    catch (error) { imageFailure = error; return pdf; }
  });
  try {
    for (let index = 0; index < prepared.length; index += 1) {
      check(index);
      const page = pages[index];
      const scene = prepared[index];
      for (const fontStyle of scene.styles) {
        if (registered.has(fontStyle)) continue;
        registerVectorPdfFont(pdf, family, fontStyle);
        registered.add(fontStyle);
        await yieldOwned(view, signal);
      }
      for (const url of scene.imageUrls) await validateImage(url, document, signal);
      if (index !== 0) pdf.addPage([page.width, page.height], page.width > page.height ? "landscape" : "portrait");
      for (let start = 0; start < scene.paints.length;) {
        check(index);
        let end = start;
        let weight = 0;
        while (end < scene.paints.length && end - start < BATCH_SIZE) {
          const paint = scene.paints[end];
          const cost = Array.from(paint.attributes).reduce((sum, attribute) => sum + attribute.value.length, (paint.textContent ?? "").length);
          if (end !== start && weight + cost > 100_000) break;
          weight += cost;
          end += 1;
        }
        const paints = scene.paints.slice(start, end);
        start = end;
        const expectedImages = paints.filter(paint => paint.localName === "image").length;
        const previousImages = writtenImages;
        const root = paintBatch(scene, paints);
        try {
          await svg2pdf(root, pdf, { x: 0, y: 0, width: page.width, height: page.height, loadExternalStyleSheets: false, loadImages: /^data:image\/png;base64,/u });
          if (imageFailure !== undefined || writtenImages - previousImages !== expectedImages) unsupported("image-conversion");
        } finally {
          root.remove();
          cleanupMeasurements(document, family);
          if (measurementDocument !== document) cleanupMeasurements(measurementDocument, family);
        }
        await yieldOwned(view, signal);
      }
      check(index + 1);
    }
    stopped(signal);
    const output = new Uint8Array(pdf.output("arraybuffer"));
    if (output.length > 64 * 1024 * 1024) unsupported("output-budget");
    check(pages.length);
    return output;
  } finally {
    pdf.addImage = addImage;
    for (const page of prepared) page.root.remove();
    cleanupMeasurements(document, family);
    if (measurementDocument !== document) cleanupMeasurements(measurementDocument, family);
  }
}
