import { describe, expect, it, vi } from "vitest";

import { DEFAULT_TYPOGRAPHY, type ColorSettings, type TypographySettings } from "../src/appearance";
import { readableInk } from "../src/miro-palette";
import {
  applyEditorAppearanceToFrame,
  buildEditorAppearanceRules,
  EDITOR_APPEARANCE_ATTRIBUTE,
} from "../src/editor-appearance";

const typography: TypographySettings = {
  ...DEFAULT_TYPOGRAPHY,
  fontFamily: "Merriweather",
  fontSize: 28,
  format: { bold: true, italic: true, underline: true, strike: false },
  alignment: "center",
  lineHeight: 1.6,
};

describe("buildEditorAppearanceRules", () => {
  it("returns no rules for a card with no override, so its editor stays exactly native", () => {
    expect(buildEditorAppearanceRules(undefined, undefined)).toEqual([]);
  });

  it("paints the frame's text the same font, weight, style, decoration, alignment and line height as the shown card", () => {
    const rules = buildEditorAppearanceRules(typography, undefined);
    expect(rules).toHaveLength(1);
    expect(rules[0]!.selector).toBe(".markdown-source-view.mod-cm6 .cm-content");
    expect(rules[0]!.declarations).toEqual([
      ["font-family", "\"Merriweather\", serif"],
      ["font-size", "28px"],
      ["font-weight", "700"],
      ["font-style", "italic"],
      ["text-decoration", "underline"],
      ["text-align", "center"],
      ["line-height", "1.6"],
    ]);
  });

  it("adds the card's text colour to the content rule", () => {
    const colors: ColorSettings = { text: "#4262ff" };
    const rules = buildEditorAppearanceRules(undefined, colors);
    expect(rules).toEqual([
      { selector: ".markdown-source-view.mod-cm6 .cm-content", declarations: [["color", "#4262ff"]] },
    ]);
  });

  it("makes the frame body transparent only when the card sets a fill, so the card's own fill shows through", () => {
    const withFill = buildEditorAppearanceRules(undefined, { fill: "#ffd02f" });
    expect(withFill).toEqual([{ selector: "body", declarations: [["background-color", "transparent"]] }]);

    const withoutFill = buildEditorAppearanceRules(undefined, { text: "#1a1a1a" });
    expect(withoutFill.some((rule) => rule.selector === "body")).toBe(false);
  });

  it("gives marked text the card's highlight colour and readable ink when the card sets no text colour", () => {
    const rules = buildEditorAppearanceRules(undefined, { highlight: "#ffe86d" });
    const highlight = rules.find((rule) => rule.selector === ".markdown-source-view.mod-cm6 .cm-highlight");
    expect(highlight?.declarations).toEqual([
      ["background-color", "#ffe86d"],
      ["color", readableInk("#ffe86d")],
    ]);
  });

  it("gives marked text the card's own text colour when the card sets one, since the editor's marker rule outranks inheritance", () => {
    const rules = buildEditorAppearanceRules(undefined, { highlight: "#ffe86d", text: "#4262ff" });
    const highlight = rules.find((rule) => rule.selector === ".markdown-source-view.mod-cm6 .cm-highlight");
    expect(highlight?.declarations).toEqual([
      ["background-color", "#ffe86d"],
      ["color", "#4262ff"],
    ]);
  });

  it("does not mark up a cleared (null) highlight", () => {
    const rules = buildEditorAppearanceRules(undefined, { highlight: null });
    expect(rules.some((rule) => rule.selector.includes("cm-highlight"))).toBe(false);
  });
});

/** A minimal stand-in for a CSSStyleDeclaration: enough to read back what was set. */
class FakeDeclaration {
  readonly props = new Map<string, string>();
  setProperty(name: string, value: string, priority?: string): void {
    this.props.set(name, priority ? `${value} !${priority}` : value);
  }
}

/** A minimal stand-in for a CSSStyleSheet, storing rules as plain records. */
class FakeSheet {
  cssRules: { selectorText: string; style: FakeDeclaration }[] = [];
  insertRule(text: string, index: number): number {
    const selectorText = text.slice(0, text.indexOf("{")).trim();
    this.cssRules.splice(index, 0, { selectorText, style: new FakeDeclaration() });
    return index;
  }
  deleteRule(index: number): void {
    this.cssRules.splice(index, 1);
  }
}

/** A minimal stand-in for the one <style> element this module owns. */
class FakeStyleElement {
  readonly sheet = new FakeSheet();
  private readonly attributes = new Map<string, string>();
  removed = false;
  setAttribute(key: string, value: string): void {
    this.attributes.set(key, value);
  }
  hasAttribute(key: string): boolean {
    return this.attributes.has(key);
  }
  remove(): void {
    this.removed = true;
  }
}

class FakeHead {
  readonly children: FakeStyleElement[] = [];
  appendChild(element: FakeStyleElement): FakeStyleElement {
    this.children.push(element);
    return element;
  }
  querySelector(selector: string): FakeStyleElement | null {
    const attribute = /^style\[([^\]]+)\]$/u.exec(selector)?.[1];
    if (attribute === undefined) {
      return null;
    }
    return this.children.find((element) => !element.removed && element.hasAttribute(attribute)) ?? null;
  }
}

class FakeDocument {
  readonly head = new FakeHead();
  createElement(tagName: string): FakeStyleElement {
    if (tagName !== "style") {
      throw new Error(`unexpected tag: ${tagName}`);
    }
    return new FakeStyleElement();
  }
}

/** A minimal stand-in for the same-origin iframe Obsidian edits a card's text in. */
class FakeFrame {
  contentDocument: FakeDocument | null;
  private readonly listeners = new Map<string, (() => void)[]>();
  constructor(contentDocument: FakeDocument | null = new FakeDocument()) {
    this.contentDocument = contentDocument;
  }
  addEventListener(type: string, handler: () => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(handler);
    this.listeners.set(type, list);
  }
  fire(type: string): void {
    for (const handler of this.listeners.get(type) ?? []) handler();
  }
}

function ownedStyle(doc: FakeDocument): FakeStyleElement | null {
  return doc.head.querySelector(`style[${EDITOR_APPEARANCE_ATTRIBUTE}]`);
}

describe("applyEditorAppearanceToFrame", () => {
  it("paints declarations into one owned style element via the CSSOM", () => {
    const frame = new FakeFrame();
    applyEditorAppearanceToFrame(frame, buildEditorAppearanceRules(typography, { text: "#4262ff" }));
    const style = ownedStyle(frame.contentDocument!);
    expect(style).not.toBeNull();
    expect(style!.sheet.cssRules).toHaveLength(1);
    expect(style!.sheet.cssRules[0]!.selectorText).toBe(".markdown-source-view.mod-cm6 .cm-content");
    expect(style!.sheet.cssRules[0]!.style.props.get("font-family")).toBe("\"Merriweather\", serif !important");
    expect(style!.sheet.cssRules[0]!.style.props.get("color")).toBe("#4262ff !important");
  });

  it("reuses the same style element and replaces its rules on a later call", () => {
    const frame = new FakeFrame();
    applyEditorAppearanceToFrame(frame, buildEditorAppearanceRules(typography, undefined));
    const first = ownedStyle(frame.contentDocument!);
    applyEditorAppearanceToFrame(frame, buildEditorAppearanceRules(undefined, { fill: "#ffd02f" }));
    const second = ownedStyle(frame.contentDocument!);
    expect(second).toBe(first);
    expect(second!.sheet.cssRules).toHaveLength(1);
    expect(second!.sheet.cssRules[0]!.selectorText).toBe("body");
  });

  it("removes the style element once the rule list goes empty", () => {
    const frame = new FakeFrame();
    applyEditorAppearanceToFrame(frame, buildEditorAppearanceRules(typography, undefined));
    expect(ownedStyle(frame.contentDocument!)).not.toBeNull();
    applyEditorAppearanceToFrame(frame, []);
    expect(ownedStyle(frame.contentDocument!)).toBeNull();
  });

  it("never creates a style element for a frame it has nothing to paint", () => {
    const frame = new FakeFrame();
    applyEditorAppearanceToFrame(frame, []);
    expect(frame.contentDocument!.head.children).toHaveLength(0);
  });

  it("repaints on the frame's load event with the latest rules, not the rules captured when it was registered", () => {
    const frame = new FakeFrame();
    applyEditorAppearanceToFrame(frame, buildEditorAppearanceRules(typography, undefined));
    applyEditorAppearanceToFrame(frame, buildEditorAppearanceRules(undefined, { fill: "#ffd02f" }));
    // Obsidian refills the frame and wipes the head this module wrote into.
    frame.contentDocument!.head.children.splice(0);
    frame.fire("load");
    const style = ownedStyle(frame.contentDocument!);
    expect(style).not.toBeNull();
    expect(style!.sheet.cssRules[0]!.selectorText).toBe("body");
  });

  it("registers the load listener once per frame across repeated calls", () => {
    const frame = new FakeFrame();
    const spy = vi.spyOn(frame, "addEventListener");
    applyEditorAppearanceToFrame(frame, buildEditorAppearanceRules(typography, undefined));
    applyEditorAppearanceToFrame(frame, buildEditorAppearanceRules(undefined, { fill: "#ffd02f" }));
    applyEditorAppearanceToFrame(frame, []);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("never throws for a detached or cross-origin frame", () => {
    expect(() => applyEditorAppearanceToFrame(new FakeFrame(null), buildEditorAppearanceRules(typography, undefined))).not.toThrow();
    expect(() => applyEditorAppearanceToFrame(undefined, buildEditorAppearanceRules(typography, undefined))).not.toThrow();
    expect(() => applyEditorAppearanceToFrame({}, buildEditorAppearanceRules(typography, undefined))).not.toThrow();
  });
});
