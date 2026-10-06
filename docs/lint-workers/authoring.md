# L19-AUTH: before-edit trace and mandatory checks

Written before implementation edits on 2026-10-06. Work location:
`J:/NIX/WRK/Code/Obsidian-Plugin---Miro-Canvas`, shared primary checkout,
HEAD `85cb6cdb81dd7bd256e78391083b6fb4c08c406e`. The coordinator's existing
L19-AUTH subsection in `docs/lint-remediation-checks.md` links this note;
that register is read-only to this worker. No isolated register copy needed.

Exclusive implementation scope: `src/canvas-authoring.ts`; optional tests in
`tests/canvas-authoring.test.ts` and `tests/canvas-authoring-update-nodes.test.ts`.
Exclusive documentation: this note. All proof artifacts: `tools/obsidian_cdp/.out/l19-worker-artifacts/authoring/`.
Existing dependencies are available; do not reinstall shared node_modules
while other workers run checks. Preserve all unrelated working-tree changes.

## Exact affected boundaries and participation

- Baseline lines 326 and 399: `isPlainObject` obtains the prototype inside its
  existing catch boundary; `safeInvoke` calls the reflected host method with
  the existing receiver and argument clone, then rejects thenables. Annotate
  these unknown results as unknown, without asserting a prototype or return
  shape. `inspectHost` / `readSnapshotFromHost` / `invokeMutation` and graph
  normalization, rollback and history verification share these helpers.
- Lines 897-898: `graphItemsNativeMismatch` indexes observed/requested arrays
  after array/count checks. Annotate each indexed value unknown; keep subsequent
  plain-object checks and every field read. `nativeGraphMismatch` calls this
  for nodes and edges during import, root-metadata restoration, rollback and
  final history/save verification. `matchOrderById` remains unchanged.
- Line 1803 (`buildShape`), 2173 (`createConnector`), 2264 (`createItem`),
  2357-2358 (`insertGraph`): arrays read from detached documents are checked
  with Array.isArray. Restore unknown element boundaries in the spreads;
  never declare extra known fields, filter, map, reconstruct or clone items.
  Existing `validateGraphDocument` / `normalizeRecord` / `cloneRecord` already
  ensure safe document copies. Retain node/edge order and original unknown data.
- `insertGraph` lines 2310-2337: Array.isArray narrows already-typed readonly
  public arrays to intersections with any[]. Restore the original
  InsertGraphInput nodes/edges element types locally, without changing the
  public signature. Existing plain-object/safe-ID/duplicate checks precede
  geometry/type/endpoint reads, followed by strict clones and metadata checks.
  Connectors retain their existing `readBoardConnector` validation; do not
  assert stronger ID, geometry or endpoint shapes before the existing checks.
- Lines 2575 and 2622: `updateEdgeLabel` / `updateNodes` find cloned graph items
  after Array.isArray. Use unknown[] at the lookup boundary; preserve callback
  safeRead before isPlainObject and the final plain-object guard before writes.
- `changeItems` lines 2693-2848: restore the existing readonly UpdateItemInput
  array boundary lost by Array.isArray; id/node existence, removal conflict,
  readLocalItem, finite/positive rectangle and interaction-policy checks all
  remain intact. `placed` flows to rounded geometry writes, and all changes
  flow to localOverrides merge retaining other override fields. Keep optional
  rect/item handling, getter counts, item spread and clone order unchanged.
  `updateItems` delegates here; `deleteItems` supplies removals; deletion closure
  and connector lock checks remain untouched.

## Exact callers and user actions (baseline source lines)

- `src/m1-session.ts`: placeConnector 1128/1136 inserts native edges; connector
  settings 1389 edits edge labels; quick-connect 2912 creates native connections;
  editLine 3118 commits line item/rectangle changes; place tool 5221/5229 creates
  shape/text/sticky/frame/code/table cards; smart drawing 5485 creates shapes
  with rotation; drawStroke 5540 creates drawing items; partial eraser 5682
  trims/removes drawings; stroke eraser 5703 and deleteBoardSelection 7753
  remove through changeItems; link submit 5864 creates URL cards; paste handler
  7404 inserts `planPaste`'s remapped graph, metadata and bindings.
- `src/m2-tools.ts` 108 retains the same writer; shape form submit 172 calls
  createShape. Native fields are written by this same public writer.
- `mcp/src/tools-edit.ts`: EditSession.authoring 152-153 creates CanvasAuthoring
  over FileCanvasRuntime; create tool 698 creates items, update_node 815 updates
  native text/box/color, create edge 914 inserts a graph, update_connector 1077
  updates the native label. `mcp/src/board-file.ts` 289 onward provides the
  checked getData/importData/requestSave in-memory/file persistence boundary.
- All graph mutations retain commitDocument's miroSource equality, native
  readonly/lock/review and expected-snapshot refusal, import verification,
  metadata recovery, rollback, and one native history/save step. Public exported
  types/signatures remain exactly as baseline so the selection worker can proceed.

## Mandatory verification registered before edits

Worker checks (unit/static evidence only):

1. Capture all 58 inventoried sites and targeted ESLint JSON before and after,
   without cache/shared reports. No rule disabling, dynamic names, or any aliases.
2. esbuild.transform baseline and current OWN module with ES2020/browser/CJS,
   both unminified and minified; compare complete emitted JS byte-for-byte and
   record SHA-256 hashes. Retain source snapshots and transforms exclusively in
   `tools/obsidian_cdp/.out/l19-worker-artifacts/authoring/`. Also compare TypeScript declaration output for unchanged
   public contracts and report owned-module compiler diagnostics only.
3. Focused Vitest: canvas-authoring and canvas-authoring-update-nodes. Existing
   cases cover shape/item/native connector creation; style/rotation; node fields
   and noops; edge labels; pasted graph IDs/endpoints/bindings; stale CAS;
   malformed/thenable/readonly hosts; lock/review; rollback/import normalization;
   one mock history step and mock Undo/Redo; source and unknown fields.
4. Add focused coverage only where necessary: item rectangle writes plus nested
   unknown fields/source and mock Undo/Redo; nonfinite/nonpositive item rectangle
   rejection without import/history; hostile/revoked host and throwing getters
   rejected without additional calls. No new implementation behavior is allowed.
5. Scoped git diff --check; confirm UTF-8 CRLF, changed-path ownership, exact
   module equivalence and no production main.js/mcp/dist writes by this worker.

Pending coordinator-owned integration and actual-input gates:

- Whole repository check/test/lint/schema/build/mcp-build and consumer integration;
  production bundle identity, browser default/interactions/controls smokes.
- Real isolated Obsidian: creation, labels/style/resize/rotation, paste/remapped
  IDs and cross-board copies, expected-snapshot refusal, native save/reopen,
  lock/review, cancel/Undo/Redo and metadata/unknown/miroSource preservation.
- Mixed/group selection at non-default zoom: attached native/plugin connector
  paths and chains before release; far endpoints outside captured rectangle;
  repeat preview/commit/cancel; no persisted preview or second marquee.
- Android physical MiroCanvasTest checks with device/app versions and actual ADB
  input separately recorded by coordinator. No device/Obsidian/ADB input here.

Stop at a partial safe patch if any diagnostic needs runtime changes or a wider
public contract. Exact module identity proves executable preservation, not a
new real-app/device pass. No commits/pushes, shared inventory/docs or builds.

## Completed worker verification (2026-10-06)

Implementation contains 14 erased type annotations/assertions only. The
public readonly input types are restored locally after Array.isArray's any[]
intersection; opaque prototype/call/index results remain unknown until the
existing checks. No validation, getter/call/clone sequence, public signature,
source preservation, lock, native import, rollback, history or save code changed.
All 58 baseline diagnostic locations are preserved in
[the exclusive inventory](../../tools/obsidian_cdp/.out/l19-worker-artifacts/authoring/inventory-before.json).

Changed owned paths: `src/canvas-authoring.ts`,
`tests/canvas-authoring.test.ts`, and `docs/lint-workers/authoring.md`.
`tests/canvas-authoring-update-nodes.test.ts` was read/run, not edited.

| Check | Result and evidence |
| --- | --- |
| Targeted ESLint (no cache/shared output) | 0 errors, 58 warnings before; 0 errors, 0 warnings after; delta -58. `tools/obsidian_cdp/.out/l19-worker-artifacts/authoring/eslint-before.json`, `eslint-after.json`. |
| Exact unminified ES2020/browser/CJS transform | Byte-identical, 124113 bytes; SHA-256 `a5ba85b66354dab19689222a7a8b6fb92940ca19880a1f89b98bc0a1acb78927` before/current. |
| Exact minified ES2020/browser/CJS transform | Byte-identical, 63464 bytes; SHA-256 `a3c22ac0b4484310d275756178572da881bb1b80622ef5fdd3ab5535254a7fb1` before/current. |
| TypeScript public declaration emission | Same selected-module .d.ts before/current; SHA-256 `c569754eca227471b64dbd2316d533b5d26fba941dd736816936e43d68fea71e`. No emission diagnostics. Uses TypeScript program with dependency resolution, not isolated declaration inference. |
| Targeted compiler program | Roots: own authoring module and both authoring test files plus imported dependency closure. 0 owned diagnostics, 0 dependency diagnostics at verification time. Does not certify the full repository. |
| Focused Vitest | 103/103 passed: 88 authoring and 15 update-nodes/readGraph. JSON `tools/obsidian_cdp/.out/l19-worker-artifacts/authoring/vitest.json`. Cache disabled. |
| New focused coverage | Eight added cases: rounded item rect and nested root/node/metadata/override/item fields/source, unchanged input, single mock history and Undo/Redo; four invalid rectangles with no import/save; throwing method getter read once; throwing then getter/read once and no additional host call; revoked host rejection. |
| Scoped whitespace and encoding | `git diff --check -- src/canvas-authoring.ts tests/canvas-authoring.test.ts` passed. Source/test/note are UTF-8 without BOM and CRLF. |

Machine-readable proof and repeatable script:
[proof.json](../../tools/obsidian_cdp/.out/l19-worker-artifacts/authoring/proof.json),
[prove.mjs](../../tools/obsidian_cdp/.out/l19-worker-artifacts/authoring/prove.mjs).
Separate before/current source, JS and declaration artifacts remain in the
same exclusive directory. These transforms never run the production build.

Reproduction commands (from primary repository root):

```powershell
node node_modules/eslint/bin/eslint.js src/canvas-authoring.ts --format json --output-file tools/obsidian_cdp/.out/l19-worker-artifacts/authoring/eslint-after.json
node tools/obsidian_cdp/.out/l19-worker-artifacts/authoring/prove.mjs
node node_modules/vitest/vitest.mjs run tests/canvas-authoring.test.ts tests/canvas-authoring-update-nodes.test.ts --cache=false --reporter=json --outputFile=tools/obsidian_cdp/.out/l19-worker-artifacts/authoring/vitest.json
git diff --check -- src/canvas-authoring.ts tests/canvas-authoring.test.ts
```

Risk/remaining gates: no runtime/public-contract change or blocked diagnostic
was required. The declaration and JS comparisons cover this module only;
concurrent workers' edits and whole application/MCP bundles remain integration
risks for the coordinator. All coordinator-owned checks registered above are
still PENDING: full gates, real Obsidian input, physical Android matrices,
preview path/selection invariants, durable save/reopen and actual Undo/Redo.
No new app or device pass is claimed. No commits/pushes, production builds,
shared inventory/README/changelog/register edits or device input by this worker.
