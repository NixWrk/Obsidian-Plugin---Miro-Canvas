/**
 * Which cards a finger or a pen may drag by their text, told to the styles.
 *
 * On a touch screen a move that starts on a picked card's text is taken by the
 * browser for a scroll of the card's own text, which calls the pointer back,
 * so the session could never drag the card (`attachSelectionDrag`).  The
 * styles keep such a move on the page, but only for the cards that are picked:
 * a rule that found them by itself, by asking of every element of every card
 * whether its card is picked and holds no frame, made each move of any drag on
 * a large board cost a good deal more.  So the board is watched instead, and
 * the few picked cards carry a mark the styles read at once.
 */

/** What a picked card carries, for the styles to read. */
export const PICKED_ATTRIBUTE = "data-miro-canvas-picked";

/**
 * A card that shows a web page or another frame keeps its own touch handling:
 * what happens inside a frame never reaches the board, and its page must stay
 * scrollable.
 */
const FRAME_SELECTOR = "iframe, webview";

/** The part of an element's card the marks read and write. */
export interface CardElement {
  readonly classList: { contains(name: string): boolean };
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  querySelector(selectors: string): unknown;
}

/** The board's own element, which holds the cards. */
export interface BoardElement {
  querySelectorAll(selectors: string): ArrayLike<CardElement>;
}

/** What a mutation of the board tells: a card's class changed, or cards were put on the board. */
export interface CardChange {
  readonly type: string;
  readonly target: unknown;
  readonly addedNodes?: ArrayLike<unknown>;
}

/** What to watch for on the board; the names are those of a MutationObserver's options. */
export interface WatchOptions {
  readonly attributes?: boolean;
  readonly attributeFilter?: string[];
  readonly childList?: boolean;
  readonly subtree?: boolean;
}

/** One watch on the board, which can be let go. */
export interface BoardWatch {
  disconnect(): void;
}

/** Starts reporting the changes `options` names on the board to `onChange`, or does nothing where the window has no way to. */
export type BoardWatcher = (board: BoardElement, options: WatchOptions, onChange: (changes: readonly CardChange[]) => void) => BoardWatch | undefined;

function asCard(value: unknown): CardElement | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const element = value as Partial<CardElement> & { readonly nodeType?: unknown };
  if (element.nodeType !== 1 || typeof element.classList?.contains !== "function") return undefined;
  return element.classList.contains("canvas-node") ? (value as CardElement) : undefined;
}

/** Whether the card is one the person picked: alone (focused) or with others (selected). */
function isPicked(card: CardElement): boolean {
  return card.classList.contains("is-focused") || card.classList.contains("is-selected");
}

/**
 * Marks each card that is picked, is not being written in and holds no frame,
 * and takes the mark back when it stops being so.
 *
 * Native Canvas puts the classes on a card itself, so a change of them is what
 * is watched: a card picked or let go, a card entering or leaving its editor.
 * A card native Canvas takes off the page while it lies out of view keeps its
 * classes, and is looked at again when it is put back.  The frame is looked
 * for when a card is first marked, not on every change after that: a card
 * keeps its page from the time it is made, and the editor's frame comes and
 * goes with the editing class.
 */
export class PickedCardMarks {
  private readonly marked = new Set<CardElement>();
  private watches: BoardWatch[] = [];
  private board: BoardElement | undefined;

  public constructor(private readonly watchBoard: BoardWatcher) {}

  /** Follows this board's cards, and marks the ones picked already; the board it followed before is let go. */
  public watch(board: BoardElement): void {
    if (board === this.board) return;
    this.release();
    this.board = board;
    // Two watches: a card's classes change anywhere below the board's own
    // element, while the cards themselves are its direct children.
    const classes = this.watchBoard(board, { attributes: true, attributeFilter: ["class"], subtree: true }, (changes) => this.follow(changes));
    const children = this.watchBoard(board, { childList: true }, (changes) => this.follow(changes));
    if (classes === undefined || children === undefined) {
      classes?.disconnect();
      children?.disconnect();
      return;
    }
    this.watches = [classes, children];
    for (const card of Array.from(board.querySelectorAll(".canvas-node.is-focused, .canvas-node.is-selected"))) {
      this.settle(card);
    }
  }

  /** Stops following the board and takes every mark back. */
  public dispose(): void {
    this.release();
  }

  private release(): void {
    for (const watch of this.watches) watch.disconnect();
    this.watches = [];
    this.board = undefined;
    for (const card of this.marked) card.removeAttribute(PICKED_ATTRIBUTE);
    this.marked.clear();
  }

  /** Looks once at each card a batch of changes names. */
  private follow(changes: readonly CardChange[]): void {
    const cards = new Set<CardElement>();
    for (const change of changes) {
      if (change.type === "childList") {
        for (const added of Array.from(change.addedNodes ?? [])) {
          const card = asCard(added);
          if (card !== undefined) cards.add(card);
        }
        continue;
      }
      const card = asCard(change.target);
      if (card !== undefined) cards.add(card);
    }
    for (const card of cards) this.settle(card);
  }

  /** Puts the card's mark right; the frame is looked for once, when the card is first marked. */
  private settle(card: CardElement): void {
    const marked = this.marked.has(card);
    const wanted = isPicked(card) && !card.classList.contains("is-editing");
    if (!wanted) {
      if (marked) this.unmark(card);
      return;
    }
    if (marked || card.querySelector(FRAME_SELECTOR) !== null) return;
    card.setAttribute(PICKED_ATTRIBUTE, "");
    this.marked.add(card);
  }

  private unmark(card: CardElement): void {
    card.removeAttribute(PICKED_ATTRIBUTE);
    this.marked.delete(card);
  }
}
