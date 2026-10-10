# Shape-radius marker and live dragging — 2026-10-10

The old 12px circular marker resembled a connection point. It is now a 28px
rounded-corner/arrow SVG inside the existing 44×44px target. A localized value
badge appears above/right during holding and movement, follows the current
radius, and cannot intercept input. Exact numeric input remains on tap.
Pointer capture, inverse shape CTM, transient preview, clamping, single native
history commit and settings toggle remain unchanged.

## Physical tablet / actual ADB input

SM-X736B, serial R52Y808PDJB, Android16, Obsidian1.13.8, WebView153;
MiroCanvasTest. `node tools/obsidian_cdp/check-shape-radius.mjs --serial
R52Y808PDJB --port 9340` passed. CDP creates/selects the owned fixture and reads
state; ADB performs all taps and pointer gestures. At 125% zoom the control
measures 44×44 CSS pixels and contains two decorative SVG paths.

Finger hold changes radius16→36.1411819458 and the path before release; the
value badge is visible, numeric input/keyboard stay closed, original file
bytes/history/node bounds remain unchanged. Release stores one history step,
hides the badge, and Undo restores radius16/path. Fixed stored connector
anchors and the connector chain stay fixed; source/unknown fields survive.

ADB `input stylus motionevent` also previews16→30.4941184998 before release,
keeps bytes/history unchanged while held, then commits once. WebView records
`pointerType=pen`. This is Android stylus-source injection, not physical S Pen
handling. Native history is debounced: the harness waits600ms after this
release instead of reading at200ms before the history entry has arrived.

Actual ADB CANCEL restores the radius/path without a history step; tap/type
12/Enter remains available; the real plugin-settings checkbox hides the
control without changing saved radius. Click creates240×160 and free drag at
125% preserves144×104 board units. Original board bytes/settings restored.

Receipt: `.out/card-radius-tablet/native-R52Y808PDJB.json` under the CDP tool;
actual held screenshot: `radius-drag-R52Y808PDJB.png` beside it, captured only
with exportJobs=0.

## Native Windows / renderer input

Hidden isolated Obsidian1.14.4, CDP9346, l20-windows test vault. Trusted CDP
mouse input previews16→32 before release with the badge visible and numeric
input closed; unchanged source bytes/history while held, one commit, badge
hidden on release, dock Undo restores16 and original path. The target measures
44px at125%; SVG uses theme accent against white/light and dark backgrounds.
The original board/theme/camera/selection and bytes are restored.

Source-node preparation temporarily drains bounded native frame callbacks
only before input; global RAF is restored. The window stays hidden/unfocused;
renderer focus emulation is restored afterward. This is native-app renderer
input, not physical Windows mouse. Receipt:
`tools/obsidian_cdp/.out/radius-feedback/native-Windows.json`.

## Automated checks and limits

51 focused handle cases include touch/pen/mouse live feedback, rotated37° at
75% plus existing rotations/zoom, clamp, ownership, cancellation/disposal,
synchronous parent updates, numeric input and trailing-click suppression.
SVG icon is decorative and creates no additional focus target; badge is not a
per-frame accessibility announcement. Other export tests retain control
exclusion. No export implementation changed.

Pending: physical S Pen, phone (not connected), native rotated finger/pen
fixture, extreme zoom/tiny figures, OS large-text and third-party themes.
These are not substituted by unit checks or ADB pen injection.

Final automated gate: 3297 Vitest cases pass (one existing skip), TypeScript
check and production build pass, focused ESLint has zero warnings. Full source
lint has zero errors and one retained compatibility command-ID warning.
CSS gate has no !important or :has; schema/submission, MCP and CLI builds pass.
All three synthetic browser smoke modes and 33 Python oracle tests pass.
