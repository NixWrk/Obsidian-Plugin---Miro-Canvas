import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";
import { encode as encodePng } from "fast-png";
import { offlinePdfPlugin, offlinePdfSource } from "./offline-pdf-build.mjs";
import { inspectProductionJavaScript, MAX_MAIN_BYTES } from "./check-production.mjs";

const source = await readFile(new URL("../node_modules/jspdf/dist/jspdf.es.js", import.meta.url), "utf8");

test("dependency drift fails closed before bundling", () => {
  assert.throws(() => offlinePdfSource(source + "\n//changed"), /source changed/);
});

test("reviewed removal leaves core PDF paths and excludes optional network/render plugins", async () => {
  const result = await build({ stdin: { contents: 'export {jsPDF} from "jspdf";', resolveDir: process.cwd() },
    bundle: true, platform: "browser", format: "cjs", minify: true, write: false,
    metafile: true, plugins: [offlinePdfPlugin], logLevel: "silent" });
  const code = result.outputFiles[0].text;
  const inputNames = Object.keys(result.metafile.inputs);
  assert.ok(!inputNames.some(name => /node_modules\/(?:html2canvas|canvg|dompurify)\//u.test(name)));
  inspectProductionJavaScript(code);
  const context = { module: { exports: {} }, exports: {}, console, TextEncoder, TextDecoder, Blob, URL, btoa, atob };
  runInNewContext(code, context);
  const { jsPDF } = context.module.exports;
  const pdf = new jsPDF({ unit: "pt", format: [320, 240], putOnlyUsedFonts: true });
  assert.equal(pdf.html, undefined);
  assert.equal(pdf.addSvgAsImage, undefined);
  pdf.text("Offline PDF", 20, 30).rect(20, 50, 80, 40).addPage([240, 320]).text("Second page", 20, 30);
  const png = encodePng({ width: 1, height: 1, data: Uint8Array.of(255, 0, 0, 255), channels: 4, depth: 8 });
  pdf.addImage("data:image/png;base64," + Buffer.from(png).toString("base64"), "PNG", 100, 50, 10, 10);
  const bytes = new Uint8Array(pdf.output("arraybuffer"));
  const text = new TextDecoder().decode(bytes);
  assert.match(text, /^%PDF-/u);
  assert.match(text, /\/Count 2/u);
  assert.match(text, /Offline PDF/u);
  assert.match(text, /\/Subtype \/Image/u);
  assert.equal(pdf.output("pdfobjectnewwindow"), null);
  assert.equal(pdf.output("pdfjsnewwindow"), null);
});

test("production gate rejects script injection spellings and oversized UTF8 bytes", () => {
  for (const code of ['document.createElement("script")', 'document["createElement"]("SCRIPT")', 'document.createElement(`script`)']) {
    assert.throws(() => inspectProductionJavaScript(code), /runtime script/);
  }
  assert.throws(() => inspectProductionJavaScript('"' + "x".repeat(MAX_MAIN_BYTES) + '"'), /5MB/);
  assert.throws(() => inspectProductionJavaScript('require("node:fs")'), /Unexpected external/);
  assert.deepEqual(inspectProductionJavaScript('document.createElement("div");'), {
    bytes: Buffer.byteLength('document.createElement("div");'), belowSyncLimit: true, runtimeScriptCreation: false,
  });
});
