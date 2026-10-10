import { describe, expect, it } from "vitest";
import { planConnectedBoardLineIds, planFlipBoardEdges, type FlipBoardEdgesOptions } from "../src/board-edge-actions";
import { buildCanvasAnchorGeometry } from "../src/connector-endpoints";
import { pointOnPolyline } from "../src/anchors";
import { buildSourceScene } from "../src/source-model";
import type { BoardConnector } from "../src/board-connectors";

type JsonRecord = Record<string, any>;
const edgeAnchor = (edgeId: string, t: number) => ({ type: "edge" as const, edgeId, t, futureAnchor: { preserved: true } });
function line(id: string, from: BoardConnector["from"] = { type: "free", x: 20, y: 150 }, to: BoardConnector["to"] = { type: "free", x: 250, y: 220 }): BoardConnector {
	return { id, from, to, route: "straight", width: 2, color: "#123456", startCap: "diamond", endCap: "arrow", label: "Label", labelT: 0.25, waypoints: [{ x: 70, y: 200, extension: "waypoint" } as any], futureConnector: { keep: [1, 2] } };
}
function fixture(): JsonRecord {
	return {
		nodes: [
			{ id: "a", type: "text", x: 10, y: 30, width: 80, height: 120, text: "A" },
			{ id: "b", type: "text", x: 300, y: 230, width: 100, height: 60, text: "B" },
			{ id: "c", type: "text", x: 600, y: 150, width: 90, height: 70, text: "C" },
		],
		edges: [
			{ id: "e", fromNode: "a", fromSide: "right", fromEnd: "none", toNode: "b", toSide: "top", toEnd: "arrow", label: "Native", futureEdge: { keep: true } },
			{ id: "n", fromNode: "b", fromSide: "right", toNode: "c", toSide: "left" },
		],
		miroSource: { futureSource: { keep: true } },
		futureRoot: { keep: true },
		miroCanvas: {
			schemaVersion: 1,
			futureMetadata: { keep: true },
			connectors: { p: line("p") },
			localOverrides: {
				e: {
					futureOverride: { keep: true },
					connectorAnchors: { from: { type: "node", nodeId: "a", u: 1, v: 0.25, endpointField: "start" }, to: { type: "node", nodeId: "b", u: 0.7, v: 0, endpointField: "end" }, extension: { keep: true } },
					connector: { route: "curved", startCap: "diamond", endCap: "filled_triangle", labelT: 0.25, waypoints: [{ x: 125, y: 20, waypointExtension: "one" }, { x: 210, y: 160, waypointExtension: "two" }], styleExtension: { keep: true } },
				},
			},
		},
	};
}
function flip(document: JsonRecord, ids: string[], options?: FlipBoardEdgesOptions): JsonRecord {
	const result = planFlipBoardEdges(document, ids, options);
	expect(result, JSON.stringify(result.diagnostics)).toMatchObject({ ok: true });
	if (!result.ok) throw new Error(result.reason);
	return result.document;
}
function points(document: JsonRecord, id: string) {
	return buildCanvasAnchorGeometry(document).edges?.[id]?.points ?? [];
}
function expectSamePoint(left: any, right: any) {
	expect(left).toBeDefined();
	expect(right).toBeDefined();
	expect(left.x).toBeCloseTo(right.x, 5);
	expect(left.y).toBeCloseTo(right.y, 5);
}

describe("pure Flip Edge plans", () => {
	it("swaps asymmetric native sides/ends and plugin caps without mutating input or evidence", () => {
		const document = fixture();
		Object.defineProperty(document.futureRoot, "__proto__", { value: { untouched: true }, enumerable: true });
		const before = JSON.stringify(document);
		const next = flip(document, ["e"]);
		expect(JSON.stringify(document)).toBe(before);
		expect(next.edges[0]).toEqual({ ...document.edges[0], fromNode: "b", fromSide: "top", fromEnd: "arrow", toNode: "a", toSide: "right", toEnd: "none" });
		const override = next.miroCanvas.localOverrides.e;
		expect(override.connectorAnchors).toEqual({ ...document.miroCanvas.localOverrides.e.connectorAnchors, from: document.miroCanvas.localOverrides.e.connectorAnchors.to, to: document.miroCanvas.localOverrides.e.connectorAnchors.from });
		expect(override.connector).toEqual({ ...document.miroCanvas.localOverrides.e.connector, startCap: "filled_triangle", endCap: "diamond", labelT: 0.75, waypoints: [...document.miroCanvas.localOverrides.e.connector.waypoints].reverse() });
		expect(next.miroSource).toEqual(document.miroSource);
		expect(next.miroSource).not.toBe(document.miroSource);
		expect(next.futureRoot).toEqual(document.futureRoot);
		expect(Object.getPrototypeOf(next.futureRoot)).toBe(Object.prototype);
		expect(flip(next, ["e"])).toEqual(document);
	});
	it("reverses independent endpoints with extensions, caps, waypoints and the label's absolute place", () => {
		const document = fixture();
		const original = document.miroCanvas.connectors.p;
		original.from.extension = "from";
		original.to.extension = "to";
		const next = flip(document, ["p", "p"]);
		expect(next.miroCanvas.connectors.p).toEqual({ ...original, from: original.to, to: original.from, startCap: original.endCap, endCap: original.startCap, labelT: 0.75, waypoints: [...original.waypoints].reverse() });
		expectSamePoint(pointOnPolyline(points(document, "p"), original.labelT), pointOnPolyline(points(next, "p"), 0.75));
		expect(flip(next, ["p"])).toEqual(document);
	});
	it("materializes native asymmetric omitted end defaults, and reverses them twice semantically", () => {
		const document = fixture();
		const next = flip(document, ["n"]);
		expect(next.edges[1]).toMatchObject({ fromEnd: "arrow", toEnd: "none" });
		const twice = flip(next, ["n"]);
		expect(twice.edges[1]).toMatchObject({ fromNode: "b", toNode: "c", fromEnd: "none", toEnd: "arrow" });
		expect(twice.miroCanvas).toEqual(document.miroCanvas);
	});
	it("reverses independent connector overrides while preserving their extensions", () => {
		const document = fixture();
		document.miroCanvas.localOverrides.p = { connector: { startCap: "stealth", endCap: "diamond", labelT: 0.125, waypoints: [{ x: 1, y: 2, future: "kept" }], future: true } };
		const next = flip(document, ["p"]);
		expect(next.miroCanvas.localOverrides.p.connector).toMatchObject({ startCap: "diamond", endCap: "stealth", labelT: 0.875, future: true });
		expect(flip(next, ["p"])).toEqual(document);
	});
	it("reverses imported effective caps in local overrides without editing source or bindings", () => {
		const document = fixture();
		delete document.miroCanvas.localOverrides.e.connector;
		document.miroSource.connectors = [{ id: "source-edge", shape: "curved", style: { startStrokeCap: "diamond", endStrokeCap: "stealth" }, sourceEvidence: { preserved: true } }];
		document.miroCanvas.bindings = { e: { sourceId: "source-edge", role: "connector", futureBinding: true } };
		const next = flip(document, ["e"]);
		expect(buildSourceScene(next).items.get("e")?.connector).toMatchObject({ startCap: "stealth", endCap: "diamond" });
		expect(next.miroCanvas.localOverrides.e.connector).toMatchObject({ startCap: "stealth", endCap: "diamond" });
		expect(next.miroSource).toEqual(document.miroSource);
		expect(next.miroCanvas.bindings).toEqual(document.miroCanvas.bindings);
		const twice = flip(next, ["e"]);
		expect(buildSourceScene(twice).items.get("e")?.connector).toEqual(buildSourceScene(document).items.get("e")?.connector);
	});
	it("handles partial endpoint and cap overrides against effective fallback styling", () => {
		const document = fixture();
		const override = document.miroCanvas.localOverrides.e;
		delete override.connectorAnchors.to;
		delete override.connector.endCap;
		const next = flip(document, ["e"]);
		expect(next.miroCanvas.localOverrides.e.connectorAnchors.from).toBeUndefined();
		expect(next.miroCanvas.localOverrides.e.connectorAnchors.to).toEqual(override.connectorAnchors.from);
		expect(next.miroCanvas.localOverrides.e.connector).toMatchObject({ startCap: "filled_triangle", endCap: "diamond" });
	});
	it("reverses the implicit head in native legacy block overrides", () => {
		const document = fixture();
		document.miroCanvas.localOverrides.e.connector = { block: true, route: "straight", startCap: "none", endCap: "none" };
		const next = flip(document, ["e"]);
		expect(next.miroCanvas.localOverrides.e.connector).toMatchObject({ block: true, startCap: "stealth", endCap: "none" });
		expect(flip(next, ["e"]).miroCanvas.localOverrides.e.connector).toMatchObject({ block: true, startCap: "none", endCap: "stealth" });
	});
	it("pins a non-midpoint configured default label share and reverses a legacy block's implicit head", () => {
		const document = fixture();
		const connector = document.miroCanvas.connectors.p;
		delete connector.labelT;
		connector.startCap = "none";
		connector.endCap = "none";
		connector.block = true;
		const next = flip(document, ["p", "n"], { defaultLabelT: 0.25 });
		expect(next.miroCanvas.connectors.p).toMatchObject({ startCap: "stealth", endCap: "none", block: true, labelT: 0.75 });
		expect(next.miroCanvas.localOverrides.n.connector.labelT).toBe(0.75);
		const twice = flip(next, ["p"], { defaultLabelT: 0.25 });
		expect(twice.miroCanvas.connectors.p).toMatchObject({ startCap: "none", endCap: "stealth", labelT: 0.25 });
	});
	it("adjusts both ends of dependents, mixed chains, comment places and free anchors atomically", () => {
		const document = fixture();
		const meta = document.miroCanvas;
		meta.connectors.d = line("d", edgeAnchor("e", 0.25), edgeAnchor("p", 0.75));
		meta.connectors.chain = line("chain", edgeAnchor("d", 0.125));
		meta.localOverrides.n = { connectorAnchors: { from: edgeAnchor("e", 0.75) } };
		meta.localComments = [{ id: "local", text: "Local", anchor: edgeAnchor("e", 0.25), replies: [], origin: "local" }];
		meta.commentPlaces = { "local:local": edgeAnchor("e", 0.25), "imported:placed": edgeAnchor("p", 0.25) };
		meta.freeAnchors = { free: edgeAnchor("p", 0.75), legacy: { x: 1, y: 2, future: "kept" } };
		document.miroSource.comments = [{ id: "placed", anchor: edgeAnchor("e", 0.75), text: "Source", messages: [] }];
		const before = JSON.stringify(document);
		const result = planFlipBoardEdges(document, ["e", "p"]);
		expect(result).toMatchObject({ ok: true, flippedLineIds: ["e", "p"], changedLineIds: ["e", "p", "d", "n"], changedCommentKeys: ["local:local", "imported:placed"], changedFreeAnchorIds: ["free"] });
		if (!result.ok) throw new Error(result.reason);
		const next = result.document as JsonRecord;
		expect(JSON.stringify(document)).toBe(before);
		expect(next.miroCanvas.connectors.d.from).toEqual(edgeAnchor("e", 0.75));
		expect(next.miroCanvas.connectors.d.to).toEqual(edgeAnchor("p", 0.25));
		expect(next.miroCanvas.connectors.chain).toEqual(meta.connectors.chain);
		expect(next.miroCanvas.localOverrides.n.connectorAnchors.from).toEqual(edgeAnchor("e", 0.25));
		expect(next.miroCanvas.localComments).toEqual(meta.localComments);
		expect(next.miroSource).toEqual(document.miroSource);
		const oldGeometry = buildCanvasAnchorGeometry(document);
		const newGeometry = buildCanvasAnchorGeometry(next);
		for (const id of ["d", "n", "chain"]) {
			expectSamePoint(oldGeometry.edges?.[id]?.start, newGeometry.edges?.[id]?.start);
			expectSamePoint(oldGeometry.edges?.[id]?.end, newGeometry.edges?.[id]?.end);
		}
		for (const key of ["local:local", "imported:placed"]) expectSamePoint(oldGeometry.comments?.[key], newGeometry.comments?.[key]);
		const twice = flip(next, ["e", "p"]);
		// Native omitted caps are explicitly materialized on the flipped edge only.
		expect(twice).toEqual(document);
	});
	it("uses presentation overrides for original local/imported pins, even hidden imported threads", () => {
		const document = fixture();
		document.miroCanvas.localComments = [{ id: "local", anchor: edgeAnchor("e", 0.25), text: "Local", replies: [] }];
		document.miroSource.comments = [{ id: "imported", anchor: edgeAnchor("e", 0.75), text: "Evidence", messages: [] }, { id: "hidden", anchor: edgeAnchor("e", 0.25), messages: [] }];
		document.miroCanvas.hiddenImportedComments = ["hidden"];
		const next = flip(document, ["e"]);
		expect(next.miroCanvas.commentPlaces).toEqual({ "local:local": edgeAnchor("e", 0.75), "imported:imported": edgeAnchor("e", 0.25), "imported:hidden": edgeAnchor("e", 0.75) });
		expect(next.miroCanvas.localComments).toEqual(document.miroCanvas.localComments);
		expect(next.miroSource).toEqual(document.miroSource);
		const twice = flip(next, ["e"]);
		expect(twice.miroCanvas.commentPlaces["local:local"]).toEqual(edgeAnchor("e", 0.25));
	});
	it.each(["straight", "curved", "elbowed"])("preserves attachment positions for %s routes", (route) => {
		const document = fixture();
		document.miroCanvas.localOverrides.e.connector.route = route;
		document.miroCanvas.connectors.d = line("d", edgeAnchor("e", 0.25));
		const next = flip(document, ["e"]);
		expectSamePoint(buildCanvasAnchorGeometry(document).edges?.d?.start, buildCanvasAnchorGeometry(next).edges?.d?.start);
	});
	it("keeps automatic paths and dependent comments attached for every native side pair", () => {
		for (const route of ["straight", "curved", "elbowed"]) {
			for (const fromSide of ["top", "right", "bottom", "left"]) {
				for (const toSide of ["top", "right", "bottom", "left"]) {
					const document = fixture();
					delete document.miroCanvas.localOverrides.e.connectorAnchors;
					delete document.miroCanvas.localOverrides.e.connector.waypoints;
					document.miroCanvas.localOverrides.e.connector.route = route;
					document.edges[0].fromSide = fromSide;
					document.edges[0].toSide = toSide;
					document.miroCanvas.connectors.d = line("d", edgeAnchor("e", 0.25));
					const next = flip(document, ["e"]);
					expectSamePoint(pointOnPolyline(points(document, "e"), 0.25), pointOnPolyline(points(next, "e"), 0.75));
				}
			}
		}
	});
	it("complements anchors within a selected batch only once", () => {
		const document = fixture();
		document.miroCanvas.connectors.d = line("d", edgeAnchor("p", 0.25), { type: "free", x: 600, y: 300 });
		const next = flip(document, ["p", "d"]);
		expect(next.miroCanvas.connectors.d.to).toEqual(edgeAnchor("p", 0.75));
		expect(flip(next, ["p", "d"])).toEqual(document);
	});
	it("roundtrips ordinary decimal shares without subtraction noise", () => {
		for (const t of [0, 0.001, 0.1, 0.2, 0.3, 0.1234567890123456, 0.999, 1]) {
			const document = fixture();
			document.miroCanvas.connectors.p.labelT = t;
			document.miroCanvas.connectors.d = line("d", edgeAnchor("p", t));
			document.miroCanvas.freeAnchors = { anchor: edgeAnchor("p", t) };
			expect(flip(flip(document, ["p"]), ["p"])).toEqual(document);
		}
	});
	it("refuses a locked original imported pin even when an existing place overrides its evidence", () => {
		const document = fixture();
		document.miroSource.comments = [{ id: "pin", locked: true, messages: [], anchor: edgeAnchor("e", 0.25) }];
		document.miroCanvas.commentPlaces = { "imported:pin": edgeAnchor("p", 0.75) };
		expect(planFlipBoardEdges(document, ["p"])).toMatchObject({ ok: false, reason: "locked" });
	});
	it.each(["selected", "dependent", "endpoint", "comment", "free-anchor", "host", "review"])("refuses a whole batch when %s is locked or disallowed", (kind) => {
		const document = fixture();
		document.miroCanvas.connectors.d = line("d", edgeAnchor("e", 0.25));
		if (kind === "selected") document.miroCanvas.localOverrides.e.locked = true;
		if (kind === "dependent") document.miroCanvas.localOverrides.d = { locked: true };
		if (kind === "endpoint") document.miroCanvas.localOverrides.a = { locked: true };
		if (kind === "comment") {
			document.miroCanvas.localComments = [{ id: "pin", text: "Locked", anchor: edgeAnchor("e", 0.25) }];
			document.miroCanvas.commentDecorations = { "local:pin": { locked: true } };
		}
		if (kind === "free-anchor") {
			document.miroCanvas.freeAnchors = { anchor: edgeAnchor("e", 0.25) };
			document.miroCanvas.lockedIds = ["anchor"];
		}
		if (kind === "review") document.miroCanvas.settings = { reviewMode: true };
		const before = JSON.stringify(document);
		const result = planFlipBoardEdges(document, ["p", "e"], kind === "host" ? { editAllowed: () => false } : {});
		expect(result).toMatchObject({ ok: false, reason: kind === "review" ? "review-mode" : "locked" });
		expect(result).not.toHaveProperty("document");
		expect(JSON.stringify(document)).toBe(before);
	});
	it.each(["bad-cap", "bad-label", "bad-waypoint", "bad-anchor", "bad-color", "bad-version", "collision", "missing-target", "cycle"])("refuses invalid known shape: %s", (kind) => {
		const document = fixture();
		if (kind === "bad-cap") document.miroCanvas.localOverrides.e.connector.endCap = "not-a-cap";
		if (kind === "bad-label") document.miroCanvas.localOverrides.e.connector.labelT = 2;
		if (kind === "bad-color") document.miroCanvas.localOverrides.e.connector.color = "url(https://invalid.test)";
		if (kind === "bad-waypoint") document.miroCanvas.localOverrides.e.connector.waypoints = [{ x: "1", y: 2 }];
		if (kind === "bad-anchor") {
			document.miroCanvas.localOverrides.e.connectorAnchors.from.t = 2;
			document.miroCanvas.localOverrides.e.connectorAnchors.from.type = "edge";
		}
		if (kind === "bad-version") document.miroCanvas.schemaVersion = 999;
		if (kind === "collision") document.miroCanvas.connectors.e = line("e");
		if (kind === "missing-target") document.miroCanvas.connectors.p.from = edgeAnchor("missing", 0.25);
		if (kind === "cycle") document.miroCanvas.connectors.p.from = edgeAnchor("p", 0.25);
		const before = JSON.stringify(document);
		expect(planFlipBoardEdges(document, ["e", "p"])).toMatchObject({ ok: false });
		expect(JSON.stringify(document)).toBe(before);
	});
	it("rejects unsafe JSON without invoking getters, and missing/empty selection without a document", () => {
		let invoked = false;
		const document = fixture();
		Object.defineProperty(document, "getter", { enumerable: true, get: () => { invoked = true; return 1; } });
		expect(planFlipBoardEdges(document, ["e"])).toMatchObject({ ok: false, reason: "invalid-document" });
		expect(invoked).toBe(false);
		for (const bad of [undefined, NaN, new Date(), Symbol("field"), () => 1]) {
			const candidate = fixture();
			candidate.futureRoot.bad = bad;
			expect(planFlipBoardEdges(candidate, ["e"])).toMatchObject({ ok: false });
		}
		const cyclic = fixture();
		cyclic.futureRoot.loop = cyclic;
		expect(planFlipBoardEdges(cyclic, ["e"])).toMatchObject({ ok: false });
		expect(planFlipBoardEdges(fixture(), ["missing"])).toMatchObject({ ok: false, reason: "missing-line" });
		expect(planFlipBoardEdges(fixture(), [])).toMatchObject({ ok: false, reason: "invalid-input" });
	});
});

describe("connected/incoming/outgoing line IDs", () => {
	function graph() {
		const document = fixture();
		document.miroCanvas.connectors.out = line("out", { type: "node", nodeId: "a", u: 1, v: 0.5 });
		document.miroCanvas.connectors.in = line("in", { type: "free", x: 1, y: 2 }, { type: "node", nodeId: "a", u: 0, v: 0.5 });
		document.miroCanvas.connectors.chainOut = line("chainOut", edgeAnchor("e", 0.25));
		document.miroCanvas.connectors.chainIn = line("chainIn", { type: "free", x: 2, y: 3 }, edgeAnchor("e", 0.75));
		document.miroCanvas.connectors.deep = line("deep", edgeAnchor("chainOut", 0.25));
		return document;
	}
	it("filters incidence regardless of caps, excludes selected lines and keeps document order", () => {
		const document = graph();
		const before = JSON.stringify(document);
		expect(planConnectedBoardLineIds(document, ["a"])).toMatchObject({ ok: true, lineIds: ["e", "out", "in"] });
		expect(planConnectedBoardLineIds(document, ["a"], "outgoing")).toMatchObject({ ok: true, lineIds: ["e", "out"] });
		expect(planConnectedBoardLineIds(document, ["a"], "incoming")).toMatchObject({ ok: true, lineIds: ["in"] });
		expect(planConnectedBoardLineIds(document, ["e", "e"])).toMatchObject({ ok: true, lineIds: ["chainOut", "chainIn"] });
		expect(planConnectedBoardLineIds(document, ["e"], "outgoing")).toMatchObject({ ok: true, lineIds: ["chainOut"] });
		expect(planConnectedBoardLineIds(document, ["e"], "incoming")).toMatchObject({ ok: true, lineIds: ["chainIn"] });
		expect(planConnectedBoardLineIds(document, ["a", "e"], "connected", "transitive")).toMatchObject({ ok: true, lineIds: ["out", "in", "chainOut", "chainIn", "deep"] });
		expect(planConnectedBoardLineIds(document, ["a"], "outgoing", "transitive")).toMatchObject({ ok: true, lineIds: ["e", "out", "chainOut", "deep"] });
		expect(JSON.stringify(document)).toBe(before);
	});
	it("uses effective endpoints and ignores native fallback nodes; Flip reverses incidence", () => {
		const document = graph();
		document.miroCanvas.localOverrides.n = { connectorAnchors: { from: edgeAnchor("p", 0.25) } };
		expect(planConnectedBoardLineIds(document, ["b"], "outgoing")).toMatchObject({ ok: true, lineIds: [] });
		expect(planConnectedBoardLineIds(document, ["p"], "outgoing")).toMatchObject({ ok: true, lineIds: ["n"] });
		const next = flip(document, ["e"]);
		expect(planConnectedBoardLineIds(next, ["a"], "incoming")).toMatchObject({ ok: true, lineIds: ["e", "in"] });
	});
	it("terminates connector cycles on review/locked boards without resolving geometry", () => {
		const document = fixture();
		document.miroCanvas.connectors.p.from = edgeAnchor("cycle", 0.25);
		document.miroCanvas.connectors.cycle = line("cycle", edgeAnchor("p", 0.75));
		document.miroCanvas.connectors.tail = line("tail", edgeAnchor("cycle", 0.5));
		document.miroCanvas.settings = { reviewMode: true };
		document.miroCanvas.localOverrides.p = { locked: true };
		expect(planConnectedBoardLineIds(document, ["p"], "outgoing", "transitive")).toMatchObject({ ok: true, lineIds: ["cycle", "tail"] });
		expect(planConnectedBoardLineIds(document, [])).toMatchObject({ ok: true, lineIds: [] });
		expect(planConnectedBoardLineIds(document, ["missing"])).toMatchObject({ ok: false });
	});
});
