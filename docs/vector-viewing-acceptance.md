# Vector documents and viewing tools — 2026-10-10

## Behavior

Export offers Raster/Vector for PDF and PowerPoint; SVG remains a separate,
always-vector format. The mode is session UI state, not a new Canvas field.
Raster PDF/PPTX retain the existing JPEG-per-page pipeline. Vector PDF contains
real paths and text, with bundled licensed Noto Sans in four styles replacing
source fonts. Vector PPTX contains SVG per slide plus a JPEG fallback for older
readers. It does not create individual native PowerPoint shapes/text boxes.

Review hides creation and editing controls/popovers, including native menus and
snapshots. Selected web links keep a direct Open link action. Leaving review
restores controls without removing native handlers. Original native readonly
is respected; an active slideshow adds a temporary readonly overlay, not a
saved review-mode change. Present slides uses native group frames in document
order; export pages are used when there are no frames. Arrow/Page navigation and
Escape remain available. Starting a show closes export UI while an already
independent job continues.

The viewing dock and slideshow bar each expose Laser pointer. It is off by
default, has a fixed64-point DOM pool and a600ms fading trail, and consumes only
eligible pointing gestures before native board handlers. Controls, links and
embedded interactive content keep their input. It never writes drawings,
metadata, selection, camera or history; cancel/blur/visibility/exit/dispose clear
owned state. The layer is excluded from vector serialization.

## Native input acceptance

Windows: hidden isolated l20-windows Obsidian payload1.14.4 (launcher user agent
still reports1.12.7), trusted CDP renderer input at9346. The window remains
hidden and never receives OS foreground activation.

Tablet: physical SM-X736B/R52Y808PDJB, Android16, Obsidian1.13.8, WebView153,
MiroCanvasTest at9340. CDP prepares/reads owned fixtures; ADB provides actual
pointer taps/movement/keys. Stylus-source input reports pointerType pen; this
is separately labelled and does not substitute for physical S Pen handling.

`check-vector-viewing.mjs <port> view` passed on both: native selection's
editing toolbar is absent, creation-button count is zero, the actual laser
gesture draws transient dot/trail without changing bytes/history/camera or
selection, and expiry clears every point. Native frame show next/previous,
laser toggle and Escape pass; bytes/history and previous readonly are preserved.
Tablet also passed actual ADB stylus-source dot/expiry and no-write checks.

The fixture waits for the explicit review-toggle save to settle before taking
the no-write baseline. Earlier receipts without that wait saw delayed native
saves and were not treated as laser mutations or passes. Direct link behavior,
normal locked-selection controls, native external display writes and popover
restoration have focused tests; no external website is opened by native QA.

## Native saved-file acceptance

`check-vector-viewing.mjs <port> export <controlled-version>` passed on both
surfaces. It selects the mode by real input, saves through the original guarded
callback, copies test artifacts for independent parsing and stops a20-page
vector job through the footer. Source nodes/edges/unknown/Miro fields,
camera/selection and original file bytes are preserved; zero jobs/surfaces remain.
No screenshot, window activation, OS print or user screen capture occurs.

| Native surface | SVG bytes | Vector PDF bytes | Vector PPTX bytes | Raster PDF bytes |
| --- | --- | --- | --- | --- |
| Windows | 64,464 | 38,342 | 96,838 | 118,829 |
| SM-X736B | 66,877 | 38,513 | 98,093 | 118,165 |

PyMuPDF parsing of each saved vector PDF: two pages,640x240 and310x240 points;
13/8 vector drawings, zero page images, extractable Latin/Cyrillic containing
Вектор and Второй, no replacement characters. Raster PDF has one image per
page. Rendered vector output was visually inspected for text, frame/card
geometry and native arrow. ZIP/XML parsing of each saved PPTX confirms two SVG
media parts, real path/text elements, svgBlip relationships and two JPEG
fallback parts. Standalone SVG remains vector even when the PDF/PPTX mode is
Raster. Stop creates no second file and cleans owned resources.

Receipts and parse results are local under
`tools/obsidian_cdp/.out/vector-viewing/`: Windows/R52Y808PDJB export/view JSON,
parsed-files.json, saved PDF/PPTX/SVG and artifact preview PNG. Parsing/rasterizing
an exported artifact is distinct from taking the user's screen. Actual PowerPoint
viewer rendering is not claimed; the package and SVG content were verified.

## Bounds, limits and mechanical checks

The native-generator PDF initially refused nested SVG overflow; a scoped fix
admits only hidden/visible and preserves clipping. OKLCH alpha is normalized
on detached copies. [PDF checks](vector-pdf-checks.md) distinguish synthetic
conversion of the native SVG from the parent's real saves above. [PPTX checks](vector-pptx-checks.md)
cover ZIP/XML, rejection budgets and byte-identical old raster packing.
[Laser checks](laser-pointer-checks.md) and [review checks](review-menu-checks.md)
record bounded pool/lifecycle and native ownership tests separately.

PDF uses supported Noto Sans glyphs; missing glyphs, complex/rotated HTML text,
unsupported SVG/material and vector budgets cause an explicit refusal. Its
font style fallback and dimensions differ from arbitrary source fonts. PPTX/SVG
reference installed fonts; older PPTX readers show the raster fallback. Original
SVG limitations (list markers, complex/live/PDF embeds, cosmetic shadows)
remain documented. Current-phone, physical S Pen and actual PowerPoint-viewer
acceptance remain pending. The earlier physical-keyboard panel bounds proof
is retained; this batch does not claim another physical IME-opening measurement.

Final parent checks are recorded below. Source/worker bytes remain separate
from board schema; dependencies are pinned and bundled, with no runtime install
or download. npm production audit reports zero current advisories.


Final gates:3492 Vitest tests pass across168 files, one existing skip; tsc,
production build, all three UI smokes,33 Python oracle tests, MCP/CLI builds,
schema/submission and diff checks pass. Source lint has zero errors and one
retained command-ID compatibility warning; CSS has zero !important/:has.
One final layout detector run reports no findings. Production npm audit reports
zero advisories. New dependencies are pinned jsPDF4.2.1/svg2pdf.js2.8.1.

The bundled font copyright and full SIL-OFL notice are retained as a legal comment in main.js, so the three-file plugin distribution carries its font license.
