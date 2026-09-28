import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { assertImportedBoard, idFactory } from "../src/importers/board-builder";
import { convertExcalidraw, detectExcalidraw, excalidrawAdapter } from "../src/importers/excalidraw";
import { ImportError, type ImportContext, type ImportEntry, type ImportResult, type ImportSource } from "../src/importers/types";
import { validateMiroCanvasMetadata } from "../src/metadata";
import { compressToBase64 } from "./helpers/lz-string-compress";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "import", "excalidraw");
const FIXED_NOW = "2026-09-28T10:00:00.000Z";

/** The vault the fixtures link into: link -> path. */
const VAULT: Readonly<Record<string, string>> = {
	"Meeting notes": "Notes/Meeting notes.md",
	"Attachments/diagram.png": "Attachments/diagram.png",
};

interface BoardNode {
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

interface BoardEdge {
	readonly id: string;
	readonly fromNode: string;
	readonly toNode: string;
	readonly fromSide: string;
	readonly toSide: string;
	readonly fromEnd?: string;
	readonly toEnd?: string;
	readonly label?: string;
}

type Overrides = Record<string, Record<string, unknown>>;

function fixture(name: string): string {
	return readFileSync(join(FIXTURES, name), "utf8");
}

function context(seed = 11): ImportContext {
	return {
		importerVersion: "9.9.9",
		now: FIXED_NOW,
		newId: idFactory(seed),
		resolveLink: (link) => VAULT[link],
	};
}

function sceneSource(): ImportSource {
	return { path: "Drawings/scene.excalidraw", extension: "excalidraw", text: fixture("scene.excalidraw") };
}

function noteSource(name: string): ImportSource {
	return { path: `Drawings/${name}`, extension: "md", text: fixture(name), frontmatter: { "excalidraw-plugin": "parsed" } };
}

/** The board, read back as the lists and records a test looks into. */
class Board {
	readonly result: ImportResult;
	readonly nodes: BoardNode[];
	readonly edges: BoardEdge[];
	readonly overrides: Overrides;
	readonly connectors: Record<string, Record<string, unknown>>;
	readonly bindings: Record<string, { sourceId: string; role: string }>;

	constructor(result: ImportResult) {
		this.result = result;
		const document = result.document;
		const metadata = document.miroCanvas as Record<string, unknown>;
		this.nodes = document.nodes as BoardNode[];
		this.edges = document.edges as BoardEdge[];
		this.overrides = (metadata.localOverrides ?? {}) as Overrides;
		this.connectors = (metadata.connectors ?? {}) as Record<string, Record<string, unknown>>;
		this.bindings = (metadata.bindings ?? {}) as Record<string, { sourceId: string; role: string }>;
	}

	/** The id of the card or line bound to a source element. */
	idOf(sourceId: string): string {
		const found = Object.entries(this.bindings).find(([, binding]) => binding.sourceId === `excalidraw:${sourceId}`);
		if (found === undefined) throw new Error(`nothing is bound to ${sourceId}`);
		return found[0];
	}

	node(sourceId: string): BoardNode {
		const id = this.idOf(sourceId);
		const node = this.nodes.find((candidate) => candidate.id === id);
		if (node === undefined) throw new Error(`no node for ${sourceId}`);
		return node;
	}

	edge(sourceId: string): BoardEdge {
		const id = this.idOf(sourceId);
		const edge = this.edges.find((candidate) => candidate.id === id);
		if (edge === undefined) throw new Error(`no native edge for ${sourceId}`);
		return edge;
	}

	override(sourceId: string): Record<string, unknown> {
		return this.overrides[this.idOf(sourceId)] ?? {};
	}

	entries(sourceId: string): ImportEntry[] {
		return this.result.report.entries.filter((entry) => entry.sourceId === sourceId);
	}
}

function sceneElements(): Record<string, unknown>[] {
	return (JSON.parse(fixture("scene.excalidraw")) as { elements: Record<string, unknown>[] }).elements;
}

function rotate(point: { x: number; y: number }, centre: { x: number; y: number }, radians: number): { x: number; y: number } {
	const dx = point.x - centre.x;
	const dy = point.y - centre.y;
	return {
		x: centre.x + dx * Math.cos(radians) - dy * Math.sin(radians),
		y: centre.y + dx * Math.sin(radians) + dy * Math.cos(radians),
	};
}

describe("excalidraw importer: which files it takes", () => {
	it("takes a plain .excalidraw file and a note the Excalidraw plugin marked", () => {
		expect(detectExcalidraw({ path: "a.excalidraw", extension: "excalidraw", text: "" })).toBe(true);
		expect(detectExcalidraw({ path: "a.excalidraw", extension: "Excalidraw", text: "" })).toBe(true);
		expect(detectExcalidraw({ path: "a.md", extension: "md", text: "", frontmatter: { "excalidraw-plugin": "parsed" } })).toBe(true);
		expect(excalidrawAdapter.detect(noteSource("plugin-json.excalidraw.md"))).toBe(true);
	});

	it("reads the note's first lines when Obsidian has not read its properties yet", () => {
		const text = "---\r\ntags: [x]\r\nexcalidraw-plugin: parsed\r\n---\r\n# Drawing\n";
		expect(detectExcalidraw({ path: "a.md", extension: "md", text })).toBe(true);
	});

	it("leaves every other file alone", () => {
		expect(detectExcalidraw({ path: "a.md", extension: "md", text: "# Plain note", frontmatter: { tags: ["x"] } })).toBe(false);
		expect(detectExcalidraw({ path: "a.md", extension: "md", text: "---\nmindmap-plugin: basic\n---\n" })).toBe(false);
		expect(detectExcalidraw({ path: "a.canvas", extension: "canvas", text: "{}" })).toBe(false);
		expect(detectExcalidraw({ path: "a.png", extension: "png", text: "" })).toBe(false);
	});

	it("says why a drawing that cannot be read makes no board", () => {
		const reasonOf = (text: string, extension = "excalidraw"): string => {
			try {
				convertExcalidraw({ path: "a", extension, text }, context());
			} catch (error) {
				if (error instanceof ImportError) return error.reason;
				throw error;
			}
			throw new Error("expected an ImportError");
		};
		expect(reasonOf("{ not json")).toBe("unreadableData");
		expect(reasonOf('{"type":"other"}')).toBe("unknownStructure");
		expect(reasonOf("---\nexcalidraw-plugin: parsed\n---\n# Just a note\n", "md")).toBe("unknownStructure");
		expect(reasonOf("---\nexcalidraw-plugin: parsed\n---\n## Drawing\n```compressed-json\n!!!\n```\n", "md")).toBe("unreadableData");
	});
});

describe("excalidraw importer: the scene fixture", () => {
	const board = new Board(convertExcalidraw(sceneSource(), context()));
	const report = board.result.report;

	it("passes the plugin's own checks without a single complaint", () => {
		expect(() => assertImportedBoard(board.result.document)).not.toThrow();
		const validated = validateMiroCanvasMetadata(board.result.document.miroCanvas);
		expect(validated.valid).toBe(true);
		expect(validated.diagnostics).toEqual([]);
		for (const node of board.nodes) {
			expect(typeof node.id).toBe("string");
			expect(typeof node.type).toBe("string");
			for (const key of ["x", "y", "width", "height"] as const) expect(Number.isFinite(node[key])).toBe(true);
		}
	});

	it("brings every element over or reports it (LIMIT-001)", () => {
		const bound = new Set(Object.values(board.bindings).map((binding) => binding.sourceId.replace(/^excalidraw:/u, "")));
		const reported = new Set(report.entries.map((entry) => entry.sourceId));
		const elements = sceneElements();
		let deleted = 0;
		elements.forEach((element, index) => {
			if (element === null) {
				expect(reported.has(`#${index}`)).toBe(true);
				return;
			}
			const id = element.id as string;
			if (element.isDeleted === true) {
				deleted += 1;
				expect(bound.has(id) || reported.has(id)).toBe(false);
				return;
			}
			const containerId = typeof element.containerId === "string" ? element.containerId : undefined;
			// Text inside a shape or on an arrow comes over as its container's text.
			const carried = containerId !== undefined && bound.has(containerId);
			expect(bound.has(id) || reported.has(id) || carried, id).toBe(true);
		});
		expect(report.counts.skipped).toBe(deleted);
		expect(deleted).toBe(2);
	});

	it("counts each element once: converted, or under its entries", () => {
		const elementIds = new Set(report.entries.map((entry) => entry.sourceId));
		const onceKinds = ["roughness", "hatch", "groups", "opacity", "imageCrop", "background"];
		const elementEntries = [...elementIds].filter((id) => !onceKinds.includes(id));
		const live = sceneElements().filter((element) => element === null || element.isDeleted !== true);
		expect(report.counts.converted + elementEntries.length).toBe(live.length);
		expect(report.counts).toEqual({ converted: 16, approximated: 6, notImported: 14, skipped: 2 });
	});

	it("reports what the board cannot draw once per kind", () => {
		for (const [reason, field] of [
			["roughness", "roughness"],
			["hatch", "fillStyle"],
			["groups", "groupIds"],
			["opacity", "opacity"],
			["imageCrop", "crop"],
			["background", "viewBackgroundColor"],
		] as const) {
			expect(board.entries(reason)).toEqual([{ sourceId: reason, sourceType: field, status: "plugin-unsupported", reason }]);
		}
	});

	it("writes the scene's version into the report", () => {
		expect(report.format).toBe("excalidraw");
		expect(report.formatVersion).toBe("2");
		expect(report.sourcePath).toBe("Drawings/scene.excalidraw");
		expect(report.importedAt).toBe(FIXED_NOW);
	});

	it("makes frames named groups drawn under every card", () => {
		const plan = board.node("frame-plan");
		expect(plan).toMatchObject({ type: "group", label: "Plan", x: -100, y: -100, width: 1400, height: 900 });
		expect(board.override("frame-plan").item).toEqual({ type: "frame" });
		expect(board.node("magic-1")).toMatchObject({ type: "group", label: "" });
		const groups = board.nodes.filter((node) => node.type === "group").map((node) => node.id);
		expect(board.nodes.slice(0, groups.length).map((node) => node.id)).toEqual(groups);
	});

	it("makes shapes shape cards with their fill, outline and the text inside", () => {
		const box = board.node("box");
		expect(box).toMatchObject({ type: "text", x: 0, y: 0, width: 200, height: 100 });
		expect(box.text).toBe("Start\n\n[https://example.com/spec](https://example.com/spec)");
		expect(board.override("box")).toMatchObject({
			shape: { kind: "round_rectangle", fallback: "text" },
			colors: { fill: "#a5d8ff", border: "#1e1e1e", text: "#1971c2" },
			borderStyle: "dashed",
			borderWidth: 2,
			typography: { fontSize: 20, fontFamily: "Excalifont", alignment: "center", verticalAlign: "center" },
		});
		expect(board.entries("box")).toEqual([
			{ sourceId: "box", sourceType: "rectangle", status: "approximated", reason: "elementLink", nodeId: box.id },
		]);

		expect(board.override("plain")).toMatchObject({ shape: { kind: "rectangle" }, colors: { fill: null }, borderStyle: "none" });
	});

	it("keeps a shape's turn as the card's rotation, about the same centre", () => {
		const oval = board.node("oval");
		expect(oval).toMatchObject({ x: 400, y: 0, width: 200, height: 100 });
		expect(board.override("oval")).toMatchObject({
			shape: { kind: "ellipse" },
			rotation: 30,
			colors: { fill: "#ffc9c9", border: "#1e1e1e" },
			borderStyle: "dotted",
		});
		expect(board.override("note").rotation).toBe(90);
	});

	it("keeps the plugin's raw text, the lock and the text's own link", () => {
		const choice = board.node("choice");
		expect(choice.text).toBe("Go? [[Decision log]]\n\n[https://example.com/why](https://example.com/why)");
		expect(board.override("choice")).toMatchObject({
			shape: { kind: "diamond" },
			locked: true,
			borderWidth: 4,
			colors: { border: "#e03131", fill: null, text: "#e03131" },
			typography: { fontFamily: "Virgil" },
		});
		expect(board.entries("choice-text")).toEqual([
			{ sourceId: "choice-text", sourceType: "text", status: "approximated", reason: "elementLink", nodeId: choice.id },
		]);
	});

	it("makes standalone text a text item with its font, size and alignment", () => {
		const note = board.node("note");
		expect(note).toMatchObject({ x: 0, y: 300, width: 180, height: 70 });
		expect(note.text).toBe("Remember\nthe milk\n\n[[Roadmap]]");
		expect(board.override("note")).toMatchObject({
			item: { type: "text" },
			colors: { text: "#2f9e44" },
			typography: { fontSize: 28, fontFamily: "Cascadia Code", alignment: "right", verticalAlign: "top" },
		});
	});

	it("joins an arrow bound at both ends as a native edge, holding where its ends lie", () => {
		const edge = board.edge("a-both");
		expect(edge).toMatchObject({
			fromNode: board.idOf("box"),
			toNode: board.idOf("choice"),
			fromSide: "right",
			toSide: "left",
			fromEnd: "arrow",
			label: "yes",
		});
		const override = board.override("a-both");
		expect(override.connectorAnchors).toEqual({
			from: { type: "node", nodeId: board.idOf("box"), u: 1, v: 0.5 },
			to: { type: "node", nodeId: board.idOf("choice"), u: 0, v: 0.5 },
		});
		expect(override.connector).toMatchObject({
			route: "curved",
			startCap: "filled_circle",
			endCap: "filled_triangle",
			width: 2,
			strokeStyle: "solid",
			waypoints: [{ x: 300, y: 30 }],
		});
		expect(override.colors).toEqual({ edge: "#1971c2" });
	});

	it("holds an end on a turned shape at the share of its unturned box", () => {
		const connector = board.connectors[board.idOf("a-oval")]!;
		expect(connector.from).toEqual({ type: "node", nodeId: board.idOf("oval"), u: 1, v: 0.5 });
		expect(connector.to).toEqual({ type: "free", x: 700, y: 200 });
		expect(connector.route).toBe("elbowed");
		expect(connector.waypoints).toEqual([{ x: 650, y: 100 }, { x: 650, y: 200 }]);
		expect(connector.startCap).toBe("erd_one");
		expect(connector.endCap).toBe("erd_many");
		expect(board.entries("a-oval")).toEqual([{ sourceId: "a-oval", sourceType: "arrow", status: "approximated", reason: "arrowhead" }]);

		// The end on the turned text card lies on its bottom middle once turned.
		const toText = board.override("a-text").connectorAnchors as Record<string, Record<string, unknown>>;
		expect(toText.from).toEqual({ type: "node", nodeId: board.idOf("note"), u: 0.5, v: 1 });
	});

	it("works a free arrow's turn into its ends", () => {
		const connector = board.connectors[board.idOf("a-free")]!;
		expect(connector.from).toEqual({ type: "free", x: 850, y: -50 });
		expect(connector.to).toEqual({ type: "free", x: 850, y: 50 });
		expect(connector.route).toBe("straight");
		expect(connector.waypoints).toEqual([]);
		expect(connector.startCap).toBe("circle");
		expect(connector.endCap).toBe("triangle");
	});

	it("draws each arrowhead as the board's matching end", () => {
		const text = board.override("a-text").connector as Record<string, unknown>;
		expect([text.startCap, text.endCap]).toEqual(["filled_diamond", "diamond"]);
		const crow = board.override("a-crow").connector as Record<string, unknown>;
		expect([crow.startCap, crow.endCap, crow.strokeStyle]).toEqual(["erd_one", "erd_one_or_many", "dashed"]);
		const plain = board.edge("a-plain");
		expect(plain.fromEnd).toBeUndefined();
		expect(plain.toEnd).toBeUndefined();
		expect((board.override("a-plain").connector as Record<string, unknown>).endCap).toBe("arrow");
		const odd = board.connectors[board.idOf("a-odd")]!;
		expect([odd.startCap, odd.endCap]).toEqual(["filled_circle", "arrow"]);
		expect(board.entries("a-odd")).toEqual([
			{ sourceId: "a-odd", sourceType: "arrow", status: "approximated", reason: "arrowhead" },
			{ sourceId: "a-odd", sourceType: "arrow", status: "plugin-unsupported", reason: "elementLink" },
		]);
		// Its start was bound to a deleted shape: it stays where it was.
		expect(odd.from).toEqual({ type: "free", x: 1000, y: 300 });
	});

	it("holds an arrow on a placeholder and on a file card", () => {
		const toPicture = board.override("a-text").connectorAnchors as Record<string, Record<string, unknown>>;
		expect(toPicture.to).toEqual({ type: "node", nodeId: board.idOf("picture-data"), u: 0.5, v: 0 });
		const toNote = board.override("a-plain").connectorAnchors as Record<string, Record<string, unknown>>;
		expect(toNote.from).toEqual({ type: "node", nodeId: board.idOf("box"), u: 0, v: 0.5 });
		expect(toNote.to).toEqual({ type: "node", nodeId: board.idOf("note-file"), u: 0.25, v: 0 });
		expect((board.override("a-plain").connector as Record<string, unknown>).waypoints).toEqual([
			{ x: -100, y: 50 },
			{ x: -100, y: 550 },
			{ x: 900, y: 550 },
		]);
	});

	it("works a line's turn into its points", () => {
		const connector = board.connectors[board.idOf("zigzag")]!;
		const centre = { x: 100, y: 825 };
		const turned = [
			{ x: 0, y: 800 },
			{ x: 100, y: 850 },
			{ x: 200, y: 800 },
		].map((point) => rotate(point, centre, Math.PI / 4));
		const round = (value: number): number => Math.round(value * 100) / 100;
		expect(connector.from).toEqual({ type: "free", x: round(turned[0]!.x), y: round(turned[0]!.y) });
		expect(connector.waypoints).toEqual([{ x: round(turned[1]!.x), y: round(turned[1]!.y) }]);
		expect(connector.to).toEqual({ type: "free", x: round(turned[2]!.x), y: round(turned[2]!.y) });
		expect(connector.startCap).toBe("none");
		expect(connector.endCap).toBe("none");
		expect(connector.strokeStyle).toBe("dashed");
	});

	it("makes pen strokes drawings whose points carry the turn", () => {
		const scribble = board.node("scribble");
		const item = board.override("scribble").item as { type: string; stroke: { color: string; width: number; opacity: number; box: { width: number; height: number }; points: number[] } };
		expect(item.type).toBe("drawing");
		expect(item.stroke.color).toBe("#2f9e44");
		expect(item.stroke.width).toBe(8.5);
		expect(item.stroke.opacity).toBe(0.5);
		expect(item.stroke.box).toEqual({ width: scribble.width, height: scribble.height });
		// Turned half round about (120, 1005): the first point lands at (140, 1010).
		const source = [[0, 0], [10, 5], [20, 0], [30, 10], [40, 0]].map(([x, y]) => rotate({ x: 100 + x!, y: 1000 + y! }, { x: 120, y: 1005 }, Math.PI));
		const onBoard = [];
		for (let index = 0; index < item.stroke.points.length; index += 2) {
			onBoard.push({ x: scribble.x + item.stroke.points[index]!, y: scribble.y + item.stroke.points[index + 1]! });
		}
		expect(onBoard).toHaveLength(source.length);
		onBoard.forEach((point, index) => {
			expect(point.x).toBeCloseTo(source[index]!.x, 1);
			expect(point.y).toBeCloseTo(source[index]!.y, 1);
		});
		expect(onBoard[0]!.x).toBeCloseTo(140, 1);
		expect(onBoard[0]!.y).toBeCloseTo(1010, 1);
		// Every point lies inside the card, half the stroke's width from its edge.
		for (const point of onBoard) {
			expect(point.x).toBeGreaterThanOrEqual(scribble.x + item.stroke.width / 2);
			expect(point.x).toBeLessThanOrEqual(scribble.x + scribble.width - item.stroke.width / 2);
		}

		const dot = board.override("dot").item as { stroke: { points: number[]; width: number } };
		expect(dot.stroke.points).toHaveLength(4);
		expect(dot.stroke.width).toBe(4.25);
	});

	it("leaves a placeholder for pictures and embeds that cannot come over", () => {
		expect(board.entries("picture-data")).toEqual([
			{ sourceId: "picture-data", sourceType: "image", status: "missing-asset", reason: "embeddedImage", nodeId: board.idOf("picture-data") },
		]);
		expect(board.node("picture-data")).toMatchObject({ x: 0, y: 500, width: 300, height: 160 });
		expect(board.override("picture-data").borderStyle).toBe("dashed");
		expect(board.entries("picture-lost")[0]).toMatchObject({ status: "missing-asset", reason: "imageNotFound" });
		expect(board.entries("note-missing")[0]).toMatchObject({ status: "missing-asset", reason: "imageNotFound" });
		expect(board.entries("iframe-1")[0]).toMatchObject({ sourceType: "iframe", status: "unsupported", reason: "iframe" });
		expect(board.entries("sticker")[0]).toMatchObject({ sourceType: "sticker", status: "unsupported", reason: "unknownElement" });
	});

	it("shows an embedded note as a file card and a web page as a link", () => {
		expect(board.node("note-file")).toMatchObject({ type: "file", file: "Notes/Meeting notes.md", x: 800, y: 600, width: 400, height: 300 });
		const web = board.node("web");
		expect(web.text).toBe("[https://www.youtube.com/watch?v=dQw4w9WgXcQ](https://www.youtube.com/watch?v=dQw4w9WgXcQ)");
		expect(board.entries("web")).toEqual([{ sourceId: "web", sourceType: "embeddable", status: "approximated", reason: "embed", nodeId: web.id }]);
	});

	it("reports elements whose data cannot be read, without a card", () => {
		expect(board.entries("broken")).toEqual([{ sourceId: "broken", sourceType: "rectangle", status: "invalid-source", reason: "invalidElement" }]);
		const nullIndex = sceneElements().indexOf(null as unknown as Record<string, unknown>);
		expect(board.entries(`#${nullIndex}`)).toEqual([{ sourceId: `#${nullIndex}`, sourceType: "element", status: "invalid-source", reason: "invalidElement" }]);
	});

	it("binds every card and line to its element with the importer's role", () => {
		expect(board.bindings[board.idOf("box")]).toEqual({ sourceId: "excalidraw:box", role: "import:excalidraw:rectangle" });
		expect(board.bindings[board.idOf("a-both")]).toEqual({ sourceId: "excalidraw:a-both", role: "import:excalidraw:arrow" });
		expect(board.bindings[board.idOf("iframe-1")]).toEqual({ sourceId: "excalidraw:iframe-1", role: "import:excalidraw:iframe" });
	});

	it("builds the same board every time from the same seed, and leaves the source as it was", () => {
		const source = sceneSource();
		const before = source.text;
		const first = convertExcalidraw(source, context(3));
		const second = convertExcalidraw(source, context(3));
		expect(JSON.stringify(second)).toBe(JSON.stringify(first));
		expect(source.text).toBe(before);
		expect(source.text).toBe(fixture("scene.excalidraw"));
	});
});

describe("excalidraw importer: the plugin's notes", () => {
	it("keeps wikilinks from Text Elements and resolves embedded files through the vault", () => {
		const board = new Board(convertExcalidraw(noteSource("plugin-json.excalidraw.md"), context()));
		expect(() => assertImportedBoard(board.result.document)).not.toThrow();
		expect(board.node("r8Hc2LmQ").text).toBe("See [[Project plan]]\n\n[[Roadmap]]");
		expect(board.node("Tq7mZ2cD").text).toBe("# Launch\n\nIdeas for the launch\n- faster onboarding");
		expect(board.node("i4Wn6YsE")).toMatchObject({ type: "file", file: "Attachments/diagram.png", x: 0, y: 200, width: 320, height: 180 });
		expect(board.node("l2Vb8NuR").text).toBe("$$E = mc^2$$");
		expect(board.entries("l2Vb8NuR")[0]).toMatchObject({ status: "approximated", reason: "formula" });
		expect(board.node("u5Kd1JtP").text).toBe("[https://example.com/logo.png](https://example.com/logo.png)");
		expect(board.entries("u5Kd1JtP")[0]).toMatchObject({ status: "approximated", reason: "embed" });
		const edge = board.edge("a9Fg3HxW");
		expect(edge).toMatchObject({ fromNode: board.idOf("r8Hc2LmQ"), toNode: board.idOf("Tq7mZ2cD"), fromSide: "right", toSide: "left" });
		expect(board.result.report.formatVersion).toBe("2");
		expect(board.entries("roughness")).toHaveLength(1);
	});

	it("reports a picture whose file is not in the vault", () => {
		const source = noteSource("plugin-json.excalidraw.md");
		const board = new Board(convertExcalidraw(source, { ...context(), resolveLink: () => undefined }));
		expect(board.entries("i4Wn6YsE")[0]).toMatchObject({ status: "missing-asset", reason: "imageNotFound" });
	});

	it("reads a compressed drawing into the same board as the plain one", () => {
		const plain = noteSource("plugin-json.excalidraw.md");
		const fence = /```json\n([\s\S]*?)\n```/u.exec(plain.text.replace(/\r\n/gu, "\n"));
		if (fence === null) throw new Error("fixture has no drawing fence");
		const packed = compressToBase64(fence[1]!).replace(/(.{256})/gu, "$1\n");
		const compressed = { ...plain, text: plain.text.replace(/\r\n/gu, "\n").replace(fence[0], "```compressed-json\n" + packed + "\n```") };
		const fromPlain = convertExcalidraw(plain, context(5));
		const fromCompressed = convertExcalidraw(compressed, context(5));
		expect(JSON.stringify(fromCompressed)).toBe(JSON.stringify(fromPlain));
	});

	it("imports the compressed fixture the plugin would write", () => {
		const result = convertExcalidraw(noteSource("plugin-compressed.excalidraw.md"), context());
		expect(() => assertImportedBoard(result.document)).not.toThrow();
		expect((result.document.nodes as unknown[]).length).toBeGreaterThan(0);
	});
});
