---
name: miro-canvas-format
description: Read, check and safely edit Obsidian Canvas boards made by miro2obsidian or the miro-canvas plugin - .canvas files with miroSource (the imported Miro snapshot) and miroCanvas (the plugin's metadata) - through the shared checked command-line tools or an available MCP server; both enforce locks, preserve miroSource and refuse stale writes. Use when a person asks what is on such a board, wants cards, lines, comments, layers, locks or export pages changed without Obsidian open, wants a board validated, or asks how the format works.
---

# Miro Canvas boards

A board is an ordinary JSON Canvas 1.0 file (`nodes`, `edges`) that native
Obsidian Canvas opens on its own. Two optional root keys carry what Canvas
cannot express:

- `miroSource` - the Miro board as it was exported. **Immutable evidence: never
  change, shorten, reformat or "fix" it.**
- `miroCanvas` - the plugin's versioned metadata (`schemaVersion: 1`): local
  look, locks, comments, independent lines, export pages, bindings to source
  items.

Everything the plugin draws falls back to plain Canvas without it, so edit the
native `nodes`/`edges` whenever they can express the change, and `miroCanvas`
only for what they cannot. Read [references/format.md](references/format.md)
before editing; it lists every field with the rules the plugin relies on.

## With the command-line utility

When the agent has a terminal, use the repository's CLI instead of inventing
JSON-edit scripts. It uses the same schema-checked operations and plugin writers
as MCP. If MCP is already connected, its tools are also appropriate; neither
frontend is required for ordinary editing inside Obsidian.

Building/testing the repository requires a supported development Node version
(22.12+ on the 22/24/26 lines). Build once with `npm run cli:build`. Node 20+ runs the
self-contained `mcp/dist/miro-canvas-cli.mjs`; copying that bundle requires no
dependency install. Use absolute paths to the executable and vault.

```powershell
node mcp/dist/miro-canvas-cli.mjs --vault C:/path/to/vault list
node mcp/dist/miro-canvas-cli.mjs --vault C:/path/to/vault call read_board --input read-args.json
node mcp/dist/miro-canvas-cli.mjs --vault C:/path/to/vault batch --input changes.json
```

The input for `call` is an arguments object, such as
`{"path":"Projects/Plan.canvas","level":"summary"}`. Use `--input` for JSON
files or `--stdin` for piped JSON to avoid shell quoting; `--args <JSON>` is
available for short objects. Add `--config-dir Config` for the vault's actual
configuration folder, or `--read-only` to expose only reading/validation tools.
Output is one JSON object; exit status 0 means success, 1 means a tool refused
the operation or validation found an invalid board, and 2 means invalid usage
or input. Inspect diagnostics even when the process exits successfully.

Read and validate before editing. Pass the revision returned by `read_board`
as `expectedRevision`, use `dryRun: true` to preview, then validate after the
actual change. For several calls, batch input is an array:

```json
[
  {"name":"read_board","arguments":{"path":"Projects/Plan.canvas"}},
  {"name":"update_node","arguments":{"path":"Projects/Plan.canvas","id":"card-1","text":"Renamed","expectedRevision":"previous"}},
  {"name":"validate_board","arguments":{"path":"Projects/Plan.canvas"}}
]
```

`previous` uses the last successful revision of the same board in that batch;
it never borrows another board's revision or a dry run's hypothetical revision.
Batches stop at the first failure. Earlier successful writes remain; a batch
is not a transaction. `undo_last` remembers only the last change of this process,
so CLI undo is usable inside the same batch, not from a later command. Close
the board in Obsidian before writing; these tools edit files, not the open view.

## With the MCP server

The miro-canvas repository ships an MCP server that reads, checks and changes
boards through the plugin's own code. When it is available, prefer its tools
to editing the JSON by hand: they enforce locks and review mode, never touch
`miroSource`, keep every unknown field, make ids the way native Canvas does,
and write atomically only when the file still holds the revision you read.

```powershell
npm ci
npm run mcp:build
node mcp/dist/miro-canvas-mcp.mjs --vault C:\absolute\path\to\vault [--read-only]
```

It speaks MCP over stdio, opens no network connection and needs nothing
installed beyond Node 20. The plugin never starts it; the agent's MCP client
does ([mcp/README.md](../../../mcp/README.md) shows how to register it).

1. `list_boards`, then `read_board` (`level: "summary"`, then `"items"` in
   pages; `sourcePointer` for a piece of `miroSource`). Keep the `revision`.
2. `validate_board` before changing anything.
3. Change with `add_item`, `add_card`, `add_shape`, `update_node`, `move`,
   `set_style`, `rotate`, `connect`, `update_connector`, `delete`, `layer`,
   `lock`, `comment`, passing `expectedRevision`; `dryRun: true` checks a
   change without writing it. Each answer gives the new `revision` for the
   next call. `undo_last` gives back the board as it was before the server's
   last change, while nothing has saved it since.
4. `status: "rejected"` with `stale-board` means the board was saved since you
   read it: read it again and redo the change; never force it.
5. `validate_board` again and report what changed (`changedIds`).

## Check a board

The contract is JSON Schema (draft 2020-12) in `schema/v1/` of the miro-canvas
repository, pinned from miro2obsidian's `miro2obsidian/schemas/v1/`
(`board.schema.json`, `miro-source.schema.json`, `miro-canvas.schema.json`),
with valid and invalid example boards in `fixtures/`. Check with, in order of
preference:

1. CLI or MCP `validate_board` - the schema and the plugin's own reading
   (ids used once, whole-number geometry, anchors that land, records about
   cards the board no longer has);
2. `python -m miro2obsidian.validate path\to\board.canvas` in the miro2obsidian
   repository, which prints `valid` or one issue per line as
   `<json-pointer>: <message>` and exits non-zero on an invalid board;
3. any draft 2020-12 validator against the three schema files.

Validate before editing (to know what was already wrong) and after (to prove
the edit kept the board valid).

## Edit safely

1. Work on a copy or make sure the person has one. A board open in Obsidian
   is a risk: the MCP server notices Obsidian's saves (and warns
   `open-in-obsidian` when a tab shows the board), but a board with unsaved
   edits open in Obsidian can still overwrite the change on its next save.
   Direct JSON editing requires the board to be closed in Obsidian.
2. Parse and write the whole file as JSON; keep every field you do not
   understand exactly as it is, at every level. Newer plugin versions add
   fields, and other plugins (Advanced Canvas) add their own.
3. New ids look like native Canvas's: 16 lowercase hex digits, unique among
   nodes, edges and `miroCanvas.connectors`.
4. Never write into `miroSource`; never create `miroCanvas.zOrder` (layer order
   is the order of `nodes`); never add a `miroCanvas` key to a board that has
   none unless the change needs one - then start it as
   `{"schemaVersion": 1}` plus what you add.
5. Validate again and report what changed.

## Common changes

- **Text, colour, size, position:** the node's own `text`, `color`, `x`, `y`,
  `width`, `height`. Geometry is whole numbers. (`update_node`, `move`)
- **Look beyond Canvas** (font, fill, border, shape, rotation):
  `miroCanvas.localOverrides[<node id>]`. (`set_style`, `rotate`)
- **Lock:** `localOverrides[<id>].locked = true`; locked items refuse edits in
  the plugin, so do not edit a locked item unless the person asks to unlock it.
  (`lock`)
- **Layer order:** reorder the card nodes in `nodes` (back first, front last);
  frames (`group` nodes) always stay under cards whatever their position.
  Lines and arrows have no layers. (`layer`)
- **A line between two cards:** a native edge. A line with an end on the empty
  board or on another line: `miroCanvas.connectors[<id>]`. (`connect`,
  `update_connector` choose the form themselves.)
- **A comment:** `miroCanvas.localComments`; imported comments live in
  `miroSource.comments` and are only hidden (`hiddenImportedComments`), never
  edited. (`comment`)
- **Pages to export:** `miroCanvas.export.pages` (rectangles in board units).
