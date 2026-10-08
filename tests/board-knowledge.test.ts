import { describe, expect, it, vi } from "vitest";

import {
  extractBoardKnowledge,
  extractMarkdownKnowledge,
  extractPropertyReferences,
  planNotePropertyEdges,
  type BoardKnowledge,
  type BoardReference,
  type NodeKnowledge,
  type NotePropertyEdgeOptions,
} from "../src/board-knowledge";

function textCard(id: string, text: string): Record<string, unknown> {
  return { id, type: "text", text, x: 0, y: 0, width: 100, height: 100 };
}

it("retains moved-card redirects without indexing them as extra references", () => {
  const redirect = { file: "Nested.canvas", nodeId: "moved", future: { keep: true } };
  const document = { nodes: [textCard("remaining", "[[Target]]")], edges: [],
    miroCanvas: { nodeRedirects: { old: redirect, invalid: { file: 1 } } }, miroSource: { untouched: true } };
  freezeDeep(document);
  const knowledge = extractBoardKnowledge(document)!;
  expect(knowledge.nodeRedirects).toEqual({ old: redirect });
  expect(knowledge.nodeRedirects?.old).not.toBe(redirect);
  expect(knowledge.nodeRedirects?.old.future).not.toBe(redirect.future);
  expect(knowledge.links.map(ref => ref.link)).toEqual(["Target"]);
  expect(knowledge.embeds).toEqual([]);
  expect(knowledge.frontmatterLinks).toEqual([]);
  expect(document.miroSource).toEqual({ untouched: true });
});

function fileCard(id: string, file: string, subpath?: string): Record<string, unknown> {
  return { id, type: "file", file, ...(subpath === undefined ? {} : { subpath }), x: 0, y: 0, width: 100, height: 100 };
}

function freezeDeep(value: unknown): void {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return;
  Object.freeze(value);
  for (const entry of Object.values(value)) freezeDeep(entry);
}

function links(knowledge: NodeKnowledge): string[] {
  return knowledge.links.map((reference) => reference.link);
}

function verifySlices(text: string, references: BoardReference[], nodeId?: string): void {
  for (const reference of references) {
    const { start, end } = reference.position;
    expect(text.slice(start.offset, end.offset)).toBe(reference.original);
    const startLines = text.slice(0, start.offset).split("\n");
    const endLines = text.slice(0, end.offset).split("\n");
    expect(start.line).toBe(startLines.length - 1);
    expect(start.col).toBe(startLines.at(-1)!.length);
    expect(end.line).toBe(endLines.length - 1);
    expect(end.col).toBe(endLines.at(-1)!.length);
    expect(reference.position.nodeId).toBe(nodeId);
  }
}

describe("local Markdown knowledge", () => {
  it("separates wiki links and embeds and preserves aliases, headings and blocks", () => {
    const text = "[[Plan]] [[Plan#Agenda|meeting]] ![[Plan#^task|task view]] [[#Local]] [[#^self]] [[../Other]]";
    const result = extractMarkdownKnowledge(text, "card");
    expect(links(result)).toEqual(["Plan", "Plan#Agenda", "#Local", "#^self", "../Other"]);
    expect(result.links[1]?.displayText).toBe("meeting");
    expect(result.embeds).toHaveLength(1);
    expect(result.embeds[0]).toMatchObject({ link: "Plan#^task", displayText: "task view", original: "![[Plan#^task|task view]]" });
    verifySlices(text, [...result.links, ...result.embeds], "card");
  });

  it("decodes Markdown destinations without changing offsets or treating plus as a space", () => {
    const text = "😀 first\r\n[Agenda](../My%20Note.md%23Heading%20One) ![part](./Note.md%23%5Eblock)\r\n[self](#Heading) [plus](A+B.md)";
    const result = extractMarkdownKnowledge(text, "unicode");
    expect(links(result)).toEqual(["../My Note.md#Heading One", "#Heading", "A+B.md"]);
    expect(result.embeds[0]?.link).toBe("./Note.md#^block");
    expect(result.links[0]?.position.start).toEqual({ line: 1, col: 0, offset: 10 });
    verifySlices(text, [...result.links, ...result.embeds], "unicode");
  });

  it("handles angle destinations, escaped punctuation, balanced parentheses and titles", () => {
    const text = String.raw`[angle](<Folder/My Note.md#One> "title") [nested](Folder/Note_(draft).md) [escaped](Note\(old\).md) [[A\|B|shown\|text]] [entity](A&amp;B.md) [bad-percent](100%ZZ.md)`;
    const result = extractMarkdownKnowledge(text);
    expect(links(result)).toEqual(["Folder/My Note.md#One", "Folder/Note_(draft).md", "Note(old).md", "A|B", "A&B.md", "100%ZZ.md"]);
    expect(result.links[3]?.displayText).toBe("shown|text");
    verifySlices(text, result.links);
  });

  it("supports reference-style links and embeds with local usage positions", () => {
    const text = "[Full][Target] ![Target][] [Shortcut]\n\n[Target]: <Folder/My%20Note.md#Heading> 'title'\n[Shortcut]: Other.md\n[Target]: ignored.md\n";
    const result = extractMarkdownKnowledge(text, "refs");
    expect(links(result)).toEqual(["Folder/My Note.md#Heading", "Other.md"]);
    expect(result.embeds[0]?.link).toBe("Folder/My Note.md#Heading");
    expect(result.links[0]?.original).toBe("[Full][Target]");
    verifySlices(text, [...result.links, ...result.embeds], "refs");
  });

  it("excludes external URI schemes and network paths, including encoded Markdown schemes", () => {
    const text = "[[https://example.test]] ![[data:image/png]] [web](https://example.test/#tag) [mail](mailto:a@b.test) [app](obsidian://open) [encoded](https%3A%2F%2Fexample.test) [network](//host/a) [[Local]] ![local](image.png)";
    const result = extractMarkdownKnowledge(text);
    expect(links(result)).toEqual(["Local"]);
    expect(result.embeds.map((reference) => reference.link)).toEqual(["image.png"]);
    expect(result.tags).toEqual([]);
  });

  it("excludes fences, indented code, inline code, HTML and Obsidian comments", () => {
    const text = [
      "[[before]] #live",
      "```md",
      "[[fenced]] ![[fenced-embed]] #hidden",
      "````",
      "~~~",
      "[fenced](ignored.md)",
      "~~~",
      "    [[indented]] #hidden",
      "\t[[tabbed]]",
      "`[[inline]]` ``has ` [[double]]``",
      "<!-- [[html]]\n#hidden --> %% [[comment]]\n#hidden %%",
      "[[after]] #после/дело",
    ].join("\n");
    const result = extractMarkdownKnowledge(text, "masked");
    expect(links(result)).toEqual(["before", "after"]);
    expect(result.embeds).toEqual([]);
    expect(result.tags.map((entry) => entry.tag)).toEqual(["#live", "#после/дело"]);
    verifySlices(text, result.links, "masked");
  });

  it("honours escapes and leaves unmatched code delimiters as literal text", () => {
    const text = String.raw`\[[escaped]] \![[ordinary]] \[escaped](No.md) \#escaped \\[[after-slashes]] ` + "` unmatched [[visible]]";
    const result = extractMarkdownKnowledge(text);
    expect(links(result)).toEqual(["ordinary", "after-slashes", "visible"]);
    expect(result.embeds).toEqual([]);
    expect(result.tags).toEqual([]);
  });

  it("keeps unclosed fences and comments hidden to the end of a card", () => {
    for (const opener of ["```\n", "~~~\n", "<!--", "%%"]) {
      expect(links(extractMarkdownKnowledge(`[[before]]\n${opener}[[hidden]]`))).toEqual(["before"]);
    }
  });

  it("recognizes Unicode and nested tags while excluding numbers, headings and word fragments", () => {
    const text = "# Heading\n#123 #tag #тема/дело #a_b-c #123/thing word#hidden /#hidden #with.dot [[Note#Heading]]";
    const result = extractMarkdownKnowledge(text, "tags");
    expect(result.tags.map((entry) => entry.tag)).toEqual(["#tag", "#тема/дело", "#a_b-c", "#123/thing", "#with"]);
    for (const tag of result.tags) expect(text.slice(tag.position.start.offset, tag.position.end.offset)).toBe(tag.tag);
  });

  it("never creates offsets in a concatenated board document", () => {
    const first = "long prefix ".repeat(50) + "[[First]]";
    const second = "[[Second]]\n![[Second#^b]]";
    const result = extractBoardKnowledge({ nodes: [textCard("a", first), textCard("b", second)], edges: [] })!;
    expect(result.links[1]?.position.start.offset).toBe(0);
    verifySlices(first, result.nodes.a!.links, "a");
    verifySlices(second, [...result.nodes.b!.links, ...result.nodes.b!.embeds], "b");
    const renamed = second.slice(0, result.links[1]!.position.start.offset) + "[[Renamed]]" + second.slice(result.links[1]!.position.end.offset);
    expect(renamed).toBe("[[Renamed]]\n![[Second#^b]]");
  });

  it("counts links with inline-code labels while excluding comment-spliced links and footnotes", () => {
    const text = "[shown with \u0060code\u0060](Note.md) [[broken<!--hidden-->target]] [^footnote]\n[^footnote]: footnote text";
    expect(links(extractMarkdownKnowledge(text))).toEqual(["Note.md"]);
  });

  it("excludes quoted code fences without hiding later blockquote links", () => {
    const text = "> \u0060\u0060\u0060md\n> [[hidden]] #hidden\n> \u0060\u0060\u0060\n> [[visible]] #visible";
    const result = extractMarkdownKnowledge(text);
    expect(links(result)).toEqual(["visible"]);
    expect(result.tags.map((entry) => entry.tag)).toEqual(["#visible"]);
  });

  it("tolerates incomplete links without inventing references", () => {
    for (const text of ["[[broken", "![[broken", "[label](broken", "[label](a(b)", "[label](<broken)", "[[ ]]", "[empty]()"]) {
      const result = extractMarkdownKnowledge(text);
      expect(result.links).toEqual([]);
      expect(result.embeds).toEqual([]);
    }
  });
});

describe("board properties and attachments", () => {
  it("uses only miroCanvas.properties, projecting detached frontmatter and keeping source evidence intact", () => {
    const document = {
      nodes: [textCard("card", "[[Text]]")], edges: [],
      miroCanvas: { schemaVersion: 1, properties: { related: "[[Own]]", nested: { unknown: [1, true, null] }, tags: ["project", "#nested/work", "project"], aliases: ["Board name", "Doe, Jane", "Other name"], cssclasses: "wide, calm" }, unknown: { preserve: true } },
      metadata: { frontmatter: { related: "[[Legacy]]" } },
      frontmatter: { related: "[[Forbidden root]]" },
      miroSource: { items: [{ text: "[[Source is not knowledge]]" }], unknown: { value: 1 } },
      unknown: { preserve: true },
    };
    const before = JSON.stringify(document);
    freezeDeep(document);
    const result = extractBoardKnowledge(document)!;
    expect(result.frontmatter).toEqual(document.miroCanvas.properties);
    expect(result.frontmatter).not.toBe(document.miroCanvas.properties);
    expect(result.frontmatterLinks).toEqual([{ key: "related", link: "Own", original: "[[Own]]", displayText: "Own" }]);
    expect(result.tags.map((entry) => entry.tag)).toEqual(["#project", "#nested/work"]);
    expect(result.aliases).toEqual(["Board name", "Doe, Jane", "Other name"]);
    expect(result.cssclasses).toEqual(["wide", "calm"]);
    (result.frontmatter!.nested as { unknown: unknown[] }).unknown.push("detached");
    expect(JSON.stringify(document)).toBe(before);
  });

  it("uses Advanced Canvas frontmatter only as an import fallback and lets empty own properties win", () => {
    const base = { nodes: [], edges: [], metadata: { frontmatter: { aliases: "Legacy, Imported", tags: "old", cssclasses: ["legacy"], related: "[[Import]]" } }, frontmatter: { tags: "root" } };
    const imported = extractBoardKnowledge(base)!;
    expect(imported.frontmatterLinks[0]?.link).toBe("Import");
    expect(imported.aliases).toEqual(["Legacy", "Imported"]);
    expect(imported.cssclasses).toEqual(["legacy"]);
    expect(extractBoardKnowledge({ ...base, miroCanvas: { properties: {} } })).toMatchObject({ frontmatter: {}, frontmatterLinks: [], aliases: [], tags: [], cssclasses: [] });
    expect(extractBoardKnowledge({ nodes: [], edges: [], frontmatter: { tags: "root", related: "[[Root]]" } })).toMatchObject({ frontmatterLinks: [], tags: [], aliases: [] });
  });

  it("requires properties to be a plain JSON object, without interpreting other board roots", () => {
    for (const properties of [[], "tags: nope", null, new Date(), { nonJson: undefined }, { nonJson: Infinity }]) {
      const result = extractBoardKnowledge({ nodes: [], edges: [], miroCanvas: { properties } })!;
      expect(result.frontmatter).toBeUndefined();
      expect(result.frontmatterLinks).toEqual([]);
    }
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(extractBoardKnowledge({ nodes: [], edges: [], miroCanvas: { properties: cycle } })?.frontmatter).toBeUndefined();
  });

  it("normalizes scalar/list tags, aliases and CSS classes, retaining only valid strings", () => {
    const properties = { tags: ["one, two", "#one", 1, false, "123", "nested/yes", "bad//path"], aliases: "First alias, Second alias, First alias", cssclasses: ["wide calm", "wide", false, ""] };
    const result = extractBoardKnowledge({ nodes: [], edges: [], miroCanvas: { properties } })!;
    expect(result.tags.map((entry) => entry.tag)).toEqual(["#one", "#two", "#nested/yes"]);
    expect(result.aliases).toEqual(["First alias", "Second alias"]);
    expect(result.cssclasses).toEqual(["wide", "calm"]);
    expect(result.tags.every((entry) => entry.position.start.offset === 0 && entry.position.nodeId === undefined)).toBe(true);
  });

  it("extracts nested property references with object paths and array indexes in source order", () => {
    const properties = { related: ["[[A|alpha]] ![[B#^block]]", { nested: "[C](C%20Note.md#Heading) [[A]]" }], bare: "Note name", number: 2, external: "[web](https://example.test)" };
    expect(extractPropertyReferences(properties)).toEqual([
      { key: "related.0", link: "A", original: "[[A|alpha]]", displayText: "alpha" },
      { key: "related.0", link: "B#^block", original: "![[B#^block]]", displayText: "B#^block" },
      { key: "related.1.nested", link: "C Note.md#Heading", original: "[C](C%20Note.md#Heading)", displayText: "C" },
      { key: "related.1.nested", link: "A", original: "[[A]]", displayText: "A" },
    ]);
  });

  it("handles shared property objects and cycles without losing repeated reference paths", () => {
    const shared = { note: "[[Shared]]" };
    const properties: Record<string, unknown> = { first: shared, second: shared };
    properties.loop = properties;
    expect(extractPropertyReferences(properties).map((entry) => entry.key)).toEqual(["first.note", "second.note"]);
  });

  it("includes file subpaths and group backgrounds as zero-position card embeds", () => {
    const result = extractBoardKnowledge({ nodes: [
      fileCard("note", "Notes/Plan.md", "#^task"),
      fileCard("image", "Assets/chart.png"),
      { id: "group", type: "group", label: "[[not parsed]]", background: "Assets/background.png", backgroundStyle: "cover" },
      { id: "remote", type: "group", background: "https://example.test/image.png" },
      { id: "url", type: "link", url: "https://example.test" },
    ], edges: [] })!;
    expect(result.embeds.map((entry) => entry.link)).toEqual(["Notes/Plan.md#^task", "Assets/chart.png", "Assets/background.png"]);
    expect(result.embeds.map((entry) => entry.position.nodeId)).toEqual(["note", "image", "group"]);
    expect(result.embeds[0]?.original).toBe("![[Notes/Plan.md#^task]]");
    for (const entry of result.embeds) {
      expect(entry.position.start).toEqual({ line: 0, col: 0, offset: 0 });
      expect(entry.position.end).toEqual({ line: 0, col: 0, offset: 0 });
    }
    expect(result.links).toEqual([]);
    expect(result.nodes).toEqual({});
  });

  it("returns null for invalid/truncated boards and accepts valid empty boards", () => {
    for (const document of [null, undefined, "{\"nodes\":[", [], {}, { nodes: [] }, { nodes: [], edges: {} }, { nodes: [null], edges: [] }, { nodes: [{ id: "t", type: "text" }], edges: [] }, { nodes: [fileCard("f", "A.md"), fileCard("f", "B.md")], edges: [] }, { nodes: [], edges: [{ id: "e", fromNode: "n" }] }]) {
      expect(extractBoardKnowledge(document)).toBeNull();
    }
    expect(extractBoardKnowledge({ nodes: [], edges: [] })).toEqual({ links: [], embeds: [], tags: [], frontmatterLinks: [], nodes: {}, aliases: [], cssclasses: [] });
  });

  it("keeps prototype-looking node IDs and unknown properties as ordinary own keys", () => {
    const properties = JSON.parse('{"__proto__":{"related":"[[Safe]]"},"constructor":"value"}') as Record<string, unknown>;
    const result = extractBoardKnowledge({ nodes: [textCard("__proto__", "[[Card]]"), textCard("constructor", "")], edges: [], miroCanvas: { properties } })!;
    expect(Object.getPrototypeOf(result.nodes)).toBe(Object.prototype);
    expect(Object.keys(result.nodes)).toEqual(["__proto__", "constructor"]);
    expect(links(result.nodes.__proto__!)).toEqual(["Card"]);
    expect(Object.prototype.hasOwnProperty.call(result.frontmatter!, "__proto__")).toBe(true);
    expect(result.frontmatterLinks[0]?.key).toBe("__proto__.related");
  });

  it("allows the parent to merge native metadata fields without narrowing them away", () => {
    const knowledge: NodeKnowledge = { ...extractMarkdownKnowledge("[[Plan]]"), headings: [{ heading: "Title", level: 1 }], blocks: { item: { id: "item" } }, sections: [], frontmatter: { custom: true } };
    const board: BoardKnowledge = { ...extractBoardKnowledge({ nodes: [], edges: [] })!, nodes: { card: knowledge } };
    expect(board.nodes.card?.headings).toEqual([{ heading: "Title", level: 1 }]);
  });
});

describe("pure note-property edge plan", () => {
  function options(frontmatter: Record<string, Record<string, unknown>>): NotePropertyEdgeOptions {
    return {
      sourcePath: "Boards/Plan.canvas",
      resolveLink: (link, source) => {
        if (link.startsWith("#")) return source;
        const path = link.split("#")[0]!;
        if (path === "missing") return undefined;
        return path.endsWith(".md") || path.endsWith(".png") ? path : `${path}.md`;
      },
      getNoteCache: (path) => frontmatter[path] === undefined ? undefined : { frontmatter: frontmatter[path] },
    };
  }

  it("resolves note properties relative to the source note and returns additions only", () => {
    const document = { nodes: [fileCard("b", "B.md", "#Heading"), fileCard("a", "A.md"), fileCard("image", "pic.png")], edges: [], miroSource: { evidence: true }, custom: 1 };
    const before = JSON.stringify(document);
    freezeDeep(document);
    const injected = options({ "A.md": { related: "[[B#^task|task]]" } });
    const resolver = vi.fn(injected.resolveLink);
    const getNoteCache = vi.fn(injected.getNoteCache);
    expect(planNotePropertyEdges(document, { ...injected, resolveLink: resolver, getNoteCache })).toEqual([
      { fromNode: "a", toNode: "b", property: "related", link: "B#^task", sourcePath: "A.md", targetPath: "B.md" },
    ]);
    expect(resolver).toHaveBeenCalledWith("B", "A.md");
    expect(getNoteCache).not.toHaveBeenCalledWith("pic.png");
    expect(JSON.stringify(document)).toBe(before);
  });

  it("skips manual pairs in either direction, self links, unresolved links and repeated property references", () => {
    const document = { nodes: [fileCard("a", "A.md"), fileCard("b", "B.md"), fileCard("c", "C.md"), fileCard("a-copy", "A.md")], edges: [{ id: "manual", fromNode: "b", toNode: "a", label: "manual", unknown: { preserve: true } }] };
    const injected = options({ "A.md": { related: "[[B]] [[C]] [[C#Heading]] [[A]] [[#Self]] [[missing]]" }, "C.md": { related: "[[A]]" } });
    const result = planNotePropertyEdges(document, injected);
    expect(result.some((edge) => edge.fromNode === "a" && edge.toNode === "b")).toBe(false);
    expect(result.some((edge) => edge.sourcePath === edge.targetPath)).toBe(false);
    expect(result.filter((edge) => [edge.fromNode, edge.toNode].sort().join() === "a,c")).toHaveLength(1);
    expect(document.edges).toEqual([{ id: "manual", fromNode: "b", toNode: "a", label: "manual", unknown: { preserve: true } }]);
  });

  it("keeps different properties and reads each distinct note cache once", () => {
    const document = { nodes: [fileCard("a2", "A.md"), fileCard("b", "B.md"), fileCard("a1", "A.md")], edges: [] };
    const injected = options({ "A.md": { related: "[[B]] [[B]]", parent: "[[B]]" } });
    const getNoteCache = vi.fn(injected.getNoteCache);
    const result = planNotePropertyEdges(document, { ...injected, getNoteCache });
    expect(result.map((edge) => [edge.fromNode, edge.toNode, edge.property])).toEqual([
      ["a1", "b", "parent"], ["a1", "b", "related"], ["a2", "b", "parent"], ["a2", "b", "related"],
    ]);
    expect(getNoteCache.mock.calls.filter(([path]) => path === "A.md")).toHaveLength(1);
    expect(getNoteCache.mock.calls.filter(([path]) => path === "B.md")).toHaveLength(1);
    expect(planNotePropertyEdges({ ...document, nodes: [...document.nodes].reverse() }, injected)).toEqual(result);
  });

  it("filters configured top-level and nested properties, collapsing repeated array entries", () => {
    const document = { nodes: [fileCard("a", "A.md"), fileCard("b", "B.md"), fileCard("c", "C.md")], edges: [] };
    const injected = options({ "A.md": { unrelated: "[[C]]", relations: { parent: ["[[B]]", "[[B#Heading]]"], peer: "[[C]]" }, repeated: ["[[B]]", "[[B]]"] } });
    const nested = planNotePropertyEdges(document, { ...injected, properties: ["relations.parent"] });
    expect(nested.map((edge) => [edge.toNode, edge.property])).toEqual([["b", "relations.parent"]]);
    const topLevel = planNotePropertyEdges(document, { ...injected, properties: ["relations", "repeated"] });
    expect(topLevel.map((edge) => [edge.toNode, edge.property])).toEqual([["b", "relations"], ["b", "repeated"], ["c", "relations"]]);
    expect(planNotePropertyEdges(document, { ...injected, properties: [] })).toEqual([]);
  });

  it("strips heading/block subpaths before resolution and skips self fragments", () => {
    const document = { nodes: [fileCard("a", "A.md"), fileCard("b", "B.md")], edges: [] };
    const injected = options({ "A.md": { relation: "[[B#Heading]] [[B#^block]] [[#Self]]" } });
    const resolveLink = vi.fn(injected.resolveLink);
    const result = planNotePropertyEdges(document, { ...injected, resolveLink });
    expect(result).toHaveLength(1);
    expect(result[0]?.link).toBe("B#Heading");
    expect(resolveLink).toHaveBeenCalledWith("B", "A.md");
    expect(resolveLink).not.toHaveBeenCalledWith("B#Heading", "A.md");
    expect(resolveLink).not.toHaveBeenCalledWith("", "A.md");
  });

  it("respects manual independent connector pairs as well as native edges", () => {
    const connector = { id: "manual", from: { type: "node", nodeId: "b", u: 0, v: 0 }, to: { type: "node", nodeId: "a", u: 1, v: 1 }, unknown: true };
    const document = { nodes: [fileCard("a", "A.md"), fileCard("b", "B.md")], edges: [], miroCanvas: { connectors: { manual: connector } } };
    freezeDeep(document);
    expect(planNotePropertyEdges(document, options({ "A.md": { related: "[[B]]" } }))).toEqual([]);
    expect(document.miroCanvas.connectors.manual).toBe(connector);
  });

  it("does not propose deletion when existing property edges become stale", () => {
    const document = { nodes: [fileCard("a", "A.md"), fileCard("b", "B.md")], edges: [{ id: "old", fromNode: "a", toNode: "b", label: "old property" }] };
    expect(planNotePropertyEdges(document, options({}))).toEqual([]);
    expect(document.edges).toHaveLength(1);
    expect(planNotePropertyEdges(null, options({}))).toEqual([]);
  });
});
