import { describe, expect, it, vi } from "vitest";
import { M1CanvasSession } from "../src/m1-session";
import { words } from "../src/i18n";

function session(review = false, native = false, active = false): M1CanvasSession {
  const value = Object.create(M1CanvasSession.prototype) as M1CanvasSession;
  Reflect.set(value, "appearance", { settings: { reviewMode: review } });
  Reflect.set(value, "readonlyOriginal", native);
  Reflect.set(value, "slideShow", { active });
  return value;
}

describe("viewing admission", () => {
  it("retains native readonly ownership and makes presentation temporarily read-only", () => {
    expect(session(false, true).isViewing()).toBe(true);
    expect(session(true).isViewing()).toBe(true);
    const value = session(false, false, true);
    const settings = Reflect.get(value, "appearance").settings;
    expect(value.isViewing()).toBe(true);
    Reflect.get(value, "slideShow").active = false;
    expect(value.isViewing()).toBe(false);
    expect(settings.reviewMode).toBe(false);
  });

  it("starts native frames in document order without writing or cancelling a detached export", () => {
    const value = session();
    const data = { nodes: [{ id: "b", type: "group" }, { id: "note", type: "text" }, { id: "a", type: "group" }], future: true };
    const start = vi.fn(() => true);
    const close = vi.fn();
    for (const [name, item] of Object.entries({ disposed: false, root: {}, currentRawDocument: data, presentationRects: new Map(), options: {}, ensureSlideShow: () => ({ start }), closeExport: close, callNative: vi.fn() })) Reflect.set(value, name, item);
    value.startPresentation();
    expect(start).toHaveBeenCalledExactlyOnceWith(["b", "a"]);
    expect(close).toHaveBeenCalledExactlyOnceWith(false);
    expect(data).toEqual({ nodes: [{ id: "b", type: "group" }, { id: "note", type: "text" }, { id: "a", type: "group" }], future: true });
  });

  it("uses export pages when there are no frames and explains an empty board", () => {
    const value = session();
    const pages = [{ id: "p", x: 10, y: 20, width: 300, height: 200 }];
    const start = vi.fn(() => true);
    const notice = vi.fn();
    const rects = new Map();
    for (const [name, item] of Object.entries({ disposed: false, root: {}, currentRawDocument: { nodes: [], miroCanvas: { export: { format: "free", pages } } }, presentationRects: rects, options: { onNotice: notice }, ensureSlideShow: () => ({ start }), closeExport: vi.fn(), callNative: vi.fn() })) Reflect.set(value, name, item);
    value.startPresentation();
    expect(start).toHaveBeenCalledExactlyOnceWith(["export:p"]);
    expect(rects.get("export:p")).toMatchObject(pages[0]);
    Reflect.set(value, "currentRawDocument", { nodes: [] });
    start.mockReturnValue(false);
    value.startPresentation();
    expect(rects.size).toBe(0);
    expect(notice).toHaveBeenCalledWith(words().slideShow.noSlides);
  });
});
