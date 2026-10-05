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
| `bench/generate-board.mjs` | Writes a large synthetic board for timing drags (see "Benchmarking a drag"). |
| `bench/measure-drag.mjs` | Times real drags on such a board, with the plugin on and off. |

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
(default 1280x800), `--fresh` (wipe and recreate the vault and its profile),
`--no-welcome-board` (leave the first-run question alone).

What it does, in order: finds Obsidian's executable and its config directory
for this OS (see "Where Obsidian lives" below); copies the already-downloaded
`obsidian-<version>.asar` into an isolated profile directory so this harness
never has to fetch an app package itself; copies the built plugin
(`main.js`, `manifest.json`, `styles.css`) into a fresh, isolated vault and
lists it in `community-plugins.json`; writes `"language": "<lang>"` into the
profile's `obsidian.json`; launches Obsidian with
`--user-data-dir=<profile> --remote-debugging-port=<port> --lang=<lang>`;
waits for its CDP page target and for the workspace to be ready; sets the
interface language (below); turns community plugins on
(`app.plugins.setEnable(true)` - a fresh vault starts in restricted mode),
enables `miro-canvas` (`app.plugins.enablePluginAndSave("miro-canvas")`) and
closes Obsidian's own "Do you trust the author of this vault?" dialog, which
that switch has already answered; resizes the window; and opens the welcome
board (below), so every recording starts from the same board. It prints how
the welcome board was opened, the port, the vault path, the profile path and
the launched process's pid.

**The interface language.** Obsidian reads `localStorage.language` (origin
`app://obsidian.md`) once, as its window loads, and falls back to
`navigator.language` - the operating system's language - when it is unset,
as it is in a brand-new profile. So `launch.py` sets the language three ways:
`--lang=<lang>` on the command line (Chromium's locale, which is what
`navigator.language` reports, so the very first load is already right), the
profile's `obsidian.json` (Obsidian's main process reads it for its own
menus), and `localStorage.setItem('language', ...)` over CDP (so a reused
profile, the plugin's `getLanguage()` and a scenario's `s.lang` all agree).
It then compares the language the window actually shows (`i18next.language`)
with `--lang` and reloads the window only when they differ - which happens
when a reused profile last ran in the other language. The language is set
before the plugin is enabled, so on a fresh vault the plugin starts once,
already in that language (the plugin follows Obsidian's language), and no
reload ever tears down its first-run question.

**The welcome board.** On a fresh vault the plugin asks its first-run
question. `launch.py` waits for that modal by its class
(`.miro-canvas-import-question-modal`, never by its translated text), presses
its call-to-action button (`.miro-canvas-import-question__buttons
button.mod-cta`), and presses again if a press did not take, until a Canvas
view is active. If the question never appears (up to 20 seconds), or was
already answered - a reused profile - it opens the board through the plugin
itself: a `miro-canvas:open-welcome-board` command if the plugin registers
one, otherwise the plugin's own `openWelcomeBoard()`, which is what the
question's button calls. The printed `welcome board:` line says which route
was taken: `opened-via-first-run-modal`, `opened-via-command`,
`opened-via-plugin`, or `welcome-board-not-opened`.

**Determinism**: without `--fresh`, a vault is reused as-is (only the
plugin's three built files and the two config files that enable it are
refreshed) - useful for iterating on a scenario, but the vault's *content*
(the welcome board, any files a previous scenario left, the plugin's own
saved settings in `.obsidian/plugins/miro-canvas/data.json`) is whatever an
earlier run left behind. **Pass `--fresh` before recording anything you
intend to keep**, so the state is exactly what `launch.py` itself produces.

`node tools/obsidian_cdp/check-panel-toggle.mjs 9336` checks repeated folding
at all four corners in both orientations, followed by a held drag and more
folds. It uses real input in the isolated desktop window and restores its
settings. `scenarios/panel-folding.mjs` records touch input on Android.
`node tools/obsidian_cdp/check-panel-css.mjs --serial <device> --port 9340`
checks folded spacing and More-menu stacking using real Android taps in
`MiroCanvasTest`, in both panel orientations, and restores panel preferences.
It also checks that reopening a wide phone bar does not move its fold button.
`scenarios/welcome-board.mjs` refuses an older guide missing section 12 or
the resolved comment. Use a fresh vault for the current template.

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

## Android (`android.mjs`)

Obsidian on an Android phone or tablet connected over USB debugging: `adb`
forwards its WebView's DevTools socket to a local port, and `cdp.mjs` works
against it as against the desktop app (`CDP_PORT=9340 CDP_TITLE=Obsidian`).
The header of `android.mjs` lists every command: `devices`, `forward` (run it
again after Obsidian restarts), `status`, `deploy` (writes only into the
vault named on the command line), `pointer-log start|dump|stop` (what the
page sees of each finger, stylus and palm, clicks included), `shot` (the
device's own screen), and real input in the page's CSS pixels: `tap`,
`swipe` and `press` (a long press) through the touch screen, or a stylus
with `--stylus`, and `pinch`, two fingers over CDP, which `adb input` cannot
give. `adb input` also cannot hover a stylus or press its side button; that
needs the pen itself. Wrap each call in a timeout: a device that locks
leaves `adb` waiting.

## Recording a scenario

For a physical Android device, create and open a separate `MiroCanvasTest`
vault, deploy the build with `android.mjs deploy`, and forward its WebView.
The recorder refuses another vault when `--android-serial` is supplied.
Use the device serial reported by `android.mjs devices`:

```powershell
node tools/obsidian_cdp/record.mjs --scenario tools/obsidian_cdp/scenarios/mobile-move.mjs --out docs/media/ru/phone-move.gif --port 9341 --android-serial <serial> --width 384 --fps 10
```

`s.touchTap` and `s.touchDrag` inject touchscreen input through Android's
`adb input`; they are not mouse events. `s.touchPinch` sends two touch points
through CDP. These automate gestures on the physical device, without proving
human pen pressure or palm rejection. A circle follows received touch events;
it disappears on release. The mobile caption has a nearly constant opacity
animation to keep WebView screenshots responding on the tested tablet.
Every CDP recording call has a 15-second timeout; Android input also times out.
`ADB` can name an existing adb executable; on this Windows machine the default
is the copy bundled with VirtualTablet Server.

The phone recordings use width 384; the tablet recordings use width 600.
Both preserve the physical viewport's portrait aspect ratio. Only generated
demo files in the separate test vault are modified by the mobile scenarios.

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
roughly `--fps`, clamped between 20ms and 10000ms, with the last frame held
for at least 900ms so the final state is readable), and saves a
looping (`loop=0`), optimized GIF. One palette sampled across the recording
keeps colours stable; unchanged pixels are reused instead of clearing each
frame. A final screenshot preserves a reading pause even on a still board.
It prints the frame count and file size,
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

The published series and its remaining coverage are listed in
[the guide review](../../docs/visual-guide.md). `_guide.mjs` prepares native
demo boards and resets panel placement between scenarios. It moves the cursor
away from the minimap when a result is held, to avoid a hover hint.
`export-pages.mjs` exercises the actual cross-platform PDF/PPTX exporters
and verifies attachments saved through Obsidian’s vault API, then opens the
finished PDF in the real viewer. Its GIF shortens capture pauses with
`maxHoldMs = 450`; no export or input is simulated. The recording overlay hides while the
plugin captures a page, so captions and the cursor never enter exported files.

After recording both languages, run `python tools/obsidian_cdp/audit_guide.py`
to check their README references, dimensions, durations and file sizes, and
write start/middle/end contact sheets for manual review into `.out/guide-review`.
Test the recording helpers with `node --test tools/obsidian_cdp/tests/cdp-key-events.test.mjs`
and `python -m pytest -q tools/obsidian_cdp/tests`.

## Writing a scenario

A scenario is a `.mjs` file whose default export is `async function (s) { ... }`.
`s` is:

- `s.lang` - `"en"` or `"ru"`, read from the running Obsidian
  (`localStorage.getItem('language')`, which `launch.py` always sets;
  default `"en"`). Use it for anything
  a caption-only helper does not already cover.
- `s.caption(text)` - shows a banner at the top of the *recorded* window.
  `text` is a plain string, or `{ en: "...", ru: "..." }` to pick by
  `s.lang` - **prefer the object form** so one scenario file produces both
  languages' GIFs unchanged. Call it again with new text to change it, or
  with `""` to hide it. Removed automatically at the end of the recording,
  along with the fake cursor - a scenario never has to clean these up itself.
- `s.click(target)`, `s.move(target)` - `target` is `{ x, y }`,
  `{ selector: "css selector" }`, or the object `s.find` returns.
- `s.click(target, { count: 2 })` - a double click.
- `s.move(target, { duration: 700 })` - approach the target smoothly over
  700 ms. Without a duration, movement stays immediate for older scenarios.
- `s.drag(from, to, { steps })` - `from`/`to` are the same kind of target;
  `steps` (default 12) is how many intermediate `mousemove` points to send.
- `s.drag(from, to, { duration: 1000 })` - a smooth drag lasting about a
  second, with a gentle start and stop, independent of the number of steps.
- `s.type(text)` - `Input.insertText` into whatever has focus (one native
  insert, not a key per character).
- `s.type(text, { interval: 95 })` - insert characters with a 95 ms pause
  between them, so a viewer can follow the text being written.
- `s.key(name)` - one key press. Named keys: `Escape`, `Enter`, `Tab`,
  `Backspace`, `Delete`, `Space`, `ArrowLeft/Up/Right/Down` (see
  `KEY_TABLE` in `cdp.mjs`); a single letter or digit (`"N"`, `"5"`) also
  works, for the board's own tool hotkeys.
- `s.key("A", { modifiers: 2 })` - Ctrl+A. CDP modifier bits are Alt=1,
  Ctrl=2, Meta=4, Shift=8; modified shortcuts do not insert a character.
- `s.wait(ms)`.
- `s.eval(code)` - runs `code`'s statements in the recorded window (wrapped
  in `(async () => { ... })()`, so `return` and top-level `await` both work),
  and returns its value. Use this for setup a scenario needs but should not
  itself be part of the recording (see the sticky-note example: it creates a
  private, empty board first, since a fixed click point on the busy welcome
  board would depend on that board's own zoom/pan).
- Export `prepare(s)` alongside the default scenario to create files, open
  the board and settle its view before recording. Optional `cleanup(s)` runs
  afterward, including when the scenario fails. See `sticky-with-note.mjs`.
  The first frame is captured after preparation; late screencast frames from
  a previous board are ignored. Captions use 20 px text before resizing.
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

## Benchmarking a drag

Two small scripts time what a drag costs on a large board, in a real
Obsidian with real input. Launch an instance on a port of your own first
(below, 9338):

```
python tools/obsidian_cdp/launch.py --port 9338 --fresh --no-welcome-board
node tools/obsidian_cdp/bench/generate-board.mjs --cards 2000
node tools/obsidian_cdp/bench/generate-board.mjs --cards 5000
node tools/obsidian_cdp/bench/measure-drag.mjs --port 9338 \
  --board tools/obsidian_cdp/.out/bench/board-2000.canvas \
  --board tools/obsidian_cdp/.out/bench/board-5000.canvas \
  --select 1,50,500,all --plugin on,off --label after
python tools/obsidian_cdp/stop.py --port 9338
```

`launch.py` copies the `main.js` of the checkout it runs from. To time
another build in the same instance and vault, copy that build's `main.js`
over `<vault>/.obsidian/plugins/miro-canvas/main.js` and run
`measure-drag.mjs` again: it turns the plugin off once as it starts, so its
first run with the plugin on loads the `main.js` then in the vault.

`generate-board.mjs` writes `tools/obsidian_cdp/.out/bench/board-<N>.canvas`
(ignored by git): N cards on a grid - every tenth a sticky note, one in fifty
of those turned by 8 degrees, every tenth a shape - about N/2 native edges
between neighbours, about N/4 of the plugin's own connectors from a card to
the card below, and one frame per 400 cards, listed after the cards. The same
N always gives the same board, and its `miroCanvas` record is schema/v1-valid.

`measure-drag.mjs`, for every board, selection size and plugin state: turns
the plugin on or off (`app.plugins.enablePlugin` / `disablePlugin`), copies
the board into the running vault's `bench/` folder under a new name and opens
it, selects the first K cards with native Canvas's own `canvas.select` (`all`
is every card, frames left out), fits them in view with `canvas.zoomToBbox`
(or, with `--zoom <z>`, shows the first selected card at that zoom), presses
on the first selected card it can reach, sends 60 real
`Input.dispatchMouseEvent` moves about 15 ms apart, lets go, and logs every
animation frame meanwhile. With the plugin on and several cards selected it
presses where the plugin's own selection frame covers the card, as a person
pressing on the selection does, so every run of a build takes the same path.

It prints one JSON line per run and a table: how long each move took on
average (the page has to take one move before the next is sent, so a slow
drag shows here even when the idle frames between moves keep the median frame
short), the median and 95th percentile frame time during the drag and in the
1.5 s after it, and how far the pressed card moved - 0,0 means the drag did
not take, and a notice shown then is recorded with the run.

Options: `--json <file>` appends the JSON lines to a file, `--label` names the
build, `--shots <dir>` saves screenshots before, during and after each drag
for checking the toolbar by eye, `--profile <dir>` records a CPU profile of
each drag (open the `.cpuprofile` in DevTools' Performance panel), and
`--moves`, `--interval` and `--settle` change the drag.

It brings the window to the front before each run and turns off Electron's
background throttling: Chromium stops the animation frames of a window that
other windows cover, and nothing would be timed. A drag of every card on a
5,000-card board takes minutes on a slow build; the whole matrix above takes
about half an hour.

## Troubleshooting

- **"Missing built plugin file(s)"** - run `npm run build` first.
  `launch.py` never builds the plugin itself.
- **Obsidian comes up in the operating system's language, not `--lang`** -
  check the running window with
  `CDP_PORT=9336 node tools/obsidian_cdp/cdp.mjs eval "return [localStorage.getItem('language'), navigator.language, window.i18next.language];"`
  (`i18next.language` is unset for English, Obsidian's built-in default).
  `launch.py` fails with "Obsidian still shows ..." if a reload did not
  bring the window to `--lang`; see "The interface language" above.
- **`welcome board: welcome-board-not-opened`** - neither the first-run
  question nor the plugin's own route opened a Canvas view within 20
  seconds; check that `miro-canvas` actually loaded
  (`return !!app.plugins.plugins['miro-canvas'];`).
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

### Export page mouse regression

With an isolated Canvas open on CDP_PORT (default 9336), run
`node tools/obsidian_cdp/check_export_page_gestures.mjs`. It refuses non-isolated
vaults, drives real mouse input on page labels and corners, checks previews
and committed geometry, unchanged native content, A4 proportions and reopening.

### Export page touch regression

Open a disposable Canvas in MiroCanvasTest on a connected Android device,
forward its WebView with android.mjs, deploy the build, then run:

```sh
node tools/obsidian_cdp/check_export_page_touch.mjs --serial <adb-serial> --port 9340 --out tools/obsidian_cdp/.out/touch-report.json
```

The runner refuses other vaults. It changes export-page metadata on the active
board, so use a disposable test board. Swipes go through real Android input;
CDP checks the preview while each swipe is held. It verifies moving, free
resizing, A4 proportions, unchanged camera and native content, and reopening
saved page geometry. The portrait fixture keeps controls away from the open
export panel and toolbar; obscured controls fail explicitly.
