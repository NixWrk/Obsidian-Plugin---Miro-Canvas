import { abortable, exportFrame, type CaptureCanvas } from "./board-export";
import { checkExportCanvasFrame, settleExportMarkdown } from "./export-canvas";
import { captureTiles, type ExportRect } from "./export-pages";
import { createHtmlElement } from "./dom-elements";
import { words } from "./i18n";
import { boardConnectors } from "./board-connectors";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const MAX_BYTES = 32 * 1024 * 1024;
const MAX_TILES = 2000;
const EXCLUDED = [
  ".miro-canvas-laser-pointer",
  ".miro-canvas-shape-radius-handle",
  ".miro-canvas-group-hidden", ".canvas-node-interaction-layer", ".canvas-node-resizer",
  ".canvas-selection", ".canvas-card-menu", ".canvas-menu", ".canvas-node-controls",
  ".miro-canvas-panel", ".miro-canvas-toolbar", ".miro-canvas-handles", ".miro-canvas-dock",
  ".miro-canvas-thread", ".miro-canvas-minimap", ".miro-canvas-export-pages",
  ".miro-canvas-mixed-selection-frame", ".miro-canvas-search-hit", ".miro-canvas-tool-ghost",
  ".miro-source-deck-button", ".canvas-interaction-path", ".miro-source-line-hit",
  ".cm-editor", "script", "style",
].join(",");
const SVG_TAGS = new Set([
  "g", "defs", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
  "text", "tspan", "marker", "clippath", "lineargradient", "radialgradient", "stop", "title", "desc", "svg", "use",
]);
const SVG_ATTRIBUTES = new Set([
  "id", "d", "points", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry",
  "width", "height", "viewBox", "preserveAspectRatio", "transform", "markerWidth", "markerHeight",
  "markerUnits", "refX", "refY", "orient", "offset", "gradientUnits", "gradientTransform", "spreadMethod",
  "clipPathUnits", "vector-effect", "dx", "dy", "rotate", "textLength", "lengthAdjust", "href", "xlink:href",
]);
const SVG_STYLE = [
  "fill", "stroke", "stroke-width", "stroke-dasharray", "stroke-dashoffset", "stroke-linecap", "stroke-linejoin",
  "stroke-miterlimit", "fill-rule", "clip-rule", "opacity", "fill-opacity", "stroke-opacity", "color",
  "font-family", "font-size", "font-weight", "font-style", "font-variant", "letter-spacing", "word-spacing",
  "text-decoration", "text-anchor", "dominant-baseline", "marker-start", "marker-mid", "marker-end", "clip-path",
  "stop-color", "stop-opacity", "paint-order", "vector-effect",
] as const;

function unsupported(feature: string): never {
  throw new Error(words().export.vectorUnsupported(feature));
}

function stopped(signal: AbortSignal): void {
  if (signal.aborted) throw new Error(words().export.exportStopped);
}


function pause(view: Window, milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    let timer: number | undefined;
    const abort = (): void => {
      if (timer !== undefined) view.clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      reject(new Error(words().export.exportStopped));
    };
    stopped(signal);
    timer = view.setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}

function escaped(value: string): string {
  return value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;");
}

function attributes(values: Record<string, string | number>): string {
  return Object.entries(values).map(([name, value]) => ` ${name}="${escaped(String(value))}"`).join("");
}

function rectangle(values: Record<string, string | number>): string {
  return `<rect${attributes(values)}/>`;
}

interface Matrix {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly e: number;
  readonly f: number;
}

function matrixText(matrix: Matrix): string {
  const parts = [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f];
  if (parts.some(value => !Number.isFinite(value))) unsupported("transform");
  return `matrix(${parts.join(" ")})`;
}

function solid(color: string): boolean {
  return color !== "" && color !== "transparent" && !/rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/u.test(color);
}

/** All layout is read from the prepared copy; the source is never cloned or mutated. */
export async function serializeVectorTile(
  wrapper: HTMLElement,
  namespace: string,
  signal: AbortSignal,
): Promise<string> {
  const document = wrapper.ownerDocument;
  const view = document.defaultView;
  if (view === null || wrapper.getAttribute("data-miro-canvas-export-renderer") !== "true") throw new Error(words().export.unavailable);
  const viewport = wrapper.getBoundingClientRect();
  let sequence = 0;
  let visited = 0;
  const styles = new WeakMap<Element, CSSStyleDeclaration>();
  const computed = (element: Element): CSSStyleDeclaration => {
    let result = styles.get(element);
    if (result === undefined) {
      result = view.getComputedStyle(element);
      styles.set(element, result);
    }
    return result;
  };
  const visible = (element: Element): boolean => {
    if (element.closest(EXCLUDED) !== null || element.hasAttribute("hidden")) return false;
    for (let parent: Element | null = element; parent !== null && parent !== wrapper; parent = parent.parentElement) {
      const style = computed(parent);
      if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" || style.opacity === "0") return false;
    }
    return true;
  };
  const checkpoint = async (): Promise<void> => {
    stopped(signal);
    visited += 1;
    if (visited % 128 === 0) {
      await pause(view, 0, signal);
      stopped(signal);
    }
  };
  const reference = (value: string): string => value.replace(/url\(["']?[^)]*#([^\s"')]+)["']?\)/gu,
    (_whole, id: string) => `url(#${namespace}-${id})`);

  const svgTransform = (element: Element, style: CSSStyleDeclaration): string | undefined => {
    const transform = style.transform;
    if (transform === "" || transform === "none") return undefined;
    let matrix: DOMMatrix;
    try {
      matrix = new view.DOMMatrix(transform);
    } catch {
      unsupported("svg:transform-matrix");
    }
    if (!matrix.is2D) unsupported("svg:3d-transform");
    // Identity and translation are independent of the transform's origin/reference box.
    if (matrix.a === 1 && matrix.b === 0 && matrix.c === 0 && matrix.d === 1) return matrixText(matrix);
    if (element.localName !== "svg" && element.localName !== "use") {
      const graphics = element as SVGGraphicsElement;
      const parent = element.parentElement as SVGGraphicsElement | null;
      if (typeof graphics.getScreenCTM === "function" && typeof parent?.getScreenCTM === "function") {
        const screen = graphics.getScreenCTM();
        const parentScreen = parent.getScreenCTM();
        if (screen !== null && parentScreen !== null && typeof parentScreen.inverse === "function") {
          // Unlike computed CSS, this includes transform-origin and transform-box offsets.
          try {
            const relative = parentScreen.inverse().multiply(screen);
            if (relative.is2D === false) unsupported("svg:3d-transform");
            return matrixText(relative);
          } catch {
            unsupported("svg:singular-transform");
          }
        }
      }
    }
    // Marker children have no screen CTM parent; their ordinary origin is exactly zero.
    const origin = (style.transformOrigin || "0px 0px").trim().split(/\s+/u);
    if (origin.some(value => !/^[+-]?0(?:\.0+)?(?:px)?$/u.test(value))) unsupported("svg:transform-origin");
    if (style.transformBox && !["view-box", "border-box"].includes(style.transformBox)) unsupported("svg:transform-reference-box");
    return matrixText(matrix);
  };

  const svgElement = async (element: Element, inDefinition = false): Promise<string> => {
    await checkpoint();
    const tag = element.localName;
    if (element.matches(EXCLUDED)) return "";
    const definition = inDefinition || ["defs", "marker", "clipPath", "linearGradient", "radialGradient", "stop"].includes(tag);
    if (!definition && !visible(element)) return "";
    if (!SVG_TAGS.has(tag.toLowerCase())) unsupported(`svg:${tag}`);
    const values: Record<string, string | number> = {};
    for (const attribute of Array.from(element.attributes)) {
      if (!SVG_ATTRIBUTES.has(attribute.name)) continue;
      if (attribute.name === "id") values.id = `${namespace}-${attribute.value}`;
      else if (attribute.name === "href" || attribute.name === "xlink:href") {
        if (!attribute.value.startsWith("#")) unsupported("svg:external-use");
        values.href = `#${namespace}-${attribute.value.slice(1)}`;
      } else values[attribute.name] = reference(attribute.value);
    }
    const style = computed(element);
    if (style.filter !== "none" && style.filter !== "") unsupported("svg:filter");
    for (const property of SVG_STYLE) {
      const value = property === "text-decoration" ? style.textDecorationLine : style.getPropertyValue(property);
      if (value !== "") values[property] = reference(value);
    }
    // Computed CSS overrides an XML transform, rather than applying it a second time.
    const transform = svgTransform(element, style);
    if (transform !== undefined) values.transform = transform;
    else if (style.transform === "none") delete values.transform;
    let children = "";
    for (const child of Array.from(element.childNodes)) {
      if (child.nodeType === 3) children += escaped(child.textContent ?? "");
      else if (child.nodeType === 1) children += await svgElement(child as Element, definition);
      if (children.length > MAX_BYTES) unsupported("svg:byte-budget");
    }
    return `<${tag}${attributes(values)}>${children}</${tag}>`;
  };

  const svgRoot = async (element: SVGSVGElement): Promise<string> => {
    if (!visible(element)) return "";
    const screen = element.getScreenCTM();
    if (screen === null) unsupported("svg:screen-matrix");
    const transform = matrixText({ ...screen, a: screen.a, b: screen.b, c: screen.c, d: screen.d,
      e: screen.e - viewport.left, f: screen.f - viewport.top });
    let content = "";
    for (const child of Array.from(element.children)) content += await svgElement(child);
    const rootStyle = computed(element);
    if (rootStyle.filter && rootStyle.filter !== "none" && !rootStyle.filter.startsWith("drop-shadow(")) unsupported("svg:filter");
    if (rootStyle.clipPath && rootStyle.clipPath !== "none") unsupported("svg:clip-path");
    const opacity = rootStyle.opacity || "1";
    const transformed = `<g${attributes({ transform, opacity })}>${content}</g>`;
    const style = computed(element);
    if (style.overflowX === "hidden" || style.overflowY === "hidden") {
      if (Math.abs(screen.b) > .00001 || Math.abs(screen.c) > .00001) unsupported("svg:rotated-viewport-clip");
      const bounds = element.getBoundingClientRect();
      const id = `${namespace}-clip-${++sequence}`;
      return `<defs><clipPath id="${id}">${rectangle({ x: bounds.left - viewport.left, y: bounds.top - viewport.top,
        width: bounds.width, height: bounds.height })}</clipPath></defs><g clip-path="url(#${id})">${transformed}</g>`;
    }
    return transformed;
  };

  const geometry = (element: HTMLElement): { matrix: Matrix; width: number; height: number } => {
    const style = computed(element);
    // Multiplying linear transforms keeps rotation/scaling while the measured box resolves origins/translations.
    let linear = new view.DOMMatrix();
    const ancestors: Element[] = [];
    for (let ancestor: Element | null = element; ancestor !== null; ancestor = ancestor.parentElement) ancestors.push(ancestor);
    for (const ancestor of ancestors.reverse()) {
      const transform = computed(ancestor).transform;
      if (transform && transform !== "none") linear = linear.multiply(new view.DOMMatrix(transform));
    }
    if (!linear.is2D) unsupported("css:3d-transform");
    let width = Number.parseFloat(style.width);
    let height = Number.parseFloat(style.height);
    if (style.boxSizing !== "border-box") {
      width += Number.parseFloat(style.paddingLeft || "0") + Number.parseFloat(style.paddingRight || "0")
        + Number.parseFloat(style.borderLeftWidth || "0") + Number.parseFloat(style.borderRightWidth || "0");
      height += Number.parseFloat(style.paddingTop || "0") + Number.parseFloat(style.paddingBottom || "0")
        + Number.parseFloat(style.borderTopWidth || "0") + Number.parseFloat(style.borderBottomWidth || "0");
    }
    const bounds = element.getBoundingClientRect();
    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      if (Math.abs(linear.b) > .00001 || Math.abs(linear.c) > .00001) unsupported("css:inline-rotation");
      width = bounds.width / Math.abs(linear.a);
      height = bounds.height / Math.abs(linear.d);
    }
    const xs = [0, linear.a * width, linear.c * height, linear.a * width + linear.c * height];
    const ys = [0, linear.b * width, linear.d * height, linear.b * width + linear.d * height];
    return { width, height, matrix: { a: linear.a, b: linear.b, c: linear.c, d: linear.d,
      e: bounds.left - viewport.left - Math.min(...xs), f: bounds.top - viewport.top - Math.min(...ys) } };
  };

  const text = async (node: Text, parent: HTMLElement): Promise<string> => {
    const value = node.textContent ?? "";
    if (value.trim() === "") return "";
    const style = computed(parent);
    if (style.direction === "rtl" || /[\p{Script=Arabic}\p{Script=Hebrew}\p{Mark}\u200d]/u.test(value)) unsupported("text:complex-shaping");
    if (style.textTransform && !["none", "uppercase", "lowercase"].includes(style.textTransform)) unsupported("text:text-transform");
    const { matrix } = geometry(parent);
    // Range returns screen-aligned glyph boxes. Rotated HTML text has no reliable baseline contract.
    if (Math.abs(matrix.b) > .00001 || Math.abs(matrix.c) > .00001 || matrix.a <= 0 || matrix.d <= 0) unsupported("text:rotation-or-reflection");
    if (style.writingMode && style.writingMode !== "horizontal-tb") unsupported("text:writing-mode");
    const range = document.createRange();
    let output = "";
    // Explicit glyph positions preserve Markdown wrapping, indentation, tables and inline fonts.
    let index = 0;
    for (const character of value) {
      await checkpoint();
      range.setStart(node, index);
      index += character.length;
      range.setEnd(node, index);
      const box = range.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      const values: Record<string, string | number> = {
        x: (box.left - viewport.left - matrix.e) / matrix.a,
        y: (box.top - viewport.top - matrix.f) / matrix.d,
        fill: style.color, "font-family": style.fontFamily, "font-size": style.fontSize,
        "font-weight": style.fontWeight, "font-style": style.fontStyle,
        "font-variant": style.fontVariant, "letter-spacing": style.letterSpacing,
        "text-decoration": style.textDecorationLine, "dominant-baseline": "text-before-edge",
        "xml:space": "preserve", transform: matrixText(matrix),
      };
      const shown = style.textTransform === "uppercase" ? character.toUpperCase() : style.textTransform === "lowercase" ? character.toLowerCase() : character;
      output += `<text${attributes(values)}>${escaped(shown)}</text>`;
      if (output.length > MAX_BYTES) unsupported("svg:byte-budget");
    }
    return output;
  };

  const raster = (image: HTMLImageElement): string => {
    const source = image.currentSrc || image.src;
    if (!/^data:image\/(png|jpeg|gif|webp|bmp);/iu.test(source) && !/\.(png|jpe?g|gif|webp|bmp)(?:[?#]|$)/iu.test(source)) unsupported("image:non-raster-or-unknown");
    if (!image.complete || image.naturalWidth < 1 || image.naturalHeight < 1) unsupported("image:not-ready");
    const sheet = createHtmlElement(document, "canvas");
    try {
      sheet.width = image.naturalWidth;
      sheet.height = image.naturalHeight;
      if (sheet.width * sheet.height > 16_000_000) unsupported("image:pixel-budget");
      const context = sheet.getContext("2d");
      if (context === null) unsupported("image:canvas-unavailable");
      context.drawImage(image, 0, 0);
      const href = sheet.toDataURL("image/png");
      if (href.length > MAX_BYTES) unsupported("image:byte-budget");
      const box = geometry(image);
      const fit = computed(image).objectFit;
      if (fit && !["fill", "contain", "cover"].includes(fit)) unsupported("image:object-fit");
      return `<image${attributes({ x: 0, y: 0, width: box.width, height: box.height, transform: matrixText(box.matrix),
        preserveAspectRatio: fit === "contain" ? "xMidYMid meet" : fit === "cover" ? "xMidYMid slice" : "none",
        href, "data-miro-raster-attachment": "true" })}/>`;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith(words().export.vectorUnsupported(""))) throw error;
      unsupported("image:unreadable");
    } finally {
      sheet.width = 0;
      sheet.height = 0;
    }
  };

  const html = async (element: Element): Promise<string> => {
    await checkpoint();
    if (!visible(element)) return "";
    if (element.namespaceURI === SVG_NAMESPACE) return await svgRoot(element as SVGSVGElement);
    if (["canvas", "iframe", "video", "audio", "object", "embed", "input", "textarea"].includes(element.localName)) unsupported(element.localName);
    if (element.matches("button") && !element.matches(".miro-canvas-comment-marker")) return "";
    const item = element as HTMLElement;
    const style = computed(item);
    const generated: Array<{ style: CSSStyleDeclaration; value: string }> = [];
    for (const pseudo of ["::before", "::after", "::marker"]) {
      const pseudoStyle = view.getComputedStyle(item, pseudo);
      const content = pseudoStyle.content;
      // Native Markdown uses quoted blank before/after blocks as layout spacers.
      const blank = /^(?:"\s*"|'\s*')$/u.test(content);
      if (content && !["none", "normal"].includes(content) && !blank && pseudoStyle.display !== "none") {
        if (!item.matches(".miro-canvas-comment-marker") || pseudo === "::marker") unsupported(`css:${pseudo}`);
        const value = content === "attr(data-comment-count)" ? item.getAttribute("data-comment-count") ?? ""
          : /^".*"$/u.test(content) ? content.slice(1, -1) : unsupported(`css:${pseudo}`);
        generated.push({ style: pseudoStyle, value });
      }
    }
    if (item.localName === "li" && style.listStyleType !== "none") unsupported("markdown:list-marker");
    if (style.backgroundImage && style.backgroundImage !== "none") unsupported("css:background-image");
    if (style.filter && style.filter !== "none") unsupported("css:filter");
    if (style.clipPath && style.clipPath !== "none") unsupported("css:clip-path");
    const box = geometry(item);
    const clipped = [style.overflowX, style.overflowY].some(value => ["hidden", "clip", "auto", "scroll"].includes(value));
    let rx = 0;
    let ry = 0;
    let content = "";
    if (box.width > 0 && box.height > 0) {
      const radii = [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius];
      const painted = solid(style.backgroundColor) || ["top", "right", "bottom", "left"].some(side => Number.parseFloat(style.getPropertyValue(`border-${side}-width`)) > 0);
      if ((painted || clipped) && radii.some(radius => radius !== radii[0])) unsupported("css:unequal-corner-radius");
      const radiusParts = (radii[0] || "0").split(" ");
      const radius = (value: string, length: number): number => value.endsWith("%") ? Number.parseFloat(value) * length / 100 : Number.parseFloat(value);
      const horizontal = radius(radiusParts[0], box.width);
      const vertical = radius(radiusParts[1] ?? radiusParts[0], box.height);
      if (![horizontal, vertical].every(value => Number.isFinite(value) && value >= 0)) unsupported("css:corner-radius");
      // CSS shrinks both axes together when adjacent card corners overlap.
      const factor = Math.min(1, box.width / (2 * horizontal), box.height / (2 * vertical));
      rx = horizontal * factor;
      ry = vertical * factor;
      const face = { x: 0, y: 0, width: box.width, height: box.height, rx, ry, transform: matrixText(box.matrix) };
      if (solid(style.backgroundColor)) content += rectangle({ ...face, fill: style.backgroundColor });
      const borders = ["Top", "Right", "Bottom", "Left"] as const;
      const widths = borders.map(side => Number.parseFloat(style.getPropertyValue(`border-${side.toLowerCase()}-width`) || "0"));
      if (widths.some(width => width > 0)) {
        const colors = borders.map(side => style.getPropertyValue(`border-${side.toLowerCase()}-color`));
        const kinds = borders.map(side => style.getPropertyValue(`border-${side.toLowerCase()}-style`));
        if (widths.every(width => width === widths[0]) && colors.every(color => color === colors[0]) && kinds.every(kind => kind === kinds[0])) {
          const width = widths[0];
          const kind = kinds[0];
          if (!["solid", "dashed", "dotted", "none", "hidden"].includes(kind)) unsupported(`css:border-${kind}`);
          if (kind !== "none" && kind !== "hidden") content += rectangle({ ...face, x: width / 2, y: width / 2,
            width: Math.max(0, box.width - width), height: Math.max(0, box.height - width),
            fill: "none", stroke: colors[0], "stroke-width": width,
            "stroke-dasharray": kind === "dashed" ? `${width * 4} ${width * 3}` : kind === "dotted" ? `${width} ${width * 2}` : "none" });
        } else {
          const positions = [[0, 0, box.width, 0], [box.width, 0, box.width, box.height], [0, box.height, box.width, box.height], [0, 0, 0, box.height]];
          for (let side = 0; side < 4; side += 1) {
            if (widths[side] === 0 || ["none", "hidden"].includes(kinds[side])) continue;
            if (kinds[side] !== "solid" || rx > 0 || ry > 0) unsupported("css:asymmetric-border");
            const [x1, y1, x2, y2] = positions[side];
            content += `<line${attributes({ x1, y1, x2, y2, stroke: colors[side], "stroke-width": widths[side], transform: matrixText(box.matrix) })}/>`;
          }
        }
      }
    }
    if (element.localName === "img") content += raster(element as HTMLImageElement);
    else {
      for (const child of Array.from(element.childNodes)) {
        if (child.nodeType === 3) content += await text(child as Text, item);
        else if (child.nodeType === 1) content += await html(child as Element);
        if (content.length > MAX_BYTES) unsupported("svg:byte-budget");
      }
    }
    for (const badge of generated) {
      const badgeStyle = badge.style;
      const badgeWidth = Number.parseFloat(badgeStyle.width) || Number.parseFloat(badgeStyle.minWidth);
      const badgeHeight = Number.parseFloat(badgeStyle.height);
      const horizontalPadding = Number.parseFloat(badgeStyle.paddingLeft || "0") + Number.parseFloat(badgeStyle.paddingRight || "0");
      const width = badgeWidth + (badgeStyle.boxSizing === "border-box" ? 0 : horizontalPadding);
      const x = Number.parseFloat(badgeStyle.left) || (badgeStyle.left === "0px" ? 0 : box.width - Number.parseFloat(badgeStyle.right) - width);
      const y = Number.parseFloat(badgeStyle.top);
      if (![width, badgeHeight, x, y].every(Number.isFinite)) unsupported("comment:badge-layout");
      content += `<g${attributes({ transform: matrixText(box.matrix) })}>`
        + rectangle({ x, y, width, height: badgeHeight, rx: Number.parseFloat(badgeStyle.borderTopLeftRadius) || badgeHeight / 2, fill: badgeStyle.backgroundColor })
        + `<text${attributes({ x: x + width / 2, y: y + badgeHeight / 2, fill: badgeStyle.color,
          "font-family": badgeStyle.fontFamily, "font-size": badgeStyle.fontSize, "font-weight": badgeStyle.fontWeight,
          "text-anchor": "middle", "dominant-baseline": "central" })}>${escaped(badge.value)}</text></g>`;
    }
    if (content === "") return "";
    if (clipped) {
      const id = `${namespace}-clip-${++sequence}`;
      content = `<defs><clipPath id="${id}">${rectangle({ x: 0, y: 0, width: box.width, height: box.height,
        rx, ry, transform: matrixText(box.matrix) })}</clipPath></defs><g clip-path="url(#${id})">${content}</g>`;
    }
    const label = element.matches(".miro-canvas-comment-marker") ? `<title>${escaped(element.getAttribute("aria-label") ?? "")}</title>` : "";
    return `<g${attributes({ opacity: style.opacity || "1" })}>${label}${content}</g>`;
  };

  let output = "";
  const roots = Array.from(wrapper.querySelectorAll(".canvas-node, .canvas-edges, .canvas-edge-label, .miro-canvas-comment-marker"));
  for (const root of roots) {
    if (roots.some(other => other !== root && other.contains(root))) continue;
    if (!visible(root)) continue;
    if (root.namespaceURI !== SVG_NAMESPACE) {
      const bounds = root.getBoundingClientRect();
      if (bounds.right <= viewport.left || bounds.left >= viewport.right || bounds.bottom <= viewport.top || bounds.top >= viewport.bottom) continue;
    }
    output += await html(root);
    if (output.length > MAX_BYTES) unsupported("svg:byte-budget");
  }
  stopped(signal);
  return output;
}


function read(value: unknown, name: string): unknown {
  if (typeof value !== "object" || value === null) return undefined;
  return Reflect.get(value, name);
}

/** Native/plugin items that failed to reach the prepared surface must not disappear from a successful SVG. */
function checkVectorScene(canvas: CaptureCanvas, tile: ExportRect): void {
  const wrapper = canvas.wrapperEl;
  const nodes = read(canvas, "nodes");
  if (nodes instanceof Map) {
    for (const node of nodes.values() as Iterable<unknown>) {
      const shell = read(node, "nodeEl") as HTMLElement | undefined;
      if (shell !== undefined && shell.closest(".miro-canvas-group-hidden") !== null) continue;
      if (shell !== undefined && wrapper.contains(shell) && shell.matches(".canvas-node")) continue;
      const values = ["x", "y", "width", "height"].map(name => read(node, name));
      if (!values.every(value => typeof value === "number" && Number.isFinite(value))) unsupported("node:missing-layout");
      const [x, y, width, height] = values as number[];
      if (x < tile.x + tile.width && x + width > tile.x && y < tile.y + tile.height && y + height > tile.y) unsupported("node:missing-render");
    }
  }
  const edges = read(canvas, "edges");
  if (edges instanceof Map) {
    for (const edge of edges.values() as Iterable<unknown>) {
      const shell = (read(edge, "lineGroupEl") ?? read(edge, "edgeEl")) as Element | undefined;
      if (shell === undefined || !wrapper.contains(shell)) unsupported("edge:missing-render");
    }
  }
  const getData = read(canvas, "getData");
  if (typeof getData === "function") {
    const snapshot: unknown = Reflect.apply(getData, canvas, []);
    const connectors = boardConnectors(snapshot);
    const rendered = new Set(Array.from(wrapper.querySelectorAll("[data-connector-id]")).map(element => element.getAttribute("data-connector-id")));
    for (const connector of connectors) if (!rendered.has(connector.id)) unsupported(`connector:missing-render:${connector.id}`);
  }
}

/** A single SVG attachment, with ordered pages stacked vertically and clipped individually. */
export async function renderVectorExportPages(
  canvas: CaptureCanvas,
  pages: readonly ExportRect[],
  progress: (done: number, total: number) => boolean,
  signal?: AbortSignal,
  prepare?: () => void,
): Promise<Uint8Array> {
  const wrapper = canvas.wrapperEl;
  const document = wrapper.ownerDocument;
  const view = document.defaultView;
  if (view === null || wrapper.getAttribute("data-miro-canvas-export-renderer") !== "true") throw new Error(words().export.unavailable);
  if (pages.length === 0 || pages.length > 200 || pages.some(page => [page.x, page.y, page.width, page.height].some(value => !Number.isFinite(value)) || page.width <= 0 || page.height <= 0)) unsupported("svg:page-geometry");
  const bounds = wrapper.getBoundingClientRect();
  const width = Math.floor(bounds.width);
  const height = Math.floor(bounds.height);
  if (width <= 0 || height <= 0) throw new Error(words().export.pageNotDrawn);
  const estimatedTiles = pages.reduce((sum, page) => sum + Math.ceil(page.width / width) * Math.ceil(page.height / height), 0);
  if (!Number.isFinite(estimatedTiles) || estimatedTiles > MAX_TILES) unsupported("svg:tile-budget");
  const plans = pages.map(page => ({ page, tiles: captureTiles(page, { width, height }) }));
  const total = plans.reduce((sum, plan) => sum + plan.tiles.length, 0);
  if (total > MAX_TILES) unsupported("svg:tile-budget");
  const saved = { x: canvas.x, y: canvas.y, tx: canvas.tx, ty: canvas.ty, zoom: canvas.zoom, tZoom: canvas.tZoom, screenshotting: canvas.screenshotting, viewportChanged: canvas.viewportChanged };
  const hadExportClass = wrapper.classList.contains("miro-canvas-exporting");
  const controller = new AbortController();
  const abort = (): void => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  let output = "";
  let done = 0;
  let offset = 0;
  let started = false;
  const checkProgress = (): void => {
    stopped(controller.signal);
    if (!progress(done, total)) throw new Error(words().export.exportStopped);
    stopped(controller.signal);
  };
  try {
    checkProgress();
    started = true;
    canvas.deselectAll();
    canvas.screenshotting = true;
    wrapper.classList.add("miro-canvas-exporting");
    await abortable(document.fonts.ready, controller.signal);
    for (let index = 0; index < plans.length; index += 1) {
      const { page, tiles } = plans[index];
      let content = "";
      for (const tile of tiles) {
        checkProgress();
        canvas.x = canvas.tx = tile.x + width / 2;
        canvas.y = canvas.ty = tile.y + height / 2;
        canvas.zoom = canvas.tZoom = 0;
        canvas.viewportChanged = true;
        canvas.requestFrame();
        // Native frames use the existing scoped 16 ms timer; a visible window RAF can arrive earlier.
        await pause(view, 120, controller.signal);
        await exportFrame(view, controller.signal);
        checkExportCanvasFrame(canvas);
        await settleExportMarkdown(canvas, controller.signal);
        prepare?.();
        await abortable(Promise.resolve(), controller.signal);
        stopped(controller.signal);
        checkVectorScene(canvas, tile);
        const drawing = await serializeVectorTile(wrapper, `page-${index + 1}-tile-${done + 1}`, controller.signal);
        content += `<svg${attributes({ x: tile.x - page.x, y: tile.y - page.y, width: tile.width, height: tile.height,
          viewBox: `0 0 ${tile.width} ${tile.height}`, overflow: "hidden" })}>${drawing}</svg>`;
        done += 1;
        if (content.length + output.length > MAX_BYTES) unsupported("svg:byte-budget");
      }
      const background = view.getComputedStyle(wrapper).backgroundColor;
      output += `<svg${attributes({ x: 0, y: offset, width: page.width, height: page.height,
        viewBox: `0 0 ${page.width} ${page.height}`, overflow: "hidden", "data-miro-page": index + 1 })}>`
        + rectangle({ width: page.width, height: page.height, fill: background }) + content + "</svg>";
      offset += page.height + 24;
    }
    checkProgress();
    const text = `<svg${attributes({ xmlns: SVG_NAMESPACE, width: Math.max(...pages.map(page => page.width)), height: offset - 24,
      viewBox: `0 0 ${Math.max(...pages.map(page => page.width))} ${offset - 24}` })}>${output}</svg>`;
    const bytes = new TextEncoder().encode(text);
    if (bytes.length > MAX_BYTES) unsupported("svg:byte-budget");
    return bytes;
  } catch (error) {
    if (controller.signal.aborted) throw new Error(words().export.exportStopped);
    throw error;
  } finally {
    signal?.removeEventListener("abort", abort);
    if (!hadExportClass) wrapper.classList.remove("miro-canvas-exporting");
    if (started) {
      Object.assign(canvas, saved);
      canvas.setViewport?.(saved.x, saved.y, saved.zoom);
      Object.assign(canvas, saved);
      canvas.requestFrame();
    }
  }
}
