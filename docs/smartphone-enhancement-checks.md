# Smartphone enhancement acceptance — 2026-10-08

Target: physical SM-A336E, serial RZCW101PJVN, Android 14, Obsidian 1.12.7,
MiroCanvasTest only. The app version is below the declared minimum 1.13.7;
this is a legacy compatibility check, not evidence to lower that minimum.
Build: feature commit 1763b33. No screen capture or Windows activation.

The typed property query, genuine Canvas result tap and outgoing-note tap pass.
Result y190.6 is above the open keyboard (height 326.75555, top 526.6) in viewport
384x853, DPR 2.8125. Taps are real ADB input; text and drawer/resize preparation
are CDP. Final receipt: native-property-panes-RZCW101PJVN.json.

## Native Escape finding before harness adjustment

The first group run passes collapse, Undo/Redo, held native/independent chain
paths, exact commit and Undo at 0.5 zoom. During the held cancel check, ADB
KEYCODE_ESCAPE returns to the previous Canvas, so the next geometry sample
cannot find the test group. Preserve native-groups-RZCW101PJVN-adb-escape.json;
do not reinterpret this as a same-board cancel pass.

Trace: the groups-only motion helper sends ADB Escape for CANCEL, then UP;
sample reads the active Canvas. Add an explicit --cancel-key cdp test option
for renderer Escape on this legacy app, leaving default ADB cancellation intact.
All group touches remain ADB; cancellation must be labeled CDP Escape plus ADB
release. Mandatory checks: held paths/unchanged disk/history at 0.5 and 1.25,
exact commit, same-board renderer cancellation and Undo, default tablet/Windows
method preserved, and the native Android-back navigation limitation retained.
At this point other feature checks and independent PDF/PPTX text verification
were pending; their completed results are recorded below.

## Backlink test-pane finding before adapter repair

The first phone integration attempt passes properties/cache/resolved links
and records 20 native backlinks, but samples a closed drawer at x=-323 with
no target file and count 0. Index/backlink sidecars are both ready. The adapter
selects the first cached backlink leaf and expands a drawer without revealing
that exact leaf. Prepare a native right-drawer backlink tab, reveal it on mobile,
and keep its leaf identity for count, excerpt and property-row sampling. Keep
native caches/counts/rows untouched; validate the target file is Feature Reference
before accepting UI evidence. Preserve native-integration-RZCW101PJVN-hidden-pane.json.
Required retest: actual properties form, correct note pane/count/excerpts,
property-only source row and native graph model. This is a test adapter change,
not a plugin source change.

## Theme keyboard adapter before rerun

check-theme.mjs leaves the native card editor with ADB KEYCODE_ESCAPE on every
mobile combination. The observed legacy Android Escape navigation can invalidate
that fixture too. Add an explicit --escape-key cdp option, keep the native ADB
default, and label keyboard events separately from all real ADB theme/card taps.
Required checks: eight app/board/media combinations with measured surface/text
colors, editing/search/export panels, negative white-control oracle, theme changes
while editing, unload cleanup, and exact original board/config/settings restore.
No plugin theme implementation is changed by this adapter.

The first theme attempt restores board/config/settings bytes, but its old
search-close selector button:nth-of-type(3) now hits a navigation button after
the added regex/case controls. The board export menu is not reached. Trace
BoardSearchBar: case/regex precede Previous/Next, with the Close (lucide-x)
button last. Select the close icon instead and assert the bar actually hides
before reopening the board menu. Preserve native-theme-phone-search-selector.json.
This repairs the acceptance script, not product styling or search behavior.

Readonly measurement confirms the search Close button is on screen (x340..368
in width 384); its SVG has pointer-events:none, so the center hit is the parent
button. The helper incorrectly requires that button to be inside the SVG.
Resolve a matched icon to its closest button before bounds/hit checks; keep
actual ADB input. This is not a product overflow/color defect.

## Final phone results

All nine feature phases pass: groups (14 named checks), edges, palette,
zoom/CSS presentation, board search, selection transfer, card embeds,
properties/graph/backlinks and actual note rename/property-derived connections.
Global property search and outgoing navigation also pass. Gesture touches and
UI taps are ADB; text, pane/fixture preparation and renderer Escape are CDP.
Group commit/Undo and same-board CDP cancellation pass at 50% and 125% zoom.
The ADB Escape navigation result remains a separate legacy finding.

Theme check passes eight application/board/media combinations, editor colors,
search/export panels, live editor scheme changes and unload/reload cleanup.
The negative white-control oracle detects the deliberately invalid panel.
Original board, appearance config and plugin-settings bytes are restored.
Receipt: native-theme-phone-final.json (contains deployed-file SHA256 hashes).

Independent PDF and PowerPoint payloads are generated (82,107 / 93,840 bytes).
Both background renderers contain Launch card, Second card and Outside before
capture. All 1,036 state samples match the active source camera/selection/classes;
source bytes remain unchanged, both workers terminate, zero background surfaces
or jobs remain. Receipt: export-text-final-SM-A336E.json. The checker intercepts
save to inspect payloads; this does not claim a new test attachment was written.
No screenshot or foreground takeover is used during export.

Original Export touch test.canvas is reopened after the checks. Product source,
manifest version and the minimum Obsidian version remain unchanged. The latest
phone build gate is now closed for this legacy installation; support-floor
phone evidence and the broader native acceptance matrix remain separate.
