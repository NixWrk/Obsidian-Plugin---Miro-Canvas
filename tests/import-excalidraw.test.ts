import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { resolveAnchor } from "../src/anchors";
import { MAX_STROKE_POINTS, readLocalStroke, type LocalStroke } from "../src/local-items";

import { assertImportedBoard, idFactory } from "../src/importers/board-builder";
import { convertExcalidraw, detectExcalidraw, excalidrawAdapter } from "../src/importers/excalidraw";
import { ImportError, MAX_IMPORT_ELEMENTS, MAX_IMPORT_SOURCE_LENGTH, type ImportContext, type ImportEntry, type ImportResult, type ImportSource } from "../src/importers/types";
import { validateMiroCanvasMetadata } from "../src/metadata";
import { CONNECTOR_CAPS } from "../src/source-model";
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
		const onceKinds = ["roughness", "hatch", "opacity", "imageCrop", "background", "zOrder", ...report.entries.filter((entry) => entry.sourceType === "groupIds").map((entry) => entry.sourceId)];
		const elementEntries = [...elementIds].filter((id) => !onceKinds.includes(id));
		const live = sceneElements().filter((element) => element === null || element.isDeleted !== true);
		expect(report.counts.converted + elementEntries.length).toBe(live.length);
		const lost = new Set(report.entries.filter((entry) => entry.status !== "approximated" && entry.status !== "skipped").map((entry) => entry.sourceId));
		const approximated = new Set(report.entries.filter((entry) => entry.status === "approximated" && !lost.has(entry.sourceId)).map((entry) => entry.sourceId));
		expect(report.counts).toEqual({ converted: 13, approximated: approximated.size, notImported: lost.size, skipped: 2 });
	});

	it("reports what the board cannot draw once per kind", () => {
		for (const [reason, field] of [
			["roughness", "roughness"],
			["hatch", "fillStyle"],
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
			colors: { fill: "#a5d8ff", text: "#1971c2" },
			borderStyle: "dashed",
			borderWidth: 2,
			typography: { fontSize: 20, fontFamily: "Excalifont", alignment: "center", verticalAlign: "center" },
		});
		expect(board.entries("box")).toEqual([
			{ sourceId: "box", sourceType: "rectangle", status: "approximated", reason: "elementLink", nodeId: box.id },
		]);

		expect(board.override("plain")).toMatchObject({ shape: { kind: "rectangle" }, colors: { fill: null }, borderStyle: "none" });
	});

	it("leaves Excalidraw's default ink to the board, so text and outlines read on a dark board too", () => {
		// The box's outline and the zigzag line are drawn in Excalidraw's default #1e1e1e.
		expect((board.override("box").colors as Record<string, unknown>).border).toBeUndefined();
		expect(board.connectors[board.idOf("zigzag")]!.color).toBe("#7f7f7f");
		// A colour of its own is kept.
		expect((board.override("choice").colors as Record<string, unknown>).border).toBe("#e03131");
		expect(board.override("a-both").colors).toEqual({ edge: "#1971c2" });
	});

	it("keeps a shape's turn as the card's rotation, about the same centre", () => {
		const oval = board.node("oval");
		expect(oval).toMatchObject({ x: 400, y: 0, width: 200, height: 100 });
		expect(board.override("oval")).toMatchObject({
			shape: { kind: "ellipse" },
			rotation: 30,
			colors: { fill: "#ffc9c9" },
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
			startCap: "filled_oval",
			endCap: "filled_triangle",
			// Excalidraw draws a dot and a triangle 15 units long, whatever the line's width.
			headSize: 15,
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
		expect(board.entries("a-oval")).toEqual([
			{ sourceId: "a-oval", sourceType: "startBinding", status: "approximated", reason: "binding" },
			{ sourceId: "a-oval", sourceType: "arrow", status: "approximated", reason: "arrowhead" },
		]);

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
		expect(connector.startCap).toBe("oval");
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
		expect([odd.startCap, odd.endCap]).toEqual(["filled_oval", "arrow"]);
		expect(board.entries("a-odd")).toEqual([
			{ sourceId: "a-odd", sourceType: "startBinding", status: "source-limited", reason: "binding" },
			{ sourceId: "a-odd", sourceType: "arrow", status: "approximated", reason: "arrowhead" },
			{ sourceId: "a-odd", sourceType: "arrow", status: "plugin-unsupported", reason: "elementLinkDropped" },
		]);
		// Its start was bound to a deleted shape: it stays where it was.
		expect(odd.from).toEqual({ type: "free", x: 1000, y: 300 });
	});

	it("gives native edges only ends a native edge draws", () => {
		for (const edge of board.edges) {
			const connector = board.overrides[edge.id]?.connector as Record<string, unknown>;
			expect(CONNECTOR_CAPS as readonly unknown[], edge.id).toContain(connector.startCap);
			expect(CONNECTOR_CAPS as readonly unknown[], edge.id).toContain(connector.endCap);
		}
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
		// An open line is never filled by Excalidraw, whatever its fill says.
		expect(board.entries("zigzag")).toEqual([]);
	});

	it("reports the fill of a closed line, which the board does not draw", () => {
		const closed = board.connectors[board.idOf("closed-fill")]!;
		expect(closed.from).toEqual({ type: "free", x: 300, y: 800 });
		expect(closed.to).toEqual({ type: "free", x: 302, y: 803 });
		expect(board.entries("closed-fill")).toEqual([
			{ sourceId: "closed-fill", sourceType: "line", status: "approximated", reason: "lineFill" },
		]);
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
			{ sourceId: "picture-data", sourceType: "image", status: "invalid-source", reason: "invalidAsset", nodeId: board.idOf("picture-data") },
		]);
		expect(board.node("picture-data")).toMatchObject({ x: 0, y: 500, width: 300, height: 160 });
		expect(board.override("picture-data").borderStyle).toBe("dashed");
		expect(board.entries("picture-lost")[0]).toMatchObject({ status: "missing-asset", reason: "imageNotFound" });
		expect(board.entries("note-missing")[0]).toMatchObject({ status: "missing-asset", reason: "fileNotFound" });
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

	it("calls a missing embedded note a missing note, and a missing picture a missing picture", () => {
		const picture = { id: "shown-note", type: "image", x: 0, y: 0, width: 200, height: 100, fileId: "f-note" };
		const photo = { id: "shown-photo", type: "image", x: 300, y: 0, width: 200, height: 100, fileId: "f-photo" };
		const text = [
			"---",
			"excalidraw-plugin: parsed",
			"---",
			"# Excalidraw Data",
			"## Embedded Files",
			"f-note: [[Notes/Gone]]",
			"",
			"f-photo: [[Attachments/gone.png]]",
			"",
			"%%",
			"## Drawing",
			"```json",
			JSON.stringify({ type: "excalidraw", version: 2, elements: [picture, photo], appState: {}, files: {} }),
			"```",
			"%%",
		].join("\n");
		const source: ImportSource = { path: "Drawings/Missing.excalidraw.md", extension: "md", text, frontmatter: { "excalidraw-plugin": "parsed" } };
		const board = new Board(convertExcalidraw(source, { ...context(), resolveLink: () => undefined }));
		expect(board.entries("shown-note")[0]).toMatchObject({ status: "missing-asset", reason: "fileNotFound" });
		expect(board.entries("shown-photo")[0]).toMatchObject({ status: "missing-asset", reason: "imageNotFound" });
	});

	it("imports a drawing the Excalidraw plugin itself saved, compressed", () => {
		// Drawn in Excalidraw 2.24.1 in Obsidian and saved as it saves every drawing.
		const board = new Board(convertExcalidraw(noteSource("real-compressed.excalidraw.md"), context()));
		const document = board.result.document;
		expect(() => assertImportedBoard(document)).not.toThrow();
		expect(validateMiroCanvasMetadata(document.miroCanvas).diagnostics).toEqual([]);
		expect(board.result.report.formatVersion).toBe("2");
		expect(board.result.report.counts).toEqual({ converted: 6, approximated: 2, notImported: 3, skipped: 0 });
		expect(board.result.report.entries.map((entry) => entry.reason)).toEqual(["pressure", "binding", "binding", "roughness", "zOrder", "noteBody"]);

		expect(board.node("9gViyYN8")).toMatchObject({ type: "text", text: "Start", x: -512, y: -239, width: 200, height: 110 });
		expect(board.override("9gViyYN8").shape).toEqual({ kind: "round_rectangle", fallback: "text" });
		expect(board.node("HVJEafEp").text).toBe("Goal");
		expect(board.override("HVJEafEp").shape).toEqual({ kind: "ellipse", fallback: "text" });
		expect(board.override("DHxUxsiB")).toMatchObject({ shape: { kind: "diamond" }, colors: { fill: "#ffec99" } });
		expect(board.node("TGVDtk0t").text).toBe("Simple test drawing");
		expect(board.override("TGVDtk0t")).toMatchObject({ item: { type: "text" }, colors: { text: "#1971c2" } });

		// The arrow drawn from one shape to the other holds on to both, its head as large as Excalidraw drew it.
		const arrow = board.edge("fJB2wi5x");
		expect(arrow).toMatchObject({ fromNode: board.idOf("9gViyYN8"), toNode: board.idOf("HVJEafEp"), fromSide: "right", toSide: "left" });
		expect(board.override("fJB2wi5x").connector).toMatchObject({ startCap: "none", endCap: "arrow", headSize: 25 });

		// The pen stroke drawn with the mouse.
		const strokes = Object.values(board.overrides).filter((override) => (override.item as { type?: string } | undefined)?.type === "drawing");
		expect(strokes).toHaveLength(1);
	});

	it("imports the compressed fixture the plugin would write", () => {
		const result = convertExcalidraw(noteSource("plugin-compressed.excalidraw.md"), context());
		expect(() => assertImportedBoard(result.document)).not.toThrow();
		expect((result.document.nodes as unknown[]).length).toBeGreaterThan(0);
	});
});

describe("excalidraw importer: fills the board does not draw", () => {
	function plainScene(elements: readonly Record<string, unknown>[]): ImportSource {
		const text = JSON.stringify({ type: "excalidraw", version: 2, elements, appState: {}, files: {} });
		return { path: "Drawings/fills.excalidraw", extension: "excalidraw", text };
	}

	function course(id: string, type: string, points: readonly (readonly [number, number])[], extra: Record<string, unknown> = {}): Record<string, unknown> {
		return { id, type, x: 0, y: 0, width: 100, height: 100, strokeColor: "#1e1e1e", backgroundColor: "#ffec99", fillStyle: "solid", points, ...extra };
	}

	it("reports the fill of a line marked a polygon, and of a pen stroke that closes on itself", () => {
		const board = new Board(convertExcalidraw(plainScene([
			course("polygon", "line", [[0, 0], [100, 0], [50, 80]], { polygon: true }),
			course("loop", "freedraw", [[0, 0], [60, 10], [30, 70], [1, 2]]),
			course("open", "freedraw", [[0, 0], [60, 10], [30, 70]]),
			course("unfilled", "line", [[0, 0], [100, 0], [50, 80], [0, 0]], { backgroundColor: "transparent" }),
			course("two-points", "line", [[0, 0], [0, 0]]),
		]), context()));
		expect(board.entries("polygon")).toEqual([{ sourceId: "polygon", sourceType: "line", status: "approximated", reason: "lineFill" }]);
		expect(board.entries("loop")).toEqual([
			{ sourceId: "loop", sourceType: "freedraw", status: "approximated", reason: "lineFill", nodeId: board.idOf("loop") },
		]);
		expect(board.entries("open")).toEqual([]);
		expect(board.entries("unfilled")).toEqual([]);
		expect(board.entries("two-points")).toEqual([]);
		expect(board.result.report.counts).toMatchObject({ converted: 3, approximated: 2 });
	});
});

describe("excalidraw importer: pen strokes in the default ink", () => {
	function strokeScene(elements: readonly Record<string, unknown>[]): ImportSource {
		const text = JSON.stringify({ type: "excalidraw", version: 2, elements, appState: {}, files: {} });
		return { path: "Drawings/ink.excalidraw", extension: "excalidraw", text };
	}

	function stroke(id: string, strokeColor: unknown): Record<string, unknown> {
		return { id, type: "freedraw", x: 0, y: 0, width: 60, height: 20, strokeColor, strokeWidth: 1, points: [[0, 0], [30, 20], [60, 0]] };
	}

	function inkOf(board: Board, id: string): { readonly color: string; readonly opacity?: number } {
		return (board.override(id).item as { stroke: { color: string; opacity?: number } }).stroke;
	}

	const scene = strokeScene([
		stroke("today", "#1e1e1e"),
		stroke("older", "#000000"),
		stroke("unreadable", "ink"),
		stroke("half", "#1e1e1e80"),
		stroke("green", "#2f9e44"),
	]);

	it("draws the default ink as the board's own pen does on a dark board", () => {
		const board = new Board(convertExcalidraw(scene, { ...context(), theme: "dark" }));
		for (const id of ["today", "older", "unreadable", "half"]) {
			expect(inkOf(board, id).color, id).toBe("#ffffff");
		}
		// A stroke's transparency is its own, apart from the ink.
		expect(inkOf(board, "half").opacity).toBe(0.5);
		expect(inkOf(board, "green").color).toBe("#2f9e44");
	});

	it("draws the default ink as the board's own pen does on a light board, and when the theme is unknown", () => {
		for (const theme of ["light", undefined] as const) {
			const board = new Board(convertExcalidraw(scene, { ...context(), ...(theme === undefined ? {} : { theme }) }));
			for (const id of ["today", "older", "unreadable"]) {
				expect(inkOf(board, id).color, `${id} ${theme}`).toBe("#1a1a1a");
			}
			expect(inkOf(board, "green").color).toBe("#2f9e44");
		}
	});
});


/** Author-generated data: provenance lives beside the expansion scene. */
function expansionSource(): ImportSource {
	return { path: "Drawings/excalidraw-expansion-semantics.excalidraw", extension: "excalidraw", text: fixture("excalidraw-expansion-semantics.excalidraw") };
}

function expansionBoard(elements: readonly Record<string, unknown>[]): Board {
	return new Board(convertExcalidraw({ path: "Drawings/excalidraw-expansion-generated.excalidraw", extension: "excalidraw", text: JSON.stringify({ type: "excalidraw", version: 2, elements }) }, context()));
}

function strokeOf(board: Board, sourceId: string): LocalStroke {
	return (board.override(sourceId).item as { stroke: LocalStroke }).stroke;
}

function penElement(extra: Record<string, unknown> = {}): Record<string, unknown> {
	return { id: "pen", type: "freedraw", x: -20, y: -30, angle: 0, strokeWidth: 2, points: [[0, 0], [10, 0], [20, 10]], pressures: [0, 0.5, 1], simulatePressure: false, ...extra };
}

describe("excalidraw expansion: pressure and rotation", () => {
	it("preserves a measured width at every rotated point, including repeated coordinates", () => {
		const board = new Board(convertExcalidraw(expansionSource(), context()));
		const node = board.node("measured");
		const stroke = strokeOf(board, "measured");
		expect(readLocalStroke(stroke)).toEqual(stroke);
		expect(stroke.widths).toEqual([5.25, 16.17, 8.88, 12.02]);
		expect(stroke.width).toBe(16.17);
		const expected = [{ x: -64, y: -68 }, { x: -64, y: -56 }, { x: -64, y: -56 }, { x: -72, y: -44 }];
		for (let index = 0; index < expected.length; index += 1) {
			expect(node.x + stroke.points[index * 2]!).toBeCloseTo(expected[index]!.x, 2);
			expect(node.y + stroke.points[index * 2 + 1]!).toBeCloseTo(expected[index]!.y, 2);
			expect(stroke.points[index * 2]!).toBeGreaterThanOrEqual(stroke.width / 2);
			expect(stroke.points[index * 2 + 1]!).toBeGreaterThanOrEqual(stroke.width / 2);
			expect(stroke.points[index * 2]! + stroke.width / 2).toBeLessThanOrEqual(node.width);
			expect(stroke.points[index * 2 + 1]! + stroke.width / 2).toBeLessThanOrEqual(node.height);
		}
		expect(board.entries("measured")).toEqual([{ sourceId: "measured", sourceType: "pressures", status: "approximated", reason: "pressure", nodeId: node.id }]);
	});

	it("ignores stale samples when pressure is simulated and reports the outline approximation", () => {
		const board = new Board(convertExcalidraw(expansionSource(), context()));
		expect(strokeOf(board, "simulated").widths).toBeUndefined();
		expect(strokeOf(board, "simulated").width).toBe(8.5);
		expect(board.entries("simulated")[0]).toMatchObject({ status: "approximated", reason: "pressure" });
	});

	it("keeps the newer constant-width mode constant, irrespective of pressure samples", () => {
		const board = new Board(convertExcalidraw(expansionSource(), context()));
		expect(strokeOf(board, "uniform").widths).toBeUndefined();
		expect(strokeOf(board, "uniform").width).toBe(2.8);
		expect(board.entries("uniform")).toEqual([]);
	});

	it.each([undefined, [], [0.5], [0, 0.5, 1.01], [-0.1, 0.5, 1], [0, null, 1], "invalid"])("reports invalid measured pressures %j while retaining the drawing", (pressures) => {
		const board = expansionBoard([penElement({ pressures })]);
		expect(strokeOf(board, "pen").widths).toBeUndefined();
		expect(readLocalStroke(strokeOf(board, "pen"))).toBeDefined();
		expect(board.entries("pen")[0]).toMatchObject({ sourceType: "pressures", status: "invalid-source", reason: "pressure", nodeId: board.idOf("pen") });
	});

	it("duplicates the measured width with the point of a single-touch dot", () => {
		const board = expansionBoard([penElement({ points: [[3, -7]], pressures: [0] })]);
		const stroke = strokeOf(board, "pen");
		expect(stroke.points).toHaveLength(4);
		expect(stroke.widths).toEqual([5.25, 5.25]);
		expect(stroke.width).toBe(5.25);
	});

	it("keeps a pressure-only peak and matching sample indices when reducing a long straight stroke", () => {
		const count = MAX_STROKE_POINTS * 2;
		const peak = MAX_STROKE_POINTS + 7;
		const points = Array.from({ length: count }, (_, index) => [index, 0]);
		const pressures = points.map((_, index) => index === peak ? 1 : 0);
		const board = expansionBoard([penElement({ x: 0, y: 0, points, pressures })]);
		const node = board.node("pen");
		const stroke = strokeOf(board, "pen");
		expect(stroke.widths!.length).toBeLessThanOrEqual(MAX_STROKE_POINTS);
		expect(stroke.widths!.length).toBe(stroke.points.length / 2);
		const peakIndex = stroke.widths!.indexOf(16.17);
		expect(peakIndex).toBeGreaterThanOrEqual(0);
		expect(node.x + stroke.points[peakIndex * 2]!).toBe(peak);
		for (let index = 0; index < stroke.widths!.length; index += 1) {
			const sourceX = node.x + stroke.points[index * 2]!;
			expect(stroke.widths![index]).toBe(sourceX === peak ? 16.17 : 5.25);
		}
		expect(readLocalStroke(stroke)).toBeDefined();
	});

	it("bounds widths at the writer limit and never rounds a tiny stroke to zero", () => {
		for (const strokeWidth of [0.000001, 100_000]) {
			const board = expansionBoard([penElement({ strokeWidth })]);
			const stroke = strokeOf(board, "pen");
			expect(stroke.width).toBeGreaterThan(0);
			expect(stroke.width).toBeLessThanOrEqual(1_000);
			expect(readLocalStroke(stroke)).toBeDefined();
		}
	});

	it("reads a large point array without spreading it into a function call", () => {
		const points = Array.from({ length: 140_000 }, (_, index) => [index / 1_000, 0]);
		const board = expansionBoard([penElement({ points, pressures: [], simulatePressure: true, angle: Math.PI / 2 })]);
		expect(strokeOf(board, "pen").points.length / 2).toBeLessThanOrEqual(MAX_STROKE_POINTS);
		expect(readLocalStroke(strokeOf(board, "pen"))).toBeDefined();
	});
});

describe("excalidraw expansion: structural approximations and losses", () => {
	it("makes transparent native spatial groups, outer before inner, and reports membership as approximated", () => {
		const board = new Board(convertExcalidraw(expansionSource(), context()));
		const outer = board.node("group:outer-group");
		const inner = board.node("group:inner-group");
		expect(outer.type).toBe("group");
		expect(inner.type).toBe("group");
		expect(outer.label).toBe("");
		expect(board.nodes.indexOf(outer)).toBeLessThan(board.nodes.indexOf(inner));
		for (const sourceId of ["group:outer-group", "group:inner-group"]) {
			expect(board.override(sourceId)).toMatchObject({ item: { type: "frame" }, colors: { fill: null }, borderStyle: "none", borderWidth: 0 });
			expect(board.entries(sourceId)).toEqual([{ sourceId, sourceType: "groupIds", status: "approximated", reason: "groups", nodeId: board.idOf(sourceId) }]);
		}
		// The owner is rotated: its actual box spans x=-100..-60 and y=-120..-40.
		expect(inner).toMatchObject({ x: -101, y: -121, width: 42, height: 82 });
		expect(outer.x).toBeLessThanOrEqual(inner.x);
		expect(outer.y).toBeLessThanOrEqual(inner.y);
		expect(outer.x + outer.width).toBeGreaterThanOrEqual(board.node("goal").x + board.node("goal").width);
	});

	it("keeps spatial groups honest when their bounds also capture an unrelated card", () => {
		const box = { type: "rectangle", x: 0, y: 0, width: 20, height: 20, groupIds: ["g"] };
		const board = expansionBoard([{ ...box, id: "left" }, { ...box, id: "right", x: 100 }, { ...box, id: "unrelated", x: 50, groupIds: [] }]);
		expect(board.node("group:g")).toMatchObject({ x: -1, y: -1, width: 122, height: 22 });
		expect(board.entries("group:g")[0]).toMatchObject({ status: "approximated", reason: "groups" });
		expect(board.node("unrelated").x).toBe(50);
	});

	it("reports groups of independent lines that native spatial frames cannot capture", () => {
		const board = expansionBoard([{ id: "line", type: "line", x: 0, y: 0, points: [[0, 0], [40, 0]], groupIds: ["line-only"] }]);
		expect(board.nodes.filter((node) => node.type === "group")).toHaveLength(0);
		expect(board.entries("groups")).toEqual([{ sourceId: "groups", sourceType: "groupIds", status: "plugin-unsupported", reason: "groups" }]);
	});

	it("rejects malformed group IDs and avoids synthetic binding collisions", () => {
		const box = { type: "rectangle", x: 0, y: 0, width: 20, height: 20 };
		const board = expansionBoard([{ ...box, id: "group:g", groupIds: ["g"] }, { ...box, id: "bad-group", groupIds: ["", 2] }]);
		expect(board.node("group:g").type).toBe("text");
		expect(board.node("group:group:g").type).toBe("group");
		expect(board.entries("bad-group")[0]).toMatchObject({ sourceType: "groupIds", status: "invalid-source", reason: "groups" });
	});

	it("keeps named frame rotation and lock, while reporting explicit membership and invalid parents", () => {
		const board = new Board(convertExcalidraw(expansionSource(), context()));
		expect(board.override("inner-frame")).toMatchObject({ rotation: 90, locked: true, item: { type: "frame" } });
		expect(board.node("inner-frame").label).toBe("Вложенная рамка");
		expect(board.entries("inner-frame")[0]).toMatchObject({ sourceType: "frameId", status: "plugin-unsupported", reason: "frameMembership" });
		expect(board.entries("owner")[0]).toMatchObject({ sourceType: "frameId", status: "plugin-unsupported", reason: "frameMembership" });
		expect(board.entries("dangling-member")[0]).toMatchObject({ sourceType: "frameId", status: "invalid-source", reason: "frameMembership" });
		const self = expansionBoard([{ id: "self", type: "frame", x: 0, y: 0, width: 40, height: 40, frameId: "self" }]);
		expect(self.entries("self")[0]).toMatchObject({ status: "invalid-source", reason: "frameMembership" });
	});

	it("reports non-default image scale and non-empty customData rather than discarding them silently", () => {
		const board = new Board(convertExcalidraw(expansionSource(), context()));
		expect(board.entries("flipped")).toContainEqual({ sourceId: "flipped", sourceType: "scale", status: "plugin-unsupported", reason: "imageScale" });
		expect(board.entries("custom")).toEqual([{ sourceId: "custom", sourceType: "customData", status: "plugin-unsupported", reason: "customData" }]);
		expect(board.entries("empty-custom")).toEqual([]);
		expect(board.node("custom").text).toBe("Свойства");
		expect(JSON.stringify(board.result.document)).not.toContain("never execute");
		const defaults = expansionBoard([{ id: "normal", type: "image", x: 0, y: 0, width: 40, height: 40, scale: [1, 1] }]);
		expect(defaults.entries("normal").some((entry) => entry.reason === "imageScale")).toBe(false);
		const malformed = expansionBoard([{ id: "invalid-scale", type: "image", x: 0, y: 0, width: 40, height: 40, scale: [2, 1] }]);
		expect(malformed.entries("invalid-scale")).toContainEqual({ sourceId: "invalid-scale", sourceType: "scale", status: "invalid-source", reason: "imageScale" });
	});

	it("retains card array order despite conflicting fractional indices and reports cross-kind z-order loss", () => {
		const board = new Board(convertExcalidraw(expansionSource(), context()));
		expect(board.nodes.indexOf(board.node("owner"))).toBeLessThan(board.nodes.indexOf(board.node("goal")));
		expect(board.entries("zOrder")).toEqual([{ sourceId: "zOrder", sourceType: "elements", status: "plugin-unsupported", reason: "zOrder" }]);
		expect(board.node("owner").text).toBe("Связь [[Заметка]]");
	});
});

describe("excalidraw expansion: binding and import bounds", () => {
	it("binds an early arrow through contained text using the container's turn", () => {
		const board = new Board(convertExcalidraw(expansionSource(), context()));
		const edge = board.edge("lead-arrow");
		expect(edge.fromNode).toBe(board.idOf("owner"));
		expect(edge.toNode).toBe(board.idOf("goal"));
		const anchors = board.override("lead-arrow").connectorAnchors as Record<string, unknown>;
		expect(anchors.from).toEqual({ type: "node", nodeId: board.idOf("owner"), u: 1, v: 0.5 });
		expect(anchors.to).toEqual({ type: "node", nodeId: board.idOf("goal"), u: 0, v: 0.5 });
		const resolved = resolveAnchor(anchors.from, { nodes: { [board.idOf("owner")]: { ...board.node("owner"), rotation: 90 } } });
		expect(resolved.valid).toBe(true);
		expect(resolved.point).toMatchObject({ x: -80, y: -40 });
		expect(board.override("lead-arrow").connector).toMatchObject({ route: "elbowed", waypoints: [{ x: -80, y: 40 }] });
		expect(board.entries("lead-arrow").some((entry) => entry.reason === "binding")).toBe(false);
	});

	it("reads an orbit endpoint rather than its focus and reports lost gap/orbit behaviour", () => {
		const board = expansionBoard([
			{ id: "orbit", type: "arrow", x: 105, y: 20, points: [[0, 0], [100, 0]], startBinding: { elementId: "box", fixedPoint: [0.5, 0.5], mode: "orbit" } },
			{ id: "box", type: "rectangle", x: 0, y: 0, width: 100, height: 40 },
		]);
		const connector = board.connectors[board.idOf("orbit")]!;
		expect(connector.from).toEqual({ type: "node", nodeId: board.idOf("box"), u: 1, v: 0.5 });
		expect(connector.to).toEqual({ type: "free", x: 205, y: 20 });
		expect(board.entries("orbit")[0]).toMatchObject({ sourceType: "startBinding", status: "approximated", reason: "binding" });
	});

	it("reports a missing binding target while retaining the saved endpoint", () => {
		const board = expansionBoard([{ id: "dangling", type: "arrow", x: -10, y: -20, points: [[0, 0], [30, 0]], endBinding: { elementId: "absent" } }]);
		expect(board.connectors[board.idOf("dangling")]!.to).toEqual({ type: "free", x: 20, y: -20 });
		expect(board.entries("dangling")[0]).toMatchObject({ sourceType: "endBinding", status: "source-limited", reason: "binding" });
	});

	it("enforces the shared text and element caps before allocating board IDs", () => {
		const noIds = { ...context(), newId: (): string => { throw new Error("allocated before checking the cap"); } };
		const tooLong = { ...expansionSource(), text: " ".repeat(MAX_IMPORT_SOURCE_LENGTH + 1) };
		const tooMany = { ...expansionSource(), text: JSON.stringify({ type: "excalidraw", elements: Array.from({ length: MAX_IMPORT_ELEMENTS + 1 }, () => null) }) };
		for (const source of [tooLong, tooMany]) {
			expect(() => convertExcalidraw(source, noIds)).toThrowError(expect.objectContaining({ reason: "tooLarge" }));
		}
		const atLimit = expansionBoard(Array.from({ length: MAX_IMPORT_ELEMENTS }, () => ({ id: "deleted", type: "rectangle", isDeleted: true })));
		expect(atLimit.result.report.counts.skipped).toBe(MAX_IMPORT_ELEMENTS);
	});

	it("converts plain JSON, JSON Markdown and compressed Markdown identically without changing source bytes", () => {
		const plain = expansionSource();
		const original = plain.text;
		const convert = (encoding: "json" | "compressed-json"): ImportResult => {
			const drawing = encoding === "json" ? original : compressToBase64(original);
			return convertExcalidraw({ path: plain.path, extension: "md", frontmatter: { "excalidraw-plugin": "parsed" }, text: `---\nexcalidraw-plugin: parsed\n---\n## Drawing\n\`\`\`${encoding}\n${drawing}\n\`\`\`\n` }, context());
		};
		const result = convertExcalidraw(plain, context());
		expect(convert("json")).toEqual(result);
		expect(convert("compressed-json")).toEqual(result);
		expect(plain.text).toBe(original);
		expect(() => assertImportedBoard(result.document)).not.toThrow();
		expect(validateMiroCanvasMetadata(result.document.miroCanvas).diagnostics).toEqual([]);
	});
});
