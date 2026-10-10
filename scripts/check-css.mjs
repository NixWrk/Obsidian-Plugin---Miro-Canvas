import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import postcss from "postcss";

// Only declarations sharing a block compete here. Conditional fallbacks,
// keyframe stops and separate rules retain their normal cascade.
export function findDuplicateDeclarations(root) {
  const duplicates = [];
  root.walk((block) => {
    if (!block.nodes) return;
    const declarations = new Map();
    for (const declaration of block.nodes) {
      if (declaration.type !== "decl") continue;
      const property = declaration.prop.startsWith("--")
        ? declaration.prop
        : declaration.prop.toLowerCase();
      const previous = declarations.get(property);
      if (previous) {
        duplicates.push({
          property,
          block: block.type === "rule" ? block.selector : `@${block.name} ${block.params}`.trim(),
          line: declaration.source.start.line,
          firstLine: previous.source.start.line,
        });
      } else {
        declarations.set(property, declaration);
      }
    }
  });
  return duplicates;
}

// A zero-warning budget prevents reintroducing removed cascade overrides.
// Passing this gate does not certify directory acceptance.
export function inspectCss(css, from = "styles.css") {
  const root = postcss.parse(css, { from });
  let important = 0;
  let has = 0;
  root.walkDecls((declaration) => {
    if (declaration.important) important += 1;
    assert.notEqual(declaration.prop.toLowerCase(), "clip-path", "The search announcement must work without clip-path.");
  });
  root.walkRules((rule) => {
    has += (rule.selector.match(/:has\s*\(/giu) ?? []).length;
  });
  const duplicates = findDuplicateDeclarations(root);
  assert.equal(important, 0, "New !important override: use scoped specificity or reversible native style ownership.");
  assert.equal(has, 0, "New :has selector: use explicit state for plugin-owned controls.");
  assert.equal(duplicates.length, 0, `Duplicate CSS declarations:\n${duplicates.map((duplicate) =>
    `${from}:${duplicate.line} ${duplicate.block}: ${duplicate.property} already declared at line ${duplicate.firstLine}`
  ).join("\n")}`);
  return { important, has, duplicates: duplicates.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  const result = inspectCss(css);
  console.log(`CSS advisories: ${result.important} !important declarations, ${result.has} :has selectors, ${result.duplicates} duplicate declarations remain.`);
}
