#!/usr/bin/env python3
"""Collect local, aggregate diagnostics for a Miro Canvas enable-time freeze on Linux."""

import argparse
import json
import os
import platform
import re
import stat
import sys
import tempfile
import time
from collections import Counter
from pathlib import Path


MIB = 1024 * 1024
BOARD_LIMIT = 16 * MIB  # Same per-board size limit as the plugin index.


def small_json(path, limit):
    try:
        if path.is_symlink() or not path.is_file() or path.stat().st_size > limit:
            return None
        with path.open("rb") as stream:
            data = stream.read(limit + 1)
        if len(data) <= limit:
            return json.loads(data)
    except (OSError, ValueError, RecursionError):
        pass
    return None


def inventory(vault, config):
    counts = dict(files=0, bytes=0, markdown=0, canvases=0, largest_canvas_bytes=0,
                  canvases_over_16_MiB=0, canvases_counted=0, nodes_counted=0,
                  native_edges_counted=0, unreadable_entries=0)
    # Bound the work before measurement, even in a very large vault.
    budget = 64 * MIB
    attempted = 0

    def unreadable(_error):
        counts["unreadable_entries"] += 1

    for root, dirs, files in os.walk(vault, onerror=unreadable):
        folder = Path(root)
        dirs[:] = sorted(d for d in dirs if not d.startswith(".")
                         and folder / d != config and not (folder / d).is_symlink())
        for name in sorted(files):
            if name.startswith("."):
                continue
            path = folder / name
            try:
                entry = path.lstat()
            except OSError as error:
                unreadable(error)
                continue
            if not stat.S_ISREG(entry.st_mode):
                continue
            counts["files"] += 1
            counts["bytes"] += entry.st_size
            suffix = path.suffix.lower()
            if suffix == ".md":
                counts["markdown"] += 1
            if suffix != ".canvas":
                continue
            counts["canvases"] += 1
            counts["largest_canvas_bytes"] = max(counts["largest_canvas_bytes"], entry.st_size)
            if entry.st_size > BOARD_LIMIT:
                counts["canvases_over_16_MiB"] += 1
                continue
            if attempted >= 200 or entry.st_size > budget:
                continue
            attempted += 1
            budget -= entry.st_size
            board = small_json(path, entry.st_size)
            if isinstance(board, dict) and all(isinstance(board.get(k), list) for k in ("nodes", "edges")):
                counts["canvases_counted"] += 1
                counts["nodes_counted"] += len(board["nodes"])
                counts["native_edges_counted"] += len(board["edges"])
    return counts


def process_identity(command, executable):
    # Electron can rewrite /proc/cmdline as one space-separated process title.
    child = re.search(rb"(?:^|[\x00 ])--type=([\w-]+)(?=[\x00 ]|$)", command)
    if child:
        return False, {b"renderer": "renderer", b"gpu-process": "gpu"}.get(child[1], "other")
    name = os.path.basename(executable).lower()
    package = re.search(rb"/obsidian/(?:resources/)?(?:app|obsidian)\.asar(?=[\x00 ]|$)", command.lower())
    return name == b"obsidian" or (name.startswith(b"electron") and bool(package)), "other"


def processes():
    """Follow same-user Obsidian process trees, including Arch's system Electron launcher."""
    rows = {}
    roots = set()
    for directory in Path("/proc").iterdir():
        if not directory.name.isdigit():
            continue
        try:
            if directory.stat().st_uid != os.getuid():
                continue
            fields = (directory / "stat").read_bytes().rsplit(b") ", 1)[1].split()
            command = (directory / "cmdline").read_bytes()
            executable = (directory / "comm").read_bytes().rstrip(b"\n")
            root, role = process_identity(command, executable)
            pid = int(directory.name)
            if root:
                roots.add(pid)
            rows[pid] = (int(fields[1]), int(fields[19]), int(fields[11]) + int(fields[12]),
                         int(fields[21]), role)
        except (OSError, ValueError, IndexError):
            continue  # Processes can exit between reads.
    selected = {}
    for pid, (_, start, ticks, rss, role) in rows.items():
        parent = pid
        seen = set()
        while parent in rows and parent not in roots and parent not in seen:
            seen.add(parent)
            parent = rows[parent][0]
        if parent in roots:
            selected[(pid, start)] = (ticks, rss, "browser" if pid in roots else role)
    return selected


def memory():
    values = {}
    for row in Path("/proc/meminfo").read_text().splitlines():
        key, _, value = row.partition(":")
        if key in ("MemTotal", "MemAvailable", "SwapFree"):
            values[key + "_MiB"] = int(value.split()[0]) // 1024
    return values


def saved_state(config, plugin):
    enabled = small_json(config / "community-plugins.json", MIB)
    settings = small_json(plugin / "data.json", MIB)
    return {
        "miro_listed_as_enabled": "miro-canvas" in enabled if isinstance(enabled, list) else None,
        "welcome_answer_saved": settings.get("importQuestionAnswered") is True
        if isinstance(settings, dict) else None,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("vault", type=Path, help="local vault folder")
    parser.add_argument("--config-dir", default=".obsidian", help="vault-relative configuration folder")
    parser.add_argument("--seconds", type=int, choices=range(5, 121), metavar="5..120", default=30)
    args = parser.parse_args()
    if sys.platform != "linux":
        parser.error("Run this on the Linux machine where Obsidian freezes.")
    vault = args.vault.expanduser().resolve()
    config = (vault / args.config_dir).resolve()
    if vault not in config.parents or not config.is_dir():
        parser.error("Check the vault folder and --config-dir.")
    plugin = config / "plugins" / "miro-canvas"
    manifest = small_json(plugin / "manifest.json", 64 * 1024)
    version = manifest.get("version") if isinstance(manifest, dict) else None
    if not isinstance(version, str) or not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", version):
        parser.error("Miro Canvas was not found in this vault's plugin folder.")
    enabled = small_json(config / "community-plugins.json", MIB)
    settings = small_json(plugin / "data.json", MIB)
    print("Counting files and Canvas items before recording...")
    counts = inventory(vault, config)
    path_fd, report_path = tempfile.mkstemp(prefix="miro-freeze-", suffix=".txt")
    print("Local report:", report_path, flush=True)
    with os.fdopen(path_fd, "w", encoding="utf-8", buffering=1) as report:
        def record(event, **values):
            print(json.dumps(dict(event=event, **values)), file=report, flush=True)

        session = os.environ.get("XDG_SESSION_TYPE", "")
        record("environment", format=1, plugin_version=version,
               machine=platform.machine() if platform.machine() in ("x86_64", "aarch64") else "other",
               session=session if session in ("wayland", "x11", "tty") else "unknown",
               community_plugins_enabled=len(enabled) if isinstance(enabled, list) else None,
               board_integration=(settings.get("boardKnowledge") if isinstance(settings, dict)
                                 and isinstance(settings.get("boardKnowledge"), bool) else "default"),
               **memory())
        record("vault", **counts)
        if not processes():
            print("No Obsidian process detected. Open Obsidian, then rerun this command.")
            record("no_matching_process")
            return 1
        print("In Obsidian, open Settings > Community plugins with Miro Canvas off.")
        state = saved_state(config, plugin)
        record("initial_saved_state", **state)
        input("Press Enter here just BEFORE switching Miro Canvas on, then switch it on: ")
        previous = processes()
        start = last = time.monotonic()
        hz = os.sysconf("SC_CLK_TCK")
        page_size = os.sysconf("SC_PAGE_SIZE")
        record("before_toggle", sample_seconds=args.seconds)
        for _ in range(args.seconds):
            time.sleep(1)
            current = processes()
            now = time.monotonic()
            next_state = saved_state(config, plugin)
            if next_state != state:
                record("saved_state_changed", seconds=round(now-start, 1), **next_state)
                state = next_state
            cpu = Counter()
            rss = Counter()
            for key, (ticks, pages, role) in current.items():
                if key in previous:
                    cpu[role] += max(0, ticks - previous[key][0])
                rss[role] += pages
            record("sample", seconds=round(now-start, 1), process_count=len(current),
                   cpu_pct={role: round(100 * ticks / hz / (now-last), 1) for role, ticks in cpu.items()},
                   rss_MiB={role: round(pages * page_size / MIB) for role, pages in rss.items()},
                   **memory())
            previous, last = current, now
        record("finished")
    print("Done. Review and attach this report:", report_path)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (KeyboardInterrupt, EOFError):
        sys.exit(130)
