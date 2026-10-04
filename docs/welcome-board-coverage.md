# Welcome board coverage

Reviewed against README.md, `src/settings.ts`, `src/quick-tools.ts`, the
selection toolbar, board controls and import/export modules on 2026-10-04.
This distinguishes an editable example from an instruction: words about a
feature do not count as a demonstration of its result.

The original 0.2.1 Russian GIF used an older vault board. Its section numbers
and narrow introduction differed from the bundled final template. The guide
scenario now checks the template before recording and uses the correct
drawing/settings sections. Record in a fresh isolated vault.

| Capability | Earlier bundled guide | Current guide and how to try it |
| --- | --- | --- |
| Sticky notes, text fitting, note alongside stickies | Editable example | Section 2; edit a square sticky and its native note |
| Text, shapes, fill, highlight, font, rotation | Editable example | Section 4; rotate a sticky with an attached arrow |
| Partial text formatting, lists, Markdown, formulas | Missing partial formatting and formulas | Section 10 has Markdown/formula/code samples and selection instructions |
| Note links, native note and embedded Canvas | Editable example | Sections 2/3; open original note and nested Canvas |
| Heading/block links and Markdown embeds | Missing | Section 10 explains the syntax |
| Device image/document picker | Short footnote | Section 3 explicitly names Add file → From device and the copy into the vault |
| Image, PDF, Word and table | Editable examples | Section 3 has all four |
| Code blocks and website links | Mention only | Section 10 has a code block and a clickable Markdown web link; it does not preload a website |
| Connector routes, ends, styles, labels and label placement | Editable examples | Section 5: move a label, bend the curve, move an attached card |
| Connector snapping, free ends, experimental line-to-line attachment | Incomplete | Sections 5/12 describe free ends and settings; line-to-line attachment is explicitly experimental and off by default |
| Pen, pressure and translucent marker | Editable examples | Section 5 stores variable widths and a translucent stroke |
| Finger drawing, two fingers and double tap Escape | Text instructions | Sections 1/5/11, with independent Drawing settings |
| Smart shapes, two erasers, Shift/hold straightening, hide tool settings | Missing | Section 12 explains tool choice and gestures; destructive erasing can be tried on the section 5 stroke |
| Open comment, reply, free comment | Editable examples | Section 6 has a reply and a separate free pin |
| Resolved comment/checkmark and reopening | Missing resolved state | Section 6 has a real resolved thread and explains reopening |
| Comment author/colours, board/selection list | Incomplete | Sections 6/12 describe the comment list and author settings |
| Lock and whole-board review mode | Lock example only | Section 6 lock; section 12 explains review mode |
| Marquee/lasso, mixed selection, frame movement | Missing | Section 9 has two connected cards in a movable native frame |
| Layers, clipboard between boards, neighbouring-card arrows | Missing | Section 9 explains each action |
| Undo/redo, keyboard tool shortcuts | Instructions | Section 1 and the real navigation row; the sandbox remains editable |
| Minimap, zoom presets, fit-to-board, search results | Brief mention | Section 11 explains each control and next/previous search matches |
| Touch pan/zoom, selected/unselected dragging, long press | Incomplete | Section 11 specifies the gestures |
| Arrange, fold, hold-drag, orientation, order, Plus, minimap resize, device profiles | Instructions | Section 7; operate the live panels, rather than a picture of them |
| Hide panel buttons, reset layout | Missing | Section 7 now names both settings |
| Fonts, packs, order and hiding | Brief mention | Section 12 explains manual files, opt-in packs and the font list |
| Theme, zoom/wheel/mouse bindings, attachment names and update switch | Missing | Section 12 names the settings; no downloads happen from opening the board |
| Export PDF/PPTX result | Mock page, no exported document | Section 8 embeds actual two-page PDF and a PPTX produced by the real export scenario |
| Export page bounds, paper, orientation, quality, order, page per frame | Brief mention | Section 8 instructions and two saved page rectangles |
| Miro and other plugin imports, preview/report and source preservation | Miro guide only | Section 8 names supported sources and the preview/report |
| Imported slides/presentation | Missing | Section 8 explains presentation/export for imported slides; this local tutorial does not invent Miro source evidence |
| Native Canvas fallback, local comments and offline storage | Brief mention | Sections 6/8 state storage and display limitations |

## Real exported examples

`tools/welcome-export-samples/{en,ru}/Board-export.pdf` and `.pptx` are the
outputs of `tools/obsidian_cdp/scenarios/export-pages.mjs`, recorded in real
isolated Obsidian. Each has two pages/slides, Ideas and Next steps. They are
examples of another small board, not a claim that the current welcome board
was already exported. `tools/make_welcome_exports.py` verifies their container
signatures and bundles them as offline bytes. Refresh by recording the same
scenario, copying its actual outputs and rerunning the bundler.

The first-run action keeps an existing board. The settings action creates a
fresh copy at an unused path, so a person can get the current tutorial without
losing edits to their older board. Existing sample files are never overwritten.

Automated demonstrations do not establish physical pressure-sensor or palm
performance. Imported-source inspection, experimental connector chains and
MCP are specialist workflows documented separately; they do not run merely
because the welcome board was opened.
