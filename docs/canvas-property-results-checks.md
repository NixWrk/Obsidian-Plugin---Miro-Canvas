# Board property results in the native search pane

2026-10-07. Owns new `src/canvas-property-results.ts`, its test file, and this
document. Parent owns main/index/locales/CSS integration. Port 9346 belongs to
the parent's Windows fixture: source/shape inspection only, no UI mutation.

## Trace before code

The earlier property-search inspector correctly refuses queue/cachedRead/virtual
node projection. This supplement instead owns a separate DOM section in the
existing search pane. It never inserts native result rows, changes the native
matcher, counts, index caches, query fields, filetype, app or readers.

Readonly inspection on Obsidian 1.14.4 / authorized page
`98F918B3EB05B0F3485B734EFD26104D` confirmed:

- `view.containerEl` is the workspace-leaf-content DIV; `view.dom.el` is its
  direct search-result-container child. A separate owned sibling is possible.
- `view.startSearch` first stops/clears native search, creates/stores an NL
  `searchQuery`, then starts native iteration and result rendering. After native
  start returns, the sidecar can read `searchQuery.query`, `.caseSensitive` and
  `.matcher`, and confirm the input value matches that query. Old query fields
  after a caught parse error must not produce stale supplement rows.
- Native `stopSearch` stops the queue and clears search-info; `onunload` is an
  instance lifecycle method. Scoped own-property wrappers can preserve native
  receiver, arguments, return value and errors. Restoration is conditional on
  still owning the installed method, preserving another plugin's later hook.
- `view.dom.resultDomLookup` is a Map keyed by actual file objects. Use its
  `has(file)` for bounded, best-effort deduplication; never change it. Native result DOM mutations
  can update deduplication without rerunning a query or reading board files.
- CL tokenizes uppercase `OR`, `TRUE`, `FALSE`, `EMPTY`, and prefix `-`; AND and
  NOT words are ordinary content tokens in this build. Native conjunction is
  whitespace. Quotes support escaped characters. Inspection used installed
  source near character 1,462,257; offsets are evidence locators, not guards.

Supported first subset: positive conjunctions of tag/property predicates,
including grouped conjunctions. Literal property keys are exact; unquoted scalar
values use substring matching and quoted values exact scalar matching. These
are conservative subsets of native text/phrase matching. Property values walk
bounded plain JSON recursively. Native tag matching is case insensitive and
includes nested tags. Literal AND/NOT, OR, minus-negation, regex, comparisons,
mixed content/file/path/etc. operators and native typed TRUE/FALSE/EMPTY operands
are explicitly unsupported by the supplement. Native search still handles them.

The sidecar enumerates vault files, skips non-Canvas/ignored/unsupported files,
and reads ready index knowledge only. Actual board file links are shown; clicks
open the file with native modifiers and no offsets, fake cards or eState.
No cachedRead is called here. Scan/property/query/row budgets and generation
guards prevent stale or unbounded work; pane timers belong to its document
window. Metadata/vault/layout events refresh only the supplement. Parent can
call refresh after its index callback, and owns injected localized labels.

## Mandatory checks

Pure: supported/unsupported grammar, quotes/grouping, case, tags vs body tags,
JSON recursion/bounds/cycles/accessors, limits without false matches.
Pane: real DOM rows from indexed board properties, native original method/state/
rows/counts untouched, ignored files, index-not-ready refusal, no vault reads or
writes, click/middle-click/keyboard file navigation, dynamic dedup, stale query/
rename/delete/index refresh, cancellation, multiple panes, unload/dispose and
foreign-hook restoration. Plain/unsupported queries produce no supplement rows.

Parent wiring is present as of 2026-10-08; the parent reports native Windows
readiness. Independent app-input acceptance by this sidecar remains unverified.
Do not mutate the parent's native 9346 UI. Source inspection and unit DOM
fixtures are separate from actual sidebar/click/modifier/device evidence.

## Own-file lint trace before fixes

Delimiter scanning participates in quoted/property grammar; replace its
unnecessary regex escape with an equivalent delimiter string. Event-source
casts participate in metadata/vault/layout subscription; remove redundant casts
without changing receivers. The instance-wrapper closure participates in every
start/stop/unload call; use bound/lexical callbacks instead of aliasing this,
preserving native receiver, args, returns and throws. Mandatory checks: focused
grammar/DOM tests, targeted lint/typecheck, native delegation/foreign restoration,
event teardown and pending-batch cancellation. Shared lint documentation is
outside this sidecar's ownership; actual app-input evidence remains pending.

## Parent API and evidence

`new CanvasPropertyResults(app, index, options)`:

- `app` supplies normal workspace/vault/metadataCache APIs. The metadata cache
  must expose the inspected ignored/supported-file predicates. No content reader
  is wrapped or called by the supplement.
- `index` supplies `status` and `getKnowledge(path)`. Only ready, indexed Canvas
  root `knowledge.frontmatter` is used, which is the index's projection of board
  properties (including its documented import fallback). Aggregate body tags
  and per-card caches never provide board-property matches.
- `options.labels()` returns `{title, loading, empty, limited, count(number)}`
  in the current locale. All visible UI strings come from this callback; file
  paths are real vault data. Optional `registerEvent`, `registerCleanup` and
  `onDiagnostic` follow the other sidecars' parent-registration contracts.
- `start()` installs reversible own-instance startSearch/stopSearch/onunload
  wrappers after index/host probing. Normal native functions still run with
  their original receiver/arguments/return/errors. No native prototype, query,
  app, matcher, result row/count/cache or file object is changed.
- `refresh()` discovers/reprobes current search panes and refreshes only the
  supplement. Parent may call it in its existing onIndexed callback. Workspace
  layout, metadata changed/resolve/resolved and vault create/modify/rename/delete
  events also refresh it, debounced without running native queries.
- `dispose()` removes own sections, links, listeners, observers and window-owned
  timers. Original descriptors are restored only while the sidecar owns them;
  later foreign hooks remain. Retired pane wrapper chains cannot revive their
  old sections. Different search panes keep independent queries/generations.

Pure `parseCanvasPropertyQuery(query, caseSensitive?)` returns either
`{supported:false, reason}` or `{supported:true, query, caseSensitive, match}`.
`match(properties)` returns `{ok:true,matches}` or
`{ok:false,matches:false,reason}` for invalid/over-budget JSON. Unsupported or
empty queries produce no owned section or file scan. The supported subset and
conservative matching rules are specified above; no OR/NOT/mixed-content
support is claimed. Native global search still executes those queries normally.

Hard query bounds: 4,096 characters, 64 predicates and 24 grouping levels.
Property bounds: 256 root keys, 8,192 visited values, 24 levels and 131,072
scalar/root-key characters; accessors/cycles/non-JSON values fail without a
match. Reducible options cap vault enumeration at 100,000 files, matching
candidates at 512 and batches at 64. `debounceMs` defaults to 100 (0..500).
Truncated scans show the injected limit message, not a claim of complete results.
Deduplication prefers native rows for the same live TFile; late native DOM
mutations reconcile owned rows/count/message. It does not promise deduplication
when a future native renderer changes its map identity or mutation behavior.

Navigation uses actual `getAbstractFileByPath` identity and
`workspace.getLeaf(Keymap.isModEvent(event)).openFile(file)`. No node IDs,
property offsets, search eState or virtual cards are passed. Click, middle-click
and Enter stop propagation on the owned link to avoid native focused-row
activation; native links remain untouched.

Historical verification (2026-10-07): 45 new parser/DOM tests passed. Search-boundary, outgoing and
knowledge regressions passed too: 112 tests across four files, exit 0.
Targeted ESLint reports no warnings/errors, exit 0. Targeted ES2020/Obsidian
typechecking passed; that repository check reported only parent-owned
`src/m1-session.ts:4889` possibly-undefined errors (two diagnostics), exit 2.
All current native 9346 calls were source/shape reads with the window invisible
and unfocused. The supplement was **not installed or clicked** in that leased
fixture; independent Windows/Android app-input acceptance remains unverified.
Only the new module/test/doc were changed, with no commit or push.

Final focused verification (2026-10-08):
`npx vitest run tests/canvas-property-results.test.ts` passed all 45 tests in
one file, exit 0. Source reads confirmed main constructs the sidecar with
localized labels, starts it, refreshes it after indexing and disposes it.
Native Windows readiness is parent-reported evidence; this verification made
no native UI calls. No full suite or repository typecheck was rerun. Work stops
after this focused verification and report.

## Native query/pane retest — 2026-10-08

Parent's ignored `native-property-panes-Windows.json` first failed: no owned rows
within 1.3s, then a bounded 12s check also missed them; later pane generations
132/133 completed with two/three rows after roughly 30s. Window background
throttling was confirmed disabled for that investigation. These are failures
and delayed observations, not a completed native acceptance receipt.

Parent then found the harness could type into an older sidebar search input
while assertions inspected a new center search pane. Retest scopes input to
activeLeaf.view.containerEl and replaces its contents before the query. The
runtime query/probe were supported. Result click and outgoing destination proof
remain pending; no source defect is confirmed and no sidecar source was edited.

The pane-scoped retest also failed within 12s. Subsequent read-only CDP inspection
in the hidden/unfocused Windows fixture found index/sidecar both ready, the last
pane generation 135 completed with five genuine file rows and attached DOM.
This disproves an ongoing unsupported/index-not-ready state at inspection time,
but does not establish when that pane attached. Discovery currently listens only
to layout-change; inspected native workspace uses separate active-leaf/layout
event queues. Parent will capture pane membership, wrapper ownership and timer/
generation during the failed interval to distinguish delayed discovery from
event starvation. No frame queues, UI state or native methods were mutated.

Independent source review: metadata changed/resolve/resolved, vault events and
parent onIndexed refresh all call restart, which clears rows/generation and
resets a trailing debounce. A sustained event stream can theoretically postpone
a scan. The MutationObserver only deduplicates native rows; it does not restart
scanning. This route is not yet proved responsible for the native delay, so no
scheduler repair is justified by the receipt alone. If native evidence confirms
starvation, trace before implementation and test continuous event progress,
coalescing, stale query/case cancellation, rename/delete, ignored files and
unload/foreign-hook cleanup. Existing 45 unit/fake-DOM tests stay separate from
the parent's 2,963-pass/one-skip aggregate gate and native pane evidence.

## Typed-query boundary trace before repair — 2026-10-08

Read-only Windows native constructor inspection confirms
`o = Gl(view.startSearch.bind(view), 0)` is captured before the sidecar attaches.
The searchComponent changeCallback clears focus, calls dynamically dispatched
stopSearch, then calls o for nonempty input. Our stopSearch wrapper therefore
clears rows, while the captured original startSearch bypasses our after-start
hook. Source-only evidence establishes this missing path regardless of timing;
it is stronger than the earlier unproved event-starvation hypothesis.

Inspected Gl uses activeWindow.setTimeout, with run/cancel, not RAF. Native
startSearch assigns searchQuery then dynamically calls
`renderSearchInfo(query.matcher, view.searchInfoEl)` before queue iteration.
renderSearchInfo is a configurable inherited method that recursively renders
child matchers into other DOM containers. Wrap the instance method and publish
only after its successful root call, matching the actual query matcher and
searchInfoEl identities. Preserve native recursion, arguments, return/throws,
receiver, query and DOM. Unknown/missing method/root shapes fail closed.
No input callback replacement, captured closure modification, native queue
flush, prototype edit, fake search result or frame work is required.

Mandatory regression checks before implementation: captured pre-install bound
startSearch produces owned rows without external events; root-only recursion
does not restart for child matchers; caught parse failure/unsupported query
leaves no stale rows; direct starts remain correct; native return/throws and
borrowed receivers stay unchanged; query/case change cancels batches; missing
boundary fails closed; unload restores owned descriptor while preserving a
later foreign wrapper. Run focused parser/DOM tests, ES2020 typecheck and owned
source lint. Parent must rerun actual typed query, genuine file navigation and
outgoing click on Windows and supported tablet; source/unit proof is not native
acceptance. The earlier 12s failed receipts remain retained.

### Repair and focused verification

Implemented only in canvas-property-results.ts/test: guard the root info DOM
and configurable renderSearchInfo method, wrap that instance method, and
restart after a successful call whose matcher/container are the real native
query root. Child recursion never schedules a scan. Existing direct-start and
stop/unload behavior remains guarded; restoration preserves later foreign
wrappers. No native constructor, input callback, debounce, matcher or prototype
is rewritten. Parent owns build/deployment and real-input retest.

The captured-original-start regression failed with missing rows before repair.
That red run also caught the test's borrowed receiver missing the newly modeled
native info method; the fixture was corrected, not counted as a source defect.
After repair, all 48 focused tests pass (exit 0), owned source ESLint with
--no-cache --max-warnings 0 passes, and focused strict ES2020 source/test types
pass. Parent's earlier 2,963-test gate predates this repair and must be refreshed.
Native typed query, genuine row navigation and outgoing destination click remain
pending; no Android acceptance is inferred from these tests.

Authorized small-pane preparation, separate from read-only source inspection:
an isolated hidden/unfocused Windows search leaf with native state query was
created, inspected at 0/0.5/1/1.5s, then detached. It was unwrapped initially,
but attached by 0.5s with five rows at generation 1. This did not reproduce the
30s discovery delay and used no trusted typing, so it is not query acceptance.
It supports leaving the unproved scheduler/discovery hypothesis unchanged.

## Resolved Windows typed-query/navigation proof — 2026-10-08

Latest ignored `tools/obsidian_cdp/.out/feature-expansion/native-property-panes-Windows.json`
has `passed:true`, device Windows, input `trusted CDP renderer input; pane
preparation`. Parent's `check-canvas-property-panes.mjs` records all four checks:

1. Native typed property query shows a real Canvas file result.
2. Clicking that result opens the genuine board.
3. The native outgoing pane renders its property-only destination.
4. Clicking the outgoing row opens the actual note.

The guarded root renderSearchInfo hook resolves the captured-start input path.
The fixture is a board with no text/file cards and a root property reference;
the outgoing destination is Feature Reference. No fake text offsets, native
search results or cards were required. This is actual typed/click input evidence,
separate from the 48 focused parser/DOM tests and source inspection.

Earlier 1.3s/12s failures and diagnostic hypotheses remain above. After the
source repair, outgoing checker failures were traced to selecting an inactive
hidden pane via .find when several panes followed the same file. The corrected
checker selects the visible pane with matching v.file, then prepares native
onResize/scroller compute. That is labeled native layout preparation, not another
plugin source fix. This docs update performed no app input or source edit.

Still pending: corresponding supported-tablet typed query/result/outgoing
navigation, other supported conjunction/tag/case combinations, unsupported-query
noninterference, bounded large-vault/event-stream behavior, pane recreation and
unload. Parent will rerun full automated gates after Mill's group-chain source
repair; the earlier 2,963-pass aggregate is not the final post-repair receipt.

## Tablet keyboard reachability trace before repair — 2026-10-08

Parent's real tablet tap hit the keyboard, not the result: input y=152, result
y=950, viewport height=1204 and keyboard height about 400.941 put its top near
y=803. No result DOM event fired; this is placement, not a file-navigation
failure. The owned section currently follows the native flex-filling result
root, which pushes it below the visible area while the keyboard is open.

Insert only the owned section immediately before pane.native via
container.insertBefore(section, pane.native). Keep the native root, its
children, query/result state and listeners intact. Parent owns the scoped
.miro-canvas-property-results CSS: bounded max-height about 280px, overflow:auto
and flex:0 1 auto so both result areas retain space. Do not hide the keyboard
or change native flex rules to manufacture acceptance.

Mandatory checks before implementation: exact sibling order before the original
native root, untouched native children/state, one owned section after refresh,
native sibling order restored on stop/dispose, missing insertBefore fails
closed, and a fake insertBefore shim that moves an existing child and honors
reference identity/foreign-child rejection like DOM. Existing 48 parser/pane
tests plus the new placement regression must pass, with source lint and ES2020
types. Parent reruns Windows typed/click/outgoing and supported-tablet ADB taps
with the keyboard present; DOM tests alone do not establish physical reachability.

### Placement repair ready for native retest

Only canvas-property-results.ts/test/this register changed here. The section
uses insertBefore(section, pane.native); absent insertion support refuses the
pane before hooks install. The fake DOM now implements reference validation,
same-node no-op, existing-child movement and ancestor rejection. The new
regression verifies exact section/native sibling order, unchanged native
children, one section after refresh and original order after stop/dispose.

All 49 focused tests pass, source ESLint --no-cache --max-warnings 0 passes,
and focused strict ES2020 source/test typecheck passes (all exit 0). Parent
separately added scoped CSS after its remediation trace: flex:0 1 auto,
min-height:0, max-height:min(280px,35dvh), overflow:auto and token padding,
inheriting native colors. This worker did not edit styles or other source.

READY for parent build. Earlier Windows four-check PASS remains pre-placement
evidence, not acceptance of the changed layout. Parent will rerun Windows and
supported tablet, record result top/bottom against keyboard top, then use real
ADB click while the keyboard remains present. No keyboard dismissal or native
root styling is used to stage a pass; physical reachability remains pending.
## Post-placement native acceptance — 2026-10-08

After rebuild both native-property-panes-Windows.json and
native-property-panes-R52Y808PDJB.json pass all four checks: typed query,
genuine Canvas-result navigation, outgoing property destination and actual
note navigation. Windows input is trusted CDP in an invisible/unfocused owned
window. SM-X736B / Android16 / Obsidian1.13.8 uses real ADB taps, with CDP text
and native pane reveal/resize preparation. The result tap is y271 while the
keyboard remains 400.94116px high (top y803); the keyboard is not hidden to
manufacture a pass. Native search results retain their original root and rows.
Phone disconnected before final acceptance. Broader query/unload/large-vault
checks retain their separate unit/native status.
