# Temporary SVG objects in imports

The user approved separate SVG attachments for source effects that Miro Canvas
cannot yet edit natively. Each observed object is a native Canvas file card,
with its original source binding. Moving, resizing and attaching lines remain
native actions. Its contour, fill and embedded text are edited in the source
editor; importing again creates a new board. Native support for sketch
roughness, hatch fills, shape opacity and smoothed pressure outlines remains a
future feature, rather than a new metadata contract in this change.

## Source and publication boundary

Excalidraw 2.28.1 can supply static geometry from an already-open, saved light
source. Every authored scene field and the complete element order must match
the fresh source text. Load-time defaults may be added by the source editor.
Only the known nonvisual `version`, `versionNonce` and `updated` load revisions
may differ; seeds, order, geometry, paint and unknown authored fields must match.
The observation is checked again after its asynchronous exports. Selected
rough/hatched/translucent shapes include their bound text; freehand strokes
include their actual outline. Reflected/translucent raster pictures can use only
already-loaded validated data images, including pictures linked from the vault.
Links, framed clipping and dark filter inversion
remain on the existing native approximation path. Ordinary shapes remain
editable cards. Only already-loaded validated data rasters are lent to the
exporter; no external files, embeddables, scene embedding or font inlining are
requested. The plugin never opens or installs a
foreign editor for this operation.

The shared SVG copier reads geometry and resolved paint. It consolidates a
transform on a detached clone, never on the source element. References, filters,
masks, marker resources, nested viewports and unsupported elements decline the
snapshot. Empty Excalidraw font definitions and metadata carry no appearance.
The independently parsed asset grammar is the publication boundary: static
paths and primitives, bounded coordinates, transforms, dashes and resource
counts; no executable content, CSS, external references or font files. SVG
text references available fonts and does not promise portable font identity.

Adapters independently check observation provenance, IDs, geometry and decoded
asset dimensions. Failed observations keep the previous native conversion and
its explicit loss entries. Accepted objects get a localized `visualFallback`
entry, including bound text whose editing moves to the source editor. The
existing preview/cancel, fresh-source check, owned attachment publication and
rollback logic applies without a new schema field.

## Regression checks

Own 9358 found an outer attachment face still rounded to 8px while the inner
image was sharp. Own 9357 confirmed the cause: styled native file cards receive
the source renderer's generic `text` descriptor and were excluded from
CardAppearance's outer-face marker. The native type reader already handles
`getData()` correctly; an initial reader hypothesis was disproved. File cards
with that descriptor now remain eligible, and an explicit per-object radius
sets the tracked shell variable above the global card setting. Figures retain
their contour eligibility; unload restores the previous variable and marker.

| Action | Required evidence | Status |
| --- | --- | --- |
| Observe source | Pinned version, same TFile/text, dirty/saving/current geometry guards; changes during async export discard capture | 13 focused source-view units pass; blank/failed exports bounded to 512 attempts |
| Import object | Passive SVG dimension check, native file card, source/text binding, explicit report, ordinary native card retained, source unchanged, no orphan attachment on refusal | Focused pure adapter cases pass |
| Parse geometry | Strict paths/points/transforms, size/work limits, references and malformed inputs refused | 187 shared/vector asset checks pass |
| Native display | Actual source editor and new Miro-only import at matched cameras, attachment loads without name/border/gutter; reopen after foreign plugin is disabled | Own 9357/9358 pass; final outer radius repaired |
| Interaction | Drag/resize/rotate with attached edge before release, one-step Undo at non-default zoom; no preview persisted | Own 9358 SVG drag/resize and native edge checks pass; final 9357 20-check harness passes |
| Publication | Preview cancel/staleness, collision and rollback, source/asset bytes unchanged | Focused publication and full suite pass |
| Devices | Physical Android input and model/app version recorded separately from Windows CDP renderer input | Pending; no physical-device claim |

## Actual acceptance

Own hidden Obsidian 1.14.4 on 9357 imported the 67-element Excalidraw source
through the native source picker and preview, report off: 52 nodes, one native
edge, two independent connectors, four observed vector objects plus one
reflected PNG derivative. Ten image previews load with hidden labels and no
native border. The source bytes remain equal before/after the final stable
import. Earlier source-editor normalizations and disposable staging failures
remain in the task evidence; the final authored sample uses valid 40-hex asset
IDs so reopening its source images works. The previous canonical example is
retained rather than silently rewritten.

Own 9358 performed the tldraw automatic import with no injected snapshot,
producing one original PNG and one SVG with the source's actual filled path.
After a nonvisual source-editor user-record autosave, one stable-source reimport
kept exact source bytes. Actual drag/resize checks and one-step keyboard Undo
passed; previews did not write disk. The final 9357 Miro-only byte-copy reopen
confirms both outer faces now have radius 0, images load, labels stay hidden,
dark board theme survives, and renderer/session diagnostics are empty. The
128/147 native text viewport/scroll metric difference remains visible.

Advanced 7.1.0 read-only exploration on own 9359 found zero standalone contour
SVGs: its seven SVGs are disclosure chevrons; contours use CSS radii, skew,
pseudo-elements and masks. No speculative CSS projector is added. Its existing
native conversions and documented contour/portal/collapse differences remain.
Own 9359 is closed; the protected 9355/gallery source SHA remains unchanged.

The shared vector asset owner passed 187 focused checks. Final integrated
Vitest: 4031 passed, one skipped, 182 suites. Types, source/MCP lint, CSS,
production build, schema, submission and whitespace gates pass. Physical
Android remains pending; all new native input evidence is Windows CDP renderer
input on separate noninteractive desktops, with no foreground activation.

The existing seven-format gallery remains the comparison source. Unsupported
portals, collapse behavior, branch markers, HTML/Markdown metrics, source fonts
and editor-only semantics are not converted into exact native features by an
SVG attachment.
