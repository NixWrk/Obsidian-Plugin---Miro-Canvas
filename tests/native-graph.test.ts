import { describe, expect, it } from "vitest";
import { graphDrift, nativeOmits } from "../src/native-graph";

describe("native nameless group normalization", () => {
	it("accepts the omitted empty label only on a group", () => {
		expect(nativeOmits("nodes", "label", "", "group")).toBe(true);
		expect(nativeOmits("nodes", "label", "Named frame", "group")).toBe(false);
		expect(nativeOmits("nodes", "label", "", "text")).toBe(false);
		expect(nativeOmits("nodes", "label", "")).toBe(false);
	});

	it("allows group normalization without accepting loss of names or unknown fields", () => {
		const group = { id: "group", type: "group", x: 0, y: 0, width: 100, height: 100, label: "" };
		const { label: _label, ...stored } = group;
		expect(graphDrift({ nodes: [stored], edges: [] }, { nodes: [group], edges: [] })).toBeUndefined();
		expect(graphDrift({ nodes: [stored], edges: [] }, { nodes: [{ ...group, label: "Title" }], edges: [] })).toBe("nodes group lost label");
		expect(graphDrift({ nodes: [stored], edges: [] }, { nodes: [{ ...group, future: { evidence: true } }], edges: [] })).toBe("nodes group lost future");
	});
});
