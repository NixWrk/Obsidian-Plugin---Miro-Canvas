import { afterEach, describe, expect, it, vi } from "vitest";
import { extractBoardKnowledge } from "../src/board-knowledge";
import { prepareBoardMetadataRename } from "../src/board-metadata-maintenance";
import { MetadataWriter } from "../src/metadata-writer";

type Data = Record<string, unknown>;
function fixture() {
  const document = { nodes: [
    { id: "text", type: "text", text: "[[Old.canvas#node-a]]", x: 0, y: 0, width: 100, height: 100, unknown: { keep: true } },
    { id: "file", type: "file", file: "Old.canvas", subpath: "#node-a", x: 100, y: 0, width: 100, height: 100 },
  ], edges: [{ id: "line", fromNode: "text", toNode: "file", unknown: { keep: true } }],
    miroCanvas: { schemaVersion: 1, properties: { related: "[[Old.canvas#node-a|Card]]", unknown: { keep: true } },
      nodeRedirects: { a: { file: "Old.canvas", nodeId: "a", unknown: { keep: true } } }, futureOwn: { keep: true } },
    miroSource: { untouched: { value: "Old.canvas" } }, futureRoot: { keep: true } };
  const preRename = extractBoardKnowledge(document)!;
  preRename.frontmatterLinks[0].resolvedPath = "Old.canvas";
  const options = { sourcePath: "Board.canvas", oldPath: "Old.canvas", newPath: "New.canvas", preRename };
  return { document, source: JSON.stringify(document, null, 2) + "\r\n", options };
}
afterEach(() => vi.restoreAllMocks());

describe("closed-board metadata maintenance preparation", () => {
  it("uses the real MetadataWriter to prepare only properties and redirects", () => {
    const h = fixture();
    const write = vi.spyOn(MetadataWriter.prototype, "write");
    const result = prepareBoardMetadataRename(h.source, h.options);
    expect(result.status).toBe("prepared");
    if (result.status !== "prepared") throw new Error(result.status);
    expect(write).toHaveBeenCalledOnce();
    expect(result.writer).toMatchObject({ ok: true, status: "applied" });
    expect(result.expectedSource).toBe(h.source);
    expect((result.document.miroCanvas as Data).properties).toEqual({ related: "[[New.canvas#node-a|Card]]", unknown: { keep: true } });
    expect((result.document.miroCanvas as Data).nodeRedirects).toEqual({ a: { file: "New.canvas", nodeId: "a", unknown: { keep: true } } });
    expect(result.document.nodes).toEqual(h.document.nodes);
    expect(result.document.edges).toEqual(h.document.edges);
    expect(result.document.miroSource).toEqual(h.document.miroSource);
    expect(result.document.futureRoot).toEqual(h.document.futureRoot);
    expect((result.document.miroCanvas as Data).futureOwn).toEqual({ keep: true });
    expect(h.options.preRename.frontmatterLinks[0].resolvedPath).toBe("Old.canvas");
  });

  it("returns a detached document and an exact source-byte CAS token", () => {
    const h = fixture();
    const result = prepareBoardMetadataRename(h.source, h.options);
    if (result.status !== "prepared") throw new Error(result.status);
    const transform = (current: string): string => current === result.expectedSource ? JSON.stringify(result.document) : current;
    expect(transform(h.source)).not.toBe(h.source);
    const concurrent = h.source.replace("futureRoot", "changedRoot");
    expect(transform(concurrent)).toBe(concurrent);
    expect(transform(h.source.trim())).toBe(h.source.trim());
    (result.document.miroSource as Data).untouched = "parent draft";
    expect(h.document.miroSource).toEqual({ untouched: { value: "Old.canvas" } });
    expect(h.source).toContain("\r\n");
  });

  it("does not create metadata or return a next document when only native links would change", () => {
    const h = fixture();
    const source = JSON.stringify({ nodes: h.document.nodes, edges: h.document.edges, miroSource: h.document.miroSource });
    const writer = vi.spyOn(MetadataWriter.prototype, "write");
    const result = prepareBoardMetadataRename(source, h.options);
    expect(result.status).toBe("noop");
    expect(result).not.toHaveProperty("document");
    expect(writer).not.toHaveBeenCalled();
  });

  it("returns noop for unchanged metadata and never applies edge reconciliation", () => {
    const h = fixture();
    const result = prepareBoardMetadataRename(h.source, { ...h.options, oldPath: "Unrelated.canvas", newPath: "Elsewhere.canvas" });
    expect(result.status).toBe("noop");
    expect(result).not.toHaveProperty("document");
  });

  it("validates current metadata through MetadataWriter and rejects invalid existing fields", () => {
    const h = fixture();
    const source = JSON.stringify({ ...h.document, miroCanvas: { ...h.document.miroCanvas, localOverrides: { text: { locked: "not boolean" } } } });
    const result = prepareBoardMetadataRename(source, h.options);
    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") throw new Error(result.status);
    expect(result.writer?.diagnostics).toContainEqual(expect.objectContaining({ code: "current-metadata-invalid" }));
    expect(result).not.toHaveProperty("document");
  });

  it("rejects incidental writer normalization outside properties/redirects instead of erasing it", () => {
    const h = fixture();
    const source = JSON.stringify({ ...h.document, miroCanvas: { ...h.document.miroCanvas, settings: { schemaVersion: 1 } } });
    const result = prepareBoardMetadataRename(source, h.options);
    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") throw new Error(result.status);
    expect(result.writer?.diagnostics).toContainEqual(expect.objectContaining({ code: "host-commit-rejected" }));
    expect(result).not.toHaveProperty("document");
  });

  it("rejects a next-metadata candidate exceeding the schema limits before returning any document", () => {
    const h = fixture();
    const tooLong = "N".repeat(4100) + ".canvas";
    const result = prepareBoardMetadataRename(h.source, { ...h.options, newPath: tooLong });
    expect(result.status).toBe("rejected");
    expect(result).not.toHaveProperty("document");
  });

  it("checks UTF-8 byte bounds, malformed JSON, and invalid paths", () => {
    const h = fixture();
    expect(prepareBoardMetadataRename("not JSON", h.options)).toMatchObject({ status: "rejected", reason: "invalid-document" });
    expect(prepareBoardMetadataRename(h.source, { ...h.options, maxSourceBytes: 10 })).toMatchObject({ status: "rejected", reason: "source-byte-limit" });
    const unicode = JSON.stringify({ nodes: [], edges: [], future: "ж".repeat(20) });
    expect(prepareBoardMetadataRename(unicode, { ...h.options, maxSourceBytes: unicode.length + 1 })).toMatchObject({ status: "rejected", reason: "source-byte-limit" });
    expect(prepareBoardMetadataRename(h.source, { ...h.options, newPath: "../outside.canvas" })).toMatchObject({ status: "rejected", reason: "invalid-path" });
  });

  it("skips stale property evidence while still updating an explicit redirect path", () => {
    const h = fixture();
    const current = { ...h.document, miroCanvas: { ...h.document.miroCanvas, properties: { related: "Changed [[Old.canvas#node-a|Card]]" } } };
    const result = prepareBoardMetadataRename(JSON.stringify(current), h.options);
    expect(result.status).toBe("prepared");
    if (result.status !== "prepared") throw new Error(result.status);
    expect((result.document.miroCanvas as Data).properties).toEqual(current.miroCanvas.properties);
    expect(result.diagnostics).toContainEqual({ code: "stale-property-reference", property: "related" });
  });
});
