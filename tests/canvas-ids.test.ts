import { describe, expect, it } from "vitest";

import { newCanvasId } from "../src/canvas-ids";

describe("newCanvasId", () => {
	it("makes sixteen hex digits, as native Canvas does", () => {
		expect(newCanvasId()).toMatch(/^[0-9a-f]{16}$/);
	});

	it("makes a different id each time", () => {
		const ids = new Set(Array.from({ length: 200 }, () => newCanvasId()));
		expect(ids.size).toBe(200);
	});
});
