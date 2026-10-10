# Fixed radius marker and visible connection circles — 2026-10-10

The radius control is anchored at safe corner spacing instead of travelling
with the radius. Its SVG corner changes immediately from square to rounded
in proportion to the figure's clamped radius, while the live number retains
the exact value. Press/release scales only the icon to 0.96 with a 120ms
interruptible transition; reduced-motion removes this scale/transition.
The existing 44px target, input, pointer projection, cancellation, history and
setting remain unchanged. No metadata or format change.

The visible side circles belong to SelectionHandles. Native Canvas connection
points were hidden in the sampled single-node selection. The circles now have
a scoped 2px accent border and primary background that beat the tablet button
rule; hover/focus fills with accent. Dimensions/centres and routing remain
unchanged. The theme accent is purple with Obsidian's default theme.

## Real tablet

SM-X736B/R52Y808PDJB, Android16, Obsidian1.13.8, WebView153, MiroCanvasTest.
CDP prepares/reads an owned fixture; actual ADB supplies gestures/taps.

`check-shape-radius.mjs` at CDP9340 passed at125%: radius16→36.1411819458
under finger movement and16→30.4941184998 under ADB stylus-source movement.
Both button bounding-box x/y remain exactly equal to the before-gesture values
while icon path and live number change. WebView reports pen for stylus-source
input. File bytes/history/node bounds remain unchanged while held; release
commits one step and hides the badge. Undo, ADB CANCEL, exact input12, real
settings checkbox and aspect-correct click/free-drag creation also pass.
Fixed saved connector anchors/chains stay fixed and unknown/source fields
remain intact. Physical S Pen is not substituted by ADB injection.

Native circle fixture checks all four sides in light/dark Obsidian. Light:
border rgb152/115/247 against white; dark: rgb138/92/245 against black.
Android quantizes2px to1.88235 CSSpx at DPR2.125; idle circles remain10×10.
Actual ADB right-circle drag displays the line preview with no stored edge,
file or history change, then creates a native a→b edge in one step; dock Undo
restores the graph. Tap creates one connected card/edge, Undo restores it.
ADB connector CANCEL leaves bytes/history unchanged. Original board/theme
are restored with exact original bytes.

## Native Windows

Hidden isolated Obsidian1.14.4, CDP9346, l20-windows test vault. Trusted CDP
mouse input previews radius16→32 with unchanged control x/y, changing icon
path and number, no persisted preview; one commit and Undo restore16. Both
themes retain the44px radius target.

All four circle borders measure2px: rgb152/115/247 on white in light and
rgb138/92/245 on rgb28/28/28 in dark. Native-edge drag preview/commit/Undo,
quick-create/Undo and Escape/release cancellation pass. The cancellation
checker waits for the preceding native Undo save to reach disk before taking
its byte baseline; an earlier premature snapshot contained the previous card.
Original theme/camera/selection/bytes are restored. Window remains hidden and
unfocused; renderer focus preparation is restored afterward. This is native
renderer input, not physical Windows mouse. Source-frame preparation drains
a bounded queue only before input, restoring global RAF before checks.

## Synthetic and automated evidence

53 focused handle tests pass, including fixed target during dragging/input,
zero/max icon corner and cancellation, rotations/non-default zoom, touch/pen/
mouse, ownership and numeric input. All 3299 Vitest tests pass, one existing
skip. TypeScript, production build, focused ESLint, CSS gate (0 !important/
:has), all three synthetic smoke modes and 33 Python oracle checks pass.
Full lint retains one compatibility command-ID warning and has zero errors.
Schema/submission checks pass.

[CSS receipt](connection-circle-style-checks.md) separates 12 synthetic
scenarios/144 circle states, hover/focus, tablet specificity, unchanged
centres, interruptible press and reduced-motion from these native results.

Local native receipts: CDP `.out/card-radius-tablet/native-R52Y808PDJB.json`,
`.out/radius-feedback/native-Windows.json`, and
`.out/radius-circle-motion/native-R52Y808PDJB.json` / `native-Windows.json`.
The held tablet screenshot next to the radius receipt was captured only with
exportJobs=0. No export implementation changed; existing control exclusions
remain covered by export tests.

Pending: physical S Pen, disconnected phone, native rotated touch/pen fixture,
extreme zoom/tiny figures, native keyboard focus/reduced-motion preference,
third-party themes/popout. These are not counted as native passes.

Follow-up: the same direction path now has both inward and outward arrowheads,
matching increase/decrease gestures. No pointer or history behavior changes.


## Combined corner/tilt refinement

The user selected both the changing corner and directional tilt. The same
decorative direction path has two arrowheads. RadiusDrag tracks only the
latest nonzero change of the clamped radius; the host exposes increase/
decrease/steady. The CSS variable sets ±8° on the held SVG, alongside scale
0.96; the original stronger reduced-motion rule still removes the transform.
Button geometry and inverse shape CTM are untouched; release/cancel reset
steady, numeric input remains neutral.

55 focused cases and all 3301 Vitest cases pass (one existing skip), along
with TypeScript, focused zero-warning ESLint, production build and CSS gate.
An independent headless Chromium probe checks steady/increase/decrease with
normal/reduced motion, interruption/release and unchanged button bounds.
Receipt: `.out/radius-circle-motion/combined-motion-synthetic.json`.

The updated actual tablet ADB check passes reversal while held: radius
36.14118→24.09412→36.14118, same button x/y and no persisted preview.
Native computed icon matrices show positive tilt on increase
(0.950701,0.133413,-0.133413,0.950701) and negative tilt on decrease
(0.950657,-0.133606,0.133606,0.950657); release transform is none.
Both arrowheads are in the sampled decorative path. ADB stylus-source,
Undo/CANCEL, input and settings checks still pass; original bytes restored.

Native hidden Windows confirms increase/steady state, changing corner and
number, fixed bounds, one commit and Undo. Its hidden CSS animation clock
leaves the sampled SVG transform at identity, so that receipt does not prove
visible Windows tilt timing. Actual tablet motion and synthetic interruption/
reduced-motion evidence remain separately identified. No foreground takeover.
