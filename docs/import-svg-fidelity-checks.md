# Import SVG fidelity checks — 2026-10-12

Scope: shared `codex/import-expansion` checkout, PR 19. This worker owns
`src/importers/assets.ts`, focused asset tests and this register. Adapter,
publication, types, locales, schema, renderers and showcases belong to other
owners. No commit or push by this worker.

## Trace recorded before implementation

User action: preview an Excalidraw drawing containing an embedded rect/text SVG
badge or reflected image, then create the board. `DrawingImport.placeImage`
reads `scene.files[fileId].dataURL` through `ImportAssets.add`. The pure asset
helper currently accepts PNG/JPEG/GIF/WebP and refuses all SVG. It prepares
bytes and generated file paths without writing or fetching. `finish` returns
planned attachments; `importIntoBoard` checks source staleness, preview/cancel
and target collision before `publishImportAssets` writes owned files. The
publisher currently allows only raster extensions and must explicitly accept
validated SVG as a separate integration change by its owner. Rollback must
continue to remove only unchanged owned files.

`BoardBuilder.file` and `ImportedCardStyle` have no reflection field. Rotation
alone cannot express one-axis reflection. A bounded derivative SVG can contain
a reflected passive SVG or a data-only static raster under a reflection matrix,
using the existing native file-card contract. The helper will expose optional
flip flags; adapter integration and loss diagnostics remain with their owner.
Source bytes and source snapshots remain untouched. Unsupported reflection
must not be reported as preserved.

## Planned bounded subset

Accept UTF-8 SVG only under a strict, independently parsed and reserialized
XML subset: one SVG namespace root, groups, rectangles, text/tspans and data-only
PNG/JPEG/static WebP images. No general-purpose SVG renderer or editor runtime.
Numeric dimensions/viewBox determine a finite intrinsic size and ratio. Bound
bytes, elements, depth, text, numeric magnitudes and decoded raster dimensions.
No resource-referencing paint, CSS/style/class, links, script/event attributes,
foreign namespaces/HTML, declarations/DTD/entities, animation, filters, masks,
use, patterns or arbitrary path features. Unknown structures/attributes are
refused, never silently removed. XML predefined/numeric character references
are decoded then safely re-escaped; malformed XML fails closed.

Optional reflection creates distinct cached assets for each flip combination.
GIF, APNG, animated WebP and EXIF-bearing raster reflection are refused, as
are oversized derivative SVGs. EXIF orientation cannot be inferred from the
current header dimensions without potentially changing aspect or pixels.
The existing raster reader and unreflected raster behavior remain compatible.

## Mandatory checks and execution evidence

| Area / user action | Mandatory regression checks | Status |
| --- | --- | --- |
| Passive SVG badge import | UTF-8 Cyrillic/text entities; rect geometry/colors/type; dimensions/viewBox/ratio; base64 and percent encoding; canonical valid XML; source bytes unchanged | Passed focused units; synthetic badge exact at 1×/2×/4× |
| Parsing and security | malformed XML/nesting/root/UTF-8/entities; namespaces; scripts/events/HTML/CSS/URLs/references; animation; unknown feature refusal; no fetch/DOM execution while reading | Passed focused units; strict parser has no DOM/fetch path |
| Bounds | byte/element/depth/text/number limits; missing/non-finite/non-positive/percentage dimensions; pixel/area limits; data image signature and static-format limits | Passed focused units |
| Reflection | horizontal/vertical/both; viewBox origin; SVG + static raster; variant deduplication; native dimensions/ratio retained; active/animated/oversized variants refused | Passed focused units and synthetic static raster/geometry pixels; reflected text antialiasing limit below |
| Existing assets | PNG/JPEG/GIF/WebP, shared files, generated paths, total budget and asset count; existing publication cancel/staleness/collision/rollback | Existing asset/publication regressions pass; count cap includes derivative variants |
| Host integration | publication validates SVG bytes before any writes; adapter passes flips and retains diagnostics on refusal; actual file-card preview/save/reopen/plugin-off | Pending main owner / real Obsidian |
| All-plugin showcases | demonstrate each supported import format; annotate opacity/hatch/group/asset/unsupported losses rather than claim parity | Pending main / showcase owners |
| Native gestures and export | real input drag/resize/rotate with attached endpoints at non-default zoom; independent export and no added fetches | Pending real Obsidian |
| Android | affected checks on connected MiroCanvasTest devices; model/OS/app and real ADB input distinct from CDP synthesis | Pending; no device claim |
| Gates | focused asset tests, types, scoped diff; full gates and PR integration by main | 81 focused tests pass; scoped source lint and diff clean; full type gate currently has unrelated tldrawAppearance integration error |

## Official primary references inspected

- [SVG 2 processing modes](https://www.w3.org/TR/SVG2/conform.html#processing-modes): scripting, references, interactivity and animation are separate features. Image embedding alone is not this helper's safety boundary.
- [SVG 2 document structure and namespace](https://www.w3.org/TR/SVG2/struct.html): root/graphics containers and resource-referencing elements.
- [SVG 2 coordinate systems and intrinsic sizing](https://www.w3.org/TR/SVG2/coords.html#IntrinsicSizing): viewBox, intrinsic dimensions and aspect ratio.
- [SVG 2 text](https://www.w3.org/TR/SVG2/text.html): text/tspan positioning and presentation attributes.
- [RFC 2397 data URLs](https://www.rfc-editor.org/rfc/rfc2397): explicit MIME/UTF-8 and base64/percent encodings.
- [PNG specification](https://www.w3.org/TR/png/): IHDR/IDAT/IEND, APNG control chunks and eXIf metadata.
- [WebP container specification](https://developers.google.com/speed/webp/docs/riff_container): bounded chunks, EXIF and animation flags/chunks.
- [XML 1.0](https://www.w3.org/TR/xml/): well-formed nesting, quoted attributes, character references and legal characters.

This is a deliberately restricted SVG feature set, not arbitrary SVG support or
proof of native/device acceptance. Check results must distinguish unit tests,
headless synthetic rendering, real Obsidian renderer input and physical input.


## Execution receipt and integration handoff

`npm test -- tests/import-svg-assets.test.ts tests/import-assets.test.ts
tests/import-excalidraw-assets.test.ts`: 81/81 passed. The separate SVG test
file adds 61 scenarios and does not modify shared Excalidraw or publication
tests. `node node_modules/eslint/bin/eslint.js src/importers/assets.ts
--no-cache` and the scoped `git diff --check` pass. Type checking on this
shared checkout currently reports only another worker's `tldrawAppearance`
reason missing from ImportReason; no owned-file type diagnostic was reported.

Headless Playwright/Chromium rendered 20 source/derivative cases at three sizes:
60 comparisons, zero network requests, 51 exact raw RGBA matches. The original
240×110 rounded rect/Arial badge is exact at 1×, 2× and 4×. Static PNG, JPEG
and WebP variants and a deliberately asymmetric SVG with negative viewBox
origin are exact for no reflection, horizontal, vertical and double reflection
at all three sizes. The nine reflected-text badge comparisons differ in font
hinting/edge antialiasing, with maximum whole-image mean raw-channel difference
0.101 on a 0–255 scale. Some fully/partly transparent edge channels differ by
255; no exact reflected SVG text pixel guarantee is made. This is synthetic
renderer evidence, not real Obsidian, Android or OS input acceptance.

Local ignored receipt: `tools/obsidian_cdp/.out/import-svg-fidelity/receipt.json`;
case data and a temporary bundled helper live beside it. No screenshot,
foreground activation, existing Obsidian port or user vault was used. The
showcase badge was inspected read-only from the owned isolated test vault's
source scene and matches the synthetic rect/text regression case.

API additions stay in `src/importers/assets.ts`: `readEmbeddedAsset(dataURL)`,
`readPassiveSvg(bytes)` and `ImportAssets.add(id, dataURL, {flipX?, flipY?})`.
The old `readEmbeddedRaster` remains raster-only. Normal and each reflected
variant use separate safe generated file paths and share within that variant.
SVG is limited to 1 MiB, 512 elements, 16 levels, 65,536 text characters and
finite intrinsic dimensions no larger than 32,768 per side / 32 million pixels.
The existing 8 MiB individual / 32 MiB total / 1,000 asset bounds still apply.
Paths, curves, CSS, external images/fonts/references, DTD/declarations, animation,
SVG filters/patterns/masks and general transforms remain unsupported. SVG text
fonts use installed fallbacks. EXIF-bearing raster derivatives, GIF/APNG/
animated WebP, uncentred SVG aspect-ratio reflection and inflated wrappers are
explicitly refused; ordinary unreflected raster behavior stays unchanged.

Publication owner: widen generated extension validation to include `.svg`, and
run `readPassiveSvg(asset.bytes)` before **any** folder/file write. Do not rely
on an extension or image embedding alone. No shared ImportAsset type change is
needed in the inspected checkout: it carries path and bytes, not a MIME union.

Adapter owner: pass reflection flags only for validated source scales. If a
requested derivative is refused, retain the unreflected image and the existing
imageScale/unsupported-loss diagnostics rather than claiming reflection. Keep
crop, element opacity, source theme and unsupported appearance warnings honest;
this helper does not add node/style/schema fields. Real save/reopen/native
fallback/export/showcase/device checks remain pending with their owners.
