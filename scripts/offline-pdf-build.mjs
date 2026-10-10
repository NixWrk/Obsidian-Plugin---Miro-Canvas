import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import ts from "typescript";

export const JSPDF_REVIEWED_SHA256 = "5b7f65fa3928b104febbcc37c7174f8e5aa3b8d9d24d0378a3fecad693d86f76";
const viewers = new Set(["pdfobjectnewwindow", "pdfjsnewwindow", "dataurlnewwindow", "datauri", "dataurl"]);
const unusedPlugins = new Set(["html", "addSvgAsImage"]);

/** Remove unused network/viewer APIs from the reviewed dependency, never rename them. */
export function offlinePdfSource(source) {
  assert.equal(createHash("sha256").update(source).digest("hex"), JSPDF_REVIEWED_SHA256,
    "jsPDF source changed: review its offline output and optional plugins before updating the pin.");
  const file = ts.createSourceFile("jspdf.es.js", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  assert.equal(file.parseDiagnostics.length, 0, "Cannot parse the reviewed jsPDF source.");
  const edits = [];
  const removed = new Set();
  const visit = node => {
    if (ts.isSwitchStatement(node) && node.expression.getText(file) === "type"
      && node.caseBlock.clauses.some(clause => ts.isCaseClause(clause)
        && ts.isStringLiteral(clause.expression) && clause.expression.text === "pdfobjectnewwindow")) {
      for (const clause of node.caseBlock.clauses) {
        if (ts.isCaseClause(clause) && ts.isStringLiteral(clause.expression) && viewers.has(clause.expression.text)) {
          assert.ok(!removed.has(clause.expression.text), "Duplicate viewer output clause.");
          edits.push([clause.getStart(file), clause.end]);
          removed.add(clause.expression.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  for (const statement of file.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)) continue;
    const call = statement.expression;
    const fn = ts.isParenthesizedExpression(call.expression) ? call.expression.expression : call.expression;
    if (!ts.isFunctionExpression(fn) || call.arguments.length !== 1 || call.arguments[0].getText(file) !== "jsPDF.API") continue;
    const found = [];
    const scan = node => {
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
        && ts.isPropertyAccessExpression(node.left) && node.left.expression.getText(file) === "jsPDFAPI"
        && unusedPlugins.has(node.left.name.text)) found.push(node.left.name.text);
      ts.forEachChild(node, scan);
    };
    scan(fn.body);
    if (found.length === 0) continue;
    assert.equal(found.length, 1, "Unknown optional jsPDF plugin shape.");
    assert.ok(!removed.has(found[0]), "Duplicate optional jsPDF plugin.");
    removed.add(found[0]);
    edits.push([statement.getStart(file), statement.end]);
  }
  assert.deepEqual([...removed].sort(), [...viewers, ...unusedPlugins].sort(), "Reviewed jsPDF APIs were not found.");
  edits.sort((a, b) => b[0] - a[0]);
  let output = source;
  for (const [start, end] of edits) output = output.slice(0, start) + output.slice(end);
  assert.doesNotMatch(output, /createElement\(["']script["']\)/u);
  assert.doesNotMatch(output, /import\(["'](?:html2canvas|dompurify|canvg)["']\)/u);
  return output;
}

export const offlinePdfPlugin = {
  name: "miro-offline-pdf",
  setup(build) {
    build.onLoad({ filter: /[\\/]jspdf[\\/]dist[\\/]jspdf\.es(?:\.min)?\.js$/ }, async args => {
      const path = args.path.replace(/jspdf\.es\.min\.js$/u, "jspdf.es.js");
      const source = await readFile(path, "utf8");
      return { contents: offlinePdfSource(source), loader: "js", watchFiles: [path] };
    });
  },
};
