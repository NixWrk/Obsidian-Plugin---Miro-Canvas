# Dependency maintenance — 2026-10-07

The owner authorized resolving the eight open Dependabot proposals after release
0.2.9, merging compatible changes and publishing a release if the delivered
artifacts need it. The baseline is commit 5086a37. Unrelated workspace files are
preserved. No existing release/tag may be overwritten.

## Scope and ordering before implementation

1. PRs #6 (esbuild 0.25.12 → 0.28.2) and #10 (Vitest 3.2.7 → 5.0.3) are coupled:
   the proposed Vite 8 dependency requires esbuild ^0.27 or ^0.28. Use a combined
   dependency change without force/legacy-peer-deps. Vitest/Vite/pool packages
   only serve development; esbuild produces all three executable bundles and
   synthetic-host probes, so emitted plugin behavior must also be checked.
2. PRs #1/#2/#9 update pinned GitHub Actions for provenance, Node setup and font
   Python setup. Keep full commit pins and existing runtime versions, permissions
   and input/output contracts. CI does not execute tag-only provenance/font jobs;
   those need explicit workflow/release evidence rather than an assumed PR pass.
3. PR #3 updates Python Playwright 1.62 → 1.63. Test in a separate project-local
   Python environment, with its matching browser binaries and all smoke modes.
4. PR #7 TypeScript 7 conflicts with typescript-eslint 8.71's <6.1 peer range;
   defer this major until the lint/compiler API toolchain is compatible. PR #8
   Node 26 types fail ES2020 test typechecking and do not match the Node 22 CI
   runtime; retain Node 22 types until a deliberate supported-runtime migration.

Every original PR needs a recorded disposition: merged, superseded by the
combined checked update, or closed/deferred with rationale. Version-update
grouping may reduce repeated coupled PRs, while security updates remain enabled.

## Mandatory checks recorded before edits

- Clean install/peer resolution, types, every unit test, plugin/standalone lint,
  CSS budgets, pinned schema, submission packaging and all three builds.
- Audit baseline and updated dependencies, distinguishing direct advisories from
  propagated package counts and development packages from bundled runtime code.
- Browser base/interactions/controls and oracle tests with Playwright 1.63.
- Compare emitted main.js, styles.css and standalone bundles against baseline.
  Verify changed plugin output in isolated hidden Windows Obsidian and affected
  connected physical Android devices. Record exact bundle/model/app evidence;
  no foreground OS input or user-vault changes.
- Review action release inputs and hosted-runner requirements at pinned commits;
  test actual affected workflows where possible and retain unverified limitations.
- Fresh CI of the combined update on current main, without bypassing checks.
- If publication is needed: version metadata/changelog agreement, passed CI before
  new tag, provenance/release workflow success and exact downloaded asset checks.

These checks are pending at this pre-edit record. Local artifacts belong only in
tools/obsidian_cdp/.out/dependabot-maintenance/ and are excluded from commits.

Implementation follow-up before fixes: Vitest 5 passes all 2,112 tests, but its
Mock type now includes constructable functions. PanelArrange test rig callbacks
resetLayout/onExit are zero-argument callable hooks, currently typed as broad
ReturnType<typeof vi.fn>. Narrow only those test declarations to Mock<() => void>;
keep all assertions and production behavior. Vitest's Vite warning identifies
ESM syntax in CJS vitest.config.ts; rename it to vitest.config.mts rather than
suppressing the warning or changing the plugin's package module type.

The remaining audit advisories propagate from obsidian SDK 1.13.1 pinning Moment
2.29.4. Moment 2.31.0 is the patched same-major package; standalone/plugin sources
have no direct Moment import, and the Obsidian module remains external in main.
Use a documented development dependency override to 2.31.0, keeping the SDK and
supported app minimum; verify types, audit and all bundle graphs/behavior.
Vitest 5 development requires Node 22.12+ on supported 22/24/26 lines; downloaded
CLI/MCP remain Node 20+ and build targets must not change. Test-only mock types,
config rename and SDK override do not modify source document writers or UI.

## Local acceptance before combined PR

Resolved versions: Vitest 5.0.3, esbuild 0.28.2, Playwright 1.63.0, Moment 2.31.0
via the development override. Keep TypeScript 5.9.3 and Node 22 declarations.
Clean npm ci succeeds without force or legacy-peer-deps. Final npm audit reports
0 known vulnerabilities, compared with 10 affected development-package records
at baseline. This is a current registry audit, not a guarantee about all software
or Obsidian's separately shipped runtime libraries. Remove the Moment override
when the SDK's upstream pin includes a patched version.

All 128 unit files / 2,112 tests pass with one existing optional skip under
Vitest 5; callable test mock types are explicit, with unchanged assertions.
Types, plugin/Node/CSS lint (one retained command-ID advisory, Node 0/0, CSS 0/0),
pinned schema, plugin/CLI/MCP builds, submission packaging, all three Playwright
1.63 smoke modes and 33 oracle tests pass. Playwright/browser dependencies are
installed in a project-local isolated environment; global Python is untouched.
The first clean-install attempt overlapped a completed test run and hit a locked
Windows esbuild binary. The sequential clean install and repeated tests pass;
the failed attempt is retained separately rather than a compatibility failure.

New main.js SHA256 is 17bc4c17d7fa94c7ee4ebbc95d37db33daca1602cb976c62b36f19432ad1bfca,
versus 0.2.9 aff2ee3a34a3045a30075c5736091c5cde937e3e06d2c1d327659ae5705aa200.
CSS remains 7c5ce8c141b048ae4382abb83f6c3a309a0bfef5c21290bc527184202a76208c.
Version 0.2.10 is prepared for those new artifacts, with unchanged minAppVersion
1.13.7. Downloaded CLI/MCP remain Node 20+; development follows Vitest's supported
Node 22.12+/24/26 engines. The plugin's source and board format are unchanged.

Installed hidden Windows Obsidian SDK 1.14.4 (title also 1.14.4) runs plugin
0.2.10 and exact new assets. Eight native matrices and mixed/group/chain movement
at 50%/125% pass; original board bytes/path and hidden/unfocused state restored.
User-agent still spells the bundled shell 1.12.7 and is recorded separately;
it is not substituted for the loaded native SDK version. PDF export follow-up,
physical Android receipt, fresh combined PR CI, merge and publication gates are
still pending at this commit. Artifacts: .out/dependabot-maintenance/.

Workflow input validation at exact pins passes. Hosted setup-node/setup-python
runs will be checked in fresh CI. Provenance v4.2.2 will execute in the genuine
0.2.10 release; no separate unrequested tag is created. The font workflow Python
3.11 inputs are reviewed; no fonts changed and no font-pack release is claimed.
Monthly related version updates are grouped. TypeScript/Node declaration major
proposals are deferred explicitly, while compatible updates remain enabled;
security alert settings are independent and were not changed by this patch.

## Theme follow-up before release

The owner's Android observation revealed that previous dark/light checks did
not assert the whole board palette. Fix the board/app scheme mismatch for
panels/default cards, body-hosted export/progress portals and unstyled editor
iframes. Matching custom Obsidian themes retain their own palette; explicit
card colors remain dominant. This changes plugin source/CSS and supersedes the
toolchain-only artifact hashes above. Trace and mandatory checks were recorded
before each repair in lint-remediation-checks.md.

The final Windows-built main is
d53c9c86b9e493ea239f48d33ebecf6f9cfbd29298f23300d1681fbfa94120b4;
CRLF CSS is a0b7fcfa81f2f872296309cbb9e580777ef1340737c98f28455a69686330c163.
check-theme passes eight combinations on hidden Windows SDK 1.14.4, physical
SM-X736B / Android 16 / Obsidian 1.13.8 and physical SM-A336E / Android 14 /
Obsidian 1.12.7 (legacy-only). Includes actual card entry/exit, negative white
toolbar detection, live editor switching, explicit editor colors, unload/reload
and exact original board/config/settings restoration. Touch evidence is real
ADB; media preferences and live editor color setup are separately labeled CDP
instrumentation. The initial genuine white editor failure is retained.

All 128 unit files / 2,116 tests pass, with one existing optional skip. Types,
plugin/CSS lint, three synthetic smoke modes and 33 oracle tests pass. The
remaining legacy command-ID warning is unchanged. See
[the full Advanced Canvas comparison](advanced-canvas-comparison.md): preserving
imported fields is distinguished from implementing their runtime behavior.
PR #7 (TypeScript 7) and #8 (Node 26 declarations) were closed with the concrete
compatibility reasons and a link to coordinated PR #11. Compatible proposals
#1/#2/#3/#6/#9/#10 remain covered by #11 until its successful merge.

Final capture/native matrix receipts, fresh CI and publication are required
before calling release 0.2.10 complete.

Final Windows native matrices and selection chains pass on the new assets.
Tablet PDF/Stop/forced-save-failure and dark progress palette pass. The phone
follow-up fails its bounded wait for a saved PDF; that receipt is retained and
is not a passed export gate. The owner's subsequent requirement supersedes this
capture architecture: exports must run independently without screen capture,
foreground changes or manipulating the working board. Release 0.2.10 remains
unpublished until that behavior and its concurrency checks pass.
