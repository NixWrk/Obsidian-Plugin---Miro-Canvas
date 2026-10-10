import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { collapsedGroupOwners, groupCollapse, projectCollapsedGroups, toggleGroupCollapse } from "../src/board-groups";
import { buildCanvasAnchorGeometry } from "../src/connector-endpoints";
import { advancedCanvasAdapter } from "../src/importers/advanced-canvas";
import { addReportCard, assertImportedBoard, idFactory } from "../src/importers/board-builder";
import { findAdapter } from "../src/importers/registry";
import { ImportError, MAX_IMPORT_ELEMENTS, type ImportContext, type ImportEntry, type ImportResult, type ImportSource } from "../src/importers/types";
import { validateMiroCanvasMetadata } from "../src/metadata";

type UnknownRecord = Record<string, unknown>;

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "import", "advanced-canvas");
const STYLED = readFileSync(join(FIXTURES, "styled.canvas"), "utf8");
const FIXED_NOW = "2026-09-28T10:00:00.000Z";

function context(seed = 11): ImportContext {
	return {
		importerVersion: "9.9.9",
		now: FIXED_NOW,
		newId: idFactory(seed),
		resolveLink: () => undefined,
	};
}

function canvasSource(text: string, path = "Boards/Styled.canvas"): ImportSource {
	return { path, extension: "canvas", text };
}

function board(value: UnknownRecord): string {
	return JSON.stringify(value);
}

function convert(text: string, seed = 11): ImportResult {
	return advancedCanvasAdapter.convert(canvasSource(text), context(seed));
}

function records(value: unknown): UnknownRecord[] {
	return value as UnknownRecord[];
}

function metadataOf(result: ImportResult): UnknownRecord {
	return result.document.miroCanvas as UnknownRecord;
}

function overridesOf(result: ImportResult): Record<string, UnknownRecord> {
	return metadataOf(result).localOverrides as Record<string, UnknownRecord>;
}

function entriesFor(result: ImportResult, sourceId: string): ImportEntry[] {
	return result.report.entries.filter((entry) => entry.sourceId === sourceId);
}

function whyOf(entries: readonly ImportEntry[]): string[] {
	return entries.map((entry) => `${entry.status}:${entry.reason}`);
}

describe("recognising an Advanced Canvas board", () => {
	const plainNode = { id: "n", type: "text", text: "", x: 0, y: 0, width: 100, height: 60 };

	it("says yes to a board with Advanced Canvas's own fields", () => {
		expect(advancedCanvasAdapter.detect(canvasSource(STYLED))).toBe(true);
		expect(findAdapter(canvasSource(STYLED))?.id).toBe("advanced-canvas");
	});

	it("says yes for each kind of field on its own", () => {
		const cases: UnknownRecord[] = [
			{ nodes: [{ ...plainNode, styleAttributes: { shape: "pill" } }], edges: [] },
			{ nodes: [{ ...plainNode, type: "file", file: "B.canvas", portal: true }], edges: [] },
			{ nodes: [{ ...plainNode, type: "group", collapsed: true }], edges: [] },
			{ nodes: [{ ...plainNode, isStartNode: true }], edges: [] },
			{ nodes: [plainNode], edges: [], metadata: { version: "1.0-1.0", frontmatter: {}, startNode: "n" } },
			{
				nodes: [plainNode, { ...plainNode, id: "m" }],
				edges: [{ id: "e", fromNode: "n", toNode: "m", styleAttributes: { pathfindingMethod: "square" } }],
			},
		];
		for (const value of cases) expect(advancedCanvasAdapter.detect(canvasSource(board(value)))).toBe(true);
	});

	it("says no to a board Advanced Canvas only opened, or to any other file", () => {
		const opened = {
			nodes: [{ ...plainNode, styleAttributes: {} }, { ...plainNode, id: "m", styleAttributes: { shape: null, textAlign: null } }],
			edges: [],
			metadata: { version: "1.0-1.0", frontmatter: {} },
		};
		expect(advancedCanvasAdapter.detect(canvasSource(board(opened)))).toBe(false);
		expect(advancedCanvasAdapter.detect(canvasSource(board({ nodes: [plainNode], edges: [] })))).toBe(false);
		// Settings the plugin leaves alone are no reason to import.
		expect(advancedCanvasAdapter.detect(canvasSource(board({ nodes: [{ ...plainNode, dynamicHeight: true, zIndex: 2 }], edges: [] })))).toBe(false);
		expect(advancedCanvasAdapter.detect({ path: "Styled.md", extension: "md", text: STYLED })).toBe(false);
		expect(advancedCanvasAdapter.detect(canvasSource("{ not json"))).toBe(false);
		expect(advancedCanvasAdapter.detect(canvasSource("[]"))).toBe(false);
		expect(advancedCanvasAdapter.detect(canvasSource(""))).toBe(false);
	});
});

describe("importing an Advanced Canvas board", () => {
	it("hands back a board the plugin reads without a complaint", () => {
		const result = convert(STYLED);
		expect(() => assertImportedBoard(result.document)).not.toThrow();
		expect(validateMiroCanvasMetadata(result.document.miroCanvas).diagnostics).toEqual([]);
		for (const node of records(result.document.nodes)) {
			expect(typeof node.id).toBe("string");
			expect(typeof node.type).toBe("string");
			for (const key of ["x", "y", "width", "height"]) expect(Number.isFinite(node[key])).toBe(true);
		}
		const withCard = addReportCard(result, idFactory(99));
		expect(validateMiroCanvasMetadata(withCard.document.miroCanvas).diagnostics).toEqual([]);
		expect(withCard.document.miroSource).toEqual(result.document.miroSource);
	});

	it("keeps every card, every line and every field as the file has them", () => {
		const input = JSON.parse(STYLED) as UnknownRecord;
		const result = convert(STYLED);
		expect(records(result.document.nodes)).toEqual(input.nodes);
		expect(JSON.stringify(result.document.miroSource)).toBe(JSON.stringify(input.miroSource));
		expect(result.document.foo).toEqual(input.foo);
		expect(result.document.metadata).toEqual(input.metadata);
		// Only the line into a portal moved, onto the portal's card, and only the line to no card is gone.
		const inputEdges = records(input.edges);
		const expectedEdges = inputEdges
			.filter((edge) => edge.id !== "e-lost")
			.map((edge) => (edge.id === "e-into-portal" ? { ...edge, toNode: "portal" } : edge));
		expect(records(result.document.edges)).toEqual(expectedEdges);
	});

	it("leaves the source text as it was", () => {
		const source = canvasSource(STYLED);
		advancedCanvasAdapter.convert(source, context());
		expect(source.text).toBe(STYLED);
		expect(readFileSync(join(FIXTURES, "styled.canvas"), "utf8")).toBe(STYLED);
	});

	it("writes card styles as the plugin's overrides", () => {
		const overrides = overridesOf(convert(STYLED));
		expect(overrides["t-pill"]).toEqual({ shape: { kind: "flow_chart_terminator", fallback: "text" }, borderStyle: "dashed", typography: { alignment: "center" } });
		expect(overrides["t-diamond"]).toEqual({ shape: { kind: "rhombus", fallback: "text" }, borderStyle: "dotted", typography: { alignment: "right" } });
		expect(overrides["t-parallelogram"]).toEqual({ shape: { kind: "parallelogram", fallback: "text" }, borderStyle: "none" });
		expect(overrides["t-circle"]).toEqual({ shape: { kind: "circle", fallback: "text" } });
		expect(overrides["t-predefined"]).toEqual({ shape: { kind: "flow_chart_predefined_process", fallback: "text" } });
		// A style put back to its default (`textAlign: null`) writes nothing.
		expect(overrides["t-document"]).toEqual({ shape: { kind: "flow_chart_document", fallback: "text" } });
		expect(overrides["t-database"]).toEqual({ shape: { kind: "can", fallback: "text" } });
		// Advanced Canvas draws shapes on text cards only; the others keep theirs for it alone.
		expect(overrides["f-shaped"]).toBeUndefined();
		expect(overrides["t-custom"]).toBeUndefined();
		expect(overrides["t-plain"]).toBeUndefined();
	});

	it("writes line styles as the plugin's overrides, on the ends that have an arrow", () => {
		const overrides = overridesOf(convert(STYLED));
		expect(overrides["e-dotted"]).toEqual({ connector: { strokeStyle: "dotted", endCap: "triangle" } });
		expect(overrides["e-short"]).toEqual({ connector: { strokeStyle: "dashed", startCap: "arrow", endCap: "arrow" } });
		expect(overrides["e-long"]).toEqual({ connector: { strokeStyle: "dashed", startCap: "stealth", endCap: "stealth", route: "elbowed" } });
		expect(overrides["e-diamond"]).toEqual({ connector: { endCap: "filled_diamond", route: "straight" } });
		expect(overrides["e-diamond-outline"]).toEqual({ connector: { endCap: "diamond", route: "elbowed" } });
		expect(overrides["e-circle"]).toEqual({ connector: { endCap: "filled_oval" } });
		expect(overrides["e-circle-outline"]).toEqual({ connector: { startCap: "oval" } });
		expect(overrides["e-blunt"]).toEqual({ connector: { endCap: "none" } });
		// No end with an arrow: the arrowhead is nowhere to be drawn.
		expect(overrides["e-no-ends"]).toBeUndefined();
		expect(overrides["e-custom"]).toBeUndefined();
		expect(overrides["e-slide-1"]).toBeUndefined();
	});

	it("reports the styles it could only come close to", () => {
		const result = convert(STYLED);
		expect(whyOf(entriesFor(result, "e-long"))).toEqual(["approximated:longDash", "approximated:arrowhead", "approximated:pathfinding"]);
		expect(whyOf(entriesFor(result, "e-blunt"))).toEqual(["approximated:arrowhead"]);
	});

	it("lets the board's own override win and adds only what it lacks", () => {
		const result = convert(STYLED);
		const overrides = overridesOf(result);
		expect(overrides["t-existing"]).toEqual({ shape: { kind: "rectangle", fallback: "text" }, typography: { fontSize: 20 }, borderStyle: "dashed" });
		expect(overrides["e-existing"]).toEqual({ connector: { strokeStyle: "solid" } });
		expect(whyOf(entriesFor(result, "t-existing"))).toEqual(["approximated:existingOverride"]);
		expect(whyOf(entriesFor(result, "e-existing"))).toEqual(["approximated:existingOverride"]);
	});

	it("keeps portals, lines into them and collapsed groups, and says how they look", () => {
		const result = convert(STYLED);
		expect(whyOf(entriesFor(result, "portal"))).toEqual(["missing-asset:fileNotFound", "approximated:portal"]);
		expect(entriesFor(result, "portal")[0]!.nodeId).toBe("portal");
		expect(whyOf(entriesFor(result, "ie-1"))).toEqual(["plugin-unsupported:portalEdge"]);
		expect(whyOf(entriesFor(result, "e-into-portal"))).toEqual(["approximated:portalEdge"]);
		expect(whyOf(entriesFor(result, "e-lost"))).toEqual(["invalid-source:invalidElement"]);
		expect(whyOf(entriesFor(result, "g-collapsed"))).toEqual(["approximated:collapsed"]);
	});

	it("lists what it keeps but does not draw once for each kind", () => {
		const result = convert(STYLED);
		const kept = result.report.entries.filter((entry) => entry.reason === "customStyle").map((entry) => entry.sourceId);
		expect(kept.sort()).toEqual([
			"dynamicHeight",
			"ratio",
			"styleAttributes.flow",
			"styleAttributes.glow",
			"styleAttributes.shape: pill",
			"zIndex",
		]);
		expect(result.report.entries.filter((entry) => entry.reason === "customStyle").every((entry) => entry.status === "plugin-unsupported")).toBe(true);
	});

	it("turns the start slide and the lines after it into the board's deck", () => {
		const result = convert(STYLED);
		const decks = metadataOf(result).decks as UnknownRecord[];
		expect(decks).toHaveLength(1);
		expect(decks[0]!.startNode).toBe("start");
		// At slide 2 the line labelled "a" comes before "b"; the way back to the start ends the deck.
		expect(records(decks[0]!.slides).map((slide) => slide.nodeId)).toEqual(["start", "slide2", "slide4"]);
		for (const slide of records(decks[0]!.slides)) expect(typeof slide.id).toBe("string");
		expect(whyOf(entriesFor(result, "slide2"))).toEqual(["approximated:branchingDeck"]);
	});

	it("accounts for every card and line of the source", () => {
		const input = JSON.parse(STYLED) as UnknownRecord;
		const result = convert(STYLED);
		const reported = new Set(result.report.entries.map((entry) => entry.sourceId));
		const onBoard = new Set([...records(result.document.nodes), ...records(result.document.edges)].map((element) => element.id as string));
		const portalLines = records(records(input.nodes).find((node) => node.id === "portal")!.interdimensionalEdges);
		const sourceIds = [...records(input.nodes), ...records(input.edges), ...portalLines].map((element) => element.id as string);
		for (const id of sourceIds) expect(onBoard.has(id) || reported.has(id)).toBe(true);
		// The slide order is not a card: slide 2 itself came over exactly.
		const aboutCards = new Set(result.report.entries.filter((entry) => entry.sourceType !== "slide order").map((entry) => entry.sourceId));
		const convertedCount = [...onBoard].filter((id) => !aboutCards.has(id)).length;
		// Multiple reasons count once; the missing portal file outweighs its approximation.
		expect(result.report.counts).toEqual({ converted: convertedCount, approximated: 7, notImported: 10, skipped: 0 });
		expect(convertedCount).toBe(25);
	});

	it("names the format's own version in the report", () => {
		const result = convert(STYLED);
		expect(result.report.format).toBe("advanced-canvas");
		expect(result.report.formatVersion).toBe("1.0-1.0");
		expect(result.report.sourcePath).toBe("Boards/Styled.canvas");
		expect(result.report.importedAt).toBe(FIXED_NOW);
		expect(result.report.importerVersion).toBe("9.9.9");
	});

	it("builds the same board twice from the same seed", () => {
		expect(JSON.stringify(convert(STYLED, 5))).toBe(JSON.stringify(convert(STYLED, 5)));
	});

	it("reads the fields of files older than format 1.0", () => {
		const legacy = {
			nodes: [
				{ id: "a", type: "group", label: "Slide", x: 0, y: 0, width: 400, height: 225, isStartNode: true, isCollapsed: true },
				{ id: "b", type: "group", label: "Next", x: 500, y: 0, width: 400, height: 225 },
				{ id: "p", type: "file", file: "Other.canvas", x: 0, y: 400, width: 300, height: 200, portalToFile: true },
			],
			edges: [{ id: "ab", fromNode: "a", toNode: "b" }],
		};
		const result = convert(board(legacy));
		const decks = metadataOf(result).decks as UnknownRecord[];
		expect(decks[0]!.startNode).toBe("a");
		expect(records(decks[0]!.slides).map((slide) => slide.nodeId)).toEqual(["a", "b"]);
		expect(whyOf(entriesFor(result, "a"))).toEqual(["approximated:collapsed"]);
		expect(whyOf(entriesFor(result, "p"))).toEqual(["missing-asset:fileNotFound", "approximated:portal"]);
		expect(records(result.document.nodes)).toEqual(legacy.nodes);
		expect(result.report.formatVersion).toBeUndefined();
	});

	it("adds no plugin data to a board it has nothing to write into", () => {
		const onlyPortal = {
			nodes: [{ id: "p", type: "file", file: "Other.canvas", x: 0, y: 0, width: 300, height: 200, portal: true }],
			edges: [],
		};
		const result = convert(board(onlyPortal));
		expect(result.document.miroCanvas).toBeUndefined();
		expect(result.document).toEqual(onlyPortal);
	});

	it("refuses a file that is not a board", () => {
		expect(() => convert("{ not json")).toThrow(ImportError);
		expect(convert(board({ edges: [] })).document).toEqual({ nodes: [], edges: [] });
		expect(() => convert(board({ nodes: [], edges: {} }))).toThrow(ImportError);
		try {
			convert(board({ edges: {} }));
		} catch (error) {
			expect((error as ImportError).reason).toBe("unknownStructure");
		}
	});

	it("leaves out cards it cannot place, and the lines to them", () => {
		const broken = {
			nodes: [
				{ id: "ok", type: "text", text: "", x: 0, y: 0, width: 100, height: 60, styleAttributes: { border: "dotted" } },
				{ id: "no-place", type: "text", text: "" },
				{ id: "ok", type: "text", text: "twice", x: 0, y: 0, width: 100, height: 60 },
			],
			edges: [{ id: "to-broken", fromNode: "ok", toNode: "no-place" }],
		};
		const result = convert(board(broken));
		expect(records(result.document.nodes).map((node) => node.id)).toEqual(["ok"]);
		expect(result.document.edges).toEqual([]);
		expect(whyOf(entriesFor(result, "no-place"))).toEqual(["invalid-source:invalidElement"]);
		expect(whyOf(entriesFor(result, "ok"))).toEqual(["invalid-source:invalidElement"]);
		expect(whyOf(entriesFor(result, "to-broken"))).toEqual(["invalid-source:invalidElement"]);
		expect(() => assertImportedBoard(result.document)).not.toThrow();
	});
});

describe("a board that already has plugin data the plugin complains about", () => {
	it("keeps data from a newer version and still adds the styles", () => {
		const input = JSON.parse(STYLED) as UnknownRecord;
		const own = input.miroCanvas as UnknownRecord;
		own.futureField = { from: "a newer version" };
		(own.localOverrides as Record<string, UnknownRecord>)["t-existing"]!.futureStyle = "kept";
		const before = validateMiroCanvasMetadata(own).diagnostics;
		expect(before.length).toBeGreaterThan(0);
		expect(before.every((diagnostic) => diagnostic.severity === "warning")).toBe(true);

		const result = convert(board(input));
		const metadata = metadataOf(result);
		expect(metadata.futureField).toEqual({ from: "a newer version" });
		expect(overridesOf(result)["t-existing"]).toEqual({
			shape: { kind: "rectangle", fallback: "text" },
			typography: { fontSize: 20 },
			futureStyle: "kept",
			borderStyle: "dashed",
		});
		expect(overridesOf(result)["t-pill"]).toEqual({ shape: { kind: "flow_chart_terminator", fallback: "text" }, borderStyle: "dashed", typography: { alignment: "center" } });
		expect(whyOf(entriesFor(result, "miroCanvas"))).toEqual(["plugin-unsupported:existingOverride"]);
		// Nothing the importer added gives the validator anything new to say.
		expect(validateMiroCanvasMetadata(result.document.miroCanvas).diagnostics).toEqual(before);
	});

	it("keeps data the plugin cannot read exactly as it is and adds nothing to it", () => {
		const input = JSON.parse(STYLED) as UnknownRecord;
		(input.miroCanvas as UnknownRecord).schemaVersion = 2;
		const own = structuredClone(input.miroCanvas);

		const result = convert(board(input));
		expect(result.document.miroCanvas).toEqual(own);
		expect(whyOf(entriesFor(result, "miroCanvas"))).toEqual(["invalid-source:unreadableData"]);
		// Every style stays Advanced Canvas's alone, and says so.
		expect(whyOf(entriesFor(result, "t-pill"))).toEqual([
			"plugin-unsupported:customStyle",
			"plugin-unsupported:customStyle",
			"plugin-unsupported:customStyle",
		]);
		expect(whyOf(entriesFor(result, "start"))).toEqual(["plugin-unsupported:customStyle"]);
		expect(records(result.document.nodes)).toEqual(input.nodes);
	});

	it("keeps plugin data that is not even an object", () => {
		const input = JSON.parse(STYLED) as UnknownRecord;
		input.miroCanvas = "not plugin data";
		const result = convert(board(input));
		expect(result.document.miroCanvas).toBe("not plugin data");
		expect(whyOf(entriesFor(result, "miroCanvas"))).toEqual(["invalid-source:unreadableData"]);
	});
});

describe("the report card on a board whose plugin data came with it", () => {
	function reportCardOf(result: ImportResult): UnknownRecord {
		const nodes = records(result.document.nodes);
		const card = nodes[nodes.length - 1]!;
		expect(card.id).toBe(result.report.reportNodeId);
		return card;
	}

	it("goes on a board whose plugin data a newer version wrote, bound, with nothing new for the validator", () => {
		const input = JSON.parse(STYLED) as UnknownRecord;
		(input.miroCanvas as UnknownRecord).futureField = { from: "a newer version" };
		const result = convert(board(input));
		const before = validateMiroCanvasMetadata(result.document.miroCanvas).diagnostics;
		expect(before.length).toBeGreaterThan(0);

		const withCard = addReportCard(result, idFactory(99));
		const card = reportCardOf(withCard);
		const metadata = metadataOf(withCard);
		expect(metadata.futureField).toEqual({ from: "a newer version" });
		expect((metadata.bindings as UnknownRecord)[card.id as string]).toEqual({ sourceId: "import:Boards/Styled.canvas", role: "import-report" });
		expect(validateMiroCanvasMetadata(withCard.document.miroCanvas).diagnostics).toEqual(before);
	});

	it("goes on a board whose plugin data the plugin cannot read, which is kept exactly as it was", () => {
		const input = JSON.parse(STYLED) as UnknownRecord;
		(input.miroCanvas as UnknownRecord).schemaVersion = 2;
		const own = structuredClone(input.miroCanvas);
		const result = convert(board(input));

		const withCard = addReportCard(result, idFactory(99));
		reportCardOf(withCard);
		expect(withCard.document.miroCanvas).toEqual(own);
	});

	it("goes on a board whose plugin data is not an object, which is kept, not replaced", () => {
		const input = JSON.parse(STYLED) as UnknownRecord;
		input.miroCanvas = "not plugin data";
		const result = convert(board(input));

		const withCard = addReportCard(result, idFactory(99));
		const card = reportCardOf(withCard);
		expect(withCard.document.miroCanvas).toBe("not plugin data");
		expect(card.text).toContain("[[Boards/Styled.canvas]]");
		expect(records(withCard.document.nodes)).toHaveLength(records(result.document.nodes).length + 1);
	});
});


// Author-generated synthetic collapse and validation boards.
describe("Advanced Canvas collapse through the native snapshot planner", () => {
	function collapsedBoard() {
		return {
			nodes: [
				{ id: "g", type: "group", x: -100, y: -100, width: 900, height: 700, label: "Outer", collapsed: true, future: { keep: true } },
				{ id: "nested", type: "group", x: 0, y: 0, width: 500, height: 400, collapsed: true },
				{ id: "inside", type: "text", text: "Child", x: 100, y: 100, width: 100, height: 80 },
				{ id: "boundary", type: "text", text: "Boundary", x: 700, y: 500, width: 100, height: 100 },
				{ id: "partial", type: "text", text: "Partial", x: 750, y: 500, width: 100, height: 100 },
				{ id: "outside", type: "text", text: "Outside", x: 1000, y: 0, width: 100, height: 80 },
			],
			edges: [
				{ id: "internal", fromNode: "inside", toNode: "boundary" },
				{ id: "external", fromNode: "inside", toNode: "outside", fromSide: "right", toSide: "left" },
			],
			miroSource: { evidence: [{ content: "untouched" }] },
			miroCanvas: { schemaVersion: 1, localOverrides: { g: { future: { keep: true } } }, future: { keep: true } },
		};
	}

	it("uses existing collapse metadata, retains every raw position and projects nested children and lines", () => {
		const original = collapsedBoard();
		const result = convert(board(original));
		expect(result.document.nodes).toEqual(original.nodes);
		expect(result.document.edges).toEqual(original.edges);
		expect(result.document.miroSource).toEqual(original.miroSource);
		expect(groupCollapse(result.document, "g")).toEqual({ width: 900, height: 700, children: ["nested", "inside", "boundary"] });
		expect(groupCollapse(result.document, "nested")).toEqual({ width: 500, height: 400, children: ["inside"] });
		expect(overridesOf(result).g!.future).toEqual({ keep: true });
		expect(metadataOf(result).future).toEqual({ keep: true });
		const before = validateMiroCanvasMetadata(original.miroCanvas).diagnostics;
		expect(validateMiroCanvasMetadata(result.document.miroCanvas).diagnostics).toEqual(before);
		const owners = collapsedGroupOwners(result.document);
		expect(owners.get("inside")).toBe("g");
		expect(owners.get("internal")).toBe("g");
		expect(owners.has("external")).toBe(false);
		expect(owners.has("partial")).toBe(false);
		const projection = projectCollapsedGroups(result.document, owners);
		expect(records(projection.nodes)[0]).toMatchObject({ x: -100, y: -100, width: 280, height: 64 });
		const geometry = buildCanvasAnchorGeometry(result.document, undefined, undefined, undefined, owners);
		expect(geometry.edges?.external?.start).toEqual({ x: 180, y: -68 });
		expect(records(result.document.nodes).every((node) => !("projectedCollapsed" in node))).toBe(true);
		const expanded = toggleGroupCollapse(result.document, "g")!;
		expect(expanded.nodes).toEqual(original.nodes);
		expect(expanded.edges).toEqual(original.edges);
		expect(expanded.miroSource).toEqual(original.miroSource);
		expect(groupCollapse(expanded, "g")).toBeUndefined();
		expect(groupCollapse(expanded, "nested")).toBeDefined();
	});

	it("preserves an existing snapshot including unknown fields and reports the override", () => {
		const original = collapsedBoard();
		const snapshot = { width: 700, height: 500, children: ["inside"], futureSnapshot: { keep: true } };
		const document = {
			...original,
			miroCanvas: { ...original.miroCanvas, localOverrides: { g: { ...original.miroCanvas.localOverrides.g, groupCollapse: snapshot } } },
		};
		const result = convert(board(document));
		expect(groupCollapse(result.document, "g")).toEqual(snapshot);
		expect(whyOf(entriesFor(result, "g"))).toEqual(["approximated:existingOverride"]);
		expect(result.document.nodes).toEqual(document.nodes);
	});

	it.each([null, "unreadable", { schemaVersion: 2 }, { schemaVersion: 1, localOverrides: { g: { groupCollapse: null } } }])("leaves unreadable metadata intact and reports unsupported collapse: %j", (miroCanvas) => {
		const document = { ...collapsedBoard(), miroCanvas };
		const result = convert(board(document));
		expect(result.document.miroCanvas).toEqual(miroCanvas);
		expect(result.document.nodes).toEqual(document.nodes);
		expect(whyOf(entriesFor(result, "g"))).toContain("plugin-unsupported:collapsed");
	});

	it("handles prototype-named IDs without mutating object prototypes or unrelated overrides", () => {
		const document = {
			nodes: [
				{ id: "__proto__", type: "group", x: 0, y: 0, width: 500, height: 400, collapsed: true },
				{ id: "constructor", type: "text", text: "", x: 10, y: 10, width: 100, height: 80, styleAttributes: { shape: "pill" } },
			],
			edges: [],
		};
		const result = convert(board(document));
		expect(groupCollapse(result.document, "__proto__")).toEqual({ width: 500, height: 400, children: ["constructor"] });
		expect(Object.getOwnPropertyDescriptor(overridesOf(result), "__proto__")?.value).toHaveProperty("groupCollapse");
		expect(Object.getOwnPropertyDescriptor(overridesOf(result), "constructor")?.value).toEqual({ shape: { kind: "flow_chart_terminator", fallback: "text" } });
		expect(Object.prototype).not.toHaveProperty("groupCollapse");
		expect(Object.prototype).not.toHaveProperty("shape");
	});

	it("bounds nested membership work on large boards and reports unprojected groups", () => {
		const nodes = Array.from({ length: 300 }, (_, index) => ({
			id: `g${index}`, type: "group", x: index * 1000, y: 0, width: 200, height: 100, collapsed: true,
		}));
		const result = convert(board({ nodes, edges: [] }));
		expect(result.document.nodes).toEqual(nodes);
		expect(result.report.entries.some((entry) => entry.reason === "collapsed" && entry.status === "plugin-unsupported")).toBe(true);
		expect(result.report.entries.some((entry) => entry.reason === "collapsed" && entry.status === "approximated")).toBe(true);
		expect(validateMiroCanvasMetadata(result.document.miroCanvas).diagnostics).toEqual([]);
	});
});

describe("Advanced Canvas shared native validation and asset reports", () => {
	it("accepts omitted arrays and still reports a missing presentation start", () => {
		const result = convert(board({ metadata: { version: "1.0-1.0", startNode: "gone" } }));
		expect(result.document.nodes).toEqual([]);
		expect(result.document.edges).toEqual([]);
		expect(whyOf(entriesFor(result, "gone"))).toEqual(["invalid-source:invalidElement"]);
		expect(advancedCanvasAdapter.detect(canvasSource(board({ metadata: { startNode: "gone" } })))).toBe(true);
	});

	it("applies the same positive integer geometry, required card fields and optional line validation", () => {
		const nodes = [
			{ id: "valid", type: "text", text: "", x: -10, y: -10, width: 100, height: 60, color: "7", styleAttributes: { border: "dashed" } },
			{ id: "zero", type: "text", text: "", x: 0, y: 0, width: 0, height: 60 },
			{ id: "fraction", type: "text", text: "", x: 0.5, y: 0, width: 100, height: 60 },
			{ id: "no-file", type: "file", x: 0, y: 0, width: 100, height: 60 },
		];
		const result = convert(board({
			nodes,
			edges: [
				{ id: "valid-line", fromNode: "valid", toNode: "valid" },
				{ id: "invalid-end", fromNode: "valid", toNode: "valid", toEnd: "diamond" },
				{ id: "lost-card", fromNode: "valid", toNode: "zero" },
			],
		}));
		expect(result.document.nodes).toEqual([nodes[0]]);
		expect(records(result.document.edges).map((edge) => edge.id)).toEqual(["valid-line"]);
		expect(result.report.counts.notImported).toBe(5);
	});

	it("keeps missing group backgrounds and file cards with stable reasons", () => {
		const nodes = [
			{ id: "image", type: "file", file: "missing.png", subpath: "#page=1", x: 0, y: 0, width: 100, height: 60 },
			{ id: "g", type: "group", background: "missing.png", backgroundStyle: "cover", x: 0, y: 0, width: 300, height: 200 },
		];
		const result = convert(board({ nodes }));
		expect(result.document.nodes).toEqual(nodes);
		expect(whyOf(entriesFor(result, "image"))).toEqual(["missing-asset:fileNotFound"]);
		expect(whyOf(entriesFor(result, "g"))).toEqual(["missing-asset:imageNotFound"]);
		expect(result.document.miroCanvas).toBeUndefined();
	});

	it("bounds stored portal edges as well as native elements", () => {
		const document = {
			nodes: [{ id: "p", type: "file", file: "Other.canvas", x: 0, y: 0, width: 100, height: 60, portal: true, interdimensionalEdges: Array.from({ length: MAX_IMPORT_ELEMENTS }, () => null) }],
		};
		try {
			convert(board(document));
			throw new Error("Expected oversized portal data to fail");
		} catch (error) {
			expect(error).toBeInstanceOf(ImportError);
			expect((error as ImportError).reason).toBe("tooLarge");
		}
	});
});


describe("bounded Advanced Canvas extension handling", () => {
	it("reports malformed style objects without invoking source-defined coercion fields", () => {
		const node = { id: "n", type: "text", text: "", x: 0, y: 0, width: 100, height: 60, styleAttributes: { shape: { toString: false }, border: { toString: null }, textAlign: [] } };
		const edge = { id: "e", fromNode: "n", toNode: "n", styleAttributes: { path: { toString: false }, arrow: { valueOf: null, toString: null }, pathfindingMethod: [] } };
		const result = convert(board({ nodes: [node], edges: [edge] }));
		expect(result.document.nodes).toEqual([node]);
		expect(result.document.edges).toEqual([edge]);
		expect(result.report.entries.every((entry) => entry.status === "plugin-unsupported" && entry.reason === "customStyle")).toBe(true);
		expect(result.report.entries).toHaveLength(6);
	});

	it("bounds repeated snapshot copies of large unknown metadata without discarding it", () => {
		const document = {
			nodes: [{ id: "g", type: "group", x: 0, y: 0, width: 100, height: 60, collapsed: true }],
			unknown: "x".repeat(MAX_IMPORT_ELEMENTS * 128),
		};
		const result = convert(board(document));
		expect(result.document.unknown).toBe(document.unknown);
		expect(result.document.nodes).toEqual(document.nodes);
		expect(result.document.miroCanvas).toBeUndefined();
		expect(whyOf(entriesFor(result, "g"))).toEqual(["plugin-unsupported:collapsed"]);
	});
});
