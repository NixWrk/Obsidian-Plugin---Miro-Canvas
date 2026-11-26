import { createHtmlElement } from "./dom-elements";
/**
 * A comment thread the way Miro opens it beside its pin: a tick that
 * resolves it, each message under its author's initial, name and time, and
 * a reply field.
 * Only local threads take replies or change state; imported Miro threads are
 * retain their exported evidence, with optional display author aliases.
 * The host owns persistence and placement.
 */
import { commentAuthorLabel, type CommentOrigin, type CommentThread } from "./local-comments";
import { words } from "./i18n";
import { TOOLTIP_DELAY } from "./tooltips";

export interface ThreadMessage {
  readonly id: string;
  readonly author: string;
  readonly text: string;
  readonly createdAt?: string;
  readonly replyTo?: string;
}

const AVATAR_COLORS = ["#7b2fbe", "#2f5fd0", "#138a5b", "#d9601a", "#c6334a", "#11808f", "#8c4bd6", "#5b6472"] as const;

/**
 * Whether an exported Miro thread lists its opening message among its
 * messages; it then has no text of its own apart from that message's, and
 * showing both would show the comment twice.
 */
export function openingIsListed(thread: CommentThread): boolean {
  const first = thread.replies[0];
  return thread.origin === "imported" && first !== undefined && first.text === thread.text
    && (thread.createdAt === undefined || !first.createdAt || first.createdAt === thread.createdAt);
}

/** Every message of a thread in reading order, the opening one first. */
export function threadMessages(thread: CommentThread): readonly ThreadMessage[] {
  const listed = openingIsListed(thread);
  const opening: ThreadMessage[] = listed
    ? []
    : [{ id: thread.id, author: commentAuthorLabel(thread), text: thread.text,
      ...(thread.createdAt === undefined ? {} : { createdAt: thread.createdAt }) }];
  return [
    ...opening,
    ...thread.replies.map((reply) => ({
      id: reply.id, author: commentAuthorLabel(reply), text: reply.text,
      ...(reply.createdAt ? { createdAt: reply.createdAt } : {}),
      ...(typeof reply.replyTo === "string" ? { replyTo: reply.replyTo } : {}),
    })),
  ];
}

/** The letter Miro shows in an author's avatar. */
export function authorInitial(name: string): string {
  const letter = [...name.trim()][0];
  return letter === undefined ? "?" : letter.toLocaleUpperCase();
}

/** The colours chosen for authors in the settings, which win over the ones made up for them. */
let chosenColors: Readonly<Record<string, string>> = {};

/** Colour authors as the settings say; anyone not named keeps a colour made up from the name. */
export function setAuthorColors(colors: Readonly<Record<string, string>>): void {
  chosenColors = colors;
}

/** A stable avatar colour per author: the one chosen for them, or one made up from the name. */
export function authorColor(name: string): string {
  const chosen = chosenColors[name];
  if (chosen !== undefined) return chosen;
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

/** Miro's short stamp, such as "11 Jun, 14:25"; nothing for an unreadable time. */
export function shortTime(value: string | undefined, locale?: string): string {
  if (value === undefined) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const day = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(date);
  const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(date);
  return `${day}, ${time}`;
}

export interface CommentThreadCardHost {
  readonly onHideImported?: (threadId: string) => void;
  readonly onReply: (threadId: string, text: string, authorName?: string, replyTo?: string) => void;
  /** Rename a display author; a listed imported opening uses its first reply ID. */
  readonly onRenameAuthor?: (threadId: string, messageId: string, name: string, origin?: CommentOrigin) => void;
  readonly onDeleteReply?: (threadId: string, replyId: string) => void;
  readonly onAppearance?: (threadId: string, origin: CommentOrigin, patch: {color?: string; locked?: boolean}) => void;
  /** Lightweight pin preview; picker input events must not persist the Canvas. */
  readonly onPreviewColor?: (threadId: string, origin: CommentOrigin, color?: string) => void;
  readonly onResolve: (threadId: string, resolved: boolean) => void;
  /** Deletes an editable local thread. Imported Miro evidence is never deleted. */
  readonly onDelete: (threadId: string) => void;
  /** Opens the thread in the full comments panel. */
  readonly onOpenPanel: (threadId: string, origin: CommentOrigin) => void;
  readonly onClose: () => void;
  /** Starts a thread from the text written in a new comment. */
  readonly onCreate?: (text: string, authorName?: string, appearance?: {color: string; locked: boolean}) => void;
  readonly setIcon?: (element: HTMLElement, icon: string) => void;
}

export interface CommentThreadCardOptions {
  /** False in review mode: the thread is shown but not changed. */
  readonly editable: boolean;
  readonly locale?: string;
  readonly authorName?: string;
}

interface CardPoint {
  readonly x: number;
  readonly y: number;
}

interface CardArea {
  readonly width: number;
  readonly height: number;
}

export class CommentThreadCard {
  public readonly element: HTMLElement;
  private thread: CommentThread | undefined;
  private readonly toggle: HTMLButtonElement;
  private readonly helpButton: HTMLButtonElement;
  private readonly help: HTMLElement;
  private readonly list: HTMLElement;
  private readonly composer: HTMLElement;
  private readonly input: HTMLTextAreaElement;
  private readonly authorInput: HTMLInputElement;
  private focusedAuthor: HTMLInputElement | undefined;
  private messageGeneration = 0;
  private messageSignature: string | undefined;
  private readonly send: HTMLButtonElement;
  private readonly note: HTMLElement;
  private readonly panelButton: HTMLButtonElement;
  private readonly deleteButton: HTMLButtonElement;
  private readonly hideImportedButton: HTMLButtonElement;
  private readonly colorInput: HTMLInputElement;
  private readonly lockButton: HTMLButtonElement;
  private composing = false;
  private placement: { readonly point: CardPoint; readonly area: CardArea } | undefined;
  private readonly replyTarget: HTMLElement;
  private readonly replyTargetLabel: HTMLElement;
  private readonly replyTargetText: HTMLElement;
  private replyTargetId: string | undefined;
  private showNewestMessage = false;
  private composingLocked = false;

  public constructor(private readonly document: Document, private readonly host: CommentThreadCardHost) {
    const card = this.make("div", "miro-canvas-thread");
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", words().comments.thread.ariaLabel);
    card.hidden = true;

    const header = card.appendChild(this.make("div", "miro-canvas-thread__header"));
    // Resolving is a tick that presses in and out, with no caption: the long
    // Russian one squeezed the icons beside it. A "?" explains it instead.
    this.toggle = header.appendChild(this.button(
      words().comments.thread.resolve, "miro-canvas-thread__icon miro-canvas-thread__resolve", "check", "✓"));
    this.toggle.setAttribute("aria-pressed", "false");
    this.toggle.addEventListener("click", () => {
      if (!this.toggle.disabled && this.thread?.origin === "local") this.host.onResolve(this.thread.id, !this.thread.resolved);
    });
    // A hover shows the explanation as the button's tooltip. A touch screen
    // has no hover, so a press shows it under the header as well.
    this.helpButton = header.appendChild(this.button(
      words().comments.thread.resolveHelp, "miro-canvas-thread__icon miro-canvas-thread__help-button", "circle-help", "?"));
    this.helpButton.setAttribute("aria-expanded", "false");
    this.helpButton.addEventListener("click", () => this.showHelp(this.help.hidden));
    header.appendChild(this.make("span", "miro-canvas-thread__spacer"));
    this.colorInput = header.appendChild(this.make("input", "miro-canvas-thread__color"));
    this.colorInput.type = "color";
    this.colorInput.setAttribute("aria-label", words().comments.thread.color);
    const saveColor = () => {
      if (this.colorInput.disabled) return;
      if (this.thread && this.thread.color !== this.colorInput.value) {
        this.host.onAppearance?.(this.thread.id, this.thread.origin, {color: this.colorInput.value});
      }
      if (this.thread) this.host.onPreviewColor?.(this.thread.id, this.thread.origin);
    };
    // Native colour pickers emit many input events while the pointer moves.
    // Persist only the chosen value, or closing the picker would rewrite the
    // whole Canvas and show a notice for every pixel of pointer travel.
    this.colorInput.addEventListener("input", () => {
      if (this.thread && !this.colorInput.disabled) this.host.onPreviewColor?.(this.thread.id, this.thread.origin, this.colorInput.value);
    });
    this.colorInput.addEventListener("change", saveColor);
    this.colorInput.addEventListener("blur", saveColor);
    this.lockButton = header.appendChild(this.button(words().comments.thread.lock, "miro-canvas-thread__icon", "lock", "🔒"));
    this.lockButton.addEventListener("click", () => {
      if (this.lockButton.disabled) return;
      if (this.composing) {
        this.composingLocked = !this.composingLocked;
        this.lockButton.setAttribute("aria-pressed", this.composingLocked ? "true" : "false");
        this.lockButton.setAttribute("aria-label", this.composingLocked ? words().comments.thread.unlock : words().comments.thread.lock);
        this.element.setAttribute("data-comment-locked", this.composingLocked ? "true" : "false");
      } else if (this.thread) this.host.onAppearance?.(this.thread.id, this.thread.origin, {locked: this.thread.locked !== true});
    });
    const panel = header.appendChild(this.button(words().comments.thread.openPanel, "miro-canvas-thread__icon", "more-vertical", "⋮"));
    this.panelButton = panel;
    panel.addEventListener("click", () => {
      if (this.thread !== undefined) this.host.onOpenPanel(this.thread.id, this.thread.origin);
    });
    this.deleteButton = header.appendChild(this.button(words().comments.thread.delete, "miro-canvas-thread__icon", "trash-2", "×"));
    this.deleteButton.addEventListener("click", () => {
      if (this.thread?.origin === "local" && this.thread.locked !== true && !this.deleteButton.disabled) this.host.onDelete(this.thread.id);
    });
    this.hideImportedButton = header.appendChild(this.button(words().comments.thread.removeImported, "miro-canvas-thread__icon", "trash-2", "×"));
    this.hideImportedButton.addEventListener("click", () => {
      if (!this.hideImportedButton.disabled && this.thread?.origin === "imported") this.host.onHideImported?.(this.thread.id);
    });
    const close = header.appendChild(this.button(words().comments.thread.close, "miro-canvas-thread__icon", "x", "×"));
    close.addEventListener("click", () => this.host.onClose());

    this.help = card.appendChild(this.make("p", "miro-canvas-thread__help", words().comments.thread.resolveHelp));
    this.help.setAttribute("role", "note");
    this.help.hidden = true;
    this.list = card.appendChild(this.make("div", "miro-canvas-thread__messages"));
    this.note = card.appendChild(this.make("p", "miro-canvas-thread__note"));
    this.composer = card.appendChild(this.make("form", "miro-canvas-thread__composer"));
    this.authorInput = this.composer.appendChild(this.make("input", "miro-canvas-thread__author-input"));
    this.authorInput.type = "text";
    this.authorInput.placeholder = words().comments.thread.authorName;
    this.authorInput.setAttribute("aria-label", words().comments.thread.authorName);
    this.replyTarget = this.composer.appendChild(this.make("div", "miro-canvas-thread__reply-target"));
    const replyTargetWords = this.replyTarget.appendChild(this.make("div", "miro-canvas-thread__reply-target-words"));
    this.replyTargetLabel = replyTargetWords.appendChild(this.make("div", "miro-canvas-thread__quote-author"));
    this.replyTargetText = replyTargetWords.appendChild(this.make("div", "miro-canvas-thread__quote-text"));
    this.replyTarget.appendChild(this.button(words().comments.thread.cancelReplyTo, "miro-canvas-thread__icon", "x", "×"))
      .addEventListener("click", () => {
        this.chooseReplyTarget(undefined);
        this.input.focus?.();
      });
    this.replyTarget.hidden = true;
    this.input = this.composer.appendChild(this.make("textarea", "miro-canvas-thread__input"));
    this.input.rows = 1;
    this.input.placeholder = words().comments.thread.replyPlaceholder;
    this.input.setAttribute("aria-label", words().comments.thread.replyAriaLabel);
    this.send = this.composer.appendChild(this.button(words().comments.thread.sendReply, "miro-canvas-thread__icon miro-canvas-thread__send", "send", "➤"));
    this.send.type = "submit";
    this.composer.addEventListener("submit", (event) => {
      event.preventDefault();
      this.sendDraft();
    });
    // Enter sends and Shift+Enter breaks the line. An Enter that picks a word
    // in an input method belongs to the input method.
    this.input.addEventListener("keydown", (event) => {
      // Escape first lets go of the chosen message; the next one closes the card.
      if (event.key === "Escape" && this.replyTargetId !== undefined) {
        event.stopPropagation();
        this.chooseReplyTarget(undefined);
        return;
      }
      if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
      event.preventDefault();
      this.sendDraft();
    });
    // The field grows with its text, so a card near the board's edge moves to stay inside.
    this.input.addEventListener("input", () => this.replace());
    // The board must not start a drag, select or take the keys typed here.
    for (const type of ["pointerdown", "mousedown", "dblclick", "wheel", "keydown", "keyup"]) {
      card.addEventListener(type, (event) => {
        if (type === "keydown" && (event as KeyboardEvent).key === "Escape") this.host.onClose();
        event.stopPropagation();
      });
    }
    this.element = card;
  }

  public get threadId(): string | undefined {
    return this.element.hidden ? undefined : this.thread?.id;
  }

  /** A new comment with an optional default author, editable before posting. */
  public compose(authorName = ""): void {
    this.composingLocked = false;
    this.lockButton.setAttribute("aria-pressed", "false");
    this.lockButton.setAttribute("aria-label", words().comments.thread.lock);
    this.element.setAttribute("data-comment-locked", "false");
    this.colorInput.value = authorColor(authorName || "Local user");
    this.colorInput.hidden = this.host.onAppearance === undefined;
    this.lockButton.hidden = this.host.onAppearance === undefined;
    this.focusedAuthor = undefined;
    this.messageGeneration += 1;
    this.messageSignature = undefined;
    this.authorInput.value = authorName;
    this.composing = true;
    this.thread = undefined;
    this.element.hidden = false;
    this.element.setAttribute("data-comment-state", "new");
    this.toggle.hidden = true;
    this.helpButton.hidden = true;
    this.showHelp(false);
    this.panelButton.hidden = true;
    this.deleteButton.hidden = true;
    this.hideImportedButton.hidden = true;
    this.note.hidden = true;
    this.composer.hidden = false;
    this.input.placeholder = words().comments.thread.addCommentPlaceholder;
    this.input.value = "";
    this.chooseReplyTarget(undefined);
    while (this.list.firstChild !== null) this.list.removeChild(this.list.firstChild);
    this.list.hidden = true;
    this.input.focus?.();
  }

  public get composingComment(): boolean {
    return this.composing && !this.element.hidden;
  }

  public show(thread: CommentThread, options: CommentThreadCardOptions): void {
    const changed = this.thread?.id !== thread.id || this.thread?.origin !== thread.origin || this.composing;
    if (changed && this.thread) this.host.onPreviewColor?.(this.thread.id, this.thread.origin);
    this.composing = false;
    if (changed) this.showHelp(false);
    this.toggle.hidden = false;
    this.helpButton.hidden = false;
    this.panelButton.hidden = false;
    this.list.hidden = false;
    this.input.placeholder = words().comments.thread.replyPlaceholder;
    this.thread = thread;
    this.element.hidden = false;
    this.element.setAttribute("data-comment-state", thread.resolved ? "resolved" : "open");
    this.element.setAttribute("data-comment-locked", thread.locked === true ? "true" : "false");
    const local = thread.origin === "local";
    const editable = local && !thread.immutable && options.editable;
    const locked = thread.locked === true;
    const canEdit = editable && !locked;
    const authorEditable = !locked && options.editable && (!local || editable) && this.host.onRenameAuthor !== undefined;
    // The tick shows whether the thread is resolved; its tooltip says what a
    // press will do.
    this.toggle.setAttribute("aria-pressed", thread.resolved ? "true" : "false");
    this.toggle.setAttribute("aria-label", thread.resolved ? words().comments.thread.reopen : words().comments.thread.resolve);
    this.toggle.disabled = !canEdit;
    const color = typeof thread.color === "string" && /^#[0-9a-f]{6}$/i.test(thread.color) ? thread.color : authorColor(commentAuthorLabel(thread));
    if (this.document.activeElement !== this.colorInput) this.colorInput.value = color;
    this.colorInput.hidden = this.host.onAppearance === undefined;
    this.colorInput.disabled = !options.editable || locked;
    this.lockButton.hidden = this.host.onAppearance === undefined;
    this.lockButton.disabled = !options.editable;
    this.lockButton.setAttribute("aria-label", locked ? words().comments.thread.unlock : words().comments.thread.lock);
    this.lockButton.setAttribute("aria-pressed", locked ? "true" : "false");
    this.element.style.setProperty("--miro-thread-color", color);
    this.deleteButton.hidden = !local;
    this.deleteButton.disabled = !canEdit;
    this.hideImportedButton.hidden = local || this.host.onHideImported === undefined;
    this.hideImportedButton.disabled = !options.editable || locked;
    this.composer.hidden = !canEdit;
    this.note.hidden = canEdit;
    this.note.textContent = locked ? words().comments.thread.lockedNote
      : local ? words().comments.thread.reviewModeNote : words().comments.thread.importedNote;
    if (!locked && !local && authorEditable) this.note.textContent = words().comments.thread.importedAliasNote;
    const messageSignature = JSON.stringify({
      messages: threadMessages(thread),
      authorEditable,
      replyEditable: canEdit,
      locale: options.locale,
    });
    // Periodic host refreshes must not replace controls underneath the pointer
    // or an author field while it is being edited.
    if ((changed || messageSignature !== this.messageSignature) && (this.focusedAuthor === undefined || !authorEditable || changed)) {
      this.focusedAuthor = undefined;
      this.messageGeneration += 1;
      this.messageSignature = messageSignature;
      while (this.list.firstChild !== null) this.list.removeChild(this.list.firstChild);
      const messages = threadMessages(thread);
      for (const message of messages) {
        const mutable = !local || message.id === thread.id || thread.replies.some((reply) =>
          reply.id === message.id && reply.origin === "local" && !reply.immutable);
        this.list.appendChild(this.message(message, messages, options.locale, authorEditable && mutable, canEdit && mutable && message.id !== thread.id, canEdit));
      }
      if (!messages.some((message) => message.id === this.replyTargetId)) this.chooseReplyTarget(undefined);
      if (this.showNewestMessage) this.list.scrollTop = this.list.scrollHeight;
      this.showNewestMessage = false;
    }
    if (changed) {
      this.input.value = "";
      this.chooseReplyTarget(undefined);
      this.authorInput.value = options.authorName ?? "";
    }
  }

  public hide(): void {
    if (this.thread) this.host.onPreviewColor?.(this.thread.id, this.thread.origin);
    this.showHelp(false);
    this.element.hidden = true;
    this.thread = undefined;
    this.composing = false;
    this.focusedAuthor = undefined;
    this.messageGeneration += 1;
    this.messageSignature = undefined;
  }

  /** Places the card beside a pin, kept inside the given area. */
  public place(point: CardPoint, area: CardArea): void {
    this.placement = { point, area };
    const width = this.element.offsetWidth || 320;
    const height = this.element.offsetHeight || 200;
    const right = point.x + 24 + width <= area.width;
    const left = right ? point.x + 24 : Math.max(8, point.x - 24 - width);
    const top = Math.min(Math.max(8, point.y - 24), Math.max(8, area.height - height - 8));
    this.element.style.left = `${Math.round(left)}px`;
    this.element.style.top = `${Math.round(top)}px`;
  }

  public destroy(): void {
    this.hide();
    this.element.remove();
  }

  /** The explanation of resolving, under the header; a press on the "?" shows and hides it. */
  private showHelp(shown: boolean): void {
    this.help.hidden = !shown;
    this.helpButton.setAttribute("aria-expanded", shown ? "true" : "false");
  }

  private message(message: ThreadMessage, messages: readonly ThreadMessage[], locale: string | undefined, editable: boolean, deletable: boolean, replyable: boolean): HTMLElement {
    const item = this.make("div", "miro-canvas-thread__message");
    const head = item.appendChild(this.make("div", "miro-canvas-thread__byline"));
    const avatar = head.appendChild(this.make("span", "miro-canvas-thread__avatar", authorInitial(message.author)));
    avatar.style.setProperty("--miro-avatar", authorColor(message.author));
    if (editable && this.host.onRenameAuthor !== undefined) {
      const author = head.appendChild(this.make("input", "miro-canvas-thread__author"));
      author.type = "text";
      author.value = message.author;
      author.setAttribute("aria-label", words().comments.thread.editAuthorName);
      const threadId = this.thread!.id;
      const origin = this.thread!.origin;
      const generation = this.messageGeneration;
      let saved = message.author;
      author.addEventListener("focus", () => { this.focusedAuthor = author; });
      author.addEventListener("blur", () => {
        if (this.focusedAuthor === author) this.focusedAuthor = undefined;
        if (generation !== this.messageGeneration) return;
        const name = author.value.trim();
        author.value = name || saved;
        if (!name || name === saved) return;
        saved = name;
        avatar.textContent = authorInitial(name);
        avatar.style.setProperty("--miro-avatar", authorColor(name));
        this.host.onRenameAuthor?.(threadId, message.id, name, origin);
      });
      author.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        if (event.key === "Escape") author.value = saved;
        author.blur();
      });
    } else head.appendChild(this.make("span", "miro-canvas-thread__author", message.author));
    const time = head.appendChild(this.make("time", "miro-canvas-thread__time", shortTime(message.createdAt, locale)));
    if (message.createdAt !== undefined) time.setAttribute("datetime", message.createdAt);
    if (replyable) {
      const reply = head.appendChild(this.button(words().comments.thread.replyToMessage, "miro-canvas-thread__icon miro-canvas-thread__reply-to", "reply", "↩"));
      reply.addEventListener("click", () => {
        this.chooseReplyTarget(message);
        this.input.focus?.();
      });
    }
    if (deletable && this.host.onDeleteReply) {
      const remove = head.appendChild(this.button(words().comments.thread.deleteReply, "miro-canvas-thread__icon", "trash-2", "×"));
      remove.addEventListener("click", () => {
        if (this.thread && !this.thread.immutable && this.thread.locked !== true && this.thread.origin === "local") this.host.onDeleteReply?.(this.thread.id, message.id);
      });
    }
    if (message.replyTo !== undefined) item.appendChild(this.quote(messages.find((other) => other.id === message.replyTo)));
    item.appendChild(this.make("div", "miro-canvas-thread__text", message.text));
    return item;
  }

  /** The message a reply answers, or a plain note when it has been deleted. */
  private quote(quoted: ThreadMessage | undefined): HTMLElement {
    const quote = this.make("div", "miro-canvas-thread__quote");
    if (quoted === undefined) {
      quote.appendChild(this.make("div", "miro-canvas-thread__quote-text", words().comments.thread.quotedMessageGone));
      return quote;
    }
    quote.appendChild(this.make("div", "miro-canvas-thread__quote-author", quoted.author));
    quote.appendChild(this.make("div", "miro-canvas-thread__quote-text", quoted.text));
    return quote;
  }

  /** Shows above the field which message the next reply answers; nothing for the whole thread. */
  private chooseReplyTarget(message: ThreadMessage | undefined): void {
    this.replyTargetId = message?.id;
    this.replyTarget.hidden = message === undefined;
    this.replyTargetLabel.textContent = message === undefined ? "" : words().comments.thread.replyingTo(message.author);
    this.replyTargetText.textContent = message?.text ?? "";
    this.replace();
  }

  /** The card changed height, so it finds its place again. */
  private replace(): void {
    if (this.placement !== undefined) this.place(this.placement.point, this.placement.area);
  }

  private sendDraft(): void {
    if (this.composer.hidden || this.element.hidden) return;
    const text = this.input.value.trim();
    if (text.length === 0) return;
    const name = this.authorInput.value.trim();
    const author: [string?] = name ? [name] : [];
    if (this.composing) this.host.onCreate?.(text, ...author, {color: this.colorInput.value, locked: this.composingLocked});
    else if (this.thread === undefined) return;
    else {
      // Sending refreshes the card at once, so the flag is up before the host is told.
      this.showNewestMessage = true;
      if (this.replyTargetId === undefined) this.host.onReply(this.thread.id, text, ...author);
      else this.host.onReply(this.thread.id, text, author[0], this.replyTargetId);
    }
    this.input.value = "";
    this.chooseReplyTarget(undefined);
  }

  private make<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
    const element = createHtmlElement(this.document, tag);
    element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  private button(label: string, className: string, icon?: string, glyph?: string): HTMLButtonElement {
    const element = this.make("button", `miro-canvas-thread__button ${className}`);
    element.type = "button";
    element.setAttribute("aria-label", label);
    element.setAttribute("data-tooltip-delay", TOOLTIP_DELAY);
    if (icon !== undefined) {
      if (this.host.setIcon !== undefined) this.host.setIcon(element, icon);
      else element.textContent = glyph ?? "";
    }
    return element;
  }
}
