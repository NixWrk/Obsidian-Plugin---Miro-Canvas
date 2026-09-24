import { afterEach, describe, expect, it } from "vitest";

import { setLocale } from "../src/i18n";
import { validateMiroCanvasMetadata } from "../src/metadata";
import { buildWelcomeBoard } from "../src/welcome-board";

interface CanvasNode {
  readonly id: string;
  readonly type: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly text?: string;
  readonly label?: string;
}

interface CanvasEdge {
  readonly id: string;
  readonly fromNode: string;
  readonly toNode: string;
}

function nodesOf(document: Record<string, unknown>): CanvasNode[] {
  return document.nodes as CanvasNode[];
}

function edgesOf(document: Record<string, unknown>): CanvasEdge[] {
  return document.edges as CanvasEdge[];
}

function frame(rect: CanvasNode, dx: number, dy: number, dw: number, dh: number): boolean {
  return dx >= rect.x && dy >= rect.y && dx + dw <= rect.x + rect.width && dy + dh <= rect.y + rect.height;
}

afterEach(() => {
  setLocale("en");
});

describe("buildWelcomeBoard", () => {
  it("lays out twelve frames in reading order", () => {
    const document = buildWelcomeBoard();
    const frames = nodesOf(document).filter((node) => node.type === "group");
    expect(frames).toHaveLength(12);
    // Reading order: left to right, then top to bottom.
    for (let index = 1; index < frames.length; index += 1) {
      const previous = frames[index - 1]!;
      const current = frames[index]!;
      const sameRow = current.y === previous.y;
      expect(sameRow ? current.x > previous.x : current.y > previous.y).toBe(true);
    }
    frames.forEach((frameNode, index) => {
      expect(frameNode.label).toContain(`${index + 1}.`);
    });
  });

  it("puts every card inside its own frame", () => {
    const document = buildWelcomeBoard();
    const nodes = nodesOf(document);
    const frames = nodes.filter((node) => node.type === "group");
    const cards = nodes.filter((node) => node.type !== "group");
    for (const card of cards) {
      const fits = frames.some((frameNode) => frame(frameNode, card.x, card.y, card.width, card.height));
      expect(fits).toBe(true);
    }
  });

  it("builds metadata that validates against the plugin's own schema", () => {
    const document = buildWelcomeBoard();
    const result = validateMiroCanvasMetadata(document.miroCanvas);
    expect(result.diagnostics.filter((item) => item.severity === "error")).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("never repeats a node or edge id", () => {
    const document = buildWelcomeBoard();
    const ids = [...nodesOf(document).map((node) => node.id), ...edgesOf(document).map((edge) => edge.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("points every edge and connector at a node that exists", () => {
    const document = buildWelcomeBoard();
    const nodeIds = new Set(nodesOf(document).map((node) => node.id));
    for (const edge of edgesOf(document)) {
      expect(nodeIds.has(edge.fromNode)).toBe(true);
      expect(nodeIds.has(edge.toNode)).toBe(true);
    }
    const metadata = document.miroCanvas as { readonly connectors?: Record<string, { readonly from: unknown; readonly to: unknown }> };
    for (const connector of Object.values(metadata.connectors ?? {})) {
      for (const end of [connector.from, connector.to]) {
        const anchor = end as { readonly type: string; readonly nodeId?: string };
        if (anchor.type === "node" || anchor.type === "image") {
          expect(nodeIds.has(anchor.nodeId!)).toBe(true);
        }
      }
    }
  });

  it("lays an export page over Welcome and Sticky notes", () => {
    const document = buildWelcomeBoard();
    const frames = nodesOf(document).filter((node) => node.type === "group");
    const metadata = document.miroCanvas as { readonly export: { readonly pages: readonly CanvasNode[] } };
    expect(metadata.export.pages).toHaveLength(2);
    const covers = (page: CanvasNode, target: CanvasNode): boolean =>
      page.x <= target.x && page.y <= target.y
      && page.x + page.width >= target.x + target.width && page.y + page.height >= target.y + target.height;
    expect(covers(metadata.export.pages[0]!, frames[0]!)).toBe(true);
    expect(covers(metadata.export.pages[1]!, frames[3]!)).toBe(true);
  });

  it("never puts an HTML tag in a card's text", () => {
    const document = buildWelcomeBoard();
    for (const node of nodesOf(document)) {
      if (typeof node.text === "string") expect(node.text).not.toMatch(/<[a-zA-Z/]/);
      if (typeof node.label === "string") expect(node.label).not.toMatch(/<[a-zA-Z/]/);
    }
  });

  it("builds the same document twice from the same seed", () => {
    expect(buildWelcomeBoard({ seed: 7 })).toEqual(buildWelcomeBoard({ seed: 7 }));
  });

  it("shows text and colour the way the selection toolbar writes them", () => {
    const document = buildWelcomeBoard();
    const overrides = Object.values((document.miroCanvas as { readonly localOverrides: Record<string, Record<string, unknown>> }).localOverrides);
    const typography = overrides.map((entry) => entry.typography as Record<string, unknown> | undefined).filter((entry) => entry !== undefined);
    const colors = overrides.map((entry) => entry.colors as Record<string, unknown> | undefined).filter((entry) => entry !== undefined);
    expect(typography.map((entry) => entry!.fontFamily)).toEqual(expect.arrayContaining(["Inter", "Source Code Pro", "sans-serif", "serif"]));
    for (const mark of ["bold", "italic", "underline", "strike"]) {
      expect(typography.some((entry) => (entry!.format as Record<string, unknown> | undefined)?.[mark] === true), mark).toBe(true);
    }
    expect(typography.map((entry) => entry!.verticalAlign)).toEqual(expect.arrayContaining(["top", "center", "bottom"]));
    expect(colors.some((entry) => typeof entry!.highlight === "string")).toBe(true);
    expect(colors.some((entry) => typeof entry!.fill === "string")).toBe(true);
    expect(overrides.map((entry) => entry.borderStyle)).toEqual(expect.arrayContaining(["solid", "dashed", "dotted", "none"]));
  });

  it("writes Russian titles once the locale is Russian", () => {
    setLocale("ru");
    const document = buildWelcomeBoard();
    const frames = nodesOf(document).filter((node) => node.type === "group");
    expect(frames[0]!.label).toContain("Знакомство");
    expect(frames[3]!.label).toContain("Стикеры");
  });
});
