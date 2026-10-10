import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { gzipSync, gunzipSync } from "fflate";

const path = new URL("../src/assets/vector-pdf-fonts/fonts.json", import.meta.url);
const original = await readFile(path, "utf8");
const assets = JSON.parse(original);
assets.fonts = assets.fonts.map(({ base64, gzipBase64, byteLength, ...font }) => {
  const bytes = base64 ? Buffer.from(base64, "base64") : gunzipSync(Buffer.from(gzipBase64, "base64"));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), font.sha256, `Font bytes changed: ${font.style}`);
  if (byteLength !== undefined) assert.equal(bytes.length, byteLength);
  return { ...font, byteLength: bytes.length, gzipBase64: Buffer.from(gzipSync(bytes, { level: 9, mtime: 0 })).toString("base64") };
});
const packed = JSON.stringify(assets) + "\n";
if (process.argv.includes("--check")) assert.ok(packed === original.replace(/\r\n/g, "\n"), "Rebuild compressed fonts with node scripts/compress-pdf-fonts.mjs");
else await writeFile(path, packed);
console.log(`Four offline font styles: exact original SHA-256; compressed JSON ${Buffer.byteLength(packed)} bytes.`);
