# Canvas CSS snippet isolation checks

Recorded before implementation, 2026-10-09. This task owns only
`src/canvas-snippets.ts`, `tests/canvas-snippets.test.ts`, and this register.
Main/settings/locales/styles/native-device and export-call-site integration
belong to the parent task. No native app input is performed by this task.

## Contract and native evidence

The parent reports inspected Obsidian 1.14.4 cached app source:
`app.customCss.snippets` is a string array, `enabledSnippets` is a Set,
`extraStyleEls` contains HTMLStyleElement entries in enabled-snippet order.
`loadSnippets` queues loading, installs text, then emits workspace css-change
and resize. This is source evidence supplied by the parent, not new real-app
input or browser proof. The parent supplies a verified, document-specific
getter returning exact `{ name, element }` entries or undefined. There is no
heuristic stylesheet detector and no change to snippet files or enablement.

## Required checks, recorded before implementation

| User action / boundary | Required evidence | Status |
| --- | --- | --- |
| Open Canvas with no allowed snippets | Native/plugin theme remains; snippet card/content/control selectors and inherited body font/text-indent/variables excluded | Local Chromium and parent tablet runtime passed; Windows/trusted physical input pending (parent) |
| Open an ordinary note beside Canvas | Original selector specificity, pseudo-elements, important rules and note appearance unchanged | Unit/local Chromium passed; native pending (parent) |
| Allow one snippet, change allowlist | Two Canvas roots and independent export agree synchronously | Unit/local Chromium passed; native pending (parent) |
| Reload native snippets / toggle native enablement | Exact entry replacement/text reload restored and re-isolated; files and native settings unchanged | Unit/local Chromium passed; native pending (parent) |
| Close one of two boards / unload plugin | Remaining scope protected; exact original selector and owned inline values restored | Unit/local Chromium passed; native pending (parent) |
| Nested media/supports/style rules | Grouping and nesting preserved; unsupported CSS shape explicitly diagnosed without broadening selectors | Unit/local Chromium passed |
| Independent export during live editing | Register export scope before native render; no async global sheet disabling, no foreground/window/screenshot changes | Local Chromium registration passed; native/call-site ordering pending (parent) |
| Open Canvas in another document | Per-document entries, observer and baseline; document close/disposal safe | Unit/local Chromium passed; native pending (parent) |

## Integration API

`CanvasSnippetManager(getEntries, allowed = [], onDiagnostic?)` exposes
`attach(document)`, `register(scope): () => void`, `configure(allowed)`,
`refresh(document?)`, `dispose()`. All registration and refresh work is
synchronous. The parent owns names enumeration and integration wording.
Unsupported shapes must emit an English maintainer diagnostic. No animation
frame loop, global window replacement, network, CDP or device handling here.

Parent integration addition, before implementation: export strict
`readNativeSnippetEntries(customCss: unknown, document: Document)` and
`readNativeSnippetNames(customCss: unknown)` readers for the inspected 1.14.4
shape. Root marker exported as `CANVAS_SNIPPET_SCOPE_ATTRIBUTE` with value
`data-miro-canvas-snippet-scope`; marker values are manager-owned. Native
1.13.8 tablet shape verification remains with the parent. A shape mismatch
returns undefined, never guessed stylesheet entries.

## Pre-fix lint trace, 2026-10-09

The first targeted lint run found static property assignments on the temporary
inheritance probe, DOM factory/globalThis spelling warnings, CSSRule.type
warnings and native array type narrowing warnings. Before changing these sites:

- Affected user actions: open/register Canvas or export scope, change allowed
  names, native CSS reload, theme change, close a board/unload. No card-frame loop.
- Mandatory regression: local Chromium inheritance/font/indent/variables,
  disabled-sheet try/finally, two documents/two roots, exact selector/inline
  teardown; strict native reader order/shape tests; tsc and targeted lint.
- Native Windows/physical Android actions remain pending with the parent.

Probe styles are essential temporary measurement inputs. Route the property
values through a variable-driven loop and use the existing document-owned DOM
factory; do not add plugin CSS or change production theme rules. Replace
rule-type checks with selector/declaration/grouping shape checks while retaining
unsupported/global-rule refusal. Native array narrowing must preserve strict
string/duplicate/order validation. This paragraph records the entire planned
lint-fix batch before its implementation, within this task's sole owned doc.

## Implementation and limits

Only exact native entries returned by the verified reader are rewritten. Each
selector gets a zero-specificity `:where(:not(root, root *))` subject guard,
placed before originating pseudo-elements. Original selector strings,
declarations (including priorities), native text, grouping rules, order and
native enablement are preserved. There is no CSS-text detector or snippet file
write. Rule planning is pure and transactional; unsupported CSS leaves the
whole affected sheet unchanged and emits `unsupported-css`. Other supported
snippet sheets can still be isolated; an unsupported sheet can still influence
Canvas, so the result must be described as unavailable/incomplete to the user,
not as successful universal isolation.

Supported groups are media, supports, container, layer, scope and starting-style;
nested style rules and CSSNestedDeclarations share the same guarded subjects.
Unknown global rules, imports, font faces, keyframes, property registration and
non-originating/shadow pseudo-elements are refused explicitly. The reader also
refuses foreign-document native entries, mismatched enabled/name/style counts,
duplicate entries and unknown private shapes. Popout cloned snippet styles
remain unsupported until their exact native ownership/order is verified; there
is no fallback detector. Diagnostics are structured maintainer data, deduplicated
per document/reason/name/message; parent integration supplies localized UI.

The inherited baseline is taken synchronously with supported blocked sheets
disabled inside try/finally. Their exact previous disabled flags are restored
before any return, await or rendering boundary. A temporary invisible probe
compares engine-defined initial/unset values to identify inherited longhands,
rather than maintaining a font-only list. Custom names are collected from
accessible CSSOM and ancestor inline declarations because Chromium does not
list them in computed style. Only differing inherited values/custom properties
are overridden at owned roots. Removed custom variables use the guaranteed
invalid `initial` value. Teardown restores owned inline values/priorities and
marker attributes while retaining a later independent inline edit.

Head text/replacement mutations and body/html theme attribute changes trigger
refresh. CSSOM selector edits and sheet.disabled changes create no observed DOM
mutations; there is no own recursion, animation frame loop or per-card work.
Call `refresh` for external CSSOM mutations, media/environment changes or other
baseline changes that do not emit one of these DOM events. Register connected
roots synchronously before native rendering, including independent export;
detached roots do not yet have a usable inherited computed baseline. The parent
must refresh when a previously detached root joins its document. Root isolation
cannot undo non-inherited layout/compositing effects applied to ancestors
outside the owned root (for example a body transform/opacity); this boundary is
not a claim that arbitrary CSS is fully isolated. Inaccessible stylesheets emit
a baseline diagnostic since their derived custom names cannot be inspected.

Per-scope cleanup is idempotent and reference-counted. Closing the final scope
restores native selectors; manager dispose disconnects document observers and
restores all remaining scopes and rules. No stylesheet stays globally disabled
while an export waits or renders; no foreground/window/screenshot APIs are
changed. Independent export must register in its construction path before
native setData/render, rather than only when its later M1 renderer starts.

## Verification receipt — 2026-10-09

- `npm test -- tests/canvas-snippets.test.ts`: **41 passed**, including a real
  local Chromium **140.0.7339.16** CSSOM run through already installed Python
  Playwright. No download, network, CDP, screenshot, native window or device
  interaction. This is browser/synthetic evidence, not native Obsidian input.
- Browser checks: ordinary note computed values unchanged; equal-selector
  specificity and pseudo-elements; media/supports, nesting and nested
  declarations; important rules and native/plugin control styling; default and
  selective policies on two roots; arbitrary/derived custom variables, font,
  indent, word-spacing and SVG fill; independent export registration; refcounts;
  exact selector restoration on allow/reload/replacement/unload; newer inline
  ownership; previously disabled sheets; thrown-baseline finally; no recursive
  observer refresh; another document's own window; explicit unsupported/unknown
  shape diagnostics. Unit checks also cover strict reader order, duplicates,
  throwing getters, escaped selector syntax and pure unsupported rule planning.
- `npm run check`: passed with parent integration present.
- `npx eslint src/canvas-snippets.ts`: passed, **zero errors/warnings**, no inline
  disables. The mandatory trace above preceded these fixes.
- `npm run build`, `npm run mcp:build`, `npm run schema:check`: passed.
- `git diff --check`: passed for tracked worktree changes. Owned newly-created
  files also receive a separate no-index whitespace check before handoff.
- Whole-repository `npm test` snapshot during concurrent parent integration:
  **3074 passed, 4 failed, 1 skipped** across 161 files. Two main-platform failures
  are missing `syncCanvasSnippetScopes` in its method-extraction synthetic host;
  source-renderer and m1-controls-dock retain pre-SVG export labels. Parent was
  informed; this task does not edit those owned files. Focused module checks pass.

Parent supplied live readonly Obsidian Windows 1.14.4 confirmation of native
customCss keys/arrays/Set on 2026-10-09. Physical tablet MiroCanvasTest 1.13.8 was
prepared by the parent. Actual snippet interaction, native lifecycle/exports,
real input and device acceptance receipts remain **pending** until the parent
records them; readonly native shape is not a replacement for those checks.
README/README.ru/CHANGELOG and user-facing explanations are parent-owned.

## Native tablet opt-in investigation, recorded before any fix — 2026-10-09

Parent receipt `tools/obsidian_cdp/.out/card-appearance/native-R52Y808PDJB.json`
reports MiroCanvasTest/Obsidian 1.13.8 on the physical tablet: default policy
normal-note indent 47px vs Canvas indent 0px/custom-variable reset passed, but
allowing the snippet retained indent 0px and selectors showed repeated guards.
This is parent-supplied native evidence, not input performed by this task.
Parent then identified a possible double-enable deployment race (`setEnable`
plus `enablePlugin`), producing multiple plugin instances/managers. A fresh
native instance reproduction is pending; do not call this a confirmed single
manager restore defect. Parent owns harness/reload/device actions.

Final parent follow-up: a fresh single-plugin native instance passes default
exclusion and individual opt-in on Windows and SM-X736B. Repeated guards were
caused by the double-enable test deployment, not by a single manager. Parent
also added document detach on window close and registration before independent
setData, with disposal coverage. Native note/setting input methods, saved SVG,
PDF/PPTX regressions and remaining cases are in card-appearance-checks.md.

Affected actions are repeated css-change/refresh, native snippet text reload,
opt-in/out, and unload. Before implementation changes, mandatory regressions
are repeated real-browser CSSOM refresh cycles with exactly one guard per
subject, opt-in exact original selectors/inherited font+indent+variables,
opt-out restoration, replacement text reload and cleanup; maintain native
fresh-instance evidence separately. Add this actual CSSOM regression now;
change restore logic only if a single-manager defect is reproduced.

### Superseding native evidence and repeated-refresh regression

Parent subsequently confirmed a **fresh single-instance SM-X736B /
MiroCanvasTest / Obsidian 1.13.8 run passes default snippet exclusion, important
Markdown rules, inherited custom variables and individual snippet opt-in**.
The earlier repeated guards were orphaned managers created by the test
harness's double-enable deployment race; no single-manager product restore
failure was reproduced. The receipt path was overwritten by the later run:
its current `checks` records note/card 47px/0px blocked and 47px/47px allowed
with custom variable 31px restored. Overall receipt `passed:false` concerns the
later SVG `svg:css-transform` refusal, owned by another task, not snippet opt-in.
No product restoration workaround was added for that discarded deployment.
Native teardown/reload, export ordering, popouts and trusted physical input
checks beyond this supplied native runtime receipt remain pending with parent.

The owned Chromium regression now uses the strict native-shaped reader
(`snippets` order, enabled Set in reverse insertion order, actual style elements)
and runs 25 repeated refresh/opt-in/opt-out cycles plus 10 more after native text
reload. Each blocked selector has exactly one guard; every opt-in restores exact
CSSOM originals and inherited font/indent/variables; opt-out re-isolates both
roots and ordinary-note values stay unchanged. **41 focused tests passed**,
including those real CSSOM cycles. Final targeted lint remains **zero warnings
and zero errors**, with no suppressions and no product changes after the native
race report. API is unchanged and ready for the parent's final native build.
