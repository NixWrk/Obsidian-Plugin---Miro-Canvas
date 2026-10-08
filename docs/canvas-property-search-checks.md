# Native Canvas property-search boundary

2026-10-07 sidecar: owns only `src/canvas-property-search.ts`,
`tests/canvas-property-search.test.ts`, and this document. Native global
board-level `tag:` / `[property]` search is **not implemented or accepted**.
The inspected queue-only virtual-node approach has no verified safe boundary.
Parent main/session and existing index/renderer integrations remain untouched.

## Trace before code

Existing board knowledge projects `miroCanvas.properties` into transient
frontmatter metadata. Carson's earlier inspection in
`obsidian-integration-checks.md` identified a separate native matcher boundary:
Canvas text cards use node caches, while property-only queries do not read
Canvas content. Cache getters alone do not implement global board-property
search. No native root frontmatter alias is justified by these observations.

Read-only inspection here used the authorized renderer on port 9346, page
`98F918B3EB05B0F3485B734EFD26104D`, Obsidian 1.14.4. Every inspection verified
the Electron window was invisible and unfocused. The isolated vault was
`J:/NIX/WRK/Code/Obsidian-Plugin---Miro-Canvas/tools/obsidian_cdp/.out/l20-windows/vault`.
Only target inventory, instance descriptors/prototypes, and installed
`app://obsidian.md/app.js` source were read. No query, wrapper, index update,
file write, UI input, activation, screenshot or application launch occurred.

## Exact inspected contracts

- Search view own fields include `app`, `dom`, `searchQuery`, and `queue`.
  `startSearch` constructs an NL matcher, stores it in `searchQuery`, starts the
  queue with an onStop callback, then passes `app`, `requiredInputs`, the queue
  handle and the result callback to VL. That callback calls NL.match and native
  dom.addResult/removeResult.
- Queue own fields are `_loaded`, `_events`, `_children`, `queue`, `app`, `dom`.
  Prototype methods are onload/onunload, start/stop, onNonMarkdownFileChanged,
  onFileChanged and onFileDeleted. There is no observed request-local reader,
  matcher callback or result transformer slot. Queue start creates a GT handle,
  gets/sorts vault files, and enqueues them. Its optional callbacks are lifecycle
  callbacks, not content or matcher inputs.
- GT stores `items`, `promise`, `runnable`. Its generator yields file objects;
  add/remove/clear/notify/cancel manage iteration. It has no content reader.
- VL checks ignored/supported files, awaits the generator, and reads md/canvas
  via `app.vault.cachedRead(file)` only when `requiredInputs.content` is true.
  Neither the queue handle nor a caller token reaches cachedRead. VL does not
  consult a reader on the queue instance. The application was captured by
  startSearch before queue.start; replacing queue.app would not replace VL's
  reader. VL source was inspected near app.js character 1,472,320.
- NL.match parses Canvas JSON, considers its text nodes and uses
  `canvas.index.get(file).caches[node.id]`. Per-node results retain content
  spans under `canvas-<id>`, dropping property ranges. The final filename input
  has no cache, and the generic cache fallback is Markdown-only. NL was
  inspected near character 1,470,454.
- sL's property matcher uses cache.frontmatter and requires no content input.
  RL's tag matcher requires content and checks cached tags/frontmatter. sL/RL
  were inspected near characters 1,454,783 / 1,468,643.
- Native KW.renderContentMatches (near character 1,975,479) treats Canvas
  content specially: it parses text nodes and builds rows only for nonempty
  node content spans, setting the click state's `match.nodeId` to that node's
  ID. Property rows are in its non-Canvas branch. Native XW clicks open that
  result file with the mutated state. Ephemeral virtual IDs are absent from
  the real board and cannot provide verified card navigation.

Character offsets refer only to this installed build. They are evidence
locators, not implementation guards; no app source is rewritten or evaluated
to manufacture native matcher constructors.

## Why the proposed hook is refused

Forcing the newly created matcher's content request at queue.start can make
property-only queries read files, but it provides no isolated projection scope.
A global cachedRead wrapper while a generator is active could return projected
Canvas JSON to an editor, export, indexer or concurrent reader. Promise overlap
or a synchronous marker after yield does not identify VL's call.

A property virtual text node alone also loses property spans in NL and produces
no native property snippet. Giving it invented content spans would target a
node absent from the real board. Treating such a file shell as a successful
property result would be fake acceptance. Mixed/negative/OR queries also require
proof that normal card/filename results and query semantics remain unchanged.

Swapping an app/vault facade into the search view, replacing matchers/results,
or installing separate property rows could be a different integration design.
Those boundaries were not verified here; the queue shape alone does not justify
them. No broad app/reader replacement, filetype mutation, reserved root alias,
eval/Function code generation, prototype hook or function-source rewrite is used.

## Sidecar contract and checks

The module supplies a **read-only inspector**, not a search installer:
`inspectCanvasPropertySearchBoundary(view)` reports `supported: false`, a
diagnostic code, descriptor-only structural observations and unmet safety
requirements. Matching the inspected instance shape never means the feature is
enabled. Unknown/accessor/revoked/prototype-cycle hosts fail closed without
executing methods or getters. Results retain no native objects or methods.

Mandatory unit checks: observed idle/active queue shapes, property-only and
content requests left exact, existing methods/results/descriptors unchanged,
no vault/index/workspace method calls, frozen host inspection, malformed/accessor
and revoked hosts, prototype lookup bounds, and no automatic success for added
unverified reader-looking fields. These certify noninterference of the inspector,
not functioning native property search.

Real query acceptance remains **pending and unsupported**: tag/property-only,
combined/negative/OR/regex/case queries, normal card and Markdown results, native
click navigation, asynchronous concurrent reads, multiple panes, cancellation,
rename/edit/unload and supported Windows/Android versions. An isolated
request-local reader plus genuine board-level matcher/render/navigation contract
must first be verified. Do not count these read-only source observations or
inspector unit checks as passed native search tests.

## Recorded verification

- `npx vitest run tests/canvas-property-search.test.ts`: 21 tests passed, exit 0.
- `npx eslint src/canvas-property-search.ts --no-cache`: no warnings/errors,
  exit 0. Targeted ES2020/Obsidian typechecking of the module/tests passed,
  exit 0, after correcting only fixture field types.
- The inspector itself was bundled in memory (`write:false`) and invoked in a
  local CDP expression scope on the same authorized hidden renderer. It reported
  `native-search-boundary-unsupported`, `resemblesInspectedQueue:true`, idle
  query state, and exactly the six observed queue fields. Search app/query/queue/
  handle, queue start/stop, vault cachedRead and dom.addResult references all
  stayed identical. Visibility/focus remained false and the local bundle export
  did not leak onto window. This was descriptor reading only, not a query or
  installation, and does not constitute native search acceptance.
- New module/test/doc only; no main/session/index/renderer or native method
  mutation, no app/reader facade, no commit or push. A usable global-property
  search feature remains unsupported pending a different verified boundary.

## Separate supplement status — 2026-10-08

The unsafe reader/virtual-node boundary inspected here remains unsupported.
A separate CanvasPropertyResults file-result section now provides the bounded
positive-conjunction subset without changing native matcher/reader inputs.
The latest native-property-panes-Windows.json passes typed property query,
genuine Canvas result click, property-only outgoing destination and actual note
click after the root renderSearchInfo hook repair. See
[the supplement's trace and receipts](canvas-property-results-checks.md).
This does not make the inspector installable or Canvas root properties native
Markdown frontmatter. Tablet retest, additional query/lifecycle cases and
post-group-repair full gates remain pending. No source changed in this update.
