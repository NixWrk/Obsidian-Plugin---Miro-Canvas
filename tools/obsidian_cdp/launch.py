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


def launch_obsidian(executable: Path, profile_dir: Path, port: int) -> subprocess.Popen:
    args = [str(executable), f"--user-data-dir={profile_dir}", f"--remote-debugging-port={port}"]
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


def cdp_eval(port: int, expression: str, *, timeout: float = 30.0, retry_for: float = 0.0) -> Any:
    """Runs `expression` in the main window via cdp.mjs, retrying while the app is mid-reload."""

    node = node_executable()
    env = {**os.environ, "CDP_PORT": str(port)}
    deadline = time.monotonic() + retry_for
    last_error: str | None = None
    while True:
        result = subprocess.run(
            [node, str(CDP_MJS), "eval", expression],
            env=env, capture_output=True, text=True, timeout=timeout,
        )
        if result.returncode == 0:
            try:
                return json.loads(result.stdout)
            except json.JSONDecodeError:
                return result.stdout.strip()
        last_error = result.stderr.strip() or result.stdout.strip()
        if time.monotonic() >= deadline:
            raise LaunchError(f"cdp.mjs eval failed: {last_error}\nexpression: {expression}")
        time.sleep(0.5)


_ENABLE_PLUGIN_JS = """
  if (app.plugins.setEnable) await app.plugins.setEnable(true);
  await app.plugins.enablePluginAndSave("miro-canvas");
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
        if loaded:
            return
        if time.monotonic() >= deadline:
            raise LaunchError("miro-canvas never finished loading (app.plugins.plugins['miro-canvas'] stayed falsy)")
        time.sleep(0.5)


def wait_for_workspace_ready(port: int, *, timeout: float = 20.0) -> None:
    """`app` exists as soon as the page target does, but the vault/workspace can still be a beat from ready - touching plugins before `layoutReady` is what makes the enable step flaky."""

    deadline = time.monotonic() + timeout
    while True:
        ready = cdp_eval(port, "return !!(app && app.workspace && app.workspace.layoutReady);", retry_for=5)
        if ready:
            return
        if time.monotonic() >= deadline:
            raise LaunchError("Obsidian's workspace never became ready (app.workspace.layoutReady stayed falsy)")
        time.sleep(0.3)


def apply_runtime_settings(port: int, lang: str) -> None:
    """Turns on community plugins, enables miro-canvas, and sets Obsidian's interface language."""

    wait_for_workspace_ready(port)
    ensure_plugin_loaded(port)

    current_language = cdp_eval(port, "return localStorage.getItem('language') || 'en';", retry_for=10) or "en"
    if current_language != lang:
        cdp_eval(port, f"""
          localStorage.setItem('language', {json.dumps(lang)});
          app.commands.executeCommandById('app:reload');
          return "reloading";
        """, retry_for=10)
        # The reload tears down and rebuilds the renderer's JS context; give it
        # a moment before the next eval, which itself retries while it settles.
        time.sleep(2)
        cdp_eval(port, "return !!(app && app.plugins && app.workspace);", retry_for=30)
        # A reload restarts the plugin from a clean `onload`, so re-assert both
        # switches - a fresh vault would already have them, but a reused one
        # (no --fresh) might have started this run with the plugin disabled.
        ensure_plugin_loaded(port)


def resize_window(port: int, width: int, height: int) -> None:
    cdp_eval(port, f"""
      require('@electron/remote').getCurrentWindow().setBounds({{ x: 0, y: 0, width: {width}, height: {height} }});
      return "resized";
    """, retry_for=10)


# The first-run modal's own literal English/Russian strings (src/locales/en.ts
# and ru.ts, `importGuide.settingsHeading`) - used only to find the settings
# tab's fallback button below if the modal was already answered by a reused,
# non---fresh profile.  Keep these two lines in sync if that heading changes.
SETTINGS_HEADING_EN = "Getting started"
SETTINGS_HEADING_RU = "Начало работы"


def open_welcome_board(port: int) -> str:
    """Answers the first-run modal (which itself opens the welcome board), or falls back to the settings tab's own button for a reused profile that already answered it."""

    return cdp_eval(port, f"""
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      let modal = document.querySelector('.miro-canvas-import-question-modal');
      for (let i = 0; i < 25 && !modal; i += 1) {{
        await sleep(300);
        modal = document.querySelector('.miro-canvas-import-question-modal');
      }}
      if (modal) {{
        const cta = modal.querySelector('.miro-canvas-import-question__buttons .mod-cta');
        if (cta) {{ cta.click(); await sleep(600); return "opened-via-first-run-modal"; }}
      }}
      const setting = app.setting;
      setting.open();
      setting.openTabById('{PLUGIN_ID}');
      await sleep(500);
      const doc = setting.win ? setting.win.document : document;
      const headings = Array.from(doc.querySelectorAll('.setting-item-name'));
      const heading = headings.find((el) => el.textContent === {json.dumps(SETTINGS_HEADING_EN)} || el.textContent === {json.dumps(SETTINGS_HEADING_RU)});
      const row = heading ? heading.closest('.setting-item').nextElementSibling : null;
      const button = row ? row.querySelector('button.mod-cta') : null;
      if (button) {{ button.click(); await sleep(600); setting.close(); return "opened-via-settings-tab"; }}
      setting.close();
      return "welcome-board-not-opened";
    """, retry_for=5)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--work", type=Path, default=TOOL_DIR / ".out" / "obsidian-cdp", help="Isolated profile+vault root (default: %(default)s).")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="CDP debugging port (default: %(default)s). Use 9336 for this tool's own instance; never 9333-9335 or the user's own Obsidian.")
    parser.add_argument("--lang", choices=["en", "ru"], default="en", help="Obsidian interface language (default: %(default)s).")
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

    process = launch_obsidian(executable, profile_dir, args.port)
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
