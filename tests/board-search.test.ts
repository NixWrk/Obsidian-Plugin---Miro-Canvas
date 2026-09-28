import { describe, expect, it } from "vitest";

import {
  buildSearchIndex,
  findMatches,
  focusRect,
  normalizeSearchText,
  stepMatch,
  stripMarkdown,
  type SearchEntry,
} from "../src/board-search";
import { buildCanvasAnchorGeometry } from "../src/connector-endpoints";
import { listCommentThreads } from "../src/local-comments";
import { buildSourceScene } from "../src/source-model";

function indexOf(document: Record<string, unknown>, labelFallback = 0.5): SearchEntry[] {
  const scene = buildSourceScene(document);
  const geometry = buildCanvasAnchorGeometry(document, undefined, scene);
  return buildSearchIndex({ document, scene, geometry, threads: listCommentThreads(document), labelFallback });
}

function card(id: string, x: number, y: number, text: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, type: "text", x, y, width: 100, height: 60, text, ...extra };
}

const CONNECTOR = {
  id: "arrow", from: { type: "free", x: 0, y: 1000 }, to: { type: "free", x: 200, y: 1000 },
  route: "straight", color: "#1a1a1a", width: 2, startCap: "none", endCap: "arrow", label: "Plugin arrow", labelT: 0.25,
};

const BOARD = {
  nodes: [
    card("plain", 0, 0, "## Plan for **the** week"),
    card("sticky", 200, 0, "Buy milk"),
    card("shape", 400, 0, "Decision"),
    card("table", 0, 200, "| Name | Role |\n| --- | :---: |\n| Ann | Lead |"),
    card("code", 200, 200, "```js\nconst answer = 42;\n```"),
    { id: "frame", type: "group", x: -50, y: -50, width: 1000, height: 1000, label: "Sprint frame" },
    { id: "file", type: "file", x: 400, y: 200, width: 100, height: 60, file: "notes/Roadmap.md", subpath: "#Goals" },
    { id: "link", type: "link", x: 600, y: 200, width: 100, height: 60, url: "https://example.com/docs" },
  ],
  edges: [
    { id: "edge", fromNode: "plain", fromSide: "right", toNode: "sticky", toSide: "left", label: "depends on" },
  ],
  miroCanvas: {
    schemaVersion: 1,
    localOverrides: {
      sticky: { item: { type: "sticky_note" } },
      shape: { shape: { kind: "rectangle" } },
      table: { item: { type: "table", title: "Team" } },
      code: { item: { type: "code", title: "Snippet" } },
    },
    connectors: { arrow: CONNECTOR },
    localComments: [
      {
        id: "c1", text: "Check the numbers", origin: "local", createdAt: "2026-01-01T00:00:00.000Z", resolved: true,
        anchor: { type: "node", nodeId: "sticky", u: 0.5, v: 0.5 },
        replies: [{ id: "r1", text: "Numbers look right", origin: "local", createdAt: "2026-01-02T00:00:00.000Z" }],
      },
      { id: "c2", text: "Loose thought", origin: "local", createdAt: "2026-01-01T00:00:00.000Z", resolved: false, replies: [] },
    ],
    hiddenImportedComments: ["m2"],
  },
  miroSource: {
    comments: [
      { id: "m1", text: "Imported remark", position: { type: "canvas", x: 10, y: 20 } },
      { id: "m2", text: "Hidden remark", position: { type: "canvas", x: 30, y: 40 } },
    ],
  },
};

describe("normalizing text for search", () => {
  it("ignores case, accents and the difference between ё and е", () => {
    expect(normalizeSearchText("Café DÉJÀ")).toBe("cafe deja");
    expect(normalizeSearchText("Ёлка")).toBe("елка");
    expect(normalizeSearchText("  many\n\tspaces  ")).toBe("many spaces");
  });

  it("keeps й apart from и", () => {
    expect(normalizeSearchText("Йогурт")).toBe("йогурт");
    expect(normalizeSearchText("йод")).not.toBe(normalizeSearchText("иод"));
    expect(normalizeSearchText("Й".normalize("NFD"))).toBe("й");
  });
});

describe("stripping Markdown and HTML", () => {
  it("keeps the words and drops the marks that write them", () => {
    expect(normalizeSearchText(stripMarkdown("# Title\n> quoted **bold** __under__ ~~gone~~ ==marked== `code`"))).toBe("title quoted bold under gone marked code");
    expect(normalizeSearchText(stripMarkdown("- [ ] task one\n1. first\n* star"))).toBe("task one first star");
  });

  it("reads links, images and wiki links as their text", () => {
    expect(stripMarkdown("[Docs](https://x.test/a) ![Chart](img.png)")).toBe("Docs Chart");
    expect(stripMarkdown("[[folder/Some note]] [[Other|shown alias]]")).toBe("Some note shown alias");
    expect(stripMarkdown("[[Note#Heading]]")).toBe("Note Heading");
  });

  it("removes HTML tags and decodes entities", () => {
    expect(stripMarkdown("hel<mark>lo</mark> A&amp;B &lt;x&gt; &#1046; &#x416;")).toBe("hello A&B <x> Ж Ж");
    expect(normalizeSearchText(stripMarkdown("<p>one</p><p>two<br>three</p>"))).toBe("one two three");
  });

  it("reads a table's cells without pipes or its rule row, and code without its fence", () => {
    expect(normalizeSearchText(stripMarkdown("| a | b |\n|---|:--:|\n| c | d |"))).toBe("a b c d");
    expect(normalizeSearchText(stripMarkdown("```python\nprint(1)\n```"))).toBe("print(1)");
  });
});

describe("the board's search index", () => {
  it("holds every kind of thing a person can read", () => {
    const index = indexOf(BOARD);
    const byKey = new Map(index.map((entry) => [entry.key, entry]));
    expect(byKey.get("node:plain")).toMatchObject({ kind: "text", haystack: "plan for the week" });
    expect(byKey.get("node:sticky")?.kind).toBe("sticky");
    expect(byKey.get("node:shape")?.kind).toBe("shape");
    expect(byKey.get("node:table")).toMatchObject({ kind: "table", haystack: "team name role ann lead" });
    expect(byKey.get("node:code")).toMatchObject({ kind: "text", haystack: "snippet const answer = 42;" });
    expect(byKey.get("node:frame")).toMatchObject({ kind: "frame", haystack: "sprint frame" });
    expect(byKey.get("node:file")).toMatchObject({ kind: "file", haystack: "roadmap.md #goals" });
    expect(byKey.get("node:link")).toMatchObject({ kind: "link", haystack: "https://example.com/docs" });
    expect(byKey.get("label:edge")).toMatchObject({ kind: "label", targetId: "edge", haystack: "depends on" });
    expect(byKey.get("label:arrow")).toMatchObject({ kind: "label", rect: { x: 50, y: 1000, width: 0, height: 0 } });
    expect(byKey.get("comment:local:c1")).toMatchObject({ kind: "comment", origin: "local", targetId: "c1", rect: { x: 250, y: 30 } });
    expect(byKey.get("comment:imported:m1")).toMatchObject({ kind: "comment", origin: "imported", rect: { x: 10, y: 20 } });
  });

  it("finds a thread by its replies, keeps resolved threads and leaves hidden imported ones out", () => {
    const index = indexOf(BOARD);
    const found = findMatches(index, "look right").map((position) => index[position]!.key);
    expect(found).toEqual(["comment:local:c1"]);
    expect(findMatches(index, "Hidden remark")).toEqual([]);
  });

  it("puts a thread without a pin last, with no place on the board", () => {
    const index = indexOf(BOARD);
    expect(index[index.length - 1]).toMatchObject({ key: "comment:local:c2", rect: undefined });
  });

  it("runs from the top down and left to right", () => {
    const index = indexOf({
      nodes: [card("c", 300, 100, "alpha"), card("a", 0, 0, "alpha"), card("b", 200, 100, "alpha"), card("d", 0, 100, "alpha")],
      edges: [],
    });
    expect(index.map((entry) => entry.targetId)).toEqual(["a", "d", "b", "c"]);
  });

  it("matches whatever the case, accent or ё of the query", () => {
    const index = indexOf({ nodes: [card("ru", 0, 0, "Зелёная ЁЛКА"), card("en", 0, 100, "Résumé")], edges: [] });
    expect(findMatches(index, "елка")).toEqual([0]);
    expect(findMatches(index, "ЗЕЛЕНАЯ")).toEqual([0]);
    expect(findMatches(index, "resume")).toEqual([1]);
    expect(findMatches(index, "   ")).toEqual([]);
  });

  it("builds for a board of five thousand cards in well under a second", () => {
    const nodes = Array.from({ length: 5000 }, (_, position) => card(`n${position}`, (position % 100) * 120, Math.floor(position / 100) * 80,
      `Card **${position}** with [a link](https://x.test/${position}) and some words`));
    const document = { nodes, edges: [] };
    const scene = buildSourceScene(document);
    const geometry = buildCanvasAnchorGeometry(document, undefined, scene);
    const started = performance.now();
    const index = buildSearchIndex({ document, scene, geometry, threads: [], labelFallback: 0.5 });
    const elapsed = performance.now() - started;
    expect(index).toHaveLength(5000);
    expect(elapsed).toBeLessThan(1000);
    expect(findMatches(index, "card 4999 ")).toEqual([4999]);
  });
});

describe("stepping through matches", () => {
  it("goes round from the last to the first and back", () => {
    expect(stepMatch(0, 3, 1)).toBe(1);
    expect(stepMatch(2, 3, 1)).toBe(0);
    expect(stepMatch(0, 3, -1)).toBe(2);
    expect(stepMatch(-1, 3, 1)).toBe(0);
    expect(stepMatch(-1, 3, -1)).toBe(2);
    expect(stepMatch(0, 0, 1)).toBe(-1);
  });
});

describe("the rectangle a jump fits", () => {
  const view = { width: 1064, height: 864 };
  const fitted = (rect: { width: number; height: number }): number => Math.min((view.width - 64) / rect.width, (view.height - 64) / rect.height);

  it("keeps the current zoom for a tiny card instead of blowing it up", () => {
    const target = focusRect({ x: 100, y: 100, width: 10, height: 10 }, 1, view);
    expect(fitted(target)).toBeCloseTo(1);
    expect(target.x + target.width / 2).toBeCloseTo(105);
    expect(target.y + target.height / 2).toBeCloseTo(105);
  });

  it("zooms in to half size at least when the board is far out", () => {
    expect(fitted(focusRect({ x: 0, y: 0, width: 10, height: 10 }, 0.05, view))).toBeCloseTo(0.5);
  });

  it("zooms out for a frame too big to fit", () => {
    const target = focusRect({ x: 0, y: 0, width: 4000, height: 2000 }, 1, view);
    expect(fitted(target)).toBeCloseTo(1000 / 4000);
  });

  it("centres a point, such as a line label", () => {
    const target = focusRect({ x: 40, y: 60, width: 0, height: 0 }, 0.8, view);
    expect(fitted(target)).toBeCloseTo(0.8);
    expect(target.x + target.width / 2).toBeCloseTo(40);
  });
});
