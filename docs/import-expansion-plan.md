# Import expansion plan — 2026-10-11

This branch extends the existing registry, BoardBuilder and import-command boundary. Pure adapters never write files, run editor runtimes or fetch assets. Existing Miro evidence and unknown Canvas fields are preserved. No schema extension is planned.

| Priority | Source / evidence | Baseline and intended increment | Dependencies / complexity | Acceptance |
| --- | --- | --- | --- | --- |
| 1 | Excalidraw scene v2, plugin JSON/compressed-json Markdown | Existing shapes/text/arrows/strokes/frames/vault links; add bounded embedded raster assets, pressure, structural groups, honest field-loss diagnostics | Existing readers/writers; high geometry and publication risk | Pending new fixtures and real-app checks |
| 2 | JSON Canvas 1.0, jsoncanvas.org/spec/1.0 | New common copy/validation adapter, native cards/edges, unknown-field preservation | No editor dependency; medium | Pending |
| 2 | Advanced JSON Canvas 1.0-1.0, Developer-Mike official spec | Existing style adapter; shared native validation, supported collapsed groups and presentation mapping | Existing metadata contract; medium | Pending |
| 3 | tldraw Obsidian plugin, github.com/tldraw/obsidian-plugin | Research actual persisted records/version and permitted examples; implement only substantiated subset | No tldraw runtime permitted; high migrations/asset risk | Pending source audit |
| Existing | Enhancing Mindmap / Markmind basic Markdown | Keep tested outline adapter and document new layout | Existing tests/import-mindmap.test.ts | Regression pending |
| Deferred | Markmind rich, github.com/MarkMindCkm/obsidian-markmind | detect:false is a stub; no claim of support without actual licensed samples and documented persisted structure | Proprietary semantics / evidence gap | Pending samples |

Primary references: https://github.com/zsviczian/obsidian-excalidraw-plugin ; https://github.com/excalidraw/excalidraw ; https://jsoncanvas.org/spec/1.0/ ; https://github.com/Developer-Mike/obsidian-advanced-canvas/blob/main/assets/formats/advanced-json-canvas/spec/1.0-1.0.md ; https://github.com/tldraw/obsidian-plugin ; https://github.com/MarkMindCkm/obsidian-markmind . Inspect formats, not licensed editor implementations; no foreign runtime in main.js. Author-generated fixtures must be labelled synthetic. External samples need provenance, pinned revision and permission.

Ownership: main agent owns types, registry, locales, BoardBuilder, asset publication and documentation. Independent workers may own Excalidraw geometry, Canvas adapters and a bounded tldraw audit. Status becomes implemented only after focused validation; real-app and physical-device claims require separate receipts.

Baseline tests: import-excalidraw, import-advanced-canvas, import-mindmap, import-common. Existing tests cover many geometric/link cases; they do not prove embedded publication, source staleness, native generic Canvas recognition or physical Android acceptance.
