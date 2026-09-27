/**
 * Reading an Excalidraw drawing as it lies in the vault, before anything is
 * put on a board.
 *
 * Two shapes of file: a plain `.excalidraw` scene (the JSON excalidraw.com
 * saves), and the Obsidian Excalidraw plugin's `.excalidraw.md` note.  The
 * note carries the scene in a `json` or `compressed-json` fence under a
 * `# Drawing` / `## Drawing` heading (usually hidden between `%%` lines), the
 * raw Markdown of every text element in `## Text Elements` (`text ^id`), and
 * where each picture or formula comes from in `## Embedded Files`
 * (`id: [[link]]`, `id: https://...`, `id: $$tex$$`).
 *
 * Pure: text in, a scene and its side tables out, or a typed error.  Nothing
 * here knows about cards or lines; the Excalidraw importer does the mapping.
 */

import { decompressFromBase64 } from "./lz-string";

/**
 * An Excalidraw scene as parsed.  Only the envelope is checked; every element
 * and every field is kept exactly as the file has it.
 */
export interface ExcalidrawScene {
  readonly type: "excalidraw";
  readonly version?: unknown;
  readonly source?: unknown;
  readonly elements: readonly unknown[];
  readonly appState?: unknown;
  readonly files?: unknown;
  readonly [field: string]: unknown;
}

/** Where a picture, formula or web page in the drawing comes from. */
export type ExcalidrawEmbed =
  | {
      /** `id: [[target|display]]`: a vault file; `display` is the size or alias after `|`. */
      readonly kind: "link";
      readonly link: string;
      readonly display?: string;
      /** Whatever the line carries after `]]` (for example an SVG colour map), kept verbatim. */
      readonly rest?: string;
      readonly raw: string;
    }
  | { readonly kind: "url"; readonly url: string; readonly raw: string }
  | { readonly kind: "tex"; readonly tex: string; readonly raw: string }
  | { readonly kind: "unknown"; readonly raw: string };

export interface ExcalidrawFile {
  /** A plugin note (`.excalidraw.md`) or a plain scene (`.excalidraw`). */
  readonly container: "markdown" | "json";
  /** How the scene was stored: plain JSON or LZ-string Base64. */
  readonly encoding: "json" | "compressed-json";
  /** The note's `excalidraw-plugin` frontmatter value (`parsed`, `raw`), when there is one. */
  readonly pluginMode?: string;
  /** The Excalidraw plugin release that saved the scene, read from its `source` link. */
  readonly pluginVersion?: string;
  /** The scene's own `version` field as text, or `"unknown"`. */
  readonly formatVersion: string;
  readonly scene: ExcalidrawScene;
  /** Text element id -> its raw Markdown from `## Text Elements` (wikilinks as written). */
  readonly texts: ReadonlyMap<string, string>;
  /** File id -> where the embedded file comes from, from `## Embedded Files`. */
  readonly embeds: ReadonlyMap<string, ExcalidrawEmbed>;
}

export type ExcalidrawReadErrorCode =
  /** A note with no `# Drawing` fence: not an Excalidraw drawing, or a damaged one. */
  | "no-drawing"
  /** The `compressed-json` block is not an LZ-string stream, or unpacks past the size bound. */
  | "decompress-failed"
  /** The scene text is not JSON. */
  | "invalid-json"
  /** JSON, but not an Excalidraw scene (`type: "excalidraw"` with an `elements` list). */
  | "not-a-scene";

export interface ExcalidrawReadError {
  readonly code: ExcalidrawReadErrorCode;
  /** For maintainers, in English. */
  readonly detail: string;
}

export type ExcalidrawReadResult =
  | { readonly ok: true; readonly file: ExcalidrawFile }
  | { readonly ok: false; readonly error: ExcalidrawReadError };

/** The drawing fence: the last one in the note, as the plugin writes it at the end. */
const DRAWING_FENCE = /^#{1,2} Drawing[ \t]*\n[^`]*```(compressed-json|json)[ \t]*\n([\s\S]*?)\n```[ \t]*$/gm;

/** The heading the plugin puts above its data; user notes may come before it. */
const DATA_HEADING = /^# Excalidraw Data[ \t]*$/gm;

const TEXT_ELEMENTS_HEADING = /^#{1,2} Text Elements[ \t]*$/gm;
const EMBEDDED_FILES_HEADING = /^#{1,2} Embedded Files[ \t]*$/gm;

/** The headings that close the text section; a text element may hold headings of its own. */
const DATA_SECTION_HEADING = /^#{1,2} (?:Text Elements|Element Links|Embedded Files|Drawing)[ \t]*$/;

/** `%%` on a line of its own hides the data from Obsidian's reading view. */
const COMMENT_FENCE = /^%%[ \t]*$/;

/** ` ^blockId` at the end of a line closes a text element. */
const TEXT_BLOCK_ANCHOR = /[ \t]\^([A-Za-z0-9_-]+)[ \t]*(?=\n|$)/g;

const EMBED_LINE = /^([A-Za-z0-9_-]+):[ \t]*(.*)$/;
const URL_START = /^[a-z][a-z0-9+.-]*:\/\//i;
const PLUGIN_RELEASE = /obsidian-excalidraw-plugin\/releases\/tag\/([^/?#\s]+)/;

/**
 * Reads an Excalidraw file's text.  A text that starts with `{` is taken for a
 * plain scene; anything else for the plugin's Markdown note.
 */
export function readExcalidrawFile(text: string): ExcalidrawReadResult {
  const normalized = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  if (normalized.trimStart().startsWith("{")) {
    return readPlainScene(normalized);
  }
  return readPluginNote(normalized);
}

function readPlainScene(text: string): ExcalidrawReadResult {
  const scene = parseScene(text);
  if (!scene.ok) return scene;
  return {
    ok: true,
    file: describeFile("json", "json", undefined, scene.scene, new Map(), new Map()),
  };
}

function readPluginNote(text: string): ExcalidrawReadResult {
  const fence = lastDrawingFence(text);
  if (fence === undefined) {
    return failure("no-drawing", "no ```json or ```compressed-json fence under a Drawing heading");
  }

  let sceneText = fence.body;
  if (fence.encoding === "compressed-json") {
    // The plugin breaks the long Base64 line into chunks; the stream itself has no whitespace.
    const unpacked = decompressFromBase64(fence.body.replace(/\s+/g, ""));
    if (unpacked === undefined) {
      return failure("decompress-failed", "the compressed-json block is malformed or larger than the bound");
    }
    sceneText = unpacked;
  }

  const scene = parseScene(sceneText);
  if (!scene.ok) return scene;

  const dataStart = lastMatchIndex(DATA_HEADING, text.slice(0, fence.start)) ?? 0;
  const data = text.slice(dataStart, fence.start);
  const texts = readTextElements(data);
  const embeds = readEmbeddedFiles(data);
  const pluginMode = frontmatterValue(text, "excalidraw-plugin");

  return {
    ok: true,
    file: describeFile("markdown", fence.encoding, pluginMode, scene.scene, texts, embeds),
  };
}

function describeFile(
  container: ExcalidrawFile["container"],
  encoding: ExcalidrawFile["encoding"],
  pluginMode: string | undefined,
  scene: ExcalidrawScene,
  texts: ReadonlyMap<string, string>,
  embeds: ReadonlyMap<string, ExcalidrawEmbed>,
): ExcalidrawFile {
  const pluginVersion = typeof scene.source === "string" ? PLUGIN_RELEASE.exec(scene.source)?.[1] : undefined;
  const hasVersion = typeof scene.version === "number" || typeof scene.version === "string";
  const formatVersion = hasVersion ? String(scene.version) : "unknown";
  return {
    container,
    encoding,
    ...(pluginMode === undefined ? {} : { pluginMode }),
    ...(pluginVersion === undefined ? {} : { pluginVersion }),
    formatVersion,
    scene,
    texts,
    embeds,
  };
}

type SceneParse =
  | { readonly ok: true; readonly scene: ExcalidrawScene }
  | { readonly ok: false; readonly error: ExcalidrawReadError };

function parseScene(text: string): SceneParse {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return failure("invalid-json", error instanceof Error ? error.message : String(error));
  }
  if (!isRecord(parsed) || parsed.type !== "excalidraw" || !Array.isArray(parsed.elements)) {
    return failure("not-a-scene", 'expected an object with type "excalidraw" and an elements array');
  }
  return { ok: true, scene: parsed as ExcalidrawScene };
}

interface DrawingFence {
  readonly encoding: "json" | "compressed-json";
  readonly body: string;
  /** Where the Drawing heading starts: the note's data sections lie before it. */
  readonly start: number;
}

function lastDrawingFence(text: string): DrawingFence | undefined {
  let found: DrawingFence | undefined;
  for (const match of text.matchAll(DRAWING_FENCE)) {
    found = {
      encoding: match[1] === "compressed-json" ? "compressed-json" : "json",
      body: match[2] ?? "",
      start: match.index ?? 0,
    };
  }
  return found;
}

function lastMatchIndex(pattern: RegExp, text: string): number | undefined {
  let index: number | undefined;
  for (const match of text.matchAll(pattern)) {
    index = match.index;
  }
  return index;
}

/**
 * The lines under `heading` up to the next line `ends` says closes it.  The
 * first such heading for the text section, the last for the embedded files,
 * which the plugin writes just above the drawing: a heading copied into a
 * text element then never hides the real section.
 */
function sectionBody(
  data: string,
  heading: RegExp,
  which: "first" | "last",
  ends: (line: string) => boolean,
): string | undefined {
  let match: RegExpMatchArray | undefined;
  for (const candidate of data.matchAll(heading)) {
    match = candidate;
    if (which === "first") break;
  }
  if (match === undefined) return undefined;
  const headingEnd = (match.index ?? 0) + match[0].length;
  const afterHeading = data.slice(headingEnd).replace(/^\n/, "");
  const lines = afterHeading.split("\n");
  const kept: string[] = [];
  for (const line of lines) {
    if (ends(line)) break;
    kept.push(line);
  }
  return kept.join("\n");
}

/**
 * `## Text Elements`: each element's raw text followed by ` ^id` at the end
 * of its last line, elements separated by blank lines.  A text may itself
 * hold blank lines, so an element ends at its anchor, not at the blank line.
 */
function readTextElements(data: string): Map<string, string> {
  const texts = new Map<string, string>();
  const body = sectionBody(data, TEXT_ELEMENTS_HEADING, "first", (line) => DATA_SECTION_HEADING.test(line) || COMMENT_FENCE.test(line));
  if (body === undefined) return texts;

  let position = skipNewlines(body, 0);
  for (const anchor of body.matchAll(TEXT_BLOCK_ANCHOR)) {
    const anchorStart = anchor.index ?? 0;
    const id = anchor[1]!;
    // Later entries win, as they do when the plugin reads its own note.
    texts.set(id, body.slice(position, anchorStart));
    position = skipNewlines(body, anchorStart + anchor[0].length);
  }
  return texts;
}

function skipNewlines(text: string, from: number): number {
  let position = from;
  while (position < text.length && text.charAt(position) === "\n") {
    position += 1;
  }
  return position;
}

/** `## Embedded Files`: `fileId: [[link]]`, `fileId: https://...` or `fileId: $$tex$$`, one per entry. */
function readEmbeddedFiles(data: string): Map<string, ExcalidrawEmbed> {
  const embeds = new Map<string, ExcalidrawEmbed>();
  const body = sectionBody(data, EMBEDDED_FILES_HEADING, "last", (line) => /^#{1,6} /.test(line) || COMMENT_FENCE.test(line));
  if (body === undefined) return embeds;

  const lines = body.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const entry = EMBED_LINE.exec(lines[index]!);
    if (entry === null) continue;
    const id = entry[1]!;
    let value = entry[2]!.trim();
    // A formula may run over several lines until its closing `$$`.
    if (value.startsWith("$$") && !closesFormula(value)) {
      while (index + 1 < lines.length) {
        index += 1;
        value += "\n" + lines[index]!;
        if (closesFormula(value.trimEnd())) break;
      }
      value = value.trimEnd();
    }
    embeds.set(id, readEmbedValue(value));
  }
  return embeds;
}

function closesFormula(value: string): boolean {
  return value.length >= 4 && value.endsWith("$$");
}

/** Where a wikilink's target begins, `![[` or `[[`; -1 when the value is not one. */
function wikilinkStart(raw: string): number {
  if (raw.startsWith("![[")) return 3;
  if (raw.startsWith("[[")) return 2;
  return -1;
}

function readEmbedValue(raw: string): ExcalidrawEmbed {
  const linkStart = wikilinkStart(raw);
  if (linkStart >= 0) {
    const linkEnd = raw.indexOf("]]", linkStart);
    if (linkEnd >= 0) {
      const inner = raw.slice(linkStart, linkEnd);
      const bar = inner.indexOf("|");
      const link = bar >= 0 ? inner.slice(0, bar) : inner;
      const display = bar >= 0 ? inner.slice(bar + 1) : undefined;
      const rest = raw.slice(linkEnd + 2).trim();
      return {
        kind: "link",
        link,
        ...(display === undefined ? {} : { display }),
        ...(rest === "" ? {} : { rest }),
        raw,
      };
    }
  }
  if (closesFormula(raw) && raw.startsWith("$$")) {
    return { kind: "tex", tex: raw.slice(2, -2), raw };
  }
  if (URL_START.test(raw)) {
    return { kind: "url", url: raw, raw };
  }
  return { kind: "unknown", raw };
}

/** One scalar from the note's frontmatter, enough to tell the plugin's mode. */
function frontmatterValue(text: string, key: string): string | undefined {
  if (!text.startsWith("---\n")) return undefined;
  const end = text.indexOf("\n---", 3);
  if (end < 0) return undefined;
  const lines = text.slice(4, end).split("\n");
  for (const line of lines) {
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    if (line.slice(0, separator).trim() !== key) continue;
    const value = line.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    return value;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function failure(code: ExcalidrawReadErrorCode, detail: string): { readonly ok: false; readonly error: ExcalidrawReadError } {
  return { ok: false, error: { code, detail } };
}
