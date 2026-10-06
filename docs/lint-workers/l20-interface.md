# L20 INTERFACE: before-edit records and proof

Shared PRIMARY checkout J:/NIX/WRK/Code/Obsidian-Plugin---Miro-Canvas,
baseline 2f3687c861cb4c33afc5fcd3ac0a562662214a26. Linked by
L20-INTERFACE-CSS in the parent-owned central register. Own styles.css,
comment-markers.ts and the expressly delegated remaining UI modules/tests.
No shared register/plans/locales/budgets/builds or other workers' files are
written. Existing node_modules reused. Artifacts exclusively under
tools/obsidian_cdp/.out/l20-interface. Previous 83-site
[dependency audit](interface-dependencies.md) supplies the whole-board trace;
each actual implementation slice gets an additional before-edit section here.

## Slice I1: import guide reflected return (before implementation)

Exact site: src/import-guide.ts:55, vaultFolderPath, Reflect.apply(getBasePath,
adapter, []). The discovered method already passes typeof-function, invocation
is guarded by try/catch and only a nonblank primitive string is returned.
main.openImportGuide supplies app.vault.adapter and name to buildImportGuide;
the result appears in the guide path and copied agent prompt. Explicitly type
the reflected result unknown; keep reads, receiver, arguments, string/trim check,
fallback and catch unchanged. No helper/DOM work in this slice.

Mandatory: exact esbuild.transform baseline/current module JavaScript identity;
focused import-guide tests for successful/blank/nonstring/throwing getBasePath,
receiver forwarding, detached RU/EN guide and copy/link callbacks. Module-scoped
ESLint before/current without suppressions. Parent: actual owner-window modal,
real clipboard/link/picker and both Android models remain pending, not inferred
from fake DOM or module identity.

## Slice I2: comments unknown text (before implementation)

Exact site: src/comments-panel.ts:69, private make(document, tag, text?: unknown).
renderMessageHeader/renderThread/replies/state/diagnostics pass rendered text to
this factory. M2 comments modal constructs CommentsPanel; callbacks delegate all
mutations to the host. Existing String(object) can invoke arbitrary toString and
display [object Object] for malformed supplied presentation data. Add an actual
primitive guard before conversion: string, null, number, boolean, bigint and
symbol retain native String behavior; undefined still leaves text untouched;
objects/functions render empty without invoking conversion hooks. This does not
change persisted documents, validation, locks, callbacks or valid UI strings.

Mandatory: focused comments-panel regressions for ordinary markup as text,
primitive values, missing text and object conversion traps; existing add/edit/
reply/resolve/filter, imported/locked states and input retention. Scoped ESLint
delta; no equivalence claim for this intentionally bounded runtime guard.
Parent: comments open/reopen/reply/resolve/keyboard, Windows hidden renderer and
both physical Androids remain pending.

## Pending shared contract / CSS evidence

DOM migrations await the parent's reviewed owner-document factory. No new local
factory contract will be invented. CSS priorities that meet actual native inline
styles require a concrete reversible owner change from parent/Parfit. Continue
independent states/dimensions/rules; never remove a priority on synthetic evidence
that omits its inline competitor. Computed-style probes must compare baseline and
current in the same prepared synthetic host, with native/mobile rules represented.
No priorities moved into JS and no per-card/per-frame observers.

## Slice I3: reviewed DOM factories (before implementation)

Parent contract is explicitly ready: src/dom-elements.ts createHtmlElement and
createSvgElement use document.defaultView.createEl/createSvg in the actual owner
realm, detached, or bind native PlainElementDocument methods for fake/browser
documents without SDK extensions. Parent owns helper/tests. No runtime Obsidian
import. Adopt at existing creation sites only; no attributes/events reordered.

Exact owned HTML sites: board-search-bar.make:195; comment-markers constructor,
update and createPin:157/189/350/352; comment-thread.make:423;
comments-panel.make:67; connector-labels constructor/add:73/205/208;
import-guide.make:103; m1-controls.makeElement:216; pen-tooltips.show:194/201;
quick-tools.make:1065; selection-handles.make:310; selection-toolbar.make:336.
Known namespace SVG warning sites: quick-tools linePicture:313/317 and
shapePicture:331/335/338. Preserve capability probes and optional SVG returns;
dynamic unknown namespace/tag calls stay native. Baseline locations are from
the worker snapshot, before I1/I2 shifts. All existing callers/classes/styles
are traced in the previous interface audit and the central factory contract.

User actions/checks by component: search typing/debounce/Enter/Escape/focus;
pins local/imported/locked tap/drag/cancel/zoom; thread help/reply/resolve/outside
close; comments scope/edit/reply and input retention; connector label draft/
commit/cancel/fonts; guide RU/EN detached steps/copy/link; dock map/menus/theme/
undo/redo; pen hover/hold/dispose; tools arming/repeat-fold/More/drag-to-create;
handles resize/rotation/captured connector ends and one native outline;
toolbar popovers/clamp/selection state. Run each owned focused suite plus parent
factory tests when available; real Windows/popout/Android evidence stays parent.
This is runtime compatibility adaptation, not type-only identity.

## Slice I4: portable UI context fallbacks (before implementation)

board-search-bar constructor:55 currently falls back from injected defaultView
to globalThis timers. scheduleQuery/cancelPendingQuery/flushPendingQuery/close/
dispose need one captured set/clear owner, including Node fake DOM. Use the
existing complete owner-window pair; otherwise guarded window or a captured
lexical Node timer pair. Type pendingQuery for either numeric or Node handles.
No ambient document is consulted. Tests: owning receiver, debounce/flush/close/
dispose; missing/partial owner fallback under Node with fake timers.

quick-tools constructor:424 currently reads globalThis.document only when no
document option is supplied. A private guarded defaultDocument reads the
ordinary document binding outside the constructor's local variable scope;
without a document fail explicitly before creating UI. Injected fake documents
and owner-realm helper behavior remain unchanged. Tests: all tool/drag/menu
regressions and document-less Node failure, no ambient-window dependency when
the injected document exists. Parent owner-window/unload/Android checks pending.

I4 scoped lint found one contextually unnecessary TimerHost assertion on the
guarded window branch. Remove only that assertion; the concrete TimerHost
receiver accepts Window per the current SDK. The original annotated import-guide
proof uses the untouched snapshot, before later DOM factory adaptation.

## Slice C1/C8-size: owned states and dimensions (before implementation)

Exact CSS sites (baseline): dock [hidden] display:80, M2 primary background:666,
pin min-width/min-height:3187/3188. Dock states are written by M1Controls menu/
toggleMenu/closeMenus/update; the hidden rule must sit after component display.
M2 primary actions have the same class on shape/anchor/connector save buttons;
generic button + enabled hover are more specific than a bare primary class.
Use an explicit component/button primary selector and preserve hover accent.
Pin minima already have matching 32px inline values from CommentMarkers.update;
CSS width/height/variable padding stay. No pin transform change in this slice.

Mandatory before/current computed display/background/minima/rect comparison in
prepared Chromium DOM with actual cached Obsidian 1.14.4 CSS, theme/mobile/tablet
classes, normal/hidden descendants/hover/disabled and inline pin minima. Run
owned controls/comment suites; parent's real app/Android/input/keyboard checks
pending. Independent-only menu is a separate native-owner state and not included.

## Slice C3/C2-resizers/C6: native selector cascade (before implementation)

Exact sites: tool cursors:1595/1606/1617; interaction-layer resizer display:2081;
selected link preview/document blocker display:2803. M1.updateQuickTools writes
data-miro-canvas-tool, moveBrush/hideBrush supply brush; selected lasso descendent
move cursor must outrank tool crosshair. Native cached CSS has selected/editing
cursor rules. Resizers are native interaction layer children; native mobile
corner rules (.is-mobile .canvas-wrapper:not(.mod-readonly) ... [data-resize])
have six class/attribute specificity components. Add a scoped mobile selector
with the existing miro root class, retaining the basic rule for other hosts.
SourceRenderer writes preview/document host marks; native is-focused state hides
the link blocker via a stylesheet selector, not a proven inline writer here.
Add board-root scope before removing its priority.

Mandatory computed cursors on board/node/content/pre/link/selected edge and
connector, all armed tools and native editing states; mobile all four corners,
readonly/reselect, single native outline; focused link blocker real hit target
without iframe gesture ownership. Explicit inline cursor/blocker competitors
are negative probes and require actual owner evidence, not an assumption that
specificity wins inline. Native controls:54 remains separately unresolved due
documented optional-plugin inline display. Parent tests real mouse/Android and
attached paths before resize release/commit/cancel/history.

First computed comparison exposed real equal-specificity in-plugin competitors:
dock button display later in the sheet, and selected-card grab cursor after the
tool rules. Before correction: move dock hidden ownership into the existing last
owned-hidden rule; retain real canvas-wrapper qualification and put the tool
cursor family after all component cursor rules. No duplicate-name/specificity
trick or change to tool state/events; focused/root/selected cases remain compared.

Remaining pen mismatch traces to actual native selector
.canvas-wrapper:not(.mod-readonly) .canvas-node:not(.is-editing)
.canvas-node-container (five classes). Add a specific drawing-tool/container
branch alongside the existing descendant branch; its actual node/container
relationship reaches equal specificity and comes later. Do not weaken native
Select/editing cursors or merely duplicate a class to increase specificity.

## Slice C4 shadow/outline, C5 preview padding/pre, C9 composition (before implementation)

C4 exact baseline sites: box-shadow at 1298/1346/2458/2470/2495/2577/2636/
2787/2942/2953/3035/3145/3662 and line outline:1347 (14). Actual native cached
CSS selects/themes/drags the native face with stylesheet shadows. M1 local
appearance writes fill/border colors, but not these shadow/outline properties;
SourceRenderer BOX_CSS excludes shadows and its existing shape patch restores
inline none. Preserve those values; qualify actual source marks and root wrapper
to outrank the strongest native face selector. Background/border declarations
remain priorities where local appearance can write competing inline values.

C5 exact sites: sticky preview padding:2516; table preview padding:2581; code
preview padding:2667; code pre margin/padding/color/font-family/white-space/
background/border/border-radius:2685/2686/2688/2689/2690/2691/2692/2693;
numbered pre padding-left:2703 (12). SourceRenderer.applyNode writes rendered/
kind/fit/numbered/gutter marks; native Markdown preview CSS sets the padding and
pre chrome. Prefix using the actual miro root/canvas-wrapper and rendered/kind
marks already present, never invented runtime state. Native sizer inline
min-height/padding/flex/height and stored sticky inline fonts are NOT in this
slice; their 14 priorities remain until the state writer is reconciled.

C9 exact sites: descendant backface-visibility/will-change:3649/3650 and preview
transform:3654 (3). Actual cached native .is-focused Markdown preview rule writes
translateZ(0) by stylesheet at depth content/markdown-embed/preview. Qualify with
root wrapper + renderer's rotated/rendered marks; preserve shell transform/rotate
and its live keepRotation/restore ownership. No new observer or JS style write.

Mandatory: prepared actual-native-CSS before/current property comparison on all
83 sites, themes, mobile/tablet, focus/selection and capture states. Retain explicit
native sizer and sticky text inline styles in the host so exclusions are proved,
not accidentally hidden. Check paragraph/code/gutter layout and source contour
paint at non-default zoom; verify native face colors with inline local fills
separately. Parent must check real M1 appearance restore order, late Markdown,
source/unknowns, active drag/rotation attached paths, export and unload/reload.

Computed probe caught selected-group border precedence changing when an entire
mixed declaration block was strengthened. Correct before continuing: leave all
unrelated/remaining declarations on their ORIGINAL selectors; create narrow
qualified rules only for the removed shadow/outline/padding/pre/composition
properties. Selected group dashed accent border must retain its original weight.

## Slice C8-transform: one actual owner (before implementation)

Exact styles.css:3198 and CommentMarkers.update original button Object.assign
transform:translate(-50%,-50%) at creation. CSS translate(0,-100%) already wins
and places the bubble tail at its projected point. Remove the redundant,
conflicting inline transform from this owned JS writer and keep transform in CSS
without priority. Drag uses left/top and the captured marker point; it never
reads transform. No priority moved into JS. Mandatory pin 32x32/bottom-left tail,
mouse/Enter/Space activation, threshold drag before-release callbacks, cancel/
blur/release/Undo/Redo, repeated zoom; focused markers tests and computed probe.
Parent real touch/stylus and history remain pending.

## Concrete remaining owner requests (no permission barrier)

Parent M1: native controls display:54 and independent-only native menu:2271 need
reversible normal-inline ownership or an explicit native state contract. Selection
layer:3669 must stop native inline lift or expose a narrow reversible write at
selection/update/drag transition; preserve runtime zIndex/document order/restore
and avoid per-frame writes. C7:3061/3086 requires capture/presentation state to
hide actual inline native menus while restoring each preexisting hidden/display
value; reuse existing event/lifecycle hooks and keep export-body roots explicit.

Parent/Parfit: C4 remaining inline fill/border paint must be projected once onto
the decoration/native face, with transparent inner surfaces and existing
patchStyle restoration; preserve local colors and source evidence, do not add
important JS styles. C5 sizer sites 36-38/2544-2546/2587-2589/2673-2675 require
the actual sizer writer to respect source/local alignment and table/code layout;
sticky fit 2559-2560 requires a reversible rendered-text projection that retains
original inline markup/source. New work runs on identity/content/appearance
change, not each card each frame. No edits to main/M1/renderer by this worker.
Exact remaining property/selector list is generated in the exclusive output.

## Current completed worker proofs / parent handoff

Owned UI ESLint: baseline 26 warnings -> current 0 warnings / 0 errors, no rule
disable/config changes. Final focused component/hover suite: 253/253 tests.
Earlier I1/I2, DOM and context slices passed 19, 248 and 78 tests respectively;
these overlap and are not added as an invented total. Scoped dependency typecheck
passes with the SDK's ambient type declarations explicitly loaded in the worker
config (no runtime import). I1 alone has byte-identical plain emitted module JS,
7092 bytes, SHA 2153409dec4687240a6822ffb944bd6b9334d23dc036b7b4bcbe784b425ce715.
Later DOM/context/guard/pin work intentionally changes runtime JS; no whole-plugin
identity claim, production builds or full gates by this worker.

CSS: 83 -> 44 priorities (39 removed), zero :has. Prepared cached-native CSS host
checks all 83 property sites across 60 variants / 24588 comparisons, zero current
mismatches; native inline face fills/borders, sizer values, fitted span text and
native z-index are explicitly represented. Removing remaining priorities naively
produces 166 differences. Pin measured 32x32 with tail exactly at (100,100).
These are synthetic style/input probes, not installed-app/device results.

Parent has acknowledged remaining owner requests. C10 inline owner is implemented
but its focused test receipt is pending; its CSS priority remains until receipt.
Parent native-visibility owner is queued/wiring; source projection awaits Parfit's
PDF closure lease. Source/UI can be handed back independently; styles.css stays
with this worker for the explicit corresponding CSS follow-up. No new permission
barrier: existing authorization, precise lease/contract and before-edit/native
gates govern the follow-up. Parent alone checks real app/captured preview/history,
both Android models and popout/closed-owner cases.

## James CSS-only lease transfer (2026-10-06)

Anscombe's applied changes/proofs above are preserved. Human explicitly transfers
ONLY styles.css and this linked note to James; no source, other test, central
register/plan/locales/budgets, builds/devices/full gates or commits. Coordination
for pending owners goes through the human parent. Additional proof artifacts use
tools/obsidian_cdp/.out/l20-interface/css-transfer and leave earlier proofs intact.
Starting exact inventory remaining-css-ownership.json: 44 remaining priorities,
C10 1, C1/C2/C7 4, C4 25 and C5 14. Native CSS evidence is the already-cached
native-app.css (Obsidian 1.14.4) and the existing 83-site css_probe.py fixtures.
Read C:/Users/ПАВЛУША/.codex/skills/impeccable/SKILL.md and reference/craft-floor.md,
plus committed DESIGN.md: user requests maintenance only, no visual-world change,
new design artifacts, detector/config changes or redesign. Use the craft-floor
maintenance criteria within that explicitly narrower brief.

## Slice C10 normal selected-layer owner (before CSS edit)

Exact retained selector .canvas-node.miro-canvas-layer-shown, z-index:
var(--miro-canvas-layer) !important (current styles.css:3724; original inventory
site 3669). Parent M1.showLayer at 3316-3349 now captures prior z-index value/
priority, paints String(native zIndex) normally, and wraps renderZIndex while
forwarding native receiver/arguments/result before synchronous repaint. It reads
current zIndex when native render runs; no document/runtime layer mutation or
per-card/frame observer. hideShownLayer restores only still-owned normal value,
keeping later foreign priority. The class/custom property remain the stylesheet
fallback. Actions: single selection, overlap/front/back, native drag lift,
clear/mixed/group selection, repeated select, unload and later hooks.

Prerequisite verified independently: tests/m1-session-layers.test.ts 7/7 pass,
including normal inline ownership from original important, exact restore,
foreign later important, repaint after native lift/repeated selection, layer
history/drag and frame exclusion. Output css-transfer-c10-unit.json. Thus remove
ONLY this priority and update its now-obsolete comment to state the actual
normal-inline owner. Keep all selector/value/cascade order and prior fixes.

Mandatory: scoped CSS count 44 -> 43, no new :has/priority; compare full 83-site
computed baseline/current in cached-native CSS host across both themes/mobile/
tablet/states, using the verified normal inline owner for C10. Add a negative
probe without the owner (native inline 999 wins the normal fallback) so the
contract is not silently assumed; original inline/style restore tests remain
actual M1 unit evidence. Preserve 32px pin/tail, prior hover/cursor/native rules.
Strict UTF-8/CRLF and exact slice diff. All real overlap/drag/group/history/native
paint/capture/Android/popout QA remains parent-only.

Local non-top sizer C5 first three priorities wait for parent's focused-test
receipt. Remaining SourceRenderer C4/C5 and NativeUiVisibility C1/C2/C7 priorities
remain until both actual owner implementation and tests/wiring are verified.
No generic specificity claim can defeat their documented inline competitors.

## Slice C5 local non-top sizer owner (before CSS edit)

Exact selector starts .miro-canvas-root [data-miro-canvas-vertical-align="middle"]
and "bottom", each targeting .markdown-preview-view > .markdown-preview-sizer;
current first block flex:0 0 auto, min-height:0, padding-bottom:0 (lines 36-38).
Native Markdown preview keeps a 100%-height viewport; sizer runtime projects
height/flex/min-height/padding inline. Parent decorateNodeAppearance now selects
these actual sizers only for an existing typography override whose normalized
vertical justification is non-top. It captures original value/priority and
writes only the three normal inline properties before refreshEditorAppearance.
The existing appearance restore path records applied values/priority, restores
on reset/unload only while still owned, and leaves a later foreign important
value intact even if its text equals the applied value. No DOM/source/content
rewrite, changed selectors or per-frame traversal are added by the CSS slice.

Human receipt: parent two new sizer cases / 8 picked-card tests pass and prior
M1 212-case set passes. Independently read source and tests and reran the exact
8-case picked-card file successfully; css-transfer-c5-unit.json. Remove ONLY
the three priorities in this first block; SourceRenderer's three other sizer
blocks and fitted text still await their own owner receipts.

Actions/checks: non-top alignment/middle/bottom, top/reset/no override, text
larger than card, lazy Markdown mounting/preview, exact original priority/value
restore and later foreign priority on unload. Cached-native-CSS proof must add
an ordinary native card with only local alignment (no source-renderer attrs) so
SourceRenderer's remaining important rules cannot mask a failed local owner.
Compare native inline flex/min-height/padding inputs with projected normal values
before/current; a disabled-owner negative check must differ. Include both themes,
desktop/mobile/tablet, non-default zoom, inline/native restoration and computed
rect/layout checks. Preserve all other priorities/previous rules. Count 43 -> 40.
Native normal-card checks across actual platforms remain the parent's work.

## Slice C1/C2/C7 verified native-visibility owner (before CSS edit)

Four exact inventory properties: C2 .miro-canvas-root .canvas-controls display;
C1 independent-only toolbar .canvas-menu/.miro-canvas-toolbar__native-snapshot
(display one-line rule); C7 presentation and screenshotting :is lists (display).
Current retained count 40. Read src/native-ui-visibility.ts complete and parent
M1 wiring: watchNativeUi once after adoptNativeMenu; fixed native control and
menu targets from current root; nativeIndependentOnly updated AFTER toolbar.update
before helper.refresh; root-class MutationObserver for capture/presentation;
helper disposed BEFORE toolbar/native-menu teardown and menu return.

Snapshot is cloneNode(false) of actual native menuEl and retains its canvas-menu
class before adding native-snapshot, so the fixed native menu query includes it.
The prior synthetic fixture's snapshot-only class must be corrected to model that
actual clone contract. Helper captures/reconciles original display/priority plus
hidden attribute null/string, applies display:none NORMAL + hidden, follows native
external style/hidden intent and preserves later hooks. Targets/attributes only,
owner-window observer, no subtree/frames/timers/global DOM or JS important writes.

Prerequisite receipt inspected (no duplicate helper/PDF run): Sagan
.out/l20-data/native-ui-tests.json: 20 passed, 0 failed, success true, including
latest native priority/hidden, self mutations, both capture/presentation reasons,
independent/normal transitions, cancel/error restore, later hook before observer,
owner filters/disposal, no-observer/partial style host and stable writes. Targeted
native-ui-lint.json has zero errors/warnings. Human parent confirms completed
wiring and owns actual capture/input checks. Existing plugin-owned C7 roots have
no competing inline display writer in their current component code; normal C7
state selector beats their normal component display rules. Keep selector lists,
properties/values/order; remove only these four priorities, update native-control
comment to actual reversible ownership. Preserve all prior 39 CSS fixes.

Mandatory: 40 -> 36 priorities; cached-native full 83-property/style compare with
normal native visibility projected on fixed native widgets, in themes/platforms/
tools/capture/presentation/zoom/alignment variants. Include actual-class clone
snapshot, genuine inline display:block/flex competitors and normal-selection
release; hidden widgets have zero client rects and cannot accept focus. Disable
visibility owner in a negative probe to show missing capture/menu/control contract;
remaining SourceRenderer inline competitors must still fail naive removal. Unit
contract report is Sagan's 20 cases, computed projection is synthetic evidence,
not actual module execution in Obsidian. Parent owns both themes/focus/native
menu rebuild/inline competition/PDF/presentation/error/cancel/native device QA.

## Slice C4/C5 SourceRenderer pure owner + group state variables (before CSS edit)

Human parent revoked Parfit's unused source lease and owns runtime changes.
Read new pure src/native-card-styles.ts and SourceRenderer applyNode wiring:
projectNativeCardStyles clears specific conflicting inline paint properties;
projects source/code/table sizers and sticky fit font-size/line-height normally;
group faces wrap original nonempty border-width/style in state variables and
set border-color via var(--miro-source-group-border-color, transparent). Existing
reverseordered patchStyle preserves value/priority and later host writes. The
applyNode-local WeakMap skips repeated property writes at unchanged values;
existing markup childList refresh repeats only for changed/late content. No new
frame/card observers or runtime important. Parent focused receipt: helper 9 +
SourceRenderer 83 = 92 passed; types pending parent. No duplicate PDF/UI tests.

Before editing the existing selected/focused group-face rule, add exactly three
custom properties: --miro-source-group-border-width:1px;
--miro-source-group-border-style:dashed;
--miro-source-group-border-color:var(--interactive-accent). Preserve unselected
original width/style fallback and transparent color; class changes, not JS per
frame, control the state. Keep border !important while adding variables, then
remove remaining 36 priorities only after coupled pure-helper/native-CSS proof.

Mandatory proof uses the REAL pure helper transformed in isolation (not a plugin
build), injected into headless cached-native CSS DOM with normal setProperty/
removeProperty writer. Compare pre-source 36-priority CSS + original inline
values against candidate normal CSS + actual helper projection. Include themed/
plain/selected/focused/dragging/editing states, both themes/platform classes,
source faces/content, deck/embedding primary backgrounds, all C5 roles, group
selected->unselected->focused vars and original-width/style fallback. Callback
restoration simulation is separately labeled, not a SourceRenderer integration
claim. Disabled helper must differ on real inline competitors. Unit integration
receipt belongs to parent; all actual app/platform/freeze/gates remain parent.

If cached native normal selectors win against the former important paint rule,
qualify only the affected now-normal properties using actual board/source marks;
leave every unrelated property on original selectors and preserve selected group
state precedence. Do not claim blanket clearing (deck stays primary, native group
state remains live). Real helper matches and unrelated-paint observations are
reported, including any required runtime adjustment to the parent via human chat.

### Source coupled native-css findings / narrow cascade correction (before edit)

First REAL-helper computed run found 1,260 compared-property differences and
1,500 additional paint differences across 60 theme/platform/native-state/zoom
variants. This disproves naive clear-inline plus unchanged normal selectors;
not an installed-app result. Cached native .canvas-node.is-themed .canvas-node-content
background color and .canvas-node.is-selected.is-themed .canvas-node-container
border color (three/four class specificity) outrank multiple bare source rules.

Before the CSS correction: move ONLY the 25 former-priority C4 paint declarations
into adjacent rules qualified by the real .miro-canvas-root.canvas-wrapper owner.
Keep every unrelated declaration on its original selector; preserve original
source matches, values and order. Selected/focused group border gets the same
qualification while its three new state variables stay on the original group
rule. These variables drive inline width/style/color and preserve unselected
fallbacks; never apply a blanket transparent group border while selected. C5
11 priorities become normal on original selectors because exact actual helper
normal-inline projections defeat native sizer/text inline competition.

Runtime findings sent to parent: drawing projector also clears preview paint
not covered by original drawing selectors; limit that branch to shell/face/content
and preserve unmatched preview values. Slide's border-only clear guard skips an
inline border-color longhand when getPropertyValue("border") is empty; handle
conflicting longhands, preserving their original value/priority. No runtime file
is edited by this worker. CSS removal is authorized by current parent receipts;
final zero-mismatch/freeze receipt awaits those runtime corrections and the rerun.
Negative/helper-disabled and additional unrelated-paint checks stay enforced.

## James final CSS-only completion / stop-writes receipt

CSS is complete: transferred 44 -> 0 priorities, original 83 -> 0 overall,
zero :has and no JS important introduced by this worker. Previous 39 CSS fixes
and their declarations/values are preserved. Eight first priorities were removed
under verified M1 selected-layer/local-sizer/native-visibility contracts. Remaining
36 use the parent's corrected real pure Source helper and normal CSS: 25 paint
declarations receive narrow actual-board qualification, 11 geometry/text clauses
remain on original selectors with normal inline projections. The three exact group
state variables drive the parent's inline variable fallbacks. Every original
property/value is retained; only those 25 C4 selectors were qualified, and only
three group custom-property declarations were added. No unrelated properties
were strengthened along with a paint rule.

Coupled proof executed current src/native-card-styles.ts transformed in isolation,
with real DOM matches/native-free query fallback and a normal get/set/remove writer.
This is not a plugin build or globally simulated clearing. Cached Obsidian 1.14.4
CSS, original DOM inline competitors and final styles yield 132 variants over both
themes, desktop/mobile/tablet, plain/selected/focused/dragging/editing plus drawing/
shape/lasso tools, capture/presentation, and 50/125 percent zoom. All 83 original
CSS sites matched; 48,816 property/layout comparisons, zero mismatches. Additional
paint surfaces also have zero differences, including preserving unmatched drawing/
line previews and correct embed/deck primary backgrounds. Disabled actual helper
produces 162 differences: the test exposes the required ownership contract.

Live group cycle selected -> plain -> focused -> plain (without another projection
write) produces 1px/dashed/accent then original 5px/solid/transparent, repeated;
projection journal remains 119 writes throughout that class-only cycle. This
validates normal CSS/variable interaction rather than forcing transparent group
borders. Earlier M1/Native UI stage has 240 variants / 101,088 comparisons, zero
mismatches, actual-class snapshots, zero native client rects/focus while hidden,
normal menu release, 8 missing-owner and 22 capture missing-owner differences.
Those are synthetic prepared browser results. Parent's 24 native-visibility cases
are COMPONENT tests; this note does not relabel them as installed results.

The initial real-helper failures were retained/reported: native themed selectors
won after naive priority removal, drawing preview clears exceeded exact scope,
and standalone embed background-color/slide border-color escaped shorthand-only
checks. CSS now qualifies only the necessary paint; parent narrowed drawing and
mindmap selectors and handles shorthand components. Corrected helper rerun gives
zero compared and additional paint differences. Failed diagnostic snapshot is
source-computed-before-runtime-correction.json, not a passing certificate.

Final CSS SHA-256:
7c5ce8c141b048ae4382abb83f6c3a309a0bfef5c21290bc527184202a76208c.
Cached native CSS SHA-256:
866e50ac84dd8ad2775e0047ebd3ec5bd03e5af722aff259e6c4ea3cec42d7ba.
Strict UTF-8/no BOM/CRLF and scoped git diff --check pass. scripts/check-css.mjs
reports zero priorities / zero :has; budgets and lint config were not changed.
Proof/patch: .out/l20-interface/css-transfer/final-proof.json, final-proof.mjs,
css-final.patch, source-computed.json, source_probe.py, native-card-styles.runtime.js
and styles.source-candidate.css. The proof asserts executed CSS equals styles.css,
all original declaration values remain, and only approved group variables exist.
styles.before.css preserves transfer-entry 44-priority bytes; styles.source-before.css
preserves the intermediate 36-priority pre-Source comparison. Earlier Anscombe
proofs are untouched; no production build, deploy/device/full-gate/commit occurred.

IMPORTANT evidence boundary: parent's actual installed CSS0 Windows check found a
LATER native ordinary-sizer style write (padding 0 -> 18px) after childList delivery.
These successful CSS/pure-helper snapshots prove initial projection plus class
state behavior, not resistance to deferred native style mutations. Parent is
repairing bounded runtime ownership using existing M1 appearance observer / one
Source watchLive observer on fixed owned targets, cached desired values and no
per-frame/card scans; that new runtime and actual Windows/tablet/phone frozen-build
matrices are PENDING and are not certified here. No further CSS edits are needed
for that ownership repair. Parent owns the new main build/native validation.

Per explicit parent instruction, this concludes the CSS proof and stops worker
writes. Only styles.css, this linked note and exclusive proof artifacts were
written after the CSS lease transfer. Source/runtime fixes stayed with parent.
