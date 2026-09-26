# Changelog

## Unreleased

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
