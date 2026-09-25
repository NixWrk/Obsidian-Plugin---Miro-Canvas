/**
 * The bullet a card's text can wear on each of its lines.
 *
 * A card keeps the bullet in its own Markdown, `- `, so it survives with the
 * plugin off.  Code fences and table rows are left alone - the same care
 * `text-highlight.ts` takes marking a card's own words.
 */

const FENCE = /^\s*(```|~~~)/u;
const TABLE_ROW = /^\s*\|/u;
const TABLE_RULE = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/u;
const BULLET = /^(\s*)[-*+]\s+/u;

/** A line the bullet toggle leaves untouched: a fence, a table row or rule, or a blank line. */
function isProtected(line: string, fenced: boolean): boolean {
  return fenced || line.trim() === "" || TABLE_ROW.test(line) || TABLE_RULE.test(line);
}

/** Whether every line that can carry a bullet already does. */
export function hasBulletList(text: string): boolean {
  let fenced = false;
  let sawLine = false;
  for (const line of text.split("\n")) {
    if (FENCE.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (isProtected(line, fenced)) continue;
    sawLine = true;
    if (!BULLET.test(line)) return false;
  }
  return sawLine;
}

/** A bullet added to every non-empty line, or - where every line already has one - taken off again. */
export function toggleBulletList(text: string): string {
  const adding = !hasBulletList(text);
  let fenced = false;
  return text.split("\n").map((line) => {
    if (FENCE.test(line)) {
      fenced = !fenced;
      return line;
    }
    if (isProtected(line, fenced)) return line;
    return adding ? addBullet(line) : removeBullet(line);
  }).join("\n");
}

function addBullet(line: string): string {
  if (BULLET.test(line)) return line;
  const indent = /^\s*/u.exec(line)![0];
  return `${indent}- ${line.slice(indent.length)}`;
}

function removeBullet(line: string): string {
  const match = BULLET.exec(line);
  return match === null ? line : `${match[1]!}${line.slice(match[0].length)}`;
}
