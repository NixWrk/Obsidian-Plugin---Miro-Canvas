# L20 native UI visibility / Sagan

## Before-edit trace (2026-10-06)

Shared PRIMARY checkout, parent central pre-registration:
[L20 native UI display ownership](../lint-remediation-checks.md#l20-native-ui-display-ownership--before-edit).
Exclusive writes: new src/native-ui-visibility.ts,
tests/native-ui-visibility.test.ts and this note. No M1/CSS/other source/test,
shared registers/builds/apps/devices, nested agents or commits. Existing
node_modules reused. Proof outputs exclusively tools/obsidian_cdp/.out/l20-data.

Exact affected integration sites (read-only; parent owns wiring): styles.css:51
hides native canvas-controls with a priority against other plugins' inline show;
3094/3111 hide native canvas-card-menu/canvas-menu while root has
miro-canvas-presenting/is-screenshotting. M1 refresh/adoptNativeMenu finds the
actual native menu/container once for a runtime identity and moves its menuEl
into SelectionToolbar.nativeSlot; watchNativeMenuState tracks that adopted slot
and children. The new module takes ONLY the fixed targets supplied by parent,
never scans/query-selects board/cards or owns children/menu rebuild. Parent
calls refresh synchronously when adopting menus, refreshing selection or
entering capture; the root-class observer responds before rendering as well.
board-export run adds is-screenshotting and removes it in finally on success,
throw/cancel; slide-show mode similarly owns miro-canvas-presenting. Normal
selection returns native menus; independent-only selection suppresses them.
Controls stay suppressed for the lifetime of this per-runtime watcher.

Plan: export watchNativeUiVisibility(root, fixed elements, independent predicate)
with refresh/dispose only. Save display VALUE plus PRIORITY and exact hidden
attribute null/string separately. Apply only display:none with normal priority
and hidden=""; observe external shows/priority and hidden changes while owned,
save the latest native intent, then reapply. Restore only a property that still
has our applied value, preserving unrelated inline properties and later hooks.
Distinguish self-written mutation records so our hidden marker never becomes
the saved external hidden state. Drain pending records before explicit refresh/
dispose. Use the root's captured owner-window MutationObserver, root attributes
class only plus each fixed target's style/hidden only, no subtree/childList,
timer/frame loop/global document/global observer. Missing observer uses explicit
refresh; incomplete minimal style APIs skip unsafe display manipulation while
retaining reversible actual hidden attributes. Duplicate fixed entries collapse
by element identity, controls taking precedence. Each root has independent state.

Mandatory focused tests before accepting: controls suppressed immediately/no
priority/zero simulated layout; independent + both root modes and normal return;
latest external display/priority/hidden string or absence while owned; own
observer writes not mistaken for external intent; unrelated style updates;
external later hooks before dispose (including pending records); repeated
capture/presentation and throw/cancel finally restore; owner observer targets/
attribute filters/disconnect and inert callbacks after dispose; two distinct
roots/windows; no-observer and partial style fake hosts; stable refresh performs
no repeated writes. Compiler/lint/diff/UTF8+CRLF checks on the three leased files.
No CSS priority removal or app evidence here. Parent must verify real inline
native/plugin competition, zero rect/hit/focus, actual adopted menus/rebuild,
real captures/presentation success/failure, both themes/mobile/popout/windows,
and integrate the module without broad observers or runtime identity leaks.

## Results / parent wiring handoff

Saved module was announced while parent wiring proceeded. Exact requested API:
watchNativeUiVisibility(root: HTMLElement, elements: readonly { element:
HTMLElement; kind: 'controls' | 'menu' }[], isIndependentOnly: () => boolean)
returns refresh()/dispose(). No imports, global DOM/observer, timers, queries,
card walks, children/subtree observers or frame hooks. Observe root class and
fixed target style/hidden only. Root.ownerDocument?.defaultView?.MutationObserver
is captured once; absent/incomplete plain-host observer mocks use explicit
refresh. The parent directly requested the optional owner-document guard;
that guard and its minimal-root regression are present before handoff.

Ownership: display snapshot stores value/priority independently of exact hidden
attribute null/string. Normal none/empty priority plus hidden="" suppression;
external changes become the next restoration target, self-generated records
are consumed separately. Pending records are drained before refresh/dispose,
unchanged states do not rewrite, restore affects only still-owned display and
hidden properties. Unrelated inline properties and later external hooks survive.
Observing starts after initial suppression, and dispose disconnects before
restoration, preventing feedback and post-dispose callbacks from taking control.
A failed initial mount restores earlier successfully suppressed targets.

Focused evidence only: tests/native-ui-visibility.test.ts, 24/24 pass.
Covers controls/no-priority/zero simulated rect, independent-only menus,
both root classes and combined causes, repeat modes, external shows/priorities,
exact original hidden values and later native hidden intent including the same
marker, self-record handling, unrelated color/priority, later hook before
observer delivery and during restoration, capture error/cancel finally restore,
exact observer targets/filters/captured owner/disconnect, ignored disposed
callbacks, root/window isolation, replacement widgets not watched, duplicate
fixed target normalization, no-observer/incomplete observer/missing style APIs,
missing ownerDocument and failed initialization cleanup. Simulated rects are a
minimal DOM model, not measured layout/focus/hit in an app or browser.

Scoped compiler (module + test + installed ambient SDK) reports zero diagnostics.
Targeted full configured ESLint on the new module reports 0 errors / 0 warnings,
no rules changed/disabled. This count-zero semantic job does not claim any CSS
warning reduction or source warning removal. UTF-8/no BOM/CRLF verified for
all three new files; scoped diff whitespace check passes. No other source,
M1/CSS/tests/central docs/builds/apps were changed in this bounded job.

Proof artifacts: native-ui-tests.json, native-ui-lint.json,
native-ui-types.json and native-ui.patch under
 tools/obsidian_cdp/.out/l20-data/. Parent integration/adoption is not certified
by this standalone module run. Remaining parent checks: immutable real builds,
actual controls zero rect/hit/focus, adopted menu/snapshot rebuild and native
identity lifetime, independent/native/mixed selection, capture/presentation
begin/end/cancel/error, other native/plugin inline writers, both themes/mobile/
owner-window/popout and unload/return ordering. All pending app/device checks
remain pending; no app/input/build/commit action was performed here.
