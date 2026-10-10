import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import postcss from "postcss";
import { parseDocument } from "yaml";
import { findDuplicateDeclarations, inspectCss } from "./check-css.mjs";
import { inspectRelease } from "./check-submission.mjs";

const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
const stylesheet = postcss.parse(css);
const workflowSource = await readFile(new URL("../.github/workflows/release.yml", import.meta.url), "utf8");
const workflowDocument = parseDocument(workflowSource, { uniqueKeys: true });
const workflow = workflowDocument.toJS();
const steps = workflow.jobs.release.steps;
const coreAssets = ["main.js", "manifest.json", "styles.css"];
const toolAssets = ["mcp/dist/miro-canvas-mcp.mjs", "mcp/dist/miro-canvas-cli.mjs"];

function declarations(rule) {
  return Object.fromEntries(rule.nodes.filter((node) => node.type === "decl").map((node) => [node.prop, node.value]));
}

function ruleWith(selector, predicate = () => true) {
  const matches = [];
  stylesheet.walkRules(selector, (rule) => {
    if (predicate(rule)) matches.push(rule);
  });
  assert.equal(matches.length, 1, `Expected one matching rule: ${selector}`);
  return matches[0];
}

function stepNamed(name) {
  const matches = steps.filter((step) => step.name === name);
  assert.equal(matches.length, 1, `Expected one release step: ${name}`);
  return matches[0];
}

// Inspect only a literal create command; new shell commands or unreviewed
// release flags must not quietly widen the upload contract.
function releaseCommand(step) {
  const command = step.run.replace(/\\\r?\n\s*/gu, " ").trim();
  const tokens = command.match(/"[^"\n]*"|'[^'\n]*'|[^\s]+/gu).map((token) => token.replace(/^(["'])(.*)\1$/u, "$2"));
  assert.deepEqual(tokens.splice(0, 3), ["gh", "release", "create"]);
  const tag = tokens.shift();
  const options = {};
  const assets = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (["--target", "--title", "--notes-file"].includes(token)) {
      options[token] = tokens[++index];
    } else if (["--prerelease", "--verify-tag", "--latest=false"].includes(token)) {
      options[token] = true;
    } else {
      assert.ok(!token.startsWith("--"), `Unreviewed release option: ${token}`);
      assets.push(token);
    }
  }
  return { tag, options, assets };
}

test("the complete stylesheet has zero prohibited advisories or duplicate declarations", () => {
  assert.deepEqual(inspectCss(css), { important: 0, has: 0, duplicates: 0 });
});

test("rejects consecutive fallbacks and nonconsecutive case-insensitive property duplicates", () => {
  assert.throws(() => inspectCss(".panel { max-height: 100vh; max-height: 100dvh; }"), /max-height already declared/u);
  const root = postcss.parse(".panel {\n color: red;\n padding: 0;\n COLOR: blue;\n color: green;\n}");
  assert.deepEqual(findDuplicateDeclarations(root), [
    { property: "color", block: ".panel", line: 4, firstLine: 2 },
    { property: "color", block: ".panel", line: 5, firstLine: 2 },
  ]);
});

test("checks declaration-bearing at-rules and nested blocks without mixing their scopes", () => {
  assert.throws(() => inspectCss('@font-face { font-family: "Board"; src: url(a.woff); src: url(b.woff); }'), /src already declared/u);
  assert.throws(() => inspectCss("@media (width < 600px) { .panel { color: red; padding: 0; color: blue; } }"), /color already declared/u);
  assert.throws(() => inspectCss(".panel { color: red; @media (width < 600px) { color: blue; } color: green; }"), /color already declared/u);
  assert.doesNotThrow(() => inspectCss(".panel { color: red; @media (width < 600px) { color: blue; } }"));
});

test("allows separate cascade blocks, conditional fallbacks, vendor properties and longhands", () => {
  assert.doesNotThrow(() => inspectCss(`
    .panel { --height: 100vh; padding: 0; padding-top: 1px; -webkit-user-select: none; user-select: none; }
    .panel { color: red; }
    @supports (height: 100dvh) { .panel { --height: 100dvh; } }
    @media (width < 600px) { .panel { color: blue; } }
    @keyframes reveal { from { opacity: 0; } to { opacity: 1; } }
  `));
});

test("custom-property names remain case-sensitive but same-name duplicates fail", () => {
  assert.doesNotThrow(() => inspectCss(".panel { --HEIGHT: 1px; --height: 2px; }"));
  assert.throws(() => inspectCss(".panel { --height: 1px; --height: 2px; }"), /--height already declared/u);
});

test("comments and quoted delimiters do not create declarations or advisories", () => {
  assert.doesNotThrow(() => inspectCss(`
    /* .panel:has(*) { color: red !important; clip-path: none; color: blue; } */
    .panel { content: "color: red; color: blue; } !important :has() clip-path:";
      background: url("data:image/svg+xml;utf8,<svg>{color:red;}</svg>"); }
  `));
  assert.throws(() => inspectCss(".panel { color: red; /* fallback */ color: blue; }"), /color already declared/u);
});

test("retains the important, has and clip-path gates and fails on malformed CSS", () => {
  assert.throws(() => inspectCss(".panel { color: red !IMPORTANT; }"), /New !important override/u);
  assert.throws(() => inspectCss(".panel:has(.button) { color: red; }"), /New :has selector/u);
  assert.throws(() => inspectCss(".panel { CLIP-PATH: none; }"), /without clip-path/u);
  assert.throws(() => inspectCss(".panel { color: red;"), /Unclosed block/u);
});

test("Export preserves vh fallback, conditional dvh and keyboard/safe-area bounds", () => {
  const panel = ruleWith(".miro-canvas-export", (rule) => rule.parent.type === "root");
  const values = declarations(panel);
  assert.equal(values["--miro-canvas-export-viewport-height"], "100vh");
  assert.equal(values["max-height"], "calc(var(--miro-canvas-export-viewport-height) - 32px - var(--keyboard-height, 0px) - var(--miro-canvas-export-safe-top) - var(--miro-canvas-export-safe-bottom))");
  assert.equal(values.position, "fixed");
  for (const side of ["top", "right", "bottom", "left"]) {
    assert.equal(values[`--miro-canvas-export-safe-${side}`], `var(--safe-area-inset-${side}, env(safe-area-inset-${side}, 0px))`);
  }
  const dynamic = ruleWith(".miro-canvas-export", (rule) => rule.parent.name === "supports");
  assert.equal(dynamic.parent.params, "(height: 100dvh)");
  assert.deepEqual(declarations(dynamic), { "--miro-canvas-export-viewport-height": "100dvh" });
  assert.equal(declarations(ruleWith(".miro-canvas-export__body")).overflow, "auto");
  assert.equal(declarations(ruleWith(".miro-canvas-export__header"))["flex-shrink"], "0");
  assert.equal(declarations(ruleWith(".miro-canvas-export__footer"))["flex-shrink"], "0");
});

test("Export keeps native tablet padding and 44px touch controls", () => {
  const padding = ruleWith(/button:is\(\[class\*="miro-canvas-"\]/u);
  assert.match(padding.selector, /:is\(\.is-tablet, \.is-mobile\)/u);
  assert.equal(declarations(padding).padding, "var(--miro-canvas-button-padding, var(--size-4-1) var(--size-4-3))");
  assert.equal(declarations(ruleWith(".miro-canvas-export", (rule) => rule.parent.type === "root"))["--miro-canvas-export-control-height"], "34px");
  const native = ruleWith(/\.is-mobile \.miro-canvas-export,\s*\.is-tablet \.miro-canvas-export/u);
  assert.equal(declarations(native)["--miro-canvas-export-control-height"], "44px");
  const coarse = ruleWith(".miro-canvas-export", (rule) => rule.parent.name === "media");
  assert.equal(coarse.parent.params, "(any-pointer: coarse)");
  assert.equal(declarations(coarse)["--miro-canvas-export-control-height"], "44px");
});

test("release YAML is valid and fonts/tools tags cannot enter the plugin job", () => {
  assert.deepEqual(workflowDocument.errors, []);
  assert.deepEqual(workflow.on.push.tags, ["*", "!fonts-*", "!tools-*"]);
  assert.deepEqual(Object.keys(workflow.jobs), ["release"]);
  assert.equal(workflow.permissions["id-token"], "write");
  assert.equal(workflow.permissions.attestations, "write");
});

test("fresh core and tools builds and regression gates precede both attestations and publication", () => {
  const firstAttestation = steps.findIndex((step) => step.name === "Attest plugin core provenance");
  for (const command of ["npm ci", "npm run lint:css", "npm run build", "npm run mcp:build", "npm run cli:build", "npm run lint:mcp", "node scripts/compress-pdf-fonts.mjs --check"]) {
    const matches = steps.filter((step) => step.run === command);
    assert.equal(matches.length, 1, command);
    assert.ok(steps.indexOf(matches[0]) < firstAttestation, command);
  }
  const regressions = stepNamed("Production PDF, CSS and release contract regressions");
  assert.equal(regressions.run, "node --test scripts/offline-pdf-build.test.mjs scripts/check-css.test.mjs scripts/check-submission.test.mjs");
  assert.ok(steps.indexOf(regressions) < firstAttestation);
  const fontCheck = stepNamed("Reproducible offline font assets");
  assert.equal(fontCheck.run, "node scripts/compress-pdf-fonts.mjs --check");
  assert.ok(steps.indexOf(fontCheck) < steps.findIndex((step) => step.run === "npm run build"));
  const versionGate = stepNamed("Tag matches the manifest");
  assert.match(versionGate.run, /require\('\.\/manifest\.json'\)\.version/u);
  assert.match(versionGate.run, /test "\$tag" = "\$manifest"/u);
  assert.ok(steps.indexOf(versionGate) < firstAttestation);
  const packageGate = stepNamed("Plugin package gate");
  assert.match(packageGate.run, /npm run submission:check/u);
  assert.match(packageGate.run, /wc -c < main\.js.*-lt 5000000/u);
  assert.ok(steps.indexOf(packageGate) < firstAttestation);
});

test("each attestation covers exactly its own release assets, including the core manifest", () => {
  const attestations = steps.filter((step) => step.uses?.startsWith("actions/attest-build-provenance@"));
  assert.equal(attestations.length, 2);
  const core = stepNamed("Attest plugin core provenance");
  const tools = stepNamed("Attest standalone tools provenance");
  assert.deepEqual(core.with["subject-path"].split(/,\s*/u), coreAssets);
  assert.deepEqual(tools.with["subject-path"].split(/,\s*/u), toolAssets);
  assert.ok(steps.indexOf(core) < steps.indexOf(stepNamed("Create companion tools prerelease")));
  assert.ok(steps.indexOf(tools) < steps.indexOf(stepNamed("Create companion tools prerelease")));
});

test("publishes exactly two standalone files at the tagged commit before the three core files", () => {
  const companion = stepNamed("Create companion tools prerelease");
  const plugin = stepNamed("Create plugin release");
  const tools = releaseCommand(companion);
  const core = releaseCommand(plugin);
  assert.equal(tools.tag, "tools-${GITHUB_REF_NAME}");
  assert.equal(tools.options["--target"], "${GITHUB_SHA}");
  assert.equal(tools.options["--prerelease"], true);
  assert.equal(tools.options["--latest=false"], true);
  assert.equal(tools.options["--notes-file"], "TOOLS-NOTES.md");
  assert.deepEqual(tools.assets, toolAssets);
  assert.equal(core.tag, "${GITHUB_REF_NAME}");
  assert.equal(core.options["--verify-tag"], true);
  assert.equal(core.options["--prerelease"], undefined);
  assert.equal(core.options["--notes-file"], "NOTES.md");
  assert.deepEqual(core.assets, coreAssets);
  assert.ok(steps.indexOf(companion) < steps.indexOf(plugin));
  assert.equal(steps.filter((step) => /gh release create/u.test(step.run ?? "")).length, 2);
  assert.doesNotMatch(workflowSource, /gh release (?:upload|edit|delete)/u);
  const tagGate = stepNamed("Companion tag is new");
  assert.match(tagGate.run, /git ls-remote --tags origin "refs\/tags\/tools-\$\{GITHUB_REF_NAME\}"/u);
  assert.match(tagGate.run, /exit 1/u);
  assert.ok(steps.indexOf(tagGate) < steps.indexOf(companion));
});

test("the workflow core upload list passes the parent's exact plugin package contract", () => {
  const core = releaseCommand(stepNamed("Create plugin release"));
  inspectRelease({ version: "0.3.1" }, {
    tag_name: "0.3.1",
    draft: false,
    prerelease: false,
    assets: core.assets.map((name) => ({ name, size: 100 })),
  });
});

test("generated notes link matching plugin and tools releases and keep Node-only installation", async () => {
  const notes = stepNamed("Release notes for this version");
  assert.match(notes.run, /\$\{GITHUB_SERVER_URL\}\/\$\{GITHUB_REPOSITORY\}\/releases\/tag/u);
  assert.match(notes.run, /\[CLI and MCP tools\]\(%s\/tools-%s\).*>> NOTES\.md/u);
  assert.match(notes.run, /\[Miro Canvas %s\]\(%s\/%s\).* > TOOLS-NOTES\.md/u);
  assert.match(notes.run, /Node 20\+ outside the Obsidian plugin folder/u);
  assert.ok(steps.indexOf(notes) < steps.indexOf(stepNamed("Create companion tools prerelease")));
  const readme = await readFile(new URL("../mcp/README.md", import.meta.url), "utf8");
  for (const asset of ["miro-canvas-cli.mjs", "miro-canvas-mcp.mjs"]) {
    assert.ok(readme.includes(`/releases/download/tools-0.3.1/${asset}`));
  }
  assert.match(readme, /tools-<plugin-version>/u);
  assert.match(readme, /Earlier downloads remain/u);
});
