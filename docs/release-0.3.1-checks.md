# Release0.3.1 packaging corrections

The 0.3.0 directory check reports a5MB Sync limit, unsupported extra assets,
a duplicate max-height fallback and a runtime script creator in jsPDF.
Trace and mandatory regressions were recorded before edits in
[the remediation register](lint-remediation-checks.md).

The reviewed jsPDF4.2.1 browser-source hash guards an AST build transform that
removes entire external-viewer output clauses and unused HTML/addSvgAsImage
plugins. This is a source removal, not a disguised script token or runtime
patch. Only already-used offline core drawing/text/TTF/PNG functions remain.
The production build checks byte size, parsed script creation and external
viewer code; dependency upgrades fail until their changed source is reviewed.
The four Noto Sans TTFs are gzip-packed without glyph subsetting and decoded
locally/lazily. Original hashes, codepoint ranges, font styles and licenses
remain. node scripts/compress-pdf-fonts.mjs --check verifies reproducibility;
unit tests register all four fonts and verify every decoded original SHA.
Early rebuilt main.js is4,583,997 bytes versus the published6,509,051 bytes.
Native text/style/vector/image/Stop checks are required before publication.

## Behavior recommendations

Vault enumeration supplies Canvas-only index candidates for graph/backlinks,
board-link resolution and bounded property-query results. It enumerates paths;
board parsing reads Canvas candidates through Vault. Linked-note search reads
individual linked Markdown files, including resolved heading/block slices.
The Board knowledge switch disposes index/hooks and property results. These
requested integrations need local file-path discovery; removing enumeration
would remove features. No paths or board/note contents are uploaded.

Clipboard access comes from explicit Copy/Cut/Paste actions, native clipboard
events, Copy card link/embed and Copy import instructions. The plugin does not
poll the clipboard in the background or upload its contents. Existing policies
keep readonly/locked/stale edits guarded. These reviewer recommendations disclose
capabilities; they are not blocking errors and are retained with clear scope.

## Verification record

Final local gates pass:3519 Vitest tests/168 files with one existing skip,
22 Node packaging/CSS/PDF tests,33 Python oracle cases and all3 UI smokes.
TypeScript/source/MCP/CSS lint, production/MCP/CLI builds, schema/submission,
font repack checks and production dependency audit pass. Source lint keeps one
previous compatibility command-ID warning; CSS has0 !important/:has/duplicates.
Final main.js is4,628,626 bytes (decimal4.63MB), below5,000,000. Full PDF library
MIT notices and the font's full OFL are present in its distributed JavaScript.

Hidden Windows1.14.4 and physical SM-X736B/Android16/Obsidian1.13.8 pass native
SVG/vector PDF/PPTX/raster PDF, Stop and export-panel manipulation/bounds checks.
Windows uses trusted CDP input; tablet uses actual ADB taps and separately
identified preparation. Real tablet keyboard height400.94116px keeps Close and
output/Stop controls within the available area. No export screenshots or OS
foreground changes; original boards/cameras/settings restored, jobs/surfaces0.
PyMuPDF verifies two vector pages,13/8 drawing paths, no whole-page images,
all Cyrillic style fixture words and four distinct embedded TTF programs.
Their PDF resource names intentionally share the custom family name; individual
program hashes distinguish the styles. Source SVG has400/600 weights paired
with normal/italic, and PPTX retains two real SVG slide parts. An artifact-only
PDF render confirms all4 styles visually; it is not a screen capture.
Native Board knowledge opt-out removes the index/outgoing/property/backlink
hooks on both surfaces without changing the active board. Clipboard behavior
is retained and scoped by existing explicit action/event handlers; unit/UI
clipboard regressions pass. Phone is not connected, no current-phone pass.

Pending publication: exact candidate CI, companion CLI/MCP publication,
core3-asset provenance/content checks and remote size check.
The published0.3.0 tag/assets are preserved; release0.3.1 will supersede them.
