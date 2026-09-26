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
- [Arranging the panels](#arranging-the-panels)
- [Bringing boards over from Miro](#bringing-boards-over-from-miro)
- [Exporting to PDF and PowerPoint](#exporting-to-pdf-and-powerpoint)
- [Fonts](#fonts)
- [The file stays a Canvas](#the-file-stays-a-canvas)
- [Reference](#reference)
- [Languages](#languages)
- [Limits](#limits)
- [Network use](#network-use)
- [Installing](#installing)
- [Development](#development)
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
  arrow. Hold **Shift** for straight strokes.
- **Erasers** - a whole stroke, or the part under the pointer.
- **With a stylus** the pen's pressure sets the line's width and a hand
  resting on the screen is ignored; while a drawing tool is on, a finger pans
  the board.
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
run every example board of it. Agents can read and edit boards safely with
miro2obsidian's `miro-canvas-format` skill.

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
- Toggle attachment names
- Open Miro Canvas controls, open source and provenance inspector
- Local shapes, comments, anchors and documents
- Describe the selected element (for reporting a problem)
- Reset tools and selection
- Show plugin status
- Convert legacy line nodes to connectors, initialize board metadata

</details>

<details>
<summary><b>Settings</b></summary>

- **Navigation** - zoom step, zoom towards the pointer, the wheel's modifier
  and direction, minimum and maximum zoom.
- **Panning** - pan step and the fast multiplier with Shift.
- **Connectors** - what line ends attach to (cards and comments, the empty
  board, other lines), magnet and snap distances, where new labels sit, which
  mouse gestures draw lines, pan or lasso.
- **Keyboard** - where to give the commands hotkeys.
- **Interface** - the minimap by default, the selection toolbar.
- **Getting started** - the welcome board and the Miro import guide.
- **Updates** - the daily check for a new version, and a button to check now.
- **Fonts** - font packs, your own font files, the font list.
- **Tool bar** - which tools sit on the bottom bar and in what order.
- **Comments** - your name and the authors' colours.
- **Developer diagnostics** - a badge listing what the plugin could not do.

</details>

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
```

`tools/obsidian_oracle` holds browser smoke tests against a synthetic Canvas
host and the scripts for testing in a real Obsidian vault; they need Python,
Playwright and miro2obsidian (`pip install -r requirements-dev.txt`, then
`python -m playwright install chromium` and
`python -m tools.obsidian_oracle.smoke_plugin_ui`). The font packs are built by
`tools/build_font_packs.py` and published from a `fonts-0.0.N` tag. Agents working
on this repository start with [AGENTS.md](AGENTS.md); the design notes and the
task list live in [docs/miro-canvas.md](docs/miro-canvas.md).

## License

[MIT](LICENSE)
