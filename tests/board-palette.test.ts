import { describe, expect, it } from "vitest";
import { defaultPalette, normalizeAppearanceState } from "../src/appearance";
import { displayedBoardPalette, mergeDisplayedAppearance } from "../src/board-palette";

const permanent = [{ id: "brand", color: "#123456", label: "Brand", source: "custom" as const }];

describe("permanent palette inheritance", () => {
  it("uses a global palette for absent and untouched built-in board palettes", () => {
    expect(displayedBoardPalette({}, permanent)).toBe(permanent);
    expect(displayedBoardPalette({ settings: { palette: defaultPalette() } }, permanent)).toBe(permanent);
  });

  it("preserves individual colors and order", () => {
    expect(displayedBoardPalette({ settings: { palette: permanent } }, permanent)).toBeUndefined();
    expect(displayedBoardPalette({ settings: { palette: [...defaultPalette()].reverse() } }, permanent)).toBeUndefined();
    const renamed = defaultPalette().map((entry, index) => index === 0 ? { ...entry, label: "Personal black" } : entry);
    expect(displayedBoardPalette({ settings: { palette: renamed } }, permanent)).toBeUndefined();
  });

  it("keeps the palette inherited through ordinary restyles, preserving unknown settings", () => {
    const metadata = { schemaVersion: 1, settings: { future: "keep", palette: defaultPalette() } };
    const displayed = normalizeAppearanceState({ ...metadata, settings: { ...metadata.settings, palette: permanent } });
    const saved = mergeDisplayedAppearance(metadata, displayed, permanent, false);
    expect(saved.settings).toMatchObject(metadata.settings);
    expect(displayedBoardPalette(saved, [...permanent, { id: "next", color: "#ff0000", label: "Next", source: "custom" }])).toHaveLength(2);
    const explicit = mergeDisplayedAppearance(metadata, displayed, permanent, true);
    expect((explicit.settings as { palette: unknown }).palette).toEqual(permanent);
  });
});
