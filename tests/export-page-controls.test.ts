import { describe, expect, it, vi } from "vitest";
import { M1CanvasSession, pointLandsOnBoard } from "../src/m1-session";

function target(className: string) {
  return { closest: (selector: string) => selector.split(",").some(part => part.trim() === `.${className}`) ? {} : null };
}

function selectionHost() {
  const handlers = new Map<string, (event: unknown) => void>();
  const listeners = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
  const root = {
    ownerDocument: { ...listeners, defaultView: listeners },
    contains: () => true,
    addEventListener: (name: string, handler: (event: unknown) => void) => handlers.set(name, handler),
    removeEventListener: vi.fn(),
  };
  const rectangleSelect = vi.fn();
  const session = Object.assign(Object.create(M1CanvasSession.prototype), {
    root, disposers: [], selectedCommentKeys: new Set(), armedTool: "select",
    settings: { panBinding: "none", lassoBinding: "none" },
    isSpacePanHeld: () => false, rectangleSelect,
  });
  session.attachRectangleSelection();
  return { root, down: handlers.get("pointerdown")!, rectangleSelect };
}

function press(className: string) {
  return { target: target(className), button: 0, shiftKey: false, pointerType: "mouse", defaultPrevented: false,
    preventDefault: vi.fn(), stopImmediatePropagation: vi.fn() };
}

describe("export page controls on the board", () => {
  it.each(["miro-canvas-export-page__tab", "miro-canvas-export-page__corner"])("leaves %s presses for moving or resizing the page", className => {
    const host = selectionHost();
    const event = press(className);
    host.down(event);
    expect(host.rectangleSelect).not.toHaveBeenCalled();
    expect(event.stopImmediatePropagation).not.toHaveBeenCalled();
    const board = { getBoundingClientRect: () => ({ left: 0, top: 0, right: 800, bottom: 600 }),
      ownerDocument: { elementFromPoint: () => event.target } };
    expect(pointLandsOnBoard({ x: 400, y: 300 }, board)).toBe(false);
  });

  it("keeps the inside of the page available for board selection", () => {
    const host = selectionHost();
    const event = press("miro-canvas-export-page");
    host.down(event);
    expect(host.rectangleSelect).toHaveBeenCalledWith(host.root, host.root.ownerDocument.defaultView, event);
    expect(event.stopImmediatePropagation).toHaveBeenCalledOnce();
  });
});
