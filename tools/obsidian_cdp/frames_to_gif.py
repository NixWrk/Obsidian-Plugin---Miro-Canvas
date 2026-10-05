"""Turns CDP screencast frames into a small, looping GIF.

record.mjs is the only normal caller: it saves each captured frame as a PNG
next to a manifest (``{"frames": [{"file": "frame-00001.png", "t": <ms>}, ...]}``,
timestamps only needing to be comparable to each other, not any particular
epoch) and invokes this script.  Kept separate, and in Python, because Pillow
does the resampling and GIF encoding; the pure timing/selection logic below
has no image dependency so it is unit-tested directly (tests/test_frames_to_gif.py).

Usage:
  python frames_to_gif.py --manifest <dir>/manifest.json --out out.gif --width 960 --fps 10
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

MIN_FRAME_MS = 20
MAX_FRAME_MS = 10000
TAIL_MS = 900
WARN_BYTES = 4 * 1024 * 1024
BACKGROUND = (24, 24, 24)


def thin_by_fps(timestamps: list[float], fps: float) -> list[int]:
    """Indices to keep so consecutive kept frames are >= 1000/fps ms apart.

    Always keeps the first and last frame - the scenario's starting point and
    its final "Result" state matter even if capture happened to bunch frames
    up right around them.
    """

    if not timestamps:
        return []
    if len(timestamps) == 1:
        return [0]
    min_gap = 1000.0 / fps if fps > 0 else 0.0
    kept = [0]
    last_kept_t = timestamps[0]
    for index in range(1, len(timestamps) - 1):
        if timestamps[index] - last_kept_t >= min_gap:
            kept.append(index)
            last_kept_t = timestamps[index]
    last_index = len(timestamps) - 1
    if kept[-1] != last_index:
        kept.append(last_index)
    return kept


def frame_durations(
    timestamps: list[float],
    kept_indices: list[int],
    *,
    min_ms: int = MIN_FRAME_MS,
    max_ms: int = MAX_FRAME_MS,
    tail_ms: int = TAIL_MS,
) -> list[int]:
    """One duration per kept frame, in ms: how long *that* frame holds before the next kept one, clamped, with a longer, readable tail on the very last frame."""

    if not kept_indices:
        return []
    durations: list[int] = []
    for position, index in enumerate(kept_indices):
        if position + 1 < len(kept_indices):
            gap = timestamps[kept_indices[position + 1]] - timestamps[index]
        else:
            gap = tail_ms
        durations.append(int(round(min(max(gap, min_ms), max_ms))))
    durations[-1] = max(durations[-1], tail_ms)
    return durations


def load_manifest(manifest_path: Path) -> list[dict[str, Any]]:
    payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    frames = payload["frames"]
    if not isinstance(frames, list) or not frames:
        raise ValueError(f"manifest has no frames: {manifest_path}")
    return frames


def compose_frames(frames_dir: Path, frames: list[dict[str, Any]], kept_indices: list[int], width: int):
    """Resamples the kept frames to `width` and pads each onto one shared canvas size, so a window switch (main <-> Settings, different native sizes) never distorts or jumps."""

    from PIL import Image

    resized = []
    for index in kept_indices:
        image = Image.open(frames_dir / frames[index]["file"]).convert("RGB")
        scale = width / image.width
        height = max(1, round(image.height * scale))
        resized.append(image.resize((width, height), Image.LANCZOS))

    canvas_height = max(image.height for image in resized)
    composed = []
    for image in resized:
        canvas = Image.new("RGB", (width, canvas_height), BACKGROUND)
        canvas.paste(image, (0, (canvas_height - image.height) // 2))
        composed.append(canvas)
    return composed


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--width", type=int, default=960)
    parser.add_argument("--fps", type=float, default=10)
    parser.add_argument("--max-hold-ms", type=int, default=MAX_FRAME_MS)
    return parser


def shared_palette(frames):
    """Keep colours stable between frames and let GIF store only changed pixels."""
    from PIL import Image

    indices = sorted({round(index * (len(frames) - 1) / 11) for index in range(12)})
    samples = []
    for index in indices:
        sample = frames[index].copy()
        sample.thumbnail((256, 512))
        samples.append(sample)
    sample_height = max(sample.height for sample in samples)
    atlas = Image.new("RGB", (256, sample_height * len(samples) + 4), BACKGROUND)
    for index, sample in enumerate(samples):
        atlas.paste(sample, (0, sample_height * index))
    # Keep small white labels and dark text neutral on colourful cards.
    atlas.paste("white", (0, atlas.height - 4, 128, atlas.height))
    atlas.paste("black", (128, atlas.height - 4, 256, atlas.height))
    palette = atlas.quantize(colors=256)
    return [frame.quantize(palette=palette, dither=Image.Dither.NONE) for frame in frames]


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    frames = load_manifest(args.manifest)
    timestamps = [float(frame["t"]) for frame in frames]

    kept_indices = thin_by_fps(timestamps, args.fps)
    durations = frame_durations(timestamps, kept_indices, max_ms=max(MIN_FRAME_MS, args.max_hold_ms))
    composed = compose_frames(args.manifest.parent, frames, kept_indices, args.width)
    composed = shared_palette(composed)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    first, *rest = composed
    first.save(
        args.out, format="GIF", save_all=True, append_images=rest,
        duration=durations, loop=0, optimize=True, disposal=1,
    )

    size = args.out.stat().st_size
    print(f"OK: {args.out} ({len(composed)} frames, {size / 1024:.0f} KiB)")
    if size > WARN_BYTES:
        print(f"WARNING: {args.out} is {size / 1024 / 1024:.1f} MiB, over the 4 MiB guideline.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
