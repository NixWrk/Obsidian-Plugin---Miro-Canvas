# L19-SEL DATA: selection type remediation

## Before-edit trace (2026-10-06)

Working in the shared primary checkout
J:/NIX/WRK/Code/Obsidian-Plugin---Miro-Canvas, HEAD
85cb6cdb81dd7bd256e78391083b6fb4c08c406e. Coordinator pre-registered
[L19-SEL](../lint-remediation-checks.md#l19-sel-data-executor--selection-types-69-diagnostics).
This exclusive note supplies that subsection's detailed before-edit record;
the shared register is not edited. Existing dependencies are present; do not
run npm ci while other executors use this shared checkout.

Owned writes: src/board-selection.ts, optional tests/board-selection.test.ts,
this note, and proof artifacts exclusively in tools/obsidian_cdp/.out/l19-worker-artifacts/DATA/. No commits, builds,
shared inventory/guides, device input, or runtime/public contract changes.

Exact baseline source participation:
- line 74 Loose aliases every record value to any (one explicit-any warning).
- lines 92-107 selectionMovesLineData: array-checked native edges, optional
  miroCanvas/localOverrides, edge ID/node IDs, connector.waypoints and both
  connectorAnchors ends. This decides whether M1 can reuse its original scene.
- lines 120-137 translateSelection: detached JSON copy for commit versus
  shallow preview, lazy canvas() metadata JSON copy, schemaVersion fallback.
  JSON.parse assignments need precise boundary assertions, not new parsing.
- lines 145-160 comment IDs/pins/threads and commentPlaces: normalize unknown
  stored anchors, retain attachments when selected parents carry the pin,
  otherwise place a free pin. Repeated canvas() reads must remain unchanged.
- lines 163-176 preview copies only moved nodes; commit mutates its detached
  node copies. IDs and native x/y are known graph fields; absent nodes remain
  absent. Edges and source references stay shared in previews.
- lines 178-198 normalized BoardConnector values: whole connector translation
  or individual captured from/to ends, follows() for node/image/comment/edge
  attachments, and waypoints only with wholeRoute. Mutable copy types must
  retain the BoardConnector anchor union and unknown extension fields.
- lines 201-239 native edges and localOverrides: both selected nodes or the
  selected edge activate the path; free ends and absolute waypoints move on
  detached metadata, captured-end replacements are merged into existing
  connectorAnchors. Both routeEnds[end] and edge[`${end}Node`] stay unchanged.
  Optional records must not be made universally required merely for lint.
  Use local assertions only where the preceding creation/check and lazy clone
  establish a field, with no added reads, validations or helpers.

Callers and user actions:
- M1 attachSelectionDrag (m1-session.ts:7590-7730) snapshots selectedRouteEnds
  once (7603); boardPoint converts input at current zoom; move (7669) calls
  previewBoardSelection(original, ids, dx, dy, routeEnds); landingGeometry feeds
  native edges, connectorLayer and comments from the same projected document.
  cardsAlone/selectionMovesLineData (7655) controls scene sharing. Cleanup
  (7692) discards preview on cancel/blur/release; release (7729) passes the same
  original and captured routeEnds into authoring.moveSelection.
- CanvasAuthoring.moveSelection (canvas-authoring.ts:2511-2556) validates masks,
  snapshot/stale board, IDs, locked comments and interaction policy before
  translateBoardSelection; commitDocument uses native persistence/history.
- Rectangle/lasso capture (M1:4344) records routeEndsInBox from painted routes:
  body-only crossing is not an endpoint catch; a distant uncaught end stays put.
- A person selects/moves mixed cards, frames, native edges, independent lines
  and comment pins; catches one end; repeats a drag; cancels; Undo/Redo.
  Chained lines must follow attached moved ends before release, at all zooms.

Mandatory evidence before return:
- Targeted ESLint baseline/current on only src/board-selection.ts, no cache,
  JSON output in .out/DATA; reconcile all 69 inventoried diagnostics.
- Existing tests/board-selection.test.ts (marquee, captured endpoint, attached
  selected node/native end, comments, preview/commit equality, source sharing,
  input immutability, free native ends/waypoints and scene-reuse predicate).
- Add focused regression for mixed selection with stored captured masks across
  repeated preview/commit, native/independent chains and nested unknown fields
  if existing selection cases do not cover them. Test only owned test file.
- esbuild.transform on saved original/current owned module, non-minified and
  minified ES2020 ESM: exact JS equality. Verify exported declarations separately
  if feasible; declarations/public signatures must stay the same.
- Focused compiler evidence for this module; any unrelated concurrent failures
  are recorded separately, never fixed here. Scoped git diff --check, UTF-8/CRLF
  verification and patch restricted to owned paths.

Pending coordinator gates (no worker claim of passage): full check/tests/lint,
plugin/MCP build identity, schema/smokes/oracle, integrated scene/history,
group/non-default zoom paths before release, no preview save, cancel/Undo/Redo,
locks/review, real Obsidian Windows and both Android devices in MiroCanvasTest.
No device/ADB/Obsidian input is authorized for this worker. Unknown fields and
miroSource are preserved by identical operations, backed by focused tests.
If an actual missing validation or runtime change is needed, report it as a
separate semantic issue without changing implementation outside this boundary.

## Results (2026-10-06)

Baseline site-range clarification from saved source: connector loop starts at
176 and ends at 193; native edge loop starts at 196 and ends at 229. Earlier
range descriptions identify the same named operations; these are the precise
baseline boundaries. Original SHA256 matches the shared inventory exactly:
4660f598f9b86b2cc2d910c458bcd332d347581aad1f9ca34a4d35bb802e626f.

Changed only owned source/test/note. Replaced Loose with private graph fields,
optional nullable metadata records, typed native override anchors, and a
mutable mapped BoardConnector copy. Public signatures are unchanged. Maps
remain optional; commentPlaces is unknown because normalizeAnchor validates
its entries. JSON clone assertions describe existing copied native/document
shapes; they do not validate malformed input or claim every record is present.
Non-null assertions correspond to existing creation/checks: commentPlaces
initialization; boardConnectors finding valid stored connectors; existing
native override route/free-end checks; localOverrides creation by ??=;
and the wholeRoute waypoint check before copying the same metadata.
Const tuples constrain from/to indexing and emit no additional operations.
No new helper, clone, getter read, runtime check, save or history operation.

Targeted ESLint: 0 errors / 69 warnings -> 0 errors / 0 warnings (-69).
Removed rule counts: explicit-any 1, unsafe-argument 10, unsafe-assignment 12,
unsafe-member-access 43, unsafe-return 1, unsafe-call 2. No rule/config change,
cache, suppression, renamed runtime member, or blanket any/unknown cast.

Focused unit evidence only:
- Original 17 tests pass before expansion.
- Expanded selection suite: 19/19 pass on the current module and 19/19 on
  saved original module injected by a Vite load hook at the real module ID;
  baseline-loaded.json records the original hash to prove interception.
- Added repeated mixed card/frame/native-edge/independent/comment movement
  through native -> connector -> connector attachments, inspecting geometry
  for both preview and commit before any persistence. Captured masks remain
  unchanged; selected attached ends retain attachments, distant ends stay put.
- Added native one-end movement with uncaught waypoints/other end unchanged.
  Nested unknown fields in root/source/card/frame/native edge/metadata/
  override/anchor record/retained anchors/connector/comment/untouched pin and
  uncaught waypoint records are preserved. Input immutability and reference
  sharing are checked. These are document/geometry unit checks, not input,
  runtime group capture, zoom conversion, Undo/Redo or cancellation evidence.
- TypeScript program rooted at owned source and owned tests: no diagnostics
  in these roots or their current dependencies. This is not npm run check.
- Public declaration output is byte-identical to original.
- Unminified esbuild.transform ES2020 ESM output is byte-identical, SHA256
  b56c28c20d74837b4df30e25698afcd8f5a475f5029003dac714004508ba6934.
  Syntax/whitespace minification with identifiers retained is byte-identical.
  Full minification of the identical emitted JS is also byte-identical.
- Direct TS full minification differs in allocated short identifier names;
  its byte hash is NOT claimed identical. Original direct-minified SHA256
  6fb1c18ea1668b3eb888470d9086b7a2618fa5dacf2019e19a8eb8ecca4cac23;
  current 61f665de5d5e3ef124661f4ce885d2fd5baa2bc1397eaab7c02f71598340a3ef.
  Keep this distinction for coordinator production build/hash verification;
  do not change runtime names or minifier settings to force a matching hash.
- Scoped diff check passes; owned source/test/note use UTF-8 without BOM and
  CRLF. Proof artifacts are in tools/obsidian_cdp/.out/l19-worker-artifacts/DATA/; concrete selection.patch includes
  source, tests and this note. The shared register was never edited by DATA.

Risks and semantic boundary:
All 69 diagnostics were removable with types; none needs a semantic fix.
The private shapes express the graph/metadata the existing operation expects,
not a new public validation promise. Throwing getters/hostile or malformed
inputs have identical emitted handling; no new hostile-input certification.
Existing shift(point) emits only x/y, and captured detached-native-end
replacement emits type/x/y. Thus unknown fields on a *moved waypoint* or a
*replaced native anchor* are already not retained by those baseline branches.
This patch preserves their exact existing behavior; fixing that stronger
unknown-field invariant would require a separately authorized runtime patch.
Tests here certify nested unknown fields in the retained/spread/merged records
and uncaught waypoints, not those pre-existing replacement limitations.

Coordinator checks still pending exactly as registered above: full repository
gates and production outputs, integrated native scenes/history, actual marquee
capture, repeated drags/groups at non-default zoom, paths before release,
cancel/Undo/Redo/no preview persistence, locks/review, Windows real-app input,
and both physical Android checks in MiroCanvasTest. No devices were accessed,
no production outputs built, no commit/push, no integration/input claim.
