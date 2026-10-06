# L20-AUTH-DOM: before-edit traces and scoped evidence

Worker Helmholtz, primary shared checkout:
`J:/NIX/WRK/Code/Obsidian-Plugin---Miro-Canvas`, baseline
`2f3687c861cb4c33afc5fcd3ac0a562662214a26`. Central L20-AUTH-DOM links
this exact file (`l20-authoring-dom.md`); the shared register/plans are read-only.
Existing node_modules reused. No nested agents, commits, builds, deployment,
Obsidian/ADB/device input, shared locales/CSS/inventory/budgets or root .out writes.
Artifacts exclusively `tools/obsidian_cdp/.out/l20-authoring-dom/`.

## A-RECORDS7 — registered before implementation

Exact baseline diagnostics and existing boundaries:

1. `src/advanced-canvas-adapter.ts:413` locatePlugin registry.getPlugin's
   Reflect.apply result: annotate unknown. Keep registry receiver, [pluginId]
   argument, null/undefined check, catch/lookupFailed and optional discovery.
   No new Advanced Canvas/private API assumed. createProbe constructs the
   AdvancedCanvasAdapter; compatibility startup/probes use it read-only.
2. `src/importers/advanced-canvas.ts:417,420` notePortalEdges collects the
   portal node's interdimensionalEdges and legacy edgesToNodeFromPortal groups.
   Array.isArray already proves arrays; assert readonly unknown[] only in the
   two existing spreads. convertNode calls notePortalEdges while converting
   copied Advanced Canvas boards via registry's advancedCanvasAdapter.convert.
   Preserve every portal entry, fallback ID order, raw copy, source fields,
   styles, immutable miroSource and existing unknown plugin metadata.
3. `src/importers/board-builder.ts:608` addReportCard's nodes spread: annotate
   the locally checked list readonly unknown[]. boardBounds reads finite
   geometry; addReportCard preserves original root and appends the report card,
   retaining source and unknown metadata, and assertNothingNewToSay verifies no
   new metadata complaints. Used by import flow, common/Advanced Canvas tests.
4. `src/viewport-controller.ts:248,283,674` safeDiagnostics array index,
   capabilitiesFromAdapter array index, configuredViewportSize reflected
   callback result: annotate each unknown before the existing object/string/
   size checks. The callback keeps this.options receiver and existing fallback.
   M1 session constructor (~1711), minimap/navigation/hotkeys use this camera
   controller; zoom/pan/wheel/fit must never write/save the document or history.

User actions: open/import an Advanced Canvas board, read optional integration
status, import portal/legacy links and add its report; pan/zoom/wheel/fit with
injected/native viewport options, including absent/read-only/hostile hosts.
No runtime or public contract change planned for these seven diagnostics.

Mandatory worker checks before accepting A-RECORDS7:

- Targeted ESLint before/after with own JSON and no shared cache.
- Exact module esbuild.transform equality (unminified and minified) for all
  four files, same options/sourcefile before/current; no production outputs.
- Focused advanced-canvas-adapter, import-advanced-canvas, import-common,
  viewport-controller tests; preserve receiver/getter/clone order and native
  navigation without persistence. Existing tests cover absent/hostile/revoked
  plugin discovery, portal reports, malformed imports, original bytes and
  metadata preservation, camera bounds and anchor math, read-only failures.
- Scoped compiler roots and git diff --check; UTF-8/CRLF source and note.

Pending parent gates: full integration/build/bundle identity, actual imported
boards, all compatibility profiles; real navigation/zoom/fit and native
preview/lock/history/source checks, both themes and physical Android input.
No unit/static result is a new app/device pass.

UI leases (not yet edited): m2-tools, panel-arrange, panel-visibility,
document-controls, slide-show, board-export. Detailed traces precede each slice.
Adopt only the parent's reviewed owner-document DOM factory when available;
no locally invented replacement, no runtime Obsidian import in pure modules.

## U-DOM contract review — before any consumer edit

Parent explicitly supplied the reviewed contract. `src/dom-elements.ts`
exports createHtmlElement(document, known HTML tag) / createSvgElement with
strong tag-map return types, owner defaultView createEl/createSvg and explicit
plain document bound-native fallback. Returns detached empty elements. No
runtime Obsidian import, temporary insertion, ambient activeWindow or prototype
patch. Do not modify that shared helper. SDK evidence: installed
node_modules/obsidian/obsidian.d.ts lines 187-195 declares typed createEl/createSvg.
Native evidence supplied by parent in L20-CORE DOM contract: Windows Obsidian
1.14.4's Node.createEl uses global realm document.createElement and appends;
therefore only the injected document's own window helper is safe here.
Existing code's HTML namespace/tags remain unchanged. No SVG warning in these
six modules. Dynamic unknown-namespace calls remain untouched.

All consumer edits are only a factory import and replacement of each original
`document.createElement(tag)` with `createHtmlElement(document, tag)` at the
same evaluation site. Board-export's private add helper narrows tag from string
to keyof HTMLElementTagNameMap (every caller supplies a known literal), not a
new exported API. No public signature or behavior adjustment beyond the
reviewed creation compatibility adaptation. Tablet button styles/variables
and CSS stay exactly as supplied by current components.

### U-DOM-M2 — before edit

`src/m2-tools.ts`: 35 baseline sites: appendLabeled 70,72; constructor
109,111,116,118,121,124,126,131,135,145,187,189,192,196,204,205,218,220,223,
226,227,229,234,255,257,260,263,265,270,285,326; syncSelect 447,452.
Callers: main.ts (~896) opens M2CanvasTools via its tools command with its
owner document and injected native DocumentHost. Constructor refreshes session,
creates CanvasAuthoring, labels/inputs/shape palette, anchor and connector
selectors, rotation/layers, and then attaches CommentsPanel / DocumentControls.
syncSelect refreshes optional targets without resetting a retained value.
Actions: create local shape; choose/save free/node/image/edge anchor; edit
connector end; rotate/reorder selection; comments and local file inspector.
Keep appendLabeled's control construction before label/text, exact class/role/
input defaults, shape option order, listeners, status strings, metadata locks,
source and native history behavior, select memoization, owning interval cleanup.
Mandatory: focused constructed DOM snapshots/order/labels/defaults in owner
helper and plain fallback; real shape creation one mock history step, invalid
geometry refusal, selector refresh/value retention, rotation callback and timer
disposal. Child CommentsPanel can be mocked ONLY in this M2 ownership-focused
unit suite (the child file belongs to another worker). Parent still tests real
full M2/comment/dialog integration, both themes/tablet input and history.

### U-DOM-DOCUMENT — before edit

`src/document-controls.ts`: 7 sites 16,18,21,25,32,35,41. M2CanvasTools constructs
DocumentControls for the selected native file; inspector uses an injected local
DocumentHost and owner Document. Actions: open local PDF/Markdown/image, choose
page/fit, previous/next/open original. Keep heading/status and detached inputs
before conditional append; page bounds/value/aria, fit option order, button
labels/type/disabled, async openSequence and disposal semantics. Mandatory:
owner-helper and plain fallback child order/attrs; page+width fit sent to host,
invalid page refusal, non-PDF/invalid-path branches, latest-open/dispose results.
Parent: real native PDF viewer, missing/closed viewer, mobile page controls.

### U-DOM-ARRANGE — before edit

`src/panel-arrange.ts`: 18 sites 144,147,150,155,162,165,168,181,186,190,201,
272,275,278,535,537,540,543. M1 session constructs PanelArrangeMode (~1812),
board menu/command enter the mode; enter builds status banner/tray/handles,
renderTray builds spare item rows, startItemDrag builds detached ghost/icon/
label then existing body insertion and insertion marker. Actions: enter/reset/
done/Escape/outside exit; flip panels; resize minimap; move panels/tools, move
spare tools into/out of toolbar, cancel/dispose drag. Keep order/labels/tool IDs,
setIcon/fallback, window/document pointer listener ownership and capture phase,
hover previews with no save, exactly existing commit/cancel cleanup. Mandatory:
existing panel-arrange tests plus owning helper constructions and controls;
all fallback drag/flip/resize/exit regressions. Parent real non-default zoom,
phone tray/hit bounds and toolbar/minimap placement with physical input.

### U-DOM-VISIBILITY — before edit

`src/panel-visibility.ts:31`: one toggle creation per available bar in mount.
M1 constructs PanelVisibility (~1827); mount picks native child bar or panel,
then existing refresh/placeButton set aria/icon/hidden/layout flags. Actions:
fold/expand toolbar/navigation and hold-drag/cancel/dispose. Keep click gating,
button type/classes/parent placement, aria-expanded, icon fallback, timer/window
receiver and saved panel position; no new listeners/work per frame. Mandatory:
existing cancel/timer/layout tests and helper/fallback owner node/attrs/click/
dispose regression. Parent mobile fold/placement/padding/themes and real input.

### U-DOM-SLIDES — before edit

`src/slide-show.ts:91,96,108`: mount root.ownerDocument bar, action buttons and
counter. M1 presentation entry (~6187) creates SlideShow. Actions start at
selected slide, previous/next/keyboard navigation/Home/End/Escape/end button,
restart and empty deck. Keep detached bar button/counter order, aria/tooltips,
icon/glyph fallback, pointerdown shielding, capturing owner-document key
listener, class and listener cleanup in stop. Mandatory existing slide-show
unit tests and helper/fallback child order/attrs/owner/key/button/end behavior.
Parent actual themes/zoom/mobile controls and native camera/presentation exit.

### U-DOM-EXPORT — before edit

`src/board-export.ts`: 10 sites 54,154,216,247,250,256,388,391,392,419.
M1 (~6224/6263) constructs ExportPanel/ExportOverlay, (~6394) calls capturePages.
Panel's private add is the shared typed creation point. Overlay creates frame,
tab/corner before drag listeners. Capture creates progress/status/span/Stop and
canvas sheet from wrapper.ownerDocument, already uses that defaultView for
capture timing/paint. Actions choose paper/pages/quality, move/resize export
page preview/commit, PDF/PPTX capture success/Stop/failure, close. Keep exact
class/role/text/button attrs and appending, disabled/busy state, event cleanup,
page geometry, screenshot flags and camera restoration, abort checks, canvas
context/JPEG/resource cleanup, SVG serialization logic untouched. Mandatory:
board-export and browser-export tests cover preview without commit and commit,
rebuild/listener removal, capture success/cancellation/render/setup failure and
restoration; add helper/fallback owner DOM and event behavior, capture canvas
created in owner realm. Parent actual raster/SVG appearance both themes, native
save/reopen, export files/device input. Never edit shared renderer/CSS/bundles.

For every UI slice: targeted lint before/after; exact emitted JS comparison
AFTER reversing only approved imports/creation rewrites/private tag annotation
in the comparison copy, to prove all other consumer code stayed unchanged.
This normalized equality is not a claim that the runtime factory dispatch is
byte-identical. Scoped compiler checks, focused tests and UTF-8/CRLF/diff checks.
All real app/device/integrated matrices remain pending and parent-owned.

## Completed bounded scope and results

All ten assigned source files are complete for their inventoried diagnostics:

| Owned source | Warnings before | Warnings after |
| --- | ---: | ---: |
| src/advanced-canvas-adapter.ts | 1 | 0 |
| src/importers/advanced-canvas.ts | 2 | 0 |
| src/importers/board-builder.ts | 1 | 0 |
| src/viewport-controller.ts | 3 | 0 |
| src/m2-tools.ts | 35 | 0 |
| src/panel-arrange.ts | 18 | 0 |
| src/panel-visibility.ts | 1 | 0 |
| src/document-controls.ts | 7 | 0 |
| src/slide-show.ts | 3 | 0 |
| src/board-export.ts | 10 | 0 |
| Total | 81 | 0 |

Errors: 0 before and after. No disabled lint rules, dynamic names, lint
configuration changes or broadly weakened types. The four records modules
contain only seven erased annotation/assertion changes. The six UI modules
contain only 74 reviewed factory replacements/imports and the private
ExportPanel.add tag annotation. All remaining consumer code is unchanged.
Shared dom-elements.ts was read, imported and tested, never edited here.

Changed additional owned paths: `tests/l20-authoring-dom.test.ts` (new focused
suite) and this linked before-edit/results note. Existing tests were only run.
No source outside the ten leases was changed by this worker.

Verification, all worker unit/static evidence:

- 88/88 records tests: advanced-canvas-adapter, import-advanced-canvas,
  import-common and viewport-controller.
- 72/72 existing DOM tests: panel-arrange, panel-visibility, slide-show,
  board-export and browser-export.
- 20/20 new tests, both owner helper and native plain-document fallback:
  exact control/child/default/label order; detached helper creation with its
  receiver and no direct native call; M2 shape creation, one mock native save,
  source/unknown retention, invalid geometry/review refusal, selector retention,
  rotation callback and owning interval cleanup; PDF bounds/fit/open/invalid/
  non-PDF/disabled branches and stale/disposed async viewer results; arrange
  tray/ghost/insertion/drag cancel with no save; fold toggle/RAF cleanup;
  presentation keyboard/buttons/exit owner listener; export panel disabled/
  old-listener cleanup, overlay preview then commit; owner canvas capture
  success, actual synthetic Stop click, renderer failure and camera/flag/UI
  cleanup. CommentsPanel is stubbed only in this M2-focused unit suite;
  integrated actual CommentsPanel behavior remains a parent gate.
- Targeted compiler program: ten owned modules and new test plus installed
  Obsidian SDK declarations/imported dependency closure, 0 owned diagnostics,
  0 dependency diagnostics at verification time. Adding the SDK declaration
  root supplies its ambient DOM types without any runtime Obsidian import.
- All ten public emitted TypeScript declarations match baseline byte-for-byte.
- Four type-only modules' plain emitted JS matches baseline byte-for-byte.
  Minifying those identical emitted JS modules also matches byte-for-byte.
  Direct TypeScript-to-minified-JS matches in three modules; board-builder's
  direct minifier assigns different local names (different hash), despite
  exactly identical unminified emitted JS. That direct mismatch is recorded,
  not hidden or claimed as production bundle identity. No naming changes were
  made to influence lint/minification. The plain-JS equality remains exact.
- Six UI modules' ordinary and minified comparison copies match baseline after
  reversing ONLY reviewed factory import/calls/private tag type. This proves
  unchanged consumer code, NOT byte identity of the new runtime factory dispatch.
- Baseline snapshots verified against `git show 2f3687c:<owned path>`.
- Scoped `git diff --check` passes; owned source/test/note are UTF-8 without BOM
  and CRLF. Emission artifacts retain the compiler's emitted bytes for hashes.

All artifacts are exclusively in `tools/obsidian_cdp/.out/l20-authoring-dom/`:
`eslint-before.json`, `eslint-after.json`, `inventory-before.json`,
`records-vitest.json`, `dom-existing-vitest.json`, `dom-owner-vitest.json`,
`proof.json`, repeatable `prove.mjs`, before/current source, comparison JS,
public declarations and the complete owned-scope `authoring-dom.patch`.

Repeatable scoped commands (repository root):

```powershell
node node_modules/eslint/bin/eslint.js src/advanced-canvas-adapter.ts src/importers/advanced-canvas.ts src/importers/board-builder.ts src/viewport-controller.ts src/m2-tools.ts src/panel-arrange.ts src/panel-visibility.ts src/document-controls.ts src/slide-show.ts src/board-export.ts --format json --output-file tools/obsidian_cdp/.out/l20-authoring-dom/eslint-after.json
node node_modules/vitest/vitest.mjs run tests/advanced-canvas-adapter.test.ts tests/import-advanced-canvas.test.ts tests/import-common.test.ts tests/viewport-controller.test.ts --cache=false --reporter=json --outputFile=tools/obsidian_cdp/.out/l20-authoring-dom/records-vitest.json
node node_modules/vitest/vitest.mjs run tests/panel-arrange.test.ts tests/panel-visibility.test.ts tests/slide-show.test.ts tests/board-export.test.ts tests/browser-export.test.ts --cache=false --reporter=json --outputFile=tools/obsidian_cdp/.out/l20-authoring-dom/dom-existing-vitest.json
node node_modules/vitest/vitest.mjs run tests/l20-authoring-dom.test.ts --cache=false --reporter=json --outputFile=tools/obsidian_cdp/.out/l20-authoring-dom/dom-owner-vitest.json
node tools/obsidian_cdp/.out/l20-authoring-dom/prove.mjs
```

Pending parent integration and risks: full check/test/lint/schema/bundle/build
and actual public-factory integration; real main/popout/iframe ownership;
both themes and Android physical controls; actual M2/comment dialogs/imports,
PDF page/fit viewer failures; arrange/fold/resize/minimap/selection geometry
and native preview paths before release, repeated drag/cancel/Undo/Redo;
export file visuals/capture restoration and durable save/reopen. Shared files
are concurrently changing, so scoped results are a snapshot and must be
rerun on the frozen integrated build. No full gates, real Obsidian or Android
pass is claimed. No production build/deployment/devices/commits/external
messages, shared plans/register/locales/style budgets or root .out writes.
