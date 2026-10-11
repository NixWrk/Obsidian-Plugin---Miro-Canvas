import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { assertImportedBoard, idFactory } from "../src/importers/board-builder";
import { estimateCardSize, mindmapOutlineAdapter, parseMindmapOutline, type OutlineNode } from "../src/importers/mindmap-outline";
import { findAdapter } from "../src/importers/registry";
import type { ImportContext, ImportResult, ImportSource } from "../src/importers/types";
import { validateMiroCanvasMetadata } from "../src/metadata";
import { readableInk } from "../src/miro-palette";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "import", "mindmap");
const OUTLINE_PATH = "Maps/outline-basic.md";

interface Node {
	readonly id: string;
	readonly type: string;
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
	readonly text?: string;
}

interface Edge {
	readonly id: string;
	readonly fromNode: string;
	readonly toNode: string;
	readonly fromSide?: string;
	readonly toSide?: string;
	readonly toEnd?: string;
	readonly fromEnd?: string;
}

/** The fixture as written, whatever line endings the checkout gave it. */
function fixture(name: string): string {
	return readFileSync(join(FIXTURES, name), "utf8").replace(/\r\n/gu, "\n");
}

function context(seed = 11): ImportContext {
	return { importerVersion: "9.9.9", now: "2026-09-28T10:00:00.000Z", newId: idFactory(seed), resolveLink: () => undefined };
}

function note(text: string, frontmatter?: Record<string, unknown>, path = OUTLINE_PATH): ImportSource {
	return { path, extension: "md", text, ...(frontmatter === undefined ? {} : { frontmatter }) };
}

function convert(text: string, seed = 11): ImportResult {
	return mindmapOutlineAdapter.convert(note(text, { "mindmap-plugin": "basic" }), context(seed));
}

function nodesOf(result: ImportResult): Node[] {
	return result.document.nodes as Node[];
}

function edgesOf(result: ImportResult): Edge[] {
	return result.document.edges as Edge[];
}

function metadataOf(result: ImportResult): Record<string, Record<string, Record<string, unknown>>> {
	return result.document.miroCanvas as Record<string, Record<string, Record<string, unknown>>>;
}

/** The card bound to the source line, by its number in the file. */
function cardOfLine(result: ImportResult, line: number): Node {
	const bindings = metadataOf(result).bindings!;
	const id = Object.keys(bindings).find((key) => bindings[key]!.sourceId === `mindmap-outline:line:${line}`);
	if (id === undefined) throw new Error(`no card for line ${line}`);
	return nodesOf(result).find((node) => node.id === id)!;
}

/** The tree as texts, for comparing shapes at a glance. */
function shape(node: OutlineNode): unknown {
	if (node.children.length === 0) return node.text;
	return { [node.text]: node.children.map(shape) };
}

function overlaps(first: Node, second: Node): boolean {
	return first.x < second.x + second.width && second.x < first.x + first.width
		&& first.y < second.y + second.height && second.y < first.y + first.height;
}

function expectNoOverlaps(nodes: readonly Node[]): void {
	for (let first = 0; first < nodes.length; first += 1) {
		for (let second = first + 1; second < nodes.length; second += 1) {
			const a = nodes[first]!;
			const b = nodes[second]!;
			expect(overlaps(a, b), `${a.text ?? a.id} overlaps ${b.text ?? b.id}`).toBe(false);
		}
	}
}

/** A made-up outline of many branches with texts of many lengths, the same every time. */
function largeOutline(): string {
	const lines = ["---", "mindmap-plugin: basic", "---", "# Centre"];
	let seed = 5;
	const next = (): number => {
		seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
		return seed;
	};
	for (let section = 0; section < 6; section += 1) {
		lines.push(`## Section ${section} ${"long ".repeat(next() % 12)}`.trimEnd());
		let depth = 0;
		for (let item = 0; item < 30; item += 1) {
			depth = Math.max(0, Math.min(depth + (next() % 3) - 1, 4));
			lines.push(`${"\t".repeat(depth)}- item ${section}.${item} ${"word ".repeat(next() % 25)}`.trimEnd());
			if (next() % 5 === 0) lines.push(`${"\t".repeat(depth)}and a second line`);
		}
	}
	return lines.join("\n");
}

describe("mind map outline: recognising the note", () => {
	it("takes a note marked mindmap-plugin: basic, from Obsidian's properties or from the text", () => {
		const text = fixture("outline-basic.md");
		expect(mindmapOutlineAdapter.detect(note(text, { "mindmap-plugin": "basic" }))).toBe(true);
		expect(mindmapOutlineAdapter.detect(note(text))).toBe(true);
		expect(mindmapOutlineAdapter.detect(note("---\nmindmap-plugin: \"Basic\"\n---\n# Root\n"))).toBe(true);
		expect(findAdapter(note(text))?.id).toBe("mindmap-outline");
	});

	it("leaves Markmind's rich maps, other notes and other files alone", () => {
		expect(mindmapOutlineAdapter.detect(note("---\nmindmap-plugin: rich\n---\n# md\n", { "mindmap-plugin": "rich" }))).toBe(false);
		expect(mindmapOutlineAdapter.detect(note("# Just a note\n- item\n"))).toBe(false);
		expect(mindmapOutlineAdapter.detect(note("---\ntags: [a]\n---\n# Root\n", { tags: ["a"] }))).toBe(false);
		// A properties block that never closes is not one.
		expect(mindmapOutlineAdapter.detect(note("---\nmindmap-plugin: basic\n# Root\n"))).toBe(false);
		expect(mindmapOutlineAdapter.detect({ path: "a.canvas", extension: "canvas", text: "---\nmindmap-plugin: basic\n---\n" })).toBe(false);
	});
});

describe("mind map outline: reading the tree", () => {
	it("reads headings, nested lists, multi-line items, code, tables and a second root", () => {
		const outline = parseMindmapOutline(fixture("outline-basic.md"));
		expect(outline.format).toBe("basic");
		expect(outline.preamble?.text).toBe("Notes written before the map begins,\nwith a [[Link]] that must survive.");
		expect(outline.roots.map(shape)).toEqual([
			{
				"Product plan": [
					{
						Research: [
							{ Interviews: ["Five customers", "Two partners"] },
							{ "Survey\nwith a second line": ["Question A", "", "Question B"] },
						],
					},
					{
						Build: [
							"```js\nconst answer = 42;\n\nconsole.log(answer);\n```",
							"Plain *item* with `code`",
							{ "Budget\n\n| Item | Cost |\n| --- | --- |\n| Servers | 100 |": ["First milestone", { "Second milestone": ["Nested under the second"] }] },
						],
					},
				],
			},
			{ "Second root": ["Its only child"] },
		]);
	});

	it("takes Enhancing Mindmap's fold mark off the text and remembers the fold", () => {
		const outline = parseMindmapOutline(fixture("outline-basic.md"));
		const folded: string[] = [];
		const stack = [...outline.roots];
		while (stack.length > 0) {
			const node = stack.pop()!;
			if (node.folded) folded.push(node.text);
			stack.push(...node.children);
		}
		expect(folded.sort()).toEqual(["Two partners", "```js\nconst answer = 42;\n\nconsole.log(answer);\n```"].sort());
	});

	it("reads the note's other properties so the report can name them", () => {
		const outline = parseMindmapOutline(fixture("outline-basic.md"));
		expect(outline.properties).toEqual([
			{ key: "display-mode", line: 3, lines: [3] },
			{ key: "tags", line: 4, lines: [4, 5, 6] },
		]);
		expect([...outline.frontmatterLines].sort((a, b) => a - b)).toEqual([1, 2, 7]);
	});

	it("reads Windows line endings and a byte-order mark the same way", () => {
		const text = fixture("outline-basic.md");
		const windows = `${String.fromCharCode(0xfeff)}${text.replace(/\n/gu, "\r\n")}`;
		expect(parseMindmapOutline(windows).roots.map(shape)).toEqual(parseMindmapOutline(text).roots.map(shape));
	});

	it("makes each top item a root in a note with no heading", () => {
		const outline = parseMindmapOutline("Intro line\n- One\n\t- One a\n- Two\n");
		expect(outline.preamble?.text).toBe("Intro line");
		expect(outline.roots.map(shape)).toEqual([{ One: ["One a"] }, "Two"]);
	});

	it("keeps a heading inside an unclosed fence as code", () => {
		const outline = parseMindmapOutline("# Root\n```\n# not a heading\n- not an item\n");
		expect(outline.roots.map(shape)).toEqual(["Root\n```\n# not a heading\n- not an item\n"]);
	});
});

describe("mind map outline: the board", () => {
	const text = fixture("outline-basic.md");

	it("builds a board the plugin reads without a single diagnostic", () => {
		const result = convert(text);
		expect(() => assertImportedBoard(result.document)).not.toThrow();
		const validated = validateMiroCanvasMetadata(result.document.miroCanvas);
		expect(validated.valid).toBe(true);
		expect(validated.diagnostics).toEqual([]);
		for (const node of nodesOf(result)) {
			expect(node.type).toBe("text");
			for (const key of ["x", "y", "width", "height"] as const) expect(Number.isInteger(node[key])).toBe(true);
		}
		expect(result.report.format).toBe("mindmap-outline");
		expect(result.report.formatVersion).toBe("basic");
		expect(result.report.sourcePath).toBe(OUTLINE_PATH);
	});

	it("puts every non-empty line of the note on the board or in the report", () => {
		const result = convert(text);
		const outline = parseMindmapOutline(text);
		const bindings = metadataOf(result).bindings!;
		const boundLines = new Set(Object.values(bindings).map((binding) => String(binding.sourceId)));
		const accounted = new Set<number>(outline.frontmatterLines);
		const cards: OutlineNode[] = outline.preamble === undefined ? [] : [outline.preamble];
		const stack = [...outline.roots];
		while (stack.length > 0) {
			const node = stack.pop()!;
			cards.push(node);
			stack.push(...node.children);
		}
		for (const card of cards) {
			expect(boundLines.has(`mindmap-outline:line:${card.line}`)).toBe(true);
			for (const line of card.lines) accounted.add(line);
		}
		const reported = new Set(result.report.entries.map((entry) => entry.sourceId));
		for (const property of outline.properties) {
			expect(reported.has(`line:${property.line}`)).toBe(true);
			for (const line of property.lines) accounted.add(line);
		}
		text.split("\n").forEach((line, index) => {
			if (line.trim() !== "") expect(accounted.has(index + 1), `line ${index + 1}: ${line}`).toBe(true);
		});
		// One card per heading, item and the text before the map.
		expect(nodesOf(result)).toHaveLength(cards.length);
	});

	it("keeps the note's text as it is on the cards, wiki links included", () => {
		const result = convert(text);
		expect(cardOfLine(result, 8).text).toBe("Notes written before the map begins,\nwith a [[Link]] that must survive.");
		expect(cardOfLine(result, 29).text).toBe("Plain *item* with `code`");
		expect(cardOfLine(result, 22).text).toBe("Build");
		expect(text).toBe(fixture("outline-basic.md"));
	});

	it("joins every parent to each child with a curved native line and no arrowhead", () => {
		const result = convert(text);
		const edges = edgesOf(result);
		// Every card but the two roots and the text before the map has a parent.
		expect(edges).toHaveLength(nodesOf(result).length - 3);
		expect(metadataOf(result).connectors).toBeUndefined();
		const overrides = metadataOf(result).localOverrides!;
		for (const edge of edges) {
			expect(edge.fromSide).toBe("right");
			expect(edge.toSide).toBe("left");
			expect(edge.toEnd).toBe("none");
			expect(edge.fromEnd).toBeUndefined();
			const connector = overrides[edge.id]!.connector as Record<string, unknown>;
			expect(connector.route).toBe("curved");
			expect(connector.endCap).toBe("none");
			expect(connector.startCap).toBe("none");
		}
		const research = cardOfLine(result, 13);
		const interviews = cardOfLine(result, 14);
		expect(edges.some((edge) => edge.fromNode === research.id && edge.toNode === interviews.id)).toBe(true);
	});

	it("draws each root as Miro draws a map's centre", () => {
		const result = convert(text);
		const overrides = metadataOf(result).localOverrides!;
		for (const line of [11, 40]) {
			const root = cardOfLine(result, line);
			expect(overrides[root.id]).toEqual({
				typography: { fontSize: 24, alignment: "center", verticalAlign: "center", format: { bold: true } },
				colors: { fill: "#4262ff", text: readableInk("#4262ff") },
				shape: { kind: "rectangle", fallback: "text" },
			});
		}
		expect(overrides[cardOfLine(result, 14).id]).toEqual({ item: { type: "text" } });
	});

	it("lays the map out as a tree to the right, cards sized from their text, none overlapping", () => {
		const result = convert(text);
		const nodes = nodesOf(result);
		for (const node of nodes) {
			expect(node.width).toBeGreaterThanOrEqual(120);
			expect(node.width).toBeLessThanOrEqual(360);
		}
		expectNoOverlaps(nodes);
		const byId = new Map(nodes.map((node) => [node.id, node] as const));
		for (const edge of edgesOf(result)) {
			const parent = byId.get(edge.fromNode)!;
			const child = byId.get(edge.toNode)!;
			expect(child.x).toBe(parent.x + parent.width + 80);
		}
		// The text before the map, then the first map, then the second, side by side.
		const preamble = cardOfLine(result, 8);
		const first = cardOfLine(result, 11);
		const second = cardOfLine(result, 40);
		expect(preamble.x).toBeLessThan(first.x);
		const firstMapRight = Math.max(...nodes.filter((node) => node.x >= first.x && node.x < second.x).map((node) => node.x + node.width));
		expect(second.x).toBeGreaterThanOrEqual(firstMapRight + 160);
		// A parent sits in the middle of its children.
		const survey = cardOfLine(result, 17);
		const questionA = cardOfLine(result, 19);
		const questionB = cardOfLine(result, 21);
		const middle = (questionA.y + questionB.y + questionB.height) / 2;
		expect(Math.abs(survey.y + survey.height / 2 - middle)).toBeLessThanOrEqual(1);
	});

	it("keeps a large map free of overlaps", () => {
		const result = convert(largeOutline());
		expect(nodesOf(result).length).toBeGreaterThan(150);
		expectNoOverlaps(nodesOf(result));
	});

	it("sizes cards from their text within the bounds", () => {
		expect(estimateCardSize("", false)).toEqual({ width: 120, height: 60 });
		const long = estimateCardSize("word ".repeat(200), false);
		expect(long.width).toBe(360);
		expect(long.height).toBeGreaterThan(200);
		const tall = estimateCardSize("a\nb\nc\nd\ne", false);
		expect(tall.height).toBeGreaterThan(estimateCardSize("a", false).height);
		expect(estimateCardSize("Root", true).height).toBeGreaterThanOrEqual(80);
		// A line that fits the card's width stays one line.
		expect(estimateCardSize("Five customers", false).height).toBe(60);
	});

	it("reports what came over differently, and the layout worked out anew", () => {
		const result = convert(text);
		const entries = result.report.entries.map(({ sourceId, sourceType, status, reason }) => ({ sourceId, sourceType, status, reason }));
		expect(entries).toEqual(expect.arrayContaining([
			{ sourceId: "line:8", sourceType: "text", status: "approximated", reason: "textBeforeRoot" },
			{ sourceId: "line:40", sourceType: "heading", status: "approximated", reason: "extraRoots" },
			{ sourceId: "line:16", sourceType: "list item", status: "approximated", reason: "foldedBranch" },
			{ sourceId: "line:23", sourceType: "list item", status: "approximated", reason: "foldedBranch" },
			{ sourceId: "line:3", sourceType: "property display-mode", status: "plugin-unsupported", reason: "frontmatter" },
			{ sourceId: "line:4", sourceType: "property tags", status: "plugin-unsupported", reason: "frontmatter" },
			{ sourceId: "layout", sourceType: "mind map", status: "approximated", reason: "layout" },
		]));
		expect(entries).toHaveLength(7);
		for (const entry of result.report.entries) {
			// The layout entry is about the whole map, not one card.
			if (entry.status === "approximated" && entry.sourceId !== "layout") {
				expect(nodesOf(result).some((node) => node.id === entry.nodeId)).toBe(true);
			}
		}
		const cards = nodesOf(result).length;
		// The whole map came over: only the note's properties are not imported.
		expect(result.report.counts).toEqual({ converted: cards - 4, approximated: 5, notImported: 2, skipped: 0 });
	});

	it("builds the same board every time from the same seed", () => {
		expect(convert(text, 3)).toEqual(convert(text, 3));
	});

	it("builds an empty board from a note with nothing but its properties", () => {
		const result = convert("---\nmindmap-plugin: basic\n---\n\n");
		expect(nodesOf(result)).toEqual([]);
		expect(edgesOf(result)).toEqual([]);
		expect(result.report.entries).toEqual([]);
	});
});

describe("outline Markdown appearance", () => {
	it("keeps hard-break spaces in labels and continuations", () => {
		const text = "---\nmindmap-plugin: basic\n---\n# Root\n- First  \n  Second  \n  Third\n";
		const outline = parseMindmapOutline(text);
		expect(outline.roots[0]!.children[0]!.text).toBe("First  \nSecond  \nThird");
		const result = mindmapOutlineAdapter.convert(note(text, { "mindmap-plugin": "basic" }), context());
		expect(nodesOf(result).some(node => node.text === "First  \nSecond  \nThird")).toBe(true);
		expect(result.report.entries.some(entry => entry.reason === "layout")).toBe(true);
	});
});
describe("optional captured source appearance", () => {
	const sourceText = "---\nmindmap-plugin: basic\n---\n# Root\n- Child\n";
	function capture() {
		return {
			sourceText,
			theme: "light",
			nodes: [
				{ sourceLine: 4, text: "Root", x: -100, y: 20, width: 160, height: 40,
					style: { typography: { fontSize: 18, lineHeight: 1.5, alignment: "left", verticalAlign: "center", format: { bold: true } },
						colors: { fill: null, text: "#123456", border: null }, borderStyle: "none", borderWidth: 0 } },
				{ sourceLine: 5, text: "Child", x: 200, y: 80, width: 120, height: 30 },
			],
			edges: [{ parentLine: 4, childLine: 5, points: [{x:60,y:40},{x:100,y:40},{x:140,y:95},{x:200,y:95}], color: "#445566", width: 2 }],
		};
	}
	function importCaptured(value: unknown) {
		return mindmapOutlineAdapter.convert(note(sourceText, { "mindmap-plugin": "basic" }), { ...context(), mindmapLayout: value });
	}
	it("preserves captured boxes/styles and sampled path geometry rather than inventing a new curve", () => {
		const result = importCaptured(capture());
		expect(nodesOf(result).map(node => [node.x,node.y,node.width,node.height])).toEqual([[-100,20,160,40],[200,80,120,30]]);
		const metadata = metadataOf(result);
		const root = nodesOf(result)[0]!;
		expect(metadata.localOverrides[root.id]!.colors).toEqual({ fill:null,text:"#123456",border:null });
		const edge = edgesOf(result)[0]!;
		expect((metadata.localOverrides[edge.id]!.connector as Record<string, unknown>).route).toBe("straight");
		expect((metadata.localOverrides[edge.id]!.connector as Record<string, unknown>).waypoints).toEqual([{x:100,y:40},{x:140,y:95}]);
		expect(edge.fromNode).toBe(root.id);
		expect(result.report.entries).toContainEqual({ sourceId: "layout", sourceType: "mind map", status: "approximated", reason: "appearance" });
		expect(metadata.localOverrides[root.id]!.item).toEqual({ type: "text" });
		expect(metadata.localOverrides[nodesOf(result)[1]!.id]!.item).toEqual({ type: "text" });
	});
	it("rejects stale, incomplete, duplicate, unsafe and different-tree captures atomically", () => {
		const fallback = importCaptured(undefined);
		const stale = capture(); stale.sourceText += "stale";
		const missing = capture(); missing.nodes.pop();
		const duplicate = capture(); duplicate.nodes[1]!.sourceLine = 4;
		const wrongText = capture(); wrongText.nodes[1]!.text = "Different";
		const wrongTree = capture(); wrongTree.edges[0]!.parentLine = 5;
		const missingEdge = capture(); missingEdge.edges.length = 0;
		const badPoint = capture(); badPoint.edges[0]!.points[1]!.x = NaN;
		const outside = capture(); outside.edges[0]!.points[0]!.x = -200;
		const badSize = capture(); badSize.nodes[1]!.width = 0;
		const unsafeStyle = capture(); Object.assign(unsafeStyle.nodes[0]!.style!, { url: "https://example.invalid" });
		for (const value of [stale,missing,duplicate,wrongText,wrongTree,missingEdge,badPoint,outside,badSize,unsafeStyle]) {
			expect(importCaptured(value)).toEqual(fallback);
		}
	});
	it("keeps source/capture immutable and repeats deterministically", () => {
		const value = capture();
		const before = JSON.stringify(value);
		expect(importCaptured(value)).toEqual(importCaptured(value));
		expect(JSON.stringify(value)).toBe(before);
	});
});