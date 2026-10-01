import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A style rule of the stylesheet with the at-rules around it, read without a
 * CSS engine: enough to tell which rules sit under `@media (hover: hover)`.
 * The armed look of a tool against the hover rule is checked in a real
 * browser by the `--controls` smoke test; this keeps every hover style of
 * the bars where a finger or a pen never leaves it behind.
 */
interface StyleRule {
  readonly selector: string;
  readonly inside: readonly string[];
}

function styleRules(stylesheet: string): StyleRule[] {
  const text = stylesheet.replace(/\/\*[\s\S]*?\*\//gu, "");
  const rules: StyleRule[] = [];
  const open: string[] = [];
  let header = "";
  for (const character of text) {
    if (character === "{") {
      open.push(header.trim());
      header = "";
    } else if (character === "}") {
      const selector = open.pop();
      if (selector !== undefined && !selector.startsWith("@")) {
        rules.push({ selector, inside: open.filter((entry) => entry.startsWith("@")) });
      }
      header = "";
    } else if (character === ";") {
      header = "";
    } else {
      header += character;
    }
  }
  return rules;
}

const stylesheet = readFileSync(resolve(__dirname, "../styles.css"), "utf8");
const BARS = [".miro-canvas-toolbar", ".miro-canvas-dock", ".miro-canvas-search"];

describe("hover styles of the bars", () => {
  it("reads the rules of the stylesheet with their at-rules", () => {
    const rules = styleRules(stylesheet);
    expect(rules.length).toBeGreaterThan(500);
    const nested = rules.filter((rule) => rule.inside.length > 0);
    expect(nested.some((rule) => rule.inside.includes("@media (hover: hover)"))).toBe(true);
  });

  it("puts every hover rule of a bar's control under @media (hover: hover)", () => {
    const loose = styleRules(stylesheet)
      .filter((rule) => rule.selector.includes(":hover") && BARS.some((bar) => rule.selector.includes(bar)))
      .filter((rule) => !rule.inside.includes("@media (hover: hover)"))
      .map((rule) => rule.selector);
    expect(loose).toEqual([]);
  });
});
