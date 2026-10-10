# Export panel style checks

Bounded CSS refinement, 2026-10-10. Design authority: [DESIGN.md](../DESIGN.md),
Obsidian Operate mode. The pre-edit action trace is
[Export-panel composition](lint-remediation-checks.md#export-panel-composition--2026-10-10-trace-before-implementation-edits).
This receipt covers `styles.css`; it does not certify native input or exports.

## CSS scope

The body-mounted panel is 374px wide with border-box sizing and a viewport
maximum of viewport width minus 32px and left/right safe areas. Top/right
offsets include their safe areas. Its maximum height subtracts 32px, top/bottom
safe areas and `--keyboard-height`, using `100vh` then `100dvh`.

Header and footer do not shrink or scroll. Only `__body` scrolls. Pages, count,
full placement help and add actions stay together; settings begin after a
hairline and 14px separation. Output buttons share three equal columns above
320px viewport width; at 320px and below they stack in original DOM order.
Page names shrink and ellipsize without displacing their three icon controls.

Controls use host typography, surfaces and small radius; scoped selectors
outrank native tablet pills. Minimum height is 34px on desktop and 44px under
mobile/tablet classes or any coarse pointer. Icon targets have matching width.
Every button's padding uses `--miro-canvas-button-padding`; the existing global
tablet reset is unchanged. Placement help remains complete, muted and 12px
at the normal modeled UI size. Stop and status can wrap within the footer.

The old export panel block and late hint/Stop rules were replaced. Export page
overlay CSS is unchanged by comparison with HEAD. No transition was added.
Renderer/session/source-format files and the design sidecar were not edited.

## Synthetic computed matrix

**40 cases passed, zero failures.** Existing Python Playwright 1.55.0,
headless Chromium 140.0.7339.16. The harness used the complete `styles.css`,
contract-matching markup and current English/Russian export strings. It ran
20 compositions in both modeled light/dark themes; it did not connect to
Obsidian, CDP, CUA or ADB, or bring a window to the foreground.

The native-style conflict model was placed *after* the full stylesheet:
tablet/mobile non-icon buttons requested 140px minimum width, 56px minimum
height, 16px 24px padding, 100px radius and 18px semibold type; tablet selects
requested 200px minimum width, 56px minimum height and 100px radius.
Controls still computed to the panel's compact rules. Removing the conflict
model left all control paddings unchanged. Themes used supplied host-token
fixtures, not extracted native theme styles.

Inputs covered desktop 1280x900; tablet 800x1120; phone widths 360, 340 and 280;
landscape 800x480 with 24px right inset; 30.117647px top and optional 16px bottom
insets; board/slides; 0, 3, 8 and 24 pages; long page/title text; normal, busy
and unavailable states; 20px UI / 18px help / 23px title; 400px keyboard.
Busy fixtures deliberately doubled a long status and expanded Stop's caption.

Representative light-theme computed metrics (CSS px; dark geometry matched):

| Case | Panel W x H | Top | Body visible / content H | Output W | Minimum control H |
| --- | --- | --- | --- | --- | --- |
| Desktop, 3 pages | 374 x 566.39 | 16 | 447 / 447 | 110.66 | 34 |
| Tablet, Russian long names | 374 x 678.17 | 46.109 | 539 / 539 | 110.66 | 44 |
| Tablet, 24 pages | 374 x 1041.88 | 46.109 | 903 / 1547 | 110.66 | 44 |
| Phone, 340px viewport | 308 x 678.17 | 46.109 | 539 / 539 | 88.66 | 44 |
| Phone, 280px viewport | 248 x 737.88 | 46.109 | 499 / 603 | 218, stacked | 44 |
| Tablet, keyboard 400px | 374 x 641.88 | 46.109 | 503 / 1547 | 110.66 | 44 |
| Phone, keyboard 400px + busy | 328 x 391.88 | 46.109 | 137 / 539 | 95.33 | 44 |
| Phone, larger text | 328 x 791.88 | 46.109 | 631 / 699 | 95.33 | 44 |

Assertions checked panel bounds against safe areas/keyboard, no horizontal
overflow, exactly one CSS scroll region, no overlaps within page/action/status
groups, minimum target height and icon width, compact radius/type, disabled
opacity, complete help text and unclipped output captions. Three-column widths
matched within 0.1px; narrow output order remained PDF/PowerPoint/SVG. Scrolling
the body to its end left header/footer rectangles unchanged. Synthetic keyboard
Tab produced a 2px solid focus outline. Tablet/phone Russian screenshots were
visually inspected for hierarchy, readable help and uncluttered controls.

`npm run lint:css` passed: zero `!important`, zero `:has()`. `git diff --check`
passed. The already-clean layout detector was not rerun. No dependencies were
installed. Tested stylesheet SHA-256:
`dfd26bcde1a1d0c083f92d6c4caf34417b35aac7a336bb9f3faee24cb43fb7c5`.

## Native checks

Completed by the parent in [native panel checks](export-panel-design-checks.md).
The synthetic findings above remain independently attributed. Originally
delegated to the parent: The action trace requires
real desktop/tablet open, page actions, format/quality, Close/Stop and independent
output verification, with device/app versions and actual input recorded
separately from synthetic evidence. Parent unit tests, builds and native receipts
remain under their existing ownership. Synthetic theme tokens and layout input
cannot establish real-device contrast, gesture ownership or saved-file behavior.
