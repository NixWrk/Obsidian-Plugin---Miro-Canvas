import { describe, expect, it } from "vitest";
import { pressureStrokePath, remapStrokeWidths } from "../src/pressure-stroke";
import { readLocalStroke } from "../src/local-items";

describe("variable width drawings", () => {
  const stroke = { color: "#123456", width: 12, box: { width: 100, height: 100 }, points: [0, 0, 50, 0, 100, 0], widths: [2, 12, 3] };
  it("keeps one width per point and rejects a mismatched or excessive array", () => {
    expect(readLocalStroke(stroke)?.widths).toEqual([2, 12, 3]);
    expect(readLocalStroke({ ...stroke, widths: [2, 12] })).toBeUndefined();
    expect(readLocalStroke({ ...stroke, widths: [2, 13, 3] })).toBeUndefined();
    expect(readLocalStroke({ ...stroke, widths: [2, 0, 3] })).toBeUndefined();
  });
  it("still reads drawings saved before pressure widths existed", () => {
    const { widths, ...old } = stroke;
    expect(readLocalStroke(old)?.width).toBe(12);
  });
  it("interpolates the width at the new ends left by an eraser", () => {
    expect(remapStrokeWidths([0, 0, 100, 0], [2, 10], [25, 0, 75, 0])).toEqual([4, 8]);
  });
  it("does not bridge an erased gap with a filled outline", () => {
    const points = [0, 0, 50, 0, 100, 0];
    expect(pressureStrokePath(points, [2, 12, 3], [2]).match(/L/g)).toHaveLength(3);
    expect(pressureStrokePath(points, [2, 12, 3]).match(/L/g)).toHaveLength(6);
  });
});
