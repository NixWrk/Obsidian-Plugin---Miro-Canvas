# L19-BASE FOUNDATION: two annotation diagnostics

## Before-edit trace (2026-10-06)

Checkout: J:/NIX/WRK/Code/Obsidian-Plugin---Miro-Canvas (shared primary), HEAD
85cb6cdb81dd7bd256e78391083b6fb4c08c406e. The coordinator already registered
[L19-BASE](../lint-remediation-checks.md#l19-base-foundation-executor--two-annotation-diagnostics)
and linked this exact worker note before source changes. This note is written
before either implementation edit. No isolated checkout is being used, so no
L19 register copy is necessary. Do not edit the shared register.

Owned paths: src/appearance.ts (isSafeObjectKey annotations only),
src/minimap-model.ts (MinimapViewportSize declaration only), optional existing
tests/appearance.test.ts and tests/minimap-model.test.ts, this note, and
exclusive .out/foundation artifacts. Preserve other workers' edits and the
four untracked root files check_gifs.py, debug.log, miro-canvas.svg and
plugin-icon.ts. Existing installed dependencies are present; do not run npm ci
and replace dependencies while the parallel workers are using them.

Exact diagnostics and participation:

- src/appearance.ts:1231, @typescript-eslint/restrict-template-expressions:
  validateOverrides interpolates ownKeys' string key into the unsafe-key
  diagnostic. The negative isSafeObjectKey(value: unknown): value is string
  predicate incorrectly narrows an already-string invalid key to never.
  The branch is reachable for reserved, empty, overlong and control-containing
  strings and must still produce override-key-invalid at the original path.
  Add a string-to-boolean overload before the existing unknown-to-string
  predicate overload; preserve the complete implementation, read order,
  trim/256-length/case-insensitive reserved-key/control-character checks.
  Unknown callers (palette suppliedId, actionNodeId) still need narrowing;
  own string callers (cloneUnknown, cloneUnknownFields, normalizeOverrides,
  mergeAppearanceMetadata, reset/format overrides, appearanceReducer and
  typography/colors resolution) retain string inputs on either outcome.
- validateAppearanceState calls validateOverrides at the payload boundary;
  validateAppearance/appearance-metadata re-export it. mergeAppearanceMetadata
  validates next state before writing owned fields. M1 applyAppearance
  merges appearance state through its guarded metadata transaction. Actions:
  font/size/alignment/color changes, reset, locked/review failures, reopening
  imported boards and retaining unknown fields/source evidence.
- src/minimap-model.ts:35, @typescript-eslint/no-empty-object-type:
  MinimapViewportSize is an empty exported interface extending ViewportSize
  (readonly width/height). Make it export type MinimapViewportSize = ViewportSize.
  Only viewportSize's return annotation refers to it in repo; no declaration
  merging or module augmentation of this name exists in repo. viewportSize
  chooses viewport dimensions, explicit width/height, then viewportSize fields;
  viewportToBoardRect and makeGeometry consume it. MinimapModel is constructed
  by M1's minimap mounting/update paths. Actions: map click/drag navigation,
  zoom/fit, toggle, camera frames at transform/center modes and different zooms.
  Retain readonly dimensions, assignability, interface extension/implements
  compatibility, all public callable signatures and unchanged runtime geometry.

Mandatory worker checks, recorded before implementation:

- Save exact baseline owned modules and targeted ESLint JSON without cache in
  .out/foundation; compare current diagnostics with baseline. Remove exactly
  the two assigned S8 sites; leave appearance's two S3 regex diagnostics and
  its one S1 prototype diagnostic for their later owners, without new warnings.
- Add an appearance regression for exact unsafe-key diagnostic paths (including
  own __proto__/constructor/prototype keys), empty/trimmed/256-257 length and
  embedded C0/DEL strings; rejection must occur before reading override values.
  Accept valid Unicode/boundary keys and prove no input mutation.
- Run existing appearance, metadata/MetadataWriter/Obsidian metadata store,
  minimap and viewport tests: immutable writes, stale/refusal/undo/redo,
  unknown fields/miroSource, hostile inputs, camera modes, click/drag and
  invalid viewport sizes. Unit evidence only, not native-app evidence.
- Transform saved baseline/current modules with esbuild (ES2020 ESM, unminified
  and minified, no source maps), compare exact JS bytes and SHA-256. Also
  compare TypeScript transpileModule output and public declarations; permit
  only the requested minimap alias declaration delta. Compile a focused
  consumer for readonly dimensions, bidirectional assignability, extension
  and implements compatibility, and verify no existing declaration merging.
- Scoped diff check; verify strict UTF-8 and CRLF in edited owned files; do not
  emit main.js, mcp/dist, or other shared production outputs.

Pending coordinator checks: full types/tests/lint/CSS, plugin/MCP builds and
bundle equality, schema/oracle/smokes, real Obsidian Windows and supported
Android MiroCanvasTest input, appearance changes/reset/Undo/Redo/reopen in both
themes, minimap pan/click/drag/zoom/fit/toggle, locked/review and large boards.
Workers do not run devices/ADB or launch Obsidian. No current native/device
result is claimed. These type-only changes must not touch miroSource, unknown
fields, persistence/history, public runtime APIs, regex or validation behavior.
No commits/pushes, nested agents or shared guides/inventory/register edits.

A portable S3/M6 control-character contract will be proposed here separately,
without implementing it or editing other modules in this batch.

## Annotation refinement recorded before follow-up source edit

The first overload attempt removed both warnings and passed 102 focused tests,
but direct esbuild minify=true output changed identifier allocation. Ordinary
esbuild JS was identical. That attempt is not the delivered patch.

Before the follow-up edit: restore isSafeObjectKey's exact original predicate
and apply the single narrow `key as string` annotation at validateOverrides'
unsafe-key diagnostic interpolation. ownKeys already guarantees this variable
is a string; the false guard branch cannot change its runtime type. This is a
local correction of TypeScript's never narrowing, not a blanket record/input
cast, new predicate contract, runtime conversion or deleted rejection. Retain
all caller typing and all reads/checks/branches. Require full targeted lint to
show no new no-unnecessary-type-assertion or other warning, both esbuild
transform modes plus TypeScript JS equality, public declarations unchanged
except the approved minimap alias, and the same focused tests/encoding checks.
The experiment is recorded in tools/obsidian_cdp/.out/l19-worker-artifacts/foundation/annotation-experiment.json.

## Delivered delta and worker evidence (2026-10-06)

Final source delta is exactly two replaced lines: appearance.ts:1231 adds
`key as string` only inside the unsafe-key diagnostic template; minimap-model.ts:35
replaces the empty interface with `export type MinimapViewportSize = ViewportSize`.
isSafeObjectKey and validateOverrides' runtime branch are otherwise identical.
No regex changed. tests/appearance.test.ts adds 58 lines / 16 cases; the existing
minimap test file is unchanged. This file is the only worker documentation write.

The six focused unit files pass: appearance (36), metadata (16), MetadataWriter
(15), Obsidian metadata store (18), minimap (9), viewport (8): 102/102 tests.
This includes the 16 new unsafe/safe key cases. Initial new fixtures omitted
required settings and assumed a diagnostic level field; the fixtures were
corrected to the existing API before the final successful runs. There was no
runtime implementation adjustment to make those tests pass.

Targeted complete ESLint rules, no cache: 0 errors / 5 warnings before,
0 errors / 3 warnings after. Exactly the two assigned S8 diagnostics disappear.
Remaining appearance sites match the baseline at unchanged lines: no-control-regex
316 and 327; no-unsafe-assignment 385. No new warning, including unnecessary
assertions, is introduced. minimap-model has zero diagnostics.

Focused TypeScript program checks owned modules, owned relevant test files,
imported dependencies and tools/obsidian_cdp/.out/l19-worker-artifacts/foundation/type-contract.ts: zero diagnostics.
The consumer proves equal structural sizes, readonly and required width/height,
bidirectional assignability, interface extension and class implements. Repo-wide
MinimapViewportSize search finds only its declaration and private viewportSize
return type, with no existing augmentation/merging consumer. Appearance public
.d.ts is byte-identical; minimap .d.ts differs only by the approved alias.

Module JS comparison uses ES2020 ESM, no sourcemaps, on exact saved before/current
sources. All six output comparisons are byte-identical (not just equivalent):

| Module | Transform | Bytes | SHA-256 before = after |
| --- | --- | ---: | --- |
| appearance | esbuild plain | 61962 | 47591d7b1c75756e37e60a9c05a093f050817b6d0237d659eef43aced08dff9b |
| appearance | esbuild minified | 29775 | 6bb1cfb94ba1938624dfa8a7dfed461a4bc9275717a13f9f5ead464e1800cef7 |
| appearance | TypeScript | 74952 | a13c4a2db90fe34d2ca9bbe9568dc179257fa36fd1ae53e8959b76cbe37d4a0a |
| minimap-model | esbuild plain | 34678 | 70efc9b17f1c8008a2768532ba3abe7fc89f60d3c2083e7f5ebbe2d6a873de8d |
| minimap-model | esbuild minified | 16487 | 1266ca3954b8d1211cf705856f7c4fce4ec2bbe6f3cd38c7d821cf3d8ad8ac7b |
| minimap-model | TypeScript | 39917 | 85c0fb568c6bd3f6fcc3a8d3f3be007748080c8e67a692bb434acdf8b07ef092 |

Scoped git diff --check passes; both source files, the test file and this note
are strict UTF-8 without BOM and use CRLF only. Outputs are exclusively under
.out/foundation. Reproduce: node tools/obsidian_cdp/.out/l19-worker-artifacts/foundation/verify.mjs after the targeted
ESLint report commands; run node_modules/.bin/vitest.cmd run with the six test
paths listed above. No production output is written by these commands.

Evidence paths (repository-relative, exclusive worker artifacts):

- tools/obsidian_cdp/.out/l19-worker-artifacts/foundation/proof.json: exact transformations, hashes, declaration checks,
  lint delta, focused compiler roots and encoding assertions.
- tools/obsidian_cdp/.out/l19-worker-artifacts/foundation/verify.mjs: reproducible proof script.
- tools/obsidian_cdp/.out/l19-worker-artifacts/foundation/lint.before.json and lint.after.json: full targeted rule reports.
- tools/obsidian_cdp/.out/l19-worker-artifacts/foundation/focused-tests.json and focused-tests.log: final 102-pass run.
- tools/obsidian_cdp/.out/l19-worker-artifacts/foundation/focused-types.log and type-contract.ts: compiler evidence.
- tools/obsidian_cdp/.out/l19-worker-artifacts/foundation/owned.patch: only the two source lines and new appearance tests.
- tools/obsidian_cdp/.out/l19-worker-artifacts/foundation/{appearance,minimap-model}.before.ts: exact baseline source.
- tools/obsidian_cdp/.out/l19-worker-artifacts/foundation/{appearance,minimap-model}.{before,after}.{plain,min,typescript}.js
  and corresponding .d.ts: before/current bytes for independent comparison.
- tools/obsidian_cdp/.out/l19-worker-artifacts/foundation/annotation-experiment.{mjs,json}: reason the overload attempt
  was rejected under the stricter direct-minification identity requirement.

## Proposed portable control-character contract for future S3/M6

Proposal only; no helper, regex or other module is changed here. The current
inventory has 14 S3 diagnostics and one M6 diagnostic. A future owner must trace
and pre-register each affected user action before implementing its slice.

A pure src helper usable by browser/Android and Node/MCP should inspect primitive
strings directly, without DOM/Obsidian/Node imports, globalThis/window, String()
coercion, Unicode normalization or trim. Use UTF-16 numeric comparisons for the
existing BMP forbidden sets; no control-character regex literals. A query returns
boolean, does not throw for a primitive string, allocate per character, or modify
input. Keep unknown validation and the existing order of trim/length/reserved-name
checks in each caller. Separate named character profiles rather than broadening
all validators to a universal definition of Unicode control characters.

| Existing sites | Exact forbidden set / operation to preserve |
| --- | --- |
| anchors.isSafeKey; appearance.isSafeObjectKey; canvas-elements.INVALID_ID_CHARACTERS; document-viewer.localDocumentPath; local-comments.displayAuthorName/safeKey (3 diagnostics in local-comments); metadata author-color names | C0 U+0000-U+001F plus DEL U+007F, on each caller's original or trimmed string exactly as today |
| appearance.isSafeLabel; document-viewer.safeSubpath | C0 + DEL plus literal < and >; subpath keeps its # prefix, full-match semantics, trim equality and 1024 UTF-16-unit bound |
| attachment-labels.CONTROL_OR_FORMAT | U+0000-U+001F; U+007F-U+009F; U+2028/U+2029; U+200B/U+200C/U+200E/U+200F; U+202A-U+202E; U+2060-U+2064; U+2066-U+2069; U+FEFF |
| device-files filename replacement; main.sanitizeFontFileName | Replace each C0 or literal /, backslash, colon, star, ?, double quote, <, >, pipe match with one underscore; preserve later leading-dot replacement (device-files only), trim and fallback behavior. DEL/C1 stay unaffected by this character rule |
| settings.SAFE_CUSTOM_FONT_FILE | C0 and the same forbidden filename punctuation; preserve full-string matching and the /u regex's 1-180 Unicode-code-point quantifier on the already-trimmed filename, rather than replacing it with string.length. DEL/C1 remain allowed by this rule |
| mcp/Vault.splitRelativePath (M6) | C0 plus <, >, double quote, pipe, ?, star in each segment. Preserve independent colon/NUL, separator/absolute/traversal, space/dot, reserved Windows device-name, protected-folder, .canvas-extension and filesystem link/junction guards. DEL/C1 remain allowed by this character rule |

Attachment names deliberately do not blacklist every format character: U+200D
and U+2065 are not in the existing set. General C0/DEL validators do not reject
C1 U+0080-U+009F. Keep these differences explicit in profile tests. If a caller
uses an anchored first-character check, preserve that check's match position and
short-circuit order separately from contains-anywhere behavior; local-comments
safeKey currently has both. Replacement needs its own operation, not a boolean
rejector; preserve supplementary characters and lone surrogate code units.

Required future proof: compare old regex/validator and proposed predicate on all
65,536 single UTF-16 code units, at first/middle/last positions in mixed strings;
pair surrogates into astral Unicode and retain lone-surrogate cases. Test empty
input, NUL/C0/DEL/C1, the exact attachment ranges and near misses, combining text,
Cyrillic/emoji, trim-sensitive outer versus embedded tabs/newlines, 256/257 and
80/81 UTF-16-length boundaries, the filename 180/181 code-point boundary with
astral characters, and subpath 1024/1025 bounds. Compare replacement output bytes
and failure diagnostics/paths, not acceptance alone. Keep casing/reserved keys,
Windows reserved names (including extension cases), traversal/ADS, protected
folders, symlink/reparse and stale-write defenses unchanged. Run actual file
import/font/attachment/author/subpath actions and standalone MCP path tests in
later batches; coordinator-owned native/Android evidence is still mandatory.

## Remaining coordinator gates

Full repository check/test/lint/CSS, production plugin/MCP bundle identity,
schema and all smokes/oracle, real Obsidian/device input and the integration
matrix remain pending for this worker's patch. The focused unit/compiler/module
proofs above do not certify the other workers' patches or native-app behavior.
No commits, pushes, devices, nested agents, shared-register/inventory/guide edits,
production builds, board-file writes or root-untracked-file changes were made.
