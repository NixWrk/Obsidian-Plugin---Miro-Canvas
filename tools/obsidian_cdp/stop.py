"""Close the isolated Obsidian instance on one CDP port, and only that one.

Never touches ports 9333-9335 or the user's own Obsidian: it acts strictly on
the port it is given, over CDP itself (``Browser.close``, falling back to
``Page.close`` on any remaining page targets) - never by scanning or killing
processes system-wide.

Usage:
  python tools/obsidian_cdp/stop.py --port 9336
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

DEFAULT_PORT = 9333
CDP_MJS = Path(__file__).resolve().parent / "cdp.mjs"


def list_targets(port: int) -> list[dict]:
    with urllib.request.urlopen(f"http://127.0.0.1:{port}/json", timeout=3) as response:
        return json.loads(response.read())


def close_browser(port: int) -> bool:
    """Sends Browser.close over that port's CDP socket - Node already has a WebSocket, so this goes through cdp.mjs rather than adding a Python WebSocket dependency."""

    node = shutil.which("node")
    if not node:
        return False
    result = subprocess.run(
        [node, str(CDP_MJS), "raw", "Browser.close", "{}"],
        env={**os.environ, "CDP_PORT": str(port)},
        capture_output=True, text=True, timeout=10,
    )
    return result.returncode == 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="CDP debugging port of the instance to close (default: %(default)s).")
    args = parser.parse_args(argv)

    try:
        targets = list_targets(args.port)
    except (urllib.error.URLError, OSError) as error:
        print(f"Nothing listening on port {args.port} ({error}); nothing to stop.")
        return 0

    page_titles = [t.get("title", "") for t in targets if t.get("type") == "page"]
    if close_browser(args.port):
        print(f"Closed the Obsidian instance on port {args.port} (windows: {', '.join(page_titles) or 'none'}).")
        return 0

    print(f"FAIL: could not send Browser.close to port {args.port}.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
