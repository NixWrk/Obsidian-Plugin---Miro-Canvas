# Connection circles and radius press feedback — 2026-10-10

## Scope and prior trace

This CSS-only task owns `styles.css` and this receipt. The pre-edit action
trace is [Fixed radius marker and visible connection circles](lint-remediation-checks.md#fixed-radius-marker-and-visible-connection-circles--2026-10-10-before-edits).
The parent owns radius positioning/path logic, source tests and native/device
verification.

Source inspection confirmed that SelectionHandles creates the visible
`.miro-canvas-handle--connect` buttons inside `.miro-canvas-handles`;
M1CanvasSession appends that overlay to its board root. The supplied native
tablet trace identifies these buttons as the four visible circles and the
native connection points as hidden for this selection.

## CSS change

The scoped idle selector
`.miro-canvas-root .miro-canvas-handles .miro-canvas-handle--connect`
has specificity (0,3,0). Its 2px accent border and primary background outweigh
Obsidian's `.is-tablet button:not(.clickable-icon)` at (0,2,1).
Hover and focus-visible selectors have specificity (0,4,0), fill with the
accent and use text-on-accent. Purple follows the existing
`--interactive-accent` theme token.

The existing 10px idle and 22px hover/focus dimensions, 90ms size/font
transitions, centred translation, padding variable, pointer routing and
coarse-pointer reach remain in place. No native port selector was added.

Only the radius button's SVG scales to 0.96 while its host carries
`data-dragging="true"`, using an interruptible `transform 120ms ease-out`
transition with a centred origin. Reduced motion disables both transition
and scale. The 44px host/button and live path geometry receive no new
transition; no will-change, dependency or interface string was added.

## Bounded synthetic evidence

Executed using the installed Python Playwright and headless Chromium
140.0.7339.16, with an inline PowerShell here-string piped to `python -`.
No dependency or browser installation was needed. The harness used a minimal
reconstruction of the inspected handle DOM and the complete repository
stylesheet, not a mounted Obsidian or M1 session.

The host-rule model used border-box sizing, base button padding 4px 12px and
`.is-tablet button:not(.clickable-icon) { background: #f6f6f6;
border: 2px solid white; padding: 4px 20px; }`.
This reproduces the supplied light-tablet conflict; it is not a complete
copy of Obsidian's stylesheet. It was intentionally tested before and after
the plugin sheet in both palettes.

Baseline computed values reproduced the problem: background
`rgb(246, 246, 246)`, white border, 10×10px dimensions, zero padding and
pointer-events auto.

All 12 scenarios passed: light/dark palettes × desktop/tablet classes/coarse
pointer profiles × host sheet before/after plugin sheet. All four side
buttons were checked idle, hovered and keyboard focus-visible: 144 state
checks.

| State | Computed background | Computed border | Size | Ink / font size |
| --- | --- | --- | --- | --- |
| Light idle | rgb(255, 255, 255) | 2px rgb(138, 92, 245) | 10×10px | accent / 0px |
| Dark idle | rgb(30, 30, 30) | 2px rgb(138, 92, 245) | 10×10px | accent / 0px |
| Hover, either palette | rgb(138, 92, 245) | 2px rgb(138, 92, 245) | 22×22px | rgb(255, 255, 255) / 12px |
| Focus-visible, either palette | rgb(138, 92, 245) | 2px rgb(138, 92, 245) | 22×22px | rgb(255, 255, 255) / 12px |

Idle dimensions, centres, padding, cursor, pointer-events, translation and
pseudo-element reach matched the HEAD stylesheet baseline. Every hover/focus
state retained its idle centre and returned to 10px after clearing the state.
Padding remained 0px with `--miro-canvas-button-padding: 0`; buttons retained
pointer-events auto/crosshair and the overlay retained pointer-events none.
The coarse-pointer pseudo-element kept its -15px inset. A native-port
sentinel and an outside-root connection-button sentinel retained their
baseline computed styles.

Radius checks passed in all 12 scenarios. The SVG computed 28×28px, origin
14px 14px, transition-property transform, duration 0.12s, timing ease-out,
pointer-events none and will-change auto. Interrupting the press at 40ms
sampled scale about 0.976; release returned to 1 and a settled hold reached
0.96. Host and button bounds stayed fixed at 44×44px. A directly assigned
SVG path applied immediately with computed path transition duration 0s.
Reduced motion computed transition none/0s and transform none, including
repeated held/released states. This checks CSS timing, not the parent's
radius-to-path mapping or pointer-capture implementation.

`npm run lint:css` passed: zero !important declarations and zero :has
selectors. `git diff --check` passed; the new receipt also passed a trailing-whitespace and CRLF check.

## Parent-reported native evidence and remaining scope

The parent reported PASS after deploying the reviewed stylesheet hash:
Windows and physical tablet radius pinned box/indicator; all four ports in
light/dark; actual native-edge drag preview/commit/Undo; and tap quick-create/
Undo. The parent also reported all 3299 tests passing. These are attributed
parent results, separate from this task's synthetic evidence.

This task did not run native Obsidian, CUA, CDP, ADB, foreground interaction,
screenshots, full smoke suites or the full unit suite, and did not commit.
The synthetic DOM and host model do not certify every Obsidian theme,
native gesture lifecycle, rotated/zoomed geometry, or physical stylus
handling. Those checks remain with the parent's integration work.

Later combined directional tilt belongs to the parent follow-up in
[radius motion checks](radius-marker-motion-checks.md#combined-cornertilt-refinement);
the state-dependent tilt is additional to this earlier scale-only receipt.
