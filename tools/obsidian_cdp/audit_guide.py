"""Check the published guide's GIF pairs and render frames for visual review."""
import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageSequence

def audit(root: Path, out: Path) -> list[dict]:
    out.mkdir(parents=True, exist_ok=True)
    records = []
    scenes = json.loads((root / 'tools' / 'obsidian_cdp' / 'guide-recordings.json').read_text(encoding='utf-8'))
    for language in ("ru", "en"):
        guide = (root / "docs" / ("guide.ru.md" if language == "ru" else "guide.md")).read_text(encoding="utf-8")
        names_to_check = [scene['name'] for scene in scenes]
        assert set(names_to_check) == {path.stem for path in (root / 'docs' / 'media' / language).glob('*.gif')}, 'unlisted GIFs'
        for chunk in range(0, len(names_to_check), 3):
            names = names_to_check[chunk:chunk + 3]
            sheet = Image.new("RGB", (1440, 330 * len(names)), "#eeeeee")
            labels = ImageDraw.Draw(sheet)
            for row, name in enumerate(names):
                path = root / "docs" / "media" / language / f"{name}.gif"
                scene = next(scene for scene in scenes if scene['name'] == name)
                assert f"media/{language}/{name}.gif" in guide, path
                scenario = scene['scenario']
                assert (root / "tools" / "obsidian_cdp" / "scenarios" / f"{scenario}.mjs").is_file()
                with Image.open(path) as gif:
                    assert gif.width == scene['width'] and abs(gif.height - scene['height']) <= 2, (path, gif.size)
                    assert gif.info.get("loop") == 0, path
                    frames = [(frame.convert("RGB"), frame.info.get("duration", 0)) for frame in ImageSequence.Iterator(gif)]
                duration = sum(timing for _, timing in frames)
                assert len(frames) > 2 and 5000 <= duration <= 45000, (path, duration)
                assert path.stat().st_size < 4 * 1024 * 1024, path
                records.append({"language": language, "name": name, "frames": len(frames), "seconds": round(duration / 1000, 2), "bytes": path.stat().st_size})
                labels.text((8, row * 330 + 5), f"{language}/{name} — {duration / 1000:.1f}s", fill="black")
                times = [0, duration / 2, duration - 1]
                for column, target in enumerate(times):
                    elapsed = 0
                    selected = frames[-1][0]
                    for frame, timing in frames:
                        if elapsed + timing > target:
                            selected = frame
                            break
                        elapsed += timing
                    selected.thumbnail((480, 300))
                    sheet.paste(selected, (column * 480 + (480 - selected.width) // 2, row * 330 + 25))
            sheet.save(out / f"review-{language}-{chunk // 3 + 1}.png")
    (out / "metrics.json").write_text(json.dumps(records, indent=2), encoding="utf-8")
    return records


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=Path("tools/obsidian_cdp/.out/guide-review"))
    args = parser.parse_args()
    records = audit(Path(__file__).resolve().parents[2], args.out)
    print(f"Checked {len(records)} GIFs; {sum(r['bytes'] for r in records) / 1024 / 1024:.2f} MiB total")
    for record in records:
        print(f"{record['language']}/{record['name']}: {record['seconds']}s, {record['bytes'] // 1024} KiB")
