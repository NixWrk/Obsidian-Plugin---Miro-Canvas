# Miro Canvas

**A visual workspace for your Obsidian notes, with Miro-style tools.**

Plan with sticky notes, sketch diagrams, draw and leave comments — all on
Obsidian's own Canvas. Bring in notes and attachments from your vault and
connect them with arrows. Your board stays a local `.canvas` file.

[Русский](README.ru.md) · [Install](#installing) · [Get started](#getting-started) · [User guide](docs/guide.md) · [Releases](https://github.com/NixWrk/Obsidian-Plugin---Miro-Canvas/releases)

![Create a sticky note, add an Obsidian note and connect them with an arrow](docs/media/en/sticky-with-note.gif)

## What you can do

| Task | Tools |
| --- | --- |
| **Plan and organize** | Sticky notes, text, shapes, flowcharts and frames that move with their contents. |
| **Use your notes** | Vault notes, `[[links]]`, embeds, images, PDFs, code blocks and Markdown tables. |
| **Connect ideas** | Straight, elbowed and curved arrows with labels; attached lines follow the cards. |
| **Draw** | Pen, highlighter, smart shape recognition and whole-stroke or partial erasers. |
| **Discuss and review** | Comment threads, replies, resolved comments, item locks and board review mode. |
| **Make it yours** | Fonts, colors, light/dark board themes, movable panels, tool order, search and a minimap. |
| **Share the result** | PDF and PowerPoint export with pages you arrange yourself or create from frames. |

Panels and tool choices are remembered separately for computers, tablets and
phones. Android supports touch navigation, stylus drawing and optional finger
drawing. The interface is available in English and Russian.

<details>
<summary>See drawing and erasing</summary>

![Draw a stroke and erase it](docs/media/en/draw-and-erase.gif)

[Drawing tools and shortcuts](docs/guide.md#arrows-and-drawing)

</details>

<details>
<summary>See how to arrange the panels</summary>

![Move and turn the toolbar](docs/media/en/arrange-panels.gif)

[Panel layout, themes and fonts](docs/guide.md#make-it-yours)

</details>

<details>
<summary>See light and dark board themes</summary>

![Switch the board theme and keep your card colors](docs/media/en/board-theme.gif)

</details>

<details>
<summary>See PDF and PowerPoint export</summary>

![Arrange pages and save PDF and PowerPoint](docs/media/en/export-pages.gif)

[Example PDF](docs/media/en/export-example.pdf) · [Example PowerPoint](docs/media/en/export-example.pptx) · [Export guide](docs/guide.md#export)

</details>

Open the GIF at full size for small controls.

Export runs in the background, so you can keep editing or open another board.
Files are saved as new vault attachments. **Each page or slide is an image of
the board**; PowerPoint text and shapes are not separate editable objects.
Live web embeds and video are omitted.

## Installing

Requires **Obsidian 1.13.7 or newer**. Directory publication is pending; use
BRAT or install manually. Windows and Android have real-app checks; iOS,
macOS and Linux remain unverified. [Test coverage](docs/lint-remediation-checks.md).

### With BRAT

1. In **Settings → Community plugins**, install and enable **BRAT** by
   **TfTHacker**. Leave restricted mode if community plugins are blocked.
2. Open the command palette and run **BRAT: Plugins: Add a beta plugin for
   testing (with or without version)**.
3. Paste this into **Repository**, then press Tab:

   ```text
   NixWrk/Obsidian-Plugin---Miro-Canvas
   ```

4. Choose **Latest version**, keep **Enable after installing the plugin**
   selected and press **Add plugin**.

BRAT manages its own automatic updates. Releases named `fonts-…` are font
packs, not plugin releases.

### Manually

Download **`main.js`**, **`manifest.json`** and **`styles.css`** from the
[latest release](https://github.com/NixWrk/Obsidian-Plugin---Miro-Canvas/releases/latest).
Put them in `<vault>/.obsidian/plugins/miro-canvas/`, then enable **Miro Canvas**
in community plugins. Replace these three files to update.

## Getting started

1. Open or create a Canvas board.
2. Choose **Sticky note** (`N`) and click an empty place to write an idea.
3. Drag a note from your vault onto the board.
4. Choose **Lines and arrows** (`L`) to connect the two cards.
5. Select a card to change its color, font or shape.

For a guided tour, accept the first-run **welcome board**, or create it from
**Settings → Miro Canvas → Getting started → Create the welcome board**.
It includes editable examples, real notes and sample PDF/PowerPoint files.
Creating another copy preserves your existing boards.

Shortcuts work while you are not editing text:

| Key | Tool |
| --- | --- |
| V | Select |
| T | Text |
| N | Sticky note |
| S | Shape |
| P | Pen |
| L | Line |
| C | Comment |
| F | Frame |

**Escape** puts the tool away. **Ctrl + Z** / **Cmd + Z** undoes an action.
[Continue with the illustrated guide →](docs/guide.md)

## Bring in an existing board

- **From Miro:** use the separate [miro2obsidian](https://github.com/NixWrk/Miro_2_Obsidian)
  converter to create vault files, then open the board with Miro Canvas.
- **From Excalidraw, Enhancing Mindmap, Markmind or Advanced Canvas:** choose
  **Import into a board** from the file menu or command palette. Review the
  preview before creating the board; the original file is preserved.

Some styles and layouts are approximated; imported Miro tables lack cell
text because the source export does not supply it.
[Import instructions and limitations](docs/import.md).

## Your files and privacy

Boards stay in your vault. With the plugin disabled, ordinary Canvas still
opens native cards, notes and connections. Plugin styling, drawings, comments
and free-standing lines require Miro Canvas to display. Imported Miro source
data is preserved when you edit.

Editing works offline. The plugin's only network requests are a GitHub release
check at most once a day at startup (**you can turn it off**) and a font pack
download when you press **Download**. Release checks announce updates without
installing them. No account, payment, advertising or telemetry.

Device files, custom fonts and local imports read only the files you select
and copy the chosen data into the vault; the plugin does not scan external
folders. Website links and embeds can contact their sites through Obsidian.
BRAT, Sync and other plugins have their own network behavior.

Line-to-line connections are experimental and off by default. Moving a large
selection on boards with thousands of cards can be slow.

## Documentation and development

- [Illustrated user guide](docs/guide.md) — detailed steps and all demonstrations.
- [Commands and settings](docs/reference.md) · [Import guide](docs/import.md).
- [Changelog](CHANGELOG.md) · [Plans and design notes](docs/miro-canvas.md).
- [Contributing, checks and releases](docs/contributing.md).

### Working on this repository with an AI agent

Start with [AGENTS.md](AGENTS.md) and the [contributor guide](docs/contributing.md),
including the release, font-pack and GIF workflows. Interface work follows
[DESIGN.md](DESIGN.md); lint fixes first record affected actions in
[the regression register](docs/lint-remediation-checks.md).

Development uses Node **22.13+** on supported 22/24/26 lines:

```bash
npm ci
npm run check
npm test
npm run build
```

Agents can use the optional [CLI or MCP server](mcp/README.md) and
[miro-canvas-format skill](.agents/skills/miro-canvas-format/SKILL.md) to read and
edit boards. Ready-to-run tools are in the latest release and need **Node 20+**;
run them separately, outside the plugin folder. The plugin starts neither.

[Source compatibility notes](docs/contributing.md#remaining-source-warnings)
explain retained Node imports for these tools, the `.obsidian` default for
configuration and the command ID that preserves saved hotkeys.

## License

[MIT](LICENSE) · [Third-party notices](THIRD_PARTY_NOTICES.md).
Optional font packs include their own font licenses.

An independent community project by NixWrk, unaffiliated with Miro or Obsidian.
