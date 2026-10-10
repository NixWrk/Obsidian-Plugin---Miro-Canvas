# Groups native gesture receipt

Trace before test repair, 2026-10-08. Owned scope: only the groups branch of
`tools/obsidian_cdp/check-canvas-enhancements.mjs` and this document. No plugin
source changes. Tablet lease: SM-X736B, serial R52Y808PDJB, port 9340,
MiroCanvasTest; Android 16, installed Obsidian 1.13.8, plugin 0.2.10. Parent owns
Windows 9346 and phone 9341; do not mutate either while their leases are held.

Readonly native handler inspection confirms `onTouchdown` waits 600 ms before
drag mode; movement beyond five CSS pixels before then selects pan mode and
clears the timer. The original continuous 1,800 ms ADB swipe therefore does not
test a held group drag. Node pointerdown itself only starts mouse dragging.
The native group label also supports text editing, so verify the actual hit
target inside the compact native group or its native selection surface.

Native touch setup captures the group on press, but starts `handleSelectionDrag`
at the first move after the hold: that first move is the new origin, and a second
move must demonstrate movement. Native `pointercancel` uses the same handler as
pointerup and calls `end`, not `cancel`. Do not claim touch cancel rolls back
until actual ADB cancel input proves it; record a limitation/failure separately.

Mandatory checks: real ADB stationary hold followed by two moves, held native
and independent chained SVG paths at 0.5/1.25 scale, matching child preview,
unchanged raw group dimensions/source, one history step after release, exact
Undo, and explicit cancellation with honest before/after evidence. Ensure every
pending ADB input process and final pointer release is awaited before fixture
restoration, including assertion/error paths. No screen capture or foreground
activation; validate the existing Obsidian focus without changing it. CDP
preparation, readonly sampling and any keyboard synthesis remain distinct from
real ADB input. Device acceptance below will record only completed checks.

First corrected-hold run failed (exit 1). At 0.5 scale the native group and
children move by (80,80), and the native display/hit SVG begins at (360,112).
The dependent independent chain begins at (179.556,101.76), whereas carrying
its internal connector with the group requires (204.444,112). This is evidence
of a native group-drag dependency defect, not of a failed gesture. Real ADB
touch CANCEL commits that same move and adds history, matching the inspected
native touch handler. Undo restores exact nodes/metadata/source. No source was
edited; both findings were reported before any proposed source repair.

The first 1.25 attempt did not move; retain it as test-target/gesture evidence
until diagnosed. A disk sample 1,500 ms after release still contained the old
coordinates, so asynchronous native save needs a bounded wait before classifying
persistence. Original failure preserved in
`tools/obsidian_cdp/.out/feature-expansion/native-groups-R52Y808PDJB-held-first.json`.

Final bounded tablet run: checker syntax validation passed; native groups
acceptance exited 1 with `passed:false`, preserving eight named failures in
`tools/obsidian_cdp/.out/feature-expansion/native-groups-R52Y808PDJB.json`.
Real ADB DOWN, stationary 850 ms hold, two MOVE events and UP/CANCEL replace
the immediate swipe. Every ADB process is awaited, and the groups-local finally
awaits any pending input and releases a held pointer before outer restoration.

At 0.5 the wider movement produces group delta (240,160); native children and
display/hit paths follow, dimensions remain 900x500, the held document does not
save or add history, release adds one native step, and bounded native save
observation confirms persistence. Undo restores exact nodes/metadata/source.
The chain start x is 311.556 rather than the required 364.444; its internal free
connector has not been carried with the native group. After native save the
chain jumps to (400,250), because the unchanged free endpoint (100,100) is now
outside the moved expanded group and loses its collapsed ownership. This is
separate evidence of the same missing dependent-anchor transport.
CANCEL commits positions
instead of restoring them; subsequent real ADB Ctrl+Z restores the baseline.

Both 1.25 attempts still show no movement, even with the wider endpoint. They
remain failed/unverified target/gesture checks, not evidence of a geometry bug
at that scale; no positive 1.25 acceptance is claimed. No further tablet input
is scheduled. The run completed fixture restoration with no cleanup error.
No plugin source changes, screenshots, foreground activation, Windows 9346
mutations, phone 9341 interactions, commit or push occurred.

## Source repair trace before edits

2026-10-08: source scope newly authorized for the confirmed transport defect.
`handleSelectionDrag`'s existing instance guard only restores z-order; the native
handler moves contained native nodes but cannot carry plugin free connectors or
pins. `readLiveGeometry` then resolves unchanged free points against a moved
owner, so compact projections lag and ownership is lost after native save.

For a verified pointer drag of a collapsed group only, reuse the already checked
`startSelectionMove` path from the native gesture entry. It captures collapsed
membership once, creates `previewBoardSelection` without changing saved nodes,
and commits through `CanvasAuthoring.moveSelection` in one history step. Its
capture listeners restore preview on Escape/pointer cancellation. Native gesture
callers receive a minimal inert gesture object; other native drags retain their
original handler, receiver, arguments and result. Do not rewrite global native
touch handling or change raw group dimensions. Native labels remain editable.

Focused repro must go through the installed native drag boundary and real
selection preview/authoring, asserting internal connector free endpoints,
dependent chains and comment pins before release, unchanged far endpoints,
exact commit/Undo, Escape/cancel, locks/review, ordinary/expanded group passthrough
and non-default zoom. Rendering and geometry may stay unchanged if this common
preview already produces correct paths. Parent performs build/deploy/native
rerun after READY; existing 1.25 target failure remains separately pending.

The focused repro now passes through both SVG renderers and checked authoring.
Carried internal comments must participate in the same pre-preview lock check
as explicitly selected comments, so a group cannot show a locked pin moving
and only refuse at release. Check comment/thread and decoration locks alongside
group/card/connector locks, cancellation and unchanged native history.

## READY for parent build/deploy/rerun

The scoped native `handleSelectionDrag` guard now sends only a verified
collapsed-group pointer gesture into the existing shared selection preview and
`CanvasAuthoring.moveSelection`. Other native gestures retain their original
method/result. The captured internal IDs include free independent connectors
and comment pins. Their stored anchors move in the same preview as native
children; external connectors and deeper chains resolve from that preview and
keep their far endpoints. Release commits once; Escape through `resetTools`
and pointer cancellation clear the owned preview without saving. Carried locked
comments are refused before preview. Group width/height and source/unknown fields
remain unchanged. No source-renderer or connector-endpoints change was necessary.

Focused verification: 14 new gesture tests pass with actual session guards,
preview, authoring and both SVG renderers. They cover mouse/touch at 0.5/1.25,
chain and pin paths before release, exact commit/Undo/Redo, cancellation followed
by release, locks/review, unselected compact groups and expanded native-group
passthrough. Nine focused files pass, 331 tests total, exit 0. Targeted source/test
typechecking, M1 ESLint (no warnings/errors) and checker syntax validation all
pass with exit 0. Node's capture-listener removal is normalized in the fixture
to browser behavior; this changes no application code.

The groups checker now requests real ADB Escape followed by touchscreen UP for
cancel acceptance, rather than requiring untouched native touch CANCEL to undo.
Its pre-deploy failure receipts remain intact. No native device run, build or
deployment was performed after this source repair: parent owns those next
steps. In particular, the 1.25 real-input target failure remains separately
pending despite passing geometry/gesture unit coverage at that zoom.

Changed for this repair: `src/m1-session.ts`, new
`tests/m1-session-collapsed-drag.test.ts`, this trace, and only the groups branch
of `tools/obsidian_cdp/check-canvas-enhancements.mjs` for Escape cancellation.
No commit/push. A parent-thread coordination message was rejected by automatic
approval review because the target identity could not be confirmed; coordination
continued in the authorized conversation, and no thread message was delivered.

## Native caller contract review before final handoff

Readonly source recheck, tablet Obsidian 1.13.8 `http://localhost/app.js`:
mouse helper `Kg` at character 725966 guards `move`, `end`, `cancel`, `cleanup`,
`keydown` and `keyup` before invocation. Its cleanup runs before end/cancel.
Touch `onTouchdown` at 3214776 guards `move`, `end` and `cleanup`; its cancellation
uses the same guarded end callback. Neither caller requires `update`. This
confirms the initial cancel-only return could not cause a missing-method error.

Return explicit no-op move/end/cleanup/keyboard methods as the full observed
lifecycle contract anyway. Capture listeners remain the sole preview/commit
owner; native cleanup followed by end must not duplicate a commit. The cancel
callback is restricted to the specific owned gesture. Focused protocol tests
call these methods directly, including native mouse cleanup-before-end and
cleanup-before-cancel, rather than optional chaining. Unknown/invalid event
shapes keep the existing native factory/result. No native input or device
deployment is scheduled here; tablet 9340 remains with the parent.

Final handoff: **READY**. All 18 owned tests pass, exit 0, including direct
native lifecycle calls, cleanup-before-end/cancel and invalid-event passthrough.
Targeted source/test typecheck and M1 ESLint pass with exit 0. The preceding
nine-file regression run passed 331 tests before the four added protocol cases;
no full suite is rerun by this sidecar. Parent reports deployment and owns
tablet input for the native rerun. No further native calls/input are scheduled.

## Post-deploy native failure: pointer owner boundary

The deployed rerun still fails with chain x 311.556 vs 364.444 and
`selectionMovePreview:false`. This supersedes the earlier synthetic READY;
native acceptance is failed. Parent confirms Android `onTouchdown` captures
`n=e.targetNode` on press and later calls `handleSelectionDrag(move,n,d)`.
The MOVE event's `target` can differ from the original owner or be absent;
requiring it to identify the group incorrectly delegates back to native.

Before the next source edit: verify args[1] as the original owned DOM and
args[2] against the exact live Canvas node plus its shell containment. An
absent node argument is supported only for the verified native selection
surface. Supply the shared preview with an internal normalized pointer context
whose target/targetNode is that verified original owner; native field getters
and methods must keep the original MOVE event as receiver. No event mutation
or dispatch. Unknown/mismatched owners must delegate unchanged. Tests must
reproduce MOVE outside the root, a different child, absent target, branded event
getters/methods, and forged/mismatched runtime nodes before the repair.
Native deployed acceptance, not synthetic tests alone, is required for READY.

The same first-MOVE boundary also needs the active primary touch/mouse shape
`type:pointermove`, `button:-1`, `buttons:1`. Unlike the captured mouse DOWN,
MOVE does not describe a changed left button. Accept only that bounded shape
and normalize the internal press context's button to zero; leave the native
event unchanged. Reproduce it alongside absent/foreign current target before
editing, and reject released/non-primary, secondary-button and modified events.

Boundary repair verification: seven ownership/receiver regressions failed
before the owner-context change, then the genuine primary MOVE button case
failed before button normalization. The current helper verifies original DOM
ownership and exact runtime node identity, preserves getters/method receivers,
normalizes only internal target/targetNode/button, and leaves original button,
buttons and pointer type unchanged. Released/secondary/modified contexts and
forged/mismatched owners delegate unchanged. All 90 focused tests across the
gesture/locking/placement files pass, exit 0; targeted typecheck and M1 ESLint
pass with exit 0. This is available for parent rebuild/deploy now, but **native
acceptance remains failed/pending rerun**. No new native input was issued.
## Native integer coordinates before final preview repair

Post-boundary real ADB holds now pass all displayed native/chained paths and
Escape/Undo checks at both 0.5 and 1.25 zoom. Remaining commit mismatch is
subpixel: preview x220.235 becomes native x220; at 1.25 preview x88.094/y70.400
becomes x88/y70. Readonly Android native BaseNode.setData and moveAndResize
explicitly Math.round all native geometry. Native loaded positions are integers.
Round the shared gesture delta before preview, DOM translation and final authoring
only when native cards participate. Free lines/pins must carry that same delta;
connector-only gestures retain fractional precision. Mandatory checks: native
integer writer in focused tests, exact before/after paths and positions at both
scales, free-pin/chain/far-end masks, pure connector precision, cancellation and
Undo, followed by physical tablet and hidden Windows reruns. The 1.25 test
target is now a quantized compact native face with pixel margins, clear of the
toolbar; earlier touches landed on the toolbar, not a group.

## Final post-repair native group acceptance — 2026-10-08

native-groups-Windows.json and native-groups-R52Y808PDJB.json now pass all
14 named checks at 0.5/1.25 zoom: collapse, Undo/Redo, held native hit/display
and independent chained geometry, exact integer commit, cancellation, persistence
and Undo restoration. SM-X736B / Android 16 / Obsidian 1.13.8 uses real ADB
DOWN, stationary hold, MOVE and UP, with ADB Escape and Ctrl+Z. Windows uses
trusted CDP input in the hidden owned instance and bounded frame preparation.
Quantized compact-face hit targets avoid toolbar overlap. Neither run captures
the screen or activates a Windows window. Native preview leaves disk/history
unchanged; source and unknown fields survive commit/cancel/Undo. Focused native-
rounded-host tests also pass at both zooms; connector-only fractional precision
is preserved. The final full suite is 3,004 passed, one skipped, 158 files.
Earlier failed runs above are historical, not current acceptance. The phone
was disconnected before final rebuild acceptance; advanced matrix cases not
covered by this fixture retain their pending status.
