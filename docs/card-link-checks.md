# Card link and embed trace/checks

Recorded before source implementation on 2026-10-07. Owned files only:
src/board-card-links.ts, tests/board-card-links.test.ts and this document.
Parent owns main/session/locales/styles/shared indexes and native acceptance.

## Trace and native API evidence

Public obsidian.d.ts declares Workspace.openLinkText(linktext, sourcePath,
newLeaf?, openViewState?) and OpenViewState.eState/active/state/group. Its
MarkdownRenderer.render(app, Markdown, element, sourcePath, Component) and
MarkdownPostProcessorContext.addChild manage detached Markdown child lifetimes.

Read local Obsidian 1.14.4 app.js from the installed update ASAR, without starting
or focusing the app: CanvasView.setEphemeralState reads match.nodeId/content/
matches, selects the node and calls panIntoView. Empty matches skips text-scroll
highlighting. Native Workspace.openLinkText passes open state to its leaf, then
native openFile. The private embed registry exposes getEmbedCreator(file); normal
Markdown embeds create native file embeds from an app/container/sourcePath context.
Parent must gate any use of that private registry; this module only injects adapters.
This is static native-code evidence; no real-input acceptance is claimed.

The pinned schema stores miroCanvas.nodeRedirects[oldId] as {file,nodeId}, with
unknown fields retained. Encapsulation redirects can cross boards. getKnowledge
may supply redirects, but current JSON nodes/stat are needed to verify the final
card exists and its board was not modified/deleted during resolution.

## Plan and mandatory regression checks before implementation

- Parse only Canvas node destinations, preserve normal Markdown paths/headings,
  alias resolution/sourcePath/newLeaf/open state and method receiver. Wrap only
  valid .canvas node links; use native eState.match, no custom selection or leaf
  creation during rendering. Restore only the owned wrapper on unload.
- Bounded cached board reads: stat/mtime/size, single in-flight read per revision,
  malformed/oversized boards, cache entry/memory/read bounds, read failure,
  stale modification/deletion/invalidation/disposal and redirect loop/depth limit.
  Verify all redirect hops again before a link opens or rendered content commits.
- Postprocess only internal .canvas#node-* embed spans. Render actual text with
  MarkdownRenderer via injected adapter and file nodes with native embed adapter;
  include file subpaths and use the destination board as relative-link sourcePath.
  Groups get an explicit labeled readonly summary of contained cards, never an
  entire-board preview. Unsupported/link/drawing cards get labeled feedback.
- Keep original embeds restorable, bounded mounted renders, isolated staging
  containers, render generation/abort ownership, cleanup on refresh/detach/unload,
  late async renders, native renderer failures and recursive embed depth limits.
  Do not change the active page/leaf or create a Canvas view while rendering.
- Unit tests cover parsing, flags, open wrapper pass-through and receiver/options,
  cache/read sharing, redirects, stale boards, selected-card sourcePath/content,
  file embeds, groups, failures, generations and unload restoration.

## Required actual app checks (parent; pending)

Windows Obsidian 1.14.4: real click normal/card/redirect links with same/new pane;
select/pan and review/locked cards; no added history. In Markdown reading/live
preview, text links/fences/tables/embeds resolve relative to destination board,
file subpaths render, group summary is scoped, missing/unsupported cards show
localized feedback, and the active Markdown leaf/focus remains unchanged.
Modify/rename/delete boards and files; encapsulate a card and follow old links;
reload reading/preview/plugin; detach a page during reads/renders; verify recursion,
large boards and cache limits; inspect restoration and no duplicate child owners.
English/Russian, light/dark and narrow/touch layouts remain pending.
Android MiroCanvasTest physical device/app versions and ADB input checks pending;
record them separately from CDP and physical stylus evidence.

No network, external runtime modules, screenshots, foreground takeover, git or
shared-file edits are part of this task.

## Lint trace before fixes

The control-character validation warnings participate only in destination/id/path
parsing; preserve rejected external/control paths and encoded Unicode ID round trips.
The captured openLinkText method participates in ordinary links/card clicks and
unload restoration. It is intentionally called with the caller's original receiver;
retain receiver/argument/open-state/native match tests and later-wrapper/inherited
property restoration. Record public method capture explicitly via Reflect.get with
a callable check. No shared lint register is edited under this task's ownership.
The remaining Reflect.get inference warning is in that same captured-method path;
remove its redundant assertion and rerun receiver/options/restoration coverage.

## Parent API and integration contract

This module has no runtime Obsidian import, network/native external modules,
workspace leaf creation or focus operations. It uses injected adapters and the
existing owner-document element factory. main/session/index/locales/styles stay
parent-owned; no board is ever written or mutated.

### Destination and cached JSON resolution

- `canvasCardLink(path, nodeId): string | undefined` builds a vault path plus
  `#node-` and percent-encoded ID; path segments are encoded independently.
- `parseCanvasCardLink(linktext)` accepts native linktext, without wiki brackets
  or aliases, with exactly a `#node-...` destination. Empty paths can refer to the
  current Canvas. IDs support encoded punctuation/Unicode, up to 256 characters.
  Headings, blocks, other fragments, invalid encoding/control characters and
  external/traversal paths are ignored. Native Canvas node IDs are not renamed.
- `new BoardCardResolver({ resolvePath, stat, read })` is shared per plugin.
  `resolvePath(linkpath, sourcePath)` uses native getFirstLinkpathDest and returns
  a vault-relative path. It may resolve extensionless aliases to Canvas, but
  resolved Markdown destinations are ignored. Deleted explicit `.canvas` links
  remain intercepted and report missing-board, avoiding native file creation.
- `stat(path)` returns a current `{mtime,size}` copy or undefined; `read(path,
  signal)` returns the actual Canvas JSON string. Parent may use vault.cachedRead
  or a revision-checked existing board-JSON cache. Existing getKnowledge alone
  cannot supply selected card text/file/geometry: it need not be consulted because
  current bounded JSON supplies both cards and nodeRedirects authoritatively.
- `resolve(linktext, sourcePath, signal?)` returns ignored, error with a code, or
  resolved with `target` containing path/nodeId/node, the parsed final board,
  revision-only `chain`, and an invalidation epoch. `isCurrent(target)` rechecks
  existence/mtime/size for EVERY redirect hop and the epoch before publication.
- Redirects are exactly `miroCanvas.nodeRedirects[id] = { file, nodeId }` under
  schemaVersion 1. Redirect files are normalized vault-root Canvas paths (not
  relative aliases/URLs). Existing nodes take precedence; unknown redirect fields
  are preserved; inherited keys and unknown schema versions are not interpreted.
  Loops and chains beyond 16 redirects return explicit errors.
- `invalidate(path)` on modify/delete, both paths on rename, and after a guarded
  encapsulation write; then refresh live embeds. Any invalidation retires the
  resolution epoch conservatively, even when another board was changed. A same
  mtime write therefore cannot reuse an explicitly invalidated body.
- `dispose()` at plugin unload settles consumers, aborts adapter signals and
  clears cached bodies. Caller abort cancels its result only: a shared safe read
  may finish for other consumers/cache. Ignored aborts still occupy a read slot
  until settled; they cannot publish stale JSON.

Bounds: 4 MiB reported board bytes and actual JSON string length, 20,000 native
nodes, eight cached boards / 8 Mi characters, four active reads including retired
ignored-abort reads, 16 redirect hops, 8,192-character linktexts, 256-character IDs.
LRU eviction bounds retained serialized-body weight; Map/JSON object overhead is
additional, so this is not a claim of an exact JavaScript heap byte limit. Redirect
chains retain only revisions, not all their parsed board bodies. No I/O runs per
frame, card drag, zoom or selection preview. Oversized/malformed/unsupported boards
fail closed; parsed native nodes use text/file/link/group types and required native
coordinates/content. Unknown fields and miroSource remain available and unchanged.

### Reversible opener

`installCanvasCardLinkOpener(app.workspace, resolver, onError)` returns
`{ installed, dispose }`. Register dispose with the plugin. Translate error codes
with parent locale labels/Notice. Ordinary links forward the exact arguments,
receiver and state object. The wrapper never calls getLeaf/openFile itself. Valid
cards forward to the original openLinkText on the final board path with:

```ts
{
  ...openViewState,
  eState: {
    ...openViewState?.eState,
    match: { nodeId: resolvedId, content: rawTextOrEmpty, matches: [] },
  },
}
```

Native 1.14.4 then selects/pans. newLeaf/active/state/group remain the caller's.
Missing/invalid/stale targets show feedback rather than opening the entire board
or creating a missing board. Disposal suppresses pending opens, restores the exact
own-property descriptor or removes the temporary inherited-method override, and
never overwrites another plugin's later wrapper. A later wrapper retaining this
one gets a disposed pass-through, not an active resolver.

### Markdown postprocessor and native render bridge

`new BoardCardEmbeds(resolver, host)` takes injected CardEmbedLabels,
renderMarkdown, renderFile, optional suspendOriginal and onDiagnostic.

1. Register a Markdown postprocessor that calls
   `embeds.postprocess(element, context.sourcePath)`.
2. For every returned `CardEmbedHandle`, create a MarkdownRenderChild for its
   `handle.element`, register `handle.dispose()` on that child, and call
   `context.addChild(child)`. `handle.ready` is the initial render promise; await
   it if the parent's processor needs full initial completion. Subsequent
   `handle.refresh()` returns its own current generation promise.
3. `renderMarkdown(rawText, renderContext)` must create/register a fresh Component
   cleanup BEFORE awaiting `MarkdownRenderer.render(app, rawText,
   renderContext.container, renderContext.sourcePath, component)`. The container
   is detached staging; sourcePath is the FINAL destination board, including
   redirects. Preserve raw Markdown, code/tables and native relative link handling.
4. `renderFile(vaultPath, subpath, renderContext)` resolves a current TFile and uses
   a gated native embed creator for that file/subpath in the detached container.
   Register its unload cleanup before awaiting loading. Return false if unsupported,
   missing, unsafe, or if that renderer cannot honor the subpath; never substitute
   an entire Canvas preview for an unsupported card/subpath. Parent owns revision
   checks for the embedded FILE's own contents while native loading is pending.
5. Static 1.14.4 native evidence: `app.embedRegistry.getEmbedCreator(file)` returns
   a factory called with native embed context, TFile and subpath. This PRIVATE
   bridge must be feature-checked by the parent; context needs the app, supplied
   container/linktext/sourcePath/depth/state as that version expects. Attach/load
   only a native embed Component, never a workspace/active Canvas leaf. No private
   registry use is hardcoded here, and runtime suitability remains unverified.
6. Register a postprocessor order/lifecycle that claims the original node-embed
   span before the native full-board embed starts, or provide suspendOriginal
   to stop/unload an existing native owner. Its returned cleanup restores/recreates
   that owner after the original span is put back. Do not retain a live detached
   full-board renderer. Native reading/live-preview owner/order checks are pending.
7. Vault modify/rename/delete/encapsulation: invalidate resolver board bodies and
   call embeds.refresh() outside frame work. File-native embeds may update through
   their own lifetime; refresh them explicitly when needed. Call embeds.dispose()
   before resolver.dispose() on unload. Refresh the parent's Markdown rendering
   when required to recreate native owners after restoration.

Only `.internal-embed[src]` spans whose destinations resolve to Canvas node links
are replaced. Normal Markdown/file/full-board embeds remain untouched. Replacements
use a distinct root class, so native whole-board processors must not claim them.
Only a current generation and unchanged redirect chain can publish staging DOM.
Superseding/detaching/unloading aborts its signal and releases registered children;
late registrations clean themselves immediately. Nested card stages inherit depth,
ancestor keys and cleanup ownership; cycles and depth above five get feedback.
No renderer code changes the page's active leaf or invokes focus/select APIs.

Native open action in each committed card is an internal-link with the final card
href/data-href. Its label and loading/error/unsupported/group strings are injected.
The parent must provide translations for every CardLinkErrorCode:
missing-board, missing-card, invalid-board, too-large, read-failed, redirect-loop,
redirect-limit, stale, disposed, unsupported-card, render-failed, embed-limit,
recursion-limit. Kinds passed to unsupported include drawing, shape, link and file.
Group title/overflow are formatter callbacks; source card/group labels are content,
not locale strings. `card-embed-cleanup-failed` and `card-embed-suspend-failed` are English diagnostic
codes. Suspension failure displays render-failed and performs no board read/render.

Parent-owned CSS hooks: .miro-canvas-card-embed, __body and __open,
[data-card-state='loading'|'ready'|'unsupported'|'error'], [data-card-link] and native
internal-link. Use host theme/font variables, wrapping, keyboard focus cues and
read-only group summary styling. Do not add editable/focus-stealing Canvas nodes.

### Explicit rendering limits

- Text cards: actual selected Markdown, up to 256 Ki characters. Code/table/sticky
  and styled-shape TEXT renders as Markdown content, without reproducing Canvas
  geometry/fills/fonts/rotation. Empty locally styled shapes show unsupported
  feedback; ordinary empty text cards remain valid empty Markdown.
- File cards: native embed only, exact vault path/subpath (subpaths up to 4,096
  characters); supported file formats and their own file/resource limits depend
  on the gated parent bridge. Native Canvas-file node subpaths must be honored by
  the parent card-embed integration, or return false; no whole-board fallback.
- Groups: labeled read-only flat summary of fully geometrically contained native
  cards, including group/card labels, capped at 100 items with a localized remainder.
  No canvas layout, connectors/comment pins, background image or editable content.
- Locally authored drawings/lines and native web-link cards: explicit unsupported
  message plus Open card; no SVG drawing, web frame, external fetch or board image.
  Imported Miro drawing/vector-only projections are not reconstructed; parent must
  extend an adapter/renderer if those exact visual forms are required.
- Up to 32 admitted card renders at once. Extra matching embeds are lightweight
  error placeholders with no board read or native Markdown/file rendering. They
  retain page lifetime/restoration ownership, so their DOM/cleanup records scale
  with source-page embeds, not cached board bodies. After an admitted handle is
  disposed, a refresh can admit a former placeholder. These source-page DOM owners
  and native renderer allocations are not part of the serialized-cache budget.

## Verification status

Initial focused run: 23/25 passed; disposal-vs-stale precedence and recursive-test
completion failed, then were repaired. Expanded runs passed 25, 31 and 33 tests.
Final focused run passed on 2026-10-07: 36 tests, exit 0, 326 ms Vitest duration.
Includes intermediate-hop revision checks, deleted initial boards, failed native
suspension, text/subpath render bounds and noncyclic nested depth.
Targeted ES2020/Obsidian typecheck passed independently after all final refinements
(exit 0). The first implementation typecheck failed on async signal narrowing;
that failure was repaired and is not counted as a successful run.
Initial lint reported control-character/unbound-capture warnings; those were fixed.
The intermediate capture assertion produced one inference warning; final lint
passed with zero warnings/errors after removing it (exit 0). Command failures are preserved, not inferred from logs.

Native evidence is static code inspection of the local 1.14.4 update ASAR and
public API typings. Unit/fake DOM tests are not actual input/focus verification.
The actual Windows/Android gates above, full repository checks/build/other suites,
parent bridge/main/locale/style integration and documentation/changelog remain
parent-owned and pending. No shared files, git, screenshots or foreground work.


Final verification commands (separate exit results):

```text
npm test -- tests/board-card-links.test.ts
npx tsc --noEmit --target ES2020 --module ESNext --moduleResolution Bundler --lib ES2020,DOM --strict --noImplicitOverride --isolatedModules --esModuleInterop --skipLibCheck --types node,vitest/globals,obsidian src/board-card-links.ts tests/board-card-links.test.ts
npx eslint src/board-card-links.ts --no-cache
```

The three assigned files use CRLF and pass a direct trailing-whitespace/line-ending
check. No git diff/status/commit/push commands were run. Worktree shell writes and
test/lint commands used require_escalated as instructed; no empty log was counted
as successful evidence. All pending real-app/native bridge gates remain pending.

## Transfer publisher trace and required checks (before source)

New bounded task on 2026-10-07: own src/board-transfer-publisher.ts,
tests/board-transfer-publisher.test.ts and this document only. Parent owns the
encapsulation/text-rewrite planner and vault/native/main/session integration.

Trace: the pure encapsulation plan produces two documents, retaining IDs/source
provenance and redirects. Native source applyDocument has a checked history/CAS
boundary; rollbackLastFeatureDocument is synchronous and checks its recorded
after document before rollback. Native requestSave is not a durable-save promise,
so the publisher must await a parent-supplied save receipt and cannot infer success
from a scheduled save. Target creation/deletion must also be checked file operations.

Plan: injected source disk stat/read fingerprint check, callback-owned source
snapshot/CAS, exclusive unique target creation, one source apply, awaited source
save. Failed transactions compensate only against their own unchanged post-apply
snapshot and a safe rollback callback; delete only the exact newly created target
identity/content/revision. Edited or uncertain files remain. Results expose
applied/refused/recovered/partial and paths, with diagnostic codes, no UI strings.
Cancellation/disposal gates every new write; late async outcomes cannot cause a
new apply/rollback/delete/save. Do not delete a successful target on later Undo.

Mandatory pure checks: stale source stat/text/snapshot, unique create collision,
source changed while target is created, apply rejection/partial throwing callback,
save failure/rollback refusal/failure, source edited before compensation, edited or
recreated target, delete CAS refusal, create throws after creation with receipt,
abort/dispose before each phase and during outstanding mutation/read, single-flight
publisher ownership and successful native Undo retaining its target.

Parent real-app gates (pending): Windows 1.14.4 one native apply/history entry,
await real vault save, Undo/redo restores source while the target remains, reopened
target keeps source/unknown fields/IDs and redirects; edit/recreate target during
failure and verify it survives; source edit/rename/delete races; cancellation and
plugin unload. Android MiroCanvasTest real ADB/device/app evidence remains pending.

## Transfer publisher integration contract

`new BoardTransferPublisher<Snapshot>(adapter)` exposes only
`publish(request, signal?)` and `dispose()`. It registers no events or Undo hook.
One operation runs at a time; another call refuses with busy. Parent supplies the
validated encapsulation/text-rewrite plan, immutable detached snapshots and exact
Canvas serialization. The publisher never reads Canvas internals, writes metadata,
parses/reformats documents, chooses alternate names, edits a planner or opens UI.

Request fields: sourcePath, targetPath, sourceFingerprint `{stat,text}`,
sourceBefore, sourceAfter and targetText. Both paths must be normalized vault-root
`.canvas` paths, distinct even under NFC/case folding. The already chosen target
path must equal the planner's proxy/redirect/text-rewrite destination; a collision
refuses instead of selecting a new path without rebuilding that plan.

`TransferFileStat` contains identity, mtime, size and optional revision. identity
must be a stable file INSTANCE token (native TFile reference or an opaque creation
ID), never just its path. Deleted/recreated files must have a different token even
when their bytes/timestamp/size are identical. Fingerprints compare exact body,
identity, timestamp, size and revision; no hash collisions or guessed ownership.
Reported file sizes and strings are capped at 16 Mi units; paths at 4,096 characters.
One transaction retains only its request/receipts/read buffers; there is no cache,
background scan or per-frame I/O. Fingerprint stat fields are copied before awaits;
Snapshot values must be detached/immutable, never references to a mutable live doc.

Injected adapter methods, all with the current AbortSignal:

- stat/read: current vault lookup and exact text read. Native read callbacks may
  use cachedRead only if that cache is current for the checked revision.
- snapshotSource(path): current source snapshot, scoped to the correct view/file.
  sameSnapshot(left,right): structural/CAS comparison preserving unknown fields;
  include history/version identity as needed to prevent unrelated-action ABA.
- createTarget(path,text): exclusively create the EXACT unused planned path.
  Return created+stat, exists (no owned write), or failed with an optional created
  identity receipt. Catch a failure after known creation and return that receipt.
  A thrown/lost creation receipt is uncertain: the publisher retains any artifact
  instead of deleting a merely similar-looking file.
- applySource(path,next,expectedGuard): one checked native apply/history action.
  Guard is `{path,snapshot,fingerprint}`. Recheck file identity/version/body and
  live snapshot AT the CAS boundary, including path/view/locks/review/history
  capability gates. Return applied with verified actual snapshot+rollbackSafe,
  refused, or failed with an optional OWNED after-snapshot+rollbackSafe receipt.
  A refusal must not leave an owned committed step. The publisher applies once.
- awaitSourceSave(path,expectedSnapshot): await durable save of that exact native
  snapshot and return saved+fingerprint; a scheduled requestSave is insufficient.
  On failed/partially successful save, include a fingerprint only when certified
  as a version written by THIS operation for the expected snapshot. Never claim
  an unrelated current disk version as the owned save receipt. Native queued
  writes must be drained/cancelled safely by the parent; this callback is a save
  receipt boundary, not permission to overwrite an unrelated external change.
- rollbackSource(before,expectedGuard): only when the application receipt declares
  rollbackSafe AND disk/live snapshot remain unchanged. Atomically recheck that
  guard and the owned native history step, then restore before; return true only
  after verification. Use the parent's safe rollbackLastFeatureDocument boundary,
  not Undo or a raw unguarded import. Refuse if safe history compensation is
  unsupported or an unrelated edit/Undo/new history action intervened.
- deleteTarget(path,expectedFingerprint,sourceGuard): conditional deletion only.
  At the mutation boundary recheck exact created identity/version/content and
  the restored/unchanged source guard. Return false if any condition changed or
  a checked delete cannot be provided. Never substitute unconditional vault.delete
  after stale earlier reads, delete a recreated/edited target, or delete by path
  alone. This callback must provide the checked mutation contract; the module's
  prior reads cannot make an unsafe raw filesystem operation atomic.

Flow: verify source disk stat/read/stat plus snapshot; check target availability;
verify source again; exclusive create and verify the created target; verify source
again; one guarded apply; verify actual after snapshot; await certified durable
source save; verify source disk/runtime and target; final source disk/runtime
check. Successful publication returns applied, and later native Undo/dispose has
no publisher-owned target deletion. Undo during an unfinished transaction changes
its after-snapshot, so recovery refuses and keeps the target.

Failure recovery requires provable ownership. Before any source apply/refusal,
only an unchanged original source permits deleting the exact owned target. After
an apply/partial-apply receipt, recovery requires its exact current after-snapshot,
a safe rollback flag and unchanged known disk version (original, or certified
owned save version). Roll back once, verify before, await durable restored-source
save, verify both guards, then conditionally delete the target. Source changes,
unsafe/lost receipts, failed/refused restore, edited/recreated targets and uncertain
deletions retain the target and return partial. A missing target is already clean.
There is no retry loop, no guessed rollback, no unconditional orphan cleanup.

Result has status applied/refused/recovered/partial, sourcePath/targetPath, last
verified source state, target state and diagnostic code array. Refused means no
owned mutation was confirmed; recovered means safe source restoration/unchanged
source plus no retained target. Partial identifies a retained/uncertain artifact
or unverified source recovery. Paths and code tokens are data; all UI/localized
messages remain parent-owned. Diagnostic vocabulary is exported as
TransferPublishCode; exceptions themselves do not expose UI strings.

Cancellation/disposal gates every new write, including rollback, restored-source
save and deletion. A mutation already issued cannot be un-issued: its callback
must honor the signal at the actual mutation boundary; the publisher awaits its
receipt, then performs NO later write. Late created/applied artifacts are reported
partial and retained rather than cleaned up after cancellation. The single-flight
slot remains owned until callbacks settle, even if an adapter ignores abort; this
prevents an overlapping transaction while an old mutation's outcome is unknown.
No automatic write is scheduled by disposal or a later Undo.

Parent actual validation remains pending: native authoring/view/file/history CAS,
exclusive vault creation, true source-save completion, checked two-file delete,
ABA/edit/rename/delete races, queued save cancellation, one-step native Undo/redo,
physical Android and persistence/source-provenance checks recorded above.

### Transfer publisher final evidence

2026-10-07 focused tests: 51 passed, one file, exit 0 (255 ms Vitest duration).
Earlier focused runs passed 49 and 50; no failed run was counted as successful.
The independently reported targeted ES2020 typecheck passed (exit 0). Publisher
lint passed with zero warnings/errors (exit 0). Meaningful coverage includes exact
source stat/body/snapshot checks, changed source at apply CAS and final disk audit,
exclusive create races/lost receipts, partial apply, durable save receipts, owned
rollback/refusal/failure, edited/recreated/same-body-written targets, checked delete
refusal/races, native Undo retention, cancellation across eight phases with each
mutation's signal checked at callback entry, late disposal and single-flight.

```text
npm test -- tests/board-transfer-publisher.test.ts
npx tsc --noEmit --target ES2020 --module ESNext --moduleResolution Bundler --lib ES2020,DOM --strict --noImplicitOverride --isolatedModules --esModuleInterop --skipLibCheck --types node,vitest/globals,obsidian src/board-transfer-publisher.ts tests/board-transfer-publisher.test.ts
npx eslint src/board-transfer-publisher.ts --no-cache
```

The two new publisher files and this owned document pass direct trailing-whitespace
and CRLF checks. Tests/adapters are unit evidence, not native/vault CAS or durable
save evidence. Real Windows/Android, actual checked-delete/save/history adapters
and parent wiring remain pending. No planner/main/session/locale/style files,
generated bundles, git operations, network, screenshots or foreground work were
changed/performed by this task. Shell writes/checks used require_escalated.

## Native creator/mount boundary trace before the load lint fix

2026-10-07 installed Windows 1.14.4 source evidence (no live UI mutation): the
Canvas extension slot is embedRegistry.embedByExtension.canvas; getEmbedCreator
reads that exact slot. The native loader calls creator(ctx,file,subpath), attaches
its returned Component to the parent, then calls loadFile() with no arguments.
Canvas's original constructor installs a click listener; original loadFile reads
the whole board and renders its SVG. Reading/MarkdownRenderer postprocessors run
before unclaimed embed creation, while Live Preview also calls the creator directly.
Thus node embeds need the early creator bridge; replacing an already-owned span
alone cannot clean its prior native component.

Component.load is synchronous in public typings (runtime can aggregate child
onload promises); Component.unload owns callbacks. loadFile is the explicit async
render completion boundary. Inspect the current helper: do not await typed
component.load() as an async contract; invoke the native lifecycle once and await
only a verified runtime thenable or loadFile/card-handle.ready. Keep actual
Component instance validation, single-start loadFile, abort/unload cleanup,
ordinary creator pass-through, later-wrapper restoration and failure placeholders.

Before implementation/fix: mountNative must keep ctx.containerEl itself in place,
create/mount only an owned child span, propagate native depth and ancestor keys,
register handle disposal before awaiting ready, retire late async jobs, and block
postprocessor re-claiming of the owned native subtree. Focused mandatory checks:
copied raw-space Markdown card links/embeds, direct Live Preview creator path,
no original whole-board ctor/read for node-only fragments, Component unload during
pending card reads/renders, repeated loadFile/refresh, nested redirects/cycles/depth,
container identity/listener/attributes preserved, normal embeds untouched and
plugin unload restoring the creator descriptor without clobbering later hooks.
Native reading/live-preview/queued ownership acceptance remains parent-owned.

2026-10-08 focused native-mount run: 52 unit tests passed (exit 0). Targeted
typecheck found a test-only cast across the unwrapped creator return; fix that
explicit test cast. Focused lint found no await-thenable warning, but flagged
assigning a Promise-returning wrapper to public Component.load(): void. Before
fixing that boundary: keep load synchronous publicly, start its verified runtime
completion internally, and await that completion only in async loadFile. Mandatory
regressions are native parent load plus loadFile single-start, unload while pending,
failure cleanup, untouched ordinary factory calls and preserved container identity.

### Native mount contract and focused completion

Public API: BoardCardEmbeds.mountNative(container, linktext, sourcePath, depth,
registerCleanup?) returns CardEmbedHandle | undefined. Pass the native
ctx.containerEl/linktext/sourcePath/depth unchanged. The native loader already
increments depth; rendering uses max(inherited card depth, depth - 1) + 1.
Invalid destinations/depth or a disposed renderer return undefined without writes
or reads. Excessive valid depth produces the injected recursion error. An owned
child span replaces only itself; the actual native container, siblings, attributes
and listeners remain. This path bypasses suspendOriginal because the original
whole-board factory has never run. A repeated mount retires the previous handle.

Parent creator returns an actual SDK Component subclass with async loadFile().
Inside loadFile, call mountNative(..., request.registerCleanup), then immediately
this.register(() => handle.dispose()) and await handle.ready when defined. The
method itself registers disposal with request/native and inherited staging owners
before starting its first read. Helper disposal/native unload aborts the request;
late cleanup registrations run immediately. Component.load() stays synchronous
publicly; loadFile awaits only the normalized verified runtime completion and
actual asynchronous rendering. No typed await component.load() remains.

Install installCanvasCardEmbedCreator(app, { Component, create, onError }) before
native embeds claim node placeholders; check installed, and register its dispose
with plugin lifecycle. Only verified canvas slots and valid node-only fragments
are intercepted. Ordinary creators retain exact arguments/receiver. Factory errors
use a custom error component and injected onError, never the whole-board creator.
Parent refresh/invalidation continues to use resolver.invalidate(path) and
renderer.refresh(); plugin cleanup disposes the bridge, renderer and resolver.
Native-owned containers and their committed descendants are skipped by the normal
postprocessor; detached staging containers still process nested card destinations
with inherited ancestry and cleanup ownership.

2026-10-08 final focused verification: 54 card-link unit tests passed; targeted
ES2020 strict typecheck and focused module lint passed with zero diagnostics, all
exit 0. Regressions cover copied raw-space destinations in wiki and angle-wrapped
Markdown link/embed syntax, native creator construction avoidance, exact final
sourcePath, public synchronous load plus verified async runtime completion,
single-start loadFile, original factory pass-through, native container identity,
same-container replacement, pending unload/late cleanup, immediate unload before
I/O, redirect ancestry cycles, depth limits, subtree double-claim prevention,
failure placeholders and restoring only an owned extension slot. These are unit
adapters/fake DOM evidence; copied/pasted native Markdown fixture rendering and
native component cleanup acceptance remain parent-owned. Parent reports native
graph FeatureReference links, FeatureAlias suggestions and two backlinks; those
reports are separate from this task's unit evidence.

Cleanup boundary: interception prevents future original Canvas components for
recognized node embeds. It cannot retroactively unload a whole-board component
created before installation/reload or held by another wrapper. Such preexisting
postprocessor-owned embeds still need parent suspendOriginal/native-owner cleanup
or a native page rebuild; removing DOM alone does not release that component.
Ordinary whole-board embeds remain native. File-card nested native embeds require
the parent's renderFile to register its Markdown/native Component cleanup with
context.registerCleanup; the card module cannot discover that ownership itself.
Text renders its selected Markdown; files use the injected native renderer; groups
are labeled read-only summaries. Link/web, drawings, blank styled shapes and other
unsupported content show injected unsupported feedback, never an entire board.
Existing CardEmbedLabels/error callbacks and CSS classes remain the required parent
locale/style hooks; this task adds no user-facing string or shared style changes.

## Main transaction adapter race trace before implementation

2026-10-08 bounded ownership now permits only src/main.ts transaction/copy
adapter, focused tests and this trace. publishSelectionTransfer currently records
TFile identity/mtime/size but no event revision; same-content writes with restored
coarse stat values can pass its guards. checkDisk checks stat only before its
awaited read. deleteTarget checks target then awaits source reads/snapshot checks,
then only rechecks target identity before trashFile. A target or source modify,
delete/recreate, rename, cancellation or Undo during those awaits can invalidate
the evidence. rollbackSource also needs a post-await signal/stat gate. Initial
fingerprint and durable save read must reject changes during their own awaits.

Planned adapter fix: transaction-scoped vault create/modify/delete/rename event
listeners and a bounded-lifetime WeakMap monotonic revision per TFile. Freeze the
source path and include identity/revision/stat in every captured fingerprint.
Recheck before and after reads and synchronously recheck BOTH target/source
identities/revisions/stats, cancellation and native source snapshot immediately
before trash invocation. Uncertain recovery keeps the artifact. Release every
listener and publisher on all exits. copyCardReference must use existing localized
enhancements.copyFailed when its formatter cannot represent the destination,
without trying clipboard access; no locale edits are required.

Mandatory focused regressions: successful durable publish and recovery, same-stat
and same-content source/target ABA writes, target modify while final source read
is pending, source modify after target verification, read-time rename/recreation,
cancellation before apply/rollback/trash and while save is pending, native Undo
changing snapshot before trash, plugin unload, subscription cleanup on refused,
applied, partial and thrown paths, and raw-space successful/ambiguous-path failed
copy notices. Execute the real extracted main methods with injected vault/native
adapters plus the real pure publisher; do not claim those as native vault evidence.
Native failure/race/trash preference and real Windows/Android acceptance remain
parent-owned. trashFile is not a public atomic compare-and-delete primitive; any
native internal await after invocation requires parent acceptance/guarding.

Additional adapter trace before the creation receipt fix: vault.create resolves
asynchronously. Capturing only the current path stat afterward can claim a
replacement/edited target or an intervening same-content rewrite as the publisher's
own version. Capture an identity/version receipt from the transaction's actual
create event instead and require the returned TFile/path to match it. Missing
creation evidence fails closed and keeps the artifact. Add focused recovery tests
for same-body target edits before create resolves, replacement identity and absent
create events; these are adapter-unit evidence until parent native acceptance.

## Synthetic Flip host trace before fixture edits

2026-10-08 newly authorized files: tools/obsidian_oracle/fixtures/m1-browser.ts
and smoke_plugin_ui.py. --controls' Swap line ends cap assertion fails because
the host's history array/cursor are closure-only and not exposed on runtime;
captureNativeHistory fails closed before the new feature plan applies. Do not
change production applyFeatureDocument or native-history-fence, or relax the
expected original startCap/endCap, endpoint geometry and one-action Undo checks.

Read-only installed Windows Obsidian 1.14.4 app.js evidence: Canvas constructs
history = new hee(100), owning data/current/max. hee.push truncates redo in place,
pushes the document, shifts at length >= max and sets current = length - 1.
Canvas.requestSave(true) queues this.data through requestPushHistory =
Gl(pushHistory.bind(this),250,true). The queue has own run/cancel methods; run
drains pending arguments, cancel discards scheduling, undo/redo read history.
Native source was inspected without app/UI mutation. Existing source/fence/unit
facts agree; this is not a synthetic pass or native interaction receipt.

Plan: expose that verified object/queue contract in the synthetic host. Keep its
existing deterministic scheduler explicitly documented: ordinary fixture saves
drain queued history immediately, while a regression switch defers them for
explicit run/cancel tests (no claim of native 250ms timing). Add narrow Flip checks
for a pending prior step, separate own step, caps/endpoints/label geometry, exact
Undo/redo and failure rollback leaving no queued redo. Restore fixture scheduling
after checks. Run --controls headlessly, focused history/publisher/platform units,
typecheck and applicable fixture build. Native Flip/race checks stay parent-owned.

First --controls rerun passed the preserved Flip cap/endpoint/label/history and
fault-rollback checks, then failed the later free-end drag with KeyError x: a real
Flip now puts its from end at x=100, beside the card, so the later drag correctly
snaps to that card. The former refused Flip left from at -200. Before the narrow
test setup repair, keep the later drag geometry assertions intact; add a second
checked Flip to restore its original isolated free-end fixture and prove the
two-Flip cap/endpoint/label round trip. No production snapping changes.

Native transfer receipt review: native-transfer-Windows.json explicitly reports
passed=false, a retained target containing outside and a source still containing
outside. The earlier receipt lacks publisher diagnostic codes, so it cannot prove
which phase failed or that source save was the cause. Parent reports a restored
source/partial modal. Keep this as failed native evidence pending latest deployment.
Installed SDK source is 1.14.4; the launcher UA reports 1.12.7 and is not the SDK
version. Source inspection confirms CanvasView.getViewData serializes canvas.data;
Canvas.requestSave(true) refreshes canvas.data from getData before queuing history
and view save. importData itself rebuilds the graph; parent authoring already
repairs root metadata then invokes that requestSave boundary. Do not force-write
view.data or weaken graph/source/unknown-root verification based on a hypothesis.

Before save diagnostic/completion changes: keep a single bounded in-memory
transferReceipt containing publisher result and save certification codes (no board
bodies), so parent can distinguish create/apply/rollback/delete refusal from saved
graph/root drift. Await native saving both before and after view.save within the
same bounded deadline: native save may return while a saveAgain follow-up is
running. Preserve cancellation/snapshot/revision checks afterward. Mandatory new
adapter tests: native graph reorder/default/rounding and root-key reorder accepted,
actual miroSource/root/graph drift rejected, follow-up save completion awaited and
uncertain reads/cancelled saves retained. Parent can inspect transferReceipt plus
runtime canvas.data/getData and parsed view.getViewData immediately after native
apply/save; all native rerun/input remains parent-owned.

### Main adapter, modal hooks and Flip fixture completion

2026-10-08 final focused run: 139 tests passed in four files (35 actual extracted
main adapter/copy/modal tests, 51 pure publisher tests, 10 main platform tests,
43 native history fence tests), exit 0. Targeted strict ES2020 typecheck for
src/main.ts, main-transfer-adapter.test.ts and m1-browser.ts passed, exit 0.
Main lint exited 0 with only the existing commands/no-command-in-command-id
warning (no adapter diagnostics). npm run build passed, exit 0; main.js contains
the requested test build, ready for parent deployment. No commit/push or native
app mutation was performed by this task.

The full check was run before the final owned narrowing correction and reported
that correction plus another owner's tests/browser-export.test.ts missing override
at line 37. The owned save-state check now reads through a helper after each await
(TypeScript must not carry a narrowed false flag across native async completion).
The focused typecheck confirms this; this task did not edit browser-export tests
or claim a passing full check for that run.

Final headless python -m tools.obsidian_oracle.smoke_plugin_ui --controls passed,
exit 0. Earlier smoke runs failed first at the downstream grip setup and then at
a new exact JSON two-Flip comparison (floating complement/key order); no failed
run was recorded as passed. The final round-trip compares all semantic fields,
with the same 1e-9 labelT tolerance used for reverse geometry. The original
startCap arrow assertion, endpoint/zoom drag geometry, one own history step,
exact Undo/redo and unchanged redo branch after queued-save failure remain intact.
Synthetic scheduling is explicitly deterministic: it has no native 250ms timing
claim. Native history/source/race acceptance stays with the parent.

Main fingerprints now carry transaction event revisions in addition to stable
TFile identity/mtime/size; target creation ownership is captured at the create
event before awaits. Revisions are local WeakMaps; four listeners are removed in
finally on every exit. Missing/edited/recreated creation evidence cannot authorize
compensation. Read guards check the stat before and after await; apply/rollback
gate cancellation again before mutation. Deletion checks source runtime snapshot
and BOTH file identities/revisions/stats immediately before invoking trashFile.
The public native trash method still has no atomic conditional-delete API; the
adapter cannot undo a call already issued or detect disk writes whose public vault
events have not arrived. Those actual native races remain explicitly pending.

Parent diagnostic contract: inspect plugin.transferReceipt after the native run.
It contains sourcePath/targetPath, optional refused code, publisher result
(status/source/target/diagnostics), and at most four saveChecks (status/reason,
optional graphDrift field). No source/target document bodies are stored. Empty
saveChecks means no save callback completed certification; use publisher diagnostic
codes first. disk-graph-drift includes the exact graphDrift reason; disk-root-drift
means semantic root/source metadata differs, not JSON key order. source revision
or snapshot changes, cancellation, before/after save busy timeout and native
save/read exceptions all refuse certification. Native saveAgain follow-ups are
awaited within the same five-second waiting deadline. Accepted tests cover graph
ID/key order, known defaults and geometry rounding; real source/unknown-root drift
still fails and preserves artifacts when safe compensation cannot be proved.

enhancementModal now tags modal.containerEl.classList with
miro-canvas-enhancement-container and modal.modalEl.classList with
miro-canvas-enhancement-dialog. Parent/Euler owns scoped keyboard CSS and the
physical tablet check; this task made no CSS or modal layout change. The class
hooks, existing content class and modal close cleanup have focused unit coverage.
The parent-reported native Windows transfer failure remains a failed receipt,
pending deployment/rerun of this build. No inference that it passed, or that a
cached view string caused the failure, is made here.

### Native apply-refusal receipt trace before guard diagnostics

Latest parent native receipt reports diagnostics apply-refused/source-changed,
source changed, target retained and empty saveChecks. This rules out the save
callback as the failing phase for that run, but does not identify which apply
guard failed. Add at most four applyChecks with codes for cancellation, failed
disk fingerprint read, post-read revision drift, inactive session and native
feature refusal; never convert a stale disk guard into an approved semantic-only
write. Include expected/observed numeric stat/revision differences without board
text in the disk guard receipt. Parent can wrap session.authoring.applyDocument
after native no-op initialization to capture its returned diagnostic codes if
the adapter reaches native-feature-refused. Mandatory unit checks must distinguish
every guard and ensure the native method is never invoked after stale guards.

Property-index investigation (read only, parent/index-owner scope): properties UI
applies native feature document and closes its modal. The index accepts reindex
and flush only; index() reads vault.cachedRead and vault modify queues reindex.
There is no live/unsaved document ingest contract. Native TextFileView requestSave
debounces view.save by two seconds, so a cache read at 1.2 seconds is not a save or
cache-completion receipt. CanvasView.getViewData serializes canvas.data, not the
view's cached data string. Prompt transient unsaved properties need a bounded
live-document ingestion/generation API owned by the board index, followed by native
consumer notification and Undo/redo/session disposal handling. Do not spoof vault
cachedRead or relax the index's ownership gates. Main transaction adapter will
not force metadata persistence to stand in for that unsaved index contract.

Parent native authoring instrumentation subsequently identifies the exact import
refusal: retained external/internal edges remain in native Map order, while the
planned document requests a different array position. The parent owns the narrow
canvas-authoring by-ID verification repair and its regression tests. Main already
uses graphDrift's by-ID graph matching; add reordered edge arrays to the adapter's
save certification test rather than relaxing fingerprints or unknown metadata.

Source confirms M1.actionSnapshot initializes its local CanvasAuthoring before a
transfer. The bounded main diagnostic observer can temporarily shadow only that
verified local CanvasAuthoring instance's applyDocument to capture returned
ok/status and at most 16 diagnostic codes. It preserves the original receiver,
arguments, exact result, property descriptor and preexisting parent wrapper;
finally removes/restores only its own shadow and does not clobber a later hook.
It never stores result document bodies/messages or changes native acceptance.
Tests cover refused/thrown result observation, exact restoration and a later hook;
missing/frozen/non-writable instances simply run without this optional observer.

Before the observer lint cleanup: the latest 105 focused main/publisher/platform
tests and targeted strict typecheck passed. Main lint reports the legacy command-ID
warning plus two new observer-only warnings: extracting applyDocument as an
unbound method and asserting Reflect.apply's already inferred return. Retrieve
the verified method through Reflect.get, keep its explicit function type and
Reflect.apply receiver, and use the inferred result directly. Mandatory checks
remain exact authoring receiver/arguments/result, prior descriptor restoration,
later-wrapper ownership, refused/thrown diagnostics and all apply guard reasons.
No native acceptance or authoring fence behavior changes in this lint fix.

The recheck passed all 44 main adapter tests and targeted typecheck. Reflect.get
also already infers the method type in the installed TypeScript library, so its
explicit method assertion was the only remaining new lint warning. Remove that
redundant type-only assertion; retain the same receiver/restoration regressions
and run focused lint/typecheck, without repeating unchanged runtime tests.

Final apply-diagnostic completion: 44 main adapter tests pass; the preceding
combined main/publisher/platform run passes 105 tests. Targeted main/test/fixture
typecheck passes and focused main lint reports only the unchanged legacy command-ID
warning (all exit 0). Full headless --controls passed before these main-only
diagnostic additions; the smoke imports session/fixture, not main. No further smoke
or full-suite repeat was needed for the type-only cleanup. Earlier npm run build
passed; parent is now building/deploying its authoring repair with this ready main
source, and owns the current native transfer result. No concurrent build over the
parent deployment is issued after that handoff.

transferReceipt.applyChecks now has at most four entries: reason,
identitySame, expected/observed mtime/size/revision and optional authoring
ok/status/diagnostic codes (at most 16). Reasons distinguish cancelled-before-read,
source-disk-read-failed, source-disk-fingerprint-changed, cancelled-after-read,
source-revision-after-read, inactive-session, native-feature-refused,
native-feature-threw and applied. Expected/observed stats contain no TFile objects
or source/target text. Captured authoring codes identify native-import and rollback
verification failures without their document bodies or messages. The native
edge-order fix belongs to the parent; no production fence or graph order acceptance
was changed by the main observer. Both modal classList hooks remain ready for
parent/Euler physical tablet keyboard acceptance. Property-index unsaved ingestion
remains an index-owner integration need; no native cache success is inferred.
