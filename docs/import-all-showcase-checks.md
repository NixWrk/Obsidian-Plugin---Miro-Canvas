# All-import appearance showcase

Seven authored examples cover the five supported source plugins plus native
JSON Canvas, with Markmind basic/rich shown separately. This is tested format
coverage, not every feature of those editors or a pixel-parity certificate.

Actual original editors: Excalidraw 2.28.1, Advanced Canvas 7.1.0, Enhancing
Mindmap 0.2.5, Markmind 3.7.4 and tldraw 1.32.0. Only isolated profiles and
noninteractive Windows desktops were used. Source/result screenshots are real
Electron captures; showInactive never switched desktops or focused a window.
Source authoring, viewport setup and read-only probes are instrumentation;
preview/Create/Undo/drag input uses trusted CDP renderer input, not OS input.

## Final evidence

- Production main.js: 4,715,046 bytes. No foreign editor runtime, new schema
  fields or plugin network/installation behavior. Schema remains pinned at
  miro2obsidian 2679e20.
- All 177 Vitest files pass: 3,864 tests, one skipped. TypeScript, source/MCP
  lint, CSS, build, schema, submission and diff checks pass. The existing main
  command-ID compatibility advisory remains; no new lint warning.
- Three synthetic browser smokes pass; Python suites total 77 checks. These
  are distinct from the real Obsidian receipt.
- Final isolated Obsidian 9352 harness passes 20 checks, including 50% zoom
  drag/resize/rotation, mixed/frame moves, live native/independent edge paths,
  no persisted preview, commit/Undo, native preview/picker/file menu and export.
  Harness now waits for the intended new board and a reachable file-tree hit
  target; earlier sidebar-animation misses are not product failures.
- Each of the seven closed result copies passes the shared CLI validate_board.
  Attachments are copied at their exact referenced paths and checked bytewise.
  The Advanced missing note is intentional and retained as a missing reference.
- Advanced: 33 matched original/corrected poses at 50/100/200% and 1280/1600
  widths; native .07 tint/.7 border palette, invisible container/content/label,
  direct route and native records/asset bytes are verified. Reopen and disposable
  drag/resize/fill/Undo also pass. Remaining geometry/portal/collapse/deck limits
  are in import-advanced-fidelity-checks.md.
- Enhancing, Markmind basic and rich: 13 nodes/12 edges each. Accepted exact
  source captures retain boxes, safe styles and sampled branch paths. Native
  reopen retains fields and has no renderer diagnostics. Original outline-only
  imports cannot recover source geometry offline. Rich extra components remain
  reported and unevidenced; marker dots and typography can differ.
- Excalidraw: original 67-element editor capture, unchanged authored source,
  final actual 9356 command import: 52 nodes/one native edge/two independent
  connectors/six assets. All PNG/JPEG/GIF/WebP/reflected PNG/passive SVG images
  load with labels hidden, no session/renderer diagnostics, source light theme
  and declared line height. Earlier 9353 0/6 label failures are superseded by
  the final late-mount fix, not reclassified as successes.
- tldraw: source original editor writer and actual automatic command import;
  source bytes retained and dark theme survives a light host. Final actual
  imported bytes are reopened unchanged in 9356 with exact referenced assets;
  image name hidden/radius zero/loaded and diagnostics empty. Text viewport
  remains 128 high with scrollHeight 147; no text metric parity is claimed.

## Remaining appearance differences

Excalidraw roughness/hatching/shape opacity and freehand smoothing; source font
availability, native Markdown/line-label rendering and small note embeds;
Advanced contours/insets/dashes/caps/A* routes, collapse proxies, portals and
presentation semantics; mindmap sampled curves/markers/text insets; tldraw
freehand outline/fonts/dashes/caps and unsupported variants. Raw source files,
reports and full PNGs accompany the examples. No manually masked screenshot or
full-board raster is presented as an editable conversion.

Source editor normalization happened before freezing some authored sources.
Receipts distinguish this from source-preserving import. Advanced's later
foreign-only array-order probe/restoration is recorded candidly. Foreign
implementation/assets are not redistributed in the plugin or example bundle.

Physical Android, OS pointer and stylus acceptance remain pending. No ADB
executable was available in the current terminal inventory; prior evidence is
not substituted. Large-board mutation/source-renderer suites pass; late labels
are processed through existing bounded/coalesced markup batches.

Generated local artifacts: primary tools/obsidian_cdp/.out/all-import-showcase,
All-imports-showcase.zip and its manifest/byte checks. Inline preview has seven
formats, three views, decoded images and no overflow/errors at 1024/360 widths.
