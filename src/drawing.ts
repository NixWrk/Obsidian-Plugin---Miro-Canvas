/**
 * Freehand strokes: what a pen gesture leaves behind, how much of it is worth
 * keeping, and what the eraser touches.  Pure geometry, so the board, the
 * renderer and the tests all measure a stroke the same way.
 */

/** Below this a stroke is a mark, not a shape anyone meant to draw. */
const MIN_SHAPE_SIZE = 24;

export interface StrokePoint {
  readonly x: number;
  readonly y: number;
}

export interface StrokeBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * What the pen draws with before a colour is picked for it: white on a dark
 * board, near-black on a light one, so a first stroke always shows.  A
 * stroke keeps the colour it was drawn in, whatever the board's theme later.
 */
export function defaultPenInk(theme: "light" | "dark"): string {
  return theme === "dark" ? "#ffffff" : "#1a1a1a";
}

/** How far off level, upright or diagonal a straight line may be and still snap to it. */
const SNAP_DEGREES = 4;

/**
 * The end of a straight line drawn from `from` towards `to`: a line nearly
 * level, upright or at 45 degrees is made exactly so, keeping its length.
 */
export function snapAngle(from: StrokePoint, to: StrokePoint): StrokePoint {
  const dx = to.x - from.x, dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return to;
  const angle = Math.atan2(dy, dx);
  const step = Math.PI / 4;
  const snapped = Math.round(angle / step) * step;
  if (Math.abs(angle - snapped) > (SNAP_DEGREES * Math.PI) / 180) return to;
  return { x: from.x + Math.cos(snapped) * length, y: from.y + Math.sin(snapped) * length };
}

/**
 * The same line with the points that say nothing left out.
 *
 * A pen reports far more points than a line needs; Ramer-Douglas-Peucker
 * keeps the ones that carry its shape, within `tolerance` of the original.
 */
export function simplifyPoints(points: readonly StrokePoint[], tolerance: number): readonly StrokePoint[] {
  if (points.length <= 2 || !(tolerance > 0)) return points;
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    let farthest = -1;
    let distance = tolerance;
    for (let index = first + 1; index < last; index += 1) {
      const away = distanceToSegment(points[index]!, points[first]!, points[last]!);
      if (away > distance) {
        distance = away;
        farthest = index;
      }
    }
    if (farthest < 0) continue;
    keep[farthest] = true;
    stack.push([first, farthest], [farthest, last]);
  }
  return points.filter((_, index) => keep[index] === true);
}

/**
 * The box a stroke occupies: every point, half the width of the line on each
 * side, and a unit of slack so a round end is never clipped by rounding.
 */
export function strokeBounds(points: readonly StrokePoint[], width = 0): StrokeBox {
  if (points.length === 0) return { x: 0, y: 0, width: Math.max(width, 1), height: Math.max(width, 1) };
  let minX = Number.POSITIVE_INFINITY, minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY, maxY = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  const margin = width / 2 + 1;
  return {
    x: minX - margin,
    y: minY - margin,
    width: Math.max(maxX - minX + margin * 2, 1),
    height: Math.max(maxY - minY + margin * 2, 1),
  };
}

/** How far a point lies from a stroke given as x and y in turn. */
export function distanceToStroke(points: readonly number[], point: StrokePoint): number {
  let best = Number.POSITIVE_INFINITY;
  for (let index = 0; index + 3 < points.length; index += 2) {
    const from = { x: points[index]!, y: points[index + 1]! };
    const to = { x: points[index + 2]!, y: points[index + 3]! };
    best = Math.min(best, distanceToSegment(point, from, to));
  }
  if (points.length === 2) best = Math.hypot(point.x - points[0]!, point.y - points[1]!);
  return best;
}

/**
 * Whether the eraser, at a board point, is on a drawing.
 *
 * The stroke was drawn in `box` and the node now occupies `rect`, so the
 * point is measured in the stroke's own space, where its width is stated.
 */
export function strokeHitsPoint(
  stroke: { readonly points: readonly number[]; readonly width: number; readonly box: { readonly width: number; readonly height: number } },
  rect: StrokeBox,
  point: StrokePoint,
  tolerance: number,
): boolean {
  if (!(rect.width > 0) || !(rect.height > 0)) return false;
  const scaleX = stroke.box.width / rect.width;
  const scaleY = stroke.box.height / rect.height;
  const local = { x: (point.x - rect.x) * scaleX, y: (point.y - rect.y) * scaleY };
  // The reach is measured in the stroke's space too, along the thinner axis.
  const reach = stroke.width / 2 + tolerance * Math.min(scaleX, scaleY);
  return distanceToStroke(stroke.points, local) <= reach;
}

/**
 * What is left of a stroke after the eraser passed over part of it.
 *
 * The part of the line within `reach` of the eraser's own path goes, and
 * nothing else: what remains is kept as separate pieces of the same stroke,
 * since a stroke erased in the middle is two lines afterwards.  A piece the
 * eraser never reached is kept point for point.  `changed` says whether
 * anything went at all; nothing left means the whole drawing goes.
 */
export function eraseFromStroke(
  points: readonly number[],
  breaks: readonly number[],
  eraser: readonly number[],
  reach: number,
): { readonly points: readonly number[]; readonly breaks: readonly number[]; readonly changed: boolean } | undefined {
  // A line is kept as the few points that carry its shape, so a long stretch
  // may be one segment.  Stepping along it in small steps lets the eraser cut
  // anywhere, close to where its ring really ends, and what survives of a
  // piece it cut is reduced again afterwards.
  const step = Math.min(Math.max(reach / 4, 0.25), 2);
  const originals: StrokePoint[][] = [];
  const starts = new Set(breaks);
  for (let index = 0; index + 1 < points.length; index += 2) {
    if (originals.length === 0 || starts.has(index / 2)) originals.push([]);
    originals[originals.length - 1]!.push({ x: points[index]!, y: points[index + 1]! });
  }
  // Only the part of the line inside the box the eraser's path covers is
  // stepped along; the rest keeps its ends.  Stepping a long line end to end
  // would make hundreds of thousands of points out of one, and a cap on the
  // steps would make the cut coarse exactly where it is made.
  // The box reaches a little past the ring, so the points where the line
  // enters and leaves it are kept and the pieces end where the ring does.
  const area = eraserBox(eraser, reach + step * 2);
  const pieces: number[][] = [];
  let changed = false;
  for (const original of originals) {
    const walk: StrokePoint[] = [original[0]!];
    for (let index = 1; index < original.length; index += 1) walk.push(...stepsWithin(original[index - 1]!, original[index]!, area, step));
    const erased = walk.map((stop) => distanceToStroke(eraser, stop) <= reach);
    if (!erased.includes(true)) {
      if (original.length >= 2) pieces.push(original.flatMap((point) => [point.x, point.y]));
      continue;
    }
    changed = true;
    let piece: StrokePoint[] = [];
    const finish = (): void => {
      const line = piece.length >= 2 ? simplifyPoints(piece, step / 2) : [];
      if (line.length >= 2) pieces.push(line.flatMap((point) => [point.x, point.y]));
      piece = [];
    };
    walk.forEach((stop, index) => {
      if (erased[index]) finish();
      else piece.push(stop);
    });
    finish();
  }
  if (pieces.length === 0) return undefined;
  const result: number[] = [];
  const nextBreaks: number[] = [];
  for (const item of pieces) {
    if (result.length > 0) nextBreaks.push(result.length / 2);
    result.push(...item);
  }
  return { points: result, breaks: nextBreaks, changed };
}

/**
 * Whether the eraser, moving from one board point to the next, crossed a
 * drawing.  A quick sweep reports points far apart, and a thin line between
 * two of them would otherwise be missed.
 */
export function strokeHitsSegment(
  stroke: { readonly points: readonly number[]; readonly width: number; readonly box: { readonly width: number; readonly height: number } },
  rect: StrokeBox,
  from: StrokePoint,
  to: StrokePoint,
  tolerance: number,
): boolean {
  if (!(rect.width > 0) || !(rect.height > 0)) return false;
  const scaleX = stroke.box.width / rect.width;
  const scaleY = stroke.box.height / rect.height;
  const local = (point: StrokePoint): StrokePoint => ({ x: (point.x - rect.x) * scaleX, y: (point.y - rect.y) * scaleY });
  const a = local(from), b = local(to);
  const reach = stroke.width / 2 + tolerance * Math.min(scaleX, scaleY);
  const points = stroke.points;
  if (points.length === 2) return distanceToSegment({ x: points[0]!, y: points[1]! }, a, b) <= reach;
  for (let index = 0; index + 3 < points.length; index += 2) {
    const p = { x: points[index]!, y: points[index + 1]! };
    const q = { x: points[index + 2]!, y: points[index + 3]! };
    if (segmentDistance(a, b, p, q) <= reach) return true;
  }
  return false;
}

/** The shortest distance between two segments: none when they cross. */
function segmentDistance(a: StrokePoint, b: StrokePoint, p: StrokePoint, q: StrokePoint): number {
  const cross = (o: StrokePoint, u: StrokePoint, v: StrokePoint): number => (u.x - o.x) * (v.y - o.y) - (u.y - o.y) * (v.x - o.x);
  const d1 = cross(p, q, a), d2 = cross(p, q, b), d3 = cross(a, b, p), d4 = cross(a, b, q);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0;
  return Math.min(
    distanceToSegment(a, p, q), distanceToSegment(b, p, q),
    distanceToSegment(p, a, b), distanceToSegment(q, a, b),
  );
}

/**
 * Whether a point lies inside the ring a lasso drew.
 *
 * The ring is closed from its last point back to its first, and counted by
 * crossings: a point is inside when a ray from it crosses the ring an odd
 * number of times.
 */
export function pointInLasso(ring: readonly StrokePoint[], point: StrokePoint): boolean {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const a = ring[index]!, b = ring[previous]!;
    const straddles = (a.y > point.y) !== (b.y > point.y);
    if (!straddles) continue;
    const crossing = a.x + ((point.y - a.y) / (b.y - a.y)) * (b.x - a.x);
    if (point.x < crossing) inside = !inside;
  }
  return inside;
}

export interface StrokeShape {
  readonly rotation?: number;
  readonly kind: "rectangle" | "circle" | "ellipse" | "triangle" | "line";
  readonly box: StrokeBox;
  readonly from: StrokePoint;
  readonly to: StrokePoint;
}

/**
 * The shape a rough stroke was meant to be, the way Miro's smart drawing
 * reads one, or nothing when the stroke says nothing in particular.
 *
 * Four nearly perpendicular sides identify a rectangle even when tilted.
 * Other closed shapes are told apart by how much of their box they fill:
 * an ellipse about four fifths, a triangle about half. An open stroke is a
 * line when it hardly bends.
 */
export function recogniseStroke(points: readonly StrokePoint[]): StrokeShape | undefined {
  if (points.length < 2) return undefined;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const box = strokeBounds(points);
  const diagonal = Math.hypot(box.width, box.height);
  if (diagonal < MIN_SHAPE_SIZE) return undefined;
  const chord = Math.hypot(last.x - first.x, last.y - first.y);
  let length = 0;
  let bend = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += Math.hypot(points[index]!.x - points[index - 1]!.x, points[index]!.y - points[index - 1]!.y);
    bend = Math.max(bend, distanceToSegment(points[index]!, first, last));
  }
  if (length === 0) return undefined;
  if (bend <= Math.max(diagonal * 0.08, 2)) {
    return { kind: "line", box, from: first, to: last };
  }
  // Closed when the ends meet, measured against how far the line travelled.
  if (chord > length * 0.25) return undefined;
  const corners = strokeCorners(points, box);
  const rectangle = rectangleAngle(corners);
  const axis = rectangle ?? principalAngle(points);
  const fitted = fitShapeBox(points, axis);
  const area = Math.abs(shoelace(points)) / 2;
  const filled = area / Math.max(fitted.box.width * fitted.box.height, 1);
  const kind = rectangle !== undefined || filled > 0.82 ? "rectangle"
    : filled > 0.62
      ? (Math.abs(fitted.box.width - fitted.box.height) <= Math.max(fitted.box.width, fitted.box.height) * 0.2 ? "circle" : "ellipse")
      : "triangle";
  const geometry = kind === "circle" ? { box, rotation: 0 }
    : kind === "triangle" && corners.length === 3 ? fitShapeBox(points, triangleAngle(corners))
    : fitted;
  return { kind, ...geometry, from: first, to: last };
}

/** Corners without jitter or an extra corner where a stroke started on a side. */
function strokeCorners(points: readonly StrokePoint[], box: StrokeBox): readonly StrokePoint[] {
  const tolerance = Math.max(1, Math.min(box.width, box.height) * 0.06);
  const corners = [...simplifyPoints([...points, points[0]], tolerance)];
  corners.pop();
  for (let index = 0; corners.length > 3 && index < corners.length;) {
    const previous = corners[(index + corners.length - 1) % corners.length];
    const next = corners[(index + 1) % corners.length];
    if (distanceToSegment(corners[index], previous, next) <= tolerance) {
      corners.splice(index, 1);
      index = 0;
    } else index += 1;
  }
  return corners;
}

/** The long side of a rectangle, with consistent, nearly right-angle turns. */
function rectangleAngle(corners: readonly StrokePoint[]): number | undefined {
  if (corners.length !== 4) return undefined;
  let winding = 0;
  for (let index = 0; index < 4; index += 1) {
    const previous = corners[(index + 3) % 4];
    const corner = corners[index];
    const next = corners[(index + 1) % 4];
    const ax = corner.x - previous.x;
    const ay = corner.y - previous.y;
    const bx = next.x - corner.x;
    const by = next.y - corner.y;
    const a = Math.hypot(ax, ay);
    const b = Math.hypot(bx, by);
    if (Math.min(a, b) === 0 || Math.abs(ax * bx + ay * by) > a * b * 0.35) return undefined;
    const turn = Math.sign(ax * by - ay * bx);
    if (turn === 0 || (winding !== 0 && turn !== winding)) return undefined;
    winding = turn;
  }
  const [from, to] = longestSide(corners);
  const degrees = Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI;
  return ((degrees + 90) % 180 + 180) % 180 - 90;
}

function longestSide(corners: readonly StrokePoint[]): readonly [StrokePoint, StrokePoint] {
  let longest = 0;
  let side = 0;
  for (let index = 0; index < corners.length; index += 1) {
    const from = corners[index];
    const to = corners[(index + 1) % corners.length];
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (length > longest) {
      longest = length;
      side = index;
    }
  }
  return [corners[side], corners[(side + 1) % corners.length]];
}

/** Native triangle points upwards from its base. Traversal must not flip it. */
function triangleAngle(corners: readonly StrokePoint[]): number {
  const [from, to] = longestSide(corners);
  const tip = corners.find(point => point !== from && point !== to);
  if (tip === undefined) return 0;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  return angle + (dx * (tip.y - from.y) - dy * (tip.x - from.x) > 0 ? 180 : 0);
}

/** Equal-distance samples keep a slow corner or a dense side from tilting an oval. */
function principalAngle(points: readonly StrokePoint[]): number {
  const ring = [...points, points[0]];
  const distances = [0];
  for (let index = 1; index < ring.length; index += 1) {
    distances.push(distances[index - 1] + Math.hypot(ring[index].x - ring[index - 1].x, ring[index].y - ring[index - 1].y));
  }
  const length = distances[distances.length - 1];
  if (length === 0) return 0;
  const samples: StrokePoint[] = [];
  let segment = 1;
  for (let index = 0; index < 64; index += 1) {
    const at = index * length / 64;
    while (segment < ring.length - 1 && distances[segment] <= at) segment += 1;
    const from = ring[segment - 1];
    const to = ring[segment];
    const span = distances[segment] - distances[segment - 1];
    const t = span === 0 ? 0 : (at - distances[segment - 1]) / span;
    samples.push({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
  }
  const center = samples.reduce((sum, point) => ({ x: sum.x + point.x / 64, y: sum.y + point.y / 64 }), { x: 0, y: 0 });
  let xx = 0;
  let yy = 0;
  let xy = 0;
  for (const point of samples) {
    const x = point.x - center.x;
    const y = point.y - center.y;
    xx += x * x;
    yy += y * y;
    xy += x * y;
  }
  return Math.atan2(2 * xy, xx - yy) * 90 / Math.PI;
}

/** Fit dimensions in the drawn axes, keep the center, then round rotation to 45 degrees. */
function fitShapeBox(points: readonly StrokePoint[], degrees: number): { box: StrokeBox; rotation: number } {
  const angle = degrees * Math.PI / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const local = strokeBounds(points.map(point => ({ x: point.x * cos + point.y * sin, y: -point.x * sin + point.y * cos })));
  const x = local.x + local.width / 2;
  const y = local.y + local.height / 2;
  const rotation = ((Math.round(degrees / 45) * 45 + 180) % 360 + 360) % 360 - 180;
  return { box: { x: x * cos - y * sin - local.width / 2, y: x * sin + y * cos - local.height / 2, width: local.width, height: local.height }, rotation: rotation === 0 ? 0 : rotation };
}

function shoelace(points: readonly StrokePoint[]): number {
  let sum = 0;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
    sum += (points[previous]!.x + points[index]!.x) * (points[previous]!.y - points[index]!.y);
  }
  return sum;
}

/** The most steps the part of one stretch inside the eraser's box is cut into. */
const MAX_STEPS = 4_096;

/** The box the eraser's path covers, grown by its reach. */
function eraserBox(path: readonly number[], reach: number): StrokeBox | undefined {
  if (path.length < 2) return undefined;
  let minX = Number.POSITIVE_INFINITY, minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY, maxY = Number.NEGATIVE_INFINITY;
  for (let index = 0; index + 1 < path.length; index += 2) {
    minX = Math.min(minX, path[index]!);
    maxX = Math.max(maxX, path[index]!);
    minY = Math.min(minY, path[index + 1]!);
    maxY = Math.max(maxY, path[index + 1]!);
  }
  return { x: minX - reach, y: minY - reach, width: maxX - minX + reach * 2, height: maxY - minY + reach * 2 };
}

/**
 * The points a stretch of a line is tested at: its end, and in small steps
 * across the part of it inside the eraser's box, so a cut lands close to where
 * the eraser's ring really ends however long the stretch is.
 */
function stepsWithin(from: StrokePoint, to: StrokePoint, box: StrokeBox | undefined, step: number): StrokePoint[] {
  const span = box === undefined ? undefined : clipToBox(from, to, box);
  if (span === undefined) return [to];
  const [start, end] = span;
  const at = (t: number): StrokePoint => ({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
  const length = Math.hypot(to.x - from.x, to.y - from.y) * (end - start);
  const stops = Math.min(Math.max(1, Math.ceil(length / step)), MAX_STEPS);
  const walk: StrokePoint[] = start > 0 ? [at(start)] : [];
  for (let index = 1; index <= stops; index += 1) walk.push(at(start + ((end - start) * index) / stops));
  if (end < 1) walk.push(to);
  return walk;
}

/** Where along a segment, from 0 to 1, it runs inside a box; nothing when it misses. */
function clipToBox(from: StrokePoint, to: StrokePoint, box: StrokeBox): [number, number] | undefined {
  let start = 0, end = 1;
  const dx = to.x - from.x, dy = to.y - from.y;
  for (const [p, q] of [
    [-dx, from.x - box.x], [dx, box.x + box.width - from.x],
    [-dy, from.y - box.y], [dy, box.y + box.height - from.y],
  ] as const) {
    if (p === 0) {
      if (q < 0) return undefined;
      continue;
    }
    const t = q / p;
    if (p < 0) start = Math.max(start, t);
    else end = Math.min(end, t);
    if (start > end) return undefined;
  }
  return [start, end];
}

function distanceToSegment(point: StrokePoint, from: StrokePoint, to: StrokePoint): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - from.x, point.y - from.y);
  const along = Math.min(1, Math.max(0, ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (from.x + along * dx), point.y - (from.y + along * dy));
}
