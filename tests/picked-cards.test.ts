import { describe, expect, it } from "vitest";

import { PICKED_ATTRIBUTE, PickedCardMarks, type BoardElement, type BoardWatch, type BoardWatcher, type CardChange, type WatchOptions } from "../src/picked-cards";

// A card as native Canvas keeps it: a `canvas-node` element whose classes say
// whether it is picked (is-focused alone, is-selected among several) and
// whether its editor is open (is-editing, with a frame inside for the editor).
class FakeCard {
  public readonly nodeType = 1;
  public readonly attributes = new Map<string, string>();
  public readonly frames: string[] = [];
  public frameLookups = 0;
  private readonly classes = new Set<string>(["canvas-node"]);
  public readonly classList = { contains: (name: string): boolean => this.classes.has(name) };

  public setClass(name: string, on: boolean): void {
    if (on) this.classes.add(name);
    else this.classes.delete(name);
  }

  public setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  public removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  public querySelector(selectors: string): unknown {
    this.frameLookups += 1;
    const wanted = selectors.split(",").map((selector) => selector.trim());
    return this.frames.some((tag) => wanted.includes(tag)) ? {} : null;
  }

  public get marked(): boolean {
    return this.attributes.has(PICKED_ATTRIBUTE);
  }
}

class FakeBoard implements BoardElement {
  public readonly cards: FakeCard[] = [];

  public add(card: FakeCard): FakeCard {
    this.cards.push(card);
    return card;
  }

  public querySelectorAll(): FakeCard[] {
    return this.cards.filter((card) => card.classList.contains("is-focused") || card.classList.contains("is-selected"));
  }
}

/** The watches the marks ask of a board, which a test feeds by hand the way a MutationObserver would. */
function watching() {
  const requests: { readonly options: WatchOptions; readonly onChange: (changes: readonly CardChange[]) => void; disconnected: boolean }[] = [];
  const watcher: BoardWatcher = (_board, options, onChange): BoardWatch => {
    const request = { options, onChange, disconnected: false };
    requests.push(request);
    return { disconnect: () => { request.disconnected = true; } };
  };
  const named = (kind: "classes" | "children") => requests.filter((request) => (kind === "classes" ? request.options.attributes === true : request.options.childList === true));
  return {
    watcher,
    requests,
    /** A card's classes changed: what the observer of class attributes reports. */
    changed(...cards: FakeCard[]): void {
      const latest = named("classes").at(-1)!;
      latest.onChange(cards.map((card) => ({ type: "attributes", target: card })));
    },
    /** Cards put back on the board by native Canvas, which keeps them off the page while they lie out of view. */
    attached(board: FakeBoard, ...cards: FakeCard[]): void {
      const latest = named("children").at(-1)!;
      latest.onChange([{ type: "childList", target: board, addedNodes: cards }]);
    },
  };
}

function boardOf(...cards: FakeCard[]) {
  const board = new FakeBoard();
  for (const card of cards) board.add(card);
  const host = watching();
  const marks = new PickedCardMarks(host.watcher);
  marks.watch(board);
  return { board, host, marks };
}

function pick(card: FakeCard, how: "is-focused" | "is-selected" = "is-focused"): void {
  card.setClass(how, true);
}

function letGo(card: FakeCard): void {
  card.setClass("is-focused", false);
  card.setClass("is-selected", false);
}

describe("PickedCardMarks", () => {
  it("marks a card when it is picked and takes the mark back when it is let go", () => {
    const card = new FakeCard();
    const { host } = boardOf(card);
    expect(card.marked).toBe(false);
    pick(card);
    host.changed(card);
    expect(card.marked).toBe(true);
    letGo(card);
    host.changed(card);
    expect(card.marked).toBe(false);
  });

  it("marks the cards of a selection of several, and only the ones still picked after one is let go", () => {
    const cards = [new FakeCard(), new FakeCard(), new FakeCard()];
    const { host } = boardOf(...cards);
    for (const card of cards) pick(card, "is-selected");
    host.changed(...cards);
    expect(cards.map((card) => card.marked)).toEqual([true, true, true]);
    letGo(cards[1]!);
    host.changed(cards[1]!);
    expect(cards.map((card) => card.marked)).toEqual([true, false, true]);
  });

  it("leaves a card alone that is not picked", () => {
    const card = new FakeCard();
    const other = new FakeCard();
    const { host } = boardOf(card, other);
    pick(other);
    // Its class changed, but not to a picked one (the plugin's own classes come and go on cards too).
    card.setClass("miro-canvas-layer-shown", true);
    host.changed(card, other);
    expect(card.marked).toBe(false);
    expect(other.marked).toBe(true);
  });

  it("takes the mark off a card whose editor opens and puts it back when the editor closes", () => {
    const card = new FakeCard();
    const { host } = boardOf(card);
    pick(card);
    host.changed(card);
    expect(card.marked).toBe(true);
    // The editor is a frame in the card while it is open.
    card.setClass("is-editing", true);
    card.frames.push("iframe");
    host.changed(card);
    expect(card.marked).toBe(false);
    card.setClass("is-editing", false);
    card.frames.length = 0;
    host.changed(card);
    expect(card.marked).toBe(true);
  });

  it("does not mark a card that shows a web page or another frame, and marks it once the frame is gone", () => {
    const page = new FakeCard();
    const viewer = new FakeCard();
    const { host } = boardOf(page, viewer);
    page.frames.push("iframe");
    viewer.frames.push("webview");
    pick(page);
    pick(viewer);
    host.changed(page, viewer);
    expect(page.marked).toBe(false);
    expect(viewer.marked).toBe(false);
    page.frames.length = 0;
    host.changed(page);
    expect(page.marked).toBe(true);
    expect(viewer.marked).toBe(false);
  });

  it("looks for a frame once for each time a card is picked, not whenever it changes", () => {
    const card = new FakeCard();
    const { host } = boardOf(card);
    pick(card);
    host.changed(card);
    expect(card.frameLookups).toBe(1);
    // A drag writes the card's classes again and again; it is marked already.
    host.changed(card);
    host.changed(card);
    expect(card.frameLookups).toBe(1);
    letGo(card);
    host.changed(card);
    expect(card.frameLookups).toBe(1);
    pick(card);
    host.changed(card);
    expect(card.frameLookups).toBe(2);
  });

  it("marks the cards that are picked already when it starts watching", () => {
    const picked = new FakeCard();
    const plain = new FakeCard();
    pick(picked, "is-selected");
    const { marks } = boardOf(picked, plain);
    expect(picked.marked).toBe(true);
    expect(plain.marked).toBe(false);
    marks.dispose();
  });

  it("looks again at a card native Canvas puts back on the board", () => {
    const cards = [new FakeCard(), new FakeCard()];
    const { board, host } = boardOf(cards[0]!, cards[1]!);
    // Picked while lying out of view: no class change reached the watch.
    pick(cards[0]!, "is-selected");
    host.attached(board, cards[0]!);
    expect(cards[0]!.marked).toBe(true);
    // Marked, then let go out of view, and put back: the mark goes.
    pick(cards[1]!);
    host.changed(cards[1]!);
    letGo(cards[1]!);
    host.attached(board, cards[1]!);
    expect(cards[1]!.marked).toBe(false);
  });

  it("ignores what is not a card", () => {
    const card = new FakeCard();
    const { host } = boardOf(card);
    pick(card);
    const text = { nodeType: 1, classList: { contains: () => false } };
    host.changed(text as unknown as FakeCard);
    host.attached(new FakeBoard(), text as unknown as FakeCard);
    expect(card.marked).toBe(false);
  });

  it("takes every mark back and stops watching when it is let go", () => {
    const cards = [new FakeCard(), new FakeCard()];
    const { host, marks } = boardOf(...cards);
    for (const card of cards) pick(card);
    host.changed(...cards);
    expect(cards.every((card) => card.marked)).toBe(true);
    marks.dispose();
    expect(cards.some((card) => card.marked)).toBe(false);
    expect(host.requests.every((request) => request.disconnected)).toBe(true);
  });

  it("moves to a new board, leaving no mark on the old one", () => {
    const first = new FakeCard();
    const second = new FakeCard();
    const oldBoard = new FakeBoard();
    oldBoard.add(first);
    const host = watching();
    const marks = new PickedCardMarks(host.watcher);
    marks.watch(oldBoard);
    pick(first);
    host.changed(first);
    expect(first.marked).toBe(true);
    const newBoard = new FakeBoard();
    newBoard.add(second);
    pick(second);
    marks.watch(newBoard);
    expect(first.marked).toBe(false);
    expect(second.marked).toBe(true);
    // The old board's watches are disconnected; the same board again starts nothing new.
    expect(host.requests.slice(0, 2).every((request) => request.disconnected)).toBe(true);
    const count = host.requests.length;
    marks.watch(newBoard);
    expect(host.requests.length).toBe(count);
  });

  it("marks nothing where the window cannot watch the board", () => {
    const card = new FakeCard();
    pick(card);
    const board = new FakeBoard();
    board.add(card);
    const marks = new PickedCardMarks(() => undefined);
    marks.watch(board);
    expect(card.marked).toBe(false);
  });

  it("lets go of a watch that started when the other could not", () => {
    const board = new FakeBoard();
    const made: { disconnected: boolean }[] = [];
    const marks = new PickedCardMarks((_board, options) => {
      // Only the watch of classes can be made.
      if (options.attributes !== true) return undefined;
      const watch = { disconnected: false };
      made.push(watch);
      return { disconnect: () => { watch.disconnected = true; } };
    });
    marks.watch(board);
    expect(made).toHaveLength(1);
    expect(made[0]!.disconnected).toBe(true);
  });
});
