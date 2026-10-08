/** Detached, runtime-free knowledge about the words and attachments on a board. */
export interface BoardLocation {
  line: number;
  col: number;
  offset: number;
}

/** Offsets are local UTF-16 Markdown offsets; end is exclusive. */
export interface BoardPosition {
  nodeId?: string;
  start: BoardLocation;
  end: BoardLocation;
}

export interface BoardReference {
  link: string;
  original: string;
  displayText: string;
  position: BoardPosition;
  /** Runtime-only last resolved vault path; absent for unresolved/pure references. */
  resolvedPath?: string;
}

export interface BoardPropertyReference {
  /** Dot-separated object keys and array indexes, as in a frontmatter cache. */
  key: string;
  link: string;
  original: string;
  displayText: string;
  /** Runtime-only last resolved vault path; absent for unresolved/pure references. */
  resolvedPath?: string;
}

export interface BoardTag {
  tag: string;
  position: BoardPosition;
}

export interface BoardNodeRedirect {
  file: string;
  nodeId: string;
  [key: string]: unknown;
}

/** Additional native CachedMetadata fields can be merged by the runtime. */
export interface NodeKnowledge {
  frontmatter?: Record<string, unknown>;
  frontmatterLinks?: BoardPropertyReference[];
  links: BoardReference[];
  embeds: BoardReference[];
  tags: BoardTag[];
  [key: string]: unknown;
}

export interface BoardKnowledge extends NodeKnowledge {
  /** Cache projection of miroCanvas.properties, never a new persisted root. */
  frontmatter?: Record<string, unknown>;
  frontmatterLinks: BoardPropertyReference[];
  nodes: Record<string, NodeKnowledge>;
  aliases: string[];
  cssclasses: string[];
  /** Moved-card targets for the parent's link resolver; these are not references. */
  nodeRedirects?: Record<string, BoardNodeRedirect>;
}

export interface NotePropertyEdgeOptions {
  sourcePath: string;
  /** Top-level names or dotted paths; omitted selects all, empty selects none. */
  properties?: readonly string[];
  resolveLink: (link: string, sourcePath: string) => string | null | undefined;
  getNoteCache: (path: string) => { frontmatter?: Record<string, unknown> } | null | undefined;
}

/** The caller assigns IDs and applies additions through its guarded writer. */
export interface NotePropertyEdgeAddition {
  fromNode: string;
  toNode: string;
  property: string;
  link: string;
  sourcePath: string;
  targetPath: string;
}

interface ParsedReference {
  link: string;
  displayText: string;
  end: number;
  embed: boolean;
}

interface Destination {
  link: string;
  end: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** Detach JSON properties without invoking toJSON or dropping unknown keys. */
function cloneJson(value: unknown, ancestors = new Set<object>()): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (!Array.isArray(value) && !isRecord(value)) throw new Error("Properties must be JSON");
  if (ancestors.has(value)) throw new Error("Properties must not contain cycles");
  ancestors.add(value);
  try {
    if (Array.isArray(value)) return value.map((entry: unknown) => cloneJson(entry, ancestors));
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      Object.defineProperty(result, key, { value: cloneJson(entry, ancestors), enumerable: true, writable: true, configurable: true });
    }
    return result;
  } finally {
    ancestors.delete(value);
  }
}

function readProperties(document: Record<string, unknown>): Record<string, unknown> | undefined {
  const own = isRecord(document.miroCanvas) ? document.miroCanvas.properties : undefined;
  const imported = isRecord(document.metadata) ? document.metadata.frontmatter : undefined;
  const candidate = isRecord(own) ? own : imported;
  if (!isRecord(candidate)) return undefined;
  try {
    return cloneJson(candidate) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function emptyKnowledge(): NodeKnowledge {
  return { links: [], embeds: [], tags: [] };
}

function zeroPosition(nodeId?: string): BoardPosition {
  return {
    ...(nodeId === undefined ? {} : { nodeId }),
    start: { line: 0, col: 0, offset: 0 },
    end: { line: 0, col: 0, offset: 0 },
  };
}

function isInternal(link: string): boolean {
  return link.length > 0 && !/^(?:[a-z][a-z\d+.-]*:|\/\/)/iu.test(link);
}

function unescapeMarkdown(text: string): string {
  return text.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~])/gu, "$1");
}

function decodeDestination(text: string): string {
  const unescaped = unescapeMarkdown(text).replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/giu, (entity) => {
    const named: Record<string, string> = { "&amp;": "&", "&quot;": '"', "&apos;": "'", "&lt;": "<", "&gt;": ">" };
    const replacement = named[entity.toLowerCase()];
    if (replacement !== undefined) return replacement;
    const hexadecimal = entity[2]?.toLowerCase() === "x";
    const point = Number.parseInt(entity.slice(hexadecimal ? 3 : 2, -1), hexadecimal ? 16 : 10);
    return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : entity;
  });
  try {
    return decodeURIComponent(unescaped);
  } catch {
    return unescaped;
  }
}

function escapedAt(text: string, offset: number): boolean {
  let slashes = 0;
  for (let cursor = offset - 1; cursor >= 0 && text[cursor] === "\\"; cursor -= 1) slashes += 1;
  return slashes % 2 === 1;
}

/** Mask code and comments in place so all later offsets still refer to the card. */
function excludedMarkdown(text: string): Uint8Array {
  const excluded = new Uint8Array(text.length);
  let cursor = 0;
  let fence: { marker: string; length: number } | undefined;
  while (cursor < text.length) {
    if (cursor === 0 || text[cursor - 1] === "\n") {
      const newline = text.indexOf("\n", cursor);
      const end = newline < 0 ? text.length : newline + 1;
      const line = text.slice(cursor, end).replace(/\r?\n$/u, "");
      const marker = /^ {0,3}(?:> ?)*(`{3,}|~{3,})(.*)$/u.exec(line);
      if (fence !== undefined) {
        excluded.fill(1, cursor, end);
        if (marker !== null && marker[1][0] === fence.marker && marker[1].length >= fence.length && marker[2].trim() === "") fence = undefined;
        cursor = end;
        continue;
      }
      if (marker !== null && !(marker[1][0] === "`" && marker[2].includes("`"))) {
        fence = { marker: marker[1][0], length: marker[1].length };
        excluded.fill(1, cursor, end);
        cursor = end;
        continue;
      }
      if (/^(?: {4}|\t)/u.test(line)) {
        excluded.fill(1, cursor, end);
        cursor = end;
        continue;
      }
    }
    if (text[cursor] === "\\") {
      cursor += 2;
      continue;
    }
    const comment = text.startsWith("<!--", cursor) ? { opener: "<!--", closer: "-->" }
      : text.startsWith("%%", cursor) ? { opener: "%%", closer: "%%" } : undefined;
    if (comment !== undefined) {
      const closing = text.indexOf(comment.closer, cursor + comment.opener.length);
      const end = closing < 0 ? text.length : closing + comment.closer.length;
      excluded.fill(1, cursor, end);
      cursor = end;
      continue;
    }
    if (text[cursor] === "`") {
      let runEnd = cursor + 1;
      while (text[runEnd] === "`") runEnd += 1;
      const marker = text.slice(cursor, runEnd);
      let closing = text.indexOf(marker, runEnd);
      while (closing >= 0 && (text[closing - 1] === "`" || text[closing + marker.length] === "`")) closing = text.indexOf(marker, closing + marker.length);
      if (closing >= 0) {
        const end = closing + marker.length;
        excluded.fill(2, cursor, end);
        cursor = end;
        continue;
      }
      cursor = runEnd;
      continue;
    }
    cursor += 1;
  }
  return excluded;
}

function destinationAt(text: string, start: number): Destination | undefined {
  if (text[start] === "<") {
    let cursor = start + 1;
    while (cursor < text.length && text[cursor] !== "\n" && text[cursor] !== "\r") {
      if (text[cursor] === "\\") cursor += 2;
      else if (text[cursor] === ">") return { link: decodeDestination(text.slice(start + 1, cursor)), end: cursor + 1 };
      else cursor += 1;
    }
    return undefined;
  }
  let depth = 0;
  let cursor = start;
  while (cursor < text.length) {
    const character = text[cursor];
    if (character === "\\" && cursor + 1 < text.length) {
      cursor += 2;
      continue;
    }
    if (/\s/u.test(character)) break;
    if (character === "(") depth += 1;
    if (character === ")") {
      if (depth === 0) break;
      depth -= 1;
    }
    cursor += 1;
  }
  if (depth !== 0) return undefined;
  return { link: decodeDestination(text.slice(start, cursor)), end: cursor };
}

function referenceLabel(text: string): string {
  return unescapeMarkdown(text).trim().replace(/\s+/gu, " ").toLowerCase();
}

function referenceDefinitions(text: string, excluded: Uint8Array): Map<string, string> {
  const definitions = new Map<string, string>();
  const lines = /^ {0,3}\[([^\]\n]+)\]:[ \t]*/gmu;
  for (const match of text.matchAll(lines)) {
    const offset = match.index;
    if (excluded[offset] || match[1]?.startsWith("^")) continue;
    const destination = destinationAt(text, offset + match[0].length);
    if (destination === undefined || destination.link === "") continue;
    const label = referenceLabel(match[1]);
    if (!definitions.has(label)) definitions.set(label, destination.link);
    const newline = text.indexOf("\n", offset);
    excluded.fill(1, offset, newline < 0 ? text.length : newline);
  }
  return definitions;
}

function referenceAt(text: string, start: number, definitions: ReadonlyMap<string, string>): ParsedReference | undefined {
  const embed = text[start] === "!";
  const opening = start + (embed ? 1 : 0);
  if (text[opening] !== "[") return undefined;
  if (text[opening + 1] === "[") {
    let cursor = opening + 2;
    let separator = -1;
    while (cursor < text.length && text[cursor] !== "\n" && text[cursor] !== "\r") {
      if (text[cursor] === "\\") {
        cursor += 2;
        continue;
      }
      if (text[cursor] === "|" && separator < 0) separator = cursor;
      if (text.startsWith("]]", cursor)) {
        const link = unescapeMarkdown(text.slice(opening + 2, separator < 0 ? cursor : separator).trim());
        const displayText = separator < 0 ? link : unescapeMarkdown(text.slice(separator + 1, cursor));
        return { link, displayText, end: cursor + 2, embed };
      }
      cursor += 1;
    }
    return undefined;
  }
  let cursor = opening + 1;
  let depth = 1;
  while (cursor < text.length && depth > 0) {
    if (text[cursor] === "\\") cursor += 2;
    else {
      if (text[cursor] === "[") depth += 1;
      if (text[cursor] === "]") depth -= 1;
      cursor += 1;
    }
  }
  if (depth !== 0) return undefined;
  const label = text.slice(opening + 1, cursor - 1);
  const displayText = unescapeMarkdown(label);
  if (text[cursor] === "(") {
    cursor += 1;
    while (/\s/u.test(text[cursor] ?? "") && cursor < text.length) cursor += 1;
    const destination = destinationAt(text, cursor);
    if (destination === undefined) return undefined;
    cursor = destination.end;
    const beforeWhitespace = cursor;
    while (/\s/u.test(text[cursor] ?? "") && cursor < text.length) cursor += 1;
    if (cursor > beforeWhitespace && ['"', "'", "("].includes(text[cursor] ?? "")) {
      const quote = text[cursor] === "(" ? ")" : text[cursor];
      cursor += 1;
      while (cursor < text.length && (text[cursor] !== quote || escapedAt(text, cursor))) cursor += 1;
      if (cursor === text.length) return undefined;
      cursor += 1;
      while (/\s/u.test(text[cursor] ?? "") && cursor < text.length) cursor += 1;
    }
    if (text[cursor] !== ")") return undefined;
    return { link: destination.link, displayText, end: cursor + 1, embed };
  }
  let id = label;
  if (text[cursor] === "[") {
    const closing = text.indexOf("]", cursor + 1);
    if (closing < 0) return undefined;
    id = text.slice(cursor + 1, closing) || label;
    cursor = closing + 1;
  }
  const link = definitions.get(referenceLabel(id));
  return link === undefined ? undefined : { link, displayText, end: cursor, embed };
}

function positionFactory(text: string, nodeId?: string): (start: number, end: number) => BoardPosition {
  const starts = [0];
  for (let cursor = 0; cursor < text.length; cursor += 1) {
    if (text[cursor] === "\n") starts.push(cursor + 1);
  }
  const locate = (offset: number): BoardLocation => {
    let lower = 0;
    let upper = starts.length;
    while (lower + 1 < upper) {
      const middle = Math.floor((lower + upper) / 2);
      if (starts[middle] <= offset) lower = middle;
      else upper = middle;
    }
    return { line: lower, col: offset - starts[lower], offset };
  };
  return (start, end) => ({ ...(nodeId === undefined ? {} : { nodeId }), start: locate(start), end: locate(end) });
}

/** Parse internal references only, without changing or concatenating card text. */
export function extractMarkdownKnowledge(text: string, nodeId?: string): NodeKnowledge {
  const result = emptyKnowledge();
  const excluded = excludedMarkdown(text);
  const definitions = referenceDefinitions(text, excluded);
  const position = positionFactory(text, nodeId);
  let cursor = 0;
  while (cursor < text.length) {
    if (excluded[cursor]) {
      cursor += 1;
      continue;
    }
    if (text[cursor] === "\\") {
      cursor += 2;
      continue;
    }
    if (text[cursor] === "[" || (text[cursor] === "!" && text[cursor + 1] === "[")) {
      const reference = referenceAt(text, cursor, definitions);
      if (reference !== undefined) {
        // A comment or code fence cannot join two pieces into a card link.
        let crossesExcluded = false;
        for (let index = cursor; index < reference.end; index += 1) {
          if (excluded[index] === 1) crossesExcluded = true;
        }
        if (isInternal(reference.link) && !crossesExcluded) {
          const entry = { link: reference.link, original: text.slice(cursor, reference.end), displayText: reference.displayText, position: position(cursor, reference.end) };
          (reference.embed ? result.embeds : result.links).push(entry);
        }
        cursor = reference.end;
        continue;
      }
    }
    if (text[cursor] === "#" && (cursor === 0 || !/[\p{L}\p{M}\p{N}_/#\\]/u.test(text[cursor - 1]))) {
      const match = /^#[\p{L}\p{M}\p{N}_/-]+/u.exec(text.slice(cursor));
      if (match !== null && /[\p{L}\p{M}_-]/u.test(match[0]) && !match[0].endsWith("/") && !match[0].includes("//")) {
        const end = cursor + match[0].length;
        result.tags.push({ tag: match[0], position: position(cursor, end) });
        cursor = end;
        continue;
      }
    }
    cursor += 1;
  }
  return result;
}

/** References retain each nested property path; bare strings are not links. */
export function extractPropertyReferences(frontmatter: Record<string, unknown>): BoardPropertyReference[] {
  const result: BoardPropertyReference[] = [];
  const ancestors = new Set<object>();
  const visit = (value: unknown, key: string): void => {
    if (typeof value === "string") {
      const knowledge = extractMarkdownKnowledge(value);
      const references = [...knowledge.links, ...knowledge.embeds].sort((left, right) => left.position.start.offset - right.position.start.offset);
      for (const reference of references) {
        result.push({ key, link: reference.link, original: reference.original, displayText: reference.displayText });
      }
      return;
    }
    if ((!Array.isArray(value) && !isRecord(value)) || ancestors.has(value)) return;
    ancestors.add(value);
    for (const [childKey, child] of Object.entries(value)) visit(child, key === "" ? childKey : `${key}.${childKey}`);
    ancestors.delete(value);
  };
  visit(frontmatter, "");
  return result;
}

function normalizedStrings(value: unknown, split: RegExp, splitListEntries = true): string[] {
  const values = Array.isArray(value) ? value : [value];
  const strings: string[] = [];
  for (const entry of values) {
    if (typeof entry !== "string") continue;
    for (const part of Array.isArray(value) && !splitListEntries ? [entry] : entry.split(split)) {
      const trimmed = part.trim();
      if (trimmed !== "" && !strings.includes(trimmed)) strings.push(trimmed);
    }
  }
  return strings;
}

/** A board must at least have complete native node and edge lists. */
function boardDocument(document: unknown): Record<string, unknown> | undefined {
  if (!isRecord(document) || !Array.isArray(document.nodes) || !Array.isArray(document.edges)) return undefined;
  const nodeIds = new Set<string>();
  for (const node of document.nodes as unknown[]) {
    if (!isRecord(node) || typeof node.id !== "string" || node.id === "" || typeof node.type !== "string" || nodeIds.has(node.id)) return undefined;
    if (node.type === "text" && typeof node.text !== "string") return undefined;
    if (node.type === "file" && typeof node.file !== "string") return undefined;
    nodeIds.add(node.id);
  }
  const edgeIds = new Set<string>();
  for (const edge of document.edges as unknown[]) {
    if (!isRecord(edge) || typeof edge.id !== "string" || edge.id === "" || edgeIds.has(edge.id)
      || typeof edge.fromNode !== "string" || typeof edge.toNode !== "string") return undefined;
    edgeIds.add(edge.id);
  }
  return document;
}

/** Reads only miroCanvas.properties, with Advanced Canvas's import fallback. */
export function extractBoardKnowledge(document: unknown): BoardKnowledge | null {
  const board = boardDocument(document);
  if (board === undefined) return null;
  const frontmatter = readProperties(board);
  const result: BoardKnowledge = {
    ...emptyKnowledge(),
    ...(frontmatter === undefined ? {} : { frontmatter }),
    frontmatterLinks: frontmatter === undefined ? [] : extractPropertyReferences(frontmatter),
    nodes: {},
    aliases: normalizedStrings(frontmatter?.aliases ?? frontmatter?.alias, /,/u, false),
    cssclasses: normalizedStrings(frontmatter?.cssclasses ?? frontmatter?.cssclass, /[\s,]+/u),
  };
  const redirects = isRecord(board.miroCanvas) ? board.miroCanvas.nodeRedirects : undefined;
  if (isRecord(redirects)) {
    const retained: Record<string, BoardNodeRedirect> = {};
    for (const [id, redirect] of Object.entries(redirects)) {
      if (!isRecord(redirect) || typeof redirect.file !== "string" || typeof redirect.nodeId !== "string") continue;
      try {
        Object.defineProperty(retained, id, { value: cloneJson(redirect), enumerable: true, writable: true, configurable: true });
      } catch {
        // Invalid non-JSON redirects cannot become resolver inputs.
      }
    }
    result.nodeRedirects = retained;
  }
  const propertyTags = normalizedStrings(frontmatter?.tags ?? frontmatter?.tag, /[\s,]+/u);
  const seenTags = new Set<string>();
  for (const raw of propertyTags) {
    const tag = raw.startsWith("#") ? raw : `#${raw}`;
    if (/^#[\p{L}\p{M}\p{N}_-]+(?:\/[\p{L}\p{M}\p{N}_-]+)*$/u.test(tag) && /[\p{L}\p{M}_-]/u.test(tag) && !seenTags.has(tag)) {
      result.tags.push({ tag, position: zeroPosition() });
      seenTags.add(tag);
    }
  }
  for (const node of board.nodes as Record<string, unknown>[]) {
    const nodeId = node.id as string;
    const knowledge = node.type === "text" ? extractMarkdownKnowledge(node.text as string, nodeId) : emptyKnowledge();
    const file = node.type === "file" ? node.file : node.type === "group" ? node.background : undefined;
    if (typeof file === "string" && isInternal(file)) {
      const link = file + (node.type === "file" && typeof node.subpath === "string" ? node.subpath : "");
      knowledge.embeds.push({ link, original: `![[${link}]]`, displayText: link, position: zeroPosition(nodeId) });
    }
    if (node.type === "text") Object.defineProperty(result.nodes, nodeId, { value: knowledge, enumerable: true, writable: true, configurable: true });
    result.links.push(...knowledge.links);
    result.embeds.push(...knowledge.embeds);
    result.tags.push(...knowledge.tags);
  }
  return result;
}

/** Plan note-property connections, without creating, changing or deleting edges. */
export function planNotePropertyEdges(document: unknown, options: NotePropertyEdgeOptions): NotePropertyEdgeAddition[] {
  const board = boardDocument(document);
  if (board === undefined) return [];
  const resolved = new Map<string, string | null | undefined>();
  const resolve = (link: string, sourcePath: string): string | null | undefined => {
    const key = JSON.stringify([link, sourcePath]);
    if (!resolved.has(key)) resolved.set(key, options.resolveLink(link, sourcePath));
    return resolved.get(key);
  };
  const cards: { nodeId: string; path: string }[] = [];
  const cardsByPath = new Map<string, typeof cards>();
  for (const node of board.nodes as Record<string, unknown>[]) {
    if (node.type !== "file" || typeof node.file !== "string" || !isInternal(node.file)) continue;
    const path = resolve(node.file, options.sourcePath);
    if (typeof path !== "string" || !/\.md$/iu.test(path)) continue;
    const card = { nodeId: node.id as string, path };
    cards.push(card);
    const group = cardsByPath.get(path) ?? [];
    group.push(card);
    cardsByPath.set(path, group);
  }
  cards.sort((left, right) => compareStrings(left.nodeId, right.nodeId));
  for (const group of cardsByPath.values()) group.sort((left, right) => compareStrings(left.nodeId, right.nodeId));
  const existingPairs = new Set<string>();
  for (const edge of board.edges as Record<string, unknown>[]) existingPairs.add(pairKey(edge.fromNode as string, edge.toNode as string));
  const connectors = isRecord(board.miroCanvas) ? board.miroCanvas.connectors : undefined;
  if (isRecord(connectors)) {
    for (const connector of Object.values(connectors)) {
      if (!isRecord(connector) || !isRecord(connector.from) || !isRecord(connector.to)) continue;
      const from = connector.from;
      const to = connector.to;
      if (["node", "image"].includes(String(from.type)) && ["node", "image"].includes(String(to.type))
        && typeof from.nodeId === "string" && typeof to.nodeId === "string") existingPairs.add(pairKey(from.nodeId, to.nodeId));
    }
  }
  const cache = new Map<string, { property: string; reference: BoardPropertyReference }[]>();
  const additions: NotePropertyEdgeAddition[] = [];
  const planned = new Set<string>();
  for (const source of cards) {
    let references = cache.get(source.path);
    if (references === undefined) {
      references = [];
      const frontmatter = options.getNoteCache(source.path)?.frontmatter;
      if (isRecord(frontmatter)) {
        for (const [property, value] of Object.entries(frontmatter)) {
          for (const reference of extractPropertyReferences(Object.fromEntries([[property, value]]))) {
            const selected = options.properties === undefined ? property : [...options.properties]
              .filter((name) => name === property || name === reference.key || reference.key.startsWith(name + "."))
              .sort((left, right) => right.length - left.length || compareStrings(left, right))[0];
            if (selected !== undefined) references.push({ property: selected, reference });
          }
        }
      }
      cache.set(source.path, references);
    }
    for (const { property, reference } of references) {
      const destination = reference.link.split("#")[0] ?? "";
      if (destination === "") continue;
      const path = resolve(destination, source.path);
      if (typeof path !== "string" || path === source.path) continue;
      for (const target of cardsByPath.get(path) ?? []) {
        if (target.nodeId === source.nodeId) continue;
        const pair = pairKey(source.nodeId, target.nodeId);
        const key = JSON.stringify([pair, property]);
        if (existingPairs.has(pair) || planned.has(key)) continue;
        planned.add(key);
        additions.push({ fromNode: source.nodeId, toNode: target.nodeId, property, link: reference.link, sourcePath: source.path, targetPath: path });
      }
    }
  }
  return additions.sort((left, right) => compareStrings(left.fromNode, right.fromNode)
    || compareStrings(left.toNode, right.toNode) || compareStrings(left.property, right.property) || compareStrings(left.link, right.link));
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function pairKey(left: string, right: string): string {
  return JSON.stringify(left < right ? [left, right] : [right, left]);
}
