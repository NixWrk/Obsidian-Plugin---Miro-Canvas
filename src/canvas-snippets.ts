import { createHtmlElement } from "./dom-elements";

/** Exact native entries only; this module never finds snippets by their CSS text. */
export interface NativeSnippetEntry {
  readonly name: string;
  readonly element: HTMLStyleElement;
}
export const CANVAS_SNIPPET_SCOPE_ATTRIBUTE = "data-miro-canvas-snippet-scope";

export function readNativeSnippetNames(customCss: unknown): readonly string[] | undefined {
  try {
    if (customCss === null || typeof customCss !== "object") return undefined;
    const names: unknown = Reflect.get(customCss, "snippets");
    if (!Array.isArray(names)) return undefined;
    const candidates: readonly unknown[] = names;
    const installed: string[] = [];
    for (const name of candidates) {
      if (typeof name !== "string" || name.length === 0 || installed.includes(name)) return undefined;
      installed.push(name);
    }
    return installed;
  } catch {
    return undefined;
  }
}

export function readNativeSnippetEntries(customCss: unknown, document: Document): readonly NativeSnippetEntry[] | undefined {
  try {
    const names = readNativeSnippetNames(customCss);
    if (names === undefined || customCss === null || typeof customCss !== "object") return undefined;
    const enabled: unknown = Reflect.get(customCss, "enabledSnippets");
    const elements: unknown = Reflect.get(customCss, "extraStyleEls");
    if (!(enabled instanceof Set) || !Array.isArray(elements)
      || [...enabled].some(name => typeof name !== "string" || !names.includes(name))) return undefined;
    const ordered = names.filter(name => enabled.has(name));
    const StyleElement = document.defaultView?.HTMLStyleElement;
    if (StyleElement === undefined || ordered.length !== elements.length
      || new Set(elements).size !== elements.length) return undefined;
    if (elements.some(element => !(element instanceof StyleElement) || element.ownerDocument !== document)) return undefined;
    return ordered.map((name, index) => ({ name, element: elements[index] as HTMLStyleElement }));
  } catch {
    return undefined;
  }
}

/** Add a zero-specificity subject guard, before an originating pseudo-element. */
export function excludeCanvasSnippetSelector(selector: string, scopeSelector: string): string {
  if (!/^\[data-miro-canvas-snippet-scope="[0-9]+"\]$/u.test(scopeSelector)) throw new Error("Unsupported Canvas scope selector");
  const guard = `:where(:not(${scopeSelector}, ${scopeSelector} *))`;
  const parts: string[] = [];
  const trimEnd = (text: string): string => {
    let end = text.length;
    while (end > 0 && /\s/u.test(text[end - 1])) {
      let escapes = 0;
      for (let index = end - 2; index >= 0 && text[index] === "\\"; index--) escapes++;
      if (escapes % 2 !== 0) break;
      end--;
    }
    return text.slice(0, end);
  };
  let start = 0;
  let depth = 0;
  let brackets = 0;
  let quote = "";
  let pseudo = -1;
  const finish = (end: number): void => {
    const text = selector.slice(start, end).trim();
    if (text.length === 0 || /[>+~]$/u.test(text)) throw new Error("Unsupported empty or relative selector subject");
    const insertion = pseudo < 0 ? end : pseudo;
    const prefix = selector.slice(start, insertion);
    parts.push(`${pseudo < 0 ? trimEnd(prefix) : prefix}${guard}${selector.slice(insertion, end).trimEnd()}`.trim());
    start = end + 1;
    pseudo = -1;
  };
  for (let index = 0; index < selector.length; index++) {
    const character = selector[index];
    if (character === "\\") {
      // A hexadecimal escape may consume a whitespace terminator.
      const escape = /^[0-9a-f]{1,6}(?:\r\n|[\t\n\r\f ])?/iu.exec(selector.slice(index + 1));
      index += escape === null ? 1 : escape[0].length;
      if (index >= selector.length) throw new Error("Unsupported unterminated selector escape");
      continue;
    }
    if (quote !== "") {
      if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "/" && selector[index + 1] === "*") throw new Error("Unsupported selector comment");
    if (character === "[") brackets++;
    else if (character === "]") brackets--;
    else if (brackets === 0) {
      if (character === "(") depth++;
      else if (character === ")") depth--;
      else if (character === ":") {
        const legacy = /^:(before|after|first-letter|first-line)(?![\w-])/iu.test(selector.slice(index));
        if (selector[index + 1] === ":" || legacy) {
          if (depth > 0) throw new Error("Unsupported functional pseudo-element selector");
          const name = /^::?([a-z-]+)/iu.exec(selector.slice(index))?.[1]?.toLowerCase();
          if (name === undefined || !/^(before|after|first-letter|first-line|marker|selection|placeholder|backdrop|file-selector-button|details-content|-webkit-scrollbar(?:-[a-z-]+)?)$/u.test(name)) {
            throw new Error("Unsupported non-originating pseudo-element selector");
          }
          if (pseudo < 0) pseudo = index;
          if (selector[index + 1] === ":") index++;
        }
      } else if (depth === 0 && character === ",") finish(index);
      else if (depth === 0 && pseudo >= 0 && /[\s>+~|]/u.test(character)) {
        throw new Error("Unsupported combinator after pseudo-element");
      } else if (depth === 0 && character === "|" && selector[index + 1] === "|") {
        throw new Error("Unsupported column combinator");
      }
    }
    if (brackets < 0 || depth < 0) throw new Error("Unsupported unbalanced selector");
  }
  if (quote !== "" || brackets !== 0 || depth !== 0) throw new Error("Unsupported unbalanced selector");
  finish(selector.length);
  return parts.join(", ");
}

interface SelectorEdit {
  readonly rule: CSSStyleRule;
  readonly original: string;
  readonly replacement: string;
  applied?: string;
}

/** Planning is pure: an unsupported rule leaves every native rule untouched. */
export function planCanvasSnippetRules(rules: CSSRuleList, scopeSelector: string): readonly SelectorEdit[] {
  const edits: SelectorEdit[] = [];
  const visit = (list: CSSRuleList, nested: boolean): void => {
    for (const rule of Array.from(list)) {
      if ("selectorText" in rule && typeof rule.selectorText === "string") {
        const styleRule = rule as CSSStyleRule;
        edits.push({ rule: styleRule, original: styleRule.selectorText,
          replacement: excludeCanvasSnippetSelector(styleRule.selectorText, scopeSelector) });
        if ("cssRules" in styleRule && styleRule.cssRules !== undefined) visit(styleRule.cssRules, true);
      } else if ("cssRules" in rule && /^@(media|supports|container|layer|scope|starting-style)\b/iu.test(rule.cssText)) {
        visit((rule as CSSGroupingRule).cssRules, nested);
      } else if (nested && "style" in rule && !rule.cssText.trimStart().startsWith("@")) {
        // CSSNestedDeclarations shares the guarded parent style rule's subject.
        continue;
      } else if (/^@layer\s+[^{}]+;$/iu.test(rule.cssText)) {
        continue;
      } else {
        throw new Error(`Unsupported snippet rule: ${rule.cssText.slice(0, 100)}`);
      }
    }
  };
  visit(rules, false);
  return edits;
}

export interface CanvasSnippetDiagnostic {
  readonly document: Document;
  readonly name?: string;
  readonly reason: "native-shape" | "unsupported-css" | "baseline" | "scope";
  readonly message: string;
}
export type NativeSnippetEntriesGetter = (document: Document) => readonly NativeSnippetEntry[] | undefined;
interface InlineValue {
  readonly value: string;
  readonly priority: string;
}
interface InlineEdit {
  readonly original: InlineValue;
  readonly applied: InlineValue;
}
interface ScopeState {
  readonly priorMarker: string | null;
  readonly inline: Map<string, InlineEdit>;
  registrations: number;
}
interface DocumentState {
  readonly scopes: Map<HTMLElement, ScopeState>;
  readonly edits: Map<HTMLStyleElement, readonly SelectorEdit[]>;
  readonly diagnostics: Set<string>;
  observer?: MutationObserver;
  refreshing: boolean;
}
let nextManagerId = 0;

/** Synchronous CSSOM isolation; each document and each board has its own lifetime. */
export class CanvasSnippetManager {
  private readonly documents = new Map<Document, DocumentState>();
  private readonly marker = String(++nextManagerId);
  private allowed: Set<string>;
  private disposed = false;

  public constructor(
    private readonly getEntries: NativeSnippetEntriesGetter,
    allowed: readonly string[] = [],
    private readonly onDiagnostic?: (diagnostic: CanvasSnippetDiagnostic) => void,
  ) {
    this.allowed = new Set(allowed);
  }

  public attach(document: Document): void {
    if (this.disposed || this.documents.has(document)) return;
    const state: DocumentState = { scopes: new Map(), edits: new Map(), diagnostics: new Set(), refreshing: false };
    this.documents.set(document, state);
    const Observer = document.defaultView?.MutationObserver;
    if (Observer !== undefined && document.head !== null) {
      state.observer = new Observer(() => this.refresh(document));
      state.observer.observe(document.head, { childList: true, subtree: true, characterData: true });
      // Theme changes can alter the inherited baseline without replacing a sheet.
      for (const element of [document.documentElement, document.body]) {
        if (element !== null) state.observer.observe(element, { attributes: true, attributeFilter: ["class", "style"] });
      }
    }
  }

  public register(scope: HTMLElement): () => void {
    if (this.disposed) return () => undefined;
    const document = scope.ownerDocument;
    this.attach(document);
    const state = this.documents.get(document);
    if (state === undefined) return () => undefined;
    if (scope === document.body || scope === document.documentElement || document.head?.contains(scope)) {
      this.report(state, { document, reason: "scope", message: "Canvas snippet scope must be an owned board root, not a document ancestor" });
      return () => undefined;
    }
    const existing = state.scopes.get(scope);
    if (existing !== undefined) existing.registrations++;
    else {
      state.scopes.set(scope, { priorMarker: scope.getAttribute(CANVAS_SNIPPET_SCOPE_ATTRIBUTE), inline: new Map(), registrations: 1 });
      scope.setAttribute(CANVAS_SNIPPET_SCOPE_ATTRIBUTE, this.marker);
    }
    this.refresh(document);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const owned = state.scopes.get(scope);
      if (owned === undefined || --owned.registrations > 0) return;
      this.restoreScope(scope, owned);
      state.scopes.delete(scope);
      this.refresh(document);
    };
  }

  public detach(document: Document): void {
    const state = this.documents.get(document);
    if (state === undefined) return;
    state.observer?.disconnect();
    this.restoreRules(state);
    for (const [scope, owned] of state.scopes) this.restoreScope(scope, owned);
    state.scopes.clear();
    this.documents.delete(document);
  }

  public configure(allowed: readonly string[]): void {
    if (this.disposed) return;
    this.allowed = new Set(allowed);
    this.refresh();
  }

  public refresh(document?: Document): void {
    if (this.disposed) return;
    for (const [owner, state] of this.documents) {
      if (document !== undefined && owner !== document) continue;
      if (state.refreshing) continue;
      state.refreshing = true;
      try {
        this.refreshDocument(owner, state);
      } finally {
        state.refreshing = false;
      }
    }
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const state of this.documents.values()) {
      state.observer?.disconnect();
      this.restoreRules(state);
      for (const [scope, owned] of state.scopes) this.restoreScope(scope, owned);
    }
    this.documents.clear();
  }

  private refreshDocument(document: Document, state: DocumentState): void {
    this.restoreRules(state);
    for (const [scope, owned] of state.scopes) this.restoreInline(scope, owned);
    if (state.scopes.size === 0) return;
    let entries: readonly NativeSnippetEntry[] | undefined;
    try {
      entries = this.getEntries(document);
    } catch {
      entries = undefined;
    }
    if (entries === undefined || new Set(entries.map(entry => entry.element)).size !== entries.length
      || entries.some(entry => entry.element.ownerDocument !== document || typeof entry.name !== "string")) {
      this.report(state, { document, reason: "native-shape", message: "Native snippet entries unavailable or unsupported; Canvas isolation was not installed" });
      return;
    }
    const blocked: CSSStyleSheet[] = [];
    for (const entry of entries) {
      if (this.allowed.has(entry.name)) continue;
      const sheet = entry.element.sheet;
      if (sheet === null) {
        this.report(state, { document, name: entry.name, reason: "unsupported-css", message: "Native snippet sheet is not ready; refresh after native CSS loading" });
        continue;
      }
      let edits: readonly SelectorEdit[] = [];
      try {
        edits = planCanvasSnippetRules(sheet.cssRules, `[${CANVAS_SNIPPET_SCOPE_ATTRIBUTE}="${this.marker}"]`);
        // Store the transaction before setters: a rejected selector must roll back.
        state.edits.set(entry.element, edits);
        for (const edit of edits) {
          edit.rule.selectorText = edit.replacement;
          edit.applied = edit.rule.selectorText;
          if (edit.applied === edit.original) throw new Error("Browser rejected Canvas snippet exclusion selector");
        }
        blocked.push(sheet);
      } catch (error) {
        this.restoreEdits(edits);
        state.edits.delete(entry.element);
        this.report(state, { document, name: entry.name, reason: "unsupported-css", message: error instanceof Error ? error.message : "Unsupported snippet stylesheet" });
      }
    }
    this.updateInherited(document, state, blocked);
  }

  private updateInherited(document: Document, state: DocumentState, blocked: readonly CSSStyleSheet[]): void {
    if (blocked.length === 0) return;
    const window = document.defaultView;
    if (window === null) {
      this.report(state, { document, reason: "baseline", message: "Canvas inherited snippet baseline requires the owning document window" });
      return;
    }
    const customProperties = this.customProperties(document, state);
    const baselines = new Map<HTMLElement, { values: Map<string, string>; inherited: Set<string> }>();
    const disabled = blocked.map(sheet => ({ sheet, prior: sheet.disabled }));
    try {
      // No await, timer or rendering boundary is permitted inside this transaction.
      try {
        for (const { sheet } of disabled) sheet.disabled = true;
        for (const scope of state.scopes.keys()) {
          baselines.set(scope, { values: this.computed(window.getComputedStyle(scope), customProperties), inherited: this.inheritedProperties(scope, window) });
        }
      } finally {
        for (const { sheet, prior } of disabled) sheet.disabled = prior;
      }
      for (const [scope, owned] of state.scopes) {
        const baseline = baselines.get(scope);
        if (baseline === undefined) continue;
        const current = this.computed(window.getComputedStyle(scope), customProperties);
        const inherited = this.inheritedProperties(scope, window);
        const properties = new Set([...baseline.values.keys(), ...current.keys()]);
        for (const property of properties) {
          if (!property.startsWith("--") && !baseline.inherited.has(property) && !inherited.has(property)) continue;
          const before = current.get(property) ?? "";
          const after = baseline.values.get(property) ?? "";
          if (before === after) continue;
          const original = this.inlineValue(scope.style, property);
          scope.style.setProperty(property, after === "" && property.startsWith("--") ? "initial" : after, "important");
          owned.inline.set(property, { original, applied: this.inlineValue(scope.style, property) });
        }
      }
    } catch (error) {
      for (const [scope, owned] of state.scopes) this.restoreInline(scope, owned);
      this.report(state, { document, reason: "baseline", message: error instanceof Error ? error.message : "Canvas inherited snippet baseline failed" });
    }
  }

  private computed(style: CSSStyleDeclaration, customProperties: ReadonlySet<string> = new Set()): Map<string, string> {
    const values = new Map<string, string>();
    for (let index = 0; index < style.length; index++) {
      const property = style.item(index);
      values.set(property, style.getPropertyValue(property));
    }
    for (const property of customProperties) values.set(property, style.getPropertyValue(property));
    return values;
  }

  private customProperties(document: Document, state: DocumentState): Set<string> {
    const names = new Set<string>();
    const collect = (style: CSSStyleDeclaration): void => {
      for (let index = 0; index < style.length; index++) {
        const name = style.item(index);
        if (name.startsWith("--")) names.add(name);
      }
    };
    const visit = (rules: CSSRuleList): void => {
      for (const rule of Array.from(rules)) {
        if ("style" in rule) collect((rule as CSSStyleRule).style);
        if ("cssRules" in rule) visit((rule as CSSGroupingRule).cssRules);
        if (rule.cssText.startsWith("@property") && "name" in rule && typeof rule.name === "string") names.add(rule.name);
      }
    };
    for (const sheet of [...Array.from(document.styleSheets), ...document.adoptedStyleSheets]) {
      try {
        visit(sheet.cssRules);
      } catch {
        this.report(state, { document, reason: "baseline", message: "Cannot inspect custom properties in an inaccessible stylesheet; inherited isolation may be incomplete" });
      }
    }
    for (const scope of state.scopes.keys()) {
      for (let ancestor: HTMLElement | null = scope; ancestor !== null; ancestor = ancestor.parentElement) collect(ancestor.style);
    }
    return names;
  }
  private inheritedProperties(scope: HTMLElement, window: Window): Set<string> {
    // Let this engine identify inheritance, including new/vendor properties.
    const probe = createHtmlElement(scope.ownerDocument, "span");
    const resets = ["initial", "unset"];
    try {
      for (const [property, value] of [["all", resets[0]], ["display", "none"]]) {
        probe.style.setProperty(property, value, "important");
      }
      scope.appendChild(probe);
      const initial = this.computed(window.getComputedStyle(probe));
      probe.style.setProperty("all", resets[1], "important");
      const unset = this.computed(window.getComputedStyle(probe));
      return new Set([...unset].filter(([property, value]) => value !== initial.get(property)).map(([property]) => property).concat("direction"));
    } finally {
      probe.remove();
    }
  }

  private inlineValue(style: CSSStyleDeclaration, property: string): InlineValue {
    return { value: style.getPropertyValue(property), priority: style.getPropertyPriority(property) };
  }

  private restoreInline(scope: HTMLElement, owned: ScopeState): void {
    for (const [property, edit] of owned.inline) {
      const current = this.inlineValue(scope.style, property);
      if (current.value !== edit.applied.value || current.priority !== edit.applied.priority) continue;
      if (edit.original.value === "") scope.style.removeProperty(property);
      else scope.style.setProperty(property, edit.original.value, edit.original.priority);
    }
    owned.inline.clear();
  }

  private restoreScope(scope: HTMLElement, owned: ScopeState): void {
    this.restoreInline(scope, owned);
    if (scope.getAttribute(CANVAS_SNIPPET_SCOPE_ATTRIBUTE) !== this.marker) return;
    if (owned.priorMarker === null) scope.removeAttribute(CANVAS_SNIPPET_SCOPE_ATTRIBUTE);
    else scope.setAttribute(CANVAS_SNIPPET_SCOPE_ATTRIBUTE, owned.priorMarker);
  }

  private restoreEdits(edits: readonly SelectorEdit[]): void {
    for (const edit of edits) {
      if (edit.applied !== undefined && edit.rule.selectorText === edit.applied) edit.rule.selectorText = edit.original;
    }
  }

  private restoreRules(state: DocumentState): void {
    for (const edits of state.edits.values()) this.restoreEdits(edits);
    state.edits.clear();
  }

  private report(state: DocumentState, diagnostic: CanvasSnippetDiagnostic): void {
    const key = `${diagnostic.reason}:${diagnostic.name ?? ""}:${diagnostic.message}`;
    if (state.diagnostics.has(key)) return;
    state.diagnostics.add(key);
    this.onDiagnostic?.(diagnostic);
  }
}
