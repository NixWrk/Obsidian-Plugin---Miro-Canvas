import { afterEach, describe, expect, it, vi } from "vitest";

import type { App, TFile } from "obsidian";
import { setLocale, words } from "../src/i18n";
import { validateMiroCanvasMetadata } from "../src/metadata";
import {
  buildWelcomeBoard,
  createWelcomeBoard,
  sampleCanvasContent,
  sampleNoteContent,
  welcomeSamplePaths,
  type WelcomeBoardHost,
} from "../src/welcome-board";

interface CanvasNode {
  readonly id: string;
  readonly type: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly text?: string;
  readonly label?: string;
  readonly file?: string;
}

/** A fake vault, just real enough for createWelcomeBoard: paths already in `existing` are there from the start; every write lands in the same map. */
function fakeHost(existing: Iterable<string> = []): {
  readonly host: WelcomeBoardHost;
  readonly files: Map<string, { readonly path: string }>;
  readonly createFolder: ReturnType<typeof vi.fn>;
  readonly create: ReturnType<typeof vi.fn>;
  readonly createBinary: ReturnType<typeof vi.fn>;
  readonly openFile: ReturnType<typeof vi.fn>;
} {
  const files = new Map<string, { readonly path: string }>();
  for (const path of existing) files.set(path, { path });
  const createFolder = vi.fn(async (path: string) => { files.set(path, { path }); });
  const create = vi.fn(async (path: string, _content: string) => {
    const file = { path };
    files.set(path, file);
    return file;
  });
  const createBinary = vi.fn(async (path: string, _data: Uint8Array) => {
    const file = { path };
    files.set(path, file);
    return file;
  });
  const openFile = vi.fn(async () => {});
  const app = {
    vault: {
      getAbstractFileByPath: (path: string) => files.get(path) ?? null,
      createFolder,
      create,
      createBinary,
    },
    workspace: { getLeaf: () => ({ openFile }) },
  } as unknown as App;
  const isFile = (value: unknown): value is TFile =>
    typeof value === "object" && value !== null && "path" in value;
  return { host: { app, isFile }, files, createFolder, create, createBinary, openFile };
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
    expect(frames[10]!.label).toContain("Файлы");
    expect(frames[11]!.label).toContain("Экспорт");
  });

  it("points the files frame at the board's five sample files by default", () => {
    const document = buildWelcomeBoard();
    const paths = welcomeSamplePaths();
    const nodes = nodesOf(document);
    const fileNodes = nodes.filter((node) => node.type === "file");
    expect(fileNodes).toHaveLength(5);
    expect(fileNodes.map((node) => node.file).sort()).toEqual(
      [paths.note, paths.canvas, paths.picture, paths.pdf, paths.docx].sort(),
    );
    const filesFrame = nodes.filter((node) => node.type === "group")[10]!;
    for (const fileNode of fileNodes) {
      expect(frame(filesFrame, fileNode.x, fileNode.y, fileNode.width, fileNode.height)).toBe(true);
    }
  });

  it("builds its file nodes from given sample paths, with no vault involved", () => {
    const samples = {
      folder: "Sample folder", note: "Sample folder/n.md", canvas: "Sample folder/c.canvas",
      picture: "Sample folder/p.png", pdf: "Sample folder/d.pdf", docx: "Sample folder/w.docx",
    };
    const document = buildWelcomeBoard({ samples });
    const fileNodes = nodesOf(document).filter((node) => node.type === "file");
    expect(fileNodes.map((node) => node.file).sort()).toEqual(
      [samples.note, samples.canvas, samples.picture, samples.pdf, samples.docx].sort(),
    );
  });
});

describe("sampleNoteContent and sampleCanvasContent", () => {
  it("writes an intro, a two-item list and a wiki link back to the board, and no heading repeating its name", () => {
    const note = sampleNoteContent();
    expect(note).not.toMatch(/^#/m);
    expect(note).toContain("This is an ordinary note");
    expect(note.match(/^- /gm)).toHaveLength(2);
    expect(note).toContain("[[Miro Canvas - Welcome]]");
  });

  it("builds a small canvas with two cards joined by one native edge", () => {
    const canvas = JSON.parse(sampleCanvasContent()) as { nodes: unknown[]; edges: { fromNode: string; toNode: string }[] };
    expect(canvas.nodes).toHaveLength(2);
    expect(canvas.edges).toHaveLength(1);
    const ids = canvas.nodes.map((node) => (node as { id: string }).id);
    expect(ids).toContain(canvas.edges[0]!.fromNode);
    expect(ids).toContain(canvas.edges[0]!.toNode);
  });
});

describe("createWelcomeBoard", () => {
  it("creates the sample folder and every sample file, then the board, when nothing exists yet", async () => {
    const paths = welcomeSamplePaths();
    const boardPath = words().welcome.fileName;
    const { host, createFolder, create, createBinary, openFile } = fakeHost();
    await createWelcomeBoard(host);
    expect(createFolder).toHaveBeenCalledWith(paths.folder);
    expect(create).toHaveBeenCalledWith(paths.note, sampleNoteContent());
    expect(create).toHaveBeenCalledWith(paths.canvas, sampleCanvasContent());
    expect(create).toHaveBeenCalledWith(boardPath, expect.any(String));
    expect(createBinary).toHaveBeenCalledTimes(3);
    expect(openFile).toHaveBeenCalled();
  });

  it("writes nothing when the folder and every sample and the board already exist", async () => {
    const paths = welcomeSamplePaths();
    const boardPath = words().welcome.fileName;
    const { host, createFolder, create, createBinary, openFile, files } = fakeHost(
      [paths.folder, paths.note, paths.canvas, paths.picture, paths.pdf, paths.docx, boardPath],
    );
    const boardBefore = files.get(boardPath);
    await createWelcomeBoard(host);
    expect(createFolder).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(createBinary).not.toHaveBeenCalled();
    expect(openFile).toHaveBeenCalledWith(boardBefore, { active: true });
  });

  it("creates only what is missing, and never rewrites a sample that is already there", async () => {
    const paths = welcomeSamplePaths();
    const { host, createFolder, create, createBinary } = fakeHost([paths.folder, paths.note]);
    await createWelcomeBoard(host);
    expect(createFolder).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalledWith(paths.note, expect.any(String));
    expect(create).toHaveBeenCalledWith(paths.canvas, sampleCanvasContent());
    expect(createBinary).toHaveBeenCalledTimes(3);
  });
});
