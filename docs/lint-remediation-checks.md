# Lint remediation: mandatory regression checks

Before changing a reported site, trace its callers, DOM owner, lifetime and
cleanup. Record the affected user action and its regression below before the
source edit. A warning removed from lint is not a passed behaviour check.
Run the listed focused checks and repository gates after the change; record
real-app evidence separately from synthetic or unit evidence. Keep unverified
checks pending, including physical-device checks.

## First batch: traced before editing (2026-10-06)

| ID | Sites and participation | Mandatory regression |
| --- | --- | --- |
| L01 | `FontFaceRegistry.scheduleFlush` -> `startLoad` -> `loadFamily`; `want` is called by board typography and settings previews, aliases share target loads. Pack families create one Blob URL per face before committing their rules; a later face failure must release the earlier URLs. | `tests/font-packs.test.ts`: failed read produces no unhandled rejection, one failed family does not block another, requesting again can recover, alias failure also recovers; a partially read multi-face family revokes its temporary Blob URLs. Native font fallback remains available. |
| L02 | `PanelVisibility` pointerdown starts the 450 ms hold for an open/folded toolbar, dock or minimap; move/up/cancel/dispose clear it. | `tests/panel-visibility.test.ts`: owner's window creates and clears the wait; click folds, hold moves, swipe before hold does not move, cancel/dispose cancels. Real input: `check-panel-toggle.mjs`, open and folded panels, both orientations, tablet CSS. |
| L03 | `M1CanvasSession` delays touch/pen dots to distinguish double taps; minimap release checks PointerEvent; resize observers update minimap/panel positions; polling follows selection/history. | `tests/m1-session-pen.test.ts`: owner's timers, single dot, double-tap no dot, unload no delayed commit, one history step. Real app: separate window minimap click/drag, resize, selection, undo/redo and unload/reload; drawing by synthesized touch (physical pen remains separate). |
| L04 | `adoptNativeMenu` moves native selection menu into More and snapshots it during middle-button pan. `SelectionToolbar.renderState` also shows its fallback Delete when no native menu exists. CSS hides an empty slot, live-menu snapshot and duplicate palette/direction buttons. | `tests/native-menu-state.test.ts`: empty/live/snapshot/delete states, delayed menu clear/repopulate, correct icon filtering, no repeated attribute writes, observer cleanup/restoration. Real input: More for card/edge/independent connector, middle-button pan before release, stable toolbar width, blur, unload/reload; screenshots in both themes. |
| L05 | First-run welcome button calls `openWelcomeBoard`, which already catches creation/open failures with a localized notice. | Preserve the existing catch; mark the intentional event launch with void. Real input: click welcome action and verify the board opens; existing board is preserved. |

## Evidence

Verified on 2026-10-06:

- `npm run check`, `npm test`: 112 suites, 1,720 passed, one pre-existing skipped test.
- `npm run lint`: zero errors, 748 warnings in src (761 before); MCP remains separately scoped.
- `npm run lint:css`: 90 !important declarations, four :has selectors (ten before). The :has budget was lowered to four.
- Plugin and MCP builds, schema pin check, submission packaging and git diff --check passed.
- All three synthetic browser smoke modes passed; oracle pytest: 25 passed.
- L01: 36 font unit checks plus `check-font-failures.mjs 9346` in real Windows Obsidian 1.14.4: unchanged native fallback width, no unhandled rejection, another family loads, partial Blob URLs revoked, alias retry inserts the expected rules.
- L02: `check-panel-toggle.mjs 9346`, PANEL_CASE=horizontal top-left and vertical bottom-right: 28 folds per case, open/folded held drags, tablet CSS emulated on desktop. Cancellation/disposal and other panel roots are covered by unit tests.
- L03/L04: `check-lint-regressions.mjs 9346` in a clean isolated vault: card and native-edge More menus, independent Delete, light/dark host themes, real middle-button pan checked before release, stable toolbar width, unchanged native board data, restored native buttons on unload, new popout, real minimap click/drag, actual window resize, single synthesized-touch dot, one Undo/Redo step, double-tap without a dot, pending-dot unload, and actual window blur clearing the snapshot. Screenshots were inspected (`lint-menu-obsidian.png`, `lint-menu-moonstone.png`, `lint-menu-popout.png` under tools/obsidian_cdp/.out).
- L03: the large-board poll regression now supplies and checks its owning window's interval; it still pauses during followed drags, resumes after a stall/release and cancels on disposal.
- L05: `check-settings-navigation.mjs --port 9346` passed in a clean isolated vault: real welcome action creates a new 12-section board and preserves the previous board; navigation, keyboard continuation and export help also passed. The launcher also opened the welcome board through its first-run modal.

Harness conditions: keep the test window foreground after resizing; the
popout dot test pauses before switching from synthesized touch to mouse Undo.
Use a clean isolated instance for the settings scenario. Running that broader
scenario after the popout/blur scenario reached its unrelated export gate
without an active session; the clean run passed all its checks. At this desktop checkpoint, physical Android checks were pending; the completed
connected-device follow-up is recorded below. iOS and a person operating a
hardware stylus remain unverified. Synthesized touch is not evidence of a
physical pen or tablet.

## Later batches

Before editing declarative settings, per-card source rendering, native
selection :has, or remaining !important overrides, add their traced sites and
mandatory checks here. Do not broaden this batch into those independent
migrations without their own call-site and runtime inspection.

## Android follow-up: mandatory matrix (2026-10-06)

The owner requests connected-device checks whenever Android is affected.
Connected test vaults: Samsung SM-X736B (R52Y808PDJB), Obsidian 1.13.8,
753 x 1204 CSS px; Samsung SM-A336E (RZCW101PJVN), Obsidian 1.12.7,
384 x 853 CSS px. The phone is below minAppVersion 1.13.7: record it as
additional legacy evidence without changing the supported minimum.

Before deployment, save current test-board path/text, viewport, theme and
plugin settings. Tests create disposable boards only in MiroCanvasTest;
restore preferences and the previous board afterward.

| Sites | Required Android actions |
| --- | --- |
| L01 | Real WebView font fallback, failure isolation, partial Blob cleanup and alias retry on each device. The temporary registry is removed afterward. |
| L02 | Real ADB taps for repeated folds and More stacking in both orientations. Held drags on open/folded panels; inspect preview before release and cancellation without saving. |
| L03 | Real ADB touch/pen-source dot and stroke, one native Undo/Redo, double-tap without a dot, pending-dot unload; minimap click/drag and device viewport resize. Inspect history and saved geometry. Pen-source injection does not prove hardware pressure/hover. |
| L04 | Real ADB card/edge/independent connector selection, More menu and duplicate button filtering in both themes, hide empty slot and restore native controls on reload. Desktop popouts and middle-button pan are inapplicable. |
| L05 | Real welcome action and unchanged previous board through the existing Android settings-navigation runner. |

Completed connected-device results are recorded below. Physical pen hover, side button and pressure
need a person with the pen; do not claim them from ADB pen-source injection.

## L06: mobile More popover clipping (traced before fix)

Physical Android screenshots show More leaving the right edge on repeated
opening in the light host theme. `SelectionToolbar.togglePopover` calls
`keepPanelInView` only at opening; later `SelectionToolbar.update` moves the
bar and changes rows without re-clamping an open panel. Adopted native-menu
mutations can also change the panel's contents after that measurement.
`QuickTools` shares the clamp helper, so preserve its semantics and keyboard
popover sizing. No per-card or permanent frame loop may be added.

Mandatory before/after checks: unit regression for an open popover after bar
placement changes and no measurements for closed popovers; native-menu
observer notification for content changes; real Android card/edge/independent
More bounds and repeated opening in both themes on both devices; desktop
More/pan/popout check; keyboard-above-toolbar and full unit/browser gates.
Add the physical bounding-rectangle assertion before changing source.

## Android results and L06 confirmation (2026-10-06)

| Device | Real application | Result |
| --- | --- | --- |
| Samsung SM-X736B, R52Y808PDJB | Installed Android Obsidian 1.13.8, MiroCanvasTest | L01-L06 passed for the affected actions below. |
| Samsung SM-A336E, RZCW101PJVN | Installed Android Obsidian 1.12.7, MiroCanvasTest | The same affected checks passed as extra legacy evidence. Supported minimum stays 1.13.7. |

- `check-font-failures.mjs` on forwarded ports 9340/9341: real WebView native fallback, isolated errors, partial Blob cleanup and alias retry passed.
- `check-panel-css.mjs --serial <device> --port <port>`: repeated folds, zero folded spacing and More stacking in horizontal/vertical orientations passed on both.
- `check-android-lint-regressions.mjs --serial <device> --port <port> --only panels`: real Android draganddrop/CANCEL passed for open/folded panels in both orientations. Preview moves before release without saving preferences; CANCEL restores the previous position with no marquee or save.
- The same runner with `--only drawing`: real OS touchscreen and stylus sources were confirmed in PointerEvents. Single dots, native one-step Undo/Redo, paired taps within 300 ms without a dot, moving stroke previews without node/history persistence, one committed stroke and pending-dot unload passed on both. Straight strokes may correctly simplify to two distinct points.
- With `--only navigation`: real ADB minimap click/drag changed the viewport and ended the drag; actual device rotation resized the active board. Both passed; original Android rotation preferences were restored.
- With `--only menus`: card/native-edge/independent menus, duplicate-control filtering and repeated More opening passed in both host themes on both. After L06, bounding rectangles stay at least 7 px inside the real board/window after layout settles. Corrected screenshots were inspected; this replaces the earlier clipped light-theme captures.
- `check-settings-navigation.mjs --serial <device> --port <port>` passed on both: actual taps/native picker keys, all twelve sections, keyboard continuation, fresh welcome board, unchanged previous board and export help.
- L06 unit checks cover re-clamping after a bar move/native content change and no closed-popover measurements. Full suite: 112 files, 1,722 passed, one existing skip. Three browser smoke modes, types, plugin/MCP builds, schema and lint checks passed.
- L06 desktop confirmation: `check-lint-regressions.mjs 9346` in isolated Windows Obsidian 1.14.4 passed menus, pan previews/width, popout, resize, touch dots/Undo/Redo, unload and real blur.

Harness notes: older Android's default draganddrop hold is 400 ms, shorter than
the panel's 450 ms. Its 6.5 s route keeps the first movement within the 8 px
hold slop; the system long-press preference is not changed. Pointer recording
starts before plugin loading so capture handlers cannot hide claimed gestures.
ADB delivery can outlast a toolbar reflow: the runner waits for a stable target
and re-acquires only when the recorded press hit a different control; a press
actually delivered to More that does not open it is still a failure.

All application input above runs in installed Obsidian on the connected
physical devices. CDP is used for inspection; taps/swipes/holds/CANCEL come
through Android's ADB input. No Android emulator is used. Pen-source injection
proves the pen event path, not physical pen pressure, hover or barrel buttons.
Test preferences/theme/orientation and previous boards are restored. Disposable
regression boards and screenshots remain available for inspection.

Final restoration check: both devices reopened Export touch test.canvas with
exactly the original file text, plugin settings and theme; original native
viewport values were restored. The final Android builds remain deployed in
MiroCanvasTest. The isolated desktop follow-up instance was closed.

## L07: held strokes and smart rectangles (traced before changes)

Hold route: `M1CanvasSession.startToolGesture` -> `watchHold` (500 ms,
4 CSS px stillness, 24 CSS px reach) -> `straightenHeld` -> `draw` ->
`updateStrokePreview`; release goes through `finishToolGesture`/`drawStroke`.
Pressure pens use a filled SVG path; highlighters use a polyline. Settings
come from `settings.ts` and the Drawing section in `settings-tab.ts`.
On 2026-10-06 the tablet's holdStraightLine is false, including the saved
pre-test baseline; the phone's is true. The previous drawing runner explicitly
disabled holding and pressure, so its passes do not cover this report.
The owner confirms hardware pressure works; automated pen input cannot
verify physical pressure.

Smart route: `finishToolGesture` -> `drawSmart` -> `simplifyPoints` ->
`recogniseStroke` -> native `createShape`, or freehand/connector fallback.
Closed shapes currently use only area divided by the axis-aligned bounds;
rotation, uneven corners and overshoot can lower a rectangle into the oval
range. `recogniseStroke` is called only here and in drawing unit tests.

Mandatory checks before completion: pressure-enabled hold preview before
release, saved straight geometry and width samples, endpoint movement after
hold, setting off, short strokes, continuing motion, cancellation/disposal,
non-default zoom and one Undo/Redo; real installed Obsidian on both connected
Android devices, with original board/preferences restored. Smart drawing:
rotated/skewed/jittery rectangles, start on a side, reversed traversal,
small closing gap and corner overshoot; circles/ellipses/triangles/lines and
open-stroke fallback remain distinct. Inspect the actual saved shape and
one history step on both devices. New regression fixtures stay in MiroCanvasTest.

### L07 results (2026-10-06)

Before the fix, unit fixtures at 5/8 degrees produced ellipse, and larger
tilts produced triangle. Real ADB stylus input in installed tablet Obsidian
reproduced rectangle -> ellipse at 8 degrees; the axis-aligned control passed.
`hasRectangleSides` now tests simplified sides, near-right angles and consistent
winding before the existing area fallback. It runs only at stroke completion.

`check-drawing-hold-shapes.mjs --serial <device> --port <port>` passed on
both SM-X736B/Obsidian 1.13.8 and SM-A336E/Obsidian 1.12.7 (legacy evidence):
- Actual Android stylus-source holds with pressure enabled, at native zoom
  values 0 and -1; highlighter; setting off; CANCEL after straightening.
- Inspect preview before release: two endpoints, filled pressure path, no
  saved node/history step. After holding, further real MOVE follows the end.
- One saved drawing, one history step and actual Undo/Redo button taps.
- A separate controlled CDP pen input varies force in the real WebView;
  holding and further movement leave two saved endpoints and distinct
  widths [5,8]. This is synthesized force, not hardware pressure evidence.
- Actual Android stylus-source smart rectangles at 0/8/30 degrees, ellipse
  and triangle produce their expected saved kinds; each has one Undo/Redo.

Unit regressions also cover side starts, reverse traversal, closing gaps,
corner overshoot/jitter and rounded strokes at multiple densities/aspects.
Existing hold tests cover small reach, continuing motion and timer disposal;
the new pressure test checks live path, unsaved preview and endpoint widths.
Full unit suite: 112 files, 1,735 passed, one existing skip. Types, plugin/MCP
builds, schema and lint/CSS checks pass; existing advisories remain.

The tablet hold failure was a disabled setting, already false in the earlier
pre-test baseline. With it enabled, no hold-handler defect reproduced. The
phone setting was already true. Original board text, viewport and settings
are restored after runs; enable the tablet hold setting separately as the
owner's requested correction. Both devices retain the updated plugin build.

Harness correction: wait for Android to deliver a single new MOVE before
inspecting its result, and always send CANCEL in finally, including after a
failed assertion, so an injected pressed pointer cannot outlive the runner.

## L08: smart shape orientation (traced before changes)

Owner requires recognized shapes to keep drawing orientation, rounded to
45-degree steps. `StrokeShape.box` currently uses axis-aligned bounds and
`drawSmart` supplies no rotation to `CanvasAuthoring.createShape`. Existing
rotation rendering/anchors read `miroCanvas.localOverrides[id].rotation`;
schema v1 already permits this numeric field. Calling `updateRotation` after
creation would add a second history step, so include optional finite normalized
rotation in the existing guarded shape creation transaction. Inspect
`readShapeAction`, `buildShape`/`updateShapeMetadata`, existing unknown-field
preservation and native Undo/Redo tests before editing.

Mandatory: rectangles, elongated ellipses and triangles keep center and local
dimensions, snap rotation at 45-degree steps; traversal/sample density do not
flip rectangle/ellipse orientation; circles need no arbitrary rotation.
Check saved metadata, actual rendered transform, selection and native one-step
Undo/Redo in installed Obsidian on both Android devices. Reject invalid
creation rotations without graph import; preserve source and unknown fields.
Restore the previous board by path, but never overwrite a board changed by
the owner during testing. Final restoration reads current source text again.

### L08 results (2026-10-06)

Both installed Android applications pass the extended shapes-only runner:
rectangles drawn at 0/8/30/-30/60/80 degrees store rotations 0/0/45/-45/45/90
and keep fitted dimensions about 107 x 69 rather than the outer bounding
box. Ellipse and triangle controls at 0/30 degrees store 0/45 and retain
their kinds and local dimensions. The runner checks saved metadata, actual
owned DOM rotation, real touch selection, matching selection-handle angle
and one native Undo/Redo restoring the entire document including rotation.
Physical screenshots `drawing-rotation-<serial>.png` were inspected on both:
selected rectangle and controls are aligned at 45 degrees.

Selection inspection waits for the existing 750 ms host-selection poll;
reading cached plugin selection after only 220 ms was premature, although
native selection had already changed. No manual refresh is injected to
make the assertion pass. Creation without a rotation remains compatible;
invalid/nonfinite rotation is rejected before any graph import. The unit
orientation matrix covers negative angles, reversed traversal, center and
dimensions, tilted oval/triangle and atomic rotation creation.

Final gates: 112 unit files, 1,746 passed, one existing skip; type check,
plugin/MCP builds, pinned schema, ESLint (0 errors, unchanged 748 advisories),
CSS budgets and all three browser smoke modes pass. Original boards reopened
on both devices, their current texts verified unchanged against this run's
baselines, and original viewport/preferences preserved. The tablet's hold
setting is now enabled as requested; the phone's was already enabled.

## L09: pressure breathing during hold (traced before changes)

Report: a held stroke thickens, then changes again as the pen lifts. In
`startToolGesture.move`, every pressure event replaces pressureScale even
when `draw` rejects its unchanged position; `straightenHeld` then uses that
unrendered sample. Once straight, even stationary pressure events redraw the
whole endpoint width. A trailing zero-pressure MOVE uses the 0.5 sensor
fallback and changes width again. `drawStroke` persists those same scales
(rounded to hundredths); `source-renderer.applyDrawing` and the ghost both
use `pressureStrokePath`. There is no separate intended release-time style.

Mandatory: before/after stationary pressure pulses with sub-4-CSS-px jitter,
exact ghost-path stability once straight, terminal zero-pressure MOVE before
UP, preserved accepted endpoint widths and saved outline matching preview
within serialization rounding; genuine movement still samples pressure;
hold disabled/freehand pressure, Shift, non-default zoom, highlighter,
cancel/unload and one native Undo/Redo. Reproduce the old path in unit tests
and installed Android Obsidian on both devices with controlled CDP pen force;
retain real ADB hold coverage and distinguish simulated force from hardware.
Restore current test-board path/preferences without overwriting newer edits.

### L09 results (2026-10-06)

Before the fix, the new unit test and controlled pen input in installed
SM-X736B Obsidian both reproduce a stationary width-scale jump from 1.15 to
1.6. The handler now samples pressure only after leaving the existing hold
stillness radius; meaningful movement continues sampling. Straightening
uses the last width actually shown. A zero-pressure MOVE retains that width
instead of replacing it with the no-sensor fallback.

Unit regressions pass at 50/100/200 percent: sub-4-CSS-px jitter does not
accept a force spike, stationary pulses after straightening leave the SVG
path exactly unchanged, and terminal zero pressure preserves saved widths
and one history step. Shift with holding off also preserves the final width.
Existing moving pressure, disabled pressure, highlighter, cancel/unload and
angle/shape tests pass.

On both installed Android apps (`SM-X736B`/1.13.8 and `SM-A336E`/1.12.7,
additional legacy evidence), `--pressure-only` passes at 50/100/200 percent.
CDP-controlled force [0.95,0.05,0,0.5] at a stationary held end does not change
its outline. A real movement resumes pressure updates; the last zero-force
MOVE and UP preserve the preview widths. Saved SVG bounds agree within
native node rounding, and actual Undo/Redo restores the document in one step.
These are synthesized force samples in the real WebView, not hardware
pressure measurements. `--hold-only` also passes actual Android stylus-source
input, endpoint following, highlighter, setting off, CANCEL and Undo/Redo
on both devices at the affected zooms.

At 200 percent, native integer rounding of node position/dimensions produces
about one CSS pixel of bounding-box variation despite unchanged pressure
widths. The comparison allows 0.7 board units multiplied by zoom; the first
unscaled 0.7-CSS-px assertion was too strict at that zoom. No plugin geometry
behavior was changed to satisfy it. Mode-specific result files preserve
pressure and shape evidence separately (`drawing-results-<serial>-pressure-only.json`).

Final gates: 112 unit files, 1,750 passed, one existing skip; type check,
plugin/MCP builds, schema, ESLint (0 errors, unchanged 748 advisories), CSS
budgets, all three synthetic browser modes and 25 oracle tests passed.
The corrected build remains installed in both MiroCanvasTest vaults. Both
reopened Export touch test.canvas; current original text, viewport and all
preferences were verified preserved, with holding still enabled.

## L10: redundant TypeScript assertions (traced before edits)

Baseline commit: 6fdc053. The local ESLint report lists 367 redundant
assertions in 56 source modules; 362 have suggested automatic fixes.
`lint-type-assertion-sites.json` records every original line/column, its
owning function/method and the local source/test importers before editing.
Five DOM query/append assertions additionally require explicit generic arguments
to retain their contextual type (comment thread, comments panel, connector
label editor, import guide and pen tooltips). Inspect those expressions
and move the existing type into the DOM query/append generic parameter.

| Participation | Mandatory checks |
| --- | --- |
| Native/Advanced Canvas adapters, authoring and metadata writers | Full adapter/authoring/schema tests: CAS, unknown/source fields, native history and rejection paths. |
| Anchors, connector routes/endpoints, selection bounds, geometry, layers and clipboard | Full geometry/selection/clipboard tests: preview, captured ends, groups, zoom, native history. |
| Drawing, pressure outline and stylus helpers | All pen/stylus/pressure tests, including L07-L09 before release, steady widths, cancellation and Undo/Redo. |
| Source/appearance/text/font rendering, typography and toolbars | Source/appearance/font/typography/toolbar tests, three browser modes; preserve local font failure isolation and settings locales. |
| Search, comments, document/help/import UI, settings and main session lifecycle | All related UI/lifetime tests; DOM query generics must retain nullable HTMLElement types, cleanup and owning-window paths. |
| Offline importers, palette/local items/comments, welcome board and policy | Full importer/local-data/locale/interaction-policy tests, source preservation and guarded writes. |
| Export files/boards and shared pure MCP inputs | Full export and MCP suites, pinned schema and both builds. |

These assertions/generic arguments are erased by TypeScript. Before edits,
save SHA-256 of production main.js and mcp/dist/miro-canvas-mcp.mjs.
After edits, require byte-identical builds, type check, full unit suite,
ESLint with no new diagnostics, all three synthetic smoke modes and
git diff --check. If either build differs, inspect the emitted difference
and treat its affected runtime checks as pending until verified.
A byte-identical Android bundle introduces no runtime change: retain L09
physical-device evidence, and verify the installed files in both
MiroCanvasTest vaults still match that exact bundle. No warning suppression
or relaxed lint configuration is permitted. CSS cleanup is a separate batch.

L10 follow-up traced before the final import edit: removing redundant casts
leaves the type-only `DiagnosticLevel` import in advanced-canvas-adapter.ts
unused. It had no use outside those casts. Remove that import member, then
repeat types/lint and byte-identity checks; this removes the new unused-type
advisory without changing generated JavaScript.

### L10 results (2026-10-06)

All 367 redundant assertions removed, including five contextual DOM query/
append cases with explicit generic parameters; the now-unused type-only
DiagnosticLevel import was removed. ESLint is 0 errors / 381 warnings
(previously 748), with no remaining no-unnecessary-type-assertion diagnostic.
No lint rule/configuration was disabled. Type check, all 112 unit files
(1,750 passed, one existing skip), both builds, pinned schema, CSS budget,
three synthetic browser modes and git diff --check pass.

Both output bundles are byte-identical to the pre-edit checkpoint:
- main.js SHA-256: b80d220455c49eb5dfde8281e63580c215e6adc657ee1bc6f87962ed32518558
- MCP bundle SHA-256: ed94d0a1279dd456b18516b548fb8a4a59f7d362b2f739ea7b58b5faacbce150

The installed main.js in both connected MiroCanvasTest vaults was read
through Obsidian and matched this exact production bundle; both plugins
remain enabled. The tablet was temporarily unplugged, then reconnected
before this confirmation. This is installed-build verification, not a new
physical input claim; earlier L09 real-app/input evidence applies to the
identical executable. No new Android behavior was introduced by this batch.

## L11: remaining native-markup :has selectors (traced before edits)

Four remaining selectors: fallback attachment label when a direct native
canvas-node-label arrives; two selection-overlay outline rules keyed on a
native canvas-selection; and the paragraph immediately before a pre inside
a source-code Markdown preview. Trace: M1.refreshDecorations creates fallback
labels and removes them on refresh/dispose; native label markup arrives
asynchronously. M1.refresh/handlesState -> SelectionHandles.update marks
resizable/turned/resizing states while native Canvas owns its selection frame.
SourceRenderer.renderNode -> code decoration keeps native Markdown and creates
code-title chrome; native preview can mount/re-render after source projection.
SourceRenderer.watchLive already observes rotations and edge routes, so any
extension must preserve those immediate preview callbacks and cleanup.

Before editing, inspect the actual native frame parent and code/label markup
in installed desktop Obsidian and both connected Android apps. Replace
ancestor :has invalidation with local explicit attributes. Selection presence
must be driven only by relevant direct-child mutations, with no card scan
on every frame. A fallback label watches its own shell only while it exists.
Code paragraphs use a reversible mark refreshed by the existing shared
source-renderer observer for the changed code card, not another per-card
frame loop. Disconnect observers and restore pre-existing attributes before
teardown; changing decoration must not modify board JSON/source evidence.

Mandatory unit checks: frame add/remove/retarget, unrelated additions ignored
and no repeated writes; late native attachment label hides fallback and
removal restores it; code paragraph adjacency/reorder/remount with ordinary
paragraphs untouched; original marks restored and queued callbacks inert
after cleanup. Full source/selection/large-board tests and normal gates.
Mandatory real-app checks: native single selection has one outline, turned
selection and active resize preserve their outline; native edge follows a
resize before release, with one history step/Undo/Redo and cancel; code title
not duplicated after late Markdown mount/preview refresh; fallback/name
visibility and plugin unload/reload; themes and non-default zoom. ADB input
on each connected Android, real mouse in the isolated desktop; markup
synthesis used to simulate late native DOM is recorded separately. Lower
CSS :has budget to zero only when these checks pass.

L11 native inspection before implementation: on Obsidian 1.14.4 desktop,
1.13.8 tablet and 1.12.7 phone, single-card selection has no canvas-selection
element. Instead canvas-node.is-focused owns a native border and a 2 px
accent shadow on canvas-node-container, while the plugin frame is also
dashed: the old :has rule fails to remove this duplicate outline. Therefore
drive the owned frame's native-outline flag from the selected native node's
actual is-focused/is-selected class, looked up through the native nodes map
in constant time, and update it through the existing handles update cycle.
No new global frame observer or repeated card scan is needed.

All three apps render Markdown paragraphs/pre blocks under adjacent .el-p/
.el-pre wrappers. A paragraph itself has no next sibling; old p:has(+ pre)
fails and leaves the code-title paragraph visible alongside the plugin title.
Mark direct p/pre adjacency and the observed wrapped adjacency; hide the
wrapper too when it contains only that paragraph, preserving ordinary
paragraphs. Native input selection and the baseline CSS runner reproduce
both defects. State update/cleanup tests replace the provisional direct-frame
observer tests above because actual native single selection uses focused
node classes, not the assumed canvas-selection element.

L11 synthetic-host follow-up traced before editing: m1-browser.ts select()
only changes the runtime selection Set and never mirrors native focused
node classes. Its controls assertion still creates a canvas-selection for
a single card, contrary to all three installed versions. Mirror is-focused
on the selected node shell only in this focused-selection regression,
restore it afterward, and assert the explicit native-outline mark. Preserve the mixed-selection canvas-selection checks.
This updates synthetic evidence to the actual native contract.

L11 type-guard follow-up before edit: inspecting querySelectorAll as a
function value selects Obsidian's deprecated overload, adding one advisory.
Use Reflect.get for the defensive fake/unknown-host capability guard, while
keeping the DOM method call itself typed. Recheck helper tests and lint;
this changes no supported native DOM behavior.

## L12: resize cancellation history (traced before edits)

L11 real renderer and tablet ADB resize checks expose an extra history step
on cancellation: geometry/path restore correctly, but history advances.
Trace SelectionHandles.cancelGesture -> M1.cancelHandleResize -> resizeNode
(native moveAndResize) -> adapter.requestSave; preview uses the native live
node without saving. Inspect native requestSave/history semantics before
changing cancellation. Mandatory regression: before-release edge following,
commit exactly one history step, cancel none, Undo/Redo, repeat at 50/125
percent in installed desktop and both Androids. Preserve source/unknown
fields and native adapter tests; distinguish renderer input from Windows
mouse input. Windows capture helper failed after recovery, so OS mouse
evidence remains pending rather than claimed.

L12 native inspection: requestSave defaults its argument to true and always
requests a history push; history.push does not deduplicate identical data.
Resize previews did not persist, so restoring the live node needs refresh
only. Remove the cancellation save, retain the release save. Test the full
preview/cancel/commit sequence against the real adapter rather than deleting
history entries after the fact.

The broader fixture select() focus emulation affected its intentionally
Set-only touch model: deselecting the Set left a focused class. Keep that
fixture unchanged and scope the native class to the specific outline check.
Repeat interactions and controls to prove no stale touch-selection state.

### L11/L12 results (2026-10-06)

All four remaining :has selectors removed; CSS budget now forbids any :has.
The 90 !important declarations remain for subsequent traced batches. Explicit
local marks remove the duplicate native selection outline and wrapped code
heading. Native attachment names suppress the fallback on arrival and restore
it on removal; disabling the plugin removes marks/observers and preserves the
fixture's source/unknown fields. Ordinary paragraphs after code stay visible.

Installed-app evidence, check-css-state.mjs:
- Desktop Obsidian 1.14.4, isolated vault / port 9346: renderer mouse input
  through CDP, dark/light single and rotated selection, 50/125 percent resize
  preview with native edge following, unchanged persisted preview, one-step
  commit, Undo/Redo and Escape cancellation; name toggle and reload passed.
- Samsung SM-X736B / R52Y808PDJB / Obsidian 1.13.8, MiroCanvasTest / port 9340:
  actual ADB touchscreen DOWN/MOVE/UP/CANCEL, same selection/themes and resize
  checks at 50/125 percent, actual Undo/Redo/menu taps and reload passed.
- Samsung SM-A336E / RZCW101PJVN / Obsidian 1.12.7, MiroCanvasTest / port 9341:
  same actual ADB input and checks passed. This version is additional legacy
  evidence below the declared minimum; the minimum remains 1.13.7.

Selection is prepared programmatically for the resize matrix to avoid a
second native text-card tap opening its editor/keyboard; selection-outline
checks themselves use actual ADB taps (desktop CDP mouse). The runner checks
control hit targets and dismisses an open Android keyboard with Back.
Native code remount/adjacency and late-label timing use controlled DOM
synthesis in the installed apps, separately from ADB gesture evidence.
Final screenshots on all three apps show one code title and the preserved
ordinary paragraph. Results: .out/css-state-desktop.json and per-serial JSON.

The Windows computer-use helper failed window capture after its prescribed
recovery. OS-injected desktop mouse evidence remains pending; CDP renderer
mouse evidence is recorded above. Hardware stylus/pressure and iOS are not
new claims for this CSS/resize batch. Original file/settings/theme/viewport
are reopened/restored in the runner's finally; no original board is overwritten.

The cancellation regression reproduced an extra native history push before
the fix in desktop and tablet. Native requestSave defaults to pushing history
and does not deduplicate. Cancellation now only restores the unsaved native
node and refreshes. Focused real-adapter tests verify no preview/cancel save,
and exactly one commit save; installed-app preview paths and source equality
verify that this preserves the native line and file invariants.

Final gates: 113 unit files, 1,757 passed / one existing skip; type check,
plugin and MCP builds, pinned schema, ESLint 0 errors / 381 unchanged warnings,
CSS budget, all three synthetic browser modes, 25 oracle tests and diff check.
The controls smoke mirrors the observed native focused class only for its
outline check; the shared touch fixture remains unchanged.

L12 Escape follow-up traced before edit: attachClipboard's owning-window
Escape handler calls resetTools. resetTools cancels tool/rotation/selection
previews but omits SelectionHandles.cancelGesture, so an active resize stays
live and the later pointerup commits even after Escape. Add handle cancellation
before native deselection; retain ordinary Escape reset semantics. Mandatory
checks: focused resetTools->resize restore/no save, existing handle cancel tests,
board-key/double-tap regressions, full gates and the installed desktop Escape
matrix; rerun Android because shared tool reset also participates there.

Final Escape retest: resetTools now cancels handle gestures before deselecting
native items. Installed desktop CDP Escape and both Android CANCEL matrices
pass at 50/125 percent with the final build. Both actual app theme classes
are asserted after changeTheme/updateTheme, and the original file's text is
compared byte-for-byte after finally restores it. No original board changed.
The tablet's last rerun exposed a native WiFiNoInternetDialog over Obsidian,
which explains the earlier missed ADB tap/drag despite valid WebView hit
targets. After foregrounding Obsidian the whole final matrix passes. Those
missed/obscured attempts are excluded; the runner now checks Android native
window focus before DOWN and sends no input when another app/system obscures
Obsidian. No Wi-Fi/system preference was changed.

## Windows background verification follow-up (2026-10-06, before harness edit)

The owner requested a different method after Windows computer-use/manual
input interfered with their desktop. Retire that route; use only CDP in the
separate installed Windows Obsidian process. The test vault is guarded under
tools/obsidian_cdp/.out. The foreground-stealing call is screenshot(send) ->
Page.bringToFront at the end of check-css-state.mjs. Add a desktop-only
background option: hide that isolated window, keep its renderer timers active,
assert it remains hidden, and skip the screenshot/bring-to-front path. Do not
send OS mouse/keyboard events or ask the owner to interact manually.
Mandatory checks remain selection/themes, native-edge resize preview at
50/125 percent, persisted preview/history/commit/Undo/Redo/Escape, code and
attachment markup, reload, original document/settings restoration. Record
this as CDP input in installed Windows Obsidian, not physical mouse evidence.
The one earlier OS Escape key was received, but no mouse test was completed.

### Windows background results

Installed Obsidian 1.14.4 on Windows 10.0.19045.6456, isolated port 9346 /
obsidian-win-input-20261006: the full --background matrix passes. Dark/light
native and turned selection, edge paths before release at 50/125 percent,
unsaved preview, one commit step, Undo/Redo/Escape cancellation, attachment
name toggle/arrival/removal, code title/ordinary paragraph and plugin reload
all passed. isVisible=false and isFocused=false were checked; restoration
also leaves the window hidden. The original document/settings/theme/viewport
were restored and the settled original file was byte-identical.

The first run's original-file byte check failed because native Obsidian
normalized the freshly created compact fixture to its own whitespace. Its
parsed document was identical, including source/unknown fields. The check
was retained unchanged; repeating with that settled original file passes.
No original file was overwritten by the harness.

Evidence: .out/css-state-desktop.json includes windowsBackground=true,
input='CDP renderer', windowHidden=true. No screenshot was requested and no
Page.bringToFront or OS mouse/keyboard input was sent by this mode. This
verifies behavior inside installed Windows Obsidian; hardware input remains
a distinct unverified claim. The owner has withdrawn the manual-input request.

Only the desktop test runner/docs changed. Plugin build SHA-256 remains
3a0fce60d0428c9433e1a7d6f9a98201ed08eb3ec388e0060cf2a4b0edd7a8a4.
Android code/bundles are unchanged; no new Android behavior requires a rerun.
Types, full 1,757-pass/one-skip unit suite, ESLint (0 errors / 381 warnings),
CSS budget, all three synthetic browser modes, builds/schema, oracle tests
and diff check pass for the harness update.

## L13: search/export owned visibility (traced before edits)

styles.css:3710,3834,4713,4814: four !important declarations for export
panel/pages [hidden], search bar/hit [hidden], and screenshot search hit.
BoardSearchBar.open/close toggles hidden; M1.openSearch/closeSearch and
updateSearchHit own the result outline. ExportPanel/ExportPageOverlay roots
are created by M1.openExport, removed by closeExport, and temporarily hidden
by runExport during capture, then restored in finally. capturePages adds
is-screenshotting while pictures are taken. None of these owned roots gets
an inline display value. Their visible base rules have one class; [hidden]
and is-screenshotting add specificity and already override those base rules.

Before implementation, inspect these roots and computed display in installed
Windows and Android Obsidian. Remove only the four redundant priorities;
retain selectors and behavior. Mandatory checks: search open/type/next/no
matches/close/reopen, hidden hit does not intercept input, screenshot hit
suppression; export open/close, page/panel hidden while capturing and restored
after capture; actual small PDF export, unknown/source fields and original
file/preferences preserved. Record ADB taps separately from CDP text/DOM
capture instrumentation. Windows stays hidden with CDP input; no OS input.
Use existing search/export unit suites, full gates, and lower CSS budget only
after the installed-app matrix passes on both connected Android models.

L13 pre-edit installed inspection: Obsidian 1.14.4 Windows, 1.13.8 tablet,
1.12.7 phone all expose search flex, export grid and pages block; all three
roots have empty inline display and compute none with hidden. The inspection
uses controlled visibility flags, not a physical input claim.

L13 harness follow-up: the first prototype cleanup byte check masked a
selector failure and native serialization of the freshly generated welcome
board. Keep the primary error visible and compare the complete parsed original
document (including all unknown/source fields), since native Canvas may
normalize whitespace on opening. No harness write to the original is allowed.
Search bar buttons do not carry data-icon in this runtime; target its three
actual buttons in their observed previous/next/close order. This is test
instrumentation only; production markup is unchanged.

L13 phone finding traced before the layering fix: the folded tools toggle at
the owner's top-right saved position is the native hit target over search's
Close button. Search z-index=102 is below the shared saved-panel toggle=120
and popover=130. This is an existing reproducible overlap, not a failed ADB
injection. Set the search bar to the next shared layer (140), retaining the
result outline's layer and export/modal layers. Mandatory checks: actual
search Next/Close/Reopen hits with the folded tools button at that position,
both themes, Windows and both Androids; source search/toolbar tests and gates.

### L13 results (2026-10-06)

Four priorities removed; CSS budget 86 !important / zero :has. Search layer
140 fixes the actual phone overlap without altering hit-outline geometry or
native card/connector data. Full check-owned-visibility.mjs matrix passes:
- Windows 10.0.19045.6456, installed Obsidian 1.14.4, isolated hidden window
  / port 9346: renderer CDP input only, no foreground/OS input.
- Samsung SM-X736B / R52Y808PDJB, Obsidian 1.13.8, MiroCanvasTest / port 9340.
- Samsung SM-A336E / RZCW101PJVN, Obsidian 1.12.7, MiroCanvasTest / port 9341:
  extra legacy evidence below the unchanged supported minimum.

Both Androids use actual ADB taps for open/next/close/reopen search, export
menu/PDF/close. Query text and screenshot-class inspection are synthesized
in the real WebView, separately from ADB evidence. Both host themes pass.
Hidden hits have display none and pointer-events none; search stays clickable
above the phone's folded tools toggle. Actual PDF files were saved (Windows
37,407 bytes; tablet 37,322; phone 36,280) with a valid %PDF- header. Capture
observer sees panel/pages display none; both restore to grid/block afterward,
and the real close button removes both roots. Wait for camera/UI settlement
after export before the closing tap; an immediate legacy-phone tap did not
close the panel. No production close handler was changed for that timing.

The phone initially had NotificationShade over Obsidian: the focus guard
refused input; Back dismissed the shade before the affected checks. Failed
obscured attempts are not success evidence. Originals are never overwritten;
full parsed original data and all unknown/source fields compare equal after
restoration, and theme/viewport are restored. Result JSON is under
.out/visibility-<Windows or serial>.json. No hardware stylus/iOS claim.

Types, 113 unit files (1,757 passed / one existing skip), ESLint 0 errors /
381 existing warnings, CSS budget, three synthetic smoke modes, plugin/MCP
builds, schema, 25 oracle tests and diff check pass. The main.js bundle is
unchanged (SHA-256 3a0fce60d0428c9433e1a7d6f9a98201ed08eb3ec388e0060cf2a4b0edd7a8a4).

## L14: redundant type-union members (traced before implementation)

Baseline e5908b8: 30 no-redundant-type-constituents diagnostics in eight
modules, at 27 distinct union annotations. lint-redundant-type-sites.json
records original line/column, owning function/interface, entire union and
local source/test/MCP importers before the edits. unknown already accepts
undefined/sentinels/domain types; string already accepts capability enums
and anchor literals. Simplify only the annotations to that existing broad
type; preserve all runtime guards, supported capability sets and metadata
validation, including unknown/future fields.

| Participation | Mandatory checks |
| --- | --- |
| Native/Advanced Canvas adapter supports/hasCapability, readMetadata/getMetadata, root/document reads and setViewport | Adapter/compatibility tests: unknown capability refused, unavailable/private API reads fail closed, native selection/history/camera methods unchanged. |
| anchors readOwn/mapValue/resolveAnchor/resolveAnchors and connector-endpoints readOwn/connectorAnchor | Anchor/endpoint/geometry tests: missing/inaccessible keys and symbols, malformed geometry, free/node/edge anchors, rotation and connector-chain preview. |
| appearance readOwn/cloneUnknown/toAppearanceMetadata/mergeAppearanceMetadata/reducer helpers | Appearance/store/authoring tests: invalid payloads rejected, source and unknown fields preserved, font/color/text alignment and native history unchanged. |
| local-comments readOwn and metadata MiroCanvasFreeAnchor.type | Comments/schema/MCP edit tests: origin and immutable evidence, extra fields and unknown anchor types remain supported/rejected by the same runtime rules. |
| source-renderer SourceRendererHost.getDocument | Source renderer tests: absent document, edge/rotation/markup observations, preview and cleanup. |

These annotations are erased. Require byte-identical plugin and MCP builds
against the pre-edit checkpoints, full types/unit/lint and three browser
modes, pinned schema, CSS budget and diff check; no disabled lint rules.
main.js SHA-256: 3a0fce60d0428c9433e1a7d6f9a98201ed08eb3ec388e0060cf2a4b0edd7a8a4.
MCP SHA-256: ed94d0a1279dd456b18516b548fb8a4a59f7d362b2f739ea7b58b5faacbce150.
If a bundle differs, inspect it and leave the affected real-app checks pending.
For identical executables, retain L12/L13 real-app evidence on Windows and
both Androids and verify installed Android bundles still match this build.
This is build verification, not a fresh ADB/hardware-input claim; no new
Android runtime behavior is introduced. Windows work stays in the background.

L14 build checkpoint: all eight changed modules produce identical unminified
JavaScript after TypeScript erasure; the complete unminified plugin bundle
also matches (SHA-256 5cbf997a4258f144e80c3bff5e57afdc6183978f31472aa0be674da3ced35fd6).
The production minifier swaps two groups of short internal identifier names:
394,902 AST nodes retain their kinds/literals/structure, and only 216 identifier
occurrences change consistently. No runtime guards/statements/literal values
change. MCP production bytes remain identical. The plugin's minified bytes
therefore do not meet the original byte-identity gate, so rerun installed-app
selection/resize/edge/history/cancel and search/export checks with the new
production build rather than claiming the previous installed build matches.
New main.js SHA-256: 3155e5bc4ae84ab1ac6f0d4903416c1abc2f11caadb003c1ca83ad2039fca043.

### L14 results (2026-10-06)

All 30 redundant-union diagnostics removed in 27 annotations; ESLint now
0 errors / 351 warnings (381 before), with no rule suppression/new advisory.
No executable statements or validation rules were edited. Unminified module
and whole-bundle byte identity plus the consistent global identifier-renaming
check confirm the production difference is minifier naming only. MCP remains
byte-identical. The new production plugin SHA is recorded above.

Types, all 113 unit files (1,757 passed / one existing skip), both builds,
ESLint, CSS budget (86 priorities / zero :has), all three synthetic browser
modes, pinned schema, 25 oracle tests and diff check pass.

New production-build real-app checks passed:
- Windows 10.0.19045.6456 / Obsidian 1.14.4, hidden isolated port 9346:
  check-css-state --background and check-owned-visibility. Both themes,
  native/turned selection, attached native edge before resize release at
  50/125 percent, one-step commit/Undo/Redo/Escape cancel, code/attachment
  state/reload, search and actual PDF capture/restore passed. Input is CDP
  renderer synthesis; no OS input or foreground switch during the matrix.
- Samsung SM-X736B / R52Y808PDJB / Obsidian 1.13.8, MiroCanvasTest port 9340:
  same matrices with actual ADB taps/resize/CANCEL. Query text, late markup
  and screenshot-class instrumentation are CDP/DOM synthesis. The installed
  build was updated before checks. An initially loading Canvas had no active
  file/session immediately after enable, so the first attempt was excluded;
  a dedicated temporary test tab opened the existing test board after mount.
  Original data/preferences were restored and the temporary tab was closed.
- Samsung SM-A336E phone is currently absent from ADB. Its new-build input
  matrix and installed-hash confirmation remain pending; it is not counted
  as passed. Reconnect was requested; no response had arrived at this checkpoint.
  Earlier L13 phone behavior evidence refers to the preceding minified build.

Result JSON: .out/css-state-desktop.json, css-state-R52Y808PDJB.json,
visibility-Windows.json and visibility-R52Y808PDJB.json. No new iOS/hardware
pressure claims. User-facing behavior is unchanged, so no README/release-note
behavior amendment is needed for this annotation cleanup.

## L15: unused declarations and allocation loop values (before edits)

Baseline 3ffd0c4 has 14 unused-variable diagnostics in seven modules.
Traced source searches show attachment-labels ownKeys (88)/hasOwn (129),
M1 nativeSideOf (288)/safeText (544), viewport-controller readMode (171)
are private uncalled declarations; remove these bodies, not the active
readOwn/configuredMode/geometry implementations. Type-only unused imports:
M1 PanelArrangeHost (135), metadata-writer MiroCanvasMetadata (6), viewport
CanvasViewport (15). Source-renderer SHAPE_CLIP_PATHS (6) is an unused import;
shape-geometry retains its constant and live contour/inset readers.

Canvas adapter patchNativeCamera patchedMethod tx/ty (436/437) initializes
from toFiniteNumber(args[0/1]) but uses the original coordinates in callArgs;
remove the bindings while preserving the calls/order and all zoom clamping.
M1 renderExport view (6352) reads ownerDocument(root).defaultView and then
rebuilds the panel/overlay without using the local: remove only the binding
and retain that read as an explicit void expression so getters still run.

makePdf export-files (284/297) allocates three object IDs for each page and
one bookmark ID per titled index; the for-of values are unused. Use counted
loops over page and titled-index array lengths, preserving the interleaved
ID order. Validation, rendering and title selection already use the arrays'
indexed entries; do not change those phases or JPEG/date/Unicode encoding.

Mandatory checks: attachment native/fallback/visibility cleanup; full native
camera/viewport adapter and controller tests including invalid zoom, original
coordinates/arguments/this and restoration; source/shape/M1 export tests;
PDF tests for empty/bad input, multiple-page xref object offsets, titled and
untitled pages, bookmark destinations/Prev/Next including a gap in titles,
Unicode strings and JPEG bytes. Add a focused PDF object-link regression.
Run full types/tests/lint/builds/schema/CSS/three smokes/oracle/diff gates,
compare production outputs to pre-edit hashes and inspect all differences.
If runtime output changes, run background installed Windows selection/resize/
edge/history/cancel plus search/export, and real ADB checks on the connected
SM-X736B. Phone SM-A336E remains disconnected and its new-build check is
pending; do not repeat the reconnection request already outstanding.
Before hashes: main 3155e5bc4ae84ab1ac6f0d4903416c1abc2f11caadb003c1ca83ad2039fca043;
MCP ed94d0a1279dd456b18516b548fb8a4a59f7d362b2f739ea7b58b5faacbce150.

### L15 results (2026-10-06)

All 14 unused-declaration advisories removed; zero no-unused-vars remains.
ESLint is 0 errors / 337 warnings (351 before). No linter rule was disabled.
The five private functions were uncalled; active helpers and exported shape
constants remain. Coordinate validation calls and the document/window getter
read still execute in their original order. PDF object IDs stay interleaved;
bookmarks still target their original page IDs with correct Prev/Next links.

The new PDF regression verifies a three-page file with an untitled middle
page, bookmark targets/links and every xref object offset. With a fixed clock,
old/new makePdf produce byte-identical files for 1/3/8 native-style pages with
mixed Unicode titles. Main production SHA is now
b69a0b881218828bcf6ee5c1f95a94f9d335927e3b81b39c16d8a829803c4b7e;
MCP bytes remain identical (ed94d0a1279dd456b18516b548fb8a4a59f7d362b2f739ea7b58b5faacbce150).
No byte-identity claim is made for the plugin bundle because allocation loop
syntax and unused declarations changed; it was rebuilt and exercised below.

Installed-app checks on the new build:
- Windows 10.0.19045.6456 / Obsidian 1.14.4, hidden isolated port 9346:
  search/export and background selection/resize matrices pass in both themes,
  with paths before release, 50/125 percent zoom, one commit step, Undo/Redo,
  Escape cancellation, attachment/code markup and unload/reload. Actual PDF
  saved (37,407 bytes); panel/pages hide during capture and restore/close.
  Input is confined to CDP renderer; no OS mouse/key input or foregrounding.
- Samsung SM-X736B / R52Y808PDJB / Obsidian 1.13.8 in MiroCanvasTest port 9340:
  same matrices pass using ADB selection/resize/CANCEL and menu/close taps.
  Search text, late DOM and capture instrumentation remain explicitly synthetic.
  Actual PDF saved (37,317 bytes). Installed main.js readback matches the new
  SHA; original test-board data/settings/theme/viewport are restored.
- Phone SM-A336E remains disconnected; its new-build verification is pending.

The first Windows restoration byte check observed the startup welcome board's
native group-array settlement on reopen. Old L14 and new L15 startup snapshots
contain exactly the same complete data when native node/edge iteration order
is disregarded. That attempt is excluded as full restoration evidence. After
settlement, repeating the unchanged strict byte check passes; the harness was
not relaxed and no original document was overwritten by an agent write.

Types, 113 unit files (1,758 passed / one existing skip), plugin/MCP builds,
ESLint, CSS budget (86 priorities / zero :has), three synthetic browser modes,
pinned schema, 25 oracle tests and diff check pass. No user-facing behavior
or file format changed; no README/release behavior amendment is needed.


## L16: explicit collection constructor and native method types (before edits)

Baseline 666e474 has three no-unsafe-function-type diagnostics. The private
safeInstanceOf parameter in advanced-canvas-adapter (234) is called only with
Map/Set by hasCollectionMember, isEnabledPlugin and hasControl: these locate
optional Advanced Canvas and detect its controls. Canvas-adapter (565) uses
the same check only for Map/Set in readCollection, which supplies nodes,
edges and selection to the scene and interaction policy. Constrain these
parameters to MapConstructor | SetConstructor; keep both guarded instanceof
checks, diagnostic messages and fallback behavior exactly as they are.

M1 guardNativeMethod (8953) wraps native undo/redo, getData, selection drag,
importData, node/edge/selection deletion, move/resize/text/color/data editing
and edge editLabel. The callbacks invoke the original through Reflect.apply
with the original receiver/arguments. Specify a callable signature accepting
unknown arguments and returning unknown, with an assertion only after the
existing typeof-function guard; retain descriptors, disposal/restoration,
no-method/frozen-runtime handling and the history/rebuild depth guards.
This hook carries source/unknown root keys across native saves and refuses
locked edits, so its callers must be verified even for annotation cleanup.

Mandatory focused checks: canvas/advanced adapters for Map/Set/array/plain
collections, absent/unavailable optional APIs, throwing getters, revoked or
prototype-trapping Proxies, bounded iterators, method failures/diagnostics;
M1 locking/persistence/native editing for blocked versus allowed edits,
argument/receiver/result forwarding, undo/redo restoring locked items, one
resize history step and cancelled preview, source/unknown field preservation,
restoring only our own hooks on dispose. Existing focused cases cover these
behaviors; add a forwarding regression if it is not explicitly covered.

Run types/full units/lint/CSS/builds/schema/three synthetic smokes/oracle/diff.
Compare full unminified and production plugin output against 666e474, and
MCP bytes against the baseline hash below. If bytes match, retain L15 real-app
matrices for the identical executable and confirm installed tablet readback;
if they differ, inspect differences and rerun background isolated Windows
and connected physical SM-X736B input checks before claiming completion.
SM-A336E remains disconnected; its installed-build checks stay pending.
No OS input/foreground takeover on Windows; CDP renderer input is synthetic,
ADB input on the tablet is separately recorded from CDP instrumentation.
Baseline main SHA b69a0b881218828bcf6ee5c1f95a94f9d335927e3b81b39c16d8a829803c4b7e;
MCP SHA ed94d0a1279dd456b18516b548fb8a4a59f7d362b2f739ea7b58b5faacbce150.


### L16 results (2026-10-06)

All three Function annotations now describe their actual private callers.
ESLint is 0 errors / 332 warnings (337 before): the three unsafe-function-type
warnings and two unsafe-assignment warnings at M1 native getData/drag return
values disappear because Reflect.apply now returns unknown rather than any.
A baseline/current ESLint comparison of the three files confirms this exact
five-warning delta; no rule was disabled and no runtime statement changed.

Full plugin plain output is byte-identical to 666e474, SHA
3fbdd738e76445406cfc973c8626208c8f320bb89d7d1ac8789073947b3828e5.
Production main stays byte-identical, SHA
b69a0b881218828bcf6ee5c1f95a94f9d335927e3b81b39c16d8a829803c4b7e;
MCP stays byte-identical, SHA
ed94d0a1279dd456b18516b548fb8a4a59f7d362b2f739ea7b58b5faacbce150.
Equivalence and lint-delta JSON are in .out/l16-*-equivalence.json and
.out/l16-lint-delta.json. The callable assertion follows the original
runtime typeof-function check; it adds neither a runtime call nor a wrapper.

Existing focused adapter tests exercise normal Map/Set collections, missing
APIs, throwing getters, revoked/prototype-trapping Proxies, bounded iterators
and operation failures. M1 locking's native mutation case explicitly passes
a move point and checks both the returned "moved" value and the receiver's
data; all fixture methods use their native this. Existing history, preview
cancel, persistence and later-hook restoration cases pass. No behavior was
changed, so no new test that merely mirrors an annotation was added.
Types, all 113 unit files (1,758 passed / one existing skip), ESLint, CSS
(86 priorities / zero :has), plugin/MCP builds, schema, all three synthetic
smokes, 25 oracle tests and diff check pass.

Real-app evidence is reused explicitly for the identical executable, not
reported as a newly repeated input matrix: L15 Windows 10.0.19045.6456 /
Obsidian 1.14.4 background CDP and Samsung SM-X736B / Obsidian 1.13.8
MiroCanvasTest ADB matrices exercised these exact main.js bytes. Current
SM-X736B readback on port 9340 matches the production SHA above. Only that
tablet is currently listed by ADB; SM-A336E phone installed/input verification
remains pending. No additional OS input or physical stylus claim is made.
No user-facing behavior or format changed; release behavior docs stay as-is.


## L17: owned toolbar, handle and thread hidden states (before edits)

Baseline db66aa2: styles.css 946/2057/3342 hide selection-toolbar,
selection-handles and comment-thread roots/descendants with three priorities.
SelectionToolbar.update sets root hidden for empty/unplaced selections and
hides node/edge/media-specific rows, link/delete actions, recent colors and
status. makePopover/togglePopover/closePopovers hide formatting and More menus;
M1 adoptNativeMenu hides its inert snapshot again after a middle-button pan.
Handles.update hides the root/frame/end grips and rotate/connect/resize grips
for empty, edge, locked or review selections. CommentThreadCard compose/show/
hide/showHelp hides the whole card, help, unavailable imported/local actions,
reply composer/note and message list. M1 mounts all three under its native
canvas-wrapper root and updates/closes the card on pin/outside presses.

Their author display rules override the browser hidden rule: toolbar root,
buttons/rows/popovers/native slot, handles and thread root/buttons/messages/
composer. Replace only these three priority rules with a shared rule scoped
to miro-canvas-root and those owned roots, ordered after component display
rules so equal-specificity native-slot rules cannot reveal hidden children.
Keep native controls/resizers, independent-only menu hiding, presentation and
capture overrides unchanged in this batch. No JS state/observers/persistence
changes are intended. Check every matched hidden element against the actual
Obsidian stylesheet instead of assuming the cascade is sufficient.

Mandatory new installed-app matrix in both themes: empty selection hides
bar/handles; native node/edge and mixed native selection show only applicable
rows/grips; lock and review hide edit grips; formatting/More popovers open,
close and disappear on deselect; native snapshot stays hidden at rest; inert
or hidden controls have zero rect and do not receive focus or a hit. Force
hidden on each owned styled descendant as labeled DOM instrumentation, then
restore its original attribute, to catch less common display conflicts.
Local/imported/locked comment pins must open, help must toggle, unsupported
reply/delete/hide controls must stay hidden, outside/Close must close and a
second pin press must reopen. New-comment compose hides thread-only actions
and closing it must not save. Source and unknown fields/history must survive.

Run background installed Windows 1.14.4 via CDP renderer input without OS
mouse/keyboard or foreground takeover, and physical SM-X736B 1.13.8 in
MiroCanvasTest with actual ADB pin/menu/close taps. Record DOM instrumentation,
programmatically prepared selections/locks/review separately from input.
Phone SM-A336E is absent; its fresh CSS checks remain pending. Also run the
existing CSS selection/resize/native-edge-before-release/history/cancel matrix
at 50/125 percent, search/export capture restore, and full repository gates.
Lower the CSS advisory budget from 86 to 83 only if all three rules pass.
User-facing appearance/behavior should be identical; fix any cascade failure
before marking the new checks passed.


### L17 comment outside-press finding (before JS edits)

The baseline Windows matrix on the old installed CSS passes hidden descendants
and Close/reopen, but fails outside-close on blank board while Select is armed.
The point is inside the 1280x800 renderer and hits canvas-wrapper. The late
root capture listener does not receive pointerdown: attachRectangleSelection's
earlier root handler consumes that press with stopImmediatePropagation to own
the single marquee. ensureCommentCard currently registers its outside handler
only after the first thread opens, so its order loses to that handler.

Move only this scoped outside handler to the owning window capture phase
(document fallback for a detached host). Check that the target is inside this
board root before closing; preserve all presses inside the thread or comment
markers. Capture the original root/target for exact paired listener removal
on session disposal, including owner-window/popout compatibility. Do not change
selection routing, native history or pointer prevention. Mandatory additional
regression: composing/open comment closes before a consumed Select press;
thread/pin/help presses stay open, other roots/panes are ignored, outside-close
and reopen pass with actual background renderer input and physical tablet ADB,
plugin reload cleans up and the press still has only one marquee/history action.
Add the consumed-press case to the synthetic DOM controls suite, keeping its
evidence separate from installed-app input. This is a pre-existing behavior
bug found by the required CSS-state matrix, not attributed to the new cascade.


The window capture listener also sees a directly dispatched Window-target
pointerdown, unlike the old root-only listener. Before calling root.contains,
ignore non-Node targets (safe nodeType read) and cover that case in the controls
regression. This keeps the widened listener failing closed across owner realms.
Harness correction before accepting Android results: a programmatically focused
composer does not always open the IME, so unconditional ADB Back may navigate
the test board away. Close the draft with its actual button; send Back only
if the board's keyboard state explicitly reports open, then verify its file.
The first Windows strict restore check sees the known welcome-board native
array settlement; exclude that attempt and retain the unchanged strict check.


### L17 results (2026-10-06)

CSS is 83 !important declarations (86 before), zero :has; source ESLint stays
at 0 errors / 332 warnings. The three hidden priorities are replaced by one
late scoped rule with specificity (0,3,0). No native inline-style bridging,
independent-only, presentation or screenshot override was removed. Current
production main SHA 8849bb6d1da0e83e7f7ceb239921b2d62b5e944cba4a4bef862a1573f1a47b2f;
CSS SHA 572acf04c0fc163ebeba19847f34d29441b901756bec23e722164424bb3eff28.
MCP remains ed94d0a1279dd456b18516b548fb8a4a59f7d362b2f739ea7b58b5faacbce150.
Installed main/CSS readback matches both current hashes on Windows and tablet.

The comment outside handler now captures in its own window before Select or
other board handlers claim the press. It ignores other roots and non-Node
Window targets, leaves card/pin controls open, and removes the same listener
on dispose. The new controls-suite DOM regression verifies the owner-window
registration, isolated non-Node callback, other-pane/card presses and a consumed
Select press closing an unsaved draft without leaving a second marquee.
The artificial Window-target case is invoked on that captured callback only:
broadcasting such a target also exercised unrelated existing window listeners
that assume actual Node targets, and those errors are excluded from this test.

New installed-app evidence on the current build:
- Windows 10.0.19045.6456 / Obsidian 1.14.4 (copied installed
  obsidian-1.14.4.asar), hidden isolated port 9346. All three matrices pass:
  check-owned-hidden, check-owned-visibility and check-css-state --background.
  Both themes, empty/native-node/native-edge/mixed/locked/review selection,
  formatting/More open-close-deselect, native snapshot hidden at rest, comment
  local/imported/locked open/help/Close/reopen/outside-close and unsaved draft
  Close, reload and restoration pass. Input is CDP renderer synthesis, with
  selections/review/draft/probes prepared programmatically; no OS input or
  foreground switch during the matrix. Actual PDF saved (37,407 bytes).
- Samsung SM-X736B / R52Y808PDJB / Obsidian 1.13.8, MiroCanvasTest port 9340.
  Same three matrices pass with actual ADB menu/pin/help/close/outside taps
  and resize DOWN/MOVE/UP/CANCEL plus Undo/Redo taps. Search text and prepared
  selections/review/draft/hidden probes remain DOM/CDP instrumentation.
  Actual PDF saved (37,322 bytes). Original Export touch test.canvas data,
  preferences/theme/viewport are restored; its original snapshot was not
  overwritten. The unconditional-Back harness attempts are excluded.
- Each owned-hidden matrix checks 37 states and 15,258 forced hidden cases:
  computed display none, no hit rectangle and no direct focus. This count is
  instrumentation on installed Obsidian DOM, not a count of physical gestures.
- Both platforms' CSS-state matrices pass native/turned selection, attached
  edge geometry before resize release at 50/125 percent, no preview save,
  one-step commit, Undo/Redo, cancellation and late code/attachment/reload.
- Phone SM-A336E remains absent from ADB; this build's phone check is pending.
  No hardware-stylus, iOS or new real popout input claim is made.

Initial Windows restore assertions on the generated welcome board detected
native node/group-array iteration reordering, as in the earlier startup checks.
Those attempts are excluded; their strict checks were not relaxed. The final
three complete matrices start from a newly created, group-free native baseline
in the isolated vault, serialized through native requestSave(false); every
original-restoration assertion passes, including the unchanged CSS-state byte
comparison. Welcome-board ordering remains a separate lifecycle follow-up;
no agent write restored or reordered an original snapshot.

Artifacts: .out/hidden-Windows-current.json, hidden-R52Y808PDJB-current.json,
visibility-Windows.json, visibility-R52Y808PDJB.json, css-state-desktop.json,
css-state-R52Y808PDJB.json and l17-installed.json. Types, all 113 unit files
(1,758 passed / one existing skip), ESLint/CSS, plugin/MCP builds, pinned
schema, all three synthetic smokes (including the new consumed-press case),
25 oracle tests and diff check pass. English/Russian README/design notes,
CHANGELOG and the installed-check harness guide describe the dismissal fix.


## L18: complete remaining-warning inventory and reconnected phone (2026-10-06)

No implementation lint fix in this batch. Fresh src report is 0 errors / 332
warnings and CSS is 83 priorities / zero :has on baseline 96420fa. The group
map in lint-remediation-groups.md and complete lint-remaining-sites.json assigns
every diagnostic once: 332 plugin, 83 CSS, plus 23 separately scanned MCP sites.
The JSON includes rule/selector, current locations/context and 51 file hashes;
438 entries and all group/rule sums are checked by the generator in .out.
Future fixes still require their own pre-edit participation/mandatory checks.

MCP diagnostic scan uses the same plugin rule set with correct Node globals,
without changing project ESLint config: 21 warnings / two errors, the latter
being the intentional console log/info redirects that keep protocol stdout
clean. Node-only imports (9), redirects (2), config paths (4), assertions (6),
async dispatch (1) and path regex (1) are all recorded. Current src/package
checks do not include this standalone Node server; this distinction is explicit,
not a claim that the broader directory report is clean. Custom config-directory
support is a real MCP behavior gap; Node imports are a distinct runtime scope.


### L18 phone evidence and gates

Reconnected Samsung SM-A336E / RZCW101PJVN / Obsidian 1.12.7,
MiroCanvasTest port 9341: deployed the current L17 executable/styles and ran
all three matrices successfully. Owned-hidden has 37 states / 15,363 forced
DOM cases; actual ADB menu/pin/help/Close/outside presses pass both themes and
comment close/reopen/compose states. Search/export saves an actual 36,280-byte
PDF and hides/restores capture roots. CSS state passes native/turned selection,
attached-edge paths before release at 50/125 percent, no preview save,
one-step commit/Undo/Redo/CANCEL, late code/attachment names and unload/reload.
Programmatically prepared selections/review/draft/search text/hidden probes
are recorded separately from ADB input. Original Export touch test.canvas
restoration checks pass; no original snapshot was overwritten. No new
physical-stylus handling claim. 1.12.7 remains additional legacy evidence below
manifest minAppVersion 1.13.7, not a supported-version minimum certification.

Readback main SHA 8849bb6d1da0e83e7f7ceb239921b2d62b5e944cba4a4bef862a1573f1a47b2f
and CSS SHA 572acf04c0fc163ebeba19847f34d29441b901756bec23e722164424bb3eff28
match this build. The final asynchronous read waited behind NotificationShade;
only a native Back/foreground attempt was used, not an Obsidian test gesture.
Artifacts: hidden-RZCW101PJVN-current.json, visibility-RZCW101PJVN.json,
css-state-RZCW101PJVN.json, l18-phone-css.log and l18-phone-installed.json in
.out. This closes the previously pending current-build phone matrix.

All required repository gates pass: types, 113 unit files (1,758 passed / one
existing skip), configured ESLint, CSS budget, both builds, pinned schema,
three synthetic smokes, 25 oracle tests and diff check. Local submission
packaging check passes; it does not certify directory acceptance. Production
main/CSS/MCP hashes are unchanged by this documentation audit. MCP SHA remains
ed94d0a1279dd456b18516b548fb8a4a59f7d362b2f739ea7b58b5faacbce150.
SDK/tool versions are recorded in the inventory. No new Windows/tablet input
run was needed for these byte-identical artifacts; L17 evidence still applies.


## L19: parallel wave 1 participation and mandatory gates (before edits)

Baseline 85cb6cd; remaining-site inventory describes unchanged code from
96420fa. Coordinator owns this register, production outputs, shared guides,
styles budget, device/Obsidian input and integration. Workers have disjoint
implementation/test scopes and an exclusive detailed pre-edit trace note
linked below. Each worker must write that note with its exact sites/callers
and checks BEFORE implementation. If a new runtime/public-contract change is
needed, stop at the reviewed patch boundary; do not silently widen the batch.
No worker edits miroSource/schema, lint rules, releases, or another worker's
files. No worker deploys or runs device input. No worker commits incomplete
integration; coordinator runs all gates, real-app checks, then commits/pushes.

### L19-SEL: data executor — selection types (69 diagnostics)

Owned source src/board-selection.ts; optional focused changes only in
 tests/board-selection.test.ts. Detailed before-edit record:
[selection worker](lint-workers/selection.md).
Trace: Loose alias; selectionMovesLineData; translateSelection's copy-on-write
metadata, commentPlaces, native edge overrides/waypoints, connector endpoint
masks. CanvasAuthoring.moveSelection calls translateBoardSelection; M1 uses
previewBoardSelection/selectionMovesLineData for drag preview. Both paths share
captured route ends. Require type-only private shapes/narrow annotations with
unchanged public contracts, property reads/clones/order and emitted module JS.
Mandatory: mixed native/independent/comment selection; one caught end and a
far end outside bounds; repeated preview/commit parity, unchanged input and
source/unknown fields; native/connector chains; group/non-default zoom, paths
before release, cancel/Undo/Redo and no preview persistence. Existing focused
selection tests plus coordinator's full scene/history/real-app gates apply.

### L19-AUTH: authoring executor — authoring types (58 diagnostics)

Owned source src/canvas-authoring.ts; optional focused changes in
 tests/canvas-authoring.test.ts and tests/canvas-authoring-update-nodes.test.ts.
Detailed before-edit record: [authoring worker](lint-workers/authoring.md).
Trace: isPlainObject/safeInvoke/native mismatch/buildShape, createConnector,
createItem, insertGraph, updateEdgeLabel, updateNodes and changeItems. M1 tools
and standalone MCP tools call the same CanvasAuthoring writer; edits carry
locks/review/source and unknown fields through native persistence/history.
Require annotation/assertion changes only; no new checks, getter reads, clones,
reordering, public signatures or validation weakening. Prove module JS identity.
Mandatory: creation/style/resize/rotation/labels/paste graphs and ID remapping;
locked/review/malformed host failures; one native history step; stale document
refusal and metadata/source/unknown preservation. Focused authoring tests;
coordinator runs whole-module consumers, builds and integrated app matrices.

### L19-MCP: server executor — six redundant assertions

Owned sources mcp/src/board-file.ts and mcp/src/tools-edit.ts; optional focused
assertions in existing MCP tests only. Detailed before-edit record:
[MCP worker](lint-workers/mcp.md).
Trace: FileMetadataStore.commitDocument structuredClone; createEditTools style
and lock clones; connectorPatch narrowed color; updateLine style casting.
Remove exactly the six inventoried M4 assertions after verifying each caller.
Do not change Node imports, console redirects, config paths, dispatch or regex.
Mandatory: writer expected-document/stale check, native locks/review, unknown
fields/miroSource, graph/connector writes, read-only tools and clean stdout.
Prove emitted module identity; coordinator confirms full MCP build identity.

### L19-WIN: platform executor — five timer diagnostics

Owned src/main.ts (only initializationRetry declaration/set/clear lifecycle),
src/obsidian-document-host.ts and tests/obsidian-document-host.test.ts.
Detailed before-edit record: [platform worker](lint-workers/platform.md).
Trace: handleActiveLeafChange cancels a pending retry, probes mounting and
persistence, schedules 250ms only for the still-active leaf (at most 20);
disposeShell cancels the remaining timer. applyNativePdfFit races the native
viewer promise against 2s and clears its timeout after resolve/reject/timeout.
Preserve the retry/limit/history/save semantics; capture one stable timer owner
for both set and clear. Avoid activeWindow changing between those operations.
Do not migrate activeLeaf/IDs/DOM or m1-session in this first batch. PDF timers
must use the view's owner window where available and preserve the bounded
fallback. Tests must verify owning receiver, same-host cleanup, ready/reject/
never-ready and non-PDF behavior. Coordinator checks supported desktop/tablet
plus the legacy phone, delayed mounting/leaf switch/unload and actual PDF view.

### L19-CSS: interface executor — dependency/impact review only

Exclusive output docs/lint-workers/interface-dependencies.md. Review all C1-C10
against their state writers, owner documents, inline native styles, rotation,
source rendering and tablet button rules. Identify actual prerequisites for
DOM helpers/settings/owner-window work and file conflicts separately. Produce
ordered patch slices with exact selectors/properties and mandatory real-app
checks. Do NOT edit CSS, implementation, shared docs, outputs or devices yet.
The coordinator keeps one CSS writer/one owner for m1-session.ts; this prevents
independent-looking rule groups from colliding in shared state or the cascade.


### L19-BASE: foundation executor — two annotation diagnostics

Owned src/appearance.ts (only isSafeObjectKey typing / validateOverrides
unsafe-key diagnostic) and src/minimap-model.ts (MinimapViewportSize alias).
Detailed before-edit record: [foundation worker](lint-workers/foundation.md).
The key comes from ownKeys as string; a negative value-is-string predicate
narrows it to never even though unsafe strings reach the diagnostic in runtime.
Preserve rejection/diagnostic and every reserved key/length/trim constraint;
change annotations/overloads only, no String() conversion or deleted branch.
MinimapViewportSize is an empty interface over ViewportSize, used in viewport
size parsing and minimap geometry. Require accurate type alias and emitted JS
identity. Existing appearance/metadata and minimap/viewport tests must pass;
no declaration-merging/public signature break. No regex/shared helper change
in this first patch. This worker may separately propose a portable control-
character contract for later validator batches, without implementing it yet.

### L19 integrated evidence and remaining checks (2026-10-06)

All six workers returned their bounded patches/audit. The dependency and owner
ledger is [the execution plan](lint-execution-plan.md), with every baseline
site assigned once in [JSON](lint-execution-plan.json). Worker notes describe
before-edit trace and module evidence; this section records coordinator checks.
Local worker artifacts were archived from the newly created root `.out/` into
`tools/obsidian_cdp/.out/l19-worker-artifacts/`; their original scripts/patches
retain original artifact paths. No unrelated root files were moved or staged.

Source warnings: **332 -> 198, zero errors**, exactly 134 removed: selection
69, authoring 58, timers 5, foundation 2. No additional source diagnostics.
CSS remains **83 !important / 0 :has**; this wave edits no CSS. Separate
Node-scoped MCP diagnostic pass: **21 warnings + 2 errors -> 15 warnings + 2
errors**. Six assertions removed; remaining Node imports (9), stdout redirects
(2 intentional diagnostic errors), config directory (4), dispatch async (1)
and filename regex (1) remain queued/reviewed independently of plugin lint.
The configured plugin lint succeeds; MCP rules were not disabled or changed.

Type-only whole-plugin proof, with baseline timer sources held fixed:
unminified output byte-identical, SHA256
`378f269349b5e44272c7330e25c858bc4651bdba981ec8979b562ab8f200f601`.
Direct minified output differs, but all **394946 AST nodes** agree in structure
and literals: only **216 identifier occurrences** have consistent bijective
renames. The actual integrated plugin intentionally changes timer ownership;
its production SHA256 is
`bf411cff362b65d021dc2779e8f72e0411a0ea1d32602e316bf5c71fa6fc7cc0`.
Full MCP bundle is byte-identical to baseline:
`ed94d0a1279dd456b18516b548fb8a4a59f7d362b2f739ea7b58b5faacbce150`.
CSS SHA256 is unchanged:
`572acf04c0fc163ebeba19847f34d29441b901756bec23e722164424bb3eff28`.
Installed readback on all three apps matches main/CSS hashes after testing.

Integrated repository checks: TypeScript, Vitest **1800 pass + 1 existing
skip / 113 files**, plugin lint, CSS budget, schema pin, production plugin
and MCP builds, all three synthetic smoke suites, Python oracle **25 pass**.
The added native harness also passes `node --check`; final diff/encoding
checks apply to all owned files. No release/version/tag operation is included.

Optional M0 setup was also attempted: its installer still expects manifest
0.1.0 and refused current 0.2.7. `check_environment` only inspected its empty
scaffold, with missing runtime warnings; neither is a passing runtime check.
The newly created unregistered scaffold was archived in ignored
`tools/obsidian_cdp/.out/l19-m0-attempt/`. This existing helper-version mismatch
needs a separate tooling fix; actual native results below use CDP's correctly
installed current build and are independent of M0 setup.

| Real app | Input and scope | Result |
| --- | --- | --- |
| Windows, Obsidian 1.14.4 | Hidden isolated `l19-windows/vault`, background CDP mouse/key events; no OS input or bringToFront | All three existing matrices and timer/native-PDF probe pass; original L19 baseline bytes restored |
| SM-X736B / R52Y808PDJB, Obsidian 1.13.8 | MiroCanvasTest, actual ADB menu/pin/close/resize/Undo/Redo taps; CDP preparations/probes separate | All three matrices and timer/native-PDF probe pass; Export touch test.canvas bytes restored |
| SM-A336E / RZCW101PJVN, Obsidian 1.12.7 | Same MiroCanvasTest boundaries and ADB/CDP distinction | All three matrices and timer/native-PDF probe pass; original board restored; legacy evidence below minAppVersion 1.13.7 |

Existing matrices: `check-owned-hidden` (37 states; exhaustive hidden display,
rect/focus, popovers, local/imported/locked comments/draft/outside close/reload),
`check-owned-visibility` (both themes, search and actual PDF export/capture
hide/restore), `check-css-state --expect-marks` (native/turned selection,
attached-edge preview before release at 50/125%, no preview writes, commit,
Undo/Redo/cancel, late code/attachment marks and reload). Android controls and
gestures use ADB; query/selection/late-mark preparation uses CDP. Windows uses
background renderer synthesis. This is no new physical stylus evidence.

New `check-timer-owners` calls the actual installed plugin lifecycle methods,
opens/switches native Canvas leaves and disables/re-enables the plugin. A
temporary mount wrapper **forces** retry eligibility; it does not claim a
naturally delayed native failure. A 250ms retry settles on readiness; leaf
switch/unload clear the captured host's pending handle; reload mounts and
original board bytes stay unchanged. Exact 20-attempt bound, inactive-leaf,
handle-zero and alternate-owner cases additionally have unit/synthetic proof.

The native PDF is actually exported, opened and reused through the current
pure bridge in the real app. **Automatic fit is unsupported on these three
installed versions:** private nested fit fields are absent and the existing
diagnostic/native controls fallback is retained. Direct baseline 85cb6cd and
current bridge both return false on the same native view. Do not describe this
as successful automatic fit. On its real owner window, instrumented never-ready
and rejected viewer facades use/clear the same 2000ms timer; elapsed about
2000-2013ms. A controlled late renderer receives no fit write. These failure
facades are CDP instrumentation, not actual viewer failures/physical input.

Excluded setup attempts: Windows onboarding modal obscured a control; tablet
had no active file after reconnect. Close the modal with background CDP and
open the existing tablet test board, then rerun complete matrices. A first
late-PDF assertion compared the live viewer's independently changing scale;
replace that contaminated assertion with an instrumented late renderer and
record the real fallback separately. No product code changed in response.

**Still pending:** real desktop popout/closed-window ownership and naturally
closed/failed PDF viewer cases. No visible OS window was created for those
checks. Existing automatic-fit compatibility is a separate follow-up, as are
generated welcome-board ordering and the baseline extension-field loss found
in moved waypoints/replaced free anchors. Type-only changes preserve existing
behavior and do not certify those branches as repaired. Queue D-EXTENSIONS
before subsequent semantic movement work; before-edit checks are required
again when these separate runtime fixes begin.

## L20 — complete the assigned remaining work (2026-10-06)

### Welcome ordering follow-up — native behavior verified

Windows 1.14.4 hidden native reopen: L19 `2f3687c`, current source build and
plugin-disabled cases each retain all 79 node records, every root field and
original disk bytes. Runtime order differs from file order in all three cases.
Local native `getData` implementation sorts by `Cee(e,t) = e.zIndex-t.zIndex`;
it spreads the native saved data first and preserves root extensions. Runtime
zIndex initialization can produce different orders across reopen attempts.
This is native serialization, not a new field/source loss. No product patch.
Artifact `l20-welcome-order.json` records the three classified native API probes.
The settings harness now waits for stable bytes/runtime order and compares all
fields canonically by root node ID, while retaining strict original byte checks
after subsequent actions. It no longer assumes that native z-order matches the
original disk array. All nested/unknown/source arrays stay ordered in the witness.

### L20 source native styles — coordinator lease, before edit

Native follow-up, before repair: the installed CSS-zero Windows fixture found
Markdown layout rewriting the ordinary card's owned sizer padding from 0 to
18px after its child-list notification. Reuse the existing single appearance
observer on fixed owned sizer `style` attributes; reuse SourceRenderer's single
live observer for fixed projected style targets. Style callbacks compare cached
properties only, without DOM queries, measurement, card traversal or timers.
One mutable snapshot per property retains the latest native value/priority,
avoiding an accumulating restore patch per resize. Child-list callbacks alone
discover late targets. Mandatory late layout/foreign-write reconciliation,
group fallback changes, repeated no-op style records, bounded snapshots,
restoration and native three-platform rerun.

Parfit's PDF lease is closed; the coordinator owns `source-renderer.ts` for
the remaining 36 C4/C5 sites in the exact CSS request inventory. Participation:
`refresh` -> memoized card signature -> `applyNode` -> current native shell,
face, content, preview and sizers. `followLiveGeometry` already has one shared
child-list observer for markup; reuse it for late content projection. Existing
reverse-order patches restore value AND priority. No new card observer or
per-frame card traversal. Clear only inline declarations competing with exact
paint selectors, preserving dynamic CSS selection/theme states. Project the
three sizer modes and fitted text with normal inline values. Group selection
uses CSS variables for live border width/style/color, retaining native values
while unselected. Mandatory: native ordinary/text/shape/sticky/drawing/table/
code/document/embed/deck/slide/group/mindmap faces, fitted original markup,
late replacement, group focus/unfocus, themes, undo/reset/unload, source/unknown
preservation, fixed identity memoization and physical Android input. Unit and
real-app checks remain pending until recorded below.

User explicitly requests completion of every pending item. Baseline 2f3687c:
198 source warnings, 83 CSS priorities, 17 standalone MCP diagnostics. Parent
alone owns m1-session.ts, shared DOM factory, central register/plans/locales,
builds/deployments and app input. Four unrelated root files remain untouched.
Workers write detailed linked before-edit sections before EACH implementation
slice, not a retroactive summary. Artifacts live under tools/obsidian_cdp/.out.
New shared contracts are reviewed before their consumers adopt them.

### L20-DATA

Sagan owns board-selection.ts and the previous data-direction files, plus
focused tests. [Before-edit notes](lint-workers/l20-data.md). Trace D-EXTENSIONS:
translateSelection/shift, replaced native free anchors and comment places feed
M1 previews and committed history; preserve unknown fields and miroSource,
remove only obsolete known attachment fields on type conversion. Mandatory:
native/independent captured-end masks, waypoint extensions, repeated drag,
connector chains, mixed/group and nondefault zoom, no preview save, commit/
cancel/Undo/Redo, metadata locks/review. D-RECORDS traces hostile records and
private host calls; preserve guards/reads/public contracts and prove emitted
JS identity where annotation-only. D-VALID follows the separately reviewed
exact character profiles; every allow/reject/replace/trim/length edge requires
equivalence evidence before callers change. Parent owns native device checks.

### L20-AUTH-DOM

Helmholtz owns advanced-canvas-adapter/importers/viewport remaining records,
then explicit delegated UI files: m2-tools, panel-arrange, panel-visibility,
document-controls, slide-show, board-export. [Notes](lint-workers/l20-authoring-dom.md).
This is a temporary U-DOM file lease transfer, not concurrent interface writes.
Trace pure import/native receiver and DOM creation from injected owner documents
to append/focus/icon/events. Adopt only the parent-reviewed owner-document
factory. Preserve attributes/child order/detached creation/SVG namespace and
tablet button variables. Mandatory import unknown/source/locked failures;
all creation tools, M2 dialogs, arrange/fold/cancel, PDF page controls,
presentation/export success/stop/failure, both themes and mobile real input.

### L20-PLATFORM

Parfit owns main.ts, document-host, IDs, fonts, editor-appearance and
source-renderer, with focused tests. [Notes](lint-workers/l20-platform.md).
Trace main active-leaf switches/settings callbacks/command IDs, private native
PDF view fields, portable crypto IDs and reversible renderer styles. Read real
host code before changing private APIs; parent supplies native snapshots. Keep
hotkey compatibility, UTF-8 filename restrictions, Node/shared-module support,
same-window cleanup and font failure retry. Mandatory rapid leaf switch/unload,
ready/reject/close/timeout/fit/page/reused native PDF, main and hidden popout;
renderer before/after style restoration, offscreen nodes, themes/rotation/
selection, actual capture, original bytes/source preserved. CSS owns styles.css;
any requested renderer ownership change must be coordinated before editing.

### L20-FOUNDATION-SETTINGS

James owns appearance.ts, new pure exact character profiles/tests, and
settings-tab.ts. [Notes](lint-workers/l20-foundation-settings.md).
Trace validators to names/paths/font keys and replacement semantics; preserve
all exact C0/DEL/C1/format sets, codepoint versus code-unit limits. Export pure
profiles for reviewed adopting src/MCP callers; no Obsidian runtime import.
Settings definitions can replace display; trace native search indexing,
custom host/scroll/focus/toggles, save/rebuild behavior before migration.
Mandatory exhaustive profile equivalence, appearance rejection/prototype
protection, all settings available and searchable, keyboard/section positioning,
device-local persistence and restore. Parent owns locales if new keys needed.

### L20-INTERFACE-CSS

Anscombe owns styles.css and comment-markers.ts, then remaining interface
modules excluding explicit Helmholtz/James leases. [Notes](lint-workers/l20-interface.md).
Use prior 83-site audit as trace, with each new selector/state owner recorded
before its slice. Order owned states/size/cursors/native controls/link blocker,
paint/text/rotation, capture/presentation, comment transform, native layer.
Specificity cannot defeat native inline values; define reversible ownership
with main/renderer owners rather than move !important into JavaScript. No
per-card-per-frame observer/measurement. Mandatory both themes, hidden/disabled/
focus/hit, one outline/marquee, comment tail/hit after zoom, text/Markdown/inline
typography, native and chain geometry before release, capture restoration,
tablet padding, reload/dispose and connected device input. Parent supplies
shared factory; no concurrent m1-session/source-renderer writes.

### L20-MCP

Carver owns mcp/, standalone lint scope and focused server tests, excluding
shared schema/src/central outputs. [Notes](lint-workers/l20-mcp.md).
Trace configDir into protected paths, local filename validation and JSON-RPC
async dispatch/stdout routing. Keep necessary standalone Node APIs and clean
stdio. Correctly document/enforce server runtime scope instead of deleting
required APIs or weakening plugin rules. Mandatory custom config directory
read/write/traversal/protected/symlink/stale/locks/source/unknown cases, method
responses/notifications/read-only/errors, real process stdout valid protocol,
no plugin import of server and actual bundle validation. Pure character-profile
contract is a prerequisite only when adopted for filename checks.

### L20-CORE and native follow-ups

Parent owns remaining 35 M1 sites: runtime records, DOM factories/owner fallback,
search result marking, text validation, system clipboard and guarded native
receiver. Trace each narrow block in a before-edit entry before modification.
Keep native method receiver and synchronous history/rollback, graph and text
clipboard semantics, unknown/source and geometry invariants. Check isolated
system clipboard with restoration (synthetic ClipboardEvent is separate),
hidden popout/closed-window timer ownership and actual PDF controls, baseline
welcome-array settlement, and M0 helper's stale 0.1.0 version restriction.
Real input uses background renderer CDP on Windows; Android uses ADB on each
physical device separately. Only frozen integrated builds are deployed.

#### L20-CORE DOM contract — before edit

Observed installed Windows Obsidian 1.14.4 via background CDP: global createEl
uses its realm's document.createElement; Node.createEl calls that global and
appends to its receiver. Node.doc is ownerDocument || document. Therefore using
an unrelated parent helper may adopt a wrong-realm element, unlike original
owner-document creation. Shared createHtmlElement/createSvgElement capture
document.defaultView and call that realm's helper when present, otherwise bind
the native creation method to the injected document for browsers/minimal tests
without Obsidian extensions. Return detached elements; preserve exact tag,
namespace, empty attributes/children, helper/native receiver and no ambient
activeWindow. No global prototype patches, temporary body insertion or writes.
Consumers keep current append/set-attribute/style/events code. Mandatory unit
checks: distinct main/owner helpers, helper receiver and ownerDocument, plain
and minimal fake documents with no window, SVG namespace, detached state and
no ambient read. Native checks include main and hidden popout plus child
iframe fallback; tablet/phone actual component controls after deployment.

#### L20-CORE records/DOM/context — before edit

M1 read boundaries: boundingRect/readStyleValue/search edge-path lookup,
readStyleProperty, hide-imported-comment list, refreshLiveDocument scene arrays,
node Map lookup, appearance target/closest/frame queries, refresh timer handle,
event ancestry/attribute/closest. Reflect results become unknown before their
existing checks; Array.isArray results become readonly unknown[] before copy.
No extra guard/getter/cloning/order/runtime branch is allowed in this type slice.
Mandatory module JS byte identity and existing hostile host/selection/history/
appearance/comment/geometry tests; parent integration/native follows later.

DOM sites: search hit, marquee, brush, pen/shape/connector preview SVG,
text-replacement form/input, mixed selection frame/sides and attachment label.
Replace only creations with reviewed owner-document factories. Owner-document
fallback renames its local variable to read ambient document without globalThis,
with typeof guard for Node; actual owner-first behavior remains. Mandatory:
search hits, native/turned/mixed outline, rectangle/lasso, pen/tilted shapes,
transparent overlay, text form, late labels, iframe/hidden popout, cancel/reload.

#### L20-CORE search/text/native wrapper — before edit

searchHitElement checks a known connected cached label/pin, otherwise queries
the current root only. Use root.find when Obsidian provides it; retain generic
native query fallback for injected browser hosts with no extension. Same
selector, cache key and missing-element handling; no global document query.
captureTextFragment reads selected editing node's actual string text to decide
HTML formatting. Unknown objects must not stringify/execute user getters; only
actual strings can be HTML. Native guard wrappers need a lexical disposed
predicate and their function receiver; replacing the whole wrapper with an
arrow would change native this and is forbidden. Keep original descriptor,
args, third-party later hook and restoration semantics. Mandatory label/pin
search/rebuild/cache/disconnected, text plain/HTML/unknown and prototype-sensitive
inputs, native receiver/disposed/throw/locked/review/Undo/Redo/stale data hooks.

#### L20-CORE clipboard compatibility disposition — before edit

Installed native Canvas handleCopy writes DataTransfer `obsidian/canvas`;
handlePaste reads that exact type before file/link/plain-text fallback. Desktop
uses owner-window Electron getCurrentWebContents copy/cut/paste first. Android
has no electron; document.execCommand raises the trusted ClipboardEvent served
by the plugin/native handlers. Removing that fallback breaks connector menu
copy/cut/paste and native graph interoperability.

Actual hidden Windows 1.14.4 probe: ClipboardItem.supports('obsidian/canvas') is
false, supports('web obsidian/canvas') is true. After Async Clipboard.write with
the web type, trusted WebContents.paste exposes only text/plain; getData of the
native Canvas type is empty. The original system clipboard text/html/rtf/image
and custom data were held only in renderer memory and restored in finally;
no payload contents logged. This confirms no equivalent async replacement.
Chrome documents web custom types as opt-in incompatible native representations:
https://developer.chrome.com/blog/web-custom-formats-for-the-async-clipboard-api.
SM-X736B reports the same support distinction and no electron. Full actual
menu roundtrip/lock/failure/history tests follow on final app builds.

Disposition: retain this one legacy API as a documented compatibility requirement.
The linter disallows deprecation suppressions; no suppression/config relaxation
is used. Probe and invoke the unchanged, explicit execCommand capability through
the existing fail-closed host bridge, which retains its receiver and catches
missing/throwing methods. This also fixes the old unhandled fallback exception.
The API remains legacy; passing static lint is not evidence of replacing it. Do
not label this accepted compatibility requirement as an API migration. Require
receiver/arguments, desktop preference, missing/throwing fallback, denied copy
never deleting data, native graph and plugin metadata roundtrip, cut one step,
Undo/Redo, and system clipboard restoration. No asynchronous cut is introduced.

#### L20 M0 runtime version — before edit

Oracle load_config supplies required_plugins.miro-canvas to scaffold manifests,
runtime installer expected_version, profile validation and environment checks.
The committed 0.1.0 pin refused current 0.2.7 before deployment. Replace only
that stale runtime requirement with a repository-version token resolved by
load_config from the checked manifest id/version; retain explicit alternate
pins and installer overrides. Missing/malformed/mismatched repository manifest
must fail before vault mutation. Preserve exact vault/link guards, atomic
installation/rollback, three release assets and unrelated Advanced Canvas pin.
Mandatory fake-manifest versions/pinned overrides/malformed/missing tests,
existing oracle suite, actual current build setup/environment, no vault/window
registration, and future manifest changes without hand-editing the config.

#### L20 native UI display ownership — before edit

Remaining CSS control/menu/capture rules compete with inline native/plugin
display values. Sagan's temporary lease is new native-ui-visibility.ts and
focused tests/[note](lint-workers/l20-native-ui.md); parent alone wires M1.
Take fixed native controls/menu elements discovered once per native identity;
controls stay hidden during the session, menus hide only for independent-only
selection, presentation or capture. Reversibly own normal inline display/hidden
without !important. Snapshot original/latest external value AND priority and
hidden attribute, restore only own value, detach exact owner-window observers.
Observe only those few UI roots and root class state, never card styles or
per-card/frame scans. Mandatory external show during suppression, native menu
rebuild/restoration, capture/presentation begin/end/failure, subsequent plugin
hook/disposal, focused/hit accessibility, both themes/mobile/owned-window tests.

#### L20 selected native layer ownership — before edit

updateShownLayer currently marks only a single non-group native card and stores
its runtime zIndex in --miro-canvas-layer; CSS priority defeats selected node's
native inline zIndex lift. Capture current z-index style value/priority once,
set the normal inline value to that same runtime layer while selected, and
restore only our applied value when clearing/changing/disposal. A native
renderZIndex hook applies only to the one marked card; preserve its receiver,
underlying runtime zIndex/file order/Undo history and third-party restoration.
No new pass through all nodes per frame. Mandatory overlapping/select/group/
mixed, native drag lift before release, move/cancel/Undo/Redo, native/external
inline value and priority restoration, offscreen remount, source unchanged.
### L20 — local native card vertical alignment ownership (before edit)

The three sizer declarations at the start of `styles.css` participate in M1
`decorateNodeAppearance` → `applyElementAppearance`, including ordinary Canvas
text cards without source descriptors. They must be projected onto the current
Markdown sizer, in the existing identity/content appearance pass, and restored
with original value and priority. No new per-card observer or frame work.
Mandatory: top/middle/bottom, overflow, late preview replacement, reset and
unload restoration, foreign priority preservation, native Windows and both
Android versions; no board/history/source changes. Real checks pending.

### L20 — deferred native style writer followup (before edit)

Actual installed Windows 1.14.4 rewrites ordinary Markdown sizer padding-bottom
from the projected 0 to 18px after the childList callback. CSS specificity cannot
override inline declarations. SourceRenderer already observes fixed rotation/
markup targets; M1 already has one appearance observer. Register only the fixed
participating properties in these existing observers, reconcile style mutations
without DOM queries/measurement/board refresh, and retain the latest external
value/priority for reset/unload. No extra observer per card, no frame work, and
no accumulating restore patches. Empty paint declarations must register before
the first late native write. CSS-normalized values and echo records must cause
zero repeated writes. Group variables retain latest native border fallback.
Mandatory: late 18px layout, paint + rotation in one observer, 1000 echo batches
without writes/queries, reset/unload/latest foreign priority, actual native style
owner harness on Windows and both Android versions, original board/source/history
unchanged. Focused tests are unit evidence; actual app results recorded separately.

Deferred-writer audit, before followup: Chromium reproduced overlapping `padding`
vs M1 padding-bottom teardown, and background/border shorthand restoration
overwriting later native color/priority. Own non-overlapping longhands in these
families. Repeated Markdown replacement also retained old targets; prune detached
ownership and observer keeper registrations on content replacement, never on a
frame. Mandatory real CSSOM mixed shorthand/longhand teardown, late native color,
100 preview replacements with bounded current targets and preserved rotation.

### L20 — integrated evidence on the frozen build (2026-10-06)

Frozen assets: main.js `aff2ee3a34a3045a30075c5736091c5cde937e3e06d2c1d327659ae5705aa200`,
styles.css `7c5ce8c141b048ae4382abb83f6c3a309a0bfef5c21290bc527184202a76208c`,
manifest.json `68169dd642f5654f4a1c3fdf0f64510dd5dba5a72c9d9a3abf39f1a6d4f1c174`,
MCP bundle `4c69150dc6398649a43fae27a2fdbf1d53e2e6a08e096022ed4adef74ccb9618`.
Runtime/CSS are frozen; subsequent test/documentation corrections do not alter
these assets. Worker implementation receipts are linked above, never substituted
for installed app evidence.

Full integrated types, 126 Vitest files (2036 passed + 1 existing optional skip),
src lint (0 errors, 1 retained command warning), standalone MCP lint (0/0), CSS
lint (0 priorities, 0 :has), schema pin, production plugin/MCP builds and
submission packaging passed. Three synthetic smoke suites and 33 oracle pytest
cases passed separately. The first cold typed-ESLint test exceeded its old 5s
test deadline; its startup allowance is now 30s, preserving all rule assertions;
the complete suite passed. This is test harness startup, not a product timeout.

Current M0 setup/environment passed with manifest-derived plugin version 0.2.7
and four offline compatibility boards. The separate Advanced Canvas scaffold
contains its pinned manifest but no runtime JS/CSS; this is not claimed as
installed Advanced Canvas visual compatibility. No vault registration/window
opening occurred. Generated vault archived under ignored .out/l20-m0/vault.

Windows 1.14.4 native style owners passed on the final installed build: both
themes, actual Markdown 0px padding after deferred layout, native paint/menu
competition, capture/presentation suppression and latest external priority,
class-only group border changes, original source/extension fields and history.
200 actual DOM preview replacements retained five current Source targets.
Separate pure-helper actual-host CSSOM cases prove table padding teardown and
latest blue color/important priority restoration for embed/slide. No OS input,
foregrounding or screenshots; original board bytes restored exactly. Artifact:
tools/obsidian_cdp/.out/l20-native/styles-Windows.json. M1-specific current-sizer
coverage is being checked separately; the Source replacement count is not a
claim of that extra owner.

Final pure-helper/cached-native CSS proof rerun after restoration repair:
132 variants, 48,816 compared values, all 83 original sites matched, zero
differences including extra paint surfaces; disabling ownership produces 162
differences. Group class-only cycles make no extra writes. This is synthetic
CSS evidence, separate from the installed plugin checks. Artifact:
tools/obsidian_cdp/.out/l20-interface/css-transfer/final-proof.json.

Windows main/plain-iframe/native hidden-popout owner factory checks passed
with exact helper receivers, document, detached HTML/SVG and namespace; pending
individual UI mounts/actions are separately tracked in l20-dom-native.md.
Earlier pre-restoration-repair installed Windows hidden/visibility/CSS-state/
card-fill/font-failures/arrow-color matrices passed; final reruns are recorded
separately, without relabeling their earlier build. Final tablet evidence is in
lint-workers/l20-tablet-final.md. After the user unlocked SM-A336E, all nine
final-build phone matrices passed; see lint-workers/l20-phone-final.md. The
supported-settings gate excludes this legacy Obsidian 1.12.7. Hardware
pressure/hover is never inferred from ADB pen-source or synthetic CDP pressure.

Welcome ordering followup CLOSED without a production patch: actual native
getData sorts by zIndex; archived L19, L20 and disabled-plugin native reopens all
reorder in-memory arrays while preserving every card field, source/extensions
and exact file bytes. The harness now compares all fields while ignoring only
the top-level runtime node order; nested unknown arrays retain their order.
Artifact tools/obsidian_cdp/.out/l20-welcome-order.json. Remaining app/input
acceptance below stays pending until its actual recorded result.

Phone final receipt: native styles, hidden roots, visibility/capture, resize/CSS
states, PDF/timers, card fill, font failure, arrow colors and held drawing/shape
recognition passed. Real ADB control/gesture/pen-source input is separately
recorded from CDP pressure/state preparation and actual-host CSSOM helper
instrumentation. Original Export touch test.canvas bytes, theme/settings/config
and frozen installed hashes restored exactly. Positive ordinary M1 ownership
is 1→1 after 100 DOM preview replacements; imported Source ownership is 5→5.
The earlier offscreen count0 observations remain historical limitations.

Windows final native clipboard/menu check passed on the frozen asset. Trusted
background CDP menu clicks caused actual trusted copy/paste/cut clipboard
events, including Obsidian's Canvas MIME. Native paste duplicated two cards and
one edge, preserved source/unknown fields and per-card overrides, and made one
history step. Cut and both Undo/Redo roundtrips passed. All original clipboard
formats/payloads were held only in memory and restored/verified; none logged.
Original board bytes restored. Artifact .out/l20-native/clipboard-Windows.json.
This is installed Electron clipboard evidence, without OS input/foregrounding.

Final Windows AFF2 matrix: native-style owners, hidden, visibility/capture,
CSS/resize/labels, timer owners/PDF, card fill, font failures and arrow colors
all passed sequentially. Original L20 baseline.canvas bytes/path restored;
one native main window remains hidden/unfocused, no children. Current ordinary
M1 sizer retention is positively checked 1→1 after 100 replacements; earlier
zero-count coverage is superseded by this new result, not relabeled. Evidence
.out/l20-windows-final/summary.json and restoration.json; styles-Windows.json.

Supported Windows 1.14.4 settings navigation passed all twelve sections,
trusted renderer key/mouse navigation, fresh welcome full-field witness,
export help and exact post-action bytes, source/unknown fields and asset hashes.
The window stayed hidden; no screenshots or native dropdown popup. Existing
miro-canvas:m1-commands registry ID and a temporary native in-memory custom
hotkey opened the commands modal through a trusted Ctrl+Alt+F10 event. Original
mapping, hotkeys file existence/bytes and board bytes restored; no config save
for the temporary mapping. Evidence settings-navigation-desktop-background.json
and .out/l20-hotkey-proof.json. This certifies keeping the literal ID; the one
raw command lint warning is a compatibility disposition, not concealed.

Additional actual Windows export passed a two-page native PDF, trusted Stop
during capture, and an explicitly forced save-callback failure after actual
capture. Each branch restores exact camera, document, screenshotting flag,
capture classes, progress removal and both export roots; cancel/failure create
no extra PDF. Evidence .out/l20-export-followup-Windows.json. The save failure
is an injected callback, not a claim of an actual disk error. Actual PDF viewer
opened the exported two-page file in main and hidden native popout: page-width
and page-fit confirmed, two pages loaded, current main owner true/popout false.
Already-closed native view returns false. Closing actual popout during each of
six forced readiness stages returns false in 167–172ms with zero late fit writes.
Forced never-ready stages are facades; native window teardown is real. Original
board bytes/path restored; evidence .out/l20-pdf-popout.json on frozen sources.

Tablet fresh creation height diagnosis: the same Picture.png file node changes
height160→133 at width200 in archived L19, current L20 and unloaded native
Obsidian. Actual native image renderer sets aspect ratio and calls native resize
plus overrideHistory; unloaded-native stack contains only app.js. All other
fields/source/extensions match. This is native initial image normalization,
not an L20 data-loss repair. The before-edit settings-harness followup permits
only this mathematically verified creation variant before the strict action
baseline; original-board/action bytes and every other field remain strict.
Evidence lint-workers/l20-tablet-final.md and ignored height-profiles-report.json.

Final tablet settings and stronger native style-owner reruns passed on the same
frozen assets: twelve sections, ADB navigation, separately labeled CDP Tab,
fresh creation's sole verified image-height normalization, five stable full
native/file samples, then exact post-export/post-close bytes. Actual ordinary
M1 owner remains 1→1 after 100 replacements in both themes; Source remains 5→5.
All ten tablet matrices are now accepted; original board/theme/data.json and
three installed asset hashes restored. See lint-workers/l20-tablet-final.md.

Android clipboard evidence boundary: a tablet happy-roundtrip attempt stopped
BEFORE creating a fixture or modifying the clipboard because WebView denied
navigator.clipboard.read permission. Native Obsidian replaces readText/writeText
with Capacitor Clipboard read/write, but this does not establish a safe backup
of arbitrary native formats, so no alternate destructive clipboard test was
performed. Actual ADB Cut menu taps separately passed injected missing/false/
throw legacy-host cases: exact graph and history unchanged, no clipboard event,
one existing unavailable notice, correct owner-document receiver, restored
descriptor/callback/original board. Evidence clipboard-R52Y808PDJB-failures.json.
These certify the guarded failure behavior; successful Android system clipboard
roundtrip remains unverified, separate from the successful Windows roundtrip.

Final D-EXTENSIONS accepted on all three actual hosts; details in
lint-workers/l20-data-native.md. Each host passed whole-group and captured-end
movement at exact 50%/125%, two repeated commits, Undo/Redo and held cancel.
Native edge, independent line, unselected connector-to-connector chain and both
comment pins follow the same preview before release; unselected far ends stay
fixed. Every source/unknown/anchor/waypoint/comment field matches, no preview
save/history, one native history step, natural committed save and exact original
bytes/path/viewport/hashes restored. Final reports:
.out/l20-data/selection-native-{windows,tablet,phone}-chain-final.json.
Prepared masks are separately labeled, not claimed as a physical marquee.

Android guarded clipboard failures now pass on BOTH models, using actual ADB
Cut menu taps and injected missing/false/throw hosts, without clipboard access.
The phone's first callback check caught a tap during native menu animation
selecting Copy; waiting for four equal native menu rectangles fixed test setup.
It remains a failed attempt, not a passing Cut check. Final callbacks are exactly
Cut with owner-document receiver; graph/history/source/original bytes unchanged.
Windows native clipboard roundtrip also reran successfully after harness guards.
Supported Windows settings reran in light theme with the final creation contract,
strict witnesses/restoration PASS. Native popout guard and settings preference
restored; probe globals removed, one hidden/unfocused main window remains.

All 47 assigned jobs have final bounded acceptance or an explicit compatibility/
runtime disposition. Remaining broader manual scenarios are listed separately
in lint-execution-plan.md: successful Android system clipboard roundtrip,
physical stylus/palm/hover, OS pickers/compositor and full six-module popout UI.
These were not run and are not represented by synthetic evidence. Existing
source command ID warning remains visible; standalone MCP uses enforced Node
lint rather than applying plugin-only Node/stdout rules to its stdio server.

### Release 0.2.8 — CI-only typed lint fixture failure (2026-10-07)

Before editing: GitHub CI run 37538153078 passed browser smoke, types and
plugin/CSS lint, but two mcp/tests/lint-runtime.test.ts assertions failed.
The same 25-case test passes locally without CI and reproduces the exact two
failures on Windows with CI=true. This is independent of the Linux host.

Participation: the test calls ESLint.lintText repeatedly with different fixture
text under real mcp/src/server.ts, vault.ts and tools-edit.ts filenames. The
installed typescript-eslint inferSingleRun uses CI=true to choose its immutable
project program. The first tools-edit parse reads the disk source instead of the
injected redirect; later server parses fall back to an isolated program without
resolved Promise types. Normal lint:mcp lints actual disk files once and is not
affected. User actions, standalone server runtime and Android do not change.

Planned test-only repair: disable automatic single-run inference in the test's
ESLint parser options so every lintText call retains its supplied source and
project types. Keep every original assertion and the production lint config.
Mandatory checks: all 25 cases with CI=true and without CI; enforced lint:mcp;
GitHub full plugin and browser jobs; unchanged main.js/styles.css hashes and
clean diff. These checks are pending at this pre-edit record.

Post-edit local evidence: all 25 original cases pass with CI=true and with
ordinary local inference. npm run lint:mcp and npm run check pass. The fixture
repair does not touch plugin/MCP runtime sources or CSS. GitHub full rerun and
published-asset verification remain the release gate; no tag was created on
the failed CI commit. Earlier 2,036-test local acceptance remains historical;
CI failure and its distinct test-only correction are not erased.

### CLI and remaining source advisories — trace before implementation (2026-10-07)

User requests preserving the skill, MCP and the shared tested board operations,
adding a command-line frontend and explaining retained warnings in both READMEs.
The new frontend must use createServerTools / CanvasAuthoring / MetadataWriter,
including vault containment, source/unknown fields, locks/review, revision
checks, validation and write-once behavior. MCP protocol responses and callers
remain compatible. CLI list/call/batch use the same schema-checked operation
runner; batch retains only this process's undo and stops on first failure,
with completed writes retained rather than an implied transaction.

Console sites server.ts:56-58 run at MCP startup before Vault.open. They redirect
log/info/debug globally to stderr. No own board tool calls console; the two Ajv
constructors in json-rpc.ts and validate.ts are the logging dependency. Planned
repair: shared runner with Ajv logger:false, also board Ajv logger:false; remove
startup redirects and enforce no console in standalone sources. Preserve JSON
schema errors and structured ToolError responses, diagnostics on stderr, and
stdout containing only the protocol/CLI JSON.

Eight reported Node imports provide hashes/atomic file writes, containment,
workspace reads and stdio; retain genuine standalone Node dependencies rather
than hiding imports or importing Obsidian.Platform. DEFAULT_CONFIG_DIR is the
explicit compatibility default and active Vault.configDir remains configurable.
Legacy command ID m1-commands retains saved hotkeys; no ID or UI change planned.
Android plugin behavior is unaffected: no src/ or CSS edits, neither frontend
bundled/started by the plugin. Recheck plugin bundle graph and frozen hashes.

Mandatory checks pending: shared input schema and failed result/error parity;
real CLI processes list/read/validate/edit/lock/review/source+unknown fields,
stale revision/dry run, custom config/path protection, read-only and bad input,
batch previous-revision scope/stop/undo; existing MCP stdio tests and all unit
tests; standalone no-console lint, raw remaining advisories; types/build/schema/
submission and three smoke modes. Native check uses only a project-local scratch
board and hidden/background Windows Obsidian; never user's vault or foreground
OS input. Existing real Android coverage is not recast as a new CLI test.

Additional trace before changing stream types: json-rpc.ts imports Readable and
Writable only with import type. serveLines only supplies input to readline and
calls output.write; callers pass Node stdin/stdout or stream test instances.
No runtime stream import is emitted. NodeJS.ReadableStream / WritableStream
already express this required contract in the existing Node types. Remove the
unused runtime-module dependency notation while retaining readline's actual
Node API. Required checks: tsc, existing readline/JSON-RPC tests including
notifications and ordering, real MCP stdin/stdout process tests, and raw source
advisory counts. This affects neither the plugin nor Android runtime.

Raw Obsidian-context follow-up caught two no-undef warnings for the NodeJS type
namespace, despite successful Node lint/tsc. Before correcting: preserve the
same stream contract using ReadLineOptions['input'] from the already imported
node:readline module and a structural write(string) output, exactly the methods
serveLines calls. No new Node import site or globals suppression; repeat raw
lint, JSON-RPC/stdio tests and tsc. The failed raw scan remains evidence.


CLI final evidence (2026-10-07): 128 files / 2,111 unit tests PASS, one existing
optional skip. Includes 69 focused CLI cases using real bounded processes, existing MCP processes,
shared result/schema parity, no console output for unknown Ajv formats, input
limits at exactly 8 MiB and one extra byte through file/stdin, and both bundle
graphs excluding Obsidian/network and plugin graph excluding standalone sources.
Types, plugin and both standalone builds, Node lint 0/0, plugin lint 0 errors/1
legacy ID warning, CSS 0/0, pinned schema, submission, 3 smoke modes and 33 oracle
tests PASS. Raw recommended Obsidian rules over src+mcp report exactly 10
warnings/0 errors: 8 required Node import sites, explicit .obsidian default,
legacy command ID. The earlier NodeJS namespace scan failures remain recorded;
readline input type and structural writer corrected them without suppression.

Actual native evidence: .out/cli-native-acceptance.json uses the built CLI as a
real stdin process on a fresh project-local scratch board, then installed hidden
Windows Obsidian 1.14.4 displays its edited card and handles trusted background
CDP mouse selection. Source and unknown fields preserved; scratch removed and
original board path/bytes restored; test window stays hidden/unfocused. Installed
plugin manifest 0.2.7 is explicitly recorded, with the same main/CSS runtime
hashes as release 0.2.8; no version-install claim. Root main.js and styles.css
remain aff2ee3a34a3045a30075c5736091c5cde937e3e06d2c1d327659ae5705aa200 and
7c5ce8c141b048ae4382abb83f6c3a309a0bfef5c21290bc527184202a76208c.
No plugin source/CSS change affects Android, so no new physical Android gesture
claim is made. Interactive terminal TTY rejection remains unexercised; piped
stdin is checked in real processes. Batch stops on first failure with committed
prefix retained, and undo exists only in the current process; neither is native
persistent history. Both READMEs explain remaining warning reasons clearly.

### Board theme consistency — 2026-10-07, traced before edit

User reported Android checks passing with white controls around a dark board.
M1CanvasSession.applyTheme sets the board background, text and color-scheme;
styles.css resolves dock, toolbar, search, export, thread and default native
card surfaces from inherited Obsidian semantic variables. Those variables are
already resolved on body: changing the board background does not change them.
The design explicitly allows the board theme to differ from the application.
The existing card-fill check asserts explicit colored cards, and most runners
request application themes without asserting a complete board palette.

Affected actions: choose light/dark/system in the board menu, change the
application theme, open another board, select/edit a default card, open board
menus/search/export, reload or disable the plugin. Mandatory regression:
all application/board light-dark combinations, OS preference for system,
computed surface/text colors for board, default card, toolbar and dock,
selection/edit controls and open panels; explicit user colors stay unchanged;
application chrome/theme and original board bytes/settings restore exactly.
An intentionally white toolbar on a dark board must fail the new oracle.
Run in hidden Windows Obsidian 1.14.4 and physical MiroCanvasTest devices
SM-X736B / Obsidian 1.13.8 and SM-A336E / 1.12.7 (legacy-only).
Record ADB taps separately from CDP setup/computed-style observations.
All new checks remain pending until evidence is recorded below.

The first complete palette run additionally caught the export panel: openExport
appends it to the owning document body to escape the board clipping rectangle.
Keep that placement; propagate the resolved board scheme to this owned portal
on creation and later theme changes. Capture progress is also checked for its
owner/placement. Mandatory checks include export open/close and capture/Stop
under opposite schemes, avoiding any global body theme mutation.

Real SM-X736B editor follow-up exposed another boundary: a default card's
same-origin iframe remains white with rgb(34,34,34) text on a dark board.
applyEditorAppearance currently skips unstyled cards, while iframe CSS comes
from the application theme. Before changing: extend the existing reversible
editor stylesheet only for a board/app scheme mismatch; keep explicit card
text colors/typography dominant and leave matching custom themes native.
Mandatory checks: actual entry/exit of default-card editing for all theme
combinations on Windows/tablet/phone, frame background/text contrast, theme
switch while editing, explicit color overrides and removal of the owned
stylesheet on unload. Retain the failing tablet receipt separately.

Final theme evidence: check-theme.mjs passes eight app/board combinations in
Windows Obsidian SDK 1.14.4 (hidden/unfocused), SM-X736B / Android 16 / Obsidian
1.13.8 and SM-A336E / Android 14 / Obsidian 1.12.7 (legacy-only). ADB touch
selects themes/cards and enters/leaves editing; Windows uses trusted background
CDP mouse input. Computed styles are observed in the actual app documents.
System preference dark/light is CDP media emulation, not a physical OS-setting
change. Every combination checks board, toolbar, dock, default card, selected
card toolbar, editor iframe, board menu, search and body-hosted export panel.
The oracle deliberately paints a real toolbar white and must reject that state.
The OS keyboard may intentionally hide the tool/dock bars; their computed
colors still must pass, and visible card/menu/search/export roots are required.
The runner confirms the OS input method before sending Back, so a stale keyboard
layout marker does not navigate away from the fixture.

Live-editor scheme switching, explicit text/fill priority and active-frame
stylesheet removal on plugin disable also pass on all three hosts. Scheme
switches/explicit color setup use native session/writer calls over CDP, recorded
separately from ADB taps. Original board bytes/path, application config bytes,
plugin settings bytes and viewport restore; Windows remains hidden/unfocused.
No physical stylus pressure/hover/palm test is claimed. Receipts are under
.out/dependabot-maintenance/{windows/theme-complete.json,
android/theme-complete-tablet.json,android/theme-complete-phone.json}.
Frozen Windows-built main SHA256:
d53c9c86b9e493ea239f48d33ebecf6f9cfbd29298f23300d1681fbfa94120b4;
CRLF CSS: a0b7fcfa81f2f872296309cbb9e580777ef1340737c98f28455a69686330c163.
Earlier missing-control/keyboard fixture failures and the genuine white iframe
failure remain separate receipts. They are not recorded as passed theme checks.

### Independent export — 2026-10-07, before implementation

Owner requires export to leave their screen and working board available.
capturePages currently deselects native items, sets screenshotting classes,
moves x/y/zoom per tile, requests frames and renders the live wrapper with
html2canvas. runExport additionally hides the panel and page overlay until
completion. Restoration after success/Stop is insufficient: the live view
must never be changed by the export. Test automation must also avoid taking
the owner's display; no foreground/OS screenshot operations are authorized.

Plan: freeze an immutable document/style snapshot at export start, render it
in an independently owned background surface/task, produce PDF/PPTX from that
surface, and dispose only export-owned resources. No external process/install
from the plugin. Trace native runtime construction/lifecycle before choosing
an isolated renderer; preserve all known content and report unsupported
content explicitly rather than silently omit it.

Mandatory Windows/physical Android checks: user selection, camera and active
file stay unchanged throughout export, including before each tile; real input
can select/move/pan the working board while export runs; exported geometry uses
the start snapshot; success/Stop/save/render failures remove background
resources and never undo later user work. Keep progress/Stop available without
covering the board. No Page.bringToFront, OS screenshots or native-window
activation in export/test paths. These new gates are pending; release withheld.

Independent renderer trace found ConnectorLayer's marker IDs depend only on
the connector ID. A second view of the same board in one document can therefore
resolve its SVG url(#...) to the live board's marker. Before changing: assign
each layer a unique marker namespace, preserving connector records and cap
geometry. Mandatory check: two layers with the same connector ID/different
colors resolve distinct markers; redraw/move keeps its own reference. Include
same-board/background-export arrowheads in the native export regression.

The new abortable font/frame wait raised prefer-promise-reject-errors because
an underlying Promise can reject with an arbitrary value. Before fixing:
preserve Error instances and map non-Error rejection to the existing localized
export failure. Mandatory checks: font wait rejection/abort, raster cancellation
and lint returning to the sole retained legacy command-ID advisory.

Independent export evidence: real browser Workers produce both PDF and PPTX
in hidden Windows Obsidian 1.14.4 and physical SM-X736B / Android 16 / Obsidian
1.13.8. Initial receipts sampled the working view 67 and 337 times throughout
render/packing: active file, selection, x/y/zoom, screenshotting flag and classes
remain unchanged; original file bytes and worker/DOM cleanup pass. Android
checks use no ADB input, foreground activation, screenshots or test-board switch.
SM-A336E is no longer connected; its new export check is pending (legacy 1.12.7,
below the supported minimum). Its earlier theme checks remain separate evidence.

Hidden Windows concurrency passes real CDP card drag and middle-button pan
at 50% zoom during success, Stop, controlled save failure and board switch.
The independent copy retains initial node geometry; success/Stop/error never
restore the camera or undo later user changes. Board switch completes the job
using its original source path. Four cases sample 70/21/71/71 frames and leave
zero renderer surfaces/jobs. No screen capture or window activation. A generated
PDF is rendered as a local artifact for inspection: heading/bold text, a colored
rhombus and native arrow are present; this is not a capture of the user's screen.
Receipts: .out/dependabot-maintenance/{windows,android}/independent-export*.json
and .out/export-concurrency.json. Initial checker failure read native data after
its owned view was disposed; final checks retain the geometry sampled while
rendering instead of treating disposed model contents as the export snapshot.

Unit checks cover live-surface refusal, cancellation while fonts/raster wait,
non-Error font rejection, owned view lifecycle/factory failures, Stop availability,
plugin-wide job abort, same-board SVG marker separation, worker/direct PDF/PPTX
equivalence, transferred buffer offsets, limits, startup/error/timeout/abort cleanup
and build/watch injection. 130 files / 2,157 tests pass, one existing skip.
Types/plugin lint/CSS lint and all three synthetic smoke modes pass; the sole
legacy command-ID advisory remains. Final asset deployment/CI gates are tracked
in dependency-maintenance.md. Obsolete live-capture receipts are historical.

### Release 0.2.9 — bounded stdin portability correction, before edit

GitHub CI 37581276120 passes browser smoke/types/plugin/CSS lint and 2,110 unit
cases, but the 8 MiB piped stdin case fails with parent spawnSync EPIPE on Linux.
The same case passes on Windows. CLI inputJson currently uses synchronous
readSync(0) over the pipe. Node stdin is a stream; repeated synchronous descriptor
reads do not wait for future pipe chunks. Planned repair is asynchronous stream
iteration with the same byte bound and Buffer checks, keeping JSON/exit status,
argument parsing, vault operations, and unchanged input-file/--args behavior.
The CLI outer main awaits input before opening a vault or performing an edit.

Mandatory checks: exact-limit and one-byte-over input on Windows and Linux CI;
all CLI and MCP tests, typed Node lint, updated builds, unchanged plugin hashes,
full CI before creating the tag and exact published file verification. This is
standalone-only; no src/ or CSS/Android runtime changes. Failure is retained as
separate CI evidence rather than treated as a passed portability check.

Windows follow-up: async stdin passes all 69 existing CLI cases and 10 MCP stdio
process tests; added delayed chunks / split UTF-8 filename regression passes.
Types and enforced Node lint pass. Full Linux CI remains required before tag;
no plugin runtime source/CSS changes. The fix awaits chunks while bounding total
bytes, rather than ignoring EPIPE in the test or weakening input-limit checks.

### Development-only dependency follow-up after 0.2.10

The pre-update trace and engine gates for proposals #12/#13/#14 are recorded
in dependency-maintenance.md. No source lint fix or rule suppression is added:
ESLint 10.12.0 runs the existing plugin/Node configurations, Node declarations
stay on 22.20.5, and html2canvas-pro remains the reviewed 2.5.0 because 2.5.1/2.5.2
require Node 24. Development requires Node 22.13+ on the 22 line; optional tool
downloads retain Node 20+. The transitive development ESLint 9 deprecation is
visible and is not hidden by a peer override.

Mandatory checks passed: clean install without engine warnings, npm audit zero,
type check, unchanged lint scopes (one retained legacy-ID advisory; Node/CSS
zero), 2,157 unit cases plus the existing skip, all three synthetic smoke modes,
schema and submission packaging. Three plugin assets match published 0.2.10
after JSON/CSS line-ending normalization. Rebuilt standalone tools change only
unused package metadata; all code outside that literal matches, their version
and initialization remain unchanged. No Android behavior change is introduced;
existing real Windows/tablet evidence above applies. The disconnected legacy
phone's independent-export check remains pending. Fresh Linux CI is required
before merging the development-only follow-up; no new plugin tag is planned.
# Canvas feature expansion: new lint findings (2026-10-07)

Before remediation the scan found new typing/DOM/deletion advisories in
board-encapsulation, canvas-authoring, m1-session, main, native-history-fence and
settings-tab; board-link-lifecycle has its own integration trace. These paths
participate in transferring cards/comments/lines, locked dependent validation,
one-step undo/redo and failed-save compensation, scoped decoration and selected
line highlighting, deleting only an unchanged new test/transfer target, and
saving relation property settings. Fix typing without changing these actions;
use FileManager.trashFile for conditional target cleanup and declarative setting
callbacks. The m1-commands hotkey compatibility warning remains intentional.

Mandatory checks: focused transfer/authoring/fence/source/search/settings tests,
full unit suite, lint/build/CSS gates, stale/deleted/edited target retention,
native save failure then redo, theme/unload restoration, real Windows and Android
touch palette/group/line/search/transfer actions at non-default zoom. Unit and
synthetic results alone do not close real-app checks; those remain pending.
## Property-result placement and Android keyboard — 2026-10-08

Trace before UI repair: CanvasPropertyResults.section appends its owned section
after Obsidian's flex-filling native result root. On SM-X736B / Obsidian 1.13.8,
actual ADB input focuses native search at y152; its result is y950 while the
keyboard occupies y803..1204 (--keyboard-height 400.94116px). The second tap
never reaches Obsidian. This is a layout defect, not a navigation pass.
Place the owned section before the native result root and give only that section
a bounded scroll area; preserve native query controls, rows, pane descriptors
and all native styles. Required checks: DOM order and native-root identity,
typed property query/result navigation with the keyboard still open on tablet,
outgoing link navigation, desktop native results remaining accessible, CSS gate,
focused sidecar tests and full types. Phone acceptance remains pending while
the device is disconnected; no synthetic result substitutes for ADB input.

Follow-up acceptance — 2026-10-08: the reconnected SM-A336E / Android 14 /
Obsidian 1.12.7 passes the latest build's property-result keyboard placement
(result y190.6, keyboard top526.6), genuine board/outgoing-note navigation,
nine feature phases, eight measured theme combinations and independent PDF/PPTX
content readiness. Real ADB taps/gestures, CDP text/preparation and renderer
Escape are recorded separately in the [phone receipt](smartphone-enhancement-checks.md).
Native ADB Escape navigates to the prior board on this legacy app and is not
a same-board cancellation pass. Original source/appearance/settings bytes are
restored. This closes the disconnected-device follow-up for that installation;
supported-version phone checks and the broader matrix remain pending.

## Card appearance, vector export and snippet isolation — 2026-10-09

Before implementation, card-appearance-checks.md traced native/imported card
faces, settings/session rebuilds and independent export. The vector and snippet
documents traced their owned rendering/native CSS boundaries and lint fixes
before editing. Final representative Windows 1.14.4 and physical SM-X736B /
Android16 / Obsidian1.13.8 checks pass. Native SDK controls, ADB taps, CDP text
and frame/DOM preparation are explicitly distinguished. Exact scope, file saves,
source/worker cleanup and pending broader scenarios are recorded in the
[appearance receipt](card-appearance-checks.md). No new source/CSS warning remains.

## Shape corner radius and initial proportions — 2026-10-10

Trace before edits: on SM-X736B/Android16/Obsidian1.13.8 in MiroCanvasTest,
round_rectangle nodes cd83b7ccc2c5b4c2 (250x60) and a443eab2bdbc202d
(210x200) use shapePath's fixed normalized12 corners, stretching the horizontal
and vertical radii differently. CardAppearance intentionally excludes shapes,
so cardCornerRadius0 does not control these outlines. finishToolGesture gives
every shape200x200 for a click/bar drop; the catalogue already declares wide,
tall or square. Drawn rectangles keep the user's drag dimensions.

Required checks: catalogue default proportions and aliases; tap/bar-drop vs
free drag/Shift constraints; actual tablet ADB creation; per-shape radius0 and
nonzero, circular physical corners on wide/tall nodes, explicit size clamping;
one native history transaction, persistence/reopen/Undo, locks/review and
unknown-field/miroSource preservation. Shape paths, text insets, edge/connector
landing and preview resize/rotation must use the same current dimensions and
normalized outline before release, after commit/cancel and at non-default zoom.
Independent SVG/PDF/PPTX must reuse that geometry without source/camera mutation.
Change the upstream checked schema before adding a stored cornerRadius.
Record real Android input separately from CDP setup; leave unverified cases
pending. The current request concerns shape outlines, not card CSS radius.

Final parent integration/real-device results: [shape radius acceptance](shape-radius-acceptance.md). Earlier worker snapshots are historical; pending native cases remain explicit.

## Selection More menu layout — 2026-10-10 (trace before edits)

User screenshot and real SM-X736B/Android16/Obsidian1.13.8 DOM show
SelectionToolbar.build's More panel: four layer buttons in a seven-column
picture grid, an empty open-link row, an unlabelled Board actions button,
and adopted native canvas-menu trash/zoom/edit buttons. adoptNativeMenu moves
actual host elements; watchNativeMenuState marks duplicated palette/direction
buttons and keeps an inert panning snapshot. Fixed icon widths and separate
native flex layout scatter actions and suppress visible captions.

Required checks: localized visible captions for plugin and native actions;
consistent icon alignment and full-width touch targets, no empty link gap;
native handlers/disabled/hidden states preserved, delete last in DOM and visual
order; observer cleanup returns native controls and removes owned captions;
selection changes/card/edge/independent-only/locked/review, Escape/outside click;
layer command closes with one history/Undo; native zoom/edit/delete still work;
menu fits viewport and scrolls at large text/short height; theme tokens on dark
and light, tablet padding. Real tablet ADB and Windows renderer input must be
recorded separately from synthetic/unit proof. No export/screenshot concurrency.
Full results belong in selection-menu-checks.md; unverified scenarios stay pending.

Final menu results: [selection menu checks](selection-menu-checks.md). Native Android ADB and Windows renderer input are distinguished; remaining native matrix is explicit.

Keyboard follow-up before edit: real tablet final capture has IME400.94116px and More clipped above the board after native Edit. keepPanelInView forces every keyboard popover above the toolbar; long action lists need the side with more available board room. Change only marked More, preserve formatting pickers, cap/scroll within bounds and restore inline placement when IME closes. Mandatory: native ADB Edit→More with keyboard, both side choices and reset unit checks.

Keyboard follow-up passed: two side/reset unit cases and real SM-X736B ADB Edit→More with IME400.94116px; original file bytes remain exact. See selection-menu-checks.md.

## Host theme and board-menu wrapping — 2026-10-10 (trace before edits)

Real SM-X736B/Android16/Obsidian1.13.8 in MiroCanvasTest: body is theme-light,
vault config theme=moonstone, board displayTheme=system, resolved Canvas=dark.
M1CanvasSession.applyTheme and attachSystemThemeListener read only WebView
prefers-color-scheme; Android OS preference can differ from Obsidian's chosen
appearance. System boards must follow the current owning Obsidian document's
body theme, with OS media only as a fallback. Observe host class changes without
watching cards or writing metadata; explicit light/dark boards stay explicit.

M1Controls.item's icon/label/switch row has width100% without explicit box sizing,
and flex label lacks min-width0 or wrapping; inherited button white-space and
Russian nameOnSelection text can push the label/switch past the board menu.
Keep original strings/actions and tablet padding variable convention.

Mandatory checks: light Obsidian + dark Android preference resolves light;
reverse mismatch; real theme change while board remains open, system/explicit
choice, reopen and independent export snapshot theme. Watcher teardown and
missing media/body API fallback. Measure every board-menu row/label/switch
inside panel for RU/EN, disabled/enabled selected attachment, narrow width and
long labels; use real ADB taps on physical tablet and distinguish Windows CDP
renderer input. Preserve board/file bytes during host-theme changes, restore
test settings, leave unverified phone/popout/OS text scenarios pending.

Attachment toggle follow-up before edit: actual ADB toggle sets localOverrides.f.showAttachmentName=true, but a second click stays true. selectedAttachmentVisibility passes a private native class instance to pure shouldShowAttachmentName, whose plain-object guard rejects it; the checkbox remains false. refreshDecorations already uses attachmentNode to build checked JSON id/type/file. Reuse that projection for checkbox state. Required: native runtime class with global/local visibility overrides, ADB on/off, non-file/absent selection fail closed, unknown-field/source preservation and native Undo.

Final host appearance, menu wrapping and attachment toggle evidence: [checks](host-theme-menu-checks.md). ADB input, native API preparation, Windows renderer input and inherited SVG theme proof are distinguished; remaining matrix is explicit.


## Discoverable shape-radius dragging — 2026-10-10 (trace before edits)

ShapeRadiusHandle owns the sole selected-figure corner control. Its existing
44px target uses pointer capture plus document listeners and inverse shape SVG
CTM to preview a circular radius in board units; M1CanvasSession owns transient
radiusPreview and the single native-history commit. The current 12px circular
marker resembles native connection points. Tap opens exact numeric input, but
touch users cannot see a drag instruction or the current value while holding.
Replace only the marker with a rounded-corner SVG and directional affordance;
show a non-interactive live value beside the held control. Preserve projection,
threshold, preview transaction, input, setting, metadata, and export exclusion.

Mandatory checks: actual ADB finger and ADB stylus-source held movement on
SM-X736B in MiroCanvasTest, live value and path change before release, file and
history unchanged while held, one commit, Undo, cancellation, exact numeric
input, selected-only/global toggle. Verify touch/pen pointer ownership and
rotated/non-default zoom in focused tests; distinguish actual physical pen
handling from ADB stylus-source input. Measure 44px target, icon contrast in
both themes, and badge above the finger; no extra selection border or input
keyboard during dragging. Preserve fixed connector anchors/chains and source
unknown fields. Native Windows renderer input is separate from physical mouse.
Export jobs must be zero before screenshots; control remains excluded from
export. Record unverified device scenarios explicitly.

Final marker/live dragging evidence: [radius feedback checks](radius-feedback-checks.md). Actual ADB touch/pen-source and hidden native Windows renderer input are separated; physical S Pen and disconnected phone remain pending.


## Fixed radius marker and visible connection circles — 2026-10-10 (before edits)

ShapeRadiusHandle.render positions the whole 44px control at radius/width and
radius/height percentages, so it slides diagonally during a gesture. Keep it
at the existing safe corner spacing instead; animate the rounded corner's
geometry from the clamped radius itself and retain the live number. No delayed
geometry transitions during pointer movement. Press/release feedback may use
a small interruptible transform transition, disabled by reduced-motion.

Actual SM-X736B/Obsidian1.13.8 DOM shows the visible side circles are plugin
buttons .miro-canvas-handle--connect, not native connection points (the native
interaction layer is hidden for this selection). Their computed background is
rgb246/246/246 despite .miro-canvas-handle's accent fill: Obsidian's tablet button
selector outweighs the broad plugin rule. SelectionHandles supplies one per
side at contourPoint positions; tap quick-creates, drag begins a connector.
Set scoped explicit accent borders and theme background, plus filled hover/
focus states, without changing bounds/centres/hit routing or native fallback.

Mandatory: fixed marker bounding box throughout finger/pen movement and after
commit/Undo/cancel, live icon path and number follow the same radius, zero and
maximum radius, rotation/non-default zoom, numeric input, selection/global
toggle. Physical tablet ADB preview/commit/Undo/CANCEL and pen-source handling
are separate from physical S Pen. Inspect all four visible connection circles
in both themes, tablet-rule specificity, idle/hover/focus, drag-create native
edge before/after release and Undo, tap quick-create and Undo, cancel without
persistence. Preserve attached native/independent/chained lines, history and
unknown fields. Windows input stays in hidden native test Obsidian; synthetic
host and native receipts are distinct. No screenshots during export.

Final fixed marker, circle visibility and native action results: [checks](radius-marker-motion-checks.md). Native tablet ADB, native Windows renderer input, synthetic states and remaining physical-pen/phone scenarios are distinguished.


## Bidirectional radius arrow — 2026-10-10 (before edit)

The radius marker's decorative direction path currently points only inward,
although inverse-CTM pointer movement supports increasing and decreasing the
radius. Add the opposite arrowhead in the same SVG path, preserving the24px
viewBox, button/target and corner indicator. Required: icon remains distinct
from ports, both heads visible in native tablet/Windows light/dark, pointer
handling/input/preview tests unchanged. The user is considering the preferred
animated feedback; the arrow change does not choose a new animation variant.


Combined motion refinement before edit: the user selected both changing the
corner and a directional tilt. Keep synchronous corner geometry, and derive
an increase/decrease/steady state from changes in the live clamped radius.
Rotate only the decorative SVG by ±8° while held, returning to neutral on
release/cancel. Keep reduced-motion stronger than the directional styles and
never move/rotate the44px hit target. Required: reversal follows new direction,
clamped limits do not invent commits, cancel/selection/input reset, button
bounds fixed, actual Android held tilt/reset and bidirectional arrow, native
Windows pointer check, reduced-motion and interruption synthetic proof.

Combined feedback passed: native tablet ADB reversal and ±tilt matrices, fixed target, native Windows direction/transaction and 3301 tests. Hidden Windows does not prove visible CSS animation timing; this is recorded in the [follow-up](radius-marker-motion-checks.md#combined-cornertilt-refinement).


## Export-panel composition — 2026-10-10 (trace before implementation edits)

ExportPanel in board-export.ts builds header, paper/orientation, full placement
paragraph, page list/add actions, quality and three output buttons;
M1CanvasSession.openExport mounts it on owner document.body and keeps overlay
pages on native board. Export progress replaces panel DOM; Stop/Close abort
owned work, page show stays available. runExport/independent rendering/save
boundaries stay outside this design change. No settings/format change.

Actual tablet SM-X736B/Obsidian1.13.8: panel300×714 CSSpx at top16; default
mobile button pills and a large paragraph overwhelm page controls, format
buttons stack, tiny24px page actions. Body safe-area-inset-top30.117647px means
its top currently reaches the OS status area. Layout-only detector is clean;
rendered hierarchy and tablet specificity still require changes.

Refine the existing Obsidian visual world: fixed header/close and output footer,
one scrolling body; pages/order/help grouped, paper and quality together.
Keep full visible placement help and existing direct PDF/PowerPoint/SVG actions
with shorter localized format captions. Native-style SVG action icons replace
Unicode symbols; scoped controls beat tablet pills and preserve padding vars.
The panel bounds account for safe areas and actual --keyboard-height.

Mandatory: physical tablet ADB open/add/show/reorder/remove/orientation/quality/
close; native Windows renderer input with hidden window. Board/slides, empty/
one/many/long-name pages, English/Russian, light/dark, narrow and large text.
Keyboard height must leave Close/Stop/output within available bounds; all touch
targets at least44px and no overlaps. Busy/unavailable/empty disabled states,
Stop and Close, disposal/listener cleanup; three outputs still call original
kind; real independent save/Stop proof without screenshots or foreground
during export. Preserve source bytes/camera/selection except explicit page-show
input and guarded page changes; one history boundary/Undo. Renderer/parser/
worker source remains unchanged. Distinguish synthetic from native evidence.


Export smoke follow-up before test edit: the tablet-padding gate toggles
mobile/tablet classes together with the host rule, so intentional34px desktop
versus44px mobile targets are reported as a padding failure. Hold the device
classes constant and toggle only the reconstructed host tablet rule. Continue
comparing padding/width/height for every button and retain the coverage guards;
do not exempt export controls or suppress geometry checks.


## Restore moving radius marker — 2026-10-10 (before edit)

The user requests the earlier radius animation with the bidirectional arrow
retained. ShapeRadiusHandle.render currently pins the target, morphs the SVG
corner and exposes direction state for CSS tilt. Restore the radius-relative
clamped left/top positions from 07dd8c5; keep inverse-CTM pointer capture, the
44px screen target, live badge, numeric input and both arrowheads. Remove only
the experimental corner morph/direction/tilt styles and their obsolete checks.
Connection-circle outlines and export-panel styling remain in scope unchanged.

Required: moving target follows the same live radius before release and after
commit/cancel/Undo, both-direction reversal at rotation/non-default zoom, no
persistence before release, one history boundary, native/independent/chained
line invariants, exact input/toggle. Physical tablet ADB touch and stylus-source
input are separate from physical S Pen; Windows uses hidden native renderer
input. Preserve source bytes/settings and retain two arrowheads. No export
screenshots or foreground takeover. Record current native results separately
from the superseded fixed-target receipts.


Export composition completed: native Windows and tablet action/save/Stop checks,
plus the user's physical tablet keyboard and native bounds measurement, are
recorded in [panel checks](export-panel-design-checks.md). The failed automated
IME-open attempt is preserved separately; no synthetic keyboard pass replaces it.
Moving radius restored: current native receipts and superseded animation checks
are distinguished in [motion checks](radius-marker-motion-checks.md).


## Vector PDF/PPTX and viewing tools — 2026-10-10 (before implementation)

runExport currently uses independent renderVectorExportPages for SVG, and JPEG
renderExportPages plus Worker packing for PDF/PPTX. Add transient export-panel
rendering mode (raster default; SVG always vector), retain native page metadata
without schema changes, and capture each vector page independently. PDF must
contain real vector paths/text with Cyrillic-capable offline fonts; PPTX must
contain SVG parts with real relationships and raster compatibility fallback.
No runtime downloads/install/OS print or window activation. Unsupported vector
content stays explicitly refused; Stop/save/snapshot/cleanup guards remain.
Required: multi-page geometry, Latin/Cyrillic text, arrows/radii/clips/images,
actual parsed PDF and PPTX SVG content, page ordering/quality/mode callbacks,
Stop/failure/unload/switch and source/camera/selection preservation. Native
Windows hidden input plus connected physical Android in MiroCanvasTest.

SelectionToolbar.update currently draws disabled editing controls in review,
and M1 owns adopted native menus, QuickTools, docks and context actions. Keep
view/link/copy/navigation actions; hide styling/layer/lock/delete/creation rows,
close stale editing popovers and restore native ownership on exit/disposal.
Presentation is already SlideShow with native camera navigation. Add a bounded,
non-persistent laser overlay available in review and slideshow; temporary
trails never touch native drawing/history/data and are excluded from exports.
Required: node/edge/mixed/independent/attachment/comment review selections,
normal/locked menu regression, native menu regeneration, mode exit restoration;
mouse/touch/pen pointer ownership, controls/scroll/link/pan unaffected when
laser off, trail expiry/cancel/blur/unload/board-switch, zoom/rotation and
slide next/previous/Escape. Distinguish ADB/CDP from physical stylus handling.


Review smoke adjustment before edit: the interaction suite intentionally clicked
an aria-disabled native creation button in review. Creation buttons now must be
hidden, so replace that click with a visibility assertion plus a forced DOM
click proving the handler still refuses arming. Normal creation/drag assertions
and review exit restoration remain. Native ADB/CDP gestures supply real input.


Vector document/viewing implementation and native acceptance:
[checks](vector-viewing-acceptance.md). Windows and physical tablet actually
save vector PDF/PPTX plus standalone SVG and raster PDF; independent artifact
parsing confirms Cyrillic, paths and SVG slide parts. Viewing/laser/slideshow
pass real native inputs; ADB stylus-source is separated from physical S Pen.
Review-toggle saves are settled before the no-write baseline. Current phone,
physical S Pen and opening the package in PowerPoint remain unverified.


## Viewing touch pan from a card (2026-10-10, before implementation)

Trace: M1.attachGuards treats every node/selection pointerdown and held
pointermove as a move edit, prevents the press and selects the node for unlock.
In review this also prevents native Canvas.onTouchdown from receiving the
press. Native 1.14.4 onTouchdown already pans/pinches from cards and cancels its
600 ms long-press timer after a 5 px move; native node mouse dragging checks
readonly. Element move/resize/text methods retain separate instance guards.
M1.startSelectionMove also prevents a mixed/collapsed selection press before
checking its policy, so it must decline viewing gestures without claiming them.

Reproduced in hidden real Windows Obsidian 1.14.4: trusted CDP touch drag
starting on a selected card in review leaves camera at (300,90,0). Prior board
was restored. This is actual Obsidian with synthesized touch, not Android input.

Mandatory checks before closing: selected/unselected/locked cards, native mixed
selection and collapsed group; blank-start pan across cards; review on/off,
native readonly and slideshow; ordinary selected-card drag remains editable;
non-default zoom, second-finger pinch, cancel, middle/right/Space pan, tap/link/
copy and laser ownership. No node/edge/source/unknown-field/history changes
while viewing. Run focused safety/admission tests and actual hidden Windows
plus SM-X736B MiroCanvasTest ADB touch gestures. Physical finger/S Pen and phone
remain unverified unless separately observed. Evidence and any pending checks
will be recorded in docs/review-pan-checks.md.

Native Windows regression also found the same move guard blocking right-button
panning after correctly admitting its pointerdown. Native onPriorityPointerdown
uses right and middle mouse buttons for pan; the plugin move guard exempted
only middle. Before changing it, require mouse-right move admission without
exempting a stylus side button or a primary node edit.

The full collapsed-group suite exposed a test-native drag handler that adds an
empty history step after its node writes are refused. Native 1.14.4
handleSelectionDrag returns undefined when readonly; retain that contract at
the instance hook before creating any collapsed or native drag lifecycle.
Require undefined/no native initialization in viewing and retain existing
locked-group inert lifecycle tests outside viewing.

Final scope, actual input receipts and pending checks: [viewing pan checks](review-pan-checks.md).
