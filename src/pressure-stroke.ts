/** A variable-width stroke uses the same outline for its live preview and saved drawing. */
export function pressureStrokePath(points: readonly number[], widths: readonly number[], breaks: readonly number[] = []): string {
  const starts = new Set(breaks);
  const parts: string[] = [];
  const number = (value: number): string => String(Math.round(value * 1000) / 1000);
  for (let index = 0; index < widths.length; index += 1) {
    const x = points[index * 2]!, y = points[index * 2 + 1]!, radius = widths[index]! / 2;
    parts.push(`M${number(x - radius)} ${number(y)}a${number(radius)} ${number(radius)} 0 1 1 ${number(radius * 2)} 0a${number(radius)} ${number(radius)} 0 1 1 ${number(-radius * 2)} 0Z`);
    if (index === 0 || starts.has(index)) continue;
    const ax = points[index * 2 - 2]!, ay = points[index * 2 - 1]!;
    const dx = x - ax, dy = y - ay, length = Math.hypot(dx, dy);
    if (length === 0) continue;
    const nx = -dy / length, ny = dx / length, before = widths[index - 1]! / 2;
    parts.push(`M${number(ax - nx * before)} ${number(ay - ny * before)}L${number(x - nx * radius)} ${number(y - ny * radius)}L${number(x + nx * radius)} ${number(y + ny * radius)}L${number(ax + nx * before)} ${number(ay + ny * before)}Z`);
  }
  return parts.join(" ");
}

/** Widths at points introduced by a partial erase, interpolated along the original line. */
export function remapStrokeWidths(points: readonly number[], widths: readonly number[], next: readonly number[], breaks: readonly number[] = []): number[] {
  const starts = new Set(breaks);
  const result: number[] = [];
  for (let index = 0; index < next.length; index += 2) {
    let closest = Infinity;
    let width = widths[0]!;
    for (let stop = 0; stop < widths.length; stop += 1) {
      const x = points[stop * 2]!, y = points[stop * 2 + 1]!;
      const previous = stop === 0 || starts.has(stop) ? stop : stop - 1;
      const ax = points[previous * 2]!, ay = points[previous * 2 + 1]!;
      const dx = x - ax, dy = y - ay, length = dx * dx + dy * dy;
      const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((next[index]! - ax) * dx + (next[index + 1]! - ay) * dy) / length));
      const distance = Math.hypot(next[index]! - ax - t * dx, next[index + 1]! - ay - t * dy);
      if (distance < closest) {
        closest = distance;
        width = widths[previous]! + t * (widths[stop]! - widths[previous]!);
      }
    }
    result.push(width);
  }
  return result;
}
