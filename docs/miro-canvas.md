# miro-canvas

[English] | [Full Russian specification](miro-canvas.ru.md)

`miro-canvas` is an offline Obsidian plugin under active development that
extends native Canvas. On an ordinary board it is intended to add richer
editing, comments, locking, themes, colors, shapes, connector anchors, and a
clickable minimap. A future implementation is intended to render an imported
Miro snapshot more faithfully when a local Canvas contains `miroSource`, without
contacting Miro.

This document defines the architecture and implementation order. Miro export,
the canonical REST/Web SDK union, and JSON-to-Canvas conversion remain separate
from the plugin.

## Current implementation status

The M0 foundation is implemented at the root of this repository (until
2026-09-24 the plugin lived under `plugins/miro-canvas/` in miro2obsidian;
`FUT-002` moved it here). It includes the plugin shell, versioned `miroCanvas`
schema validation and in-memory migrations, read-only native/Advanced Canvas
adapters, an explicit metadata writer with a guarded atomic compare-and-swap
(CAS) bridge, and a deterministic four-profile compatibility matrix with a
project-local test vault harness.

Native Canvas rebuilds its document from its own model whenever it saves and
keeps only the root keys it owns, so `miroCanvas` and `miroSource` would be
erased by any ordinary native edit. The session installs one instance-scoped
hook on `getData` that carries across every root key still present in the live
document but missing from the rebuild — another plugin's data included, because
dropping it would be as destructive as dropping this plugin's own. `nodes` and
`edges` are always the host's to rebuild, a value the host produced itself is
never overwritten, and the hook is removed on dispose.

A document the host produced is read in its JSON form: values that JSON
serialization drops, such as an absent optional field left as `undefined`, are
normalized instead of treated as a corrupt document. Anything this plugin
installs as the new root still goes through the strict plain-JSON clone.
Because a host cannot be required to return the exact bytes it was given, an
accepted commit is verified on what the plugin owns: its own root keys must
survive byte-for-byte and the node and edge id sets must be unchanged. A commit
the host altered beyond that is refused and rolled back, and a rejected commit
now names the precondition it failed on.

M0 is not production-ready yet. The real-Obsidian gate remains open: native
Ctrl+Z/redo behavior for metadata actions and real visual/interaction
verification have not been claimed.

The current development checkpoint includes M1 navigation controls, a clickable
minimap, typography, board themes, colors, locks/review mode, and attachment
title visibility. The zoom range is chosen under Settings → Navigation
(6.25%–1600% by default, from 1% up to 6400%). The Chromium DOM smoke covers
the M1 controls against a synthetic native host, not the real Obsidian runtime.

A contextual formatting toolbar floats above the current selection whenever the
native DOM can be measured, and disappears as soon as the selection is cleared.
Following Miro, it is one compact row of icon buttons: shape, font family, font
size with a stepper, bold, alignment, one button per color slot, a lock toggle
and an overflow menu. Long lists never sit in the row itself. The shape button
opens the common kinds with **More shapes** revealing every supported Miro kind;
the overflow menu carries the remaining text formats, line height, border style
and width, and the full connector settings (route, line style, both end caps,
width). Controls that do not apply to the selection are removed from the row
rather than shown disabled, and only one popover is open at a time.

Typography and colors continue through the appearance pipeline; shape, border
and connector settings go through the guarded authoring transaction. Review mode
and locked elements leave the toolbar visible but inert with an explicit reason,
except the lock toggle, which stays live so an accidental lock can be undone.
The side panel keeps the same typography and color groups for now; that
duplication is removed once the toolbar is verified in the real Obsidian
runtime.

Zoom, fit and the minimap toggle sit in the navigation dock at the bottom of
the Canvas, beside the map they navigate, and the dock keeps carrying zoom while
the map itself is hidden. Panning, zoom, the minimap, review mode and locking
are registered commands, so Obsidian's own hotkey editor can bind them; the
plugin ships no default bindings and takes no keys from another plugin. A
settings tab configures the zoom step and range, whether zoom follows the
pointer, the wheel modifier, keyboard pan distance and its Shift multiplier, and
which surfaces are shown. A stored settings file is normalized on load: unknown
keys are dropped and out-of-range numbers are clamped, so a bad preference can
never stop a board from opening.

Selecting one element adds the handles native Canvas does not provide: a
rotation grip below the selection and three connection handles on each side.
A handle becomes an outward arrow on hover: clicking it adds a connected node,
while dragging it projects both endpoints onto the actual shape silhouettes at
the pointer direction instead of fixing them to side centers. Rotation previews in place
and writes once on release, so a drag produces one native history entry rather than dozens, and
Shift snaps it to 15 degrees. A connection released over another node becomes a
native edge; the quick-create arrow places a node beside the selection and
connects it. Every one of these goes through the guarded authoring transaction,
so review mode, a locked target and a stale document refuse them the same way a
menu action would.

M2 tools are available through **Local shapes, comments, anchors and documents**
in the command palette. Create the supported Miro shape set with editable native
text fallbacks. Every local comment receives a stable Canvas anchor and marker;
opening the marker focuses its thread, whose messages show author and creation
time. Edit, reply to, resolve, reopen, and delete local threads; imported
comments remain read-only. A pin can be dragged onto another item or a free
board point without rewriting imported Miro evidence. Local comments use the
name selected in settings, falling back to the signed-in Obsidian account name,
and author pin/avatar colors can be overridden per name.
Choose a target and relative coordinates for node/image anchors, T for edges,
or board X/Y for free anchors, then save an anchor or set a connector endpoint.
Node/image connections update native endpoints; free/edge connections retain
valid native endpoints as an approximate plugin-off fallback with a diagnostic.
Graph edits reject readonly/review/locked targets, preserve `miroSource` and
unknown metadata, and record one native history transaction. Precise connector
anchors are stored beside a nearest-side native fallback, so the file remains
useful when the plugin is disabled.

Select a local file before opening tools for native document controls. PDF page
navigation uses the entered page; fit depends on the detected native viewer and
unsupported fit APIs produce a diagnostic. Markdown subpaths are preserved.
Active imported HTML never executes inside the plugin. Automated unit and
Chromium integration checks cover the M2 UI and synthetic native history;
real Obsidian interaction and hotkeys remain a separate, unconfirmed gate.
M3 projects canonical `miroSource.items`/`connectors` through explicit bindings.
Source and local rotation is applied around native node centers, including
anchor geometry; z-order uses explicit metadata or source ranks. The renderer
adds reversible, inert decoration to existing native DOM for shapes, text,
sticky notes, connectors, frames, and media. It never replaces editable native
content or executes source HTML/URLs. Native node and edge layers can be
separate stacking contexts, so unsupported cross-layer interleaving and missing
source fields remain explicit diagnostics.
The first M4 slice recognizes proven Miro code payloads, projects only bounded
title/language/line-number/code fields, and adds reversible code-card styling
around the existing editable Canvas text. Raw HTML, URLs, and unknown source
fields stay inert in `miroSource`.
The next slice recognizes proven `app_card` field collections and card themes.
It adds reversible card chrome and bounded state only; the converter's native
editable text remains the visible title, description, and field content.
Preview metadata now renders as an inert overlay above the native clickable
link, and ordinary cards resolve bounded tag IDs to definition-backed chips.
Tag definitions stay non-visual source evidence.
Proven `mindmap_node` payloads retain converter-created native text and
hierarchy edges. The renderer distinguishes roots and branches, applies safe
source colors and shapes, and marks generated hierarchy edges separately from
Miro connectors. Legacy `mindmap` remains explicitly source-limited.
The Commands menu and command palette now open a read-only source/provenance
inspector. It shows bounded source-type, completeness, provenance, diagnostic,
selection, and unknown-field summaries. Raw source values remain only in the
Canvas file and no inspector content is added to the board.

To run the plugin checks, from the repository root:

```powershell
npm ci
npm run check
npm test
npm run build
```

To build and deploy the local runtime into the guarded M0 test vault, also from
the repository root:

```powershell
npm ci
npm run check
npm test
npm run build
python tools\obsidian_oracle\setup_m0_vault.py
python tools\obsidian_oracle\check_environment.py
```

The setup script creates `_obsidian_oracle_vault`, stages all four committed
fixtures below its `MIRO2OBSIDIAN\_oracle\m0-compatibility` folder, and copies
only the built `manifest.json`, `main.js`, and `styles.css` into
`.obsidian\plugins\miro-canvas`. The target is guarded: arbitrary vault paths
and link/reparse-point paths are refused. Advanced Canvas receives a placeholder
manifest unless its real runtime is copied or installed separately; therefore a
successful offline matrix check is not a real-Obsidian visual pass.

Setup additionally stages `m1-daily.canvas` with a local attachment, a locked
item, typography overrides, and a distant minimap target. Repeating setup keeps
existing daily-board edits. `python -m tools.obsidian_oracle.smoke_plugin_ui`
checks the actual plugin UI against Chromium DOM and a synthetic Canvas host;
it is a browser integration check, not a real-Obsidian compatibility pass. Add
`--browser edge` to use the installed Microsoft Edge when Playwright Chromium
is unavailable.

### M0 profile activation and checks

Each activation stages the selected Canvas fixture and atomically updates the
controlled entries in `.obsidian\community-plugins.json`. The exact four
profile pairs, run from the repository root, are:

```powershell
python tools\obsidian_oracle\activate_profile.py native-only
python tools\obsidian_oracle\check_environment.py --profile native-only

python tools\obsidian_oracle\activate_profile.py miro-canvas-only
python tools\obsidian_oracle\check_environment.py --profile miro-canvas-only

python tools\obsidian_oracle\activate_profile.py advanced-only
python tools\obsidian_oracle\check_environment.py --profile advanced-only

python tools\obsidian_oracle\activate_profile.py both
python tools\obsidian_oracle\check_environment.py --profile both
```

The four rows mean native Canvas alone, native Canvas plus `miro-canvas`, native
Canvas plus Advanced Canvas, and both optional plugins. The profile checker
validates enabled-plugin state, fixture metadata, and the committed matrix. It
reports missing plugin binaries as warnings unless `--strict-runtime` is
given. For a real Advanced Canvas run, first install a pinned, hash-verified
runtime with `python -m tools.obsidian_oracle.install_plugin_runtime
advanced-canvas` or copy one from an existing vault; then rerun the relevant
profile with `--strict-runtime`.

The scripts only prepare files. They do not register or open the project-local
vault in a user's Obsidian window. Before a real-app check, open
`_obsidian_oracle_vault` once through Obsidian's vault switcher (or otherwise
add that folder as a vault), then open the staged Canvas from the
`MIRO2OBSIDIAN\_oracle\m0-compatibility` folder. No real UI pass is implied
until that manual gate is completed.

If opening reports **vault not found**, use **Open another vault → Open folder
as vault** and select the exact absolute path printed by setup. The `open`
URI cannot register a new vault. `python -m tools.obsidian_oracle.open_local_vault`
checks the app registry without changing it and prints the correct path and
instructions. After registration, run it with `--profile both --open`.
`check_environment --require-registered` makes missing/unknown registration an
explicit failure instead of mistaking runtime files on disk for an openable vault.

### M0 explicit metadata actions

The plugin registers these command-palette commands only for the active native
Canvas when its known persistence boundary is compatible:

| Command | Effect |
|---|---|
| `Miro Canvas: Initialize board metadata` | Explicitly creates schema-v1 `miroCanvas` metadata; it is a no-op when the default is already present. |
| Native Canvas `Ctrl/Cmd+Z` | Uses Obsidian's native undo history after an explicit metadata transaction. |
| Native Canvas `Ctrl/Cmd+Y` (or the platform redo action) | Uses Obsidian's native redo history after an explicit metadata transaction. |
| `Miro Canvas: Show plugin status` | Reports adapter, metadata, persistence, and optional Advanced Canvas state. |

Opening or inspecting a board does not write a file. Every metadata mutation is
an explicit writer call (the internal `MetadataWriter.write(action, mutate)`
API): it clones a JSON-safe document, validates the proposed schema, preserves
`miroSource`, and sends one complete-document transaction to the host. The
native bridge records that transaction through `requestSave(true)`, so native
Ctrl/Cmd+Z and Ctrl/Cmd+Y are the intended undo/redo path; the plugin does not
maintain a competing user-facing history stack. The explicit public command in
M0 is `Initialize board metadata`; later feature controls will use the same
writer boundary. Native hotkey behavior is still part of the real-app gate.

### M0 atomic CAS bridge and fail-closed behavior

`src/obsidian-metadata-store.ts` is the only native root-data bridge. It accepts
the currently known shape (`Canvas.data` as a writable data property and a
synchronous `requestSave(true)` native history/save boundary), returns detached
snapshots,
and exposes `commitDocument(next, expected)` to `MetadataWriter`. It does not
guess `getData`, `setData`, `importData`, vault writes, or a text-view
serialization path for persistence.

The bridge compares the live root to `expected`, replaces it with a detached
clone, calls `requestSave(true)`, verifies the resulting root, and restores the
previous root when the host rejects, throws, returns an async thenable, or
produces a different document. The writer additionally rejects malformed or
unsupported existing metadata, invalid proposed metadata, cyclic/non-JSON
documents, stale CAS/history snapshots, and any change to immutable
`miroSource`. The bridge does not intentionally accept or record failed
transactions; failure behavior inside the private Obsidian runtime remains part
of the real-application gate.

This proves atomic in-memory root replacement and native undo snapshot creation;
Obsidian still schedules its normal debounced file save, so a durable disk flush
is not synchronously proven and this is not a filesystem transaction.

If the private runtime shape is missing, read-only, accessor-backed, malformed,
or otherwise incompatible, the bridge reports `unavailable`/`incompatible`
and does not expose a writable store. The plugin remains loaded and native
Canvas remains usable; only metadata persistence commands are disabled and a
diagnostic status is shown. This fail-closed behavior is covered by offline
unit tests, not yet by a real Obsidian session.

## Product boundary

- The plugin works offline after installation. It goes to the network for two
  things only, both disclosed in the README: a daily check for a new release on
  GitHub, which a person can turn off (`src/update-check.ts`), and a font pack
  downloaded on a press (`src/font-packs.ts`). Opening or editing a board never
  reaches the network.
- It does not contain a Miro API client, OAuth, synchronization, upload,
  telemetry, or fonts loaded from the web while a board is drawn.
- Native Obsidian Canvas is the only required runtime.
- Advanced Canvas is an optional neighbor, not a dependency.
- The same `.canvas` file remains valid and useful without `miro-canvas`.
- Standard Canvas and Obsidian behavior remains available: Markdown, wikilinks,
  normal links, embeds, drag and drop, hotkeys, undo/redo, and context menus.
- M0 metadata writes are explicit actions and are committed through the native
  Canvas history boundary; native Ctrl/Cmd+Z and Ctrl/Cmd+Y replay remains to be
  verified in the real application.
- Missing source data is shown as a diagnostic, never invented.
- Opening a board is read-only; metadata changes only after an explicit user
  action and participates in undo/redo.

The plugin has its own repository - this one - since 2026-09-24 (`FUT-002`);
before that it lived under `plugins/miro-canvas/` in miro2obsidian. The two stay
tied by the board schema pinned in `schema/v1`.

## Architecture decision

Build the plugin from scratch around native Canvas instead of forking Obsidian
or Advanced Canvas and instead of writing a second Canvas engine.

```text
Obsidian Canvas view
  -> thin CanvasAdapter for private runtime details
  -> framework-free feature modules
  -> optional AdvancedCanvasAdapter
  -> explicit root-metadata CAS bridge
  -> versioned miroCanvas metadata
```

The core should use TypeScript and the Obsidian API with esbuild. No UI framework
or runtime dependency is justified for the first implementation. Private Canvas
internals must be isolated in one adapter so an Obsidian update has one repair
point.

Compatibility modes:

| Mode | Required result |
|---|---|
| Native Canvas only | Standard fields remain readable and editable |
| Native Canvas + `miro-canvas` | All core plugin features work |
| Native Canvas + Advanced Canvas | Existing Advanced Canvas metadata remains valid |
| Both plugins | No duplicate controls or conflicting patches; `miro-canvas` remains usable if optional integration disables itself |

## First working version

| Area | Required behavior |
|---|---|
| Typography | Choose font family and numeric size; format and align text through UI without editing HTML |
| Comments | Display, create, edit, reply, resolve, and anchor comments to a node, edge, image point, or free coordinate |
| Zoom | A large zoom range, fast fit actions, and preserved wheel, trackpad, pinch, and pan behavior |
| Minimap | Entire board in a corner, exact current viewport rectangle, click-to-jump and drag-to-pan without changing zoom |
| Theme | Instant `system` / `light` / `dark` switching from command, control, and hotkey |
| Colors | Expanded palette, recent colors, and a simple picker for text, fill, border, and edges |
| Nodes and shapes | Create and edit additional node types and all supported Miro shape subtypes |
| Documents | Clean preview, page and fit controls, predictable open-original action |
| Locking | Per-element lock and a board-wide review mode that prevents accidental edits |
| Connectors | Multiple end caps and anchors on node edges, node interiors, images, other connectors, and free coordinates |
| Attachment labels | Global default plus per-file and per-document visibility toggle |
| Offline operation | Comments, settings, overrides, anchors, and required assets stay in the vault |

Freehand drawing shipped in 0.1.0: pen, highlighter, smart drawing (a rough
shape becomes a clean one) and erasers, with stylus pressure (`src/drawing.ts`,
`src/stylus.ts`, `src/m1-session.ts`, `tests/drawing.test.ts`). A pen or
highlighter line held still at its end for half a second becomes straight
from its start, through the same path as Shift (2026-09-30). A stroke is kept in its card's
`localOverrides` (`src/local-items.ts`); without the plugin that card shows
empty. Left: a stroke visible without the plugin, export of a drawing to SVG or
Excalidraw, and Miro's own freehand strokes once its export carries their
geometry.

## Data contract

The immutable imported snapshot remains under `miroSource`. The plugin indexes
it once and must never shorten or rewrite it.

Local behavior that JSON Canvas cannot express lives under a versioned root
field named `miroCanvas`:

```json
{
  "miroCanvas": {
    "schemaVersion": 1,
    "transform": {
      "scale": 1.0,
      "offsetX": 0.0,
      "offsetY": 0.0
    },
    "bindings": {
      "generated-canvas-id": {
        "sourceId": "miro-item-id",
        "role": "item"
      }
    },
    "zOrder": ["miro-item-id"],
    "decks": [],
    "localOverrides": {
      "node-id": {
        "typography": {
          "fontFamily": "Inter",
          "fontSize": 18
        },
        "locked": false,
        "showAttachmentName": true
      }
    },
    "localComments": [],
    "freeAnchors": {}
  }
}
```

Rules:

- Use standard JSON Canvas fields whenever they already express the content.
- Use namespaced metadata only for fonts, locks, comments, free anchors,
  attachment-label preferences, source bindings, z-order, and renderer details.
- Bind by stable Canvas/source ID. Store explicit bindings only for synthetic or
  non-matching IDs.
- Store imported Miro comments separately from local editable comments.
- Preserve local overrides, comments, and anchors across repeat imports by
  source ID.
- Migrate metadata versions in memory and write only after explicit user action.
- Typography controls must not inject inline HTML styles into text content.

**Versioned schema (v1, 2026-09-24).** The contract is written down as JSON
Schema (draft 2020-12) in `miro2obsidian/schemas/v1/`: `board.schema.json` (a
whole `.canvas` file: JSON Canvas 1.0 plus the two extension keys),
`miro-source.schema.json` and `miro-canvas.schema.json`. miro2obsidian owns
them and ships them with the package; `fixtures/` holds small valid and invalid
boards with a manifest of what each check must say about them. The Python tests
and the plugin's tests both run those fixtures, and the plugin's list of known
`miroCanvas` fields must equal the schema's, so neither side can drift. Extra
fields are allowed wherever the plugin keeps fields from newer versions. Check
a board with `python -m miro2obsidian.validate <file.canvas>`.

### Agents: the MCP server

`mcp/` holds an MCP server (done 2026-09-28, `FUT-007`) through which an AI
agent reads, checks and edits the boards of one vault without Obsidian open:
`node mcp/dist/miro-canvas-mcp.mjs --vault <absolute path> [--read-only]`,
built by `npm run mcp:build` into one file for Node 20 that carries ajv and
the pinned schema, so running it needs no install. The agent's MCP client
starts it; the plugin never does, and `main.js` contains nothing of it. It
speaks JSON-RPC 2.0 over stdio, one message per line (written by hand; the MCP
SDK would bring a web server along), and opens no network connection. The
skill `miro-canvas-format` in `.agents/skills/` tells an agent how to use it
and how the format works; [mcp/README.md](../mcp/README.md) lists the tools.

- **Reuse.** The server imports the plugin's pure modules from `src/` and never
  the other way round; nothing it bundles imports `obsidian` (the build fails
  if anything does). Edits go through `CanvasAuthoring` over a
  `FileCanvasRuntime` (`getData`/`importData` on a copy in memory,
  `requestSave` the checked save) and through `MetadataWriter` over a
  `FileMetadataStore`, so every guard of the plugin holds: locks and review
  mode, `miroSource` compared before every commit, verification and rollback,
  unknown fields kept, ids as native Canvas makes them (`src/canvas-ids.ts`).
  A line between two cards is a native edge, as in the plugin; its own
  connectors go through `planBoardConnectors`, like the session's.
- **Revision and compare-and-swap.** A board's revision is the SHA-256 of its
  raw bytes. An edit handed an `expectedRevision` that is not the file's is
  refused (`stale-board`) before any work. Every save re-reads the file and
  compares; the file is written once per call: a temporary file
  `.<name>.<pid>.<random>.mcp-tmp` in the same folder (created exclusively,
  flushed with fsync), checked once more, renamed over the board, and deleted
  on any failure. JSON is written as Obsidian writes it (tab-indented) and a
  byte order mark is kept. A save that lands between the last check and the
  rename cannot be seen - a window of milliseconds. A board holding whole
  numbers beyond 2^53 is not edited, since writing it back would round them.
  When `.obsidian/workspace.json` shows the board open in a tab, the answer
  warns `open-in-obsidian`: Obsidian reloads a board changed on disk, but its
  own unsaved edits can still be saved over the change.
- **Vault guard.** `--vault` must be an absolute folder holding `.obsidian`,
  reached through no link. A board is named by a relative path ending in
  `.canvas`; `..`, drive letters, `:` (alternate streams), device names, names
  ending in a dot or a space and anything under `.obsidian` or `.trash` are
  refused; every folder on the way is checked not to be a link or junction,
  and the real path must be the path as written, inside the vault. Boards over
  64 MB are refused; `list_boards` never follows a link.

## Rendering requirements

### Geometry and layers

- Preserve converter `x`, `y`, `width`, and `height` without hidden auto-layout.
- Apply source rotation around the item center to content, hitboxes, handles,
  and connector boundaries.
- Preserve source order or `zIndex`, including overlap between frames, text,
  shapes, images, and connectors.
- Support negative coordinates, nested transforms, and very large boards.
- Avoid layout shifts after fonts, images, or previews load.

**Manual layer order (done 2026-09-24).** Only cards (text, file and link
nodes) have layers. Frames stay under everything, larger under smaller, as
native Canvas stacks them; lines and arrows have no layers. Bring to front,
Bring forward, Send backward and Send to back are in the selection toolbar's
Layer menu, in native Canvas's menu for a card and for a selection, and as
commands without default hotkeys. They act on every selected card and keep the
cards' order among themselves; each is one undo step. Forward and backward move
a card past the nearest card that overlaps it; with no overlap nothing changes.
The order is the order of nodes in the `.canvas` file, so the board looks the
same without the plugin; a `miroCanvas.zOrder` the board already has is kept in
step, and none is created. Moving a card keeps its layer, and selecting it
does not lift it either, as in Miro (native Canvas lifts a dragged card, and
draws a lone selected card, above all others). Where a card in front covers a
selected card, it also covers that card's outline and resize handles.

### Camera and minimap

- Match or exceed the current `canvas-zoom-unlock` minimum of `2^-12`.
- Keep native wheel, trackpad, pinch, pan, and fit-to-content behavior.
- Restore saved local camera state; use a Miro viewport only when the source
  actually contains one.
- Build the minimap from board bounds and viewport transforms already available
  in the adapter; do not create a second layout model.
- Update the viewport rectangle while panning, zooming, resizing, and switching
  panes without causing file writes.
- Minimap click moves the viewport center; minimap drag pans continuously while
  preserving zoom.
- Provide show/hide and corner settings and a keyboard-accessible navigation
  alternative.

### Typography, themes, and colors

- Keep Markdown and wikilinks editable as text.
- Expose font family, numeric size, weight, style, decoration, alignment, line
  height, and vertical alignment without raw HTML editing.
- Use local/system fonts and explicit fallback maps; never fetch remote fonts
  while drawing (a font pack is downloaded only on a press, then read locally).
- Keep board appearance independent from the Obsidian application theme when
  the user selects an explicit board theme.
- Include theme-aware defaults, recent colors, hex input, and an accessible
  palette for text, fill, borders, edges, and comments.

### Shapes, notes, and groups

- Render known Miro subtypes rather than collapsing all shapes into a few
  silhouettes.
- Keep a generic safe fallback for unknown future subtypes while retaining the
  original subtype in metadata.
- Support shape creation, resizing, rotation, text editing, fill, border,
  opacity, duplication, and connector anchors.
- Add a dedicated sticky-note experience without replacing Markdown storage.
- Distinguish groups, frames, diagrams, and slides where source semantics exist.

### Connectors

- Preserve start/end caps, width, dash, color, labels, orientation, and known
  control points.
- Support border, interior, perimeter, image-point, connector, and free-coordinate
  anchors.
- Keep free anchors stable when unrelated items move.
- Move node-bound anchors with their node and image-bound anchors with image
  crop/resize transforms.
- Prevent self-links and dangling references, and include connector edits in
  undo/redo.
- Treat a free line and a node-bound connector as two states of one editable
  line model: attaching or detaching an endpoint must convert between them
  without changing the route, caps, color, width, or labels.
- Let one line endpoint join another line endpoint without forcing either
  segment to adopt the other's style; joining records topology, not a style
  merge.

### Selection and creation tools

- Make lasso a configurable selection gesture as well as an optional toolbar
  button. Mouse buttons and modifiers used for select, pan, lasso, line, and
  connector gestures must be configurable without taking global hotkeys.
- Let users show or hide the lasso, line, and connector buttons independently
  while keeping every action available through commands and assignable hotkeys.
- The armed tool is marked by one rule for every button of the bars
  (`.miro-canvas-toolbar__button[aria-pressed="true"]`, the accent icon on the
  active background), stated as strongly as the hover rule and after it, and
  hover styles of the bars and the dock apply only under `@media (hover:
  hover)`.  Found on the tablet: a tapped control stays `:hover` until the
  next touch (the stylus too), the hover rule (0,4,0) outweighed the armed one
  (0,3,0) and the pen looked grey; the tablet's WebView reports `hover: none`
  and `any-hover: none`.  Under More the armed item had never taken the accent
  colour, `miro-canvas-tools__item` setting its own.  `tests/stylesheet-
  hover.test.ts` checks every hover rule of a bar sits under the media query,
  and the `--controls` smoke compares every tool armed (on the bar, under More,
  in the settings; both orientations; resting, hovered, and with a touch
  screen's stale hover forced) with Select.
- A repeat press on the armed tool's button folds its settings (`QuickTools`:
  `foldedSettings`, cleared when the armed tool changes; `aria-expanded` on the
  pen's and the lines' buttons; the shape picker is the popover it always was).
  The kinds of drawing inside the pen's settings do not fold them.
- The lasso, armed from the bar, stays armed: `finishToolGesture` no longer
  hands the board to select after one (only the lasso the select tool's binding
  starts has select armed, and keeps it).  With it armed a press on the
  selection (`pressOnSelection`: the shared frame, native Canvas's selection
  box, a selected card or line) is left to the select tool's own handlers,
  as are grips and pins (`PANEL_SELECTOR`); anything else is a new lasso, with
  Shift adding.  `attachSelectionDrag` and `pressConnector` take the lasso as
  they take select.  The board takes the focus after a catch so that Delete
  reaches it.  Found in real Obsidian 1.13.7: Obsidian fires `file-open` when a
  single card is picked, and the plugin rebuilt its session on each, which
  dropped the armed tool; `src/board-binding.ts` lets a ready session for the
  same view, file and runtime stand.
- A stylus's hover text (`src/pen-tooltips.ts`, attached to every window by
  `main.ts`, on phones and tablets only): Obsidian's tooltips wait for mouse
  events and the mobile app shows none.  A pen over a labelled control of the
  plugin, not touching the screen, shows the label as an element with
  Obsidian's own classes (`tooltip`, `mod-top`...), placed by
  `data-tooltip-position` and kept in view, after `data-tooltip-delay`
  (Obsidian's second when unset).  A browser driven with a pen (CDP's
  `Input.dispatchMouseEvent` with `pointerType: "pen"`) also makes a mouse
  pointer of it; other pointers neither show nor take away the pen's tooltip.

- A double press on the empty board is Escape, never a card (2026-10-01).
  In Obsidian 1.13.7's `app.js` the board's wrapper listens for `dblclick`
  (`onDoubleClick`: not default-prevented, the target the wrapper itself, the
  board not readonly) and makes a text card at the point.  A touch has no such
  event there: `onTouchdown` calls `preventDefault` on the touch's pointerdown,
  after which Chromium sends the tap's click with detail 0 and no `dblclick`
  (checked with CDP's `Input.dispatchTouchEvent`: a plain element gets two
  clicks and the `dblclick`, the board only two clicks of detail 0, and no
  card is made); whether an Android WebView differs is for the pointer log of a
  real tablet.  The guard's `dblclick` listener takes the empty board (its
  target is the wrapper, `this.root`), or any target while a drawing tool is
  armed - a pen's first dot lies under its second click - prevents it and runs
  `resetTools()`, the very path Escape takes.  `DoubleTapWatch`
  (`src/double-tap.ts`) times a finger's and a pen's taps - a press up to 300
  ms and 10 px, the second down within 300 ms and 40 px of the first's lift,
  no other pointer down, neither on a card or a panel - and `attachDoubleTap`
  runs `resetTools()` once the second tap's events are over, so a pen leaves
  the dot each tap draws.  A polyline's or a spline's finishing double click
  (`linePlacing`, `lineFinishedAt`) is that line's own and not an Escape; a
  card, a line's label and a line keep their double click.  Corrections from
  a real tablet: a touch that lands while the pen is near - the palm or the
  hand that holds it, which Android may report as a finger that lifts as a
  finger does - is no tap of a pair (`pressIsHand`, that is
  `StylusWatch.touchIsHand(now, false)`, as `startNativePlacement` asks it),
  and the `dblclick` made of such touches is no Escape, though it is still
  swallowed so that Canvas makes no card; a `dblclick` carries no pointer type,
  so `RecentPresses` keeps the last two presses and whether each was such a
  touch.  A finger's double tap with no pen near, and a pen's own, count as
  before - with a drawing tool armed too.  The Android WebView sends the
  `dblclick` as well as the plugin's pair, some milliseconds apart:
  whichever signal comes first does the Escape (`escapeOnDoublePress`) and the
  other, within 100 ms, finds it done; two double clicks, or two pairs, one
  after the other are two Escapes, and a `dblclick` that follows a pair's
  Escape is still swallowed, though the pair has put the drawing tool away.
- A press on the board takes the focus off a tool of the bar (2026-10-01).
  Canvas ignores `dblclick` while `document.activeElement.closest("button,
  input")` finds something, and a press on its board - a touch, whose
  pointerdown it cancels - never moves the focus off a button pressed before,
  so a card did not open on a double tap right after a tool had been used.
  `attachBoardFocus` (`controlToLetGo` in `src/board-focus.ts`) answers a
  pointerdown on the window, capturing, that lands on the board and not on a
  control of the plugin's (`PANEL_SELECTOR`): when the focus sits on a button,
  an element with the role of a button or an input that is no text field (a
  slider, a colour swatch) of the plugin's own controls, it blurs it and
  focuses the wrapper, which is where native Canvas's copy and the board's
  own keys look (`activeElement === wrapperEl`, or the body).  A card's
  editor, the search field, a comment's reply box and every text input are
  left alone, as is a press on a control of the plugin's; a key reaches the
  board afterwards as it did - a tool's letter and Escape are heard by the
  document and the window, and the guard on Delete, which skipped a key whose
  target was a control of the plugin's, now sees the board as its target.
- Canvas's own card-menu buttons only arm (2026-10-01).  In `app.js`
  `cardMenuEl` holds the buttons; each has a click that makes the item at
  `posCenter()` (the card at once; the note and media pickers read it when a
  file is picked, later) and a pointerdown calling `dragTempNode(event, size,
  callback)`, which after five pixels of travel shows a ghost, snaps it unless
  Alt is held (Ctrl on a Mac), and on the release calls the callback with the
  ghost's position: `createTextNode`, or the picker whose own callback calls
  `createFileNode` there.  The bar's capture listener (`QuickTools`) stops that
  click and calls `onNativeArm`; the session arms the `native` tool (the button
  is `aria-pressed`, lit by the rule every armed tool has), the next press on
  the board (`startNativePlacement`, taken like any tool's, a palm excepted)
  waits for its click, then `replayNativeDrag` (`src/native-drag.ts`) sends the
  button a pointerdown and the window a move and a release at the point - Alt
  and Ctrl held, so the item lands on the point - and Canvas makes its own
  item in its own way, one history step, and Select is armed again.  The
  replay works for any button that is dragged, so the tablet's slide and group
  buttons need no code of their own.  Chosen over native's `showCreationMenu`
  (each item's callback keeps the position, but it is a menu with items of
  its own, and 1.13.7's lists no slide) and over pointing `posCenter` at the
  press (the pickers read it later, not in the call).  A drag that starts on a button and ends over it is no click
  (`watchNativePress`); review mode and a board locked in Canvas's quick
  settings arm nothing (`aria-disabled` on the buttons).  Drag-to-add from the
  button is left as it was, review mode included.

### Files and documents

- Preserve native open, reveal, rename, drag/drop, and link behavior.
- Let users hide attachment names globally or per node without renaming files.
- Display PDFs and local HTML documents with practical fit/page controls.
- Keep image crop, rotation, and title visibility in namespaced metadata.
- Never execute active content from an imported local HTML document inside the
  privileged plugin context.

### Locking and review mode

- Locked items cannot move, resize, rotate, edit text, reconnect, delete, or
  accept drag/drop changes.
- Review mode blocks board edits while keeping navigation, selection, links,
  search, comments, and copy available.
- Lock state is visible but visually quiet and can be changed from command,
  context menu, and inspector.

### Comments

- Keep imported Miro comments immutable and marked with provenance.
- Store local threads, replies, resolution state, timestamps, and anchors in the
  vault.
- Anchor to nodes, edges, image points, or free coordinates.
- Offer board-wide and selection-filtered comment views.
- Do not claim that local comments synchronize with Miro.

### Export to PDF and PowerPoint (done 2026-09-24)

The board menu's **Export to PDF or PowerPoint** marks pages on the board:
rectangles of one paper size (A4, A3, Letter, 16:9, 4:3 or free, landscape or
portrait), moved by their tab and resized by their corner, kept in
`miroCanvas.export` and never turned into nodes, so no item moves or changes.
**Add page** puts one around the selection or in the middle of the view; **A
page per frame** adds one around each frame. Opening the panel writes nothing;
the pages are saved once changed. A presentation's bar has its own export
button, whose pages are its slides, each at its own size (nothing saved). Each
page is photographed the way Obsidian's own **Export as image** does it - the
board laid over the window, a window-sized tile at a time - at 2000 or 3000
pixels across, and packed into a PDF (one page per sheet) or a PowerPoint deck
(one picture per slide, named after the page). A small window over Obsidian
shows progress and can stop the export. The plugin's own controls, the page
outlines and the selection stay out of the pictures, and the view returns to
where it was. Exporting needs Obsidian on a computer.

A board written by another tool (the converter writes an edge's default
arrow and fractional geometry) now accepts metadata writes at once: native
Canvas leaving out a default or rounding a position is treated as keeping the
board, not as a change.

## Source-limited data

Some Miro families remain incomplete because neither REST nor Web SDK exposes
their internals. The plugin can improve rendering only when data exists.

- Table cell text remains blocked until another source exposes it.
- Unsupported widget internals and hidden children remain diagnostic.
- Comment content comes from REST, not Web SDK.
- Exact slide and document internals may be partial.

Boards imported from other plugins ([Import from other plugins](#import-from-other-plugins))
have limits of their own, each named on the board's report card:

- A mind map keeps no positions: its layout is worked out anew (counted as
  approximated - the whole map comes over).
- Excalidraw's hand-drawn roughness, hatching, groups, transparency, picture
  cropping, background colour and the fill of a closed line are not drawn;
  pictures stored inside a plain `.excalidraw` file and web embeds leave a
  placeholder. A standalone text keeps Excalidraw's own box, so in a font
  other than the one it was measured in it may wrap.
- An Advanced Canvas portal stays a file card, a collapsed group shows open,
  a branching slide order follows one line, and style values the plugin does
  not know are kept for Advanced Canvas but not drawn.
- Markmind's rich mode is not read yet.

The [display-gap report](https://github.com/NixWrk/Miro_2_Obsidian/blob/main/docs/MIRO_VS_CANVAS_DISPLAY_GAPS.md) records the measured
baseline and the [capability matrix](https://github.com/NixWrk/Miro_2_Obsidian/blob/main/docs/MIRO_CAPABILITIES.md) records source
evidence.

## Implementation order

### M0: adapter and persistence

Repository-level M0 status: the scaffold, schema boundary, read-only adapters,
explicit CAS writer, and four offline compatibility fixtures are implemented
and covered by automated tests.

- [x] Create the minimal plugin scaffold (then under `plugins/miro-canvas/` in
  miro2obsidian; now the root of this repository).
- [x] Isolate native and optional Advanced Canvas access behind adapters.
- [x] Read and validate `miroCanvas.schemaVersion` without writing on open.
- [x] Add explicit whole-document CAS metadata writes with detached snapshots,
  rollback, and the native Canvas history boundary for undo/redo.
- [x] Stage native-only, `miro-canvas`-only, Advanced-only, and both-plugin
  offline fixtures with guarded activation/check scripts.
- [ ] Open the project vault in real Obsidian and verify visual/interaction
  behavior, including native Ctrl+Z/Ctrl+Y replay and the final screenshots.
  Left: a check in a real Obsidian (`tools/obsidian_cdp` can now drive one).

### M1: daily Canvas tools

- [x] Integrate the zoom-unlock behavior (done: minimum and maximum zoom under
  Settings → Navigation, `src/viewport-controller.ts`).
- [x] Add the clickable minimap and viewport rectangle (done:
  `src/minimap-model.ts`, `src/m1-controls.ts`).
- [x] Add element locking and board review mode (done: `src/m1-session.ts`,
  `tests/m1-session-locking.test.ts`).
- [x] Add typography controls, themes, expanded colors, and attachment-name
  toggles (done: `src/appearance.ts`, `src/selection-toolbar.ts`,
  `src/attachment-labels.ts`).
- [ ] Verify large-board performance and keyboard accessibility. Large boards
  are measured in the synthetic harness (see "Standard edges, one label editor,
  large boards" below). Dragging large selections is measured in a real
  Obsidian ("Dragging large selections" below): the locks are read once a step,
  a long drag is written when let go, and a drag of 50 or more cards is 1.5 to 3
  times faster. Left: the rest of the per-move work on huge boards (restyling
  the moved cards, translating the board for the preview, writing the move),
  about 1.1 s per arrow-key press with 5,000 cards selected, and a keyboard
  pass.

### M2: editing fundamentals

- [x] Add local comments and anchors (done: `src/local-comments.ts`,
  `src/comment-markers.ts`, `src/anchors.ts`).
- [x] Add local shape creation with standard Canvas fallbacks (done:
  `src/m2-tools.ts`, `src/canvas-authoring.ts`, `src/shape-catalog.ts`).
- [x] Add safe local document viewing and open-original controls (done:
  `src/document-viewer.ts`, `src/document-controls.ts`).

### M3: geometry fidelity

- [x] Add local/source rotation, rotated anchors, and z-order with native history.
- [x] Add reversible source-backed Miro shape, text, sticky, connector, frame,
  and media decoration over native Canvas elements.
- [x] Use explicit diagnostics whenever source payload or native stacking
  contexts cannot support exact rendering.

### M4: structured content

- [x] Add a source-backed code renderer without replacing editable Canvas text
  or executing source payloads.
- [x] Add bounded source-backed `app_card` state and reversible card styling
  without copying field payloads into plugin DOM.
- [x] Add bounded preview metadata over native links without executing source
  URLs or HTML.
- [x] Add ordinary card state and resolve source tag definitions to inert chips.
- [x] Add source-backed `mindmap_node` root/branch styling and distinguish its
  generated hierarchy edges from Miro connectors; report legacy `mindmap` as
  source-limited.
- [ ] Add slide, document, and image renderers where source data is available.
  A Miro presentation's slides are read and shown (`src/source-model.ts`,
  `src/slide-show.ts`); documents and pictures stay native file cards with
  `src/document-viewer.ts`. Left: renderers for Miro's own document and image
  data.
- [ ] For mind-map editing, evaluate the MIT-licensed
  [`obsidian-enhancing-mindmap`](https://github.com/MarkMindCkm/obsidian-enhancing-mindmap)
  tree model and interactions before writing new layout code. Candidate behavior
  includes child/sibling insertion, drag reparenting, collapse/expand, keyboard
  navigation, and Markdown view switching. Left: the evaluation; importing
  these plugins' notes is `MIGRATE-001`.
- Treat the current
  [`obsidian-markmind`](https://github.com/MarkMindCkm/obsidian-markmind) only as
  a UX reference: its README says it is not open source, so its implementation
  must not be copied. Keep native Canvas data as the source of truth and record
  any reused MIT code and copyright in third-party notices.
- [x] Add bounded provenance and source-limitation inspection without default
  board clutter or raw source values in DOM.

### Future: product tasks (set 2026-09-23)

The agreed order of this work - finish PDF/PPTX export and bring manual layer
order (to front, forward, backward, to back) into the selection toolbar and
menu (both done); foundations (schema,
translations, agent skill); the converter as a product of its own; delivery and
the Miro import guide; onboarding board and visual guide; testing with people;
ecosystem - is recorded in the [ROADMAP](https://github.com/NixWrk/Miro_2_Obsidian/blob/main/ROADMAP.md) plan. The exporter stays
in Python and is offered as a per-OS build or set up by an agent through a
miro2obsidian skill or MCP server; the plugin never installs it by itself.

**Change of plan (agreed 2026-09-28).** Stages 0-4 are done except the visual
guide (`FUT-012`) and, in miro2obsidian, the macOS and Linux builds of the
exporter (`FUT-013`). The ecosystem stage (6) now goes before the checks with
people (5): the clean-machine walk (`FUT-004`) waits until miro2obsidian's
automation, which another agent is finishing, is done. Movable panels
(`FUT-019`) are done and leave the list. The ecosystem stage is now:

1. an MCP server in this repository (`FUT-007`), with the
   `miro-canvas-format` skill moved here from miro2obsidian (done 2026-09-28);
2. import from Excalidraw, mind maps (the note formats of Enhancing Mindmap and
   Markmind) and Advanced Canvas (`FUT-009`, `MIGRATE-001..003`; done
   2026-09-28 except Markmind's rich mode, which waits for a sample file);
3. search on the board (`FUT-020`);
4. faster dragging on huge boards (about 35 ms of the plugin's work per dragged
   frame on the 2,000-card board measured 2026-09-23);
5. the remaining small limitations: tables from Miro arrive with empty cells
   (Miro's export has no cell text); lines attached to other lines are still
   experimental and off by default; independent connectors need the plugin to
   show; a clipboard paste of native edges without their end cards is not
   supported; formatting a mixed native/independent selection is not yet one
   undo step; PDF and PowerPoint export needs Obsidian on a desktop computer.

Then the checks with people: the clean-machine walk (`FUT-004`), every kind of
link and formula (`FUT-017`), other systems, phones and tablets (`FUT-010`).

- [x] `FUT-001` Choose the settings and interface language automatically from Obsidian's own
  language, falling back to English; English and Russian (done 2026-09-24: every
  word in `src/locales/`, the Russian table must have exactly the English keys,
  a test finds untranslated entries; maintainers' diagnostics stay English).
- [x] `FUT-011` Offer an optional onboarding board on first setup (and from settings) that
  shows every tool on real items (done 2026-09-24: `src/welcome-board.ts`
  builds twelve frames - welcome, text, colours, sticky notes, shapes and
  flowcharts, lines, drawing, layers and locking, comments, code and tables,
  files and notes, export and Miro import - that show rather than tell, from
  the same records the tools write; the first-run question offers it, and
  Settings → Getting started makes it again; an existing board of that name
  is opened, never overwritten. Extended 2026-09-25: the "Files and notes"
  frame shows native Canvas file nodes - a note, a small canvas and a
  picture, a PDF and a Word document - and creating the board also creates
  that small sample folder beside it, on the same press, writing only what
  is missing; the binaries live as base64 in `src/welcome-samples.ts`, built
  and checked by `tools/make_welcome_samples.py`).
- [ ] `FUT-012` Write a visual guide to the plugin's features and the order of its settings,
  with screenshots, for users and for the release page. The task is written
  out in the README ("Task: the visual guide"); `tools/obsidian_cdp` records
  the GIFs in an isolated Obsidian. Left: the GIFs themselves, none recorded yet.
- [x] `FUT-008` PDF/PPTX export: slides as a deck and marked board areas as pages (done
  2026-09-24, see Export to PDF and PowerPoint).
- [x] `FUT-002` Move the plugin into its own repository tied to miro2obsidian by a shared
  schema and fixtures (done 2026-09-24: this repository, with `schema/v1`
  pinned by `schema/pin.json` and checked in CI).
- [x] `FUT-003`, `FUT-014` Offer a guided Miro import from first setup and from
  settings, offering the exporter for download or an agent to set it up, and
  letting the user remove it afterwards (the import question and its six-step
  guide are done 2026-09-24, `src/import-guide.ts`; the guide itself never goes
  to the network, links open on a press; the `miro2obsidian-import` skill is in
  miro2obsidian).
- [ ] `FUT-004` Walk the full user journey on a clean machine (see
  [ROADMAP](https://github.com/NixWrk/Miro_2_Obsidian/blob/main/ROADMAP.md)).
  Left: the walk on a clean Windows machine; it waits until miro2obsidian's
  automation is finished (2026-09-28).
- [x] In miro2obsidian, the converter as a product of its own: plain Canvas,
  Advanced Canvas, miro-canvas or raw JSON output (`FUT-005`) and SHA-256
  attachment de-duplication (`FUT-006`) are done 2026-09-24 there.
- [ ] `FUT-013` In miro2obsidian, exporter builds for Windows, macOS and Linux.
  Left: the macOS and Linux builds (the Windows one is checked).
- [x] `FUT-007` Provide a skill or an MCP server so agents can work with miro-canvas boards as
  natively as with Canvas files. The light skill `miro-canvas-format` (the
  format by fields, a check against schema v1, rules for safe edits) was made
  2026-09-24 in miro2obsidian. The owner decided on 2026-09-28 that the MCP
  server lives in this repository and the skill moves here with it. Done
  2026-09-28: the server in `mcp/` (reading, checking and editing tools; see
  "Agents: the MCP server" under the data contract) and the skill in
  `.agents/skills/miro-canvas-format`, which now points to the server first.
- [ ] `FUT-010` Tune settings and layouts for other operating systems, phones and tablets
  (see M5 below). Android phone done 2026-09-28 on a Samsung Galaxy A33
  (Obsidian 1.12.7, real touch and stylus input over adb and
  `tools/obsidian_cdp/android.mjs`): the session measures Obsidian's floating
  navigation bar, editing toolbar, keyboard (`--keyboard-height`) and the
  system's navigation area (`--safe-area-inset-bottom`) into
  `--miro-canvas-host-foot` and lifts the tool bar and the dock above them,
  re-measuring on the page's class and style marks, never per frame; with the
  keyboard up it hides both; a stored panel place resolves within the
  uncovered board; the tool bar keeps every tool, wrapped onto two rows of
  40px buttons; popovers stay inside the board; handles gain a 40px reach
  under `pointer: coarse`; one finger on empty board is native Canvas's pan
  and pinch, not a marquee; a hidden minimap is neither followed nor drawn;
  new cards get native hex ids (Advanced Canvas's portals hide any id with a
  hyphen). Tablet done 2026-09-30 on a Samsung Galaxy Tab (SM-X736B, Android
  16, Obsidian 1.13.8) with its S Pen: the S Pen arrives as pointerType "pen"
  with pressure and tilt, hovers as a pen with pressure 0, and its side button
  never reaches the page (a side-button stroke brings no pointerdown at all);
  Android takes a palm back 7 to 25 ms after it lands (touch pointerdown, then
  pointercancel, no move in between). `src/stylus.ts` keeps "the pen is near"
  from any pen event on the window, hover included, whatever tool is armed,
  and `PalmRewind` puts back the view, the native selection, the connector
  selection and the comment selection a lone touch changed when Android takes
  it back within 250 ms - no history step, no card position and no save is
  touched, and native Canvas starts no card drag in that time. A tool gesture
  follows only the pointer that began it, so a palm taken back mid-stroke no
  longer ends the stroke. Pressure scales the width around 0.2 (ordinary S
  Pen writing, which peaks near 0.3). Holding the pen still (4 px) for 500 ms
  at the end of a pen or highlighter stroke at least 24 px long straightens
  it through the Shift path (`holdStraightLine`, on by default). Obsidian's
  `.is-tablet button:not(.clickable-icon)` padding is undone for the
  board's own buttons, and the minimap follows its setting on every width,
  drawn at 160 by 107 px up to 900 px and 120 by 80 px up to 480 px. Pen
  latency on a 500-card board was unchanged by these (p50 about 17 ms, frames
  8.4 ms at 120 Hz; pen up to drawing about 160 ms, one long task of native
  Canvas's import). Three faults the owner found on the tablet, fixed the same
  day. (1) A card that is selected could not be dragged: native mobile Canvas
  drags a card only after a 600 ms long press (`onTouchdown`, a finger only),
  pans the board with a finger that moves at once, does nothing with a pen,
  and once a card is selected the touch lands on its text, where the browser
  takes the move for a scroll and sends `pointercancel` after three moves -
  the same in native Obsidian with the plugin off, in main (b4a996a) and on
  this branch, so no regression. `attachSelectionDrag` (`src/m1-session.ts`)
  takes a finger or a pen that presses a selected card and moves 5 px through
  the selection's own move (`startSelectionMove`, one history step, edges and
  connectors follow), hands native Canvas's tracking back with a
  `pointercancel` of its own and puts the board back where a few pixels of
  native pan left it; a finger held 600 ms, a second finger, a palm while a
  pen is near, a locked or review-mode board, a frame and a card being written
  in are left to native Canvas. `touch-action: none` on a selected card's text
  keeps the move on the page. (2) A turned card showed four large squares at
  the corners of its unturned box: Obsidian's mobile rule (`.is-mobile
  .canvas-wrapper:not(.mod-readonly) .canvas-node-interaction-layer
  .canvas-node-resizer[data-resize=...]`, `display: block`) outweighed the
  plugin's `display: none`; the plugin's rule now carries `!important`. The
  three round buttons below the card are the rotation controls of the desktop
  design too (free grip, a turn each way), pinned to the lower left corner of
  the turned box, and the line ends on the turned outline as on the desktop.
  (3) The pen's and lines' rows carry `miro-canvas-toolbar__bar`, so the
  vertical bar's column and its `max-width: 100%` squeezed them to the bar's
  own width.  Beside a vertical bar each is the bar's second column, as it is
  a second row above a horizontal one: a box of the bar's look (same
  background, border, radius and shadow), `position: absolute` against the bar
  with `left`/`right: calc(100% + 5px)` by `data-miro-canvas-panel-side` (the
  bar's 1px border and its 4px gap) and `top: -1px`, so its top is the bar's;
  `width: calc(100% + 2px)`, as wide as the bar, one control to a row in the
  row's own order (the tools, the colours, then the width: sample, upright
  slider, number), colours at the row's 20px, a rule across between the
  sections.  The slider is `writing-mode: vertical-lr; direction: rtl` (the
  thicker line up), with Obsidian's track and thumb redrawn upright - its own
  assume a level one, with a thumb lifted by `top: -6px` - and
  `touch-action: none`, so a finger's or a pen's drag moves it and does not
  scroll the column.  The only number the code gives it is its height limit:
  `placeSideRow` (`src/panel-layout.ts`) allows from the bar's top to a margin
  above the foot of the part of the view the host leaves uncovered, and
  `QuickTools.placeSideRows` writes it as `--miro-canvas-side-row-max-height`,
  past which the column scrolls inside itself, never wrapped or squeezed.
  (The first version put the column level with the tool pressed, in a window
  of its own with the widths first; the bar's second column replaced it.)
  (4) Two buttons to a row in the vertical bar: Obsidian on
  the tablet (Android) fills `cardMenuEl` with five buttons, where the
  desktop's 1.13.7 holds three - besides card, note and media, "Drag to add slide"
  (`lucide-gallery-vertical`) and "Drag to add group" (`lucide-group`).
  `nativeToolbarItemOf` knows the three by icon and gives any other the slot
  of its position, so the card and note slots held two buttons each, and a
  slot is a row (`.miro-canvas-toolbar__native-slot`); in a vertical bar it
  is a column. The rule before the "+" of More lay upright there too and is
  now across. (5) Obsidian's tablet rule `.is-tablet
  button:not(.clickable-icon) { padding: 4px 20px }` (specificity 0,2,1)
  outweighs every one- and two-class padding rule of the plugin: the comment
  pin (`min-width: 32px`, padding 0) became a 44 x 32 oval. Every rule that
  pads a plugin button now states the padding in
  `--miro-canvas-button-padding`, a button no rule pads takes Obsidian's own
  `var(--size-4-1) var(--size-4-3)`, and one rule under `.is-tablet` /
  `.is-mobile` (0,3,1) puts either back for every button with a plugin class
  and every bare one inside a plugin panel; the `--controls` smoke injects
  Obsidian's two rules and compares the padding and size of every button under
  the plugin's roots. Left: the owner's own trial of the hold
  with the real pen, landscape on a phone (the dock stacked over the bar
  leaves little board), iPhone and iPad, macOS and Linux.
- [x] `FUT-016` Fonts. The base is done 2026-09-24: the list offers only fonts
  every machine shows as themselves (Inter and Source Code Pro from Obsidian,
  the system's sans-serif and serif) and the fonts set in Obsidian's own
  appearance settings; a font the machine lacks (on older boards or from Miro)
  shows as a face of the same kind instead of Times New Roman. Next, font
  packs people download and remove in the plugin's settings: a Miro pack (the
  open fonts of Miro's list; its closed ones - Roobert, Spoof, Tiempos Text and
  the like - get close open substitutes), a Word pack (open fonts metric-
  compatible with Calibri, Cambria, Arial, Times New Roman and Courier New:
  Carlito, Caladea, Liberation; Microsoft's own fonts cannot be shipped), an
  Excalidraw pack (Excalifont, Virgil, Nunito, Lilita One, Comic Shanns and
  others), fonts added from a file (.ttf, .otf, .woff2 - GOST, for example),
  and a list of one's own: keep what is used, remove the rest, set the order.
  Packs are assets of this repository's releases with their licences (OFL,
  Apache or MIT only); a download happens only on a press and shows its size,
  and the README names it beside the update check as the only network use. A
  font is loaded into memory only when something is written in it.
  Plugin side done 2026-09-25 (`src/font-packs.ts`, `src/font-pack-catalogue.ts`,
  `tools/build_font_packs.py --write-catalogue`, `src/settings.ts`,
  `src/settings-tab.ts`, `src/selection-toolbar.ts`, `src/appearance.ts`,
  `src/main.ts`): a stored-ZIP reader and manifest validator with no network
  dependency of their own; a download on a press verifies the archive's
  SHA-256 against the embedded catalogue before unpacking it into the
  plugin's own folder, with progress shown in its settings row. One
  `<style>` element per window - the main one and every popout - carries the
  installed packs' and any custom fonts' `@font-face` rules; an alias (a
  Word font's name, Excalidraw's own) tries the system's own font first,
  the pack's stand-in second. Settings → Fonts lists every pack with
  Download/Remove and progress, "Add a font file", and the person's own
  font-list pool with a switch and up/down. `MIRO_FONT_IDS` maps Miro's REST
  ids and the common Windows names it sometimes writes directly
  (`open_sans`, `times_new_roman`, `arial`, `Calibri`, ...) to the family a
  pack stands in for, so `fontStack` and `fontLabel` render and name them
  once the matching pack, or the real font, is present. The pack ZIPs live
  in the GitHub pre-release `fonts-0.0.4`, built and published by
  `.github/workflows/fonts.yml` from a `fonts-0.0.N` tag only when the
  build reproduces `src/font-pack-catalogue.ts` exactly. GitHub's latest
  release, which the update check reads, passes over a pre-release. BRAT
  reads a tag's first number as its version and, while adding or updating
  a plugin, tries pre-releases first: the earlier `fonts-2`, read as 2.0.0,
  outranked the plugin and made it report a missing `manifest.json` before
  it fell back to the real release; a tag read as 0.0.N always ranks below
  the plugin's own releases. A pack missing from the release answers with a
  plain "this pack is not published yet" message rather than an error.
- [ ] Check every kind of link and formula inside the plugin (`FUT-017`): wiki and
  Markdown links to notes, headings and blocks, web addresses, embeds
  (`![[...]]`) of notes, pictures, PDFs and other canvases, links from Miro
  boards, inline and block LaTeX - in a shown card, while editing, in sticky
  notes, shapes, tables, line labels, comments and in the PDF and PowerPoint
  export; fix what is found.
- [x] The bottom tool bar (`FUT-018`): bring Canvas's own card, note from the
  vault and file from the vault back into quick access, draggable onto the
  board as in Canvas itself (they are now hidden under More and cannot be
  dragged); give the sticky note an icon unlike the card's; let people choose
  in the settings which tools the bar shows and in what order, the rest
  staying under More. Done in the plugin 2026-09-25 (`src/quick-tools.ts`,
  `src/settings.ts`, `src/settings-tab.ts`): one ordered setting
  `toolbarItems` (migrated from the old `showLassoTool` / `showConnectorTool`
  booleans) decides the bar's own content; native Canvas's three buttons move
  as the same elements, never copies, so their own drag-to-add and click
  keep working wherever they land; the sticky tool is a plain square and
  the shape tool Miro's square-and-circle picture (native Canvas's card
  keeps its note icon), all in the icons' own colour;
  Settings → Tool bar lists every item with a toggle and up/down buttons, and
  a reset to default.
- [x] Arranging the board's panels on the board itself (`FUT-019`, extended
  twice on 2026-09-25 at the user's request). Done in the plugin 2026-09-25
  (`src/panel-layout.ts`, `src/panel-arrange.ts`, `src/settings.ts`,
  `src/m1-controls.ts`, `src/m1-session.ts`, `src/main.ts`): "Arrange panels"
  in the dock's board menu, and a command with no default hotkey, put the
  board into a mode with a banner ("Drag the panels and tools", Reset,
  Done); the tool bar, the dock's icon row and the minimap - now its own
  panel, apart from the icon row - can be dragged to a new place, stored as
  the nearest corner or edge plus an offset (`panelLayout`, kept per kind of
  device - `layouts.desktop|tablet|phone` of `data.json`, each with its own
  `toolbarItems` and `panelLayout`, chosen by `Platform.isPhone`/`isTablet`;
  an older file's single layout seeds every kind; the top-level keys are still
  written from the computer's layout for the previous release - one entry per
  panel; a panel with none keeps its own CSS default) so a resized window
  keeps each one inside the view and in place, snapping to the edges and
  centre lines within 12px and turning vertical near a side edge. The bar's
  own items can be dragged to reorder, off the bar into a tray of what is
  left, or back onto it, writing the same `toolbarItems` the settings list
  already edited - neither is a second source of truth. Escape, Done, or
  switching boards leaves the mode; while it is on the board ignores
  presses, as it already did under every one of these panels. A panel
  drag persists through a light path with no session rebuild; a bar change
  still rebuilds, as the settings list's own edits always have, and the
  mode stays open across that rebuild on the same board. The selection
  toolbar is not among the movable panels: it keeps following the
  selection, as before. A person can also choose a bar's orientation
  directly, rather than relying only on the anchor: the layout mode's grip
  now sits beside a small flip button (`rotate-cw`, "Turn the panel") on
  the tool bar and the dock's icon row, which turns the bar between a row
  and a column at once and re-resolves its rect so it stays inside the
  view; the choice is stored as an `orientation` on the panel's own
  `panelLayout` entry, and only overrides the old side-anchor default once
  it is actually made. A vertical bar's own popovers - the More menu, the
  shape picker - and its pen and lines rows now open sideways, towards the
  board's middle, instead of off the edge they no longer have room for.
  The dock's own menus are out of its flow and placed each time one opens
  (`placeDockMenu`, `src/m1-controls.ts`): above or below a row, beside a
  column facing the board's middle, always inside the view, so a moved
  dock no longer grows off the edge when a menu opens. Every panel is also
  placed again, on the next frame, whenever its own size changes: a place
  resolved before the stylesheet arrived - on turning the plugin on or
  updating it - was measured on an unstyled panel as wide as the board.
  Canvas's own card, note and file buttons already create by dragging;
  the plugin's own creating tools (text, sticky note, shape, comment,
  frame, code block, table, link) now do too: pressing one of their
  buttons, on the bar or under "+", and moving the pointer past 4 screen
  pixels shows a ghost of the item at its default size and the board's
  zoom, and releasing it over the board creates it there, centred on the
  drop point, through the very same path a click with that tool armed
  takes - one undo step, selected afterwards, exactly as a click leaves
  it. Releasing over a panel or outside the view, or pressing Escape,
  makes nothing; a plain press with no real movement still just arms the
  tool. On a narrow board the two default places could overlap (seen at a
  680px board with a sidebar open): while neither the bar nor the dock's
  icon row has a `panelLayout` entry, `defaultPanelsFit`
  (`src/panel-layout.ts`) compares their natural widths with the board's and
  `M1CanvasSession.updateCrowding` marks the root
  `data-miro-canvas-crowded` - "toolbar-left" puts the bar at the left
  edge, "stacked" lifts the dock and the minimap above it; a stored place
  turns this off.
- [x] Search on the board (`FUT-020`): the text of cards, sticky notes, shapes,
  tables, line labels and comments, and file names; jump to a match with a
  highlight, next and previous. Done in the plugin 2026-09-28
  (`src/board-search.ts`, `src/board-search-bar.ts`, `src/m1-session.ts`):
  one pass over the saved board builds an index of what a person reads -
  text cards by kind (text, sticky note, shape, table, with a table's or
  code block's title), frame labels, file names with their subpath, link
  URLs, native edge and board connector labels at their place along the
  route, and one entry per comment thread with all its replies at its pin
  (hidden imported threads left out, resolved ones kept) - in reading order.
  Text is compared lower-cased, without accents (й kept apart from и), ё as
  е, and without Markdown and HTML marks. The index is built when the bar
  opens and rebuilt only when native Canvas saved a new document or the
  comment threads changed, never mid-gesture; nothing runs while the bar is
  closed. A jump fits a rectangle centred on the match through
  `fitToBounds`, sized so the zoom is the current one (at least 50%) unless
  the match needs less to fit; a comment is centred at the current zoom and
  its thread card opens beside the pin, a thread with no pin opens in the
  comments panel. One `.miro-canvas-search-hit` outline, which takes no
  pointer events, is placed on the match in `refresh` and `followViewport` -
  never a native selection or a class on native nodes. The bar is a
  `miro-canvas-panel` at the top right; the dock's magnifier and the command
  `m1-search-board` (no default hotkey) open it.
  Runtime fact (Obsidian 1.13.7 on the 1.12.7 installer, checked 2026-09-28 over CDP with real key
  input on the welcome board): Mod+F is bound to `editor:open-search`
  ("Search current file"). With the board focused and no card being written
  it reaches the window as a keydown already `defaultPrevented` and does
  nothing visible. With a card open for writing, focus is in the card's
  `iframe.embed-iframe` and Ctrl+F opens Obsidian's own find bar inside that
  card. So the board takes Ctrl+F (by `event.code === "KeyF"`, any layout)
  only in its window capture handler while the board has focus, no input,
  `.cm-editor` or iframe is focused and no selected card `isEditing`; a card
  being written keeps Obsidian's search. The setting `boardFindKey` (on by
  default) turns the board's claim off.
- [x] A selection toolbar laid out as Miro's (`FUT-021`). Done in the plugin
  2026-09-25 (`src/selection-toolbar.ts`, `src/text-list.ts`, `src/text-link.ts`,
  `src/m1-session.ts`): a card's groups now read shape | font, size | text
  style, alignment, list, link | text colour, marker, fill, border | comment,
  lock, "More". A line or arrow shows its own controls (ends, kind, style,
  width, the label's font) | line colour | comment, lock, "More" instead.
  "More" holds the layer order items, then the native menu's own extras -
  zoom to selection, edit, open link when a link preview is selected - kept
  as the native elements the session moves in, and delete last, a danger
  item. Three controls are new: a bullet list toggle (`- ` on every non-empty
  line of the selected cards' text, code fences and tables left alone), a
  link field that turns a card's whole text - or a selection of it, while
  editing - into a Markdown link (only http(s) and obsidian:// addresses;
  anything else is refused quietly, and an existing link shows in the field
  and is removed with an empty value), and a comment button that pins a new
  comment straight to the selection, the same result the comment tool gives
  clicked there. Nothing that existed is lost, only moved.
- [x] Updates (`FUT-022`). Obsidian's rules forbid a plugin updating itself, so
  updates come as GitHub releases (a version tag with main.js, manifest.json
  and styles.css): before the community catalogue through the BRAT plugin,
  which installs and updates a plugin from this repository's releases
  (described in the README); once in the catalogue through Obsidian's own
  update check. Done in the plugin 2026-09-25 (`src/update-check.ts`): once a
  day at start, unless turned off in the settings, and on the settings'
  "Check" button, the plugin asks GitHub for the latest release's number; a
  newer release shows in the status bar, and a click opens its notes, a link
  and how to update. Nothing is downloaded. Released 2026-09-26 as 0.1.0 and
  0.1.1; the README installs through BRAT step by step, checked in a fresh
  vault.

### Import from other plugins

The formats, chosen by the owner on 2026-09-28: Excalidraw drawings, mind maps
(the note formats of the Enhancing Mindmap and Markmind plugins - their files
are read, their code is not copied) and Advanced Canvas boards. This is stage 6
(`FUT-009`), built 2026-09-28 (`src/importers/`, `src/import-command.ts`).

**How it runs.** One action, "Import into a board", in the command palette
(for the open file) and in a file's menu (for a `.excalidraw` file, a note
whose properties carry `excalidraw-plugin` or `mindmap-plugin`, and every
`.canvas`; the content decides). The file is read once (`cachedRead`), the
importer that recognises it builds the board in memory, and a preview says
what was found (format and version), where the board goes, how many elements
were converted, approximated and not imported, the first 20 entries, and
offers a report card (on by default). Create writes one new file,
`<folder>/<name> (board).canvas` (`(board 2)`, `(board 3)`... when taken;
"доска" in Russian), and opens it in a new tab. Nothing is ever modified or
overwritten - the source least of all; undoing an import is deleting the new
board. The importers are pure (`src/importers/*`, no `obsidian` import), each
optional and format-specific; no other plugin is needed at runtime.

**Excalidraw** (a plain `.excalidraw` file, or the plugin's `.excalidraw.md`
with its `json` or `compressed-json` drawing; LZ-string is read by a local
port, see [THIRD_PARTY_NOTICES](../THIRD_PARTY_NOTICES.md)). Coordinates are
taken 1:1.

| Excalidraw | On the board |
| --- | --- |
| rectangle, ellipse, diamond | text card with a shape (`round_rectangle` when rounded), fill, outline, dash, width, lock; `angle` becomes the card's rotation |
| text inside a shape, text on an arrow | the card's text, the line's label; the note's raw `## Text Elements` wins, so wikilinks survive |
| standalone text | text item with its size, font (Virgil, Excalifont, Nunito... by number), alignment and colour |
| arrow, line bound at both ends | native edge holding where its ends lie; middle points become bends; elbowed/curved/straight route; each arrowhead as the nearest board end, drawn at Excalidraw's own head size |
| arrow, line with a free end | the plugin's own connector with a free anchor |
| pen stroke | drawing item; the turn is worked into its points |
| frame, magic frame | frame (a named group drawn under every card) |
| picture from the vault | file card; missing - dashed placeholder "picture not found" |
| picture stored inside the drawing, iframe, unknown element | dashed placeholder where it was |
| `$$…$$` formula, web embed, embedded note | card with the LaTeX, card with a link, file card |
| element `link` | a line under the card's text; on a line, stroke, picture or frame it is reported ("link not kept") |
| Excalidraw's default ink (`#1e1e1e`, `#000000`) | the board's own text, outline and line colours, which read on light and dark boards; a pen stroke, which must name its colour, takes the pen's own default for the theme the new board opens in (white on dark, `#1a1a1a` on light) |

Reported once per kind, not drawn: hand-drawn roughness, hatched fills,
groups, shape transparency, picture cropping, the background colour. A closed
line's or pen stroke's fill is reported per element ("fill of a closed line").
Deleted elements are counted as skipped. Excalidraw's bookkeeping (`seed`,
`version`, `index`, `updated`, `boundElements`...) carries nothing a board
shows and is neither kept nor reported.

**Mind maps** (`mindmap-plugin: basic`: Enhancing Mindmap, and Markmind's
outline mode). Headings and nested lists become one card per node, sized
from its text, joined parent to child by a curved native line with no
arrowhead, laid out anew as a tree to the right; the root is drawn as Miro
draws a map's centre (bold, large, Miro blue). Fenced code and tables stay
inside their node. Text before the first heading gets a card of its own, a
second root stands beside the first, a folded branch is shown open, and the
note's other properties are reported. Markmind's rich mode (other
`mindmap-plugin` values) is not imported yet: it waits for a real file from
the owner (`MIGRATE-001` stays open for it).

**Advanced Canvas.** The whole board is copied with every field kept
(`styleAttributes`, `miroSource`, unknown fields) under its own ids, so
Advanced Canvas still draws the copy; the plugin adds only the overrides the
board does not already have (an existing override wins and is reported).

| Advanced Canvas | Override |
| --- | --- |
| shape pill, diamond, parallelogram, circle, predefined-process, document, database | `flow_chart_terminator`, `rhombus`, `parallelogram`, `circle`, `flow_chart_predefined_process`, `flow_chart_document`, `can` |
| border dashed, dotted, invisible | `borderStyle` dashed, dotted, none |
| textAlign center, right | `typography.alignment` |
| edge path dotted, short-dashed, long-dashed | `strokeStyle` dotted, dashed, dashed (approximated) |
| arrow triangle-outline, thin-triangle, halved-triangle, diamond(-outline), circle(-outline), blunt | triangle, arrow, stealth (approx.), filled_diamond/diamond, filled_oval/oval, none (approx.) |
| pathfindingMethod direct, square, a-star | straight, elbowed, elbowed (approx.) |
| start node and the lines out of it | `miroCanvas.decks[0]`; at a branch the first line wins (approx.) |
| portal, collapsed group | kept as a file card / shown open (approx.) |

Lines into a portal are reattached to the portal's card where their id says
which, otherwise reported. With both plugins on, the checked board was not
drawn twice: the plugin's shapes cover Advanced Canvas's (checked 2026-09-28
with Advanced Canvas 6.0.1 in the compatibility harness).

**Statuses (LIMIT-002's vocabulary).** Every element is converted, or has an
entry: `approximated` (on the board, not exactly as it was - a mind map's
whole layout counts here), `unsupported` (a board has nothing to show it
with), `source-limited` (the source does not say enough), `missing-asset`
(the file it points at is not in the vault), `invalid-source` (its data
cannot be read), `plugin-unsupported` (a board could show it, the plugin does
not yet), and `skipped` (deleted in the source). A visual element that cannot
come over leaves a dashed placeholder card where it was (LIMIT-001). Each
entry's reason is a stable code with words in English and Russian.

**Provenance, within schema/v1 as it is.** Every card or line that stands for
a source element is bound to it: `miroCanvas.bindings[id] = { sourceId:
"<format>:<source id>", role: "import:<format>:<type>" }` (an Advanced Canvas
copy keeps its ids and needs none). The report card is a native text card to
the right of everything imported, bound `{ sourceId: "import:<source path>",
role: "import-report" }`, in plain Markdown: a link to the source, the format
and its version, `miro-canvas <version>`, the date, the counts and a table of
everything approximated or not imported (at most 500 rows, then "…and N
more"). On a copied board whose own plugin data the plugin does not read (or
that is not an object at all), that data is kept as it is and the card goes
on without its binding. `miroSource` is never used - it is Miro's evidence.

**Deferred: `miroCanvas.imports[]`** (a proposal for miro2obsidian's schema,
to raise once its agent is done): `{ id, format, formatVersion?, sourcePath,
importer, importerVersion, importedAt, reportNodeId?, counts { converted,
approximated, notImported, skipped }, entries[{ sourceId, sourceType, status,
reason, nodeId? }] (maxItems 10000) }`. `ImportReport` in
`src/importers/types.ts` already has exactly this shape, so the day the schema
carries it the report is written as it is.

- [x] `MIGRATE-001` Add explicit, non-destructive import adapters for these
  formats. Convert recoverable structure into native Canvas plus versioned
  `miroCanvas` metadata while preserving the original file unchanged. Done
  2026-09-28 for Excalidraw, mind-map outlines and Advanced Canvas.
- [ ] Markmind's rich mode (`src/importers/markmind-rich.ts` is a stub that
  recognises nothing): needs a real sample file from the owner; no Markmind
  code is looked at.
- [x] `MIGRATE-002` For each importer record provenance, the list of converted
  items and the unsupported fields; promise no equivalence where the other
  plugin's format does not carry the data. Done 2026-09-28: bindings, the
  report card and the report (above).
- [x] `MIGRATE-003` Keep adapters format-specific and optional; never make
  another plugin a runtime dependency or silently rewrite its files. An import
  runs only on an explicit action, with a preview of the result. Done
  2026-09-28.

### M5: release hardening

- [ ] Test network-denied operation. Left: a run with the network denied; in
  code, the only requests are the update check and a font pack download.
- [ ] Test large boards and migrations. A 2,000-card board is measured in the
  synthetic harness and the legacy line-to-connector migration has tests. Left:
  both in a real Obsidian.
- [ ] Test native Canvas, Advanced Canvas, and both plugins together. The
  four-profile matrix is checked offline (`tools/obsidian_oracle`). Left: a
  check in a real Obsidian.
- [ ] Add real-Obsidian visual baselines and accessibility checks. Left: a
  check in a real Obsidian.
- [ ] Run a documented platform/display matrix on Windows, macOS, and Linux (or
  representative virtual machines), multiple viewport sizes and device-pixel
  ratios, and Obsidian desktop and mobile/touch where available. Left: a check
  on each device.
- [ ] Exercise mouse, trackpad, pen tablet/stylus, touch-screen, and phone/tablet
  drawing and selection gestures, including palm rejection and window-focus
  changes for rotated text rendering. Android tablet with S Pen checked
  2026-09-30 (`FUT-010`): pressure, hover, palms before, beside and after the
  pen, a finger's pan, pinch, and the hold that straightens a line, replayed
  over adb and CDP. Left: the other devices, and rotated text on focus
  changes.
- [x] Extract the plugin to its own repository only if the stable release boundary
  justifies it (done 2026-09-24: this repository, `FUT-002`).

## Definition of done

### Connector development checkpoint

New lines and arrows use independent `miroCanvas.connectors` records, not hidden
Canvas nodes. A connector has two anchors (free point, node/image, or a position
along another connector), a route and independent style; arrowheads do not change
its identity. Native/imported edges remain supported through the shared anchor
geometry. Attaching connectors does not merge their styles.

The Lines and arrows tool now stays active until another tool is selected. Its
bottom row keeps route, color and thickness controls open. Select a connector to
drag it or its endpoint handles, change its line/arrow style, copy, cut or delete.
Copy, cut and paste use the clipboard events Obsidian raises itself (see the
2026-09-23 clipboard notes below). File nodes continue to share the original file.
Escape on the board resets tools and selection. `Miro Canvas: Reset tools and
selection` has no default hotkey, so Escape in a card, a label or a field stays
theirs; the command can be bound in Obsidian Settings → Hotkeys.

Run `Miro Canvas: Convert legacy line nodes to connectors` explicitly to migrate
old line cards. The transaction is undoable, idempotent, preserves source data,
and archives the exact former node/override in `connectorMigrationArchive`.
Straight legacy lines now bake their rotation into board coordinates. Rotated
curves/elbows and line cards targeted by native or independent connectors are
retained and reported rather than destructively approximated. Opening a board
does not migrate it.

Limitations: independent connectors need this plugin to display; native Obsidian
does not support free endpoints without node containers. The Canvas file stays
valid and its other nodes/native edges remain usable without the plugin.
Shift-click and lasso support mixed node/connector selections. Copy, paste, cut,
selection deletion and group dragging use one native history step; external
connector anchors are detached on copy while internal anchors are remapped.
Rectangle selection includes independent connectors by the endpoints inside
the box. A line merely crossing the box with both ends outside is not selected.
On a group drag, only caught ends move; the far ends remain fixed.
Every multi-item selection, whether made by rectangle or lasso, keeps one
draggable frame after a move; its entire interior can start another group drag.
Selection deletion checks locks across the dependent-connector closure before
removing anything. A refused save or stale group-drag preview leaves the graph
unchanged. Real-Obsidian mouse
QA is still open because Windows screenshot capture fails with
`SetIsBorderRequired / 0x80004002`; accessibility clicks also lack geometry.
The connector tool uses one persistent bottom panel, without a second floating
route picker. Attached routes and selection frames follow live drag geometry on
animation frames; group-drag previews now project native and source-backed
edges from the same pending positions as independent connectors. Choosing a
comment color saves once on selection instead of on every picker movement.
The focused test disables periodic refresh to verify live geometry.
The focused browser gate covers keyboard clipboard, connector persistence,
undo/redo, copying, displayed-camera following and reset. Both focused and full
browser UI smoke tests pass against the synthetic host; neither replaces real
Obsidian interaction QA.

### Follow-up audit (2026-09-22)

The installed test-vault build reports `ready/valid/ready/ready`. Automated gates
pass: 646 plugin tests, all three browser smoke suites, TypeScript, Ruff, 501 Python
tests with 157 subtests, and structural/visual regression (seven fixtures have
no visual baseline). Real mouse QA remains blocked by the capture/input errors
above; no real-app smoothness claim is made.

Connector selections now use the same icon toolbar as native edges (caps, route,
width, color, lock and delete), not a separate text menu. The bottom connector
row matches drawing controls with swatches, width preview, slider and numeric
entry; arrows are grouped before plain lines. Comment pins capture the first
press and retain their drag through refresh/focus changes.
Run `python -m tools.obsidian_oracle.smoke_plugin_ui --controls` for the focused
menu/marquee/first-press drag gate; `--screenshots <directory>` saves its preview.

Connector attachment settings now default to **nodes only**. Enable unattached
ends and attachment to other lines/arrows separately under Connectors. Disabling
a target type does not rewrite existing connections; it restricts newly placed
or moved endpoints. Invalid new connections are not saved.
The creation panel shows all seven types in one row (arrows left, lines right),
with palette and width controls. Drawing and connectors share a 600px control-row
width, constrained on narrow screens. Changing tools closes the previous popover;
opening shapes leaves the connector tool. Independent endpoints use only their own SVG handles;
dragging one with the connector tool armed must not create a new connector.
The focused browser gate also checks right-button lasso against a competing native
mousedown pan handler, node-only defaults, compact panel width and deletion
button visibility when the native menu is empty. Real Obsidian mouse QA remains
unverified: renewed capture attempts still fail with `0x80004002`.

#### Critical review follow-up

Block arrows now honor the width control and reverse their head correctly.
Block creation starts at width 16, independently of ordinary lines (width 2);
each width is remembered while switching types within the session. The preview
uses the same width as the saved connector. Group drag snapshots use the same
JSON normalization as native transactions, so optional `undefined` Canvas fields
do not cause a false stale-document rejection. A real pointer browser scenario
checks two selected connectors, refresh during dragging, one save, undo and redo.
Removing the head or choosing a non-block-compatible route/cap converts the
appearance to a regular connector while preserving anchors. Legacy implicit
block heads are interpreted without an automatic document migration.
Single-connector drags reject a newer edit to the same connector; dropping on a
disabled attachment target cancels the move instead of retaining the last hover
target. Text-field clipboard events are not consumed by the connector layer.
The settings descriptions explicitly explain Escape and the all-targets-off case.

Remaining review findings, not release claims:

The next development patch restores bend handles on independent straight,
curved and elbowed connectors. Dragging an attached connector's body adjusts its
route without detaching its ends; free connectors still move as a whole.
Clipboard copies now include their selection center, so paste centers the group
at the last canvas pointer location (or the viewport center if none is known).
Clicking with a drag-based line/arrow tool no longer creates a default-length
connector. Explicit multipoint line tools retain their point-placement gesture.
Drawing now has a custom color picker as well as the preset palette, matching
connectors. Hidden comment-card controls stay hidden, preventing the local-delete
and imported-hide buttons from appearing together.

The comment card now edits an author's displayed name before posting and after
posting, deletes individual local replies, and sets a thread's color and lock.
Locking visibly marks the pin and card and prevents replies, author edits,
color changes, resolving, and deletion for that thread in both the card and
comments panel. Unlocking restores those controls; it does not prevent adding
separate comments elsewhere on the board.

A pin is the speech bubble the comment tool wears in the bars (Lucide's
message-circle), filled with its thread's colour and outlined in the board's
own colour. Its tail is the comment's point, so the pin's bottom-left corner
sits on it, and the author's letter is centred in the round part. A resolved
thread keeps its colour and shows a tick (Lucide's check) in place of the
letter. The bubble is an inline SVG made once with the button; a refresh only
changes which of the letter and the tick shows. The card's header resolves
with an icon button carrying that tick, with no caption: `aria-pressed` shows
whether the thread is resolved and its tooltip says what a press will do
("Mark as resolved" or "Reopen"). A "?" beside it explains resolving, as its
tooltip on a desktop and, because a touch screen has no hover, as a note a
press shows under the header.
The default name still comes from the plugin setting; imported author changes
are local display aliases, not edits to Miro metadata. Connectors can anchor to
comment markers and resolve their endpoints as comments move. A connector's
arrowhead size is adjustable independently of stroke width. The mixed lasso
frame encloses selected native items, independent connectors, and comment pins;
dragging its interior moves the whole selection in one transaction. These behaviors have
focused unit and synthetic-browser coverage, not live Obsidian acceptance.
The left-button rectangular gesture draws one lightweight plugin marquee.
On release it selects native nodes and edges, independent connectors and comment
pins together; pointer movement only updates that one box, without rebuilding
the board or asking native Canvas to draw a competing marquee.
Selection uses the painted screen centers of nodes and comment pins, and the
visible endpoint positions of native and independent connectors. A group/frame
must be fully enclosed so a small rectangle inside a large frame does not take
it. A single caught connector end has a small draggable selection frame; its
other end does not move. When both ends and the full route are inside, route
bends move too.
Native-only selections keep Obsidian's visible frame; the plugin's full-area
drag target is transparent. Mixed selections with independent connectors use
the plugin's visible frame because the native one cannot enclose them; comments
use the same rule. An unrotated single node keeps native border plus plugin
grips, without a second outline. The neighboring-node arrow buttons stay in
the transparent handles overlay anchored to that native border. While dragging
a marquee, shared-frame geometry is not recomputed.
Sticky fill offers Miro's 17 named colors in an eight-column grid, followed
by up to 12 recently used colors and a separate custom-color input. Recent
colors may repeat a preset; these are distinct sources, not additional Miro
sticky colors.
Only attached endpoints follow a node's rotation; free ends and bends retain
their board positions. The lasso-to-shared-frame drag is covered by the
synthetic browser gate.
Comment colors preview during picker input and persist once on selection, even
if the card refreshes before the picker closes. During a pin drag, attached connector paths follow the pin
without saving intermediate positions; cancelling restores the original route.
The drawing and connector creation bars share a 600 px, single-row layout;
on narrower screens they scroll horizontally rather than wrapping.
Independent connectors can receive a label through the **Add or edit line label**
button in the selection toolbar, Enter, or a double-click on the line. Drag the
label along the route; its initial
position defaults to the midpoint and is configurable in plugin settings.
When a native edge has a plugin-defined route, the plugin positions its label
on that visible route instead of leaving Obsidian's original label at the old
midpoint. The label follows the body during its first route drag and during
group movement. Double-click to edit or drag that label along the route. A pure pan
translates the existing independent-connector SVG instead of rebuilding it.

- Native-edge-only clipboard payloads without their endpoint nodes are not yet
  supported by the unified paste path. Independent connectors are supported.
- Formatting a mixed native/independent selection still uses separate style
  transactions; it is not yet guaranteed to be one undo step like group movement.
- Large boards are measured below; no guarantee is made beyond them.
- Live Obsidian mouse/clipboard, other OSes, touch/stylus and high-DPI rotated
  text remain separate acceptance gates, not covered by the synthetic browser.

#### Standard edges, one label editor, large boards (2026-09-23)

A line or arrow whose both ends hold on to cards (node or image anchors on two
different cards) is now a native Canvas edge, as one drawn between cards in
Obsidian is: it opens and stays usable without the plugin. Its route, caps,
dashes, width, colour and exact anchors live in `localOverrides`. A line with
a free end, an end on another line or on a comment stays a
`miroCanvas.connectors` record. Moving an end converts between the two under
the same id and keeps the look and the label; each conversion is one undo step.
An imported edge stays the native edge its Miro connector is bound to: a moved
end is held by the plugin's anchor, as before. Drawing with the Lines and
arrows tool from card to card creates the native edge directly.

The board's own connectors are drawn in native Canvas's moving layer, beside its
edges and under the cards, with native Canvas's edge classes: hover, selection
halo, end grips, bend grips and the toolbar are the ones native edges use, and
pan or zoom costs them nothing. Only a connector whose route, style or selection
changed is redrawn.

Labels of native edges and of the board's own connectors are the same element:
native Canvas's label style, placed on the route the plugin draws, in board
units. Click selects the line; drag slides the label along the route; a
double-click, Enter or the toolbar button edits it in place (Enter keeps,
Shift+Enter breaks the line, Escape cancels). Native Canvas's own hidden editor
is no longer opened by its Enter or double-click.

Undo fix: writing plugin metadata during a graph transaction replaced the
document native Canvas also keeps as its latest history entry, so Undo could
bring back new metadata with the old graph (for example a native edge reappearing
beside its converted connector). The document is now replaced by a copy.

Large boards: on a synthetic board with 2,000 cards, 980 native edges (labelled
every fifth) and 520 own connectors, one plugin refresh dropped from about 130 ms
to about 4 ms and the plugin's work per panned frame from about 10 ms to about
2 ms. A card dragged there used to move at about 7 frames a second; the plugin's
work per dragged frame is now about 35 ms. The board is read
again only when native Canvas saves (or while a press is held), metadata is parsed
once per metadata object, native elements are guarded once, the minimap content
is projected once per scene, routes that hold on only to unmoved cards are kept
mid-drag, and the overlay frame loop runs only during gestures and settling
animations. These are main-thread measurements in the isolated harness, not a
frame-rate guarantee.

All three synthetic browser suites pass (default, `--interactions`,
`--controls`). The synthetic host now has native Canvas's moving layer and
live card positions; the default suite had been failing at the local tools
rotation step because a press on that panel cleared the selection.

Clipboard (2026-09-23): Ctrl+C, Ctrl+X and Ctrl+V are no longer intercepted.
They reach the board as the clipboard events Obsidian raises for them in any
keyboard layout, as do Cut, Copy and Paste in native Canvas's selection menu
and in the plugin's menu for the board's own connectors. A copy writes
`obsidian/canvas` (the graph, which native Canvas pastes by itself on any
board, with the board's own connectors beside it), `obsidian/miro-canvas` (the
plugin's record of every item) and `text/plain` (card texts, files as
`[[links]]`, pages as addresses), so a paste into a note or another program is
readable text rather than JSON. A paste of a graph lands centred under the
pointer as one undo step; files, images, text and links are native Canvas's to
paste. The plugin's replacement context menu is gone: native Canvas's menus
stay. Shortcuts are recognised by the key pressed (Ctrl+С in a Russian layout is
Ctrl+C, and the tool letters work in any layout), and a key with nothing selected
is no longer refused as a text edit, which had disabled the tool letters and
paste with an empty selection.

| Requested feature | Evidence / remaining boundary |
| --- | --- |
| Comments: drag/delete, author name and color | Marker, thread, local-comment and settings tests pass. Imported comments are hidden locally, not erased from source. |
| Rotation magnets and 90-degree buttons | Selection-handles tests cover 45-degree snapping; toolbar keeps quarter turns. |
| Configurable lasso/pan/line gestures and button visibility | Settings and pointer-binding tests pass; mixed lasso is covered by browser interactions. Bindings use the supported presets. |
| Text marker, quiet frame colors, minimap type colors | Text-highlight, selection-toolbar and minimap-model tests pass; full browser gate passes. |
| Native app validation | Load status observed after reload. Drag smoothness and real OS clipboard still need user verification. |

#### Dragging large selections (2026-09-28)

Measured in a real Obsidian 1.13.7 with `tools/obsidian_cdp/bench` (see its
README) on synthetic boards of 2,000 and 5,000 cards. A multi-item drag with
the plugin on goes through the plugin's own selection frame: each pointer
move previews the whole selection and redraws what follows it.

- The selection toolbar and the shared selection frame no longer measure
  every selected card each frame. `src/selection-bounds.ts` measures a large
  selection (more than 32 items on the page) once per selection and saved
  board, then follows it by two of its cards; while those two only move and
  scale together - a drag, a pan, a zoom - the measured bounds move and scale
  with them, and anything else (the two disagree, a card comes onto or leaves
  the page, another selection, another saved board) measures it again. A
  smaller selection is still measured card by card.
- Native Canvas keeps only the cards and lines near the view on the page; the
  others measure as an empty box in the window's corner, which used to pull
  the toolbar and the frame there. They are left out now: the toolbar sits
  over the part of the selection in view.
- The kinds a selection holds are worked out once per selection and saved
  board (a drag does not change them), with the board's cards looked up by id;
  the selected ids are kept as a set beside the list for the per-card checks.
- During a drag only the toolbar's placement changes, so the rest of its state
  (with every selected id in it) is signed once, not on every frame.

Time per pointer move with the plugin on (60 moves; the view fitted to the
selection, zoom 6 %; plugin off shown for scale):

| Board, selection | Before | After | Plugin off |
| --- | --- | --- | --- |
| 2,000 cards, all | 841 ms | 719 ms | 236 ms |
| 5,000 cards, 500 | 626 ms | 595 ms | 342 ms |
| 5,000 cards, all | 2,146 ms | 1,386 ms | 377 ms |
| 5,000 cards, all, zoom 100 % | 1,166 ms | 747 ms | 37 ms |

Small selections are unchanged: their cost is the per-move work on the whole
board that remains - translating the board's document for the preview, the
source renderer's refresh (it measures every drawn card before its change
gate), the appearance pass, a forced layout when the overlays read the view's
size, and writing the move at the end. Those are the next steps for huge
boards. A long drag of every card on a 2,000-card board is refused at the end
("the board changed") in both builds; that is a separate problem.

Part 2 (2026-09-28). Two faults, and the next cost of a drag:

- **The locks were read once for every card.** Native Canvas moves a
  selection card by card - on every move of its own drag and on every arrow-key
  press - and the plugin checks each card against the board's locks before it
  may move. Each check read the saved board, the whole selection and the
  metadata again, so one step cost the square of the selection: an arrow-key
  press with 5,000 cards selected took about 17 s. The reading is now kept for
  the rest of that step (the same turn of the event loop), and only while the
  saved board and the selection are the objects it was taken from; a lock,
  review mode or another selection reads them again. The policy is parsed once,
  and the ids a lock covers - locked cards and everything inside a locked
  frame, however deep - are worked out once per policy (`src/m1-session.ts`,
  `src/interaction-policy.ts`). Locked cards, cards in a locked frame and review
  mode are refused as before.
- **A long drag was refused when let go.** Native Canvas lists a board's cards
  and frames by layer, and gives a frame its layer only when it first draws it.
  A long drag on a large board brings frames into view that had not been drawn
  yet, so at release native Canvas lists the same cards in another order, and
  the check that nobody changed the board meanwhile refused the move. That
  check (`moveSelection` in `src/canvas-authoring.ts`) now ignores the order of
  cards and frames and nothing else: a card changed, added or removed, the
  lines' order or the plugin's own data changed still refuse, and the order the
  board has at release is kept. The other writes need no such change: each
  reads the board and writes it in the same step, with no frame drawn between.
- **The lines follow a drag without the cards being drawn again.** While a
  selection is dragged, `src/source-renderer.ts` keeps what it drew on the
  cards - shapes, sticky notes - and draws only the lines again; it measures
  the cards once as the drag begins. The cards are drawn again, as before,
  when anything about them other than their place changes.

An arrow-key press, which moves every selected card the native way (at the end
of part 2, presses sent back to back and timed until the key was handled; three
presses; the first press with the plugin off also warms up):

| Selection | Before | After | Plugin off |
| --- | --- | --- | --- |
| 2,000 cards | 2,937-3,112 ms | 747-777 ms | 5-291 ms |
| 5,000 cards | 16,592-17,015 ms | 1,094-1,214 ms | 8-319 ms |

Moving all 2,000 selected cards once the native way, timed in the page:
2,487 ms before, 19 ms after.

Time per pointer move on the 5,000-card board, zoom 6 %, plugin on (the first
column from 60-move drags, the others from 20-move drags):

| Selection | Before | Locks and refusal fixed | Lines drawn alone | Cards measured once |
| --- | --- | --- | --- | --- |
| 50 cards | 559 ms | 561 ms | 229 ms | 221 ms |
| all 5,000 | 1,490 ms | 1,431 ms | 1,078 ms | 1,033 ms |

A drag of all 2,000 cards on the 2,000-card board took 745 ms a move and was
refused at the end before; with the refusal fixed it took 773 ms a move, was
written as one step of native history, and one undo put every card back.

Part 3 (2026-09-30). Three more changes to what a drag costs, and the whole
matrix measured on the final build. A profile of a drag of all 5,000 cards (25.3
s over 23 moves) had put about 9.4 s into the first measuring of the page after
the cards had moved - the selection frame's, which makes the browser restyle
every moved card at once - and about 4.7 s into the board's own connectors, most
of it building each line's elements afresh on every move. Now, while cards alone
are dragged, the selection frame and the toolbar are placed once as the drag
begins and then moved with the pointer (measured again if the view pans or
zooms, and after the drag); the handles, never shown for more than one item,
measure nothing meanwhile; a connector whose look is unchanged is redrawn along
its new course in place (`src/connector-layer.ts`); and the dragged ids are
looked up in sets when the drag starts and ends.

Measured in a real Obsidian 1.13.7 (a 1,280 x 800 window at 100 Hz) with real
`Input.dispatchMouseEvent` input: 60 pointer moves 15 ms apart, then let go, one
run for each row. Before is the build without this work (b4a996a), after the
final build, plugin off native Canvas alone. Each cell is how long one move took
on average / the 95th-percentile frame during the drag, in ms. The view is
fitted to the selection (zoom 6 % for the large ones, 100 % for one card). The
baseline's plugin-on rows at this zoom come from an earlier session (except the
5,000-card 500 row); repeating them in this one gave the same time per move to
within 8 %:

| Board | Selection | Before | After | Plugin off |
| --- | --- | --- | --- | --- |
| 2,000 cards | 1 (100 %) | 56 / 84 | 52 / 90 | 31 / 10 |
| 2,000 cards | 50 | 348 / 434 | 205 / 240 | 139 / 220 |
| 2,000 cards | 500 | 435 / 534 | 271 / 310 | 223 / 430 |
| 2,000 cards | all | 745 / 834, refused at the end | 497 / 550 | 234 / 300 |
| 5,000 cards | 1 (100 %) | 112 / 217 | 106 / 210 | 31 / 10 |
| 5,000 cards | 50 | 559 / 650 | 199 / 210 | 166 / 360 |
| 5,000 cards | 500 | 596 / 670 | 221 / 260 | 317 / 710 |
| 5,000 cards | all | 1,490 / 1,584 | 641 / 730 | 399 / 500 |

The first selected card shown at zoom 100 %, so that a screenful of cards is on
the page:

| Board | Selection | Before | After | Plugin off |
| --- | --- | --- | --- | --- |
| 2,000 cards | 1 | 53 / 90 | 53 / 90 | 31 / 10 |
| 2,000 cards | 50 | 129 / 110 | 66 / 40 | 31 / 10 |
| 2,000 cards | 500 | 153 / 160 | 79 / 50 | 31 / 10 |
| 2,000 cards | all | 262 / 270 | 114 / 110 | 31 / 10 |
| 5,000 cards | 1 | 104 / 210 | 104 / 210 | 31 / 10 |
| 5,000 cards | 50 | 277 / 320 | 123 / 130 | 31 / 10 |
| 5,000 cards | 500 | 310 / 350 | 145 / 160 | 31 / 10 |
| 5,000 cards | all | 767 / 780 | 253 / 270 | 34 / 20 |

Every drag with the plugin on moved the pressed card as far as the pointer went
and none showed a notice, except the baseline's drag of all 2,000 cards at zoom
6 %, which was refused at the end. A drag of 50 or more cards takes 1.5 to 3
times less time, and with 50 or 500 cards on the 5,000-card board at zoom 6 % it
is now about as quick as native Canvas alone (199 and 221 ms against 166 and
317). One card is unchanged - 52 ms on the 2,000-card board and 104-106 ms on
the 5,000-card one, against 31 ms without the plugin - so the work every move of
any drag still does on the whole board is what is left there. All 5,000 cards
still take 641 ms a move against 399, and at zoom 100 % a large selection takes
66-253 ms against 31-34.

An arrow-key press with all the cards selected, on the final build and the
baseline: a real key press and the wait until the browser has drawn the result,
three presses in each of three runs (nine per cell), the median and the range in
ms. The key's handler alone took a median of 3,027 ms before and 607 after with
2,000 cards, 16,329 and 976 with 5,000; where the cost falls, in the handler or
in the frame after it, varies from press to press, the sum less. Every press
moved the first card by the same distance in every build:

| Selection | Before | After | Plugin off |
| --- | --- | --- | --- |
| 2,000 cards | 3,387 (3,213-3,780) | 919 (594-1,274) | 477 (467-514) |
| 5,000 cards | 16,581 (16,174-19,246) | 1,111 (788-1,212) | 492 (451-698) |

Undo, checked with real input on the 2,000-card board: all 2,000 cards dragged
with `Input.dispatchMouseEvent`, undone with Ctrl+Z and redone with
Ctrl+Shift+Z, twice. The drag moved every card by the same 3,791 x 1,895 (the 5
frames stayed, no other field of any card changed, the lines' data was the same,
no notice appeared), native Canvas's history gained exactly one entry, one undo
put every card back - the whole node list of the saved board, compared by id
with the file before the drag, was identical - and one redo moved them again.

The baseline run that ended without moving (5,000 cards, 500 selected, no
notice) did not come back: in 9 runs on this board with 500 selected (6 of the
baseline, one of them inside the first matrix in its original order, and 3 of
the final build) the card moved every time, and in the 6 runs that logged the
press (5 of the baseline, 1 of the final build) it was on the plugin's selection
frame, the plugin took it (the pointer-down came back cancelled) and the
selection stayed at 500. A press put on purpose beside the frame, on an
unselected card, gives what that run gave - the card does not move, no notice,
and native Canvas has already dropped the selection from 500 to 1 - so the most
likely cause is a press point that no longer lay on the frame when the press
came, a fault of the benchmark and not of the plugin. A silent refusal inside
the plugin (`startSelectionMove` returns false without a notice under several
conditions, and native Canvas then gets the press) would look the same and is
not ruled out. Neither the benchmark nor the plugin was changed for it.

Still slow: every move of a drag still pays for the whole board (one card takes
104 ms on the 5,000-card board against 31 without the plugin), for the browser
restyling every moved card (native Canvas pays that too: 399 ms a move for all
5,000 cards with the plugin off) and, when let go, for writing the move - the
page then draws no frame for about 1.2 s with all 2,000 cards moved and for more
than 1.5 s with 500 or all 5,000 cards on the 5,000-card board. An arrow-key
press with 5,000 cards takes 1.1 s against 0.5 s without the plugin, and has not
been profiled (the per-card lock check itself takes 15-30 ms for 5,000 cards,
timed in the unit test host).

A regression in the one-card row, found and removed (2026-09-30). Dragging a
selected card with a finger or the pen (f72b8b2) had added one style rule:
`touch-action: none` on every element of a selected card's content, except in a
card holding an iframe or a webview, which it found with `:has()`. With the
plugin on, that rule made one card take 108-138 ms a move on the 2,000-card
board and 281-352 ms on the 5,000-card one (52 and 105 ms before it, 31 ms with
the plugin off): the browser matched every element of every card against it on
each style recalculation, and every move of a drag causes one. Taking only that
rule out of the stylesheet gave 51.5 ms back, so it was the cause. The session
now marks the picked cards itself: `data-miro-canvas-picked` goes on a card
that is picked, is not being written in and holds no iframe or webview, and
comes off when it stops being so (`src/picked-cards.ts`; native Canvas's class
changes on a card say when, and the frame is looked for once, when the card is
marked). The rule reads that mark and applies only on a touch screen
(`@media (any-pointer: coarse)`), so a computer with a mouse carries none of it.
A finger sent over `Input.dispatchTouchEvent` onto a heading, a paragraph, a
list item, a code block, a table cell or a callout of a picked card still drags
it, in one history step and one undo, and the browser takes back no pointer; a
card that shows a web page is not marked. One card at zoom 100 %, plugin on,
the build before this fix (f919a4d) against after it, two passes each: ms a
move / 95th-percentile frame during the drag.

| Board | Before | After | Plugin off |
| --- | --- | --- | --- |
| 2,000 cards | 108 / 260, 134 / 290 | 53 / 90, 52 / 90 | 31 / 10 |
| 5,000 cards | 317 / 710, 281 / 640 | 106 / 210, 111 / 220 | 31 / 10 |

The rows for 50 and for all cards are as they were. Passes of the whole matrix
for one build and then the other showed the fitted 50-card and all-card rows
5-15 % slower after the fix in both orders; with the builds alternated run by
run, five runs of each (fitted view, median ms a move, before / after), they came out
alike: 2,000 cards 50 selected 211 / 217, all 509 / 505; 5,000 cards 50 selected
198 / 205, all 653 / 637. The passes ran on a machine shared with other
measurements, and the gap was not reproduced. What the plugin adds to a drag is a
MutationObserver on the classes of the cards, which sees the many class writes
the plugin's own decoration pass makes to every card on each refresh, so a few
per cent on the 50-card rows are possible.

The first production release is ready when:

1. ordinary Canvas boards gain the promised editing features without
   `miroSource`;
2. imported boards keep all canonical source and provenance data;
3. files remain valid and useful without the plugin;
4. the plugin works offline with network access denied;
5. native Canvas and optional Advanced Canvas modes pass the same compatibility
   fixtures;
6. minimap, comments, typography, locking, colors, themes, attachment labels,
   and connector anchors are keyboard-accessible and covered by tests;
7. opening a board never changes it silently;
8. source-limited data is identified honestly rather than fabricated.
