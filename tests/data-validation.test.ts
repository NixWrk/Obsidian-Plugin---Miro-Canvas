import { describe, expect, it } from "vitest";
import { readCanvasElementId } from "../src/canvas-elements";
import { normalizeAnchor } from "../src/anchors";
import { sanitizeAttachmentLabel } from "../src/attachment-labels";
import { describeLocalDocument, localDocumentPath } from "../src/document-viewer";
import { listCommentThreads } from "../src/local-comments";
import { validateMiroCanvasMetadata } from "../src/metadata";
import { normalizeSettings } from "../src/settings";
import { storeDeviceFiles } from "../src/device-files";

describe("data validators retain their distinct character policies", () => {
  it("keeps C1 in native IDs while excluding raw C0/DEL and untrimmed IDs", () => {
    expect(readCanvasElementId({ id: "a\u0080b" })).toBe("a\u0080b");
    for (const id of ["a\u007fb", "a\u0000b", "\ta\n", "a "]) expect(readCanvasElementId({ id })).toBeUndefined();
    const input = { type: "free", x: 1, y: 2, "a\u0080b": { nested: [1] }, "a\u0000b": "unsafe" };
    expect(normalizeAnchor(input).anchor).toEqual({ type: "free", x: 1, y: 2, "a\u0080b": { nested: [1] } });
    expect(input["a\u0000b"]).toBe("unsafe");
  });

  it("keeps the attachment profile's deliberate format-character near misses", () => {
    expect(sanitizeAttachmentLabel("a\u200db\u2065c")).toBe("a\u200db\u2065c");
    for (const value of ["a\u0080b", "a\u200cb", "a\u2064b", "a\u2066b", "a\u2028b"]) expect(sanitizeAttachmentLabel(value)).toBeUndefined();
    expect(sanitizeAttachmentLabel(" e\u0301 ")).toBe("é");
    expect(sanitizeAttachmentLabel("a\ud800b")).toBeUndefined();
  });

  it("keeps path protection separate from document-fragment validation", () => {
    for (const path of ["../file.md", "a%2ffile.md", "https://x", "a\u007f.md", "a\u0000.md"]) expect(localDocumentPath(path)).toBeNull();
    expect(localDocumentPath("a\u0080.md")).toBe("a\u0080.md");
    expect(describeLocalDocument("file.md", { subpath: "#a\u0080" })?.subpath).toBe("#a\u0080");
    for (const subpath of ["#a<", "#a>", " #a", "#a\n", "#a\u007f", "#a" + "x".repeat(1023)]) expect(describeLocalDocument("file.md", { subpath })?.subpath).toBeUndefined();
    expect(describeLocalDocument("file.pdf", { subpath: "#page=9999999", fit: "width" })).toMatchObject({ page: 1000000, fit: "width", subpath: "#page=1000000" });
  });

  it("counts font filename codepoints after caller trimming and retains DEL/C1", () => {
    const fonts = (file: string) => normalizeSettings({ customFonts: [{ family: "Test", file }] }).customFonts;
    expect(fonts(" 🌿".trim() + "🌿".repeat(179))).toHaveLength(1);
    expect(fonts("🌿".repeat(181))).toHaveLength(0);
    expect(fonts(" file\u007f\u0080.woff ")[0]?.file).toBe("file\u007f\u0080.woff");
    for (const file of [".", "..", "file/name.woff", "file\u0000.woff", "file:name.woff"]) expect(fonts(file)).toHaveLength(0);
  });

  it("distinguishes trimmed display names from raw metadata author aliases", () => {
    const name = "\tPerson\n";
    const input = { miroSource: { future: [1], comments: [{ id: "a", text: "Hello", author: { name: "Original" } }] }, miroCanvas: { schemaVersion: 1,
      localComments: [],
      commentAuthorNames: { "imported:a": { a: name } },
    } };
    const before = structuredClone(input);
    expect(listCommentThreads(input)[0]?.author?.name).toBe("Person");
    expect(validateMiroCanvasMetadata(input.miroCanvas).valid).toBe(false);
    input.miroCanvas.commentAuthorNames["imported:a"].a = "Person\u0080";
    expect(validateMiroCanvasMetadata(input.miroCanvas).valid).toBe(true);
    expect(before.miroCanvas.commentAuthorNames["imported:a"].a).toBe(name);
    expect(input.miroSource).toEqual(before.miroSource);
  });

  it("sanitizes device filenames before reading bytes, preserving callback order and DEL", async () => {
    const calls: unknown[] = [];
    const bytes = new ArrayBuffer(3);
    const name = "..a/\u0000:b?\u007f.bin ";
    const result = await storeDeviceFiles([{ name, async arrayBuffer() { calls.push("bytes"); return bytes; } }], {
      async availablePath(value) { calls.push(["path", value]); return `assets/${value}`; },
      async createBinary(path, value) { calls.push(["create", path, value]); return path; },
    });
    expect(result).toEqual(["assets/_a___b_\u007f.bin"]);
    expect(calls).toEqual(["bytes", ["path", "_a___b_\u007f.bin"], ["create", "assets/_a___b_\u007f.bin", bytes]]);
    expect(name).toBe("..a/\u0000:b?\u007f.bin ");
  });
});
