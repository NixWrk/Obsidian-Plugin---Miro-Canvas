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
