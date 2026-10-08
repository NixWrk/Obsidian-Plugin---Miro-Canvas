/** A detached selection transfer. The parent owns two-file publication and history. */
import { normalizeAnchor, resolveAnchor } from "./anchors";
import { hasAsciiControl } from "./control-characters";
import { boardConnectors, type BoardConnector } from "./board-connectors";
import { groupSelectionIds } from "./board-groups";
import { commentSelectionId, selectedComment, type SelectedRouteEnds } from "./board-selection";
import { cloneCanvasJson } from "./canvas-json";
import { buildCanvasAnchorGeometry } from "./connector-endpoints";
import { listCommentThreads } from "./local-comments";
import { createInteractionPolicy, decideEditOperation } from "./interaction-policy";
import { parseMiroCanvasMetadata } from "./metadata";

type Data = Record<string, unknown>;
const record = (value: unknown): value is Data => value !== null && typeof value === "object" && !Array.isArray(value);
const records = (value: unknown): Data[] => Array.isArray(value) ? value.filter(record) : [];

export interface EncapsulationOptions {
  readonly targetPath: string;
  readonly proxyId: string;
  readonly routeEnds?: Readonly<Record<string, SelectedRouteEnds>>;
  /** Rewrite note-relative references before their board context changes. */
  readonly rewriteText?: (text: string) => string;
}
export type EncapsulationPlan = { readonly ok: true; readonly source: Data; readonly target: Data; readonly proxyId: string; readonly movedIds: readonly string[] }
  | { readonly ok: false; readonly reason: "invalid-document" | "empty-selection" | "invalid-destination" | "blocked" | "unresolved-anchor" };

export function planEncapsulateSelection(document: unknown, selection: readonly string[], options: EncapsulationOptions): EncapsulationPlan {
  try {
    if (!record(document) || !Array.isArray(document.nodes) || !Array.isArray(document.edges)) return { ok: false, reason: "invalid-document" };
    const metadata = parseMiroCanvasMetadata(document);
    if (metadata.status !== "valid" && metadata.status !== "absent") return { ok: false, reason: "invalid-document" };
    if (!options.targetPath.endsWith(".canvas") || options.targetPath.startsWith("/") || hasAsciiControl(options.targetPath) || /[\\:]/u.test(options.targetPath)
      || options.targetPath.split("/").some((part) => part === "." || part === ".." || part === "")) return { ok: false, reason: "invalid-destination" };
    const original = cloneCanvasJson(document);
    const originalOwn = record(original.miroCanvas) ? original.miroCanvas : {};
    const originalPlaces = record(originalOwn.commentPlaces) ? originalOwn.commentPlaces : {};
    const nodes = records(original.nodes);
    const edges = records(original.edges);
    const selected = new Set(groupSelectionIds(original, selection));
    const movingNodes = nodes.filter((node) => typeof node.id === "string" && selected.has(node.id));
    if (!movingNodes.length) return { ok: false, reason: "empty-selection" };
    const moving = new Set(movingNodes.map((node) => node.id as string));
    const allIds = new Set([...nodes, ...edges, ...boardConnectors(original)].map((item) => item.id));
    if (!options.proxyId || allIds.has(options.proxyId) || ["__proto__", "constructor", "prototype"].includes(options.proxyId)) return { ok: false, reason: "invalid-destination" };
    const internalEdges = edges.filter((edge) => moving.has(edge.fromNode as string) && moving.has(edge.toNode as string));
    for (const edge of internalEdges) moving.add(edge.id as string);
    const ownLines = boardConnectors(original);
    const inside = (anchor: unknown, lineId: string): boolean => {
      const value = normalizeAnchor(anchor).anchor;
      if (value?.type === "node" || value?.type === "image") return moving.has(value.nodeId);
      if (value?.type === "edge") return moving.has(value.edgeId);
      if (value?.type === "comment") return moving.has(commentSelectionId(value.origin, value.commentId));
      return value?.type === "free" && selected.has(lineId) && (options.routeEnds?.[lineId]?.wholeRoute ?? true);
    };
    const threads = listCommentThreads(original);
    for (const id of selected) if (selectedComment(id) !== undefined) moving.add(id);
    let changed = true;
    while (changed) {
      changed = false;
      for (const line of ownLines) if (!moving.has(line.id) && inside(line.from, line.id) && inside(line.to, line.id)) {
        moving.add(line.id);
        changed = true;
      }
      for (const thread of threads) {
        const id = commentSelectionId(thread.origin, thread.id);
        if (!moving.has(id) && inside(originalPlaces[`${thread.origin}:${thread.id}`] ?? thread.anchor, id)) {
          moving.add(id);
          changed = true;
        }
      }
    }
    const policy = createInteractionPolicy(original);
    for (const id of moving) {
      const decision = decideEditOperation(policy, "delete", id);
      if (!decision.allowed || !decision.valid) return { ok: false, reason: "blocked" };
    }
    // Source evidence and unknown roots were detached once; only metadata is edited.
    const source: Data = { ...original, ...(record(original.miroCanvas) ? { miroCanvas: cloneCanvasJson(original.miroCanvas) } : {}) };
    const target: Data = { ...original, ...(record(original.miroCanvas) ? { miroCanvas: cloneCanvasJson(original.miroCanvas) } : {}) };
    const bounds = movingNodes.map((node) => ({ x: node.x as number, y: node.y as number, width: node.width as number, height: node.height as number }));
    if (bounds.some((box) => !Object.values(box).every(Number.isFinite) || box.width <= 0 || box.height <= 0)) return { ok: false, reason: "invalid-document" };
    const left = Math.min(...bounds.map((box) => box.x));
    const top = Math.min(...bounds.map((box) => box.y));
    const right = Math.max(...bounds.map((box) => box.x + box.width));
    const bottom = Math.max(...bounds.map((box) => box.y + box.height));
    const proxy = { id: options.proxyId, type: "file", file: options.targetPath, x: left, y: top, width: Math.max(240, right - left), height: Math.max(160, bottom - top) };
    const geometry = buildCanvasAnchorGeometry(original);
    const sourceOwn = record(source.miroCanvas) ? source.miroCanvas : { schemaVersion: 1 };
    const targetOwn = record(target.miroCanvas) ? target.miroCanvas : { schemaVersion: 1 };
    const sourceOverrides = record(sourceOwn.localOverrides) ? sourceOwn.localOverrides : {};
    const redirectedAnchor = (anchor: unknown): unknown => {
      const normalized = normalizeAnchor(anchor).anchor;
      if (normalized === undefined) return anchor;
      const held = normalized.type === "node" || normalized.type === "image" ? moving.has(normalized.nodeId)
        : normalized.type === "edge" ? moving.has(normalized.edgeId)
        : normalized.type === "comment" ? moving.has(commentSelectionId(normalized.origin, normalized.commentId)) : false;
      if (!held) return anchor;
      const point = resolveAnchor(normalized, geometry).point;
      if (point === undefined) throw new Error("The moved attachment has no geometry.");
      const value = record(anchor) ? { ...anchor } : {};
      for (const key of ["nodeId", "edgeId", "commentId", "origin", "t", "x", "y"]) delete value[key];
      const u = Math.max(0, Math.min(1, (point.x - proxy.x) / proxy.width));
      const v = Math.max(0, Math.min(1, (point.y - proxy.y) / proxy.height));
      // Snap to the nearest face; do not leave a connection inside the file card.
      const distance = [u, 1 - u, v, 1 - v];
      const side = distance.indexOf(Math.min(...distance));
      return { ...value, type: "node", nodeId: proxy.id, u: side === 0 ? 0 : side === 1 ? 1 : u, v: side === 2 ? 0 : side === 3 ? 1 : v };
    };
    source.nodes = [...nodes.filter((node) => !moving.has(node.id as string)), proxy];
    target.nodes = movingNodes.map((node) => typeof node.text === "string" && options.rewriteText !== undefined ? { ...node, text: options.rewriteText(node.text) } : node);
    target.edges = internalEdges;
    source.edges = edges.filter((edge) => !moving.has(edge.id as string)).map((edge) => {
      const from = moving.has(String(edge.fromNode)), to = moving.has(String(edge.toNode));
      if (!from && !to) return edge;
      const decision = decideEditOperation(policy, "edit", String(edge.id));
      if (!decision.allowed) throw new Error("An external line is locked.");
      return { ...edge, ...(from ? { fromNode: proxy.id } : {}), ...(to ? { toNode: proxy.id } : {}) };
    });
    const originalOverrides = record(originalOwn.localOverrides) ? originalOwn.localOverrides : {};
    for (const [id, value] of Object.entries(sourceOverrides)) {
      if (!record(value) || !record(value.connectorAnchors)) continue;
      value.connectorAnchors = Object.fromEntries(Object.entries(value.connectorAnchors).map(([key, anchor]) => [key, redirectedAnchor(anchor)]));
      if (moving.has(id)) sourceOverrides[id] = originalOverrides[id];
    }
    sourceOwn.localOverrides = sourceOverrides;
    for (const key of ["localOverrides", "bindings"]) {
      const values = record(originalOwn[key]) ? originalOwn[key] : {};
      sourceOwn[key] = Object.fromEntries(Object.entries(values).filter(([id]) => !moving.has(id)));
      targetOwn[key] = Object.fromEntries(Object.entries(values).filter(([id]) => moving.has(id) || !allIds.has(id)));
    }
    // Retain the redirected anchors on external native lines after partitioning.
    sourceOwn.localOverrides = Object.fromEntries(Object.entries(sourceOverrides).filter(([id]) => !moving.has(id)));
    sourceOwn.connectors = Object.fromEntries(ownLines.filter((line) => !moving.has(line.id)).map((line) => {
      const next = { ...line, from: redirectedAnchor(line.from), to: redirectedAnchor(line.to) };
      if (JSON.stringify(next) !== JSON.stringify(line) && !decideEditOperation(policy, "edit", line.id).allowed) throw new Error("An external connector is locked.");
      return [line.id, next];
    }));
    targetOwn.connectors = Object.fromEntries(ownLines.filter((line) => moving.has(line.id)).map((line: BoardConnector) => [line.id, line]));
    const movingComments = new Set(threads.filter((thread) => moving.has(commentSelectionId(thread.origin, thread.id))).map((thread) => `${thread.origin}:${thread.id}`));
    const localComments = records(originalOwn.localComments);
    const localThreads = threads.filter((thread) => thread.origin === "local");
    const stableLocal = localComments.map((comment, index) => typeof comment.id === "string" ? comment : { ...comment, id: localThreads[index]?.id });
    sourceOwn.localComments = stableLocal.filter((comment) => !movingComments.has(`local:${String(comment.id)}`));
    targetOwn.localComments = stableLocal.filter((comment) => movingComments.has(`local:${String(comment.id)}`));
    for (const key of ["commentPlaces", "commentDecorations", "commentAuthorNames"]) {
      const values = record(originalOwn[key]) ? originalOwn[key] : {};
      sourceOwn[key] = Object.fromEntries(Object.entries(values).filter(([id]) => !movingComments.has(id)));
      targetOwn[key] = Object.fromEntries(Object.entries(values).filter(([id]) => movingComments.has(id)));
    }
    const sourcePlaces = sourceOwn.commentPlaces as Data;
    const targetPlaces = targetOwn.commentPlaces as Data;
    for (const thread of threads) {
      const key = `${thread.origin}:${thread.id}`;
      const anchor = originalPlaces[key] ?? thread.anchor;
      if (movingComments.has(key)) {
        if (selected.has(commentSelectionId(thread.origin, thread.id)) && !inside(anchor, commentSelectionId(thread.origin, thread.id))) {
          const point = geometry.comments?.[key];
          if (point === undefined) throw new Error("The selected comment has no position.");
          targetPlaces[key] = { ...(record(anchor) ? anchor : {}), type: "free", x: point.x, y: point.y };
          for (const field of ["nodeId", "edgeId", "commentId", "origin", "u", "v", "t"]) delete (targetPlaces[key] as Data)[field];
        }
      } else {
        const redirected = redirectedAnchor(anchor);
        if (JSON.stringify(redirected) !== JSON.stringify(anchor)) sourcePlaces[key] = redirected;
      }
    }
    if (record(originalOwn.freeAnchors)) {
      sourceOwn.freeAnchors = Object.fromEntries(Object.entries(originalOwn.freeAnchors).map(([id, anchor]) => [id, redirectedAnchor(anchor)]));
      targetOwn.freeAnchors = Object.fromEntries(Object.entries(originalOwn.freeAnchors).filter(([id, anchor]) => inside(anchor, id)));
    }
    const hidden: readonly unknown[] = Array.isArray(originalOwn.hiddenImportedComments) ? originalOwn.hiddenImportedComments as unknown[] : [];
    const imported = threads.filter((thread) => thread.origin === "imported");
    sourceOwn.hiddenImportedComments = [...new Set([...hidden, ...imported.filter((thread) => movingComments.has(`imported:${thread.id}`)).map((thread) => thread.id)])];
    targetOwn.hiddenImportedComments = [...new Set([...hidden, ...imported.filter((thread) => !movingComments.has(`imported:${thread.id}`)).map((thread) => thread.id)])];
    const redirects = record(sourceOwn.nodeRedirects) ? sourceOwn.nodeRedirects : {};
    for (const node of movingNodes) Object.defineProperty(redirects, node.id as string, { value: { file: options.targetPath, nodeId: node.id }, enumerable: true, configurable: true, writable: true });
    sourceOwn.nodeRedirects = redirects;
    if (Array.isArray(originalOwn.zOrder)) {
      sourceOwn.zOrder = [...(originalOwn.zOrder as unknown[]).filter((id) => !moving.has(String(id))), proxy.id];
      targetOwn.zOrder = originalOwn.zOrder.filter((id) => moving.has(id as string));
    }
    if (record(targetOwn.properties)) delete targetOwn.properties.aliases;
    source.miroCanvas = sourceOwn;
    target.miroCanvas = targetOwn;
    return { ok: true, source, target, proxyId: proxy.id, movedIds: [...moving] };
  } catch {
    return { ok: false, reason: "unresolved-anchor" };
  }
}
