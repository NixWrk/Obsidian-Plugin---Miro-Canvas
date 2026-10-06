# L20-AUTH native DOM-owner sidecar — before-edit trace

Preparation only, in the shared primary checkout. Central L20-AUTH-DOM already
registers the participating source/UI paths. This sidecar owns only
`tools/obsidian_cdp/check-dom-owners.mjs` and this note. No source/helper,
production outputs, app/device connection, input, deployment, shared register,
commit or other worker file changes. No repeated unit gates.

## Scope and exact participation, recorded before implementation

The future parent-run harness compiles only `src/dom-elements.ts`, in memory,
as a pure IIFE exporting createHtmlElement/createSvgElement. Its build graph
must contain only this module, with no Obsidian or other runtime imports. The
IIFE remains local to one guarded renderer evaluation, not a global install.
This tests the current helper against actual host realms; it is not a rebuild
or verification of the installed plugin bundle. Record source/IIFE hashes.

Creation participation: M2CanvasTools constructor/appendLabeled/syncSelect;
PanelArrangeMode enter/renderTray/startItemDrag; PanelVisibility mount;
DocumentControls constructor; SlideShow mount; ExportPanel constructor/add,
ExportOverlay constructor/buildPage, capturePages progress/canvas. Their
existing root selectors will be sampled read-only for ownerDocument, realm
constructor and namespace. No control is mounted, opened, clicked, focused,
shown, or driven by this harness. Absent roots are PENDING, not passes; parent
runs normal mounted/control actions separately.

Mandatory parent-run checks:

- Explicit port and exact main CDP target ID; Windows requires the exact
  expected isolated vault path under this repository's CDP .out directory and
  an already-hidden BrowserWindow. No implicit selection, hiding, launching,
  throttling, foregrounding or popout creation. Preflight every supplied target
  before instrumenting any target. Optional popout must be supplied by exact ID,
  already hidden, in the same expected vault and a distinct native window.
- Android mode is explicit, guards exact vault name MiroCanvasTest and uses
  renderer instrumentation only. No ADB or physical-device/input claim. This
  worker will not run either platform; parent controls all real-app execution.
- Probe representative HTML tags for all six UI leases and known SVG tags in
  the main realm. Capture createEl/createSvg and native document creation
  counts by temporary instance-property forwarding wrappers. Preserve actual
  receivers and arguments; restore original own descriptors or remove the
  temporary shadow property, including failure paths. No prototype changes.
- Main creates one hidden about:blank iframe via its native browser method,
  solely as a plain-realm fixture. Assert no createEl/createSvg helpers in that
  iframe; probe its own document/constructors/namespace and confirm no calls to
  main helpers. Remove the iframe in finally. It is the only temporary body
  fixture, not a production helper behavior or UI mounting step.
- Every factory-created probe element must have its requested tag/namespace,
  exact native same-document constructor, no parent, no children/attributes and
  isConnected=false. Restore wrappers before any result is reported.
- Already-supplied hidden popout repeats its own helper/realm probes and existing
  root samples. Omission is PENDING. Require selected UI samples only when the
  parent has independently prepared them; common roots do not certify all six.
- CDP Runtime.evaluate only, userGesture=false. No Input, screenshots,
  bringToFront, OS actions, vault changes or native board/history operations.
  Check focus/active file and Windows visibility before/after instrumentation.

Report classification: real installed host environment plus synthetic DOM
instrumentation, never ADB, OS pointer/keyboard, physical stylus, or full UI
behavior evidence. Full source/history/preview/locks, both themes, actual
controls/PDF/presentation/export and parent frozen-build integration remain
outside this sidecar.

## Parent usage (once its hidden targets are ready)

Windows example; replace IDs/path/port with the parent's exact prepared values:

```powershell
node tools/obsidian_cdp/check-dom-owners.mjs --platform windows --port 9346 --main-target MAIN_ID --expected-vault "J:/NIX/WRK/Code/Obsidian-Plugin---Miro-Canvas/tools/obsidian_cdp/.out/isolated/vault" --popout-target POPOUT_ID --label frozen
```

Omit --popout-target while the parent prepares hidden creation; the report
marks it pending. --require-ui accepts a comma-separated subset of m2-tools,
panel-arrange, panel-visibility, document-controls, slide-show, board-export;
only use it after the parent independently mounts those existing controls in
at least one supplied document. Missing required roots fail coverage rather
than being reported as tested. It never mounts them itself.

Optional parent-run Android instrumentation (no ADB in this harness):

```powershell
node tools/obsidian_cdp/check-dom-owners.mjs --platform android --port 9340 --main-target WEBVIEW_ID --label tablet
```

Reports default to `tools/obsidian_cdp/.out/l20-authoring-dom/dom-native-<label>.json`.
An explicit --out path must stay under this exclusive directory. No compiled
bundle is written. --help and node --check do not connect to an application.

Prepared evidence is initially PENDING. Worker validation is limited to syntax,
CLI help/argument behavior and inspection; it makes no new native pass claim.

## Prepared receipt (no native execution)

Only the two sidecar files were written. `node --check` and --help passed;
three malformed/missing/out-of-scope CLI argument cases refused before any
build, CDP fetch/socket or artifact write. UTF-8 without BOM, CRLF and whitespace
inspection passed. Static inspection found no Input command, foreground/window
show/hide call, screenshot, ADB/process launch or UI mounting path. The only
future disk output is the guarded parent's report in the exclusive CDP folder;
the helper build remains write:false/in-memory. No unit gates were rerun.

Native main/plain-iframe/helper-forwarding/restoration results: PENDING parent
run. Hidden popout: PENDING parent-supplied exact target. Installed UI samples:
PENDING parent mounting; the report labels missing roots rather than certifying
the six modules. This sidecar must be run serially with other instrumentation:
its transient forwarding wrappers are restored in the same synchronous renderer
evaluation, but concurrent harnesses must not wrap the same host methods.
The IIFE/source hash describes the checked-out helper; correlate it separately
with the parent's frozen deployed plugin build. It does not prove actual tool
input, M0, native PDF control behavior or a full real-app integration pass.

## Settings-navigation background slice — before implementation

Exclusive next lease: `tools/obsidian_cdp/check-settings-navigation.mjs` plus
this note. Existing script was read in full. No source/helper, builds, apps,
devices or input executed by this worker. Syntax/CLI inspection only.

Existing participation: app.setting open/openTabById mounts plugin settings;
settings-tab.ts sectionNavigation constructs native dropdown whose onChange
scrolls/focuses the section heading and resets its selection to the placeholder;
sectionHeading gives focusable native heading names. Local SDK declares
apiVersion/requireApiVersion and PluginSettingTab.getSettingDefinitions (since
1.13.0). Manifest requires 1.13.7. Parent's existing main-process test guard
suppresses native child show/focus; this script does not install/change that
guard. Background execution requires the parent's already-mounted inline
`.miro-canvas-settings`, and never opens/creates a settings popup.

Changes planned before editing:

- Add --background, mutually exclusive with --serial. Every background renderer
  operation guards Windows, isolated CDP test vault, already-hidden current
  BrowserWindow, and supported SDK API version/getSettingDefinitions. Optional
  exact --main-target/--expected-vault strengthen parent's target identification.
  No background target discovery for settings, window creation/show/focus/hide,
  Page.bringToFront, screenshots/capture or OS input. Screenshots report SKIPPED.
- Background native dropdown: DOM setup places selectedIndex immediately before
  the Drawing option and focuses the select (recorded as setup, not input).
  Trusted CDP ArrowDown must invoke the real native onChange and focus the
  drawing heading BEFORE Enter is sent. If still on the select, fail rather
  than opening an OS popup. Enter therefore targets the heading; Tab tests
  normal keyboard continuation. Other controls use background CDP mouse only.
- Retain 12 settings sections/horizontal bounds, native section heading position,
  fresh welcome-board creation and its short route/12 sections, export help,
  and supported-device input paths. Android keeps its existing ADB input;
  background mode has none. Distinguish ADB dropdown/tap from CDP Tab/probes.
- A below-minimum API (the legacy 1.12.7 phone) must refuse clearly BEFORE any
  theme/settings/input/fresh-board action. No false supported-runtime pass when
  SettingDefinition API is absent. Record actual runtime API/minimum/plugin.
- Original native Canvas order must settle before the authoritative byte
  baseline is captured. Poll disk bytes/live node-ID ordering for stable equal
  order without requesting a save or rewriting the original file. During this
  settling window retain a content witness allowing ONLY root node-array order
  variation; every other field, every unknown extension and miroSource stays
  equal. Non-Canvas originals are checked for stable bytes without node sorting.
- For the freshly generated welcome board, perform its existing viewport setup
  before waiting for natural native ordering/save settlement and capturing its
  own byte baseline. After export/help/cleanup, compare both saved files exactly
  to their baselines; no vault.modify/write-back restoration, source mutation or
  synthetic user data rewrite. Restore the original file in the same window,
  with no focus request in background mode, and restore theme/close test UI.
- Record progress/skip/failure/restoration in JSON under the exclusive L20 CDP
  artifact directory; reports classify DOM focus/setup separately from trusted
  CDP key/mouse events. Native app/device execution remains PENDING parent.

Parent checks: already-hidden Windows with inline settings and existing native
child guard; supported tablet version and native dropdown/sections; delayed
native welcome order/save; original unknown/source extension preservation;
fresh tutorial uniqueness/route; export layout help in both themes; restoration
on success/failure and repeated runs. This slice does not certify visual
screenshots, OS/native popup behavior in background mode, or legacy phone support.

Before the final settings-sidecar refinement: keep the inline-settings
precondition before any theme/file action, and record installed plugin asset
fingerprints (main.js/manifest.json/styles.css) through the already-guarded
vault adapter's read API using Vault.configDir. Read-only fingerprints are
compared during restoration; no deployment/build/production file writes or
repair/rewrite of those assets. This additionally detects a parent changing the
deployed bundle during a supposedly frozen run. Root-node settlement content
witnesses and both original/fresh board byte checks remain unchanged.

## Settings-navigation prepared receipt (native run pending)

Only `tools/obsidian_cdp/check-settings-navigation.mjs` and this note changed in
this slice. Syntax/--help, incompatible --background+--serial refusal before
connection, scoped git diff --check, and UTF-8/CRLF checks passed. No app/harness
execution, build, deployment, device/ADB input or source changes by the worker.

Parent background example (already-hidden main, plugin settings inline, existing
main-process child show/focus guard supplied independently):

```powershell
node tools/obsidian_cdp/check-settings-navigation.mjs --background --port 9346 --main-target MAIN_ID --expected-vault "J:/NIX/WRK/Code/Obsidian-Plugin---Miro-Canvas/tools/obsidian_cdp/.out/isolated/vault"
```

Add --theme moonstone for the light theme; the original theme is restored.
Supported tablet invocation remains --serial DEVICE --port FORWARDED_PORT.
The actual SDK apiVersion, requireApiVersion(minAppVersion) result and native
getSettingDefinitions presence are checked before any test actions. The 1.12.7
legacy phone must fail below minimum 1.13.7 and is not a settings-migration pass.

The background branch never calls the foreground tap path, screenshot helper,
ADB/process input, app.setting.open/openTabById, or separate-settings target
scan. It does not install a main-process guard or create/show a native popup.
The precondition is the parent's existing inline settings. DOM predecessor and
focus setup is labelled instrumentation; actual ArrowDown/Enter/Tab and button
mouse events are trusted CDP renderer input, with no OS-input claim. Enter is
sent only after the native ArrowDown change focuses the Drawing heading;
otherwise the script fails with no popup/click fallback.

Authoritative original/welcome file baselines are taken only after five stable
samples with disk/native node-ID order alignment. Settling permits only root
node-array ordering and does not requestSave or rewrite user data. A content
witness preserves all other values, including nested unknowns and miroSource.
Fresh welcome viewport setup precedes its settlement/baseline. Exact file bytes
are verified around export/close and after restoring the original active file;
installed main.js/manifest.json/styles.css hashes are read and compared. They
are never rewritten or repaired. Background original-leaf restoration explicitly
uses active:false and setActiveLeaf with focus:false.

Reports: `tools/obsidian_cdp/.out/l20-authoring-dom/settings-navigation-<label>.json`.
Background screenshot stages are explicitly SKIPPED. All actual hidden Windows,
supported tablet, dropdown keyboard semantics, 12 sections, fresh welcome,
export help, native save ordering/source preservation and restoration results
remain PENDING the parent's serial run on a frozen supported build. Foreground
and device screenshot paths are retained only for their existing non-background
mode; none can execute under --background. No visual screenshot or native OS
popup behavior pass is claimed for the background test.

## Final native Windows UI lease — before mounted actions

User grants exclusive app lease on port 9346, main target
98F918B3EB05B0F3485B734EFD26104D, hidden native window id 1, isolated
l20-windows vault. Installed production JS/CSS are frozen (AFF2EE3A.../
7C5CE8...), all child windows closed. No build/source/asset writes, OS input,
foregrounding, Page.bringToFront, screenshots, clipboard or device work.

Before actions: exact-target/window/vault guards; record original L20 baseline
bytes/source/unknowns, native viewport/selection, theme, loaded settings and
stored data.json bytes, parent inline-settings preference marker and native SDK.
Use existing parent SDK capture utility only if its marker is absent. Record
installed full asset hashes and compare their required prefixes. Any new tests
use exclusively named fixture files in this isolated vault; no original-board
rewrite/restoration by vault.modify. Preserve and restore parent inline-settings
preference without creating a native settings window. Main UI preferred; no
new popout needed because main/plain-iframe/popout helper checks already passed.

Mounted actions through installed code: M2 openLocalTools modal with shape/
anchor/connector/rotation/layer controls and a selected existing PDF file to
mount DocumentControls; sample all nodes' ownerDocument/realm/namespace/class/
initial attrs/children, then native CDP shape/invalid/review/locked checks,
one native history step plus Undo/Redo and complete fixture source/extensions.
DocumentControls page/fit/next/open validates actual native host plus invalid
input; dispose modal and check removed roots/own timer. PanelArrangeMode
enter/banner/tray/reset/done/flip and tool drag/cancel; PanelVisibility fold/
expand/cancel with exactly one toggle and restored settings. SlideShow starts
an installed deck, trusted CDP next/keyboard/end, owner key/listener/class
cleanup and unchanged board/source. ExportPanel/Overlay mount/format/page/
quality/close, preview/commit/Undo and rebuild ownership/listener cleanup;
no raster export capture or screenshots under this lease. Check both themes
where feasible using the installed code, never a separately rebuilt component.

Settings navigation: rerun existing --background harness on the final immutable
assets using actual captured native SDK and parent-prepared inline settings.
Native order settles before baselines. Restore original baseline file, viewport,
selection, theme, settings values and parent preference marker; verify exact
original bytes and frozen asset hashes. Native input evidence is trusted CDP
renderer input; API preparation/probes are instrumentation, not OS or ADB.
Append concrete native results, failures/limits and evidence files before
releasing this Windows lease. Parent retains unit/docs/Android and clipboard.

## Mounted native Windows results on frozen assets

Worked in the shared PRIMARY checkout and exclusively leased hidden Windows
9346 / native main id 1 / target 98F918B3EB05B0F3485B734EFD26104D,
SDK 1.14.4, isolated l20-windows vault. Installed asset hashes before actions:
main.js aff2ee3a34a3045a30075c5736091c5cde937e3e06d2c1d327659ae5705aa200;
styles.css 7c5ce8c141b048ae4382abb83f6c3a309a0bfef5c21290bc527184202a76208c.
No production implementation/build/asset changes, OS input, Page.bringToFront,
show/focus, screenshots/capture, clipboard, popout creation, devices or ADB.
Installed API mounts and DOM focus/value setup are instrumentation; button,
preview drag and keyboard actions are trusted CDP renderer input.

All six assigned modules mounted in the actual main Obsidian renderer. Their
roots and descendants had the exact ownerDocument, actual window constructors
and expected HTML/SVG namespaces; sampled classes, attributes and child order
were recorded. M2, DocumentControls, Arrange, Visibility and SlideShow ownership
was checked in both obsidian and moonstone themes; ExportPanel/Overlay was also
checked in both themes. No main-window result is a six-module popout result.
The parent's already-passing main/plain-iframe/hidden-popout pure factory probes
were not rerun or described as mounted-feature popout coverage.

- M2 and DocumentControls: native shape creation added one history step, native
  Undo/Redo removed/restored it, invalid width was refused without history,
  locked rotation was refused, valid rotation kept override extensions. Invalid
  PDF page did not navigate; real native PDF fields later confirmed page-width
  and page-fit. Trusted Next updated the requested page to 2, and the actual
  one-page welcome PDF correctly clamped its native currentPageNumber to 1;
  Previous requested/restored page 1. Multi-page PDF navigation is pending a
  suitable fixture. Modal disposal removed both roots and cleared its own
  captured interval in the main window. Temporary timer instrumentation was
  restored to its exact original functions/descriptors before settings work.
- Arrange and Visibility: banner/tray/handles and two toggles mounted; toolbar
  orientation changed, fold/expand aria state changed, trusted tool drag showed
  ghost/marker, Escape cancelled the drag/mode, and Done removed arrange roots.
  Board/source/history were unchanged. Toolbar/settings values were restored.
- SlideShow: real source deck mounted two slides. Trusted Next/Previous,
  ArrowRight boundary/advance, Escape and End all worked. Stop removed the bar,
  presentation class and owned keyboard behavior; board/source/history stayed
  unchanged.
- Export: board and deck modes mounted real panels/pages. Quality, portrait,
  Add page and page drag were trusted CDP actions. Before pointer release the
  overlay moved while graph/history stayed unchanged; release added one native
  history step, and native Undo/Redo matched exact graphs. Rebuild ownership,
  two immutable deck slide pages and root disposal passed. Native paper-select
  ArrowDown did not change its value in this hidden window; its A3 change handler
  was separately checked with explicitly labelled DOM change instrumentation.
  This is not a native paper-select keyboard pass. Raster/PDF/PPTX capture and
  export-progress roots were not exercised under the no-capture lease.

Evidence, all exclusively in tools/obsidian_cdp/.out/l20-authoring-dom:
native-m2-proof.json, native-panels-proof.json,
native-slides-export-mount.json, native-export-proof.json,
native-extra-proof.json, native-pre-settings-restoration.json. Failed harness
attempts were retained separately: wrong selector/expected status, wrong fixture
extension assumption, native select ArrowDown and one-page PDF expectation.
These were not silently converted to application passes.

## Ordinary centered sizer followup

The questioned count of zero was not reproduced on the frozen Windows asset.
Read the parent's exact existing L20 native style owners 1791316689517.canvas
without rewriting it. Its ordinary card had no imported miroSource item, raw
sparse typography {verticalAlign: center}, and normalized installed appearance
with verticalAlign center. The actual observer target equalled canvas.canvasEl
(class canvas), contained both node.nodeEl and the current Markdown sizer, and
its owned-elements iterable contained that sizer before and after 100 ordinary
preview replacements. Owner count was exactly 1 throughout the measured start/
end; every owned target was connected and contained. Native styles were flex
0 0 auto, min-height 0px, padding-bottom 0px; shell vertical marker was middle.
Exact parent fixture bytes, full graph and native history stayed unchanged.

This used the same clone/replace plus requestAnimationFrame instrumentation as
the parent's native style harness, followed by read-only measurements of the
installed observers. It is not a claim that native Markdown itself replaced its
preview 100 times, nor an explanation of the earlier zero count. A second
ordinary card with a full UI-authored typography override also retained one
current sizer through 100 replacements. A sourceRenderer.cardItems entry alone
is not evidence of an imported source card: ordinary fallback items occur there
as kind node; raw miroSource.items was checked directly. The active single-session
alias also matched activeM1Session in our owner-map probe. On fixture-session
teardown the old owner's iterable became empty (0), as expected after disposal.
Phone stronger replacement evidence belongs to the separate phone worker.

Evidence: native-m1-parent-fixture.js.result.json,
native-m1-replacement.js.result.json, native-style-fixtures.js.result.json,
native-session-owner-map.js.result.json. Original baseline board bytes, native
viewport/selection, settings values and theme were restored; one main native
window remained hidden/unfocused, with all child windows closed. The background
settings rerun is held until the user relays Parfit's shared-harness receipt;
no concurrent run or edit of check-settings-navigation.mjs is performed.

## Final restoration and immediate Windows lease release

At the user's explicit handoff instruction, released Windows 9346 immediately
without running or editing the Parfit-leased settings harness. The tablet retry's
specific fresh-board autosize height difference on da3ab1600ec81a0b is parent/
Parfit diagnostic evidence, not a Windows settings result. Background Windows
settings navigation remains PENDING a new app/harness lease; no pass is claimed.
No further app calls after the successful final restoration receipt.

native-final-restoration.json PASSED: active L20 baseline.canvas, exact original
board bytes (therefore all source/extensions), theme system, tx 100 / ty 60 /
tZoom 0, empty original selection, all loaded and persisted settings values and
EXACT original data.json bytes, original settingsPopoutWindow/preference marker
true, exact timer functions restored, zero transient tested/settings roots.
Only native window id 1 remains, visible false / focused false. Installed main,
CSS and manifest bytes and all three complete hashes exactly match the initial
frozen asset snapshot. No original-user-data rewrite was needed.

Native evidence index: tools/obsidian_cdp/.out/l20-authoring-dom/native-receipt.json
and native-final-restoration.json. Prior code patch remains authoring-dom.patch;
prior scoped warning delta 81 -> 0, ESLint errors 0; focused tests 88 + 72 + 20 =
180 passed. Type-only plain/module JS equality and unchanged public declaration
proof are in proof.json; runtime factory compatibility is separately supported
by the mounted main-window results above. User-reported parent integration gates
2036 + 1 skip are not worker-run evidence and were not rerun or appropriated.

This native followup changed only this exclusive note and ignored proof files.
Source, helper, assets, central register, plans, inventory, locales, CSS budgets,
README/changelog, devices and deployments remain outside this followup's writes.
Shared settings harness has parent/Parfit changes after our earlier sidecar work;
its current diff must not be attributed solely to this executor. No commits,
pushes, external messages, OS input, foregrounding, screenshot/capture or clipboard
work. Pending limits remain native paper-select keyboard, multi-page PDF,
export capture/progress/output visuals, six mounted modules in a popout, and the
unexplained earlier M1 count0 (not reproduced on our frozen Windows fixture).
