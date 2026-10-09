# Shape radius geometry checks — 2026-10-10

## Scope and trace

This receipt covers only src/shape-geometry.ts and tests/shape-geometry.test.ts.
The parent owns renderer, endpoints, metadata, selection/session wiring and
real-app acceptance. No devices, commits or other source files are touched.

Read the pre-edit "Shape corner radius and initial proportions — 2026-10-10"
entry in docs/lint-remediation-checks.md. Existing shapePath consumers include
source-renderer and selection-toolbar (picker icons); shapeOutline consumers
include source-renderer (text insets and lines), connector-endpoints,
selection-handles and m1-session. A no-argument call retains its existing
geometry. The parent must pass current dimensions/radius for live shapes,
including resize/rotation previews and independent export.

## API contract

Exported ShapeBox has readonly width:number, height:number and optional
cornerRadius:number. shapePath(shape:string|undefined, box?:ShapeBox) returns
string|undefined. shapeOutline(shape:string|undefined, box?:ShapeBox) returns
readonly ShapePoint[]|undefined. hasShapeCorners(shape:string|undefined)
returns boolean. shapeCornerRadius(shape:string|undefined, box:ShapeBox)
returns the effective radius in board units.

Only rectangle, round_rectangle and flow_chart_process accept radius options.
The process alias shares rectangle geometry. Dimensions must be finite and
positive. An explicit radius must be finite in 0..1000; invalid values fail
safe to radius zero and a square rectangle. A valid radius is clamped to half
the shorter dimension. Without an explicit radius, rectangle/process use zero
and round_rectangle uses 0.12 times the shorter dimension; that default is
not subject to the explicit-value input limit. Unrelated shapes ignore options.
Unknown/undefined shapes retain undefined path/outline and effective radius zero.

With dimensions supplied, normalized rx = radius / width * 100 and
ry = radius / height * 100. SVG quarter-circle A arcs become physical circles
under preserveAspectRatio="none". The corresponding polygon samples six
segments per quarter using the same normalized radii. Radius zero returns
the shared four-point rectangle. Without dimensions, legacy paths and outlines
stay unchanged, including the rounded rectangle picker icon.

Dynamic contours have a separate FIFO cache limited to 128 normalized radius
pairs; equal normalized contours reuse a frozen array across shape aliases and
proportional dimensions. Resizing cannot accumulate an unbounded dynamic map.
The existing catalogue outline cache is independent.

## Automated evidence

Passed: focused shape-geometry and shape-catalog tests (92 cases), followed
by source-renderer plus both focused suites after the parent repaired its
renderer import (179 cases). Strict standalone TypeScript check of
src/shape-geometry.ts passes. Focused ESLint and scoped git diff --check pass.
The full git diff --check also passes (with an unrelated schema line-ending
warning).

Latest full unit run: 161 files pass, one fails; 3217 cases pass, four fail,
one is skipped. All four failures are in tests/m1-session-export.test.ts:
settingsSeen.length is zero rather than at least two. Shared npm run check
reports TS2532 in parent-owned src/m1-session.ts at lines1755 and2882.
These integration checks remain open for the parent; they are not geometry
acceptance passes. The earlier transient missing hasShapeCorners import in
source-renderer.ts was repaired by the parent, and all renderer tests pass
on the focused rerun.

The existing shared node_modules was reused; no npm ci, build outputs,
schema edits, device checks or commits were performed in this scoped task.
The parent retains build/MCP/schema/smoke and real-app acceptance.

Focused regressions cover physical circular arcs/sampled corners on wide and
tall boxes, square/zero/default corners, explicit 1000 and size clamping,
invalid dimensions/radii, process alias agreement, all unrelated catalogue
shapes, legacy icons, contour ray/nearest projection at zoom1.75 with rotation
and translation, and resize-cache reuse/eviction.

## Parent acceptance still pending

Unit geometry evidence does not certify rendering or real input. The parent
must check current-dimension wiring for paint, text insets, native edges,
independent connectors and connector chains during preview before release,
commit/cancel, repeated/group drags and non-default zoom. Persisted radius,
one history transaction, reopen/Undo, locks/review and source/unknown-field
preservation remain parent checks. Independent SVG/PDF/PPTX must use the same
geometry. Physical Android creation/radius/resize checks must record device,
app version and genuine input separately from CDP setup. No real-app/device
acceptance is claimed here.

Final parent integration/real-device results: [shape radius acceptance](shape-radius-acceptance.md). Earlier worker snapshots are historical; pending native cases remain explicit.
