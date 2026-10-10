import { describe, expect, it, vi } from "vitest";
import { LinkedNoteSearch, LINKED_NOTE_SEARCH_LIMITS, sliceLinkedNoteText, type LinkedNoteStat } from "../src/linked-note-search";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function startRead(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function fixture() {
  const files = new Map<string, { text: string; stat: LinkedNoteStat }>([["Plan.md", { text: "original", stat: { mtime: 1, size: 8 } }]]);
  const stat = vi.fn((path: string) => files.get(path)?.stat);
  const read = vi.fn(async (path: string, _signal: AbortSignal) => files.get(path)?.text ?? "");
  const service = new LinkedNoteSearch({ stat, read });
  return { files, stat, read, service };
}

describe("linked note section bounds", () => {
  it("includes descendants and excludes siblings/earlier material", () => {
    const text = "preamble\n# Parent\n**Read** this\n## Child\nNested\n## Peer\nOther\n# Next\nLater";
    expect(sliceLinkedNoteText(text, "#Parent")).toBe("# Parent\n**Read** this\n## Child\nNested\n## Peer\nOther");
    expect(sliceLinkedNoteText(text, "#Parent#Child")).toBe("## Child\nNested");
    expect(sliceLinkedNoteText(text, "#parent#missing")).toBe("");
    expect(sliceLinkedNoteText(text, "#%50arent")).toContain("Read");
  });

  it("supports setext and formatted headings, duplicate child names and CRLF", () => {
    const text = "Parent\r\n======\r\n### **Child**\r\nYes\r\nParent\r\n======\r\nNo";
    expect(sliceLinkedNoteText(text, "#Parent#Child")).toBe("### **Child**\nYes");
    expect(sliceLinkedNoteText("# Same\n## Same\nInside\n# End\nOutside", "#Same#Same")).toBe("## Same\nInside");
  });

  it("ignores fake anchors in fenced code/frontmatter and fails closed on missing/invalid subpaths", () => {
    const text = "---\n# fake\n---\n```md\n# Fake\nCode ^code\n```\n~~~\n# Fake\n~~~\n# Real\nActual";
    expect(sliceLinkedNoteText(text, "#Fake")).toBe("");
    expect(sliceLinkedNoteText(text, "#^code")).toBe("");
    expect(sliceLinkedNoteText(text, "#Real")).toBe("# Real\nActual");
    expect(sliceLinkedNoteText(text, "no-hash")).toBe("");
    expect(sliceLinkedNoteText(text, "#%ZZ")).toBe("");
    expect(sliceLinkedNoteText(text, "#")).toBe(text);
    expect(sliceLinkedNoteText(text)).toBe(text);
  });

  it("slices inline and standalone paragraph/list IDs without unrelated paragraphs", () => {
    const text = "Unrelated\n\nLine one\nLine two ^task\n\nLater\n\n- one\n- two\n\n^list\n\nEnd";
    expect(sliceLinkedNoteText(text, "#^task")).toBe("Line one\nLine two");
    expect(sliceLinkedNoteText(text, "#^list")).toBe("- one\n- two");
    expect(sliceLinkedNoteText(text, "#^missing")).toBe("");
    expect(sliceLinkedNoteText(text, "#^list.*")).toBe("");
    expect(sliceLinkedNoteText("# Heading\nParagraph ^p\n\nLater", "#^p")).toBe("Paragraph");
    expect(sliceLinkedNoteText("# 100% done\nProgress\n# Next", "#100% done")).toBe("# 100% done\nProgress");
  });

  it("scans long whitespace lines and fence markers without backtracking", () => {
    const spacing = " ".repeat(100_000);
    const text = `# Section\n${spacing}\nParagraph ^block\n# Next\nOutside`;
    expect(sliceLinkedNoteText(text, "#^block")).toBe("Paragraph");
    expect(sliceLinkedNoteText(text, "#Section")).not.toContain("Outside");
    expect(sliceLinkedNoteText("`".repeat(100_000) + "\n# Fake\n```\n# Real\nActual", "#Fake")).toBe("");
  });
});

describe("bounded linked note cache", () => {
  it("reads once per path/mtime and no files during construction or invalidation", async () => {
    const { service, files, read } = fixture();
    expect(read).not.toHaveBeenCalled();
    expect((await service.load(["Plan.md", "Plan.md"])).noteTexts.get("Plan.md")).toBe("original");
    await service.load(["Plan.md"]);
    expect(read).toHaveBeenCalledTimes(1);
    files.set("Plan.md", { text: "edited", stat: { mtime: 2, size: 6 } });
    expect((await service.load(["Plan.md"])).noteTexts.get("Plan.md")).toBe("edited");
    expect(read).toHaveBeenCalledTimes(2);
    service.invalidate("Plan.md");
    expect(read).toHaveBeenCalledTimes(2);
    await service.load(["Plan.md"]);
    expect(read).toHaveBeenCalledTimes(3);
  });

  it("handles missing files, rename, same-mtime invalidation and adapter failures", async () => {
    const { service, files, read } = fixture();
    await service.load(["Plan.md"]);
    files.set("Renamed.md", files.get("Plan.md")!);
    files.delete("Plan.md");
    service.invalidate("Plan.md");
    service.invalidate("Renamed.md");
    const result = await service.load(["Plan.md", "Renamed.md"]);
    expect([...result.noteTexts.keys()]).toEqual(["Renamed.md"]);
    expect(result.issues).toEqual([{ path: "Plan.md", code: "missing" }]);
    read.mockRejectedValueOnce(new Error("locked"));
    service.invalidate("Renamed.md");
    expect((await service.load(["Renamed.md"])).issues).toEqual([{ path: "Renamed.md", code: "read-failed" }]);
  });

  it("reports stat lookup errors without starting a read", async () => {
    const { service, stat, read } = fixture();
    stat.mockImplementationOnce(() => { throw new Error("unavailable"); });
    expect((await service.load(["Plan.md"])).issues).toEqual([{ path: "Plan.md", code: "read-failed" }]);
    expect(read).not.toHaveBeenCalled();
  });

  it("shares a pending read and retires the older request", async () => {
    const { service, read } = fixture();
    const pending = deferred<string>();
    read.mockImplementation(() => pending.promise);
    const first = service.load(["Plan.md"]);
    await startRead();
    const second = service.load(["Plan.md"]);
    expect(await first).toMatchObject({ status: "stale", noteTexts: new Map() });
    pending.resolve("loaded");
    expect((await second).noteTexts.get("Plan.md")).toBe("loaded");
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("rejects a file changed while reading and does not cache old responses", async () => {
    const { service, files, read } = fixture();
    const pending = deferred<string>();
    read.mockImplementationOnce(() => pending.promise);
    const first = service.load(["Plan.md"]);
    await startRead();
    files.set("Plan.md", { text: "new", stat: { mtime: 2, size: 3 } });
    pending.resolve("old");
    expect((await first).issues).toEqual([{ path: "Plan.md", code: "changed" }]);
    expect((await service.load(["Plan.md"])).noteTexts.get("Plan.md")).toBe("new");
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("invalidation retires snapshots even if a reader ignores its abort signal", async () => {
    const { service, read } = fixture();
    const pending = deferred<string>();
    read.mockImplementationOnce(() => pending.promise);
    const first = service.load(["Plan.md"]);
    await startRead();
    service.invalidate("Plan.md");
    expect((await first).status).toBe("stale");
    expect(read.mock.calls[0][1].aborted).toBe(true);
    pending.resolve("stale");
    await startRead();
    expect((await service.load(["Plan.md"])).noteTexts.get("Plan.md")).toBe("original");
  });

  it("disposal settles pending loads, prevents new I/O and ignores late reads", async () => {
    const { service, read } = fixture();
    const pending = deferred<string>();
    read.mockImplementation(() => pending.promise);
    const loading = service.load(["Plan.md"]);
    await startRead();
    service.dispose();
    expect((await loading).status).toBe("disposed");
    expect(read.mock.calls[0][1].aborted).toBe(true);
    pending.resolve("late");
    await startRead();
    expect((await service.load(["Plan.md"])).status).toBe("disposed");
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("does not start a queued adapter read when disposed immediately", async () => {
    const { service, read } = fixture();
    const result = service.load(["Plan.md"]);
    service.dispose();
    expect((await result).status).toBe("disposed");
    expect(read).not.toHaveBeenCalled();
  });

  it("rejects non-vault/non-Markdown paths and oversized files before reading", async () => {
    const { service, files, read } = fixture();
    files.set("Huge.md", { text: "unused", stat: { mtime: 1, size: LINKED_NOTE_SEARCH_LIMITS.fileBytes + 1 } });
    const result = await service.load(["../Other.md", "/root.md", "C:/Other.md", "folder\\Other.md", "photo.png", "Huge.md", "Missing.md"]);
    expect(result.issues.map((issue) => issue.code)).toEqual(["invalid-path", "invalid-path", "invalid-path", "invalid-path", "invalid-path", "too-large", "missing"]);
    expect(read).not.toHaveBeenCalled();
  });

  it("checks actual text size and total characters without keeping oversized file bodies", async () => {
    const { service, files, read } = fixture();
    files.set("Huge.md", { text: "x".repeat(LINKED_NOTE_SEARCH_LIMITS.fileBytes + 1), stat: { mtime: 1, size: 1 } });
    expect((await service.load(["Huge.md"])).issues).toEqual([{ path: "Huge.md", code: "too-large" }]);
    await service.load(["Huge.md"]);
    expect(read).toHaveBeenCalledTimes(2);
    const paths = Array.from({ length: 5 }, (_, position) => `${position}.md`);
    for (const path of paths) files.set(path, { text: "x".repeat(500_000), stat: { mtime: 1, size: 500_000 } });
    const result = await service.load(paths);
    expect(result.noteTexts.size).toBe(4);
    expect(result.issues).toEqual([{ path: "4.md", code: "too-large" }]);
    const count = read.mock.calls.length;
    await service.load(["0.md"]);
    expect(read.mock.calls.length).toBe(count + 1);
  });

  it("bounds request enumeration even when all paths are duplicates", async () => {
    const { service, read } = fixture();
    let enumerated = 0;
    function* paths() {
      while (true) {
        enumerated += 1;
        yield "Plan.md";
      }
    }
    const result = await service.load(paths());
    expect(enumerated).toBe(LINKED_NOTE_SEARCH_LIMITS.requests + 1);
    expect(result.issues).toEqual([{ path: "Plan.md", code: "file-limit" }]);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("bounds file enumeration and cache entries", async () => {
    const { service, files, read } = fixture();
    const paths = Array.from({ length: LINKED_NOTE_SEARCH_LIMITS.files + 1 }, (_, position) => `${position}.md`);
    for (const path of paths) files.set(path, { text: path, stat: { mtime: 1, size: path.length } });
    const result = await service.load(paths);
    expect(result.noteTexts.size).toBe(LINKED_NOTE_SEARCH_LIMITS.files);
    expect(result.issues).toEqual([{ path: paths[LINKED_NOTE_SEARCH_LIMITS.files], code: "file-limit" }]);
    await service.load([paths[LINKED_NOTE_SEARCH_LIMITS.files]]);
    const count = read.mock.calls.length;
    await service.load([paths[0]]);
    expect(read.mock.calls.length).toBe(count + 1);
  });

  it("caps active reads across superseded loads even when adapters ignore cancellation", async () => {
    const pending: ReturnType<typeof deferred<string>>[] = [];
    const read = vi.fn(() => {
      const response = deferred<string>();
      pending.push(response);
      return response.promise;
    });
    const service = new LinkedNoteSearch({ stat: () => ({ mtime: 1, size: 1 }), read });
    const loads: Promise<unknown>[] = [];
    for (let position = 0; position < LINKED_NOTE_SEARCH_LIMITS.concurrentReads + 1; position += 1) {
      loads.push(service.load([`${position}.md`]));
      await startRead();
    }
    expect(read).toHaveBeenCalledTimes(LINKED_NOTE_SEARCH_LIMITS.concurrentReads);
    service.dispose();
    await Promise.all(loads);
    for (const response of pending) response.resolve("late");
    await startRead();
    expect(read).toHaveBeenCalledTimes(LINKED_NOTE_SEARCH_LIMITS.concurrentReads);
  });
});
