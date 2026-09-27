# Obsidian CDP recording harness

Records scripted demonstrations of the `miro-canvas` plugin - one GIF per
feature or setting - by driving a real, isolated Obsidian instance over the
Chrome DevTools Protocol (CDP). It never touches your own Obsidian profile or
vaults, never goes to the network beyond launching Obsidian itself, and never
installs anything.

Written for an agent who has not seen this repository before. If something
below is unclear once you have tried it, that is a bug in this file.

## What's here

| File | Purpose |
| --- | --- |
| `launch.py` | Starts an isolated Obsidian instance with the plugin enabled, on one CDP port. |
| `stop.py` | Closes that one instance, by port, over CDP. |
| `cdp.mjs` | A small CDP client, usable standalone or imported by `record.mjs`. |
| `record.mjs` | Runs a scenario while screen-recording it, then builds a GIF. |
| `frames_to_gif.py` | Pillow: resamples, times and encodes the captured frames into a GIF. |
| `scenarios/*.mjs` | Example scenarios (see "Writing a scenario"). |

## Prerequisites

- Node 22+ (has a global `fetch` and `WebSocket` - no npm install needed for
  these scripts).
- Python 3.11+ with `pip install -r requirements-dev.txt` (Pillow) run once
  from the repository root.
- Obsidian installed normally on this machine (used only to locate its
  executable and to copy its already-downloaded app package - see below).
- The plugin built: `npm run build` (produces `main.js` next to
  `manifest.json` and `styles.css` at the repository root). `launch.py`
  fails with a clear message if `main.js` is missing.

## Ports - read this before running anything

Obsidian instances on ports **9333, 9334, 9335** may belong to other agents
or tools working in this repository at the same time, and your own real
Obsidian (if it is running with remote debugging, which it normally is not)
is a different thing again. **Use port 9336 for this harness's own instance**
unless you have a specific reason to use another number, and never call
`stop.py`, or any raw CDP command, against a port you did not just launch
yourself. `stop.py` only ever acts on the exact port you give it.

## Launching

```
python tools/obsidian_cdp/launch.py --port 9336 --lang en
python tools/obsidian_cdp/launch.py --port 9336 --lang ru --fresh
```

Options: `--work <dir>` (default `tools/obsidian_cdp/.out/obsidian-cdp`),
`--port <n>` (default 9333 - pass 9336), `--lang en|ru`, `--width`/`--height`
(default 1280x800), `--fresh` (wipe and recreate the vault and its profile).

What it does, in order: finds Obsidian's executable and its config directory
for this OS (see "Where Obsidian lives" below); copies the already-downloaded
`obsidian-<version>.asar` into an isolated profile directory so this harness
never has to fetch an app package itself; copies the built plugin
(`main.js`, `manifest.json`, `styles.css`) into a fresh, isolated vault and
lists it in `community-plugins.json`; launches Obsidian with
`--user-data-dir=<profile> --remote-debugging-port=<port>`; waits for its CDP
page target to appear; turns community plugins on
(`app.plugins.setEnable(true)` - a fresh vault starts in restricted mode) and
enables `miro-canvas` (`app.plugins.enablePluginAndSave("miro-canvas")`); sets
Obsidian's interface language (`localStorage.setItem('language', ...)` then
reloads, since the language only takes effect after a reload) when it is not
already the requested one; resizes the window; and answers the plugin's
first-run "Welcome to Miro Canvas" modal by clicking its "Open the welcome
board" button, which both dismisses the modal and opens the welcome board -
so every recording starts from the same board. It prints the port, the vault
path, the profile path and the launched process's pid.

**Determinism**: without `--fresh`, a vault is reused as-is (only the
plugin's three built files and the two config files that enable it are
refreshed) - useful for iterating on a scenario, but the vault's *content*
(the welcome board, any files a previous scenario left, the plugin's own
saved settings in `.obsidian/plugins/miro-canvas/data.json`) is whatever an
earlier run left behind. **Pass `--fresh` before recording anything you
intend to keep**, so the state is exactly what `launch.py` itself produces.

Stop the instance when done:

```
python tools/obsidian_cdp/stop.py --port 9336
```

### Where Obsidian lives, by platform

| | Executable | Config dir (has `obsidian-<version>.asar`) |
| --- | --- | --- |
| Windows | `%LOCALAPPDATA%\Obsidian\Obsidian.exe` | `%APPDATA%\obsidian` |
| macOS | `/Applications/Obsidian.app/Contents/MacOS/Obsidian` | `~/Library/Application Support/obsidian` |
| Linux | `obsidian` on `PATH`, else `/opt/Obsidian/obsidian` or `/usr/bin/obsidian` | `~/.config/obsidian` |

Override either with `--obsidian-exe` / `--config-dir` if auto-detection picks
the wrong thing (e.g. more than one install).

**Known limitation**: Obsidian itself checks GitHub for an app update on
every launch, before this tool does anything. That is Obsidian's own
behaviour, independent of this harness (which never fetches or installs
anything on its own), and there is no supported flag to suppress it; it does
not affect recordings, since nothing here waits on or reacts to that check.

## The CLI (`cdp.mjs`)

A thin CDP client, handy for poking at a running instance by hand:

```
CDP_PORT=9336 node tools/obsidian_cdp/cdp.mjs eval "return app.workspace.getActiveFile()?.path;"
CDP_PORT=9336 node tools/obsidian_cdp/cdp.mjs evalfile some-script.js
CDP_PORT=9336 node tools/obsidian_cdp/cdp.mjs shot out.png              # whole window
CDP_PORT=9336 node tools/obsidian_cdp/cdp.mjs shot out.png 0 0 400 300  # clipped
CDP_PORT=9336 node tools/obsidian_cdp/cdp.mjs mouse '[{"type":"mousePressed","x":10,"y":10,"button":"left","clickCount":1}]'
CDP_PORT=9336 node tools/obsidian_cdp/cdp.mjs key Escape
CDP_PORT=9336 node tools/obsidian_cdp/cdp.mjs type "hello"
CDP_PORT=9336 node tools/obsidian_cdp/cdp.mjs raw Page.bringToFront '{}'
```

`CDP_TITLE=Settings node tools/obsidian_cdp/cdp.mjs eval "..."` runs against
another open window (matched by a substring of its title) instead of the
main one - see "Separate windows" below.

`record.mjs` does not shell out to this file; it imports the same functions
(`connectTarget`, `evaluate`, `pressKey`, `insertText`, ...) directly.

## Recording a scenario

```
node tools/obsidian_cdp/record.mjs \
  --scenario tools/obsidian_cdp/scenarios/sticky-note.mjs \
  --out docs/media/en/sticky-note.gif \
  --port 9336 --fps 10 --width 960
```

Requires an instance already running on `--port` (start one with
`launch.py` first). It runs the scenario while capturing
`Page.startScreencast` frames with their own timestamps, then hands them to
`frames_to_gif.py`, which resamples every frame to `--width` (aspect
preserved), pads any frame shorter than the tallest onto one shared canvas
size (relevant when the scenario visits a differently-sized window, such as
Settings), times each frame from its neighbours' real timestamps (thinned to
roughly `--fps`, clamped between 20ms and 1200ms, with the last frame held
for at least 900ms so the final state is readable), and saves a
looping (`loop=0`), optimized GIF. It prints the frame count and file size,
and warns on stderr above 4 MiB - GIFs are inherently large for anything but
a short, low-motion scenario; keep scenarios brief and captions few if you
are near the limit.

Recording both languages from **the same scenario file**: run `launch.py`
once per language (each needs its own already-running instance, in that
language - the interface language is process-wide, not something a scenario
can flip mid-run) and record into the matching `docs/media/<lang>/` folder:

```
python tools/obsidian_cdp/launch.py --port 9336 --lang en --fresh
node tools/obsidian_cdp/record.mjs --scenario tools/obsidian_cdp/scenarios/sticky-note.mjs --out docs/media/en/sticky-note.gif --port 9336
python tools/obsidian_cdp/stop.py --port 9336

python tools/obsidian_cdp/launch.py --port 9336 --lang ru --fresh
node tools/obsidian_cdp/record.mjs --scenario tools/obsidian_cdp/scenarios/sticky-note.mjs --out docs/media/ru/sticky-note.gif --port 9336
python tools/obsidian_cdp/stop.py --port 9336
```

GIFs go at `docs/media/<lang>/<scenario-name>.gif`. Embed one in a README
with plain Markdown: `![Sticky note](docs/media/en/sticky-note.gif)`.

## Writing a scenario

A scenario is a `.mjs` file whose default export is `async function (s) { ... }`.
`s` is:

- `s.lang` - `"en"` or `"ru"`, read from the running Obsidian
  (`localStorage.getItem('language')`, default `"en"`). Use it for anything
  a caption-only helper does not already cover.
- `s.caption(text)` - shows a banner at the top of the *recorded* window.
  `text` is a plain string, or `{ en: "...", ru: "..." }` to pick by
  `s.lang` - **prefer the object form** so one scenario file produces both
  languages' GIFs unchanged. Call it again with new text to change it, or
  with `""` to hide it. Removed automatically at the end of the recording,
  along with the fake cursor - a scenario never has to clean these up itself.
- `s.click(target)`, `s.move(target)` - `target` is `{ x, y }`,
  `{ selector: "css selector" }`, or the object `s.find` returns.
- `s.drag(from, to, { steps })` - `from`/`to` are the same kind of target;
  `steps` (default 12) is how many intermediate `mousemove` points to send.
- `s.type(text)` - `Input.insertText` into whatever has focus (one native
  insert, not a key per character).
- `s.key(name)` - one key press. Named keys: `Escape`, `Enter`, `Tab`,
  `Backspace`, `Delete`, `Space`, `ArrowLeft/Up/Right/Down` (see
  `KEY_TABLE` in `cdp.mjs`); a single letter or digit (`"N"`, `"5"`) also
  works, for the board's own tool hotkeys.
- `s.wait(ms)`.
- `s.eval(code)` - runs `code`'s statements in the recorded window (wrapped
  in `(async () => { ... })()`, so `return` and top-level `await` both work),
  and returns its value. Use this for setup a scenario needs but should not
  itself be part of the recording (see the sticky-note example: it creates a
  private, empty board first, since a fixed click point on the busy welcome
  board would depend on that board's own zoom/pan).
- `s.find({ selector, textEn, textRu, controlSelector })` - finds an element
  and returns `{ x, y, width, height }` (a point + size you can pass straight
  to `s.click`), or `null`. `selector` narrows a `querySelectorAll` (default
  `"*"`); if `textEn`/`textRu` are given, the element's own text must equal
  or contain one of them (whichever matches `s.lang`, tried loosely so
  wrapping whitespace does not matter). `controlSelector`, if given, is
  queried *inside* the matched element and its rect is returned instead -
  e.g. Obsidian's `Setting` rows have no id of their own, so you match the
  row by its label text and then reach into `.checkbox-container` for the
  actual toggle to click.
- **Prefer a selector over text when one exists.** Interface text changes
  with the language; a `data-*` attribute or class does not. The board's own
  tool bar already tags every button with `data-tool="sticky"` /
  `data-tool="text"` / etc. (`src/quick-tools.ts`) - use those instead of a
  button's (translated) tooltip. `textEn`/`textRn` are the documented
  fallback for the many places (plain Obsidian `Setting` rows, mainly) that
  have no such attribute.
- `s.openSettingsTab(id)` - opens Settings on the tab with that id (e.g.
  `"miro-canvas"`) and switches the recorded/controlled window to the
  Settings pop-out - language-independent, since it never has to look at
  that window's (translated) title. **Call it while the main window is the
  current one** (true at a scenario's start, or after `s.mainWindow()`).
- `s.closeSettings()` - closes the Settings pop-out and switches back to the
  main window.
- `s.window(titlePart)` - the general escape hatch: switches to whichever
  open window's title includes `titlePart`. Obsidian's window titles are
  only *partly* translated (`"Settings - <vault> - Obsidian 1.13.7"` in
  English, `"Настройки - ... - Obsidian 1.13.7"`
  in Russian - only the word "Obsidian" and the vault name are shared), so a
  scenario using this directly (rather than `openSettingsTab`) should
  compute `titlePart` from `s.lang` itself.
- `s.mainWindow()` - back to the window the scenario started in.

### Separate windows

Settings, and the community plugin browser, are **separate OS windows** -
separate CDP page targets, each with its own screencast, its own DOM, and
(as far as this tool assumes) its own JS globals; `app` is only guaranteed to
exist in the *main* window's context (that is why `s.closeSettings()` runs
`app.setting.close()` there rather than wherever is currently recorded, and
why `s.openSettingsTab` must be called from the main window). Switching with
`s.window`/`s.openSettingsTab`/`s.mainWindow` stops the screencast on the
window you are leaving and starts it on the one you are switching to;
`record.mjs` keeps every window's connection open for the rest of the run (so
switching back and forth is cheap) and closes them all, after removing the
recording overlay from each, when the scenario finishes.

### The fake cursor

Screencast frames never show the real OS cursor. `record.mjs` injects a
small absolutely-positioned element into every window it records, and moves
it to match every dispatched mouse event (with a brief ripple on click), so a
viewer can actually see where each action happens. This is automatic - a
scenario never touches it directly.

## Troubleshooting

- **"Missing built plugin file(s)"** - run `npm run build` first.
  `launch.py` never builds the plugin itself.
- **A fresh vault shows "community plugins are disabled"** - `launch.py`
  already calls `app.plugins.setEnable(true)`; if you are driving CDP by
  hand instead, that restricted-mode master switch is separate from
  `community-plugins.json` (which only lists which plugins to enable once
  the switch is on).
- **`Page.captureScreenshot` (or a scenario) hangs** - it needs
  `Page.bringToFront` on that target first; `cdp.mjs`'s `shot` command and
  `record.mjs`'s screencast start already do this. If you are issuing raw
  CDP commands by hand, add it yourself.
- **The Settings window "isn't there" / `s.openSettingsTab` times out** -
  make sure you called it from the main window (see "Separate windows"
  above); it identifies the new window by diffing the CDP target list taken
  right before opening Settings, so calling it while already in some other
  non-main window can miss it.
- **A GIF is oddly large** - fewer captions/shorter waits mean fewer kept
  frames; lowering `--fps` or `--width` also helps. `frames_to_gif.py` warns
  on stderr past 4 MiB but always writes the file.
- **Rate limits** - not applicable; everything here runs on your own
  machine against your own local Obsidian process.
