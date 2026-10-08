/** Collapse is presentation metadata; native boxes and source evidence stay intact. */
import { normalizeAnchor, type CanvasAnchor } from "./anchors";
import { cloneCanvasJson } from "./canvas-json";
import { listCommentThreads } from "./local-comments";

export interface GroupCollapse {
  readonly width: number;
  readonly height: number;
  readonly children: readonly string[];
  readonly [key: string]: unknown;
}
export interface CompactGroupRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
type RecordValue = Record<string, unknown>;
export const COLLAPSED_GROUP_WIDTH = 280;
export const COLLAPSED_GROUP_HEIGHT = 64;
const record = (value: unknown): value is RecordValue => value !== null && typeof value === "object" && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const records = (value: unknown): RecordValue[] => Array.isArray(value) ? value.filter(record) : [];
const map = (value: unknown): RecordValue => record(value) ? value : {};
const metadata = (document: unknown): RecordValue => record(document) ? map(document.miroCanvas) : {};

function rect(value: unknown): CompactGroupRect | undefined {
  if (!record(value) || !finite(value.x) || !finite(value.y) || !finite(value.width) || !finite(value.height)
    || value.width <= 0 || value.height <= 0) return undefined;
  return { x: value.x, y: value.y, width: value.width, height: value.height };
}
/** Board-space proxy at the same top-left; small frames are never enlarged. */
export function compactGroupRect(node: unknown): CompactGroupRect | undefined {
  const expanded = rect(node);
  return expanded === undefined ? undefined : {
    ...expanded, width: Math.min(expanded.width, COLLAPSED_GROUP_WIDTH), height: Math.min(expanded.height, COLLAPSED_GROUP_HEIGHT),
  };
}
function inside(bounds: CompactGroupRect, value: CompactGroupRect): boolean {
  return value.x >= bounds.x && value.y >= bounds.y
    && value.x + value.width <= bounds.x + bounds.width && value.y + value.height <= bounds.y + bounds.height;
}
function pointInside(bounds: CompactGroupRect, value: unknown): boolean {
  return record(value) && finite(value.x) && finite(value.y) && value.x >= bounds.x && value.y >= bounds.y
    && value.x <= bounds.x + bounds.width && value.y <= bounds.y + bounds.height;
}

export function groupCollapse(document: unknown, id: string): GroupCollapse | undefined {
  try {
    const override = map(map(metadata(document).localOverrides)[id]);
    const value = override.groupCollapse;
    if (!record(value) || !finite(value.width) || !finite(value.height) || value.width < 1 || value.height < 1
      || !Array.isArray(value.children) || value.children.length > 100_000
      || !value.children.every((child) => typeof child === "string" && child !== "")
      || new Set(value.children).size !== value.children.length) return undefined;
    return value as unknown as GroupCollapse;
  } catch {
    return undefined;
  }
}

/** Expand captured native membership once, including nested groups; never add missing IDs. */
export function groupSelectionIds(document: unknown, selected: readonly string[]): string[] {
  if (!record(document) || !Array.isArray(document.nodes)) return [...selected];
  const nodes = records(document.nodes);
  const byId = new Map(nodes.filter((node) => typeof node.id === "string").map((node) => [node.id as string, node]));
  const ids = new Set(selected);
  const queue = [...ids];
  for (let position = 0; position < queue.length; position += 1) {
    const id = queue[position];
    const node = byId.get(id);
    if (node?.type !== "group") continue;
    const bounds = rect(node);
    const collapsed = groupCollapse(document, id);
    const members = collapsed?.children ?? (bounds === undefined ? [] : nodes.filter((child) => {
      const childRect = rect(child);
      return child.id !== id && childRect !== undefined && inside(bounds, childRect);
    }).map((child) => child.id));
    for (const child of members) {
      if (typeof child !== "string" || !byId.has(child) || ids.has(child)) continue;
      ids.add(child);
      queue.push(child);
    }
  }
  return [...ids];
}

interface OwnershipEntity {
  readonly key: string;
  readonly id: string;
  readonly anchors: readonly (CanvasAnchor | undefined)[];
  readonly waypoints: readonly unknown[];
}
interface OwnershipDependency {
  readonly entity: OwnershipEntity;
  readonly dependencies: readonly string[];
}
function lineKey(id: string): string {
  return `line:${id}`;
}
function commentKey(origin: string, id: string): string {
  return `comment:${origin}:${id}`;
}
function dependency(anchor: CanvasAnchor): string | undefined {
  if (anchor.type === "edge") return lineKey(anchor.edgeId);
  if (anchor.type === "comment") return commentKey(anchor.origin, anchor.commentId);
  return undefined;
}
function normalized(value: unknown): CanvasAnchor | undefined {
  // Coordinate-only M0 pins remain readable, like the metadata validator.
  if (record(value) && value.type === undefined && finite(value.x) && finite(value.y)) {
    return { type: "free", x: value.x, y: value.y };
  }
  return normalizeAnchor(value).anchor;
}

/**
 * Hidden native nodes/lines, independent lines, comment selection IDs and free
 * anchor keys map to their visible outer group. Explicit endpoint anchors beat
 * native fallback nodes. All terminals and stored bends must be internal.
 * External or missing dependencies keep a line visible. Cycles are bounded:
 * contained terminal evidence can ground a cycle; an ungrounded cycle stays
 * visible. This is an event-time ownership pass, never route/frame geometry.
 */
export function collapsedGroupOwners(document: unknown): ReadonlyMap<string, string> {
  if (!record(document) || !Array.isArray(document.nodes)) return new Map();
  const nodes = records(document.nodes);
  const groups = nodes.filter((node) => node.type === "group" && typeof node.id === "string" && rect(node) !== undefined && groupCollapse(document, node.id) !== undefined);
  const memberships = new Map(groups.map((node) => [node.id as string, new Set(groupSelectionIds(document, [node.id as string]).filter((id) => id !== node.id))]));
  const order = new Map(groups.map((group, position) => [group.id as string, position]));
  // Mutual membership elects one visible representative rather than hiding both.
  const roots = groups.filter((group) => !groups.some((outer) => {
    if (outer.id === group.id || !memberships.get(outer.id as string)?.has(group.id as string)) return false;
    return !memberships.get(group.id as string)?.has(outer.id as string)
      || order.get(outer.id as string)! < order.get(group.id as string)!;
  }));
  const owners = new Map<string, string>();
  for (const group of roots) {
    for (const child of memberships.get(group.id as string) ?? []) {
      if (!owners.has(child)) owners.set(child, group.id as string);
    }
  }
  if (roots.length === 0) return owners;
  const own = metadata(document);
  const overrides = map(own.localOverrides);
  const entities = new Map<string, OwnershipEntity>();
  const graphIds = new Set(nodes.map((node) => node.id));
  for (const line of records(document.edges)) {
    if (typeof line.id !== "string") continue;
    graphIds.add(line.id);
    const ends = map(map(overrides[line.id]).connectorAnchors);
    const endpoint = (end: "from" | "to"): CanvasAnchor | undefined => Object.prototype.hasOwnProperty.call(ends, end)
      ? normalized(ends[end]) : normalized({ type: "node", nodeId: line[`${end}Node`], u: 0.5, v: 0.5 });
    const style = map(map(overrides[line.id]).connector);
    const waypoints = style.waypoints === undefined ? [] : Array.isArray(style.waypoints) ? style.waypoints : [undefined];
    entities.set(lineKey(line.id), { key: lineKey(line.id), id: line.id, anchors: [endpoint("from"), endpoint("to")], waypoints });
  }
  for (const [id, value] of Object.entries(map(own.connectors))) {
    if (!record(value) || value.id !== id || graphIds.has(id)) continue;
    graphIds.add(id);
    const waypoints = value.waypoints === undefined ? [] : Array.isArray(value.waypoints) ? value.waypoints : [undefined];
    entities.set(lineKey(id), { key: lineKey(id), id, anchors: [normalized(value.from), normalized(value.to)], waypoints });
  }
  // A hidden imported pin can still be the target of another stored anchor.
  const threads = listCommentThreads({ ...document, miroCanvas: { ...own, hiddenImportedComments: [] } });
  const places = map(own.commentPlaces);
  for (const thread of threads) {
    const key = `${thread.origin}:${thread.id}`;
    const entityKey = commentKey(thread.origin, thread.id);
    entities.set(entityKey, { key: entityKey, id: `miro-comment:${key}`, anchors: [normalized(places[key] ?? thread.anchor)], waypoints: [] });
  }
  for (const [id, value] of Object.entries(map(own.freeAnchors))) {
    // Distinct element spaces must not overwrite native or connector ownership.
    if (graphIds.has(id) || id.startsWith("miro-comment:")) continue;
    entities.set(`free:${id}`, { key: `free:${id}`, id, anchors: [normalized(value)], waypoints: [] });
  }
  const reverse = new Map<string, Set<string>>();
  const indexed: OwnershipDependency[] = [];
  for (const entity of entities.values()) {
    const dependencies = new Set(entity.anchors.flatMap((anchor) => anchor === undefined ? [] : dependency(anchor) ?? []));
    indexed.push({ entity, dependencies: [...dependencies] });
    for (const key of dependencies) {
      const dependents = reverse.get(key) ?? new Set<string>();
      dependents.add(entity.key);
      reverse.set(key, dependents);
    }
  }
  for (const group of roots) {
    const id = group.id as string;
    const bounds = rect(group)!;
    const candidates = new Set<string>();
    const grounded = new Set<string>();
    for (const { entity, dependencies } of indexed) {
      let hasTerminal = false;
      const contained = entity.anchors.every((anchor) => {
        if (anchor === undefined) return false;
        if (anchor.type === "free") {
          const internal = pointInside(bounds, anchor);
          hasTerminal ||= internal;
          return internal;
        }
        if (anchor.type === "node" || anchor.type === "image") {
          const internal = owners.get(anchor.nodeId) === id;
          hasTerminal ||= internal;
          return internal;
        }
        return true;
      });
      if (!contained || !entity.waypoints.every((point) => pointInside(bounds, point)) || dependencies.some((key) => !entities.has(key))) continue;
      candidates.add(entity.key);
      if (hasTerminal) grounded.add(entity.key);
    }
    const removeDependents = (queue: string[]): void => {
      for (let position = 0; position < queue.length; position += 1) {
        for (const dependent of reverse.get(queue[position]) ?? []) {
          if (!candidates.delete(dependent)) continue;
          grounded.delete(dependent);
          queue.push(dependent);
        }
      }
    };
    removeDependents([...entities.keys()].filter((key) => !candidates.has(key)));
    const groundQueue = [...grounded];
    for (let position = 0; position < groundQueue.length; position += 1) {
      for (const dependent of reverse.get(groundQueue[position]) ?? []) {
        if (!candidates.has(dependent) || grounded.has(dependent)) continue;
        grounded.add(dependent);
        groundQueue.push(dependent);
      }
    }
    // An unresolved cycle is not evidence that an attached endpoint is internal.
    const ungrounded = [...candidates].filter((key) => !grounded.has(key));
    for (const key of ungrounded) candidates.delete(key);
    removeDependents(ungrounded);
    for (const key of candidates) {
      const entity = entities.get(key)!;
      if (!owners.has(entity.id)) owners.set(entity.id, id);
    }
  }
  return owners;
}

/** Plan only the collapse flag; lock/review/history checks belong to CanvasAuthoring. */
export function toggleGroupCollapse(document: unknown, id: string): RecordValue | undefined {
  try {
    const next = cloneCanvasJson(document);
    if (!record(next) || !Array.isArray(next.nodes)) return undefined;
    const groups = next.nodes.filter((value) => record(value) && value.id === id);
    if (groups.length !== 1 || !record(groups[0]) || groups[0].type !== "group") return undefined;
    const group = groups[0];
    if (next.miroCanvas !== undefined && (!record(next.miroCanvas) || next.miroCanvas.schemaVersion !== 1)) return undefined;
    const own = next.miroCanvas === undefined ? { schemaVersion: 1 } : next.miroCanvas;
    if (own.localOverrides !== undefined && !record(own.localOverrides)) return undefined;
    const overrides = map(own.localOverrides);
    if (overrides[id] !== undefined && !record(overrides[id])) return undefined;
    const override = map(overrides[id]);
    const current = groupCollapse(next, id);
    if (Object.prototype.hasOwnProperty.call(override, "groupCollapse") && current === undefined) return undefined;
    if (current !== undefined) {
      delete override.groupCollapse;
    } else {
      if (rect(group) === undefined || (group.width as number) < 1 || (group.height as number) < 1) return undefined;
      override.groupCollapse = { width: group.width, height: group.height, children: groupSelectionIds(next, [id]).filter((child) => child !== id) };
    }
    Object.defineProperty(overrides, id, { value: override, enumerable: true, configurable: true, writable: true });
    own.localOverrides = overrides;
    next.miroCanvas = own;
    return next;
  } catch {
    return undefined;
  }
}

/** Preview only: compact visible groups and proxy hidden native children; never persist. */
export function projectCollapsedGroups(document: RecordValue, owners: ReadonlyMap<string, string> = collapsedGroupOwners(document)): RecordValue {
  if (!Array.isArray(document.nodes)) return document;
  const nodes = records(document.nodes);
  const collapsed = new Map(nodes.filter((node) => node.type === "group" && typeof node.id === "string" && groupCollapse(document, node.id) !== undefined)
    .map((node) => [node.id as string, compactGroupRect(node)]));
  if (collapsed.size === 0) return document;
  const projected = document.nodes.map((value: unknown): unknown => {
    if (!record(value) || typeof value.id !== "string") return value;
    const owner = owners.get(value.id);
    const compact = owner === undefined ? collapsed.get(value.id) : collapsed.get(owner);
    return compact === undefined ? value : { ...value, ...compact, projectedCollapsed: true };
  });
  return { ...document, nodes: projected };
}
