import { describe, expect, it, vi } from "vitest";
import { createHtmlElement, createSvgElement } from "../src/dom-elements";

describe("owning-document element factories", () => {
  it("uses the owner's HTML helper and receiver without touching native creation", () => {
    const element = { tagName: "BUTTON", parentNode: null };
    const owner = { createEl: vi.fn(function (this: unknown, tag: string) { expect(this).toBe(owner); expect(tag).toBe("button"); return element; }) };
    const native = vi.fn(() => { throw Error("native helper should not run"); });
    const document = { defaultView: owner, createElement: native } as unknown as Document;
    expect(createHtmlElement(document, "button")).toBe(element);
    expect(element.parentNode).toBeNull();
    expect(native).not.toHaveBeenCalled();
  });

  it("uses the owner's SVG helper without appending to any parent", () => {
    const element = { namespaceURI: "http://www.w3.org/2000/svg", parentNode: null };
    const owner = { createSvg: vi.fn(function (this: unknown, tag: string) { expect(this).toBe(owner); expect(tag).toBe("path"); return element; }) };
    const document = { defaultView: owner } as unknown as Document;
    expect(createSvgElement(document, "path")).toBe(element);
    expect(element.parentNode).toBeNull();
  });

  it.each([undefined, null, {}])("binds native HTML creation in a minimal/plain host: %s", (defaultView) => {
    const element = { ownerDocument: undefined, parentNode: null };
    const native = vi.fn(function (this: unknown, tag: string) { expect(this).toBe(document); expect(tag).toBe("span"); return element; });
    const document = { defaultView, createElement: native } as unknown as Document;
    expect(createHtmlElement(document, "span")).toBe(element);
    expect(native).toHaveBeenCalledOnce();
  });

  it("binds native SVG creation with the exact namespace in a plain iframe", () => {
    const element = { parentNode: null };
    const native = vi.fn(function (this: unknown, namespace: string, tag: string) { expect(this).toBe(document); expect(namespace).toBe("http://www.w3.org/2000/svg"); expect(tag).toBe("svg"); return element; });
    const document = { defaultView: {}, createElementNS: native } as unknown as Document;
    expect(createSvgElement(document, "svg")).toBe(element);
    expect(native).toHaveBeenCalledOnce();
  });
});
