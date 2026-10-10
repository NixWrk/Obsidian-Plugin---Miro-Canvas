# Viewing pan from a card

## Cause and scope

The root input guard classified any press/held move on a card as an edit.
In viewing it prevented native Canvas.onTouchdown from starting pan/pinch and
selected the card for unlock. The move guard also blocked right mouse pan
after admitting its press. Mixed/collapsed selection moves claimed the press
before refusing the edit. Native 1.14.4 sources were read before changing these
paths: onTouchdown pans from cards, cancels long press after 5 px, respects
scrollable content and owns pinch; handleSelectionDrag returns undefined when
readonly.

Viewing touch presses/moves now pass to that native path. M1 selection dragging
declines before preventing the press; native drag admission returns undefined
in viewing before creating a lifecycle. Native readonly and per-item mutation
guards remain. Pure right-button mouse moves have the same pan exception as
middle/Space; a stylus side button receives no new exemption. Ordinary editing
and user pan bindings retain their handlers.

## Actual Obsidian acceptance, 2026-10-10

`tools/obsidian_cdp/check-review-pan.mjs` owns a new fixture in a guarded test
vault, restores the previous file/camera/settings/selection, and checks exact
document, file bytes and history after gestures. Receipts are ignored under
`tools/obsidian_cdp/.out/review-pan/`. No export or screenshot was involved.

| Surface | Input and result |
| --- | --- |
| Hidden Windows, Obsidian payload 1.14.4 (launcher UA 1.12.7), Electron 39 / Chrome 142 | Trusted CDP mouse right drags from selected, unselected, locked cards, mixed-selection overlay and collapsed group; also zoom 0.5, middle and Space+left. Each 80x40 screen drag pans camera by -80,-40 at zoom 1, -160,-80 at zoom 0.5. Node/edge/source/unknown data, file bytes, selection and history unchanged. Original vault file restored unchanged; OS window stayed hidden/unfocused. |
| SM-X736B / R52Y808PDJB, Android 16, Obsidian 1.13.8, WebView 153, MiroCanvasTest | Actual ADB touchscreen swipes pass the same six card/selection/zoom cases. Tap still selects the card. Ordinary unselected-card pan works after leaving review. Exact document/bytes/history/selection invariants pass, original file restored unchanged. |
| Same physical tablet WebView | Separately labelled CDP two-finger synthesis zooms from 1 to 2, pointercancel ends the gesture, then actual ADB pan works again; document/bytes/history unchanged. This is not physical two-finger handling. |

Original build reproduced the selected-card failure on Windows touch synthesis
and actual tablet ADB: camera stayed at (300,90,0). Final Windows acceptance
uses mouse input. A separate desktop touch probe on a Markdown preview was
cancelled by the browser and is not a passing Windows touchscreen result.

The existing native vector-viewing harness also passes on both final builds:
editing/creation menus hidden in review, laser trail/expiry with no data/history
changes, native slideshow next/previous/laser/Escape and readonly restoration.
Tablet stylus-source ADB input remains distinct from a physical S Pen. Export
jobs/surfaces are zero after both harnesses.

## Automated checks and limits

3497 Vitest tests pass across 168 files, with one existing skip; TypeScript,
production build, schema/submission and all three synthetic UI smokes pass.
33 Python oracle cases pass. Source lint: no errors, one retained compatibility
command-ID advisory; CSS: zero !important/:has. Focused tests preserve mouse/pen
edit blocking, pass first/second touch admission in review/native readonly/
slideshow, decline mixed-selection edits, keep collapsed review history empty
and restore ordinary/locked editing behavior.

Pending native checks: current phone (not connected), physical finger/pinch/
S Pen and Windows touchscreen, blank-start drag crossing a different card,
separate native-original-readonly card pan, links/copy/content-scroll gestures
and card pan during slideshow. Those paths have admission/unit or existing
workflow evidence only; no new physical handling or native coverage is claimed.
