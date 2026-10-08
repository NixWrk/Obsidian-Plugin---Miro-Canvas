## Working on this repository with an AI agent

This section is written so that a task can be handed to an AI coding agent
(Claude Code, Codex and the like) as it is. The agent reads it together with
[AGENTS.md](../AGENTS.md), which holds the rules of the code.

### Before any change

1. Run `git status -sb` and keep every change that is not yours.
2. Read [AGENTS.md](../AGENTS.md) (the file format, native Canvas first, words in
   both languages, minimal HTML, no network and no installs, large boards,
   code style) and [docs/miro-canvas.md](../docs/miro-canvas.md) (design notes,
   the Obsidian behaviour the code relies on, the task list).
3. Use a supported development Node version (22.13+ on the 22/24/26 lines),
   then run `npm ci` once. Standalone CLI/MCP downloads still target Node 20+.
4. Never change `miroSource` - the Miro data a board was imported with. Never
   work in the person's own vault or Obsidian profile: every check in a real
   Obsidian runs in an isolated one (see below).

### While working

Before each lint fix, trace the code's callers and affected user actions, then
record mandatory regressions in [the register](lint-remediation-checks.md)
before editing the implementation. Run those checks and distinguish real-app,
unit/synthetic and physical-device evidence.

- **Words.** Every string a person reads lives in `src/locales/en.ts` and
  `src/locales/ru.ts`, with the same keys. Russian is phrased the way a Russian
  interface speaks, not word for word, with the interface's own terms: фрейм
  (frame), рамка (border), маркер (highlight), порядок (layer order).
- **Gates** before every commit: `npm run check`, `npm test`,
  `npm run lint`, `npm run lint:css`,
  `npm run build`, `git diff --check`, and the three smoke suites
  (`python -m tools.obsidian_oracle.smoke_plugin_ui`, with `--interactions`
  and with `--controls`). A change under `mcp/` also runs `npm run mcp:build`.
- **The MCP server.** `mcp/` holds a server that lets agents read, check and
  edit boards through the plugin's own code (see [mcp/README.md](../mcp/README.md)).
  Build it with `npm run mcp:build`; run it with
  `node mcp/dist/miro-canvas-mcp.mjs --vault <absolute vault path> [--read-only]`.
  `mcp/` may import the plugin's pure modules from `src/` (none that touches
  Obsidian), never the other way round; it speaks stdio only. To read or edit
  a board as an agent, use the `miro-canvas-format` skill in
  [`.agents/skills`](../.agents/skills/miro-canvas-format/SKILL.md).
- **A real Obsidian.** Behaviour a person sees is checked in a real Obsidian
  with real input, not only in tests:
  [`tools/obsidian_cdp`](../tools/obsidian_cdp/README.md) starts an isolated
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
     checks, builds and publishes `main.js`, `manifest.json` and `styles.css`,
     plus the optional standalone MCP and CLI bundles.
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
[the Miro Canvas user guide](guide.md)
and every setting, each showing two things in turn:

1. **How to set it up** - where to click and what to choose. The caption
   starts with "1.", for example "1. Settings → Miro Canvas → Interface".
2. **The result** on the board. Name what changed, for example
   "2. The cards move together".

Each GIF exists in two languages: the English interface for guide.md, the
Russian one for guide.ru.md.

**Recorded:** 22 desktop examples and eight phone/tablet examples in both
languages (60 GIFs), placed beside their
feature descriptions. Coverage, readability review and remaining topics are
in the [guide review](../docs/visual-guide.md). Broad checklist items below stay
open when a recording covers only part of their actions.

**How**

1. `npm run build`, then
   `python tools/obsidian_cdp/launch.py --lang en --port 9336 --fresh`. This
   starts an isolated Obsidian with a fresh vault, this build and the welcome
   board open, so every recording starts from the same board.
2. Write one scenario per GIF in `tools/obsidian_cdp/scenarios/<name>.mjs` -
   the API and an example are in
   [tools/obsidian_cdp/README.md](../tools/obsidian_cdp/README.md). A scenario
   starts with `s.caption({ en: "1. ...", ru: "1. ..." })` and the steps that
   set the thing up, then a caption that explains the visible result
   and what it does. One file serves both languages: find elements by class,
   `data-*` attribute or settings tab id where available; otherwise provide
   both `textEn` and `textRu`. Keep a
   GIF to about 8–15 seconds; allow 20–30 seconds for typing or export when
   shorter timing would hide the result.
3. Record:
   `node tools/obsidian_cdp/record.mjs --scenario tools/obsidian_cdp/scenarios/<name>.mjs --out docs/media/en/<name>.gif`.
   Then relaunch with `--lang ru --fresh` and record the same scenario into
   `docs/media/ru/<name>.gif`.
4. Look at the result by opening several of its frames. Check that:
   - every step can be read and the cursor is visible;
   - nothing is cut off;
   - it is 960 px wide and no more than 4 MB.
5. Embed it right under the paragraph, list item or table row that
   describes the feature or setting: `![<what it shows>](media/en/<name>.gif)`
   in docs/guide.md, `media/ru/` in docs/guide.ru.md.
6. Commit each scenario with its two GIFs, and tick its line below in both
   contributor guides.

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
- [ ] `vault-items` - Canvas's own card, note and file from the vault: the
  button pressed and then the board, and the button dragged from the bar.
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
  into a column (and opening the pen's and lines' rows beside it), a tool
  into the tray and back, Reset, Done.
- [ ] `tablet-card-drag` - on a tablet: a selected card drags with a finger
  and with a pen; a turned card shows one frame (a tablet or phone; when none
  is at hand, write it down as not recorded).
- [x] `export` - Export to PDF or PowerPoint: pages, a page per frame, the
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

## Community directory submission

Run `npm run submission:check` after building and
`npm run submission:check -- --remote` after publishing the release.
Follow [the submission package](community-submission.md); new submissions
use Community Directory, not a pull request to obsidian-releases.
The local checker does not certify developer-policy compliance.

## Optional CLI and MCP downloads

With Node 20 or later, download `miro-canvas-cli.mjs` or `miro-canvas-mcp.mjs`
from the [release](https://github.com/NixWrk/Obsidian-Plugin---Miro-Canvas/releases/latest).
These optional agent tools run separately; put them outside the plugin folder.
To build the CLI locally, use `npm run cli:build`:

```bash
node mcp/dist/miro-canvas-cli.mjs --vault /absolute/path/to/vault list
node mcp/dist/miro-canvas-cli.mjs --vault /absolute/path/to/vault call read_board --input read.json
node mcp/dist/miro-canvas-cli.mjs --vault /absolute/path/to/vault batch --input batch.json
```

The CLI uses the same tool operations as MCP and prints one JSON result.
Exit codes are 0 for success, 1 for a tool or board-validation failure and 2
for bad usage or input. `--read-only` permits reading and checking only.
See the [CLI reference](../mcp/README.md#cli) for `--args`, `--stdin`, sequential
batches, revision handoff and undo limited to the current process.

## Remaining source warnings

The recorded 0.2.9 scan of `src/` and `mcp/src/` with the official Obsidian rules reports
**10 warnings and no errors**. The standalone Node lint reports no warnings or
errors; the plugin-only lint retains the one command-ID warning below.

| Warning | Sites | Reason |
| --- | --- | --- |
| Node builtin imports | 8 | The optional CLI/MCP programs use files, paths, hashes and stdin. They run under Node 20+, are excluded from `main.js`, and are never started by the plugin. |
| Literal `.obsidian` | 1 | The ordinary configuration folder is an explicit default. Custom folders work through `--config-dir`; operations use the selected folder. |
| `m1-commands` command ID | 1 | Existing users' saved hotkeys refer to this ID. Retaining it preserves them. |

The two console warnings and the type-only `node:stream` import from the 0.2.8
report are removed. CLI adds one necessary `node:fs` import, included in the
eight sites above. Standalone code forbids console calls; Ajv logging is disabled
while validation errors remain in JSON responses. These explanations do not
certify Community Directory acceptance; its next scan may report differently.
