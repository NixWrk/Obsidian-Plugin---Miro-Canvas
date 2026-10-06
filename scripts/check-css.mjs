import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Advisory counts are visible, not promoted to a claim of passing directory review.
// Remaining cascade overrides bridge native Canvas, Markdown and other plugins.
// Native selection/attachment/Markdown markup still uses scoped :has.
// The adopted native menu mirrors explicit state instead of querying ancestors.
const css = (await readFile(new URL("../styles.css", import.meta.url), "utf8"))
  .replace(/\/\*[\s\S]*?\*\//gu, "");
const important = (css.match(/!important\b/gu) ?? []).length;
const has = (css.match(/:has\(/gu) ?? []).length;
console.log(`CSS advisories: ${important} !important declarations, ${has} :has selectors remain.`);
assert.ok(important <= 90, "New !important override: review the cascade and update the documented budget if necessary.");
assert.ok(has <= 4, "New :has selector: use explicit state for plugin-owned controls.");
assert.doesNotMatch(css, /\bclip-path\s*:/gu, "The search announcement must work without clip-path.");
for (const [, header] of css.matchAll(/([^{}]+)\{[^{}]*\}/gu)) {
  if (/miro-canvas-tools|data-miro-canvas-panel-collapsed/u.test(header)) {
    assert.doesNotMatch(header, /:has\(/gu, "Plugin-owned menus and folding use explicit state.");
  }
}
