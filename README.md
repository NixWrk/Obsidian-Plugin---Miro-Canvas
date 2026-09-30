# Miro Canvas

An Obsidian plugin: Miro's look and Miro's tools on Obsidian's own Canvas.

[Русская версия](README.ru.md)

## Contents

- [What it looks like](#what-it-looks-like)
- [What comes from Miro, what from Obsidian](#what-comes-from-miro-what-from-obsidian)
- [Getting started](#getting-started)
- [Things on the board](#things-on-the-board)
- [Styling a selection](#styling-a-selection)
- [Drawing, lines and arrows](#drawing-lines-and-arrows)
- [What is on top of what](#what-is-on-top-of-what)
- [Comments](#comments)
- [Locking and review mode](#locking-and-review-mode)
- [The corner dock and the minimap](#the-corner-dock-and-the-minimap)
- [Searching the board](#searching-the-board)
- [Arranging the panels](#arranging-the-panels)
- [Bringing boards over from Miro](#bringing-boards-over-from-miro)
- [Importing boards from other plugins](#importing-boards-from-other-plugins)
- [Exporting to PDF and PowerPoint](#exporting-to-pdf-and-powerpoint)
- [Fonts](#fonts)
- [The file stays a Canvas](#the-file-stays-a-canvas)
- [Reference](#reference)
- [Phones and tablets](#phones-and-tablets)
- [Languages](#languages)
- [Limits](#limits)
- [Plans](#plans)
- [Network use](#network-use)
- [Installing](#installing)
- [Development](#development)
- [Working on this repository with an AI agent](#working-on-this-repository-with-an-ai-agent)
- [License](#license)

## What it looks like

You open a `.canvas` file as usual - it is still Obsidian's Canvas, with its
own cards, links, files and history - and the board works the way a Miro
board does:

- **At the bottom** - a bar of tools: select, text, sticky note, shape, pen,
  lines and arrows, comment, frame, and Canvas's own card, note and file from
  the vault. Each Miro tool has its letter, as in Miro.
- **Above a selection** - a toolbar laid out the way Miro's is: shape, font,
  text style, colours, comment, lock.
- **In the corner** - a minimap and a small dock with undo, the zoom and the
  board's menu.

A board brought over from Miro keeps its look: sticky notes in Miro's own
colours with text that fits, shapes and flowcharts, frames, code blocks, link
previews, presentations with their slides, and comments pinned where they were.

Nothing is lost when the plugin is off: the file opens as an ordinary Canvas.
The plugin goes to the network for two things only, both described in
[Network use](#network-use).

## What comes from Miro, what from Obsidian

Miro Canvas is not a copy of Miro inside Obsidian. The board stays Obsidian's
own Canvas - its file, its cards, its links - and the plugin brings Miro's
way of working onto it.

| | Taken from Miro | Kept from Obsidian's Canvas |
| --- | --- | --- |
| **The board** | The tool bar at the bottom, one letter per tool, the toolbar over a selection, the minimap | The `.canvas` file in your vault, which opens without the plugin too; panning, zooming, selecting, undo and redo, copy and paste |
| **Things on it** | Sticky notes, shapes and flowchart shapes, named frames, code blocks, tables, comments | Cards, notes, pictures, PDFs and other files from the vault, web pages, groups |
| **Text** | Font, size, bold, italic, underline, strike, alignment, colour, highlight, bullet list and link, all from one toolbar; Miro's own fonts as a download | Markdown in every card, with links, embeds, formulas and everything else Obsidian shows in a note |
| **Lines and arrows** | Straight, elbow, curved, block arrows, polylines and splines; ends anywhere on the board; labels with their own font | A line between two cards is still Canvas's own edge |
| **Drawing** | Pen, highlighter, smart drawing, erasers | - |
| **Layers and locks** | Bring to front, forward, backward, to back; a moved card keeps its layer; locking | - |
| **Comments** | Pinned anywhere, with threads, replies, authors and resolving | - |
| **Export** | Pages marked on the board, or a presentation's slides, as PDF or PowerPoint | Each page is photographed the way Canvas's own **Export as image** does it |
| **Look** | Miro's colours for sticky notes and frames | Obsidian's theme colours and fonts |

Found in neither, and added here:

- **Panels where you want them** - the tool bar, the dock and the minimap go
  to any edge or corner, and the bars turn into columns.
- **Drag to create** - every tool that makes an item can be dragged off the
  bar onto the board, the way Canvas's own card, note and file buttons work.
- **Your own fonts** - font packs to download, font files of your own, and
  one list of the fonts you want to see.
- **Miro boards in your vault** - with a separate free program, whole boards
  come over with their look; the Miro data rides along untouched.
- **A welcome board** that shows every tool on real items.
- **A documented file** - everything the plugin adds sits under one key of
  the Canvas file and follows a published schema, so other programs and AI
  agents can read it.

## Getting started

1. Install and enable the plugin (see [Installing](#installing)).
2. Open any `.canvas` file, or create one.
3. Pick a tool at the bottom, or press its letter: **V** select, **T** text,
   **N** sticky note, **S** shape, **P** pen, **L** lines and arrows, **C**
   comment, **F** frame.
4. Click the board to put the item there - or press the tool's button and
   drag it onto the board, and let go where the item should be.
5. Select the item to style it.

Code block, table and web link start under the **+** menu at the end of the
bar. Settings → Miro Canvas → **Tool bar** chooses which tools sit on the bar
and in what order; the rest stay under **+**.

The first time the plugin starts it offers a **welcome board** - twelve frames
with every tool on real items: text in several fonts and marks, colours and
markers, sticky notes, shapes and a flowchart, lines of every style, drawing,
layers, comments, code and tables, a note and other files, export pages - and
asks whether you want to import boards from Miro. Any answer is fine: both
stay under Settings → Miro Canvas → **Getting started**. Creating the board
also creates a small folder of sample files beside it (a note, a small
canvas, a picture, a PDF and a Word document), so its "Files and notes" frame
always points at real files.

## Things on the board

- **Sticky notes** - square notes in Miro's colours. The text shrinks to fit
  the note, as in Miro.
- **Text** - text with no card behind it, starting where you click.
- **Shapes** - rectangles, circles, triangles, stars, clouds, arrows and more,
  and the full flowchart set: terminator, decision, document, database,
  manual input, delay and the rest. Hovering one in the picker says what it
  means in a flowchart. Text sits inside the shape.
- **Frames** - named areas that hold other items and move with them. They
  always lie under the cards.
- **Code blocks** - a code fence in a dark panel with its title, as Miro
  shows code.
- **Tables** - a Markdown table in a card.
- **Web links** - a web page on the board, the way Canvas shows one.
- **Cards, notes and files from the vault** - Canvas's own, with their own
  buttons on the bar: a Markdown card, a note, a picture, a PDF, another
  canvas, any file.
- **Comments** - see [Comments](#comments).

Select one item and it gets the handles Canvas lacks: a round grip below it
turns it (hold **Shift** for steps of 15°), and an arrow on each side adds a
connected item beside it with a click, or draws a line from it with a drag.

Copy, cut and paste keep everything the plugin knows about an item - its
look, its shape, its turn - within a board and between boards. A pasted file
still points at the same file in the vault; nothing is duplicated.

Each change is one step of undo.

## Styling a selection

Select something and a toolbar appears above it, in the order Miro's own
uses:

- **Shape** - turn a card into another shape.
- **Font and size** - the fonts in your font list (see [Fonts](#fonts)).
- **Text style** - bold, italic, underline, strikethrough; alignment left,
  centre, right or justified, and top, middle or bottom; line spacing.
- **Bullet list** and **Link** - a link turns the whole text, or the part
  you selected, into a Markdown link.
- **Colours** - text colour, highlight, fill; the border's colour, style
  (solid, dashed, dotted, or none) and width.
- **Comment** - pins a comment to the selection.
- **Lock** - see [Locking](#locking-and-review-mode).
- **More** - layer order, zoom to the selection, edit, delete.

A line or an arrow shows its own controls in that place instead: its two
ends, its kind, thickness, arrowhead size and colour, and its label.

## Drawing, lines and arrows

- **Pen, highlighter, smart drawing** - a stroke is its own item on the board.
  Smart drawing turns a rough shape into a clean one, or a rough line into an
  arrow. Hold **Shift** for straight strokes, or stop the pen for half a
  second at the end of a stroke: the whole stroke becomes a straight line from
  where it began, and its end follows the pen until you lift it. The setting
  "Hold to draw a straight line" turns this off.
- **Erasers** - a whole stroke, or the part under the pointer.
- **With a stylus** the pen's pressure sets the line's width and a hand
  resting on the screen is ignored; while a drawing tool is on, a finger pans
  the board (see [Phones and tablets](#phones-and-tablets)).
- **Lines and arrows** - straight, elbow, curved, block arrows, polylines and
  splines. A line whose ends are both on cards is an ordinary Canvas edge; a
  line with an end anywhere else - on the empty board, or on another line - is
  kept by the plugin. You do not see the difference: both are selected,
  styled, labelled, copied and deleted the same way.
- Ends snap to a card's outline and its key points; drag a line's body to bend
  it.
- A label's own font - family, size, bold, italic, underline, strike - comes
  from the same toolbar a card's text does, and stays the size a card's text
  is however far you zoom out.

## What is on top of what

Cards can be brought to the front, forward, backward and to the back - from
**More** in the selection toolbar, from the card's right-click menu,
or with commands you can give hotkeys. It works on a whole selection and keeps
the cards' order among themselves; one step of undo.

**Forward** and **backward** move a card past the nearest card that overlaps
it. Frames always lie under cards, as Canvas draws them, and lines have no
layers. As in Miro, moving or selecting a card does not bring it to the top.

## Comments

Pin a comment anywhere: on a card, on a point of a picture, along a line, or on
the empty board. Threads have replies, authors with their own colours,
resolving and locking. Comments imported from Miro stay read-only and can be
hidden. A panel lists every comment on the board or in the selection.

## Locking and review mode

A locked item cannot be moved, resized, rotated, retyped, restyled, reconnected
or deleted until it is unlocked. **Review mode** locks the whole board while
keeping panning, selection, links, copying and comments.

## The corner dock and the minimap

- **Undo and redo**, a button that shows or hides the **minimap**, and the
  zoom.
- **The zoom's percentage** opens the view menu: fit the board to the
  screen, zoom to 50%, 100% or 200%, the minimap, snapping to the grid and to
  other items.
- **The gear** opens the board's menu: the board's theme (as the system,
  light or dark), export to PDF or PowerPoint, review mode, file names on
  every attachment or only on the selected one, the plugin's commands, the
  source of an imported board, arranging the panels, and the plugin's
  settings.
- **The minimap** shows the whole board; click or drag in it to move the
  view there.

## Searching the board

**Ctrl+F** (Cmd+F on macOS) on the board, the magnifier in the corner dock or
the command **Search on the board** opens a search bar at the top right. It
looks through the text of cards, sticky notes, shapes and tables, the names
of frames, files and web links, the labels of lines and arrows, and every
message of a comment thread. Case, accents and ё/е do not matter; Markdown
and HTML marks are ignored.

- The counter shows where you are ("3 / 12"); **Enter** or **↓** goes to the
  next match, **Shift+Enter** or **↑** to the previous one, round from the
  last to the first.
- The board moves to each match and an outline marks it; a small card keeps
  the zoom you had, a large frame is zoomed out to. A comment opens beside
  its pin; a comment with no pin opens in the comments panel.
- **Escape** closes the bar and gives the board its keys back. The search
  changes nothing and selects nothing, so it works in review mode and on
  locked items too.
- Ctrl+F takes the board's search only while the board has focus and no text
  is being edited: in a card being written it still searches that card, as
  Obsidian does. The setting **Ctrl+F searches the board** turns it off.

## Arranging the panels

The board's menu (the gear in the corner dock) has an **Arrange panels**
item, and there is a command with the same name. It puts the board into a
mode with a banner across the top:

- Drag the bottom bar, the corner dock's icon row or the minimap to a new
  corner or edge. Each stays inside the view and in its place however the
  window is resized, and turns vertical near a side edge.
- Turn the bottom bar or the dock's icon row between a row and a column with
  the small button beside its handle, whichever edge it sits on. A vertical
  bar opens its menus sideways, towards the middle of the board.
- Drag a tool on the bottom bar to reorder it, off the bar onto the board to
  put it in a tray, or back from the tray onto the bar. This writes the same
  **Tool bar** setting the settings tab edits, so either way works.

**Reset** in the banner puts everything back; **Done**, Escape, or opening
another board leaves the mode. The selection toolbar always keeps following
the selection.

Until you move them, the bottom bar and the corner dock make room for each
other on a narrow board - with a sidebar open, say: the bar moves to the
left edge, and when even that is too tight the dock and the minimap rise
above it. Once you have placed either of them yourself, it stays exactly
where you put it.

## Bringing boards over from Miro

Importing is done by a separate free program,
[miro2obsidian](https://github.com/NixWrk/Miro_2_Obsidian), for Windows, macOS
and Linux. The plugin never downloads, installs or runs it - it only shows you
the way:

1. **Get miro2obsidian** - a ready-made build from its
   [releases](https://github.com/NixWrk/Miro_2_Obsidian/releases/latest).
2. **Or let an AI agent do it** - Codex or Claude Code can do every step with
   the `miro2obsidian-import` skill; the guide gives you a ready prompt with
   this vault's path in it.
3. **Create your own Miro app** - once, 10-20 minutes, no programming; Miro's
   security model asks for it.
4. **Export into this vault** in the **miro-canvas** format.
5. **Open the board** here.
6. **Remove the program** if you like - the boards do not need it.

The guide is under Settings → Miro Canvas → **Open the import guide**.

## Importing boards from other plugins

Drawings and maps made with other plugins become boards of their own:

- **Excalidraw** - a `.excalidraw` file or the Excalidraw plugin's
  `.excalidraw.md` note, compressed or not;
- **mind maps** - notes of the Enhancing Mindmap plugin and Markmind's
  outline mode (`mindmap-plugin: basic` in the note's properties);
- **Advanced Canvas** boards.

**How.** Right-click the file in the file list and choose **Import into a
board**, or open it and run the same command from the command palette. A
preview says what was found, where the new board will go and how many
elements come over exactly, approximately or not at all. **Create board**
makes one new file next to the original, `Name (board).canvas` (then
`Name (board 2).canvas`...), and opens it. The original file is never
changed, and the other plugin is not needed; to undo an import, delete the
new board.

**What comes across.** Excalidraw shapes, text, arrows and lines (bound
arrows hold on to their cards), pen strokes, frames, pictures from the vault
and embedded notes, with their colours, dashes, fonts and rotation. A mind
map's headings and lists become cards joined by curved lines, laid out as a
tree with Miro's blue centre. An Advanced Canvas board is copied whole - it
still opens in Advanced Canvas - and its shapes, borders, text alignment,
line styles, arrowheads and presentation order are drawn by this plugin too.

**What does not.** Excalidraw's hand-drawn roughness, hatching, groups,
transparency, cropping, background colour and the fill of closed lines;
pictures stored inside a plain `.excalidraw` file and web embeds leave a
dashed "Not imported" card where they were. A mind map has no positions of
its own, so its layout is new. Advanced Canvas portals stay file cards and
collapsed groups show open. Markmind's rich (non-outline) maps are not read
yet. Everything that did not come over exactly is listed on an **import
report card** placed beside the board (you can leave it off in the preview),
each element with its id and the reason.

## Exporting to PDF and PowerPoint

The board menu's **Export to PDF or PowerPoint** marks pages on the board -
rectangles of one paper size (A4, A3, Letter, 16:9, 4:3 or free), moved by
their tab and resized by their corner. They are kept with the board but are
never cards, so nothing on the board changes. **A page per frame** adds a page
around every frame. A presentation's bar has its own export, whose pages are
its slides. Each page is photographed the way Obsidian's own **Export as
image** does it and packed into a PDF or a PowerPoint deck; a small window
shows the progress and can stop it.

## Fonts

Cards, sticky notes and lines already offer the fonts every machine has, plus
Obsidian's own theme fonts. Settings → Miro Canvas → **Fonts** adds more:

- **Font packs** - Miro's own font list, its Japanese and Korean fonts, open
  fonts drawn to the metrics of Word's Calibri, Cambria, Arial, Times New
  Roman, Courier New and Georgia, and the fonts Excalidraw draws with.
  Download installs one, Remove takes it out again, both with their progress
  shown. A board imported from Miro, or one drawn with Excalidraw, may already
  name these fonts; installing the matching pack is what renders it in them.
- **A font file of your own** - "Add a font file" copies a `.ttf`, `.otf`,
  `.woff` or `.woff2` file into the plugin's own folder; its name is editable,
  and Remove takes the file out again.
- **The font list** - which fonts the toolbar's font popover offers, and in
  what order; a switch takes one out of the list without removing it.

See [Network use](#network-use): nothing is downloaded until you press
Download.

## The file stays a Canvas

Everything Canvas can express stays in Canvas's own fields. What it cannot -
fonts, colours, shapes, rotation, locks, comments, free lines, export pages -
lives under one extra key, `miroCanvas`, which Canvas ignores. A board imported
from Miro also carries `miroSource`, the Miro data as it was exported; the
plugin reads it and never changes it.

The format is written down as a versioned JSON Schema owned by miro2obsidian;
this repository keeps a pinned copy in [`schema/v1`](schema/v1) and its tests
run every example board of it. AI agents read, check and edit boards safely
with this repository's `miro-canvas-format` skill
([`.agents/skills/miro-canvas-format`](.agents/skills/miro-canvas-format/SKILL.md))
and its MCP server ([`mcp/`](mcp/README.md)), which works on the file through
the plugin's own code: locks hold, `miroSource` stays as it was, and a board
saved since the agent read it is never written over.

## Reference

<details>
<summary><b>Tools and their letters</b></summary>

| Letter | Tool |
| --- | --- |
| V | Select (and lasso, when it is on the bar) |
| T | Text |
| N | Sticky note |
| S | Shape - basic shapes and flowcharts |
| P | Pen, highlighter, smart drawing, erasers |
| L | Lines and arrows |
| C | Comment |
| F | Frame |

A letter arms its tool whether the bar shows it or not. Code block, table,
web link and Canvas's own card, note and file from the vault have no letter.

The letters work while the board has focus; editors keep their own keys.
Escape resets the tools and the selection.

</details>

<details>
<summary><b>Commands</b></summary>

Every command can get a hotkey in Settings → Hotkeys; none has one by default,
so nothing is taken from Obsidian or other plugins.

- Bring to front, bring forward, send backward, send to back
- Lock selection, unlock selection
- Toggle review mode
- Use system / light / dark board theme
- Zoom in, zoom out, reset zoom, fit board, toggle minimap, pan left / right /
  up / down
- Arrange panels
- Search on the board (Ctrl+F already opens it while the board has focus)
- Toggle attachment names
- Open Miro Canvas controls, open source and provenance inspector
- Local shapes, comments, anchors and documents
- Describe the selected element (for reporting a problem)
- Reset tools and selection
- Show plugin status
- Convert legacy line nodes to connectors, initialize board metadata
- Import into a board (from Excalidraw, a mind map or Advanced Canvas)

</details>

<details>
<summary><b>Settings</b></summary>

- **Navigation** - zoom step, zoom towards the pointer, the wheel's modifier
  and direction, minimum and maximum zoom.
- **Panning** - pan step and the fast multiplier with Shift.
- **Connectors** - what line ends attach to (cards and comments, the empty
  board, other lines), magnet and snap distances, where new labels sit, which
  mouse gestures draw lines, pan or lasso.
- **Keyboard** - where to give the commands hotkeys, and whether Ctrl+F
  searches the board.
- **Interface** - the minimap by default, the selection toolbar.
- **Getting started** - the welcome board and the Miro import guide.
- **Updates** - the daily check for a new version, and a button to check now.
- **Fonts** - font packs, your own font files, the font list.
- **Tool bar** - which tools sit on the bottom bar and in what order.
- **Comments** - your name and the authors' colours.
- **Developer diagnostics** - a badge listing what the plugin could not do.

</details>

## Phones and tablets

The plugin works in Obsidian for Android; it was checked on a Samsung Galaxy
A33 phone. iPhone and iPad are expected to behave the same but are not
checked yet.

- **The bars stay clear.** The tool bar and the dock stand above Obsidian's
  floating navigation bar and the phone's own navigation, and step aside
  while the keyboard is up, so the card you are writing in stays in view.
  The bar over a selection stays, for formatting.
- **Buttons for a finger.** Every tool stays on the bar, which wraps onto two
  rows of 40px buttons on a phone and keeps one row on a tablet; the dock's
  buttons are 40px too. Menus and pickers stay inside the screen and scroll
  when the keyboard leaves them little room.
- **The minimap** shows or hides as its setting and each board's own choice
  say, as on a computer, and the dock's map button works here too. It is drawn
  smaller on a narrow screen, above the dock, and steps aside while the
  keyboard is up.
- **Gestures, as in Obsidian's Canvas.** One finger on empty board pans and
  two fingers pinch to zoom. A tap selects a card and a second tap edits it.
  A card that is selected drags as soon as a finger or a pen presses it and
  moves; one that is not selected moves after you hold it for a moment, then
  drag. A long press on empty board draws a selection box, and a long press on
  a card opens its menu.
- **Handles** keep their small look but take a finger from about 40px around.
- **A stylus.** An S Pen comes to the board as a pen, with its pressure and
  tilt, and the board notices it as soon as it hovers above the screen,
  whatever tool is on. While the pen is near - hovering, drawing, or lifted a
  moment ago - a palm resting on the screen draws nothing, moves nothing and
  leaves the selection as it was, and a palm the tablet rejects leaves no
  trace even when it lands before the pen. While a drawing tool is on, a
  finger pans the board instead of drawing. The pressure sets the line's
  width around the pressure of ordinary writing: an everyday stroke keeps the
  width you chose, pressing harder widens it and a light touch narrows it a
  little. Stop the pen for half a second at the end of a stroke to turn it
  into a straight line. The pen's side button never reaches Obsidian, so it
  does nothing on the board.
- **Other plugins.** With Canvas Minimap on, its see-through map covers the
  lower part of the board; a tap on this plugin's bars no longer moves the
  board through it. With Advanced Canvas's portals on, a card whose id has a
  hyphen cannot be selected; the cards this plugin makes use Obsidian's own
  kind of id.

## Languages

The plugin speaks English and Russian. It takes the language Obsidian itself
speaks, and English for any other.

## Limits

- **Exporting to PDF and PowerPoint needs Obsidian on a computer**; on a phone
  or tablet the rest works, the export does not.
- **Tables from Miro arrive empty**: Miro's export carries no cell text.
- Lines attached to other lines are **experimental** and off by default.
- Very large boards (thousands of cards) stay responsive, but dragging many
  cards at once is slower than in Miro.
- The Advanced Canvas plugin is not needed; boards made for it open here too.

## Plans

Each item has its number and its details in
[docs/miro-canvas.md](docs/miro-canvas.md) (section "Future").

**New features**

- **Obsidian's community catalogue** - once the plugin is listed there,
  updates come through Obsidian itself, without BRAT.

**Improvements**

- **Phones, tablets, macOS and Linux** (`FUT-010`) - settings and layouts that
  suit each, checked on a list of real devices.
- **Huge boards** - dragging many cards at once as fast as in Miro.
- **Lines attached to other lines** - from experimental to on by default.
- **Tables from Miro** - their cell text, as soon as Miro's export carries it.
- In [miro2obsidian](https://github.com/NixWrk/Miro_2_Obsidian): ready-made
  builds of the exporter for Windows, macOS and Linux (`FUT-013`).

**Checks**

- **The visual guide** (`FUT-012`) - a GIF for every feature and every
  setting: first how to set it up, then the result. The task is written out
  in [Task: the visual guide](#task-the-visual-guide-gifs).
- **Every kind of link and formula** (`FUT-017`) - wiki and Markdown links to
  notes, headings and blocks, web addresses, embeds of notes, pictures, PDFs
  and other canvases, links from Miro boards, LaTeX inline and as a block - in
  a card as shown, while it is edited, in sticky notes and shapes, and in
  exported pages.
- **A new user's whole way on a clean machine** (`FUT-004`) - installing,
  the first settings, a Miro app, the export, the conversion, opening and
  editing a board - and fixing everything found on the way.

## Network use

Once a day, when Obsidian starts, the plugin asks GitHub's API for the number
of this plugin's latest release, so a newer one can show in the status bar
with its notes. Nothing else is sent, nothing is downloaded, and the plugin
never updates itself. Turn it off under Settings → Miro Canvas → Updates;
the **Check** button there asks on demand.

Font packs (see [Fonts](#fonts)) come from a release of this plugin's own
repository on GitHub. Nothing is downloaded until you press Download in
Settings → Miro Canvas → Fonts, and removing a pack only deletes files this
plugin wrote.

The MCP server for AI agents ([`mcp/`](mcp/README.md)) opens no network
connection at all: it talks to the agent over stdin and stdout and works on
files in one vault. The plugin never starts it; an agent's MCP client runs it
when a person has set that up.

## Installing

The plugin is not in Obsidian's community catalogue yet. The easiest way to
install it and keep it up to date is **BRAT**, a plugin that installs other
plugins straight from their GitHub releases:

1. In Obsidian, open Settings → Community plugins. In a vault that has
   never had one, press **Turn on community plugins** first.
2. Press **Browse**, search for **BRAT** and pick the one by **TfTHacker** -
   other plugins have similar names - then press **Install** and **Enable**.
3. Open the command palette (Ctrl+P, or Cmd+P on a Mac), type
   `add a beta plugin` and run **BRAT: Plugins: Add a beta plugin for testing
   (with or without version)**.
4. Paste `NixWrk/Obsidian-Plugin---Miro-Canvas` into **Repository** and press
   Tab. Under **Select a version** choose **Latest version** - the
   `fonts-…` entries there hold font packs, not the plugin - leave
   **Enable after installing the plugin** on, and press **Add plugin**.

BRAT's **Auto-update plugins at startup** is on from the start, so each new
release arrives the next time Obsidian starts; **BRAT: Plugins: Check for
updates to all beta plugins and UPDATE** does it on demand. The plugin's own
update check (see [Network use](#network-use)) only tells you that a new
version is out; with BRAT it arrives by itself.

BRAT asks GitHub about releases, and without a GitHub token GitHub answers
60 such questions an hour from one network. If BRAT says the rate limit is
exceeded, wait the minutes it names and try again.

**By hand**: download `main.js`, `manifest.json` and `styles.css` from the
[latest release](../../releases/latest) and put them into
`<vault>/.obsidian/plugins/miro-canvas/`, then enable **Miro Canvas** in
Settings → Community plugins. A new version is installed the same way.

## Development

```bash
npm install
npm run dev            # watch build
npm run build          # production build into the repository root
npm test               # unit tests
npm run check          # tsc --noEmit
npm run schema:check   # the pinned schema copy still matches miro2obsidian
npm run mcp:build      # the MCP server for agents: mcp/dist/miro-canvas-mcp.mjs
```

`tools/obsidian_oracle` holds browser smoke tests against a synthetic Canvas
host and the scripts for testing in a real Obsidian vault; they need Python,
Playwright and miro2obsidian (`pip install -r requirements-dev.txt`, then
`python -m playwright install chromium` and
`python -m tools.obsidian_oracle.smoke_plugin_ui`). The font packs are built by
`tools/build_font_packs.py` and published from a `fonts-0.0.N` tag. Agents working
on this repository start with [AGENTS.md](AGENTS.md); the design notes and the
task list live in [docs/miro-canvas.md](docs/miro-canvas.md).

## Working on this repository with an AI agent

This section is written so that a task can be handed to an AI coding agent
(Claude Code, Codex and the like) as it is. The agent reads it together with
[AGENTS.md](AGENTS.md), which holds the rules of the code.

### Before any change

1. Run `git status -sb` and keep every change that is not yours.
2. Read [AGENTS.md](AGENTS.md) (the file format, native Canvas first, words in
   both languages, minimal HTML, no network and no installs, large boards,
   code style) and [docs/miro-canvas.md](docs/miro-canvas.md) (design notes,
   the Obsidian behaviour the code relies on, the task list).
3. Run `npm ci` once.
4. Never change `miroSource` - the Miro data a board was imported with. Never
   work in the person's own vault or Obsidian profile: every check in a real
   Obsidian runs in an isolated one (see below).

### While working

- **Words.** Every string a person reads lives in `src/locales/en.ts` and
  `src/locales/ru.ts`, with the same keys. Russian is phrased the way a Russian
  interface speaks, not word for word, with the interface's own terms: фрейм
  (frame), рамка (border), маркер (highlight), порядок (layer order).
- **Gates** before every commit: `npm run check`, `npm test`,
  `npm run build`, `git diff --check`, and the three smoke suites
  (`python -m tools.obsidian_oracle.smoke_plugin_ui`, with `--interactions`
  and with `--controls`). A change under `mcp/` also runs `npm run mcp:build`.
- **The MCP server.** `mcp/` holds a server that lets agents read, check and
  edit boards through the plugin's own code (see [mcp/README.md](mcp/README.md)).
  Build it with `npm run mcp:build`; run it with
  `node mcp/dist/miro-canvas-mcp.mjs --vault <absolute vault path> [--read-only]`.
  `mcp/` may import the plugin's pure modules from `src/` (none that touches
  Obsidian), never the other way round; it speaks stdio only. To read or edit
  a board as an agent, use the `miro-canvas-format` skill in
  [`.agents/skills`](.agents/skills/miro-canvas-format/SKILL.md).
- **A real Obsidian.** Behaviour a person sees is checked in a real Obsidian
  with real input, not only in tests:
  [`tools/obsidian_cdp`](tools/obsidian_cdp/README.md) starts an isolated
  Obsidian with a fresh vault and this build, drives it through the DevTools
  protocol, takes screenshots and records GIFs. Obsidian 1.13 opens Settings
  and the plugin browser as separate windows; the tools pick a window by its
  title.
- **Line endings.** On Windows the working tree uses CRLF; do not use tools
  that rewrite them (`sed -i`).
- **Docs in step.** When behaviour changes, update README.md and
  README.ru.md, docs/miro-canvas.md and docs/miro-canvas.ru.md, and record it
  in CHANGELOG.md.

### Commits and releases

- Small commits, one logical change each, whose message says why. Push after
  every commit. Never force-push, never rewrite a published tag.
- **Tags and releases need the owner's word.**
- **A plugin release.**
  1. Set the new version in `manifest.json`, `package.json` and
     `package-lock.json`, and add it to `versions.json`.
  2. Write its `## x.y.z - date` section in CHANGELOG.md. This section
     becomes the release notes, and the plugin shows it in its update window.
  3. Push and wait for CI to pass.
  4. Push the tag `x.y.z`, without a "v". `.github/workflows/release.yml`
     checks, builds and publishes `main.js`, `manifest.json` and `styles.css`.
- **Font packs.**
  1. When a font changes, rebuild with
     `python tools/build_font_packs.py --write-catalogue src/font-pack-catalogue.ts`.
  2. Point `FONT_PACKS_RELEASE_BASE` in `src/font-packs.ts` at a new tag
     `fonts-0.0.N`, commit and push the tag.
     `.github/workflows/fonts.yml` rebuilds the packs, refuses them unless
     they match the catalogue byte for byte, and publishes a pre-release.
  3. Publish the fonts before the plugin release that points at them. Never
     delete a font release that a published plugin version still downloads
     from.

  Keep the `0.0.N` form: BRAT reads a tag's first number as a version, so
  a tag like `fonts-2` would outrank the plugin.
- **GitHub's API** answers 60 requests an hour without a token; check a
  release through
  `https://github.com/NixWrk/Obsidian-Plugin---Miro-Canvas/releases/download/<tag>/<file>`
  instead of polling the API.

### Task: the visual guide (GIFs)

**Goal** (`FUT-012`). A GIF for every feature in
[What comes from Miro, what from Obsidian](#what-comes-from-miro-what-from-obsidian)
and every setting, each showing two things in turn:

1. **How to set it up** - where to click and what to choose. The caption
   starts with "1.", for example "1. Settings → Miro Canvas → Interface".
2. **The result** on the board. The caption is "2. Result".

Each GIF exists in two languages: the English interface for README.md, the
Russian one for README.ru.md.

**How**

1. `npm run build`, then
   `python tools/obsidian_cdp/launch.py --lang en --port 9336 --fresh`. This
   starts an isolated Obsidian with a fresh vault, this build and the welcome
   board open, so every recording starts from the same board.
2. Write one scenario per GIF in `tools/obsidian_cdp/scenarios/<name>.mjs` -
   the API and an example are in
   [tools/obsidian_cdp/README.md](tools/obsidian_cdp/README.md). A scenario
   starts with `s.caption({ en: "1. ...", ru: "1. ..." })` and the steps that
   set the thing up, then `s.caption({ en: "2. Result", ru: "2. Результат" })`
   and what it does. One file serves both languages: find elements by class,
   `data-*` attribute or settings tab id, never by their visible text. Keep a
   GIF to 5-15 seconds.
3. Record:
   `node tools/obsidian_cdp/record.mjs --scenario tools/obsidian_cdp/scenarios/<name>.mjs --out docs/media/en/<name>.gif`.
   Then relaunch with `--lang ru --fresh` and record the same scenario into
   `docs/media/ru/<name>.gif`.
4. Look at the result by opening several of its frames. Check that:
   - every step can be read and the cursor is visible;
   - nothing is cut off;
   - it is 960 px wide and no more than 4 MB.
5. Embed it right under the paragraph, list item or table row that
   describes the feature or setting: `![<what it shows>](docs/media/en/<name>.gif)`
   in README.md, `docs/media/ru/` in README.ru.md.
6. Commit each scenario with its two GIFs, and tick its line below in both
   READMEs.

**A ready prompt for an agent:** "Read the section 'Working on this repository
with an AI agent' in README.md and AGENTS.md. Do the task 'The visual guide
(GIFs)' for these items: <names from the list>. Follow the rules there:
isolated Obsidian only, both languages, commit each GIF with its scenario,
push after every commit, no tags."

<details>
<summary><b>Features - one GIF each</b></summary>

- [ ] `tool-bar` - the bar at the bottom; the letters V T N S P L C F arm
  their tools.
- [ ] `sticky-note` - N, a click on the board, typing; changing its colour.
- [ ] `text` - T, a click, typing; font, size, bold and italic.
- [ ] `shapes` - S, the picker with basic shapes and the flowchart set, a
  hint's meaning, text inside; turning a card into another shape.
- [ ] `frames` - F, dragging a frame out, naming it, moving it with what it
  holds.
- [ ] `code-table-link` - a code block, a table and a web link from the **+**
  menu.
- [ ] `vault-items` - Canvas's own card, note and file from the vault, dragged
  from the bar.
- [ ] `drag-to-create` - dragging a tool off the bar onto the board.
- [ ] `selection-toolbar` - each group in turn: shape, font and size, text
  style and alignment, list and link, colours and border, comment, lock, More.
- [ ] `turn-and-connect` - the turn grip (with Shift, steps of 15°); a side
  arrow adds a connected item with a click and draws a line with a drag.
- [ ] `copy-paste` - within a board and between boards; a pasted file is still
  the same file.
- [ ] `lines-and-arrows` - L and each kind of line; ends on cards and on the
  empty board; bending a line; a label with its own font.
- [ ] `drawing` - pen, highlighter, smart drawing turning a rough shape into a
  clean one, both erasers, Shift for a straight stroke.
- [ ] `stylus` - pressure, a resting hand, and a stroke held still at its end
  turning straight (a tablet or touch screen; when none is at hand, write it
  down as not recorded).
- [ ] `layers` - to front, forward, backward, to back from More and from the
  right-click menu; a moved card keeps its layer.
- [ ] `comments` - C; a pin on a card, a picture, a line and the board; a
  reply, resolving, locking; the comments panel.
- [ ] `lock-and-review` - locking an item and trying to move it; review mode
  on and off.
- [ ] `dock-and-minimap` - the zoom menu (fit, 50%, 100%, 200%), moving the
  view through the minimap.
- [ ] `board-theme` - the board's theme: as the system, light, dark.
- [ ] `snapping` - snapping to the grid and to other items.
- [ ] `attachment-names` - file names on every attachment, or only on the
  selected one.
- [ ] `arrange-panels` - Arrange panels: dragging the panels, turning a bar
  into a column, a tool into the tray and back, Reset, Done.
- [ ] `export` - Export to PDF or PowerPoint: pages, a page per frame, the
  export and the file it makes.
- [ ] `fonts` - downloading a pack and choosing its font on a card.
- [ ] `welcome-board` - the first-run window and the welcome board.
- [ ] `import-from-miro` - the import guide, and a board imported from Miro
  keeping its look (stage one from the fixtures in `tools/obsidian_oracle`).
- [ ] `file-stays-canvas` - the plugin turned off: the board opens as an
  ordinary Canvas.
- [ ] `updates` - the status bar's note about a new version and its window.
- [ ] `install-brat` - the README's BRAT steps in a fresh vault (it asks
  GitHub about 30 times: at most once an hour).

</details>

<details>
<summary><b>Settings - one GIF each (Settings → Miro Canvas)</b></summary>

- [ ] `setting-zoom-step` - Navigation → Zoom step.
- [ ] `setting-zoom-to-pointer` - Navigation → Zoom towards the pointer.
- [ ] `setting-wheel-zoom` - Navigation → Wheel zoom modifier, and Invert
  wheel zoom direction.
- [ ] `setting-zoom-limits` - Navigation → Minimum and Maximum zoom.
- [ ] `setting-pan-step` - Panning → Pan step, and the fast multiplier with
  Shift.
- [ ] `setting-attach-to-cards` - Connectors → Attach to nodes and comments.
- [ ] `setting-free-ends` - Connectors → Allow unattached ends on the canvas.
- [ ] `setting-attach-to-lines` - Connectors → Attach to other lines and
  arrows (experimental).
- [ ] `setting-lasso-gesture` - Connectors → Lasso gesture.
- [ ] `setting-pan-gesture` - Connectors → Additional pan gesture.
- [ ] `setting-line-gesture` - Connectors → Line gesture.
- [ ] `setting-magnet-distance` - Connectors → Magnet distance.
- [ ] `setting-snap-distance` - Connectors → Key point snap distance.
- [ ] `setting-label-position` - Connectors → Default connector label
  position.
- [ ] `setting-hold-straight` - Drawing → Hold to draw a straight line.
- [ ] `setting-hotkeys` - Keyboard → Open hotkeys; giving a Miro Canvas
  command a hotkey and using it.
- [ ] `setting-minimap-default` - Interface → Show the minimap by default.
- [ ] `setting-selection-toolbar` - Interface → Selection toolbar.
- [ ] `setting-welcome-board` - Getting started → Create / Open the welcome
  board.
- [ ] `setting-import-guide` - Getting started → Open the import guide.
- [ ] `setting-updates` - Updates → Check automatically, and Check.
- [ ] `setting-font-packs` - Fonts → a pack's Download and Remove.
- [ ] `setting-own-font` - Fonts → Add a font file; renaming and removing it.
- [ ] `setting-font-list` - Fonts → Font list: hiding a font, moving it up.
- [ ] `setting-tool-bar` - Tool bar: a tool off the bar, a new order, Reset.
- [ ] `setting-your-name` - Comments → Your name, and how it signs a comment.
- [ ] `setting-author-colours` - Comments → Author colours.
- [ ] `setting-diagnostics` - Developer diagnostics and the badge it shows.

</details>

## License

[MIT](LICENSE). Code adapted from other projects (the LZ-string decompressor
that reads compressed Excalidraw drawings) is listed with its licence in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
