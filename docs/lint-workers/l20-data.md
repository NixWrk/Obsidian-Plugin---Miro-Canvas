# L20-DATA / Sagan

Shared PRIMARY checkout J:/NIX/WRK/Code/Obsidian-Plugin---Miro-Canvas,
assignment baseline 2f3687c861cb4c33afc5fcd3ac0a562662214a26.
Central pre-registration: [L20-DATA](../lint-remediation-checks.md#l20-data).
Existing node_modules reused. Exclusive source leases: board-selection,
anchors, attachment-labels, canvas-elements, connector-endpoints, device-files,
document-viewer, interaction-policy, local-comments, metadata-writer, metadata,
obsidian-metadata-store, settings (all src/*.ts); focused tests only.
No writes to central registers/plans/locales/builds/main.js/inventory/styles,
other owners' modules, or root .out. All artifacts use
 tools/obsidian_cdp/.out/l20-data. No nested agents, commits, deployments/input.

## D-EXTENSIONS / before edit

Authorized semantic repair, count zero. Existing board-selection.ts lines
153-264 translateSelection: shift at 169 replaces a point with x/y; comments
at 187-192 normalize stored placement or thread anchor, then discard its
extensions on a free replacement. Native end replacement at 250 loses unknown
anchor fields. Captured independent detachment at 222 has the same problem.
Waypoints at 224/238/261 call shift; whole independent movement at 213 invokes
board-connectors.translateConnector (154), which also emits x/y-only waypoints.
That helper is outside the lease: repair the selection consumer locally,
without changing its other M1/paste users or introducing an Obsidian import.
Free-end movement must preserve extras and remove obsolete known anchor fields
when producing a free anchor: type/kind/x/y/nodeId/edgeId/commentId/origin/
targetId/elementId/u/v/t are known model/legacy fields, not extensions.
A waypoint is not an anchor: change x/y only and retain every other field.

Callers/actions: CanvasAuthoring.moveSelection at canvas-authoring.ts:2511-2556
checks stale snapshots, known IDs, route masks, comments and locks/review, then
calls translateBoardSelection and commitDocument. M1 attachSelectionDrag at
7590-7730 captures selectedRouteEnds once (7603), converts pointer coordinates
through boardPoint, previews at 7669, shares landingGeometry with native edges,
connectors/comments, discards preview at cleanup/cancel/blur, and commits at
7729 with the same mask. Rectangle capture at 4344 uses routeEndsInBox;
one caught endpoint never carries the far end. normalizeAnchor and comment
thread readers preserve JSON extensions; geometry deliberately emits positions
only. Therefore retain the stored anchor's extensions, not geometry extras.

Implementation boundary: an extension-preserving point shift; local free-anchor
replacement retaining unknown own fields while removing obsolete known fields;
selection-only independent translation with the same free/attached/waypoint
semantics. Preserve lazy copy-on-write, input/source, selected-parent following,
mask meaning and all native history/locks/stale checks in unchanged callers.
No format/public signature/UI change. No preview persistence or added per-card
work. Remaining helpers/authoring/M1 consumers are read-only here.

Mandatory focused tests BEFORE accepting repair: red extension tests on the
baseline; native/independent caught and uncaught ends, whole/no-mask waypoint
movement, attached-to-free node/image/edge/comment conversions and legacy known
fields, imported/local comment placement including an existing override,
unknown fields at every changed depth, input/source immutability, preview/commit
parity, repeated movement and chained geometry. Existing selection tests and
pure geometry consumers; authoring selection/history/lock tests when feasible.
Record unit evidence separately. Parent must verify real marquee/group/zoom,
paths before release, no preview save, cancel/Undo/Redo/one history step, lock/
review and real Windows/both Android input. Production output not built here.
D-RECORDS note must precede its edits; D-VALID waits for reviewed exact helper
contract and has its own equivalence tests/note before caller edits.

## D-RECORDS / before edit

10 original/live unsafe-assignment sites, read in current baseline:
- anchors.ts:173 cloneJson prototype. Called by unknownFields/normalizeAnchor,
  add/update anchor; M2 creation and M1/MCP connector endpoints consume it.
  User moves/reconnects free/node/image/edge/comment ends and imported anchors.
- attachment-labels.ts:70 isPlainObject prototype. resolveAttachmentLabel /
  attachmentLabelDecision paths read node/metadata/options for file names,
  aliases and global/per-item settings. User attaches/renames/shows file labels.
- connector-endpoints.ts:74 isRecord prototype. buildCanvasAnchorGeometry,
  endpoint update and graph indexing; M1 landingGeometry/native previews,
  connector writes/MCP validation use them. User drags/resizes/rotates/reconnects.
- interaction-policy.ts:187 isPlainObject prototype. read/clone/normalize policy,
  decideInteraction/createInteractionPolicy; M1 tools, authoring and MCP edit
  decisions. User locks/unlocks/reviews and attempts create/edit/delete/move.
- local-comments.ts:201 cloneJson prototype and 882 deleteLocalReply .find
  result. Thread/reply normalization, metadata cloning and M1 mutateComment
  callback (m1-session.ts:3779), MCP comments writer. User opens/replies/deletes
  a local reply; imported replies remain immutable and input stays untouched.
- metadata-writer.ts:197 cloneSnapshotValue prototype. readSnapshot and write
  at 460, native metadata transactions and MCP FileMetadataStore writer.
  Any style/comment/lock write must reject hostile snapshots and retain source,
  unknown fields, stale checks, atomic rollback and one native history boundary.
- metadata.ts:1478 assertPlainObject prototype, called by cloneValue (1581),
  parse/validate/migrate at 1626/1635/1777, board sessions/authoring/MCP parse.
- obsidian-metadata-store.ts:225 cloneJsonValue prototype and 561 native
  requestSave Reflect.apply result. readDocument/commitDocument 491/510 and
  createObsidianMetadataStore 669, binding/session and CanvasAuthoring writer.
  False/thenable/throw must still rollback; true records one native undo/save.

Plan: annotate const prototype results as unknown (the existing comparison
narrows them); assigned prototype as object|null per ECMAScript getPrototypeOf
contract with the existing try/catch retained; .find output and Reflect.apply
return as unknown before their existing guards. No predicate/public changes,
new runtime operations, altered array callbacks, validation removal or blanket
record casts. Pure modules remain free of Obsidian runtime imports.
Mandatory: targeted eight-module lint delta exactly -10; esbuild plain JS,
identifier-preserving minification and TS transpile output/public declarations
before/current equality (save intermediate records stage before validation).
Focused anchors/attachment-labels/connector-endpoints/interaction-policy/
local-comments/metadata-writer/metadata/obsidian-metadata-store tests, including
existing null/nonplain/cyclic/accessor/revoked-proxy, locks/review, imported
immutability, unknown/source, refused/async/throwing native save and rollback.
Parent owns integration, real-app/history and platform input. Do not claim them.

## D-VALID / before edit and contract review

The James H-CONTROL contract/source/tests are now present in
[l20-foundation-settings.md](l20-foundation-settings.md#scope-and-before-edit-helper-trace-2026-10-06)
and src/control-characters.ts. His F-VALID2 note calls it reviewed; helper-tests
reports 4/4 passing exhaustive old-profile tests. Read the implementation:
primitive strings only, no imports/coercion/trim/normalization; C0/DEL keeps C1;
attachment profile keeps U+200D/U+2065; full filename replacements keep DEL/C1;
Unicode codepoint length counts valid surrogate pairs once. Local review finds
these exact caller profiles compatible. Parent contract confirmation is still
required by this assignment: prepare candidates/proof in the exclusive artifact
root first, and adopt into source only when that confirmation is available.

Eight leased modules / 11 original and current control-regex diagnostics:
- anchors.ts:204 isSafeKey, cloneJson/unknownFields/normalizeAnchor and local
  anchor map writers: use hasAsciiControl(value) on the existing raw key, after
  nonempty/256-unit/reserved checks. No trim moves and no alias-policy change.
- attachment-labels.ts:51 CONTROL_OR_FORMAT used by sanitizeAttachmentLabel
  (153) and segmentFromPath (171), global/per-node visibility/alias resolution.
  Replace those .test calls with hasControlOrFormat; keep Unicode validity,
  NFC normalization, 1024-unit bound, separators/colon and trim order. Actions:
  importing/device attachments, aliases, filename toggle, reopen and export.
- canvas-elements.ts:15 INVALID_ID_CHARACTERS/asStableId at 44. Used by adapter,
  selection/hit testing, native menu/handle probes and source renderer; IDs from
  direct/nested/getData fallback. hasAsciiControl at the same guard, preserving
  zero/512-unit length, exact trim equality, getter/reflect/call defenses.
- device-files.ts:15 storeDeviceFiles name sanitizer: replaceInvalidFilenameCharacters
  replaces each C0 or / backslash : * ? double quote < > pipe with one underscore;
  keep following leading-dot replacement, trim/empty refusal, arrayBuffer ->
  availablePath -> createBinary sequencing. M2 From device action/storage.
- document-viewer.ts:28 localDocumentPath uses C0/DEL, then all independent
  path/scheme/traversal/encoded-path checks. :53 describeLocalDocument safeSubpath
  is # prefix, C0/DEL and < > exclusion after length<=1024/trim equality; preserve
  page parsing/caps, immutable descriptors, host.hasFile/openFile no writes.
  M1 toolbar and native document host page/fit/open-original actions.
- local-comments.ts:25 displayAuthorName checks the existing trimmed 256-unit
  name with hasAsciiControl; :178/:179 safeKey checks first raw character then
  the full raw string after existing trimmed-empty/length checks, finally
  reserved case-insensitive keys. Preserve the first-position short circuit.
  rename author/display alias/add/reply/delete/list paths, imported identity,
  nested fields and immutable replies; M1 thread actions and MCP comments.
- metadata.ts:1323 validateMetadataObject author aliases checks bounded
  local/imported groups and each original raw name string (1..256 UTF-16 units).
  hasAsciiControl(name) replaces only the regex. Parse/write/author aliases;
  invalid maps retain the same diagnostic code/path/message and input data.
- settings.ts:339 SAFE_CUSTOM_FONT_FILE/readCustomFonts: hasValidFilenameCharacters
  on the already-trimmed filename, 1..180 Unicode codepoints; . and .. exclusions,
  family validity, duplicate/MAX_CUSTOM_FONTS/freeze unchanged. Settings custom
  font chooser/removal, persistence and toolbar font list; no settings-tab edits.

No new regex construction, universal profile, public signature, UI text, trim,
path acceptance or size broadening. Parent owns helper and all other adopters.
Mandatory candidates/current proof: exhaustive 65,536 code units alone and
first/middle/last; C0/DEL/C1/formats/near misses; mixed Unicode, surrogate pairs/
lone units; empty/trim/limits/reserved/path guards; replacement bytes and exact
storage callback ordering; consumer outputs/diagnostics against saved originals.
Run eight modules' focused tests plus helper profile tests. Targeted lint must
remove only 11 validator diagnostics; retain D-RECORDS intermediate identity.
Runtime validator JS legitimately changes, so equivalence evidence applies.
Parent owns native desktop/mobile filenames/fonts/comments/docs/IDs plus all
integration/builds/source preservation/history/input QA.

Parent confirmed the exact shared profiles directly in this chat (2026-10-06):
hasAsciiControl includeDelete, exact format ranges with U+200D/U+2065 allowed,
filename path flag, underscore replacement retaining caller trim, and 180
codepoint bound. Validator candidates may now be adopted after this trace.
Parent compiler also found the new test's empty-mask inferred union; annotate
its ends as Record<string, SelectedRouteEnds>, only in the owned test fixture.

## Results and handoff (2026-10-06)

All three bounded data slices are implemented in the shared PRIMARY checkout.
13 owned source files changed; two exclusive focused test files added:
tests/board-selection-extensions.test.ts and tests/data-validation.test.ts.
The parent's reported mask union error is fixed with the explicit
Record<string, SelectedRouteEnds> fixture annotation. No other worker's tests
or implementation were fixed/reverted. No shared register/plan/locales/build/
inventory/styles/device input, root .out write, nested agent or commit/push.

D-EXTENSIONS: shift preserves waypoint extension properties at every affected
selection path. Selected independent free/attached ends and native override
ends retain their extensions; newly free anchors remove only the known current/
legacy attachment fields. Imported/local comment placements use extensions of
the stored placement or original thread anchor, not geometry-only positions.
The no-mask independent selection consumer now performs the same anchor and
waypoint translation locally; board-connectors.ts and its other consumers are
unchanged. Selected-parent following, uncaught far ends, waypoints with false
wholeRoute, lazy metadata copying, source/input, routes/styles/public API and
native history/locks/stale gates retain their existing behavior. Runtime code
changes are deliberate and are not represented as byte-identical JS.

Focused evidence:
- Corrected baseline extension suite: 12/12 fail on original source via actual
  Vite module interception; after repair all 12 pass. Initial image fixture
  attempt used a text card and is excluded; the final image case uses a file
  image node and actual image geometry. No failure was fixed by weakening code.
- Final owned selection/data/validator suites: 15 files, 203/203 pass, no skip.
- Targeted existing CanvasAuthoring mixed-selection consumer suite: 20 pass,
  68 unrelated cases excluded by -t (not claimed as passed). Includes one native
  history step/Undo/Redo, locked comments, stale snapshots and failed-save
  rollback using a synthetic NativeGraph, not an actual Obsidian runtime.
- Existing repeated native -> independent -> independent chain and frame/card/
  comment selection geometry tests remain green; previews and commits use the
  same captured masks. Actual group capture/zoom/input remain parent checks.

D-RECORDS: all 10 unsafe-assignment diagnostics removed with annotations only.
records-proof.json compares saved before/records intermediates for all eight
modules: esbuild plain JS, syntax/whitespace minification retaining identifiers,
and TypeScript transpile output are byte-identical. Intermediate public .d.ts
is byte-identical; no compiler diagnostics with the installed SDK ambient
root. A first isolated compiler run omitted SDK global declarations and saw
only transient dependency errors in the parent's new dom-elements module;
it is superseded by the final correct SDK-rooted focused proof, without editing
that module. Whole production minifier/bundle verification remains parent QA.

D-VALID: parent explicitly reviewed the shared character contract in this chat
before source adoption. All 11 regex diagnostics removed using that helper,
without regex construction, duplicated profiles, disabled rules, broader path
acceptance or changed trim/length/reserved-name policy. Actual current consumer
outputs match saved originals in seven exhaustive public-entrypoint tests:
65,536 UTF-16 units alone/first/middle/last, mixed Unicode/surrogates/control/
format near misses, filename codepoint limits, IDs/raw keys, attachment NFC/
basename, document paths/# fragments/pages, metadata diagnostics, comment IDs
and imported author alias presentation, and device callback values/order/errors.
Candidate tests/proof were prepared while awaiting the parent's contract;
final current-equivalence proof executes the adopted source, not candidates.
Device callback evidence uses portable fake host callbacks, not an OS picker.

Lint and contracts:
- Owned baseline: 21 warnings / 0 errors; after records: 11 / 0; final: 0 / 0.
  Delta -21 = 10 unsafe-assignment + 11 no-control-regex. board-selection stays
  at zero. No lint configuration/rules or severity changes.
- Focused final TypeScript roots are the 13 source files, existing selection
  test and both new test files, plus installed Obsidian ambient SDK types.
  Zero owned/dependency diagnostics. All 13 public declarations are byte-identical
  to baseline, including documentation. This is not the full npm run check.
- Scoped git diff --check passes. All final owned source/test/note files are
  UTF-8 without BOM with CRLF; original snapshots retain baseline bytes for proof.
- Artifacts and a concrete complete owned patch/summary are exclusively under
  tools/obsidian_cdp/.out/l20-data/. Failed setup/fixture attempts are superseded
  by the named final reports above and never counted as passing evidence.

Pending / risks for parent:
Full repository gates, frozen plugin/MCP production outputs/schema/smokes,
real Windows/both Android input, selection paths before release at non-default
zoom, actual marquee/frame groups, no preview saves, cancel/Undo/Redo/history,
locks/review and UI filename/font/comment/document operations. Strong unknown
field retention deliberately changes previously lossy selection serialization;
review schema/unknown payloads at the final persistence boundary. The known
attachment field list includes legacy kind/targetId/elementId aliases; future
model-known attachment fields will need an explicit update. The standalone
board-connectors.translateConnector helper is unchanged outside this lease;
this repair covers the shared selection preview/commit consumer requested by
D-EXTENSIONS, not every unrelated connector operation. No blockers remain
within the bounded DATA assignment. No app/device/integration gate is claimed.
