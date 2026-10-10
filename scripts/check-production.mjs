import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export const MAX_MAIN_BYTES = 5_000_000;

export function inspectProductionJavaScript(source) {
  const bytes = Buffer.byteLength(source, "utf8");
  assert.ok(bytes < MAX_MAIN_BYTES, `main.js is ${bytes} bytes: keep it below the 5MB Sync Standard file limit.`);
  const file = ts.createSourceFile("main.js", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  assert.equal(file.parseDiagnostics.length, 0, "Production JavaScript must parse.");
  const visit = node => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const method = ts.isPropertyAccessExpression(callee) ? callee.name.text
        : ts.isElementAccessExpression(callee) && ts.isStringLiteral(callee.argumentExpression) ? callee.argumentExpression.text : undefined;
      if (method === "createElement" && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) {
        assert.notEqual(node.arguments[0].text.toLowerCase(), "script", "Production code must not create runtime script elements.");
      }
      if (ts.isIdentifier(callee) && callee.text === "require" && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
        assert.equal(node.arguments[0].text, "obsidian", "Unexpected external module in mobile plugin bundle.");
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  assert.doesNotMatch(source, /pdfobjectnewwindow|pdfjsnewwindow|cdnjs\.cloudflare\.com\/ajax\/libs\/pdfobject/u,
    "Unused external PDF viewers must not enter the plugin.");
  return { bytes, belowSyncLimit: true, runtimeScriptCreation: false };
}

export async function checkProductionBundle(path) {
  const result = inspectProductionJavaScript(await readFile(path, "utf8"));
  console.log(`Production bundle: ${result.bytes} bytes; below 5MB; no runtime script creation or external PDF viewer.`);
  return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await checkProductionBundle(new URL("../main.js", import.meta.url));
}
