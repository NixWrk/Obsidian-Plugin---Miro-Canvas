# Changelog

## Unreleased

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
