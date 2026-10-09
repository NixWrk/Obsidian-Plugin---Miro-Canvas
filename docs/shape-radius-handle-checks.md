# Shape radius handle checks

## Trace before implementation — 2026-10-10

Owned files: `src/shape-radius-handle.ts`, its focused test, the handle CSS,
English/Russian enhancements strings and this document. Parent owns schema,
metadata, shape geometry, settings and M1 integration. No source-window settings,
real-app launch, screenshot, CDP, ADB, commit or detector changes in this task.

The parent supplies one selected rectangular shape's effective numeric radius,
node element, physical width/height, edit permission and zoom. It routes preview
through the common scene/edge geometry, commits through one native history
transaction, and removes/cancels the control when disabled, locked or read-only.
The default-enabled setting hides only the control; saved geometry is retained.

The control verifies the owning document, connected native selected node, any
available node ID attribute, and the node-scoped `.miro-source-decoration-shape
svg` with normalized `0 0 100 100` viewBox. It attaches only its own transparent
host, button and exact numeric input. It writes no board or native selection
attributes and draws no second selection frame.

Actions: drag the corner control; click or keyboard-activate it to enter an exact
radius; Enter/blur accepts once; Escape/pointer cancellation, selection change,
read-only update, setting disable and unload discard previews. Foreign pointers
must neither change the radius nor end the gesture. Screen-space CTM inversion
handles rotation/zoom; normalized coordinates are scaled separately by physical
width and height, then average dx/dy changes one equal x/y physical radius.
Values clamp to 0..min(1000, width/2, height/2), without integer rounding.

## Mandatory regression checks

- Unit/synthetic: non-square rotated SVG at non-default zoom, intermediate
  preview before release, one commit on release and repeated drags.
- Unit/synthetic: unrelated pointers, pointercancel, lost capture, Escape,
  selection/readonly/disabled update and dispose restore without commit.
- Unit/synthetic: direct exact fractional numeric input, one Enter/blur commit,
  invalid/empty values rejected, bounds clamped, Escape restores.
- Unit/synthetic: invalid dimensions/zoom, foreign/unselected/detached node,
  wrong/nested SVG, null/singular CTM fail closed; local control size follows
  inverse zoom with accessible minimum spacing and no new selection outline.
- Static: TypeScript, focused tests, localized key parity, lint and CSS rules,
  `git diff --check`. Broad integration/build/smoke checks belong to parent.
- Pending real-app: equal physical corner radius on wide/tall rectangles;
  pointer ownership, keyboard focus and exact entry; preview native/plugin
  connector chains; one Undo/Redo step; both themes/languages; toggling keeps
  stored radii; tablet padding, touch hit area and stylus. Real Windows input
  and physical Android model/app/input evidence remain pending; unit evidence
  must not be presented as real-app evidence.

## Results

Implemented the requested constructor/update/dispose API without refinements.
`radius` is always a finite effective number supplied by the parent. A 44px
button contains a 12px visible dot; its host uses inverse zoom and at least 22px
screen spacing from the top/left edges where the figure has sufficient room.
The host never draws a selection frame. Exact input supports fractional decimal
and exponent values; empty, incomplete, hexadecimal and nonfinite values cannot
commit. Valid values clamp to the common physical-radius bounds.

Integration reminder: add `.miro-canvas-shape-radius-handle` to the parent's
panel/gesture exclusions so earlier capture listeners do not claim its pointer
before its own handlers stop propagation. Pass `update(undefined)` when the
feature toggle is disabled or there is no eligible single selection. The module
also cancels on `editable: false`. Parent retains stored radii, provides preview
scene/edge projection and owns native history, metadata and equal-radius paths.
No settings or caller files were edited here.

Checks completed in the shared feature worktree on 2026-10-10:

- `npx vitest run tests/shape-radius-handle.test.ts tests/i18n.test.ts`: 50 pass
  (46 handle behaviors plus 4 localization tests).
- `npm run check`: passed for the initial focused implementation. A final
  rerun after concurrent parent integration reports TS2532 in
  `src/m1-session.ts:1755:59` and `:2882:62` (possibly undefined values).
  These caller sites belong to parent; no handle-module diagnostics were
  reported. The shared worktree is not currently typecheck-clean.
- `npx eslint src/shape-radius-handle.ts src/locales/en.ts src/locales/ru.ts`:
  pass with no diagnostics.
- `npm run lint:css`: pass; zero `!important` and `:has` declarations.
- `git diff --check`: pass (Git reports line-ending normalization warnings only
  in concurrent schema/geometry files outside this task's ownership).
- `npm test`: 161 files pass, one fails; 3163 tests pass, 58 fail, one skips.
  All failures are in `tests/source-renderer.test.ts`, including missing shape
  decorations, absent rotation observer/projections and stale connector paths.
  These implementation/test files belong to parent, were not edited here, and
  need parent investigation. This is a snapshot while the shared worktree is
  being edited concurrently, not a successful integration receipt.

Build/schema/MCP/browser smoke and real-app/physical-device checks remain with
the parent. No native input, screenshots, CDP or ADB were used for this task.

Final parent integration/real-device results: [shape radius acceptance](shape-radius-acceptance.md). Earlier worker snapshots are historical; pending native cases remain explicit.
