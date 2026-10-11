# Markmind rich tree import — provenance and checks

## Pre-change trace — 2026-10-12

User action: import the owner's authored Markmind rich tree and compare the
editable Canvas with the original open source view. Trace: existing rich
adapter stub -> exact rich marker and fenced JSON -> checked flat tree ->
BoardBuilder text cards and attached native edges -> existing preview and
publication boundary. Optional read-only source layout facts are supplied by
the parent host; this worker does not access editor internals or run it.

Ownership: `src/importers/markmind-rich.ts`, separate
`tests/import-markmind-rich.test.ts`, this document and the new authored data
fixture. Shared types/locales/registry/BoardBuilder/source-layout reader,
source demonstration and real acceptance remain with their owners. No commit
or push by this worker.

## Exact authored sample provenance

The parent generated this OWN QA map using the original Markmind **3.7.4**
visible native **basic to rich** command, then copied the actual saved source
to `.out/all-import-showcase/markmind-rich/actual-authored-rich.md`. No activation,
license bypass or proprietary implementation copying was used. This worker
reads only the saved user-authored data. Plugin/version/command provenance is
reported by the parent, not independently verified by this worker's input.

A byte-identical working copy is now
`tests/fixtures/import/markmind-rich-authored-3.7.4.md`.
Original UTF-8 source: 2899 bytes; SHA-256
`bdffedf4fe741a7c9d02af8bbf366ff95952556e4adfc2edc58632ae88fc2082`.
Normalized-LF UTF-8 SHA-256:
`bdffedf4fe741a7c9d02af8bbf366ff95952556e4adfc2edc58632ae88fc2082`.
These hashes identify the original receipt; Git line-ending conversion may
change checkout bytes. Parsed fields and source node IDs are regression-tested.

The actual source has **13** flat records in one `mindData`
list, one root, 12 parent-child relations, Cyrillic labels, Markdown bold and a
wikilink. Root ID: `beb4a817-f9a9-d7cd`. Positions, parent `pid`,
branch `stroke`, empty node `style`, root layout and `opt` are persisted.
`induceData`, `wireFrameData`, `relateLinkData` and `calloutData` are empty.
The payload has no explicit format version; 3.7.4 is the producing plugin's
reported version and must not be invented as a source schema version.

This removes the lack of an authored rich TREE sample. It does not establish
summary/boundary/relation/callout, HTML/image/PDF/annotation, free node,
multi-tree, legacy, or every commercial rich-feature semantics. No foreign
editor code, assets, runtime or licensed sample was copied.

## Planned subset and fail-closed boundary

Recognise only `mindmap-plugin: rich` Markdown. Parse one evidenced fenced JSON
object with `mindData: [[flat records]]`. Require bounded unique IDs, text,
finite saved x/y, exactly one root, valid parent IDs and a complete connected
acyclic tree. Reject empty/multiple-tree, malformed/ambiguous fences, invalid
records or topology before allocating board IDs. Preserve source text bytes
and raw fields in the reader result, never write them back.

Export `parseMarkmindRichSource(sourceText)` with checked `nodes` exposing
sourceId/parentId/text/x/y/raw and the raw envelope for parent source mapping.
Fallback native cards retain Markdown and saved x/y. Branches bind to their actual
parent/child cards, point to the child's direction and keep checked persisted
stroke colors. With no complete snapshot, sizes and branch paths are estimated
and source appearance is reported as approximated. Safe declared font/paint/
border styles use the existing native metadata contract; unsupported style
fields are reported, never executed.

Optional `context.mindmapLayout` requires exact sourceText and complete,
unique sourceId/text/parentId matches, finite bounded captured x/y and positive
measured width/height,
checked existing style fields, all expected parent-child edges and finite
bounded compatible endpoint samples. Reject stale, partial, unsafe or
mismatched snapshots atomically; use persisted positions and honest appearance
approximation instead. Theme uses the existing BoardBuilder finish contract.
Captured positions override saved x/y: the parent observed Markmind 3.7.4
recalculate child positions on opening unchanged source. Identity and hierarchy
remain tied to exact source bytes; layout facts must be coherent with captured
edge endpoints. The pure source reader still returns saved positions unchanged.
Snapshot geometry/style preservation does not certify SVG/native Markdown
padding, font fallback or sampled curve pixel equivalence.

Auxiliary component arrays and unknown meaningful fields remain explicit
losses or unsupported structures. Collapsed branches are shown expanded and
reported. Viewport scroll/transform-origin bookkeeping does not move cards.
Non-tree components have no inferred geometry or fabricated source bindings.

## Mandatory checks

| Area | Checks | Status |
| --- | --- | --- |
| Own authored evidence | original receipt hash/fields; 13 labels/cards and 12 native branches; IDs/text/Markdown/positions/strokes; input unchanged | Passed rich focused units |
| Detection and pure reader | rich/basic/ordinary notes, BOM/CRLF, JSON errors, ambiguous fences, node/byte caps, IDs/parents/root/cycle validation | Passed rich focused units |
| Native authoring | independent node order; left/right branches; checked styles and losses; no runtime/network/schema fields | Passed rich focused units |
| Snapshot | exact bytes and ID/text/parent matches; bounded native reflow; complete nodes/edges; endpoints, style, theme and point budget; unsafe/stale/partial all-or-nothing fallback | Passed rich focused units |
| Unsupported components | summary/boundary/relation/callout arrays and unknown fields reported; multi-tree/HTML variants refused; folded branches explicit | Passed rich focused units |
| Regression gates | focused rich/common/path-chain imports; types/source lint/scoped diff | Latest 108 tests pass; TypeScript/scoped lint/diff clean |
| Host mapping and acceptance | actual Markmind 3.7.4 capture; source comparison; preview/cancel/save/reopen/plugin-off; search/backlinks and mixed drag/resize/undo; exports | Original DTO pure consumption passed; rendered comparison/publication/gestures pending parent |
| Android | physical MiroCanvasTest checks with model/app/input receipt | Pending; no device claim |

Official primary background: [Markmind README and rich Markdown mode](https://github.com/MarkMindCkm/obsidian-markmind#rich).
Format implementation evidence comes from the exact OWN authored sample above,
not inferred from README feature lists or copied editor implementation.


## Implemented subset and scoped execution receipt

Implemented `detectMarkmindRich`, `parseMarkmindRichSource(sourceText)` and
`convertMarkmindRich` in the existing adapter file. The export returns
`{nodes, raw, noteBody, properties}`; each node has sourceId, parentId, text,
x, y and raw. Existing registry ordering now recognises rich Markdown through
its already-registered adapter; no registry/types/locales/source-layout edits.
No source format version is invented from the producing plugin version.

Fallback cards use saved x/y and estimated sizes; safe global font and declared
font/paint/border fields are projected through existing metadata validation.
Branch colors use each child's saved stroke and left/right endpoints follow
the saved geometry. Captures require exact source bytes and source ID, text,
parent matches, complete node and branch coverage, finite bounded captured
x/y, positive bounded measured sizes, safe existing style fields and compatible
sampled endpoints. Validated captured positions replace saved x/y, allowing the
original renderer to recalculate the unchanged tree layout when opening it.
All-or-nothing rejection preserves the deterministic fallback. Accessors are
rejected without executing them; accepted styles/paths are detached from the
capture before preview. Snapshot theme uses BoardBuilder.finish's existing
metadata.settings.displayTheme support. Appearance remains an approximation
entry because native Markdown padding/fonts and sampled curves are not
certified identical to the original renderer.

The actual authored file produces 13 native text cards and 12 native edges,
with every label and saved x/y preserved. Raw reader fields, Markdown bold,
Cyrillic and wikilinks survive. The source text is unchanged; no miroSource
snapshot is fabricated. HTML labels, multiple trees, invalid/empty roots,
missing parents, cycles, malformed/ambiguous JSON and invalid node flags are
refused. Extra rich component records, unknown meaningful fields, non-tree
layout declarations, unsupported styles, custom theme/background, outside
Markdown and extra properties are reported. Collapsed nodes are shown open
and reported; summary/boundary/relation/callout semantics are not inferred.

`npm test -- tests/import-markmind-rich.test.ts tests/import-mindmap.test.ts
tests/import-common.test.ts`: **118/118 passed** before the concurrent basic adapter
changed its captured-layout reporting. The final combined run passes **117/118**;
its only failure is the shared basic test at import-mindmap.test.ts:411 still
expecting a `layout` reason on captured appearance. This worker did not edit that
shared file. The final scoped rich/common run passes **95/95**, including **50**
new rich tests.
TypeScript, scoped source lint and git diff check pass. Required pre-lint-fix trace was
appended to docs/lint-remediation-checks.md before repairing local advisories.
Source/capture immutability, detached snapshot facts, topology/caps, delayed
parent order, an 8,001-node deep tree, valid complete snapshots and 20 unsafe
or stale snapshot fallbacks have focused unit coverage.

Native source-layout capture, comparison/demo, actual input gestures,
publication/reopen/plugin-off and physical Android acceptance remain pending
with the parent. This worker does not claim real-app or device evidence.
The previous absence of any authored rich sample is resolved for this exact
tree; broader rich features and versions retain their evidence gaps.

Final readiness: Markmind rich adapter/source-reader edits are complete and ready
for parent host capture/build/native demonstration. The shared basic-mindmap
regression expectation is explicitly pending its owner; it is not a rich-tree
failure. Shared README/import guides/changelog still need the precise new
rich-tree support claim, replacing only the old authored-tree evidence gap.
Do not turn this evidence into a claim of generic Markmind rich-feature parity.

## Native reflow correction — 2026-10-12

The parent reports that the original rich renderer recalculates child x/y on
open, despite identical saved source text. Requiring captured positions to equal
saved positions incorrectly discarded an otherwise complete native snapshot.
Keep byte/ID/text/parent identity checks and atomic safety validation, but use
finite bounded captured positions. Focused regressions must cover independent
child reflow (including branch direction changes), compatible endpoint samples,
source immutability, invalid coordinates and incoherent moved-node paths.
At the reflow-correction checkpoint, native DTO validation and rendering
acceptance remained pending. The actual DTO check below supersedes that
validation gap; synthetic acceptance alone is not real-app evidence.

Reflow correction checks: rich/common **98/98** pass, including **53** rich
tests. Scoped source lint and diff checks pass. The concurrent full TypeScript
check at that checkpoint failed only in the parent-owned source-path-chain.ts at lines
66–67 (undefined current key and inferred step type); no shared-file repair
was made by this worker. The latest gate receipt below supersedes this failure.

## Actual native capture consumption — 2026-10-12

The parent supplied the original view receipt at
`J:/NIX/WRK/Code/Obsidian-Plugin---Miro-Canvas/tools/obsidian_cdp/.out/all-import-showcase/markmind-rich/captured-layout.json`.
Its outer object is `{layout, meta}`; only `.layout` is given to the pure adapter.
Original receipt SHA-256:
`99317ae493c896273cbf757d3312d1085cc87846cd852ba32b28d02080a24fe4`.
The source is byte-identical to the authored fixture (2899 bytes and the source
hash recorded above). The parent reports the audited original 3.7.4 view;
receipt meta says mindmapview, dirty=false, saving=false, and 25 SVG pieces.
This worker consumes captured facts only and does not inspect/copy the foreign
implementation or claim to have driven the original view.

Direct pure consumption of the original `.layout` succeeded: complete unique
13 IDs with exact text and parents, 12 matching branches, and zero card geometry
mismatches. **All 12 children have native reflowed x/y different from saved x/y**;
the root keeps its saved location. Captured dimensions, checked typography/paint,
branch widths/colors, composed line/polyline/Q samples and light display theme
are accepted through existing writers. The result has 13 native cards, 12 native
edges and one honest appearance approximation (sampled curves/native Markdown).

`tests/fixtures/import/markmind-rich-authored-layout.json` retains only the
required measured facts: 13 IDs/parents/rectangles, 3 deduplicated safe styles,
12 branch ID pairs/colors/widths and 124 point pairs. It omits sourceText,
node labels, line indices, receipt metadata and editor/runtime/SVG data. Labels
and exact context sourceText are reconstructed from the existing authored source
fixture; its normalized-LF SHA-256 ties the facts to that source across checkout
line-ending conversion. The full original receipt is not copied into tests.

The regression checks every native card/style, native branch membership,
sampled point count and coordinates within existing 0.01-unit writer precision,
attached endpoint reconstruction, measured theme, unchanged source/capture and
all-or-nothing rejection for changed source bytes/ID/text/parent or incomplete
node/branch coverage. Native publication, visual comparison, input gestures,
reopen/plugin-off and device acceptance still belong to the parent.

Final native-capture check receipt: **108/108** pass (60 rich, 45 common,
3 source-path-chain). `npm run check`, scoped rich source lint and scoped
`git diff --check` pass. Parent source-path-chain type errors are resolved.
No rich adapter change was needed to consume the native DTO after the reflow
correction; only compact capture facts, separate tests and this receipt were
added. **Rich importer edits are complete; parent native build is ready.**
No commit/push or shared-file changes by this worker. Pixel equality remains
unclaimed; sampled paths, native Markdown/font padding and unsupported rich
components keep their documented approximation/evidence limits.

## Native measured-text surface correction — 2026-10-11 pre-change trace

Compared parent primary source.png and result.png at
`tools/obsidian_cdp/.out/all-import-showcase/markmind-rich/`: the result retains
source boxes but native card padding/borders consume those small measured bounds.
Labels wrap and clip severely, including the colored root. Pure identity and
geometry acceptance does not establish visible text fit.

Trace: convertMarkmindRich currently calls BoardBuilder.card for every label ->
plain native Canvas card -> no local text/shape descriptor -> source surface
clearing/padding projection not activated. Existing BoardBuilder.item(...,
{type:"text"}) supplies a local text descriptor; shapeCard supplies the existing
shape descriptor plus existing checked paint/cornerRadius metadata. The source
scene reader projects these to text/localItem=text and shape respectively.

Plan: unpainted labels use local text; measured/declared fill or visible border
uses rectangle, or round_rectangle with positive measured cornerRadius. Keep
all card rectangles and branch attachments unchanged; never enlarge boxes to
hide clipping. Accept only finite cornerRadius 0..1000 and safe existing font
family through the metadata validator. Shape contour text insets and source
padding remain an approximation with the current format.

Parent owns ImportedCardStyle.cornerRadius, source font/radius capture and
renderer/native-style/scopedCSS projection (Markdown padding/sizer/margins zero,
scrollbar-gutter:auto, existing contour inset). No shared or renderer edits here;
no build while those changes are in progress. Mindmap-outline awaits Mencius
lease release before this worker touches it.

Mandatory regressions: actual 13-node/12-branch captured source retains exact
geometry, styles, topology and samples; 12 transparent labels become local text
and the colored root becomes an existing shape. Pure source-scene descriptors
must trigger those surfaces; filled/bordered/radius cases and invalid-radius
atomic fallbacks need focused coverage. Parent must recheck real source/result
clipping, colored root, bold/wikilink text, resize/undo and publish/reopen.

Surface correction implemented through existing writers only: transparent
unbordered labels are local items of type text; filled/bordered labels are
rectangle or measured-radius round_rectangle shapes. Captured cornerRadius is
bounded to 0..1000 and unsafe values reject the complete capture atomically.
Measured boxes and attachment samples are unchanged. Source-scene regressions
check the actual 12 transparent rich labels and root colored shape, font family,
painted/bordered variations, invisible ink and offline local-text fallback.
**118/118** rich/common pass (73 rich). Scoped lint/diff pass. Latest global
TypeScript has concurrent tldraw owner errors at import-tldraw-appearance.ts
96/176 and import-tldraw.test.ts:496; rich edits are ready for parent integration.
No build was run. Actual fixed clipping/rendering still needs the parent build
and native source/result comparison; pure descriptor tests cannot certify fit.
