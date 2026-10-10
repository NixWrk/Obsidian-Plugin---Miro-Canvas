# Edge enhancement trace and checks

Recorded before implementation, 2026-10-07. Owned files only:
`src/board-edge-actions.ts`, `tests/board-edge-actions.test.ts`, this document.

## Trace before code

- `board-connectors.ts`: independent records keyed by id; `from`/`to` anchors,
  asymmetric caps, `labelT`, ordered waypoints; implicit legacy block head.
- `connector-endpoints.ts`: checked own-property JSON clones, native fallbacks,
  recursive native/independent/comment geometry; unresolved cycles fail closed.
- `anchors.ts`: an edge anchor's `t` measures length from its start.
- `source-model.ts`: imported caps remain in source; local connector overrides
  win over source; native omitted ends have different defaults.
- `local-comments.ts`: imported evidence is immutable; effective pin placement
  uses `commentPlaces[origin:id]` ahead of the original thread anchor.
- `metadata.ts` / `interaction-policy.ts`: version/known metadata validation,
  review and locks; connector style/endpoint records need extra validation.
- `canvas-authoring.ts`: parent applies planned native edges and metadata in one
  checked `rewriteGraph` action against the captured snapshot. Pure planners
  never save, invoke Obsidian, mutate history or alter source evidence.

Affected actions: Flip Edge on one/many native and independent lines; select or
highlight connected/incoming/outgoing lines for cards or selected lines; Undo,
Redo, reopen; moving lines/cards/comments after a flip.

## Required pure checks

Asymmetric ends/sides/caps and endpoint extensions; absent native-end defaults;
two flips; label shares and waypoint extensions; direct and chained dependent
native/independent anchors; local/imported/hidden comment places and free anchors;
unknown roots and immutable source; mixed batch atomic refusal, review, locks,
malformed JSON/known shapes, missing/cyclic geometry; direction filters, effective
anchors rather than native fallback nodes, transitive traversal and cycles.

## Native integration checks (pending; no real-app evidence yet)

Parent integration is required before these can run. Keep these results separate
from unit and synthetic checks. On isolated Windows Obsidian, use real mouse and
keyboard input: flip each form, mixed batch, two flips, Undo/Redo/reload; inspect
all paths and comment pin positions. Check asymmetric caps/labels/waypoints,
imported source hashes, locked/review refusal and unchanged history on failure.
Select/highlight each direction on mixed chains; unrelated lines stay out; one
visible marquee and native outline. Drag/resize/rotate mixed selections at 50%
and 125% zoom; inspect attached paths before release and after commit/cancel,
including dependent chains and comment-attached lines. Check imported/local pin
placement and locked comments. Repeat affected checks on connected physical
Android devices in MiroCanvasTest, recording model/app version and real ADB
input separately from CDP synthesis or physical stylus handling.

## Own-file lint follow-up trace (before fixes)

Identifier validation participates in Flip selection, stored graph IDs and line
queries. Replace its control-character regex with the repository's exact helper;
keep malformed-ID refusals and the same allowed IDs. JSON clone prototype
inspection participates in every plan: explicitly type its observed prototype
without weakening plain-object refusal. Mandatory checks: focused tests, targeted
ESLint, TypeScript. These changes have no UI input path yet; native checks above
remain pending. This register is used because shared documentation is outside
the assigned file ownership.

## Public contracts for parent integration

`planFlipBoardEdges(document, lineIds, options?)` returns a discriminated plan.
`options.defaultLabelT` must be the session's `connectorLabelPosition` (default
0.5). `options.editAllowed` is an optional additional host guard called once with
every changed line, comment selection ID, free-anchor ID and endpoint target.
Input IDs are deduplicated; each selected native/independent line flips once.

On success, `document` is a complete detached JSON board. `flippedLineIds` lists
the requested distinct IDs; `changedLineIds` additionally includes native and
independent lines whose own stored reference changed. `changedCommentKeys` uses
`local:id` / `imported:id`; `changedFreeAnchorIds` lists changed free-anchor keys.
Transitive lines that merely follow a preserved attachment need rendering but
no record update, so are absent from `changedLineIds`. Diagnostics are empty on
success. No IO, source mutation, native runtime access, schema change or history
operation occurs here.

Flip swaps native nodes/sides/ends, independent endpoint records, endpoint
override records and caps; reverses stored waypoints without stripping their
extensions; complements label/edge-anchor fractions. References within a mixed
batch are complemented once after swapping endpoints. Normal decimal shares
use decimal subtraction to avoid ordinary `1-(1-t)` noise; extreme floating
precision can still round to the nearest representable JSON number. Geometry
verification requires preserved attachments within 0.001 board units.

Native omitted caps become explicit (`fromEnd` defaults to `none`, `toEnd` to
`arrow`). Imported or partial cap overrides become explicit effective caps so
immutable source defaults cannot undo the flip. Legacy native/independent block heads
become explicit `stealth`. Non-midpoint default label shares become explicit.
Original local/imported thread anchors and all source evidence stay unchanged;
`commentPlaces` gets a complemented presentation anchor where needed, including
hidden imported threads. These necessary materialized values/places remain
after a second flip; two flips restore effective direction, geometry and shares,
not the prior omission of defaults. Fully explicit records roundtrip exactly
for representable decimal complements. Native Undo restores the original snapshot
including its omitted fields and absence of presentation overrides.

On refusal there is no proposed `document`. `reason` and the diagnostic `code`
are `invalid-input`, `invalid-document`, `invalid-metadata`, `missing-line`,
`locked`, `review-mode`, `unresolved-geometry` or `geometry-changed`. Host guard
exceptions also fail closed. Every changed line/pin/anchor and the selected
line's logical endpoint targets is checked against the original policy. Comment
thread locks and `commentDecorations` locks are also respected. Cyclic/missing
geometry touched by a flip refuses the whole batch; unrelated unresolved lines
are left alone. JSON cloning refuses accessors, cycles, non-plain objects,
non-finite/non-JSON values, sparse/extended arrays, enumerable symbols, depth
over 64 and arrays longer than 100,000. Unknown JSON fields survive at every
level, including own `__proto__` keys; no lossy stringify/parse clone is used.

Parent captures a CanvasAuthoring snapshot, plans from `snapshot.document`, then
commits against that same expected snapshot in one atomic native-history action.
For `rewriteGraph`, remove/re-add only changed native edge records (same IDs),
and replace the metadata draft with the complete planned `miroCanvas`. Do not
split native edges, independent connectors, places or free anchors into separate
writes. Refusals produce no history entry. The parent owns stale checks,
localized UI, toolbar/commands, selection/highlight rendering and native Undo.

`planConnectedBoardLineIds(document, selectionIds, direction?, traversal?)`
returns `{ok: true, lineIds, diagnostics: []}` or the same refusal shape.
Selection accepts native nodes, native lines and independent lines; an empty
selection returns an empty result. Defaults are `connected` and `direct`.
`outgoing` matches a line whose **from** target is selected; `incoming` matches
its **to** target; `connected` matches either. Caps do not determine direction.
Explicit native anchors replace fallback-node incidence. Direct means one hop;
transitive promotes found lines to targets and walks connector-to-connector
incidence only (never promotes their other endpoint nodes). Selected lines are
excluded; results are deduplicated in native-array then independent-map order.
A visited set terminates cycles. These read-only queries work on locked/review
boards and can inspect cyclic attachment graphs without resolving geometry.
Planning is event-driven; the parent should memoize highlight results by board
identity/selection rather than invoke full-board JSON planning every frame.

## Verification evidence

Development dependencies were already available in the parent-managed worktree;
no shared installation or lockfile was changed. Unit tests and targeted lint run
with escalated shell permission for this assigned worktree's caches. No empty
redirected log is interpreted as a passing check.

- Focused plus existing connector/anchor/policy regression command:
  `npx vitest run tests/board-edge-actions.test.ts tests/board-connector-writes.test.ts tests/board-connectors.test.ts tests/connector-endpoints.test.ts tests/anchors.test.ts tests/interaction-policy.test.ts`.
  Final run: 99 tests passed (37 owned + 62 existing) across six files;
  explicitly retained test exit code 0.
- `npx eslint src/board-edge-actions.ts --no-cache`: zero warnings/errors after
  the recorded own-file fixes; final explicitly retained lint exit code 0.
- Repository TypeScript checks initially reported the other agent's
  `src/obsidian-board-index.ts:192` `Object.hasOwn` ES2020 error; a later run
  reported `tests/board-knowledge.test.ts:256` with the same error. Neither file
  is owned here; those failing exits are retained as unrelated evidence. After
  their owners' parallel fixes, final `npm run check` completed with exit 0.
- Synthetic/browser and real Obsidian/physical Android acceptance remain
  pending parent integration. Build output, shared docs/locales/main/session,
  metadata/schema and git were not written by this implementation.
- `git diff --check` completed with exit 0. No-index checks of the three
  untracked owned files emitted no whitespace diagnostics but returned 1 because
  they differ from `/dev/null`; that difference status is not treated as a
  successful exit. A separate explicit whitespace check is recorded below.
- All three owned files were normalized to CRLF/UTF-8 without BOM; explicit
  trailing-whitespace/conflict-marker validation completed with exit 0.

## View-only collapse trace (before implementation)

Assigned follow-up owns `src/board-groups.ts`, `tests/board-groups.test.ts`, and
this collapse section only. The old toggle shrank native groups and restored
their snapshot dimensions on expand. This changes native Canvas containment and
can mix saved boxes with preview geometry. Collapse will instead record only
`groupCollapse` (expanded width/height and captured native member IDs); expand
will delete only that flag. Native node arrays, source and other roots stay exact.

Traced callers: M1 uses `groupSelectionIds` for native member expansion and
memoizes `collapsedGroupOwners` by board identity/gesture; source rendering and
connector endpoint geometry use that map to aim external lines at visible group
proxies. Parent owns those consumers, CSS, native history/locks and geometry.
`board-selection` imports connector endpoint geometry, so importing its comment
ID helper here would introduce a cycle once geometry imports group helpers.
Use the existing `miro-comment:origin:id` key convention without that import.
Ownership can be determined from stored anchors and expanded containment alone;
it must not build routes or import `connector-endpoints`/`board-selection`.

Affected actions: Collapse/Expand nested or empty frames; move, resize or rotate
their selections with internal native/independent lines and comment/free pins;
external crossing lines and connector/comment chains; Undo/Redo/reopen/export.

Mandatory pure checks: no raw node changes on either toggle, snapshot-only
dimensions/membership, compact preview rectangles bounded by 280x64, outer
ownership, nested/empty/cyclic memberships, fully internal connectors and pins,
external/missing/cyclic dependencies and outlying waypoints, source/unknown
preservation, nonmutation and invalid-input refusal. Ownership must terminate
on cycles without a route resolver; callers retain the map during a gesture.

Native acceptance remains pending parent integration: one native history step,
locked/review refusal, exact Undo/Redo/reload, raw group dimensions unchanged,
visible compact headers and hidden internal items, external lines/comments and
chains tracking live proxy geometry before release and after commit/cancel at
50% and 125% zoom. Verify nested groups, empty groups, export and source hashes
in isolated Windows Obsidian with real input. Repeat affected checks on physical
Android MiroCanvasTest devices; record model/app version and ADB vs CDP/stylus
input separately. Unit ownership/projection checks do not constitute native
path or device evidence.

Collapse-only lint follow-up trace before fixes: metadata narrowing participates
in both toggle plans; remove a redundant assertion without changing validation.
The projection callback handles native nodes and invalid entries; explicitly
type those entries as unknown so preview copying does not return implicit any.
Required regressions: collapsed native arrays remain unchanged, compact previews
retain unknown fields, the focused collapse/edge/transfer tests and targeted
ESLint/typecheck. Shared lint documentation is outside this task's ownership.

Collapse API handoff:

- `toggleGroupCollapse(document, id)` returns a detached plan or `undefined` on
  unsupported/invalid input. Collapse records width/height and `children` (the
  existing schema's captured native-member IDs); expand deletes only
  `groupCollapse`. Native nodes/edges are exact on both paths. Existing snapshot
  dimensions never overwrite a later native resize. Parent applies the plan
  through `CanvasAuthoring.applyDocument` and owns locks/stale/history checks.
- `compactGroupRect(node)` returns `{x,y,width,height}` or `undefined` for invalid
  dimensions. It keeps the current top-left, caps width at 280 and height at 64,
  and never enlarges a small native frame. This is also the parent's lightweight
  helper for live owner-box previews.
- `projectCollapsedGroups(document, owners?)` returns geometry-only node copies
  for visible collapsed groups and hidden native children, using the visible
  owner's compact box plus `projectedCollapsed: true`. Empty groups are compact
  even with an empty owner map. Other records/metadata/source are shared and
  unmodified. Never persist this output. Use this full-board projection only
  when board identity changes or for an export snapshot, not every frame; keep
  the captured owner map during live gestures and use live compact owner boxes.
- `collapsedGroupOwners(document)` maps hidden native node/line IDs, independent
  line IDs, `miro-comment:local:id` / `miro-comment:imported:id` and free-anchor
  keys to visible outer group IDs. Native snapshots preserve native membership;
  additional line/pin ownership is derived from stored anchors once per board
  identity. Free-anchor keys colliding with graph IDs are not allowed to replace
  graph ownership. Hidden imported comments are considered for dependency
  classification without changing their source or hidden status.
- Fully internal means every terminal belongs to the same visible group (or is
  a free point within its expanded raw rectangle), every stored bend stays
  within it, and every referenced line/pin is also internal. Explicit native
  anchors replace fallback-node incidence. Lines to the visible group itself,
  external lines and their dependents, cross-group lines, missing dependencies
  and outlying bends remain visible. Grounded cycles with contained terminals
  can be internal; ungrounded cycles and their dependent tails remain visible.
  Iterative invalidation/grounding bounds cycles and deep chains without route
  resolution or recursion. Mutually recursive group membership elects the first
  native group as visible; otherwise outer groups win. Overlapping roots use
  first-native-group precedence. No geometry or board-selection import exists.

Collapse verification (pure/synthetic only): 18 group tests plus edge/transfer
consumer regressions passed, 66 tests total across three files. The long-chain
case contains 2,500 dependencies. `npx eslint src/board-groups.ts --no-cache`
and targeted ES2020/Obsidian typechecking passed with exit 0. Repository
`npm run check` reported the parent-owned `src/main.ts:353,572` missing
`openSelectionTransfer` method; no owned-file error was reported. Native/device
acceptance above remains pending. Only the group module/tests and this collapse
section were changed for this follow-up; no commit or push.

## Subsequent native group/notes status — 2026-10-08

The ignored `native-groups-R52Y808PDJB.json` receipt in
`tools/obsidian_cdp/.out/feature-expansion` remains **FAILED**. It records
collapse and native Undo/Redo repaint observations, but its held native drag at
0.5 zoom did not move the runtime group. Those partial observations do not accept
the held-gesture geometry invariant. Mill is correcting the real ADB input and
parent owns the retest. Device is supported SM-X736B / Obsidian 1.13.8; receipt
input separates ADB action taps from CDP text/preparation.

Windows `native-notes-Windows.json` passes a generated note-property connection
and actual text/file rename smoke with source retained. Parent additionally
reports the derived-edge rename check passed. Manual-edge preservation, stale
generated removal, dependent connector/comment anchors, nested/mixed groups,
cancel/commit/Undo at non-default zoom, locks and transfer stale/partial-failure
cases remain separate advanced native gates. No source or harness was changed
by this documentation reconciliation, and no whole-group acceptance is claimed.

Follow-up held-input receipt now uses corrected real ADB preparation and exposes
an actual connector-chain endpoint mismatch: observed 311.556, expected 364.444.
The earlier no-movement harness failure stays recorded, but is no longer the
only blocker. Mill owns the source diagnosis/repair; native held preview,
commit/cancel and Undo retest remain pending. Do not call group implementation
or complete native geometry acceptance finished while this defect is open.
