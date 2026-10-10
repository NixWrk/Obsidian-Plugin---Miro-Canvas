# tldraw import evidence audit — 2026-10-11

This audit documents persisted formats, public format declarations, licensing evidence and the bounded pure adapter. The implementation uses existing project modules without adding an editor runtime, foreign dependency or copied implementation.

## Evidence receipts

All links below pin the revisions inspected, rather than claiming that a moving branch or a package name identifies a stable format.

| Receipt | Primary source | Observation |
| --- | --- | --- |
| T1 | [Official Obsidian plugin manifest](https://github.com/tldraw/obsidian-plugin/blob/2a3b92638095128655ce786eeb717dc346a4d2d0/manifest.json), [package](https://github.com/tldraw/obsidian-plugin/blob/2a3b92638095128655ce786eeb717dc346a4d2d0/package.json) | Plugin 1.32.0; declared SDK dependency ^5.4.0; minimum Obsidian 1.7.7. These are plugin/package versions, not record-format versions. |
| T2 | [Markdown and tldr writer](https://github.com/tldraw/obsidian-plugin/blob/2a3b92638095128655ce786eeb717dc346a4d2d0/src/utils/document.ts), [constants](https://github.com/tldraw/obsidian-plugin/blob/2a3b92638095128655ce786eeb717dc346a4d2d0/src/utils/constants.ts), [reader](https://github.com/tldraw/obsidian-plugin/blob/2a3b92638095128655ce786eeb717dc346a4d2d0/src/utils/parse.ts) | The note marker is tldraw-file. A JSON fence contains the START/END delimiters and a meta/raw object. Current raw is the serialized tldraw file. Metadata includes plugin-version, tldraw-version and uuid. |
| T3 | [Migration boundary](https://github.com/tldraw/obsidian-plugin/blob/2a3b92638095128655ce786eeb717dc346a4d2d0/src/utils/migrate/tl-data-to-tlstore.ts) | Older raw record maps marked SDK 2.1.4 need a synthesized schema and SDK migration. Current raw supplies tldrawFileFormatVersion, schema and records. The independent adapter does neither migration nor schema invention. |
| T4 | [Actual checked-in persisted drawing](https://github.com/tldraw/obsidian-plugin/blob/2a3b92638095128655ce786eeb717dc346a4d2d0/test/vaults/default/current-schema.tldr) | File format 1, schema 2; store 5, shape 4, page 1, draw 5. One page, two draw records with packed dim:2 XY paths, 71 and 89 points. Other records are document/session/camera/pointer/user state. |
| T5 | [SDK file envelope](https://github.com/tldraw/tldraw/blob/7937be360bcb8239d89e420850843f81313fc07b/packages/tldraw/src/lib/utils/tldr/file.ts), [draw schema](https://github.com/tldraw/tldraw/blob/7937be360bcb8239d89e420850843f81313fc07b/packages/tlschema/src/shapes/TLDrawShape.ts), [packed-path format](https://github.com/tldraw/tldraw/blob/7937be360bcb8239d89e420850843f81313fc07b/packages/tlschema/src/misc/b64Vecs.ts) | Modern files contain records arrays and schema 1 or 2. Draw storage changed from points arrays to packed paths; draw version 5 adds optional dim 2 or 3. XY path layout is an absolute little-endian float32 pair followed by little-endian binary16 delta pairs. No source function was copied. |
| T6 | [Older actual SDK sample](https://github.com/tldraw/tldraw/blob/7937be360bcb8239d89e420850843f81313fc07b/apps/vscode/extension/examples/v2.tldr), [another older sample](https://github.com/tldraw/tldraw/blob/7937be360bcb8239d89e420850843f81313fc07b/apps/vscode/extension/examples/v2a.tldr) | Both use file 1/schema 1/store 1/shape 1. v2 has one geo rectangle with text; v2a has an array-of-points drawing. Inspected remotely, not copied and not supported by this adapter. |
| T7 | [Archive distinction](https://github.com/tldraw/obsidian-plugin/blob/2a3b92638095128655ce786eeb717dc346a4d2d0/src/utils/constants.ts), [import UI boundary](https://github.com/tldraw/obsidian-plugin/blob/2a3b92638095128655ce786eeb717dc346a4d2d0/src/utils/file.ts) | Current .tldraw offline files are archives with SQLite/assets, distinct from JSON .tldr. Neither archive decoding nor arbitrary historical extension compatibility is claimed. |

T4 is a real persisted upstream test file. It establishes saved-file structure; no physical pen action or live editor save was performed for this audit. The Markdown test wraps T4 using the evidenced T2 writer structure; that wrapper is synthetic. A real persisted Markdown note exported by the plugin is still pending.

## Fixture provenance and permissions

tests/fixtures/import/tldraw-current-schema.tldr is copied byte-for-byte from T4 at revision 2a3b92638095128655ce786eeb717dc346a4d2d0.

- Raw URL: https://raw.githubusercontent.com/tldraw/obsidian-plugin/2a3b92638095128655ce786eeb717dc346a4d2d0/test/vaults/default/current-schema.tldr
- Size: 5,127 bytes.
- SHA-256: d4aa78fc99e15b98949656d03793d7b39c34289358e24b153c7859465591ad03.
- Original content and LF line endings retained; no shape, ID, path or metadata was changed.
- Permission evidence: the pinned [Obsidian plugin LICENSE](https://github.com/tldraw/obsidian-plugin/blob/2a3b92638095128655ce786eeb717dc346a4d2d0/LICENSE) is Apache-2.0, copyright 2023 Sam Alhaqab. A complete unmodified copy accompanies the fixture as tldraw-plugin-LICENSE.txt.
- License SHA-256: 43d2ba80a7ee3cb3e8251e37ab1973978dfa62e43f6d6f1c264b8d73b704cc94.
- The upstream tree at this revision has no separate NOTICE file. Fixture provenance and attribution are recorded here.
- Test changes to shapes, invalid bytes, float vectors, metadata and Markdown wrappers are expressly synthetic derivatives created in memory, not additional real exports.

Licenses differ within the tldraw ecosystem. The Obsidian integration is Apache-2.0. The pinned [SDK root license](https://github.com/tldraw/tldraw/blob/7937be360bcb8239d89e420850843f81313fc07b/LICENSE.md) is the tldraw license, with production/license-key conditions. [tlschema](https://github.com/tldraw/tldraw/blob/7937be360bcb8239d89e420850843f81313fc07b/packages/tlschema/LICENSE.md) and the [VS Code extension](https://github.com/tldraw/tldraw/blob/7937be360bcb8239d89e420850843f81313fc07b/apps/vscode/extension/LICENSE.md) have their own MIT licenses. An integration license is not permission to bundle the whole editor. The adapter uses existing project modules and browser-standard atob/btoa/DataView; it independently applies the evidenced byte layout and IEEE 754 numeric definition.

## Implemented boundary

The pure tldrawAdapter recognises .tldr, or .md with a parsed boolean tldraw-file: true property. Recognising a file does not promise its conversion: corrupt data, unknown versions, missing/duplicate delimiters and unsupported document layouts fail with ImportError before publication.

The file must have format 1, schema 2, and exact sequence values com.tldraw.store=5, com.tldraw.shape=4, com.tldraw.page=1, com.tldraw.shape.draw=5. It must have exactly one page; every shape must directly name that page as parent. Nested/group/frame transforms and multiple pages are refused rather than overlapping unrelated local coordinates.

The converted subset is deliberately the T4 sample's variant:

| Source requirement | Output |
| --- | --- |
| typeName shape, type draw; one free segment; packed path and dim 2 | One existing LocalStroke/BoardBuilder drawing per source shape. Little-endian float32 absolute XY and float16 deltas are decoded; source order follows index. |
| rotation 0, opacity 1; scale, scaleX and scaleY all 1 | Coordinates/bounds retained within native Canvas integer geometry. No guessed transform or mirror semantics. |
| color black, size m, dash draw, fill none; isPen false; isClosed false; isComplete true | Theme-readable project pen ink and four-unit stroke width. Smoothing, ink and width are approximations, recorded once per stroke with tldrawStroke. No pressure fidelity claim. |
| isLocked true | Existing card lock override. |
| Source ID | Existing tldraw-prefixed binding, with no miroSource invented or changed. |

A top-level shape outside this variant produces a bounded dashed placeholder and a tldrawVariant loss. Unsupported asset/binding/custom record types are reported; no asset is fetched, resolved, published or executed. Nonvisual session/camera/pointer/user state is intentionally not imported. The adapter reports nonempty record meta/customData, unknown shape/props/segment fields, and unknown file/schema/wrapper keys through customData; the real sample's document.meta.desktop is also reported. Markdown content outside the drawing and additional note properties receive explicit loss entries. Source values remain in the original bytes, not secretly copied into plugin metadata. Report details retain each lost field, while counts use one outcome per source ID at its worst status. A shape with both a stroke approximation and unsupported metadata counts once as not imported, with both details retained. File, schema and Markdown-wrapper losses have separate source IDs. The optional omittedEntries field records details beyond the report cap without changing counts.

Bounds: source text at most 16 Mi UTF-16 code units, at most 10,000 records, IDs/indexes at most 512 code units and type names at most 64, at most 4,096 points per stroke and 100,000 decoded points total, finite coordinates within 100,000 units, and existing LocalStroke validation. Base64 must be canonical with exact XY byte alignment; nonfinite float32/binary16 values and over-budget paths fail. Point simplification/truncation is not used.

Registry eligibility covers .tldr and marked notes, with a localized format name identifying packed strokes. The loss reasons are tldrawStroke (stroke width, smoothing and ink approximated), tldrawVariant (tldraw record or drawing variant not supported), and the shared customData reason. This adapter produces no assets and needs no schema extension. Compatibility remains restricted to the subset described above.

## Markmind rich evidence

Pinned repository revision: feeae113bf9400f1b2215f2595f3ffb4aaf3235e. The [manifest](https://github.com/MarkMindCkm/obsidian-markmind/blob/feeae113bf9400f1b2215f2595f3ffb4aaf3235e/manifest.json) reports 3.7.4. The [English README](https://github.com/MarkMindCkm/obsidian-markmind/blob/feeae113bf9400f1b2215f2595f3ffb4aaf3235e/README.md) and [Chinese manual](https://github.com/MarkMindCkm/obsidian-markmind/blob/feeae113bf9400f1b2215f2595f3ffb4aaf3235e/docs/%E7%94%A8%E6%88%B7%E6%89%8B%E5%86%8C.md) evidence mindmap-plugin: rich plus embedded JSON, but the examples use JSON Data, {...} or a mindmap-data placeholder. These do not define node, edge, layout, summary, boundary or PDF-reference records.

The public tree inspected contains documentation, manifest, changelog and the distributed main.js, without a LICENSE or persisted rich-map sample. The manual states that the plugin is not open source. main.js was neither opened nor copied. This is an evidence gap, not a claim that no usable file exists anywhere. Do not fabricate records from feature names, screenshots, outline Markdown, or PDF annos data. The rich stub remains disabled. Required next evidence: a permitted real saved rich-map file, plugin version, provenance/redistribution consent and examples covering relationships/summary/boundary/layout; then a separate semantic audit. Existing basic-outline support is unchanged.

## Verification and remaining acceptance

Unit evidence on Node 22.18.0: 23 focused Vitest tests pass with source-ID/worst-status counts and the report-detail cap. The unmodified upstream fixture is hash-checked. Expected 71/89-point coordinates and bounds were calculated independently using Python standard-library base64 and struct with little-endian float32/binary16, then asserted in tests. Tests cover wrappers, detection, versions, duplicates, parents/pages, order/locks/themes, binary16 subnormals/nonfinite values, canonical base64/limits, aggregate point budgets, placeholders and metadata losses. One regression creates more than 10,000 details on a single record and verifies both capped entries/omittedEntries and unchanged record counts. Whole-checkout TypeScript and git diff --check also pass at this verification point. Targeted ESLint reports zero errors and five unnecessary-assertion warnings. This does not establish rendering equivalence.

Pending checks: real isolated Obsidian command/preview/reopen/save/plugin-off/native editing; actual OS/stylus input; physical Android; full release gates and UI smokes. No person's vault, foreground, Obsidian port or Android device was used for this audit.

Pending format coverage: a real Markdown export; text/richText, geo/note/frame/group records; nested rotations/scales, multipage placement; arrows/lines/bindings; legacy schema 1 and 2.1.4 record maps; explicit points and 3D/pressure paths; other colors/widths/dashes/fills; images/bookmarks/videos/embeds and asset publication; .tldraw archives.

Integration evidence: shared format/reason keys and source picker are wired. Final
source lint retains only the existing main command-ID compatibility warning.
The full integration suite passes (see import-expansion-checks.md). Windows
Obsidian API 1.14.4 passed a real raw .tldr selection/import without its editor
and a marked-note file-menu import. The note wrapper itself is still synthetic.
The receipt uses trusted CDP renderer input on an isolated Windows desktop,
not OS/stylus input or physical Android. These results supersede the initial
whole-checkout/lint status above.
