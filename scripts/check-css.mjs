import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// A zero-warning budget prevents reintroducing removed cascade overrides.
// Passing this gate does not certify directory acceptance.
// Native selection, attachment names and code markup mirror reversible local state.
// The adopted native menu mirrors explicit state instead of querying ancestors.
const css = (await readFile(new URL("../styles.css", import.meta.url), "utf8"))
  .replace(/\/\*[\s\S]*?\*\//gu, "");
const important = (css.match(/!important\b/gu) ?? []).length;
const has = (css.match(/:has\(/gu) ?? []).length;
console.log(`CSS advisories: ${important} !important declarations, ${has} :has selectors remain.`);
assert.equal(important, 0, "New !important override: use scoped specificity or reversible native style ownership.");
assert.ok(has === 0, "New :has selector: use explicit state for plugin-owned controls.");
assert.doesNotMatch(css, /\bclip-path\s*:/gu, "The search announcement must work without clip-path.");
for (const [, header] of css.matchAll(/([^{}]+)\{[^{}]*\}/gu)) {
  if (/miro-canvas-tools|data-miro-canvas-panel-collapsed/u.test(header)) {
    assert.doesNotMatch(header, /:has\(/gu, "Plugin-owned menus and folding use explicit state.");
  }
}
