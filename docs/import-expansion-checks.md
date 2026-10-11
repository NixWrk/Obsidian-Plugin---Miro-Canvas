# Import expansion regression register — 2026-10-11

Record execution evidence here, keeping unit/synthetic, real Obsidian with CDP renderer input, actual OS input and physical Android ADB input distinct. Pending is not passed.

| Area / user action | Mandatory checks before acceptance | Status |
| --- | --- | --- |
| Excalidraw import | Plain scene / JSON Markdown / compressed Markdown; old/new fonts and bindings; negative coordinates, radians, bound text, arrows, group/frame nesting and z-order; Cyrillic, Markdown/wikilinks; pressures, scale, frameId/customData significance and explicit losses | Units pass; Windows covers core geometry/links; legacy field variants pending |
| Embedded pictures | MIME/signature/size limits, malformed base64, total bytes, no remote download or active SVG/HTML; shared assets; safe paths; cancel writes nothing; stale source aborts; collision cannot overwrite; rollback only owned files after failed board creation | Units pass; native PNG publication passes; other codecs have generated-header units |
| JSON Canvas copy | All four node types/edges, omitted arrays per spec, unknown fields at every level, existing miroSource/miroCanvas unchanged; duplicate IDs/dangling endpoints/invalid geometry; unresolved attachment diagnostics | Units pass; native copy and CLI roundtrip pass |
| Advanced Canvas | Existing overrides win; collapsed group projection, presentation, portals and unsupported custom fields explicitly reported | Units pass; native compact snapshot passes; full neighbor-plugin coexistence pending |
| Mindmap and extra formats | Existing outline regression; actual persisted tldraw sample before implementation; Markmind rich remains pending without evidence | Outline regression and pinned tldraw subset pass; Markmind rich remains pending |
| Publication / preview | Cancel, empty/corrupt/oversized source, source changed during preview, target collision, failed write/open; original bytes unchanged; result path and localized losses visible | Fault-injection units + native cancellation/source preservation pass |
| Native editing | Isolated Windows Obsidian: command/menu preview, report on/off, reopen/save, plugin off native fallback, drag/resize/rotate attached edges before pointer release, group selection at non-default zoom, undo/cancel | Windows 20-case receipt passes with trusted CDP renderer input; OS/stylus/Android pending |
| Notes and export | Imported file cards/subpaths and wikilinks: search/backlinks/graph/properties; independent export where affected | Note search + actual backlink pane + raster PDF pass; SVG limitation and graph/property UI matrix pending |
| Android | Recheck ADB inventory; only MiroCanvasTest; record model/OS/app and real ADB input separately; no devices means pending | Pending: ADB lists no connected devices |
| Gates | Supported Node + npm ci; check/full test/source+MCP+CSS lint/build/schema/submission/MCP+CLI build/diff check; three UI smokes + Python oracle; main.js strictly below 5,000,000 bytes without Node/runtime loaders | Passed; details below |

No screenshots or activation of the person's foreground. Do not reuse/close another agent's Obsidian port 9346.


## Native export readiness finding — 2026-10-11

Before implementation: the imported pen is a normal native text card with text empty plus localOverrides.item drawing. Independent SVG and raster PDF both time out with page-not-drawn. Owned background probes show all nonempty text and note renderers ready while the blank drawing renderer stays queued/lastText unequal. The existing readiness loop advances every renderer, including this content-free card, and M1 refresh requeues it. Trace: runExport -> createExportCanvas -> M1CanvasSession.refresh -> settleExportMarkdown. Narrow repair: validate the owned renderer/queue shapes, cancel verified empty-card queues and wait only for declared text and file Markdown. Mandatory: completed and perpetually queued blank card, nonempty/file readiness, malformed/foreign queue refusal, cancellation/timeouts/cleanup, actual imported drawing+image+note export; preserve board bytes/camera. Android remains pending disconnected devices.


## Raw-source access and tool validation — 2026-10-11

Before implementation: native file explorer hides unknown .tldr/.excalidraw extensions by default when their editor is absent. The existing import command only runs on the active supported file. Reuse that command with a native fuzzy source picker when the active file is not importable; do not register/replace another editor's views or change core settings. Mandatory: cheap source filtering including raw and marked Markdown, no reads until selection, native Cancel/selection, raw .tldr without source editor, existing active-file and marked-note file-menu routes, localized placeholder.

CLI validate_board currently warns binding-orphan for native/independent lines although BoardBuilder binds every imported line and schema accepts them. Trace validateBoard -> pluginProblems -> checkMetadataReferences. Accept existing node/edge/connector IDs, retaining orphan warnings for missing IDs. Mandatory: native/free imported lines, genuine absent IDs, duplicate IDs and anchors; CLI/MCP build and validate/edit/undo of imported copy.


## Executed gates and receipts — 2026-10-11

Node 22.18.0, npm ci: pass. TypeScript and full Vitest: 3657 pass / one existing
skip across 172 files. Source lint: zero errors and only the existing main
command-ID compatibility advisory; MCP lint clean. CSS: zero !important/:has/
duplicate declarations. Production build, pinned schema check, submission check,
MCP/CLI builds and git diff --check pass. All three synthetic UI smokes pass;
Python oracle plus harness tests: 77 pass (existing pytest-asyncio configuration
deprecation remains). main.js: 4,659,715 bytes, strictly below 5,000,000; parsed
production audit rejects runtime script creation/unused PDF loaders.
SHA-256: 1133b049293d3610c5970f37b5d58897d26016557a35ddccdb2c8517fdd0a6be. No dependency/version/tag change.

[Windows receipt](receipts/import-expansion-windows.json): 20 passed scenarios in
an owned profile/vault on a non-interactive Windows desktop, SDK apiVersion
1.14.4 / copied obsidian-1.14.4.asar. The Electron UA still names the installed
1.12.7 shell; the explicit SDK probe confirms the loaded app version. Import
Cancel and source-picker Cancel write nothing; raw .tldr is selected without
its editor or changing core extension visibility. Existing active-file command
and marked-note file-menu routes pass. Preview report on/off, file creation,
source byte preservation, reopening and plugin-off native fallback pass.

At 50% zoom, real trusted CDP renderer mouse gestures move a card, an unselected
frame header and a mixed selection, resize and rotate the card. Native and
independent paths are inspected while held; preview document is not saved;
release commits and Undo restores positions and metadata. Viewport/selection
setup and DOM probes are instrumentation, not OS input. No screenshots or
foreground/desktop switch occurred. Selected-frame caption reachability under
the formatting toolbar, gesture-cancel/chain variants and physical stylus input
remain outside this receipt; existing interaction suites still pass.

Board search finds the imported note heading; an actual native backlinks pane
shows the imported board, and resolved-links projection names the note/image.
The bare native getBacklinksForFile cache does not expose the Canvas result, so
it is not used as a substitute for the pane. Raster PDF saves 86,363 bytes with
unchanged board bytes and zero leaked jobs/surfaces. SVG refuses the report's
Markdown list markers explicitly; no SVG success is claimed. Export setup/call
is instrumented and uses the real independent renderer and Vault save.

[CLI receipt](receipts/import-expansion-cli.json): a separate closed copy is
read/validated, dry-run moved, moved, validated, undone and validated (7/7).
Every schema/plugin diagnostic list is empty; undo restores the exact original
revision. Existing unknown fields, attachment references and source bindings
remain intact. The CLI now accepts line bindings while still warning on missing
IDs.

Android: current ADB inventory empty. No physical tablet/phone, native OS mouse
or stylus, graph UI or full properties UI acceptance is claimed. Markmind rich,
general tldraw shapes/assets/multipage/legacy schemas and a real tldraw Markdown
export remain pending with evidence requirements in the matrix/audit.

The authored rich-tree/native tldraw expansion and appearance repairs supersede
the earlier rich/current-wrapper pending entries above. See
[all-import showcase acceptance](import-all-showcase-checks.md) for final scoped
coverage, real editor/reopen checks, current local gates and remaining losses.
