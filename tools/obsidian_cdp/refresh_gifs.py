"""Record the bilingual guide into candidates, without replacing published GIFs."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import urllib.request

from PIL import Image

TOOLS = Path(__file__).resolve().parent
ROOT = TOOLS.parents[1]
sys.path.insert(0, str(TOOLS))
from launch import apply_interface_language, cdp_eval, wait_for_workspace_ready


def run(*args: str, timeout: int = 180) -> None:
    subprocess.run(list(args), cwd=ROOT, check=True, timeout=timeout)


def assert_test_vault(port: int) -> None:
    if cdp_eval(port, "return app.vault.getName();") != "MiroCanvasTest":
        raise RuntimeError("Mobile recording requires MiroCanvasTest")


def mobile_snapshot(port: int) -> dict:
    assert_test_vault(port)
    return cdp_eval(port, """
      const c=app.workspace.activeLeaf?.view?.canvas;
      return {language:localStorage.getItem('language'),theme:app.vault.getConfig('theme'),
        settings:JSON.parse(JSON.stringify(app.plugins.plugins['miro-canvas'].canvasSettings)),
        file:app.workspace.getActiveFile()?.path,
        viewport:c?{x:c.tx,y:c.ty,zoom:c.tZoom}:null};
    """)


def restore_mobile(port: int, saved: dict) -> None:
    assert_test_vault(port)
    cdp_eval(port, f"""
      const saved={json.dumps(saved)};
      app.setting.close();
      await app.plugins.plugins['miro-canvas'].saveCanvasSettings(saved.settings);
      app.changeTheme(saved.theme);app.updateTheme();
      if(saved.file){{const f=app.vault.getAbstractFileByPath(saved.file);if(f)await app.workspace.getLeaf(false).openFile(f,{{active:true}});}}
      const c=app.workspace.activeLeaf?.view?.canvas;
      if(c&&saved.viewport)c.setViewport(saved.viewport.x,saved.viewport.y,saved.viewport.zoom);
      return true;
    """)
    apply_interface_language(port, saved["language"] or "en")
    if saved["language"] is None:
        cdp_eval(port, "localStorage.removeItem('language');return true;")


def metrics(path: Path, scene: dict) -> dict:
    with Image.open(path) as animation:
        if animation.info.get('loop') != 0 or animation.n_frames < 3:
            raise RuntimeError(f"Recording must animate and loop: {path.name}")
        duration = 0
        for frame in range(animation.n_frames):
            animation.seek(frame)
            duration += animation.info.get("duration", 0)
        if animation.width != scene["width"] or abs(animation.height - scene["height"]) > 2:
            raise RuntimeError(f"Unexpected dimensions: {path.name}: {animation.size}")
        if duration < 5000 or duration > 45000:
            raise RuntimeError(f"Unreadable or overlong recording: {path.name}: {duration}ms")
        if path.stat().st_size > 4 * 1024 * 1024:
            raise RuntimeError(f"Recording exceeds 4 MiB: {path.name}")
        return {"name": scene["name"], "path": str(path.relative_to(ROOT)), "width": animation.width,
                "height": animation.height, "frames": animation.n_frames, "seconds": duration / 1000,
                "bytes": path.stat().st_size}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--platform", required=True, choices=["desktop", "phone", "tablet"])
    parser.add_argument("--language", required=True, choices=["en", "ru"])
    parser.add_argument("--port", required=True, type=int)
    parser.add_argument("--serial")
    parser.add_argument("--theme", choices=["light", "dark"], default="light")
    parser.add_argument("--names", nargs="*")
    args = parser.parse_args()
    catalogue = json.loads((TOOLS / "guide-recordings.json").read_text(encoding="utf-8"))
    scenes = [scene for scene in catalogue if scene["platform"] == args.platform
              and (not args.names or scene["name"] in args.names)]
    if not scenes:
        raise RuntimeError("No scenes match this request")
    work = (TOOLS / ".out" / "gif-refresh").resolve()
    candidates = work / "candidates" / args.language
    if args.theme == 'dark':
        candidates = candidates / 'dark'
    candidates.mkdir(parents=True, exist_ok=True)
    report_path = work / f"recorded-{args.platform}-{args.language}-{args.theme}.json"
    records = []
    saved = None
    owned_desktop = False
    if args.platform != "desktop":
        if not args.serial:
            raise RuntimeError("A connected device serial is required")
        os.environ["CDP_TITLE"] = "Obsidian"
        run("node", str(TOOLS / "android.mjs"), "forward", "--serial", args.serial, "--port", str(args.port))
        saved = mobile_snapshot(args.port)
        (work / f"device-{args.platform}-before.json").write_text(json.dumps(saved, indent=2), encoding="utf-8")
        apply_interface_language(args.port, args.language)
        wait_for_workspace_ready(args.port)
        assert_test_vault(args.port)
    else:
        try:
            urllib.request.urlopen(f"http://127.0.0.1:{args.port}/json", timeout=1)
        except OSError:
            pass
        else:
            raise RuntimeError("Desktop port is already owned; close your recording instance first")
    try:
        for scene in scenes:
            if args.platform == "desktop":
                scene_work = (work / f"desktop-{args.language}-{args.theme}" / f"{scene['name']}-{time.time_ns()}").resolve()
                if not scene_work.is_relative_to(work) or scene_work.exists():
                    raise RuntimeError("Fresh recording directory must be new and inside the workspace")
                run(sys.executable, str(TOOLS / "launch.py"), "--work", str(scene_work), "--fresh",
                    "--port", str(args.port), "--lang", args.language, "--width", "1280", "--height", "800")
                owned_desktop = True
            output = candidates / f"{scene['name']}.gif"
            command = ["node", str(TOOLS / "record.mjs"), "--scenario", str(TOOLS / "scenarios" / f"{scene['scenario']}.mjs"),
                       "--out", str(output), "--port", str(args.port), "--width", str(scene["width"]), "--fps", "12", "--theme", args.theme]
            if args.serial:
                command += ["--android-serial", args.serial]
            run(*command, timeout=240)
            records.append(metrics(output, scene))
            report_path.write_text(json.dumps(records, indent=2), encoding="utf-8")
            print(f"READY {args.language}/{scene['name']}: {records[-1]['seconds']:.1f}s", flush=True)
            if owned_desktop:
                run(sys.executable, str(TOOLS / "stop.py"), "--port", str(args.port), timeout=30)
                owned_desktop = False
    finally:
        if owned_desktop:
            run(sys.executable, str(TOOLS / "stop.py"), "--port", str(args.port), timeout=30)
        if saved is not None:
            restore_mobile(args.port, saved)


if __name__ == "__main__":
    main()
