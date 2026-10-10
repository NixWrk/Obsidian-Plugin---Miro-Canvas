# Export panel refinement — 2026-10-10

## Scope and required actions

The pre-edit trace is in [lint remediation](lint-remediation-checks.md).
ExportPanel remains a body-mounted panel owned by M1CanvasSession. Page
ordering, placement help and adding pages are grouped above paper/orientation
and quality. Only the body scrolls; Close and output/Stop stay outside it.
Compact PDF/PowerPoint/SVG captions retain full accessible action names.
SVG action icons replace Unicode glyphs. Tablet safe areas and the native
keyboard height limit the panel; scoped controls retain the padding variable.
Renderer, raster/vector serialization, worker, save and abort contracts are
unchanged by this layout work. No new settings, dependencies or format fields.

Required checks: open/show/reorder/remove/add/frame pages, paper/orientation/
quality, board/slides/empty/busy/unavailable, listener cleanup, long names,
English/Russian, light/dark, narrow/large-text layouts, Close/Stop and genuine
independent output. Preserve source data, camera/selection during export and
restore owned test state. Never capture the screen or take the foreground
while an export job runs.

## Real Windows Obsidian

Hidden isolated l20-windows vault, native Obsidian 1.14.4, CDP9346. Trusted
renderer mouse input is distinct from synthetic dispatch; the OS window stays
hidden. Light/dark geometry, 34px controls, actual page actions, orientation,
quality, empty-state disabling and footer Stop passed.

`check-export-panel.mjs 9346` saved one parseable independent SVG attachment,
`Export panel design 1791624310881.svg`, 17,201 bytes. A second 20-page job was
stopped through the footer without a second save. Camera and selection stayed
unchanged during export. Original file bytes were restored exactly, with zero
export jobs and zero renderer surfaces. Receipt:
`tools/obsidian_cdp/.out/export-panel-design/native-Windows.json`.

## Physical tablet Obsidian

SM-X736B/R52Y808PDJB, Android16, Obsidian1.13.8, WebView153, MiroCanvasTest,
CDP9340. CDP prepares and reads owned fixtures; ADB supplies actual taps.
Light/dark page/actions/settings/empty/busy bounds passed with 44px controls.
Three-page panel bounds were x362.941, y46.118, w374, h691.169 CSSpx, respecting
the 30.118px top safe area. Actual independent SVG save produced
`Export panel design 1791624708186.svg`, 19,126 bytes; Stop produced no second
save. Original file bytes were restored exactly, with zero jobs/surfaces.

The automated receipt's `passed:false` is retained: ADB focused the radius
number input, but did not open the physical keyboard. Do not reinterpret that
attempt as a keyboard pass. The user then opened the keyboard physically,
confirmed it was visible, and a read-only native measurement closed this check:

| Native CSS-pixel measurement | Value |
| --- | --- |
| Window height | 1204 |
| Keyboard height | 400.94116 |
| Available bottom above keyboard | 803.05884 |
| Panel top / bottom | 46.11765 / 386.82352 |
| Footer bottom | 385.88237 |
| Close bottom / target | 103.05882 / 44 x 44 |
| All output button bottoms / heights | 373.88235 / 44 |

Panel, footer, Close and all outputs remain above the real keyboard. This is
human physical input plus a native DOM measurement, not a simulated viewport
or ADB-opened IME. Receipts: `native-R52Y808PDJB.json` and
`keyboard-human-native.json` under the same export-panel-design output folder.
The combined action/save/Stop and human keyboard evidence satisfies tablet
acceptance; the automated keyboard-only limitation remains explicit.

The final radius rollback build was installed on both surfaces. Its CSS edit
only removes radius-icon motion, leaving the verified export-panel rules and
callbacks unchanged. Phone native acceptance is pending; no phone was connected
for this batch. Physical S Pen and third-party-theme contrast are not claimed.

## Synthetic and mechanical evidence

[CSS receipt](export-panel-style-checks.md): 40 desktop/tablet/phone cases with
light/dark token fixtures, narrow layouts, synthetic keyboard, larger text,
long/many pages, focus and busy/unavailable/slides states. These establish
layout only, not physical input or native saved-file behavior.

The tablet-padding smoke now holds device classes constant while toggling only
the host padding rule, comparing every button's padding/width/height and keeping
coverage guards. It no longer confuses intentional 34px desktop/44px mobile
sizing with a tablet padding override. Controls smoke passed; basic/interactions
smoke and 33 Python oracle tests passed in this batch.

Final verification: 3301 Vitest tests passed, one existing skip, across164 files;
tsc, focused ESLint, production/MCP/CLI builds, schema/submission checks and
diff check passed. CSS: zero !important and zero :has. Final bounded layout
Impeccable detection returned no findings. General source lint retains the
existing command-ID warning at main.ts324 (zero errors).
