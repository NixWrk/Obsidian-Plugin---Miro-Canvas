# Import expansion regression register — 2026-10-11

Record execution evidence here, keeping unit/synthetic, real Obsidian with CDP renderer input, actual OS input and physical Android ADB input distinct. Pending is not passed.

| Area / user action | Mandatory checks before acceptance | Status |
| --- | --- | --- |
| Excalidraw import | Plain scene / JSON Markdown / compressed Markdown; old/new fonts and bindings; negative coordinates, radians, bound text, arrows, group/frame nesting and z-order; Cyrillic, Markdown/wikilinks; pressures, scale, frameId/customData significance and explicit losses | Pending |
| Embedded pictures | MIME/signature/size limits, malformed base64, total bytes, no remote download or active SVG/HTML; shared assets; safe paths; cancel writes nothing; stale source aborts; collision cannot overwrite; rollback only owned files after failed board creation | Pending |
| JSON Canvas copy | All four node types/edges, omitted arrays per spec, unknown fields at every level, existing miroSource/miroCanvas unchanged; duplicate IDs/dangling endpoints/invalid geometry; unresolved attachment diagnostics | Pending |
| Advanced Canvas | Existing overrides win; collapsed group projection, presentation, portals and unsupported custom fields explicitly reported | Pending |
| Mindmap and extra formats | Existing outline regression; actual persisted tldraw sample before implementation; Markmind rich remains pending without evidence | Pending |
| Publication / preview | Cancel, empty/corrupt/oversized source, source changed during preview, target collision, failed write/open; original bytes unchanged; result path and localized losses visible | Pending |
| Native editing | Isolated Windows Obsidian: command/menu preview, report on/off, reopen/save, plugin off native fallback, drag/resize/rotate attached edges before pointer release, group selection at non-default zoom, undo/cancel | Pending |
| Notes and export | Imported file cards/subpaths and wikilinks: search/backlinks/graph/properties; independent export where affected | Pending |
| Android | Recheck ADB inventory; only MiroCanvasTest; record model/OS/app and real ADB input separately; no devices means pending | Pending |
| Gates | Supported Node + npm ci; check/full test/source+MCP+CSS lint/build/schema/submission/MCP+CLI build/diff check; three UI smokes + Python oracle; main.js strictly below 5,000,000 bytes without Node/runtime loaders | Pending |

No screenshots or activation of the person's foreground. Do not reuse/close another agent's Obsidian port 9346.


## Native export readiness finding — 2026-10-11

Before implementation: the imported pen is a normal native text card with text empty plus localOverrides.item drawing. Independent SVG and raster PDF both time out with page-not-drawn. Owned background probes show all nonempty text and note renderers ready while the blank drawing renderer stays queued/lastText unequal. The existing readiness loop advances every renderer, including this content-free card, and M1 refresh requeues it. Trace: runExport -> createExportCanvas -> M1CanvasSession.refresh -> settleExportMarkdown. Narrow repair: validate the owned renderer/queue shapes, cancel verified empty-card queues and wait only for declared text and file Markdown. Mandatory: completed and perpetually queued blank card, nonempty/file readiness, malformed/foreign queue refusal, cancellation/timeouts/cleanup, actual imported drawing+image+note export; preserve board bytes/camera. Android remains pending disconnected devices.


## Raw-source access and tool validation — 2026-10-11

Before implementation: native file explorer hides unknown .tldr/.excalidraw extensions by default when their editor is absent. The existing import command only runs on the active supported file. Reuse that command with a native fuzzy source picker when the active file is not importable; do not register/replace another editor's views or change core settings. Mandatory: cheap source filtering including raw and marked Markdown, no reads until selection, native Cancel/selection, raw .tldr without source editor, existing active-file and marked-note file-menu routes, localized placeholder.

CLI validate_board currently warns binding-orphan for native/independent lines although BoardBuilder binds every imported line and schema accepts them. Trace validateBoard -> pluginProblems -> checkMetadataReferences. Accept existing node/edge/connector IDs, retaining orphan warnings for missing IDs. Mandatory: native/free imported lines, genuine absent IDs, duplicate IDs and anchors; CLI/MCP build and validate/edit/undo of imported copy.
