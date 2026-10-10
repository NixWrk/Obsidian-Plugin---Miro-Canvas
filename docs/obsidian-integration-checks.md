# Obsidian integration: trace and acceptance register

Recorded before implementation, 2026-10-07. Ownership is limited to the two
new knowledge/index modules, their two focused test files and this document.
Main/session/settings/locales/writers/schema are the parent agent's work.

## Trace before source

Board save/property edit -> parent guarded document writer -> vault modify ->
debounced board read -> detached knowledge extraction -> guarded transient
metadata overlay -> changed/resolve/resolved notifications -> graph/outgoing/
backlinks/tag/alias/property consumers. File create/delete/rename -> batched
resolution refresh (reuse board knowledge, do not reread each node). Markdown
property changes -> parent's optional pure property-edge plan. Unload -> cancel
pending generations and restore only still-owned transient fields/hooks.

Document properties contract: `miroCanvas.properties` JSON object, with tags, aliases and cssclasses recognized. Import fallback: Advanced Canvas `metadata.frontmatter`. The parent must
preserve this namespace through native save, implement explicit property writes via
its existing CAS/history writer, and update schema/docs/UI as appropriate.
This module never writes any board or note, including rename link rewrites.
Parent encapsulation contract: `miroCanvas.nodeRedirects[oldId]` stores
`{file: target vault path, nodeId: unchanged moved id}`. Pure caches retain a
detached map for the parent's card-link/embed resolver; redirects do not create
graph references or trigger additional reads. Regression: detached retention,
unknown redirect fields preserved, and unchanged reference counts.

Mandatory focused regressions: links/embeds and heading/block subpaths;
Markdown code/comment exclusion; nested property references/tags/aliases;
file cards including subpaths; per-node positions; invalid/truncated boards;
burst events, bounded concurrent reads, stale read/parse completion, rename
and delete during indexing, resolver refresh without disk reads, unsupported
private shape, competing cache owners, unload during async work and selective
cleanup. Pure property-edge plans must preserve existing/manual edges and
report additions without applying them.

## Read-only real runtime evidence

Inspected existing hidden isolated Windows CDP port 9346 only. No screenshots,
bringToFront, activation, input, or board mutations. Vault:
`J:/NIX/WRK/Code/Obsidian-Plugin---Miro-Canvas/tools/obsidian_cdp/.out/l20-windows/vault`.
Observed: `fileCache[path] = {mtime, size, hash: ""}` for native Canvas;
`getFileCache(canvas)` calls `getCache(path)`, which returns `{}` for non-md.
`metadataCache[hash]` stores Markdown cache. Public resolvedLinks and
unresolvedLinks are path -> destination/count maps. Native computeMetadataAsync
accepts an ArrayBuffer and uses its worker queue. saveMetaCache/saveFileCache
persist to the metadata database; integration must NOT use those writers.
Native getBacklinksForFile uses iterateAllRefs; further behavior recorded below.
This is runtime inspection evidence, NOT acceptance of the new integration.

## Primary references

- Official API: https://github.com/obsidianmd/obsidian-api/blob/master/obsidian.d.ts
- Advanced Canvas behavior comparison:
  https://github.com/Developer-Mike/obsidian-advanced-canvas/blob/main/src/patchers/metadata-cache-patcher.ts
  (properties at metadata.frontmatter, per-text-card nodes cache, custom Canvas
  positions, private parser and resolver). Its implementation is not evidence
  that these new modules work, and is not copied into this project.

## Native acceptance checks (pending parent wiring)

- [ ] Real input: edit/save properties/tags/aliases; search and link suggestions.
- [ ] Real input: Markdown card links/embeds plus file cards appear in outgoing,
      backlinks and global/local graph; backlinks navigate the correct card.
- [ ] Real input: heading/block and card links, unresolved -> resolved and back.
- [ ] Real input: rename/delete note, board and containing folder; reopen/reindex;
      inspect saved JSON and no Markdown spliced into board root.
- [ ] Real input: property UI undo/redo and pure property-edge writer transaction.
- [ ] Real input: concurrent Advanced Canvas/cache plugin coexistence and unload;
      original native cache and other plugin fields preserved.
- [ ] Real input: unload/reload while indexing thousands of cards; no late writes.
- [ ] Physical Android MiroCanvasTest: models/app versions and ADB input recorded
      separately from CDP synthesis; native graph/backlinks/property checks.

## Parent wiring contract

```ts
import { createObsidianBoardIndex } from "./obsidian-board-index";

// Call once after native Canvas and metadata indexing are initialized.
const boardIndex = createObsidianBoardIndex(this.app, {
  registerEvent: event => this.registerEvent(event),
  registerCleanup: cleanup => this.register(cleanup),
  onRename: (file, oldPath, boards) => {
    // Schedule parent CAS/history property-link rewrites; no fake JSON offsets.
  },
  onNotePropertiesChanged: files => {
    // Parent schedules configured relation-edge plans for affected live boards.
  },
});
boardIndex.start();
```

`start()` is idempotent; `status` is stopped/ready/unsupported/disposed.
An unsupported private app shape installs no hooks/events and reads no boards.
`reindex(path?)` queues a board/all boards; `await flush()` drains the batch.
`getKnowledge(path)` and `onIndexed(file, knowledge)` expose the detached cache;
consumers should treat it as read-only. `onDiagnostic(code, path?)` is English
maintainer data, not user-facing text. `dispose()` is idempotent and cancels
pending generations; inherited/later wrappers continue by native delegation.
Cleanup restores only still-owned map rows, descriptors and reference mappings.

Properties are read from `miroCanvas.properties`; only valid Advanced Canvas
`metadata.frontmatter` is an import fallback. No new persisted root aliases.
`frontmatter`, `frontmatterLinks`, normalized `aliases`/`cssclasses`/`tags`,
`links`, `embeds`, text-only `nodes[nodeId]`, and optional `nodeRedirects` form
the in-memory knowledge cache. `position.nodeId` accompanies real local UTF-16
Markdown offsets (exclusive end), including headings/block target subpaths.
File/group-background embeds have zero local positions and are never registered
as text rewrite targets. Native worker node caches retain headings, blocks,
sections, note frontmatter and unknown cache fields. Root property links are
unmapped; text-card frontmatter references register with their text card only.

Defaults: 120ms debounce, two concurrent board reads and two native parsers;
16MiB per-board stat/read-character limit, 20,000 nodes and 8Mi text characters.
`limits` may reduce these defaults, never increase them. Reads are one
cachedRead per changed board, not per node/frame; unchanged text nodes reuse
native-parser caches even after geometry edits. Create/delete/rename resolves
cached references without rereading unaffected boards. Folder rename reindexes
only moved boards. Async read/parser results require the same generation,
file identity, path, mtime and size before publication.

`planNotePropertyEdges(document, {sourcePath, properties?, resolveLink,
getNoteCache})` returns deterministic additions with fromNode/toNode/property/
link/sourcePath/targetPath. `properties` accepts top-level or dotted paths;
empty means none, omitted means all. Subpaths are removed for destination
resolution; the resolver receives the source note's path. Existing native edges
or independent connectors suppress duplicate pairs. No edge is removed or
written; parent supplies IDs and one history/CAS writer transaction. Returned
plans are additions only, so removal/reconciliation of generated edges is a
parent policy and must never delete manual edges.

## Verification results

- 42 focused tests passed (31 pure extraction/planning/redirect tests, 11
  runtime lifecycle/ownership/parser tests). These are unit/synthetic evidence.
- Combined `npm run check` passed with ES2020 unchanged.
- Both owned source modules passed ESLint with `--max-warnings 0`.
- `git diff --check` passed; Git reported CRLF normalization notices for other
  agents' files. No git state was modified by this task.
- No acceptance claimed for graph UI, global property/tag search, native
  outgoing pane or mobile. Existing CDP instance was inspected read-only only.
  Parent owns build, writer/UI wiring, broader gates and physical-device checks.

Pure parser limitations: YAML frontmatter structure, headings/blocks/sections
are supplied by the runtime's native parser, not reconstructed by the pure
extractor. Native outgoing pane's `.md` guard is a confirmed unsupported
behavior. Native Canvas property backlinks use board-level embeds, with no
property editor range/highlight; card-specific links/embeds and redirect chains
are the parent's resolver. Global search and graph UI still require native
acceptance; cache availability alone does not establish search-engine support.

### Consumer-specific evidence and additional trace

Read the actual open backlinks and outgoing components without invoking them.
The backlinks status and recomputeBacklink call count-row.hasOwnProperty();
published count rows must retain Object.prototype. recomputeBacklink branches
on canvas and reads native index.get(file).caches/embeds directly; getFileCache
alone cannot supply Canvas property mentions. Planned index.getForPath overlay
returns detached caches and embeds (property references become board-level
embeds without fake offsets); it never changes the native source index entry.
The native get(file) delegates to getForPath, so no separate get hook is needed.

Native outgoingLink.recomputeLinks/recomputeUnlinked hard-code extension md;
native outgoing UI for Canvas remains unsupported by this metadata-only module.
Parent can consume the exposed knowledge for a board outgoing control. Native
property backlinks have board-level navigation, not a property-editor range.
No graph view is open in the inspected instance, so graph rendering is pending.

Timer/cleanup trace before warning fixes: vault events own one app-level debounce
timer; dispose cancels it and parser waiters. Global timer owner is explicit,
with no workspace/popout view activation. Cleanup registration passes a closure
so the caller's register API cannot change method binding. WeakMap is verified
before its narrowly typed bridge; pure parser returns CachedMetadata without an
unnecessary assertion. Mandatory checks remain the burst/unload/rename tests.

### Further installed native evidence (before implementation)

Main page title reports Obsidian 1.14.4 (Electron userAgent product reports
obsidian/1.12.7; retain both rather than infer version). Native Canvas already
has an independent index: `linkUpdaters.canvas.canvas.index` stores
`{embeds: [{file,subpath}], caches: {[nodeId]: CachedMetadata}}`. Text cards
are parsed (short cards synchronously; long cards with computeMetadataAsync).
Group backgrounds are native embeds too. `refNodeIds` is a WeakMap mapping
reference identity to text-card id. Canvas applyUpdates groups reference
updates by that WeakMap and edits each card's Markdown, not whole JSON offsets.
Native iterateAllRefs walks metadata hash entries AND link updaters; native
iterateRefsForFile chooses Canvas updater over getFileCache. Therefore metadata
hash insertion alone both duplicates refs and misses per-file iterator behavior.

Planned narrow instance hooks: getCache, iterateFileCache, getLinks,
iterateAllRefs, iterateRefsForFile; unsupported shapes leave native APIs alone.
Transient board caches live in a private Map, never saveMetaCache/saveFileCache.
Projected text reference identities register in native refNodeIds with genuine
local offsets; property references have no JSON/Markdown offset and must be
rewritten only by the parent's guarded properties writer on rename. No fake
position is allowed to cause a native Markdown splice into board JSON.

Parent confirmed Android SM-X736B/Obsidian 1.13.8 (primary) and SM-A336E/
Obsidian 1.12.7 (legacy). Parent owns real input and device acceptance checks.
This task must not mutate the active app/vault.

## Canvas outgoing pane sidecar: trace before source

2026-10-07 bounded follow-up owns only new canvas-outgoing-links.ts, its test
file and this appendix. Earlier modules stay unchanged. Read-only inspection
on hidden 9346 confirmed outgoing-link view.canAcceptExtension always true;
view.update assigns its real file to outgoingLink.file and calls update.
Component.update calls recomputeLinks when outgoingFile changes. Native
recomputeLinks cancels linksQueue, sets outgoingFile, clears vChildren for
non-md, updates linksCountEl and queues outgoingLinkInfinityScroller. Native
resolve events invalidate this state; collapse calls update and scroller.

Read the installed app://obsidian.md/app.js as source only to inspect the exact
child constructor used by recomputeLinks. It is a plain virtual-list object
with el, sourcePath, pos, invalidated and info {height,width,childLeft,
childLeftPadding,childTop,computed,queued,hidden,next}. The scroller traverses
those structural fields; no inheritance/instanceof check for a plain leaf.
Observed native row classes: tree-item-self is-clickable outgoing-link-item,
tree-item-icon, tree-item-inner, tree-item-inner-text and tree-item-inner-subtext.
Native row opens destination linktext with sourcePath; it never renders source
node positions. The sidebar canAcceptExtension accepts Canvas; only its
component renderer's md gate requires compatibility.

Planned behavior: hook recomputeLinks/onunload on supported component instances
only, never prototypes or native function text. Call original for cancellation
and collapse semantics, then populate its native virtual list with owned Canvas
destination rows using installed board-index knowledge. Native Markdown calls
delegate unchanged. Keep source node positions/property keys as row metadata,
with no fake document offset or extension and no note/node/file writes. Preserve
destination resolution, subpath deduplication, open-link, hover and native drag
where supported. New panes attach through workspace layout-change; native
resolve refreshes them. Disposal/close remove only owned rows/listeners and
restore descriptors/counts only when still owned. Unsupported shapes delegate.

Mandatory unit/synthetic checks before claiming implementation: Markdown exact
delegation; Canvas links/embeds/properties visible as rendered destination rows;
duplicate target+subpath suppression; node-position retention; opening and hover;
resolve/collapse/reopen; newly created pane; close/unload restores all instance
hooks and listeners; later wrapper/foreign rows preserved; unsupported pane or
unready index fails closed; no disk read/writer calls.

Native/physical acceptance remains pending: this task may not install hooks in
the inspected active app, mutate the test vault, activate it or take screenshots.
Parent must verify actual sidebar rendering/clicks/hover/collapse/reopen on
Windows and SM-X736B 1.13.8; SM-A336E 1.12.7 is a legacy compatibility check.

### Exact global-search boundary observed in installed 1.14.4

Read the open search view.startSearch and the installed app.js matcher code;
never invoked a query or edited search state. Native startSearch constructs
the local NL matcher, passes requiredInputs to VL's queued file iterator, and
calls matcher.match(file, content) in the renderer. This route is not a search
worker. VL honors ignored/supported files and calls vault.cachedRead only for
md/canvas when requiredInputs.content is true.

NL.match's Canvas branch JSON.parse(content), filters text nodes, creates one
YI input per text card with content=node.text and cache=canvas.index.get(file).
caches[node.id], then records content ranges under canvas-<nodeId>. Its final
filename/empty-content input has NO cache. The generic fallback assigns cache
from metadataCache.getFileCache(file) only when extension is md. Canvas root
miroCanvas.properties and metadata.frontmatter are never supplied here.

RL (tag:) requiredInputs returns {content:true}; it checks input.cache.tags and
input.cache.frontmatter tags. Thus actual text-card tags may match via the
native per-node index, but board-level property tags do not. sL ([property] or
[property:value]) checks input.cache.frontmatter, but requiredInputs returns {}.
A property-only Canvas query therefore receives empty file content, cannot
parse its nodes, and reaches the generic fallback with no Canvas cache.
A combined query that requires content can examine per-card frontmatter, but
NL's Canvas result mapping retains f.content rather than its property ranges.
No board property input or native property-range renderer is present in that
route. These are source observations, not passing query/real-input acceptance.

There is NO evidence that metadata.frontmatter is a native Canvas root field:
native Canvas index.process parses only nodes and native search only consumes
their caches/text. It is Advanced Canvas's import convention, not justification
for a new reserved/native root alias. Dual mapping into cache getters alone
does not implement board-global property/tag search. Parent must handle this
specific native matcher boundary separately; this outgoing sidecar patches no
global-search methods.

## Pre-rename property target follow-up: trace before source

Current resolvedLinks rows contain destination counts, not the correspondence
between an individual nested property reference and its destination. Neither
those rows nor a post-rename getFirstLinkpathDest call safely disambiguates equal
note names. Add optional in-memory resolvedPath to BoardPropertyReference;
runtime resolution stores a string copy of the actual target path or removes it
when unresolved. This never changes persisted properties, imported evidence or
positions. onRename receives a structured-cloned board map before refresh, so
parent async rewrites retain earlier resolution paths even when live caches
resolve a different equal-named note afterward. Uncloneable cache entries are
excluded with a maintainer diagnostic, never passed by shared reference.

Mandatory regressions: duplicate-note names, note and folder-prefix renames,
post-event resolver drift, detached property/position/unknown-field retention,
clearing stale resolution when a target disappears, and unchanged saved JSON.
Parent rewrites only refs with resolvedPath === oldPath or starting with the
old folder path plus '/', using its existing guarded writer. Absent resolvedPath
is not permission to infer a target from its textual link. Outgoing sidecar and
persisted JSON remain unchanged. Native rename acceptance is still parent-owned.

Follow-up verified: 59 focused tests passed (31 pure, 13 runtime, 15 outgoing);
owned integration sources/tests passed standalone ES2020 TypeScript and source
ESLint with zero warnings. Duplicate-note regressions cover both note rename
and containing-folder rename; snapshot property objects, positions and unknown
fields are detached, while later live resolution changes cannot alter earlier
resolvedPath strings. Target deletion removes stale resolvedPath. Parent may
hold the onRename Map across an async writer transaction; getKnowledge returns
the current live cache, not a safe substitute for that previous snapshot.

## Pure board-link lifecycle planner: trace before source

2026-10-07 follow-up owns only new board-link-lifecycle.ts, its test and this
appendix. Parent applies a successful changed plan once through
applyFeatureDocument(plan.document, expected) when the native history boundary
is idle. The planner does no reads, writes, commands, settings or native hooks.
Use cloneCanvasJson to reject non-JSON input and preserve every unknown/source
field. Rename literal native file-node/group-background and nodeRedirect file
paths; root property strings require preRename.frontmatterLinks.resolvedPath.
Text Markdown requires actual pre-rename destination evidence AND matching
node-local source slices. Preserve aliases, embed marker, heading/block/card
fragment and Markdown title; canonical new vault paths avoid relative-context
guessing. Folder mode matches only oldPath plus '/' boundaries. Stale/ambiguous
reference evidence skips edits with diagnostics; it never rewrites another
equal-named note or replaces text globally.

Current runtime only annotates property references with resolvedPath. Ordinary
text references lack that evidence; accept an optional historical target
callback or extended references with resolvedPath, otherwise leave them to the
native Canvas updater and report missing-text-target. Never call a current
post-rename resolver as a substitute. Property paths containing literal dots
are matched against detached property leaves, not blindly split into an object.

Generated note-property edges use edge.miroCanvas.generatedRelation, version 1,
owner miro-canvas, kind note-property, and explicit fromNode/toNode/property/
sourcePath/targetPath. This is an allowed native-edge future field, not a new
root schema field. Reconcile desired relations after excluding only valid owned
generated edges from the planner input; preserve manual/native/independent
connections, unknown markers and markers whose endpoints were manually changed.
Retain IDs/styles/unknown fields on surviving generated edges; remove only stale
valid generated edges, and obtain addition IDs through a parent callback. Missing
note cache is unknown evidence, so preserve affected generated edges. Explicit
disabled reconciliation may remove only recognized generated edges.

Mandatory regressions: equal note names and folder boundaries; file/subpath/
redirect/property/wiki/Markdown/card links and syntax preservation; stale local
offsets, duplicate or dotted property paths, aliases, unknown/source immutability;
generated additions/idempotence/updates/removal/manual blockers, incomplete note
caches, hostile marker/id callback collisions, and detached plans. Actual native
rename/undo/save and Android input remain pending parent checks. Global search
still has the exact renderer matcher boundary documented above; no search hook
or reserved metadata.frontmatter root is introduced by this pure module.

Lifecycle path/ID lint trace before fix: rename validates canonical vault paths
and reconciliation checks generated native IDs. Replace control-character regex
checks with explicit character-code inspection; wiki syntax safety uses literal
character checks. Regressions: invalid paths/IDs, fragment/alias preservation,
and atomic ID-collision rejection. No change to accepted canonical paths.
The final implementation imports the existing shared hasAsciiControl helper;
mandatory checks include NUL/newline/DEL rejection in rename paths and edge IDs.

## Closed-board metadata preparation: trace before source

New board-metadata-maintenance.ts takes original source bytes and pre-rename
knowledge. JSON parse -> detached document -> lifecycle rename proposal -> take
ONLY changed miroCanvas.properties/nodeRedirects -> MetadataWriter against a
synchronous detached MetadataDocumentStore -> validated detached next document.
Native nodes/text/groups/edges are retained exactly as found in source bytes;
native Canvas updater owns their rename. Never invent a Canvas runtime or native
history object. MetadataWriter performs its own metadata validation and source
invariant checks; store CAS rejects unexpected documents and any non-metadata
change. Parent alone performs asynchronous Vault.process, accepting next bytes
only if current bytes === prepared.expectedSource, then reindexes after success.
No extra edge reconciliation runs for closed boards.

Mandatory tests: genuine MetadataWriter validation/commit, immutable source and
unknown native/root/namespaced fields, graph unchanged despite lifecycle native
proposals, absent/noop/invalid metadata, byte limit and exact source byte token,
stale property evidence, detached returned documents. Native rename acceptance
and parent Vault.process CAS integration remain pending parent verification.

## Lifecycle/maintenance delivery contract

`planBoardLinkRename(document, {sourcePath, oldPath, newPath, folder?, preRename,
textTargetBeforeRename?, metadataOnly?})` returns `{ok:true, document, changed,
diagnostics, removedEdgeIds, addedEdgeIds}` or `{ok:false, reason}`. Apply only a
changed successful result through the parent boundary with the exact original
document as expected. Text callbacks must answer from historical evidence,
never post-rename native lookup. Extended text references may carry resolvedPath;
without either proof ordinary text stays untouched with missing-text-target.
Native Canvas already rewrites those references. Metadata-only mode updates
only miroCanvas.properties/nodeRedirects; no node or native-edge planning runs.

`planReconcileNotePropertyEdges(document, {sourcePath, properties?, resolveLink,
getNoteCache, createEdgeId, enabled?})` uses cached note properties; parent runs
it only on active boards/on open. createEdgeId receives addition,index, and
must return a unique native ID. Failed callbacks/invalid IDs reject the whole
proposal. Owned generated edges retain styles/IDs/unknown fields; changed manual
endpoints invalidate marker ownership. Missing caches preserve rather than delete.
Explicit enabled:false removes only valid owned generated edges. The marker is:

```json
{
  "miroCanvas": {
    "generatedRelation": {
      "owner": "miro-canvas", "kind": "note-property", "version": 1,
      "fromNode": "source-card", "toNode": "target-card", "property": "related",
      "sourcePath": "Source.md", "targetPath": "Target.md"
    }
  }
}
```

This belongs on a native edge. No root schema fields were introduced.
Plans reject malformed/non-JSON documents, invalid path segments, control
characters, duplicate IDs, missing native endpoints, >20,000 nodes, >50,000
edges or >8Mi text characters. Root/source/unknown values are strictly detached.

`prepareBoardMetadataRename(originalSource, options)` returns prepared/noop/
rejected. Only prepared results contain a document; expectedSource is the exact
original string, including whitespace and line endings. The internal detached
MetadataDocumentStore receives a genuine MetadataWriter transaction and rejects
any graph/root/non-maintained metadata changes, including writer normalization
outside properties/redirects. Source UTF-8 is bounded to 16MiB (reducible with
maxSourceBytes). No runtime Canvas is simulated, and no write API is called.

Parent closed-board CAS pattern (parent owns serialization, retries and reindex):

```ts
const prepared = prepareBoardMetadataRename(source, renameOptions);
if (prepared.status === "prepared") {
  await app.vault.process(file, current =>
    current === prepared.expectedSource ? JSON.stringify(prepared.document, null, "\t") : current);
}
```

Do not convert a CAS miss into an unconditional write. Native changes arriving
between read and process must remain untouched. Generated edges never reconcile
in this closed-board path.

Verification: the 18 lifecycle and 9 maintenance tests passed with existing
metadata-index, pure knowledge, outgoing and MetadataWriter tests: 101 total in
six suites. Both new modules passed ESLint --max-warnings 0 and standalone ES2020
TypeScript using Obsidian's shipped DOM declarations. No main/session/schema or
already-delivered integration source was edited for these bounded modules.
Native save/rename/undo and physical Android checks remain parent-owned/pending.
Global-search root properties remain unsupported by cache mapping alone: the
exact renderer-side VL -> NL.match -> per-card canvas.index route is above;
no native metadata.frontmatter root ownership was observed.

## Text-reference pre-rename evidence follow-up: trace before source

Runtime resolution must annotate BoardReference.resolvedPath as well as property
references. The public optional field is a last-resolved vault-path string, not
persisted JSON. Native-projected per-node links/embeds share their reference
identity with aggregate arrays, so one runtime assignment reaches both caches.
Detach these paths in onRename before any queued resolution refresh. The pure
lifecycle planner then has sufficient evidence without a current resolver.
Mandatory focused checks: aggregate/per-node path equality, missing-target path
clearing, equal-note-name note/folder rename snapshots, and passing such a
snapshot directly into the pure text rename planner with no resolver callback.
Parent alone queues active-board mutations when native history is busy.

Completed: BoardReference now declares optional resolvedPath, and runtime
resolution annotates links/embeds as well as property references, clearing the
field on unresolved targets. Per-node native-projected references and aggregate
references receive the same path. This supersedes the earlier property-only
evidence limitation: runtime onRename snapshots can be passed directly to
planBoardLinkRename without textTargetBeforeRename or any current resolver.
The optional callback remains for independently supplied historical caches.

55 focused tests passed across metadata index, lifecycle, maintenance and outgoing
suites; changed sources passed zero-warning lint and focused ES2020 typechecking.
Equal-note-name note/folder regressions now pass the actual detached runtime
snapshot into the pure text rename planner after the live resolver selects the
other note. Saved JSON and native Markdown parser results remain untouched.

### Sidecar refinement trace

Before refinements: preserve original this/arguments for borrowed native calls;
guard actual root.childrenEl/pusherEl and info.computed; retain root.info object
identity; cancelled or no-longer-ready batches must remove their partial owned
rows. Unresolved destinations remain visible, but opening requires a current
resolved file, preventing the native openLinkText missing-note creation path.
No sidecar method creates notes. Native drag/context menus are not injected;
the implemented compatibility owns destination display/open/hover/keyboard only.
Mandatory regressions include native resolve listener refresh, missing-target
click without openLinkText, and index-disposal cancellation without sidecar
disposal. Source-node ranges are metadata only, as in the inspected native row.

Hook receiver lint trace before fix: native callbacks and later wrappers may
borrow methods with another receiver. Preserve original this/arguments in that
case; bind only the sidecar's own recompute/detach callbacks rather than aliasing
this. Regressions: Markdown delegation, borrowed callback receiver, later wrapper
after disposal, and all pane-close cleanup tests. These are synthetic evidence.

### Sidecar delivery and parent wiring

```ts
import { CanvasOutgoingLinks } from "./canvas-outgoing-links";

// After boardIndex.start(); owns no command, settings or file-writing action.
const outgoing = new CanvasOutgoingLinks(this.app, boardIndex, {
  registerEvent: event => this.registerEvent(event),
  registerCleanup: cleanup => this.register(cleanup),
});
outgoing.start();
```

start/dispose are idempotent; status is stopped/ready/unsupported/disposed.
refresh discovers existing/new outgoing-link panes without opening or activating
one. It skips closed native components even while their leaves remain listed.
Only instance recomputeLinks/onunload descriptors are wrapped. Native resolve
events already invalidate outgoingFile and invoke this hook; Markdown receiver,
arguments and return values pass through unchanged. Native future Canvas rows
or queues take precedence. No class constructors are guessed or monkey-patched.

Rows use the native virtual-child shape and inspected native classes, public
setIcon/resolveSubpath/Keymap helpers, owner-document element creation, and the
pane's existing scroller/collapse/count controls. The public canvasOutgoingEntries
helper deduplicates destination plus subpath and retains source positions and
propertyKeys on each row.entry. The native child does not display source-node
ranges; parent can consume these fields for additional navigation. Destination
headings/blocks are displayed normally. Unresolved rows stay visible and marked
aria-disabled, but never trigger missing-note creation. Resolved rows support
click/middle-click/native modifier/keyboard open and the native hover-link route.
Native drag/context-menu actions are not added by this sidecar.

Defaults: at most 4096 destination rows, 64 per timer turn; maxRows/batchSize can
only reduce these bounds. Limit diagnostics go to onDiagnostic in English for
maintainers. Window timers belong to the pane document; close/unload/file switch,
collapse, a superseding resolve and index disposal cancel stale batches. Cleanup
removes only owned rows/listeners, preserves foreign rows/later wrappers/counts,
and restores instance descriptors only while still owned. No per-frame/per-node
reads and no vault writers are used. The two previously delivered modules and
their tests were unchanged during this follow-up.

Verification: 15 sidecar tests plus the 42 existing integration tests passed
together (57 total), inspecting populated/rendered destination children rather
than only cache getters. Owned sidecar/test standalone ES2020 TypeScript passed;
sidecar ESLint passed with --max-warnings 0. A combined npm run check currently
fails in parent-owned board-card-links.ts:187 and in m1-session enhancement
wiring being edited concurrently; no owned-sidecar type errors were reported.
Native sidebar rendering/clicks and Android acceptance remain PENDING, since
the app inspection was strictly read-only. Global board-property/tag search is
not implemented here; its exact renderer matcher/cache boundary is above.

## Index retention follow-up: trace before source

Entry.data is an unused reference to the entire board JSON, retaining irrelevant
miroSource and unknown roots on every indexed board. Remove it; full source is
local to one bounded indexing operation and the synchronous native changed
notification only. Retain projected knowledge, exact node-text parser memo,
references and the native file handle. No digest/hash is introduced and no board
knowledge is evicted. Document/file/generation/stat checks remain unchanged;
node parser memo compares ID plus exact Markdown string. Metadata-only/root
noise edits rebuild knowledge from the next read without reparsing unchanged
text. This does not clear Obsidian's own vault read cache.

Mandatory regression: intercept actual index entry storage, inspect its owned
retained strings/maps for a large irrelevant source sentinel, confirm no source
payload remains after flush; mutate irrelevant data and verify exact-text memo
reuse; change same-length Markdown and metadata with unchanged stats and verify
correct invalidation. Snapshot rename tests continue to verify detached paths.
The entry-storage probe is explicitly synthetic, not a native heap measurement.

Completed: Entry has no data/source/document field; the full JSON string remains
only in the active read/parse/changed-notification operation. The regression
inspects the actual retained entry, including its memo Map and reference Sets,
with a multi-megabyte miroSource/unknown-root payload. No irrelevant sentinel or
full source string is retained. Irrelevant edits reuse the native parser memo;
same-length text and property/file/alias/tag/redirect changes refresh correctly
even with identical mocked stats. All board knowledge remains available.
47 focused tests passed (index, lifecycle and outgoing); index lint has zero
warnings, focused ES2020 types and diff checks passed. No full-unit/native heap
acceptance is claimed and no arbitrary vault cache eviction was introduced.

## Canvas backlink UI sidecar: native evidence and trace before source

2026-10-08. Own only new canvas-backlinks.ts, its focused tests and this appendix.
Parent's actual 9346 check confirmed graph nodes/edges and alias suggestions.
Read-only inspection before the session reset confirmed backlinks result lookup
contains the fixture Canvas, result {canvas-a:[[0,21]]}, one native rendered card
row, and count 0. The earlier empty DOM was scheduler timing; no scheduler or
window/focus compatibility patch belongs here. After layout, the native card
row exists and opens its card using native match.nodeId.

Actual getMatchCount calls QI(result). QI counts filename/filepath/content/
propertyName/tag arrays and properties, not canvas-* ranges. Canvas native
recomputeBacklink uses per-node caches for positioned refs, but its embeds loop
only sets found=true: a property-only reference becomes addResult(board,{},data).
KW.renderContentMatches's Canvas branch processes canvas-* ranges only, ignoring
property matches. Therefore property-only mentions lack a visible property row
and a count even when getBacklinksForFile and resolvedLinks are correct.

New 9346 read attempt failed (endpoint unavailable); use the already inspected
installed 1.14.4 sources and parent's confirmed state, without creating/activating
an app or changing UI. Native acceptance of the new module remains parent-owned.

Planned narrow instance hooks: backlinkDom getMatchCount/addResult/removeResult/
emptyResults; component onunload; supported native Canvas result instance
renderContentMatches. Keep all native Markdown/card rendering and queues intact.
Count correction takes max(nativeCount, expected standard+Canvas+missing-property
count), so a future native correct count is not doubled. Add owned property
virtual children to the native result after its renderer, never add fake JSON or
Markdown ranges. Property click opens the actual board with optional parent
property-key callback; default is board-level openFile with no match offsets.
Use observed search-result-file-match tappable classes. Preserve foreign/native
rows and later wrappers; close/remove/unload restore only owned descriptors and
listeners. No reads/writes/commands/settings, prototypes, function rewriting,
polling, RAF/focus flags or cache/index edits.

Mandatory synthetic tests: card-only count correction, card+property count 2,
props-only visible key/value row and genuine board navigation, no duplicate
future native counts/rows, Markdown untouched, native rerender/collapse,
remove/empty/unload/new panes, unsupported shape, foreign rows/later wrappers,
bounded mounted properties, and no fake offset fields. Real native rendering,
navigation/hover, count update and Android acceptance remain parent-owned.

### Backlink sidecar delivery and parent wiring

Implemented new src/canvas-backlinks.ts and tests/canvas-backlinks.test.ts only;
previous index, knowledge, lifecycle, maintenance and outgoing modules are
unchanged in this task. Construct CanvasBacklinks(app, boardIndex, options) after
the index is ready; call start(). Pass registerEvent/ref => plugin.registerEvent
and registerCleanup/cleanup => plugin.register(cleanup), or call dispose()
explicitly before disposing the index. Layout changes discover already opened
backlink panes; refresh() also discovers existing native results. The module
never opens a pane or starts a native backlink search. Native resolve/queue
updates replace results through the inspected addResult route.

Options.onOpenProperty(file, {key, original, link, count}, event) lets the parent
open the genuine Canvas and focus its property panel/key. Without that callback,
click, middle-click and Enter/Space call the native getLeaf(Keymap.isModEvent)
and openFile(actualBoardTFile), with no eState/match/position arguments. Hover
uses the actual board path through hover-link. Supplemental mentions come only
from root board properties, resolved from the board's path to the current target;
card frontmatter references remain native card rows. Nested property keys are
the extractor's dotted paths, including array indexes. Repeated identical refs
share one row, retaining their reference count. Native text rows retain their
real nodeId/range navigation. Native property children with matching key/subkey
already present suppress the supplemental row. Native result JSON and source
content are never changed.

Shape guards require the observed backlink component, backlinkDom, DOM nodes,
virtual children and scroller root, configurable instance methods and supported
result rendering contract. No constructor-name inference or prototype edits.
Only installed descriptors still owned by the sidecar are restored; later
wrappers and foreign/native children/count changes survive cleanup. The row
renderer removes its own children/listeners before native rerender, result
replacement/remove/empty, pane closure and plugin unload. Limits default to 256
tracked results per pane and 128 distinct property rows per result, reducible
with maxResults/maxPropertiesPerResult. Excess properties/results are diagnosed
through onDiagnostic and not supplemented; native rows remain untouched.

Verification: 16 new focused tests passed; src/canvas-backlinks.ts ESLint passed
with --max-warnings 0, and new source/test standalone strict ES2020 TypeScript
passed. Tests inspect populated DOM/virtual children and exact navigation
arguments, not merely metadata getters. They cover the native count omission,
mixed/props-only results, future native counts/property children, Markdown,
card-frontmatter exclusion, rerender/replacement/remove/empty, late panes and
close/unload, descriptor ownership, inherited methods, limits and unsupported
contracts. No full suite was rerun, and no actual vault/UI was mutated.

PENDING real native acceptance: parent must load the built sidecar in the new
isolated instance, refresh the native backlinks pane and verify card+property
count 2, property-only key row, actual board/property-panel navigation, native
card navigation, collapse/expand/extra context, hover, subsequent resolve and
unload. Android app/version acceptance is also pending. Earlier real graph and
alias checks do not establish this new UI hook's acceptance. The prior sources
establish the semantic defect; the new tests establish only the sidecar's
synthetic behavior against those captured shapes.

Global-search boundary remains unchanged: native startSearch -> VL -> NL.match
reads Canvas JSON text nodes when content input is requested, then attaches
per-node canvas.index caches. Board miroCanvas.properties is not passed to those
matchers. Property-only queries request no content and receive no Canvas root
cache; tag queries see card metadata only. Neither cache dual mapping nor these
backlink UI hooks provides global board-property/tag search. No genuinely native
Canvas root frontmatter field was observed, and no persisted root alias or
search patch is introduced here.

### Property-only source discovery correction: trace before source

2026-10-08 follow-up. The previous property-only synthetic test explicitly
created addResult(board,{}); it did not cover a board absent from native results.
That is not native acceptance. In the replacement isolated 9346 instance,
read-only inspection of actual recomputeBacklink confirms p is set by matching
positioned text refs and file embeds; a board with only root-property references
can reach removeResult instead. Existing-result supplementation cannot fill
this missing source route. The earlier addResult-only claim is superseded.

Actual passSearchFilter(file, fullSource) delegates to searchQuery.match.
updateSearch reads searchComponent.getValue(), installs a compiled NL query or
null, clears backlinkFile/unlinkedFile and calls update. For property-only sources
there is no retained full source; therefore support only the verified empty
filter contract (searchQuery === null and getValue() === ""). Nonempty or
unsupported filters fail closed for source discovery; never substitute empty
JSON/source or pretend that metadata-cache truth establishes query support.
Native existing results can use their actual source through passSearchFilter.

Observed backlinkDom.el is DIV.search-result-container, with a separate
childrenEl DIV.search-results-children and scroller.rootEl === backlinkDom. Its
parent is backlink-pane node-insert-event, containing the linked header, linked
scroller, unlinked header and unlinked scroller in that order. Place a bounded
owned HTML supplement immediately after the linked scroller, outside the native
virtual tree. Discover candidate .canvas paths from resolvedLinks, validate a
real file via vault.getAbstractFileByPath, then inspect detached index knowledge
and resolve only root property references to the current target. No native
SearchResult, offsets, document or cache entries are created.

Mandatory checks: no addResult ever called for properties-only sources; actual
source/key row appears and navigates with no eState; count once when a native
card result arrives/disappears; filter empty/active/unsupported transitions;
resolve/rename/delete/recreate/index-disable/target-switch stale cleanup; bounded
candidate and reference scans; collapse and empty-state ownership; microtask
batching and unload cancellation; unchanged native Markdown/card/source data.
No frame loop or disk reads. Parent owns native fixture/UI mutation and final
actual rendering/navigation checks.

Implemented correction: the constructor now accepts optional App.vault; the
already wired real App needs no change. With a supported vault lookup, pane
mount and empty-filter contract, refresh scans up to 8192 own resolvedLinks paths
(maxCandidatePaths can reduce), inspects only candidate Canvas knowledge, and
checks up to 4096 root reference records per source (maxReferencesPerResult can
reduce). The existing combined 256-source/128-property-row bounds also apply.
There are no cachedRead/read calls. Missing native sources get owned sibling
HTML groups labelled by their actual vault paths, with property-key links using
the same real TFile navigation callback/default as existing result rows.
They never enter resultDomLookup/vChildren or call addResult.

Native result presence excludes a source from the separate supplement; mounted
missing-source counts are added once to the existing native/count correction.
Native add/remove/empty, update/search/collapse hooks and public resolve and
vault create/rename/delete events request one coalesced microtask refresh.
Target/property/deletion/recreation changes replace the owned groups and dispose
old handlers. An inactive index removes all owned pane hooks/rows at refresh;
parent should dispose the sidecar before disposing its index (or call refresh
when disabling indexing), since no status polling/frame loop is added.
Queued work checks disposed state before touching the pane.

Existing native results are filtered with passSearchFilter(realFile, actual
nativeResult.content). Missing-source groups support only null searchQuery plus
empty searchComponent.getValue(); active/invalid/unknown filters remove those
groups and their counts. This limitation is deliberate and visible to parent:
support for arbitrary filtered property-only backlinks would require native
full-source/query integration, which this bounded no-read sidecar does not fake.
Supplement section/collapse-all visibility follows native component state.
Native empty-state hidden is suppressed only while owned missing-source groups
exist and restored only while its installed value remains owned. Native Markdown
and card JSON/source/navigation remain intact.

Final focused verification: 26 tests passed, including the source absent from
native results, coalesced resolve/remove events, existing native source migration
without duplicate counts, empty/active/unsupported filters, exact-source native
filter delegation, delete/recreate/rename/target/property changes, disabled index,
collapse/empty-state cleanup, candidate/reference bounds and queued unload.
Strict standalone ES2020 source/test types and zero-warning ESLint passed.
Actual 9346 inspection in this follow-up was read-only source/shape inspection,
not UI acceptance; no app/vault/UI mutation was performed. Parent's property-only
fixture rendering/click/count validation, supported filter limitation and Android
acceptance remain PENDING. Earlier 16 passing tests did not cover native absence.

## Live document indexing: trace before source

Native parent verification required explicit Canvas view.save before persisted
property changes reached the existing disk-only index. This leaves metadata
stale between a committed native apply/Undo and the save debounce. Native
backlink count/card excerpts now pass when the parent's real pane is selected
and measured; no backlink source change is justified by the earlier hidden/
inactive pane. Property-only rows still require parent's visible native check.

Add index.ingestLiveDocument(realFile, settledSnapshot, {owner, identity}) and
releaseLiveDocument(realFile, owner). Owner and revision identity are objects
registered weakly and represented internally by numeric stamps: never strongly
retain a session, revision token, full snapshot or miroSource. The parent must
send a new identity after every committed metadata/text change and Undo/Redo,
reuse it for unchanged settled refreshes, and never feed drag/resize previews.
Only real current vault file identities on a supported ready index are accepted.

Extract a bounded detached metadata-relevant projection synchronously: node
IDs/types/Markdown/file/subpath/group background, root properties/redirects and
Advanced frontmatter import fallback. Ignore geometry, edges' unknown payloads,
source evidence and other irrelevant roots; no document writer is involved.
Publish pure knowledge immediately, reuse exact Markdown/native parser memos,
then refine changed cards through the existing bounded parser queue. Live
authority prevents native modify/reindex/startup disk jobs from overwriting the
newer in-memory revision. New live revisions, file deletion/recreation/rename,
owner release and unload invalidate stale asynchronous completions.

Live notifications use actual resolve/resolved plus onIndexed; do not fabricate
a full-file JSON string for the SDK changed event. Parent keeps the ordinary
save pipeline, invokes this hook only for settled current document identities,
and releases the owner on view teardown/file switch. Release permits bounded
disk indexing again. No network, native save call, cache database write,
settings/commands, per-frame read, source string or entire board memo is added.

Mandatory regressions: properties/aliases/tags/redirects and node references
update before any saved bytes change; Undo and identical text/native memo reuse;
old delayed reads/parsers and modify bursts cannot replace live knowledge;
detached input and large irrelevant source are not retained; owner/revision,
rename/delete/recreate/unload and malformed/over-limit snapshots fail safely;
native/foreign cache ownership and restoration remain exact. Native ingestion
wiring/unsaved property UI/Undo/graph/pane checks remain parent-owned and pending.

Live-ingestion lint trace: the two unnecessary CachedMetadata assertions are
on pure per-card memo construction (diskless fallback and immediate publication).
NodeKnowledge is already structurally accepted by that receiver; remove only
those assertions. Mandatory checks retain precise node IDs/ranges, pure/native
memo distinction, exact-text reuse, stale parser rejection and ES2020 types.
This is a typing cleanup, not a new native-input receipt.

### Live ingestion delivery / exact parent contract

Implemented in obsidian-board-index.ts and its focused tests only, plus this
trace/receipt. No main/session, backlink sidecar or completed user docs changed.
Both methods are synchronous:

```ts
const owner = {}; // one lease object per session/view lifetime
// In the parent semantic commit/Undo/Redo callback, for this current real file:
const result = index.ingestLiveDocument(file, settledSnapshot, {
  owner,
  identity: revisionIdentity, // same object on repeated unchanged refreshes
}); // "published" | "unchanged" | "refused"
// On closing/switching/disposal of that view:
index.releaseLiveDocument(file, owner);
```

Context contains owner and identity only; no source-kind/gesture boolean or
settings flags are introduced. Parent verifies that its callback still belongs
to the current view/file, and excludes previews/in-progress gesture documents.
A fresh identity is required whenever committed metadata/text changes, including
Undo/Redo; restored older identities are accepted when different from the current
revision. Identity alone is a caller contract, not a digest or a content scan.
Different/newer owners supersede old owners; releasing an older owner cannot
drop the newer live projection. Releasing the current owner resumes the ordinary
bounded disk index. Parent keeps normal native saving unchanged.

Properties/aliases/tags/cssclasses/redirects, root and per-node references and
resolved paths publish before return. Cached exact Markdown metadata is reused;
changed text immediately gets pure extractor ranges/node IDs and then bounded
native parser refinement. Native parser failures preserve that valid pure
projection. onIndexed fires on successful publication, including refinement;
parent's existing callback already refreshes outgoing/property/backlink sidecars.
resolve/resolved notifications publish without an invented SDK changed payload.
No cachedRead occurs for a path while live authority is held, including modify,
reindex, startup overlap and native parser work. Other closed boards continue
normal bounded disk reads. The API does not replace SDK readers: native text
snippet rendering still uses the SDK's normal content/save pipeline.

Retained live state contains only real file identity, numeric weak-token stamps
and the detached metadata projection; entries retain knowledge/exact-text memos.
Neither full snapshot, miroSource/irrelevant roots, source JSON nor view/session/
revision objects are strongly retained. Live limits use at most 20,000 nodes,
8 MiB Markdown characters, 16 MiB projected key/string characters, 131,072
JSON values/edge shape records and 128 levels (configured index bounds may
reduce applicable limits). Projection reads only recognized data descriptors;
relevant accessors/cycles/non-JSON and over-budget input refuse without replacing
the last valid projection. Irrelevant fields are not visited. This is read-only
extraction, so unknown/source fields in the actual board remain untouched.

Focused verification: 22 index tests pass (8 live API regressions plus the
existing 14), and 108 tests pass across index/backlinks/outgoing/property-results.
The tests cover pre-save cache updates and Undo, no live disk reads, memo reuse,
stale disk/parser races, modify bursts, leases, detached inputs and multi-megabyte
irrelevant source, bounds/accessors/cycles/native competitors, delete/recreate/
rename/unload and pure fallback after worker failure. Index lint passes with
zero warnings and strict standalone ES2020 source/test types pass. The initially
reported fixture type error was fixed; that failed invocation is not a pass.
Native live-ingestion callback wiring and immediate property/Undo/graph/pane
acceptance are PENDING with parent. No new native UI mutation, full suite,
source scope extension, commit or push was performed in this follow-up.

## Supported Android 1.13.8 index probe: trace before source

Parent's SM-X736B/R52Y808PDJB MiroCanvasTest integration receipt has raw board
properties saved, but cache frontmatter absent and resolved count 1 (card only).
The index reports unsupported. Read-only 9340 prototype-chain inspection:
the Canvas wrapper owns index (a plain path dictionary), fileQueue, app,
refNodeIds (WeakMap) and frame. Its direct prototype has canProcess/process/
parseText, but the inherited file indexer has get/getForPath/getAll. getForPath
reads this.index[path]; run writes processed {embeds,caches} into that dictionary.
Therefore direct-prototype-only inspection misleadingly suggested a missing
getter. The existing instance getter hook is applicable; no dictionary or
prototype adapter/extra entry is needed.

The actual incompatibility is metadataCache.iterateFileCache === undefined.
getCache/getLinks/iterateAllRefs/iterateRefsForFile/trigger and computeMetadataAsync
exist. getFileCache calls this.getCache(file.path); getLinkSuggestions iterates
supported vault files and reads getFileCache for aliases. Canvas references
iterate via index.getAll and index.getForPath; native backlink getBacklinksForFile
uses iterateAllRefs. These routes can use the existing guarded hooks while the
absent newer iteration method is left absent. Make iterateFileCache optional
only when absent; an existing incompatible/accessor/frozen method still refuses.
Keep all required getter/ref/event/map guards, bounds/live leases and ownership.

Additional native boundaries observed, not silently generalized: older getTags,
getAllPropertyInfos and getFrontmatterPropertyValuesForKey directly walk native
fileCache/metadataCache hash stores. Cache getter projection alone cannot claim
those global native inventories. Board-property/tag search remains the separate
supported conjunction supplement. Alias suggestions use the verified getter
route. The current Android backlink leaf is deferred (no component yet); no
panel shape is inferred or patched from that placeholder. Parent will load it
and verify actual graph/pane/navigation after deploying the bounded probe fix.

Mandatory tests: inherited Android getForPath with no iterateFileCache remains
supported; alias/getFileCache and both reference iterators see properties/text;
live publication before save; absent API remains absent with no new shadow;
incompatible existing optional API fails closed; maps/ref IDs/native descriptors
restore on unload, including inherited getter shadow removal. Windows behavior
and focused consumers must stay unchanged. No native app mutation/source capture,
new device forward, version/process/platform flags or disk dictionary write.

### Android probe correction receipt

Direct read-only 9340 checks in MiroCanvasTest confirmed typeof
canvas.index.getForPath === "function", ownGetter === false, its inherited body
reads this.index[path], refNodeIds instanceof the same-realm WeakMap, both index/
metadata objects extensible, all five required cache/ref/event methods functions,
and all required maps plain records. iterateFileCache alone is absent. The new
probe walks bounded data descriptors to distinguish complete absence from an
existing incompatible/accessor method, never executing such a getter. It
installs the cache-iteration hook only when a compatible method exists. No
method is invented on Android, no dictionary Proxy/accessor/value is installed,
and the native inherited index getter is shadowed/restored on its instance as
before. Native run/process writes keep their original dictionary identity.

The parent's native-android-backlinks.json, captured after actual pane creation,
has the same component/backlinkDom hook fields/methods as the current sidecar.
Its recompute uses canvas.index.get(file) and real positioned caches/embeds;
the earlier missing component was a deferred placeholder. No backlink code
change is supported by this finding. Sidecars must be recreated with the now
ready index during the parent's normal deploy/reload; an instance previously
started against unsupported indexing correctly remains unsupported.

113 focused tests passed across index/backlinks/outgoing/property-results;
27 index cases include the inspected inherited Android getter with absent cache
iterator, exact getter/alias/ref/live publication routes, native dictionary write
passthrough/identity, native unknown-field retention and unload shadow/ref/map
cleanup. Existing optional accessor (own/inherited), nonfunction and frozen
methods refuse without executing getters, registering hooks or reading files.
ES2020 source/test types passed. The first lint invocation failed with EPERM
deleting the shared .eslintcache and is not a pass; the task-specific temporary
cache rerun passed with --max-warnings 0, leaving the parent's cache alone.

Actual Android deployment/cache/graph/pane/navigation acceptance remains with
parent; these were read-only SDK/prototype checks and focused unit tests, not
new physical input. SM-X736B / 1.13.8 is the supported primary fixture;
SM-A336E / 1.12.7 remains a separate legacy check, not a minimum-version change.
Older global getTags/property inventory raw-store boundaries above remain
unextended; board-property/tag query support is the separate result supplement.
Only index/tests/this appendix changed. No main/session/sidecar changes, native
UI mutation, deployment, new forward, source JSON capture, full suite or commit.

### Native tag inventory overlay: trace before source

native-android-index-readers.json confirms get(file) delegates to inherited
getForPath(file.path), and aliases read getFileCache/getCache: neither needs a
dictionary Proxy or another getter hook. Older getTags directly traverses
fileCache/metadataCache hash rows, omitting the transient board projection.
Add an optional reversible getTags overlay only when the actual method and
isUserIgnored predicate are guarded functions. Preserve native counts, nested
tag parent counts and case-fold/display representative behavior. Include visible
indexed board tags and card frontmatter tags; skip ignored/competing-cache paths
and native hash rows already supplying metadata. Record paths seen by native
getCache/iterateFileCache during the synchronous call so a newer native getter-
based implementation is not counted twice. Cap tag inspection; over-budget or
unknown native output leaves the original result unchanged. No DB/reader/index
dictionary writes, extra source reads, callbacks/flags or native property-type
inventory guesses. Other raw property inventories remain unextended.

Mandatory tests: Android raw tag store plus board/parent tags, case aggregation,
ignored/native hash row ownership, per-card frontmatter, future getter-based
native counts without duplicates, malformed output/scan bounds, exact return
nonmutation and descriptor restoration. Current optional-method fixture tests
still apply. Native inventories/UI acceptance stays parent-owned.

Separate Windows rename finding (read-only): FileManager.runAsyncLinkUpdate
waits on metadata clean then calls updateAllLinks. isCacheClean checks only
inProgressTaskCount and linkResolverQueue items/running, not Canvas frame/fileQueue.
Current clean=true, callbacks=0, fileQueue=0. updateAllLinks returns a modal-close/
choice promise when alwaysUpdateLinks is false; an actual Update links modal is
open with that setting false. Parent should drive the native choice in its test.
No plugin queue or application setting change is justified by that finding.

### Final Android/tag delivery receipt

The final fix keeps getForPath required because it is verified inherited and
callable on SM-X736B/1.13.8; index.get(file) delegates to it. Absent
iterateFileCache is optional, with incompatible existing methods rejected by
bounded descriptor inspection. No .get replacement, dictionary Proxy/accessor,
prototype mutation, persisted cache entry, platform/version flag or minimum
version change is needed. getLinkSuggestions/getFileCache already use the
projected getCache and receive aliases without a separate suggestions hook.

The optional getTags hook now extends the previously documented raw-store tag
inventory boundary: it returns a new case-folded count record, adding visible
board/body/card-frontmatter tags and nested parent counts. Native results remain
unmodified. Ignored/competing-cache/native-hash-row paths are skipped; paths read
through getter/iterator hooks during a native implementation are not added
again. Work is capped at 131,072 key/path/node/tag-prefix visits and configured
maxTextCharacters for tag key characters. Unknown output/accessors or limits
return the original native result with no fabricated success. Raw hash fields
are inspected through data descriptors. Native property-type/value inventories
remain unextended; global board-property queries still use the separate
positive-conjunction result section. Tag hooks restore only while owned and
later wrappers continue native behavior after unload.

119 focused tests passed across index/backlinks/outgoing/property-results,
including 33 index cases. New checks cover raw-store tags, nested/card tags,
case representative counts, ignore/native-hash ownership, future native getter/
iterator counts without doubles, output accessors and scan refusal, native
nonmutation and later-wrapper restoration. Final source lint has zero warnings;
standalone strict ES2020 source/test types and owned whitespace checks pass.
Native Android deployment/cache/alias/tag/graph/pane acceptance remains parent-
owned; no installation or UI mutation was performed by this worker.

Rename evidence clarification: resolve already records resolvedPath on canonical
root/text references; text node IDs are position.nodeId, not a flat nodeId.
An unresolved post-rename link correctly loses its current resolvedPath and
does not prove that onRename's detached pre-refresh snapshot lacked history.
Read-only native updateRelatedLinks queues link resolution rather than resolving
synchronously in its rename handler. Parent/Godel are capturing actual pre-rename
cache/knowledge and callback ordering before deciding whether a historical
identity ledger is necessary. No rename/planner/main fields were changed based
on the unproved hypothesis; unknown/source preservation remains intact.

Windows rename timeout independently confirmed as an Update links modal with
alwaysUpdateLinks=false and clean metadata/empty Canvas queue. Parent drives
the actual one-time choice; no application preference is changed by the module.
Only owned index/tests/this appendix changed in this compatibility follow-up.

## Native status reconciliation — 2026-10-08

Docs-only review of ignored JSON receipts under
`tools/obsidian_cdp/.out/feature-expansion`, plus explicitly identified parent
reports. Earlier source/mocked checks, failures and pending-at-delivery entries
above are historical; only the following exact scenarios are now superseded.
This review performed no native UI mutation, source edit or new test run.

- **PASS, Windows notes:** `native-notes-Windows.json` records linked-note
  content search, generated note-property connection, pre-rename resolved paths
  in knowledge/cache, actual FileManager rename, renamed Markdown text and file
  card, and retained source evidence. Parent also reports the derived-edge
  rename verification passed. This does not cover duplicate-basename/folder
  moves, closed-board CAS, every property type or lifecycle race.
- **PASS, Windows and supported tablet integration:**
  `native-integration-Windows.json` and
  `native-integration-R52Y808PDJB.json` have `passed:true`. Checks cover property
  save/cache/references, actual graph containing linked Canvas, visible native
  card excerpts/counts and property-only source rows after scrolling. Aggregate
  backlink counts 93/28 depend on fixture vault contents, not fixed expected
  counts. Cache Maps alone were not accepted as UI proof. Earlier hidden-window
  zero counts/absent virtualized rows are retained above; activating the correct
  full pane and completing layout made the corresponding rows observable.
- **Outgoing, narrow parent report:** the existing native pane shows one real
  destination. Full filtering/navigation/close/unload compatibility remains open.
- **Global property search, not yet accepted:** the separate positive-conjunction
  supplement is implemented. `native-property-panes-Windows.json` initially
  failed with no owned rows; later generations had two/three rows. Parent is
  checking pane-scoped input after finding an old sidebar input could receive
  typing while assertions inspected a new center pane. A bounded active-pane
  row/click/outgoing retest remains pending. No source defect or blanket native
  search support is established. Native search still uses Canvas text/per-card
  matcher inputs, not root cache frontmatter; unsupported queries fail closed
  only for the supplement.

Windows receipts label input trusted CDP with bounded native frame preparation.
Tablet receipts label ADB action taps and CDP text/preparation; supported device
SM-X736B runs Obsidian 1.13.8. Plugin runtime version 0.2.10 is not the Obsidian
app version. SM-A336E / Obsidian 1.12.7 is below minimum 1.13.7; parent is
refreshing the phone, and new supported-version evidence remains pending.

Actual live-index wiring is semantic: successful feature document apply,
outermost Undo/Redo after refresh and exact-owner `vault.modify` call
`notifyCommittedBoardDocument`. Its coalesced microtask suppresses busy pointer/
tool/selection previews and native dragging. Main validates captured TFile and
current view, then calls `ingestLiveDocument(file, document, { owner, identity })`.
Dispose releases that owner's authority. **No requestSave wrapper**, per-frame
publication or full imported-source retention is used.

Parent reports final automated gates: 2,963 tests passed, one skipped in 157
files; typecheck, CSS, schema pin `225a8a`, submission and MCP/CLI builds passed;
lint zero errors with one existing command-ID warning. These aggregate results
are separate from this worker's earlier 119 focused tests and native receipts.

Still pending: property-search/navigation retest; ambiguous/folder rename,
delete/closed-board CAS and busy-session ordering; unload/owner replacement and
recreated/unsupported panes; filter/query combinations and bounded large-vault
behavior. The tablet held group gesture remains failed pending corrected ADB
input; advanced native geometry/style/transfer/Flip checks remain in their
feature registers. Selected passes do not close complete native acceptance.

Follow-up: the scoped 12s property-search check also failed. Read-only native
constructor inspection then established a source defect: its input debounce
captures startSearch.bind(view) before installation, bypassing the sidecar's
start wrapper while stopSearch still clears rows. A guarded instance root
renderSearchInfo hook now covers that successful parsed-query path; 48 focused
tests, zero source lint warnings and focused ES2020 types pass. Source/native
trace and failed-before-repair evidence are in canvas-property-results-checks.md.
Parent native typed-query/navigation/outgoing retest and refreshed full gates
remain pending. No runtime code was changed through CDP.

The latest corrected tablet ADB group test exposes actual connector-chain
endpoint lag, 311.556 vs expected 364.444. Mill's source repair and native retest
are pending. The earlier automated aggregate receipt predates both latest
repairs, and the complete implementation/acceptance status remains open. The
phone is currently in Telegram; no takeover is authorized by these docs.

## Resolved Windows property search and outgoing navigation — 2026-10-08

The latest ignored `native-property-panes-Windows.json` now has `passed:true`
for all four checks: native typed property query finds a genuine Canvas result,
result click opens that board, its property-only outgoing destination renders,
and outgoing click opens the actual note. Input is trusted CDP renderer input
with explicit pane preparation. This supersedes only the corresponding Windows
pending/failure entries above; their investigation history is preserved.

The root renderSearchInfo hook solves the captured native start callback path.
Outgoing checker corrections select the visible matching v.file pane rather
than an inactive same-file pane, and prepare native onResize/scroller compute.
They do not imply another outgoing source defect or any fake offsets/results.
Parent owns the native checker; this final update changes documentation only.

Supported-tablet property query/result/outgoing click is pending until Mill is
ready. Advanced query/filter/lifecycle cases and the actual tablet group-chain
geometry fix remain open. Parent will refresh full gates after that source
repair; no complete expansion acceptance or final aggregate pass is claimed.
## Latest property-pane native check — 2026-10-08

Windows and supported SM-X736B / Obsidian1.13.8 now pass typed global property
search, real Canvas result opening, property-only outgoing row and destination
note navigation. The tablet uses ADB taps while its keyboard remains open;
CDP text, native drawer reveal and pane resize are preparation. Receipts are
native-property-panes-Windows.json / native-property-panes-R52Y808PDJB.json.
The earlier native integration/backlink/graph and notes receipts remain separate.
Final phone rebuild acceptance is pending: SM-A336E disconnected and its installed
Obsidian1.12.7 is below the declared minimum1.13.7.
