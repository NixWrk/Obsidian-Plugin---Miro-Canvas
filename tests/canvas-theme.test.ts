import { describe, expect, it, vi } from "vitest";
import { resolveCanvasTheme, watchCanvasTheme } from "../src/canvas-theme";

class ThemeClasses {
  readonly values = new Set<string>();

  contains(name: string): boolean {
    if (!(this instanceof ThemeClasses)) throw new Error("Class list receiver lost");
    return this.values.has(name);
  }
}

class ThemeMedia {
  matches = false;
  failAdd = false;
  failRemove = false;
  readonly listeners = new Set<() => void>();
  readonly recordedListeners: (() => void)[] = [];
  removes = 0;

  addEventListener(type: string, listener: () => void): void {
    if (!(this instanceof ThemeMedia)) throw new Error("Media receiver lost");
    expect(type).toBe("change");
    this.listeners.add(listener);
    this.recordedListeners.push(listener);
    if (this.failAdd) throw new Error("Partially installed listener");
  }

  removeEventListener(type: string, listener: () => void): void {
    if (!(this instanceof ThemeMedia)) throw new Error("Media receiver lost");
    expect(type).toBe("change");
    this.removes++;
    if (this.failRemove) throw new Error("Window closing");
    this.listeners.delete(listener);
  }

  addListener(listener: () => void): void {
    ThemeMedia.prototype.addEventListener.call(this, "change", listener);
  }

  removeListener(listener: () => void): void {
    ThemeMedia.prototype.removeEventListener.call(this, "change", listener);
  }

  change(dark: boolean): void {
    this.matches = dark;
    for (const listener of this.listeners) listener();
  }
}

class ThemeObserver {
  failObserve = false;
  failDisconnect = false;
  disconnects = 0;
  target: unknown;
  options: MutationObserverInit | undefined;

  constructor(readonly callback: () => void) {}

  observe(target: unknown, options: MutationObserverInit): void {
    if (!(this instanceof ThemeObserver)) throw new Error("Observer receiver lost");
    this.target = target;
    this.options = options;
    if (this.failObserve) throw new Error("Partially installed observer");
  }

  disconnect(): void {
    if (!(this instanceof ThemeObserver)) throw new Error("Observer receiver lost");
    this.disconnects++;
    if (this.failDisconnect) throw new Error("Window closing");
    this.target = undefined;
  }
}

function fixture(theme = "", dark = false) {
  const classes = new ThemeClasses();
  for (const name of theme.split(" ").filter(Boolean)) classes.values.add(name);
  const media = new ThemeMedia();
  media.matches = dark;
  const observers: ThemeObserver[] = [];
  const failures = { constructor: false, observe: false, disconnect: false, matchMedia: false };
  class Observer extends ThemeObserver {
    constructor(callback: () => void) {
      if (failures.constructor) throw new Error("Observer unavailable");
      super(callback);
      this.failObserve = failures.observe;
      this.failDisconnect = failures.disconnect;
      observers.push(this);
    }
  }
  const owner = {
    MutationObserver: Observer,
    matchMedia(query: string) {
      if (this !== owner) throw new Error("Window receiver lost");
      expect(query).toBe("(prefers-color-scheme: dark)");
      if (failures.matchMedia) throw new Error("Media unavailable");
      return media;
    },
  };
  const body = { classList: classes };
  const document = { body, defaultView: owner } as unknown as Document;
  return {
    classes, media, observers, failures, owner, body, document,
    setHost(theme: string) {
      classes.values.clear();
      for (const name of theme.split(" ").filter(Boolean)) classes.values.add(name);
      for (const observer of observers) observer.callback();
    },
  };
}

function unavailable(object: object, name: string): void {
  Object.defineProperty(object, name, { value: undefined, configurable: true });
}

function throwing(object: object, name: string): void {
  Object.defineProperty(object, name, { get() { throw new Error("Unavailable API"); }, configurable: true });
}

describe("resolveCanvasTheme", () => {
  it.each([
    ["theme-light", true, "light"],
    ["theme-dark", false, "dark"],
    ["theme-light", false, "light"],
    ["theme-dark", true, "dark"],
    ["is-tablet", true, "dark"],
    ["", false, "light"],
  ] as const)("uses host %s before OS dark=%s", (host, dark, expected) => {
    expect(resolveCanvasTheme("system", fixture(host, dark).document)).toBe(expected);
  });

  it.each(["light", "dark"] as const)("retains explicit %s despite opposite host and OS", theme => {
    const board = fixture(theme === "light" ? "theme-dark" : "theme-light", theme === "light");
    expect(resolveCanvasTheme(theme, board.document)).toBe(theme);
    throwing(board.document, "body");
    throwing(board.document, "defaultView");
    expect(resolveCanvasTheme(theme, board.document)).toBe(theme);
  });

  it.each([undefined, null, "unknown", {}, 42])("treats unknown %s as System", theme => {
    expect(resolveCanvasTheme(theme, fixture("theme-dark", false).document)).toBe("dark");
  });

  it("does not read OS preference when the host supplies a theme", () => {
    const board = fixture("theme-light", true);
    const match = vi.spyOn(board.owner, "matchMedia");
    expect(resolveCanvasTheme("system", board.document)).toBe("light");
    expect(match).not.toHaveBeenCalled();
  });

  it.each(["missing-window", "missing-media", "throwing-media", "throwing-matches", "throwing-window"])(
    "defaults to light with %s and no host theme", failure => {
      const board = fixture("", true);
      if (failure === "missing-window") unavailable(board.document, "defaultView");
      if (failure === "missing-media") unavailable(board.owner, "matchMedia");
      if (failure === "throwing-media") board.failures.matchMedia = true;
      if (failure === "throwing-matches") throwing(board.media, "matches");
      if (failure === "throwing-window") throwing(board.document, "defaultView");
      expect(resolveCanvasTheme("system", board.document)).toBe("light");
    },
  );

  it("handles a missing document or body, and an unreadable class list", () => {
    expect(resolveCanvasTheme("system", undefined)).toBe("light");
    const board = fixture("", true);
    unavailable(board.document, "body");
    expect(resolveCanvasTheme("system", board.document)).toBe("dark");
    const unreadable = fixture("theme-light", true);
    throwing(unreadable.body, "classList");
    expect(resolveCanvasTheme("system", unreadable.document)).toBe("dark");
  });
});

describe("watchCanvasTheme", () => {
  it("observes only the owner body's class and emits only changed host appearances", () => {
    const board = fixture("theme-light is-tablet", true);
    const callback = vi.fn();
    const dispose = watchCanvasTheme(board.document, callback);
    expect(board.observers).toHaveLength(1);
    expect(board.observers[0].target).toBe(board.body);
    expect(board.observers[0].options).toEqual({ attributes: true, attributeFilter: ["class"] });
    expect(callback).not.toHaveBeenCalled();
    board.setHost("theme-light is-tablet keyboard-open");
    board.media.change(false);
    board.media.change(true);
    expect(callback).not.toHaveBeenCalled();
    board.setHost("theme-dark is-tablet");
    expect(callback).toHaveBeenCalledTimes(1);
    board.setHost("theme-dark keyboard-open");
    board.media.change(false);
    expect(callback).toHaveBeenCalledTimes(1);
    board.setHost("theme-light");
    expect(callback).toHaveBeenCalledTimes(2);
    dispose();
  });

  it("follows OS changes only without a host theme, including host removal and arrival", () => {
    const board = fixture("", false);
    const callback = vi.fn();
    const dispose = watchCanvasTheme(board.document, callback);
    board.media.change(true);
    expect(callback).toHaveBeenCalledTimes(1);
    board.media.change(true);
    board.setHost("theme-dark");
    board.media.change(false);
    expect(callback).toHaveBeenCalledTimes(1);
    board.setHost("");
    expect(callback).toHaveBeenCalledTimes(2);
    board.setHost("theme-light");
    expect(callback).toHaveBeenCalledTimes(2);
    board.media.change(true);
    expect(callback).toHaveBeenCalledTimes(2);
    board.setHost("");
    expect(callback).toHaveBeenCalledTimes(3);
    dispose();
  });

  it.each(["missing", "throwing", "throwing-getter"])("keeps the class watcher when matchMedia is %s", failure => {
    const board = fixture("theme-light", true);
    if (failure === "missing") unavailable(board.owner, "matchMedia");
    if (failure === "throwing") board.failures.matchMedia = true;
    if (failure === "throwing-getter") throwing(board.owner, "matchMedia");
    const callback = vi.fn();
    const dispose = watchCanvasTheme(board.document, callback);
    board.setHost("theme-dark");
    expect(callback).toHaveBeenCalledTimes(1);
    board.setHost("theme-light");
    expect(callback).toHaveBeenCalledTimes(2);
    dispose();
    expect(board.observers[0].disconnects).toBe(1);
  });

  it.each(["missing", "throwing-getter", "throwing-constructor", "throwing-observe", "missing-body"])(
    "keeps the OS watcher with %s observer/body", failure => {
      const board = fixture("", false);
      if (failure === "missing") unavailable(board.owner, "MutationObserver");
      if (failure === "throwing-getter") throwing(board.owner, "MutationObserver");
      if (failure === "throwing-constructor") board.failures.constructor = true;
      if (failure === "throwing-observe") board.failures.observe = true;
      if (failure === "missing-body") unavailable(board.document, "body");
      const callback = vi.fn();
      const dispose = watchCanvasTheme(board.document, callback);
      if (failure === "throwing-observe") {
        expect(board.observers[0].disconnects).toBe(1);
        expect(board.observers[0].target).toBeUndefined();
        board.setHost("theme-dark");
        expect(callback).not.toHaveBeenCalled();
        board.classes.values.clear();
      }
      board.media.change(true);
      expect(callback).toHaveBeenCalledTimes(1);
      dispose();
      expect(board.media.listeners.size).toBe(0);
    },
  );

  it.each(["missing", "throwing-getter", "throwing-add"])("keeps the body watcher with %s media listener APIs", failure => {
    const board = fixture("theme-light", true);
    if (failure === "missing") {
      unavailable(board.media, "addEventListener");
      unavailable(board.media, "addListener");
    }
    if (failure === "throwing-getter") throwing(board.media, "addEventListener");
    if (failure === "throwing-add") board.media.failAdd = true;
    const callback = vi.fn();
    const dispose = watchCanvasTheme(board.document, callback);
    if (failure === "throwing-add") {
      expect(board.media.removes).toBe(1);
      expect(board.media.listeners.size).toBe(0);
    }
    board.setHost("theme-dark");
    expect(callback).toHaveBeenCalledTimes(1);
    dispose();
    expect(board.observers[0].disconnects).toBe(1);
  });

  it("supports paired legacy media APIs with their receiver and removes the listener", () => {
    const board = fixture();
    unavailable(board.media, "addEventListener");
    unavailable(board.media, "removeEventListener");
    const callback = vi.fn();
    const dispose = watchCanvasTheme(board.document, callback);
    board.media.change(true);
    expect(callback).toHaveBeenCalledTimes(1);
    dispose();
    expect(board.media.removes).toBe(1);
    expect(board.media.listeners.size).toBe(0);
  });

  it("disposes once and ignores queued observer/media callbacks after disposal", () => {
    const board = fixture("theme-light", false);
    const callback = vi.fn();
    const dispose = watchCanvasTheme(board.document, callback);
    dispose();
    dispose();
    expect(board.observers[0].disconnects).toBe(1);
    expect(board.media.removes).toBe(1);
    expect(board.media.listeners.size).toBe(0);
    board.setHost("theme-dark");
    board.media.matches = true;
    for (const listener of board.media.recordedListeners) listener();
    expect(callback).not.toHaveBeenCalled();
  });

  it("finishes both cleanup attempts and blocks callbacks when cleanup throws", () => {
    const board = fixture("theme-light", false);
    board.failures.disconnect = true;
    board.media.failRemove = true;
    const callback = vi.fn();
    const dispose = watchCanvasTheme(board.document, callback);
    expect(dispose).not.toThrow();
    dispose();
    expect(board.observers[0].disconnects).toBe(1);
    expect(board.media.removes).toBe(1);
    board.setHost("theme-dark");
    board.media.change(true);
    expect(callback).not.toHaveBeenCalled();
  });

  it("suppresses callbacks from partially installed APIs even if their cleanup throws", () => {
    const board = fixture("theme-light", false);
    board.failures.observe = true;
    board.failures.disconnect = true;
    board.media.failAdd = true;
    board.media.failRemove = true;
    const callback = vi.fn();
    const dispose = watchCanvasTheme(board.document, callback);
    board.setHost("theme-dark");
    board.media.change(true);
    expect(callback).not.toHaveBeenCalled();
    dispose();
    expect(board.observers[0].disconnects).toBe(1);
    expect(board.media.removes).toBe(1);
  });

  it("handles missing and unreadable documents without consulting globals", () => {
    const callback = vi.fn();
    const missing = watchCanvasTheme(undefined, callback);
    expect(missing).not.toThrow();
    const board = fixture("theme-dark", true);
    throwing(board.document, "body");
    throwing(board.document, "defaultView");
    const unreadable = watchCanvasTheme(board.document, callback);
    expect(unreadable).not.toThrow();
    expect(callback).not.toHaveBeenCalled();
  });

  it("uses the supplied document and makes no DOM or settings writes", () => {
    const lightBoard = fixture("theme-light", true);
    const darkBoard = fixture("theme-dark", false);
    Object.freeze(lightBoard.document);
    Object.freeze(lightBoard.body);
    Object.freeze(lightBoard.owner);
    const callback = vi.fn();
    const dispose = watchCanvasTheme(lightBoard.document, callback);
    darkBoard.setHost("theme-light");
    darkBoard.media.change(true);
    expect(callback).not.toHaveBeenCalled();
    expect(resolveCanvasTheme("system", lightBoard.document)).toBe("light");
    expect([...lightBoard.classes.values]).toEqual(["theme-light"]);
    lightBoard.setHost("theme-dark");
    expect(callback).toHaveBeenCalledTimes(1);
    dispose();
  });
});
