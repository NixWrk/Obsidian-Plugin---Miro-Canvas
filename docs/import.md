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
