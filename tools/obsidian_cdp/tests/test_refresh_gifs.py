from __future__ import annotations

import json
from pathlib import Path

from PIL import Image
import pytest

from tools.obsidian_cdp import refresh_gifs


def recording(path: Path, *, duration: int = 1000, size: tuple[int, int] = (40, 30), loop: int = 0) -> None:
    frames = [Image.new("RGB", size, (index * 30, 20, 80)) for index in range(6)]
    frames[0].save(path, save_all=True, append_images=frames[1:], duration=duration, loop=loop)


def test_metrics_preserves_reading_time_and_reports_the_saved_animation(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(refresh_gifs, "ROOT", tmp_path)
    path = tmp_path / "example.gif"
    recording(path)
    result = refresh_gifs.metrics(path, {"name": "example", "width": 40, "height": 30})
    assert result["seconds"] == 6
    assert result["frames"] == 6
    assert result["path"] == "example.gif"
    assert result["bytes"] == path.stat().st_size


@pytest.mark.parametrize("duration,size,loop,reason", [
    (200, (40, 30), 0, "overlong"),
    (1000, (50, 30), 0, "dimensions"),
    (1000, (40, 30), 1, "loop"),
])
def test_metrics_refuses_unreadable_or_mismatched_recordings(tmp_path: Path, duration: int, size: tuple[int, int], loop: int, reason: str) -> None:
    path = tmp_path / "bad.gif"
    recording(path, duration=duration, size=size, loop=loop)
    with pytest.raises(RuntimeError, match=reason):
        refresh_gifs.metrics(path, {"name": "example", "width": 40, "height": 30})


def test_catalogue_covers_every_existing_gif_pair_and_an_existing_scenario() -> None:
    catalogue = json.loads((refresh_gifs.TOOLS / "guide-recordings.json").read_text(encoding="utf-8"))
    names = [scene["name"] for scene in catalogue]
    assert len(names) == len(set(names)) == 30
    for language in ("en", "ru"):
        assert {path.stem for path in (refresh_gifs.ROOT / "docs" / "media" / language).glob("*.gif")} == set(names)
    for scene in catalogue:
        assert (refresh_gifs.TOOLS / "scenarios" / f"{scene['scenario']}.mjs").is_file()
