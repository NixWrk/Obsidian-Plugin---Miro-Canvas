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
