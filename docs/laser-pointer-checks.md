# Temporary laser pointer and slideshow checks

## Trace before implementation — 2026-10-10

Owned scope: `src/laser-pointer.ts`, `src/slide-show.ts`, their focused tests,
and this receipt. Parent owns session integration, locale strings, CSS, review
menu gating and native Windows/tablet input. No commit or push by this worker.

SlideShow currently frames native slide rectangles, owns a root-mounted toolbar
and a capturing owner-document key listener. It has no activity callback or laser
button, and navigation currently consumes typing keys in fields. LaserPointer
will own only a decorative viewport overlay, temporary points, one bounded owner
window expiry timer, and its own capture listeners while enabled. It never reads
or writes board data, camera geometry or history. Capture at owner-document level
must precede Canvas root handlers; controls, links, edit fields and embeds remain
native. Parent must enable it only in review/presentation and exclude its layer
from exports. No source-window globals, window settings or screen capture.

Mandatory checks before acceptance:
- mouse hover and primary mouse/touch/pen board gestures; consumed pointer owns
  preview/up, unrelated pointers and right-button navigation remain native;
- plugin/native controls, links, fields, editable Markdown and embeds untouched;
  foreign roots and owner-document boundaries remain untouched;
- root-relative viewport coordinates at different camera zoom/rotation; a bounded
  pool of at most 64 trail elements, about 600 ms expiry, no idle scheduling;
- pointercancel/lost capture, blur/page hide, document hidden, clear, disable and
  dispose cancel own timers/capture; disabled mode has no overlay/listeners;
- preserve externally changed root attributes and pre-existing presentation class;
- slideshow activity transitions, button callback/aria-pressed refresh, previous/
  next/Home/End, input/composition/modifier keys, Escape, restart/failure/disposal;
- parent native Windows and physical Android checks: real mouse/ADB touch and
  stylus-source input distinguished from physical stylus; source bytes/history
  unchanged, board switching/unload/review exit, toolbar links and navigation.

## Evidence

Completed owned scope; native acceptance remains parent-owned and pending.
Unit/synthetic success does not certify native Obsidian or physical Android.

- `npx vitest run tests/laser-pointer.test.ts tests/slide-show.test.ts`: 62 passed.
  Covers primary mouse/touch/pen, hover, early root-handler exclusion, controls,
  links/editable/embeds, foreign roots, viewport bounds, fixed 64-point recycling,
  600 ms fade/no idle timer, late callbacks, clear/cancel/lost capture/blur/hidden/
  pagehide/disable/dispose, pointer-capture fallback, attribute ownership, slide
  transitions/button state/typing/modifiers/composition/Escape/restart and failures.
- Focused TypeScript with **all repository compiler flags** including
  `noImplicitOverride`, `isolatedModules`, `esModuleInterop`,
  `resolveJsonModule`, `forceConsistentCasingInFileNames`, and explicit
  `--types node,vitest/globals,obsidian`: passed. An initial focused command
  omitted Obsidian's ambient DOM extensions and failed in shared DOM helpers;
  corrected command includes those declarations. No shared helper changes.
- Owned source ESLint `--max-warnings 0`: passed. One targeted Impeccable detect
  run returned `[]`, exit 0; no context/sidecar repair.
- Synthetic headless Chromium with current parent CSS: real browser mouse
  pointerdown/up never reach a root capture listener installed **before** the
  laser; hover position `(170,210)` in root `(70,90)` yields `(100,120)` despite a
  rotated/scaled child card. A 100-move held gesture keeps 64 trail elements and
  produces **zero subtree child-list records**. Native-like buttons/links still
  receive clicks and root events. After 650 ms all points are hidden. Accessible
  slideshow toggle changes pressed state; ArrowRight in an input does not advance;
  Escape ends and disables the laser; disabled board input again reaches root.
  This is a synthetic DOM, not Obsidian, ADB or physical stylus evidence.
- No build/deploy, CDP/device operation, screenshots, window setting changes,
  commit or push by this worker. Full integration typechecking was observed
  failing in parent-owned `tests/m1-session-export.test.ts:84` while its export
  mock was still being extended for PPTX; that observation is separate from the
  green owned checks and does not describe the final parent's check state.


## Owned lint trace before correction

The initial layer pointer-events assignment guarantees decorative hit testing;
new trail opacity resets a recycled point before the owner-timer fade. ESLint's
static-style rule flags these two direct assignments. Route only these owned
styles through existing `setElementStyles`, preserving values and parent CSS.
Required regression: disabled transparency, pointer ownership/UI exclusions,
recycled pool opacity/expiry and no DOM child-list updates on pointer frames.


## Integration contract

`new LaserPointer(root: HTMLElement)`; `setEnabled(boolean)`, readonly `enabled`,
`clear()`, `dispose()`. The root must be the untransformed board viewport, outside
native camera transforms. The controller owns one decorative div:

```text
.miro-canvas-laser-pointer [aria-hidden="true"]
  span.miro-canvas-laser-pointer__dot
  span.miro-canvas-laser-pointer__trail × 64
```

The **entire detached pool is created once** in the constructor. Only enabling/
disabling appends/removes the layer. Paint/expiry changes styles and `hidden`
without textContent, append/remove or native geometry/history/data work. One
owner-window 32 ms timer services at most 64 points until the last ~600 ms expiry;
no global RAF, idle loop, card scan or per-card work. Parent supplies positioning,
dot/trail styling and `[hidden]` handling. Owned pointer-events is always `none`.
Parent may ignore layer-only setup/dispose child-list records in its enhancement
observer; no per-frame records need filtering.

Enabling temporarily sets root `data-miro-laser-enabled="true"`; disabling restores
its prior value only if the current value still equals the owned value. There is
no viewing-class ownership here. All input listeners use owner-document capture
and root membership/controls exclusions before consumption, so a late-created
laser still precedes earlier-installed root native/M1 listeners. No parent early
drag guard is needed. Captured gestures continue consuming their own pointer
outside root/over controls until up/cancel, but do not paint there. Hover is
mouse-only and not consumed. Right-button, non-primary/unrelated pointers, wheel,
controls, links, inputs, editable cards and embeds are left native. No default
host pan/read-only setting or root touch-action is changed.

`SlideShowHost` optional additions: `onActiveChange(active: boolean)`,
`onLaserToggle()`, `isLaserEnabled(): boolean`. `SlideShow.refreshLaser()` updates
`aria-pressed` after an external toggle. A laser button appears only with a toggle
callback; its localized name is `words().slideShow.laserPointer`, class
`.miro-canvas-slideshow__laser`, native icon `mouse-pointer-2` (sized SVG fallback).
`dispose()` ends the show and prevents restarting. Normal stop remains restartable.
Activity callbacks fire once per transition after framing/after complete teardown;
restart reports false then true. Editable/control key targets and IME composition
retain navigation/typing; Escape always ends the presentation and reports inactive.

Remaining acceptance belongs to parent: review/native menu gating, exports must
exclude the transient layer, native Windows hidden input and connected physical
Android gestures at zoom/rotation, links/embeds/pan with laser off, board switch/
unload and byte/history preservation. Physical S Pen is distinct from ADB/CDP.


Parent native acceptance is now recorded in [vector/viewing checks](vector-viewing-acceptance.md); this scoped receipt retains its synthetic/unit attribution and limits.
