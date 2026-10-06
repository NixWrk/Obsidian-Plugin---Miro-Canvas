# L19-CSS: interface dependency and influence audit

## Before-edit record and scope

2026-10-06. INTERFACE worker, shared primary checkout
`J:/NIX/WRK/Code/Obsidian-Plugin---Miro-Canvas`; starting HEAD
`85cb6cdb81dd7bd256e78391083b6fb4c08c406e`. This is the exclusive detailed
note linked by [L19-CSS](../lint-remediation-checks.md#l19-css-interface-executor--dependencyimpact-review-only).
The primary register already contains L19; no subsection was copied or edited.
This record precedes any proposed implementation work. This worker is authorized
to audit only and makes no implementation, CSS, contract, schema, board or test
changes. Future implementers still need their own bounded pre-edit registration.

Read AGENTS.md, README's agent workflow, docs/contributing.md,
docs/miro-canvas.md, DESIGN.md, the remaining-group guide and JSON inventory.
Trace evidence below comes from source, test and harness inspection, including
local Obsidian SDK declarations. No install, production build, linter, test
execution, device deployment, ADB, Obsidian input, commit or push was performed.
Other workers are editing this checkout; source locations refer to the inventory
and named functions, not a promise that current working-tree line numbers stay fixed.
Proof artifacts, if any, belong exclusively to `tools/obsidian_cdp/.out/l19-worker-artifacts/interface/`.

The inventory is dated 2026-10-06 and names 96420fa; L19 names 85cb6cd as the
execution baseline. All 83 CSS declarations are covered individually in Appendix
A. They are priorities, not 83 independent bugs. The UI factory inventory is
113 S2 warnings across 21 modules; Appendix B records each exact warning site.

## Execution DAG: dependencies versus write serialization

There is **no required dependency on finishing L19-SEL or L19-AUTH type work**
for CSS cascade research or a bounded DOM-factory migration that preserves its
existing consumer contract. The UI calls the data writers, but a call dependency
is not an execution prerequisite when those writers' runtime behavior and public
signatures stay unchanged. Integration must nevertheless test the composed result.
If data work changes guards, reads, cloning, signatures or preview geometry, this
independence claim no longer applies; stop and reassess the patch boundary.

| Relationship | Kind | Scheduling consequence |
| --- | --- | --- |
| Every C1-C10 edit writes styles.css | File/cascade serialization | One CSS writer; independent research or patch preparation is safe, simultaneous writes are not. Recheck rule order after every accepted slice. |
| C1 independent-only menu, C3 tool state, C5 local appearance, C7 session export hiding and C10 selected layer all involve m1-session.ts | File/state-owner serialization | One M1 implementation owner. These sites do not all depend logically on each other. |
| Source descriptor → applyNode → reversible marks/styles → C4/C5/C9 | Shared rendering semantics | Establish actual painted surfaces and restore ownership before altering those styles. Shared source-renderer.ts changes serialize with its S4 fallback work, not with all S1 data work. |
| C8 transform versus CommentMarkers.update inline transform | Actual conflicting writers | CSS-only priority deletion is blocked. A coordinated owner change needs a bounded runtime scope and a before-edit regression record. S2 factory work need not precede it. |
| C10 versus native selected-node inline z-index | Actual conflicting writers | More selector specificity cannot replace the priority. Define a narrow reversible native-style ownership design and its regression checks before implementation; leave the site pending until that design is validated. |
| C2 controls versus other plugins' inline display | Actual conflict documented by existing source | Verify on installed hosts with optional plugins enabled. A stylesheet-only specificity change cannot defeat ordinary inline display. |
| C5 sticky-fit font-size/line-height versus imported descendant [style] | Actual conflicting writers | Imported inline typography is expressly targeted. Need a reversible projection design or retain these two priorities pending a validated design; never rewrite source/text evidence. |
| Owner document → helper creation → events, timers and observers in same realm | Logical invariant, not global migration prerequisite | Define and test the owner-document contract before each factory migration. Existing injected documents let many components proceed without waiting for global S4 cleanup. |
| S6 definitions → rendering/search indexing/value persistence | Actual API migration dependency | Treat settings as one coherent migration. Local SDK says nonempty definitions bypass imperative display; renaming redisplayInPlace alone is insufficient. |
| S4 retry/PDF timers and S5 activeLeaf/pickers in main.ts | File serialization, partly shared lifecycle | Wave-1 timer owner finishes first before another main.ts writer. DOM helpers elsewhere do not wait for these timers. |
| C7 capture consumes C4/C5/C9 painted DOM | Validation influence | Run capture checks after each content-style slice; export code does not need to be migrated first. If capture visibility ownership itself changes, validate presentation and capture as separate lifecycles. |

Suggested DAG nodes: owner-contract inspection is available now; bounded S2
families and C1/C8-size CSS research can proceed alongside SEL/AUTH/MCP/WIN.
After evidence, the one CSS writer accepts small slices sequentially. Content
paint/layout/rotation branches join for export and integrated input verification.
S6 and native ownership proposals need separate implementation scopes and regression gates within the authorized lint-remediation work. No
universal edge from data-type work to UI work, or from settings migration to CSS,
is justified by the inspected code.

## Actual state writers and native influence

### C1: three states, three owners

Dock hidden (styles.css:80): M1Controls.makeElement (src/m1-controls.ts:216)
builds the root, map, bars and menus. menu/toggleMenu/closeMenus and update
write hidden for menus, unavailable actions, the minimap, diagnostics and review
status. M1CanvasSession constructs M1Controls using controlDocument and
PanelVisibility arranges/folds the navigation and map panels. Author display
rules compete with the browser's hidden rule. Check root and descendants,
including menus that are rebuilt or moved; do not assume a root-only fix works.

Primary actions (666): M2CanvasTools creates shape creation, anchor save and
connector-end buttons with the primary-action class (148/208/237). The generic
`.miro-canvas-m2-tools button` background has greater specificity than the
one-class primary rule; the enabled hover rule is stronger again. This is an
in-plugin cascade dependency, independent of authoring types. A replacement
must intentionally retain accent paint in resting, hovered and disabled states.
M2 lives in the modal's owner document, outside the board root: main.openLocalTools
passes modal.contentEl.ownerDocument. A board-root-only selector would miss it.

Independent-only menu (2271): SelectionToolbar.update (1118) writes
data-miro-independent-only; M1.toolbarState/refresh supplies the state from
native, independent connector and comment selection. M1.adoptNativeMenu (5882)
reparents the real native menu into the toolbar and makes an inert/aria-hidden
snapshot. Middle-button pan temporarily shows that snapshot, then hides it.
The native-slot rules and watchNativeMenuState are a separate owner from generic
toolbar hidden states. Inspect native menu inline display and the populated/empty
slot transition before eliminating the independent-only priority. Include
comment-only, independent-only and mixed selections, not just native cards.

### C2-C3: native input surfaces

C2 controls (54) hide Obsidian's navigation because M1Controls replaces it.
The existing comment records Advanced Canvas/Canvas Minimap writing inline
display on Android; this audit did not re-observe those installed apps.
C2 resizers (2081) replace native interaction-layer grips with SelectionHandles.
The documented mobile selector is `.is-mobile .canvas-wrapper:not(.mod-readonly)
.canvas-node-interaction-layer .canvas-node-resizer[data-resize="topright"]`,
and the other three corners, display:block with 20px size. The synthetic smoke
injects that selector (smoke_plugin_ui.py:516); this is synthetic evidence only.
Native mobile specificity may be addressed by a scoped stylesheet rule, whereas
inline resizer display, if observed, requires separate owner coordination. Do
not combine the two display sites into one unexamined implementation strategy.

C3 (1595/1606/1617): M1.updateQuickTools (4735) writes the root tool
attribute. arm/finish/reset paths update it; moveBrush/hideBrush supply the
plugin brush for pen/highlighter/smart/erasers. Creation tools use crosshair;
lasso has a later move cursor for selected node/edge/connector descendants.
The broad `.canvas *` selector reaches descendants with their own cursors, so
inheritance on the board alone is not equivalent. Native drag/editing cursors
and optional-plugin inline cursors need installed-host observation. Keep
panel/grip/pin gesture ownership and tool cancel/reset behavior unchanged.

### C4-C5: shared source painting and Markdown layout

M1 constructs SourceRenderer with options.document or ownerDocument(root)
(1690), document/scene/preview callbacks and deck/font callbacks. applyNode
(1592 onward) writes owned class, kind, source/local id, host, table/drawing/line,
preview/document/embed/deck/slide/mindmap and text-layout marks. Descriptor data
comes from the source scene; local appearance and preview geometry are inputs,
not reasons to change the saved source. Shell, native container, content,
Markdown view/embed and owned vector/decorative face are different paint layers.

applyNodeCss maps typography onto content and box paint onto a real native card
face or decoration. Shape native paint is cleared only after a vector contour
exists. Text/sticky/table/code/drawing/group/mindmap CSS hides native rectangular
paint; media/decks/slides have deliberate shadows/borders. Native selected lines
and groups have separate focus/outline rules. Removing a transparent rule can
reveal a second fill/border or shadow, especially with opacity and selection.

M1.refresh unwinds SourceRenderer.restoreBeforeAppearanceChange **before**
refreshDecorations restores/repaints prior local appearance; sourceRenderer.refresh
then reapplies source paint. decorateNodeAppearance/appearanceContentTargets
(around 7989) paint the native rounded face once and keep inner surfaces transparent.
setTrackedStyle records the values applied for reversible cleanup. Do not change
this ordering while addressing CSS. Shape conversion → Undo is a mandatory case.

SourceRenderer.patchStyle (291) reads the old value AND priority, records the
engine-normalized written value and restores only if that value/priority is
still owned. patchClass/patchAttribute and owned child patches unwind on dispose.
watchLive (2300 onward) observes owned transforms/edge paths and code markup,
not every node descendant style/property. It does **not** already provide a
general mechanism to enforce new preview-sizer or paint overrides. A proposal
to add such enforcement is new runtime work, including a large-board risk.

C5 local valign (36-38) is driven by M1.applyElementAppearance writing
data-miro-canvas-vertical-align and --miro-canvas-vertical-align. Source valign
(2544-2546) is driven by applyNode for shapes/stickies. Native Canvas's preview
sizer stretches; padding/min-height may be inline in installed versions and
must be measured, not assumed absent. Table height/min-height/padding, code
sizer and preview padding share the same native Markdown surface. Shape inset
padding is separately written inline in applyNode; preserve its box sizing.

Sticky fit writes --miro-sticky-font-size and data-miro-source-fit when no
explicit descriptor font-size exists, using current text and measured dimensions.
The two `[style]` rules (2559-2560) intentionally override imported HTML font-size
and line-height. Enlarging specificity cannot beat those inline properties.
Code numbering writes the gutter and line-count variables from current editable
text; CodeHeadingMarks refreshes direct p/pre and .el-p/.el-pre markup. CSS
pre/gutter changes must keep title suppression, line count and alignment, while
ordinary paragraphs remain visible. Test late Markdown replacement, not just
the first render.

Editor appearance is a separate iframe realm: frameDocument/isDocumentLike
(src/editor-appearance.ts:89) safely probe an accessible document, ownedStyleElement
(111) inserts in that document.head and paintRules applies CSSOM priorities.
Those runtime priorities are outside the 83 CSS declarations. S2/S5 cleanup
must preserve cross-origin failure, one owned style and load-driven repaint;
deleting a capability probe to appease lint is not equivalent.

### C6-C7: click ownership and capture lifecycles

C6 (2803): SourceRenderer.applyNode sets data-miro-source-host from the real
link/file/text runtime and preview/document classes from structured descriptors.
Native Canvas supplies is-focused and the content blocker; the plugin does not
create that blocker. The selected link preview/document must keep the blocker
on so a card drag does not enter the embedded web content. Check actual native
blocker display writes after focus/edit/reselect. Open-link is an explicit
toolbar action, not a justification to expose iframe input on selection.

C7 presentation (3061): SourceRenderer.decorateDeck binds present/fit/export;
M1.runDeckAction creates SlideShow using the board root. SlideShow.mount writes
miro-canvas-presenting, navigation changes the viewport and stop removes the
class/bar/owner-document key listener. Capture (3086): board-export.capturePages
(wrapper.ownerDocument) deselects, sets is-screenshotting/miro-canvas-exporting
and canvas.screenshotting, waits for fonts, tiles html2canvas captures, then
restores camera/classes/flag and removes progress UI in finally. M1.exportNow
also hides the export panel and overlay before capture, then restores both in
finally. The export panel is appended to document.body, outside the captured
root; stylesheet root hiding alone cannot replace that explicit path.

Presentation and capture selectors overlap but cover different roots. Native
menus can have inline display; owned surfaces use component display rules.
Class-based hiding must win while restoring preexisting hidden/folded state on
exit. Test Stop and renderer failure as well as successful actual PDF output.

### C8-C10: geometry, compositing and layers

C8 (3187/3188/3198): CommentMarkers.update (189 onward) creates a button with
inline minWidth/minHeight 32px and **transform:translate(-50%,-50%)**. CSS sets
32x32, zero variable-based padding and **translate(0,-100%)** so its bottom-left
tail is the anchor. Removing the transform priority moves the pin by 16px on
each axis at 32px size, even if the dimensions still look right. Drag preview
and release use the marker point plus pointer delta, owner-window listeners,
capture and cancel/blur cleanup. Its left/top are screen coordinates; do not
scale the 32px pin with board zoom. min-size priorities are separate candidates:
the existing inline values match the intended minima, but native button size
and tablet padding still require actual cascade/hit tests. Preserve the global
`.is-tablet` padding restitution using --miro-canvas-button-padding. Transform
ownership must be reconciled explicitly, not smuggled into S2 factory cleanup.

C9 (3649/3650/3654) uses applyNode's nonzero-rotation mark. applyRotation appends
rotate(angle) AFTER the native translate on the shell and separate interaction
elements, with a prioritized center; restoration removes only the owned suffix
from the current transform. watchLive keeps that suffix after native movement.
The CSS targets DESCENDANT content/Markdown composition, not the shell transform.
Existing source comments identify focus-dependent translateZ(0), with different
Markdown depths by host version. Never remove all transforms or replace shell
rotation with the independent rotate property. That would change geometry.
backface-visibility/will-change need separate computed-rule evidence from the
preview transform site. C4 rotated-shape transparency (3660-3662) shares the
same mark and must be checked with C9 even if accepted as a separate patch.

C10 (3669): M1.updateShownLayer (3320) reads the single selected native card's
runtime zIndex, adds miro-canvas-layer-shown and writes --miro-canvas-layer.
hideShownLayer removes both on multi/no/group selection, replacement or dispose.
Native selected-card inline z-index is explicitly documented by the stylesheet;
the rule prevents a selected back card from jumping forward. M1.changeLayer
calls CanvasAuthoring.changeZOrder for one native history transaction; frames
are excluded and node order remains native-compatible. Source decoration
z-indices (0/1/2) are internal stacking contexts and are not this selected-shell
priority. Do not fix C10 by changing saved order, creating new zOrder metadata,
or repeatedly writing native runtime zIndex on pointermove.

## Ordered CSS patch slices for coordinator review

All are proposals, not authorized implementation. The exact selector/property
set is in Appendix A; inventory line ids below make each slice exclusive.

| Rank / slice | Sites and potential warning reduction | Required prerequisite and risk |
| --- | --- | --- |
| 1a, owned dock hidden | C1:80 (1) | Check every hidden descendant against component/native display and rule order. CSS-only candidate; no data prerequisite. |
| 1b, primary actions | C1:666 (1) | Preserve enabled hover, disabled and native focus accent paint in M2 modal. Specificity must outrank the generic/hover rules. Independent from 1a except styles.css ownership. |
| 1c, pin minima | C8:3187-3188 (2) | Confirm inline 32px minima plus width/height/padding across host button rules. Leave transform priority intact; no data prerequisite. |
| 2a, independent native menu | C1:2271 (1) | Inspect native inline display, snapshot/state order, independent-only/mixed selection and pan. If inline conflict exists, block CSS-only removal and seek owner design. |
| 2b, mobile resizers | C2:2081 (1) | Full actual mobile corner selectors, one transparent native selection overlay, rotated/active resize and CANCEL. Native specificity might be sufficient; inline display must first be ruled out. |
| 2c, tool cursors | C3:1595/1606/1617 (3) | Real Windows mouse cursor over all relevant descendants, native drag/edit cursor and optional plugins. No data-type prerequisite; coordinate S2 M1 gesture edits only if they change this owner. |
| 3a, drawing/line/group paint | C4:1296-1298,1346-1347,3033-3035,3039,3048 (10) | Native focus/outline, drawn SVG hit paths, groups and layer/resize preview. Guard against revealing duplicate rectangles or removing the only selection cue. |
| 3b, media/deck/slide paint | C4:2785/2787/2792,2939/2940/2942,2951/2953 (8) | Link/file/text hosts, embed/theme paint, deck bar, slide selection and capture. Native inline paint remains an evidence gate. |
| 3c, shape/text/sticky/mindmap paint | C4:2456-2458,2468-2470,2493-2495,3143-3145 (12) | Shared source/local appearance restore order, contour existence, opacity and inner surfaces. Integrate with 4a/4b/C9 even though same-file writes serialize separately. |
| 4a, local/source valign | C5:36-38,2544-2546 (6) | Actual preview-sizer inline min-height/padding/flex, top/middle/bottom, overflow and shape insets. Requires owner design if inline overrides are found. |
| 4b, sticky padding and table layout | C5:2516,2581,2587-2589 (5) | Sticky proportional padding; table sizer 100% and native wrapping/resize. Shared Markdown cascade with 4a and source paint, not a dependency on S1 types. |
| 4c, code preview and gutter | C4:2575-2577,2634-2636 (6); C5:2667,2673-2675,2685-2686,2688-2693,2703 (13) | Table/code paint plus code pre/sizer/gutter; late markup, title marks, numbering and export. Keep table layout verification from 4b when accepting table paint here. |
| 5a, presentation then capture | C7:3061/3086 (2) | Separate entry/exit/failure state evidence, native menu display and body-mounted export panel. Regression depends on accepted content slices, not on settings migration. |
| 5b, composition and rotated-shape paint | C9:3649/3650/3654 (3); C4:3660-3662 (3) | Focus-dependent native preview transform at multiple depths, descendants versus rotated shell, paint sharpness and live attached edges. Owner migration may be needed for inline transform. |
| Hold, pin transform | C8:3198 (1) | Proven different inline/CSS transforms. Explicitly authorize one owner with correct tail geometry before removal. |
| Hold, native controls | C2:54 (1) | Recorded optional-plugin inline display; new installed evidence and reversible coexistence design required. |
| Hold, selected link blocker | C6:2803 (1) | Observe native blocker writes through focus/edit/drag; authorize owner coordination if inline. Keep gesture interception. |
| Hold, sticky inline fit | C5:2559-2560 (2) | Confirmed [style] boundary; do not edit imported HTML or source. Reversible projected typography design needs authorization. |
| Hold, selected layer | C10:3669 (1) | Native inline lift; reversible owner/native hook proposal and layer/history tests required. |

These slices partition all 83 declarations: C1 3, C2 2, C3 3, C4 39,
C5 26, C6 1, C7 2, C8 3, C9 3, C10 1. Potential reductions are targets,
not proof that a priority can safely be removed. Do not move priorities into
JavaScript or use dynamic property/method spelling as a lint workaround.

## UI / DOM / settings lanes

Each S2 lane preserves injected document ownership, node order, classes,
attributes, native semantics, focus and listeners. Local SDK exposes window
createEl/createDiv/createSvg and Document.win; test DOMs may not implement these
extensions. Specify the supported factory/fallback behavior before editing;
do not blindly replace creation with an ambient global helper. A shared helper
would enlarge contract/import scope and must be coordinated, not invented by
several workers independently. SVG requires the original namespace.

| Lane / S2 count | Actual callers and influence | Independent of data type work? Mandatory focused checks |
| --- | --- | --- |
| panel-arrange, 18 | M1 creates PanelArrangeMode with controlDocument; enter/renderTray/startItemDrag create banner, grips, flip/reset/done, tray and ghost/marker. PanelVisibility handles collapsed/arranging layouts. | Yes for factory-only work. panel-arrange and panel-visibility can have separate owners but need joint drag/fold/resize validation. panel-arrange/panel-layout/panel-visibility tests; preview no settings save, CANCEL/blur/exit and keyboard Escape. |
| m2-tools, 35 | main.openLocalTools passes modal document; shape/anchor/endpoint controls call authoring/metadata writers, refreshTargetSelectors/syncSelect rebuild options; embeds CommentsPanel and DocumentControls. | Yes for unchanged factories and listeners; do not modify authoring types or validation. Cover shape/anchor/endpoint/rotation, scope/reply, polling disposal, comments-only modal, C1 accent and all keyboard labels. Existing authoring/comment suites cover writer semantics, not installed modal focus. |
| board-export, 10 | M1 opens ExportPanel/ExportOverlay; exportNow calls capturePages. Overlay tab/corner owns drag; status/Stop and canvas sheet belong to wrapper document. | Yes. board-export/browser-export/export-page-controls and M1 board-press tests. Success/Stop/failure restoration, capture realm/canvas context and true export pixels. |
| board-search-bar, 1 | M1.ensureSearchBar passes board document; make builds search controls; S4 timer fallback is in same class. | Yes, but serialize same-file S2/S4 or make one scoped patch. board-search-bar/m1-session-search; pending debounce close/dispose and rapid owner-window switch. |
| comment-markers, 4; comment-thread, 1; comments-panel, 1 | M1 constructs pins and opens thread card; M2 constructs comments panel. Markers use same-document SVG, native button activation and owner-window drag listeners. Thread/panel generic factories build all descendants. | Yes for factories. Keep C8 geometry separate; comments-panel S7 shares make and must serialize or be explicitly included. comment-markers/selection-handles/comments-panel/local-comments, plus real thread close/help/reopen/reply/resolve/drag. |
| connector-labels, 3 | M1 connector controller constructs ConnectorLabels from board document. add creates native-class label/editor; draft/commit remains controlled by existing host callbacks. | Yes. connector-labels/m1-session-label-font; Enter/Escape, selection restore, edge label drag and mobile keyboard. |
| document-controls, 7 | M2 embeds DocumentControls for selected native document; it calls DocumentHost page/fit operations, with status/failure rendering. | Yes for DOM; platform PDF timer patch is independent until integration. obsidian-document-host/document-viewer tests plus actual PDF pending/ready/failure/page/fit and modal close. |
| editor-appearance, 1 | M1.refreshEditorAppearance → applyEditorAppearanceToFrame → ownedStyleElement in accessible iframe; S5 document capability probe shares file. | Yes; coordinate same-file S2/S5. editor-appearance; frame load/latest styles, cross-origin/detached failure, removal and font/selection parity while editing. |
| font-packs, 1 | main attaches FontFaceRegistry to main/new windows; attach inserts one style per document and detach removes it. S4 test-endpoint access shares file but not the DOM lifecycle. | Yes for factory. font-packs; same-window idempotence, popout lifecycle, local fonts/fallback/aliases and disposal. Never trigger a pack download implicitly. |
| import-guide, 1 | main.openImportGuide passes modal document into buildImportGuide; factory creates all guide steps, copy/link controls and text. | Yes. import-guide tests, owner-window modal open/close, RU/EN copy/link and keyboard. System clipboard cannot be proven by a synthetic ClipboardEvent. |
| m1-controls, 1 | M1Controls.makeElement builds the full navigation dock; M1 passes its controlDocument. It uses SVG namespace helpers too. | Yes. m1-controls-dock/source-inspector, C1 hidden descendants, minimap/zoom/undo/redo/menu placement and detached owner document. |
| panel-visibility, 1 | M1 passes board document/root and layout callbacks; constructor builds fold toggle, update writes hidden and inline bar sizes/padding. | Yes. panel-visibility/m1-session-panel-crowding; folded/unfolded/orientation/reserved reach/search hit order and CANCEL. |
| pen-tooltips, 2 | main's PenTooltips attaches per document/window; show creates tooltip/arrow from state.document and owner timers. | Yes. pen-tooltips; pen hover/no-hover, long press, close/unload and touch-menu interference. Real stylus evidence remains separate. |
| quick-tools, 6 | M1 constructs with controlDocument and saved item layout; standalone constructor has S4 global document fallback. paintToolbarIcon creates SVG; palette, drag ghost and More use same factory/realm. settings-tab also calls paintToolbarIcon with its container document. | Yes for contract-preserving S2; same-file S4 serializes. quick-tools/stylesheet-hover; armed tool/repeat fold/More/orientation, native tool button/drop behavior and settings icons. |
| selection-handles, 1; selection-toolbar, 1 | M1 builds each with controlDocument; generic factories feed all grips/popovers/native slot. Separate SVG paths retain namespace. | Yes. selection-handles/selection-toolbar/m1-session-toolbar-state/picked-cards; one native outline, rotated/locked/review states, mobile keyboard clamp and before-release attached paths. |
| slide-show, 3 | M1 starts SlideShow from board root; root.ownerDocument builds bar/buttons/counter and owns key listener. | Yes. slide-show/browser-export; first/last/empty/filtered slides, Escape/stop, owner-key listener disposal and C7 visibility. |
| main, 2 | openFileSourceMenu creates device-file picker in button.ownerDocument; pickFontFile creates font picker; settings host reaches custom font picker. | Yes logically, but main.ts is currently owned by WIN; queue after timer patch. Device-files/font-packs/settings and actual Android picker accept/cancel, unique attachment names, no extra downloads. |
| m1-session, 13 | ensureSearchBar hit, rectangleSelect marquee, moveBrush, startToolGesture SVG/HTML ghosts, startLine SVG paths, promptLink form/input, updateMixedSelectionFrame, refreshDecorations attachment label. All run from root/control document. | Yes for exact factory-only scope, but one M1 writer. Pair each site with its own geometry/event-ownership suite; do not fold all into a generic rewrite. Rectangle endpoint masks, one marquee, chain previews, group/50/125% drag and cancel are mandatory. |

S4 outside wave 1: board-search-bar timers, M1 ownerDocument fallback (two
diagnostics), QuickTools fallback and SourceRenderer.defaultDocument need a
deliberate no-owner/test-host fallback contract. This is not a dependency of
CSS-only work. canvas-ids is also used by MCP and is not a window DOM lane;
font-pack test endpoint is not document ownership. Keep both out of a blanket
globalThis-to-window migration.

S5: activeLeaf sites represent obtaining a view, opening a file and checking
the identity of a retry leaf; settings save/external change rebuild the active
session through these paths. Separate functions rather than replacing every
reference with a view getter. M1 searchHitElement's querySelector warning is
an SDK declaration warning, not evidence that browser querySelector is gone.
M1 clipboardCommand attempts Electron bridge then synchronous execCommand;
an asynchronous clipboard write does not preserve cut/paste/native editing
history. It needs its own behavior proposal and actual system clipboard checks.

S6 has five inventoried diagnostics: missing definitions, redisplay/display
rule plus deprecation at the same call, warning button, dynamic slider tooltip.
SettingsTabHost has custom settings/saveSettings and async font actions;
main.saveCanvasSettings merges/persists per-device settings and rebuilds a
session, while saveSettingsQuietly handles panel positions without rebuild.
Native definitions must read/write through that host, not assume a conventional
plugin.settings store. Built-in search, section focus/scroll, author/font/tool
list mutations, async download/remove errors and dynamic descriptions must all
remain coherent. Local SDK declares update/getSettingDefinitions since 1.13.0;
SM-A336E 1.12.7 cannot verify those APIs. No manifest/minimum upgrade is proposed.

S3 UI-facing validators (appearance, attachment labels, canvas elements, device
files, document viewer, local comments, metadata, main and settings) are separate
equivalence work, not prerequisites for DOM/CSS migration. Preserve each exact
character set/trim/length/reserved-name rule; serialize shared modules. S7 unknown
text conversions affect comments-panel.make and M1.captureTextFragment; preserve
existing values intentionally rather than combine type and DOM semantics silently.
S8 M1 native-method this alias belongs to history/lock/save hooks and is not a DOM
factory cleanup. S9 command IDs require compatibility; developer badge text is
independent of CSS but main.ts still needs one writer.

## Mandatory regression and real-input scenarios (all pending)

These are proposed coordinator checks, not claims of execution. Reuse existing
test/harness structure where applicable, but most unit fakes cannot prove CSS
cascade, true hit testing or native runtime inline rewrites. `--controls` covers
tablet padding and hover in a synthetic host; it does not replace installed
Android input. check-css-state/check-owned-visibility/check-card-fill/
check-arrow-color/check-panel-css and check-settings-navigation are useful
existing runner references, not full coverage of every proposed slice.

For every accepted slice use both light/dark themes and RU/EN where controls
or copy are affected; 50%, 100% and 125% board zoom; reopen and plugin disable/
enable. Capture exact computed display/paint/layout, selector origin and inline
value/priority before/current, including a native rewrite after selection/drag.
Save installed CSS/main hashes with each new result. Compare unknown sentinel
fields at root/node/edge/miroCanvas nested payloads and unchanged miroSource;
prepare those fixtures through existing safe test paths. No preview frame may
persist. Read-only CSS/DOM changes must not trigger unexpected board saves.

| Scenario | Precise actions and assertions | Applies to |
| --- | --- | --- |
| R1 visibility/accent | Empty/native/edge/independent/comment/mixed selection; toggle map, zoom/board menus, developer row and review; close/reopen; middle-pan with populated/empty native menu; M2 primary buttons rest/hover/disabled. Hidden roots/descendants have zero rect, no hit/focus; native snapshot is inert and absent for independent-only state. | C1, S2 dock/M2/toolbar |
| R2 resize/selection/preview | Select native card, rotated shape, attachment and frame; mixed rectangle/lasso includes a native edge, a comment, one connector end and a crossing-only body whose far end stays outside. Repeat drag twice, resize side/corner, rotate; inspect ALL attached native/plugin/connector-chain paths while pointer is held before release. Commit once, Undo/Redo; repeat with Escape/pointercancel/blur, verifying original geometry and no undo/save on cancel. One visible marquee and native outline; no native corner grips alongside plugin grips. | C2/C3/C4/C8/C9/C10 and S2 gestures/handles |
| R3 object paint | Drawing/line/text/sticky/shape/table/code/link-preview/document/embed/deck/slide/group/mindmap fixture set. Unselected/selected/locked/review, clear/opaque/translucent fill, border none/dashed. Native rounded card paint occurs once; vector contours stay visible; line and group selection cues remain correct. Convert card→shape, Undo, edit and reopen; late content rebuild does not resurrect prior fills. | C4, C9, editor DOM |
| R4 text layout | Short and overflowing text top/middle/bottom; non-square inset shape; sticky automatic fit then explicit font size, including imported inline span/div/p font-size+line-height; edit/add long words; tables multiline cells; code 1/9/10/100 lines and numbering toggle, direct and wrapped p/pre markup, distinct ordinary paragraphs. Measure sizer and gutter/line layout after late Markdown replacement and font readiness at each zoom. | C5, C4 code/table, font/editor DOM |
| R5 selected link | Click preview/document once to select, drag its face, release/CANCEL; click explicit Open link; switch selection/reselect and enter/exit native editing. The blocker owns the drag, no iframe/page navigation occurs on selection, and explicit links still work. Test link versus file/text hosts separately. | C6, media C4, toolbar DOM |
| R6 presentation/export | Start a deck, next/previous/first/last, Escape/Close, reopen; then export an actual multi-page PDF containing rotated text/shapes/edges/table/code. Observe no menus/pins/panels/selection/page tabs in page pixels. Success, Stop mid-tile and controlled renderer failure restore camera, screenshotting flag, existing folded/hidden state and both export roots. Progress Stop remains reachable on narrow screens. | C7 plus every content/layout change |
| R7 comment point/hit | Pins on board/card/image/native edge/plugin connector; open/help/close/outside/reopen, reply/resolve. At 50/125% measure 32x32 and tail at exact projected anchor; press near tail and bubble center; drag beyond threshold while inspecting attached paths before release; tap must not drag, drag must not open thread. CANCEL/blur returns point and no history; commit one step/Undo/Redo. Test imported locked and local pins, resolved tick versus initial. | C8, comment DOM, author settings |
| R8 rotation/composition | Text/sticky/shape/file/image at 15/45/90 degrees far from board origin; focus/blur owner window; native selection/move/resize transforms rewritten, shallow/deep Markdown previews; zoom and device-pixel-ratio screenshots for text/contour sharpness. Shell translate stays current with one rotation suffix; preview composition is correct; paths follow held gesture; no leaked rotate/transform-origin/style on unload and newer host writes survive. | C9, rotated C4, owner/editor DOM |
| R9 layer | Overlap three cards and nested frames; send selected back card backward/back, then select/drag it, resize/rotate and Undo/Redo; mixed/multi/group selection, deselect, reopen and plugin off. Card never jumps in front; frames stay below; selecting/moving alone does not rewrite node order. Dispose removes only selected-layer class/variable. | C10, paint/group/handles, S2 M1 |
| R10 realm/settings | Windows popout board plus separate Settings window; open/rebuild/close controls in owning document, close owner with timers/debounce pending. Section navigation by keyboard/touch, scroll far down; reorder/hide/reset tools/fonts, custom font picker cancel/add/rename/remove, authors/colors, slider boundaries and failed download via existing test endpoint only. Native settings search locates definitions on supported SDK versions; repeated update does not jump scroll/focus or drop other device layouts. Mobile word selection and open keyboard: font/More popovers clamp above toolbar. | S2/S4/S5/S6, C1/C5/C8 |
| R11 mouse/tool cursor | Real Windows mouse across background, card/Markdown, selected card/edge/plugin connector and descendants in select/pen/highlighter/smart/erasers/creation/lasso. Hover and drag native handles, text editor, then Escape/CANCEL and unload. Correct brush/crosshair/move/native edit cursor returns without a stale cursor, and controls remain reachable. | C3, quick tools/pen DOM |

Device/input ownership remains with the coordinator. The register records:

- Windows 10.0.19045.6456 / Obsidian 1.14.4: isolated vault/profile, main board
  plus popout and separate Settings window. Real OS mouse/keyboard scenarios
  require the coordinator's authorized input lane. Background CDP renderer
  mouse/key synthesis must be labeled as such; it is not OS-input evidence.
- Samsung SM-X736B / R52Y808PDJB / Obsidian 1.13.8, MiroCanvasTest, recorded
  753x1204 CSS px: run R1-R10 by real ADB taps/swipes/down-move-up/cancel,
  portrait/landscape and keyboard open. Physical S Pen hover/pressure/palm
  handling in R2/R8/R10 is a separate human-input check; ADB stylus-source or
  CDP pressure injection cannot claim physical stylus handling. C3 mouse cursor
  requires a mouse; touch/pen alone does not verify it.
- Samsung SM-A336E / RZCW101PJVN / Obsidian 1.12.7, MiroCanvasTest: run the
  same affected tap/drag/CANCEL suites on narrow portrait and landscape, including
  keyboard selection/toolbar wrapping/pin hit/Stop. This is extra legacy evidence
  below manifest minAppVersion 1.13.7, not proof of S6 definitions on supported
  versions. Record current dimensions/version/connectivity at run time rather
  than infer them from earlier results. This audit made no device query.

For each model record app/build, theme, viewport/zoom, real ADB input versus
CDP/DOM setup/probes versus physical stylus independently. Restore test board,
settings, camera and device orientation. Existing L17/L18 results are historical
evidence for their builds, not fresh evidence for any new CSS or DOM patch.

Focused suites listed above, new narrow assertions where behavior actually
changes, integrated types/units/lint/CSS/schema/smokes/oracle, and production
build/installed-host checks are all coordinator-owned pending gates. This audit
ran none of them and does not certify full integration.

## Result and remaining risks

Concrete patch: this audit document only. Warning delta attributable to
INTERFACE: **0**. No implementation warning was removed and no runtime
equivalence/build claim is needed for an unchanged implementation. The audit
proposes a DAG, complete per-site CSS coverage, exclusive slice partition and
regression/input scenarios; it does not authorize the held semantic changes.

Performed static validation: all 83 inventory selectors/property sites appear
in Appendix A; all 113 S2 diagnostics across 21 modules appear in Appendix B;
the proposed slices partition 83 sites exactly once. styles.css SHA-256 matches
the inventory (`572acf04c0fc163ebeba19847f34d29441b901756bec23e722164424bb3eff28`).
The document is UTF-8 without BOM with CRLF. Own-document whitespace validation
uses git diff --no-index --check against an exclusive empty baseline because
this new document is untracked. Proof and whitespace output are in
[audit-proof.json](../../tools/obsidian_cdp/.out/l19-worker-artifacts/interface/audit-proof.json) and
[diff-check.txt](../../tools/obsidian_cdp/.out/l19-worker-artifacts/interface/diff-check.txt). This is static audit
evidence, not ESLint, unit, integration, browser or app-input evidence.

Risks: actual installed native/theme/optional-plugin inline writes can differ
by version; broad descendant styling can conceal double paint or stale hit
geometry; a new observer can add per-card/per-frame work; helper migrations
can switch DOM realm or namespace; S6 can bypass custom settings persistence;
native menu/style hooks must not clobber a later plugin owner on teardown.
Keep all these decisions at explicit reviewed patch boundaries. Shared inventory,
register, guides, production bundles and device state remain outside this worker.

## Appendix A: exact CSS selectors and declaration sites

Generated from the unchanged shared inventory; values below include their
current priority. Repeated selectors are combined only when the full selector
string matches. Every line/property is listed, for 83 declarations total.

### C1: 3 declarations

```css
.miro-canvas-dock[hidden],
.miro-canvas-dock [hidden]
```

- `styles.css:80` — `display: none !important;`

```css
.miro-canvas-m2-tools__primary-action
```

- `styles.css:666` — `background: var(--interactive-accent) !important;`

```css
.miro-canvas-toolbar[data-miro-independent-only="true"] .canvas-menu,
.miro-canvas-toolbar[data-miro-independent-only="true"] .miro-canvas-toolbar__native-snapshot
```

- `styles.css:2271` — `display: none !important;`

### C2: 2 declarations

```css
.miro-canvas-root .canvas-controls
```

- `styles.css:54` — `display: none !important;`

```css
.miro-canvas-root .canvas-node-interaction-layer .canvas-node-resizer
```

- `styles.css:2081` — `display: none !important;`

### C3: 3 declarations

```css
.miro-canvas-root:is(
  [data-miro-canvas-tool="pen"],
  [data-miro-canvas-tool="highlighter"],
  [data-miro-canvas-tool="smart"],
  [data-miro-canvas-tool="eraser"],
  [data-miro-canvas-tool="erase-part"]
) :is(.canvas, .canvas *)
```

- `styles.css:1595` — `cursor: none !important;`

```css
.miro-canvas-root[data-miro-canvas-tool]:not(
  [data-miro-canvas-tool="select"],
  [data-miro-canvas-tool="pen"],
  [data-miro-canvas-tool="highlighter"],
  [data-miro-canvas-tool="smart"],
  [data-miro-canvas-tool="eraser"],
  [data-miro-canvas-tool="erase-part"]
) :is(.canvas, .canvas *)
```

- `styles.css:1606` — `cursor: crosshair !important;`

```css
.miro-canvas-root[data-miro-canvas-tool="lasso"] :is(.canvas-node.is-focused, .canvas-node.is-selected, .canvas-edge.is-focused, .miro-board-connector.is-focused),
.miro-canvas-root[data-miro-canvas-tool="lasso"] :is(.canvas-node.is-focused, .canvas-node.is-selected, .canvas-edge.is-focused, .miro-board-connector.is-focused) *
```

- `styles.css:1617` — `cursor: move !important;`

### C4: 39 declarations

```css
.miro-source-code,
.miro-source-code > .canvas-node-container,
.miro-source-code .canvas-node-content,
.miro-source-code .markdown-preview-view,
.miro-source-code .markdown-embed
```

- `styles.css:2634` — `background-color: transparent !important;`
- `styles.css:2635` — `border-color: transparent !important;`
- `styles.css:2636` — `box-shadow: none !important;`

```css
.miro-source-deck > .canvas-node-container
```

- `styles.css:2939` — `background-color: var(--background-primary) !important;`
- `styles.css:2940` — `border-color: transparent !important;`
- `styles.css:2942` — `box-shadow: 0 1px 3px rgb(0 0 0 / 10%), 0 6px 20px rgb(0 0 0 / 10%) !important;`

```css
.miro-source-drawing,
.miro-source-drawing > .canvas-node-container,
.miro-source-drawing .canvas-node-content
```

- `styles.css:1296` — `background-color: transparent !important;`
- `styles.css:1297` — `border-color: transparent !important;`
- `styles.css:1298` — `box-shadow: none !important;`

```css
.miro-source-embed > .canvas-node-container
```

- `styles.css:2792` — `background: var(--background-primary) !important;`

```css
.miro-source-group .canvas-node-content
```

- `styles.css:3039` — `background-color: transparent !important;`

```css
.miro-source-group > .canvas-node-container
```

- `styles.css:3033` — `background-color: transparent !important;`
- `styles.css:3034` — `border-color: transparent !important;`
- `styles.css:3035` — `box-shadow: none !important;`

```css
.miro-source-group.is-selected > .canvas-node-container,
.miro-source-group.is-focused > .canvas-node-container
```

- `styles.css:3048` — `border: 1px dashed var(--interactive-accent) !important;`

```css
.miro-source-line.is-focused > .canvas-node-container,
.miro-source-line.is-selected > .canvas-node-container
```

- `styles.css:1346` — `box-shadow: none !important;`
- `styles.css:1347` — `outline: none !important;`

```css
.miro-source-mindmap-node,
.miro-source-mindmap-node > .canvas-node-container,
.miro-source-mindmap-node .canvas-node-content,
.miro-source-mindmap-node .markdown-preview-view
```

- `styles.css:3143` — `background-color: transparent !important;`
- `styles.css:3144` — `border-color: transparent !important;`
- `styles.css:3145` — `box-shadow: none !important;`

```css
.miro-source-preview > .canvas-node-container,
.miro-source-document > .canvas-node-container,
.miro-source-embed > .canvas-node-container
```

- `styles.css:2785` — `border-color: transparent !important;`
- `styles.css:2787` — `box-shadow: 0 1px 2px rgb(0 0 0 / 8%), 0 4px 14px rgb(0 0 0 / 14%) !important;`

```css
.miro-source-slide > .canvas-node-container
```

- `styles.css:2951` — `border: 1px solid var(--background-modifier-border) !important;`
- `styles.css:2953` — `box-shadow: none !important;`

```css
.miro-source-sticky,
.miro-source-sticky > .canvas-node-container,
.miro-source-sticky .canvas-node-content,
.miro-source-sticky .markdown-preview-view,
.miro-source-sticky .markdown-embed
```

- `styles.css:2493` — `background-color: transparent !important;`
- `styles.css:2494` — `border-color: transparent !important;`
- `styles.css:2495` — `box-shadow: none !important;`

```css
.miro-source-table,
.miro-source-table > .canvas-node-container,
.miro-source-table .canvas-node-content,
.miro-source-table .markdown-preview-view,
.miro-source-table .markdown-embed
```

- `styles.css:2575` — `background-color: transparent !important;`
- `styles.css:2576` — `border-color: transparent !important;`
- `styles.css:2577` — `box-shadow: none !important;`

```css
.miro-source-text:is([data-miro-source-id], [data-miro-local-item="text"]):not([data-miro-source-card-kind], .miro-source-mindmap-node) > .canvas-node-container,
.miro-source-text:is([data-miro-source-id], [data-miro-local-item="text"]):not([data-miro-source-card-kind], .miro-source-mindmap-node) .canvas-node-content,
.miro-source-text:is([data-miro-source-id], [data-miro-local-item="text"]):not([data-miro-source-card-kind], .miro-source-mindmap-node) .markdown-preview-view,
.miro-source-text:is([data-miro-source-id], [data-miro-local-item="text"]):not([data-miro-source-card-kind], .miro-source-mindmap-node) .markdown-embed
```

- `styles.css:2468` — `background-color: transparent !important;`
- `styles.css:2469` — `border-color: transparent !important;`
- `styles.css:2470` — `box-shadow: none !important;`

```css
[data-miro-source-kind="shape"],
[data-miro-source-kind="shape"] > .canvas-node-container,
[data-miro-source-kind="shape"] .canvas-node-content,
[data-miro-source-kind="shape"] .markdown-preview-view,
[data-miro-source-kind="shape"] .markdown-embed
```

- `styles.css:2456` — `background-color: transparent !important;`
- `styles.css:2457` — `border-color: transparent !important;`
- `styles.css:2458` — `box-shadow: none !important;`

```css
[data-miro-source-kind="shape"][data-miro-source-rotated="true"]
```

- `styles.css:3660` — `background-color: transparent !important;`
- `styles.css:3661` — `border-color: transparent !important;`
- `styles.css:3662` — `box-shadow: none !important;`

### C5: 26 declarations

```css
.miro-canvas-root [data-miro-canvas-vertical-align="middle"] .markdown-preview-view > .markdown-preview-sizer,
.miro-canvas-root [data-miro-canvas-vertical-align="bottom"] .markdown-preview-view > .markdown-preview-sizer
```

- `styles.css:36` — `flex: 0 0 auto !important;`
- `styles.css:37` — `min-height: 0 !important;`
- `styles.css:38` — `padding-bottom: 0 !important;`

```css
.miro-source-code .markdown-preview-view
```

- `styles.css:2667` — `padding: 0 !important;`

```css
.miro-source-code .markdown-preview-view > .markdown-preview-sizer
```

- `styles.css:2673` — `flex: 0 0 auto !important;`
- `styles.css:2674` — `min-height: 0 !important;`
- `styles.css:2675` — `padding-bottom: 0 !important;`

```css
.miro-source-code .markdown-preview-view pre
```

- `styles.css:2685` — `margin: 0 !important;`
- `styles.css:2686` — `padding: 10px 14px !important;`
- `styles.css:2688` — `color: var(--miro-code-ink) !important;`
- `styles.css:2689` — `font-family: var(--font-monospace) !important;`
- `styles.css:2690` — `white-space: pre !important;`
- `styles.css:2691` — `background: transparent !important;`
- `styles.css:2692` — `border: 0 !important;`
- `styles.css:2693` — `border-radius: 0 !important;`

```css
.miro-source-code[data-miro-source-code-numbered="true"] .markdown-preview-view pre
```

- `styles.css:2703` — `padding-left: calc(var(--miro-code-gutter, 1ch) + 32px) !important;`

```css
.miro-source-rendered[data-miro-source-valign] .markdown-preview-view > .markdown-preview-sizer
```

- `styles.css:2544` — `flex: 0 0 auto !important;`
- `styles.css:2545` — `min-height: 0 !important;`
- `styles.css:2546` — `padding-bottom: 0 !important;`

```css
.miro-source-sticky .markdown-preview-view
```

- `styles.css:2516` — `padding: 8% !important;`

```css
.miro-source-sticky[data-miro-source-fit="true"] .markdown-preview-view :is(div, p, span)[style]
```

- `styles.css:2559` — `font-size: inherit !important;`
- `styles.css:2560` — `line-height: inherit !important;`

```css
.miro-source-table .markdown-preview-view
```

- `styles.css:2581` — `padding: 0 !important;`

```css
.miro-source-table .markdown-preview-view > .markdown-preview-sizer
```

- `styles.css:2587` — `height: 100% !important;`
- `styles.css:2588` — `min-height: 0 !important;`
- `styles.css:2589` — `padding: 0 !important;`

### C6: 1 declaration

```css
.miro-source-preview[data-miro-source-host="link"].is-focused .canvas-node-content-blocker,
.miro-source-document[data-miro-source-host="link"].is-focused .canvas-node-content-blocker
```

- `styles.css:2803` — `display: block !important;`

### C7: 2 declarations

```css
.is-screenshotting :is(
  .miro-canvas-panel,
  .miro-canvas-dock,
  .miro-canvas-dock__map,
  .miro-canvas-thread,
  .miro-canvas-slideshow,
  .miro-canvas-toolbar,
  .miro-canvas-comment-markers,
  .miro-canvas-handles,
  .miro-canvas-minimap,
  .miro-canvas-m2-tools,
  .miro-canvas-mixed-selection-frame,
  .miro-canvas-export-pages,
  .miro-source-deck-bar,
  .canvas-card-menu,
  .canvas-menu
)
```

- `styles.css:3086` — `display: none !important;`

```css
.miro-canvas-presenting :is(
  .miro-canvas-dock,
  .miro-canvas-toolbar,
  .miro-canvas-handles,
  .miro-canvas-comment-markers,
  .miro-canvas-minimap,
  .canvas-card-menu,
  .canvas-menu
)
```

- `styles.css:3061` — `display: none !important;`

### C8: 3 declarations

```css
.miro-canvas-comment-markers .miro-canvas-comment-marker
```

- `styles.css:3187` — `min-width: 32px !important;`
- `styles.css:3188` — `min-height: 32px !important;`
- `styles.css:3198` — `transform: translate(0, -100%) !important;`

### C9: 3 declarations

```css
[data-miro-source-rotated="true"] .canvas-node-content,
[data-miro-source-rotated="true"] .markdown-preview-view
```

- `styles.css:3649` — `backface-visibility: visible !important;`
- `styles.css:3650` — `will-change: auto !important;`

```css
[data-miro-source-rotated="true"] .markdown-preview-view
```

- `styles.css:3654` — `transform: none !important;`

### C10: 1 declaration

```css
.canvas-node.miro-canvas-layer-shown
```

- `styles.css:3669` — `z-index: var(--miro-canvas-layer) !important;`

## Appendix B: exact UI warning sites

The complete S2 site list and adjacent validator/UI/environment API sites follow.
Counts denote diagnostics, so duplicate rules on a single source expression
remain separate. These are inventory locations, not current edited-file offsets.

### S2 inventoried sites

**src/board-export.ts (10 diagnostics)**

- `src/board-export.ts:54:20` — ExportPanel; `obsidianmd/prefer-create-el`; `this.element = document.createElement("div");`
- `src/board-export.ts:154:21` — ExportPanel / add / element; `obsidianmd/prefer-create-el`; `const element = this.document.createElement(tag);`
- `src/board-export.ts:216:20` — ExportOverlay; `obsidianmd/prefer-create-el`; `this.element = document.createElement("div");`
- `src/board-export.ts:247:44` — ExportOverlay / buildPage / frame; `obsidianmd/prefer-create-el`; `const frame = this.element.appendChild(this.document.createElement("div"));`
- `src/board-export.ts:250:35` — ExportOverlay / buildPage / tab; `obsidianmd/prefer-create-el`; `const tab = frame.appendChild(this.document.createElement("div"));`
- `src/board-export.ts:256:40` — ExportOverlay / buildPage / corner; `obsidianmd/prefer-create-el`; `const corner = frame.appendChild(this.document.createElement("div"));`
- `src/board-export.ts:388:18` — capturePages / status; `obsidianmd/prefer-create-el`; `const status = document.createElement("div");`
- `src/board-export.ts:391:17` — capturePages / label; `obsidianmd/prefer-create-el`; `const label = document.createElement("span");`
- `src/board-export.ts:392:16` — capturePages / stop; `obsidianmd/prefer-create-el`; `const stop = document.createElement("button");`
- `src/board-export.ts:419:21` — capturePages / sheet; `obsidianmd/prefer-create-el`; `const sheet = document.createElement("canvas");`

**src/board-search-bar.ts (1 diagnostics)**

- `src/board-search-bar.ts:195:21` — BoardSearchBar / make / element; `obsidianmd/prefer-create-el`; `const element = this.document.createElement(tag);`

**src/comment-markers.ts (4 diagnostics)**

- `src/comment-markers.ts:157:20` — CommentMarkers; `obsidianmd/prefer-create-el`; `this.element = dom.createElement("div");`
- `src/comment-markers.ts:189:24` — CommentMarkers / update / button; `obsidianmd/prefer-create-el`; `const button = this.document.createElement("button");`
- `src/comment-markers.ts:350:21` — CommentMarkers / createPin / initial; `obsidianmd/prefer-create-el`; `const initial = this.document.createElement("span");`
- `src/comment-markers.ts:352:18` — CommentMarkers / createPin / tick; `obsidianmd/prefer-create-el`; `const tick = this.document.createElement("span");`

**src/comment-thread.ts (1 diagnostics)**

- `src/comment-thread.ts:423:21` — CommentThreadCard / make / element; `obsidianmd/prefer-create-el`; `const element = this.document.createElement(tag);`

**src/comments-panel.ts (1 diagnostics)**

- `src/comments-panel.ts:67:19` — make / element; `obsidianmd/prefer-create-el`; `const element = document.createElement(tag);`

**src/connector-labels.ts (3 diagnostics)**

- `src/connector-labels.ts:73:20` — ConnectorLabels; `obsidianmd/prefer-create-el`; `this.element = document.createElement("div");`
- `src/connector-labels.ts:205:21` — ConnectorLabels / add / wrapper; `obsidianmd/prefer-create-el`; `const wrapper = this.document.createElement("div");`
- `src/connector-labels.ts:208:39` — ConnectorLabels / add / label; `obsidianmd/prefer-create-el`; `const label = wrapper.appendChild(this.document.createElement("div"));`

**src/document-controls.ts (7 diagnostics)**

- `src/document-controls.ts:16:20` — DocumentControls; `obsidianmd/prefer-create-el`; `this.element = document.createElement("section");`
- `src/document-controls.ts:18:21` — DocumentControls / heading; `obsidianmd/prefer-create-el`; `const heading = document.createElement("h3");`
- `src/document-controls.ts:21:19` — DocumentControls; `obsidianmd/prefer-create-el`; `this.status = document.createElement("p");`
- `src/document-controls.ts:25:22` — DocumentControls; `obsidianmd/prefer-create-el`; `this.pageInput = document.createElement("input");`
- `src/document-controls.ts:32:21` — DocumentControls; `obsidianmd/prefer-create-el`; `this.fitInput = document.createElement("select");`
- `src/document-controls.ts:35:22` — DocumentControls / option; `obsidianmd/prefer-create-el`; `const option = document.createElement("option");`
- `src/document-controls.ts:41:23` — DocumentControls / button / control; `obsidianmd/prefer-create-el`; `const control = document.createElement("button");`

**src/editor-appearance.ts (1 diagnostics)**

- `src/editor-appearance.ts:111:19` — ownedStyleElement / created; `obsidianmd/prefer-create-el`; `const created = doc.createElement("style");`

**src/font-packs.ts (1 diagnostics)**

- `src/font-packs.ts:463:19` — FontFaceRegistry / attach / style; `obsidianmd/prefer-create-el`; `const style = doc.createElement("style");`

**src/import-guide.ts (1 diagnostics)**

- `src/import-guide.ts:103:18` — make / element; `obsidianmd/prefer-create-el`; `const element = document.createElement(tag);`

**src/m1-controls.ts (1 diagnostics)**

- `src/m1-controls.ts:216:18` — makeElement / element; `obsidianmd/prefer-create-el`; `const element = document.createElement(tag);`

**src/m1-session.ts (13 diagnostics)**

- `src/m1-session.ts:2102:15` — M1CanvasSession / ensureSearchBar / hit; `obsidianmd/prefer-create-el`; `const hit = document.createElement("div");`
- `src/m1-session.ts:4272:19` — M1CanvasSession / rectangleSelect / marquee; `obsidianmd/prefer-create-el`; `const marquee = root.ownerDocument.createElement("div");`
- `src/m1-session.ts:4696:18` — M1CanvasSession / moveBrush / brush; `obsidianmd/prefer-create-el`; `const brush = root.ownerDocument.createElement("div");`
- `src/m1-session.ts:4983:6` — M1CanvasSession / startToolGesture / ghost; `obsidianmd/prefer-create-el`; `? document.createElementNS("http://www.w3.org/2000/svg", "svg") as unknown as HTMLElement`
- `src/m1-session.ts:4984:6` — M1CanvasSession / startToolGesture / ghost; `obsidianmd/prefer-create-el`; `: document.createElement("div");`
- `src/m1-session.ts:4990:22` — M1CanvasSession / startToolGesture / line; `obsidianmd/prefer-create-el`; `const line = svg ? document.createElementNS("http://www.w3.org/2000/svg", pressurePen ? "path" : tool === "lasso" ? "polygon" : "polyline") : undefined;`
- `src/m1-session.ts:5262:17` — M1CanvasSession / startLine / ghost; `obsidianmd/prefer-create-el`; `const ghost = document.createElementNS("http://www.w3.org/2000/svg", "svg");`
- `src/m1-session.ts:5264:17` — M1CanvasSession / startLine / shape; `obsidianmd/prefer-create-el`; `const shape = document.createElementNS("http://www.w3.org/2000/svg", spec.block === true ? "polygon" : "path");`
- `src/m1-session.ts:5820:16` — M1CanvasSession / promptLink / form; `obsidianmd/prefer-create-el`; `const form = document.createElement("form");`
- `src/m1-session.ts:5825:17` — M1CanvasSession / promptLink / input; `obsidianmd/prefer-create-el`; `const input = document.createElement("input");`
- `src/m1-session.ts:7526:18` — M1CanvasSession / updateMixedSelectionFrame / frame; `obsidianmd/prefer-create-el`; `const frame = root.ownerDocument.createElement("div");`
- `src/m1-session.ts:7530:23` — M1CanvasSession / updateMixedSelectionFrame; `obsidianmd/prefer-create-el`; `frame.appendChild(root.ownerDocument.createElement("div")).className = \`miro-canvas-mixed-selection-frame__${side}\`;`
- `src/m1-session.ts:8505:18` — M1CanvasSession / refreshDecorations / label; `obsidianmd/prefer-create-el`; `const label = document.createElement("span");`

**src/m2-tools.ts (35 diagnostics)**

- `src/m2-tools.ts:70:19` — appendLabeled / wrapper; `obsidianmd/prefer-create-el`; `const wrapper = document.createElement("label");`
- `src/m2-tools.ts:72:16` — appendLabeled / text; `obsidianmd/prefer-create-el`; `const text = document.createElement("span");`
- `src/m2-tools.ts:109:20` — M2CanvasTools; `obsidianmd/prefer-create-el`; `this.element = document.createElement("div");`
- `src/m2-tools.ts:111:19` — M2CanvasTools; `obsidianmd/prefer-create-el`; `this.status = document.createElement("p");`
- `src/m2-tools.ts:116:25` — M2CanvasTools / shapeFields; `obsidianmd/prefer-create-el`; `const shapeFields = document.createElement("fieldset");`
- `src/m2-tools.ts:118:25` — M2CanvasTools / shapeLegend; `obsidianmd/prefer-create-el`; `const shapeLegend = document.createElement("legend");`
- `src/m2-tools.ts:121:23` — M2CanvasTools / shapeGrid; `obsidianmd/prefer-create-el`; `const shapeGrid = document.createElement("div");`
- `src/m2-tools.ts:124:84` — M2CanvasTools / shape; `obsidianmd/prefer-create-el`; `const shape = appendLabeled(document, shapeGrid, words().localTools.shapeKind, document.createElement("select"));`
- `src/m2-tools.ts:126:22` — M2CanvasTools / option; `obsidianmd/prefer-create-el`; `const option = document.createElement("option");`
- `src/m2-tools.ts:131:88` — M2CanvasTools / shapeText; `obsidianmd/prefer-create-el`; `const shapeText = appendLabeled(document, shapeGrid, words().localTools.shapeText, document.createElement("input"));`
- `src/m2-tools.ts:135:21` — M2CanvasTools / shapeNumber / input; `obsidianmd/prefer-create-el`; `const input = document.createElement("input");`
- `src/m2-tools.ts:145:25` — M2CanvasTools / createShape; `obsidianmd/prefer-create-el`; `const createShape = document.createElement("button");`
- `src/m2-tools.ts:187:26` — M2CanvasTools / anchorFields; `obsidianmd/prefer-create-el`; `const anchorFields = document.createElement("fieldset");`
- `src/m2-tools.ts:189:20` — M2CanvasTools / legend; `obsidianmd/prefer-create-el`; `const legend = document.createElement("legend");`
- `src/m2-tools.ts:192:24` — M2CanvasTools / anchorGrid; `obsidianmd/prefer-create-el`; `const anchorGrid = document.createElement("div");`
- `src/m2-tools.ts:196:21` — M2CanvasTools / number / input; `obsidianmd/prefer-create-el`; `const input = document.createElement("input");`
- `src/m2-tools.ts:204:94` — M2CanvasTools; `obsidianmd/prefer-create-el`; `this.anchorTarget = appendLabeled(document, anchorGrid, words().localTools.anchorTarget, document.createElement("select"));`
- `src/m2-tools.ts:205:18` — M2CanvasTools / save; `obsidianmd/prefer-create-el`; `const save = document.createElement("button");`
- `src/m2-tools.ts:218:29` — M2CanvasTools / connectorFields; `obsidianmd/prefer-create-el`; `const connectorFields = document.createElement("fieldset");`
- `src/m2-tools.ts:220:29` — M2CanvasTools / connectorLegend; `obsidianmd/prefer-create-el`; `const connectorLegend = document.createElement("legend");`
- `src/m2-tools.ts:223:27` — M2CanvasTools / connectorGrid; `obsidianmd/prefer-create-el`; `const connectorGrid = document.createElement("div");`
- `src/m2-tools.ts:226:100` — M2CanvasTools; `obsidianmd/prefer-create-el`; `this.connectorEdge = appendLabeled(document, connectorGrid, words().localTools.connectorField, document.createElement("select"));`
- `src/m2-tools.ts:227:102` — M2CanvasTools; `obsidianmd/prefer-create-el`; `this.connectorEnd = appendLabeled(document, connectorGrid, words().localTools.connectorEndField, document.createElement("select"));`
- `src/m2-tools.ts:229:22` — M2CanvasTools / option; `obsidianmd/prefer-create-el`; `const option = document.createElement("option");`
- `src/m2-tools.ts:234:25` — M2CanvasTools / setEndpoint; `obsidianmd/prefer-create-el`; `const setEndpoint = document.createElement("button");`
- `src/m2-tools.ts:255:28` — M2CanvasTools / geometryFields; `obsidianmd/prefer-create-el`; `const geometryFields = document.createElement("fieldset");`
- `src/m2-tools.ts:257:28` — M2CanvasTools / geometryLegend; `obsidianmd/prefer-create-el`; `const geometryLegend = document.createElement("legend");`
- `src/m2-tools.ts:260:26` — M2CanvasTools / geometryGrid; `obsidianmd/prefer-create-el`; `const geometryGrid = document.createElement("div");`
- `src/m2-tools.ts:263:29` — M2CanvasTools / geometryActions; `obsidianmd/prefer-create-el`; `const geometryActions = document.createElement("div");`
- `src/m2-tools.ts:265:22` — M2CanvasTools / rotation; `obsidianmd/prefer-create-el`; `const rotation = document.createElement("input");`
- `src/m2-tools.ts:270:27` — M2CanvasTools / applyRotation; `obsidianmd/prefer-create-el`; `const applyRotation = document.createElement("button");`
- `src/m2-tools.ts:285:22` — M2CanvasTools / button; `obsidianmd/prefer-create-el`; `const button = document.createElement("button");`
- `src/m2-tools.ts:326:20` — M2CanvasTools / hint; `obsidianmd/prefer-create-el`; `const hint = document.createElement("p");`
- `src/m2-tools.ts:447:21` — M2CanvasTools / syncSelect / empty; `obsidianmd/prefer-create-el`; `const empty = this.document.createElement("option");`
- `src/m2-tools.ts:452:24` — M2CanvasTools / syncSelect / option; `obsidianmd/prefer-create-el`; `const option = this.document.createElement("option");`

**src/main.ts (2 diagnostics)**

- `src/main.ts:725:21` — MiroCanvasPlugin / openFileSourceMenu / input; `obsidianmd/prefer-create-el`; `const input = button.ownerDocument.createElement("input");`
- `src/main.ts:1134:21` — MiroCanvasPlugin / pickFontFile / input; `obsidianmd/prefer-create-el`; `const input = document.createElement("input");`

**src/panel-arrange.ts (18 diagnostics)**

- `src/panel-arrange.ts:144:19` — PanelArrangeMode / enter; `obsidianmd/prefer-create-el`; `this.banner = document.createElement("div");`
- `src/panel-arrange.ts:147:42` — PanelArrangeMode / enter / text; `obsidianmd/prefer-create-el`; `const text = this.banner.appendChild(document.createElement("span"));`
- `src/panel-arrange.ts:150:43` — PanelArrangeMode / enter / reset; `obsidianmd/prefer-create-el`; `const reset = this.banner.appendChild(document.createElement("button"));`
- `src/panel-arrange.ts:155:42` — PanelArrangeMode / enter / done; `obsidianmd/prefer-create-el`; `const done = this.banner.appendChild(document.createElement("button"));`
- `src/panel-arrange.ts:162:17` — PanelArrangeMode / enter; `obsidianmd/prefer-create-el`; `this.tray = document.createElement("div");`
- `src/panel-arrange.ts:165:43` — PanelArrangeMode / enter / heading; `obsidianmd/prefer-create-el`; `const heading = this.tray.appendChild(document.createElement("div"));`
- `src/panel-arrange.ts:168:43` — PanelArrangeMode / enter; `obsidianmd/prefer-create-el`; `this.trayList = this.tray.appendChild(document.createElement("div"));`
- `src/panel-arrange.ts:181:22` — PanelArrangeMode / enter / handle; `obsidianmd/prefer-create-el`; `const handle = document.createElement("span");`
- `src/panel-arrange.ts:186:39` — PanelArrangeMode / enter / grip; `obsidianmd/prefer-create-el`; `const grip = handle.appendChild(document.createElement("span"));`
- `src/panel-arrange.ts:190:24` — PanelArrangeMode / enter / resize; `obsidianmd/prefer-create-el`; `const resize = document.createElement("button");`
- `src/panel-arrange.ts:201:39` — PanelArrangeMode / enter / flip; `obsidianmd/prefer-create-el`; `const flip = handle.appendChild(document.createElement("button"));`
- `src/panel-arrange.ts:272:36` — PanelArrangeMode / renderTray / row; `obsidianmd/prefer-create-el`; `const row = list.appendChild(document.createElement("div"));`
- `src/panel-arrange.ts:275:36` — PanelArrangeMode / renderTray / icon; `obsidianmd/prefer-create-el`; `const icon = row.appendChild(document.createElement("span"));`
- `src/panel-arrange.ts:278:37` — PanelArrangeMode / renderTray / label; `obsidianmd/prefer-create-el`; `const label = row.appendChild(document.createElement("span"));`
- `src/panel-arrange.ts:535:19` — PanelArrangeMode / startItemDrag / ghost; `obsidianmd/prefer-create-el`; `const ghost = document.createElement("div");`
- `src/panel-arrange.ts:537:36` — PanelArrangeMode / startItemDrag / icon; `obsidianmd/prefer-create-el`; `const icon = ghost.appendChild(document.createElement("span"));`
- `src/panel-arrange.ts:540:37` — PanelArrangeMode / startItemDrag / label; `obsidianmd/prefer-create-el`; `const label = ghost.appendChild(document.createElement("span"));`
- `src/panel-arrange.ts:543:20` — PanelArrangeMode / startItemDrag / marker; `obsidianmd/prefer-create-el`; `const marker = document.createElement("div");`

**src/panel-visibility.ts (1 diagnostics)**

- `src/panel-visibility.ts:31:22` — PanelVisibility / mount / button; `obsidianmd/prefer-create-el`; `const button = this.host.document.createElement("button");`

**src/pen-tooltips.ts (2 diagnostics)**

- `src/pen-tooltips.ts:194:21` — PenTooltips / show / tooltip; `obsidianmd/prefer-create-el`; `const tooltip = state.document.createElement("div");`
- `src/pen-tooltips.ts:201:19` — PenTooltips / show / arrow; `obsidianmd/prefer-create-el`; `const arrow = state.document.createElement("div");`

**src/quick-tools.ts (6 diagnostics)**

- `src/quick-tools.ts:313:15` — linePicture / svg; `obsidianmd/prefer-create-el`; `const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");`
- `src/quick-tools.ts:317:16` — linePicture / path; `obsidianmd/prefer-create-el`; `const path = document.createElementNS("http://www.w3.org/2000/svg", "path");`
- `src/quick-tools.ts:331:15` — shapesPicture / svg; `obsidianmd/prefer-create-el`; `const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");`
- `src/quick-tools.ts:335:18` — shapesPicture / square; `obsidianmd/prefer-create-el`; `const square = document.createElementNS("http://www.w3.org/2000/svg", "rect");`
- `src/quick-tools.ts:338:18` — shapesPicture / circle; `obsidianmd/prefer-create-el`; `const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");`
- `src/quick-tools.ts:1065:21` — QuickTools / make / element; `obsidianmd/prefer-create-el`; `const element = this.document.createElement(tag);`

**src/selection-handles.ts (1 diagnostics)**

- `src/selection-handles.ts:310:19` — make / element; `obsidianmd/prefer-create-el`; `const element = document.createElement(tag);`

**src/selection-toolbar.ts (1 diagnostics)**

- `src/selection-toolbar.ts:336:19` — make / element; `obsidianmd/prefer-create-el`; `const element = document.createElement(tag);`

**src/slide-show.ts (3 diagnostics)**

- `src/slide-show.ts:91:17` — SlideShow / mount / bar; `obsidianmd/prefer-create-el`; `const bar = document.createElement("div");`
- `src/slide-show.ts:96:23` — SlideShow / mount / button / element; `obsidianmd/prefer-create-el`; `const element = document.createElement("button");`
- `src/slide-show.ts:108:21` — SlideShow / mount / counter; `obsidianmd/prefer-create-el`; `const counter = document.createElement("span");`


### S3 inventoried sites

**src/anchors.ts (1 diagnostics)**

- `src/anchors.ts:204:9` — isSafeKey; `no-control-regex`; `&& !/[\u0000-\u001f\u007f]/u.test(value);`

**src/appearance.ts (2 diagnostics)**

- `src/appearance.ts:316:11` — isSafeObjectKey; `no-control-regex`; `return !/[\u0000-\u001f\u007f]/u.test(key);`
- `src/appearance.ts:327:11` — isSafeLabel; `no-control-regex`; `return !/[\u0000-\u001f\u007f<>]/u.test(label);`

**src/attachment-labels.ts (1 diagnostics)**

- `src/attachment-labels.ts:51:27` — CONTROL_OR_FORMAT; `no-control-regex`; `const CONTROL_OR_FORMAT = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u200b\u200c\u200e\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/u;`

**src/canvas-elements.ts (1 diagnostics)**

- `src/canvas-elements.ts:15:31` — INVALID_ID_CHARACTERS; `no-control-regex`; `const INVALID_ID_CHARACTERS = /[\u0000-\u001f\u007f]/;`

**src/device-files.ts (1 diagnostics)**

- `src/device-files.ts:15:36` — storeDeviceFiles / name; `no-control-regex`; `const name = file.name.replace(/[/\\:*?"<>|\u0000-\u001f]/gu, "_").replace(/^\.+/u, "_").trim();`

**src/document-viewer.ts (2 diagnostics)**

- `src/document-viewer.ts:28:34` — localDocumentPath; `no-control-regex`; `|| value !== value.trim() || /[\u0000-\u001f\u007f]/u.test(value)) return null;`
- `src/document-viewer.ts:53:8` — describeLocalDocument / safeSubpath; `no-control-regex`; `&& /^#[^\u0000-\u001f\u007f<>]*$/u.test(options.subpath)`

**src/local-comments.ts (3 diagnostics)**

- `src/local-comments.ts:25:9` — displayAuthorName; `no-control-regex`; `&& !/[\u0000-\u001f\u007f]/u.test(name) ? name : undefined;`
- `src/local-comments.ts:178:9` — safeKey; `no-control-regex`; `&& !/^[\u0000-\u001f\u007f]/u.test(value)`
- `src/local-comments.ts:179:9` — safeKey; `no-control-regex`; `&& !/[\u0000-\u001f\u007f]/u.test(value)`

**src/main.ts (1 diagnostics)**

- `src/main.ts:66:32` — sanitizeFontFileName / cleaned; `no-control-regex`; `const cleaned = name.replace(/[/\\:*?"<>|\u0000-\u001f]/gu, "_").trim();`

**src/metadata.ts (1 diagnostics)**

- `src/metadata.ts:1323:112` — validateMetadataObject; `no-control-regex`; `|| Object.values(group).some(name => typeof name !== "string" || name.length < 1 || name.length > 256 || /[\u0000-\u001f\u007f]/u.test(name))))) {`

**src/settings.ts (1 diagnostics)**

- `src/settings.ts:339:31` — SAFE_CUSTOM_FONT_FILE; `no-control-regex`; `const SAFE_CUSTOM_FONT_FILE = /^[^/\\:*?"<>|\u0000-\u001f]{1,180}$/u;`


### S4 inventoried sites

**src/board-search-bar.ts (1 diagnostics)**

- `src/board-search-bar.ts:55:10` — BoardSearchBar; `obsidianmd/no-global-this`; `: (globalThis);`

**src/canvas-ids.ts (1 diagnostics)**

- `src/canvas-ids.ts:12:2` — newCanvasId; `obsidianmd/no-global-this`; `globalThis.crypto.getRandomValues(bytes);`

**src/font-packs.ts (1 diagnostics)**

- `src/font-packs.ts:689:21` — fontPackDownloadUrl / testBase; `obsidianmd/no-global-this`; `const testBase = (globalThis as { __miroCanvasFontPacksTestBaseUrl?: string }).__miroCanvasFontPacksTestBaseUrl;`

**src/m1-session.ts (2 diagnostics)**

- `src/m1-session.ts:564:13` — ownerDocument; `obsidianmd/no-global-this`; `if (typeof globalThis.document !== "undefined") {`
- `src/m1-session.ts:565:10` — ownerDocument; `obsidianmd/no-global-this`; `return globalThis.document;`

**src/main.ts (3 diagnostics)**

- `src/main.ts:478:44` — MiroCanvasPlugin; `obsidianmd/prefer-window-timers`; `if (this.initializationRetry !== null) clearTimeout(this.initializationRetry);`
- `src/main.ts:559:34` — MiroCanvasPlugin; `obsidianmd/prefer-window-timers`; `this.initializationRetry = setTimeout(() => {`
- `src/main.ts:1199:44` — MiroCanvasPlugin / disposeShell; `obsidianmd/prefer-window-timers`; `if (this.initializationRetry !== null) clearTimeout(this.initializationRetry);`

**src/obsidian-document-host.ts (2 diagnostics)**

- `src/obsidian-document-host.ts:19:53` — applyNativePdfFit / renderer; `obsidianmd/prefer-window-timers`; `new Promise<undefined>((resolve) => { timer = setTimeout(() => resolve(undefined), 2000); }),`
- `src/obsidian-document-host.ts:20:49` — applyNativePdfFit / renderer; `obsidianmd/prefer-window-timers`; `]).finally(() => { if (timer !== undefined) clearTimeout(timer); });`

**src/quick-tools.ts (1 diagnostics)**

- `src/quick-tools.ts:424:42` — QuickTools / document; `obsidianmd/no-global-this`; `const document = options.document ?? globalThis.document;`

**src/source-renderer.ts (1 diagnostics)**

- `src/source-renderer.ts:362:29` — defaultDocument / candidate; `obsidianmd/no-global-this`; `const candidate = safeGet(globalThis, "document");`


### S5 inventoried sites

**src/editor-appearance.ts (1 diagnostics)**

- `src/editor-appearance.ts:89:33` — isDocumentLike; `@typescript-eslint/no-deprecated`; `&& typeof (value as Document).createElement === "function"`

**src/m1-session.ts (2 diagnostics)**

- `src/m1-session.ts:2296:41` — M1CanvasSession / searchHitElement; `@typescript-eslint/no-deprecated`; `if (root === undefined || typeof root.querySelector !== "function") return undefined;`
- `src/m1-session.ts:7270:33` — M1CanvasSession / clipboardCommand; `@typescript-eslint/no-deprecated`; `if (ownerDocument(this.root)?.execCommand?.(action) !== true) {`

**src/main.ts (11 diagnostics)**

- `src/main.ts:445:39` — MiroCanvasPlugin / onload / leaf; `@typescript-eslint/no-deprecated`; `const leaf = this.app.workspace.activeLeaf;`
- `src/main.ts:453:56` — MiroCanvasPlugin / onload; `@typescript-eslint/no-deprecated`; `this.handleActiveLeafChange(this.app.workspace.activeLeaf);`
- `src/main.ts:456:52` — MiroCanvasPlugin / onload; `@typescript-eslint/no-deprecated`; `this.handleActiveLeafChange(this.app.workspace.activeLeaf);`
- `src/main.ts:561:32` — MiroCanvasPlugin; `@typescript-eslint/no-deprecated`; `if (this.app.workspace.activeLeaf === leaf) this.handleActiveLeafChange(leaf, attempt + 1);`
- `src/main.ts:577:37` — MiroCanvasPlugin / saveCanvasSettings / leaf; `@typescript-eslint/no-deprecated`; `const leaf = this.app.workspace.activeLeaf;`
- `src/main.ts:617:37` — MiroCanvasPlugin / onExternalSettingsChange / leaf; `@typescript-eslint/no-deprecated`; `const leaf = this.app.workspace.activeLeaf;`
- `src/main.ts:719:43` — MiroCanvasPlugin / openFileSourceMenu / sourcePath; `@typescript-eslint/no-deprecated`; `const sourcePath = this.app.workspace.activeLeaf?.view instanceof obsidian.FileView`
- `src/main.ts:720:29` — MiroCanvasPlugin / openFileSourceMenu / sourcePath; `@typescript-eslint/no-deprecated`; `? (this.app.workspace.activeLeaf.view).file?.path`
- `src/main.ts:763:37` — MiroCanvasPlugin / activeM1Session / view; `@typescript-eslint/no-deprecated`; `const view = this.app.workspace.activeLeaf?.view;`
- `src/main.ts:908:37` — MiroCanvasPlugin / ensureMetadataWriter / view; `@typescript-eslint/no-deprecated`; `const view = this.app.workspace.activeLeaf?.view;`
- `src/main.ts:913:54` — MiroCanvasPlugin / ensureMetadataWriter; `@typescript-eslint/no-deprecated`; `this.handleActiveLeafChange(this.app.workspace.activeLeaf);`


### S6 inventoried sites

**src/settings-tab.ts (5 diagnostics)**

- `src/settings-tab.ts:59:14` — MiroCanvasSettingTab; `obsidianmd/settings-tab/prefer-setting-definitions`; `export class MiroCanvasSettingTab extends PluginSettingTab {`
- `src/settings-tab.ts:290:18` — MiroCanvasSettingTab / fonts; `@typescript-eslint/no-deprecated`; `button.setWarning();`
- `src/settings-tab.ts:459:5` — MiroCanvasSettingTab / redisplayInPlace; `obsidianmd/settings-tab/prefer-update-over-display`; `this.display();`
- `src/settings-tab.ts:459:10` — MiroCanvasSettingTab / redisplayInPlace; `@typescript-eslint/no-deprecated`; `this.display();`
- `src/settings-tab.ts:516:8` — MiroCanvasSettingTab / slider; `@typescript-eslint/no-deprecated`; `.setDynamicTooltip()`


### S7 inventoried sites

**src/comments-panel.ts (1 diagnostics)**

- `src/comments-panel.ts:69:68` — make; `@typescript-eslint/no-base-to-string`; `element.textContent = typeof text === "string" ? text : String(text);`

**src/m1-session.ts (1 diagnostics)**

- `src/m1-session.ts:6781:73` — M1CanvasSession / captureTextFragment; `@typescript-eslint/no-base-to-string`; `to: callRuntime(editor, "getCursor", "to"), html: isHtmlText(String(readRuntime(node, "text") ?? "")),`


### S8 inventoried sites

**src/appearance.ts (1 diagnostics)**

- `src/appearance.ts:1231:76` — validateOverrides; `@typescript-eslint/restrict-template-expressions`; `addDiagnostic(diagnostics, "override-key-invalid", \`localOverrides.${key}\`, "Override key is unsafe.");`

**src/m1-session.ts (1 diagnostics)**

- `src/m1-session.ts:8962:10` — M1CanvasSession / guardNativeMethod / session; `@typescript-eslint/no-this-alias`; `const session = this;`

**src/minimap-model.ts (1 diagnostics)**

- `src/minimap-model.ts:35:18` — MinimapViewportSize; `@typescript-eslint/no-empty-object-type`; `export interface MinimapViewportSize extends ViewportSize {}`


### S9 inventoried sites

**src/main.ts (3 diagnostics)**

- `src/main.ts:241:7` — MiroCanvasPlugin / onload; `obsidianmd/commands/no-command-in-command-id`; `id: "m1-commands",`
- `src/main.ts:943:34` — MiroCanvasPlugin / updateStatus; `obsidianmd/ui/sentence-case`; `this.statusBarItem.setText("miro-canvas");`
- `src/main.ts:949:34` — MiroCanvasPlugin / updateStatus; `obsidianmd/ui/sentence-case`; `this.statusBarItem.setText("miro-canvas · Canvas");`
