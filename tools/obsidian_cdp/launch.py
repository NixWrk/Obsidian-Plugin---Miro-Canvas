"""Launch an isolated, disposable Obsidian instance for GIF recording.

This never touches the user's own Obsidian profile or vaults.  Everything it
creates lives under ``--work`` (default ``.out/obsidian-cdp`` next to this
tool); the only things it reads from the user's real Obsidian installation
are the executable path and a copy of the already-downloaded app package
(the ``.asar``), so this harness's own vault never needs a network fetch to
get an app shell.

Obsidian's install locations, by platform:
  Windows: exe at   %LOCALAPPDATA%\\Obsidian\\Obsidian.exe
           config at %APPDATA%\\obsidian  (holds obsidian-<version>.asar)
  macOS:   exe at   /Applications/Obsidian.app/Contents/MacOS/Obsidian
           config at ~/Library/Application Support/obsidian
  Linux:   exe: `obsidian` on PATH (AppImage integrations, most packages),
           else /opt/Obsidian/obsidian or /usr/bin/obsidian
           config at ~/.config/obsidian

Usage:
  python tools/obsidian_cdp/launch.py --port 9336 --lang en
  python tools/obsidian_cdp/launch.py --port 9336 --lang ru --fresh
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import secrets
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

TOOL_DIR = Path(__file__).resolve().parent
REPO_ROOT = TOOL_DIR.parents[1]
CDP_MJS = TOOL_DIR / "cdp.mjs"
PLUGIN_ID = "miro-canvas"
RELEASE_ASSETS = ("manifest.json", "main.js", "styles.css")
DEFAULT_PORT = 9333
DEFAULT_WIDTH = 1280
DEFAULT_HEIGHT = 800


class LaunchError(RuntimeError):
    """A clear, user-facing failure - a missing install, a missing build, a timeout."""


def find_obsidian_executable(explicit: str | None = None) -> Path:
    if explicit:
        path = Path(explicit).expanduser()
        if not path.is_file():
            raise LaunchError(f"--obsidian-exe does not exist: {path}")
        return path

    system = platform.system()
    if system == "Windows":
        candidate = Path(os.environ.get("LOCALAPPDATA", "")) / "Obsidian" / "Obsidian.exe"
        if candidate.is_file():
            return candidate
        raise LaunchError(
            f"Obsidian.exe not found at {candidate}. Install Obsidian, or pass --obsidian-exe."
        )
    if system == "Darwin":
        candidate = Path("/Applications/Obsidian.app/Contents/MacOS/Obsidian")
        if candidate.is_file():
            return candidate
        raise LaunchError(
            f"Obsidian not found at {candidate}. Install Obsidian, or pass --obsidian-exe."
        )
    # Linux: most installs (AppImage integration, .deb, snap, flatpak's exported bin) put an
    # `obsidian` launcher on PATH; fall back to the common fixed install locations.
    on_path = shutil.which("obsidian")
    if on_path:
        return Path(on_path)
    for candidate in (Path("/opt/Obsidian/obsidian"), Path("/usr/bin/obsidian"), Path("/snap/bin/obsidian")):
        if candidate.is_file():
            return candidate
    raise LaunchError(
        "Could not find an `obsidian` executable on PATH or in /opt or /usr/bin. "
        "Install Obsidian, or pass --obsidian-exe."
    )


def find_obsidian_config_dir(explicit: str | None = None) -> Path:
    if explicit:
        path = Path(explicit).expanduser()
        if not path.is_dir():
            raise LaunchError(f"--config-dir does not exist: {path}")
        return path

    system = platform.system()
    if system == "Windows":
        candidate = Path(os.environ.get("APPDATA", "")) / "obsidian"
    elif system == "Darwin":
        candidate = Path.home() / "Library" / "Application Support" / "obsidian"
    else:
        candidate = Path.home() / ".config" / "obsidian"
    if not candidate.is_dir():
        raise LaunchError(
            f"Obsidian config directory not found at {candidate}. "
            "Run Obsidian at least once, or pass --config-dir."
        )
    return candidate


def find_pinned_asar(config_dir: Path) -> Path:
    """The already-downloaded app package, newest first - so our isolated profile never fetches one."""

    candidates = sorted(config_dir.glob("obsidian-*.asar"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not candidates:
        raise LaunchError(
            f"No obsidian-<version>.asar found in {config_dir}. Run the real Obsidian once to download it."
        )
    return candidates[0]


def require_built_plugin(repo_root: Path) -> None:
    missing = [name for name in RELEASE_ASSETS if not (repo_root / name).is_file()]
    if missing:
        raise LaunchError(
            f"Missing built plugin file(s) in {repo_root}: {', '.join(missing)}. Run `npm run build`."
        )


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(data, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def seed_vault(vault_dir: Path, repo_root: Path) -> None:
    """A brand-new vault, with the plugin's own files already in place and listed.

    Restricted mode (the community-plugin master switch) is still off at this
    point - that and actually loading the plugin's code happen at runtime
    (`_apply_runtime_settings`), matching how a person would do it by hand.
    """

    vault_dir.mkdir(parents=True, exist_ok=True)
    obsidian_dir = vault_dir / ".obsidian"
    write_json(obsidian_dir / "community-plugins.json", [PLUGIN_ID])
    write_json(obsidian_dir / "app.json", {})

    plugin_dir = obsidian_dir / "plugins" / PLUGIN_ID
    plugin_dir.mkdir(parents=True, exist_ok=True)
    for asset in RELEASE_ASSETS:
        shutil.copy2(repo_root / asset, plugin_dir / asset)


def seed_profile(profile_dir: Path, vault_dir: Path, asar_source: Path) -> None:
    """The Electron user-data dir Obsidian launches into: its own copy of the app package, and one vault pre-registered so Obsidian opens straight into it (no vault picker)."""

    profile_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(asar_source, profile_dir / asar_source.name)
    vault_id = secrets.token_hex(8)
    write_json(profile_dir / "obsidian.json", {
        "vaults": {vault_id: {"path": str(vault_dir), "ts": int(time.time() * 1000), "open": True}},
    })


def with_profile_language(config: Any, lang: str) -> dict[str, Any]:
    """`obsidian.json` with its `language` set to `lang`, every other key kept.

    Obsidian's main process reads this key at startup for its own menus and
    dialogs (the window's interface reads local storage instead - see
    `apply_interface_language`).
    """

    updated = dict(config) if isinstance(config, dict) else {}
    updated["language"] = lang
    return updated


def set_profile_language(profile_dir: Path, lang: str) -> None:
    config_path = profile_dir / "obsidian.json"
    try:
        config = json.loads(config_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        config = {}
    write_json(config_path, with_profile_language(config, lang))


def obsidian_arguments(executable: Path, profile_dir: Path, port: int, lang: str) -> list[str]:
    """The command line for the isolated instance.

    `--lang` sets Chromium's locale, which is what `navigator.language`
    reports.  Obsidian falls back to that when local storage holds no
    `language`, as in a brand-new profile - so without it a fresh profile
    comes up in the operating system's language, whatever `--lang` this tool
    was given.
    """

    return [
        str(executable),
        f"--user-data-dir={profile_dir}",
        f"--remote-debugging-port={port}",
        f"--lang={lang}",
    ]


def launch_obsidian(executable: Path, profile_dir: Path, port: int, lang: str) -> subprocess.Popen:
    args = obsidian_arguments(executable, profile_dir, port, lang)
    # Obsidian is a normal GUI app; detach stdio so this script does not block on its output.
    return subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def wait_for_port(port: int, timeout: float) -> None:
    import urllib.request

    deadline = time.monotonic() + timeout
    last_error: Exception | None = None
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/json", timeout=1) as response:
                targets = json.loads(response.read())
            if any(t.get("type") == "page" and t.get("url", "").startswith("app://obsidian.md") for t in targets):
                return
        except Exception as error:  # noqa: BLE001 - genuinely "keep retrying, report the last one"
            last_error = error
        time.sleep(0.4)
    raise LaunchError(f"Obsidian's CDP page target never appeared on port {port}: {last_error}")


def node_executable() -> str:
    node = shutil.which("node")
    if not node:
        raise LaunchError("`node` was not found on PATH; this tool needs Node 22+.")
    return node


def parse_eval_output(stdout: str) -> tuple[Any, str | None]:
    """Splits what `cdp.mjs eval` printed into (value, error).

    cdp.mjs exits 0 even when the expression threw, or when the page was
    reloading under it: it prints `{"error": ...}` instead.  That object is
    truthy, so taking it as a value would make every "is it ready yet?" poll
    below answer yes while Obsidian is still starting.
    """

    text = stdout.strip()
    try:
        value = json.loads(text)
    except json.JSONDecodeError:
        return text, None
    if isinstance(value, dict) and set(value) == {"error"}:
        return None, str(value["error"])
    return value, None


def cdp_eval(port: int, expression: str, *, timeout: float = 30.0, retry_for: float = 0.0) -> Any:
    """Runs `expression` in the main window via cdp.mjs, retrying while the app is mid-reload."""

    node = node_executable()
    env = {**os.environ, "CDP_PORT": str(port)}
    deadline = time.monotonic() + retry_for
    last_error: str | None = None
    while True:
        try:
            result = subprocess.run(
                [node, str(CDP_MJS), "eval", expression],
                env=env, capture_output=True, text=True, timeout=timeout,
            )
        except subprocess.TimeoutExpired:
            result = None
        if result is None:
            last_error = f"cdp.mjs did not answer within {timeout}s"
        elif result.returncode == 0:
            value, error = parse_eval_output(result.stdout)
            if error is None:
                return value
            last_error = error
        else:
            last_error = result.stderr.strip() or result.stdout.strip()
        if time.monotonic() >= deadline:
            raise LaunchError(f"cdp.mjs eval failed: {last_error}\nexpression: {expression}")
        time.sleep(0.5)


_ENABLE_PLUGIN_JS = """
  if (app.plugins.setEnable) await app.plugins.setEnable(true);
  await app.plugins.enablePluginAndSave("miro-canvas");
  // A fresh vault that lists a plugin opens Obsidian's own "Do you trust the
  // author of this vault?" dialog; the switch above has already answered it,
  // so close it rather than leave it dimming the board.  Its close control
  // only closes it (the dialog's own buttons would open Settings, or say no);
  // Obsidian 1.13 calls that control `.modal-header-button`, older versions
  // `.modal-close-button`.
  for (const dialog of document.querySelectorAll(".modal.mod-trust-folder")) {
    const close = dialog.querySelector(":scope > .modal-header-button, :scope > .modal-close-button");
    if (close) close.click();
  }
  return !!app.plugins.plugins["miro-canvas"];
"""


def ensure_plugin_loaded(port: int, *, timeout: float = 20.0) -> None:
    """Turns restricted mode off and loads miro-canvas, retrying the whole sequence.

    Right after Obsidian's page target first appears, ``app.plugins`` exists
    but the vault/plugin manager can still be a beat away from ready: calling
    ``setEnable``/``enablePluginAndSave`` too early can return normally while
    the plugin never actually loads.  So this checks the outcome, not just
    whether the calls threw.
    """

    deadline = time.monotonic() + timeout
    while True:
        loaded = cdp_eval(port, _ENABLE_PLUGIN_JS, retry_for=5)
        if loaded is True:
            return
        if time.monotonic() >= deadline:
            raise LaunchError("miro-canvas never finished loading (app.plugins.plugins['miro-canvas'] stayed falsy)")
        time.sleep(0.5)


# Set on the window just before this tool reloads it, so a poll that still
# reaches the old page (the reload is not instant) is not taken for the new one.
_STALE_PAGE_FLAG = "__miroCanvasCdpStalePage"

_WORKSPACE_READY_JS = f"""
  if (window.{_STALE_PAGE_FLAG}) return false;
  if (typeof app === "undefined" || !app.workspace) return false;
  return !!app.workspace.layoutReady;
"""


def wait_for_workspace_ready(port: int, *, timeout: float = 30.0) -> None:
    """`app` exists as soon as the page target does, but the vault/workspace can still be a beat from ready - touching plugins before `layoutReady` is what makes the enable step flaky."""

    deadline = time.monotonic() + timeout
    while True:
        ready = cdp_eval(port, _WORKSPACE_READY_JS, retry_for=10)
        if ready is True:
            return
        if time.monotonic() >= deadline:
            raise LaunchError("Obsidian's workspace never became ready (app.workspace.layoutReady stayed falsy)")
        time.sleep(0.3)


def interface_language_js(lang: str) -> str:
    """Stores `lang` as Obsidian's interface language and reports the one the window actually shows.

    Obsidian reads local storage's `language` once, as the window loads
    (falling back to `navigator.language`), and loads that translation into
    `i18next`; English is its built-in default, so `i18next.language` may be
    unset then.  Storing the choice as well - not only relying on `--lang` -
    is what makes a reused profile, and the plugin's own `getLanguage()`, and
    `record.mjs`'s `s.lang`, all agree with it.
    """

    return f"""
      localStorage.setItem("language", {json.dumps(lang)});
      const shown = window.i18next && window.i18next.language;
      return shown || "en";
    """


_RELOAD_JS = f"""
  window.{_STALE_PAGE_FLAG} = true;
  // Reloaded a beat later, so this evaluation returns before its page goes.
  setTimeout(() => app.commands.executeCommandById("app:reload"), 100);
  return "reloading";
"""


def language_matches(shown: Any, lang: str) -> bool:
    """Whether the language the window shows (`i18next.language`, e.g. "ru" or "en-US") is `lang`."""

    if not isinstance(shown, str) or not shown:
        return False
    return shown.lower().split("-")[0] == lang


def apply_interface_language(port: int, lang: str, *, attempts: int = 2) -> None:
    """Makes the window show `lang`, reloading it when a stored choice from an earlier run says otherwise.

    A fresh profile already starts in `lang` (`--lang` and `obsidian.json`),
    so this reloads only a reused profile whose stored language differs.
    """

    shown = cdp_eval(port, interface_language_js(lang), retry_for=10)
    for _ in range(attempts):
        if language_matches(shown, lang):
            return
        cdp_eval(port, _RELOAD_JS, retry_for=10)
        wait_for_workspace_ready(port)
        shown = cdp_eval(port, interface_language_js(lang), retry_for=10)
    if not language_matches(shown, lang):
        raise LaunchError(f"Obsidian still shows {shown!r} after reloading for --lang {lang}")


def apply_runtime_settings(port: int, lang: str) -> None:
    """Sets Obsidian's interface language, then turns on community plugins and enables miro-canvas.

    The language comes first: on a fresh vault the plugin is not loaded yet
    (restricted mode is on), so it starts once, already in `lang`, and its
    first-run question is never torn down by a reload for the language.
    """

    wait_for_workspace_ready(port)
    apply_interface_language(port, lang)
    # A reload restarts the plugin from a clean `onload`, so the two switches
    # are asserted after it - a reused vault may have started with the
    # plugin disabled.
    ensure_plugin_loaded(port)


def resize_window(port: int, width: int, height: int) -> None:
    cdp_eval(port, f"""
      require('@electron/remote').getCurrentWindow().setBounds({{ x: 0, y: 0, width: {width}, height: {height} }});
      return "resized";
    """, retry_for=10)


# The plugin's first-run question (src/main.ts, `openImportQuestion`): a modal
# tagged with this class, whose one call-to-action button opens the welcome
# board.  Found by class, never by its (translated) text.
WELCOME_MODAL_SELECTOR = ".miro-canvas-import-question-modal"
WELCOME_BUTTON_SELECTOR = f"{WELCOME_MODAL_SELECTOR} .miro-canvas-import-question__buttons button.mod-cta"

# A command that opens the welcome board, used first by the fallback below if
# the plugin ever registers one; miro-canvas 0.1.1 has none, so the fallback
# calls the same plugin method the first-run question's button calls.
WELCOME_BOARD_COMMAND_ID = f"{PLUGIN_ID}:open-welcome-board"

_WELCOME_STATE_JS = f"""
  const plugin = app.plugins.plugins[{json.dumps(PLUGIN_ID)}];
  const settings = plugin ? plugin.canvasSettings : null;
  const leaf = app.workspace.activeLeaf;
  const viewType = leaf && leaf.view && leaf.view.getViewType ? leaf.view.getViewType() : null;
  return {{
    pluginLoaded: !!plugin,
    modalOpen: !!document.querySelector({json.dumps(WELCOME_MODAL_SELECTOR)}),
    questionAnswered: !!(settings && settings.importQuestionAnswered),
    boardOpen: viewType === "canvas",
  }};
"""

_CLICK_WELCOME_BUTTON_JS = f"""
  const button = document.querySelector({json.dumps(WELCOME_BUTTON_SELECTOR)});
  if (!button) return false;
  button.click();
  return true;
"""

_OPEN_WELCOME_BOARD_FALLBACK_JS = f"""
  if (app.commands.commands[{json.dumps(WELCOME_BOARD_COMMAND_ID)}]) {{
    app.commands.executeCommandById({json.dumps(WELCOME_BOARD_COMMAND_ID)});
    return "command";
  }}
  const plugin = app.plugins.plugins[{json.dumps(PLUGIN_ID)}];
  if (plugin && typeof plugin.openWelcomeBoard === "function") {{
    plugin.openWelcomeBoard();
    return "plugin";
  }}
  return "none";
"""


def welcome_state(port: int) -> dict[str, bool]:
    state = cdp_eval(port, _WELCOME_STATE_JS, retry_for=10)
    if not isinstance(state, dict):
        raise LaunchError(f"unexpected answer while looking for the first-run question: {state!r}")
    return state


def wait_for_welcome_question(port: int, timeout: float) -> dict[str, bool]:
    """Waits for the first-run question to appear, or for a sign it never will (already answered)."""

    deadline = time.monotonic() + timeout
    while True:
        state = welcome_state(port)
        if state["modalOpen"] or state["questionAnswered"]:
            return state
        if time.monotonic() >= deadline:
            return state
        time.sleep(0.3)


def answer_welcome_question(port: int, timeout: float) -> bool:
    """Presses the question's welcome-board button - again, if a press did not take - until the board is open."""

    deadline = time.monotonic() + timeout
    while True:
        state = welcome_state(port)
        if state["boardOpen"] and not state["modalOpen"]:
            return True
        if state["modalOpen"]:
            cdp_eval(port, _CLICK_WELCOME_BUTTON_JS, retry_for=5)
        if time.monotonic() >= deadline:
            return False
        time.sleep(0.5)


def wait_for_board(port: int, timeout: float) -> bool:
    deadline = time.monotonic() + timeout
    while True:
        if welcome_state(port)["boardOpen"]:
            return True
        if time.monotonic() >= deadline:
            return False
        time.sleep(0.5)


def open_welcome_board(port: int, *, question_timeout: float = 20.0, board_timeout: float = 20.0) -> str:
    """Answers the first-run question (which itself opens the welcome board); failing that, opens the board through the plugin.

    The fallback covers a reused profile that answered the question on an
    earlier run, and a question that never showed within `question_timeout`.
    """

    state = wait_for_welcome_question(port, question_timeout)
    if state["modalOpen"] and answer_welcome_question(port, board_timeout):
        return "opened-via-first-run-modal"

    route = cdp_eval(port, _OPEN_WELCOME_BOARD_FALLBACK_JS, retry_for=5)
    if route in ("command", "plugin") and wait_for_board(port, board_timeout):
        return f"opened-via-{route}"
    return "welcome-board-not-opened"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--work", type=Path, default=TOOL_DIR / ".out" / "obsidian-cdp", help="Isolated profile+vault root (default: %(default)s).")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="CDP debugging port (default: %(default)s). Use 9336 for this tool's own instance; never 9333-9335 or the user's own Obsidian.")
    parser.add_argument("--lang", choices=["en", "ru"], default="en", help="Obsidian's interface language, and so the plugin's (default: %(default)s).")
    parser.add_argument("--width", type=int, default=DEFAULT_WIDTH)
    parser.add_argument("--height", type=int, default=DEFAULT_HEIGHT)
    parser.add_argument("--fresh", action="store_true", help="Recreate the vault (and its profile) from scratch.")
    parser.add_argument("--obsidian-exe", help="Override the auto-detected Obsidian executable.")
    parser.add_argument("--config-dir", help="Override the auto-detected Obsidian config directory (where obsidian-<version>.asar lives).")
    parser.add_argument("--no-welcome-board", action="store_true", help="Skip answering the first-run modal / opening the welcome board.")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    executable = find_obsidian_executable(args.obsidian_exe)
    config_dir = find_obsidian_config_dir(args.config_dir)
    asar_source = find_pinned_asar(config_dir)
    require_built_plugin(REPO_ROOT)

    work_dir = args.work.expanduser().resolve()
    profile_dir = work_dir / "profile"
    vault_dir = work_dir / "vault"

    if args.fresh and work_dir.exists():
        shutil.rmtree(work_dir)
    # Always refreshed, --fresh or not: the plugin's three files (so a rebuilt
    # main.js is picked up) and the two small config files that put it on the
    # community-plugins list.  Never touched: the vault's own content (the
    # welcome board, sample files) and the plugin's data.json - a reused,
    # non---fresh vault keeps whatever settings a previous recording left, so
    # --fresh is what makes a recording session start from a known state.
    seed_vault(vault_dir, REPO_ROOT)
    if not profile_dir.exists():
        seed_profile(profile_dir, vault_dir, asar_source)
    # Set before the window loads, as is `--lang` on the command line: a
    # brand-new profile has no stored language, and Obsidian would otherwise
    # come up in the operating system's.
    set_profile_language(profile_dir, args.lang)

    process = launch_obsidian(executable, profile_dir, args.port, args.lang)
    try:
        wait_for_port(args.port, timeout=30)
        apply_runtime_settings(args.port, args.lang)
        resize_window(args.port, args.width, args.height)
        if not args.no_welcome_board:
            outcome = open_welcome_board(args.port)
            print(f"welcome board: {outcome}")
    except Exception:
        process.terminate()
        raise

    print(f"port={args.port}")
    print(f"vault={vault_dir}")
    print(f"profile={profile_dir}")
    print(f"pid={process.pid}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except LaunchError as error:
        print(f"FAIL: {error}", file=sys.stderr)
        raise SystemExit(1)
