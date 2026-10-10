/** Named declarations only. Persistence and schema-gated assignments belong to the parent. */
import { createHtmlElement } from "./dom-elements";

export interface CustomBoardStyle {
  readonly id: string;
  readonly name: string;
  readonly declarations: string;
}
export interface LocalCssDeclaration {
  readonly property: string;
  readonly value: string;
}
export interface CssDeclarationError {
  readonly index: number;
  readonly declaration: string;
  readonly reason: "syntax" | "unsafe" | "unsupported";
  readonly property?: string;
  /** The native board owns these mechanics; keep the existing localized reason union. */
  readonly restriction?: "geometry" | "gesture";
}
export type CssParseResult = { readonly valid: true; readonly declarations: readonly LocalCssDeclaration[] }
  | { readonly valid: false; readonly errors: readonly CssDeclarationError[] };
export type CssSupport = (property: string, value: string) => boolean;

/** Validate in the owning window, including detached mobile/popout documents. */
export function localCssSupport(document: Document): CssSupport {
  const scratch = createHtmlElement(document, "span").style;
  const owner = document.defaultView as (Window & { CSS?: typeof CSS }) | null;
  return (property, value) => {
    try {
      if (typeof owner?.CSS?.supports === "function" && !owner.CSS.supports(property, value)) return false;
      scratch.cssText = "";
      scratch.setProperty(property, value);
      return scratch.getPropertyValue(property) !== "";
    } catch {
      return false;
    }
  };
}

/** Resource-bearing properties cannot resolve URLs indirectly through variables. */
function resourceProperty(property: string): boolean {
  return /^(?:-(?:webkit|moz)-)?(?:background(?:-image)?|mask(?:-.*)?|border-image(?:-.*)?|list-style(?:-.*)?|box-reflect|cursor|content|filter|backdrop-filter|clip-path|shape-outside|offset-path|marker(?:-.*)?|fill|stroke)$/u.test(property);
}

function nativeOwnership(property: string): "geometry" | "gesture" | undefined {
  // Host variables can feed native dimensions and gesture rules indirectly.
  if (property.startsWith("--")) return "geometry";
  const plain = property.replace(/^-(?:webkit|moz|ms|o)-/u, "");
  if (/^(?:pointer-events|touch-action|user-select|cursor|resize|appearance)$/u.test(plain)
    || /^(?:scroll|overscroll)(?:-|$)/u.test(plain)) return "gesture";
  if (/^(?:(?:min-|max-)?(?:width|height|inline-size|block-size)|aspect-ratio|position|top|right|bottom|left|float|clear|order|display|visibility|z-index|zoom|isolation|will-change|all|box-sizing|box-decoration-break|content|content-visibility|interpolate-size|field-sizing|transform|translate|rotate|scale|perspective|backface-visibility|x|y|cx|cy|r|rx|ry|d|vector-effect)$/u.test(plain)
    || /^(?:transform|perspective|inset|margin|padding|gap|row-gap|column-gap|flex|grid|align|justify|place|contain|container|overflow|offset|motion|animation|transition|anchor|position|view-transition|shape|marker|clip|mask|box-(?:flex|align|pack|orient|direction|ordinal|lines|reflect))(?:-|$)/u.test(plain)) return "geometry";
  return undefined;
}

/** Only conventional host color variables may enter resource-capable color paint. */
function safePaintVariables(property: string, value: string): boolean {
  const plain = property.replace(/^-(?:webkit|moz|ms|o)-/u, "");
  if (!["background", "fill", "stroke"].includes(plain) || /attr\s*\(/iu.test(value)) return false;
  const names = [...value.matchAll(/var\s*\(\s*(--[a-zA-Z0-9_-]+)/gu)].map(match => match[1]);
  return names.length > 0 && names.every(name => /^(?:--text-(?:normal|muted|faint|accent)|--interactive-accent|--canvas-(?:color|border|background)|--background-(?:primary|primary-alt|secondary|secondary-alt|modifier-border|modifier-border-hover|modifier-border-focus|modifier-hover))$/u.test(name));
}

/** No browser parser recovery: every supplied declaration must be accepted. */
export function parseLocalCss(input: string, supports: CssSupport): CssParseResult {
  if (input.length > 32768) return { valid: false, errors: [{ index: 0, declaration: "", reason: "unsafe" }] };
  const chunks: string[] = [];
  let start = 0;
  let quote = "";
  let depth = 0;
  for (let index = 0; index < input.length; index++) {
    const character = input[index];
    if (quote !== "") {
      if (character === quote) quote = "";
    } else if (character === "\"" || character === "'") quote = character;
    else if (character === "(") depth++;
    else if (character === ")") {
      depth--;
      if (depth < 0) return { valid: false, errors: [{ index: chunks.length, declaration: input.slice(start), reason: "syntax" }] };
    } else if (character === ";" && depth === 0) {
      chunks.push(input.slice(start, index));
      start = index + 1;
    }
  }
  if (quote !== "" || depth !== 0) return { valid: false, errors: [{ index: chunks.length, declaration: input.slice(start), reason: "syntax" }] };
  chunks.push(input.slice(start));
  const declarations: LocalCssDeclaration[] = [];
  const errors: CssDeclarationError[] = [];
  chunks.forEach((chunk, index) => {
    const declaration = chunk.trim();
    if (declaration === "" && index === chunks.length - 1) return;
    const match = /^(-?[a-zA-Z][a-zA-Z0-9-]*|--[a-zA-Z0-9_-]+)\s*:\s*([\s\S]+)$/u.exec(declaration);
    if (match === null) {
      errors.push({ index, declaration, reason: "syntax" });
      return;
    }
    const property = match[1].startsWith("--") ? match[1] : match[1].toLowerCase();
    const value = match[2].trim();
    const restriction = nativeOwnership(property);
    // Escapes/comments can disguise a URL token; priorities are not local values.
    const control = [...declaration].some(character => {
      const code = character.charCodeAt(0);
      return (code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127;
    });
    const unsafe = control || /[\\{}@!]|\/\*|\*\//u.test(declaration)
      || /(?:url|(?:-webkit-)?image-set|image|paint|expression|element)\s*\(/iu.test(value)
      || /(?:https?:|file:|data:|javascript:|\/\/)/iu.test(value)
      || (resourceProperty(property) && /(?:var|attr)\s*\(/iu.test(value) && !safePaintVariables(property, value))
      || property === "behavior" || property === "-moz-binding";
    if (restriction !== undefined) errors.push({ index, declaration, property, reason: "unsafe", restriction });
    else if (unsafe) errors.push({ index, declaration, property, reason: "unsafe" });
    else if (!supports(property, value)) errors.push({ index, declaration, property, reason: "unsupported" });
    else declarations.push(Object.freeze({ property, value }));
  });
  return errors.length === 0 ? { valid: true, declarations: Object.freeze(declarations) } : { valid: false, errors };
}

export type CustomStyleElement = HTMLElement | SVGElement;
export type CustomStyleChannel = "face" | "content" | "paint" | "opacity";
export interface CustomStyleChannels {
  readonly face?: readonly CustomStyleElement[];
  readonly content?: readonly CustomStyleElement[];
  readonly paint?: readonly SVGElement[];
  /** One ancestor for the item's content/paint; opacity is never multiplied on children. */
  readonly opacity?: CustomStyleElement;
}

/** Paint goes on one native face; text inherits within the content; paths own SVG paint. */
export function customStyleChannel(property: string): CustomStyleChannel {
  const plain = property.toLowerCase().replace(/^-(?:webkit|moz|ms|o)-/u, "");
  if (plain === "opacity") return "opacity";
  if (/^(?:stroke|fill)(?:-|$)/u.test(plain) || ["paint-order", "shape-rendering", "color-interpolation", "color-rendering"].includes(plain)) return "paint";
  if (/^(?:font|text|word|line|letter)(?:-|$)/u.test(plain)
    || ["color", "direction", "writing-mode", "unicode-bidi", "white-space", "hyphens", "tab-size", "vertical-align", "quotes"].includes(plain)) return "content";
  return "face";
}

export interface CustomStyleTarget {
  readonly id: string;
  readonly shell: HTMLElement | SVGElement;
  /** Card face/content or visible line paths; never interaction paths or defs. */
  readonly elements?: readonly CustomStyleElement[];
  /** Explicit channels take precedence over legacy elements; shell only establishes ownership. */
  readonly channels?: CustomStyleChannels;
  /** Selected line outline: retain its accent; widen relative to the visible line. */
  readonly casing?: { readonly element: SVGElement; readonly widthPadding: number };
}

function svgPaintElement(element: CustomStyleElement): boolean {
  return element.namespaceURI === "http://www.w3.org/2000/svg"
    && ["path", "line", "polyline", "polygon", "rect", "circle", "ellipse", "text"].includes(element.localName);
}

function propertyTargets(target: CustomStyleTarget, channel: CustomStyleChannel): readonly CustomStyleElement[] {
  const channels = target.channels;
  const legacy = target.elements ?? [];
  const candidates = channels === undefined
    ? channel === "opacity" ? [target.shell] : channel === "paint" ? legacy.filter(svgPaintElement)
      : legacy.filter(element => element.namespaceURI !== "http://www.w3.org/2000/svg").slice(0, 1)
    : channel === "opacity" ? channels.opacity === undefined ? [] : [channels.opacity] : channels[channel] ?? [];
  const eligible = [...new Set(candidates)].filter(element => element !== target.casing?.element
    && target.shell.contains(element) && element.closest("defs, marker, .canvas-interaction-path") === null
    && !(element === target.shell && (channel === "face" || channel === "content") && element.classList?.contains("canvas-node"))
    && (channel !== "paint" || svgPaintElement(element)));
  // An inherited rule or face border should not be stamped onto nested children again.
  return eligible.filter(element => !eligible.some(ancestor => ancestor !== element && ancestor.contains(element)));
}
export interface CustomStyleSnapshot {
  readonly definitions: readonly CustomBoardStyle[];
  /** Value of each item's localOverrides[itemId].customStyles, after schema extension. */
  readonly assignments: Readonly<Record<string, readonly string[]>>;
  readonly targets: readonly CustomStyleTarget[];
}
export interface CustomStyleDiagnostic {
  readonly styleId: string;
  readonly errors: readonly CssDeclarationError[];
}
interface StyleValue {
  readonly value: string;
  readonly priority: string;
}
function casingWidth(value: string, path: HTMLElement | SVGElement | undefined, padding: number): string | undefined {
  if (/^\d+(?:\.\d+)?(?:px)?$/u.test(value)) return String(Number.parseFloat(value) + padding);
  // Resolve em/calc/variables once after styling the visible line, in board units.
  if (path === undefined) return undefined;
  const owner = path.ownerDocument?.defaultView;
  const computed = owner?.getComputedStyle(path).getPropertyValue("stroke-width").trim();
  if (computed !== undefined && /^\d+(?:\.\d+)?px$/u.test(computed)) return String(Number.parseFloat(computed) + padding);
  return computed !== undefined && /^\d+(?:\.\d+)?%$/u.test(computed) ? `calc(${computed} + ${padding}px)` : undefined;
}
function styleValues(style: CSSStyleDeclaration): Map<string, StyleValue> {
  const result = new Map<string, StyleValue>();
  for (let index = 0; index < style.length; index++) {
    const property = style.item(index);
    result.set(property, { value: style.getPropertyValue(property), priority: style.getPropertyPriority(property) });
  }
  return result;
}
function sameValue(left: StyleValue | undefined, right: StyleValue | undefined): boolean {
  return left?.value === right?.value && left?.priority === right?.priority;
}

interface CustomStylePatch {
  readonly element: CustomStyleElement;
  readonly owned: Map<string, StyleValue | undefined>;
  readonly native: Map<string, StyleValue | undefined>;
}
interface OwnStyleMutation {
  readonly element: CustomStyleElement;
  readonly oldValue: string | null;
}
function propertyValue(style: CSSStyleDeclaration, property: string): StyleValue | undefined {
  const value = style.getPropertyValue(property);
  return value === "" ? undefined : { value, priority: style.getPropertyPriority(property) };
}

/** Inline patches are scoped to registered descendants and restored even when detached. */
export class CustomBoardStyles {
  private readonly patches = new Map<CustomStyleElement, CustomStylePatch>();
  private readonly ownMutations: OwnStyleMutation[] = [];
  private readonly observer: MutationObserver | undefined;
  private readonly probe: CSSStyleDeclaration | undefined;
  private disposed = false;

  public constructor(private readonly root: HTMLElement, private readonly supports: CssSupport = localCssSupport(root.ownerDocument)) {
    const document = root.ownerDocument;
    if (document !== undefined) {
      try { this.probe = createHtmlElement(document, "span").style; }
      catch { /* Plain hosts retain direct-property receipts. */ }
    }
    const Observer = document?.defaultView?.MutationObserver;
    if (typeof Observer === "function") {
      const observer = new Observer(records => this.consume(records));
      if (typeof observer.observe === "function" && typeof observer.disconnect === "function" && typeof observer.takeRecords === "function") this.observer = observer;
      else if (typeof observer.disconnect === "function") observer.disconnect();
    }
  }

  /** Call after source/appearance rendering, DOM/selection/definition/assignment changes. */
  public restoreBeforeRender(): void { this.release(); }

  public update(snapshot: CustomStyleSnapshot): readonly CustomStyleDiagnostic[] {
    if (this.disposed) return [];
    this.release();
    const parsed = new Map<string, readonly LocalCssDeclaration[]>();
    const diagnostics: CustomStyleDiagnostic[] = [];
    const seen = new Set<string>();
    for (const definition of snapshot.definitions) {
      if (seen.has(definition.id) || !definition.id.trim() || !definition.name.trim()) {
        parsed.delete(definition.id);
        diagnostics.push({ styleId: definition.id, errors: [{ index: 0, declaration: "", reason: "syntax" }] });
        continue;
      }
      seen.add(definition.id);
      const result = parseLocalCss(definition.declarations, this.supports);
      if (result.valid) parsed.set(definition.id, result.declarations);
      else diagnostics.push({ styleId: definition.id, errors: result.errors });
    }
    for (const target of snapshot.targets) {
      if (!this.root.contains(target.shell)) continue;
      const declarations: LocalCssDeclaration[] = [];
      const ids = Object.prototype.hasOwnProperty.call(snapshot.assignments, target.id) ? snapshot.assignments[target.id] : [];
      for (const id of ids) declarations.push(...(parsed.get(id) ?? []));
      if (declarations.length === 0) continue;
      const patches = new Map<CustomStyleElement, LocalCssDeclaration[]>();
      for (const declaration of declarations) {
        for (const element of propertyTargets(target, customStyleChannel(declaration.property))) {
          const own = patches.get(element) ?? [];
          own.push(declaration);
          patches.set(element, own);
        }
      }
      for (const [element, own] of patches) this.patch(element, own);
      const casing = target.casing;
      const width = [...declarations].reverse().find(declaration => declaration.property === "stroke-width")?.value;
      if (casing !== undefined && target.shell.contains(casing.element) && width !== undefined
        && Number.isFinite(casing.widthPadding) && casing.widthPadding >= 0) {
        const visible = propertyTargets(target, "paint")[0];
        const padded = casingWidth(width, visible, casing.widthPadding);
        if (padded !== undefined) this.patch(casing.element, [{ property: "stroke-width", value: padded }]);
      }
    }
    for (const element of this.patches.keys()) {
      this.observer?.observe(element, { attributes: true, attributeFilter: ["style"], attributeOldValue: true });
    }
    return diagnostics;
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.release();
  }

  private release(): void {
    // Capture pending native writes without repainting while the parent restores/renders.
    this.consume(this.observer?.takeRecords() ?? [], false);
    this.observer?.disconnect();
    this.ownMutations.length = 0;
    for (const patch of this.patches.values()) {
      for (const [property, desired] of patch.owned) {
        if (sameValue(propertyValue(patch.element.style, property), desired)) this.write(patch.element, property, patch.native.get(property), false);
      }
    }
    this.patches.clear();
  }

  private patch(element: HTMLElement | SVGElement, declarations: readonly LocalCssDeclaration[]): void {
    const style = element.style;
    const patch = this.patches.get(element) ?? { element, owned: new Map<string, StyleValue | undefined>(), native: new Map<string, StyleValue | undefined>() };
    const properties = new Set<string>();
    const normalized: LocalCssDeclaration[] = [];
    for (const declaration of declarations) {
      let value = declaration.value;
      if (this.probe !== undefined) {
        this.probe.cssText = "";
        this.probe.setProperty(declaration.property, value);
        const names = styleValues(this.probe);
        for (const property of names.keys()) properties.add(property);
        value = this.probe.getPropertyValue(declaration.property) || value;
      }
      if (this.probe === undefined || this.probe.length === 0) properties.add(declaration.property);
      normalized.push({ property: declaration.property, value });
    }
    for (const property of properties) {
      if (!patch.native.has(property)) patch.native.set(property, propertyValue(style, property));
    }
    for (const { property, value } of normalized) this.write(element, property, { value, priority: "" }, false);
    for (const property of properties) patch.owned.set(property, propertyValue(style, property));
    // Equal initial values still belong to the definition and can be overwritten later.
    this.patches.set(element, patch);
  }

  private write(element: CustomStyleElement, property: string, desired: StyleValue | undefined, observe = true): void {
    if (sameValue(propertyValue(element.style, property), desired)) return;
    const own = observe && this.observer !== undefined ? { element, oldValue: element.getAttribute("style") } : undefined;
    if (own !== undefined) this.ownMutations.push(own);
    try {
      if (desired === undefined) element.style.removeProperty(property);
      else element.style.setProperty(property, desired.value, desired.priority);
    } catch (error) {
      if (own !== undefined) this.ownMutations.splice(this.ownMutations.indexOf(own), 1);
      throw error;
    }
  }

  private consume(records: readonly MutationRecord[], reapply = true): void {
    if (this.disposed && reapply) return;
    let pending = records;
    while (pending.length > 0) {
      const changed = new Set<CustomStyleElement>();
      for (const record of pending) {
        if (record.attributeName !== "style") continue;
        const element = record.target as CustomStyleElement;
        const own = this.ownMutations.findIndex(mutation => mutation.element === element && mutation.oldValue === record.oldValue);
        if (own >= 0) this.ownMutations.splice(own, 1);
        else if (this.patches.has(element)) changed.add(element);
      }
      for (const element of changed) {
        const patch = this.patches.get(element);
        if (patch === undefined) continue;
        const overwritten: [string, StyleValue | undefined][] = [];
        for (const [property, desired] of patch.owned) {
          const current = propertyValue(element.style, property);
          if (sameValue(current, desired)) continue;
          patch.native.set(property, current);
          overwritten.push([property, desired]);
        }
        if (reapply && this.root.contains(element)) {
          for (const [property, desired] of overwritten) this.write(element, property, desired);
        }
      }
      // Drain only this observer: native/source observers still receive their own records.
      pending = this.observer?.takeRecords() ?? [];
    }
  }
}
