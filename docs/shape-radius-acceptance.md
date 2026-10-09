# Shape radius native acceptance — 2026-10-10

## Implemented scope

Rectangles, rounded rectangles and the process alias have one physical corner
radius in board units. SVG arcs and connector/text outlines use current width
and height; default catalogue icons retain their pictures. Zero radius uses a
sharp SVG border join, including thick borders. One selected editable figure
owns a corner handle; drag previews only the owned contour and related geometry,
click opens exact numeric input on that figure. Cancellation/unload restores
preview, and release commits once through CanvasAuthoring with a captured
snapshot. Plugin settings can hide/cancel the controls without rewriting radii.
New rounded rectangles remember the last radius. Click/bar drop sizes use
wide240x160, tall160x240 or square200x200; free-drag sizes stay user-defined.
Existing node boxes and imported Miro source are not rewritten.

Stored field: miroCanvas.localOverrides[id].cornerRadius, finite0..1000;
painting clamps it to half the shorter side. The upstream contract and eight
focused schema cases were added first in Miro_2_Obsidian commit2679e203,
pushed to the existing contract PR. The plugin copy was refreshed by
scripts/sync-schema.mjs. That PR has not been merged.

## Real tablet evidence

SM-X736B / R52Y808PDJB, Android16, Obsidian1.13.8, MiroCanvasTest.
check-shape-radius.mjs records real ADB DOWN/MOVE/UP/CANCEL, taps, keyboard text
and Enter. CDP creates/opens the bounded fixture and reads DOM/state; it is
preparation/observation, not a claim of physical stylus handling.

The native radius16 on240x80 yields equal16/16 physical SVG radii. ADB drag
previews36.14118 before release while file bytes, native history and node box
remain unchanged; release records exactly one history step. Real ADB Undo
restores16, pointer CANCEL restores the preview without a step, and inline
ADB text/Enter stores12. Native settings UI toggle removes/reinstates the handle
while retaining the stored radius. Real creation tap yields240x160; free drag
at125% yields144x104 for a180x130 CSS-pixel gesture.

Explicit U/V attachment coordinates retain their requested positions; native
and independent line geometry uses the same updated contour for normals and
routing. This test does not claim that changing a radius migrates stored anchor
coordinates. Keyboard dismissal is bounded fixture preparation; it can invoke
native navigation, so the requested original path is captured before dismissal
and restored with an unchanged-byte check. Fixture files are retained for review.

Native SVG actually saves28,314 bytes with9 paths; both rounded shape paths
match the source and output has no foreignObject. Source camera/selection/file
bytes and job/surface cleanup pass. PDF58,891/PPTX70,600 payload regressions
pass with240 source-invariant samples, expected Wide/Tall independent DOM text
and worker cleanup. PDF/PPTX checker intercepts output; SVG uses the guarded
vault save callback. No screenshots or foreground changes occur during exports.

Windows1.14.4 hidden native card/settings/snippet/SVG regression also passes;
its input is trusted CDP with renderer focus preparation, not OS mouse input.
New corner controls specifically have physical tablet plus pure/DOM test
coverage; they do not have a new physical Windows pointer receipt.

## Automated evidence and limits

Full TypeScript, 3,230 unit tests plus one existing skip, lint/build, CSS zero
!important/:has, schema/submission checks pass. Upstream schema tests23 pass. All three browser smoke modes,33 Python oracle tests and both MCP/CLI builds pass.
Worker failure snapshots in their documents were taken during concurrent edits;
final focused renderer/export integration passes after those repairs.

Pending broader native checks: physical stylus/multitouch, mixed/group resize
and rotation with corner attachments at extreme zoom, bar-drop creation and
all theme combinations. Existing pure/DOM tests cover catalogue aliases,
rotation/zoom handle math, cancellation, readonly state and clamping. These
results do not close the broader feature-expansion acceptance matrix.
