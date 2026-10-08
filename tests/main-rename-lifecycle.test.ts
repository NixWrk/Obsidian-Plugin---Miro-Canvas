import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { transformSync } from "esbuild";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { CanvasAuthoring } from "../src/canvas-authoring";
import { graphDrift } from "../src/native-graph";
import { cloneCanvasJson } from "../src/canvas-json";
import { extractBoardKnowledge, type BoardKnowledge } from "../src/board-knowledge";
import { planBoardLinkRename } from "../src/board-link-lifecycle";
import { prepareBoardMetadataRename } from "../src/board-metadata-maintenance";
import { MetadataWriter } from "../src/metadata-writer";

// Pre-fix trace: native Windows notes receipt passes search/property edges but
// fails text rename after FileManager's Just once prompt and renameWork settlement.
// Bare links require resolvedPath + original UTF-16/node evidence from BEFORE rename.
// Main must not resolve them after rename or guess from file cards/basenames.
// Its current focus-only session gate and metadata-only inactive-view branch
// independently drop valid text maintenance. Preserve full source/unknown graph
// data, native readonly/lock/history checks and closed-board MetadataWriter CAS.
// renameWork must await the explicit native view.save plus checked disk content;
// a queued requestSave alone is not a file persistence receipt. Recheck live
// identity/busy/snapshot after each wait; never hook the checked requestSave method.
// These extracted-method tests are synthetic adapter evidence, not native acceptance.
type Data = Record<string, unknown>;
const source = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
const ast = ts.createSourceFile("main.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const plugin = ast.statements.find(ts.isClassDeclaration)!;
const names = ["shellDisposed", "renameWork", "renameReceipt", "configureBoardIndex", "maintainRenamedBoards", "renameViewBusy", "persistRenamedBoard", "renameBoardReferences"];
const methods = names.flatMap((name) => {
  const member = plugin.members.find((item) => item.name?.getText(ast) === name);
  return member === undefined ? [] : [member.getText(ast)];
}).join("\n");
const code = transformSync(`class RenameProbe { ${methods} } this.RenameProbe = RenameProbe;`, { loader: "ts", target: "es2020" }).code;

class File {
  public readonly extension: string;
  public stat: { mtime: number; size: number };
  public constructor(public path: string, public text: string) {
    this.extension = path.split(".").pop()!;
    this.stat = { mtime: 1, size: text.length };
  }
}

const text = (id: string, value: string): Data => ({ id, type: "text", text: value, x: 0, y: 0, width: 100, height: 60, future: { keep: id } });
const fileCard = (id: string, path: string): Data => ({ id, type: "file", file: path, subpath: "#Heading", x: 200, y: 0, width: 100, height: 100, future: { keep: id } });
function document(): Data {
  return {
    nodes: [text("a", '[[Unique B#Heading|Alias]] ![[Unique B#^block]] [B](<Notes/Unique B.md#Heading> "title")'),
      fileCard("target-file", "Notes/Unique B.md"), text("other", "[[Other/Unique B]]")],
    edges: [{ id: "edge", fromNode: "a", toNode: "target-file", future: { keep: "edge" } }],
    miroCanvas: { schemaVersion: 1, properties: { related: "[[Unique B]]", future: { untouched: true } },
      nodeRedirects: { old: { file: "Notes/Unique B.md", nodeId: "a", future: { keep: true } } }, future: { keep: true } },
    miroSource: { text: "[[Unique B]]", future: { evidence: [1, 2] } }, future: { keep: [1, 2, 3] },
  };
}

function evidence(board: Data): BoardKnowledge {
  const knowledge = extractBoardKnowledge(board)!;
  for (const reference of [...knowledge.links, ...knowledge.embeds, ...knowledge.frontmatterLinks]) {
    reference.resolvedPath = reference.link.startsWith("Other/") ? "Other/Unique B.md" : "Notes/Unique B.md";
  }
  return knowledge;
}

function nativeView(file: File, board: Data) {
  const history = { data: [cloneCanvasJson(board)], current: 0, max: 100 };
  let pending: Data | undefined;
  const queue = Object.assign((next: Data) => { pending = cloneCanvasJson(next); }, {
    run: () => {
      if (pending === undefined) return;
      history.data.splice(history.current + 1);
      history.data.push(pending);
      history.current = history.data.length - 1;
      pending = undefined;
    }, cancel: () => { pending = undefined; },
  });
  const canvas = {
    data: cloneCanvasJson(board), readonly: false, isDragging: false, history, requestPushHistory: queue,
    getData() { return cloneCanvasJson(this.data); },
    importData: vi.fn(function (this: { data: Data }, next: Data) { this.data = cloneCanvasJson(next); }),
    requestSave: vi.fn(function (this: { data: Data; getData(): Data }, addHistory: boolean) { this.data = this.getData(); if (addHistory) queue(this.data); }),
  };
  return { file, canvas, saving: false, getViewType: () => "canvas", save: vi.fn(async () => {
    file.text = JSON.stringify(canvas.data);
    file.stat = { mtime: file.stat.mtime + 1, size: file.text.length };
  }) };
}

function fixture(board = document()) {
  const boardFile = new File("Board.canvas", JSON.stringify(board));
  const renamed = new File("Notes/Renamed.md", "Note");
  const files = new Map([[boardFile.path, boardFile], [renamed.path, renamed]]);
  const view = nativeView(boardFile, board);
  const leaves: Array<{ view: ReturnType<typeof nativeView> }> = [{ view }];
  const authoring = new CanvasAuthoring(view);
  const session = {
    view, authoring,
    actionSnapshot: vi.fn(() => authoring.readSnapshot().document),
    featureBusy: vi.fn(() => false),
    applyFeatureDocument: vi.fn((next: unknown, before: Data) => authoring.applyDocument(next, before).ok),
  };
  const callbacks: { onRename?: (file: File, oldPath: string, boards: ReadonlyMap<string, BoardKnowledge>) => void } = {};
  const index = { start: vi.fn(), dispose: vi.fn(), reindex: vi.fn(), flush: vi.fn(async () => {}), ingestLiveDocument: vi.fn(), releaseLiveDocument: vi.fn() };
  const vault = {
    getAbstractFileByPath: vi.fn((path: string) => files.get(path) ?? null),
    read: vi.fn(async (file: File) => file.text),
    process: vi.fn(async (file: File, transform: (current: string) => string) => { file.text = transform(file.text); return file.text; }),
  };
  class Sidecar { public start() {} public dispose() {} public refresh() {} }
  const context = createContext({
    TFile: File, CanvasAuthoring, graphDrift, cloneCanvasJson, planBoardLinkRename, prepareBoardMetadataRename, MetadataWriter,
    structuredClone, Date, window: { setTimeout },
    createObsidianBoardIndex: (_app: unknown, options: typeof callbacks) => { Object.assign(callbacks, options); return index; },
    CanvasOutgoingLinks: Sidecar, CanvasPropertyResults: Sidecar, CanvasBacklinks: Sidecar,
    createObsidianMetadataStore: vi.fn(() => ({ store: undefined })), words: () => ({ enhancements: { propertyResults: {} } }),
  });
  runInContext(code, context);
  const instance = new context.RenameProbe();
  instance.app = { vault, workspace: { getLeavesOfType: () => leaves } };
  instance.canvasSettings = { boardKnowledge: true, automaticPropertyEdges: false };
  instance.currentCanvasView = view;
  instance.m1Session = session;
  instance.activeM1Session = () => session;
  instance.configureBoardIndex();
  const beforeKnowledge = evidence(board);
  const rename = (knowledge = beforeKnowledge) => callbacks.onRename!(renamed, "Notes/Unique B.md", new Map([[boardFile.path, knowledge]]));
  return { instance, context, files, boardFile, renamed, view, session, authoring, leaves, vault, index, beforeKnowledge, rename };
}

function checkPreservation(actual: Data, original: Data): void {
  expect(actual.miroSource).toEqual(original.miroSource);
  expect(actual.future).toEqual(original.future);
  expect((actual.miroCanvas as Data).future).toEqual((original.miroCanvas as Data).future);
  expect((actual.nodes as Data[]).map((node) => node.future)).toEqual((original.nodes as Data[]).map((node) => node.future));
  expect(actual.edges).toEqual(original.edges);
  expect((actual.nodes as Data[])[2].text).toBe("[[Other/Unique B]]");
}

describe("actual main historical rename lifecycle", () => {
  it("updates a bound current board after prompt focus changes, using historical evidence", async () => {
    const original = document();
    const f = fixture(original);
    f.instance.activeM1Session = () => null;
    // Native file cards can already point to the renamed TFile before text maintenance.
    (f.view.canvas.data.nodes as Data[])[1].file = "Notes/Renamed.md";
    f.rename();
    await f.instance.renameWork;
    const updated = f.view.canvas.getData();
    expect((updated.nodes as Data[])[0].text).toBe('[[Notes/Renamed#Heading|Alias]] ![[Notes/Renamed#^block]] [B](<Notes/Renamed.md#Heading> "title")');
    expect((updated.nodes as Data[])[1].file).toBe("Notes/Renamed.md");
    expect((updated.miroCanvas as Data).properties).toEqual({ related: "[[Notes/Renamed]]", future: { untouched: true } });
    checkPreservation(updated, original);
    expect(f.view.canvas.history.data).toHaveLength(2);
    expect(JSON.parse(f.boardFile.text)).toEqual(updated);
    expect(f.instance.renameReceipt.boards[0].save).toBe("saved");
    expect(f.view.save).toHaveBeenCalledTimes(1);
    expect(f.vault.process).not.toHaveBeenCalled();
  });

  it("updates full references in another open native view without activating or creating a leaf", async () => {
    const original = document();
    const f = fixture(original);
    f.instance.currentCanvasView = {};
    f.instance.m1Session = null;
    f.instance.activeM1Session = () => null;
    f.rename();
    await f.instance.renameWork;
    expect((f.view.canvas.data.nodes as Data[])[0].text).toContain("Notes/Renamed");
    expect(f.view.canvas.history.data).toHaveLength(2);
    expect((JSON.parse(f.boardFile.text).nodes as Data[])[0].text).toContain("Notes/Renamed");
    checkPreservation(f.view.canvas.getData(), original);
    expect(f.vault.process).not.toHaveBeenCalled();
  });

  it("does not infer bare-link targets from a renamed file card or post-rename resolution", async () => {
    const original = document();
    const f = fixture(original);
    const knowledge = extractBoardKnowledge(original)!;
    (f.view.canvas.data.nodes as Data[])[1].file = "Notes/Renamed.md";
    f.rename(knowledge);
    await f.instance.renameWork;
    expect((f.view.canvas.data.nodes as Data[])[0].text).toBe((original.nodes as Data[])[0].text);
    expect((f.view.canvas.data.nodes as Data[])[2].text).toBe("[[Other/Unique B]]");
    expect(f.instance.renameReceipt.boards[0].diagnostics).toContain("missing-text-target");
    expect(f.instance.renameReceipt.boards[0].references[0]).toMatchObject({ nodeId: "a", link: "Unique B#Heading" });
  });

  it("keeps historical resolution detached while async rename work is queued", async () => {
    const f = fixture();
    let release!: () => void;
    f.instance.renameWork = new Promise<void>((done) => { release = done; });
    f.rename();
    for (const reference of [...f.beforeKnowledge.links, ...f.beforeKnowledge.embeds, ...f.beforeKnowledge.frontmatterLinks]) delete reference.resolvedPath;
    release();
    await f.instance.renameWork;
    expect((f.view.canvas.data.nodes as Data[])[0].text).toContain("Notes/Renamed");
  });

  it("refuses readonly or locked native text changes without bypassing native fences", async () => {
    const f = fixture();
    f.view.canvas.readonly = true;
    f.rename();
    await f.instance.renameWork;
    expect(f.view.canvas.data).toEqual(document());
    expect(f.view.canvas.importData).not.toHaveBeenCalled();
    expect(f.instance.renameReceipt.boards[0].status).toBe("native-feature-refused");
    const locked = document();
    (locked.miroCanvas as Data).localOverrides = { a: { locked: true } };
    const second = fixture(locked);
    second.rename();
    await second.instance.renameWork;
    expect(second.view.canvas.data).toEqual(locked);
    expect(second.view.canvas.importData).not.toHaveBeenCalled();
  });

  it("leaves stale text evidence untouched while maintaining independent direct paths", async () => {
    const original = document();
    const f = fixture(original);
    (f.view.canvas.data.nodes as Data[])[0].text = "User edited [[Unique B]]";
    f.rename();
    await f.instance.renameWork;
    expect((f.view.canvas.data.nodes as Data[])[0].text).toBe("User edited [[Unique B]]");
    expect((f.view.canvas.data.nodes as Data[])[1].file).toBe("Notes/Renamed.md");
    expect(f.instance.renameReceipt.boards[0].diagnostics).toContain("stale-text-reference");
    expect(f.view.canvas.data.miroSource).toEqual(original.miroSource);
  });

  it("keeps closed-board maintenance metadata-only and preserves the exact source CAS", async () => {
    const f = fixture();
    f.leaves.length = 0;
    f.rename();
    await f.instance.renameWork;
    const saved = JSON.parse(f.boardFile.text) as Data;
    expect((saved.miroCanvas as Data).properties).toEqual({ related: "[[Notes/Renamed]]", future: { untouched: true } });
    expect(saved.nodes).toEqual(document().nodes);
    checkPreservation(saved, document());
    expect(f.vault.process).toHaveBeenCalledTimes(1);
  });

  it("does not overwrite a closed board edited or opened after its async read", async () => {
    for (const race of ["edit", "open"]) {
      const f = fixture();
      f.leaves.length = 0;
      f.vault.read.mockImplementationOnce(async (file) => {
        const text = file.text;
        if (race === "edit") file.text = text.replace('"keep":[1,2,3]', '"keep":[4]');
        else f.leaves.push({ view: f.view });
        return text;
      });
      f.rename();
      await f.instance.renameWork;
      expect((JSON.parse(f.boardFile.text).miroCanvas as Data).properties).toEqual((document().miroCanvas as Data).properties);
    }
  });

  it("waits for a held gesture without requiring active focus and keeps unrelated native edits", async () => {
    vi.useFakeTimers();
    try {
      const f = fixture();
      f.instance.activeM1Session = () => null;
      f.session.featureBusy.mockReturnValue(true);
      f.rename();
      await Promise.resolve();
      expect(f.session.applyFeatureDocument).not.toHaveBeenCalled();
      (f.view.canvas.data.nodes as Data[])[2].text = "Unrelated user change";
      f.session.featureBusy.mockReturnValue(false);
      await vi.advanceTimersByTimeAsync(50);
      await f.instance.renameWork;
      expect((f.view.canvas.data.nodes as Data[])[0].text).toContain("Notes/Renamed");
      expect((f.view.canvas.data.nodes as Data[])[2].text).toBe("Unrelated user change");
    } finally { vi.useRealTimers(); }
  });

  it("bounds a held-gesture wait and refuses writes after disposal or view replacement", async () => {
    vi.useFakeTimers();
    try {
      for (const race of ["timeout", "dispose", "replacement"]) {
        const f = fixture();
        f.view.canvas.isDragging = true;
        f.rename();
        for (let turn = 0; turn < 5; turn += 1) await Promise.resolve();
        if (race === "dispose") f.instance.shellDisposed = true;
        if (race === "replacement") { f.leaves.length = 0; f.view.canvas.isDragging = false; }
        await vi.advanceTimersByTimeAsync(race === "timeout" ? 5000 : 50);
        await f.instance.renameWork;
        expect(f.view.canvas.data).toEqual(document());
        expect(f.view.canvas.requestSave).not.toHaveBeenCalled();
        if (race === "timeout") expect(f.instance.renameReceipt.boards[0].status).toBe("view-busy");
        if (race === "replacement") expect(f.instance.renameReceipt.boards[0].status).toBe("view-or-file-changed");
      }
    } finally { vi.useRealTimers(); }
  });

  it("refuses changed source or renamed-file identity before queued maintenance", async () => {
    for (const race of ["source", "target"]) {
      const f = fixture();
      let release!: () => void;
      f.instance.renameWork = new Promise<void>((done) => { release = done; });
      f.rename();
      const old = race === "source" ? f.boardFile : f.renamed;
      f.files.set(old.path, new File(old.path, old.text));
      release();
      await f.instance.renameWork;
      expect(f.session.applyFeatureDocument).not.toHaveBeenCalled();
      expect(f.vault.process).not.toHaveBeenCalled();
      expect(f.instance.renameReceipt.boards[0].status).toBe("file-identity-changed");
    }
  });

  it("updates generated property-edge target metadata while preserving its unknown fields", async () => {
    const original = document();
    (original.edges as Data[]).push({ id: "generated", fromNode: "a", toNode: "target-file", future: { keep: true },
      miroCanvas: { generatedRelation: { owner: "miro-canvas", kind: "note-property", version: 1, fromNode: "a", toNode: "target-file",
        property: "related", sourcePath: "Notes/Unique A.md", targetPath: "Notes/Unique B.md", future: { keep: true } } } });
    const f = fixture(original);
    f.rename();
    await f.instance.renameWork;
    const generated = (f.view.canvas.data.edges as Data[])[1];
    expect(generated.future).toEqual({ keep: true });
    expect((generated.miroCanvas as Data).generatedRelation).toMatchObject({ sourcePath: "Notes/Unique A.md", targetPath: "Notes/Renamed.md", future: { keep: true } });
    expect(f.view.canvas.data.miroSource).toEqual(original.miroSource);
    expect((f.view.canvas.data.edges as Data[])[0]).toEqual((original.edges as Data[])[0]);
  });

  it("adapts renamed folder source paths and maintains open boards with one native history step", async () => {
    const original = document();
    const f = fixture(original);
    f.files.delete(f.boardFile.path);
    f.boardFile.path = "Moved/Board.canvas";
    f.files.set(f.boardFile.path, f.boardFile);
    const folder = { path: "Moved" };
    f.files.set("Moved", folder as File);
    const renamedBoard = cloneCanvasJson(original);
    (renamedBoard.nodes as Data[])[1].file = "Old/Unique B.md";
    f.view.canvas.data = renamedBoard;
    const historical = evidence(renamedBoard);
    for (const reference of [...historical.links, ...historical.embeds, ...historical.frontmatterLinks]) {
      if (reference.resolvedPath === "Notes/Unique B.md") reference.resolvedPath = "Old/Unique B.md";
    }
    f.instance.maintainRenamedBoards(folder, "Old", new Map([["Old/Board.canvas", historical]]));
    await f.instance.renameWork;
    expect((f.view.canvas.data.nodes as Data[])[0].text).toContain("Moved/Unique B");
    expect((f.view.canvas.data.nodes as Data[])[1].file).toBe("Moved/Unique B.md");
    expect(f.view.canvas.history.data).toHaveLength(2);
    expect(f.instance.renameReceipt.boards[0].path).toBe("Moved/Board.canvas");
    expect(f.view.canvas.data.miroSource).toEqual(original.miroSource);
  });

  it("awaits native saveAgain persistence before renameWork resolves without hooking requestSave", async () => {
    vi.useFakeTimers();
    try {
      const f = fixture();
      const requestSave = f.view.canvas.requestSave;
      f.view.save.mockImplementation(async () => {
        f.view.saving = true;
        setTimeout(() => {
          f.boardFile.text = JSON.stringify(f.view.canvas.data);
          f.boardFile.stat = { mtime: 2, size: f.boardFile.text.length };
          f.view.saving = false;
        }, 20);
      });
      f.rename();
      await vi.advanceTimersByTimeAsync(50);
      await f.instance.renameWork;
      expect(f.instance.renameReceipt.boards[0].save).toBe("saved");
      expect((JSON.parse(f.boardFile.text).nodes as Data[])[0].text).toContain("Notes/Renamed");
      expect(f.view.canvas.requestSave).toBe(requestSave);
      expect(f.view.canvas.requestSave).toHaveBeenCalledTimes(1);
      expect(f.view.canvas.history.data).toHaveLength(2);
    } finally { vi.useRealTimers(); }
  });

  it("reports unverified disk serialization without rolling back or claiming persisted text", async () => {
    const f = fixture();
    f.view.save.mockImplementation(async () => {});
    f.rename();
    await f.instance.renameWork;
    expect((f.view.canvas.data.nodes as Data[])[0].text).toContain("Notes/Renamed");
    expect((JSON.parse(f.boardFile.text).nodes as Data[])[0].text).toContain("[[Unique B#Heading");
    expect(f.instance.renameReceipt.boards[0]).toMatchObject({ status: "applied", save: "disk-unverified" });
    expect(f.view.canvas.history.data).toHaveLength(2);
  });

  it("does not force saving user changes/held previews after an awaited prior native save", async () => {
    vi.useFakeTimers();
    try {
      const f = fixture();
      f.view.saving = true;
      f.rename();
      setTimeout(() => {
        (f.view.canvas.data.future as Data).user = "Concurrent edit";
        f.view.saving = false;
      }, 20);
      await vi.advanceTimersByTimeAsync(50);
      await f.instance.renameWork;
      expect(f.view.save).not.toHaveBeenCalled();
      expect((f.view.canvas.data.future as Data).user).toBe("Concurrent edit");
      expect(f.instance.renameReceipt.boards[0].save).toBe("source-changed-or-busy");
    } finally { vi.useRealTimers(); }
  });
});
