import { describe, expect, it } from "vitest";
import { buildSearchIndex, findMatches, searchMatches, SEARCH_REGEX_LIMITS, type SearchEntry, type SearchIndexInput } from "../src/board-search";
import { buildCanvasAnchorGeometry } from "../src/connector-endpoints";
import { buildSourceScene } from "../src/source-model";

function index(document: unknown, noteTexts?: ReadonlyMap<string, string>, noteTextSlice?: SearchIndexInput["noteTextSlice"]): SearchEntry[] {
  const scene = buildSourceScene(document);
  return buildSearchIndex({ document, scene, geometry: buildCanvasAnchorGeometry(document, undefined, scene), threads: [], labelFallback: 0.5, noteTexts, noteTextSlice });
}

function textIndex(text: string): SearchEntry[] {
  return index({ nodes: [{ id: "card", type: "text", x: 0, y: 0, width: 100, height: 60, text }], edges: [] });
}

function exactTextIndex(text: string): SearchEntry[] {
  return [{ ...textIndex("placeholder")[0], displayText: text, rawText: text, haystack: text }];
}

function file(id: string, subpath?: string, path = "notes/Plan.md"): Record<string, unknown> {
  return { id, type: "file", file: path, subpath, x: 0, y: 0, width: 100, height: 60 };
}

describe("linked note text in the board index", () => {
  const note = "# Intro\nOnly intro\n## Details\nNested work\n# Next\nSecret ending";

  it("retains raw and readable text apart from the normalized literal haystack", () => {
    const entry = textIndex("# Café **ÉTÉ**\nЗелёная")[0];
    expect(entry.rawText).toBe("# Café **ÉTÉ**\nЗелёная");
    expect(entry.displayText).toBe("Café ÉTÉ\nЗелёная");
    expect(entry.haystack).toBe("cafe ete зеленая");
  });

  it("indexes full notes and heading descendants in their card without duplicate results", () => {
    const board = { nodes: [file("full"), file("section", "#Intro"), file("nested", "#Details")], edges: [] };
    const entries = index(board, new Map([["notes/Plan.md", note]]));
    expect(searchMatches(entries, "Nested work").matches).toHaveLength(3);
    expect(searchMatches(entries, "Secret ending").matches.map((position) => entries[position].targetId)).toEqual(["full"]);
    expect(searchMatches(entries, "Only intro").matches.map((position) => entries[position].targetId)).toEqual(["full", "section"]);
    expect(entries.find((entry) => entry.targetId === "nested")?.rect).toEqual({ x: 0, y: 0, width: 100, height: 60 });
  });

  it("fails closed on unknown anchors and does not index non-Markdown attachments", () => {
    const entries = index({ nodes: [file("missing", "#Absent"), file("image", undefined, "notes/Plan.png")], edges: [] },
      new Map([["notes/Plan.md", note], ["notes/Plan.png", "image text"]]));
    expect(searchMatches(entries, "Secret").matches).toEqual([]);
    expect(searchMatches(entries, "image text").matches).toEqual([]);
    expect(searchMatches(entries, "Plan.md").matches).toHaveLength(1);
  });

  it("adds block text without changing input documents or their source evidence", () => {
    const board = { nodes: [file("block", "#^task")], edges: [], miroSource: { custom: "evidence" } };
    const before = JSON.stringify(board);
    const entries = index(board, new Map([["notes/Plan.md", "private paragraph\n\nDo **specific** work ^task\n\nHidden later"]]));
    expect(searchMatches(entries, "specific work").matches).toEqual([0]);
    expect(searchMatches(entries, "private paragraph").matches).toEqual([]);
    expect(searchMatches(entries, "Hidden later").matches).toEqual([]);
    expect(JSON.stringify(board)).toBe(before);
  });

  it("accepts a pure authoritative slice adapter for native Markdown metadata", () => {
    const calls: string[] = [];
    const entries = index({ nodes: [file("linked", "#Native")], edges: [] }, new Map([["notes/Plan.md", note]]),
      (path, text, subpath) => {
        calls.push(`${path}:${subpath}`);
        expect(text).toBe(note);
        return "Native slice";
      });
    expect(calls).toEqual(["notes/Plan.md:#Native"]);
    expect(searchMatches(entries, "Native slice").matches).toEqual([0]);
    expect(searchMatches(entries, "Secret ending").matches).toEqual([]);
  });

  it("does not fall back to full note text when an authoritative subpath is absent", () => {
    const entries = index({ nodes: [file("linked", "#Native")], edges: [] }, new Map([["notes/Plan.md", note]]), () => undefined);
    expect(searchMatches(entries, "Secret ending").matches).toEqual([]);
    expect(searchMatches(entries, "Plan.md").matches).toEqual([0]);
  });
});

describe("optional literal case matching", () => {
  const entries = textIndex("Café ÉTÉ\nЗелёная ЁЛКА йод");

  it("preserves the old array API and folded default results", () => {
    expect(findMatches(entries, "cafe ete")).toEqual([0]);
    expect(findMatches(entries, "ЕЛКА")).toEqual([0]);
    expect(findMatches(entries, "Café", {})).toEqual({ matches: [0] });
  });

  it("uses readable text, Unicode canonical equivalence and whitespace without folding letters", () => {
    expect(searchMatches(entries, "Café", { caseSensitive: true })).toEqual({ matches: [0] });
    expect(searchMatches(entries, "Café", { caseSensitive: true }).matches).toEqual([0]);
    expect(searchMatches(entries, "café", { caseSensitive: true }).matches).toEqual([]);
    expect(searchMatches(entries, "CafE", { caseSensitive: true }).matches).toEqual([]);
    expect(searchMatches(entries, "ÉTÉ Зелёная", { caseSensitive: true }).matches).toEqual([0]);
    expect(searchMatches(entries, "ЕЛКА", { caseSensitive: true }).matches).toEqual([]);
    expect(searchMatches(entries, "   ", { caseSensitive: true }).matches).toEqual([]);
  });
});

describe("bounded linear regular expressions", () => {
  it("supports Unicode, classes, anchors, dot, shorthand/property classes and repeats", () => {
    const entries = exactTextIndex("ÉTÉ task42 ёлка 😀");
    for (const pattern of ["task\\d+", "^ÉTÉ.*😀$", "[0-9]{2}", "\\p{L}+", "😀", "\\u{1F600}", "\\uD83D\\uDE00", "\\x34{1,3}", "t[a-z]*42"]) {
      expect(searchMatches(entries, pattern, { regex: true }), pattern).toEqual({ matches: [0] });
    }
    expect(searchMatches(entries, "été", { regex: true }).matches).toEqual([0]);
    expect(searchMatches(entries, "été", { regex: true, caseSensitive: true }).matches).toEqual([]);
    expect(searchMatches(entries, "ете", { regex: true }).matches).toEqual([]);
    expect(searchMatches(entries, "елка", { regex: true }).matches).toEqual([]);
  });

  it("does not strip regex operators or normalize newlines/accents", () => {
    expect(searchMatches(exactTextIndex("a*b [x]"), "a\\*b \\[x\\]", { regex: true }).matches).toEqual([0]);
    expect(searchMatches(exactTextIndex("a\nb"), "a.b", { regex: true }).matches).toEqual([]);
    expect(searchMatches(exactTextIndex("a\nb"), "a\\s+b", { regex: true }).matches).toEqual([0]);
    expect(searchMatches(exactTextIndex("é"), "e", { regex: true }).matches).toEqual([]);
  });

  it("matches supported flat patterns like native regex on small representative inputs", () => {
    const texts = ["", "a", "ab", "aab", "bbb", "aaac", "é", "😀ab", " x", "a b", "aaaabc"];
    const patterns = ["a*", "a+", "a?", "^a*b$", "a+?b", "a{0,2}b", "a{2,}b", "^$", "a.*c", "[^b]+", "[ab]*c", "\\s?x", "\\d", "^.*$", "a{0}b", "a?a?a?b", ".*a.*b"];
    for (const text of texts) {
      for (const pattern of patterns) {
        const expected = new RegExp(pattern, "iu").test(text) ? [0] : [];
        expect(searchMatches(exactTextIndex(text), pattern, { regex: true }).matches, `${pattern} / ${text}`).toEqual(expected);
      }
    }
  });

  it("returns errors rather than throwing or leaving partial matches", () => {
    const entries = exactTextIndex("aaaaaaaaaaaaaaaaaaaa!");
    for (const pattern of ["[", "(", "a{2,1}", "\\"]) {
      expect(searchMatches(entries, pattern, { regex: true })).toEqual({ matches: [], error: { code: "invalid-pattern" } });
    }
    for (const pattern of ["(a+)+$", "(a|aa)+$", "(a)\\1", "a|b", "(?=a)a", "\\bword", "a{99999}"]) {
      expect(searchMatches(entries, pattern, { regex: true })).toEqual({ matches: [], error: { code: "unsupported-pattern" } });
    }
    expect(searchMatches(entries, "a".repeat(SEARCH_REGEX_LIMITS.patternLength + 1), { regex: true }).error?.code).toBe("pattern-too-long");
    expect(searchMatches(entries, "", { regex: true })).toEqual({ matches: [] });
  });

  it("bounds total input and work even for ambiguous flat repeats", () => {
    expect(searchMatches(exactTextIndex("a".repeat(SEARCH_REGEX_LIMITS.inputCharacters + 1)), "a", { regex: true }))
      .toEqual({ matches: [], error: { code: "input-too-large" } });
    const entry = exactTextIndex("a")[0];
    expect(searchMatches(Array.from({ length: SEARCH_REGEX_LIMITS.entries + 1 }, () => entry), "a", { regex: true }).error?.code)
      .toBe("input-too-large");
    const entries = [...exactTextIndex("done"), ...exactTextIndex("a".repeat(100_000))];
    expect(searchMatches(entries, "a*".repeat(100) + "!", { regex: true })).toEqual({ matches: [], error: { code: "work-limit" } });
    expect(searchMatches(exactTextIndex("a".repeat(100_000) + "!"), "^a+a+a+a+$", { regex: true }).matches).toEqual([]);
  });
});
