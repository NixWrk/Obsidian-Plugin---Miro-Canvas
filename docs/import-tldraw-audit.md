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

T4 is a real persisted upstream test file. Synthetic wrappers remain explicitly labeled in tests. Real Markdown coverage is now resolved by the independently authored original-editor save described below; no OS pen input is claimed.

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

## Supported source boundary

The pure adapter recognizes .tldr, or Markdown with parsed boolean tldraw-file: true. Detection is eligibility, not a conversion promise. It accepts file 1/schema 2 and exact store 5/shape 4/page 1/draw 5 sequences; one page with direct page-parent shapes. Unknown versions, duplicate IDs, nested/group/frame transforms and multipage documents fail before publication. No SDK migrations are guessed.

| Source | Existing native output and fidelity limits |
| --- | --- |
| draw 5: one packed XY free segment, black/m/draw/none, non-pen, complete/open, unrotated/unit scale/opacity | Drawing with integer-padded local box preserves fractional raw point positions. Nominal width 4.5 and light/dark ink are pinned SDK values. The source smoothed filled outline is NOT reproduced; tldrawStroke stays explicit. |
| geo 11/12: rectangle, ellipse, diamond, explicit w/h/growY, unit scale/no flips, black/red/blue, none/solid fill | Editable shape card with origin-to-center rotation, source text and approximate default colors/fonts/border. Measured capture overrides resolved boxes/styles. Pattern fills/other geo/custom tokens remain placeholders. |
| text 4: plain paragraphs/text/hardBreak, unit scale | Editable text item. Offline requires autoSize false and estimates height. Valid measured capture supplies actual width/height, including autoSize true. Rich marks/other nodes remain unsupported. |
| line 5: two indexed points, spline line, unit scale | Straight independent connector in transformed board coordinates. Live capture can supply a sampled shaft for multi-point/cubic paths; offline routes beyond the bounded subset remain unsupported. |
| arrow 8: arc/zero bend, empty label, no start cap, none/arrow/triangle end cap | Free straight connector, or attached edge for exact AND precise binding.arrow 1 anchors to imported targets. Live target/shaft capture supports observed clipping/curvature. Attached samples inverse-rotate about the rounded native center. Arrowheads/dashes remain approximate. |
| image 5: w/h, crop null, no flips/URL decoration, image asset | Native file card from resolved local path or bounded embedded raster. No remote fetch. Filename hidden and cornerRadius zero. Crops/mirroring/animation/theme variants remain unsupported. |
| IDs/locks/meta | Existing prefixed bindings and card locks. Nonempty meta/customData/unknown fields are explicitly reported and remain in original bytes. |

Unsupported visual records get bounded placeholders, unsupported assets/bindings get details, and successfully consumed records are not mislabeled unknown. Counts use one worst outcome per source ID; details are capped with omittedEntries. Mixed line/card index order reports zOrder because their rendering layers differ.

Pure bounds: 16 Mi UTF-16 source length, 10,000 records, bounded IDs/type names, finite geometry within 100,000 units, 4,096 points per packed stroke and 100,000 total. XY storage is independently decoded as a float32 pair followed by binary16 delta pairs. No path simplification/truncation, foreign runtime or dependency is added. Existing raster/SVG attachment validators remain the shared publication boundary.

## Actual original-editor provenance

QA source: plugin ID tldraw, manifest 1.32.0 / SDK 5.4.0, min app 1.7.7. [Install release](https://github.com/tldraw/obsidian-plugin/releases/tag/1.32.0), three files main.js/manifest.json/styles.css. Actual command tldraw:new-tldraw-file-.md-new-tab created the note in owned isolated Obsidian API 1.14.4, port 9354. Original editor APIs authored nine locally designed geo/text/line/arrow/image/draw records, two bindings and one raster; the original plugin supplied defaults and wrote Markdown. A trusted CDP renderer drag/Undo restored the ellipse. This is renderer input, not OS/stylus input.

The real writer saves meta {uuid,plugin-version,tldraw-version} and raw {tldrawFileFormatVersion:1,schema:{schemaVersion:2,sequences},records:[...]}. The suspected raw Snapshot/store mismatch was not present. No Markdown parser change is needed.

tests/fixtures/import/tldraw-editor-authored-1.32.0.md is the actual saved source: 11,183 UTF-8 bytes, 19 records, 9 shapes, geo sequence 12.
SHA-256: a574acb8bc541acaa41317b301153d524b0495f0ce7efe81ab3deef959ad28af.
The task authored its content/IDs/PNG; this is editor-generated data, not copied implementation.
tests/fixtures/import/tldraw-editor-appearance-1.32.0.json records measured facts for the exact source.

The upstream fixture retains its original pinned d4aa78fc hash. The original editor normalized only its staged copy; rendered saved-copy hash:
93fb21b5897da59d4e867c7da5fd754b2fc59025889d43a97211d15a03a5dbd4.
That editor normalization is separate from unchanged import-source bytes. Both original and normalized copies are retained in showcase artifacts.

Authored synthetic source fixtures remain in tests/fixtures/import/tldraw-authored-native.tldr and .out/all-import-showcase/tldraw/authored-all.tldr/.md, with explicit provenance. Synthetic wrappers/invalid/variant test derivatives are not labeled real exports.

## Read-only open-view handoff

src/import-tldraw-appearance.ts exports readOpenTldrawAppearance(app,file,sourceText); import-command.ts imports it and supplies context.tldrawAppearance only for the tldraw adapter. Guard: installed manifest 1.32.0, SDK-marked wrapper 5.4.0, source-file object identity, editor-container containment, current page and exact saved/live shape/binding/asset JSON. No source/editor write, view registration, SDK or plugin runtime is added.

Verified exposed APIs: currTldrawEditor, getContainer, getCurrentPageShapes, getCurrentPageId, getShapeGeometry, getShapePageTransform and store.get. Shape-owned DOM supplies computed fonts/paint. SVGGeometryElement getTotalLength/getPointAtLength/getCTM samples 33 shaft points; local CTM followed by the actual page matrix maps them to board units. Screen-derived sampling was discarded because CSS rounding shifted it about 0.299 units.

Protocol: {sourceText, theme:'light'|'dark', shapes:[{sourceId,x,y,width,height,style}], connectors:[{sourceId,points:[{x,y}],color,width}]}.
Boxes are unrotated rectangles centered on the transformed local geometry center, compatible with native center-based rotation. Style uses existing typography/colors/borderStyle/borderWidth metadata. Pure validation atomically checks exact source bytes, IDs, bounds, theme and metadata. Shaft samples become route straight with interior absolute waypoints. Unsupported geometry/format remains a reported approximation or placeholder.

Host bounds: 2,000 shapes, 100,000 samples, 16 Mi source, JSON depth 32. Missing/stale/unfamiliar/virtualized source views return undefined and retain the explicit offline approximation. A live reader receipt returned six cards and three shafts, including text height 128; wrong installed/source version, stale model JSON and mismatched file identity were rejected.

## Native captures and measured differences

Primary output is tools/obsidian_cdp/.out/all-import-showcase/tldraw in the J: repository.

| Receipt/artifact | Meaning |
| --- | --- |
| capture-receipt.json, original-authored/upstream-light/dark.png | Real original source screenshots, hashes and unfocused window state. |
| authored/upstream-facts-*.json and appearance-*.json | Actual model boxes/page matrices/fonts/SVG paints and bounded snapshot protocol. |
| native-import-receipt.json and native-*-offline.canvas | Actual production command imports; both saved source byte strings unchanged. |
| pure-regression-receipt.json, pure-*.canvas | Measured-context conversions validated against all three pinned JSON schemas; staged native captures are separately named. |
| host-reader-receipt.json | Actual source reader success and version/stale/file fail-close cases. |
| result-*.png and native-capture-receipt.json | Real native rendering with tldraw disabled; source/result setup and viewport facts. |

Electron capturePage used showInactive on the owned CodexMiroImport9354 noninteractive desktop, then hid the window. Every capture was unfocused. No foreground activation, desktop switch, user screen, port 9352 interaction or physical Android claim.

Initial deployed production: 4,705,103 bytes, SHA-256 30fd613538ee01d1e40f01be7dad5c2528ba0a41c9661de132b1da4253b62e92. Three files were copied with Miro disabled, then enabled. That build had no automatic tldraw snapshot handoff; its actual imports and manually staged measured-context results are distinct. Subsequent host/adapter fixes await the parent's refreshed build and automatic-command receipt.

Measured source text is 260 x 128; offline estimates are taller. Rectangle local box is 220 x 140 at (-300,0), rotation 0.2 rad; native center conversion preserves it with less than one unit integer rounding. Bound-arrow SVG shaft endpoints are (219.7799987793,70) and (300.2200012207,70); sampled source clipping is retained, while native arrowhead rendering differs.

Visible remaining gaps in the first native captures: diamond-label wrapping/scrollbars, standalone text clipping from native padding, font fallback with the source editor off, image filename/rounding, dash/arrowhead differences and a substantially different freehand polyline. The adapter now hides the image filename and sets radius zero; parent owns renderer fixes. Source freehand is a smoothed filled outline (local height ~7.7288), while raw authored points span 25 units. Captured scalar width/color does not reproduce its outline. Exact pixel/full-tldraw support is not claimed.

## Markmind and other mindmap evidence

Enhancing Mindmap ID obsidian-enhancing-mindmap, [0.2.5 release](https://github.com/MarkMindCkm/obsidian-enhancing-mindmap/releases/tag/0.2.5), source 1f5b100439359207e360578cdb1e282961951dc2, MIT copyright 2021 Mark. Basic Markdown preserves text/hierarchy, not original node geometry/SVG styles. Authored fixtures and optional checked snapshots are documented in import-mindmap-fidelity-audit.md. Valid captures retain sampled straight paths and use the appearance reason; default offline layout uses layout. Captured positive corner radius uses existing rectangle shape metadata. Pure file ownership is released.

Markmind ID obsidian-markmind, [3.7.4 release](https://github.com/MarkMindCkm/obsidian-markmind/releases/tag/3.7.4), repository feeae113bf9400f1b2215f2595f3ffb4aaf3235e. The public manual states it is not open source; no redistribution license or meaningful rich JSON sample was found in its public documentation. That initial sample gap is now resolved by the parent's own editor-generated 13-node map from the basic-to-rich command without paid activation or bypass. See tests/fixtures/import/markmind-rich-authored-3.7.4.md and import-markmind-rich-checks.md. This worker inspected saved data, not proprietary implementation.

mindData contains id/text/pid/x/y/stroke/style plus root layout; opt has font/background options. The parent owns the bounded rich-tree adapter and real rich QA. Empty induceData/wireFrameData/relateLinkData/calloutData do not evidence nonempty summaries, boundaries, relationships or callouts. Those remain pending; no rich records are invented.

## Pre-change trace and regression acceptance

User actions: create/open original drawing, preview/import, compare native appearance, then edit cards/lines/images. Trace: source picker/registry -> pure envelope reader -> BoardBuilder/ImportAssets -> preview/publication -> source renderer. Native card rotation is about its center; tldraw transforms are about source origin. Existing stroke boxes map to integer native card rectangles. Native node anchors rotate around rounded card centers. The host captures existing view facts once per import and fails closed.

Before expansion: require fractional decoded coordinate reconstruction, rotated geo center mapping, rich mark refusal, line index ordering, exact/precise vs unsupported bindings, embedded raster validation/no network, metadata detail/count caps, source immutability and deterministic import. Before host implementation: require manifest/view/file/record equality, bounded local matrix sampling, stale/version/unsafe failure, exact source bytes and measured text height. Before focused fixes: native image caption/radius defaults, inverse-rotated attachment resolution and unknown theme refusal. Lint realm-guard trace is in lint-remediation-checks.md.

Current verification: 35 tldraw + 45 common tests (80/80), TypeScript, scoped host/adapter/import-command lint and git diff --check pass. The real editor fixture and measured snapshot are exercised. Actual source-reader rejection and command-import byte checks are separate native receipts. Parent owns refreshed production/renderer capture and full release gates.

Pending formats: nested/multipage/legacy schema 1 or 2.1.4 maps, explicit array/3D pressure paths, rich marks, automatic offline text width, arbitrary colors/themes, other geo/note/frame/group types, offline complex/clipped/labelled arrows, cropped/mirrored/video/bookmark/embed assets and .tldraw archives. Physical Android and OS/stylus input remain pending.