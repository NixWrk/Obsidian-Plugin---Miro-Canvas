/**
 * Finding words on a board: the text a person can read on each card, frame,
 * file, link, line label and comment thread, flattened once per board into a
 * list the search bar filters as the person types.
 *
 * Pure: no DOM and no Obsidian.  The session builds the list when the search
 * opens and again only when the board is saved or its comments change.
 */

import { pointOnPolyline, resolveAnchor, type AnchorGeometry, type AnchorPoint } from "./anchors";
import { boardConnectors } from "./board-connectors";
import { threadMessages } from "./comment-thread";
import type { CommentOrigin, CommentThread } from "./local-comments";
import type { SourceScene } from "./source-model";

/** What a match is, as the bar names it to a screen reader. */
export type SearchKind = "text" | "sticky" | "shape" | "table" | "frame" | "file" | "link" | "label" | "comment";

export interface SearchRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface SearchEntry {
  /** Stable across rebuilds of the same board, so the current match survives a save. */
  readonly key: string;
  readonly kind: SearchKind;
  /** The card, line or comment thread the match belongs to. */
  readonly targetId: string;
  /** Set for comment threads: imported and local threads can share an ID. */
  readonly origin?: CommentOrigin;
  /** The readable text, stripped of Markdown and normalized for matching. */
  readonly haystack: string;
  /** Where it sits on the board; undefined for a comment thread with no pin. */
  readonly rect: SearchRect | undefined;
}

export interface SearchIndexInput {
  readonly document: unknown;
  readonly scene: SourceScene;
  readonly geometry: AnchorGeometry;
  readonly threads: readonly CommentThread[];
  /** Where a line's label sits when the line does not say, as a share of its length. */
  readonly labelFallback: number;
}

export interface SearchViewSize {
  readonly width: number;
  readonly height: number;
}

/** The zoom a jump never goes below when the match would fit at it. */
export const SEARCH_MIN_FOCUS_ZOOM = 0.5;
/** The margin the viewport keeps around a fitted rectangle, as its fitToBounds does. */
export const SEARCH_FIT_PADDING = 32;

const COMBINING_MARK = /\p{M}/u;
const BREVE = "̆";
const WHITESPACE = /\s+/gu;

/**
 * Text as search compares it: case, accents and the Russian ё do not matter,
 * but й stays apart from и - they are different letters, not an accent.
 */
export function normalizeSearchText(text: string): string {
  const lower = text.toLowerCase().replace(/ё/gu, "е");
  const decomposed = lower.normalize("NFD");
  let kept = "";
  let previous = "";
  for (const character of decomposed) {
    const isMark = COMBINING_MARK.test(character);
    const isShortI = character === BREVE && previous === "и";
    if (!isMark || isShortI) kept += character;
    if (!isMark) previous = character;
  }
  return kept.normalize("NFC").replace(WHITESPACE, " ").trim();
}

const FENCE_LINE = /^\s*(?:`{3,}|~{3,})/u;
const RULE_LINE = /^[\s|:-]+$/u;
const HEADING = /^\s{0,3}#{1,6}\s+/u;
const QUOTE = /^\s*(?:>\s?)+/u;
const LIST_MARKER = /^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/u;
const IMAGE = /!\[([^\]]*)\]\([^)]*\)/gu;
const LINK = /\[([^\]]*)\]\([^)]*\)/gu;
const WIKILINK = /!?\[\[([^\]|]*)(?:\|([^\]]*))?\]\]/gu;
const EMPHASIS = /\*\*|__|~~|==|`/gu;
const HTML_TAG = /<\/?([a-zA-Z][a-zA-Z0-9]*)[^<>]*>/gu;
const BLOCK_TAGS = new Set(["br", "p", "div", "li", "ul", "ol", "tr", "td", "th", "table", "h1", "h2", "h3", "h4", "h5", "h6"]);
const ENTITY = /&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/gu;
const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ",
};

/** A wiki link as Obsidian shows it: its alias, or the note's name without folders. */
function wikilinkText(target: string, alias: string | undefined): string {
  if (alias !== undefined && alias.trim() !== "") return alias;
  const hash = target.indexOf("#");
  const path = hash < 0 ? target : target.slice(0, hash);
  const heading = hash < 0 ? "" : target.slice(hash + 1);
  const name = path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/iu, "");
  return heading === "" ? name : `${name} ${heading}`;
}

function decodeEntity(whole: string, body: string): string {
  if (body.startsWith("#x") || body.startsWith("#X")) {
    const code = Number.parseInt(body.slice(2), 16);
    return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  }
  if (body.startsWith("#")) {
    const code = Number.parseInt(body.slice(1), 10);
    return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  }
  return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
}

/**
 * The words a card shows, without the Markdown and HTML that write them:
 * fences, table pipes, headings, quotes, list markers, emphasis, links and
 * tags.  Every pattern is linear, so a long card cannot stall the search.
 */
export function stripMarkdown(text: string): string {
  const lines: string[] = [];
  for (const rawLine of text.split(/\r?\n/u)) {
    // A fence's own line and a table's rule row say nothing a person reads.
    if (FENCE_LINE.test(rawLine)) continue;
    if (RULE_LINE.test(rawLine) && rawLine.includes("-")) continue;
    let line = rawLine.replace(HEADING, "");
    line = line.replace(QUOTE, "");
    line = line.replace(LIST_MARKER, "");
    lines.push(line);
  }
  let result = lines.join("\n");
  result = result.replace(IMAGE, "$1");
  result = result.replace(WIKILINK, (_whole, target: string, alias: string | undefined) => wikilinkText(target, alias));
  result = result.replace(LINK, "$1");
  result = result.replace(EMPHASIS, "");
  result = result.replace(HTML_TAG, (_whole, name: string) => (BLOCK_TAGS.has(name.toLowerCase()) ? " " : ""));
  // Table pipes go last: a wiki link's alias is written after one too.
  result = result.replace(/\|/gu, " ");
  result = result.replace(ENTITY, (whole, body: string) => decodeEntity(whole, body));
  return result;
}

/** Stripped and normalized: the form every haystack and query is compared in. */
export function searchableText(text: string): string {
  return normalizeSearchText(stripMarkdown(text));
}

type Record_ = Record<string, unknown>;

function isRecord(value: unknown): value is Record_ {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function nodeRect(node: Record_): SearchRect | undefined {
  const x = finiteNumber(node.x);
  const y = finiteNumber(node.y);
  const width = finiteNumber(node.width);
  const height = finiteNumber(node.height);
  if (x === undefined || y === undefined || width === undefined || height === undefined) return undefined;
  return { x, y, width: Math.max(0, width), height: Math.max(0, height) };
}

function pointRect(point: AnchorPoint): SearchRect {
  return { x: point.x, y: point.y, width: 0, height: 0 };
}

function fileName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** A line's route as the board draws it. */
function routePoints(geometry: AnchorGeometry, id: string): readonly AnchorPoint[] {
  const route = geometry.edges?.[id];
  if (route === undefined) return [];
  if (route.points !== undefined) return route.points;
  return route.start !== undefined && route.end !== undefined ? [route.start, route.end] : [];
}

function labelPlace(points: readonly AnchorPoint[], t: number): SearchRect | undefined {
  const point = pointOnPolyline(points, t);
  return point === undefined ? undefined : pointRect(point);
}

function validShare(value: unknown): number | undefined {
  return typeof value === "number" && value >= 0 && value <= 1 ? value : undefined;
}

/** What kind of card a text node is, as the board shows it. */
function textKind(scene: SourceScene, id: string): SearchKind {
  const item = scene.items.get(id);
  if (item?.kind === "sticky") return "sticky";
  if (item?.kind === "shape") return "shape";
  if (item?.structured?.table !== undefined) return "table";
  return "text";
}

/**
 * Everything on the board a person can read, one entry per card, frame,
 * file, link, line label and comment thread, in one pass over the board.
 * Entries run from the top down and left to right, as a person reads the
 * board; comment threads without a pin come last.
 */
export function buildSearchIndex(input: SearchIndexInput): SearchEntry[] {
  const entries: SearchEntry[] = [];
  const add = (entry: Omit<SearchEntry, "haystack">, text: string): void => {
    const haystack = searchableText(text);
    if (haystack !== "") entries.push({ ...entry, haystack });
  };
  const document = isRecord(input.document) ? input.document : {};
  const nodes = Array.isArray(document.nodes) ? document.nodes as readonly unknown[] : [];
  for (const node of nodes) {
    if (!isRecord(node) || typeof node.id !== "string") continue;
    const id = node.id;
    const rect = nodeRect(node);
    const key = `node:${id}`;
    if (node.type === "text") {
      const structured = input.scene.items.get(id)?.structured;
      // A table or code block's name is part of what the card shows.
      const title = structured?.table?.title ?? structured?.code?.title ?? "";
      const text = typeof node.text === "string" ? node.text : "";
      add({ key, kind: textKind(input.scene, id), targetId: id, rect }, title === "" ? text : `${title}\n${text}`);
    } else if (node.type === "group") {
      add({ key, kind: "frame", targetId: id, rect }, typeof node.label === "string" ? node.label : "");
    } else if (node.type === "file" && typeof node.file === "string") {
      const subpath = typeof node.subpath === "string" ? ` ${node.subpath}` : "";
      add({ key, kind: "file", targetId: id, rect }, `${fileName(node.file)}${subpath}`);
    } else if (node.type === "link" && typeof node.url === "string") {
      add({ key, kind: "link", targetId: id, rect }, node.url);
    }
  }

  // Line labels sit where the board draws them, a share of the way along the route.
  const overrides = isRecord(document.miroCanvas) && isRecord(document.miroCanvas.localOverrides)
    ? document.miroCanvas.localOverrides
    : {};
  const edges = Array.isArray(document.edges) ? document.edges as readonly unknown[] : [];
  for (const edge of edges) {
    if (!isRecord(edge) || typeof edge.id !== "string" || typeof edge.label !== "string") continue;
    const override = overrides[edge.id];
    const connectorStyle = isRecord(override) ? override.connector : undefined;
    const storedT = isRecord(connectorStyle) ? validShare(connectorStyle.labelT) : undefined;
    const rect = labelPlace(routePoints(input.geometry, edge.id), storedT ?? input.labelFallback);
    add({ key: `label:${edge.id}`, kind: "label", targetId: edge.id, rect }, edge.label);
  }
  for (const connector of boardConnectors(input.document)) {
    if (connector.label === undefined) continue;
    const rect = labelPlace(routePoints(input.geometry, connector.id), connector.labelT ?? input.labelFallback);
    add({ key: `label:${connector.id}`, kind: "label", targetId: connector.id, rect }, connector.label);
  }

  // A thread is found by any of its messages and shown at its pin.
  for (const thread of input.threads) {
    const text = threadMessages(thread).map((message) => message.text).join("\n");
    const resolved = thread.anchor === undefined ? undefined : resolveAnchor(thread.anchor, input.geometry);
    const point = resolved?.valid === true ? resolved.point : undefined;
    add({
      key: `comment:${thread.origin}:${thread.id}`,
      kind: "comment",
      targetId: thread.id,
      origin: thread.origin,
      rect: point === undefined ? undefined : pointRect(point),
    }, text);
  }

  return entries.sort(readingOrder);
}

function readingOrder(a: SearchEntry, b: SearchEntry): number {
  if (a.rect === undefined || b.rect === undefined) {
    if (a.rect !== b.rect) return a.rect === undefined ? 1 : -1;
  } else {
    const byRow = a.rect.y - b.rect.y;
    if (byRow !== 0) return byRow;
    const byColumn = a.rect.x - b.rect.x;
    if (byColumn !== 0) return byColumn;
  }
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

/** The positions, in the index, of every entry that holds the query. */
export function findMatches(index: readonly SearchEntry[], query: string): number[] {
  const needle = normalizeSearchText(query);
  if (needle === "") return [];
  const matches: number[] = [];
  for (let position = 0; position < index.length; position += 1) {
    if (index[position].haystack.includes(needle)) matches.push(position);
  }
  return matches;
}

/** The next or previous match, going round from the last to the first. */
export function stepMatch(current: number, count: number, direction: 1 | -1): number {
  if (count <= 0) return -1;
  if (current < 0 || current >= count) return direction > 0 ? 0 : count - 1;
  return (current + direction + count) % count;
}

/**
 * The rectangle to fit the viewport to so a match is centred at a readable
 * zoom: the current zoom (at least `minimumZoom`), unless the match is too
 * big to fit at it, then the zoom that fits it.  A tiny card is never blown
 * up to fill the screen, a huge frame is zoomed out to.  A minimum of 0
 * keeps the current zoom, as a jump to a comment pin does.
 */
export function focusRect(
  rect: SearchRect,
  zoom: number,
  viewSize: SearchViewSize,
  padding: number = SEARCH_FIT_PADDING,
  minimumZoom: number = SEARCH_MIN_FOCUS_ZOOM,
): SearchRect {
  const margin = Math.min(padding, Math.min(viewSize.width, viewSize.height) / 2);
  const availableWidth = Math.max(1, viewSize.width - margin * 2);
  const availableHeight = Math.max(1, viewSize.height - margin * 2);
  const fitZoom = Math.min(
    availableWidth / Math.max(rect.width, Number.MIN_VALUE),
    availableHeight / Math.max(rect.height, Number.MIN_VALUE),
  );
  const current = Number.isFinite(zoom) && zoom > 0 ? zoom : SEARCH_MIN_FOCUS_ZOOM;
  const readable = Math.max(current, minimumZoom);
  const target = Math.min(readable, fitZoom);
  const width = availableWidth / target;
  const height = availableHeight / target;
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  return { x: centerX - width / 2, y: centerY - height / 2, width, height };
}
