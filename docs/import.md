# Importing an existing board

Choose **Import into a board** in the source file's menu or command palette.
The preview names the format/version, destination, exact conversions,
approximations and missing/unsupported data. It also counts new picture
attachments. **Create board** creates a separate `Name (board).canvas` beside
the source, using a new name when taken. Cancel creates nothing. If the source
changes during preview, start the import again. The original bytes stay intact.

The result uses ordinary Canvas cards, files, groups and edges, with Miro
Canvas's own editable shapes, strokes, styles and independent connectors.
Other editors are not needed to open it. Without Miro Canvas, native cards,
file references, groups and edges remain; drawings and independent lines need
the plugin. To remove an import, delete the new board and, if no longer used,
its new picture folder. Existing vault attachments are never copied or deleted.

| Format | Verified scope | Remaining losses |
| --- | --- | --- |
| Excalidraw scene v2 `.excalidraw` | Shapes, text/bound text, bound/free arrows, drawings, frames, links, vault notes and embedded raster pictures; JSON and compressed plugin Markdown | Roughness/hatching; non-stroke transparency; cropping/reflection; frame clipping/explicit membership; extension data; shared card/line stacking; native text/font rendering |
| Excalidraw plugin `.excalidraw.md` | JSON/compressed-json, raw Text Elements and Element Links, Embedded Files, heading/block/PDF subpaths | Web embeds are links; formulas are LaTeX text; images of notes become editable native note cards |
| JSON Canvas 1.0 `.canvas` | All four native card types and native edges; IDs, order, known metadata and unknown fields preserved; omitted arrays accepted | Unknown extension semantics are preserved but reported as not drawn; invalid nodes/edges are omitted and reported; missing attachment cards retain their references |
| Advanced JSON Canvas 1.0-1.0 `.canvas` | Native copy plus supported shapes, borders, alignment, line styles, presentation metadata and compact groups | Portals remain file cards; routes/arrowheads may approximate; group collapse uses spatial native containment; existing Miro overrides win; custom styles not interpreted |
| Enhancing Mindmap / Markmind basic Markdown | Headings/lists, fenced code/tables, connected cards with a new tree layout | Original plugin layout is not present in the outline; folded branches open; other note properties are reported |
| tldraw `.tldr`, file 1/schema 2 | Narrow tested subset: store 5/shape 4/page 1/draw 5, one page, direct page parents, unrotated black medium drawings with one packed XY segment | Other variants leave placeholders; older schemas, nested/multiple pages are refused. Width/smoothing/ink are approximations. Assets, bindings and rich text are not implemented |

The current tldraw Markdown wrapper (`tldraw-file: true`) is implemented and
covered with synthetic wrapper tests around an actual upstream `.tldr` sample.
A real exported Markdown note remains pending. This is **not general tldraw
support**. [Exact records, provenance and remaining scope](import-tldraw-audit.md).
Markmind **rich** remains unsupported; its disabled adapter is not a working
importer. Other editors require a documented format and permitted real samples.
[Expansion matrix](import-expansion-plan.md).

Excalidraw pressure becomes per-point stroke widths; smoothing and simulated
pressure remain approximations. Groups become transparent native frames that
move by spatial containment: overlapping neighbors may be included, and
explicit non-spatial membership cannot be retained. Cards keep their relative
order; Canvas draws frames below cards and cannot interleave lines with cards.
Rotations use source radians converted to degrees; native geometry rounds to
whole board units. Source fonts are requested by name and need to be available
locally; wrapping and font fallback may differ.

Embedded **PNG, JPEG, GIF and WebP** are decoded in memory before preview and
saved once per source file ID in a new picture folder beside the source. No
network download occurs. Inline SVG/HTML, unsupported MIME, corrupt bytes and
missing assets leave diagnosed placeholders. Limits: 8 MiB per image, 32 MiB
in total, 1,000 assets, 32 million pixels per image and 32,768 per dimension.
Native image cards use intrinsic file proportions; stretched embedded images
are reported as approximations. Vault-image proportions cannot be inspected by
the pure adapter and may also normalize when native Canvas loads the file.

Source text is bounded to 64 Mi UTF-16 units, Excalidraw compressed input to
16 Mi units/output to 64 Mi units, and Canvas/Excalidraw to 50,000 elements.
tldraw has stricter [bounds](import-tldraw-audit.md). No editor runtime, active
HTML/scripts or new format fields are added. `miroSource` remains immutable Miro
evidence; other formats use existing bindings and the optional report card.

The **import report card** lists all retained details (up to 10,000 entries,
500 visible rows). Exact/approximate/not-imported counts classify each source
ID once, using its most severe outcome; independent setting/group losses also
count. Several reasons can therefore occupy multiple detail rows for one item.
Preview lists the first 20 details. Reasons distinguish approximation,
unsupported/source-limited data, missing assets and malformed data.

Attachments publish after confirmation, then the board. Failed publication
rolls back unchanged files owned by that attempt using Obsidian's trash
preference. Files a person changed or moved are retained. An empty new picture
folder may remain after failure; it is not recursively removed because another
window may have added a file. Opening failure retains a successfully created
board and pictures. [Unit, native and pending device evidence](import-expansion-checks.md).

Excalidraw note properties and prose outside the drawing are reported and remain in the original note; they are not silently assigned new board positions or properties.

When the active file is not importable, the same command opens a native source
picker. Raw drawings remain selectable even when Obsidian hides their extension
and no source editor is installed. Cancel in the picker also writes nothing.
SVG/vector export still refuses Markdown list markers, including those on the
optional report card; raster PDF is verified for an imported drawing/image/note
board. Legacy text binding metadata without a tested containerId remains a
coverage gap; do not infer complete compatibility from the scene version alone.
