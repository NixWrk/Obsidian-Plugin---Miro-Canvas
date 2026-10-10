# Review menu cleanup — 2026-10-10

Scope: SelectionToolbar, QuickTools and fixed native UI visibility. The parent owns
M1 policy, dock/context menus, laser behavior and effective slideshow review state.
Pre-edit trace is recorded in lint-remediation-checks.md, “Vector PDF/PPTX and viewing tools”.

Inspected paths before implementation: SelectionToolbar.update hides unavailable
selection kinds but leaves editing groups and More visible with disabled children;
QuickTools.update disables creation buttons and closes settings, while native
slots and the More tray stay visible. watchNativeUiVisibility owns fixed native
menu display/hidden attributes reversibly and already observes root class changes.
The adopted native menu stays attached to its slot with original handlers.

Required parent hookup: pass effective reviewing (stored review OR slideshow)
to SelectionToolbarState.reviewMode; pass editable=false to QuickToolsState;
set/remove `miro-canvas-reviewing` on the native Canvas root. Public signatures
are unchanged. Native visibility observes that class without additional callbacks.

## Result

- Review selection without an actionable selected link has no floating toolbar.
  Shape/font/style/color/edge controls, layer section, Comment, Lock and More
  are hidden together. Entering review closes every already-open popover.
- A selected link with onOpenLink has one direct, localized external-link button;
  the normal link action remains in More outside review. No board-edit callback
  is emitted by opening a link.
- The native slot is hidden as a whole, including its adopted native menu and
  middle-pan snapshot. Read-only inspection of M1.adoptNativeMenu confirmed
  both are appended to this slot. Their contents and event handlers are retained.
- Locked selections outside review keep the existing Unlock action and blocked
  editing controls. Exiting review restores current selection kinds and controls.
- QuickTools hides creation tools, the shape wrapper, drawing button and native
  creation slots. Select/lasso stay available. More is hidden when empty in review,
  but remains usable when selection choices live there; repeated updates do not
  close that useful tray. Tool order, layout configuration and folded settings
  are retained. Entering review cancels an owned held creation drag and removes
  its ghost without a create callback. Disposal also cancels owned drags.
- The fixed native UI watcher additionally observes `miro-canvas-reviewing`.
  It suppresses review menus even if native display/hidden changes afterward,
  restores the latest external values on exit/disposal, and retains suppression
  while independent/capture/presentation reasons still apply. No board scan or
  content mutation is added.

## Worker verification (unit/synthetic only)

- 175 tests passed across selection-toolbar, quick-tools, native-ui-visibility
  and unchanged native-menu-state. Review entry with an open More, nine selection
  shapes, useful/no-handler links, restoration, locked-only Unlock, retained
  native handlers, native external writes, late native creation buttons, selector
  trays, and held touch/pen/mouse creation cancellation are covered. Fake pointer
  dispatch in these tests is not Android or physical stylus input.
- Focused TypeScript passed using all repository compiler flags, including
  noImplicitOverride/isolatedModules, plus Obsidian ambient DOM augmentation.
  Owned helper ESLint passed with --max-warnings 0. Scoped git diff --check passed.
- One final Impeccable detector run on the three changed TS targets returned []
  with exit 0. No CSS, locale, M1, main, dock or presentation edits were made here.
- Headless Playwright Chromium passed 12 full-stylesheet synthetic cases:
  desktop/tablet/phone sizes, light/dark class variants and horizontal/vertical
  toolbars. The link-only toolbar measured 36px in this minimal synthetic host, with no
  visible hidden group, native menu, snapshot or extra editing button; callbacks
  opened one link and emitted zero board edits. Native restoration and useful
  selector tray/empty-tray hiding also passed. Native touch target sizing remains
  a parent check; this host does not substitute for Obsidian mobile controls.
  This is DOM/CSS synthetic evidence,
  not screenshots or native Obsidian acceptance. Receipt:
  `tools/obsidian_cdp/.out/review-menu/browser-receipt.json`.
- A concurrent whole-repository check initially reported in-progress vector PDF
  and M1 export test errors outside this worker's ownership; it is not reported
  as green here. Final full checks/build belong to the parent integration pass.

## Parent native checks still required

Native Windows and connected physical Android in MiroCanvasTest must verify
node/edge/mixed/independent/attachment/comment selections in effective review
(stored mode OR slideshow), with an editing popover already open at entry.
Confirm hidden controls have zero rendered bounds, no empty toolbar/group gap,
link opening remains reachable, and native middle-pan snapshots cannot appear.
Exit review and slideshow, verify normal/locked-only menus and latest native
visibility, then switch boards/unload and confirm source/unknown fields, native
history, camera and selection remain unchanged by the visibility work.
Record model/Android/Obsidian versions and ADB versus CDP versus physical
stylus/human input separately. No native input, screenshots, foreground change,
commit or push was performed by this worker.



Parent native acceptance is now recorded in [vector/viewing checks](vector-viewing-acceptance.md); this scoped receipt retains its synthetic/unit attribution and limits.
