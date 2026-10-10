# Release CSS and companion tools checks

## Before-edit trace — 2026-10-10

The parent recorded this work in the Release 0.3.0 packaging review of
`docs/lint-remediation-checks.md`. This document owns the additional scoped
trace and results; parent documents and the regression register are unchanged
by this worker.

`ExportPanel` mounts `.miro-canvas-export` on its owning document's body.
Its fixed height bounds the scrolling body while keeping Close, output and
Stop outside that scroll area. The stylesheet subtracts 32px, the host's
`--keyboard-height` and both vertical safe-area insets from the viewport.
The only repeated declaration property found by a PostCSS inventory of the
whole stylesheet is the deliberate adjacent `max-height` vh/dvh fallback in
this rule. Preserve its computed height with a scoped viewport variable:
100vh by default, 100dvh only inside `@supports (height: 100dvh)`.

The duplicate guard must inspect parsed declaration blocks, including nested
conditional rules and declaration-bearing at-rules. Repetition across separate
rules, supports/media branches and keyframe stops is legitimate cascade.
Vendor-prefixed properties, shorthand/longhand pairs and differently cased
custom-property names are distinct. Ordinary property names are case
insensitive. Strings, comments, URLs and function values must not invent
properties. There are no same-block fallbacks to exempt after this change;
future fallbacks should use conditional blocks rather than a broad exemption.
The existing zero budgets for !important, :has() and clip-path stay enforced.
PostCSS and the YAML parser already existed in the dependency tree; the parent
now pins them as direct development dependencies for these regression gates.

`.github/workflows/release.yml` currently builds the plugin, MCP and CLI from
one pushed version tag and uploads all five files to one release. Retain that
fresh build and its manifest/tag gate. Exclude both fonts-* and tools-* tags.
Attest exactly main.js/manifest.json/styles.css as plugin core and the two
standalone bundles separately. After checks and attestations, create a
non-latest prerelease named tools-${GITHUB_REF_NAME} at the tagged commit,
then create the plugin release with exactly its three install files.
Link the two releases in their notes and document companion downloads in
`mcp/README.md`. This worker does not publish, replace assets, tag, commit or
push. The parent owns version 0.3.1 and the root/contributor documentation.

## Required checks

- Focused guard tests: actual stylesheet; repeated, nonconsecutive and cased
  properties; custom properties; declaration-bearing at-rules; nested scopes;
  comments/quoted values; conditional fallbacks; malformed CSS and retained
  advisory prohibitions.
- Parsed stylesheet checks: vh fallback, guarded dvh override, unchanged
  keyboard/safe-area calculation, fixed panel and scrolling body, native
  tablet/mobile padding and 44px control rules.
- Parsed workflow checks: excluded tag families, a single fresh build job,
  manifest/tag validation before publication, exact core/tools provenance
  subjects, companion-first order, prerelease/non-latest status and tagged
  commit target, exact three/two upload lists, reciprocal release-note links.
- Run npm run lint:css, node --test scripts/check-css.test.mjs and scoped
  git diff --check. Publication steps are inspected locally, never executed.
- Parent native Windows and physical Android checks remain pending here:
  open Export, scroll a long page list, reach Close/output/Stop, open and close
  the keyboard, and check bounds with safe-area insets, rotation, narrow
  viewports and native tablet padding. Record model/app version and real
  input separately from unit or synthetic checks.
- A future authorized tagged workflow run must verify downloaded three/two
  asset sets, provenance, CLI/MCP version/read-only startup and links.

## Font reproducibility follow-up — before workflow edit

The parent now generates compressed fonts with pinned fflate and mtime 0.
The release must run `node scripts/compress-pdf-fonts.mjs --check` after npm ci
and before the plugin build, attestations or either publication. This read-only
check reconstructs all four compressed assets and verifies the original glyph
bytes by SHA-256. The parent submission checker now enforces exactly three
plugin assets and a strict size below 5,000,000 bytes. Run its script tests in
the release job too, and check that the literal workflow core upload list passes
that checker. No styles, font assets or package/lock files are changed here;
CSS remains frozen for parent native deployment.

## Results

Completed in the shared `codex/release-031-compliance` worktree on Node
22.18.0, using the existing installed/locked development dependencies:

- `npm run lint:css`: zero !important declarations, zero :has selectors and
  zero repeated declaration properties. The complete parsed stylesheet passes.
- `node --test scripts/offline-pdf-build.test.mjs scripts/check-css.test.mjs`:
  17 passed (14 scoped CSS/workflow tests and three parent PDF/build tests).
  Parsed rules preserve both viewport branches, keyboard/safe-area subtraction,
  body scrolling, fixed header/footer and native tablet/mobile control rules.
- Workflow YAML parses without errors or duplicate keys. Tests verify excluded
  tag families, fresh core/tools builds, both PDF/CSS regression files, local
  package validation and the strict 5,000,000-byte limit before attestations.
  The parent production build additionally gates runtime script creation and
  external PDF viewers through `scripts/check-production.mjs`.
- Core provenance subjects are exactly main.js, manifest.json and styles.css.
  Tools provenance subjects are exactly the MCP and CLI bundles. Publication
  commands upload three and two files respectively, with companion-first
  order, the tagged commit as target, non-latest prerelease status and links in
  both release-note files. No upload/edit/delete command is added.
- `node scripts/check-production.mjs` passes against the parent's current
  rebuilt main.js (4,594,445 bytes), with no script creation or external viewer.
- `npm run submission:check` passes locally for Miro Canvas 0.3.1.
- `git diff --check` for the scoped tracked files passed. Focused script tests
  and the trace document are new files. The parent owns all other shared edits.

The workflow deliberately requires a fresh companion tag: if tools-<version>
already exists, it stops before publication rather than reusing or replacing
that build. A partial publication therefore needs separate owner reconciliation
before a retry; this worker has not run any publication command.

Native Windows and physical Android checks remain pending with the parent.
Unit/parsed-stylesheet checks do not certify real keyboard, safe-area, scrolling
or touch behavior. Future tagged-run/download/attestation checks also remain
pending. No devices, CDP, screenshots or native foreground changes were used.

The scoped implementation uses the existing pinned attestation action. Its
[subject path parser](https://github.com/actions/attest/blob/508db95dd578ae2727ebd6217d5ba78e4fbda05d/src/subject.ts)
accepts the explicit comma-separated path lists. The
[GitHub CLI release documentation](https://cli.github.com/manual/gh_release_create)
confirms the commit target, prerelease, non-latest and verify-tag options used
here. The existing fallback was reviewed before tightening the guard; the
[Stylelint duplicate-declaration rule](https://stylelint.io/user-guide/rules/declaration-block-no-duplicate-properties/)
provides the same-block rule and describes optional fallback exemptions. This
stylesheet now needs none; conditional blocks retain the fallback instead.


Parent native follow-up: final0.3.1 rebuilt Windows1.14.4 and physical
SM-X736B/Android16/Obsidian1.13.8 checks pass. Both themes, panel scrolling/
page actions, independent SVG save and Stop preserve source and leave0 jobs/
surfaces. Actual Android keyboard height400.94116px keeps footer/Close bounded.
Windows stays hidden/unfocused; tablet taps use ADB. No screenshots during jobs.
Publication checks are recorded in release-0.3.1-checks.md.


Parent publication follow-up: core0.3.1 and tools-0.3.1 are public and point to
the same checked commit. Exact3/2-asset contracts, downloaded content/version/
size and matching signed GitHub provenance pass. The historical worker pending
statements above describe its earlier handoff; final results are in
[release0.3.1 checks](release-0.3.1-checks.md).
