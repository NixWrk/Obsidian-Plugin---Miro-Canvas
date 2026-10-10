# Presentation enhancement checks

## Trace before implementation (2026-10-07)

Ownership: only content-breakpoints.ts, custom-board-styles.ts, palette-editor.ts,
the three matching tests and this document. Parent owns wiring, settings,
locales, schema, metadata writers, session and styles.css. No dependency installs.

- DESIGN.md: native controls, host theme variables, inherited typography,
  separate 40/44px touch targets and one selection outline.
- canvas-adapter.ts: public-facing viewport.zoom is linear; tZoom is log2.
- source-renderer.ts: native/plugin cards have nodeEl/containerEl/contentEl;
  native lines may be detached offscreen and have visible, casing and hit paths.
  Interaction paths must retain their geometry and hit width.
- connector-layer.ts: independent connectors replace groups on style/selection
  changes; visible canvas-display-path differs from canvas-interaction-path.
- native-ui-visibility.ts: restore only owned temporary state on disposal.
- appearance.ts: PaletteColor includes id/label/color/source and unknown fields;
  board settings.palette is supported. Add/remove actions exist; full ordered
  palette edits need an atomic settings.palette snapshot through the parent
  appearance/metadata writer. Empty palette normalizes to defaults, so disallow
  deleting the final color. Preserve ids and unknown fields on edits/reorder.
- dom-elements.ts: owning-document factories work in Obsidian and plain hosts.
- No private native content-hidden field is assumed: the adapter supplies
  native hidden-class names when verified by the parent against Obsidian.

## Mandatory checks before integration

| User action | Unit/synthetic check | Real Windows | Physical Android |
| --- | --- | --- | --- |
| Zoom across each native/plugin content threshold | Inclusive boundary; invalid scales/config fail; unchanged bands do not enumerate cards | Pending | Pending |
| Select/edit/focus a hidden card, then leave it | Protected content revealed; existing hidden attributes/classes restored on unload; original native hidden state retained | Pending | Pending |
| Pan offscreen/reinsert/rebuild a card | Explicit DOM identity invalidation; stale/detached patches released | Pending | Pending |
| Apply/replace/remove named style on a board | Native nodes, line casing/visible paths and independent connectors; no other board affected; restore original declarations | Pending | Pending |
| Select a styled line, replace its SVG group | New path identity reapplied; casing retained; hit width and path geometry untouched | Pending | Pending |
| Enter invalid/hostile CSS | Reject entire definition with indexed error; selectors/global rules/imports/URL/escape obfuscation rejected; no silent CSSOM drops | Pending | Pending |
| Add/edit/delete/reorder/reset named hex colors | Immutable callback snapshots, persistence failure keeps state, stable ids/unknown fields, capacity/duplicate/last-color validation | Pending | Pending |
| Keyboard and touch palette editing | Native labels/buttons/form submission; invalid fields remain editable; reorder retains focus; disabled controls during save | Pending | Pending |
| Close board/unload/reopen | Controllers restore temporary DOM state and release references/listeners; settings/assignment writes owned by parent | Pending | Pending |

Real checks require integrated parent wiring in an isolated vault, both host
schemes, Russian labels, non-default zoom, undo/reopen, desktop mouse/keyboard,
and Android ADB input separately from CDP/physical stylus. They remain pending.

## Source lint trace before fixes

The first owned-source lint run reports only two control-regex warnings. CSS
control rejection participates in saving named definitions; palette control
rejection participates in labels and IDs supplied to persistence. Replace these
literal control-character regexes with explicit character-code checks / the
existing control-characters helper. Mandatory regression: NUL/control labels
and CSS values fail, tab/newline declaration whitespace still works. Real
Windows/Android entry and save checks remain pending.

## Parent integration contracts

### ContentBreakpoints

Construct one controller per board root. `update(ContentBreakpointSnapshot)`
uses linear `viewport.zoom`, not native tZoom. Thresholds contain text, file,
link and plugin; zero leaves ordinary native hiding alone. Content is visible
at or above its threshold; selected/editing/focused cards remain visible below.
Pass only content elements, with their card shells. The controller never hides
the shell/selection/handles and never writes board data.

Keep boardIdentity stable until board replacement; change targetsIdentity on
card mount/unmount/content replacement and native hidden-state changes; change
interactionIdentity when selection or editing changes. Supply verified native
content-hidden shell class names in nativeHiddenClasses. No private API name is
assumed. The controller also handles focusin/focusout within its root. Unchanged
threshold values/bands/identities do not call the targets factory. Unload,
detach invalidation and disabling restore original inline visibility priority,
hidden attribute value and removed native classes. Parent must invalidate after
native runtime rendering when it changes hiding. Call dispose on board close.

### CustomBoardStyles

Definitions are `{id, name, declarations}` in parent global settings. Assignment
input is an itemId-to-ordered-styleIds map, adapted from
`miroCanvas.localOverrides[itemId].customStyles` after upstream schema extension.
Do not persist assignments through unknown-field bypasses before that extension.
Later assigned definitions win repeated declarations. Empty styles are valid;
malformed/unsafe/unsupported definitions produce indexed diagnostic reason codes
(syntax, unsafe, unsupported), with no partially applied declaration block.

Construct per board root; the default localCssSupport uses its owning window's
CSS.supports plus a detached CSSStyleDeclaration to detect parser drops. An
injected CssSupport is for controlled tests/hosts. Reject selectors, global rules,
imports, comments, escapes, priorities, URL/image/paint/expression functions,
network schemes and indirect resource values via var/attr. Safe theme variables
are accepted for typography, color, borders and other non-resource properties;
use background-color instead of background shorthand when using theme variables.

Pass card face/content elements and visible SVG paths/labels explicitly. For
selected native edges/independent connectors supply a separate casing element
and its native widthPadding. The casing retains its accent; numeric widths are
padded directly, em/calc/variable widths resolve from the first visible element
once, and percentage widths use calc. Do not include interaction paths or
defs/marker glyphs: the controller filters them and never writes native path
attributes or hit geometry. User-supplied declarations retain normal CSS effects.
Arrowhead glyph styling remains the existing renderer's responsibility.

Call update only after definitions, assignments, render/DOM identity or selection
change, after the source/appearance renderer; never on camera frames. Only root
descendants are patched. An update releases old patches even if detached; supply
replacement targets on reattachment/rebuilt SVG groups. Unload releases every
patch and preserves newer host declarations. Parent owns a single native history
transaction for assignment/settings actions and refreshes after undo/redo.

### PaletteEditor / PaletteEditorModel

Construct `(owningDocument, boardPalette, defaultPalette, labels, host)` and append
element inside the parent's native modal/panel with its gesture ownership.
Palette snapshots use existing PaletteColor entries and settings.palette.
Unknown entry fields survive editing/reordering; IDs remain stable. Hex #rgb,
#rgba, #rrggbb and #rrggbbaa normalize to six/eight digits. Names have 1..256
characters, without ASCII controls. Duplicate colors/IDs, capacity beyond 128,
invalid input and deleting the last entry are rejected. An empty palette would
be replaced by defaults by the existing appearance model, so it is not emitted.

`host.onChange(nextPalette, {operation, actions})` must persist the full ordered
snapshot atomically through the existing appearance/metadata writer, merging
settings.palette while preserving other settings, unknown fields and miroSource.
Return false or reject to report saveFailed and retain old state/form text.
Existing appearance add/remove actions are supplied for add/delete/edit; they
alone do not represent reorder/reset, nor preserve the edited entry's position.
The full snapshot is authoritative for every operation. No new action IDs or
schema fields are invented. Optional createId must return a unique safe stable
ID. Updates are serialized; fields/buttons disable during save. replace supports
undo/reopen refresh only outside an in-flight save. dispose releases listeners.

### Exact locale fields and style hooks

Parent injects PaletteEditorLabels from words() when building the UI; add matching
English/Russian fields under its chosen locale group:

- ariaLabel, name, hex, add, save, cancel, edit, delete, moveUp, moveDown, reset,
  saving, saved.
- errors.invalidName, errors.invalidHex, errors.duplicate, errors.capacity,
  errors.lastColor, errors.missing, errors.busy, errors.saveFailed.

Names/hex values are board content. CSS diagnostics are maintainer codes; parent
must localize any error UI it adds. Threshold/style settings UI labels also
belong to parent locales. These modules add no locale-table keys themselves.

CSS hooks: `.miro-canvas-palette-editor`, `__list`, `__row`, `__swatch`, `__label`,
`__form`, `__field`, `__button`, `__status` (each suffix follows the full prefix).
Use native/inherited font and host --background-primary/secondary, --text-normal,
--text-muted, --background-modifier-border/hover, --interactive-accent and radius
variables; wrap rows/form at narrow widths and keep long Russian labels readable.
Swatches receive only validated background-color inline; give them a host border
and preserve text name/hex as the accessible color cue. Keep error/status visible,
focus-visible outlined and disabled state clear. Set button padding through
--miro-canvas-button-padding and `padding: var(--miro-canvas-button-padding)`;
use separate 40px desktop / 44px touch targets. Any display rule must preserve
the cancel button's [hidden] state. No cosmetic motion, extra node outlines,
global selectors, new palette or !important is needed. Content thresholds use
reversible inline visibility and native class restoration, with no new CSS hooks.

## Verification evidence

- npm test: 139 suites, 2331 passed / 1 skipped at the recorded full-suite run.
- npm run check: passed after concurrent integration agent corrected its own
  frontmatter-link type and this task corrected mock callback types.
- Owned-source ESLint: zero errors/warnings after the recorded lint trace/fixes.
- npm run schema:check: pinned schema matched e76466d at the recorded run.
- Production plugin build and MCP build options: passed with write:false,
  preserving shared main.js/mcp/dist. No dependencies installed.
- Focused in-memory Edge DOM smoke: CSSOM invalid property/value rejection,
  shorthand/priority restoration after detach, native hidden class/attribute
  threshold restore, form submission/persistence/status/edit-focus/Escape cleanup;
  zero network requests. This is synthetic DOM evidence, not real Obsidian input.
- Repository Edge default, --interactions and --controls smoke passed.
- python -m pytest -q tools/obsidian_oracle/tests: 33 passed.
- Real Windows vault and physical Android: pending parent integration; no
  physical device/app-version or real mouse/ADB input evidence claimed.
- Final focused tests after casing/control refinements: 3 suites / 66 passed;
  final TypeScript and owned-source lint passed with no diagnostics.

## Named style editor follow-up: trace before source (2026-10-07)

Ownership for this bounded follow-up: new src/custom-style-editor.ts and
tests/custom-style-editor.test.ts; append this document only. Delivered modules
and their tests, shared settings/locales/styles/session/main/metadata stay untouched.

Trace: CustomBoardStyle is the existing id/name/declarations shape;
parseLocalCss returns all indexed syntax/unsafe/unsupported diagnostics and rejects
the entire declaration block; localCssSupport validates in the owning document.
The existing palette editor demonstrates owning-document factories, native form
controls, event isolation, asynchronous atomic snapshots and injected labels.
DESIGN.md requires native settings/dialog appearance, host variables, visible
focus and separate touch targets. Parent owns global settings.customStyles,
assignments, writers/session refresh and scoped CSS; the editor applies no CSS
definition to itself or to a board.

Mandatory checks: add/edit preserve safe stable IDs and exact existing names;
delete/reorder deliver full ordered immutable snapshots; invalid/unsafe CSS
reports every indexed reason visibly and never invokes persistence; rejected/
throwing saves retain old definitions and form input; pending saves serialize
actions and block replace/cancel; keyboard/touch form input and error focus remain
usable; empty definitions and deleting the final definition are permitted; existing
invalid CSS remains editable/removable; disposal releases listeners and suppresses
late UI updates. Test both pure model and native-form DOM behavior. Real Windows
Obsidian dialog/settings input and physical Android ADB checks remain pending
parent wiring, with device/app versions and actual input recorded separately.

### CustomStyleEditor follow-up integration contract

Import CustomStyleEditor and CustomStyleEditorLabels from custom-style-editor.ts.
Construct `new CustomStyleEditor(owningDocument, settings.customStyles, labels,
{ onChange, createId? }, supports?)` and append `.element` inside the parent's
existing native settings/dialog container (outside any enclosing form). The
default support predicate is localCssSupport(owningDocument); only tests/minimal
hosts should inject an alternative. CustomStyleEditorModel is the pure model:
`new CustomStyleEditorModel(definitions, host, supports)`, with definitions/busy
getters, asynchronous apply(operation), replace(definitions) and dispose().

Operations: add(name/declarations), edit(id/name/declarations), delete(id),
move(id/direction -1 or 1). Add/edit parse the complete declaration block with the
delivered parser before invoking onChange. Empty declarations and an empty list
are valid. Exact existing names, IDs, declaration text, order and unknown own
definition fields survive snapshots; edits keep ID and position. Display names
may repeat; IDs must be unique nonempty opaque strings of at most 256 characters,
without ASCII controls or reserved object keys __proto__/constructor/prototype.
Names on add/edit must contain visible text, at most 256 characters, no ASCII
controls; whitespace is preserved rather than silently normalizing names.
The optional createId factory must produce a safe unique ID. Default generated
IDs use custom-style-N and skip collisions. IDs never appear in CSS selectors.

Reserved ID checks also reject whitespace surrounding reserved object keys.
If a minimal/test host's injected support predicate throws, declarations fail
closed with localized unsupported diagnostics, rather than losing form input.

`onChange(fullOrderedDefinitions)` receives a frozen array of frozen entry copies
and must atomically persist global settings.customStyles, preserving unknown
definition fields. Returning void/true accepts; false/rejection/throw keeps the
old snapshot and submitted form input. One in-flight save disables controls and
blocks replace/cancel/reorder. Parent must finish persistence before resolving
the callback; a replace attempted during the callback returns false. Board
assignments, deletion reconciliation, history/writer/session refresh remain
parent responsibilities; this component never applies user CSS or changes a
board. Initial stored CSS is not silently dropped/revalidated away: it remains
available for repair/deletion even if the current browser no longer supports it.
Delete/reorder preserve unchanged entries, including stored CSS needing repair.

replace refreshes after parent undo/reopen and clears the old draft/feedback only
when idle; dispose removes the root/listeners and suppresses late UI updates.
Textarea Enter remains a newline, form submit saves, buttons retain native
Enter/Space/Tab behavior, Escape cancels an idle edit. Pointer/key/click bubbling
stays inside the component; parent still owns native dialog capture/gesture scope.
Invalid names focus their field; invalid CSS focuses its textarea and exposes
every 1-based indexed localized reason in a visible list linked by aria-describedby.
There are no custom editor keystrokes, drag-only reorder, CSS previews or styling
of unrelated Obsidian controls.

Exact CustomStyleEditorLabels keys to add equally in English and Russian under
the parent's chosen group:

- ariaLabel, name, declarations, declarationHelp, add, save, cancel, edit, delete,
  moveUp, moveDown, empty, saving, saved.
- errors.invalidName, errors.invalidId, errors.duplicateId, errors.invalidCss,
  errors.missing, errors.busy, errors.saveFailed.
- cssReasons.syntax, cssReasons.unsafe, cssReasons.unsupported.
- declarationError(index, reason): localized formatter including the 1-based
  declaration number and the already localized reason. No maintainer exception
  or raw browser parser text is shown to the person.

declarationHelp should explain declaration-only CSS (for example font-family,
border, color), no selectors/global rules/URL/import, and that the entire style
must validate before saving. Use the existing parser's contract for details;
this editor adds no alternate CSS sanitizer or shared strings.

Exact CSS hooks: `.miro-canvas-custom-style-editor` plus full-prefix suffixes
__list, __form, __field, __declarations, __help, __row, __name, __button, __empty,
__status, __errors. Parent CSS must scope every rule to that component, inherit
native UI font/control appearance, use host theme variables, wrap rows at narrow
widths and allow the textarea/form to shrink inside settings/dialog width. Keep
help/errors/status visible, focus-visible outlined, buttons separately reachable
at 40px desktop/44px touch; button padding uses --miro-canvas-button-padding.
Any display rule must preserve __button[hidden] for Cancel. Existing Obsidian
controls provide the baseline appearance; no inline styles or user definitions
are applied by this editor, no new aesthetic or global form rules are needed.

### Native follow-up checklist (not yet verified)

| Check in integrated native settings/dialog | Windows Obsidian | Physical Android |
| --- | --- | --- |
| Add/edit valid CSS, stable ID/name after reload and full ordered settings persistence | Pending | Pending |
| Unsupported/unsafe/multiple declarations show localized numbered errors and focus; form input survives | Pending | Pending |
| Save false/throw keeps input; slow save disables controls and cancel; retry works | Pending | Pending |
| Native Tab/Enter/Space, multiline textarea, Escape, delete last entry, repeated reorder | Pending | Pending |
| Light/dark host theme, English/Russian, narrow dialog/rotation and keyboard above fields | Pending | Pending |
| Real touch targets/tablet padding, no board/tool gestures leaking, no definition applied to editor | Pending | Pending |
| Close/reopen during save, listeners disposed, assignments/selected lines refreshed by parent | Pending | Pending |

Record actual Windows mouse/keyboard input and Android ADB input with each device
model/app version separately from browser/CDP synthesis or physical stylus input.

### Follow-up verification evidence

- New editor focused tests: first run 32 passed; final expanded count recorded below.
- npm run check and new-editor ESLint passed without diagnostics at the first run.
- In-memory Edge bundle/native browser controls: CSSOM rejects unsupported values,
  numbered syntax/unsafe/unsupported errors all visible, failed-save input and
  existing ID/name preserved, retry succeeds, textarea Enter keeps newline,
  Space submits, touch taps reorder/delete all, Escape cancels, empty state and
  disposal work. Markup-like names remain text, unrelated element style unchanged,
  editor has zero inline-style elements; zero network requests. This is browser
  synthetic evidence, not native Obsidian or physical-device input.
- Full npm test run exited 1: 2414 passed, 1 skipped, 9 failed in 2 suites.
  Eight canvas-authoring tests fail locked-dependent transaction rejection and
  history rollback; one canvas-outgoing-links test fails with an undefined native
  method receiver during disposal. These files are outside follow-up ownership;
  no shared implementation/test was changed to conceal failures. The custom-style
  editor suite passed in that full run. Parent/shared owners must resolve them.
- git diff --check exited 0; explicit new-file whitespace checks passed (untracked
  files are not covered by git diff --check). Native Windows/Android gates above
  remain pending parent integration.
- Final follow-up focused suite: 35 passed; owned editor ESLint: zero diagnostics.
  Isolated strict TypeScript check for src/custom-style-editor.ts and its test
  (including imported dependencies and Obsidian ambient types) exited 0. The
  latest full npm run check exited 1 at other-owned src/board-card-links.ts:187
  with TS2367 (signal.aborted comparison after awaiting the loader); that file
  was left untouched. The earlier full TypeScript run had passed before this
  concurrent module was added/changed. No full-green claim is made for the
  current integration snapshot.

## Native geometry restriction: trace before extension (2026-10-07)

The supplied integration concern authorizes extending custom-board-styles.ts,
its test and custom-style-editor.ts/test. Preserve parent's restoreBeforeRender
method and ContentTarget.content SVG union. Do not edit session/settings/locales
or styles. Trace: session currently targets the outer native shell and content;
source-renderer.ts instead routes typography to content and border paint to the
single native canvas-node-container face (or source SVG shape). Native runtime
and anchoring geometry own shell movement, bounds, selection and line paths.
CSS transform/position/dimension/gesture declarations bypass those contracts.

Mandatory regressions: reject those properties, their prefixed/logical/shorthand
and animation/transition/layout aliases, SVG d/x/y geometry and host variable
writes; report parsed property plus structured unsafe ownership restriction;
preserve supported visual typography/borders/colors/stroke-width/opacity and safe
theme variable reads. Reject the entire style, without partial paint or save.
Editor displays rejected property using existing labels only. Verify parent's
restoreBeforeRender survives and restores/reapplies new native baseline. Native
Windows/Android attached-edge/selection checks remain pending with parent target
split (shell for ownership, face for visual paint, content for typography).

### Exact property-channel API for parent (supersedes all-elements targeting)

Exports: CustomStyleElement = HTMLElement | SVGElement; CustomStyleChannel =
"face" | "content" | "paint" | "opacity"; customStyleChannel(property) returns
that channel. CustomStyleTarget keeps id/shell/casing and now accepts:

```ts
channels?: {
  face?: readonly (HTMLElement | SVGElement)[];
  content?: readonly (HTMLElement | SVGElement)[];
  paint?: readonly SVGElement[];
  opacity?: HTMLElement | SVGElement;
}
elements?: readonly (HTMLElement | SVGElement)[]; // legacy fallback only
```

Explicit channels take precedence over elements. Face receives borders,
backgrounds and other local surface effects; content receives color and
font/text/word/letter/line typography (including text-shadow/-webkit-text-fill-color).
Paint receives stroke/fill families and SVG paint-order/rendering; opacity
receives only opacity on ONE parent-designated ancestor. Every channel deduplicates
elements and suppresses nested recipients of the same declaration; the controller
groups declarations per element and patches once. SVG paint recipients must be
visible primitive paths/shapes/text; g/svg ancestors, interaction paths, defs,
markers and explicit casing are excluded. Casing retains accent/alpha and receives
only the padded stroke-width, with existing widthPadding semantics.

Recommended native node mapping: shell = nodeEl (ownership only); face = native
containerEl / direct .canvas-node-container; content = contentEl (text styling
inherits below it); opacity = the common ancestor for face/content/source paint,
usually nodeEl. Do not pass nodeEl as a face or content recipient: native
.canvas-node shell paint is also rejected defensively. Do not send all declarations
to both containerEl and contentEl. Content must not receive borders/backgrounds/
opacity. Native card borders paint ONCE on the existing face, with no extra
outer-shell border or separate visible node outline.

For plugin SVG shapes, use existing visible silhouette paths in paint, text/label
roots in content, and one shared opacity ancestor. Do not add a rectangular
DOM border/background behind an SVG silhouette whose native face was already
suppressed by source-renderer. For native edges/independent connectors, supply
visible paths in paint, their label roots in content, one content/paint opacity
ancestor and the native selection casing separately; leave hit paths/marker
definitions out. If face/content contains existing explicit inline typography,
parent chooses the intended text root/leaf for base-style overrides; preserve
inline rich-text spans deliberately rather than stamping onto every descendant.

Legacy elements remain compatible but no longer broadcast each declaration:
face/content choose the first non-SVG candidate; paint chooses visible SVG
primitives; opacity chooses shell once. Parent should use explicit channels to
avoid ambiguous face/content selection. Unload/detach restoration and parent's
restoreBeforeRender remain; restore before source/native rendering, then update
with new target identities/baselines. ContentTarget.content SVG union is untouched.

Parser errors retain reason syntax/unsafe/unsupported, with OPTIONAL property
and restriction ("geometry" or "gesture") fields. Geometry/gesture blocks use
unsafe, never a new reason enum or required label key. The editor passes the
localized reason plus `(property)` through the existing declarationError formatter.
Typography, borders (including logical border widths), colors, stroke-width,
stroke/fill-opacity and opacity remain valid. Resource-capable background/fill/
stroke allow references to conventional host color variables; other unresolved
resource variables/attr remain rejected. CSS custom-property writes are rejected
because they can override host geometry/gesture variables indirectly; safe
theme-variable READS in visual properties remain valid. Geometry/layout/motion/
dimensions/logical/prefixed aliases, SVG coordinates/d, visibility, clipping/masks,
content replacement, user interaction controls and animation/transition mechanisms
are forbidden regardless of value, including "none"/"unset" resets.

Mandatory new checks: opacity once ancestor (no child multiplication), border/
background only face, text style content inheritance, SVG paint only visible
paths, unchanged casing accent with padded width and untouched hit geometry;
refusal of mixed visual/geometry styles produces no partial DOM/persistence
changes; old locale label types still compile. Native Windows/Android drag,
resize/rotation/marquee with styled selected cards/lines remains pending parent
channels and real input. These source/unit changes do not claim those native gates.

### Geometry/channel completion evidence

- All four presentation suites passed: 166 tests (parser/controller/editor,
  thresholds and palette). New geometry/gesture negatives cover vendor/logical
  aliases and variable writes; channel tests cover parent restoreBeforeRender,
  a renderer's changed baseline, one opacity ancestor, filtered nested/foreign
  faces, casing accent/width and intact interaction paths. Existing locale reason
  keys compile; no new required editor labels were added.
- Owned parser/controller/editor ESLint passed with zero diagnostics. Isolated
  strict TypeScript for those sources and tests (including dependencies) passed.
- In-memory Edge DOM check passed: face-only border, text descendant inherits
  content typography/color, child computed opacity remains 1 while ancestor is
  .5, native card rect and native path d unchanged, visible SVG width 4px/casing
  width 10/hit width 24, conventional host paint variables accepted, parent
  restoreBeforeRender restores native styles and reapply captures a new renderer
  baseline. Touch editor submit names transform and pointer-events using existing
  localized formatter; invalid block does not save and valid visual block saves.
  Zero network requests. This is synthetic browser evidence, not native input.
- Full npm run check at the integration snapshot failed in parent-owned session
  (missing CommentThread type) and main (missing openSelectionTransfer method).
  No errors were reported in the owned API/parser/editor; those parent files
  were not edited here.
- Full npm test snapshot exited 1: 2588 passed / 1 skipped / 20 failed. Failures
  are 17 synthetic session/appearance tests at parent's classList.toggle marking
  hook and 3 main-platform tests at parent's enhancementModals cleanup fixture.
  No parser/channel/editor tests failed. Parent must reconcile those shared
  implementation/fixture contracts; this task does not broaden file ownership.
- git diff --check exited 0. Parent's restoreBeforeRender method remains present;
  ContentTarget.content remains HTMLElement | SVGElement and its source was
  untouched by this extension. Real Windows/Android gates remain pending.

## Native history fence: trace before tests (2026-10-07)

Ownership: native-history-fence.ts (parent's initial scaffold is present and
already imported) and new tests/native-history-fence.test.ts; append this trace.
No canvas-authoring/session/main or existing authoring tests are edited. Keep
the parent's API: captureNativeHistory(runtime) -> NativeHistoryFence | undefined,
flush() -> boolean, restore(requireOwnedState = false) -> boolean.

Evidence: docs/canvas-enhancement-plan.md records read-only Windows Obsidian
1.14.4 inspection of history.data/current/max and requestPushHistory debounce
run/cancel. Native push appends and truncates redo. Existing array/historyIndex
fixtures model synchronous saves. CanvasAuthoring.applyDocument captures only
its new feature-plan boundary; the established connected-card creation path is
unchanged. Parent commits/verifies graph data separately and calls flush after
requestSave(true); synchronous failure uses restore(), asynchronous compensation
uses restore(true) only after graph CAS. Fence must not invent a user history.

Mandatory tests: validate inspected shape before invoking debounce; drain prior
pending native step BEFORE capturing baseline; flush the own queued step exactly
once; restore full prior redo branch after append/throw (including capped native
history); refuse restore(true) after owner/array/cursor/entries/max changes, without
cancelling another action; retain entry identities and original method receivers;
reject unsupported shapes/read-only arrays/accessor-backed history/index/max/
queue methods without invoking getters; cancel own pending work before immediate
rollback, fail closed on run/cancel failures or state replacement during those
calls. Permit synchronous array fixtures, preserve parent APIs, and rerun the
122 existing authoring tests as a regression for original connected creation's
debounce grouping. No timers/method wrappers are installed by the helper.

Real Windows/Android pending: consecutive connected-card creation remains one
native compound action; feature operation following an unflushed edit forms its
own undo step; failure after append restores redo, async save failure cannot erase
a later action, native undo/redo and bounded-history eviction. Record real native
input/device/app versions separately from pure/synthetic evidence.

### History follow-up ownership clarification and focused receipt

The user clarified that the parent owns/hardens native-history-fence.ts; this
worker owns only its new test file and this appended trace. No source edit was
applied. Automatic approval review rejected an attempted source replacement as
parent-owned history/undo work; no workaround/retry was performed. Subsequent
user instruction confirms tests-only scope, so no source approval is requested.

Corrected two test-fixture direct calls to use requestPushHistory.run's original
receiver. Replacement-array tests now require strict refusal, including a new
array created during the callback, rather than assuming an uninspected native
replacement is supported. Array-hook tests allow either safe support or refusal
before draining; they require zero getter invocations in both cases.

Focused run (npm test -- tests/native-history-fence.test.ts
tests/canvas-authoring.test.ts): exit 1, fence 40 passed / 3 failed; existing
authoring 122 passed. Remaining meaningful failures in the parent snapshot:

1. Replaced requestPushHistory queue after own flush is not checked; restore(true)
   cancels the captured queue and rewinds history instead of refusing ownership.
2. A repeated flush drains a later pending action and replaces the own receipt.
   It must not flush another native action; true/false no-op outcomes are both
   permitted by the test so it does not prescribe internal API state machinery.
3. Array.prototype.splice.call still reads rows.constructor for species creation.
   A hostile constructor getter executes during restore. Intrinsic splice avoids
   an overridden splice method but does not avoid the constructor/species hook.

New test file isolated strict TypeScript check passed. Its expected failures
are retained for parent repair, not skipped/softened. Original connected creation
source and grouping were untouched, and its existing authoring regressions pass.
Native Windows/Android input gates remain pending; no full suite was run for this
bounded history test follow-up while the parent is changing integration code.

## Registered custom-paint observer: trace before extension (2026-10-07)

Ownership remains custom-board-styles.ts, its tests and this appended trace.
Read source: SourceRenderer.connectorFollow and ConnectorLayer.redrawCourse
update d only and preserve inline paint; SourceRenderer.redrawLines restores
line patches then drawLines/applyConnector/renderConnectorGeometry, whose
patchStyle sets differing stroke/fill/width on the existing DOM. Thus stable DOM
and settled-board paint identity can legitimately skip controller update while
route redraw overwrites custom paint. No source-writer change is required here.

API stays constructor(root, supports?), update(snapshot), restoreBeforeRender(),
dispose(), with unchanged channels/parser/editor labels. The controller owns one
owning-window MutationObserver watching style attributes ONLY on registered
patched elements, not the whole board, attributes d/classes, or per-frame polling.
The callback deduplicates actual recorded targets, examines only their owned
properties, captures latest native values/priorities/removals then reasserts only
overwritten properties. Own writes are identified/drained so they cannot feed
back. Unchanged owned values must cause no setter call. Initial equal-valued
custom declarations still need registration for a subsequent native overwrite.

Mandatory tests: overwrites during route movement preserve custom SVG paint and
native d/hit paths; latest native baselines restore on unload/update, including
removals/priorities/shorthand longhands; unrelated styles and unchanged/geometry
records do no custom work; unaffected registered cards are not visited; own
records do not loop; pending external records before release are captured without
reassertion; replace/restore-before-render/unload clear observer registrations and
references; detached elements are not repainted outside their owning board.
Use real Edge CSSOM/MutationObserver to validate batching and shorthand behavior,
and focused unit tests. Real Windows/Android drag/rotation/resize and native
undo/redo remain parent integration gates; no full suite while parent changes.

### Registered observer final receipt (2026-10-08)

- Focused style/controller/editor suites: 144 passed, exit 0. Isolated strict
  TypeScript for custom-board-styles.ts and its tests: exit 0. Source/test
  implementation was already present on resume; no additional source edit was
  made during this final verification. Owned-source lint passed before resume.
- Focused Edge CSSOM/MutationObserver check passed with the bundle kept in memory:
  actual registered style targets only; source-like stroke/width changes on the
  same SVG nodes reassert only those custom properties; no reads of an unaffected
  registered card; d/hit geometry intact; no feedback callbacks on later ticks;
  casing width reasserted without changing accent; latest native values/removals/
  priorities and border/font shorthand longhands retained for unload; pending
  external writes captured before release without custom repaint; disconnect
  leaves later native style writes unchanged. Zero network requests.
- API remains constructor(root, supports?), update(snapshot), restoreBeforeRender(),
  dispose(), and existing property channels. Observer registration is automatic
  on update; parent must still update on normal target/DOM identity changes and
  call restoreBeforeRender before its deliberate full appearance rebuild.
  Route-only changes require no parent per-frame custom-style pass. The callback
  deduplicates recorded targets, inspects only their owned receipt properties and
  drains self-write records; no whole-board observer, global CSS or polling.
- On unload/restore, queued native mutations are consumed without reassertion,
  registrations disconnect, and property receipts/references clear. Equal initial
  custom/native values are registered without redundant initial setters, so a
  later source overwrite is still protected. Detached targets are not repainted
  outside their owning root and are released by normal parent identity lifecycle.
- Parent reports the history follow-up is now green (43 fence + 122 authoring
  tests) and actual Windows/tablet native Undo/Redo plus its unit regression have
  passed. This supersedes the historical failed-fence receipt above; those parent
  source and integration files were left untouched. Those native reports are
  parent evidence, separate from this observer's synthetic Edge/unit evidence.
- Native-app custom paint during drag/resize/rotation remains part of the parent's
  integration checks; this receipt does not assert a new physical-input run.
  No full suite, new task, installation, commit or push was performed on resume.

## Independent export integration: trace before corrections (2026-10-08)

Ownership for this audit/correction: export-related helpers/tests and this trace;
parent owns native acceptance, main and session wiring. No screenshots, native
window/foreground interaction, installs or commits. Impeccable context loaded
once against export-canvas.ts; incumbent DESIGN.md remains authority. Detector
will run once against final DOM/CSS UI files, without changing their appearance.

Trace: M1.runExport clones savedDocument, pins resolved displayTheme in that
snapshot, creates an unregistered native export Canvas, a rejecting metadata
writer and an independent M1CanvasSession with global settings. Session applies
customStyles by localOverrides assignment, board/global palette and collapsed
group projection. Parent camera/selection should never cross the export boundary.
createExportCanvas currently trusts a factory-returned view/canvas identity and
can disable saves/reparent/mark/setData/unload the active instance if private
construction aliases it. Add identity/DOM ownership refusal before side effects.

renderExportPages marks only its independent wrapper, sets tile camera log2
zoom, prepares the session then immediately starts the raster clone. Custom paint
MutationObserver reassertion is asynchronous, so yield a guarded microtask after
prepare before the rasterizer clones. Preserve styles and group-hidden visibility/
display plus complete basic SVG typography in prepareExportSvgs; ancestor CSS
outside a serialized SVG otherwise cannot hide collapsed connector primitives.

ExportPixels uses long-side/page-size scale (e.g. standard 2000/10000 = .2), so
interactive content thresholds can hide data in a large-page export. New helper
exportCanvasSettings retains settings but disables only the four content thresholds
and detaches style/palette values for export. Parent must consume it as the
independent session's settings argument; no m1 edit is performed here. Persisted
collapsed-group intent remains unchanged; snapshot/unknown fields/source evidence
and active board/camera must survive success/failure/cancellation.

Mandatory focused checks: source leaf/view/canvas/DOM alias refusal; snapshot
styles/palette/collapse flags preserved and independent native setData cannot
mutate caller snapshot; clone-specific computed hidden/typography styles and SVG
geometry do not mutate active DOM; tile preparation microtasks settle custom
paint before raster and respect Stop; source camera/selection/data/save methods
unchanged; independent disposal idempotent on success/failure. Native acceptance
and required session helper wiring remain parent responsibilities.

## Android enhancement modal keyboard: trace before scoped fix (2026-10-08)

Parent real-app evidence, SM-X736B / Obsidian 1.13.8: native --keyboard-height
is 400.94116px while innerHeight/visual viewport height remain 1204px. Native
modal bounds remain y=90..1114 (max-height 1024), palette inputs y=804 and 881;
keyboard begins at y=803. scrollIntoView cannot reveal the inputs because the
native scroll wrapper still uses the full viewport height. An initial tap also
changes IME geometry; parent is adding waits before subsequent real ADB input.

User authorized a narrow styles.css correction. Main.ts remains Godel-owned:
enhancementModal must mark Modal.containerEl with miro-canvas-enhancement-container
and modalEl with miro-canvas-enhancement-dialog. Mobile-only owned container
padding reserves the host keyboard height with border-box sizing; owned dialog
max-height deducts the same height and 32px from 100dvh. No native/global modal
selector, desktop sizing, editor DOM/control changes or foreground/screenshot
verification here. Final Impeccable detector includes these CSS rules once.

Mandatory native acceptance (parent): wait for --keyboard-height to settle after
real ADB tap; type into name and hex fields with the 24-row palette; measure
focused field/form actions and modal bottom above keyboard top, verify scrolling
can reach final rows/actions, switch fields, dismiss IME, reopen both palette and
style dialogs, check unmarked native modal unchanged and desktop sizing unchanged.
Actual post-fix Android coordinates remain pending until parent reports them.

## Export and keyboard verification receipt (2026-10-08)

- Export helpers now refuse source leaf/view/canvas/DOM aliases before source
  reparenting, save suppression, marking, setData or unloading. Also fail closed
  when native save methods cannot be replaced; setData receives detached plain
  JSON, retaining style assignments, palette, group-collapse intent, unknown
  fields and miroSource. Independent getData continues returning the caller's
  export snapshot; no writer is added to the active board.
- exportCanvasSettings(MiroCanvasSettings): MiroCanvasSettings returns a new
  settings root with all four content*Threshold values zero and detached ordered
  customStyles/permanentPalette; other preferences retain existing values.
  Parent explicitly authorized the only m1 edits after coordination: import this
  helper and pass settings: exportCanvasSettings(this.settings) to the independent
  M1CanvasSession in runExport. Active interactive thresholds are unchanged.
- Each tile yields an abort-aware microtask after session prepare before raster
  clone so registered custom-paint observers settle. Clone-only SVG serialization
  retains hidden/display/typography/paint, honors collapsed-group ancestor intent
  even if a descendant explicitly becomes visible, and preserves own opacity
  once at each ancestor rather than multiplying it onto children. SVG viewport
  expansion never modifies the source SVG.
- Focused Vitest: 107 tests passed in 8 files: export-canvas, browser-export,
  board-export, export-pages, export-files, export-worker, export-page-controls,
  m1-session-export. The real runExport caller/independent constructor is exercised
  with UI/raster/packing boundaries stubbed; success and raster failure preserve
  source camera/selection/document, styles during settings edits, pinned display
  theme, collapsed state and background disposal. This is unit/synthetic evidence,
  not real native PDF/PPTX acceptance or real raster screenshots.
- Focused TypeScript passes including the new caller test and imported session;
  ESLint passes for export-canvas/board-export with task-specific cache;
  check-css passes (0 !important, 0 :has); scoped git diff --check passes. Initial
  lint cache sandbox denial and initial focused type errors were not counted as
  passes; the corrected checks returned exit 0. No full suite or build was run
  while other agents own active work.
- Godel's main.ts enhancementModal classes are present. Mobile rules reserve
  host --keyboard-height only on the owned container/dialog. Headless Edge
  synthetic native-modal layout at 753x1204 with keyboard=400.94116: owned modal
  y=16..787.047, Name y=571..615, Hex y=645..689 after focus/type/scroll; keyboard
  begins y=803.059. Scroll range remains available (clientHeight707,
  scrollHeight1386, scrollTop679). Unmarked native modal and desktop marked modal
  both remain y=90..1114. Script: tools/obsidian_cdp/.out/export-modal-layout-check.cjs.
  No foreground or screenshots; actual post-fix physical Android check remains
  parent-owned, pending its coordinate receipt.
- Impeccable detector ran exactly once against final palette/style/search/property/
  settings/toolbar/export DOM sources and styles.css. Exit 2 was preserved, not
  called a pass: 3 existing CSS warnings (connector-handle width/height animation,
  imported app-card accent stripe, comment-thread accent border) and 46 color
  advisories against the stale design sidecar. No findings on the new keyboard
  rules or scanned TypeScript UI files. Incumbent DESIGN.md/theme authority wins;
  no unrelated aesthetic change, ignores or sidecar repair was performed. Full
  report: tools/obsidian_cdp/.out/presentation-impeccable-detect.json. Context
  reported .impeccable/design.json older than DESIGN.md; document refresh is an
  optional separate task, not performed as a side effect.
- No locale keys, global CSS rules, network calls, dependency installs, native
  input, screenshots, foreground interaction, commit or push added by this work.

### Parent acceptance and compiler-contract correction (2026-10-08)

Parent reported actual Android palette acceptance passed with the keyboard CSS;
this supersedes the pending palette acceptance above. Device/app context remains
the parent's SM-X736B / Obsidian 1.13.8 run; post-fix coordinates were not supplied
here, so the numeric headless coordinates above remain synthetic evidence only.
Native independent export/background acceptance remains pending after rebuild.

Parent full npm check found TS4114 in browser-export.test.ts: missing override
keyword in the Element subclass, and parent applied that keyword fix. The earlier
focused tsc invocation omitted noImplicitOverride and therefore did not match
the repository's complete compiler contract. Corrected focused tsc now passes
(exit 0) with strict, noImplicitOverride, isolatedModules, esModuleInterop,
resolveJsonModule, forceConsistentCasingInFileNames and the same target/module/
moduleResolution/lib/skipLibCheck options; Obsidian global declarations explicitly
included for the bounded module graph. No competing edit to the parent's test
fix, new full suite/build, detector rerun or native input performed here.

## Hidden independent export: trace before bounded frame correction (2026-10-08)

Parent native Windows hidden test instance, CDP 9346: exportJobs=1,
Rendering pages 0 of 4, independent .canvas-node count=0. Native RAF is paused
in the hidden profile; backgroundThrottling=false in earlier 0.2.10 checks is
not a product guarantee. renderExportPages currently waits forever for owner-
window RAF after its 120ms settle pause, despite the export wrapper being owned.
No foreground/window-settings change or active-Canvas frame pumping is allowed.

Add abort-aware bounded timer fallback to the frame wait, cancel both handles
and detach listeners on completion/Stop, and preserve renderer errors. Verify
the private independent Canvas render/virtualize path from native function bodies
before driving it manually; only its verified instance may be advanced. Parent
was asked for that readonly source evidence; no CDP mutation from this agent.

Mandatory regressions: RAF never fires but export proceeds by bounded timer;
RAF first clears fallback; Stop while pending cancels both handles and restores
independent camera; late RAF cannot trigger another raster; private manual paint
is scoped to independent runtime and materializes offscreen native nodes for each
tile without touching source camera/selection/global RAF. Native hidden-window
PDF/PPTX and empty/nonempty independent DOM acceptance remains parent-owned.

Parent supplied the narrow native scheduling contract: requestFrame uses only
this.canvasEl.win.requestAnimationFrame and stores frameWin; cancelFrame uses
that host's cancelAnimationFrame. Therefore the independent-only correction may
install a reversible own win descriptor on the verified native canvasEl with a
16ms timer-backed frame bridge. Never replace global/window RAF or a shared DOM
getter. Validate original frame-host methods and descriptor override support,
preserve delegated receivers, refuse unsupported construction, stop recursive
native frames and clear every outstanding timer before restoring the descriptor
on disposal. This runs the actual native frame callback, which invokes native
virtualization/painting, rather than declaring a blank raster successful. Parent
owns aborting the already-running old job and native verification after rebuild.

### Hidden-frame correction verification (2026-10-08)

Readonly native source receipt: tools/obsidian_cdp/.out/feature-expansion/
native-frame-methods.json, supplied by parent from hidden Windows instance.
requestFrame schedules through canvasEl.win, and its callback updates scale and
canvas transform, calls virtualize, then renders dirty attached nodes/edges.
virtualize while screenshotting attaches every native node/edge (no ten-node
incremental limit); it requests another frame after attachment. cancelFrame
uses the saved frameWin for both native frame and pointer-frame cancellation.
The correction drives this complete native callback rather than invoking only
virtualize, which would omit geometry/style rendering.

createExportCanvas now requires a verified independent canvasEl descendant and
native requestFrame/cancelFrame, with its frame host equal to the owning window.
It installs only an own reversible win descriptor with a 16ms timer-backed RAF
bridge before setData/onResize. It delegates other host getters/methods with the
original receiver and retains constructor identity; writes through the bridge
are refused. It cancels any previously queued native frame, clears all pending
recursive timers and restores the exact original own descriptor (or inherited
getter) on construction failure/disposal. A native callback error stops queued
paint and checkExportCanvasFrame(canvas) throws it before raster cloning. This
helper is consumed internally by board-export; no new parent/session API wiring.

Capture's post-settle RAF wait now has a 150ms owner-window timer fallback,
clears RAF/timer handles and abort listeners after success/Stop, and ignores late
RAF callbacks. Timers depend on the renderer event loop running; this does not
claim to wake a completely suspended renderer or change Electron throttling.

Verification: 118 focused export tests passed in the same 8 files. Added tests
cover never-fired RAF/first-RAF/Stop/late-callback outcomes, native-shaped queued
callback node materialization and successive tile-transform alignment while
global RAF is suspended, independent frame cancellation, original host receiver/
descriptor restoration, queued recursion disposal, nonconfigurable/foreign/
missing host-method refusal, failed construction cleanup and native paint errors.
The frame fixtures are synthetic implementations of the inspected native
scheduling contract, not a new native Obsidian run. Focused tsc with repository
compiler flags including noImplicitOverride passes; helper ESLint passes with
--max-warnings 0. Parent was notified ready for rebuild and native hidden PDF/
PPTX output/DOM/working-view invariant acceptance. No CDP mutation, global RAF
replacement, foreground/window-setting change, m1/CSS edit, detector rerun,
full suite, install, commit or push performed for this correction.

### Native output pass and readonly Markdown content audit (2026-10-08)

Parent reports independent PDF/PPTX export passed in hidden Windows and physical
tablet: approximately 68k/89k PDF and 80k/100k PPTX, 200/225 baseline samples,
unchanged working camera/selection/file and worker cleanup. Receipts:
tools/obsidian_cdp/.out/feature-expansion/export-Windows.json and export-SM-X736B.json.
These prove completion/isolation/cleanup; output byte size alone does not prove
that Markdown card text was visible at raster clone time. Parent is augmenting
the harness with background DOM content snapshots. No screenshots/foreground
interaction or CDP mutation from this agent.

Readonly native cache inspection found a separate Markdown scheduler. Cache:
J:/NIX/WRK/Code/Obsidian-Plugin---Miro-Canvas/tools/obsidian_cdp/.out/
l20-foundation-settings/native-1.14.4-app.js. Its requestFrame identifiers/body
match the parent's native-frame-methods.json. Native text node Ree at character
3387755 calls inherited render, creates Bee(this), child.set(text), child.load().
Bee derives Markdown child E0 (2623974): set delegates to previewMode.set; load
shows preview, without an explicit synchronous initial Markdown render. Preview
C0 (2622350) delegates to renderer.set; renderer.set (2001984) queues render.
queueRender (2005022) uses SC(onRender.bind(this),0). SC (852513) uses global
activeWindow.requestAnimationFrame for zero delay; positive delays use idle
callback with a timer fallback. The equivalent 1.13.7 scheduler Tv (697524)
also uses activeWindow RAF. Neither goes through owned canvasEl.win.

Renderer.onRender (2007208) is instance-local: requires previewEl.offsetParent
and positive offsetWidth, parses sections, renders/measures/progressively shows
them, runs postprocessors, and requeues for remaining work/async sections.
Thus the Canvas-only frame bridge cannot guarantee the child Markdown queue is
drained in a hidden window. This is a concrete source dependency, not yet a
native content-failure assertion. No implementation change made while parent
collects the actual content proof.

Parent's readonly native-text-methods.json contains initialize/render/attach
bodies, but nodeKeys have no child or contentEl and children is empty: that
sample is an unmaterialized runtime text node. Requested exact path after owned
background attach/render: node.child.previewMode.renderer. Required snapshots:
node initialized/isContentMounted, contentEl text/dimensions, renderer text/
lastText/parsing/queued.high, rendered/computed sections with their DOM text,
asyncSections and pending rendered callbacks; plus renderer set/queueRender/
onRender/onResize and previewMode set/onload bodies. Parent owns collecting those
native reads and deciding if scoped child queue draining is needed.

## Native Markdown content failure: trace before scoped advancement (2026-10-08)

Parent export-text-Windows.json proves TEXT FAIL: background has four native
nodes but card content joins to '|||'; expected Launch/Second/Outside text absent.
Prior byte/invariant passes remain valid only for output/isolation/cleanup.
New export-content-Windows.json captures materialized node a: text matches
renderer.text, initialized/mounted true, content empty, lastText null, parsing
false, queued true/high true, sections empty, async sections zero. Exact native
set/queueRender/onRender/onResize bodies match readonly source chain above. One
later sample contains Feature Reference Launch card/Second card/Outside after
parent disables throttling in the owned hidden test window; this confirms a
readiness race and does not authorize relying on test-window configuration.

Authorized correction: before each raster, advance only child.previewMode.renderer
instances belonging to nodes of the registered independent Canvas and whose
preview/content DOM belongs to its verified wrapper. Cancel only their owned
queued handles, use native onResize/onRender with original receiver, retain native
parsing/postprocessing/async work, and wait with bounded owner timers plus Stop.
Do not replace text with escaped/plain substitutes, global RAF, activeWindow,
source Canvas/Markdown instances or any source/save API. Reapply plugin styles
after native child work, before clone. Fail closed on unsupported or unready
nonempty text; empty legitimate Markdown and intentionally collapsed hidden
children must not be mistaken for blank-render failure.

Mandatory regressions: queued global RAF remains suspended but native-like
Markdown sections/text materialize before raster; multi-pass/progressive/async
completion; no per-frame full-board enumeration; Stop/timeout cleanup; foreign
preview/shared source renderer refusal before cancellation; unchanged ready
renderer is not re-rendered; errors/unsupported queue shapes block raster;
native parent DOM proof for PDF and PPTX after rebuild.

### Scoped Markdown correction verification (2026-10-08)

settleExportMarkdown(canvas, signal): Promise<void> is exported from export-canvas
and internally awaited by board-export before final session prepare/style
reapplication and raster. It acts only on createExportCanvas-registered runtimes
whose retained wrapper has the export marker. For child.previewMode.renderer or
child.renderer, validate node.canvas identity, native content/child/preview DOM
containment and the known native state/method boundary before canceling anything.
Field reads reject delegated accessors; native method lookup preserves prototype
methods without invoking getters. Unknown states/queues/nonempty missing children
fail closed. Collapsed intentionally hidden content is skipped; native Markdown
completion may legitimately render no visible text, so literal textContent is
not used as a substitute for parser/render completion.

Every observed owned SC queue is cancelled once, including queues present during
async parsing/postprocessing waits; native onResize/onRender receive the actual
renderer. No parser replacement or global frame patch. Ready requires matching
text/lastText, no parsing or asynchronous sections, all sections rendered, native
render-completion callbacks drained (rendered=null), and no queued callback.
Only pending targets are polled, with fair batches up to 32 and a 12ms budget
between native method calls; overall 5s/320-round bound. Native synchronous calls
cannot be preempted internally. Stop/dispose/failure clears poll/deadline timers
and owned queues; timeout/errors never return a successful blank raster.

136 focused export tests passed in 8 files (+18 readiness/boundary cases). They
cover suspended global RAF with native-shaped Markdown DOM text, direct file
renderer, completed empty Markdown, ready/collapsed idle behavior, progressive/async parsing/postprocessing,
fair batching, Stop/disposal/time bounds, foreign preview/accessor queue/missing
method/child refusal before any queue cancellation, original native exceptions,
and awaited text readiness before style prepare/raster with failure blocking
raster. These are focused synthetic/native-shaped boundary tests, not new native
content proof. Strict focused TypeScript with repository flags passes; helper
ESLint passes --max-warnings 0; scoped diff check passes. An accessor-queue
negative test initially exposed a missing descriptor guard and was fixed before
the green receipt; that initial failure was not counted as a pass.

Parent notified ready for rebuild and native background text proof under default
throttling for both output formats. Earlier native byte/isolation successes and
confirmed TEXT FAIL remain explicitly separate; post-fix native content status
is pending. No extra m1/CSS/main/locale edit, global/source API mutation, CDP
mutation, detector rerun, foreground/screenshot interaction or commit.

## Resolved native export-content proof — 2026-10-08

Docs-only receipt review: ignored
`tools/obsidian_cdp/.out/feature-expansion/export-text-final-Windows.json` and
`export-text-final-SM-X736B.json`, with parent's exported-content validation.
The earlier TEXT FAIL and valid-byte/isolation-only successes above remain in
the history. Their exact missing-text scenario is now resolved on Windows and
supported SM-X736B / Obsidian 1.13.8 under default background throttling.

Both receipts record two independent render jobs containing
`Feature Reference Launch card`, `Second card` and `Outside`, completed native
Markdown samples, PDF/PPTX outputs and `restored:true`. Windows sizes are
80,785 / 92,518 bytes; tablet 89,139 / 100,867 bytes. PDF `%PDF-` and PPTX ZIP
headers prove format creation, not text content alone. Parent reports the
actual exported content check passed; this docs review inspected render/output
receipts and did not independently OCR or open the artifacts. Both named export
workers terminated. No OS screen capture/foreground activation is part of export.

This resolves the recorded initial Markdown-readiness failure, not every export
combination. Stop/unload races, switched boards, empty/collapsed/large content,
custom style/theme combinations and physical background suspension remain
separate acceptance cases unless their own receipts establish them. The legacy
phone's 1.12.7 does not establish supported-version acceptance; refresh pending.

Artifact-name reconciliation: this checkout's export-content-Windows.json is
the earlier content receipt with its first background text sample `|||` and a
later full-text sample; it must not be cited as two-format text success alone.
No export-content-SM-X736B.json exists here at review time. The two final-text
filenames above are the inspected successful render/output artifacts. Parent's
actual exported-content verdict remains explicitly attributed, rather than
inventing check names or a passed flag (these JSONs have neither).
