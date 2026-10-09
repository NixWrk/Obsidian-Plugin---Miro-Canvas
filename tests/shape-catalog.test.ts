import { afterEach, describe, expect, it } from "vitest";

import { setLocale } from "../src/i18n";
import { SHAPE_CATALOG, shapeCatalogEntry, shapeCatalogLabel, shapeDefaultSize } from "../src/shape-catalog";
import { shapePath } from "../src/shape-geometry";
import { LOCAL_SHAPE_KINDS } from "../src/source-model";

describe("shape catalogue", () => {
  it("draws every shape kind with exactly one entry", () => {
    const drawn = SHAPE_CATALOG.flatMap((item) => [item.kind, ...item.aliases]);
    expect([...drawn].sort()).toEqual([...LOCAL_SHAPE_KINDS].sort());
    for (const kind of LOCAL_SHAPE_KINDS) {
      expect(shapeCatalogEntry(kind), kind).toBeDefined();
    }
  });

  it("never offers the same picture twice", () => {
    const pictures = SHAPE_CATALOG.map((item) => shapePath(item.kind));
    expect(pictures.every((path) => path !== undefined)).toBe(true);
    expect(new Set(pictures).size).toBe(pictures.length);
    for (const item of SHAPE_CATALOG) {
      for (const alias of item.aliases) {
        expect(shapePath(alias), alias).toBeDefined();
      }
    }
  });

  it("files a flowchart symbol drawn like a basic shape under the basic shape", () => {
    expect(shapeCatalogEntry("flow_chart_decision")?.kind).toBe("rhombus");
    expect(shapeCatalogEntry("flow_chart_note_curly_left")?.kind).toBe("left_brace");
    expect(shapeCatalogEntry("flow_chart_note_curly_right")?.kind).toBe("right_brace");
    expect(shapeCatalogEntry("flow_chart_magnetic_disk")?.kind).toBe("can");
    expect(SHAPE_CATALOG.filter((item) => item.section === "basic").every((item) => !item.kind.startsWith("flow_chart_"))).toBe(true);
    expect(SHAPE_CATALOG.filter((item) => item.section === "flowchart").every((item) => item.kind.startsWith("flow_chart_"))).toBe(true);
  });

  it("names every entry and gives every flowchart picture its meaning", () => {
    const names = SHAPE_CATALOG.map((item) => item.name);
    expect(new Set(names).size).toBe(names.length);
    for (const item of SHAPE_CATALOG) {
      if (item.section === "flowchart" || item.aliases.some((alias) => alias.startsWith("flow_chart_"))) {
        expect(item.meaning, item.kind).toBeTruthy();
      }
    }
    const rhombus = shapeCatalogEntry("rhombus")!;
    expect(shapeCatalogLabel(rhombus)).toBe(`Rhombus\n${rhombus.meaning!}`);
    expect(shapeCatalogLabel(shapeCatalogEntry("star")!)).toBe("Star");
    expect(shapeCatalogEntry("not_a_shape")).toBeUndefined();
    expect(shapeCatalogEntry(undefined)).toBeUndefined();
  });
});

describe("shape default size", () => {
  const expectedSizes = {
    wide: { width: 240, height: 160 },
    tall: { width: 160, height: 240 },
    square: { width: 200, height: 200 },
  };

  it.each(SHAPE_CATALOG)("sizes $kind from its $aspect catalogue aspect", (item) => {
    expect(shapeDefaultSize(item.kind)).toEqual(expectedSizes[item.aspect]);
  });

  const aliases = SHAPE_CATALOG.flatMap((item) => item.aliases.map((alias) => ({
    alias,
    kind: item.kind,
    aspect: item.aspect,
  })));

  it.each(aliases)("sizes alias $alias like $kind", ({ alias, kind, aspect }) => {
    expect(shapeDefaultSize(alias)).toEqual(expectedSizes[aspect]);
    expect(shapeDefaultSize(alias)).toEqual(shapeDefaultSize(kind));
  });

  it.each([undefined, "", "not_a_shape", "constructor"])("uses a square fallback for %s", (kind) => {
    expect(shapeDefaultSize(kind)).toEqual({ width: 200, height: 200 });
  });

  it.each(["rectangle", "can", "circle", "not_a_shape"])("returns a fresh size for %s", (kind) => {
    const expected = shapeDefaultSize(kind);
    const size = shapeDefaultSize(kind);
    size.width = 1;
    size.height = 2;
    expect(shapeDefaultSize(kind)).toEqual(expected);
  });
});

describe("shape catalogue in Russian", () => {
  afterEach(() => setLocale("en"));

  it("names shapes and their flowchart meaning from the Russian word table", () => {
    setLocale("ru");
    expect(shapeCatalogLabel(shapeCatalogEntry("star")!)).toBe("Звезда");
    const rhombus = shapeCatalogEntry("rhombus")!;
    expect(shapeCatalogLabel(rhombus)).toBe("Ромб\nРешение: условие, на котором поток ветвится");
  });
});
