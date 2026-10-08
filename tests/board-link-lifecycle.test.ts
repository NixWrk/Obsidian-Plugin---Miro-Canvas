import { describe, expect, it, vi } from "vitest";
import { extractBoardKnowledge, type BoardKnowledge, type BoardReference } from "../src/board-knowledge";
import { planBoardLinkRename, planReconcileNotePropertyEdges, type BoardLinkLifecyclePlan } from "../src/board-link-lifecycle";

type Data = Record<string, unknown>;
function text(id: string, value: string): Data { return { id, type: "text", text: value, x: 0, y: 0, width: 200, height: 100 }; }
function card(id: string, file: string, extra: Data = {}): Data { return { id, type: "file", file, x: 0, y: 0, width: 100, height: 100, ...extra }; }
function frozen(value: unknown): void {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return;
  Object.freeze(value);
  for (const child of Object.values(value)) frozen(child);
}
function ready(plan: BoardLinkLifecyclePlan): Extract<BoardLinkLifecyclePlan, { ok: true }> {
  expect(plan.ok).toBe(true);
  if (!plan.ok) throw new Error(plan.reason);
  return plan;
}
function knowledge(document: Data, targets: Record<string, string>): BoardKnowledge {
  const cache = extractBoardKnowledge(document)!;
  for (const ref of cache.frontmatterLinks) ref.resolvedPath = targets[ref.link];
  for (const ref of [...cache.links, ...cache.embeds]) {
    const destination = targets[ref.link];
    if (destination) (ref as BoardReference & { resolvedPath: string }).resolvedPath = destination;
  }
  return cache;
}

describe("checked board-link rename plans", () => {
  it("renames file cards, backgrounds, redirects, properties and proven Markdown without changing evidence/unknowns", () => {
    const document = { nodes: [text("t", '[[Note#Heading|Alias]] ![[Note#^block]] [label](<Old/Note.md#Heading> "title") [[Other/Note]]'),
      card("f", "Old/Note.md", { subpath: "#^block", future: { keep: true } }),
      { id: "g", type: "group", background: "Old/Note.md", future: 1 }], edges: [],
      miroCanvas: { schemaVersion: 1, properties: { related: ["[[Note#Heading|Alias]]", "[[Other/Note]]"], future: { keep: true } },
        nodeRedirects: { old: { file: "Old/Note.md", nodeId: "moved", unknown: { keep: true } } } },
      miroSource: { url: "Old/Note.md", untouched: { text: "[[Note]]" } }, futureRoot: { keep: [1, 2] } };
    const targets = { "Note#Heading": "Old/Note.md", "Note#^block": "Old/Note.md", "Old/Note.md#Heading": "Old/Note.md", "Other/Note": "Other/Note.md" };
    const preRename = knowledge(document, targets);
    const original = JSON.stringify(document);
    frozen(document);
    frozen(preRename);
    const result = ready(planBoardLinkRename(document, { sourcePath: "Board.canvas", oldPath: "Old/Note.md", newPath: "New/Renamed.md", preRename }));
    expect(result.changed).toBe(true);
    const nodes = result.document.nodes as Data[];
    expect(nodes[0].text).toBe('[[New/Renamed#Heading|Alias]] ![[New/Renamed#^block]] [label](<New/Renamed.md#Heading> "title") [[Other/Note]]');
    expect(nodes[1]).toMatchObject({ file: "New/Renamed.md", subpath: "#^block", future: { keep: true } });
    expect(nodes[2].background).toBe("New/Renamed.md");
    const own = result.document.miroCanvas as Data;
    expect(own.properties).toEqual({ related: ["[[New/Renamed#Heading|Alias]]", "[[Other/Note]]"], future: { keep: true } });
    expect(own.nodeRedirects).toEqual({ old: { file: "New/Renamed.md", nodeId: "moved", unknown: { keep: true } } });
    expect(result.document.miroSource).toEqual(document.miroSource);
    expect(result.document.futureRoot).toEqual(document.futureRoot);
    expect(JSON.stringify(document)).toBe(original);
    expect(preRename.frontmatterLinks[0].resolvedPath).toBe("Old/Note.md");
    expect(result.document.miroSource).not.toBe(document.miroSource);
  });

  it("uses pre-rename targets rather than same-named textual links or current resolution", () => {
    const document = { nodes: [text("one", "[[Note]]"), text("two", "[[Note]]")], edges: [],
      miroCanvas: { properties: { one: "[[Note]]", two: "[[Note]]", unresolved: "[[Note]]" } } };
    const cache = knowledge(document, {});
    cache.frontmatterLinks[0].resolvedPath = "A/Note.md";
    cache.frontmatterLinks[1].resolvedPath = "B/Note.md";
    const historical = vi.fn((ref: BoardReference) => ref.position.nodeId === "one" ? "A/Note.md" : "B/Note.md");
    const result = ready(planBoardLinkRename(document, { sourcePath: "Board.canvas", oldPath: "A/Note.md", newPath: "A/Renamed.md",
      preRename: cache, textTargetBeforeRename: historical }));
    expect((result.document.nodes as Data[]).map(node => node.text)).toEqual(["[[A/Renamed]]", "[[Note]]"]);
    expect((result.document.miroCanvas as Data).properties).toEqual({ one: "[[A/Renamed]]", two: "[[Note]]", unresolved: "[[Note]]" });
    expect(result.diagnostics).toContainEqual({ code: "ambiguous-property-target", property: "unresolved" });
  });

  it("matches folder prefixes on slash boundaries and preserves encoded card-node fragments", () => {
    const document = { nodes: [text("t", "[[Old/Plan%20one.canvas#node-task%20%231|Card]]"), card("f", "Old/Plan one.canvas"),
      card("neighbor", "Older/Plan.canvas")], edges: [], miroCanvas: { nodeRedirects: { t: { file: "Old/Plan one.canvas", nodeId: "same" } } } };
    const cache = knowledge(document, { "Old/Plan one.canvas#node-task #1": "Old/Plan one.canvas" });
    // Cache parsers may retain URI-encoded fragments; destination evidence is independent.
    (cache.links[0] as BoardReference & { resolvedPath: string }).resolvedPath = "Old/Plan one.canvas";
    const result = ready(planBoardLinkRename(document, { sourcePath: "Board.canvas", oldPath: "Old", newPath: "Moved", folder: true, preRename: cache }));
    expect((result.document.nodes as Data[])[0].text).toBe("[[Moved/Plan%20one.canvas#node-task%20%231|Card]]");
    expect((result.document.nodes as Data[])[1].file).toBe("Moved/Plan one.canvas");
    expect((result.document.nodes as Data[])[2].file).toBe("Older/Plan.canvas");
  });

  it("leaves text without historical evidence alone and preserves source fragments for self links", () => {
    const document = { nodes: [text("t", "[[Note]] [[#Heading]]")], edges: [] };
    const cache = knowledge(document, { "#Heading": "Board.canvas" });
    const result = ready(planBoardLinkRename(document, { sourcePath: "Board.canvas", oldPath: "Board.canvas", newPath: "New.canvas", preRename: cache }));
    expect(result.changed).toBe(false);
    expect((result.document.nodes as Data[])[0].text).toBe("[[Note]] [[#Heading]]");
    expect(result.diagnostics).toContainEqual({ code: "missing-text-target", nodeId: "t" });
  });

  it("rejects stale offsets and links moved into code without rewriting arbitrary substrings", () => {
    const original = { nodes: [text("t", "[[Note]]")], edges: [] };
    const cache = knowledge(original, { Note: "A/Note.md" });
    for (const changed of ["prefix [[Note]]", "`[[Note]]`", "[[Other]]"]) {
      const result = ready(planBoardLinkRename({ ...original, nodes: [text("t", changed)] },
        { sourcePath: "Board.canvas", oldPath: "A/Note.md", newPath: "A/New.md", preRename: cache }));
      expect(result.changed).toBe(false);
      expect((result.document.nodes as Data[])[0].text).toBe(changed);
      expect(result.diagnostics).toContainEqual({ code: "stale-text-reference", nodeId: "t" });
    }
  });

  it("checks stale properties and literal dotted keys without conflating object paths", () => {
    const document = { nodes: [], edges: [], miroCanvas: { properties: { "a.b": "[[Note]]", a: { b: "[[Other]]" }, array: ["[[Note]]"] } } };
    const cache = knowledge(document, { Note: "A/Note.md", Other: "B/Other.md" });
    const current = { ...document, miroCanvas: { properties: { "a.b": "[[Note]]", a: { b: "[[Other]]" }, array: ["Changed [[Note]]"] } } };
    const result = ready(planBoardLinkRename(current, { sourcePath: "Board.canvas", oldPath: "A/Note.md", newPath: "A/New.md", preRename: cache }));
    expect((result.document.miroCanvas as Data).properties).toEqual({ "a.b": "[[A/New]]", a: { b: "[[Other]]" }, array: ["Changed [[Note]]"] });
    expect(result.diagnostics).toContainEqual({ code: "stale-property-reference", property: "array.0" });
  });

  it("fails closed on conflicting property evidence and on unsafe wiki destinations", () => {
    const document = { nodes: [], edges: [], miroCanvas: { properties: { relation: "[[Note]]" } } };
    const cache = knowledge(document, { Note: "A/Note.md" });
    cache.frontmatterLinks.push({ ...cache.frontmatterLinks[0], resolvedPath: "B/Note.md" });
    const conflict = ready(planBoardLinkRename(document, { sourcePath: "Board.canvas", oldPath: "A/Note.md", newPath: "A/New.md", preRename: cache }));
    expect(conflict.changed).toBe(false);
    cache.frontmatterLinks.pop();
    const unsafe = ready(planBoardLinkRename(document, { sourcePath: "Board.canvas", oldPath: "A/Note.md", newPath: "A/New#name.md", preRename: cache }));
    expect(unsafe.changed).toBe(false);
    expect(unsafe.diagnostics).toContainEqual({ code: "unsupported-link-syntax", property: "relation" });
  });

  it("preserves Markdown nested labels, encoded filenames, destination wrappers and titles", () => {
    const value = '![image [nested]](Old/Name%20one.md#^block "title") [label](<Old/Name one.md#Heading> \'other\')';
    const document = { nodes: [text("t", value)], edges: [] };
    const cache = knowledge(document, {});
    for (const ref of cache.embeds.concat(cache.links)) (ref as BoardReference & { resolvedPath: string }).resolvedPath = "Old/Name one.md";
    const result = ready(planBoardLinkRename(document, { sourcePath: "Board.canvas", oldPath: "Old/Name one.md", newPath: "New/Name (two).md", preRename: cache }));
    expect((result.document.nodes as Data[])[0].text).toBe('![image [nested]](New/Name%20%28two%29.md#^block "title") [label](<New/Name%20%28two%29.md#Heading> \'other\')');
  });

  it("rejects invalid paths, duplicate IDs, non-JSON source and historical callback errors", () => {
    const document = { nodes: [text("t", "[[Note]]")], edges: [] };
    const preRename = knowledge(document, {});
    const options = { sourcePath: "Board.canvas", oldPath: "A/Note.md", newPath: "A/New.md", preRename };
    expect(planBoardLinkRename(document, { ...options, newPath: "../outside.md" })).toEqual({ ok: false, reason: "invalid-path" });
    for (const control of ["\u0000", "\n", "\u007f"]) {
      expect(planBoardLinkRename(document, { ...options, newPath: `A/New${control}.md` })).toEqual({ ok: false, reason: "invalid-path" });
    }
    expect(planBoardLinkRename({ ...document, nodes: [text("t", ""), text("t", "")] }, options)).toEqual({ ok: false, reason: "invalid-document" });
    expect(planBoardLinkRename({ ...document, miroSource: { bad: undefined } }, options)).toEqual({ ok: false, reason: "invalid-document" });
    expect(planBoardLinkRename(document, { ...options, textTargetBeforeRename() { throw new Error("historical data unavailable"); } })).toEqual({ ok: false, reason: "planning-failed" });
  });
});

function generated(id = "auto", property = "rel", extras: Data = {}): Data {
  return { id, fromNode: "a", toNode: "b", color: "2", unknown: { keep: true }, miroCanvas: {
    generatedRelation: { owner: "miro-canvas", kind: "note-property", version: 1, fromNode: "a", toNode: "b", property,
      sourcePath: "A.md", targetPath: "B.md", markerFuture: { keep: true } }, namespaceFuture: true }, ...extras };
}
function relations(edges: Data[] = []) { return { nodes: [card("a", "A.md"), card("b", "B.md")], edges, future: true, miroSource: { native: "source" } }; }
function relationOptions(frontmatter: Data | null = { rel: "[[B]]" }) {
  return { sourcePath: "Board.canvas", properties: ["rel"], resolveLink: (link: string) => link === "B" || link === "B.md" ? "B.md" : link === "A.md" ? "A.md" : undefined,
    getNoteCache: (path: string) => path === "A.md" ? frontmatter === null ? undefined : { frontmatter } : {},
    createEdgeId: vi.fn(() => "new-auto") };
}

describe("generated note-property edge reconciliation", () => {
  it("adds marked native edges and is idempotent without regenerating IDs", () => {
    const original = relations();
    frozen(original);
    const options = relationOptions();
    const first = ready(planReconcileNotePropertyEdges(original, options));
    expect(first.addedEdgeIds).toEqual(["new-auto"]);
    expect((first.document.edges as Data[])[0]).toMatchObject({ fromNode: "a", toNode: "b", label: "rel",
      miroCanvas: { generatedRelation: { version: 1, owner: "miro-canvas", kind: "note-property", property: "rel" } } });
    options.createEdgeId.mockClear();
    const repeat = ready(planReconcileNotePropertyEdges(first.document, options));
    expect(repeat.changed).toBe(false);
    expect(repeat.document).toEqual(first.document);
    expect(options.createEdgeId).not.toHaveBeenCalled();
  });

  it("removes stale generated edges while preserving manual and unknown-marker connections", () => {
    const manual = { id: "manual", fromNode: "a", toNode: "b", label: "manual", future: { keep: true } };
    const foreign = generated("foreign", "rel", { miroCanvas: { generatedRelation: { owner: "other" } } });
    const document = relations([generated(), manual, foreign]);
    const before = JSON.stringify(document);
    frozen(document);
    const result = ready(planReconcileNotePropertyEdges(document, relationOptions({})));
    expect(result.removedEdgeIds).toEqual(["auto"]);
    expect(result.document.edges).toEqual([manual, foreign]);
    expect(result.document.miroSource).toEqual(document.miroSource);
    expect(JSON.stringify(document)).toBe(before);
  });

  it("preserves surviving generated style, ID, unknown namespace and marker fields", () => {
    const document = relations([generated()]);
    const result = ready(planReconcileNotePropertyEdges(document, relationOptions()));
    expect(result.changed).toBe(false);
    expect(result.document.edges).toEqual(document.edges);
    expect((result.document.edges as Data[])[0]).not.toBe(document.edges[0]);
  });

  it("preserves generated edges when note cache is unavailable, but explicit disable removes recognized ones", () => {
    const document = relations([generated()]);
    const unknown = ready(planReconcileNotePropertyEdges(document, relationOptions(null)));
    expect(unknown.changed).toBe(false);
    expect(unknown.document.edges).toEqual(document.edges);
    expect(unknown.diagnostics).toContainEqual({ code: "note-cache-unavailable", nodeId: "a", property: "rel" });
    const disabled = ready(planReconcileNotePropertyEdges(document, { ...relationOptions(null), enabled: false }));
    expect(disabled.removedEdgeIds).toEqual(["auto"]);
  });

  it("keeps manual connections authoritative, including independent connectors", () => {
    const manual = { id: "manual", fromNode: "b", toNode: "a", future: true };
    const options = relationOptions();
    const result = ready(planReconcileNotePropertyEdges(relations([manual, generated()]), options));
    expect(result.document.edges).toEqual([manual]);
    expect(options.createEdgeId).not.toHaveBeenCalled();
    const connector = { id: "line", from: { type: "node", nodeId: "a" }, to: { type: "node", nodeId: "b" } };
    const independent = ready(planReconcileNotePropertyEdges({ ...relations(), miroCanvas: { schemaVersion: 1, connectors: { line: connector } } }, options));
    expect(independent.changed).toBe(false);
    expect(independent.document.edges).toEqual([]);
  });

  it("treats moved endpoints and unknown marker versions as manual evidence", () => {
    const moved = generated("moved", "rel", { fromNode: "b", toNode: "a" });
    const future = generated("future");
    ((future.miroCanvas as Data).generatedRelation as Data).version = 2;
    const result = ready(planReconcileNotePropertyEdges(relations([moved, future]), relationOptions({})));
    expect(result.changed).toBe(false);
    expect(result.document.edges).toEqual([moved, future]);
  });

  it("deduplicates generated connections and rejects ID collisions atomically", () => {
    const result = ready(planReconcileNotePropertyEdges(relations([generated("first"), generated("second")]), relationOptions()));
    expect(result.removedEdgeIds).toEqual(["second"]);
    expect((result.document.edges as Data[])[0].id).toBe("first");
    const options = relationOptions();
    options.createEdgeId.mockReturnValue("a");
    expect(planReconcileNotePropertyEdges(relations(), options)).toEqual({ ok: false, reason: "invalid-edge-id" });
    for (const control of ["\u0000", "\n", "\u007f"]) {
      options.createEdgeId.mockReturnValue(`edge${control}`);
      expect(planReconcileNotePropertyEdges(relations(), options)).toEqual({ ok: false, reason: "invalid-edge-id" });
    }
  });

  it("updates generated marker paths during rename without dropping custom fields", () => {
    const document = relations([generated()]);
    const result = ready(planBoardLinkRename(document, { sourcePath: "Board.canvas", oldPath: "A.md", newPath: "New/A.md", preRename: knowledge(document, {}) }));
    const marker = ((result.document.edges as Data[])[0].miroCanvas as Data).generatedRelation as Data;
    expect(marker.sourcePath).toBe("New/A.md");
    expect(marker.markerFuture).toEqual({ keep: true });
    expect((result.document.nodes as Data[])[0].file).toBe("New/A.md");
  });

  it("does not discard edges when resolution/cache callbacks fail", () => {
    const document = relations([generated()]);
    expect(planReconcileNotePropertyEdges(document, { ...relationOptions(), getNoteCache() { throw new Error("cache failure"); } }))
      .toEqual({ ok: false, reason: "planning-failed" });
    expect(document.edges).toEqual([generated()]);
  });
});
