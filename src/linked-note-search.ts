/** Linked Markdown text, independent of Obsidian and of board animation frames. */
export interface LinkedNoteStat {
  readonly mtime: number;
  readonly size: number;
}

export interface LinkedNoteSearchAdapter {
  /** Lookup only; the parent resolves a vault-relative path to its current file. */
  readonly stat: (path: string) => LinkedNoteStat | undefined;
  /** Read only that file. Honor cancellation when possible; never fetch a URL. */
  readonly read: (path: string, signal: AbortSignal) => Promise<string>;
}

export const LINKED_NOTE_SEARCH_LIMITS = {
  files: 128,
  requests: 512,
  fileBytes: 512 * 1024,
  totalCharacters: 2_000_000,
  cachedFiles: 128,
  cachedCharacters: 2_000_000,
  concurrentReads: 4,
} as const;

export type LinkedNoteIssueCode = "invalid-path" | "file-limit" | "missing" | "too-large" | "read-failed" | "changed";

export interface LinkedNoteIssue {
  readonly path: string;
  readonly code: LinkedNoteIssueCode;
}

export interface LinkedNoteSearchResult {
  readonly status: "ready" | "stale" | "disposed";
  readonly noteTexts: ReadonlyMap<string, string>;
  readonly issues: readonly LinkedNoteIssue[];
}

interface CachedNote {
  readonly stat: LinkedNoteStat;
  readonly text: string;
}

interface PendingNote {
  readonly stat: LinkedNoteStat;
  readonly controller: AbortController;
  readonly promise: Promise<string | undefined>;
}

function sameStat(left: LinkedNoteStat, right: LinkedNoteStat | undefined): boolean {
  return right !== undefined && left.mtime === right.mtime && left.size === right.size;
}

function validMarkdownPath(path: string): boolean {
  return path.length > 0 && path.length <= 4096 && /\.md$/iu.test(path)
    && !path.includes("\\") && !path.includes(":") && !path.includes("\0")
    && path.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

/**
 * One instance per board session. load() is called on search open/save/file
 * events, never from refresh/drag. New loads retire old results immediately;
 * unchanged in-flight reads are shared. Ignored aborts still occupy a read slot.
 */
export class LinkedNoteSearch {
  private readonly cache = new Map<string, CachedNote>();
  private readonly pending = new Map<string, PendingNote>();
  private readonly active = new Set<Promise<string | undefined>>();
  private request: AbortController | undefined;
  private disposed = false;

  public constructor(private readonly adapter: LinkedNoteSearchAdapter) {}

  public async load(paths: Iterable<string>): Promise<LinkedNoteSearchResult> {
    if (this.disposed) return this.emptyResult("disposed");
    this.request?.abort();
    const request = new AbortController();
    this.request = request;
    const noteTexts = new Map<string, string>();
    const issues: LinkedNoteIssue[] = [];
    const wanted = new Set<string>();
    let requested = 0;
    for (const path of paths) {
      requested += 1;
      if (requested > LINKED_NOTE_SEARCH_LIMITS.requests || wanted.size >= LINKED_NOTE_SEARCH_LIMITS.files && !wanted.has(path)) {
        issues.push({ path, code: "file-limit" });
        break;
      }
      if (!validMarkdownPath(path)) {
        issues.push({ path, code: "invalid-path" });
        continue;
      }
      wanted.add(path);
    }
    let totalCharacters = 0;
    for (const path of wanted) {
      if (request.signal.aborted) break;
      let stat: LinkedNoteStat | undefined;
      try {
        stat = this.adapter.stat(path);
      } catch {
        issues.push({ path, code: "read-failed" });
        continue;
      }
      if (stat === undefined) {
        this.evict(path);
        issues.push({ path, code: "missing" });
        continue;
      }
      if (!Number.isFinite(stat.mtime) || !Number.isFinite(stat.size) || stat.size < 0 || stat.size > LINKED_NOTE_SEARCH_LIMITS.fileBytes) {
        issues.push({ path, code: "too-large" });
        continue;
      }
      const text = await this.waitFor(this.noteText(path, { ...stat }, request.signal), request.signal);
      if (request.signal.aborted) break;
      if (text === undefined) {
        issues.push({ path, code: sameStat(stat, this.safeStat(path)) ? "read-failed" : "changed" });
        continue;
      }
      if (text.length > LINKED_NOTE_SEARCH_LIMITS.fileBytes || totalCharacters + text.length > LINKED_NOTE_SEARCH_LIMITS.totalCharacters) {
        issues.push({ path, code: "too-large" });
        continue;
      }
      totalCharacters += text.length;
      noteTexts.set(path, text);
    }
    if (request.signal.aborted || this.disposed) return this.emptyResult(this.disposed ? "disposed" : "stale");
    return { status: "ready", noteTexts, issues };
  }

  /** Call for modify/delete, and for both old and new paths on rename. */
  public invalidate(path: string): void {
    this.request?.abort();
    this.evict(path);
  }

  private evict(path: string): void {
    this.cache.delete(path);
    const pending = this.pending.get(path);
    pending?.controller.abort();
    this.pending.delete(path);
  }

  public dispose(): void {
    this.disposed = true;
    this.request?.abort();
    for (const pending of this.pending.values()) pending.controller.abort();
    this.pending.clear();
    this.cache.clear();
  }

  private emptyResult(status: "stale" | "disposed"): LinkedNoteSearchResult {
    return { status, noteTexts: new Map(), issues: [] };
  }

  private safeStat(path: string): LinkedNoteStat | undefined {
    try {
      return this.adapter.stat(path);
    } catch {
      return undefined;
    }
  }

  private async noteText(path: string, stat: LinkedNoteStat, signal: AbortSignal): Promise<string | undefined> {
    const cached = this.cache.get(path);
    if (cached !== undefined && sameStat(stat, cached.stat)) {
      this.cache.delete(path);
      this.cache.set(path, cached);
      return cached.text;
    }
    this.cache.delete(path);
    const pending = this.pending.get(path);
    if (pending !== undefined && sameStat(stat, pending.stat)) return pending.promise;
    if (pending !== undefined) this.evict(path);
    while (this.active.size >= LINKED_NOTE_SEARCH_LIMITS.concurrentReads) {
      await this.waitFor(Promise.race(this.active), signal);
      if (signal.aborted || this.disposed) return undefined;
    }
    if (signal.aborted || this.disposed || !sameStat(stat, this.safeStat(path))) return undefined;
    const controller = new AbortController();
    const read = Promise.resolve().then(() => this.disposed || controller.signal.aborted ? undefined : this.adapter.read(path, controller.signal));
    const promise = read.then((text) => {
      if (text === undefined || this.disposed || controller.signal.aborted || !sameStat(stat, this.safeStat(path))) return undefined;
      if (text.length <= LINKED_NOTE_SEARCH_LIMITS.fileBytes) {
        this.cache.set(path, { stat, text });
        this.trimCache();
      }
      return text;
    }, () => undefined);
    this.pending.set(path, { stat, controller, promise });
    this.active.add(promise);
    void promise.then(() => {
      this.active.delete(promise);
      if (this.pending.get(path)?.promise === promise) this.pending.delete(path);
    });
    return promise;
  }

  private trimCache(): void {
    let characters = 0;
    for (const entry of this.cache.values()) characters += entry.text.length;
    for (const [path, entry] of this.cache) {
      if (this.cache.size <= LINKED_NOTE_SEARCH_LIMITS.cachedFiles && characters <= LINKED_NOTE_SEARCH_LIMITS.cachedCharacters) break;
      this.cache.delete(path);
      characters -= entry.text.length;
    }
  }

  private async waitFor<T>(promise: Promise<T>, signal: AbortSignal): Promise<T | undefined> {
    if (signal.aborted) return undefined;
    let cancel: (() => void) | undefined;
    const cancelled = new Promise<undefined>((resolve) => {
      cancel = () => resolve(undefined);
      signal.addEventListener("abort", cancel, { once: true });
    });
    try {
      return await Promise.race([promise, cancelled]);
    } finally {
      if (cancel !== undefined) signal.removeEventListener("abort", cancel);
    }
  }
}

interface Heading {
  readonly line: number;
  readonly level: number;
  readonly title: string;
}

function headingName(title: string): string {
  return title.replace(/[*_`~]/gu, "").trim().normalize("NFC").toLowerCase();
}

function atxHeadingTitle(text: string): string {
  const title = text.trim();
  let end = title.length;
  while (end > 0 && title[end - 1] === "#") end -= 1;
  return end > 0 && (title[end - 1] === " " || title[end - 1] === "\t") ? title.slice(0, end).trim() : title;
}

/**
 * Heading cards show that heading and its descendants, ending at the next peer.
 * Block cards show their marked paragraph (or the preceding block for a separate
 * ID line). Missing anchors fail closed. Code fences cannot provide anchors.
 * The parent may substitute native metadata-cache slices for richer Markdown.
 */
export function sliceLinkedNoteText(text: string, subpath?: string): string {
  if (subpath === undefined || subpath === "" || subpath === "#") return text;
  if (!subpath.startsWith("#")) return "";
  let anchor: string;
  try {
    anchor = decodeURIComponent(subpath.slice(1));
  } catch {
    anchor = subpath.slice(1);
  }
  const lines = text.split(/\r?\n/u);
  const headings: Heading[] = [];
  const anchorLines = new Set<number>();
  let fence: { marker: string; length: number } | undefined;
  let frontmatter = lines[0]?.trim() === "---";
  for (let line = 0; line < lines.length; line += 1) {
    const raw = lines[line];
    if (frontmatter) {
      if (line > 0 && (raw.trim() === "---" || raw.trim() === "...")) frontmatter = false;
      continue;
    }
    const fenceMatch = /^ {0,3}(`{3,}|~{3,})/u.exec(raw);
    if (fenceMatch !== null) {
      const marker = fenceMatch[1][0];
      if (fence === undefined) fence = { marker, length: fenceMatch[1].length };
      else if (marker === fence.marker && fenceMatch[1].length >= fence.length && raw.slice(fenceMatch[0].length).trim() === "") fence = undefined;
      continue;
    }
    if (fence !== undefined) continue;
    anchorLines.add(line);
    const heading = /^ {0,3}(#{1,6})[ \t]+/u.exec(raw);
    if (heading !== null) {
      headings.push({ line, level: heading[1].length, title: headingName(atxHeadingTitle(raw.slice(heading[0].length))) });
    } else if (line > 0 && anchorLines.has(line - 1) && lines[line - 1].trim() !== "" && /^ {0,3}(?:=+|-+)[ \t]*$/u.test(raw)) {
      headings.push({ line: line - 1, level: raw.trim().startsWith("=") ? 1 : 2, title: headingName(lines[line - 1]) });
    }
  }
  if (anchor.startsWith("^")) {
    const headingLines = new Set(headings.map((heading) => heading.line));
    const blockId = anchor.slice(1);
    if (!/^[A-Za-z0-9-]+$/u.test(blockId)) return "";
    for (const line of anchorLines) {
      const raw = lines[line].trimEnd();
      const marker = raw.lastIndexOf("^");
      if (marker < 0 || raw.slice(marker + 1) !== blockId) continue;
      if (marker > 0 && raw[marker - 1] !== " " && raw[marker - 1] !== "\t") continue;
      const prefix = raw.slice(0, marker).trimEnd();
      let end = line;
      let start = line;
      if (prefix.trim() === "") {
        end -= 1;
        while (end >= 0 && lines[end].trim() === "") end -= 1;
        start = end;
      }
      while (start > 0 && lines[start - 1].trim() !== "" && !headingLines.has(start - 1)) start -= 1;
      if (end < 0) return "";
      const block = lines.slice(start, end + 1);
      if (end === line) block[block.length - 1] = prefix;
      return block.join("\n");
    }
    return "";
  }
  const path = anchor.split("#").map(headingName);
  if (path.some((name) => name === "")) return "";
  let start = 0;
  let end = lines.length;
  for (let position = 0; position < path.length; position += 1) {
    const name = path[position];
    const heading = headings.find((candidate) => candidate.line >= start && candidate.line < end && candidate.title === name);
    if (heading === undefined) return "";
    start = heading.line;
    end = Math.min(end, headings.find((candidate) => candidate.line > start && candidate.level <= heading.level)?.line ?? lines.length);
    if (position < path.length - 1) start += 1;
  }
  return lines.slice(start, end).join("\n");
}
