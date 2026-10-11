import { describe, expect, it } from "vitest";
import { joinSourcePath, type SourcePathSegment } from "../src/source-path-chain";

const from = { x: 0, y: 0, width: 100, height: 40 };
const to = { x: 300, y: 80, width: 80, height: 30 };
function line(x1: number, y1: number, x2: number, y2: number, color = "#123456"): SourcePathSegment {
	return { points: [{ x: x1, y: y1 }, { x: x2, y: y2 }], color, width: 2, straight: true };
}
describe("source branch pieces", () => {
	it("accepts a bounded source underline margin without joining distant labels", () => {
		const segments = [line(100, 20, 150, 20), line(150, 20, 150, 112), line(150, 112, 300, 112)];
		expect(joinSourcePath(segments, from, to)).toBeUndefined();
		expect(joinSourcePath(segments, from, to, 3)?.points.at(-1)).toEqual({ x: 300, y: 112 });
		expect(joinSourcePath(segments, from, { ...to, y: 70 }, 3)).toBeUndefined();
		expect(joinSourcePath(segments, from, to, 100)).toBeUndefined();
	});

	it("joins reversed lines at the middle of a shared trunk", () => {
		const result = joinSourcePath([line(100, 20, 150, 20), line(150, 120, 150, 0), line(150, 95, 300, 95)], from, to);
		expect(result?.points).toEqual([{ x: 100, y: 20 }, { x: 150, y: 20 }, { x: 150, y: 95 }, { x: 300, y: 95 }]);
	});
	it("does not bridge missing pieces or differently colored branches", () => {
		expect(joinSourcePath([line(100, 20, 150, 20), line(150, 95, 300, 95)], from, to)).toBeUndefined();
		expect(joinSourcePath([line(100, 20, 150, 20), line(150, 20, 150, 95, "#654321"), line(150, 95, 300, 95)], from, to)).toBeUndefined();
	});
	it("keeps the sampled curved corner and the original segment inputs", () => {
		const curve: SourcePathSegment = { points: [{ x: 150, y: 85 }, { x: 152, y: 92 }, { x: 160, y: 95 }], color: "#123456", width: 2, straight: false };
		const segments = [line(100, 20, 150, 20), line(150, 20, 150, 85), curve, line(160, 95, 300, 95)];
		const original = JSON.stringify(segments);
		expect(joinSourcePath(segments, from, to)?.points).toContainEqual({ x: 152, y: 92 });
		expect(JSON.stringify(segments)).toBe(original);
	});
});
