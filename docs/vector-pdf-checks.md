# Vector PDF serialization checks

Implementation scope: `src/vector-pdf.ts`, `src/vector-pdf-fonts.ts`, bundled
assets/licenses under `src/assets/vector-pdf-fonts/`, the focused tests and
PDF dependencies only. Parent owns capture, export mode/panel/locales,
worker/PPTX integration, README/CHANGELOG and native device checks. No commit,
push, foreground change or native/CDP/device mutation was performed here.
The pre-implementation action trace is in `lint-remediation-checks.md`,
"Vector PDF/PPTX and viewing tools — 2026-10-10".

## API

```ts
packVectorPdf(
  pages: readonly VectorDocumentPage[],
  info: { title?: string },
  document: Document,
  signal?: AbortSignal,
  progress?: (done: number, total: number) => boolean,
): Promise<Uint8Array>
```

The input is the controlled, already prepared SVG page produced by the
independent Canvas export pipeline. `width` and `height` are PDF points;
each input becomes one PDF page, in input order. Root x/y are normalized to
zero; the source viewBox is preserved, the target viewport is the paper size,
and normal SVG preserveAspectRatio applies. Mixed landscape/portrait page
sizes are supported. Metadata title is written to the PDF. The serializer
returns bytes only, never saves, prints or starts an OS application.

Progress counts pages and can repeat the same done count while a page's
batches complete. False aborts, including the final `(total, total)` callback.
Caller-supplied AbortSignal is checked before loading/conversion and between
bounded batches. Owned timer/image-decode waits are cancellable. A current
bounded svg2pdf call is allowed to settle before cleanup; synchronous font
parsing and a single SVG operation cannot be interrupted mid-call. There is
no worker, global promise lock or event-loop/RAF/window patch in this module.

## Dependencies and offline fonts

Exact npm versions: jsPDF **4.2.1** and svg2pdf.js **2.8.1**, compatible through
svg2pdf's declared jsPDF peer range. npm install reported **0 vulnerabilities**
at implementation time. The packages are bundled; their initialization is
lazy inside packVectorPdf and causes no runtime download. Normal Canvas use
and merely importing vector-pdf do not initialize their browser implementations.

Reviewed primary guidance: [jsPDF](https://github.com/parallax/jsPDF) documents
TTF registration for Unicode; [svg2pdf.js](https://github.com/yWorks/svg2pdf.js)
requires a functioning DOM and curated/sanitized SVG. Copies of both MIT
licenses are beside the fonts. The module does not use jsPDF HTML rendering,
page screenshotting, remote image loading or Electron print APIs.

**All PDF text uses the bundled Noto Sans fallback**, not the board's installed
font. Weights below 600 map to Regular, weights 600–900/bold to Bold;
italic/oblique use Italic/BoldItalic. This substitution must be disclosed in
the export UI and README. The source SVG/font settings stay unchanged.
Per-glyph measured x coordinates remain in the input geometry; glyph outlines,
font metrics and multi-character centering/kerning can differ from the original
board font. Do not promise exact source-font typography. text-before-edge,
central and middle baselines are explicitly converted to Noto alphabetic
coordinates instead of being silently ignored by svg2pdf.

The original, unmodified four TTFs are embedded as base64 in fonts.json,
together with their exact Unicode cmap ranges. Every rendered codepoint is
checked against the chosen style's nonzero cmap before any conversion. Missing
glyphs (including tested emoji/CJK) explicitly refuse the export. No .notdef
square or missing-glyph success is allowed. Latin and Cyrillic, including Ё,
Ukrainian letters, punctuation and the used Greek/symbol coverage are supported;
this does not add a complex-script/shaping engine to upstream SVG capture.
PDF stores used TTF subsets as Identity-H with a ToUnicode mapping.

Official source: [notofonts/noto-fonts](https://github.com/notofonts/noto-fonts)
revision `ffebf8c1ee449e544955a7e813c54f9b73848eac`,
`hinted/ttf/NotoSans/NotoSans-<style>.ttf`. SIL Open Font License 1.1 is
retained verbatim in OFL.txt. The provenance/hashes are also in fonts.json:

| File | SHA-256 |
| --- | --- |
| NotoSans-Regular.ttf | b85c38ecea8a7cfb39c24e395a4007474fa5a4fc864f6ee33309eb4948d232d5 |
| NotoSans-Bold.ttf | c976e4b1b99edc88775377fcc21692ca4bfa46b6d6ca6522bfda505b28ff9d6a |
| NotoSans-Italic.ttf | 36cff144df01309dab648bea71baff9bb074026914afe63aeacc8bc90b67a28b |
| NotoSans-BoldItalic.ttf | 6edf4227ef0fa846aca70e86a307804ca4401741830f5b3af0f2554abe2b8466 |

The source fonts were inspected with fontTools to record nonzero Unicode
coverage. There is no runtime fontTools/Python dependency and no font request.

## Admitted material and limits

Paths, rectangles/radii, ellipses/circles, straight/polygon/polyline shapes,
2D transforms, text/tspans, local clip paths, native arrow markers and local
linear/radial gradients use the bundled SVG renderer. Material unsupported by
upstream vector capture remains refused there. PDF-specific refusals include:

- Scripts, style/link/foreignObject/filter/mask/arbitrary element or attribute,
  XML declarations/entities/doctype, foreign element namespaces and events.
- External URLs/files/resources, invalid/duplicate/missing/cyclic IDs,
  incorrect reference types, href inheritance outside controlled definitions.
- Non-default vector-effect/paint-order/font-variant/text-decoration,
  lengthAdjust other than spacing, nonzero rotate attributes on text,
  unknown baselines and nonzero multi-character letter/word tracking.
- Composited group opacity other than 1. Per-shape fill/stroke opacity remains
  supported. No silent flattening of translucent groups into separate layers.
- SVG image attachments or arbitrary data images. Only explicitly marked
  intrinsic raster attachments with an embedded PNG are admitted. PNG header,
  pixel bounds and browser decode are validated. A failed or omitted library
  image conversion is detected even though the library can swallow its error.

Budgets: 1–200 pages; dimensions >0 and <=14,400pt; 4MiB SVG per page and
32MiB total; 25,000 nodes/page and 100,000 total; depth/reference depth <=48;
64 unique PNG URLs/page, <=16 million pixels each, <=8MiB per href; paths
<=50,000 characters; final PDF <=64MiB. Each conversion batch has at most
64 paint elements and a roughly 100,000-character attribute/text budget.
Only reachable definition resources are copied for a batch, avoiding copying
every card clip for every batch on large boards.

Conversion roots are detached owned clones. The library briefly creates its
own hidden text-measure SVG in its module document; cleanup matches the exact
library structure and this job's unique registered font name, on success,
Stop and error, without deleting unrelated SVGs. Source Canvas/document data,
window APIs/constructors, RAF behavior and settings are never patched.

## Focused evidence — 2026-10-10

- **34 Vitest tests pass** in tests/vector-pdf.test.ts: actual Identity-H TTF
  registration and ToUnicode output; four font styles/nonzero coverage;
  page geometry/order; baseline/font substitution with source unchanged;
  64-item clip/transform-preserving batches; reachable-resource filtering;
  declaration/namespace/script/style/event/resource/reference refusal;
  missing glyph, malformed PNG, opacity/tracking refusal; Stop before work,
  between batches and at final progress; converter failure cleanup.
  SVG conversion itself is mocked in these unit orchestration tests.
- Focused strict tsc passes with repo target/module/lib and strict,
  noImplicitOverride, isolatedModules, esModuleInterop, resolveJsonModule,
  forceConsistentCasingInFileNames plus node/Obsidian types. Full npm run
  check also passed after parent caller integration. Scoped helper ESLint
  passes with max-warnings 0. No full test loop performed by this worker.
- **Synthetic headless Chromium actual bundled renderer PASS**, followed by
  PyMuPDF parse/render. Receipt and fixture are in ignored
  `tools/obsidian_cdp/.out/vector-pdf/synthetic.json`, fixture.pdf and
  page-1.png/page-2.png. Two pages are exactly 600x330 and 200x350 points;
  Cyrillic/Latin text is extractable in four embedded font styles; vector
  drawings include radius/curve/rotated arrow/clip; precisely one intrinsic
  raster image appears on each page, and there is no whole-page image.
  The PDF is 136,005 bytes. Both pages were rendered; page-1 was visually
  inspected with text/arrow/rounded rectangle intact.
- Browser refusal scenarios: external paint, foreignObject, style and emoji
  all fail explicitly. Stop during a 1,000-rectangle case returned in **57ms**
  in the final lazy-import receipt (a bounded earlier repeat measured 63ms).
  Body HTML and RAF identity restored; **zero network requests** observed.
  This is synthetic evidence, not native Windows/Android evidence.

## Parent-owned mandatory native acceptance

Pending here: hidden real Windows Obsidian and connected physical Android in
MiroCanvasTest. Exercise the visible PDF/vector action, actual extracted
Latin/Cyrillic and drawing geometry, native arrows/radii/clips and intrinsic
attachments, multiple ordered pages, Stop/error/unload/board switch, source
bytes/camera/selection/settings unchanged and all independent export surfaces
removed. Record device/app versions and ADB/CDP versus physical handling
separately. Do not promote this worker's synthetic receipt to device proof.


## Native-generated SVG compatibility correction (before edit)

Parent's first Windows native PDF failed closed at `pdf:attribute-overflow`.
Read-only inspected `tools/obsidian_cdp/.out/vector-viewing/Windows-raster.svg`:
its root/page/tile structure has nested SVG viewport `overflow="hidden"`.
The installed svg2pdf SVG node explicitly clips viewport unless overflow is
visible. Admit only hidden/visible and preserve those attributes in batch
ancestor clones; add native-kind overflow regression and real renderer clip
proof. Parent retains native input/restoration ownership.

Native saved-SVG attribute/value inventory also identified two OKLCH alpha
fills from Obsidian. svg2pdf's installed RGBColor parser does not recognize
OKLCH. Normalize computed colors via a one-pixel detached sRGB canvas (no
bitmap is emitted) and preserve CSS slash alpha exactly; copy RGB/none/local
references unchanged. Unknown colors fail closed. Required saved-SVG proof:
parse both page texts/paths, crop boundary pixels outside native hidden
viewport, correct low-opacity fills and no page images/network/source mutation.


Native-compatibility correction complete: 34 focused tests, strict focused tsc,
zero-warning helper ESLint and scoped diff checks pass. `overflow` admits only
hidden/visible. Read-only one-pass inventory of the complete saved Windows SVG
found no other unsupported attribute; native non-scaling/vector-effect and
paint-order values were none/normal. Native OKLCH alpha fills are normalized
on detached copies to RGBA with exact slash alpha.

`tools/obsidian_cdp/.out/vector-pdf/native-cached.json` records actual bundled
renderer conversion of that exact saved SVG in synthetic headless Chromium,
then PyMuPDF parsing. The 38,275-byte PDF has pages 640x240 and 310x240 points,
13/8 vector drawings, no images, correct 0.07/0.1/1 fill opacity, source body
unchanged and zero network requests. A separate green-rectangle clipping
fixture proves an outside pixel remains white while the inside pixel is green
for nested `overflow="hidden"`. The saved SVG and resulting PDF contain real Вектор/Второй Cyrillic,
with zero U+FFFD characters; codepoint assertions and a rendered PNG confirm
both. An earlier console display showed replacement characters due to the
shell output encoding; that claim was withdrawn and the parent notified.
This is synthetic conversion of a native-generated fixture, not this worker's
own native input acceptance. No native input by this worker; no source/helper
edits pending after these corrections.


Parent native acceptance is now recorded in [vector/viewing checks](vector-viewing-acceptance.md); this scoped receipt retains its synthetic/unit attribution and limits.
