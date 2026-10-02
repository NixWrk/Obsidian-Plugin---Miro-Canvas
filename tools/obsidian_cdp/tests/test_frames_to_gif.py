from __future__ import annotations

import json
from pathlib import Path

from tools.obsidian_cdp.frames_to_gif import (
    MAX_FRAME_MS,
    MIN_FRAME_MS,
    TAIL_MS,
    compose_frames,
    frame_durations,
    load_manifest,
    shared_palette,
    thin_by_fps,
)


def test_thin_by_fps_always_keeps_first_and_last_frame() -> None:
    # Ten frames, 5ms apart - far denser than 10fps (100ms gaps) - should thin
    # heavily, but the first moment and the final "Result" frame must survive.
    timestamps = [index * 5.0 for index in range(10)]

    kept = thin_by_fps(timestamps, fps=10)

    assert kept[0] == 0
    assert kept[-1] == 9
    assert kept == sorted(set(kept))


def test_thin_by_fps_keeps_every_frame_when_already_sparse() -> None:
    timestamps = [0.0, 200.0, 400.0, 600.0]

    kept = thin_by_fps(timestamps, fps=10)  # min gap 100ms; frames are 200ms apart

    assert kept == [0, 1, 2, 3]


def test_thin_by_fps_handles_zero_and_one_frame() -> None:
    assert thin_by_fps([], fps=10) == []
    assert thin_by_fps([42.0], fps=10) == [0]


def test_frame_durations_uses_the_gap_to_the_next_kept_frame() -> None:
    timestamps = [0.0, 100.0, 300.0, 320.0]
    kept = [0, 1, 2, 3]

    durations = frame_durations(timestamps, kept)

    assert durations[0] == 100  # gap to frame 1
    assert durations[1] == 200  # gap to frame 2
    assert durations[2] == MIN_FRAME_MS  # gap to frame 3 (20ms) clamped up
    # Only the very last frame's own duration is held for the readable tail.
    assert durations[-1] >= TAIL_MS


def test_frame_durations_clamps_extreme_gaps() -> None:
    timestamps = [0.0, 1.0, 50_000.0]  # a near-instant frame, then a huge pause
    kept = [0, 1, 2]

    durations = frame_durations(timestamps, kept)

    assert durations[0] == MIN_FRAME_MS  # 1ms gap clamped up
    assert durations[1] == MAX_FRAME_MS  # 49999ms gap clamped down
    assert durations[-1] == TAIL_MS


def test_frame_durations_empty_input() -> None:
    assert frame_durations([], []) == []


def test_frame_durations_preserves_a_reading_pause_on_a_still_board() -> None:
    assert frame_durations([0, 2500, 5000], [0, 1, 2]) == [2500, 2500, TAIL_MS]


def test_load_manifest_reads_frame_list(tmp_path: Path) -> None:
    manifest = tmp_path / "manifest.json"
    manifest.write_text(json.dumps({"frames": [{"file": "frame-0.png", "t": 1.0}]}), encoding="utf-8")

    frames = load_manifest(manifest)

    assert frames == [{"file": "frame-0.png", "t": 1.0}]


def test_load_manifest_rejects_empty_frame_list(tmp_path: Path) -> None:
    manifest = tmp_path / "manifest.json"
    manifest.write_text(json.dumps({"frames": []}), encoding="utf-8")

    try:
        load_manifest(manifest)
    except ValueError as error:
        assert "no frames" in str(error)
    else:
        raise AssertionError("expected a ValueError for an empty frame list")


def test_compose_frames_pads_a_smaller_frame_onto_the_shared_canvas(tmp_path: Path) -> None:
    from PIL import Image

    # A wide, short frame (main window) and a narrower, taller one (Settings
    # pop-out) - compose_frames must resample both to the same width and pad
    # the shorter one onto the taller canvas rather than distorting it.
    Image.new("RGB", (400, 200), (10, 20, 30)).save(tmp_path / "a.png")
    Image.new("RGB", (200, 300), (40, 50, 60)).save(tmp_path / "b.png")
    frames = [{"file": "a.png", "t": 0.0}, {"file": "b.png", "t": 100.0}]

    composed = compose_frames(tmp_path, frames, [0, 1], width=100)

    assert len(composed) == 2
    assert all(image.width == 100 for image in composed)
    assert composed[0].height == composed[1].height  # one shared canvas size


def test_shared_palette_animation_leaves_no_cursor_trail(tmp_path: Path) -> None:
    from PIL import Image, ImageDraw, ImageSequence

    frames = []
    for x in [4, 16, 28]:
        image = Image.new("RGB", (40, 20), (30, 30, 30))
        ImageDraw.Draw(image).rectangle((x, 5, x + 3, 9), fill=(255, 255, 255))
        frames.append(image)
    encoded = shared_palette(frames)
    path = tmp_path / "cursor.gif"
    encoded[0].save(path, save_all=True, append_images=encoded[1:], duration=100, disposal=1, optimize=True)
    with Image.open(path) as animation:
        decoded = [frame.convert("RGB") for frame in ImageSequence.Iterator(animation)]
    assert len(decoded) == 3
    for index, frame in enumerate(decoded):
        assert frame.getpixel(([4, 16, 28][index], 5)) == (255, 255, 255)
        for previous_x in [4, 16, 28][:index]:
            assert frame.getpixel((previous_x, 5)) == (30, 30, 30)
