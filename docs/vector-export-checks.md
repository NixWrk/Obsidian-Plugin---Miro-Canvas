# Vector SVG export checks — 2026-10-09

## Traced paths before implementation

`ExportPanel.onExport` calls the parent-owned `M1CanvasSession.runExport`.
The session freezes saved JSON, source attachment path, resolved theme, pages
and `exportCanvasSettings`; `createExportCanvas` constructs an inert,
unregistered native view and owns its DOM/timers. A separate M1 session supplies
source shapes/drawings, native and independent connector routes, comments,
collapse/visibility, typography and scoped CSS. Existing PDF/PPTX capture waits
for native frames and Markdown (`checkExportCanvasFrame`,
`settleExportMarkdown`), invokes renderer preparation, then rasterizes tiles.
The parent will branch SVG before raster capture/worker packing and pass the
result bytes to the existing guarded `onSaveExport` / Vault.createBinary save.

Owned implementation: `src/board-export.ts`, `src/vector-export.ts`, export
tests and this document. Parent owns callers/locales/settings/CSS/general docs.
No source `.canvas` writing, native app/CDP/device work, detector or commit.

## Mandatory regression checks

- Genuine rect/path/text output for native cards/groups, source shapes/freehand,
  native and independent connections with caps/labels, comment pins and bodies.
  No foreignObject, whole-board image, html2canvas or screenshot invocation.
- Read computed typography, scoped paint and corner radius from the prepared
  independent DOM; exclude selection/resize/editor/tool/export controls and
  collapsed hidden descendants. Preserve clipping, SVG viewport geometry and
  unique local marker references on every tile/page.
- Only intrinsically raster image attachments may become embedded images;
  disallow SVG-image raster conversion and refuse unsupported critical content
  (web/video/PDF canvas, foreignObject, unknown SVG elements or rich CSS/layout).
  State text/Markdown and cosmetic fidelity limitations explicitly.
- Reuse page rectangles and clipping for overlapping, negative-coordinate,
  unequal-sized and multi-tile pages; one SVG stacks pages in order with a
  24-board-unit gap. Pixel quality does not change vector geometry.
- Refuse live/unmarked canvases before deselection/camera changes. Success,
  render/font/unsupported failure and Stop during waits/preparation release
  owned timers/listeners, restore independent camera state and return no partial
  bytes. No foreground activation, source DOM/data/camera/selection/settings
  mutation or global/window monkey patch.
- Parent integration: same isolated snapshot/job registry/disposal and captured
  source path; no rasterizer/packing worker for SVG; guard Stop before save;
  unique `.svg` vault attachment; save failures retain later user edits.
- Run focused TypeScript, ESLint, vector and existing export tests plus
  `git diff --check`. Record actual results below.

## Evidence

Source inspection and the mandatory checklist above were recorded before edits.
Completed unit/synthetic evidence is recorded at the end of this document.
Real Windows/Android input, visual SVG comparison and guarded-vault save checks
are pending and owned by the parent; this worker will not imply native evidence.

## Implemented API and file layout

`board-export.ts` exports `ExportKind = "pdf" | "pptx" | "svg"` and the
incumbent panel adds the SVG button. It re-exports:

```ts
renderVectorExportPages(
  canvas: CaptureCanvas,
  pages: readonly ExportRect[],
  progress: (done: number, total: number) => boolean,
  signal?: AbortSignal,
  prepare?: () => void,
): Promise<Uint8Array>
```

The prepared surface must have `data-miro-canvas-export-renderer="true"`.
Progress counts viewport-sized tiles at one board unit per output unit,
including a final `(total, total)` check. Returning false cancels the entire
result. Native Markdown finishes before `prepare`; its scoped paint observers
settle before serialization. Native 16 ms frames receive the same independent
120 ms settling interval as raster export. No other view is requested or moved.

One `.svg` attachment stacks the requested pages vertically in their existing
order, with a 24-unit gap. Each page and each viewport tile clips independently;
page dimensions remain board units. Unequal page sizes align left. Standard/high
raster quality does not change SVG. Tile-local IDs isolate all copied markers,
gradients and clipping references. Limits: 200 pages, 2,000 tiles, 32 MiB UTF-8
output; each embedded raster attachment is limited to 16 million pixels.

The parent-owned caller branches before raster/worker packing and uses its same
snapshot, renderer, AbortController/job registry, source path and guarded save.
The three locale requirements are `exportSvg`, `writingSvg` and
`vectorUnsupported(reason: string)` in both tables. Parent wired these and the
caller during this worker's changes. The renderer reads current prepared styles,
including card radius, paragraph indent, allowed scoped snippets and custom
colors; it does not need settings or global/window patches.

## Supported rendering and precise limits

- Native card/group faces become SVG rectangles/borders/clips. Native/plugin
  shapes, freehand paths (including pressure outlines), native/independent
  connector courses, caps and SVG decorations remain SVG geometry. Connector
  labels and ordinary card text become real SVG `text`, measured in the prepared
  DOM with `Range`, positioned per Unicode code point rather than a screenshot.
- Simple horizontal Latin/Cyrillic Markdown paragraphs, headings, inline emphasis,
  underline/strike, code blocks and tables use the rendered layout and inline
  fonts. Text is represented as independently positioned text elements, so
  downstream editing is per character; ligature/kerning behavior may differ.
  Families are retained but fonts are not embedded or converted to outlines;
  another computer without those fonts may substitute its own.
- Paragraph spacing/indentation, table positioning, text wraps and ordinary
  overflow clipping are measured after preparation. This is not a full HTML/CSS
  or Markdown renderer: list markers, task checkboxes, generated text outside
  comment badges, mathematical/plugin embeds requiring unsupported SVG/HTML,
  complex shaping (Arabic/Hebrew, combining marks, joined emoji), RTL/vertical
  text, rotated/reflected HTML text, capitalization/full-width transforms,
  gradients/background images, CSS clipping/filters and unsupported corner or
  border arrangements fail the whole export with a feature diagnostic.
  Native/source SVG geometry itself can rotate; a rotated clipped SVG viewport
  is refused. Text and layout in SVG-native diagrams use the supported SVG tags.
- Comment pins retain vector bubble paths/initial or resolved tick, thread title
  in SVG `title`, and generated reply-count/lock badges. Open thread/editor/tool
  controls and selected handles are excluded. Source comment cards keep their
  visible text. Board visibility/collapsed groups govern what appears.
- Only already-loaded, readable PNG/JPEG/GIF/WebP/BMP image attachments are
  encoded as embedded PNG images and tagged `data-miro-raster-attachment="true"`.
  Animated images preserve the current decoded frame. Missing/tainted/oversized
  images fail. SVG image attachments are refused rather than rasterized. Live
  web/video/audio embeds, PDFs rendered through canvas, foreignObject and unknown
  SVG elements are refused. No fetch, screen capture or rasterizer is invoked.
- Cosmetic box/text shadows and SVG-root drop shadows are omitted. Internal SVG
  references remain local; external SVG `use` is refused. CSS stacking contexts
  follow board DOM order; arbitrary snippet-driven stacking is not reproduced.
  Native nodes/edges or independent connectors missing from the owned prepared
  surface trigger errors rather than a successful incomplete document.

## Validation results

- Focused exporter ESLint: passed with no diagnostics.
- TypeScript full project check: passed after the parent narrowed the SVG caller.
- Focused export tests: 146 tests / seven files passed before the final input/
  root-filter guard additions; final rerun recorded below.
- Headless synthetic Chromium (not Obsidian/CDP/device input): actual DOM styles
  and Range, card radius/Markdown emphasis, SVG path/marker and comment bubble,
  author initial/reply count produced parseable SVG XML with rect/path/text/marker
  elements and zero image/foreignObject substitutions. A separate source Range
  vs SVG text measurement matched the first Arial glyph's exact x/y/width/height
  (20/20/14.015625/20) for Latin/Cyrillic text.
- No real-vault/device input, screenshots, foreground activation, detector,
  commit or push performed by this worker. Native Windows/tablet comparisons,
  generated attachment opening and full user-facing README/CHANGELOG integration
  remain parent-owned and pending here.

Final worker rerun: full `npm run check` passed; focused ESLint for
`src/board-export.ts` and `src/vector-export.ts` passed with no diagnostics;
161 tests across eight export test files passed; `git diff --check` passed.
Tracked worker changes are board-export/vector-export, board-export and
m1-session-export tests, vector-export tests, and this document. The temporary
headless-test bundle is inside ignored `tools/obsidian_cdp/.out`; it is not an
Obsidian/CDP run or a shipping asset.

## Native transform failure follow-up — 2026-10-09

Parent reports physical SM-X736B / Obsidian 1.13.8 common-fixture SVG failure
`svg:css-transform`; its cleanup passed. Native sampler evidence is pending.
Source trace: `svgElement` rejects every non-`none` computed SVG transform
without an XML `transform` attribute, including a browser's identity matrix.
This occurs after independent native/Markdown preparation, before guarded save.

Read-only synthetic Chromium DOM proof before correction: a path with CSS
`transform: translate(0)` has no transform attribute and computes
`matrix(1, 0, 0, 1, 0, 0)` / `transform-origin: 0px 0px`. An SVG attribute
translation computes its corresponding CSS matrix. CSS transforms override
attribute transforms; a rotated path with `transform-box: fill-box` reports an
origin relative to its geometry box. Marker descendants may lack a parent CTM,
so a fix must handle those separately from ordinary graphics.

Mandatory focused regression checks for this correction: identity matrices
without XML transforms must succeed; translation/rotation/scaling must retain
geometry rather than stripping transforms; CSS overrides must not double an
attribute transform; transform-origin must be accounted for when supported;
marker definitions and nested SVG viewport attributes must remain local and
undoubled; unsupported 3D/unknown-origin transforms must fail clearly; source
DOM and independent-job Abort cleanup must stay unchanged. Rerun vector and
shared export tests, focused TypeScript/lint and diff check. Parent owns the
physical-tablet retry/native receipt; do not substitute synthetic evidence.

Parent's read-only tablet sampler now confirms native arrow groups with no XML
transform attribute and CSS `translate(1100px,55px) rotate(90deg)` /
`matrix(0, 1, -1, 0, 1100, 55)`, and another endpoint group at `(580,255)`.
Child `polygon.canvas-path-end` elements compute identity matrices without
attributes. These are routine native arrow geometry and must remain vector.
The correction uses graphics' parent-relative screen matrices when available,
so origins are already accounted for, and uses computed identity/translation
or verified zero-origin 2D matrices for marker/nested-viewport fallback.

Correction results: inspected the actual parent sampler receipt
`tools/obsidian_cdp/.out/card-appearance/native-R52Y808PDJB.json`. The native
arrow groups match the matrices above; their child polygons actually have
`transform-origin: 6.5px 0px` / `transform-box: fill-box`. This corrected native
sample is reproduced in the regression; identity remains independent of origin.

`svgTransform` now serializes the computed 2D transform once, replacing an XML
transform when CSS overrides it. Ordinary SVG graphics use parent-relative
screen CTM to include origin/reference-box offsets. Identity and translation
matrices need no origin offset; marker children/nested SVG keep their viewport
attributes and use a verified-origin fallback. Unsupported 3D, singular or
unresolvable-origin cases retain explicit failures. No source DOM/attribute,
caller, locale or API changes were made for this correction.

Validation: full TypeScript check and focused vector-export ESLint passed;
166 tests across eight export files passed; scoped diff check passed. Headless
synthetic Chromium re-created the two native arrow groups and polygon origins,
then compared source versus serialized/reloaded SVG screen matrices. Both arrow
endpoints matched exactly (all six coefficients); a CSS override/rotation with
nonzero fill-box origin matched within `1.3e-7`, below the `1e-6` tolerance for
SVG attribute float precision. No raster/foreignObject output, screenshots,
foreground activation, native CDP/device work, commit or push.

Physical SM-X736B SVG rebuild/retry remains parent-owned; the failure/cleanup
receipt predates this fix and is not a passing SVG receipt.

## Native generated-content follow-up — 2026-10-09

Parent reports the rebuilt SM-X736B / Obsidian 1.13.8 now passes native SVG CSS
arrow transforms, then fails `css:::before` on the ordinary feature fixture.
Its generated-content sampler is pending. The source guard already skips falsy
content, `none`, `normal`, double-quoted empty and single-quoted empty strings.
It does reject quoted whitespace or multiple quoted empty CSS strings. No
implementation change is justified by a guessed decorative selector.

Read-only synthetic Chromium inspection confirms distinct computed serializations
for empty, quoted space, multiple empty strings, zero-width space and nonempty
text. Mandatory correction checks, once the actual native element is known:
ignore demonstrated text-free decorative pseudo content without adding selection
paint; keep refusal/rendering for actual nonempty generated text/images/counters;
retain comment badges and normal native text/arrow geometry; verify no source
changes and independent Abort/error cleanup; focused types/lint/shared export
tests and diff check. Parent owns device input and the native retry.
Read-only native receipt now identifies the actual cause: ordinary
div.markdown-preview-view.markdown-rendered.node-insert-event.show-indentation-guide.allow-fold-headings.allow-fold-lists
uses both ::before and ::after with computed content: " ", block display,
16 px height, 121.412/141.412 px width and transparent background. These are
blank Markdown layout spacers; actual rendered text positions already include
their layout. Ignoring the blank generated glyph does not change the prepared
DOM or its spacing. The scoped correction skips CSS strings containing only
whitespace; nonempty strings, images and counters remain guarded.

Correction results: blank quoted CSS strings, including the exact native
single-space before/after values, now pass. Nonempty text, symbols, URL images,
counters and actual U+200B remain explicit failure cases. No content decoding or
zero-width-character stripping was introduced. Comment badges remain supported.

Validation: full TypeScript and focused exporter ESLint passed; 179 tests in
eight export files passed; scoped diff check passed. Headless synthetic Chromium
re-created the native Markdown before/after 16 px quoted-space blocks and then
compared source Range bounds with the serialized/reloaded SVG's first glyph.
All x/y/width/height differences were exactly zero (source 20/54/12.015625/20),
prepared DOM stayed unchanged, and there were no image/foreignObject substitutes.
At the worker handoff the physical tablet retry remained parent-owned; the
receipt recording the spacer failure is evidence before this correction.
Only vector-export.ts, vector-export tests and this register changed in that batch.

## Parent native acceptance — 2026-10-09

Before the final corner-overlap correction: uniform HTML radii larger than
half a small card were capped independently by SVG width/height. CSS reduces
both axes by one common factor, so a 48px radius on a 100x40 card becomes
20x20, not 48x20. Required checks: circular and elliptical radii, percentages,
zero radius, unsupported unresolved values, existing typography/arrow/layout
and independent cleanup tests, full gates and native main-card export regression.
Reference: [CSS corner overlap](https://drafts.csswg.org/css-backgrounds/#corner-overlap).

The rebuilt module passes actual Obsidian Windows 1.14.4 and physical
SM-X736B/Android16/Obsidian1.13.8 checks. Guarded saving writes SVG attachments
in the test vaults: 76,632/78,055 bytes, 10 vector paths each, 61/60 text
elements and zero image/foreignObject substitutions for the vector-only fixture.
Native CSS-transformed arrow groups and Markdown whitespace spacers now export.
Expected Launch card, Second card and Outside text is present; source bytes,
camera and selection remain unchanged, and no job/background surface leaks.
No screen capture or foreground activation is used. Input/preparation methods,
old PDF/PPTX regressions and remaining broader cases are recorded in
[card appearance checks](card-appearance-checks.md).

Corner overlap correction complete: five focused cases cover circular,
elliptical, percentage and zero radii plus unresolved-value refusal. Full types,
3,102 tests, lint/build, all smoke modes and packaging gates pass. Real Windows
and tablet small-card exports verify 100x40/radius48 gives rx20/ry20.
