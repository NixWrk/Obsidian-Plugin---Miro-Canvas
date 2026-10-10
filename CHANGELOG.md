# Changelog

## Unreleased

- Refine the export panel with grouped page actions, compact paper/quality controls, native SVG action icons, a scrolling body and persistent Close/output actions; account for tablet safe areas and the real Android keyboard. Keep PDF/PowerPoint/SVG callbacks and independent rendering unchanged.

- Use a bidirectional radius arrow and restore the earlier marker movement with the live radius. Give side connection circles explicit accent outlines that remain visible over Obsidian tablet button rules.

- Replace the small circular shape-radius marker with a rounded-corner/drag-arrow icon and show the current radius above the held control during finger, pen or mouse movement; retain exact numeric input.

- Make the inherited board theme follow the owning Obsidian window rather than a conflicting OS preference; label it “Obsidian” / «Как в Obsidian». Follow live host changes and retain explicit board themes. Wrap long board-menu labels without displacing switches. Correct selected attachment-name checkbox state for native runtime nodes so repeated toggling and Undo/Redo work.

- Replace the selection More popover’s scattered icon grid with labelled action rows, consistent native controls, touch targets and Delete last. Keep the action list inside the available board area while Android’s keyboard is open.

- Keep rectangular shape corners circular at any width/height. Add a drag handle and exact input directly on the selected figure, plus a plugin-settings switch; remember the last radius for new rounded rectangles. Use wide/tall/square catalogue proportions for click/drop creation instead of making every figure a square.

- Add adjustable card corner radius (0–48 board pixels; square by default), preserving diagram and drawing geometry.
- Exclude supported CSS snippets from Canvas by default, with individual permissions in searchable settings. Preserve ordinary note styling and native/theme/plugin CSS; diagnose unsupported global rules and popout ownership instead of claiming complete isolation.
- Add independent SVG export with actual vector geometry/text and vertically stacked clipped pages. Preserve computed card typography/radius and native arrow transforms; embed only intrinsic raster attachments. Unsupported rich content reports a refusal; fonts remain references and cosmetic shadows are omitted.

- Expand board search to linked Markdown note contents and heading/block slices, with match-case, bounded regular expressions and explicit invalid/unsupported-pattern feedback.
- Add Flip for native and independent connections, connected/incoming/outgoing selection and optional highlighting. Add reversible group collapse as a view projection, retaining native cards, lines and stored geometry.
- Move a selection into a new board with preserved card IDs, styling, unknown fields and Miro source evidence; redirect crossing lines to the new file card and retain old card links through redirects. Undo restores the source selection but deliberately retains the target board.
- Add board properties, tags/aliases and individual-card links/embeds. Use guarded transient metadata caches plus graph/outgoing/backlink integration; discover property-only backlinks outside native results with genuine board navigation, supported only with an empty backlink filter.
- Add a separate board-property/tag file-result supplement for positive conjunctions, including typed searches. Unsupported OR, negation, regex, comparisons, typed operands and mixed content/file/path syntax fail closed for the supplement; native search remains unchanged.
- Add optional note-property-derived connections between file cards, reconciling only marked generated edges and preserving manual connections. Maintain property links and moved-card redirects across renames through checked writers.
- Prefer a permanent palette for new or uncustomized boards while preserving customized local palettes. Add named scoped CSS declarations from a restricted subset and zoom content thresholds with selection/editing exemptions.
- Wait for native Markdown rendering before independent PDF/PowerPoint capture so card text remains in background exports under default throttling.

The expansion remains unreleased; verification and remaining checks are
tracked in the [feature plan](docs/canvas-enhancement-plan.md).

- Refresh all 58 English/Russian guide GIFs with readable step captions, simpler workflows and clear final states. Add one board-theme switch example per language; keep card colors and content visible across both themes. Place panels beside the work, select cards before following links, and verify actual drawing/erasure and reachable controls.
- Simplify the English and Russian READMEs with a feature overview, quick installation and first steps. Keep all detailed instructions and existing GIFs in linked user guides; move CLI examples and source-warning notes to the contributor guides.
- Update development ESLint to 10.12.0 and Node 22 declarations to 22.20.5; development now requires Node 22.13+ on supported lines. Keep the three plugin runtime files unchanged and CLI/MCP downloads on Node 20+; rebuilding the standalone tools changes only unused package metadata. Pin html2canvas-pro 2.5.0: the next two patches declare Node 24 and are deferred.

## 0.2.10 - 2026-10-07

- Render PDF/PowerPoint pages from an independent board snapshot and pack files in a bundled Web Worker. Keep the working camera, selection and editing available; board switches retain running exports. Stop cancels the job, plugin unload aborts all jobs, and output paths remain tied to the source board. No screen capture or extra window.
- Keep board panels, default cards and their editing frames consistent when the board and Obsidian use opposite light/dark themes. Carry the board scheme into export and progress panels. Theme checks now reject white controls on a dark board and inspect actual colors while reading and editing on Windows and physical Android devices.
- Update the build and test toolchain together to esbuild 0.28.2 and Vitest 5.0.3, and browser checks to Playwright 1.63.0. Keep all existing behavior assertions.
- Use patched Moment 2.31.0 for the development SDK dependency, removing the remaining known npm audit advisories. This does not replace Obsidian's own runtime libraries.
- Update pinned GitHub Actions for Node/Python setup and release provenance. Group related Dependabot updates; defer incompatible TypeScript and Node declaration major upgrades with documented reasons.
- Building the repository now requires a supported Node version from 22.12 onward. Downloaded CLI/MCP still target Node 20+. The plugin minimum Obsidian version remains 1.13.7.

## 0.2.9 - 2026-10-07

- Publish ready-to-run `miro-canvas-cli.mjs` and `miro-canvas-mcp.mjs` as optional release downloads. Both require Node 20+; Obsidian only needs the usual three plugin files.

- Add an optional Node 20+ CLI built with `npm run cli:build` to list, call and batch the same board tools as MCP. Accept JSON arguments, file input or stdin, return one JSON result and explicit exit codes, and support custom configuration folders and read-only use.
- Run batch calls sequentially and stop at the first refusal, retaining earlier writes. Hand off revisions per board with `expectedRevision: "previous"`; undo remembers only the last change in the same process. MCP and the format skill remain available.
- Return JSON for CLI `--help` and `--version`. Remove standalone startup console redirects, forbid own console use and configure Ajv with `logger: false`, preserving structured validation errors. Replace the type-only `node:stream` import with the readline input type and a structural output writer. Explain retained Node imports, the explicit `.obsidian` default and the legacy hotkey command ID in both root READMEs; raw CLI I/O advisories remain visible.

## 0.2.8 - 2026-10-07

- Keep pen width steady while holding a stroke to straighten it and through pen lift. Recognize uneven smart-drawn rectangles by their sides and corners; preserve the orientation of rectangles, ellipses and triangles, rounded to 45-degree steps.
- Cancel a resize without adding an empty Undo step. Keep attached native edges and connector chains aligned with mixed selections during movement, commit and cancellation; preserve unknown endpoint, waypoint and comment fields.
- Keep selection menus inside the board and the search close button above folded controls on phones. Close comment threads and unsaved drafts when an outside press starts another board action, while keeping thread and pin controls interactive.
- Add a keyboard-accessible section selector to settings, put welcome/import actions first and use Obsidian's declarative settings API on supported versions. Clarify moving and resizing export pages and the numbered welcome route in English and Russian.
- Remove all remaining CSS `!important` and `:has()` selectors. Preserve native menu visibility, card alignment, paint and selected layer styles through scoped rules and reversible style ownership, restoring native values when the plugin unloads.
- Create HTML/SVG in the owning window, including detached previews and popouts. Keep delayed gestures, refresh polling and observers in that window and cancel pending work on unload or view changes.
- Wait for native PDF loading and initial page layout before fitting a document, with a two-second deadline and the existing native controls fallback. Closing its window cancels pending waits; export, Stop and save failures restore the board view.
- Keep native font fallback after a local font read fails and allow a later request to retry.
- Support custom Obsidian configuration folders through `--config-dir` in the optional standalone MCP server, with a separate Node runtime lint check in CI. The plugin does not start the server.
- Remove redundant TypeScript assertions and tighten private Canvas boundaries. Retain the existing command ID to preserve saved hotkeys; its one advisory lint warning remains documented.
- Record affected user actions and mandatory checks before lint changes. The final implementation passes 2,036 unit tests, browser smoke checks and scoped checks in installed Windows, Android tablet and phone Obsidian. The phone runs below the supported minimum; successful Android system clipboard roundtrips and physical pen pressure/palm/hover remain unverified. See [the regression register](docs/lint-remediation-checks.md) for evidence and limits.

## 0.2.7 - 2026-10-05

- Fix arrows disappearing on phones when no colour was assigned: support both native RGB-channel and complete CSS-colour theme variables for lines, arrowheads and block arrows, including off-screen edges after plugin reload.
- Fix the square outline around rounded native cards: paint their fill on the native face and leave the shell and inner Markdown surfaces transparent. Translucent fills are painted once.
- Restore source decorations before changing persisted appearance, preventing stale fills after undoing a shape change. Keep native styles intact when the plugin unloads.
- Verify light/dark themes, selection and plugin reload on desktop, Android tablet and phone, plus editing and shape undo in real desktop Obsidian.

## 0.2.6 - 2026-10-05

- Folded panels now clear their expanded inline spacing instead of overriding it with CSS `!important`. Explicit toggle-host and menu states replace seven `:has()` selectors and four `!important` declarations.
- Keep the fold button in place when a wide toolbar opens on a narrow phone: choose the roomier side and wrap within the available width. Preserve and restore this width when dragging or cancelling a drag.
- Keep search announcements visually hidden without `clip-path`, while retaining them for assistive technology.
- Read the interface language through Obsidian's public API; remove the obsolete local storage fallback.
- Check CSS advisory regression budgets in CI and release builds. Remaining advisories are still reported; this release does not claim a warning-free community review.

## 0.2.5 - 2026-10-05

- Fix export pages that could not be moved or resized with a mouse: the board’s selection tool intercepted their controls. Page labels and resize corners now handle their own gestures while the page interior stays available for board editing.
- Add English and Russian hover hints for moving and resizing export pages.
- Verify mouse dragging, live preview without premature saves, free resizing, A4 proportions and reopening saved page geometry in real desktop Obsidian.

## 0.2.4 - 2026-10-05

- PDF and PowerPoint export now work on desktop and Android through one browser backend. Files are saved as new vault attachments using Obsidian’s configured attachment location.
- Preserve native arrows, independent connectors and pressure strokes, including inherited SVG styles and modern theme colors.
- Restore the board view after export, cancellation or capture errors; bound page resolution independently of device pixel ratio.
- Fix community review’s blocking style assignment and Markdown component lifecycle errors. Run the official Obsidian linter in CI and release builds; existing advisory warnings remain visible.
- Update English and Russian welcome instructions and export examples. Live web embeds and video are excluded; iOS remains unverified.

## 0.2.3 - 2026-10-05

- Set the minimum Obsidian version to 1.13.7, the oldest version verified
  with the current plugin in a real app, instead of claiming untested 1.5 support.
- Shortened the catalog description and documented selected-file access outside
  the vault, privacy, licensing, installation status and platform coverage.
- Added a reproducible community submission check and listing materials for
  the current Community Directory process. Desktop-only export APIs remain
  an explicit review question for a mobile-capable listing.

## 0.2.2 - 2026-10-04

- Fold buttons no longer retain a hover background on tablets with a pen or
  mouse. Folding measures the actual button offset once instead of correcting
  an assumed size; moving an open vertical panel recalculates its available
  height. Unchanged refreshes no longer rewrite its layout styles.
- The welcome board now has twelve practical sections. It includes a resolved
  comment with a checkmark, actual exported PDF/PowerPoint examples, a movable
  frame, code and formula samples, and instructions for selection, layers,
  partial formatting, touch navigation, drawing tools, review mode and imports.
  Adding files from a device is described explicitly beside the attachments.
- Creating the welcome board from settings makes a fresh copy at a free path,
  preserving older boards and edits. First-run opening still keeps an existing
  board. Tutorial link syntax is displayed as code rather than executed embeds.
- Replaced the stale welcome recordings with tours of the current template.
  Added English/Russian Android recordings of repeated folding and held drags,
  with checks for button drift and lingering backgrounds. Added a documented
  feature-to-example audit and a real Obsidian regression script.

## 0.2.1 - 2026-10-04

- Double-tapping empty board with a pen puts the tool away without leaving
  dots or adding undo steps. Individual taps still leave dots.
- Pen pressure has its own Drawing setting. Width changes along the stroke
  while drawing and remains variable after saving, reloading and partial
  erasing. Highlighter strokes keep a constant width.
- Drawing with a finger is an optional setting. Two fingers still pan and
  zoom, and touches near the pen remain protected from accidental drawing.
- Arrange panels now resizes the minimap from its corner. Each device profile
  remembers its size; mobile layouts respect the chosen dimensions.
- Plus and fold controls sit together, with one separator before the tools.
  A long vertical menu keeps its fold button in place when reopening.
  The spare-tools tray no longer covers an open Plus menu.
- Updated the bilingual welcome board and added English/Russian recordings
  of drawing settings, live pressure, finger drawing, double tap and minimap
  resizing. Pen pressure in recordings is supplied through CDP; physical
  pressure sensors and palms are not verified by these recordings.

- Fold controls use a panel icon and a separator, with a hint for holding
  and dragging. Their icons stay centered in open and folded menus. Touch
  input no longer leaves a hover background behind. Panel placement accounts
  for the control's size before checking clearance above mobile navigation.
- On a narrow screen, a new welcome board starts at the first steps with a
  larger zoom. Reopening an existing board keeps its viewport.
- On mobile devices with the keyboard open, formatting menus open above the
  selection toolbar, clear of Android's native text-selection menu. Font lists
  fit the remaining space and scroll without covering the board header.
- Checked the current build on Galaxy A33: panel folding and dragging, adding
  tools from Plus, hiding fold buttons, selected-word formatting and importing
  an image and PDF from the device. Checked that selected-word formatting
  survives saving. Refreshed Russian and English phone layout, card movement
  and navigation GIFs.

- Fold buttons now sit inside each menu and use its square button shape.
  Each can be hidden in settings, separately for each device kind; arrangement
  mode keeps them accessible. Folded panels are square and remain movable by holding.
- In arrangement mode, tools can be dragged directly from Plus onto the main
  row, with an insertion marker. Touch scrolling no longer cancels these drags.

- Add file now offers a vault file or an image/document from the device's
  system picker. Device files become vault attachments with unique names.
- Font, size, bold, italic, underline and strike can be applied to selected
  words in a card without changing the rest of its text. Toolbar presses
  preserve the editor's text selection.
- Folding controls reserve space in the main tool row, clear of tool buttons.
  On desktop, an expanded panel shows its control only while arranging panels.

- Tools and navigation can fold into separate movable buttons. Tap to fold or open; hold then drag to move either an open or folded panel. Each device profile remembers its folded states.
- The bilingual welcome board now has square sticky notes, distinct introductory cards, a full-width introduction and examples of Obsidian notes and files earlier in the reading order.


- In panel arrangement, spare tools follow the toolbar instead of staying
  at the bottom of the board. The tray fits beside a column or above/below
  a row and stays within the available screen. Drag and turn controls now
  have separate 44px touch targets with a 12px gap. Reordering shows an
  insertion line before release and clears it when the drag ends or cancels.

- On narrow screens, the panel-arrangement instructions wrap above the
  buttons so the Russian Done button stays reachable.

- Rewrote both READMEs around common board tasks, with a shorter Russian
  introduction and separate import, reference and contributor guides. Added
  twelve GIFs recorded on a real Android phone and tablet in both languages:
  moving connected cards, panning/zooming and arranging panels. Examples use
  a compact phone toolbar and a vertical tablet toolbar.

- The welcome board now ships in English and Russian with an introduction,
  eight practical sections and a sandbox: Miro tools beside Obsidian notes,
  links and another Canvas, device layouts, customization and desktop export.
  New boards open at a readable introduction. The new Start here filename
  preserves older welcome boards and never overwrites existing samples.
- PDF and PowerPoint exports no longer include the separately placed minimap.
- Both READMEs now include fourteen short demonstrations in English and
  Russian: sticky notes beside real notes, Obsidian links and embeds, another
  Canvas, shapes, frames, selection, formatting, connected cards and undo,
  drawing, comments, search, panel placement and PDF/PowerPoint export.
  Recordings use smooth pointer motion, readable captions and pauses; most
  examples expand beside their feature descriptions. Export documentation
  explains that pages and slides are images of the board.

## 0.2.0 - 2026-10-02

- The bar's tools and where the bar, the dock and the minimap sit are now kept
  separately for a computer, a tablet and a phone (by Obsidian's own device
  kind), so a vault synced between a PC and a tablet can have a vertical bar on
  one and a horizontal on the other. Your saved layout becomes the layout of
  every kind at first, so nothing moves until you arrange panels on one device.
  Arranging, Reset and the settings' Tool bar list change only the device's
  own kind; all other settings stay shared. `data.json` holds the layouts
  under `layouts`, and still writes the computer's as `toolbarItems` and
  `panelLayout` where the previous release reads them. A save reads the file
  first and keeps the other kinds' layouts it holds, and a change of the file
  by a sync is picked up at once, so two devices open on one vault never
  overwrite each other's layout.
- A drag on a large board is much cheaper: the plugin no longer does work for
  every card on every move. A card that only moves keeps what is drawn on it
  and only its lines are drawn again, lock marks are written only when a
  card's lock changes, the board is measured once per drag, the poll leaves a
  followed drag alone, and a dragged selection shares what the move does not
  change. One card dragged at zoom 100 % takes 32 ms a move on the 2,000-card
  board (52 before; native Canvas 31) and 39 ms on the 5,000-card one (98
  before); 50 selected cards 36 and 49 ms (69 and 124 before); all cards 49
  and 120 ms (121 and 248 before). Medians of three runs; the arrow-key
  press with 5,000 cards selected is unchanged (about 1 s). Measurements in
  docs/miro-canvas.md, "Dragging large selections".
- A double click or a double tap on the empty board is now Escape and never
  makes a card: it puts the armed tool, the selection, an open comment and
  the open bar menus away, whatever tool was armed. Canvas's own double click
  made a text card there. A card still opens for writing on a double click,
  a line's label still edits, and the double click that finishes a polyline
  or a spline is still that line's own. A finger's or a pen's double tap is
  timed by the plugin, since the browser sends no double click for a touch
  that Canvas has taken for itself. With a drawing tool armed the two taps
  leave the dots they draw, then act as Escape. A touch that lands beside the
  pen is the hand that holds it, never a tap of a double tap.
- A card now opens on a double tap or a double click right after a tool of the
  bar was used. Canvas ignores a double click while a button has the
  keyboard focus, and a press on the board did not take the focus off the
  tool just pressed; now it does. A card being written in, the search field
  and every other text field keep their focus.
- Canvas's own card, note and file buttons (and the slide and group buttons
  on a tablet) now only pick the tool: a press arms the button, lit as the
  other tools are, and the next press on the board places the item there, once,
  and gives Select back - a card open for writing, or the picker of a note or
  a file. Before, the press made a card in the middle of the view. Escape and
  the double tap put the button away; review mode and a board locked in
  Canvas's quick settings arm nothing. Dragging a button onto the board works
  as before.
- Comments: a thread is resolved with a tick button and no caption, with a
  "?" beside it that explains resolving in a tooltip and, on a touch
  screen, under the header on a press. The long caption had squeezed the
  header's icons in Russian.
- Comments: a pin is now the speech bubble of the comment tool, with its
  tail on the comment's point, instead of a circle. A resolved pin keeps
  its author's colour and shows a tick in place of the letter, instead of
  turning grey. The lock mark moved to the pin's top-left so the tail and
  the open thread do not cover it.
- Search on the board: Ctrl+F (Cmd+F on macOS) on the board, the magnifier
  in the corner dock or the command "Search on the board" opens a bar at the
  top right that finds words in cards, sticky notes, shapes, tables, frame
  names, file names, links, line labels and comments, in Russian and in
  English alike. Enter and Shift+Enter step through the matches, the board
  moves to each and outlines it, Escape closes the bar. In a card being
  written Ctrl+F still searches that card; a setting turns the board's
  Ctrl+F off.
- Import into a board: Excalidraw drawings (`.excalidraw` and the
  Excalidraw plugin's `.excalidraw.md`, compressed or not), mind-map notes
  (Enhancing Mindmap, Markmind's outline mode) and Advanced Canvas boards
  become new boards, from a file's menu or the command palette. A preview
  shows what was found and how much comes over; the board is one new file
  next to the original, which is never changed. Every element comes over or
  is listed on an optional import report card, and a picture or embed that
  cannot come over leaves a dashed placeholder where it was. A pen stroke in
  Excalidraw's default ink takes the board's own pen colour for the theme the
  board opens in, so it no longer all but vanishes on a dark board.
- On a phone the tool bar and the corner dock stand above Obsidian's
  floating navigation bar instead of under it, and step aside while the
  keyboard is up. Their buttons are 40px wide, and handles take a finger
  from about 40px around. Menus and pickers stay on the screen.
- One finger on empty board pans and two fingers zoom on a touch screen;
  before, a finger drew a selection box and the board could not be moved.
- Obsidian's own Canvas controls no longer come back when another plugin
  (Advanced Canvas, Canvas Minimap) shows them.
- New cards, shapes, sticky notes and lines get ids of Obsidian's own kind.
  With Advanced Canvas's portals on, the old ids, which had a hyphen, hid
  the new item from the board, and it was never made.
- A tap on the tool bar no longer also moves the board when Canvas Minimap
  lies under it, and the bar over a selection keeps its one or two rows
  instead of squeezing into four.
- On a tablet the board's buttons keep their own size: Obsidian's wide
  tablet padding had squeezed the dock's icons out of sight, shrunk the pen's
  tools to dots, stretched the colours and pushed the tool bar onto two rows.
  The author's colour on a comment card is a small circle again, and so is
  a comment's pin, which had turned into an oval. One rule now gives every
  button the plugin draws the padding it was made with (the pins, the
  comment cards' and threads' buttons, the handles, the bars, the dock, the
  pickers, the search bar and the export included), so a button added later
  needs nothing of its own.
- With a stylus, a palm the tablet rejects leaves no trace: it no longer puts
  the selection away, nudges the board, or ends the pen stroke it landed
  beside.
- A pen hovering above the screen counts as the pen being near whatever tool
  is on, so a hand coming down with it is taken for the hand from the start.
- The pen's pressure sets the width around the pressure of ordinary writing:
  an everyday S Pen stroke keeps the width chosen and a harder one widens it;
  before, strokes came out about a third thinner than chosen.
- Hold to draw a straight line: stop the pen (or the mouse, or a finger that
  draws) for half a second at the end of a pen or highlighter stroke and the
  whole stroke becomes a straight line from where it began, its end following
  the pointer until it lifts. On by default; Settings → Drawing turns it off.
- On a tablet or a phone a card that is already selected drags as soon as
  a finger or a pen presses it and moves, in one undo step. Native Canvas on a
  touch screen moves a card only after a long press: a move that starts at
  once panned the board with a finger and did nothing with a pen, and on a
  selected card the browser took the move for a scroll of its own and called
  the pointer back after three moves, so the card could be picked but never
  dragged. A card that is not selected, a long press, two fingers and a hand
  resting beside the pen are as before.
- A turned card on a tablet or a phone shows one frame, the plugin's, turned
  with it. Obsidian's mobile styles drew four large square handles at the
  corners of the card's unturned box next to it (and left them where the card
  had been while it was dragged); they are hidden, and the frame's own
  handles, which take a finger from about 40px around, do their work.
- With the tool bar turned vertical (Arrange panels), the pen's settings (the
  pen, the highlighter and the other tools, the colours, then the width: its
  sample, a slider turned upright - the thicker line up - and the number) and
  the lines' settings (the kinds of line, the colours, then the width) are a
  second column of the bar, as they are a second row above a horizontal bar: a
  box of the bar's own look beside it, on the side towards the middle of the
  board, as wide as the bar - one button - with the bar's own gap between and
  its top level with the bar's, one control to a row, the colours as small as
  in the row. Taller than the bar it runs on past the bar's end but stays on
  the screen, above the phone's own bars; where the room is short it scrolls
  inside itself, never wrapping into a second column or squeezing its
  controls. The slider takes a finger's and a pen's drags to itself. Before,
  the settings were squeezed into a column as narrow as the bar, and their
  colours and width slider could not be reached. The bar itself, and the
  corner dock when it is vertical, hold one button to a row everywhere: native
  Canvas's card and note buttons, which on the tablet's Obsidian come with a
  slide and a group button of their own, had stood two to a row, and the rule
  before the "+" that opens More lay upright in a vertical bar.
- An armed tool shows it the same way on every button of the bars: the accent
  icon on the active background Select has. The pen, the highlighter, smart
  drawing, the erasers, the lasso, text, sticky notes, shapes, lines,
  comments, frames and the rest, on the bar, under More and among the pen's
  kinds and the lines' kinds in the settings, in both orientations. On a tablet
  the pen looked grey instead: a pen or a finger leaves the last control it
  touched "hovered" until the next touch, and the hover rule outweighed the
  armed one. Hover styles of the bars and the dock now apply only where a
  pointer can hover (`@media (hover: hover)`), and the armed look outweighs
  them where it can.
- A repeat press on the armed tool folds its settings away and leaves the tool
  armed; one more press shows them again. This is the pen's button for the
  pen's settings (whichever of the pen, the highlighter, smart drawing and the
  erasers is armed), the lines' button for the lines' settings and the shape
  button for its picker, in either orientation. Picking another tool, or this
  one again after another, opens its settings as before; the letters work as
  before.
- A stylus hovering over a control of the board on a phone or a tablet shows
  the control's name as a tooltip, in Obsidian's own look and after the delay
  the control asks for. Obsidian shows no tooltips there, so the pictures on
  the bars were unreadable to someone holding the pen. The tooltip goes when
  the pen leaves the control or the screen's range, or touches the screen; a
  finger never gets one, and on a computer nothing changes: the mouse keeps
  Obsidian's own tooltips.
- The lasso stays armed after a lasso, after Delete, Cut, Paste and Undo, until
  another tool is picked or Escape is pressed; before, it handed the board back
  to the select tool after every catch, and the catch lost the tool it was
  made with the first time something was done to it. A press on the catch (the
  shared frame, a selected card or line) moves it, in one undo step, and a
  press on a grip resizes or turns it, as with the select tool; by finger or
  pen too. A press anywhere else is a new lasso, which takes the place of the
  selection; with Shift held it adds to it. The board takes the keyboard focus
  after a lasso, so Delete and the arrows reach the catch. A lasso that the
  select tool's own mouse gesture starts still hands the board back to select.
- A card picked on the board no longer makes the plugin build its session
  anew. Obsidian reports "file opened" each time a card's editor takes the
  focus, one card picked for one, and the plugin answered each with a new
  session, which forgot the armed tool. A board that is another file, or whose
  runtime is new, still gets a session of its own.
- The minimap follows its setting and each board's own choice on phones,
  tablets and narrow windows too; before, a screen narrower than 900px always
  hid it and the dock's map button did nothing there. It is drawn smaller on a
  narrow screen.
- A labelled line no longer shows its label twice: native Canvas makes a
  line's own label only when it first draws the line - on opening an
  imported board, or once the line scrolls into view - and that label is
  now hidden behind the board's own as well.
- Bringing forward or sending back a card that is already there no longer
  writes anything, and layering on a board without the plugin's data never
  adds it.
- On a narrow board - a small window or an open sidebar - the bottom bar no
  longer runs under the corner dock: until either has been moved, the bar
  goes to the left edge, and when that is still too tight the dock and the
  minimap rise above it. A place you chose yourself is left as it is.
- AI agents can work with boards without Obsidian open: an MCP server in
  `mcp/` (`npm run mcp:build`, then run by the agent's MCP client) lists,
  reads and checks the boards of one vault, and adds cards, items, shapes,
  lines and comments, moves, restyles, rotates, layers, locks and deletes,
  through the plugin's own code - locks hold, the Miro import is never
  touched, and a board saved since the agent read it is never written over.
  `--read-only` leaves only reading and checking. It opens no network
  connection, and the plugin never starts it. The `miro-canvas-format` skill
  that explains the format to agents now lives in this repository
  (`.agents/skills/`) and points to the server first.
- Dragging many cards on a very large board costs the plugin less on every
  frame: the selection toolbar and the frame around a selection are measured
  once and then follow the cards, instead of measuring every selected card
  each frame, and what the selection holds is worked out once per selection.
- A selection that runs off the edge of the view keeps its toolbar over the
  part in view; cards native Canvas had taken off the page while out of view
  used to pull the toolbar towards the window's top-left corner.
- A long drag of many cards on a large board is written when you let go, as
  one undo step. It was refused ("the board changed") whenever native Canvas
  drew a card or frame for the first time during the drag, which reorders its
  list of cards without changing any. A card changed, added or removed
  meanwhile still refuses the move.
- Moving thousands of selected cards with the arrow keys, or dragging them
  the native way, is much faster with the plugin on: the locks are read once
  for all the cards of one step instead of once for each card. An arrow-key
  press with 2,000 cards selected takes about 0.9 s instead of 3.4 s, and with
  5,000 about 1.1 s instead of 17 s. Locked cards, cards in a locked frame and
  review mode are refused as before.
- While a selection is dragged, shapes, sticky notes and the other drawn
  cards stay as they are drawn and only the lines that follow them are drawn
  again, and the cards are measured once as the drag begins. On a board of
  5,000 cards a drag of 50 of them takes about 200 ms a move instead of 560.
- While cards alone are dragged, the frame around them and the selection
  toolbar move with the pointer instead of being measured on every move, and
  a line whose cards moved is redrawn along its new course instead of being
  built again. With the change above, a drag of all 5,000 cards takes about
  640 ms a move instead of 1.5 s.

## 0.1.1 - 2026-09-26

- The welcome window's buttons wrap onto a second line instead of running
  off its edge, and so do the export panel's.
- Font packs now come from the pre-release `fonts-0.0.4`. BRAT read the
  earlier `fonts-2` as version 2.0.0 and, while installing the plugin,
  first reported that the repository had no `manifest.json`.
- The README installs through BRAT step by step, as checked in a fresh
  vault, and describes every feature, with a table of what comes from Miro
  and what from Obsidian's Canvas.

## 0.1.0 - 2026-09-26

The plugin's first home of its own; before this it lived inside
[miro2obsidian](https://github.com/NixWrk/Miro_2_Obsidian), and its history came
along.

- Miro's look for boards brought over from Miro: sticky notes, shapes and
  flowcharts, frames, code blocks, link previews, presentations, comments.
- Creation tools at the bottom (select, text, sticky note, shape, pen, lines and
  arrows, comment, frame, code block, table, web link) with their letters.
- Drawing: pen, highlighter, smart drawing, erasers; stylus pressure.
- Lines and arrows of every kind, attached to cards, the board or other lines.
- Selection toolbar: fonts, colours, borders, shapes, line styles, locking.
- Layer order for cards: to front, forward, backward, to back.
- Comments with threads, replies, authors, resolving and locking.
- Export of marked pages or a presentation's slides to PDF and PowerPoint.
- Review mode, locks, minimap and a dock with zoom and board settings.
- English and Russian, following Obsidian's language.
- A first-run question and a guide for importing boards from Miro.
- A welcome board, offered on first run and from the settings: twelve frames
  that show every tool on real items, including a "Files and notes" frame
  and the small sample folder (a note, a canvas, a picture, a PDF and a Word
  document) creating the board writes beside it.
- A file on a board shows its name once: the plugin's own name for it steps
  aside once Canvas has drawn its label.
- Text placed in the middle or at the bottom of a card now sits there; it
  stayed at the top before.
- Highlighted text keeps the text colour the card sets.
- Words on sticky notes no longer break in the middle: the note's text had
  less room than its size was fitted to.
- Changing a card's look no longer raises a notice each time.
- A card keeps its font, size, colours and alignment while its text is
  edited; the editor showed Obsidian's default look before.
- Cards keep their look when Canvas draws them again - on large boards, on
  reopening a board and after reordering - instead of losing it until the
  board changed.
- A styled card keeps its look even when Obsidian replaces its DOM without the
  board itself changing - reopening a big board, a card scrolling into view,
  its editor opening - instead of only on the next edit.
- The font list offers only fonts every machine shows as themselves, and the
  fonts set in Obsidian's appearance settings; a font the machine lacks falls
  back to one of its own kind instead of Times New Roman.
- The Russian interface reads as Russian: one term for each thing (фрейм for
  a frame, рамка for a border, порядок for layer order, маркер for
  highlight) and natural phrasing instead of word-for-word translation.
- A line's label stays the size a card's text is at every zoom, instead of
  growing past the cards it joins once the board is zoomed out.
- Selecting a line or arrow offers its label's font: family, size, bold,
  italic, underline and strike, written the same way a card's own text is.
- A card's border style and width land where Canvas draws the border: a
  dashed or dotted border no longer has Canvas's own border inside it, and
  "no border" has none.
- The first change on a freshly opened board is kept: Canvas saved the board
  in its own stacking order, and a check comparing items by position took
  that for a changed graph and undid the change.
- A board no longer keeps a copy of all its data inside its settings: a board
  without settings had its data read as settings and written back into them
  on the first theme, review mode or minimap change. Any write clears such a
  copy.
- Normal work raises no diagnostics: no layer-order note on every board, no
  "locked element" when the order of a card next to a locked one changes, no
  note for every save Canvas rebuilds, no warning about the plugin's own
  fields; the adapter's status in the status bar shows only with the
  developer diagnostics on.
- Updates: once a day at start, unless turned off, the plugin asks GitHub for
  the latest release; a newer one shows in the status bar and opens its
  notes. Settings -> Updates has the switch and a button to check now.
- The bottom tool bar has native Canvas's own card, note from the vault and
  file from the vault back in quick access, draggable onto the board as in
  Canvas itself. The sticky note is a plain square and the shape tool
  Miro's square-and-circle picture, both in the icons' own colour; the
  card keeps Canvas's note icon. Settings -> Tool bar chooses which tools
  sit on the bar and in what order, the rest staying under More, and the
  settings page keeps its place while the list changes.
- The comment button looks the same on both toolbars.
- The selection toolbar is laid out the way Miro's own is: shape, font and
  size, text style with alignment, a bullet list and a link, colours, then a
  comment, a lock and its own More - layer order, zoom to selection, edit and
  delete, kept last as a danger item. A line or arrow shows its own controls
  in that place instead. New: a bullet list toggle for a card's text, a link
  field that turns a card's whole text (or a selection of it) into a Markdown
  link, and a comment button that pins one to the selection directly.
- Font packs: Settings -> Fonts offers downloadable font packs (Miro's own
  list, its Japanese and Korean fonts, open fonts drawn to Word's Calibri,
  Cambria, Arial, Times New Roman, Courier New and Georgia, and the fonts
  Excalidraw draws with), a font file of your own to add, and the font
  list's own pool - which families the toolbar's font popover offers, and in
  what order. A board naming one of Miro's font ids (`open_sans`,
  `times_new_roman`, ...) or a Windows font by name now renders in the real
  font once the matching pack is installed. Nothing is downloaded until you
  press Download.
- Arrange panels: the board menu's "Arrange panels" item, and a command with
  no default hotkey, put the board into a mode with a banner across the top.
  The bottom bar, the corner dock's icon row and the minimap - now its own
  panel, apart from the icon row - can be dragged to a new corner or edge;
  each stays inside the view and in place however the window is resized, and
  turns vertical near a side edge. A tool on the bottom bar can be dragged to
  reorder it, off the bar into a tray, or back from the tray onto the bar,
  writing the same Tool bar setting the settings tab edits. Reset puts
  everything back; Done, Escape or opening another board leaves the mode.
  The selection toolbar keeps following the selection, as before. The
  bottom bar and the dock's icon row can also be turned between a row and a
  column directly, with a small flip button beside their drag handle,
  whichever edge they sit on; a vertical bar opens its own menus and rows
  sideways, towards the board's middle, instead of off the edge.
- Text, sticky note, shape, comment, frame, code block, table and web link
  can now be dragged straight off the bottom bar (or the More menu) onto
  the board to create them there, the way native Canvas's own card, note
  and file buttons already do: press the button and drag past a few
  pixels to see a ghost of the item, then release over the board to create
  it centred where you dropped it, selected afterward, as one undo step.
  Releasing over a panel or outside the view, or pressing Escape, makes
  nothing; a plain click still just arms the tool.
- The dock's menus open inside the view wherever the dock sits: above or
  below its row, or beside it when it stands as a column. A moved panel no
  longer lands in the wrong place, partly off the board, when the plugin is
  turned on or updated.
