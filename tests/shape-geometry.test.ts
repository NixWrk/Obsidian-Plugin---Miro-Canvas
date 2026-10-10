import { describe, expect, it } from "vitest";

import {
  SHAPE_CLIP_PATHS,
  closestContourPoint,
  contourPoint,
  inscribedInsets,
  hasShapeCorners,
  shapeCornerRadius,
  type ShapeBox,
  shapeOutline,
  shapePath,
} from "../src/shape-geometry";
import { LOCAL_SHAPE_KINDS } from "../src/source-model";

describe("shape silhouettes", () => {
  it("draws the manual operation with its wide side up, unlike a trapezoid", () => {
    expect(shapePath("flow_chart_manual_operation")).toBe("M0 0L100 0L88 100L12 100Z");
    expect(shapePath("trapezoid")).toBe("M18 0L82 0L100 100L0 100Z");
    expect(shapeOutline("flow_chart_manual_operation")?.[0]).toEqual({ x: 0, y: 0 });
  });

  it("knows an outline for every kind the renderer draws", () => {
    const missing = LOCAL_SHAPE_KINDS.filter((kind) => shapeOutline(kind) === undefined);
    expect(missing).toEqual([]);
  });

  it("returns nothing for an unknown kind so the caller keeps the rectangle", () => {
    expect(shapeOutline(undefined)).toBeUndefined();
    expect(shapeOutline("future_hexagon")).toBeUndefined();
  });

  it("parses a polygon silhouette exactly", () => {
    expect(shapeOutline("triangle")).toEqual([
      { x: 50, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 },
    ]);
    expect(Object.keys(SHAPE_CLIP_PATHS)).toContain("star");
  });

  it("keeps every outline inside the normalized box", () => {
    for (const kind of LOCAL_SHAPE_KINDS) {
      for (const point of shapeOutline(kind)!) {
        expect(point.x).toBeGreaterThanOrEqual(-0.001);
        expect(point.x).toBeLessThanOrEqual(100.001);
        expect(point.y).toBeGreaterThanOrEqual(-0.001);
        expect(point.y).toBeLessThanOrEqual(100.001);
      }
    }
  });
});

describe("contour points", () => {
	it("keeps arbitrary points on polygon and curved perimeters", () => {
		const star = shapeOutline("star")!;
		const from = star[2]!, to = star[3]!;
		const arbitrary = { x: from.x + (to.x - from.x) * 0.37, y: from.y + (to.y - from.y) * 0.37 };
		expect(closestContourPoint(star, arbitrary)).toEqual(arbitrary);

		const circle = closestContourPoint(shapeOutline("circle"), { x: 91, y: 73 }, { x: 2, y: 1 });
		expect(Math.hypot(circle.x - 50, circle.y - 50)).toBeCloseTo(50, 0);
	});

  it("meets a triangle on its slanted edge, not on the bounding box", () => {
    const outline = shapeOutline("triangle");
    // The middle of the right-hand side of the box is outside the triangle.
    const right = contourPoint(outline, { x: 100, y: 50 });
    expect(right.x).toBeLessThan(100);
    expect(right.x).toBeCloseTo(75, 0);
    expect(right.y).toBeCloseTo(50, 0);
    // Straight down still reaches the base.
    expect(contourPoint(outline, { x: 50, y: 100 })).toMatchObject({ y: 100 });
  });

  it("meets a circle on its arc", () => {
    const point = contourPoint(shapeOutline("circle"), { x: 100, y: 100 });
    const radius = Math.hypot(point.x - 50, point.y - 50);
    expect(radius).toBeCloseTo(50, 0);
  });

  it("leaves a rectangle's own edges alone", () => {
    for (const target of [{ x: 100, y: 50 }, { x: 50, y: 0 }, { x: 0, y: 50 }]) {
      expect(contourPoint(shapeOutline("rectangle"), target)).toMatchObject(target);
    }
  });

  it("returns the target when there is no usable outline or direction", () => {
    expect(contourPoint(undefined, { x: 7, y: 9 })).toEqual({ x: 7, y: 9 });
    expect(contourPoint(shapeOutline("triangle"), { x: 50, y: 50 })).toEqual({ x: 50, y: 50 });
  });
});

describe("inscribed insets", () => {
  it("reserves nothing in a rectangle", () => {
    expect(inscribedInsets(shapeOutline("rectangle"))).toEqual([0, 0, 0, 0]);
  });

  it("derives a triangle's reserve from its own edges", () => {
    const [top, right, bottom, left] = inscribedInsets(shapeOutline("triangle"))!;
    // A triangle narrows upwards, so the reserve is taken from the top.
    expect(top).toBeGreaterThan(20);
    expect(bottom).toBeLessThan(top);
    expect(left).toBeCloseTo(right, 0);
    // The reserved box must actually fit: at its top row the triangle is
    // exactly as wide as the rectangle claims to be.
    const halfWidth = (100 - left - right) / 2;
    expect(halfWidth).toBeLessThanOrEqual(50 * (1 - top / 100) + 0.6);
  });

  it("reserves a symmetric ring in a circle", () => {
    const [top, right, bottom, left] = inscribedInsets(shapeOutline("circle"))!;
    expect(top).toBeCloseTo(bottom, 0);
    expect(left).toBeCloseTo(right, 0);
    expect(top).toBeGreaterThan(5);
    expect(top).toBeLessThan(30);
  });

  it("keeps text out of the gap between a star's legs", () => {
    const [top, right, bottom, left] = inscribedInsets(shapeOutline("star"))!;
    // Below its inner vertex at 72% the star is only its two legs.
    expect(100 - bottom).toBeLessThanOrEqual(72.5);
    expect(top).toBeGreaterThan(0);
    expect(left).toBeCloseTo(right, 0);
    // Every corner of the reserved box lies inside the star.
    const inside = (x: number, y: number): boolean => {
      const outline = shapeOutline("star")!;
      let crossings = 0;
      for (let index = 0; index < outline.length; index += 1) {
        const from = outline[index]!, to = outline[(index + 1) % outline.length]!;
        if ((from.y <= y && to.y > y) || (to.y <= y && from.y > y)) {
          if (x < from.x + ((y - from.y) / (to.y - from.y)) * (to.x - from.x)) crossings += 1;
        }
      }
      return crossings % 2 === 1;
    };
    for (const [x, y] of [[left, top], [100 - right, top], [left, 100 - bottom], [100 - right, 100 - bottom]] as const) {
      expect(inside(x + (x < 50 ? 1 : -1), y + (y < 50 ? 1 : -1))).toBe(true);
    }
  });

  it("returns nothing without a usable outline", () => {
    expect(inscribedInsets(undefined)).toBeUndefined();
    expect(inscribedInsets([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBeUndefined();
  });
});

describe("physical shape corners", () => {
  const cornerShapes = ["rectangle", "round_rectangle", "flow_chart_process"];

  it("limits adjustable corners to the three plain rectangle kinds", () => {
    for (const shape of [...LOCAL_SHAPE_KINDS, undefined, "future_rectangle"]) {
      expect(hasShapeCorners(shape)).toBe(cornerShapes.includes(shape ?? ""));
    }
  });

  it("uses physical defaults only when dimensions are supplied", () => {
    for (const box of [{ width: 400, height: 100 }, { width: 100, height: 400 }]) {
      expect(shapeCornerRadius("round_rectangle", box)).toBe(12);
      expect(shapeCornerRadius("rectangle", box)).toBe(0);
      expect(shapeCornerRadius("flow_chart_process", box)).toBe(0);
      expect(shapePath("rectangle", box)).toBe(shapePath("rectangle"));
      expect(shapeOutline("rectangle", box)).toBe(shapeOutline("rectangle"));
    }
    expect(shapeCornerRadius("round_rectangle", { width: 20000, height: 10000 })).toBe(1200);
  });

  it.each(cornerShapes)("draws circular physical arcs on wide and tall %s nodes", (shape) => {
    for (const box of [
      { width: 400, height: 100, cornerRadius: 24 },
      { width: 100, height: 400, cornerRadius: 24 },
    ]) {
      const path = shapePath(shape, box)!;
      const arcs = [...path.matchAll(/A([\d.e+-]+) ([\d.e+-]+) 0 0 1/g)];
      expect(arcs).toHaveLength(4);
      for (const arc of arcs) {
        expect(Number(arc[1]) * box.width / 100).toBeCloseTo(24, 10);
        expect(Number(arc[2]) * box.height / 100).toBeCloseTo(24, 10);
      }
      const outline = shapeOutline(shape, box)!;
      expect(outline).toHaveLength(28);
      const centers = [
        { x: box.width - 24, y: 24 },
        { x: box.width - 24, y: box.height - 24 },
        { x: 24, y: box.height - 24 },
        { x: 24, y: 24 },
      ];
      outline.forEach((point, index) => {
        const center = centers[Math.floor(index / 7)];
        expect(Math.hypot(point.x * box.width / 100 - center.x, point.y * box.height / 100 - center.y))
          .toBeCloseTo(24, 10);
      });
      expect((100 - outline[0].x) * box.width / 100).toBeCloseTo(24, 10);
      expect(outline[6].y * box.height / 100).toBeCloseTo(24, 10);
    }
  });

  it.each(cornerShapes)("keeps zero and clamped %s contours inside the box", (shape) => {
    for (const box of [{ width: 500, height: 80 }, { width: 80, height: 500 }, { width: 80, height: 80 }]) {
      const square = { ...box, cornerRadius: 0 };
      expect(shapeCornerRadius(shape, square)).toBe(0);
      expect(shapePath(shape, square)).toBe("M0 0H100V100H0Z");
      expect(shapeOutline(shape, square)).toBe(shapeOutline("rectangle"));
      expect(inscribedInsets(shapeOutline(shape, square))).toEqual([0, 0, 0, 0]);

      const clamped = { ...box, cornerRadius: 1000 };
      expect(shapeCornerRadius(shape, clamped)).toBe(40);
      expect(shapePath(shape, clamped)).not.toMatch(/NaN|Infinity/);
      for (const point of shapeOutline(shape, clamped)!) {
        expect(point.x).toBeGreaterThanOrEqual(-1e-10);
        expect(point.x).toBeLessThanOrEqual(100 + 1e-10);
        expect(point.y).toBeGreaterThanOrEqual(-1e-10);
        expect(point.y).toBeLessThanOrEqual(100 + 1e-10);
      }
    }
    expect(shapeCornerRadius(shape, { width: 8000, height: 4000, cornerRadius: 1000 })).toBe(1000);
  });

  it.each(cornerShapes)("fails safe for invalid %s dimensions and radii", (shape) => {
    const valid = { width: 400, height: 100, cornerRadius: 24 };
    const invalidBoxes: ShapeBox[] = [
      ...[0, -1, NaN, Infinity, -Infinity].flatMap((value) => [
        { ...valid, width: value }, { ...valid, height: value },
      ]),
      ...[-1, NaN, Infinity, -Infinity, 1001].map((cornerRadius) => ({ ...valid, cornerRadius })),
      { ...valid, cornerRadius: null } as unknown as ShapeBox,
      { ...valid, cornerRadius: "24" } as unknown as ShapeBox,
    ];
    for (const box of invalidBoxes) {
      expect(shapeCornerRadius(shape, box)).toBe(0);
      expect(shapePath(shape, box)).toBe(shapePath("rectangle"));
      expect(shapeOutline(shape, box)).toBe(shapeOutline("rectangle"));
    }
  });

  it("uses identical geometry for the process alias and rectangle", () => {
    const box = { width: 310, height: 85, cornerRadius: 37 };
    expect(shapePath("flow_chart_process", box)).toBe(shapePath("rectangle", box));
    expect(shapeOutline("flow_chart_process", box)).toBe(shapeOutline("rectangle", box));
    expect(shapeCornerRadius("flow_chart_process", box)).toBe(shapeCornerRadius("rectangle", box));
  });

  it("keeps unrelated diagram shapes and aliases independent of options", () => {
    for (const shape of [...LOCAL_SHAPE_KINDS, undefined, "future_rectangle"]) {
      if (hasShapeCorners(shape)) {
        continue;
      }
      for (const box of [
        { width: 400, height: 100, cornerRadius: 24 },
        { width: NaN, height: -1, cornerRadius: Infinity },
      ]) {
        expect(shapePath(shape, box)).toBe(shapePath(shape));
        expect(shapeOutline(shape, box)).toBe(shapeOutline(shape));
        expect(shapeCornerRadius(shape, box)).toBe(0);
      }
    }
  });

  it("keeps the existing no-argument picker icons and outlines", () => {
    expect(shapePath("round_rectangle")).toBe("M12 0H88Q100 0 100 12V88Q100 100 88 100H12Q0 100 0 88V12Q0 0 12 0Z");
    expect(shapePath("rectangle")).toBe("M0 0H100V100H0Z");
    expect(shapePath("flow_chart_process")).toBe(shapePath("rectangle"));
    const iconOutline = shapeOutline("round_rectangle")!;
    expect(iconOutline).toHaveLength(28);
    expect(iconOutline[0]).toEqual({ x: 88, y: 0 });
    expect(iconOutline[6]).toEqual({ x: 100, y: 12 });
    shapePath("round_rectangle", { width: 500, height: 80, cornerRadius: 40 });
    shapeOutline("round_rectangle", { width: 500, height: 80, cornerRadius: 40 });
    expect(shapeOutline("round_rectangle")).toBe(iconOutline);
    expect(shapePath("round_rectangle", undefined)).toBe(shapePath("round_rectangle"));
    expect(shapeOutline("round_rectangle", undefined)).toBe(iconOutline);
  });

  it.each([{ width: 400, height: 100 }, { width: 100, height: 400 }])(
    "projects contour positions on a $width by $height board box at non-default zoom",
    (box) => {
      const outline = shapeOutline("round_rectangle", { ...box, cornerRadius: 24 })!;
      const zoom = 1.75;
      const angle = Math.PI / 5;
      const scale = { x: box.width / 100 * zoom, y: box.height / 100 * zoom };
      const project = (point: { x: number; y: number }) => ({
        x: 173 + point.x * scale.x * Math.cos(angle) - point.y * scale.y * Math.sin(angle),
        y: -91 + point.x * scale.x * Math.sin(angle) + point.y * scale.y * Math.cos(angle),
      });
      const from = outline[2];
      const to = outline[3];
      const target = { x: from.x + (to.x - from.x) * 0.37, y: from.y + (to.y - from.y) * 0.37 };
      const nearest = project(closestContourPoint(outline, target, scale));
      const radial = project(contourPoint(outline, target));
      const expected = project(target);
      expect(nearest.x).toBeCloseTo(expected.x, 9);
      expect(nearest.y).toBeCloseTo(expected.y, 9);
      expect(radial.x).toBeCloseTo(expected.x, 9);
      expect(radial.y).toBeCloseTo(expected.y, 9);

      // From the square corner, the nearest point is the 45-degree arc sample.
      const center = { x: (box.width - 24) / box.width * 100, y: 24 / box.height * 100 };
      const onArc = {
        x: center.x + 24 / box.width * 100 / Math.sqrt(2),
        y: center.y - 24 / box.height * 100 / Math.sqrt(2),
      };
      const corner = project(closestContourPoint(outline, { x: 100, y: 0 }, scale));
      const expectedCorner = project(onArc);
      expect(corner.x).toBeCloseTo(expectedCorner.x, 9);
      expect(corner.y).toBeCloseTo(expectedCorner.y, 9);
    },
  );

  it("reuses normalized contours and evicts old resize samples from a bounded cache", () => {
    const box = { width: 417, height: 103, cornerRadius: 23 };
    const first = shapeOutline("rectangle", box)!;
    expect(Object.isFrozen(first)).toBe(true);
    expect(shapeOutline("round_rectangle", { width: 834, height: 206, cornerRadius: 46 })).toBe(first);
    for (let index = 0; index < 140; index += 1) {
      shapeOutline("rectangle", { width: 1000 + index, height: 91, cornerRadius: 19 });
    }
    const regenerated = shapeOutline("rectangle", box)!;
    expect(regenerated).not.toBe(first);
    expect(regenerated).toEqual(first);
    expect(shapeOutline("flow_chart_process", box)).toBe(regenerated);
  });
});