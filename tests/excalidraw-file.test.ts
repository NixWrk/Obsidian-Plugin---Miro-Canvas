import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { readExcalidrawFile, type ExcalidrawFile, type ExcalidrawReadResult } from "../src/importers/excalidraw-file";
import { compressToBase64 } from "./helpers/lz-string-compress";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "import", "excalidraw");

const PICTURE = "4f2a8c1e9b7d3a6f5e0c2b8d1a9f7e3c6b5d4a2e";
const FORMULA = "9c3e7a1f5b2d8e4a6c0f3b7d9e1a5c8f2b6d4e0a";
const LOGO = "1d7b3f9a5e2c8d4b6a0e7c3f9b1d5a8e2c6f4b0d";

function fixture(name: string): string {
  return readFileSync(join(FIXTURES, name), "utf8");
}

function expectFile(result: ExcalidrawReadResult): ExcalidrawFile {
  if (!result.ok) throw new Error(`expected a drawing, got ${result.error.code}: ${result.error.detail}`);
  return result.file;
}

function expectError(result: ExcalidrawReadResult): string {
  if (result.ok) throw new Error("expected an error, got a drawing");
  return result.error.code;
}

/** The text of the note's drawing fence, as the file has it. */
function drawingFenceBody(note: string): string {
  const normalized = note.replace(/\r\n/g, "\n");
  const match = /## Drawing\n```(?:compressed-json|json)\n([\s\S]*?)\n```/.exec(normalized);
  if (match === null) throw new Error("fixture has no drawing fence");
  return match[1]!;
}

/** A small note in the plugin's layout around the given scene JSON. */
function pluginNote(sceneJson: string, data = "# Excalidraw Data\n\n## Text Elements\n"): string {
  return [
    "---",
    "",
    "excalidraw-plugin: parsed",
    "tags: [excalidraw]",
    "",
    "---",
    "==⚠  Switch to EXCALIDRAW VIEW in the MORE OPTIONS menu of this document. ⚠==",
    "",
    "",
    data,
    "%%",
    "## Drawing",
    "```json",
    sceneJson,
    "```",
    "%%",
    "",
  ].join("\n");
}

const EMPTY_SCENE = JSON.stringify({ type: "excalidraw", version: 2, source: "https://excalidraw.com", elements: [] });

describe("readExcalidrawFile: the plugin's Markdown note", () => {
  it("reads a note whose drawing is plain JSON", () => {
    const note = fixture("plugin-json.excalidraw.md");
    const file = expectFile(readExcalidrawFile(note));

    expect(file.container).toBe("markdown");
    expect(file.encoding).toBe("json");
    expect(file.pluginMode).toBe("parsed");
    expect(file.pluginVersion).toBe("2.1.4");
    expect(file.formatVersion).toBe("2");
    // The scene is kept exactly as the file has it, every field included.
    expect(file.scene).toEqual(JSON.parse(drawingFenceBody(note)));
    expect(file.scene.elements).toHaveLength(7);
  });

  it("takes each text element's raw Markdown, wikilinks and blank lines included", () => {
    const file = expectFile(readExcalidrawFile(fixture("plugin-json.excalidraw.md")));
    expect([...file.texts.entries()]).toEqual([
      ["Xk3pQ9aB", "See [[Project plan]]"],
      ["Tq7mZ2cD", "# Launch\n\nIdeas for the launch\n- faster onboarding"],
    ]);
  });

  it("reads where each embedded picture, formula and web image comes from", () => {
    const file = expectFile(readExcalidrawFile(fixture("plugin-json.excalidraw.md")));
    expect(file.embeds.get(PICTURE)).toEqual({
      kind: "link",
      link: "Attachments/diagram.png",
      raw: "[[Attachments/diagram.png]]",
    });
    expect(file.embeds.get(FORMULA)).toEqual({ kind: "tex", tex: "E = mc^2", raw: "$$E = mc^2$$" });
    expect(file.embeds.get(LOGO)).toEqual({
      kind: "url",
      url: "https://example.com/logo.png",
      raw: "https://example.com/logo.png",
    });
    // Element links are a section of their own, not embedded files.
    expect(file.embeds.has("r8Hc2LmQ")).toBe(false);
    expect(file.embeds.size).toBe(3);
  });

  it("reads the compressed note as the same drawing", () => {
    const plain = expectFile(readExcalidrawFile(fixture("plugin-json.excalidraw.md")));
    const compressed = expectFile(readExcalidrawFile(fixture("plugin-compressed.excalidraw.md")));

    expect(compressed.encoding).toBe("compressed-json");
    expect(compressed.container).toBe("markdown");
    expect(compressed.pluginMode).toBe("parsed");
    expect(compressed.pluginVersion).toBe("2.1.4");
    expect(compressed.scene).toEqual(plain.scene);
    expect(compressed.texts).toEqual(plain.texts);
    expect(compressed.embeds).toEqual(plain.embeds);
  });

  it("keeps the compressed fixture in step with the plain one", () => {
    // The plugin packs the scene with LZ-string and breaks it into 256-character chunks.
    const sceneJson = drawingFenceBody(fixture("plugin-json.excalidraw.md"));
    const packed = compressToBase64(sceneJson);
    const chunks: string[] = [];
    for (let index = 0; index < packed.length; index += 256) {
      chunks.push(packed.slice(index, index + 256));
    }
    expect(drawingFenceBody(fixture("plugin-compressed.excalidraw.md"))).toBe(chunks.join("\n\n"));
  });

  it("reads a note saved with Windows line endings and a byte-order mark the same way", () => {
    const note = fixture("plugin-compressed.excalidraw.md");
    const windows = "\uFEFF" + note.replace(/\r?\n/g, "\r\n");
    const original = expectFile(readExcalidrawFile(note));
    const converted = expectFile(readExcalidrawFile(windows));
    expect(converted.scene).toEqual(original.scene);
    expect(converted.texts).toEqual(original.texts);
    expect(converted.embeds).toEqual(original.embeds);
    expect(converted.pluginMode).toBe("parsed");
  });

  it("reads the older layout with first-level headings", () => {
    const note = [
      "---",
      "excalidraw-plugin: raw",
      "---",
      "",
      "# Text Elements",
      "Hello ^abcd1234",
      "",
      "%%",
      "# Drawing",
      "```json",
      EMPTY_SCENE,
      "```",
      "%%",
    ].join("\n");
    const file = expectFile(readExcalidrawFile(note));
    expect(file.pluginMode).toBe("raw");
    expect([...file.texts]).toEqual([["abcd1234", "Hello"]]);
    expect(file.embeds.size).toBe(0);
  });

  it("looks for the drawing's sections only below the plugin's data heading, and takes the last drawing", () => {
    const decoy = JSON.stringify({ type: "excalidraw", version: 1, elements: [{ id: "decoy" }] });
    const userNotes = [
      "## Text Elements",
      "not a drawing text ^zzzzzzzz",
      "",
      "## Drawing",
      "```json",
      decoy,
      "```",
      "",
    ].join("\n");
    const note = pluginNote(EMPTY_SCENE, userNotes + "\n# Excalidraw Data\n\n## Text Elements\nReal ^realText\n");
    const file = expectFile(readExcalidrawFile(note));
    expect(file.scene.elements).toEqual([]);
    expect([...file.texts]).toEqual([["realText", "Real"]]);
  });

  it("ends a text element at its anchor and ignores a trailing text without one", () => {
    const data = [
      "# Excalidraw Data",
      "",
      "## Text Elements",
      "first ^first001",
      "",
      "",
      "second line one",
      "second line two ^second02",
      "",
      "left without an anchor",
      "",
      "## Embedded Files",
    ].join("\n");
    const file = expectFile(readExcalidrawFile(pluginNote(EMPTY_SCENE, data)));
    expect([...file.texts]).toEqual([
      ["first001", "first"],
      ["second02", "second line one\nsecond line two"],
    ]);
  });

  it("reads every form an embedded file line takes", () => {
    const data = [
      "# Excalidraw Data",
      "",
      "## Text Elements",
      "",
      "## Embedded Files",
      "sized: [[pic.png|200]]",
      "",
      "recolored: [[icon.svg]] {\"#000000\":\"#ff0000\"}",
      "",
      "banged: ![[scan.pdf#page=2]]",
      "",
      "formula: $$\\begin{aligned}",
      "a &= b \\\\",
      "c &= d",
      "\\end{aligned}$$",
      "",
      "strange: something else",
      "",
    ].join("\n");
    const file = expectFile(readExcalidrawFile(pluginNote(EMPTY_SCENE, data)));
    expect(file.embeds.get("sized")).toEqual({ kind: "link", link: "pic.png", display: "200", raw: "[[pic.png|200]]" });
    expect(file.embeds.get("recolored")).toEqual({
      kind: "link",
      link: "icon.svg",
      rest: "{\"#000000\":\"#ff0000\"}",
      raw: "[[icon.svg]] {\"#000000\":\"#ff0000\"}",
    });
    expect(file.embeds.get("banged")).toMatchObject({ kind: "link", link: "scan.pdf#page=2" });
    expect(file.embeds.get("formula")).toMatchObject({
      kind: "tex",
      tex: "\\begin{aligned}\na &= b \\\\\nc &= d\n\\end{aligned}",
    });
    expect(file.embeds.get("strange")).toEqual({ kind: "unknown", raw: "something else" });
  });

  it("has no plugin mode when the note has no frontmatter", () => {
    const note = pluginNote(EMPTY_SCENE).replace(/^---[\s\S]*?---\n/, "");
    const file = expectFile(readExcalidrawFile(note));
    expect(file.pluginMode).toBeUndefined();
    expect(file.pluginVersion).toBeUndefined();
  });
});

describe("readExcalidrawFile: a plain .excalidraw scene", () => {
  it("reads the scene excalidraw.com saves, pictures kept as they are", () => {
    const scene = {
      type: "excalidraw",
      version: 2,
      source: "https://excalidraw.com",
      elements: [{ id: "e1", type: "rectangle", x: 1, y: 2, width: 3, height: 4, customField: { kept: true } }],
      appState: { viewBackgroundColor: "#ffffff" },
      files: { f1: { id: "f1", mimeType: "image/png", dataURL: "data:image/png;base64,iVBORw0KGgo=" } },
    };
    const file = expectFile(readExcalidrawFile("\n  " + JSON.stringify(scene, null, 2)));
    expect(file.container).toBe("json");
    expect(file.encoding).toBe("json");
    expect(file.formatVersion).toBe("2");
    expect(file.pluginMode).toBeUndefined();
    expect(file.pluginVersion).toBeUndefined();
    expect(file.scene).toEqual(scene);
    expect(file.texts.size).toBe(0);
    expect(file.embeds.size).toBe(0);
  });

  it("says the version is unknown when the scene does not give one", () => {
    const file = expectFile(readExcalidrawFile(JSON.stringify({ type: "excalidraw", elements: [] })));
    expect(file.formatVersion).toBe("unknown");
  });
});

describe("readExcalidrawFile: files that are not drawings", () => {
  it("names a note with no drawing fence", () => {
    expect(expectError(readExcalidrawFile("# Just a note\n\nNothing drawn here.\n"))).toBe("no-drawing");
  });

  it("names a compressed block that does not unpack", () => {
    const note = pluginNote(EMPTY_SCENE).replace("```json\n" + EMPTY_SCENE, "```compressed-json\nnot*base64");
    expect(expectError(readExcalidrawFile(note))).toBe("decompress-failed");
  });

  it("names a drawing that is not JSON", () => {
    expect(expectError(readExcalidrawFile(pluginNote("{ broken")))).toBe("invalid-json");
    expect(expectError(readExcalidrawFile("{ broken"))).toBe("invalid-json");
  });

  it("names JSON that is not an Excalidraw scene", () => {
    expect(expectError(readExcalidrawFile(pluginNote(JSON.stringify({ type: "other", elements: [] }))))).toBe("not-a-scene");
    expect(expectError(readExcalidrawFile(JSON.stringify({ type: "excalidraw", elements: {} })))).toBe("not-a-scene");
    expect(expectError(readExcalidrawFile(pluginNote("[1, 2]")))).toBe("not-a-scene");
  });
});
