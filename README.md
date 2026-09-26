# Miro Canvas

An Obsidian plugin: Miro's look and Miro's tools on Obsidian's own Canvas.

[Русская версия](README.ru.md)

## Contents

- [What it looks like](#what-it-looks-like)
- [Getting started](#getting-started)
- [Arranging the panels](#arranging-the-panels)
- [Bringing boards over from Miro](#bringing-boards-over-from-miro)
- [Drawing, lines and arrows](#drawing-lines-and-arrows)
- [What is on top of what](#what-is-on-top-of-what)
- [Comments](#comments)
- [Locking and review mode](#locking-and-review-mode)
- [Exporting to PDF and PowerPoint](#exporting-to-pdf-and-powerpoint)
- [The file stays a Canvas](#the-file-stays-a-canvas)
- [Reference](#reference)
- [Fonts](#fonts)
- [Languages](#languages)
- [Limits](#limits)
- [Network use](#network-use)
- [Installing](#installing)
- [Development](#development)
- [License](#license)

## What it looks like

You open a `.canvas` file as usual - it is still Obsidian's Canvas, with its
own cards, links, files and history - and the board behaves the way a Miro
board does. At the bottom there is a bar of tools: select, text, native
Canvas's own card, sticky note, shape, pen, lines and arrows, comment, frame,
native Canvas's note and file from the vault, and more. Settings → Miro
Canvas → **Tool bar** chooses which of them sit on the bar and in what order;
the rest stay under **More**. Select something and a toolbar appears above it,
laid out the way Miro's own is: shape, font and size, text style with
alignment, a bullet list and a link, colours, then a comment, a lock and its
own **More** - layer order, zoom to selection, edit and delete. A line or
arrow shows its own controls - ends, kind, thickness and colour - in that
place instead.
In the corner there is a minimap and a small dock with the zoom and the board's
settings.

A board brought over from Miro keeps its look: sticky notes in Miro's own
colours with text that fits, shapes and flowcharts, frames, code blocks, link
previews, presentations with their slides, and comments pinned where they were.

Nothing is lost when the plugin is off: the file opens as an ordinary Canvas.
The plugin goes to the network for one thing only - see
[Network use](#network-use).

## Getting started

1. Install and enable the plugin (see [Installing](#installing)).
2. Open any `.canvas` file, or create one.
3. Pick a tool at the bottom, or press its letter: **V** select, **T** text,
   **N** sticky note, **S** shape, **P** pen, **L** lines and arrows, **C**
   comment, **F** frame. Native Canvas's own card, note from the vault and
   file from the vault sit on the bar too, draggable onto the board as in
   Canvas itself - and so are the plugin's own text, sticky note, shape,
   comment, frame, code block, table and web link: press one of their
   buttons and drag onto the board to drop the item where you release it,
   or just click to place it centred where you clicked, as before. Code
   block, table and web link start under **More**; Settings → Miro Canvas →
   **Tool bar** moves anything between the bar and More, in whatever order
   you like.
4. Click the board to place the item; select it to style it.

The first time the plugin starts it offers a **welcome board** - twelve frames
with every tool on real items: text in several fonts and marks, colours and
markers, sticky notes, shapes and a flowchart, lines of every style, drawing,
layers, comments, code and tables, a note and other files, export pages - and
asks whether you want to import boards from Miro. Any answer is fine: both
stay under Settings → Miro Canvas → **Getting started**. Creating the board
also creates a small folder of sample files beside it (a note, a small
canvas, a picture, a PDF and a Word document), so its "Files and notes" frame
always points at real files.

## Arranging the panels

The board's own menu (the gear in the corner dock) has an **Arrange panels**
item, and there is a command with the same name. It puts the board into a
mode with a banner across the top: drag the bottom bar, the corner dock's
icon row or the minimap to a new corner or edge - each stays inside the view
and in its place however the window is resized, and turns vertical near a
side edge. The bottom bar and the dock's icon row can also be turned
between a row and a column directly, with a small flip button beside their
drag handle, whichever edge they sit on; a vertical bar opens its own menus
and rows sideways, towards the middle of the board, instead of off the edge.
Drag a tool on the bottom bar to reorder it, off the bar onto the
board to put it in a tray instead, or back from the tray onto the bar at any
point; this writes the same **Tool bar** setting the settings tab edits, so
either way works and neither is a second source of truth. **Reset** in the
banner puts everything back; **Done**, Escape, or opening another board
leaves the mode. The selection toolbar always keeps following the selection.

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

## Drawing, lines and arrows

- **Pen, highlighter, smart drawing** - a stroke is its own item on the board.
  Smart drawing turns a rough shape into a clean one, or a rough line into an
  arrow. Hold **Shift** for straight strokes.
- **Erasers** - a whole stroke, or the part under the pointer.
- **Lines and arrows** - straight, angled, curved, block arrows, polylines and
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

## Exporting to PDF and PowerPoint

The board menu's **Export to PDF or PowerPoint** marks pages on the board -
rectangles of one paper size (A4, A3, Letter, 16:9, 4:3 or free), moved by
their tab and resized by their corner. They are kept with the board but are
never cards, so nothing on the board changes. **A page per frame** adds a page
around every frame. A presentation's bar has its own export, whose pages are
its slides. Each page is photographed the way Obsidian's own **Export as
image** does it and packed into a PDF or a PowerPoint deck; a small window
shows the progress and can stop it.

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

A letter arms its tool whether the bar shows it or not. Native Canvas's own
card, note from the vault and file from the vault have no letter; Settings →
Miro Canvas → **Tool bar** chooses which of every tool above sit on the bar
and in what order - the rest stay under **More**.

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
- Toggle attachment names
- Open Miro Canvas controls, open source and provenance inspector
- Local shapes, comments, anchors and documents
- Describe the selected element (for reporting a problem)
- Reset tools and selection
- Convert legacy line nodes to connectors, initialize board metadata

</details>

<details>
<summary><b>Settings</b></summary>

- **Navigation** - zoom step, zoom towards the pointer, the wheel's modifier,
  minimum and maximum zoom.
- **Panning** - pan step and the fast multiplier with Shift.
- **Lines** - what ends attach to (cards and comments, the empty board, other
  lines), magnet and snap distances, where new labels sit, which mouse
  gestures draw lines, pan or lasso.
- **Keyboard**, **Interface** - the minimap by default, the selection toolbar.
- **Comments** - your name and the authors' colours.
- **Getting started** - the welcome board and the Miro import guide.
- **Developer diagnostics** - a badge listing what the plugin could not do.

</details>

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

1. In Obsidian, open Settings → Community plugins → Browse, find **BRAT**
   (Obsidian42 - BRAT), install it and enable it.
2. Open the command palette (Ctrl+P, or Cmd+P on a Mac) and run
   **BRAT: Add a beta plugin for testing**.
3. Paste `NixWrk/Obsidian-Plugin---Miro-Canvas` as the repository, keep the
   latest version, and press **Add Plugin**.
4. Enable **Miro Canvas** in Settings → Community plugins, if BRAT has not
   done so already.

With updating at start-up turned on in BRAT's own settings, BRAT installs
each new release when Obsidian starts; **BRAT: Check for updates to all beta
plugins and UPDATE** does it on demand. The plugin's own update check (see
[Network use](#network-use)) only tells you that a new version is out; with
BRAT it arrives by itself.

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
`python -m tools.obsidian_oracle.smoke_plugin_ui`). Agents working on this
repository start with [AGENTS.md](AGENTS.md); the design notes and the task
list live in [docs/miro-canvas.md](docs/miro-canvas.md).

## License

[MIT](LICENSE)
