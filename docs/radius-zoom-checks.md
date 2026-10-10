# Radius marker at close zoom

Requested on 2026-10-10 before publication of 0.3.0. The inverse-scale
corner marker stayed 44 screen pixels at every board zoom. It now appears
only on its selected editable figure from the configured minimum displayed zoom.
The global searchable setting defaults to200%, with a slider (0..6400%, step25)
and an exact numeric field; 0 allows the marker at any positive zoom.
Native zoom frames update the one owned control; hidden valid state retains
its owner for reappearance. No board-node scan is added per frame.
The settings switch, bidirectional arrow, moving marker and exact input remain.

## Safety and automated checks

ShapeRadiusHandle cancels capture/numeric drafts before removing the DOM.
Late pointer-up/blur cannot commit the draft. Selection/owner/SVG/geometry
validation and review/lock/settings-off remain. Tests check 50/100/150/199/200%,
repeat hide/show, one host, rotation/physical geometry at close zoom, numeric
and drag draft cancellation, capture/listener cleanup and the M1 displayed-zoom
caller between refreshes. Export excludes this interactive element.

## Native evidence

check-radius-zoom.mjs passed on hidden Windows Obsidian 1.14.4 and SM-X736B /
Android16 / Obsidian1.13.8 / WebView153 in MiroCanvasTest. Actual zoom menu
inputs go 100 ->50 ->200 ->100 ->200: zero markers below200%, one marker with
the same selected figure owner and 44px touch size at200%. Exact document,
source/unknown fields, file bytes, history and selection remain unchanged.
Original files/settings/cameras/sidebars are restored.

Windows uses trusted CDP mouse with bounded native frame preparation in a
hidden/unfocused window. Tablet menu/button actions use actual ADB taps.
Numeric text uses CDP input; draft cancellation drives the native viewport
setter as instrumented preparation, followed by native frames. No manual
session.refresh is used for zoom changes. Both show zero export jobs.

The tablet's check-shape-radius.mjs also passes at200%: actual ADB finger
DOWN/MOVE/UP/CANCEL, drag reversal/live value, one commit, Undo, exact input,
native settings switch and click/free-drag creation proportions. ADB stylus
source produces pen events; physical S Pen handling is not claimed.
No screenshot is taken during export; the radius drag capture has no job active.
Receipts are ignored under .out/radius-zoom and .out/card-radius-tablet.


## Configurable threshold follow-up

Normalization bounds/defaults, device-layout/storage round trips, EN/RU search
indexing, slider/exact input, configurable100/125/300/0 visibility and draft
cancellation are covered by focused tests. Native Windows1.14.4 caches render
definitions across reopening; slider render now reads the live settings host,
including its current-value description, instead of its original closure value.
A cached-definition test covers the percentage and existing card-radius fields.
The changed native checker runs actual settings input, reopens the field and
compares memory/data.json, then checks100-at100/50,300-at200 and0-at50.
Slider input is separately tested; original preferences and boards are restored.
Windows QA temporarily selects the existing inline-modal branch with a scoped
instance hook, restoring its descriptor on close. No persistent native config,
OS foreground or export screenshot is used. Final native rerun passes all16 visibility/settings checks on both surfaces;
independent exports also pass all5 checks with zero jobs/surfaces and exact
original-file restoration. Tablet percentage/slider input uses ADB; Windows
uses trusted CDP input in its hidden inline native modal.
