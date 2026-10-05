import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const repository = "NixWrk/Obsidian-Plugin---Miro-Canvas";
const semver = /^\d+\.\d+\.\d+$/;

export function inspectManifest(manifest, packageVersion, versions) {
  assert.match(manifest.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  assert.ok(!manifest.id.includes("obsidian"), "Plugin ID cannot contain obsidian");
  assert.ok(manifest.name && manifest.author, "Name and author are required");
  assert.match(manifest.version, semver);
  assert.match(manifest.minAppVersion, semver);
  assert.equal(manifest.version, packageVersion, "Package and manifest versions disagree");
  assert.equal(versions[manifest.version], manifest.minAppVersion, "versions.json disagrees with the manifest");
  assert.equal(typeof manifest.isDesktopOnly, "boolean");
  assert.ok(manifest.description.length > 0 && manifest.description.length <= 250);
  assert.ok(manifest.description.endsWith("."), "Description must end with a period");
  assert.ok(!/^this is a plugin/i.test(manifest.description));
  assert.ok(!/[^\x20-\x7e]/u.test(manifest.description), "Description must use plain text without special characters");
  assert.ok(manifest.fundingUrl === undefined, "Review donation links before adding fundingUrl");
}

export function inspectRelease(manifest, release) {
  assert.equal(release.tag_name, manifest.version, "Release tag does not match the manifest");
  assert.equal(release.draft, false, "Release must be public");
  assert.equal(release.prerelease, false, "Plugin release must not be a prerelease");
  for (const name of ["main.js", "manifest.json", "styles.css"]) {
    assert.ok(release.assets.some((asset) => asset.name === name && asset.size > 0), `Missing release asset: ${name}`);
  }
}

async function jsonFile(path) {
  return JSON.parse(await readFile(new URL(path, root), "utf8"));
}

async function remoteJson(url) {
  const response = await fetch(url, { headers: { "User-Agent": "miro-canvas-submission-check" }, signal: AbortSignal.timeout(30000) });
  assert.ok(response.ok, `${url}: HTTP ${response.status}`);
  return response.json();
}

async function check() {
  const manifest = await jsonFile("manifest.json");
  const pkg = await jsonFile("package.json");
  inspectManifest(manifest, pkg.version, await jsonFile("versions.json"));
  const lock = await jsonFile("package-lock.json");
  assert.equal(lock.version, manifest.version);
  assert.equal(lock.packages[""].version, manifest.version);
  for (const path of ["README.md", "README.ru.md", "LICENSE", "THIRD_PARTY_NOTICES.md", "styles.css", "main.js", "docs/community-submission.md"]) {
    assert.ok((await readFile(new URL(path, root))).length > 0, `Missing or empty file: ${path}`);
  }
  const changelog = await readFile(new URL("CHANGELOG.md", root), "utf8");
  assert.ok(changelog.includes(`## ${manifest.version} - `), "Missing release notes");
  const bundle = await readFile(new URL("main.js", root), "utf8");
  assert.ok(!bundle.includes("miro-canvas-mcp.mjs"), "Optional MCP server must not be bundled");
  assert.ok(!/@electron\/remote|original-fs|node:fs|node:path|node:crypto/.test(bundle), "Plugin bundle must not load desktop runtime APIs");
  if (process.argv.includes("--remote")) {
    const release = await remoteJson(`https://api.github.com/repos/${repository}/releases/tags/${manifest.version}`);
    inspectRelease(manifest, release);
    const remoteManifest = await remoteJson(`https://raw.githubusercontent.com/${repository}/main/manifest.json`);
    assert.deepEqual(remoteManifest, manifest, "Default-branch manifest differs from the local manifest");
    for (const name of ["main.js", "manifest.json", "styles.css"]) {
      const asset = release.assets.find((candidate) => candidate.name === name);
      const response = await fetch(asset.browser_download_url, { signal: AbortSignal.timeout(60000) });
      assert.ok(response.ok, `Cannot download ${name}: HTTP ${response.status}`);
      const published = (await response.text()).replace(/\r\n/g, "\n");
      const local = (await readFile(new URL(name, root), "utf8")).replace(/\r\n/g, "\n");
      assert.equal(published, local, `Published ${name} differs from the local build`);
    }
    console.log(`Published release ${manifest.version}: tag, default-branch manifest and all three asset contents verified.`);
  }
  console.log(`Submission files verified for ${manifest.name} ${manifest.version}.`);

  console.log("This check verifies packaging; it does not certify policy compliance or directory acceptance.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await check();
}
