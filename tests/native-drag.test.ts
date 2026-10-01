import { describe, expect, it } from "vitest";

import { replayNativeDrag } from "../src/native-drag";

/** What a pointer event was made with, and where it was sent. */
interface Sent {
  readonly type: string;
  readonly target: unknown;
  readonly init: Record<string, unknown>;
}

/** A window that makes pointer events and hands each one to its target, and a button that sits in it. */
function stage(options: { pointerEvents?: boolean } = {}) {
  const sent: Sent[] = [];
  class FakePointerEvent {
    public constructor(public readonly type: string, public readonly init: Record<string, unknown>) {}
  }
  const view = {
    PointerEvent: options.pointerEvents === false ? undefined : FakePointerEvent,
    dispatchEvent(event: FakePointerEvent) {
      sent.push({ type: event.type, target: view, init: event.init });
      return true;
    },
  };
  const button = {
    ownerDocument: { defaultView: view },
    getBoundingClientRect: () => ({ left: 100, top: 700, width: 32, height: 32 }),
    dispatchEvent(event: FakePointerEvent) {
      sent.push({ type: event.type, target: button, init: event.init });
      return true;
    },
  };
  return { sent, view, button: button as unknown as HTMLElement };
}

describe("replaying native Canvas's drag-to-add to a point", () => {
  it("presses the button, then moves and lets go on the window at the point, as a drag of the button does", () => {
    const { sent, button, view } = stage();
    expect(replayNativeDrag(button, { x: 640, y: 250 })).toBe(true);
    expect(sent.map((item) => [item.type, item.target === view ? "window" : "button"])).toEqual([
      ["pointerdown", "button"], ["pointermove", "window"], ["pointerup", "window"],
    ]);
    // The press begins on the button's middle; the rest is at the point.
    expect(sent[0]!.init).toMatchObject({ clientX: 116, clientY: 716, buttons: 1, button: 0 });
    expect(sent[1]!.init).toMatchObject({ clientX: 640, clientY: 250, buttons: 1 });
    expect(sent[2]!.init).toMatchObject({ clientX: 640, clientY: 250, buttons: 0, button: 0 });
  });

  it("is one primary pointer of its own, a mouse, in the button's window, so native Canvas takes it for a drag", () => {
    const { sent, button, view } = stage();
    replayNativeDrag(button, { x: 640, y: 250 });
    const pointers = new Set(sent.map((item) => item.init.pointerId));
    expect(pointers.size).toBe(1);
    // Not the id of a real mouse (1) or a finger.
    expect([...pointers][0]).toBeGreaterThan(100);
    for (const item of sent) {
      expect(item.init).toMatchObject({ pointerType: "mouse", isPrimary: true, bubbles: true, cancelable: true, view });
    }
  });

  it("holds Alt and Ctrl while it moves and lets go, so native Canvas does not snap the item off the point", () => {
    const { sent, button } = stage();
    replayNativeDrag(button, { x: 640, y: 250 });
    expect(sent[0]!.init.altKey).toBeUndefined();
    for (const item of sent.slice(1)) expect(item.init).toMatchObject({ altKey: true, ctrlKey: true });
  });

  it("hands every event to the caller before it is sent, to be told from a person's own", () => {
    const { sent, button } = stage();
    const seen: string[] = [];
    replayNativeDrag(button, { x: 640, y: 250 }, (event) => {
      seen.push(`${(event as unknown as { type: string }).type}:${sent.length}`);
    });
    expect(seen).toEqual(["pointerdown:0", "pointermove:1", "pointerup:2"]);
  });

  it("sends nothing from a window that cannot make pointer events", () => {
    const { sent, button } = stage({ pointerEvents: false });
    expect(replayNativeDrag(button, { x: 640, y: 250 })).toBe(false);
    expect(sent).toEqual([]);
  });

  it("sends nothing for a button that is on no window", () => {
    const detached = { ownerDocument: { defaultView: null }, getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }) };
    expect(replayNativeDrag(detached as unknown as HTMLElement, { x: 1, y: 2 })).toBe(false);
  });
});
