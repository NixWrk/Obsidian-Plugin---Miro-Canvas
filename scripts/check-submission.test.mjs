import assert from "node:assert/strict";
import test from "node:test";
import { inspectManifest, inspectRelease } from "./check-submission.mjs";

const manifest = { id: "miro-canvas", name: "Miro Canvas", author: "NixWrk", version: "0.2.3", minAppVersion: "1.13.7", description: "Add drawing tools to Canvas.", isDesktopOnly: false };
const versions = { "0.2.3": "1.13.7" };
const release = { tag_name: "0.2.3", draft: false, prerelease: false, assets: ["main.js", "manifest.json", "styles.css"].map((name) => ({ name, size: 100 })) };

test("accepts a complete package and public release", () => {
  inspectManifest(manifest, "0.2.3", versions);
  inspectRelease(manifest, release);
});

test("rejects inconsistent compatibility and version declarations", () => {
  assert.throws(() => inspectManifest(manifest, "0.2.2", versions));
  assert.throws(() => inspectManifest(manifest, "0.2.3", { "0.2.3": "1.5.0" }));
  assert.throws(() => inspectManifest({ ...manifest, id: "obsidian-miro-canvas" }, "0.2.3", versions));
  assert.throws(() => inspectManifest({ ...manifest, description: "x".repeat(251) + "." }, "0.2.3", versions));
});

test("rejects draft, prerelease, wrong-tag and incomplete releases", () => {
  assert.throws(() => inspectRelease(manifest, { ...release, tag_name: "v0.2.3" }));
  assert.throws(() => inspectRelease(manifest, { ...release, draft: true }));
  assert.throws(() => inspectRelease(manifest, { ...release, prerelease: true }));
  assert.throws(() => inspectRelease(manifest, { ...release, assets: release.assets.slice(1) }));
});
