import { afterEach, describe, expect, it, vi } from "vitest";

import { BoardSearchBar, type BoardSearchBarHost } from "../src/board-search-bar";
import { setLocale } from "../src/i18n";

class FakeElement {
  public readonly nodeType = 1;
  public readonly children: FakeElement[] = [];
  public readonly attributes = new Map<string, string>();
  public readonly listeners = new Map<string, Array<(event: unknown) => void>>();
  public parentNode: FakeElement | undefined;
  public textContent = "";
  public className = "";
  public type = "";
  public value = "";
  public placeholder = "";
  public disabled = false;
  public hidden = false;
  public focused = false;
  public selected = false;

  public constructor(public readonly tagName: string) {}
  public appendChild(child: FakeElement): FakeElement { child.parentNode = this; this.children.push(child); return child; }
  public removeChild(child: FakeElement): void { this.children.splice(this.children.indexOf(child), 1); child.parentNode = undefined; }
  public remove(): void { this.parentNode?.removeChild(this); }
  public setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
  public getAttribute(name: string): string | null { return this.attributes.get(name) ?? null; }
  public addEventListener(name: string, listener: (event: unknown) => void): void {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener]);
  }
  public removeEventListener(name: string, listener: (event: unknown) => void): void {
    this.listeners.set(name, (this.listeners.get(name) ?? []).filter((item) => item !== listener));
  }
  public focus(): void { this.focused = true; }
  public select(): void { this.selected = true; }
}

class FakeDocument {
  public readonly timers = new Map<number, () => void>();
  private nextTimer = 1;
  public readonly defaultView = {
    setTimeout: (callback: () => void): number => { const id = this.nextTimer++; this.timers.set(id, callback); return id; },
    clearTimeout: (id: number): void => { this.timers.delete(id); },
  };
  public createElement(tagName: string): FakeElement { return new FakeElement(tagName); }
  public runTimers(): void {
    const pending = [...this.timers.values()];
    this.timers.clear();
    for (const callback of pending) callback();
  }
}

function descendants(root: FakeElement): FakeElement[] {
  return [root, ...root.children.flatMap((child) => descendants(child))];
}

function byLabel(root: FakeElement, label: string): FakeElement {
  const found = descendants(root).filter((item) => item.attributes.get("aria-label") === label);
  if (found.length !== 1) throw new Error(`expected one ${label}, found ${found.length}`);
  return found[0]!;
}

function byClass(root: FakeElement, className: string): FakeElement {
  return descendants(root).find((item) => item.className.split(" ").includes(className))!;
}

/** Dispatch a key the way it reaches the bar: bubbling from the element it was pressed in. */
function press(bar: FakeElement, target: FakeElement, key: string, shiftKey = false): { stopped: boolean; prevented: boolean } {
  const record = { stopped: false, prevented: false };
  const event = {
    key, shiftKey, target,
    stopPropagation: () => { record.stopped = true; },
    preventDefault: () => { record.prevented = true; },
  };
  for (const listener of bar.listeners.get("keydown") ?? []) listener(event);
  return record;
}

function type(input: FakeElement, text: string): void {
  input.value = text;
  for (const listener of input.listeners.get("input") ?? []) listener({ target: input });
}

function click(button: FakeElement): void {
  for (const listener of button.listeners.get("click") ?? []) listener({ target: button });
}

function build(delay = 0) {
  const calls: string[] = [];
  const host: BoardSearchBarHost = {
    onQuery: (query) => { calls.push(`query:${query}`); },
    onStep: (direction) => { calls.push(`step:${direction}`); },
    onClose: () => { calls.push("close"); },
    queryDelay: () => delay,
  };
  const document = new FakeDocument();
  const bar = new BoardSearchBar(document as unknown as Document, host);
  const root = bar.element as unknown as FakeElement;
  const input = bar.input as unknown as FakeElement;
  return { bar, root, input, calls, document };
}

afterEach(() => {
  setLocale("en");
  vi.useRealTimers();
});

describe("the board's search bar", () => {
  it("keeps owner-realm element creation detached and ignores the native fallback when a helper exists", () => {
    const doc = new FakeDocument();
    const tags: string[] = [];
    Object.assign(doc.defaultView, {
      createEl(tag: string) {
        expect(this).toBe(doc.defaultView);
        tags.push(tag);
        return new FakeElement(tag);
      },
    });
    doc.createElement = () => { throw new Error("unexpected native fallback"); };
    const bar = new BoardSearchBar(doc as unknown as Document, {
      onQuery: () => {}, onStep: () => {}, onClose: () => {},
    });
    expect(tags).toEqual(["div", "input", "span", "button", "button", "button", "span"]);
    expect((bar.element as unknown as FakeElement).parentNode).toBeUndefined();
    bar.dispose();
  });

  it("debounces and cancels with a captured Node timer pair when the injected document has no complete owner", () => {
    vi.useFakeTimers();
    for (const owner of [null, { setTimeout: () => { throw new Error("partial owner used"); } }]) {
      const doc = new FakeDocument();
      Object.defineProperty(doc, "defaultView", { value: owner });
      const calls: string[] = [];
      const bar = new BoardSearchBar(doc as unknown as Document, {
        onQuery: query => calls.push(query), onStep: () => {}, onClose: () => {}, queryDelay: () => 25,
      });
      type(bar.input as unknown as FakeElement, "first");
      type(bar.input as unknown as FakeElement, "latest");
      vi.advanceTimersByTime(25);
      expect(calls).toEqual(["latest"]);
      type(bar.input as unknown as FakeElement, "cancelled");
      bar.dispose();
      vi.runAllTimers();
      expect(calls).toEqual(["latest"]);
    }
  });

  it("is a panel at the board's top right, hidden until opened, with its field focused on open", () => {
    const { bar, root, input } = build();
    expect(root.className).toBe("miro-canvas-panel miro-canvas-search");
    expect(root.hidden).toBe(true);
    bar.open();
    expect(root.hidden).toBe(false);
    expect(input.focused).toBe(true);
    expect(input.selected).toBe(true);
    expect(byLabel(root, "Previous (Shift+Enter)")).toBeDefined();
    expect(byLabel(root, "Next (Enter)")).toBeDefined();
    expect(byLabel(root, "Close (Escape)")).toBeDefined();
  });

  it("searches as the person types, and steps with Enter, Shift+Enter and the arrow keys", () => {
    const { bar, root, input, calls } = build();
    bar.open();
    type(input, "plan");
    expect(calls).toEqual(["query:plan"]);
    calls.length = 0;
    press(root, input, "Enter");
    press(root, input, "Enter", true);
    press(root, input, "ArrowDown");
    press(root, input, "ArrowUp");
    expect(calls).toEqual(["step:1", "step:-1", "step:1", "step:-1"]);
    calls.length = 0;
    click(byLabel(root, "Next (Enter)"));
    click(byLabel(root, "Previous (Shift+Enter)"));
    expect(calls).toEqual(["step:1", "step:-1"]);
  });

  it("keeps every key to itself so native Canvas never sees the typing", () => {
    const { bar, root, input } = build();
    bar.open();
    expect(press(root, input, "v").stopped).toBe(true);
    expect(press(root, input, "Delete").stopped).toBe(true);
    expect(press(root, input, "v").prevented).toBe(false);
  });

  it("closes on Escape, from the field or a button", () => {
    const { bar, root, input, calls } = build();
    bar.open();
    expect(press(root, input, "Escape").prevented).toBe(true);
    press(root, byLabel(root, "Next (Enter)"), "Escape");
    click(byLabel(root, "Close (Escape)"));
    expect(calls).toEqual(["close", "close", "close"]);
    bar.close();
    expect(root.hidden).toBe(true);
  });

  it("waits for a pause on a large board, and Enter searches at once instead of skipping", () => {
    const { bar, root, input, calls, document } = build(120);
    bar.open();
    type(input, "p");
    type(input, "pl");
    expect(calls).toEqual([]);
    document.runTimers();
    expect(calls).toEqual(["query:pl"]);
    calls.length = 0;
    type(input, "pla");
    press(root, input, "Enter");
    expect(calls).toEqual(["query:pla"]);
    document.runTimers();
    expect(calls).toEqual(["query:pla"]);
  });

  it("shows the match's place, says when nothing is found, and names the match's kind", () => {
    const { bar, root, input } = build();
    const counter = byClass(root, "miro-canvas-search__count");
    const live = byClass(root, "miro-canvas-search__live");
    bar.open();
    expect(counter.textContent).toBe("");
    type(input, "plan");
    bar.showResult({ current: 2, total: 12, kind: "sticky" });
    expect(counter.textContent).toBe("3 / 12");
    expect(live.textContent).toBe("Sticky note, 3 of 12");
    expect(live.getAttribute("aria-live")).toBe("polite");
    expect(byLabel(root, "Next (Enter)").disabled).toBe(false);
    bar.showResult({ current: -1, total: 0 });
    expect(counter.textContent).toBe("No results");
    expect(root.getAttribute("data-search-state")).toBe("none");
    expect(byLabel(root, "Next (Enter)").disabled).toBe(true);
  });

  it("speaks Russian when the interface does", () => {
    setLocale("ru");
    const { bar, root, input } = build();
    bar.open();
    expect(input.placeholder).toBe("Искать на доске");
    type(input, "план");
    bar.showResult({ current: -1, total: 0 });
    expect(byClass(root, "miro-canvas-search__count").textContent).toBe("Ничего не найдено");
    bar.showResult({ current: 0, total: 2, kind: "frame" });
    expect(byClass(root, "miro-canvas-search__live").textContent).toBe("Фрейм, 1 из 2");
  });

  it("removes itself and its listeners on dispose", () => {
    const { bar, root, input } = build();
    const parent = new FakeElement("div");
    parent.appendChild(root);
    bar.dispose();
    expect(parent.children).toEqual([]);
    expect(input.listeners.get("input")).toEqual([]);
  });
});
