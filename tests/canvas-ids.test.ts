import { afterEach, describe, expect, it, vi } from "vitest";

import { newCanvasId } from "../src/canvas-ids";

describe("newCanvasId", () => {
	afterEach(() => vi.unstubAllGlobals());
	it("makes sixteen hex digits, as native Canvas does", () => {
		expect(newCanvasId()).toMatch(/^[0-9a-f]{16}$/);
	});

	it("makes a different id each time", () => {
		const ids = new Set(Array.from({ length: 200 }, () => newCanvasId()));
		expect(ids.size).toBe(200);
	});

	it("uses the browser crypto receiver and keeps leading zeroes", () => {
		const browserCrypto = { getRandomValues: vi.fn(function (this: unknown, bytes: Uint8Array) {
			expect(this).toBe(browserCrypto);
			bytes.set([0, 1, 2, 15, 16, 128, 254, 255]);
			return bytes;
		}) };
		vi.stubGlobal("window", { crypto: browserCrypto });
		expect(newCanvasId()).toBe("0001020f1080feff");
		expect(browserCrypto.getRandomValues).toHaveBeenCalledOnce();
	});

	it("uses ambient Node Web Crypto without a window or runtime Obsidian", () => {
		expect(typeof window).toBe("undefined");
		const random = vi.spyOn(crypto, "getRandomValues");
		try {
			expect(newCanvasId()).toMatch(/^[0-9a-f]{16}$/);
			expect(random.mock.contexts).toEqual([crypto]);
		} finally { random.mockRestore(); }
	});

	it("fails rather than falling back to insecure random when secure crypto is unavailable", () => {
		vi.stubGlobal("window", { crypto: undefined });
		expect(() => newCanvasId()).toThrow();
	});
});
