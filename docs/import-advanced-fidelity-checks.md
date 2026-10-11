# Advanced Canvas fidelity audit — 2026-10-11

Scope: pure adapter and focused tests for PR19 in the shared import-expansion checkout.
Native foreign-plugin rendering is owned by the parent. This worker neither activates
Obsidian nor captures a global screenshot; ports 9351 and 9346 are reserved.

## Primary evidence

- [Advanced Canvas release 7.1.0](https://github.com/Developer-Mike/obsidian-advanced-canvas/releases/tag/7.1.0), published 2026-09-27; tag resolves to `4b8630c641bec6f6329adb8436a4d35752280d74`.
- [Pinned format 1.0-1.0](https://github.com/Developer-Mike/obsidian-advanced-canvas/blob/4b8630c641bec6f6329adb8436a4d35752280d74/assets/formats/advanced-json-canvas/spec/1.0-1.0.md).
- [Pinned node styles](https://github.com/Developer-Mike/obsidian-advanced-canvas/blob/4b8630c641bec6f6329adb8436a4d35752280d74/src/styles/node-styles.scss), [edge styles](https://github.com/Developer-Mike/obsidian-advanced-canvas/blob/4b8630c641bec6f6329adb8436a4d35752280d74/src/styles/edge-styles.scss), [arrow polygon definitions](https://github.com/Developer-Mike/obsidian-advanced-canvas/blob/4b8630c641bec6f6329adb8436a4d35752280d74/src/canvas-extensions/advanced-styles/edge-styles.ts), [UI style options](https://github.com/Developer-Mike/obsidian-advanced-canvas/blob/4b8630c641bec6f6329adb8436a4d35752280d74/src/canvas-extensions/advanced-styles/style-config.ts).
- Release `styles.css` SHA-256: `3646804b9160e5542b7fc9fec19392e82917c118d110f9a8d88ddb938923922c`.
  Read-only reference copies are in `.out/all-import-showcase/advanced/reference/`;
  no foreign renderer is bundled with the plugin.

## Static fidelity findings and authorized repairs

These are differences demonstrated by release CSS/polygon definitions and current
local shape/cap paths. They are not a screenshot comparison or proof of live input.

| Feature | Source release | Before repair / compatible action | Verification |
| --- | --- | --- | --- |
| Text defaults on mapped shapes | Native text remains left/top unless center/right chosen | Miro shapes default center/middle; explicitly carry left/top and requested alignment through existing typography | Focused units passed |
| Center alignment | Horizontal center plus vertically centered Markdown section | Alignment only; also carry existing verticalAlign middle | Focused units passed; native target middle alignment attribute observed, paragraph metrics differ |
| Invisible border | Transparent container and hidden border/label; actual native content retains themed 7% tint | Keep borderStyle none and file showAttachmentName false; remove synthesized colors.fill null after actual source probe. Existing fills still win | 71 focused units passed; corrected native result retains tint, hides outline/label |
| Explicit standard defaults | rectangle, solid, left, triangle and bezier are format values; UI writes null for defaults | Previously reported as custom unsupported; recognize them, retaining native rectangle and existing overrides | Focused units passed |
| Blunt arrow | A visible perpendicular bar | Previously removed entirely; map to existing erd_one bar, report arrowhead approximation | Focused units passed |
| Shape contours | Pill is physical CSS radius; diamond rounded mask; parallelogram skews beyond native box; process rails fixed 10px; document quadratic wave; cylinder has 50px ellipses overhanging top/bottom | Fixed Miro contours cannot reproduce all dimensions; retain native source geometry and fields; mapped contours differ as recorded here | Focused units passed; actual native comparison recorded below |
| Native palette and theme tint | Source derives themed border/fill opacity from native canvas color and CSS variables | Raw native color is retained; mapped SVG fill/tint must be compared under both themes rather than inferred from a palette number | Native source/target measured; corrected 4,713,385 byte build matches native tint/border formulas |
| Edge dash patterns | Dotted 3px times inverse zoom, short 9px, long 18px | Local dotted 2/5 and dashed 8/6 patterns differ; no arbitrary dash metadata exists | Explicit differences recorded; actual native comparison recorded below |
| Arrow outlines and cap proportions | Outlines use board-background fill; source polygon proportions are fixed | Local outline fill is transparent, and head proportions differ; no per-cap background fill field exists | Explicit differences recorded; actual native comparison recorded below |
| Routes | Bezier/direct/square/A*; A* avoids obstacles | Curved/straight/elbowed mapping; A* remains a documented approximation | Focused units passed; actual native obstacle case shows source A* detour vs target elbow route |
| Collapsed group | Source label-only presentation and source-owned collapse semantics | Source hides all lines touching contained nodes, including crossing lines; native compact 280x64 proxy retains raw boxes and keeps external connections visible | Existing unit geometry evidence; actual native comparison recorded below |
| Portal / presentation | Nested foreign board and incoming portal lines; presentation navigation and branch choices | File card plus reported nested lines; deck follows first outgoing branch | Existing tests; actual native comparison recorded below |

Every copied readable card and edge retains its source ID, coordinates, size,
color, text/file/subpath/url, styleAttributes, unknown fields and array order.
Source files are never rewritten. Existing miroCanvas overrides win; miroSource
stays exact. No renderer/session/schema/types/registry changes are authorized here. The current production renderer carries plain text vertical alignment: native result
align1 has data-miro-source-valign middle. Native paragraph metrics and shape insets
still differ. Do not claim pixel identity from metadata alone.

## Mandatory acceptance checks

- Authored showcase includes all four native types; seven nondefault shapes plus
  native rectangle; all borders and text alignments; every arrow and route;
  explicit and null defaults; missing and present assets; collapsed group with
  contained/crossing/external lines; portal target and interdimensional edge;
  branching presentation. The asset set is completely local.
- Adapter result preserves source native arrays exactly, existing metadata wins,
  and the metadata validator gains no diagnostic.
- Inspect descriptor CSS/caps in pure tests. Raw points and sizes do not change.
- Parent: stage authored source in its isolated vault with official Advanced Canvas
  7.1.0 only, then compare its original rendering with the imported copy under
  Miro Canvas only at identical theme, viewport, zoom and selection.
- Parent: record app/plugin versions, source hashes, computed styles and SVG paths
  separately from real mouse/key input. Cover 50/100/200% zoom, unselected/selected
  borders, left/center/right multiline text, all seven contours, all heads, route
  obstacles, group collapse/expand, portal content and presentation navigation.
- OS screenshots, native OS input and physical Android are not claimed by this audit.

## Executed worker evidence

- Advanced Canvas focused suite: 71 tests passed after the native-tint repair.
- Import-common, generic JSON Canvas, board-groups and collapsed-geometry regressions:
  combined five suites, 186 tests passed.
- Targeted Advanced Canvas importer ESLint and git diff --check: passed. The test file
  is ignored by the repository ESLint configuration; its Vitest checks passed.
- Parent reports TypeScript passed for the explicitly approved production build.
  The worker did not rebuild production while the parent edited shared renderers.
- Authored showcase: 72 native nodes and 20 native edges. All four node kinds, seven
  supported nondefault shapes (plus a wide circle), all four border options, three
  alignments, nine arrows on both ends, all four routes, collapse, portal and presentation.
- Pure adapter receipt: .out/all-import-showcase/advanced/adapter-audit-receipt.json.
  Native nodes and edges compare structurally equal to the source, metadata stays equal,
  source bytes stay identical, and result metadata has zero validator diagnostics.
- Source SHA-256: 4acf62225ada598360ba650100181cca1cccd3063a046a842bd0ac636d55a6b8.
- Parent rendering inputs: Advanced.canvas, Portal.canvas, Notes/Advanced Showcase.md,
  Assets/Advanced Checker.png. coverage.json lists section bounds and every source hash.
  Advanced-imported.canvas is the pure adapter output; it is not a native command receipt.
- The initial pure audit had no native app evidence. The subsequently authorized
  owned 9355 run is recorded below; no OS activation, unrelated port access, commit or push.

## Remaining renderer and interaction acceptance

Matched native source/result captures and DOM/SVG/style evidence now exist on owned
9355. Source selected vs unselected input, presentation navigation, and native
collapse/expand interaction remain pending. Rounded diamond, skewed parallelogram,
fixed process rails, cylinder overhang, cap background fill/dimensions,
zoom-dependent dots, obstacle routing, crossing collapsed lines and portal rendering
are observed differences. None is certified pixel-identical by the adapter tests.

Existing report codes cover halved/blunt heads, long dashes, A* routing, collapse,
portals and custom styles. They do not express every contour/dash/outline proportion
difference listed above. If per-element reports must expose those differences too, the
main owner needs a neutral appearance/geometry approximation reason and localized wording;
customStyle currently means style kept but not drawn and would misdescribe mapped contours.

## Actual Advanced-only source run on owned port 9355

Fresh hidden desktop CodexMiroImport9355, PID 40360, isolated vault/profile created
with launch-import-hidden.py. Loaded app package obsidian-1.14.4.asar; Electron UA
reports the installed 1.12.7 shell. The plugin manifest is Advanced Canvas 7.1.0.
Only main.js, manifest.json and styles.css were copied from the authorized 9352
plugin directory. No settings/data.json, credentials or other vault contents were read/copied.
Source boards, Markdown and PNG were staged with Vault.create/createBinary.

33 actual source captures and per-view DOM/SVG/CSS receipts are saved under the
primary checkout tools/obsidian_cdp/.out/all-import-showcase/advanced. Camera uses
native setViewport instrumentation; images use Electron webContents.capturePage
with stayHidden true. Initial fully hidden capture waited for paint; showInactive
on the noninteractive desktop allowed capture. isFocused remained false on every
shot. No Page.bringToFront, desktop switch or physical OS input was used.

The source renderer normalized native z-order/edge order and portal dimensions
before the preserved baseline. This is allowed source-plugin behavior in the owned
fixture. The final source pass kept bytes exactly unchanged at SHA-256
1354a5858f2bfe2b1b6bbddbcd8afa5ad6ba3a1887811d28f7743d1c02a37232.

Observed at 50/100/200 percent:

- Centered Markdown section has text-align center and justify-content center.
- Invisible containers have transparent background and border, but the themed
  native content still has a 0.07 alpha tint in the actual source release. This
  source behavior is more specific than the format's general no-background wording;
  compare the result before treating fill null as exact.
- Dotted dash arrays are 4.24264px / 3px / 2.12132px. Short dashes stay 9px.
- Blunt arrow polygon is a real perpendicular rectangular bar, not an absent head.
- Both internal and crossing collapsed-group edges are absent from the live source
  runtime. The local portal is loaded as 400x300 and contains its authored child.
- Source masks clip some left-aligned headings on ellipse/diamond/parallelogram:
  source text clipping and the target's Miro text insets are distinct behaviors.

source-receipt-9355.json, source-computed-summary-9355.json and source-ready-9355.json
are source-only evidence. Actual production result evidence follows.


## Actual Miro-only import and matched result on owned 9355

The parent explicitly approved the stable 4,705,103 byte main.js (SHA-256
30fd613538ee01d1e40f01be7dad5c2528ba0a41c9661de132b1da4253b62e92).
Only main.js, manifest.json and styles.css were copied to the owned Miro plugin
folder while disabled. The native English command palette opened Import into a
board, the source picker selected Advanced.canvas, report card was off, and Create
produced Advanced (board).canvas. Trusted CDP renderer input is recorded separately
from physical OS input. Advanced Canvas was disabled; only Miro Canvas was loaded.

The native import and all 33 matched result captures preserved the closed original
source bytes at the protected SHA-256 above. Source/result window sizes, camera
centers, zoom and section bounds match exactly. Two whole-board captures use
1280x800 and 1600x1000; seven section captures and eight detail regions at each
50/100/200 percent use 1600x1000. All 66 paired captures report isFocused false.
Images use Electron capturePage with stayHidden, after showInactive solely on the
isolated noninteractive desktop. No screenshot/export concurrency was used.

Primary checkout artifacts are under
J:/NIX/WRK/Code/Obsidian-Plugin---Miro-Canvas/tools/obsidian_cdp/.out/all-import-showcase/advanced:

- source-full-1280.png, source-full-1600.png and result-full-1280.png/result-full-1600.png.
- source-section-{nativeFrame,shapeFrame,borderFrame,arrowFrame,routeFrame,workflowFrame,defaultFrame}.png
  and matching result-section-*.png, each with its DOM/SVG/CSS JSON receipt.
- source/result-{shapes,ellipse,alignment,invisible,arrows,blunt,routes,workflow}-{50,100,200}.png.
- import-receipt-9355.json, source-receipt-9355.json, result-receipt-9355.json,
  comparison-summary-9355.json, native-variables-9355.json and
  source-widget-image-file-proof-9355.json.
- source-original-canonical.canvas, Miro-result-actual.canvas and Miro-result-after-QA.canvas.

Representative native CSS evidence:

| Card | Native source | Current 4,705,103 byte target |
| --- | --- | --- |
| shape0 pill, native color 1 | --canvas-color #fb464c; container rgb(28,28,28), content oklch(0.659714 0.216867 23.8101 / .07), border same / .7 | shape flow_chart_terminator and typography left/top, no explicit colors; SVG fill falls back to --canvas-background #1C1C1C and stroke --text-normal #dadada, losing red tint |
| shape3 circle, native color 4 | --canvas-color #44cf6e; content oklch(0.757733 0.180995 149.613 / .07), border same / .7 | shape circle, typography left/top, native color retained in data; rendered palette absent |
| border3 invisible, native color #b6ddbf | Container/border transparent, content oklch(0.861293 0.058061 151.962 / .07) | Old baseline override borderStyle none plus colors.fill null removes content tint and leaves native green outline; compatible adapter repair removes synthesized fill override |
| invisibleFile | Same transparent container/7% content tint; no attachment label | Old baseline colors.fill null and showAttachmentName false; target label remains visible; parent renderer repair pending |
| nativeText, no color | --canvas-color #7e7e7e; content transparent, container --background-primary, border full native gray | Native styling matches; a themed 7% gray fill must not be synthesized for uncolored cards |

Live app://obsidian.md/app.css declarations, stored in native-variables-9355.json:
.canvas-node-container uses background-color var(--background-primary);
.canvas-node.is-themed .canvas-node-container uses border-color
color-mix(in oklch, var(--canvas-color) 70%, transparent); themed content uses
color-mix(in oklch, var(--canvas-color) 7%, transparent). --canvas-color-alpha,
--canvas-node-background and --canvas-border are unset in this runtime. A dynamic
native shape fill needs both the base surface and the native tint. The parent owns
that renderer change; no theme palette is baked into the pure adapter.

Actual baseline differences beyond color: native text metrics/insets and clipped
headings differ; dotted and dashed line spacing differs; SVG cap proportions and
outline backgrounds differ. route1 retains connector.route straight in metadata,
but its target native display path is curved; this renderer issue was sent to the
parent. Source A* visibly detours around its obstacle; target is an elbow route.
Collapsed source shows the label and hides all touching edges, while Miro uses the
existing 280x64 proxy with a crossing line and retained internal label. Source
portal loads acportal||portal||portalChild; Miro shows a native file preview without
a live portal child, as the import report describes. Presentation branch semantics
use the existing ordered deck and are not certified as foreign navigation.

Asset and Source DNA proof: Vault.readBinary confirms the authored note (363 bytes),
checker PNG (1127 bytes, actual loaded image 320x200) and Portal.canvas (390 bytes)
match their authored hashes. Both source and result load the note and embedded
checker image, plus native image and group background. The missing Markdown path
is intentional and remains absent. All 72 native nodes and 20 native edges compare
structurally equal by source ID, including positions/sizes/colors/styleAttributes;
metadata and all source root keys are retained. Native serialization changes portal
object key order only. Actual result metadata validates with zero diagnostics.

Supplemental variable probe: reopening the original with the foreign source plugin
triggered another node-array order normalization, with every record and metadata
structurally unchanged. Own QA restored the closed frozen fixture through Vault API,
then used Advanced variables probe.canvas for all later foreign measurements. That
probe normalization is not a Miro source write; it is recorded separately in
source-variable-probe-normalized.canvas and native-variables-9355.json. Native import
and result capture receipts remain byte-preservation evidence for their own phases.

The compatible tint correction is now in advanced-canvas.ts and focused tests. The
33 baseline result images precede that correction and the parent's color/border
renderer repairs. The corrected production pass below supersedes the baseline color/border/route
findings. No production build was run by this worker. Owned9355 remains alive,
hidden and unfocused for parent inspection.


## Corrected production acceptance on owned 9355

Explicit parent BUILD READY approved main.js 4,713,385 bytes, SHA-256
acd8306f30432a517f6b637a29f74f57bb0a06094efe35f44928acc245962d5d.
Both community plugins were disabled before copying the three production assets.
Fresh native source-picker import with report off created Advanced (board 2).canvas.
Only Miro Canvas was enabled throughout corrected import and capture. Original
Advanced.canvas was never reopened or rewritten during this corrected pass.

All 33 corrected result views are result-corrected-*.png and their matching JSON
receipts in the primary artifact folder above. They use exactly the existing source
poses, window sizes and section bounds. Full-board and all seven section images plus
eight detail regions at each 50/100/200 percent are present. Every capture reports
isFocused false. Source hash remained 1354a585...a37232 before/after import, all
captures and attachment proof. This is separate from the earlier foreign-only probe.

Verified fixes, with computed DOM/SVG evidence:

- shape0 and shape3 now have a native-background contour underlay and a separate
  color-mix tint path. Its fill is exactly the source native .07 oklch color; stroke
  is exactly the native .7 color. Palette variables remain dynamic native CSS.
- border3 and invisibleFile have transparent containers, native .07 content tint,
  and border-style none at 50/100/200 percent. Their saved overrides contain no
  synthesized colors.fill. Source uses transparent border-color with border-style
  solid; the target uses border-style none and retains an unused native border color.
  Both have no visible outline in the captured unselected state.
- invisibleFile label is display none. Its label element has
  data-miro-canvas-native-label-hidden true; the node shell has no such attribute.
  Saved override is borderStyle none plus showAttachmentName false.
- route1 is confirmed straight in attached native DOM: M 790 3070 L 910 3320.
  Saved localOverrides.route1.connector is route straight; connectorAnchors is absent.
  Renderer and session diagnostics are empty. The source endpoint is shortened to
  x903 for its foreign arrowhead; target endpoint is x910 with its own marker.
  route0 is curved; route2/route3 are elbow routes with their recorded limitations.
- The parent's native projector now sets mapped shape/local-text Markdown padding
  to zero. Existing Miro shape insets and paragraph/font metrics still differ from
  foreign native clipping/layout, so no complete text pixel-identity claim is made.

The corrected attachment proof again confirms note/PNG/portal bytes exactly equal
authored hashes and loaded checker images complete at 320x200. The result preserves
all 72 native nodes and 20 edges, coordinates, sizes, native colors, styleAttributes,
source root metadata and unknown fields structurally by ID. Metadata validator is
valid with zero diagnostics. Intentional missing Markdown remains absent. Source
portal content and Miro file-preview behavior remain the documented approximation.

Receipts: import-corrected-receipt-9355.json, result-corrected-receipt-9355.json,
comparison-corrected-summary-9355.json, route-corrected-proof-9355.json,
corrected-widget-image-file-proof-9355.json, corrected-hidden-label-proof-9355.json.
Actual result snapshots are Miro-result-corrected-actual.canvas and
Miro-result-corrected-after-QA.canvas. Remaining geometry, text metrics, dash/cap,
A* routing, compact collapse, portal and presentation differences are retained in
the comparison summary; no collapse or invented schema mapping was added.

Corrected capture-pass state before requested shutdown: alive on 9355, hidden,
unfocused, active corrected board,
only Miro Canvas loaded. Parent-owned 9352/9452 and reserved ports were not accessed.
Focused Advanced 71 / combined 186 tests passed; own importer lint and diff checks
passed. No commit, push, production rebuild, foreground activation or OS screenshot.


## Reopen, optional native input, primary gallery and shutdown

The corrected target was reopened through Advanced QA bridge.md with only Miro
Canvas loaded; original Advanced.canvas remained closed. Reopen captures
reopen-corrected-shapes.png and reopen-corrected-invisible.png again confirm native
shape tint/border, invisible content tint, no visible border, and hidden file label.
reopen-corrected-receipt-9355.json records unchanged original canonical bytes and
all native source records/metadata structurally unchanged.

Optional actual trusted CDP input used a disposable Advanced interaction probe
copy, preserving both the original source and gallery result. At 100 percent,
nativeText drag and bottom-right resize changed nativeLine while the pointer was
held, committed the card geometry, and one Ctrl+Z restored the card and original
edge path. A selected shape0 fill color changed to #ffd02f through the actual
palette; Ctrl+Z restored the previous override, native node fields and SVG tint.
These are renderer mouse/key input receipts, not physical OS input. A harness edge
ID lookup error and transient obscured palette chip were corrected in QA only;
no unsupported feature or production implementation was changed. Passed evidence
is interaction-probe-receipt-9355.json and color-undo-receipt-9355.json.

The primary gallery now contains read-only native byte copies from the CLOSED
owned vault: Advanced.canvas, Advanced (board 2).canvas, Assets/Advanced Checker.png,
Notes/Advanced Showcase.md and Portal.canvas. All local refs are present. Source
bytes remain exactly the frozen canonical SHA-256 1354a585...a37232. Final closed
result SHA-256 is 79416ca1b08bde0504445eae8e52f91251d169cb6c1b48033a0ede941552da20.
On close, native Canvas reordered the result node array only; all nodes, edges,
geometry and root metadata remain structurally unchanged. The packaged result
is the actual closed file, including that native serialization order.

python tools/obsidian_cdp/stop.py --port 9355 successfully closed the owned instance.
A subsequent request to 127.0.0.1:9355/json fails because nothing is listening.
closed-gallery-receipt-9355.json records closure and every copied file's exact
size/hash/equality with the closed vault. No other port/instance was accessed.
Final own-instance status: CLOSED. No source write, rebuild, commit or push.
