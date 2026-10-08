# Canvas enhancement execution plan

Requested on 2026-10-07. Work starts from 0.2.10 in a separate managed worktree;
the original checkout's documentation changes are unrelated and preserved.

## Scope and dependencies

1. Search: index text inside linked Markdown file cards, include subpath bounds,
   optional regular expressions/case matching, clear invalid-pattern feedback,
   invalidate on file edits/rename and dispose pending reads on board close.
2. Connections: reverse native/independent endpoints, caps, anchors and route
   shares atomically; highlight/select connected, incoming and outgoing lines.
   Preserve connector-to-connector and comment anchors through Flip Edge.
3. Presentation: zoom content thresholds, persistent palette editor and named
   custom CSS styles for cards/lines, scoped and reversible on unload. Styles
   follow board identity and never change source evidence.
4. Groups: persist reversible collapse state, keep real cards/lines in native
   JSON, project group geometry for hidden children and connected chains; expand,
   undo and cancel restore positions. Nested groups and non-default zoom matter.
5. Selection transfer: move a selected subgraph into a new board, retain IDs and
   unknown fields/source provenance, replace it with a native file card, rewrite
   boundary edges, validate stale source/target and compensate a failed write.
6. Obsidian integration: board properties, card links/embeds, Markdown links and
   file-node references in metadata cache, outgoing/backlinks/graph, rename/delete
   lifecycle, properties/tag search, and automatic property-derived file edges.
   Native/private API boundaries must be inspected in the actual installed app
   and fail closed. A cache rebuild must not run per card per animation frame.

Search, connection planning and the integration module can run in parallel.
Shared settings/locales/main/session integration, group projection and transfer
remain on the parent to avoid overlapping mutations. Format changes are made in
the upstream schema first, then copied at a pinned commit; unknown fields and
miroSource are never dropped. No release is claimed until integration checks pass.

## Mandatory regression checks before implementation

For each feature retain unit/pure-plan and synthetic evidence separately from
real Obsidian. Windows uses an isolated background instance; Android uses only
the connected physical devices' MiroCanvasTest vault. No foreground takeover or
OS screen capture during export. Device/app versions and ADB vs CDP input are
recorded separately; unavailable device checks stay pending.

- Flip: native/independent lines, asymmetric caps, custom endpoint fields,
  waypoints and label t, dependent connectors/comment anchors, two flips, undo;
  geometry before release and commit/cancel at 50%/125% zoom.
- Edge selection/highlight: incoming/outgoing/both, mixed native/independent
  chains, one native outline/marquee, unrelated lines unselected, drag/undo.
- Zoom/style/palette: light/dark, editing exemptions, reading/export, persistence,
  reset/reorder/duplicates, touch buttons, scoped CSS and unload restoration.
- Search: embedded note text/subpaths, malformed regex, case/Unicode, live file
  edits/rename, stale asynchronous reads, no frame-based disk reads, keyboard/touch.
- Collapse: nested/empty groups, locks/review, external lines and chains track
  visible proxy during previews, expand/undo/reload preserve child coordinates.
- Transfer: cards/lines/comments/metadata/unknown fields, external crossing
  links, stale files, partial write failure, native history/undo and target reload.
- Integration: real graph/outgoing/backlinks, links/embeds to one card, properties
  and tags, rename/delete, startup/unload cache restoration and large vault bounds.

## Status

The feature modules and main/session integration are present in the worktree;
the expansion remains unreleased; the native-discovered defects below are repaired.
Focused unit/synthetic checks are recorded
in the feature documents and do not substitute for native acceptance.

Native status reconciled on 2026-10-08 from ignored receipts in
`tools/obsidian_cdp/.out/feature-expansion`:

| Case | Current evidence |
| --- | --- |
| Properties/cache/references, graph, visible card and property-only backlinks | PASS: `native-integration-Windows.json` and `native-integration-R52Y808PDJB.json`; supported tablet SM-X736B / Obsidian 1.13.8. |
| Linked-note content search, generated note-property connection and actual FileManager rename | PASS: `native-notes-Windows.json`; renamed text/file references and retained source evidence are recorded. Parent reports the derived-edge rename check passed too. |
| Independent PDF/PPTX card content | PASS: parent content validation plus `export-text-final-Windows.json` / `export-text-final-SM-X736B.json`: Launch card, Second card and Outside rendered for both formats, outputs created, workers terminated, working state restored. Default background throttling remained enabled. |
| Board-property global-search supplement | Windows and SM-X736B PASS: native-property-panes receipts verify typed query and genuine Canvas navigation. On tablet real ADB taps work with the keyboard still open: result y271, keyboard starts y803. Root renderSearchInfo fixes the captured callback; owned results precede the untouched native root. 49 focused tests pass. |
| Canvas outgoing pane | Windows and SM-X736B PASS in the same receipts: property-only board renders Feature Reference and real click/tap opens the note. Visible native pane resize/scroller layout is preparation. Filters/recreation/unload remain separate checks. |
| Held group gesture | Windows and SM-X736B PASS: real held previews at 0.5/1.25, native display/hit and independent chained routes, unchanged preview history/disk, exact commit positions, Escape cancellation and Undo. Native integer delta and verified original press owner fix the earlier lag/jump. |

Windows uses trusted CDP input with bounded native frame preparation. Tablet
receipts use ADB action taps with CDP text/preparation; they do not establish
physical stylus/palm behavior. SM-A336E / 1.12.7 is below minimum 1.13.7;
the phone disconnected before final rebuild acceptance. Earlier legacy-device
smokes remain recorded; they do not certify the newest build or supported
phone versions.

The final post-repair suite passes 3,004 tests with one pre-existing skip in
158 files. Full typecheck, build, CSS, schema `225a8a`, submission, MCP/CLI and
all three synthetic smoke modes pass. Source lint has zero errors and one
existing compatibility command-ID warning. Upstream schema work is tracked in
[miro2obsidian PR #8](https://github.com/NixWrk/Miro_2_Obsidian/pull/8).

Still open: additional native
property/tag query combinations and unsupported-query noninterference;
nested/mixed-selection connector previews beyond the tested collapsed-group fixture;
advanced Flip dependencies/locks/history; transfer stale/partial-failure cases;
style/palette/threshold lifecycle and export combinations; heading/block/regex
search edge cases; rename ambiguity/folder/delete/closed-board CAS; cache and
pane cleanup/recreation/unsupported shapes/large-vault limits. Individual smokes
do not close these gates. Earlier failures below remain as historical findings;
only the exact scenarios covered by later receipts are superseded.

## Native retained-edge order before transaction repair (2026-10-08)

The Windows transfer UI creates its target, then rejects the source import with
`edges external not at its requested position`; its rollback reports the same
order mismatch. Native Canvas retains existing edge Map order during import,
while the transfer plan enumerates external/internal lines in another order.
The shared native-graph certification already matches both arrays by ID.
Authoring still compares edges by array index before repairing root metadata.
Match edges by unique ID during authoring import/rollback certification; keep
node ordering rules, every endpoint/style/unknown field and source check intact.
Mandatory checks: reordered retained edges accepted, changed endpoints/unknown
fields or duplicated IDs refused, root metadata repaired, one native history
step, failed save rollback, real transfer/Undo and target retained after Undo.

## Live index publication boundary — implemented

The Windows properties form commits the native document immediately, but the
disk-only board index retains the previous properties until native file save.
The implemented boundary is `notifyCommittedBoardDocument`, called after a
successful feature document apply, outermost Undo/Redo after refresh, and
`vault.modify` for the exact current file owner. It coalesces publication into
one microtask after synchronous transactions. There is no requestSave wrapper.
Held pointer/tool/selection previews, native dragging, disposed sessions and
nested history activity suppress publication. Main checks the captured TFile
and exact current view before `ingestLiveDocument(file, document, { owner,
identity })`; session disposal releases only that owner's authority. No
refresh/frame publication or full imported-source retention is introduced.
Native delayed reads must not replace the live owner's settled projection.
Check immediate properties/cache, Undo/Redo, text links, no-op identities,
held preview suppression, failed transaction rollback, owner replacement/unload,
large-board no frame publication, and Windows/Android separately.

## Checked transaction boundary findings before repair

The additional applyDocument regressions find eight failures: locked dependent
threads/places/free anchors were not checked, and a save throwing after native
history append restored the board but left a redo entry. These failures remain
in the unit receipt; they are not accepted behavior.

Read-only Windows Obsidian 1.14.4 inspection confirms Canvas.history has data,
current and max; push appends a document and truncates redo. requestPushHistory
is a debounce function with verified run/cancel methods. The new feature-plan
boundary must flush a previous pending step, capture that stack, flush its own
single step, and cancel/restore it on failure. Do not change existing compound
authoring gestures' debounce behavior. Unsupported history shapes fail closed.
Mandatory checks: locked dependents/deletion, failed append then redo, queued
history cancellation, stale data after prior flush, native one-step undo/redo,
and connected-card creation keeping its existing grouping.

## Real Undo finding before repair

Windows 1.14.4 trusted CDP Ctrl+Z restores the collapse metadata/history but
leaves old hidden classes and projected native SVG routes until manual refresh.
The existing instance undo/redo guards already bracket native history and
refresh selection/guards at outer depth zero; they do not repaint presentation.
Add one session refresh at that verified boundary, with no save or frame loop.
Mandatory checks: native Ctrl+Z/redo restores visible cards/pins/lines and compact
proxy geometry without another input; shape/custom style/Flip/transfer history,
source/unknown fields preserved, locked policy bypass only inside native history,
unit locking/history/search/appearance suites, Windows and physical tablet.

## Decoration identity before performance repair

Zoom/style/highlight targets initially followed the whole preview document and
scene position signature. A moving group creates a new preview per pointer move,
although its colors, assignments, links and membership have not changed. Cache
those enhancements against the existing settled-board identity plus DOM/selection
identity; route geometry still follows each preview. Mandatory regression: the
large-board native-read/frame suites, drag/resize path previews and cancellation,
DOM replacement/editing exemptions, styles/highlight reapply after commit/undo.

The compact geometry projection must be exclusive to minimap/attachment geometry:
the shared native scene still supplies real DOM targets for locks, card fills,
attachment labels and source painting. Imported/local frame decorations must not
paint their expanded SVG over a compact header. Check grouped styled/file cards,
frame decorations, native dark/light fills and minimap bounds/visible external
routes after collapse, undo and unload; no raw dimensions may be rewritten.
