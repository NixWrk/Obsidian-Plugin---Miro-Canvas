"""Build the font packs the plugin offers for download.

A pack is one uncompressed ZIP archive - `fonts-<id>.zip` - holding:

- `pack.json`: the pack's id, names, every font face (family, style,
  weight, unicode range, file) and the aliases that let a board naming a
  font the pack stands in for (Miro's `open_sans`, Word's `Calibri`) find
  it;
- `fonts/*.woff2`: the faces, already compressed, split by script as their
  sources publish them, so a browser loads only the scripts a board uses;
- `licenses/*.txt`: each family's licence.  Only fonts under the SIL Open
  Font License, the Apache License or the MIT License go into a pack.

The archive is stored, not deflated: WOFF2 is compressed already, and the
plugin reads a stored archive without a library.

Sources: Google Fonts (its CSS API names every face and range) and the
fonts Excalidraw ships in its own repository.  Nothing here is proprietary:
Miro's closed fonts (Roobert, Spoof, Tiempos Text, Formular, Lemon Tuesday)
and Microsoft's are not packed; the Word pack carries open fonts drawn to
the same metrics instead, under the names of the fonts they stand in for.

Usage:
    python tools/build_font_packs.py [--out dist/fonts] [--cache .cache/fonts] [--pack miro ...]
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import re
import sys
import time
import urllib.error
import urllib.request
import zipfile
from dataclasses import dataclass, field
from pathlib import Path

from fontTools.ttLib import TTFont

PACK_SCHEMA = 1
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
GOOGLE_METADATA = "https://fonts.google.com/metadata/fonts"
GOOGLE_CSS = "https://fonts.googleapis.com/css2?family={query}&display=swap"
GOOGLE_LICENSES = "https://raw.githubusercontent.com/google/fonts/main/{kind}/{folder}/{name}"
EXCALIDRAW_FONTS = "https://raw.githubusercontent.com/excalidraw/excalidraw/master/packages/excalidraw/fonts/{folder}/{file}"
LATIN_AND_CYRILLIC = ("latin", "latin-ext", "cyrillic", "cyrillic-ext")
# The styles a pack carries of a family, when the family has them.
WANTED_STYLES = (("normal", 400), ("normal", 700), ("italic", 400), ("italic", 700))


@dataclass(frozen=True)
class GoogleFamily:
    family: str
    subsets: tuple[str, ...] | None = LATIN_AND_CYRILLIC


@dataclass(frozen=True)
class ExcalidrawFamily:
    folder: str
    family: str
    licence_note: str


@dataclass(frozen=True)
class Pack:
    id: str
    title: dict[str, str]
    description: dict[str, str]
    families: tuple[GoogleFamily | ExcalidrawFamily, ...]
    # An alias is a family name a board may name - Miro's font ids, Word's
    # fonts - resolved to a family of the pack.
    aliases: dict[str, str] = field(default_factory=dict)


# Miro's own ids for its fonts, as its REST API writes them, for the open
# ones this pack carries.
MIRO_ALIASES = {
    "abril_fatface": "Abril Fatface", "bangers": "Bangers", "caveat": "Caveat",
    "eb_garamond": "EB Garamond", "fredoka_one": "Fredoka", "Fredoka One": "Fredoka",
    "graduate": "Graduate", "gravitas_one": "Gravitas One", "nixie_one": "Nixie One",
    "noto_sans": "Noto Sans", "open_sans": "Open Sans", "OpenSans": "Open Sans",
    "permanent_marker": "Permanent Marker", "pt_sans": "PT Sans", "pt_sans_narrow": "PT Sans Narrow",
    "pt_serif": "PT Serif", "rammetto_one": "Rammetto One", "roboto": "Roboto",
    "roboto_condensed": "Roboto Condensed", "roboto_mono": "Roboto Mono", "roboto_slab": "Roboto Slab",
    "titan_one": "Titan One", "plex_sans": "IBM Plex Sans", "plex_serif": "IBM Plex Serif",
    "plex_mono": "IBM Plex Mono",
}

PACKS = (
    Pack(
        id="miro",
        title={"en": "Miro", "ru": "Miro"},
        description={
            "en": "The open fonts of Miro's list, Latin and Cyrillic.",
            "ru": "Открытые шрифты из списка Miro, латиница и кириллица.",
        },
        families=tuple(GoogleFamily(name) for name in (
            "Abril Fatface", "Bangers", "Caveat", "EB Garamond", "Fredoka", "Graduate", "Gravitas One",
            "IBM Plex Sans", "IBM Plex Serif", "IBM Plex Mono", "Nixie One", "Noto Sans", "Open Sans",
            "PT Sans", "PT Sans Narrow", "PT Serif", "Permanent Marker", "Rammetto One", "Roboto",
            "Roboto Condensed", "Roboto Mono", "Roboto Slab", "Titan One",
        )),
        aliases=MIRO_ALIASES,
    ),
    Pack(
        id="miro-cjk",
        title={"en": "Miro: Japanese and Korean", "ru": "Miro: японский и корейский"},
        description={
            "en": "Miro's Japanese and Korean fonts. Large: add it only if your boards use them.",
            "ru": "Японские и корейские шрифты Miro. Большой набор: добавляйте, только если они есть на ваших досках.",
        },
        families=tuple(GoogleFamily(name, None) for name in (
            "Gamja Flower", "Gowun Batang", "Klee One", "M PLUS Rounded 1c", "Mochiy Pop P One",
            "Nanum Brush Script", "Noto Sans JP", "Noto Sans KR", "Noto Serif JP", "Noto Serif KR",
        )),
        aliases={
            "gamja_flower": "Gamja Flower", "gowun_batang": "Gowun Batang", "klee_one": "Klee One",
            "m_plus_rounded_1c": "M PLUS Rounded 1c", "mochiy_pop_p_one": "Mochiy Pop P One",
            "nanum_brush_script": "Nanum Brush Script", "noto_sans_japanese": "Noto Sans JP",
            "noto_sans_korean": "Noto Sans KR", "noto_serif_japanese": "Noto Serif JP",
            "noto_serif_korean": "Noto Serif KR",
        },
    ),
    Pack(
        id="word",
        title={"en": "Word", "ru": "Word"},
        description={
            "en": "Open fonts drawn to the metrics of Word's Calibri, Cambria, Arial, Times New Roman, Courier New and Georgia, found under those names wherever the originals are missing.",
            "ru": "Открытые шрифты с метриками Calibri, Cambria, Arial, Times New Roman, Courier New и Georgia из Word; подставляются под этими именами там, где оригиналов нет.",
        },
        families=tuple(GoogleFamily(name) for name in ("Carlito", "Caladea", "Arimo", "Tinos", "Cousine", "Gelasio")),
        aliases={
            "Calibri": "Carlito", "Cambria": "Caladea", "Arial": "Arimo", "arial": "Arimo",
            "Times New Roman": "Tinos", "times_new_roman": "Tinos", "Courier New": "Cousine",
            "Georgia": "Gelasio", "georgia": "Gelasio",
        },
    ),
    Pack(
        id="excalidraw",
        title={"en": "Excalidraw", "ru": "Excalidraw"},
        description={
            "en": "The fonts Excalidraw draws with: Excalifont, Virgil, Nunito, Lilita One, Comic Shanns, Cascadia Code and Liberation Sans.",
            "ru": "Шрифты, которыми рисует Excalidraw: Excalifont, Virgil, Nunito, Lilita One, Comic Shanns, Cascadia Code и Liberation Sans.",
        },
        families=(
            ExcalidrawFamily("Excalifont", "Excalifont", "SIL Open Font License 1.1"),
            ExcalidrawFamily("Virgil", "Virgil", "SIL Open Font License 1.1"),
            ExcalidrawFamily("ComicShanns", "Comic Shanns", "MIT License"),
            ExcalidrawFamily("Cascadia", "Cascadia Code", "SIL Open Font License 1.1"),
            ExcalidrawFamily("Liberation", "Liberation Sans", "SIL Open Font License 1.1"),
            GoogleFamily("Nunito"),
            GoogleFamily("Lilita One"),
        ),
        aliases={"Excalidraw": "Excalifont"},
    ),
)

LICENCE_SOURCES = {
    "Cascadia Code": "https://raw.githubusercontent.com/microsoft/cascadia-code/main/LICENSE",
    "Liberation Sans": "https://raw.githubusercontent.com/liberationfonts/liberation-fonts/main/LICENSE",
}


class Fetcher:
    """HTTP GET with an optional on-disk cache, so a rebuild needs no network."""

    def __init__(self, cache: Path | None) -> None:
        self.cache = cache

    def get(self, url: str, *, text: bool = False) -> bytes | str:
        if self.cache is not None:
            key = hashlib.sha256(url.encode("utf-8")).hexdigest()
            path = self.cache / key
            if path.exists():
                data = path.read_bytes()
                return data.decode("utf-8") if text else data
        data = self.download(url)
        if self.cache is not None:
            self.cache.mkdir(parents=True, exist_ok=True)
            (self.cache / hashlib.sha256(url.encode("utf-8")).hexdigest()).write_bytes(data)
        return data.decode("utf-8") if text else data

    @staticmethod
    def download(url: str) -> bytes:
        """One GET, tried again after a pause when the network or the server stumbles.

        A missing file (404) is an answer, not a stumble, and is not retried:
        licences are found by trying their usual names in turn.
        """
        pauses = (5, 20, 60)
        for attempt in range(len(pauses) + 1):
            try:
                request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
                with urllib.request.urlopen(request, timeout=60) as response:
                    return response.read()
            except urllib.error.HTTPError as error:
                if (error.code != 429 and error.code < 500) or attempt == len(pauses):
                    raise
            except (urllib.error.URLError, TimeoutError, ConnectionError):
                if attempt == len(pauses):
                    raise
            print(f"retrying {url} in {pauses[attempt]} s", file=sys.stderr)
            time.sleep(pauses[attempt])
        raise AssertionError("unreachable")


@dataclass
class Face:
    family: str
    style: str
    weight: str
    unicode_range: str | None
    file: str
    data: bytes


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def google_styles(metadata: dict, family: str) -> list[tuple[str, int]]:
    """The wanted styles the family has; its lightest regular face when it has none of them."""
    entry = next((item for item in metadata["familyMetadataList"] if item["family"] == family), None)
    if entry is None:
        raise SystemExit(f"Google Fonts has no family {family!r}")
    available = set(entry["fonts"].keys())
    wanted = [(style, weight) for style, weight in WANTED_STYLES if f"{weight}{'i' if style == 'italic' else ''}" in available]
    if wanted:
        return wanted
    weights = sorted(int(key) for key in available if key.isdigit())
    return [("normal", weights[0])]


def google_faces(fetcher: Fetcher, metadata: dict, source: GoogleFamily) -> list[Face]:
    styles = google_styles(metadata, source.family)
    italic = any(style == "italic" for style, _ in styles)
    if italic:
        axes = "ital,wght@" + ";".join(f"{1 if style == 'italic' else 0},{weight}" for style, weight in sorted(styles, key=lambda s: (s[0] == "italic", s[1])))
    else:
        axes = "wght@" + ";".join(str(weight) for _, weight in sorted(styles, key=lambda s: s[1]))
    css = fetcher.get(GOOGLE_CSS.format(query=source.family.replace(" ", "+") + ":" + axes), text=True)
    faces = []
    # Latin and Cyrillic come as subsets named in a comment; Chinese,
    # Japanese and Korean as a hundred unnamed slices, numbered here.
    for index, (subset, block) in enumerate(re.findall(r"(?:/\* ([\w-]+) \*/\s*)?@font-face \{(.*?)\}", css, flags=re.S)):
        if source.subsets is not None and subset not in source.subsets:
            continue
        subset = subset or f"part-{index}"
        style = re.search(r"font-style: (\w+);", block).group(1)
        weight = re.search(r"font-weight: (\d+);", block).group(1)
        url = re.search(r"src: url\(([^)]+)\) format\('woff2'\);", block).group(1)
        unicode_range = re.search(r"unicode-range: ([^;]+);", block)
        file = f"{slug(source.family)}-{weight}{'i' if style == 'italic' else ''}-{slug(subset)}.woff2"
        faces.append(Face(source.family, style, weight, unicode_range.group(1) if unicode_range else None, file, fetcher.get(url)))
    if not faces:
        raise SystemExit(f"Google Fonts gave no faces for {source.family!r}")
    return faces


APACHE_LICENCE = "https://www.apache.org/licenses/LICENSE-2.0.txt"


def google_licence_file(fetcher: Fetcher, family: str) -> str | None:
    folder = re.sub(r"[^a-z0-9]", "", family.lower())
    for kind, name in (("ofl", "OFL.txt"), ("apache", "LICENSE.txt"), ("ufl", "UFL.txt")):
        try:
            return fetcher.get(GOOGLE_LICENSES.format(kind=kind, folder=folder, name=name), text=True)
        except urllib.error.HTTPError:
            continue
    return None


def ofl_body(fetcher: Fetcher) -> str:
    """The OFL's own text, without any one font's copyright line."""
    text = google_licence_file(fetcher, "Nunito") or ""
    marker = "This Font Software is licensed"
    return text[text.index(marker):] if marker in text else text


def google_licence(fetcher: Fetcher, family: str, faces: list[Face]) -> str:
    """The licence file google/fonts keeps for the family, or the font's own notice with its licence's text."""
    found = google_licence_file(fetcher, family)
    if found is not None:
        return found
    embedded = embedded_licence(faces[0])
    # Google's served subsets often keep only the licence's URL, not its name.
    if "Apache" in embedded or "apache.org/licenses" in embedded:
        return f"{embedded}\n\n{fetcher.get(APACHE_LICENCE, text=True)}"
    if "Open Font License" in embedded or "OFL" in embedded or "openfontlicense.org" in embedded:
        return f"{embedded}\n\n{ofl_body(fetcher)}"
    raise SystemExit(f"no licence found for {family!r}: its own notice names none this tool knows")


def excalidraw_faces(fetcher: Fetcher, source: ExcalidrawFamily) -> list[Face]:
    index = fetcher.get(EXCALIDRAW_FONTS.format(folder=source.folder, file="index.ts"), text=True)
    imports = dict(re.findall(r'import (\w+) from "\./([^"]+\.woff2)";', index))
    faces = []
    entries = re.split(r"\buri:\s*", index)[1:]
    for entry in entries:
        name = re.match(r"(\w+)", entry).group(1)
        body = entry.split("uri:")[0]
        unicode_range = re.search(r'unicodeRange:\s*"([^"]+)"', body)
        weight = re.search(r'weight:\s*"(\d+)"', body)
        file = imports[name]
        faces.append(Face(
            source.family, "normal", weight.group(1) if weight else "400",
            unicode_range.group(1) if unicode_range else None,
            f"{slug(source.family)}-{Path(file).stem.lower()}.woff2",
            fetcher.get(EXCALIDRAW_FONTS.format(folder=source.folder, file=file)),
        ))
    if not faces:
        raise SystemExit(f"Excalidraw's index for {source.folder} lists no faces")
    return faces


def embedded_licence(face: Face) -> str:
    """The copyright, licence and licence URL a font carries in its own name table."""
    font = TTFont(io.BytesIO(face.data))
    names = font["name"]
    lines = []
    for name_id in (0, 13, 14):
        record = names.getDebugName(name_id)
        if record:
            lines.append(record.strip())
    return "\n\n".join(lines)


def excalidraw_licence(fetcher: Fetcher, source: ExcalidrawFamily, faces: list[Face]) -> str:
    if source.family in LICENCE_SOURCES:
        return fetcher.get(LICENCE_SOURCES[source.family], text=True)
    embedded = embedded_licence(faces[0])
    if "Open Font License" in source.licence_note and "PREAMBLE" not in embedded:
        # The font names its licence without carrying its text: append the
        # licence's own text, as the OFL asks a redistribution to.
        embedded = f"{embedded}\n\n{ofl_body(fetcher)}"
    if not embedded.strip():
        raise SystemExit(f"no licence text found for {source.family!r}")
    return embedded


def validate(face: Face) -> None:
    font = TTFont(io.BytesIO(face.data))
    if "cmap" not in font:
        raise SystemExit(f"{face.file}: not a usable font")


def build(pack: Pack, fetcher: Fetcher, metadata: dict | None, out: Path) -> tuple[Path, dict]:
    faces: list[Face] = []
    licences: list[tuple[str, str]] = []
    for source in pack.families:
        if isinstance(source, GoogleFamily):
            assert metadata is not None
            family_faces = google_faces(fetcher, metadata, source)
            licences.append((source.family, google_licence(fetcher, source.family, family_faces)))
        else:
            family_faces = excalidraw_faces(fetcher, source)
            licences.append((source.family, excalidraw_licence(fetcher, source, family_faces)))
        for face in family_faces:
            validate(face)
        faces.extend(family_faces)

    families: dict[str, list[dict]] = {}
    for face in faces:
        families.setdefault(face.family, []).append({
            "style": face.style, "weight": face.weight, "file": f"fonts/{face.file}",
            **({"unicodeRange": face.unicode_range} if face.unicode_range else {}),
        })
    for alias, target in pack.aliases.items():
        if target not in families:
            raise SystemExit(f"pack {pack.id}: alias {alias!r} points at {target!r}, which the pack does not carry")
    size = sum(len(face.data) for face in faces)
    manifest = {
        "schema": PACK_SCHEMA,
        "id": pack.id,
        "title": pack.title,
        "description": pack.description,
        "size": size,
        "families": [{"family": name, "faces": items} for name, items in families.items()],
        "aliases": [{"family": alias, "target": target} for alias, target in sorted(pack.aliases.items())],
        "licenses": [{"family": name, "file": f"licenses/{slug(name)}.txt"} for name, _ in licences],
    }

    out.mkdir(parents=True, exist_ok=True)
    archive = out / f"fonts-{pack.id}.zip"
    # A fixed time for every entry, so the same fonts make the same archive.
    stamp = (2026, 1, 1, 0, 0, 0)
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_STORED) as bundle:
        def put(name: str, data: bytes) -> None:
            info = zipfile.ZipInfo(name, date_time=stamp)
            info.compress_type = zipfile.ZIP_STORED
            # zipfile records the system that made the archive - 0 on
            # Windows, 3 elsewhere - which would give a CI runner other
            # bytes, and so another SHA-256, than a Windows machine.
            info.create_system = 0
            bundle.writestr(info, data)
        put("pack.json", json.dumps(manifest, ensure_ascii=False, indent=1).encode("utf-8"))
        for face in faces:
            put(f"fonts/{face.file}", face.data)
        for name, text in licences:
            put(f"licenses/{slug(name)}.txt", text.encode("utf-8"))
    print(f"{archive.name}: {len(families)} families, {len(faces)} faces, {size / 1024 / 1024:.1f} MB of fonts")
    return archive, manifest


def ts_string(text: str) -> str:
    """A double-quoted TypeScript string literal, safe for the names and blurbs a pack carries."""
    escaped = text.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")
    return f'"{escaped}"'


def catalogue_entry_source(entry: dict) -> str:
    title = ", ".join(f"{lang}: {ts_string(text)}" for lang, text in entry["title"].items())
    description = ", ".join(f"{lang}: {ts_string(text)}" for lang, text in entry["description"].items())
    return (
        "  Object.freeze({\n"
        f"    id: {ts_string(entry['id'])},\n"
        f"    file: {ts_string(entry['file'])},\n"
        f"    bytes: {entry['bytes']},\n"
        f"    sha256: {ts_string(entry['sha256'])},\n"
        f"    title: Object.freeze({{ {title} }}),\n"
        f"    description: Object.freeze({{ {description} }}),\n"
        "  })"
    )


def catalogue_module_source(entries: list[dict]) -> str:
    """The generated `src/font-pack-catalogue.ts` module: the downloadable packs' names, sizes and checksums, so the plugin can list and verify a pack without asking GitHub first."""
    items = ",\n".join(catalogue_entry_source(entry) for entry in entries)
    return (
        "/**\n"
        " * The downloadable font packs' catalogue: id, byte size, SHA-256 and\n"
        " * names in both languages, so the plugin can list and verify a pack\n"
        " * before it ever asks GitHub for one.\n"
        " *\n"
        " * Generated by `tools/build_font_packs.py --write-catalogue`.  Do not\n"
        " * edit by hand; rebuild the packs and regenerate this file instead.\n"
        " */\n"
        "\n"
        'export interface FontPackCatalogueEntry {\n'
        "  readonly id: string;\n"
        "  readonly file: string;\n"
        "  readonly bytes: number;\n"
        "  readonly sha256: string;\n"
        '  readonly title: Readonly<Record<"en" | "ru", string>>;\n'
        '  readonly description: Readonly<Record<"en" | "ru", string>>;\n'
        "}\n"
        "\n"
        "export const FONT_PACK_CATALOGUE: readonly FontPackCatalogueEntry[] = Object.freeze([\n"
        f"{items}\n"
        "]);\n"
    )


def write_catalogue_module(entries: list[dict], path: Path | str) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(catalogue_module_source(entries), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", type=Path, default=Path("dist/fonts"))
    parser.add_argument("--cache", type=Path, default=None, help="keep downloads here and reuse them")
    parser.add_argument("--pack", action="append", choices=[pack.id for pack in PACKS], help="build only these packs")
    parser.add_argument("--write-catalogue", type=Path, default=None, help="also write the plugin's src/font-pack-catalogue.ts from this build")
    args = parser.parse_args()
    fetcher = Fetcher(args.cache)
    chosen = [pack for pack in PACKS if args.pack is None or pack.id in args.pack]
    needs_google = any(isinstance(source, GoogleFamily) for pack in chosen for source in pack.families)
    metadata = None
    if needs_google:
        raw = fetcher.get(GOOGLE_METADATA, text=True)
        metadata = json.loads(raw[raw.index("{"):])
    catalogue = []
    for pack in chosen:
        archive, manifest = build(pack, fetcher, metadata, args.out)
        catalogue.append({
            "id": pack.id, "file": archive.name, "bytes": archive.stat().st_size,
            "sha256": hashlib.sha256(archive.read_bytes()).hexdigest(),
            "title": manifest["title"], "description": manifest["description"],
        })
    (args.out / "catalogue.json").write_text(
        json.dumps([{k: v for k, v in entry.items() if k not in ("title", "description")} for entry in catalogue], indent=1),
        encoding="utf-8",
    )
    if args.write_catalogue is not None:
        write_catalogue_module(catalogue, args.write_catalogue)
        print(f"wrote {args.write_catalogue}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
