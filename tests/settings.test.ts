import { afterEach, describe, expect, it } from "vitest";

import { authorColor, setAuthorColors } from "../src/comment-thread";
import { setLocale } from "../src/i18n";
import { ALL_TOOLBAR_ITEMS, DEFAULT_TOOLBAR_ITEMS } from "../src/quick-tools";
import {
  DEFAULT_COMMENT_AUTHOR,
  DEFAULT_SETTINGS,
  addToFontList,
  commentAuthorName,
  moveFontListEntry,
  obsidianAccountName,
  navigationCommands,
  pointerBindingLabel,
  removeFromFontList,
  SETTING_BOUNDS,
  normalizeSettings,
  panDelta,
  shouldAskImportQuestion,
  shownFontFamilies,
  wheelZooms,
} from "../src/settings";

afterEach(() => setLocale("en"));

describe("plugin settings", () => {
  it("attaches to nodes and allows free ends by default; chaining lines is an opt-in", () => {
    expect(normalizeSettings({})).toMatchObject({ connectorAttachNodes: true, connectorAllowFree: true, connectorAttachConnectors: false });
    expect(normalizeSettings({ connectorAttachNodes: false, connectorAllowFree: true, connectorAttachConnectors: true }))
      .toMatchObject({ connectorAttachNodes: false, connectorAllowFree: true, connectorAttachConnectors: true });
    // A value that is not a boolean keeps the default.
    expect(normalizeSettings({ connectorAllowFree: "false", connectorAttachConnectors: 1 })).toMatchObject({ connectorAllowFree: true, connectorAttachConnectors: false });
    expect(normalizeSettings({ connectorAllowFree: false }).connectorAllowFree).toBe(false);
  });
  it("starts connector labels at the route midpoint and bounds the preference",()=>{
    expect(DEFAULT_SETTINGS.connectorLabelPosition).toBe(0.5);
    expect(normalizeSettings({connectorLabelPosition:0.75}).connectorLabelPosition).toBe(0.75);
    expect(normalizeSettings({connectorLabelPosition:2}).connectorLabelPosition).toBe(1);
    expect(normalizeSettings({connectorLabelPosition:-1}).connectorLabelPosition).toBe(0);
  });
  it("falls back to the defaults for anything that is not a settings object", () => {
    for (const value of [undefined, null, 0, "settings", [], () => undefined]) {
      expect(normalizeSettings(value)).toEqual(DEFAULT_SETTINGS);
    }
  });

  it("signs comments with the chosen name, else the Obsidian account's, else Local user", () => {
    const storage = (value: string | null) => ({ getItem: (key: string) => (key === "obsidian-account" ? value : null) });
    const account = obsidianAccountName(storage(JSON.stringify({ name: " Anna ", email: "a@b.c", token: "secret" })));
    expect(account).toBe("Anna");
    expect(obsidianAccountName(storage(null))).toBeUndefined();
    expect(obsidianAccountName(storage("not json"))).toBeUndefined();
    expect(commentAuthorName(normalizeSettings({ commentAuthor: "  Nikolai " }), account)).toBe("Nikolai");
    expect(commentAuthorName(DEFAULT_SETTINGS, account)).toBe("Anna");
    expect(commentAuthorName(DEFAULT_SETTINGS)).toBe(DEFAULT_COMMENT_AUTHOR);
  });

  it("keeps a colour for each author only when it is one", () => {
    const stored = normalizeSettings({ commentAuthorColors: { Anna: "#AA3300", Bob: "red", "": "#000000" } });
    expect(stored.commentAuthorColors).toEqual({ Anna: "#aa3300" });
    const madeUp = authorColor("Anna");
    setAuthorColors(stored.commentAuthorColors);
    expect(authorColor("Anna")).toBe("#aa3300");
    setAuthorColors({});
    expect(authorColor("Anna")).toBe(madeUp);
  });

  it("keeps the developer diagnostics hidden unless they were asked for by name", () => {
    expect(DEFAULT_SETTINGS.developerDiagnostics).toBe(false);
    // An older version saved its default of showing them; that is not a choice.
    expect(normalizeSettings({ showDiagnostics: true }).developerDiagnostics).toBe(false);
    expect(normalizeSettings({ developerDiagnostics: true }).developerDiagnostics).toBe(true);
  });

  it("keeps stored values and drops unknown keys", () => {
    const stored = normalizeSettings({
      zoomStep: 1.5, panStep: 128, wheelZoomModifier: "shift",
      zoomToCursor: false, minimapVisible: false, somethingElse: "ignored",
    });
    expect(stored.zoomStep).toBe(1.5);
    expect(stored.panStep).toBe(128);
    expect(stored.wheelZoomModifier).toBe("shift");
    expect(stored.zoomToCursor).toBe(false);
    expect(stored.minimapVisible).toBe(false);
    expect(stored).not.toHaveProperty("somethingElse");
    // Untouched keys keep their default.
    expect(stored.maxZoom).toBe(DEFAULT_SETTINGS.maxZoom);
  });

  it("keeps the connector magnet and snap distances within their range", () => {
    expect(DEFAULT_SETTINGS.connectorMagnet).toBe(24);
    expect(DEFAULT_SETTINGS.connectorSnap).toBe(16);
    const stored = normalizeSettings({ connectorMagnet: 40, connectorSnap: 0 });
    expect(stored.connectorMagnet).toBe(40);
    expect(stored.connectorSnap).toBe(0);
    const clamped = normalizeSettings({ connectorMagnet: 500, connectorSnap: -3 });
    expect(clamped.connectorMagnet).toBe(SETTING_BOUNDS.connectorMagnet.max);
    expect(clamped.connectorSnap).toBe(SETTING_BOUNDS.connectorSnap.min);
  });

  it("clamps out-of-range numbers instead of refusing to open a board", () => {
    const clamped = normalizeSettings({ zoomStep: 99, panStep: -50, fastPanMultiplier: 0 });
    expect(clamped.zoomStep).toBe(SETTING_BOUNDS.zoomStep.max);
    expect(clamped.panStep).toBe(SETTING_BOUNDS.panStep.min);
    expect(clamped.fastPanMultiplier).toBe(SETTING_BOUNDS.fastPanMultiplier.min);
    const broken = normalizeSettings({ zoomStep: Number.NaN, panStep: "many", minZoom: Infinity });
    expect(broken.zoomStep).toBe(DEFAULT_SETTINGS.zoomStep);
    expect(broken.panStep).toBe(DEFAULT_SETTINGS.panStep);
    expect(broken.minZoom).toBe(DEFAULT_SETTINGS.minZoom);
  });

  it("orders an inverted zoom range so some zoom always remains available", () => {
    const settings = normalizeSettings({ minZoom: 1, maxZoom: 1 });
    expect(settings.minZoom).toBeLessThanOrEqual(settings.maxZoom);
    const inverted = normalizeSettings({ minZoom: 0.9, maxZoom: 1 });
    expect(inverted.minZoom).toBe(0.9);
    expect(inverted.maxZoom).toBe(1);
  });

  it("rejects an unsupported wheel modifier", () => {
    expect(normalizeSettings({ wheelZoomModifier: "meta" }).wheelZoomModifier)
      .toBe(DEFAULT_SETTINGS.wheelZoomModifier);
  });

  it("derives pan deltas from the configured step", () => {
    const settings = normalizeSettings({ panStep: 32, fastPanMultiplier: 3 });
    expect(panDelta(settings, "left")).toEqual({ x: -32, y: 0 });
    expect(panDelta(settings, "right")).toEqual({ x: 32, y: 0 });
    expect(panDelta(settings, "up")).toEqual({ x: 0, y: -32 });
    expect(panDelta(settings, "down", true)).toEqual({ x: 0, y: 96 });
  });

  it("decides wheel zoom from the configured modifier", () => {
    const ctrl = normalizeSettings({ wheelZoomModifier: "ctrl" });
    expect(wheelZooms(ctrl, { ctrlKey: true })).toBe(true);
    expect(wheelZooms(ctrl, { metaKey: true })).toBe(true);
    expect(wheelZooms(ctrl, { shiftKey: true })).toBe(false);
    expect(wheelZooms(normalizeSettings({ wheelZoomModifier: "none" }), {})).toBe(true);
    expect(wheelZooms(normalizeSettings({ wheelZoomModifier: "alt" }), { altKey: true })).toBe(true);
  });

  it("declares navigation commands with unique ids and no default hotkeys", () => {
    const commands = navigationCommands();
    const ids = commands.map((command) => command.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const command of commands) {
      expect(command.id.startsWith("m1-")).toBe(true);
      expect(command.name.length).toBeGreaterThan(0);
      expect(command).not.toHaveProperty("hotkeys");
    }
  });

  it("reads navigation command names lazily, in the language set when they are built", () => {
    setLocale("ru");
    expect(navigationCommands().find((command) => command.id === "m1-zoom-in")?.name).toBe("Увеличить масштаб");
    setLocale("en");
    expect(navigationCommands().find((command) => command.id === "m1-zoom-in")?.name).toBe("Zoom in");
  });

  it("asks the import question once, until it has been answered or dismissed", () => {
    expect(DEFAULT_SETTINGS.importQuestionAnswered).toBe(false);
    expect(shouldAskImportQuestion(DEFAULT_SETTINGS)).toBe(true);
    // An older stored file predates the setting entirely; it still opens without asking again.
    expect(normalizeSettings({}).importQuestionAnswered).toBe(false);
    const answered = normalizeSettings({ importQuestionAnswered: true });
    expect(answered.importQuestionAnswered).toBe(true);
    expect(shouldAskImportQuestion(answered)).toBe(false);
    // A value that is not a boolean keeps the default rather than skipping the question.
    expect(normalizeSettings({ importQuestionAnswered: "yes" }).importQuestionAnswered).toBe(false);
  });

  it("names each pointer chord, in the language in use", () => {
    expect(pointerBindingLabel("none")).toBe("None");
    expect(pointerBindingLabel("alt+left")).toBe("Alt + left button");
    setLocale("ru");
    expect(pointerBindingLabel("alt+left")).toBe("Alt + левая кнопка");
  });

  it("puts everything but code, the grid and the link on the bar by default", () => {
    expect(DEFAULT_SETTINGS.toolbarItems).toEqual(DEFAULT_TOOLBAR_ITEMS);
    expect(DEFAULT_TOOLBAR_ITEMS).not.toContain("code");
    expect(DEFAULT_TOOLBAR_ITEMS).not.toContain("table");
    expect(DEFAULT_TOOLBAR_ITEMS).not.toContain("link");
    // Missing from the bar simply means "under More": nothing else marks it so.
    for (const item of ALL_TOOLBAR_ITEMS) {
      if (!DEFAULT_TOOLBAR_ITEMS.includes(item)) expect(["code", "table", "link"]).toContain(item);
    }
  });

  it("keeps an explicit tool bar order, dropping unknown and repeated entries", () => {
    const stored = normalizeSettings({ toolbarItems: ["frame", "not-a-tool", "select", "frame", "card"] });
    expect(stored.toolbarItems).toEqual(["frame", "select", "card"]);
  });

  it("accepts an explicitly empty tool bar rather than falling back to the default", () => {
    expect(normalizeSettings({ toolbarItems: [] }).toolbarItems).toEqual([]);
  });

  it("falls back to the default tool bar when nothing was stored, keyed by ALL_TOOLBAR_ITEMS order", () => {
    expect(normalizeSettings({}).toolbarItems).toEqual(DEFAULT_TOOLBAR_ITEMS);
    expect(normalizeSettings({ toolbarItems: "select,frame" }).toolbarItems).toEqual(DEFAULT_TOOLBAR_ITEMS);
  });

  it("migrates the old showLassoTool and showConnectorTool booleans when no tool bar was ever saved", () => {
    const lassoHidden = normalizeSettings({ showLassoTool: false });
    expect(lassoHidden.toolbarItems).not.toContain("lasso");
    expect(lassoHidden.toolbarItems).toContain("connector");
    const connectorHidden = normalizeSettings({ showConnectorTool: false });
    expect(connectorHidden.toolbarItems).toContain("lasso");
    expect(connectorHidden.toolbarItems).not.toContain("connector");
    // A file that already has a tool bar order ignores the old booleans entirely.
    const both = normalizeSettings({ showLassoTool: false, showConnectorTool: false, toolbarItems: ["lasso", "connector"] });
    expect(both.toolbarItems).toEqual(["lasso", "connector"]);
  });

  it("keeps only safe, de-duplicated font pack ids", () => {
    expect(DEFAULT_SETTINGS.fontPacks).toEqual([]);
    expect(normalizeSettings({ fontPacks: ["word", "word", "excalidraw"] }).fontPacks).toEqual(["word", "excalidraw"]);
    expect(normalizeSettings({ fontPacks: ["../evil", "Not-Lower", "", 7, "miro-cjk"] }).fontPacks).toEqual(["miro-cjk"]);
    expect(normalizeSettings({ fontPacks: "word" }).fontPacks).toEqual([]);
  });

  it("keeps only custom fonts with a safe family and a file name that cannot climb out of its folder", () => {
    expect(DEFAULT_SETTINGS.customFonts).toEqual([]);
    const stored = normalizeSettings({
      customFonts: [
        { family: "My Font", file: "My Font.ttf" },
        { family: "url(evil)", file: "evil.ttf" },
        { family: "Other", file: "../../evil.ttf" },
        { family: "Dup", file: "My Font.ttf" },
      ],
    });
    expect(stored.customFonts).toEqual([{ family: "My Font", file: "My Font.ttf" }]);
  });

  it("starts the font pool at the base fonts every machine has, all shown", () => {
    expect(DEFAULT_SETTINGS.fontList).toEqual([
      { family: "Inter", shown: true },
      { family: "Source Code Pro", shown: true },
      { family: "sans-serif", shown: true },
      { family: "serif", shown: true },
    ]);
    expect(shownFontFamilies(DEFAULT_SETTINGS.fontList)).toEqual(["Inter", "Source Code Pro", "sans-serif", "serif"]);
  });

  it("normalizes a stored font list, dropping an unsafe family and falling back when nothing survives", () => {
    const stored = normalizeSettings({ fontList: [{ family: "Carlito", shown: false }, { family: "url(evil)", shown: true }, { family: "Carlito", shown: true }] });
    expect(stored.fontList).toEqual([{ family: "Carlito", shown: false }]);
    expect(normalizeSettings({ fontList: [{ family: "url(evil)" }] }).fontList).toEqual(DEFAULT_SETTINGS.fontList);
  });

  it("appends a new pack's or custom font's families to the pool, skipping any already there", () => {
    const withPack = addToFontList(DEFAULT_SETTINGS.fontList, ["Carlito", "Caladea"]);
    expect(withPack.map((entry) => entry.family)).toEqual(["Inter", "Source Code Pro", "sans-serif", "serif", "Carlito", "Caladea"]);
    expect(addToFontList(withPack, ["Carlito"])).toBe(withPack);
  });

  it("drops a removed pack's or custom font's families from the pool", () => {
    const withPack = addToFontList(DEFAULT_SETTINGS.fontList, ["Carlito", "Caladea"]);
    expect(removeFromFontList(withPack, ["Carlito"]).map((entry) => entry.family)).toEqual(["Inter", "Source Code Pro", "sans-serif", "serif", "Caladea"]);
  });

  it("moves one family up or down the pool, and leaves it be at either end or when it is not in the pool", () => {
    const pool = [{ family: "A", shown: true }, { family: "B", shown: true }, { family: "C", shown: true }];
    expect(moveFontListEntry(pool, "B", "up").map((entry) => entry.family)).toEqual(["B", "A", "C"]);
    expect(moveFontListEntry(pool, "B", "down").map((entry) => entry.family)).toEqual(["A", "C", "B"]);
    expect(moveFontListEntry(pool, "A", "up")).toBe(pool);
    expect(moveFontListEntry(pool, "C", "down")).toBe(pool);
    expect(moveFontListEntry(pool, "Nowhere", "up")).toBe(pool);
  });
});
