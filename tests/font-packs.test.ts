import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  FontFaceRegistry,
  FontPackArchiveError,
  FontPackDownloadError,
  FontPackManifestError,
  customFontFaceRule,
  customFontFormat,
  downloadFontPack,
  fontPackDownloadUrl,
  packFontFaceRules,
  readInstalledPackManifest,
  readPackManifest,
  readStoredZip,
  type FontPackManifest,
} from "../src/font-packs";

// --- A minimal stored-ZIP builder, the mirror of tools/build_font_packs.py's own writer -----

function u16(value: number): number[] {
  return [value & 0xff, (value >> 8) & 0xff];
}

function u32(value: number): number[] {
  return [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff];
}

interface ZipEntrySource {
  readonly name: string;
  readonly data: Uint8Array;
  /** 0 (stored) unless a test needs to prove a deflated entry is refused. */
  readonly method?: number;
}

function buildStoredZip(entries: readonly ZipEntrySource[]): Uint8Array {
  const fileBytes: number[] = [];
  const localOffsets: number[] = [];
  for (const entry of entries) {
    const nameBytes = Array.from(new TextEncoder().encode(entry.name));
    const method = entry.method ?? 0;
    localOffsets.push(fileBytes.length);
    fileBytes.push(
      ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(method), ...u16(0), ...u16(0),
      ...u32(0), ...u32(entry.data.length), ...u32(entry.data.length),
      ...u16(nameBytes.length), ...u16(0),
      ...nameBytes, ...Array.from(entry.data),
    );
  }
  const centralDirStart = fileBytes.length;
  const centralBytes: number[] = [];
  entries.forEach((entry, index) => {
    const nameBytes = Array.from(new TextEncoder().encode(entry.name));
    const method = entry.method ?? 0;
    centralBytes.push(
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(method), ...u16(0), ...u16(0),
      ...u32(0), ...u32(entry.data.length), ...u32(entry.data.length),
      ...u16(nameBytes.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(localOffsets[index]!),
      ...nameBytes,
    );
  });
  const eocd = [
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(entries.length), ...u16(entries.length),
    ...u32(centralBytes.length), ...u32(centralDirStart), ...u16(0),
  ];
  return new Uint8Array([...fileBytes, ...centralBytes, ...eocd]);
}

function text(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

describe("readStoredZip", () => {
  it("reads every stored entry back out, byte for byte", () => {
    const zip = buildStoredZip([
      { name: "pack.json", data: text('{"schema":1}') },
      { name: "fonts/a.woff2", data: new Uint8Array([1, 2, 3, 4, 5]) },
    ]);
    const entries = readStoredZip(zip);
    expect(new TextDecoder().decode(entries.get("pack.json")!)).toBe('{"schema":1}');
    expect(Array.from(entries.get("fonts/a.woff2")!)).toEqual([1, 2, 3, 4, 5]);
  });

  it("refuses a deflated entry, since only stored archives are read", () => {
    const zip = buildStoredZip([{ name: "fonts/a.woff2", data: text("not really deflated"), method: 8 }]);
    expect(() => readStoredZip(zip)).toThrow(FontPackArchiveError);
  });

  it("refuses a path that climbs out of the archive", () => {
    for (const name of ["../evil.txt", "/etc/passwd", "fonts/../../evil", "a\\evil"]) {
      const zip = buildStoredZip([{ name, data: text("x") }]);
      expect(() => readStoredZip(zip)).toThrow(FontPackArchiveError);
    }
  });

  it("refuses an archive whose bytes were cut short", () => {
    const zip = buildStoredZip([{ name: "pack.json", data: text('{"schema":1}') }]);
    expect(() => readStoredZip(zip.slice(0, zip.length - 6))).toThrow(FontPackArchiveError);
  });
});

// --- Manifest validation -----------------------------------------------------------------

function validManifestJson(): unknown {
  return {
    schema: 1,
    id: "excalidraw",
    title: { en: "Excalidraw", ru: "Excalidraw" },
    description: { en: "Fonts.", ru: "Шрифты." },
    size: 12345,
    families: [
      { family: "Excalifont", faces: [{ style: "normal", weight: "400", file: "fonts/excalifont.woff2" }] },
      { family: "Nunito", faces: [{ style: "normal", weight: "400", file: "fonts/nunito.woff2", unicodeRange: "U+20-7e,U+a0-a3" }] },
    ],
    aliases: [{ family: "Excalidraw", target: "Excalifont" }],
    licenses: [{ family: "Excalifont", file: "licenses/excalifont.txt" }],
  };
}

const validEntryNames = new Set(["fonts/excalifont.woff2", "fonts/nunito.woff2", "licenses/excalifont.txt"]);

describe("readPackManifest", () => {
  it("accepts a manifest whose every referenced file exists in the archive", () => {
    const manifest = readPackManifest(validManifestJson(), validEntryNames);
    expect(manifest.id).toBe("excalidraw");
    expect(manifest.families).toHaveLength(2);
    expect(manifest.aliases).toEqual([{ family: "Excalidraw", target: "Excalifont" }]);
  });

  it("refuses a face naming a file the archive does not contain", () => {
    expect(() => readPackManifest(validManifestJson(), new Set(["licenses/excalifont.txt"]))).toThrow(FontPackManifestError);
  });

  it("refuses an alias pointing at a family the pack does not carry", () => {
    const json = { ...validManifestJson() as Record<string, unknown>, aliases: [{ family: "Calibri", target: "Nowhere" }] };
    expect(() => readPackManifest(json, validEntryNames)).toThrow(FontPackManifestError);
  });

  it("refuses an unsafe font family", () => {
    const json = validManifestJson() as { families: unknown[] };
    json.families = [{ family: "url(evil)", faces: [{ style: "normal", weight: "400", file: "fonts/x.woff2" }] }];
    expect(() => readPackManifest(json, validEntryNames)).toThrow(FontPackManifestError);
  });

  it("refuses a weight outside 100..900 in steps of 100", () => {
    const json = validManifestJson() as { families: { faces: Record<string, unknown>[] }[] };
    json.families[0]!.faces[0]!.weight = "450";
    expect(() => readPackManifest(json, validEntryNames)).toThrow(FontPackManifestError);
  });

  it("refuses an unparsable unicode-range list", () => {
    const json = validManifestJson() as { families: { faces: Record<string, unknown>[] }[] };
    json.families[0]!.faces[0]!.unicodeRange = "not a range";
    expect(() => readPackManifest(json, validEntryNames)).toThrow(FontPackManifestError);
  });

  it("accepts a unicode-range list with Google Fonts' own space after each comma", () => {
    const json = validManifestJson() as { families: { faces: Record<string, unknown>[] }[] };
    json.families[0]!.faces[0]!.unicodeRange = "U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F";
    expect(() => readPackManifest(json, validEntryNames)).not.toThrow();
  });

  it("refuses anything but schema 1", () => {
    expect(() => readPackManifest({ ...validManifestJson() as Record<string, unknown>, schema: 2 }, validEntryNames)).toThrow(FontPackManifestError);
  });
});

describe("readInstalledPackManifest", () => {
  it("validates the same shape, without checking files against an archive that no longer exists", () => {
    expect(readInstalledPackManifest(validManifestJson())?.id).toBe("excalidraw");
  });

  it("returns undefined, rather than throwing, for something that is not a manifest", () => {
    expect(readInstalledPackManifest("not json")).toBeUndefined();
    expect(readInstalledPackManifest({ schema: 2 })).toBeUndefined();
  });
});

// --- @font-face rules ---------------------------------------------------------------------

describe("packFontFaceRules", () => {
  const manifest: FontPackManifest = readPackManifest(validManifestJson(), validEntryNames);

  it("writes one rule per face of every family the pack carries", () => {
    const rules = packFontFaceRules(manifest, (file) => `app://local/${file}`);
    expect(rules).toContain(
      '@font-face { font-family: "Excalifont"; src: url("app://local/fonts/excalifont.woff2") format("woff2"); font-style: normal; font-weight: 400; font-display: swap; }',
    );
    expect(rules).toContain(
      '@font-face { font-family: "Nunito"; src: url("app://local/fonts/nunito.woff2") format("woff2"); font-style: normal; font-weight: 400; unicode-range: U+20-7e,U+a0-a3; font-display: swap; }',
    );
  });

  it("gives an alias's rule the system's own font first, the pack's stand-in second", () => {
    const rules = packFontFaceRules(manifest, (file) => `app://local/${file}`);
    expect(rules).toContain(
      '@font-face { font-family: "Excalidraw"; src: local("Excalidraw"), url("app://local/fonts/excalifont.woff2") format("woff2"); font-style: normal; font-weight: 400; font-display: swap; }',
    );
  });
});

describe("customFontFaceRule", () => {
  it("maps a file's extension to its CSS format", () => {
    expect(customFontFormat("My Font.ttf")).toBe("truetype");
    expect(customFontFormat("My Font.OTF")).toBe("opentype");
    expect(customFontFormat("My Font.woff")).toBe("woff");
    expect(customFontFormat("My Font.woff2")).toBe("woff2");
    expect(customFontFormat("My Font.exe")).toBeUndefined();
  });

  it("builds a rule for a supported file, and nothing for an unsupported one", () => {
    expect(customFontFaceRule("My Font", "app://local/fonts/custom/my-font.woff2", "my-font.woff2")).toBe(
      '@font-face { font-family: "My Font"; src: url("app://local/fonts/custom/my-font.woff2") format("woff2"); font-display: swap; }',
    );
    expect(customFontFaceRule("My Font", "app://local/x", "my-font.exe")).toBeUndefined();
  });
});

// --- FontFaceRegistry: one <style> per window, rebuilt through the CSSOM -------------------

class FakeDeclaration {
  readonly props = new Map<string, string>();
  setProperty(name: string, value: string): void {
    this.props.set(name, value);
  }
}

class FakeSheet {
  cssRules: { selectorText: string; style: FakeDeclaration }[] = [];
  insertRule(ruleText: string, index: number): number {
    if (!/^@font-face \{.*\}$/u.test(ruleText)) {
      throw new Error("not a single valid rule");
    }
    this.cssRules.splice(index, 0, { selectorText: "@font-face", style: new FakeDeclaration() });
    return index;
  }
  deleteRule(index: number): void {
    this.cssRules.splice(index, 1);
  }
}

class FakeStyleElement {
  readonly sheet = new FakeSheet();
  removed = false;
  private readonly attributes = new Map<string, string>();
  setAttribute(key: string, value: string): void {
    this.attributes.set(key, value);
  }
  remove(): void {
    this.removed = true;
  }
}

class FakeHead {
  readonly children: FakeStyleElement[] = [];
  appendChild(element: FakeStyleElement): FakeStyleElement {
    this.children.push(element);
    return element;
  }
}

class FakeDocument {
  readonly head = new FakeHead();
  createElement(tag: string): FakeStyleElement {
    if (tag !== "style") throw new Error(`unexpected tag: ${tag}`);
    return new FakeStyleElement();
  }
}

/** Every pending microtask (and the one macrotask turn `setTimeout` needs) runs before this resolves. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** A reader that records every path it was asked for and returns a few harmless bytes. */
function fakeReader(): { readFile: (path: string) => Promise<ArrayBuffer>; calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    readFile: async (path) => {
      calls.push(path);
      return new Uint8Array([1, 2, 3, 4]).buffer;
    },
  };
}

const EXCALIFONT_PACK = {
  id: "excalidraw",
  dir: "fonts/excalidraw",
  families: [
    { family: "Excalifont", faces: [{ style: "normal" as const, weight: "400", file: "fonts/excalifont.woff2" }] },
    { family: "Nunito", faces: [{ style: "normal" as const, weight: "400", file: "fonts/nunito.woff2" }] },
  ],
  aliases: [{ family: "Excalidraw", target: "Excalifont" }],
};

describe("FontFaceRegistry", () => {
  it("reads and inserts nothing merely from being configured", async () => {
    const registry = new FontFaceRegistry();
    const { readFile, calls } = fakeReader();
    registry.setFileReader(readFile);
    const doc = new FakeDocument();
    registry.attach(doc as unknown as Document);
    registry.configure([EXCALIFONT_PACK], [], "fonts/custom");
    await flush();
    expect(calls).toEqual([]);
    expect(registry.facesRead).toBe(0);
    expect(doc.head.children[0]!.sheet.cssRules).toHaveLength(0);
  });

  it("reads a wanted family's faces once, even when it is wanted again", async () => {
    const registry = new FontFaceRegistry();
    const { readFile, calls } = fakeReader();
    registry.setFileReader(readFile);
    const doc = new FakeDocument();
    registry.attach(doc as unknown as Document);
    registry.configure([EXCALIFONT_PACK], [], "fonts/custom");

    registry.want(["Excalifont"]);
    registry.want(["Excalifont"]); // coalesced: still one read, not two
    await flush();
    expect(calls).toEqual(["fonts/excalidraw/fonts/excalifont.woff2"]);
    expect(registry.facesRead).toBe(1);
    expect(doc.head.children[0]!.sheet.cssRules).toHaveLength(1);

    registry.want(["Excalifont"]);
    await flush();
    expect(calls).toHaveLength(1); // already loaded: no second read
  });

  it("shares one read when a family is wanted again while its first load is still in flight", async () => {
    const registry = new FontFaceRegistry();
    const calls: string[] = [];
    let release: (() => void) | undefined;
    registry.setFileReader(async (path) => {
      calls.push(path);
      await new Promise<void>((resolve) => { release = resolve; });
      return new Uint8Array([1, 2, 3, 4]).buffer;
    });
    registry.configure([EXCALIFONT_PACK], [], "fonts/custom");

    registry.want(["Excalifont"]);
    await Promise.resolve();
    await Promise.resolve(); // the flush has started the read; it has not resolved yet
    expect(calls).toHaveLength(1);

    registry.want(["Excalifont"]); // wanted again mid-load: must not start a second read
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toHaveLength(1);

    release?.();
    await flush();
    expect(calls).toEqual(["fonts/excalidraw/fonts/excalifont.woff2"]); // read exactly once, start to finish
  });

  it("pulls in an alias's target to build its own rule, reusing the same bytes", async () => {
    const registry = new FontFaceRegistry();
    const { readFile, calls } = fakeReader();
    registry.setFileReader(readFile);
    const doc = new FakeDocument();
    registry.attach(doc as unknown as Document);
    registry.configure([EXCALIFONT_PACK], [], "fonts/custom");

    registry.want(["Excalidraw"]); // the alias, not the family it targets
    await flush();
    expect(calls).toEqual(["fonts/excalidraw/fonts/excalifont.woff2"]);
    // Two rules now exist - the target's own, and the alias's - from one read.
    expect(doc.head.children[0]!.sheet.cssRules).toHaveLength(2);
  });

  it("does nothing for a family it does not know, and costs nothing for an empty want", async () => {
    const registry = new FontFaceRegistry();
    const { readFile, calls } = fakeReader();
    registry.setFileReader(readFile);
    registry.configure([EXCALIFONT_PACK], [], "fonts/custom");
    registry.want(["Nowhere"]);
    registry.want([]);
    await flush();
    expect(calls).toEqual([]);
  });

  it("reads a custom font's own file, with no restriction baked into its rule", async () => {
    const registry = new FontFaceRegistry();
    const { readFile, calls } = fakeReader();
    registry.setFileReader(readFile);
    const doc = new FakeDocument();
    registry.attach(doc as unknown as Document);
    registry.configure([], [{ family: "My Font", file: "my-font.woff2" }], "fonts/custom");
    registry.want(["My Font"]);
    await flush();
    expect(calls).toEqual(["fonts/custom/my-font.woff2"]);
    expect(doc.head.children[0]!.sheet.cssRules).toHaveLength(1);
  });

  it("revokes a family's blob and drops its rule when its pack is removed", async () => {
    const registry = new FontFaceRegistry();
    const { readFile } = fakeReader();
    registry.setFileReader(readFile);
    const doc = new FakeDocument();
    registry.attach(doc as unknown as Document);
    registry.configure([EXCALIFONT_PACK], [], "fonts/custom");
    registry.want(["Excalidraw"]); // loads both the target and the alias
    await flush();
    expect(doc.head.children[0]!.sheet.cssRules).toHaveLength(2);

    const revoked: string[] = [];
    const originalRevoke = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = (url: string) => { revoked.push(url); originalRevoke(url); };
    try {
      registry.configure([], [], "fonts/custom"); // the pack is gone
    } finally {
      URL.revokeObjectURL = originalRevoke;
    }
    expect(revoked).toHaveLength(1); // one blob backed both rules
    expect(doc.head.children[0]!.sheet.cssRules).toHaveLength(0);

    // Asking again reads it fresh: nothing of the removed pack survives.
    registry.configure([EXCALIFONT_PACK], [], "fonts/custom");
    registry.want(["Excalifont"]);
    await flush();
    expect(doc.head.children[0]!.sheet.cssRules).toHaveLength(1);
  });

  it("revokes a renamed custom font's old name and lets the new one load fresh", async () => {
    const registry = new FontFaceRegistry();
    const { readFile, calls } = fakeReader();
    registry.setFileReader(readFile);
    const doc = new FakeDocument();
    registry.attach(doc as unknown as Document);
    registry.configure([], [{ family: "Old Name", file: "my-font.woff2" }], "fonts/custom");
    registry.want(["Old Name"]);
    await flush();
    expect(doc.head.children[0]!.sheet.cssRules).toHaveLength(1);

    registry.configure([], [{ family: "New Name", file: "my-font.woff2" }], "fonts/custom");
    expect(doc.head.children[0]!.sheet.cssRules).toHaveLength(0);
    registry.want(["New Name"]);
    await flush();
    expect(doc.head.children[0]!.sheet.cssRules).toHaveLength(1);
    expect(calls).toEqual(["fonts/custom/my-font.woff2", "fonts/custom/my-font.woff2"]);
  });

  it("skips a rule the browser's own parser would refuse, rather than applying it raw", async () => {
    const registry = new FontFaceRegistry();
    const { readFile } = fakeReader();
    registry.setFileReader(readFile);
    const doc = new FakeDocument();
    registry.attach(doc as unknown as Document);
    // A custom font whose family name is invalid at the CSS level would
    // make `customFontFaceRule`'s text malformed; simulate that refusal
    // directly against a known-bad rule through the same paint path by
    // wanting a family whose file extension customFontFaceRule refuses.
    registry.configure([], [{ family: "My Font", file: "my-font.exe" }], "fonts/custom");
    registry.want(["My Font"]);
    await flush();
    expect(doc.head.children[0]!.sheet.cssRules).toHaveLength(0);
  });

  it("paints an already-loaded family's rules into a window attached later", async () => {
    const registry = new FontFaceRegistry();
    const { readFile } = fakeReader();
    registry.setFileReader(readFile);
    const main = new FakeDocument();
    registry.attach(main as unknown as Document);
    registry.configure([EXCALIFONT_PACK], [], "fonts/custom");
    registry.want(["Excalifont"]);
    await flush();

    const popout = new FakeDocument();
    registry.attach(popout as unknown as Document);
    expect(popout.head.children[0]!.sheet.cssRules).toHaveLength(1);
  });

  it("removes its style element from a window on detach, and revokes every blob on dispose", async () => {
    const registry = new FontFaceRegistry();
    const { readFile } = fakeReader();
    registry.setFileReader(readFile);
    const doc = new FakeDocument();
    registry.attach(doc as unknown as Document);
    registry.configure([EXCALIFONT_PACK], [], "fonts/custom");
    registry.want(["Excalifont"]);
    await flush();
    const style = doc.head.children[0]!;
    registry.detach(doc as unknown as Document);
    expect(style.removed).toBe(true);

    const another = new FakeDocument();
    registry.attach(another as unknown as Document);
    const revoked: string[] = [];
    const originalRevoke = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = (url: string) => { revoked.push(url); originalRevoke(url); };
    try {
      registry.dispose();
    } finally {
      URL.revokeObjectURL = originalRevoke;
    }
    expect(another.head.children[0]!.removed).toBe(true);
    expect(revoked).toHaveLength(1);
  });
});

describe("fontPackDownloadUrl", () => {
  it("starts from the real release by default, and only from a harness's own test override", () => {
    expect(fontPackDownloadUrl("fonts-word.zip")).toBe(
      "https://github.com/NixWrk/Obsidian-Plugin---Miro-Canvas/releases/download/fonts-0.0.3/fonts-word.zip",
    );
    const testGlobal = globalThis as { __miroCanvasFontPacksTestBaseUrl?: string };
    testGlobal.__miroCanvasFontPacksTestBaseUrl = "http://127.0.0.1:8199/";
    try {
      expect(fontPackDownloadUrl("fonts-word.zip")).toBe("http://127.0.0.1:8199/fonts-word.zip");
    } finally {
      delete testGlobal.__miroCanvasFontPacksTestBaseUrl;
    }
  });
});

// --- Downloading a pack --------------------------------------------------------------------

function sha256Hex(data: ArrayBuffer): string {
  return createHash("sha256").update(Buffer.from(data)).digest("hex");
}

async function nodeDigest(data: ArrayBuffer): Promise<ArrayBuffer> {
  return createHash("sha256").update(Buffer.from(data)).digest().buffer;
}

function buildValidPackZip(): Uint8Array {
  const manifest = validManifestJson();
  return buildStoredZip([
    { name: "pack.json", data: text(JSON.stringify(manifest)) },
    { name: "fonts/excalifont.woff2", data: new Uint8Array([1, 2, 3]) },
    { name: "fonts/nunito.woff2", data: new Uint8Array([4, 5, 6]) },
    { name: "licenses/excalifont.txt", data: text("licence text") },
  ]);
}

function recordingWriter(): { writer: Parameters<typeof downloadFontPack>[1]["writer"]; written: Map<string, ArrayBuffer | string> } {
  const written = new Map<string, ArrayBuffer | string>();
  return {
    written,
    writer: {
      mkdir: async () => undefined,
      writeBinary: async (path, data) => { written.set(path, data); },
      write: async (path, data) => { written.set(path, data); },
    },
  };
}

describe("downloadFontPack", () => {
  it("downloads, verifies and unpacks a matching archive", async () => {
    const zip = buildValidPackZip();
    const arrayBuffer = zip.slice().buffer as ArrayBuffer;
    const entry = { id: "excalidraw", file: "fonts-excalidraw.zip", sha256: sha256Hex(arrayBuffer) };
    const { writer, written } = recordingWriter();
    const manifest = await downloadFontPack(entry, {
      fetch: async (url) => {
        expect(url).toBe(fontPackDownloadUrl("fonts-excalidraw.zip"));
        return { status: 200, arrayBuffer };
      },
      digest: nodeDigest,
      writer,
    }, "fonts/excalidraw");
    expect(manifest.id).toBe("excalidraw");
    expect(written.has("fonts/excalidraw/pack.json")).toBe(true);
    expect(written.has("fonts/excalidraw/fonts/excalifont.woff2")).toBe(true);
    expect(written.has("fonts/excalidraw/licenses/excalifont.txt")).toBe(true);
  });

  it("says plainly that the pack is not published yet on a 404, rather than raising a raw error", async () => {
    const { writer } = recordingWriter();
    const promise = downloadFontPack({ id: "excalidraw", file: "fonts-excalidraw.zip", sha256: "0".repeat(64) }, {
      fetch: async () => ({ status: 404, arrayBuffer: new ArrayBuffer(0) }),
      digest: nodeDigest,
      writer,
    }, "fonts/excalidraw");
    await expect(promise).rejects.toMatchObject({ reason: "not-published" });
    await expect(promise).rejects.toBeInstanceOf(FontPackDownloadError);
  });

  it("refuses a download that does not match the published checksum", async () => {
    const zip = buildValidPackZip();
    const arrayBuffer = zip.slice().buffer as ArrayBuffer;
    const { writer } = recordingWriter();
    const promise = downloadFontPack({ id: "excalidraw", file: "fonts-excalidraw.zip", sha256: "0".repeat(64) }, {
      fetch: async () => ({ status: 200, arrayBuffer }),
      digest: nodeDigest,
      writer,
    }, "fonts/excalidraw");
    await expect(promise).rejects.toMatchObject({ reason: "integrity" });
  });

  it("refuses an archive whose id does not match the catalogue entry it was fetched for", async () => {
    const zip = buildValidPackZip();
    const arrayBuffer = zip.slice().buffer as ArrayBuffer;
    const { writer } = recordingWriter();
    const promise = downloadFontPack({ id: "word", file: "fonts-word.zip", sha256: sha256Hex(arrayBuffer) }, {
      fetch: async () => ({ status: 200, arrayBuffer }),
      digest: nodeDigest,
      writer,
    }, "fonts/word");
    await expect(promise).rejects.toMatchObject({ reason: "invalid" });
  });
});
