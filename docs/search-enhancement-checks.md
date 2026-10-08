# Search enhancement trace and checks

Recorded before implementation on 2026-10-07.

## Trace and owned scope

`m1-session.ts` creates BoardSearchBar, builds the pure board index from a saved
board/comments identity, calls findMatches, and focuses the selected card/line/pin.
Existing literal matching folds case, accents and Russian ё but preserves й.
File cards currently index only basename/subpath. SearchBar owns debounce timers,
keyboard isolation, next/previous/close, the counter and live announcement.

This task owns only board-search.ts, board-search-bar.ts, optional
linked-note-search.ts, focused search tests and this document. Runtime wiring,
locale tables, styles, README/changelog, native checks and git belong to the parent.
No preview, metadata, history or source document changes are needed.

## Planned implementation and mandatory regression checks

- Preserve two-argument findMatches and existing literal results/performance.
  Store raw/display text separately; add injected path-to-Markdown text to index
  file cards, slicing heading descendants or exact paragraph/block subpaths.
  Check duplicate cards, absent paths, missing anchors, fences and Unicode.
- Add case matching and bounded regex search with a structured error result.
  Reject unsafe/unbounded regex syntax before execution; cap pattern and scanned
  text/work. Check malformed patterns, nested repeats, backreferences, lookaround,
  Unicode case, escaped operators, anchors, classes and safety budget failures.
  Failures must clear matches and be distinguishable from ordinary no-results.
- Inject optional localized mode/error labels and options into the existing bar.
  Preserve old callbacks and default controls. Check toggles, current option
  snapshots, debounce/Enter, error announcement and disabled navigation,
  error recovery, close/dispose timer cancellation, keyboard propagation.
- Optional linked-note loader uses injected stat/read adapters, Markdown-only
  vault-relative paths, file-size/read/concurrency/cache bounds and path/mtime
  reuse. Check duplicate reads, file edit/rename/delete invalidation, read failure,
  superseded requests and disposal. Never read files from animation-frame work.

## Evidence boundary

Unit/pure tests and fake DOM evidence: pending.
Real Obsidian keyboard/mouse/touch search, linked-note live edit/rename/delete,
board switching/unload, native navigation/review, English/Russian, light/dark and
narrow layouts: pending; parent owns integration and these checks.
Physical Android MiroCanvasTest device/app versions and real ADB interactions:
pending; record separately from CDP synthesis and physical stylus checks.

## Parent integration contract

### Pure index and query

`buildSearchIndex({...existingInput, noteTexts})` accepts a
`ReadonlyMap<string, string>` keyed by each file card's exact vault-relative path.
Values are full Markdown bodies, not normalized text. Omitting the map retains
filename/subpath-only results. Only `.md` file cards consume the map. Each file
card keeps its existing key, target ID and rectangle: filename, subpath and note
content produce one result, even if several words match. No document is mutated.

For native metadata-cache bounds, optionally supply
`noteTextSlice(path, fullNoteText, subpath): string | undefined` in the same input.
It runs only for file cards with a nonempty subpath; return the exact readable
Markdown slice, or undefined to fail closed on an absent anchor. It must be a
pure lookup/slice without file reads. Without this adapter the built-in slicer
below applies. Full-note cards always use the full mapped text.

Each built `SearchEntry` now has required `rawText` (original Markdown),
`displayText` (readable text preserving case/accents/newlines) and the existing
folded `haystack`. Callers constructing their own entries must supply all three.

- `findMatches(index, query)` still returns `number[]` with existing defaults.
- `findMatches(index, query, options)` returns `SearchMatchResult`.
- `searchMatches(index, query, options = {})` always returns that structured result.
- `SearchOptions` is `{ regex?: boolean; caseSensitive?: boolean }`; both default
  false. Carry these options through runSearch AND syncSearch after saves/file edits.
- Success is `{ matches: number[] }`; failure is `{ matches: [], error: { code } }`.
  Clear current match/highlight and close a result comment thread on failure.
  Do not convert failure to an ordinary no-results state.

Literal defaults preserve case/accent/ё folding and the distinction between й/и.
Case matching uses NFC readable text with collapsed whitespace, preserving case,
accents and ё. Regex uses readable text with `u`/`iu` character matching, preserving
newlines and accents; its pattern is never Markdown-stripped or literal-normalized.
An empty query returns no matches; whitespace-only regex patterns are meaningful.

Regex is a bounded forward-state matcher, not full JavaScript regex execution.
It supports literals/escaped punctuation, dot, character classes, Unicode property
and shorthand classes, initial `^`, terminal `$`, `*`, `+`, `?`, bounded/open repeats
and lazy suffixes (existence is independent of greedy preference). Groups,
alternatives, lookaround, backreferences and word boundaries are unsupported.
Outside classes, control-letter escapes and NUL escapes are also unsupported.
Malformed syntax is a distinct `invalid-pattern` error. Large repeat expansion is
`unsupported-pattern`. Anchors bound the whole entry, with no multiline mode.
Native RegExp validates syntax and tests single characters only. It never tests
the full supplied pattern. The matcher caps pattern length at 256 UTF-16 units,
compiled states at 256, entries at 20,000, input at 2,000,000 UTF-16 units and total
state work at 2,000,000. Budget failures return no partial matches. Full regex syntax
would need an independently cancellable worker; do not relax these restrictions
or replace the matcher with synchronous `new RegExp(query).test(longText)`.

### Linked-note lifecycle

Construct one `LinkedNoteSearch({ stat, read })` per board session:

- `stat(path)` synchronously resolves a current vault Markdown file and returns
  `{ mtime: number, size: number }` or undefined. Never resolve outside the vault.
- `read(path, signal)` returns `Promise<string>` using the parent's vault adapter.
  Honor the abort signal when supported. Native cachedRead can ignore it: stale
  publication is still prevented and its unresolved read occupies a bounded slot.
- Pass distinct Markdown file-card paths to `await service.load(paths)` on search
  open, saved-board file-card changes and relevant vault file events. Never call
  load/stat/read from pointer movement, pan/zoom or animation-frame refresh.
- Results are `{ status: 'ready' | 'stale' | 'disposed', noteTexts, issues }`.
  Only install a `ready` map on the same still-live board/search generation.
  Superseded/disposed results have empty maps. Even a ready result needs the
  parent's board identity/isOpen guard before rebuilding matches/navigation.
- Store the returned map identity in the session's index-cache key, along with
  existing document/comments identity. A fresh ready load returns a fresh map.
- On modify/delete call `invalidate(path)`; on rename call it for both paths.
  Invalidate aborts the current result request and retires that path's cache/read.
  Then schedule a fresh load for the current board. mtime/size changes also reject
  pending reads and invalidate cached text without requiring an explicit event.
- Call `dispose()` at board close/session disposal/plugin unload. It settles
  waiting loads immediately, aborts pending adapter signals and clears cached
  bodies. Late resolutions cannot publish or repopulate cache.
- Surface `issues` through parent-owned localized feedback when relevant: codes
  are invalid-path, file-limit, missing, too-large, read-failed and changed. Names
  remain searchable when a note body is unavailable. Do not silently promise full
  note search when a size/read bound excluded bodies.

Bounds: up to 128 distinct files and 512 enumerated requests per load; 512 KiB
reported file size plus actual text-length check; 2,000,000 returned characters;
128 cache entries and 2,000,000 cached characters; four active reads globally
across superseded loads, even if adapters ignore abort. Each load currently reads
sequentially; concurrency is an upper limit across overlapping loads. Cache reuse
is by path/mtime/size and eviction by least recent use. No timers or subscriptions
are installed by this service: the parent owns vault-event subscriptions.

`sliceLinkedNoteText(text, subpath?)` is also exported. Heading slices include the
heading and descendants through the next peer/ancestor; heading paths separated
by `#`, setext headings, case/canonical Unicode and URL-escaped names are supported.
Block slices support inline paragraph IDs and IDs on a separate line after a
paragraph/list. Missing/invalid anchors return empty text, never the whole file.
Fenced code/frontmatter cannot supply anchors. Slicing is read-only and does not
change the full-note cache. This small parser does not reproduce all Markdown
metadata cases (complex block containers, indented code/link-decorated headings).
Use the optional noteTextSlice adapter with native metadata-cache resolved
offsets when the parent adds that integration; real Obsidian equivalence for those cases remains pending.

### Search-bar callbacks, locales and styles

Existing two-argument construction remains valid with its original controls and
one-argument query callbacks. Enhanced construction is:

```ts
new BoardSearchBar(document, {
  onQuery: (query, options) => runSearch(query, options ?? {}),
  onStep,
  onClose,
  queryDelay,
  setIcon,
}, {
  labels: {
    regex: words().search.regex,
    caseSensitive: words().search.caseSensitive,
    errors: words().search.errors,
  },
  initialOptions: { regex: false, caseSensitive: false },
});
```

The locale keys above are proposed hooks, not currently added. The injected
`BoardSearchEnhancementLabels` requires `regex`, `caseSensitive` and
`errors: Record<SearchErrorCode, string>` with exactly these error keys:
invalid-pattern, unsupported-pattern, pattern-too-long, input-too-large, work-limit.
Add identical English/Russian keys in the parent's locale tables. Explain the
restricted syntax in unsupported-pattern feedback. Add separate localized labels
for linked-note issue codes if presenting loader issues. No new feature copy is
hardcoded in the component; a legacy host passing an error without labels gets
its diagnostic code visibly, so integration must provide the labels.

`bar.options` returns a snapshot. `bar.setOptions(options, search = true)` updates
both modes and pressed states; default searches immediately and cancels a pending
query. Pass false only for restoring state without a query. Enhanced `onQuery`
receives `(query, options)`; a legacy bar preserves `(query)`.

Pass search failure directly as `bar.showResult({ current: -1, total: 0, error })`.
The counter/live region display the injected message, the input gets aria-invalid,
navigation buttons/keyboard stepping are blocked and data-search-state becomes
error. A successful showResult clears those error states. The callback host owns
asynchronous stale-response protection; the bar only owns its debounce timer.

Parent-owned required CSS hooks, using the existing Obsidian variables:

- `.miro-canvas-search__button[data-search-option='regex']` and
  `[data-search-option='caseSensitive']` are existing search-button-class controls.
  Style `[aria-pressed='true']` with a visible selected cue, hover/focus states and
  adequate non-overlapping touch targets. Icon names are regex/case-sensitive,
  with symbolic fallback glyphs `.*`/`Aa`. Existing button padding variable applies.
- `.miro-canvas-search[data-search-state='error'] .miro-canvas-search__count`
  needs error styling and wrapped text on narrow screens. Existing nowrap counter
  styling can make longer messages overflow; allow a full-width error row/flex-wrap
  while keeping the field, both mode buttons and Close reachable.
- `[data-search-error]` contains the exact error code or an empty string;
  `.miro-canvas-search__input[aria-invalid='true']` is the accessible invalid cue.
  Keep the existing live region hidden visually and announced politely.
- Retain search layer 140 and existing tablet padding restoration. Run --controls
  smoke after styles are added, plus native light/dark and English/Russian narrow
  layouts/keyboard/touch checks. No style changes were made by this task.

## Verification evidence

Implementation: complete within the owned files; parent runtime/locale/style
integration is pending.

Pure/fake DOM final verification passed on 2026-10-07: 65 tests in four focused
files (Vitest exit 0, 1.10 seconds total). Original 27 tests pass
unchanged in behavior, including a 5,000-card index under its one-second budget.
Covered: note cards/raw-display-folded text, authoritative metadata slice adapter,
case/Unicode, supported regex vs
native regex on small inputs, malformed/unsupported patterns, work/input budgets,
bar modes/errors/debounce/dispose, note subpaths, cached/reused reads, file change,
rename/delete, read failure, superseded loads and ignored-abort disposal/global
read bounds. These are unit and fake DOM evidence only.

`npm run check`: failed with unrelated concurrent code at
`tests/board-knowledge.test.ts:256` (Object.hasOwn requires a newer library than
ES2020); no owned-file TypeScript errors were reported. The first targeted command
without Obsidian ambient types also failed (createEl/createSvg in dom-elements.ts);
that command is not counted as passing. The corrected targeted check passed:

```text
npx tsc --noEmit --target ES2020 --module ESNext --moduleResolution Bundler --lib ES2020,DOM --strict --noImplicitOverride --isolatedModules --esModuleInterop --skipLibCheck --types node,vitest/globals,obsidian src/board-search.ts src/board-search-bar.ts src/linked-note-search.ts tests/board-search.test.ts tests/board-search-bar.test.ts tests/board-search-enhancements.test.ts tests/linked-note-search.test.ts
```

`npx eslint src/board-search.ts src/board-search-bar.ts src/linked-note-search.ts --no-cache`:
passed after all refinements (exit 0, no warnings/errors). The corrected targeted
ES2020/Obsidian ambient-type check also passed again after all refinements (exit 0).

Final focused test command:

```text
npm test -- tests/board-search.test.ts tests/board-search-bar.test.ts tests/board-search-enhancements.test.ts tests/linked-note-search.test.ts
```

Owned-file whitespace check passed; all seven changed files use CRLF. This is a
file-content check, not git diff --check, because this task excludes git operations.
All commands preserved their actual exit results; failed checks above remain
recorded distinctly from passing ones. Shell writes/test runs used require_escalated
for the sandbox-restricted assigned worktree.

No git commands, commits, pushes, dependency installs, generated bundle edits or
real-app checks were performed. Parent owns the full check/build/schema/smoke,
README/changelog and real-input/device gates. Native and physical Android checks
listed above remain pending; no app/device version or ADB evidence is claimed.

## Subsequent native evidence — 2026-10-08

The pending-at-worker-delivery statements above remain historical. Parent's
ignored `tools/obsidian_cdp/.out/feature-expansion/native-notes-Windows.json`
now reports PASS for linked Markdown note-content search and actual FileManager
rename. The renamed board contains the new Markdown link and file-card path,
with imported source evidence retained. Input is trusted CDP with bounded native
frame preparation; this docs review did not drive the app or rerun tests.

That exact smoke does not accept every heading/block slice, malformed/expensive
regex, Unicode/case combination, delete/stale-read/disposal race or physical
Android search interaction. Board-property global search is a separate sidecar:
its active-pane native retest is pending after failed timing/pane-selection
checks; no source defect is confirmed. See canvas-property-results-checks.md.

Subsequent resolution: the latest native-property-panes-Windows.json passes all
four typed-query/result-click/property-only-outgoing/note-click checks after
the guarded root renderSearchInfo hook repair. Native input had captured the
original startSearch before wrapping; the trace and failed receipts remain in
canvas-property-results-checks.md. Outgoing test preparation now selects the
visible matching-file pane and computes its native layout. Tablet retest and
additional query/lifecycle cases remain pending. This documentation update made
no further source or harness changes and did not rerun native input.
