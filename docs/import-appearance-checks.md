# Import appearance checks — 2026-10-11

The user requested source/result examples for every importer and preservation
of their appearance. Each example must show the actual source plugin and the
actual Miro Canvas view. A screenshot alone is not evidence that every source
feature survives: retain source bytes, validate each result and list observed
differences separately from unsupported formats.

## Traced before implementation

1. An Excalidraw group becomes a nameless native group (`label: ""`). Obsidian
   omits this empty group label on save. `nativeOmits`/`graphDrift` and
   `canvas-authoring.nativeKeepsRequested` did not allow this default, so
   board theme and attachment-name changes refused with `lost label`.
   Accept only an empty label on an actual group, never a nonempty label or
   an unknown label on another card. Checks: preservation of named groups,
   source/unknown metadata, one native history step and undo; appearance
   changes on the actual imported nameless group in isolated Obsidian.
2. Excalidraw's `appState.theme` was ignored. Explicit dark source text on a
   host dark board becomes unreadable although the source board is light.
   Reuse existing `miroCanvas.settings.displayTheme` and default pen ink in
   the source's declared theme. Checks: light source/dark host, dark source/
   light host, missing/invalid theme retains prior host behavior, metadata
   validity, source immutability, native reopen and host-theme changes.

No new schema fields or editor runtime are planned for these repairs.
3. Advanced Canvas text alignment is mapped to existing typography, but the
   renderer applied the vertical alignment marker only to shapes/stickies.
   Apply an explicitly requested vertical alignment on text too. Checks:
   plain multiline text top/center/bottom, default untouched, marker cleanup,
   node replacement and actual Advanced original/result comparison.
Opacity, hatch, reflection, freehand algorithms, source font availability and
mindmap layouts require separate evidence; pending does not mean preserved.

## Evidence

Final focused/unit/native evidence is in import-all-showcase-checks.md.
Physical OS/stylus and Android checks remain pending; no device evidence claimed.

4. Actual Advanced 7.1.0 shape0/shape3 inherit native palette colors. The
   replacement contour used a generic background/border and lost the native
   .07 content tint and .7 border alpha. Keep native palette variables for
   colored native shapes, composited over the native card background; explicit
   local color overrides still win. Advanced invisible cards hide only their
   container/border/label, preserving the native content tint. Native redraws
   must not replace the requested absent border. Check real source/result in
   both themes and late native writes, as well as restoration on disposal.
5. Captured mindmap node sizes exclude Canvas's default Markdown padding and
   reserved scrollbar. Publish captured labels as existing local text/shape
   items and remove that native padding only on these item kinds. Check long
   labels, Markdown emphasis/links, captured font/radius, reopen and edges at
   nondefault zoom. Native ordinary cards keep their original layout.
6. Reopening the imported maps exposed false `binding-dangling` diagnostics:
   existing foreign import/report bindings were being looked up in miroSource.
   Recognize only the builder's coupled format/source-ID prefixes and report
   role; keep ordinary Miro, mismatched and unknown bindings diagnostic.
   Check renderer/source-model units and real reopen without a source editor.
7. Actual raster filenames stayed visible: readCanvasElementDom exposes the
   inner container, while Obsidian's image label is its sibling under nodeEl.
   Query a runtime nodeEl only if it contains that same container in the same
   document; retain the old bounded label selectors and visibility decision.
   Check sibling image labels, outside/cross-window refusal, metadata precedence,
   native reopen and reversible label restoration.
   The initial inner-container hypothesis was insufficient. Actual 9356
   inspection shows native nodeEl is already available in this SDK and finds
   the label once mounted. The guarded shell supplement is a compatibility
   fallback, not the demonstrated cause or fix. Do not mark either earlier
   0/6 label pass as successful.
   Actual 9356 tracing found the remaining cause: labels are mounted after the
   first decoration pass. Reapply hidden labels only for shells in the existing
   coalesced appearance-mutation batch, then reconcile source paint after native
   markup replacement. Do not warn about labels on still-unmounted file cards.
   This is mutation work, never a new per-card/per-frame pass. Mandatory checks:
   lazy first mount, pan out/in, reopen, global/local precedence, native write
   restoration, large-board mutation tests, native image load and source paint.
8. tldraw accepted a captured source theme but did not serialize it, so light
   host reopening could hide white source ink. Reuse existing displayTheme only
   for an accepted complete capture; offline imports keep host behavior.
   Check dark capture/light host, invalid/stale capture fallback and native reopen.
9. Source captions have 25-unit boxes; an invisible native card border left
   only 23 units for their words. Plain imported/local ink without an explicit
   border requests no native border, while explicit border overrides still win.
   Transfer valid declared Excalidraw lineHeight through existing typography.
   Check caption height/scrolling, explicit dotted borders, source immutability,
   cleanup and native reopen; do not resize source boxes to hide clipping.
