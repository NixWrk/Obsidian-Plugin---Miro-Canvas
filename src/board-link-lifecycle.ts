/** Detached rename and generated-relation plans; parent owns one guarded commit. */
import { cloneCanvasJson } from "./canvas-json";
import { hasAsciiControl } from "./control-characters";
import { extractMarkdownKnowledge, planNotePropertyEdges, type BoardKnowledge, type BoardReference,
  type NotePropertyEdgeAddition, type NotePropertyEdgeOptions } from "./board-knowledge";

type Data = Record<string, unknown>;
export const GENERATED_RELATION_KEY = "generatedRelation";

export interface BoardLinkDiagnostic {
  readonly code: string;
  readonly nodeId?: string;
  readonly property?: string;
}

export type BoardLinkLifecyclePlan = {
  readonly ok: true;
  readonly document: Data;
  readonly changed: boolean;
  readonly diagnostics: readonly BoardLinkDiagnostic[];
  readonly removedEdgeIds: readonly string[];
  readonly addedEdgeIds: readonly string[];
} | { readonly ok: false; readonly reason: "invalid-document" | "invalid-path" | "invalid-evidence" | "invalid-edge-id" | "planning-failed" };

export interface BoardRenameOptions {
  readonly sourcePath: string;
  readonly oldPath: string;
  readonly newPath: string;
  readonly folder?: boolean;
  readonly preRename: BoardKnowledge;
  /** Closed boards: native Canvas owns nodes/text/edges; plan only properties/redirects. */
  readonly metadataOnly?: boolean;
  /** Historical evidence only. Never supply a current post-rename resolver. */
  readonly textTargetBeforeRename?: (reference: BoardReference, sourcePath: string) => string | undefined;
}

export interface NotePropertyReconciliationOptions extends NotePropertyEdgeOptions {
  readonly enabled?: boolean;
  readonly createEdgeId: (addition: NotePropertyEdgeAddition, index: number) => string;
}

interface GeneratedRelation extends Data {
  owner: "miro-canvas";
  kind: "note-property";
  version: 1;
  fromNode: string;
  toNode: string;
  property: string;
  sourcePath: string;
  targetPath: string;
}

function record(value: unknown): value is Data {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function vaultPath(path: string): boolean {
  return path.length > 0 && path.length <= 4096 && !path.includes("\\") && !path.includes(":") && !hasAsciiControl(path)
    && path.split("/").every(part => part !== "" && part !== "." && part !== "..");
}

function checked(document: unknown): Data | undefined {
  if (!record(document)) return undefined;
  const nodes: unknown = Object.getOwnPropertyDescriptor(document, "nodes")?.value;
  const edges: unknown = Object.getOwnPropertyDescriptor(document, "edges")?.value;
  if (!Array.isArray(nodes) || !Array.isArray(edges) || nodes.length > 20_000 || edges.length > 50_000) return undefined;
  let copy: Data;
  try { copy = cloneCanvasJson(document); } catch { return undefined; }
  const ids = new Set<string>();
  let characters = 0;
  for (const node of copy.nodes as unknown[]) {
    if (!record(node) || typeof node.id !== "string" || !node.id || ids.has(node.id) || typeof node.type !== "string"
      || node.type === "text" && typeof node.text !== "string" || node.type === "file" && typeof node.file !== "string") return undefined;
    ids.add(node.id);
    if (node.type === "text") characters += (node.text as string).length;
  }
  if (characters > 8 * 1024 * 1024) return undefined;
  const nodeIds = new Set(ids);
  for (const edge of copy.edges as unknown[]) {
    if (!record(edge) || typeof edge.id !== "string" || !edge.id || ids.has(edge.id)
      || typeof edge.fromNode !== "string" || typeof edge.toNode !== "string"
      || !nodeIds.has(edge.fromNode) || !nodeIds.has(edge.toNode)) return undefined;
    ids.add(edge.id);
  }
  if (copy.miroCanvas !== undefined && (!record(copy.miroCanvas)
    || copy.miroCanvas.schemaVersion !== undefined && copy.miroCanvas.schemaVersion !== 1)) return undefined;
  return copy;
}

function success(document: Data, changed: boolean, diagnostics: BoardLinkDiagnostic[] = [],
  removedEdgeIds: string[] = [], addedEdgeIds: string[] = []): BoardLinkLifecyclePlan {
  return { ok: true, document, changed, diagnostics, removedEdgeIds, addedEdgeIds };
}

function renamed(path: string, options: BoardRenameOptions): string | undefined {
  if (path === options.oldPath) return options.newPath;
  return options.folder && path.startsWith(`${options.oldPath}/`) ? options.newPath + path.slice(options.oldPath.length) : undefined;
}

function targetPath(reference: unknown): string | undefined {
  return record(reference) && typeof reference.resolvedPath === "string" && vaultPath(reference.resolvedPath) ? reference.resolvedPath : undefined;
}

/** Change only the destination token of an already-proven inline reference. */
function rewriteReference(original: string, destination: string): string | undefined {
  const wiki = /^(?<open>!?\[\[)(?<body>[\s\S]*)(?<close>\]\])$/u.exec(original);
  if (wiki?.groups) {
    const body = wiki.groups.body;
    let alias = body.length;
    for (let index = 0; index < body.length; index++) {
      if (body[index] === "\\") index++;
      else if (body[index] === "|") { alias = index; break; }
    }
    const raw = body.slice(0, alias);
    const hash = raw.indexOf("#");
    const oldPath = hash < 0 ? raw : raw.slice(0, hash);
    // A self-reference stays valid after its own board is renamed.
    if (oldPath === "") return original;
    let path = destination;
    if (!/\.md$/iu.test(oldPath) && /\.md$/iu.test(path)) path = path.slice(0, -3);
    if (/%[\da-f]{2}/iu.test(oldPath)) path = path.split("/").map(encodeURIComponent).join("/");
    else if (["#", "|", "[", "]"].some(char => path.includes(char))) return undefined;
    return wiki.groups.open + path + (hash < 0 ? "" : raw.slice(hash)) + body.slice(alias) + wiki.groups.close;
  }
  const start = original.startsWith("![") ? 1 : 0;
  if (original[start] !== "[") return undefined;
  let depth = 1;
  let close = start + 1;
  for (; close < original.length; close++) {
    if (original[close] === "\\") close++;
    else if (original[close] === "[") depth++;
    else if (original[close] === "]" && --depth === 0) break;
  }
  if (original.slice(close, close + 2) !== "](" || !original.endsWith(")")) return undefined;
  let offset = close + 2;
  while (/\s/u.test(original[offset] ?? "")) offset++;
  const angle = original[offset] === "<";
  if (angle) offset++;
  let end = offset;
  depth = 0;
  for (; end < original.length - 1; end++) {
    const char = original[end];
    if (char === "\\") end++;
    else if (angle && char === ">") break;
    else if (!angle && depth === 0 && /\s/u.test(char)) break;
    else if (!angle && char === "(") depth++;
    else if (!angle && char === ")") { if (depth === 0) break; depth--; }
  }
  if (angle && original[end] !== ">") return undefined;
  const raw = original.slice(offset, end);
  const hash = raw.indexOf("#");
  if (raw.startsWith("#")) return original;
  let path = destination;
  if (!/\.md$/iu.test(hash < 0 ? raw : raw.slice(0, hash)) && /\.md$/iu.test(path)) path = path.slice(0, -3);
  path = path.split("/").map(part => encodeURIComponent(part).replace(/[()]/gu, char => char === "(" ? "%28" : "%29")).join("/");
  return original.slice(0, offset) + path + (hash < 0 ? "" : raw.slice(hash)) + original.slice(end);
}

interface Edit { start: number; end: number; before: string; after: string }

function applyEdits(text: string, edits: Edit[]): string | undefined {
  const unique = new Map<string, Edit>();
  for (const edit of edits) {
    if (!Number.isInteger(edit.start) || !Number.isInteger(edit.end) || edit.start < 0 || edit.end <= edit.start
      || edit.end > text.length || text.slice(edit.start, edit.end) !== edit.before) return undefined;
    const key = `${edit.start}:${edit.end}`;
    const prior = unique.get(key);
    if (prior && prior.after !== edit.after) return undefined;
    unique.set(key, edit);
  }
  const ordered = [...unique.values()].sort((left, right) => right.start - left.start);
  let previous = text.length;
  let result = text;
  for (const edit of ordered) {
    if (edit.end > previous) return undefined;
    result = result.slice(0, edit.start) + edit.after + result.slice(edit.end);
    previous = edit.start;
  }
  return result;
}

interface Leaf { container: Data | unknown[]; key: string; path: string[]; value: string }

function leaves(value: unknown, path: string[] = [], result: Leaf[] = []): Leaf[] {
  if (!record(value) && !Array.isArray(value)) return result;
  for (const [key, child] of Object.entries(value)) {
    const at = [...path, key];
    if (typeof child === "string") result.push({ container: value, key, path: at, value: child });
    else leaves(child, at, result);
  }
  return result;
}

function leafValue(value: unknown, path: readonly string[]): unknown {
  let current = value;
  for (const key of path) {
    if ((!record(current) && !Array.isArray(current)) || !Object.prototype.hasOwnProperty.call(current, key)) return undefined;
    current = (current as Data)[key];
  }
  return current;
}

/** Absolute native paths plus proven cached references; no current resolver is called. */
export function planBoardLinkRename(document: unknown, options: BoardRenameOptions): BoardLinkLifecyclePlan {
  try {
    if (![options.sourcePath, options.oldPath, options.newPath].every(vaultPath)) return { ok: false, reason: "invalid-path" };
    const next = checked(document);
    if (!next) return { ok: false, reason: "invalid-document" };
    const evidence = options.preRename;
    if (!record(evidence) || !Array.isArray(evidence.links) || !Array.isArray(evidence.embeds)
      || !Array.isArray(evidence.frontmatterLinks)) return { ok: false, reason: "invalid-evidence" };
    let changed = false;
    const diagnostics: BoardLinkDiagnostic[] = [];
    const metadata = record(next.miroCanvas) ? next.miroCanvas : undefined;
    const updatePath = (item: Data, key: string): void => {
      const old = item[key];
      if (typeof old !== "string" || !vaultPath(old)) return;
      const replacement = renamed(old, options);
      if (replacement !== undefined && old !== replacement) { item[key] = replacement; changed = true; }
    };
    for (const node of next.nodes as Data[]) {
      if (options.metadataOnly) break;
      if (node.type === "file") updatePath(node, "file");
      if (node.type === "group") updatePath(node, "background");
      if (node.type !== "text" || typeof node.text !== "string") continue;
      const edits: Edit[] = [];
      const parsed = extractMarkdownKnowledge(node.text, node.id as string);
      const currentReferences = new Set([...parsed.links, ...parsed.embeds]
        .map(ref => JSON.stringify([ref.position.start.offset, ref.position.end.offset, ref.original])));
      for (const ref of [...evidence.links, ...evidence.embeds]) {
        if (ref.position?.nodeId !== node.id) continue;
        const destination = targetPath(ref) ?? options.textTargetBeforeRename?.(ref, options.sourcePath);
        if (destination === undefined) { diagnostics.push({ code: "missing-text-target", nodeId: node.id as string }); continue; }
        const moved = renamed(destination, options);
        if (moved === undefined) continue;
        if (!currentReferences.has(JSON.stringify([ref.position.start.offset, ref.position.end.offset, ref.original]))) {
          diagnostics.push({ code: "stale-text-reference", nodeId: node.id as string });
          continue;
        }
        const replacement = rewriteReference(ref.original, moved);
        if (replacement === undefined) { diagnostics.push({ code: "unsupported-link-syntax", nodeId: node.id as string }); continue; }
        edits.push({ start: ref.position.start.offset, end: ref.position.end.offset, before: ref.original, after: replacement });
      }
      const replacement = applyEdits(node.text, edits);
      if (replacement === undefined) diagnostics.push({ code: "stale-text-reference", nodeId: node.id as string });
      else if (replacement !== node.text) { node.text = replacement; changed = true; }
    }
    if (metadata && record(metadata.nodeRedirects)) {
      for (const redirect of Object.values(metadata.nodeRedirects)) if (record(redirect)) updatePath(redirect, "file");
    }
    if (metadata && record(metadata.properties)) {
      for (const leaf of leaves(metadata.properties)) {
        const key = leaf.path.join(".");
        if (leafValue(evidence.frontmatter, leaf.path) !== leaf.value) {
          diagnostics.push({ code: "stale-property-reference", property: key });
          continue;
        }
        const parsed = extractMarkdownKnowledge(leaf.value);
        const edits: Edit[] = [];
        for (const ref of [...parsed.links, ...parsed.embeds]) {
          const candidates = evidence.frontmatterLinks.filter(prior => prior.key === key && prior.link === ref.link
            && prior.original === ref.original && !((prior as unknown as Data).nodeId));
          const destinations = new Set(candidates.map(targetPath));
          if (destinations.size !== 1 || destinations.has(undefined)) {
            if (candidates.length) diagnostics.push({ code: "ambiguous-property-target", property: key });
            continue;
          }
          const destination = destinations.values().next().value as string;
          const moved = renamed(destination, options);
          if (moved === undefined) continue;
          const replacement = rewriteReference(ref.original, moved);
          if (replacement === undefined) { diagnostics.push({ code: "unsupported-link-syntax", property: key }); continue; }
          edits.push({ start: ref.position.start.offset, end: ref.position.end.offset, before: ref.original, after: replacement });
        }
        const replacement = applyEdits(leaf.value, edits);
        if (replacement !== undefined && replacement !== leaf.value) {
          Object.defineProperty(leaf.container, leaf.key, { value: replacement, enumerable: true, configurable: true, writable: true });
          changed = true;
        }
      }
    }
    for (const edge of next.edges as Data[]) {
      if (options.metadataOnly) break;
      const marker = generated(edge);
      if (marker) { updatePath(marker, "sourcePath"); updatePath(marker, "targetPath"); }
    }
    return success(next, changed, diagnostics);
  } catch { return { ok: false, reason: "planning-failed" }; }
}

function generated(edge: Data): GeneratedRelation | undefined {
  const marker = record(edge.miroCanvas) ? edge.miroCanvas[GENERATED_RELATION_KEY] : undefined;
  if (!record(marker) || marker.owner !== "miro-canvas" || marker.kind !== "note-property" || marker.version !== 1
    || marker.fromNode !== edge.fromNode || marker.toNode !== edge.toNode || typeof marker.property !== "string" || !marker.property
    || typeof marker.sourcePath !== "string" || !vaultPath(marker.sourcePath) || typeof marker.targetPath !== "string" || !vaultPath(marker.targetPath)) return undefined;
  return marker as GeneratedRelation;
}

function relationKey(relation: Pick<NotePropertyEdgeAddition, "fromNode" | "toNode" | "property">): string {
  return JSON.stringify([relation.fromNode, relation.toNode, relation.property]);
}

function newMarker(relation: NotePropertyEdgeAddition): GeneratedRelation {
  return { owner: "miro-canvas", kind: "note-property", version: 1, fromNode: relation.fromNode,
    toNode: relation.toNode, property: relation.property, sourcePath: relation.sourcePath, targetPath: relation.targetPath };
}

/** Missing note caches preserve generated connections; no manual connection is removed. */
export function planReconcileNotePropertyEdges(document: unknown, options: NotePropertyReconciliationOptions): BoardLinkLifecyclePlan {
  try {
    const next = checked(document);
    if (!next) return { ok: false, reason: "invalid-document" };
    if (!vaultPath(options.sourcePath)) return { ok: false, reason: "invalid-path" };
    const edges = next.edges as Data[];
    const incomplete = new Set<string>();
    const diagnostics: BoardLinkDiagnostic[] = [];
    const caches = new Map<string, ReturnType<NotePropertyEdgeOptions["getNoteCache"]>>();
    const getNoteCache: NotePropertyEdgeOptions["getNoteCache"] = path => {
      if (!caches.has(path)) {
        const cache = options.getNoteCache(path);
        caches.set(path, cache);
        if (!cache || cache.frontmatter !== undefined && !record(cache.frontmatter)) incomplete.add(path);
      }
      return caches.get(path);
    };
    // Generated connections must not suppress their own desired relations.
    const desired = options.enabled === false ? [] : planNotePropertyEdges({ ...next, edges: edges.filter(edge => !generated(edge)) }, { ...options, getNoteCache });
    const wanted = new Map(desired.map(relation => [relationKey(relation), relation]));
    const kept: Data[] = [];
    const removed: string[] = [];
    let changed = false;
    for (const edge of edges) {
      const marker = generated(edge);
      if (!marker) { kept.push(edge); continue; }
      const key = relationKey(marker);
      const desiredRelation = wanted.get(key);
      if (desiredRelation) {
        wanted.delete(key);
        if (marker.sourcePath !== desiredRelation.sourcePath || marker.targetPath !== desiredRelation.targetPath) {
          marker.sourcePath = desiredRelation.sourcePath;
          marker.targetPath = desiredRelation.targetPath;
          changed = true;
        }
        kept.push(edge);
      } else if (options.enabled !== false && (incomplete.has(marker.sourcePath) || !caches.has(marker.sourcePath))) {
        kept.push(edge);
        diagnostics.push({ code: "note-cache-unavailable", nodeId: marker.fromNode, property: marker.property });
      } else { removed.push(edge.id as string); changed = true; }
    }
    const taken = new Set([...next.nodes as Data[], ...edges].map(item => item.id));
    if (record(next.miroCanvas) && record(next.miroCanvas.connectors)) {
      for (const [key, connector] of Object.entries(next.miroCanvas.connectors)) {
        taken.add(key);
        if (record(connector)) taken.add(connector.id);
      }
    }
    const added: string[] = [];
    if (kept.length + wanted.size > 50_000) return { ok: false, reason: "invalid-document" };
    for (const relation of wanted.values()) {
      const id = options.createEdgeId(relation, added.length);
      if (typeof id !== "string" || !id || id.length > 256 || hasAsciiControl(id) || taken.has(id)
        || ["__proto__", "constructor", "prototype"].includes(id)) return { ok: false, reason: "invalid-edge-id" };
      taken.add(id);
      kept.push({ id, fromNode: relation.fromNode, toNode: relation.toNode, fromSide: "right", toSide: "left", toEnd: "arrow",
        label: relation.property, miroCanvas: { [GENERATED_RELATION_KEY]: newMarker(relation) } });
      added.push(id);
      changed = true;
    }
    // Surviving edges keep their order, IDs, appearance and unknown fields.
    next.edges = kept;
    return success(next, changed, diagnostics, removed, added);
  } catch { return { ok: false, reason: "planning-failed" }; }
}
