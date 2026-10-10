# Vector PowerPoint packing — 2026-10-10

## Owned scope and pre-edit trace

This worker changes only the PPTX section of `src/export-files.ts`, adds
`tests/vector-pptx.test.ts`, and writes this receipt. The required participation
trace was recorded by the parent in `docs/lint-remediation-checks.md`, under
“Vector PDF/PPTX and viewing tools — 2026-10-10 (before implementation)”.

`makePptx` used to create one JPEG picture per slide. The new packer keeps that
picture as compatibility fallback and adds one actual SVG image part per slide.
It shares the previous theme/layout/master/properties/ZIP builder. The public
raster/PDF contract, their validation, and the PDF implementation are unchanged.
No locale, UI, worker protocol, session, package, runtime, CSS, or board edits are
owned here. No commit, push, CDP, physical input, foreground changes or captures
are performed by this worker.

## Exact API and parent integration

```ts
export interface VectorPptxPage extends ExportPage {
  readonly svg: string;
}

export function makeVectorPptx(
  pages: readonly VectorPptxPage[],
  info: ExportInfo = {},
): Uint8Array;
```

Import both from `src/export-files.ts`. `image`, `pixelWidth` and `pixelHeight`
remain required and describe the parent's JPEG rasterized from **the same
serialized per-page SVG**. Width/height/placement remain in points. The first
page sets the common slide size; later pages and placements are uniformly fitted
and centered, exactly as in the raster exporter. The packer does not rasterize,
load fonts, access a document/window, create a Worker, save files or fetch data.
The parent owns abort/job guards, preparation, splitting stacked SVG into pages,
fallback rendering, worker transfers, localized error presentation and guarded
vault saving. Every page is validated before any archive is returned.

Each slide contains one SVG picture, not individually editable PowerPoint
shapes or text boxes. Font families remain SVG references; this module does not
embed fonts. The serializer's rich-content limitations still apply. Unsupported
SVG is refused rather than silently sanitized into missing content.

## Package representation and authoritative sources

- `ppt/media/imageN.jpeg`: the supplied JPEG bytes, unchanged.
- `ppt/media/imageN.svg`: the accepted SVG string as UTF-8, unchanged.
- `[Content_Types].xml`: `svg` -> `image/svg+xml`, alongside the existing JPEG type.
- Slide `rId1`: JPEG image relation; `rId2`: existing blank layout relation;
  `rId3`: local SVG image relation. No linked/external relationships.
- Main `a:blip r:embed="rId1"` contains `a:extLst/a:ext`, extension URI
  `{96DAC541-7B7A-43D3-8B79-37D633B846F1}`, containing
  `asvg:svgBlip r:embed="rId3"`. Its namespace URI is
  `http://schemas.microsoft.com/office/drawing/2016/SVG/main`.

The Office2019 SDK type name does **not** change that 2016 namespace URI.
Sources: [Microsoft SVG element](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-odrawxml/2451f45e-5d77-4661-86d1-0a017fced779),
[CT_SVGBlip and embedded relationship](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-odrawxml/68e0150d-6a01-4ba5-ac4d-5a18d685229b),
[Office picture compatibility structure](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-odrawxml/7e1f1524-1569-4aa2-a6c9-aab2d855bd48),
and [Microsoft Open XML SDK example](https://github.com/dotnet/Open-XML-SDK/blob/main/samples/SVGExample/Program.cs).
Microsoft describes PNG for Office's own compatibility rendition. This assigned
packer intentionally retains the existing JPEG fallback contract; actual reader
compatibility is a separate acceptance check, not established by XML parsing.

## Worker-safe SVG boundary and budgets

Validation is a bounded, static XML-subset scanner, not a general SVG importer
or browser parser. There are no new dependencies or runtime Node/network APIs.
It permits the controlled serializer's SVG geometry/text, canonical local
`href` references, definitions/markers/clips/gradients, presentation attributes,
and embedded PNG/JPEG data URIs with base64 syntax and raster signature prefix.
It preserves entities, Cyrillic, measured glyph positions, transforms and radii.
It does not decode compressed raster pixels; the parent serializer creates the
image data from loaded intrinsic attachments.

Scripts, events, foreignObject, style sheets/inline style, animation, filters,
unknown elements/attributes, external/file/javascript references, SVG data
images, namespace changes/aliases, XML base, DTDs, custom entities, processing
instructions, CDATA and malformed XML are refused. Canonical `href` is required;
the native serializer already converts xlink references. Local definitions must
exist and have unique IDs. Reference cycles and exponential expansion fail.

Limits apply only to the new vector entry point:

| Budget | Limit |
| --- | --- |
| Slides | 200 |
| Total encoded SVG | 32 MiB |
| Total SVG + JPEG media | 64 MiB |
| SVG elements per slide | 200,000 |
| XML/reference depth | 128 |
| Expanded reference work per slide | 1,000,000 |
| Attributes per element | 64 |
| Each title/author string | 65,536 UTF-16 units |

Point/pixel geometry must be finite and positive. JPEG header dimensions must
match the declared fallback dimensions; fitted geometry must fit safe integer
EMU values and remain positive after conversion. Invalid XML metadata is
refused. These checks do not establish actual JPEG decoding or font availability.

## Verification receipts

### Unit and pure compiler evidence

`node node_modules/vitest/vitest.mjs run tests/vector-pptx.test.ts tests/export-files.test.ts`:
**83 passing tests**, two files (69 new vector checks and 14 existing file checks).
The independent test ZIP reader checks local/central headers, stored method,
UTF-8 flags, CRCs, duplicate parts and relationship resolution. Cases cover:

- Real SVG and exact fallback parts, extension namespace/URI, page order,
  names/Cyrillic/XML escapes and metadata.
- Mixed slide ratios, placements, identical raster geometry/shared parts,
  deterministic output and input preservation.
- Unsafe/malformed SVG, missing/cyclic definitions, acyclic exponential use
  expansion and large data-URI matching without recursive regex work.
- Page, byte, UTF-8, media, depth, element, geometry and metadata budgets.

Final focused checks pass:

```text
node node_modules/typescript/bin/tsc --noEmit --target ES2020 --module ESNext
  --moduleResolution Bundler --lib ES2020,DOM --strict --noImplicitOverride
  --isolatedModules --esModuleInterop --resolveJsonModule
  --forceConsistentCasingInFileNames --skipLibCheck --types node,vitest/globals
  src/export-files.ts tests/vector-pptx.test.ts tests/export-files.test.ts
node node_modules/eslint/bin/eslint.js src/export-files.ts --max-warnings 0
git diff --check -- src/export-files.ts tests/vector-pptx.test.ts docs/vector-pptx-checks.md
```

Strict focused TypeScript: exit 0. Owned helper ESLint: exit 0, no warnings.
Owned diff/whitespace checks: pass. The deterministic raster `makePptx` outputs
also match the pre-change HEAD bytes exactly in four independent cases (plain,
Cyrillic/special metadata, mixed ratio, explicit placement). The PDF/shared
source prefix is byte-identical. Comparison receipt:
`tools/obsidian_cdp/.out/vector-pptx-packer/raster-comparison.json`.

The first full `npm run check` before parent integration
changes passed. A later concurrent full run reported four diagnostics only in
parent/PDF/UI files: `src/vector-pdf.ts` (Window.Image and jsPDF.addImage typing),
`tests/m1-session-export.test.ts` (kind union), and `tests/quick-tools.test.ts`
(button parameter). This worker leaves them to their owners and does not claim
that later whole-worktree run passed.

### Independent ZIP/XML checks (not native visual proof)

Browser-platform esbuild compiled only the pure packer. Node generated a
2-slide synthetic deck; Python stdlib `zipfile` and `ElementTree` independently
validated every XML/SVG part, ZIP CRC, local relationship target and the
namespace-resolved `svgBlip`/fallback IDs: **pass, 20 XML parts / 2 slides**.

The readonly pre-existing
`tools/obsidian_cdp/.out/card-appearance/example-windows.svg` (76,628 bytes)
was accepted unchanged in a one-slide deck: **pass, 17 XML parts / 1 slide**.
The output was 90,135 bytes. This is cached serializer compatibility, not a
new Windows/Android export or PowerPoint viewing test. Both checks use a JPEG
header stub, not a visual fallback; their archives are intentionally structural
fixtures. Ignored receipts are under
`tools/obsidian_cdp/.out/vector-pptx-packer/`.

### Required parent/native acceptance — pending

- UI raster/vector choice, actual vector multi-page export and parsed saved
  SVG/PPTX parts from the independent renderer on Windows and physical Android.
- Source snapshots/miroSource/unknown fields, camera/selection, view switching,
  Stop, errors, unload, job timers/surface cleanup and guarded saving.
- Latin/Cyrillic text, installed fonts, transformed arrows, equal corner radii,
  clipping, intrinsic attachments and per-page placement in a real reader.
- Current PowerPoint displays SVG clearly at magnification; a reader that
  ignores the SVG extension displays the supplied JPEG. Record actual reader
  versions rather than inferring visual support from package structure.
- User documentation/locales/release notes belong to the parent. No native
  interaction, Android, Office rendering or physical stylus pass is claimed here.


Parent native acceptance is now recorded in [vector/viewing checks](vector-viewing-acceptance.md); this scoped receipt retains its synthetic/unit attribution and limits.
