# Repository guide for coding agents

## Mission

`miro-canvas` is an Obsidian plugin that gives native Obsidian Canvas Miro's
look and Miro's tools. It extends the Canvas view; it never replaces it. A
board stays a valid JSON Canvas file that opens without the plugin, and the
plugin never goes to the network.

## Start here

1. Run `git status -sb` and preserve unrelated changes.
2. Read `README.md` for what the plugin does, and `docs/miro-canvas.md` for the
   design notes, the Obsidian runtime facts the code relies on and the task
   list.
3. `npm ci` once; then work with the commands below.

## Commands

```bash
npm run check          # tsc --noEmit
npm test               # vitest unit tests
npm run build          # main.js next to manifest.json and styles.css
npm run schema:check   # schema/v1 still equals miro2obsidian's pinned schema

# Browser smoke tests against a synthetic Canvas host (Python + Playwright)
pip install -r requirements-dev.txt
python -m playwright install chromium
python -m tools.obsidian_oracle.smoke_plugin_ui
python -m tools.obsidian_oracle.smoke_plugin_ui --interactions
python -m tools.obsidian_oracle.smoke_plugin_ui --controls
python -m pytest -q tools/obsidian_oracle/tests
```

## Rules

- **The file format.** Use native Canvas fields whenever they express the
  change; the plugin's own data lives under `miroCanvas` (versioned,
  `schemaVersion: 1`). Never modify `miroSource`: it is the imported Miro data,
  source evidence. Keep every unknown field at every level. The contract is
  miro2obsidian's JSON Schema, pinned in `schema/v1` by `schema/pin.json`;
  change the format there first, then refresh the copy with
  `node scripts/sync-schema.mjs`.
- **Native first.** Prefer native Canvas elements and mechanics and uniform
  behaviour: a line between two cards is a native edge; one history step per
  user action through native Canvas history.
- **Private Canvas API.** Read Obsidian's own behaviour before relying on it;
  keep private-API access narrow and failing closed.
- **Words.** Every string a person reads lives in `src/locales/en.ts` and
  `src/locales/ru.ts` (the Russian table must have exactly the English keys),
  read with `words()` when the interface is built. Diagnostics for maintainers
  stay in English.
- **Minimal HTML.** Items the tools create are plain text, Markdown fences and
  Markdown tables.
- **No network, no installs.** The plugin never downloads, installs or runs
  anything (Obsidian's directory rules); links open in the browser on a press.
- **Large boards** (thousands of cards) must stay responsive: no work per card
  per frame, memoize on the board's identity.
- **Code style.** One statement per line, descriptive names, short comments in
  the board's own words (cards, lines, the board).

## Definition of done

- Interaction invariant: during drag, resize, or rotation of a node, frame,
  attachment, comment, connector, or mixed selection, every attached native
  edge and plugin connector (including connector-to-connector chains) follows
  the same preview geometry before pointer release. Never mix an uncommitted
  projected document with stale native runtime positions. Do not persist
  preview frames. Add focused tests that inspect paths before release and after
  commit/cancel, including group selections and non-default zoom.
- Selection invariant: one pointer gesture has one visible marquee.
  Rectangle/lasso selection includes native nodes and edges, independent
  connectors, and comment pins in the same bounds. Keep neighboring-node
  controls in a transparent overlay on the native single-node selection; never
  add a second visible node outline merely to host them. A rectangle captures
  connector endpoints separately: a crossing body alone selects neither end,
  and moving a selection must not translate a far end outside the original
  rectangle. Preview, commit, undo, and repeated drags use the same
  captured-end mask for native and independent connectors.
- Add or update focused tests for changed behaviour; run the commands above and
  `git diff --check`.
- Verify user-facing behaviour in a real Obsidian vault with real input, not
  only in the synthetic host.
- Update README.md, README.ru.md and the docs when behaviour changes; record
  user-visible changes in CHANGELOG.md.

## Testing in a real vault

`python tools/obsidian_oracle/setup_m0_vault.py` copies the built `main.js`,
`manifest.json` and `styles.css` into the project-local test vault
(`_obsidian_oracle_vault`), stages the offline compatibility boards and enables
the plugin; `python tools/obsidian_oracle/check_environment.py` checks it. The
scripts refuse arbitrary vault paths and link/reparse points, and never register
or open a vault in an Obsidian window by themselves.
