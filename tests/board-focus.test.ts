import { describe, expect, it } from "vitest";

import { controlToLetGo } from "../src/board-focus";

const CONTROLS = ".miro-canvas-toolbar, .miro-canvas-dock";

/** What the function reads of an element: its tag, its attributes, and whether it sits in one of the plugin's controls. */
function element(tagName: string, options: { inControls?: boolean; type?: string; role?: string } = {}): Element {
  const attributes = new Map<string, string>();
  if (options.type !== undefined) attributes.set("type", options.type);
  if (options.role !== undefined) attributes.set("role", options.role);
  return {
    tagName,
    getAttribute: (name: string) => attributes.get(name) ?? null,
    closest: (selector: string) => (options.inControls === false || selector !== CONTROLS ? null : {}),
  } as unknown as Element;
}

describe("the control a press on the board takes the focus from", () => {
  it("is a button of the plugin's, in the bar, the dock or the selection toolbar", () => {
    const button = element("BUTTON");
    expect(controlToLetGo(button, CONTROLS)).toBe(button);
    const lower = element("button");
    expect(controlToLetGo(lower, CONTROLS)).toBe(lower);
  });

  it("is a control that is pressed or dragged: a slider, a swatch, a tick, an element with the role of a button", () => {
    for (const type of ["range", "color", "checkbox", "radio", "button", "submit", "reset", "file", "image", "RANGE"]) {
      const input = element("INPUT", { type });
      expect(controlToLetGo(input, CONTROLS), type).toBe(input);
    }
    const custom = element("DIV", { role: "button" });
    expect(controlToLetGo(custom, CONTROLS)).toBe(custom);
  });

  it("is never a field that takes text: a name, a number, a search, a link, a reply box", () => {
    for (const type of [undefined, "text", "number", "search", "url", "email", "password", "tel", "date", "unknown"]) {
      expect(controlToLetGo(element("INPUT", { type }), CONTROLS), String(type)).toBeUndefined();
    }
    expect(controlToLetGo(element("TEXTAREA"), CONTROLS)).toBeUndefined();
    expect(controlToLetGo(element("SELECT"), CONTROLS)).toBeUndefined();
  });

  it("is none that the plugin did not draw: a button elsewhere in Obsidian", () => {
    expect(controlToLetGo(element("BUTTON", { inControls: false }), CONTROLS)).toBeUndefined();
  });

  it("is none when nothing has the focus, or the focus is on something that is no control", () => {
    expect(controlToLetGo(null, CONTROLS)).toBeUndefined();
    expect(controlToLetGo(undefined, CONTROLS)).toBeUndefined();
    expect(controlToLetGo(element("DIV"), CONTROLS)).toBeUndefined();
    expect(controlToLetGo(element("CANVAS"), CONTROLS)).toBeUndefined();
  });
});
