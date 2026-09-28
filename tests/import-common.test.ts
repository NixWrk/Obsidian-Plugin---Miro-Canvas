import { afterEach, describe, expect, it, vi } from "vitest";

import type { App, TFile } from "obsidian";
import { setLocale, words } from "../src/i18n";
import { importIntoBoard, type ImportChoice, type ImportHost, type ImportPreview } from "../src/import-command";
import {
	BoardBuilder,
	REPORT_CARD_MAX_ROWS,
	addReportCard,
	assertImportedBoard,
	idFactory,
	importFormatLabel,
	reportCardMarkdown,
} from "../src/importers/board-builder";
import { IMPORT_ADAPTERS, findAdapter, mayImport } from "../src/importers/registry";
import { importBaseName, importTargetPath } from "../src/importers/target-path";
import {
	IMPORT_ENTRY_STATUSES,
	IMPORT_FORMATS,
	IMPORT_REASONS,
	ImportError,
	MAX_IMPORT_ENTRIES,
	type FormatAdapter,
	type ImportContext,
	type ImportReport,
	type ImportSource,
} from "../src/importers/types";
import { EN } from "../src/locales/en";
import { RU } from "../src/locales/ru";
import { validateMiroCanvasMetadata } from "../src/metadata";

interface Node {
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

const FIXED_NOW = "2026-09-28T10:00:00.000Z";

function context(seed = 7): ImportContext {
	return {
		importerVersion: "9.9.9",
		now: FIXED_NOW,
		newId: idFactory(seed),
		resolveLink: () => undefined,
	};
}

function nodesOf(document: Record<string, unknown>): Node[] {
	return document.nodes as Node[];
}

function metadataOf(document: Record<string, unknown>): Record<string, Record<string, unknown>> {
	return document.miroCanvas as Record<string, Record<string, unknown>>;
}

/** A small board with one of everything the builder makes. */
function sampleBoard(seed = 7): ReturnType<BoardBuilder["finish"]> {
	const builder = new BoardBuilder("excalidraw", context(seed));
	builder.frame({ x: -20, y: -20, width: 900, height: 500 }, "Frame", { source: { id: "f1", type: "frame" } });
	const box = builder.shapeCard({ x: 0, y: 0, width: 200.4, height: 100.6 }, "Box", { kind: "rectangle", fallback: "text" }, {
		source: { id: "r1", type: "rectangle" },
		style: { colors: { fill: "#ffd02f", border: "#1e1e1e" }, borderStyle: "dashed", borderWidth: 2, rotation: 15 },
	});
	const note = builder.item({ x: 400, y: 0, width: 240, height: 60 }, "Hello", { type: "text" }, { source: { id: "t1", type: "text" } });
	builder.drawing({ x: 0, y: 200, width: 100, height: 50 }, { color: "#1e1e1e", width: 2, box: { width: 100, height: 50 }, points: [0, 0, 50, 25, 100, 50] }, {
		source: { id: "d1", type: "freedraw" },
	});
	builder.file({ x: 400, y: 200, width: 200, height: 150 }, "Pictures/cat.png", { source: { id: "i1", type: "image" } });
	builder.connect({ from: { type: "node", nodeId: box, u: 1, v: 0.5 }, to: { type: "node", nodeId: note, u: 0, v: 0.5 }, label: "to" }, {
		source: { id: "a1", type: "arrow" },
	});
	builder.connect({ from: { type: "node", nodeId: box, u: 0.5, v: 1 }, to: { type: "free", x: 50, y: 400 } }, { source: { id: "a2", type: "arrow" } });
	builder.placeholder({ x: 700, y: 0, width: 800, height: 600 }, { sourceId: "e1", sourceType: "iframe", status: "unsupported", reason: "iframe" });
	builder.note({ sourceId: "roughness", sourceType: "roughness", status: "plugin-unsupported", reason: "roughness" });
	builder.note({ sourceId: "t1", sourceType: "text", status: "approximated", reason: "elementLink" });
	builder.countSkipped(2);
	return builder.finish({ sourcePath: "Drawings/Plan.excalidraw.md", formatVersion: "2" });
}

afterEach(() => {
	setLocale("en");
});

describe("importTargetPath", () => {
	const nothing = (): boolean => false;

	it("names the board after its source, next to it", () => {
		expect(importTargetPath("Drawings/Plan.excalidraw.md", nothing, "board")).toBe("Drawings/Plan (board).canvas");
		expect(importTargetPath("Drawings/Plan.excalidraw", nothing, "board")).toBe("Drawings/Plan (board).canvas");
		expect(importTargetPath("Maps/Ideas.md", nothing, "board")).toBe("Maps/Ideas (board).canvas");
		expect(importTargetPath("Styled.canvas", nothing, "board")).toBe("Styled (board).canvas");
		expect(importTargetPath("a/b/Upper.EXCALIDRAW.MD", nothing, "board")).toBe("a/b/Upper (board).canvas");
	});

	it("keeps a name that is nothing but an ending", () => {
		expect(importBaseName(".md")).toBe(".md");
		expect(importBaseName("notes.v2.md")).toBe("notes.v2");
	});

	it("never takes a name already there", () => {
		const taken = new Set(["Drawings/Plan (board).canvas", "Drawings/Plan (board 2).canvas"]);
		expect(importTargetPath("Drawings/Plan.excalidraw.md", (path) => taken.has(path), "board")).toBe("Drawings/Plan (board 3).canvas");
	});

	it("uses the word of the person's language", () => {
		setLocale("ru");
		expect(importTargetPath("Карта.md", () => false, words().importer.boardSuffix)).toBe("Карта (доска).canvas");
	});
});

describe("idFactory", () => {
	it("makes the same sixteen-hex-digit ids from the same seed", () => {
		const first = idFactory(42);
		const second = idFactory(42);
		const ids = Array.from({ length: 5 }, () => first());
		expect(Array.from({ length: 5 }, () => second())).toEqual(ids);
		for (const id of ids) expect(id).toMatch(/^[0-9a-f]{16}$/u);
		expect(new Set(ids).size).toBe(ids.length);
	});
});

describe("BoardBuilder", () => {
	it("builds a board the plugin reads without a single diagnostic", () => {
		const { document } = sampleBoard();
		const validated = validateMiroCanvasMetadata(document.miroCanvas);
		expect(validated.valid).toBe(true);
		expect(validated.diagnostics).toEqual([]);
		for (const node of nodesOf(document)) {
			expect(typeof node.id).toBe("string");
			expect(typeof node.type).toBe("string");
			for (const key of ["x", "y", "width", "height"] as const) expect(Number.isInteger(node[key])).toBe(true);
		}
	});

	it("writes frames first, so every card is drawn over them", () => {
		const nodes = nodesOf(sampleBoard().document);
		expect(nodes[0]!.type).toBe("group");
		expect(nodes[0]!.label).toBe("Frame");
		expect(nodes.slice(1).every((node) => node.type !== "group")).toBe(true);
	});

	it("writes the records the plugin's own tools write", () => {
		const { document } = sampleBoard();
		const nodes = nodesOf(document);
		const overrides = metadataOf(document).localOverrides as Record<string, Record<string, unknown>>;
		const shape = nodes.find((node) => node.text === "Box")!;
		expect(overrides[shape.id]).toMatchObject({
			shape: { kind: "rectangle", fallback: "text" },
			colors: { fill: "#ffd02f", border: "#1e1e1e" },
			borderStyle: "dashed",
			borderWidth: 2,
			rotation: 15,
		});
		expect(shape.width).toBe(200);
		expect(shape.height).toBe(101);
		const frame = nodes.find((node) => node.type === "group")!;
		expect(overrides[frame.id]).toMatchObject({ item: { type: "frame" } });
		const file = nodes.find((node) => node.type === "file")!;
		expect(file.file).toBe("Pictures/cat.png");
	});

	it("makes a line between two cards a native edge, and any other line the plugin's connector", () => {
		const { document } = sampleBoard();
		const edges = document.edges as Record<string, unknown>[];
		expect(edges).toHaveLength(1);
		expect(edges[0]).toMatchObject({ fromSide: "right", toSide: "left", label: "to" });
		const connectors = metadataOf(document).connectors as Record<string, Record<string, unknown>>;
		expect(Object.values(connectors)).toHaveLength(1);
		expect(Object.values(connectors)[0]!.to).toEqual({ type: "free", x: 50, y: 400 });
	});

	it("binds every card and line to its source element with the two known binding fields", () => {
		const { document } = sampleBoard();
		const bindings = metadataOf(document).bindings as Record<string, Record<string, unknown>>;
		const values = Object.values(bindings);
		expect(values).toContainEqual({ sourceId: "excalidraw:r1", role: "import:excalidraw:rectangle" });
		expect(values).toContainEqual({ sourceId: "excalidraw:a1", role: "import:excalidraw:arrow" });
		expect(values).toContainEqual({ sourceId: "excalidraw:e1", role: "import:excalidraw:iframe" });
		for (const binding of values) expect(Object.keys(binding).sort()).toEqual(["role", "sourceId"]);
	});

	it("leaves a dashed placeholder saying what was not imported, and reports it", () => {
		const { document, report } = sampleBoard();
		const placeholder = nodesOf(document).find((node) => node.text === "Not imported: web embed")!;
		expect(placeholder).toBeDefined();
		expect(placeholder.x).toBe(700);
		expect(placeholder.width).toBe(320);
		expect(placeholder.height).toBe(160);
		const overrides = metadataOf(document).localOverrides as Record<string, Record<string, unknown>>;
		expect(overrides[placeholder.id]).toMatchObject({ borderStyle: "dashed" });
		expect(report.entries).toContainEqual({ sourceId: "e1", sourceType: "iframe", status: "unsupported", reason: "iframe", nodeId: placeholder.id });
	});

	it("counts each element once: converted, approximated, not imported or skipped", () => {
		const { report } = sampleBoard();
		// f1, r1, d1, i1, a1, a2 came over exactly; t1 was approximated; e1 has a
		// placeholder; roughness is counted once as a kind; two were deleted.
		expect(report.counts).toEqual({ converted: 6, approximated: 1, notImported: 2, skipped: 2 });
	});

	it("reports in the shape of the imports[] proposal", () => {
		const { report } = sampleBoard();
		expect(Object.keys(report).sort()).toEqual([
			"counts", "entries", "format", "formatVersion", "id", "importedAt", "importer", "importerVersion", "sourcePath",
		]);
		expect(report).toMatchObject({
			format: "excalidraw",
			formatVersion: "2",
			sourcePath: "Drawings/Plan.excalidraw.md",
			importer: "miro-canvas",
			importerVersion: "9.9.9",
			importedAt: FIXED_NOW,
		});
		for (const entry of report.entries) {
			expect(IMPORT_ENTRY_STATUSES).toContain(entry.status);
			expect(IMPORT_REASONS).toContain(entry.reason);
		}
	});

	it("builds the same board from the same seed", () => {
		expect(JSON.stringify(sampleBoard(3))).toBe(JSON.stringify(sampleBoard(3)));
		expect(JSON.stringify(sampleBoard(3))).not.toBe(JSON.stringify(sampleBoard(4)));
	});

	it("keeps at most the proposal's number of entries, counting them all", () => {
		const builder = new BoardBuilder("mindmap-outline", context());
		for (let index = 0; index < MAX_IMPORT_ENTRIES + 5; index += 1) {
			builder.note({ sourceId: `line:${index}`, sourceType: "heading", status: "source-limited", reason: "layout" });
		}
		const report = builder.report({ sourcePath: "Map.md" });
		expect(report.entries).toHaveLength(MAX_IMPORT_ENTRIES);
		expect(report.counts.notImported).toBe(MAX_IMPORT_ENTRIES + 5);
	});

	it("counts a copied board's elements without bindings of their own", () => {
		const builder = new BoardBuilder("advanced-canvas", context());
		builder.countConverted(4);
		expect(builder.counts()).toEqual({ converted: 4, approximated: 0, notImported: 0, skipped: 0 });
	});

	it("refuses an item or a line the plugin could not read back", () => {
		const builder = new BoardBuilder("excalidraw", context());
		expect(() => builder.drawing({ x: 0, y: 0, width: 10, height: 10 }, { color: "red", width: 2, box: { width: 10, height: 10 }, points: [0, 0, 1, 1] }))
			.toThrow(/invalid drawing/u);
		expect(() => builder.connect({ from: { type: "free", x: 0, y: 0 }, to: { type: "free", x: 1, y: 1 }, color: "blue" }))
			.toThrow(/invalid connector/u);
	});
});

describe("assertImportedBoard", () => {
	const node = (id: string): Record<string, unknown> => ({ id, type: "text", text: "", x: 0, y: 0, width: 10, height: 10 });

	it("refuses an id used twice, an edge to nowhere and a node without a place", () => {
		expect(() => assertImportedBoard({ nodes: [node("a"), node("a")], edges: [] })).toThrow(/used twice/u);
		expect(() => assertImportedBoard({ nodes: [node("a")], edges: [{ id: "e", fromNode: "a", toNode: "b" }] })).toThrow(/ends at no node/u);
		expect(() => assertImportedBoard({ nodes: [{ id: "a", type: "text" }], edges: [] })).toThrow(/has no x/u);
	});

	it("refuses metadata the validator would so much as warn about", () => {
		const document = {
			nodes: [node("a")],
			edges: [],
			miroCanvas: { schemaVersion: 1, bindings: { a: { sourceId: "x", role: "y", extra: true } } },
		};
		expect(() => assertImportedBoard(document)).toThrow(/does not pass/u);
	});

	it("leaves miroSource and fields it does not know alone", () => {
		const document = { nodes: [node("a")], edges: [], miroSource: { anything: [1, 2] }, foo: "bar" };
		expect(() => assertImportedBoard(document)).not.toThrow();
	});
});

describe("the report card", () => {
	it("says where the board came from, with what and when, and how it fared", () => {
		const { report } = sampleBoard();
		const text = reportCardMarkdown(report);
		expect(text).toContain("## Import report");
		expect(text).toContain("- Source: [[Drawings/Plan.excalidraw.md]]");
		expect(text).toContain("- Format: Excalidraw drawing, version 2");
		expect(text).toContain("- Imported with: miro-canvas 9.9.9");
		expect(text).toContain("- Imported on: 2026-09-28");
		expect(text).toContain("| Converted | 6 |");
		expect(text).toContain("| Skipped | 2 |");
		expect(text).toContain("| iframe | `e1` | No equivalent on a board: web embed |");
		expect(text).toContain("| text | `t1` | Approximated: link added to the card's text |");
		expect(text).not.toContain("<");
	});

	it("keeps table cells whole: pipes escaped, one line each", () => {
		const report: ImportReport = {
			...sampleBoard().report,
			entries: [{ sourceId: "a|b", sourceType: "odd\ntype", status: "unsupported", reason: "unknownElement" }],
		};
		expect(reportCardMarkdown(report)).toContain("| odd type | `a\\|b` | No equivalent on a board: element of an unknown kind |");
	});

	it("lists at most its cap of rows, and counts the rest", () => {
		const builder = new BoardBuilder("excalidraw", context());
		for (let index = 0; index < REPORT_CARD_MAX_ROWS + 7; index += 1) {
			builder.note({ sourceId: `x${index}`, sourceType: "iframe", status: "unsupported", reason: "iframe" });
		}
		builder.note({ sourceId: "gone", sourceType: "rectangle", status: "skipped", reason: "deleted" });
		const text = reportCardMarkdown(builder.report({ sourcePath: "a.excalidraw" }));
		expect(text.split("\n").filter((line) => line.startsWith("| iframe |"))).toHaveLength(REPORT_CARD_MAX_ROWS);
		expect(text).toContain("…and 7 more");
		expect(text).not.toContain("`gone`");
	});

	it("reads in the person's language", () => {
		setLocale("ru");
		const text = reportCardMarkdown(sampleBoard().report);
		expect(text).toContain("## Отчёт об импорте");
		expect(text).toContain("Рисунок Excalidraw, версия 2");
		expect(text).toContain("Нет аналога на доске: встроенная веб-страница");
	});

	it("is added to the right of everything imported, bound to the source, without touching the board it was given", () => {
		const result = sampleBoard();
		const before = JSON.stringify(result);
		const withCard = addReportCard(result, idFactory(99));
		expect(JSON.stringify(result)).toBe(before);
		const nodes = nodesOf(withCard.document);
		const card = nodes[nodes.length - 1]!;
		expect(withCard.report.reportNodeId).toBe(card.id);
		const right = Math.max(...nodesOf(result.document).map((node) => node.x + node.width));
		expect(card.x).toBeGreaterThan(right);
		expect(card.text).toBe(reportCardMarkdown(result.report));
		const bindings = metadataOf(withCard.document).bindings as Record<string, unknown>;
		expect(bindings[card.id]).toEqual({ sourceId: "import:Drawings/Plan.excalidraw.md", role: "import-report" });
		expect(validateMiroCanvasMetadata(withCard.document.miroCanvas).diagnostics).toEqual([]);
	});

	it("keeps everything else in a copied board", () => {
		const report = sampleBoard().report;
		const document = {
			nodes: [{ id: "n1", type: "text", text: "", x: 10, y: 20, width: 30, height: 40, styleAttributes: { shape: "pill" } }],
			edges: [],
			miroSource: { board: { id: "b" } },
			foo: "bar",
		};
		const withCard = addReportCard({ document, report }, idFactory(5));
		expect(withCard.document.miroSource).toEqual({ board: { id: "b" } });
		expect(withCard.document.foo).toBe("bar");
		expect(nodesOf(withCard.document)[0]).toEqual(document.nodes[0]);
		expect(metadataOf(withCard.document).schemaVersion).toBe(1);
	});
});

describe("the importers", () => {
	const source = (path: string, extension: string, frontmatter?: Record<string, unknown>): ImportSource => ({
		path, extension, text: "", ...(frontmatter === undefined ? {} : { frontmatter }),
	});

	it("offers only files an importer might read", () => {
		expect(mayImport("excalidraw")).toBe(true);
		expect(mayImport("canvas")).toBe(true);
		expect(mayImport("md", { "excalidraw-plugin": "parsed" })).toBe(true);
		expect(mayImport("md", { "mindmap-plugin": "basic" })).toBe(true);
		expect(mayImport("md", { tags: ["x"] })).toBe(false);
		expect(mayImport("md")).toBe(false);
		expect(mayImport("md", null)).toBe(false);
		expect(mayImport("png")).toBe(false);
	});

	it("has one importer per format", () => {
		expect(IMPORT_ADAPTERS.map((adapter) => adapter.id).sort()).toEqual([...IMPORT_FORMATS].sort());
	});

	it("leaves an ordinary canvas alone and hands a mind-map note to its importer", () => {
		expect(findAdapter(source("a.canvas", "canvas"))).toBeUndefined();
		expect(findAdapter(source("a.md", "md", { "mindmap-plugin": "basic" }))?.id).toBe("mindmap-outline");
	});

	it("takes the first importer that says yes, and counts one that throws as a no", () => {
		const throwing: FormatAdapter = { id: "excalidraw", detect: () => { throw new Error("boom"); }, convert: () => { throw new Error("no"); } };
		const yes: FormatAdapter = { id: "mindmap-outline", detect: () => true, convert: () => { throw new Error("no"); } };
		const alsoYes: FormatAdapter = { id: "markmind-rich", detect: () => true, convert: () => { throw new Error("no"); } };
		expect(findAdapter(source("a.md", "md"), [throwing, yes, alsoYes])).toBe(yes);
	});

	it("has words for every format, status and reason in every language", () => {
		for (const table of [EN, RU]) {
			for (const reason of IMPORT_REASONS) expect(table.importer.reasons[reason], reason).toBeTruthy();
			expect(Object.keys(table.importer.status)).toHaveLength(IMPORT_ENTRY_STATUSES.length);
			expect(Object.keys(table.importer.formats)).toHaveLength(IMPORT_FORMATS.length);
		}
		expect(Object.keys(EN.importer.reasons).sort()).toEqual([...IMPORT_REASONS].sort());
	});

	it("names a format with its version", () => {
		expect(importFormatLabel({ format: "mindmap-outline", formatVersion: "basic" })).toBe("Mind map (outline), version basic");
		expect(importFormatLabel({ format: "advanced-canvas" })).toBe("Advanced Canvas board");
	});
});

/** A fake vault, just real enough for importIntoBoard: `existing` paths are there from the start, and every write lands in the same map. */
function fakeHost(options: {
	readonly existing?: Iterable<string>;
	readonly adapters: readonly FormatAdapter[];
	readonly choice?: ImportChoice | null;
	readonly readFails?: boolean;
	/** A path that appears on disk just as the board is about to be written there. */
	readonly takenOnCreate?: string;
}) {
	const files = new Map<string, { readonly path: string; readonly content?: string }>();
	for (const path of options.existing ?? []) files.set(path, { path });
	const notices: string[] = [];
	const previews: ImportPreview[] = [];
	const create = vi.fn(async (path: string, content: string) => {
		if (path === options.takenOnCreate && !files.has(path)) {
			files.set(path, { path });
			throw new Error("File already exists.");
		}
		if (files.has(path)) throw new Error("File already exists.");
		const file = { path, content };
		files.set(path, file);
		return file;
	});
	const modify = vi.fn();
	const openFile = vi.fn(async () => {});
	const app = {
		vault: {
			getAbstractFileByPath: (path: string) => files.get(path) ?? null,
			cachedRead: async () => {
				if (options.readFails === true) throw new Error("unreadable");
				return "source text";
			},
			create,
			modify,
		},
		metadataCache: {
			getFileCache: () => ({ frontmatter: { "mindmap-plugin": "basic" } }),
			getFirstLinkpathDest: () => null,
		},
		workspace: { getLeaf: () => ({ openFile }) },
	} as unknown as App;
	const host: ImportHost = {
		app,
		isFile: (value: unknown): value is TFile => typeof value === "object" && value !== null && "path" in value,
		pluginVersion: "1.2.3",
		notice: (message) => notices.push(message),
		confirm: async (preview) => {
			previews.push(preview);
			return options.choice === undefined ? { reportCard: true } : options.choice;
		},
		adapters: options.adapters,
		now: () => new Date(FIXED_NOW),
		seed: 11,
	};
	return { host, files, notices, previews, create, modify, openFile };
}

const sourceFile = { path: "Maps/Ideas.md", extension: "md", basename: "Ideas" } as unknown as TFile;

/** An importer that recognises everything and makes one card of it. */
const oneCardAdapter: FormatAdapter = {
	id: "mindmap-outline",
	detect: () => true,
	convert: (source, importContext) => {
		expect(source).toMatchObject({ path: "Maps/Ideas.md", extension: "md", text: "source text", frontmatter: { "mindmap-plugin": "basic" } });
		const builder = new BoardBuilder("mindmap-outline", importContext);
		builder.card({ x: 0, y: 0, width: 200, height: 80 }, source.text, { source: { id: "line:1", type: "heading" } });
		builder.note({ sourceId: "layout", sourceType: "layout", status: "source-limited", reason: "layout" });
		return builder.finish({ sourcePath: source.path, formatVersion: "basic" });
	},
};

describe("importIntoBoard", () => {
	it("shows the preview, then creates one new board with the report card and opens it", async () => {
		const fake = fakeHost({ adapters: [oneCardAdapter] });
		const board = await importIntoBoard(fake.host, sourceFile);
		expect(board?.path).toBe("Maps/Ideas (board).canvas");
		expect(fake.previews).toHaveLength(1);
		expect(fake.previews[0]).toMatchObject({ formatLabel: "Mind map (outline), version basic", targetPath: "Maps/Ideas (board).canvas" });
		expect(fake.create).toHaveBeenCalledTimes(1);
		expect(fake.modify).not.toHaveBeenCalled();
		const written = JSON.parse(fake.files.get("Maps/Ideas (board).canvas")!.content!) as Record<string, unknown>;
		const nodes = nodesOf(written);
		expect(nodes).toHaveLength(2);
		expect(nodes[1]!.text).toContain("[[Maps/Ideas.md]]");
		expect(fake.openFile).toHaveBeenCalledTimes(1);
		expect(fake.notices).toEqual(["Created Maps/Ideas (board).canvas"]);
	});

	it("leaves the report card off when asked to", async () => {
		const fake = fakeHost({ adapters: [oneCardAdapter], choice: { reportCard: false } });
		await importIntoBoard(fake.host, sourceFile);
		const written = JSON.parse(fake.files.get("Maps/Ideas (board).canvas")!.content!) as Record<string, unknown>;
		expect(nodesOf(written)).toHaveLength(1);
	});

	it("never writes over a board already there", async () => {
		const fake = fakeHost({ adapters: [oneCardAdapter], existing: ["Maps/Ideas (board).canvas"] });
		const board = await importIntoBoard(fake.host, sourceFile);
		expect(board?.path).toBe("Maps/Ideas (board 2).canvas");
		expect(fake.files.get("Maps/Ideas (board).canvas")!.content).toBeUndefined();
	});

	it("takes the next free name once when the name is taken between the preview and the press", async () => {
		const fake = fakeHost({ adapters: [oneCardAdapter], takenOnCreate: "Maps/Ideas (board).canvas" });
		const board = await importIntoBoard(fake.host, sourceFile);
		expect(board?.path).toBe("Maps/Ideas (board 2).canvas");
		expect(fake.create).toHaveBeenCalledTimes(2);
	});

	it("creates nothing when the preview is cancelled", async () => {
		const fake = fakeHost({ adapters: [oneCardAdapter], choice: null });
		expect(await importIntoBoard(fake.host, sourceFile)).toBeNull();
		expect(fake.create).not.toHaveBeenCalled();
		expect(fake.notices).toEqual([]);
	});

	it("says so, and creates nothing, when no importer recognises the file", async () => {
		const never: FormatAdapter = { id: "excalidraw", detect: () => false, convert: () => { throw new Error("no"); } };
		const fake = fakeHost({ adapters: [never] });
		expect(await importIntoBoard(fake.host, sourceFile)).toBeNull();
		expect(fake.notices).toEqual([words().importer.notRecognised]);
		expect(fake.create).not.toHaveBeenCalled();
	});

	it("says why a source of the right format could not be read", async () => {
		const broken: FormatAdapter = { id: "excalidraw", detect: () => true, convert: () => { throw new ImportError("unreadableData", "bad JSON"); } };
		const fake = fakeHost({ adapters: [broken] });
		expect(await importIntoBoard(fake.host, sourceFile)).toBeNull();
		expect(fake.notices).toEqual(["This Excalidraw drawing could not be imported: its data could not be read."]);
	});

	it("says when the file could not be read or holds nothing to import", async () => {
		const unreadable = fakeHost({ adapters: [oneCardAdapter], readFails: true });
		expect(await importIntoBoard(unreadable.host, sourceFile)).toBeNull();
		expect(unreadable.notices).toEqual([words().importer.readFailed]);
		const empty: FormatAdapter = {
			id: "mindmap-outline",
			detect: () => true,
			convert: (importSource, importContext) => new BoardBuilder("mindmap-outline", importContext).finish({ sourcePath: importSource.path }),
		};
		const nothing = fakeHost({ adapters: [empty] });
		expect(await importIntoBoard(nothing.host, sourceFile)).toBeNull();
		expect(nothing.notices).toEqual([words().importer.nothingToImport]);
		expect(nothing.previews).toEqual([]);
	});
});
