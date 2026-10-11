# Third-party notices

miro-canvas is released under the MIT License (see [LICENSE](LICENSE)). It
contains code adapted from the projects below; their notices follow.

## LZ-string

- Project: <https://github.com/pieroxy/lz-string>
- Version adapted: 1.4.4
- Where: `src/importers/lz-string.ts` (a port of `decompressFromBase64`,
  used to read the `compressed-json` drawings the Obsidian Excalidraw plugin
  saves) and `tests/helpers/lz-string-compress.ts` (a test-only port of
  `compressToBase64`, used to build test fixtures; not part of the plugin).

```
MIT License

Copyright (c) 2013 Pieroxy <pieroxy@pieroxy.net>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## html2canvas-pro

- Project: <https://github.com/yorickshan/html2canvas-pro>
- Version bundled: 2.5.0
- Where: browser board export in `src/board-export.ts`.

```
MIT License

Copyright (c) 2024-present yorickshan and html2canvas-pro contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

```


## Vector PDF dependencies

- jsPDF4.2.1: https://github.com/parallax/jsPDF (MIT). The reviewed build removes
  unused external-viewer output modes and the HTML/addSvgAsImage plugins; core
  offline PDF drawing, text, TTF and PNG functions are retained. The source pin
  and complete build transformation are in scripts/offline-pdf-build.mjs.
- svg2pdf.js2.8.1: https://github.com/yWorks/svg2pdf.js (MIT), converts prepared
  offline SVG paths/text to PDF.
- fflate0.8.3: https://github.com/101arrowz/fflate (MIT), restores losslessly
  compressed bundled TTF bytes locally. Font glyphs and licenses are unchanged.

Their copyright/license comments remain in the distributed bundle. Noto Sans
copyright and full SIL Open Font License are retained in src/vector-pdf-fonts.ts
and its distributed output; original font hashes are checked before repacking.


## tldraw Obsidian test fixture (not editor runtime)

`tests/fixtures/import/tldraw-current-schema.tldr` is an unmodified saved test
file from tldraw/obsidian-plugin at 2a3b92638095128655ce786eeb717dc346a4d2d0,
copyright 2023 Sam Alhaqab, Apache-2.0. The complete pinned license accompanies
it in `tldraw-plugin-LICENSE.txt`; there was no separate upstream NOTICE.
[Provenance and hashes](docs/import-tldraw-audit.md). No tldraw editor or SDK
implementation is bundled.
