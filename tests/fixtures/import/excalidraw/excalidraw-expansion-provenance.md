# Synthetic Excalidraw expansion fixture

`excalidraw-expansion-semantics.excalidraw` was authored for these tests on
2026-10-11. It is synthetic, not an exported user board or copied external
sample. No image bytes, external editor code, or user data are included.

Official format references inspected on 2026-10-11:

- [Excalidraw element types](https://github.com/excalidraw/excalidraw/blob/master/packages/element/src/types.ts): groupIds are deepest-to-shallowest, image scale expresses axis flips, frameId and customData are meaningful fields, scene indices follow array order.
- [Excalidraw freehand rendering parameters](https://github.com/excalidraw/excalidraw/blob/master/packages/element/src/shape.ts): measured versus simulated pressure, size factor 4.25, thinning 0.6 and sine easing; newer constant-width strokes use factor 1.4.
- [Perfect Freehand radius model](https://github.com/steveruizok/perfect-freehand/blob/main/packages/perfect-freehand/src/getStrokeRadius.ts): pressure adjusts radius. The adapter converts that scalar model into widths supported by LocalStroke; it does not import the renderer. Streamlining, smoothing and caps remain explicitly approximated.
- [Excalidraw binding types](https://github.com/excalidraw/excalidraw/blob/master/packages/element/src/types.ts): fixedPoint identifies the binding focus; an orbit endpoint may sit outside the shape. The adapter reads the saved endpoint, not the focus, and reports clamping or orbit behaviour as an approximation.

The fixture exercises negative coordinates, radians, an arrow preceding its
cards, an arrow bound through text whose angle differs from its container,
nested groups and frames, an absent frame reference, variable/simulated/constant
strokes, repeated points with different pressures, image flipping, Cyrillic and
wikilinks, and empty/non-empty custom data. JSON and compressed Markdown
containers are generated from the same synthetic scene in the tests.

The vault-image reference is supplied by the test's synthetic Embedded Files
section and existing vault resolver. Embedded-asset publication belongs to the
main integration task.
