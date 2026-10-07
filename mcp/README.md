# miro-canvas MCP server and CLI

An [MCP](https://modelcontextprotocol.io) server that lets an AI agent - Claude
Code, Codex or any other MCP client - read, check and change the miro-canvas
boards of one Obsidian vault while Obsidian is closed, through the plugin's own
code. A board stays an ordinary `.canvas` file that opens with or without the
plugin.

- It works on the files of **one vault**, named on the command line.
- It speaks MCP over **stdin and stdout only** and opens no network connection.
- **The plugin never starts it.** It is optional: an agent's MCP client runs it
  when a person has registered it.
- Every change goes through the same writers the plugin uses inside Obsidian:
  locks and review mode hold, `miroSource` (the Miro import) is never touched,
  fields it does not know are kept, and a board saved since the agent read it
  is never written over.

The skill [`miro-canvas-format`](../.agents/skills/miro-canvas-format/SKILL.md)
tells an agent how to use it and how the format works.

## Download

From [release 0.2.9](https://github.com/NixWrk/Obsidian-Plugin---Miro-Canvas/releases/tag/0.2.9)
or a later release, download `miro-canvas-cli.mjs` or `miro-canvas-mcp.mjs`.
Node 20+ is required; no dependency install is needed. Run the downloaded file
with `node /absolute/path/to/miro-canvas-cli.mjs --help`, or register the MCP
file with your client. These optional files go outside the plugin's installation
folder. Obsidian installs only `main.js`, `manifest.json` and `styles.css`.
The following examples use the same files built locally under `mcp/dist/`.

## Build

Node 20 or later.

```bash
npm ci
npm run mcp:build     # -> mcp/dist/miro-canvas-mcp.mjs
npm run cli:build     # -> mcp/dist/miro-canvas-cli.mjs
```

Each build produces one standalone file with everything inside it, including
the pinned board schema; running it needs no `npm install`. Copy it anywhere
you like. The CLI uses the same tool operations and board writers as MCP;
the MCP server and the skill remain available. Use CLI for local board work,
or MCP tools when already connected. The plugin starts neither program and
includes neither in `main.js`.

## Run

```bash
node mcp/dist/miro-canvas-mcp.mjs --vault /absolute/path/to/vault
node mcp/dist/miro-canvas-mcp.mjs --vault /absolute/path/to/vault --read-only
node mcp/dist/miro-canvas-mcp.mjs --vault /absolute/path/to/vault --config-dir Config
```

`--vault` must be an absolute path to a folder that holds its Obsidian
configuration, reached through no symbolic link or junction. By default the
configuration directory is `.obsidian`. If the vault uses a different directory,
pass the same relative path with `--config-dir Config` or `--config-dir=Config`.
Nested paths, such as `private/settings`, are supported. The directory must
already exist inside the vault and every component must pass the same filename,
traversal and link checks as board paths; `.trash` cannot be the configuration.
The server does not infer the directory or create it.

`--read-only` offers only the reading and
checking tools; the others do not exist. The server writes one line to stderr
when it starts; stdout carries the protocol and nothing else.

## CLI

With Node 20 or later, use the file produced by `npm run cli:build`:

```text
node mcp/dist/miro-canvas-cli.mjs --vault <absolute path> [--config-dir Config] [--read-only] list
node mcp/dist/miro-canvas-cli.mjs --vault <absolute path> [--config-dir Config] [--read-only] call <tool> --args <JSON>
node mcp/dist/miro-canvas-cli.mjs --vault <absolute path> [--config-dir Config] [--read-only] call <tool> --input <path>
node mcp/dist/miro-canvas-cli.mjs --vault <absolute path> [--config-dir Config] [--read-only] call <tool> --stdin
node mcp/dist/miro-canvas-cli.mjs --vault <absolute path> [--config-dir Config] [--read-only] batch --input <path>
node mcp/dist/miro-canvas-cli.mjs --vault <absolute path> [--config-dir Config] [--read-only] batch --stdin
```

`list` lists the available tools; use `call list_boards` to list board files.
For `call`, choose one input source: `--args` holds a JSON arguments object,
`--input` reads that object from a file, or `--stdin` reads it from stdin.
JSON input is limited to 8 MiB and batches to 1,000 calls.
The same vault and configuration-directory guards apply as for MCP; the
explicit default is `.obsidian`. `--read-only` exposes only reading and
checking tools.

Every invocation writes one JSON result to stdout. Exit status is 0 on
success, 1 on a failed tool call or board validation (`valid: false`), and 2
on bad command usage or input. Tool diagnostics stay in the JSON result;
input/startup errors are also written to stderr.
`node mcp/dist/miro-canvas-cli.mjs --help` and `--version` also return JSON
and do not require `--vault`.

For example, save this arguments object as `read.json`:

```json
{ "path": "boards/plan.canvas", "level": "summary" }
```

```bash
node mcp/dist/miro-canvas-cli.mjs --vault /absolute/path/to/vault call read_board --input read.json
```

A batch input is a JSON array of `{ "name": "<tool>", "arguments": { ... } }`
entries. Calls run sequentially and stop on the first refusal or failure.
Earlier writes remain; a batch is not a transaction. Save this as `batch.json`:

```json
[
  { "name": "read_board", "arguments": { "path": "boards/plan.canvas" } },
  { "name": "add_item", "arguments": { "path": "boards/plan.canvas", "expectedRevision": "previous", "type": "sticky_note", "x": 0, "y": 0, "text": "Next step" } }
]
```

```bash
node mcp/dist/miro-canvas-cli.mjs --vault /absolute/path/to/vault batch --input batch.json
```

Within one batch, `expectedRevision: "previous"` means the most recent
successful revision returned for the **same board** in that batch.
`read_board` can seed it. A call for another board does not replace it;
a previous process supplies no revision to a new batch. Dry runs retain the
actual file revision for handoff, not the hypothetical edited revision.

`undo_last` can restore only the last change remembered for that board in
the same process, subject to its revision check. For CLI use, put the change
and undo in one batch. A later CLI invocation has no undo record. This does
not create persistent native Obsidian Undo history.

## Tools

Boards are named by their path inside the vault, with forward slashes:
`"Projects/Plan.canvas"`.

### Reading and checking

| Tool | What it does |
|---|---|
| `list_boards` | The `.canvas` files of the vault or one `folder` of it, with size, time, whether they hold a Miro import, and the state of the plugin's record. Pages with `cursor`. |
| `read_board` | `level: "summary"` (default): counts by kind, frames, extent, locks, comments, export pages. `"items"`: cards, edges and connectors with id, kind, text (500 characters), box, rotation, lock, frame, layer - in pages (`offset`, `limit`), or only the `ids` named. `"full"`: the board without `miroSource`. `sourcePointer: "/items/0"`: that piece of `miroSource`. Always returns the board's `revision`. |
| `validate_board` | The board against the three schemas of `schema/v1` and the plugin's own reading. `valid` is true when neither has an error. |

### Changing (absent with `--read-only`)

Every change takes `path`, and optionally `expectedRevision` (the revision
`read_board` gave; the change is refused when the board was saved since) and
`dryRun` (work the change out and check it, but write nothing). Every answer
has the same shape:

```json
{
  "path": "boards/plan.canvas",
  "status": "applied",
  "dryRun": false,
  "written": true,
  "revision": "d221e3d6...",
  "previousRevision": "817f021e...",
  "changedIds": ["a2d568917e3f44fb"],
  "created": { "nodeId": "a2d568917e3f44fb" },
  "diagnostics": [],
  "warnings": []
}
```

`status` is `applied`, `noop` (nothing to change) or `rejected`; a rejected
change is reported as a failed tool call and its `diagnostics` say why, with a
stable `code`. Hand `revision` to the next change.

| Tool | Arguments (besides `path`) |
|---|---|
| `add_item` | `type` (`text`, `sticky_note`, `code`, `frame`, `table`, `link`), `x`, `y`, optional `width`, `height`, `text`, `label` (a frame's name), `url` (a link), `color` (a sticky note's colour by Miro's name, such as `light_yellow`), `title` (a code block's or a table's) |
| `add_card` | `x`, `y`, optional `kind` (`text`, `file`, `link`), `width`, `height`, `text`, `file`, `url`, `color` (`"1"`-`"6"` or `#rrggbb`) |
| `add_shape` | `shape` (rectangle, circle, triangle, a flowchart shape, ...), `x`, `y`, `width`, `height`, optional `text`, `colors`, `typography`, `borderStyle`, `borderWidth` |
| `update_node` | `id`, any of `text`, `x`, `y`, `width`, `height`, `color` (`null` removes it) |
| `move` | `ids`, `dx`, `dy` - cards, lines, connectors and comment pins (`miro-comment:local:<id>`) together |
| `set_style` | `ids`, any of `colors`, `typography`, `shape`, `borderStyle`, `borderWidth`, `connector` |
| `rotate` | `id`, `degrees` |
| `connect` | `from`, `to`, optional `label`, `route`, `color`, `width`, `startCap`, `endCap`, `strokeStyle`, `headSize`, `labelT` |
| `update_connector` | `id`, any of `label`, `from`, `to` and the look of `connect` |
| `delete` | `ids` - cards (with the lines that end on them), edges, connectors |
| `layer` | `ids`, `direction` (`front`, `back`, `forward`, `backward`) |
| `lock` | `ids`, `locked` |
| `comment` | `op` (`add`, `reply`, `edit`, `resolve`, `reopen`, `delete`), `commentId`, `text`, `anchor`, `author` |
| `undo_last` | nothing besides `path`: restores the last change remembered for that board in this process, while nothing has saved it since; in CLI use, keep it in the same batch |

The end of a line (`from`, `to`) or a comment's `anchor` is a card
(`{ "nodeId": "card-1" }`, optionally with `"side": "top" | "right" | "bottom" | "left"`;
without a side, the side facing the other end), a point
(`{ "x": 100, "y": 40 }`) or a full anchor
(`{ "type": "node", "nodeId": "card-1", "u": 0.5, "v": 0 }`,
`{ "type": "edge", "edgeId": "e1", "t": 0.5 }`,
`{ "type": "comment", "commentId": "c1", "origin": "local" }`). A line
between two different cards becomes a native Canvas edge; any other line is
kept as the board's own connector under `miroCanvas.connectors`.

Examples of `tools/call` arguments:

```json
{ "name": "add_shape", "arguments": { "path": "boards/plan.canvas", "expectedRevision": "817f021e...", "shape": "round_rectangle", "x": 0, "y": -200, "width": 240, "height": 120, "text": "Start here" } }
{ "name": "connect", "arguments": { "path": "boards/plan.canvas", "from": { "nodeId": "a2d568917e3f44fb" }, "to": { "nodeId": "card-1" }, "label": "then" } }
{ "name": "comment", "arguments": { "path": "boards/plan.canvas", "op": "add", "text": "Is this the first step?", "anchor": { "nodeId": "a2d568917e3f44fb" } } }
{ "name": "update_node", "arguments": { "path": "boards/plan.canvas", "id": "card-1", "text": "Renamed", "dryRun": true } }
```

## Safety

- **The vault only.** Paths are relative and end in `.canvas`; `..`, drive
  letters, `:` (alternate data streams), device names, names ending in a dot
  or a space and anything under the selected configuration directory,
  `.obsidian` or `.trash` are refused, including file-card references. The
  selected configuration subtree is also skipped by listings when its name
  is visible or nested. Sibling names that merely share its prefix remain
  accessible. Every
  folder on the way is checked not to be a link or junction, and the real path
  must be the path as written, inside the vault. Boards over 64 MB are refused.
- **No lost saves.** A board's revision is the SHA-256 of its bytes. A change
  with an older `expectedRevision` is refused before any work (`stale-board`),
  and every write checks the file again first. The file is written once per
  call through a temporary file in the same folder
  (`.<name>.<pid>.<random>.mcp-tmp`, created exclusively, flushed to disk)
  renamed over the board; the temporary file is removed on any failure. A save
  landing in the milliseconds between the last check and the rename cannot be
  seen.
- **Obsidian open.** Workspace files are read from the selected configuration
  directory, with all path components checked again for links and containment.
  When Obsidian's workspace shows the board open in a tab,
  an answer warns `open-in-obsidian`. Obsidian reloads a board that changed on
  disk, but edits made there and not yet saved can still be saved over the
  change: check the board there, or close it first.
- **The plugin's rules.** Locked items and review mode refuse changes as in
  Obsidian; `miroSource` is compared before every commit and never changes;
  fields the plugin does not know are kept at every level; geometry is
  written as whole numbers; JSON is written tab-indented, as Obsidian writes
  it, and a byte order mark is kept. A board holding whole numbers beyond
  2^53 is read (with a warning) but not edited, since writing it back would
  round them.
- **No network.** The server opens no connection and listens on no port; its
  bundle imports no network module (`http`, `https`, `net`, `tls`, `dgram`,
  `http2`, `dns`), which the tests check.

## Registering it with an MCP client

Build it first, then point the client at the built file and the vault. Use
absolute paths; on Windows, forward slashes work in JSON.

**Claude Code** - a `.mcp.json` in the project where you use the agent (or the
`mcpServers` section of your Claude Code settings):

```json
{
  "mcpServers": {
    "miro-canvas": {
      "type": "stdio",
      "command": "node",
      "args": [
        "C:/path/to/Obsidian-Plugin---Miro-Canvas/mcp/dist/miro-canvas-mcp.mjs",
        "--vault",
        "C:/path/to/your/vault"
      ]
    }
  }
}
```

**Codex** - `~/.codex/config.toml` (Codex keeps its configuration in TOML):

```toml
[mcp_servers.miro-canvas]
command = "node"
args = [
  "C:/path/to/Obsidian-Plugin---Miro-Canvas/mcp/dist/miro-canvas-mcp.mjs",
  "--vault",
  "C:/path/to/your/vault",
]
```

**Other clients** (Claude Desktop, Cursor, and most others) use the same
`mcpServers` JSON as Claude Code:

```json
{
  "mcpServers": {
    "miro-canvas": {
      "command": "node",
      "args": ["/path/to/miro-canvas-mcp.mjs", "--vault", "/path/to/vault", "--read-only"]
    }
  }
}
```

Add `"--read-only"` to the arguments to let the agent read and check boards
but never change them.

For a non-default configuration directory, also add `"--config-dir", "Config"`
(using the vault's actual relative path) to the client's arguments.

## Working on the server

The sources are `mcp/src`, the tests `mcp/tests` (run with `npm test`). `mcp/`
may import the plugin's pure modules from `src/`, never the other way round;
the build fails if anything it bundles imports `obsidian` or `electron`. The
MCP protocol is written by hand in `json-rpc.ts` (JSON-RPC 2.0, one message
per line). See "Agents: the MCP server and CLI" in
[docs/miro-canvas.md](../docs/miro-canvas.md) for the design.

Run the standalone MCP and CLI enforced lint separately:

```bash
node node_modules/eslint/bin/eslint.js --config mcp/eslint.config.mjs mcp/src
```

This scope uses Node globals and the JavaScript and TypeScript type-checked
recommended rules, including Promise, unsafe-value and control-character
checks. Obsidian's plugin/mobile rules describe a different runtime: this
server requires Node's filesystem, crypto, path and readline APIs and the
existing `ReadLineOptions["input"]` and `write(string)` contract; it does not have
an Obsidian `App` or `Platform`. The plugin lint configuration
remains separate.

The standalone scope forbids network modules, Obsidian/Electron imports,
subprocess imports, eval, network globals and own `console` use. Ajv uses
`logger: false`; structured schema errors remain in tool results. Startup
does not redirect the global console. Stdout carries only MCP protocol messages
or the CLI's one JSON result; CLI file input and stdin use Node APIs.
Configuration paths use the active standalone `Vault.configDir`; only its
explicit default initializer may name `.obsidian`. Focused lint fixtures and
bounded stdio-process tests enforce these rules. Seven existing genuine Node
builtin imports remain; the type-only `node:stream` import has been removed.
The CLI adds one `node:fs` import for file/stdin input. Those imports, the explicit
configuration default and legacy plugin command ID remain visible in the raw
plugin context; the current local official-rules scan reports 10 warnings and no errors.
