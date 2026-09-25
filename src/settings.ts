/**
 * Persisted plugin settings.
 *
 * Everything here is pure data with explicit bounds so the settings tab, the
 * session and the tests all agree on what a value may be.  A stored file is
 * user-editable and may come from an older release, so nothing is trusted:
 * unknown keys are dropped and out-of-range numbers are clamped rather than
 * rejected, because a bad preference must never stop a board from opening.
 */

import { OFFERED_FONT_FAMILIES, isSafeFontFamily } from "./appearance";
import { words } from "./i18n";
import { POINTER_BINDINGS, type PointerBinding } from "./pointer-bindings";
import { ALL_TOOLBAR_ITEMS, DEFAULT_TOOLBAR_ITEMS, type ToolbarItem } from "./quick-tools";
import { readAvailableUpdate, type AvailableUpdate } from "./update-check";
export type WheelZoomModifier = "none" | "ctrl" | "shift" | "alt";

/** A font file added by hand, kept under the plugin's own `fonts/custom` folder. */
export interface CustomFontFile {
  readonly family: string;
  /** The file's own name under `fonts/custom/`; never a path, so it cannot climb out of that folder. */
  readonly file: string;
}

/** One family in the person's pool: whether the toolbar's font list offers it, and where. */
export interface FontListEntry {
  readonly family: string;
  readonly shown: boolean;
}

export interface MiroCanvasSettings {
  /** Multiplier applied per zoom step. */
  readonly zoomStep: number;
  readonly minZoom: number;
  readonly maxZoom: number;
  /** Zoom towards the pointer instead of the viewport center. */
  readonly zoomToCursor: boolean;
  readonly invertWheelZoom: boolean;
  /** Modifier the wheel needs before it zooms instead of pans. */
  readonly wheelZoomModifier: WheelZoomModifier;
  /** Board units moved by one keyboard pan step. */
  readonly panStep: number;
  /** Multiplier applied while Shift is held during a keyboard pan. */
  readonly fastPanMultiplier: number;
  /** Screen pixels within which a connector end attaches to a node's outline. */
  readonly connectorMagnet: number;
  /** Screen pixels within which a connector end snaps onto a standard point. */
  readonly connectorSnap: number;
  readonly connectorAttachNodes: boolean;
  readonly connectorAllowFree: boolean;
  readonly connectorAttachConnectors: boolean;
  /** Initial position of new connector labels, as a fraction of route length. */
  readonly connectorLabelPosition: number;
  readonly minimapVisible: boolean;
  readonly selectionToolbarEnabled: boolean;
  readonly lassoBinding: PointerBinding;
  readonly panBinding: PointerBinding;
  readonly lineBinding: PointerBinding;
  /** The bottom tool bar's own content, in order; whatever is missing sits under More, in `ALL_TOOLBAR_ITEMS` order. */
  readonly toolbarItems: readonly ToolbarItem[];
  /**
   * The warning badge listing what the plugin could not do as asked.  It is
   * for whoever develops or debugs the plugin, so it starts hidden; it is
   * stored under its own name so a badge saved as shown by an older version
   * does not come back.
   */
  readonly developerDiagnostics: boolean;
  /** The name comments written here are signed with; empty takes the Obsidian account's name. */
  readonly commentAuthor: string;
  /** The colour each comment author's pins and avatars take, by name, where one was chosen. */
  readonly commentAuthorColors: Readonly<Record<string, string>>;
  /**
   * Whether the first-run "Import boards from Miro?" question has been put
   * to the person, however they answered it or if they simply closed it.
   * Once true the question is not asked again; the settings tab still opens
   * the same guide on request.
   */
  readonly importQuestionAnswered: boolean;
  /** Ask GitHub once a day, at start, whether a newer release is out. */
  readonly checkUpdatesAutomatically: boolean;
  /** When GitHub was last asked, in milliseconds since 1970; 0 before the first time. */
  readonly lastUpdateCheck: number;
  /** A newer release the last check found, shown until it is installed. */
  readonly availableUpdate: AvailableUpdate | undefined;
  /** Downloaded font packs' ids, verified against disk at load: a folder that has gone missing drops its id quietly. */
  readonly fontPacks: readonly string[];
  /** Font files added by hand, kept under the plugin's own folder. */
  readonly customFonts: readonly CustomFontFile[];
  /**
   * The person's own pool: which families the toolbar's font list offers,
   * and in what order.  Installing a pack or adding a custom font appends
   * its families here; removing one drops them again.
   */
  readonly fontList: readonly FontListEntry[];
}

interface NumberBound {
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

export const SETTING_BOUNDS: Readonly<Record<
  "zoomStep" | "minZoom" | "maxZoom" | "panStep" | "fastPanMultiplier" | "connectorMagnet" | "connectorSnap" | "connectorLabelPosition",
  NumberBound
>> = Object.freeze({
  zoomStep: { min: 1.02, max: 2, step: 0.01 },
  minZoom: { min: 0.01, max: 1, step: 0.01 },
  maxZoom: { min: 1, max: 64, step: 0.5 },
  panStep: { min: 8, max: 512, step: 8 },
  fastPanMultiplier: { min: 1, max: 10, step: 0.5 },
  connectorMagnet: { min: 0, max: 96, step: 2 },
  connectorSnap: { min: 0, max: 64, step: 2 },
  connectorLabelPosition: { min: 0, max: 1, step: 0.05 },
});

export const WHEEL_ZOOM_MODIFIERS: readonly WheelZoomModifier[] = ["none", "ctrl", "shift", "alt"];

export const DEFAULT_SETTINGS: MiroCanvasSettings = Object.freeze({
  zoomStep: 1.2,
  minZoom: 0.0625,
  maxZoom: 16,
  zoomToCursor: true,
  invertWheelZoom: false,
  wheelZoomModifier: "ctrl",
  panStep: 64,
  fastPanMultiplier: 4,
  connectorMagnet: 24,
  connectorSnap: 16,
  connectorAttachNodes: true,
  connectorAllowFree: true,
  connectorAttachConnectors: false,
  connectorLabelPosition: 0.5,
  minimapVisible: true,
  selectionToolbarEnabled: true,
  lassoBinding: "alt+left",
  panBinding: "none",
  lineBinding: "right",
  toolbarItems: DEFAULT_TOOLBAR_ITEMS,
  developerDiagnostics: false,
  commentAuthor: "",
  commentAuthorColors: Object.freeze({}),
  importQuestionAnswered: false,
  checkUpdatesAutomatically: true,
  lastUpdateCheck: 0,
  availableUpdate: undefined,
  fontPacks: Object.freeze([]),
  customFonts: Object.freeze([]),
  fontList: Object.freeze(OFFERED_FONT_FAMILIES.map((family) => Object.freeze({ family, shown: true }))),
});

/** The longest name a comment is signed with, and the most authors given colours. */
const MAX_AUTHOR_NAME = 64;
const MAX_AUTHOR_COLORS = 500;
const HEX_COLOR = /^#[0-9a-f]{6}$/iu;
/** The name a comment is signed with when nothing better is known. */
export const DEFAULT_COMMENT_AUTHOR = "Local user";

/**
 * The name of the Obsidian account signed in on this device, if any.
 * Obsidian keeps the account in local storage together with its sign-in
 * token; only the name is read, and nothing else leaves this function.
 */
export function obsidianAccountName(storage: { getItem(key: string): string | null } | undefined): string | undefined {
  try {
    const stored = storage?.getItem("obsidian-account");
    if (typeof stored !== "string") return undefined;
    const name = (JSON.parse(stored) as { name?: unknown } | null)?.name;
    return typeof name === "string" && name.trim() !== "" ? name.trim().slice(0, MAX_AUTHOR_NAME) : undefined;
  } catch {
    return undefined;
  }
}

/** Who comments written here are signed by: the name chosen, else the account's, else a plain "Local user". */
export function commentAuthorName(settings: Pick<MiroCanvasSettings, "commentAuthor">, accountName?: string): string {
  return settings.commentAuthor.trim() || accountName || DEFAULT_COMMENT_AUTHOR;
}

function readAuthorColors(value: unknown): Readonly<Record<string, string>> {
  if (!isRecord(value)) return DEFAULT_SETTINGS.commentAuthorColors;
  const colors: Record<string, string> = {};
  for (const [name, color] of Object.entries(value).slice(0, MAX_AUTHOR_COLORS)) {
    if (name.trim() === "" || name.length > MAX_AUTHOR_NAME || typeof color !== "string" || !HEX_COLOR.test(color)) continue;
    colors[name] = color.toLowerCase();
  }
  return Object.freeze(colors);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readNumber(source: Record<string, unknown>, key: keyof typeof SETTING_BOUNDS, fallback: number): number {
  const raw = source[key];
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(value)) {
    return fallback;
  }
  const bound = SETTING_BOUNDS[key];
  return Math.min(bound.max, Math.max(bound.min, value));
}

function readBoolean(source: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = source[key];
  return typeof value === "boolean" ? value : fallback;
}

/**
 * The bottom tool bar's own content: an ordered, de-duplicated subset of
 * `ALL_TOOLBAR_ITEMS`, dropping anything unknown.  A file with no
 * `toolbarItems` at all predates this setting; it migrates the older
 * `showLassoTool` / `showConnectorTool` booleans instead, leaving that tool
 * out of the default bar where one was set to false.
 */
function readToolbarItems(value: unknown, legacyShowLasso: unknown, legacyShowConnector: unknown): readonly ToolbarItem[] {
  if (Array.isArray(value)) {
    const seen = new Set<ToolbarItem>();
    const items: ToolbarItem[] = [];
    for (const entry of value) {
      if (typeof entry !== "string" || seen.has(entry as ToolbarItem) || !(ALL_TOOLBAR_ITEMS as readonly string[]).includes(entry)) continue;
      seen.add(entry as ToolbarItem);
      items.push(entry as ToolbarItem);
    }
    return Object.freeze(items);
  }
  return Object.freeze(DEFAULT_TOOLBAR_ITEMS.filter((item) => {
    if (item === "lasso" && legacyShowLasso === false) return false;
    if (item === "connector" && legacyShowConnector === false) return false;
    return true;
  }));
}

/** The pack ids `tools/build_font_packs.py` mints: lower-case words joined by hyphens. */
const SAFE_FONT_PACK_ID = /^[a-z][a-z0-9-]{0,63}$/u;
/** A custom font's own file name under `fonts/custom/`: no path, so it cannot climb out of that folder. */
const SAFE_CUSTOM_FONT_FILE = /^[^/\\:*?"<>|\u0000-\u001f]{1,180}$/u;
const MAX_FONT_PACKS = 32;
const MAX_CUSTOM_FONTS = 200;
const MAX_FONT_LIST_ENTRIES = 500;

function readFontPacks(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return DEFAULT_SETTINGS.fontPacks;
  }
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const item of value.slice(0, MAX_FONT_PACKS)) {
    if (typeof item !== "string") continue;
    const id = item.trim();
    if (id === "" || !SAFE_FONT_PACK_ID.test(id) || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return Object.freeze(ids);
}

function readCustomFonts(value: unknown): readonly CustomFontFile[] {
  if (!Array.isArray(value)) {
    return DEFAULT_SETTINGS.customFonts;
  }
  const seenFiles = new Set<string>();
  const fonts: CustomFontFile[] = [];
  for (const item of value.slice(0, MAX_CUSTOM_FONTS)) {
    if (!isRecord(item)) continue;
    const family = item.family;
    const file = item.file;
    if (!isSafeFontFamily(family) || typeof file !== "string") continue;
    const trimmedFile = file.trim();
    if (!SAFE_CUSTOM_FONT_FILE.test(trimmedFile) || trimmedFile === "." || trimmedFile === ".." || seenFiles.has(trimmedFile)) continue;
    seenFiles.add(trimmedFile);
    fonts.push(Object.freeze({ family: family.trim(), file: trimmedFile }));
  }
  return Object.freeze(fonts);
}

function readFontList(value: unknown): readonly FontListEntry[] {
  if (!Array.isArray(value)) {
    return DEFAULT_SETTINGS.fontList;
  }
  const seen = new Set<string>();
  const entries: FontListEntry[] = [];
  for (const item of value.slice(0, MAX_FONT_LIST_ENTRIES)) {
    if (!isRecord(item)) continue;
    const family = item.family;
    if (!isSafeFontFamily(family) || seen.has(family.trim())) continue;
    seen.add(family.trim());
    entries.push(Object.freeze({ family: family.trim(), shown: typeof item.shown === "boolean" ? item.shown : true }));
  }
  // An empty or unusable list would leave the toolbar with no font of its
  // own to offer beyond Obsidian's; the default pool is a safer fallback
  // than a font list nobody can see or reach.
  return entries.length === 0 ? DEFAULT_SETTINGS.fontList : Object.freeze(entries);
}

/** The pool's shown families, in the order the person arranged them. */
export function shownFontFamilies(fontList: readonly FontListEntry[]): readonly string[] {
  return Object.freeze(fontList.filter((entry) => entry.shown).map((entry) => entry.family));
}

export type FontListDirection = "up" | "down";

/** Move one family one place up or down the pool; a family at the end already, or not in it, is unchanged. */
export function moveFontListEntry(fontList: readonly FontListEntry[], family: string, direction: FontListDirection): readonly FontListEntry[] {
  const index = fontList.findIndex((entry) => entry.family === family);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || target < 0 || target >= fontList.length) {
    return fontList;
  }
  const next = [...fontList];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return Object.freeze(next);
}

/** Append families a newly installed pack or a newly added custom font offers, skipping any already in the pool. */
export function addToFontList(fontList: readonly FontListEntry[], families: readonly string[]): readonly FontListEntry[] {
  const known = new Set(fontList.map((entry) => entry.family));
  const additions = families.filter((family) => !known.has(family)).map((family) => Object.freeze({ family, shown: true }));
  return additions.length === 0 ? fontList : Object.freeze([...fontList, ...additions]);
}

/** Drop families a removed pack or a removed custom font contributed. */
export function removeFromFontList(fontList: readonly FontListEntry[], families: readonly string[]): readonly FontListEntry[] {
  const dropped = new Set(families);
  return Object.freeze(fontList.filter((entry) => !dropped.has(entry.family)));
}

/** Accepts any stored value and always returns usable settings. */
export function normalizeSettings(value: unknown): MiroCanvasSettings {
  if (!isRecord(value)) {
    return DEFAULT_SETTINGS;
  }
  const modifier = value.wheelZoomModifier;
  const minZoom = readNumber(value, "minZoom", DEFAULT_SETTINGS.minZoom);
  const maxZoom = readNumber(value, "maxZoom", DEFAULT_SETTINGS.maxZoom);
  return Object.freeze({
    zoomStep: readNumber(value, "zoomStep", DEFAULT_SETTINGS.zoomStep),
    // An inverted range would leave no zoom at all, so the pair is ordered.
    minZoom: Math.min(minZoom, maxZoom),
    maxZoom: Math.max(minZoom, maxZoom),
    zoomToCursor: readBoolean(value, "zoomToCursor", DEFAULT_SETTINGS.zoomToCursor),
    invertWheelZoom: readBoolean(value, "invertWheelZoom", DEFAULT_SETTINGS.invertWheelZoom),
    wheelZoomModifier: WHEEL_ZOOM_MODIFIERS.includes(modifier as WheelZoomModifier)
      ? modifier as WheelZoomModifier
      : DEFAULT_SETTINGS.wheelZoomModifier,
    panStep: readNumber(value, "panStep", DEFAULT_SETTINGS.panStep),
    fastPanMultiplier: readNumber(value, "fastPanMultiplier", DEFAULT_SETTINGS.fastPanMultiplier),
    connectorMagnet: readNumber(value, "connectorMagnet", DEFAULT_SETTINGS.connectorMagnet),
    connectorSnap: readNumber(value, "connectorSnap", DEFAULT_SETTINGS.connectorSnap),
    connectorAttachNodes: readBoolean(value, "connectorAttachNodes", DEFAULT_SETTINGS.connectorAttachNodes),
    connectorAllowFree: readBoolean(value, "connectorAllowFree", DEFAULT_SETTINGS.connectorAllowFree),
    connectorAttachConnectors: readBoolean(value, "connectorAttachConnectors", DEFAULT_SETTINGS.connectorAttachConnectors),
    connectorLabelPosition: readNumber(value, "connectorLabelPosition", DEFAULT_SETTINGS.connectorLabelPosition),
    minimapVisible: readBoolean(value, "minimapVisible", DEFAULT_SETTINGS.minimapVisible),
    selectionToolbarEnabled: readBoolean(value, "selectionToolbarEnabled", DEFAULT_SETTINGS.selectionToolbarEnabled),
    lassoBinding: POINTER_BINDINGS.includes(value.lassoBinding as PointerBinding) ? value.lassoBinding as PointerBinding : DEFAULT_SETTINGS.lassoBinding,
    panBinding: POINTER_BINDINGS.includes(value.panBinding as PointerBinding) ? value.panBinding as PointerBinding : DEFAULT_SETTINGS.panBinding,
    lineBinding: POINTER_BINDINGS.includes(value.lineBinding as PointerBinding) ? value.lineBinding as PointerBinding : DEFAULT_SETTINGS.lineBinding,
    toolbarItems: readToolbarItems(value.toolbarItems, value.showLassoTool, value.showConnectorTool),
    developerDiagnostics: readBoolean(value, "developerDiagnostics", DEFAULT_SETTINGS.developerDiagnostics),
    commentAuthor: typeof value.commentAuthor === "string" ? value.commentAuthor.trim().slice(0, MAX_AUTHOR_NAME) : DEFAULT_SETTINGS.commentAuthor,
    commentAuthorColors: readAuthorColors(value.commentAuthorColors),
    importQuestionAnswered: readBoolean(value, "importQuestionAnswered", DEFAULT_SETTINGS.importQuestionAnswered),
    checkUpdatesAutomatically: readBoolean(value, "checkUpdatesAutomatically", DEFAULT_SETTINGS.checkUpdatesAutomatically),
    lastUpdateCheck: typeof value.lastUpdateCheck === "number" && Number.isFinite(value.lastUpdateCheck) && value.lastUpdateCheck >= 0
      ? value.lastUpdateCheck : DEFAULT_SETTINGS.lastUpdateCheck,
    availableUpdate: readAvailableUpdate(value.availableUpdate),
    fontPacks: readFontPacks(value.fontPacks),
    customFonts: readCustomFonts(value.customFonts),
    fontList: readFontList(value.fontList),
  });
}

/** True while the first-run "Import boards from Miro?" question has not yet been put to the person. */
export function shouldAskImportQuestion(settings: Pick<MiroCanvasSettings, "importQuestionAnswered">): boolean {
  return !settings.importQuestionAnswered;
}

export type PanDirection = "left" | "right" | "up" | "down";

/** Board-space delta for one keyboard pan, before the viewport applies zoom. */
export function panDelta(
  settings: MiroCanvasSettings, direction: PanDirection, fast = false,
): { readonly x: number; readonly y: number } {
  const distance = settings.panStep * (fast ? settings.fastPanMultiplier : 1);
  switch (direction) {
    case "left": return { x: -distance, y: 0 };
    case "right": return { x: distance, y: 0 };
    case "up": return { x: 0, y: -distance };
    case "down": return { x: 0, y: distance };
  }
}

/** True when a wheel event should zoom rather than pan under these settings. */
export function wheelZooms(settings: MiroCanvasSettings, event: {
  readonly ctrlKey?: boolean; readonly metaKey?: boolean;
  readonly shiftKey?: boolean; readonly altKey?: boolean;
}): boolean {
  switch (settings.wheelZoomModifier) {
    case "none": return true;
    case "ctrl": return event.ctrlKey === true || event.metaKey === true;
    case "shift": return event.shiftKey === true;
    case "alt": return event.altKey === true;
  }
}

export interface NavigationCommandDefinition {
  readonly id: string;
  readonly name: string;
}

/** The ids of `navigationCommands()`, paired with the table key of each name. */
const NAVIGATION_COMMAND_IDS: ReadonlyArray<{
  readonly id: string;
  readonly key: keyof ReturnType<typeof words>["commands"]["navigation"];
}> = Object.freeze([
  { id: "m1-zoom-in", key: "zoomIn" },
  { id: "m1-zoom-out", key: "zoomOut" },
  { id: "m1-zoom-reset", key: "zoomReset" },
  { id: "m1-zoom-fit", key: "zoomFit" },
  { id: "m1-toggle-minimap", key: "toggleMinimap" },
  { id: "m1-pan-left", key: "panLeft" },
  { id: "m1-pan-right", key: "panRight" },
  { id: "m1-pan-up", key: "panUp" },
  { id: "m1-pan-down", key: "panDown" },
]);

/**
 * Commands are registered so Obsidian's own hotkey editor can bind them; the
 * plugin deliberately ships no default bindings to avoid taking keys from the
 * user or another plugin.  Read at registration time, after `setLocale` has
 * run, so the names come out in Obsidian's own language.
 */
export function navigationCommands(): readonly NavigationCommandDefinition[] {
  const names = words().commands.navigation;
  return NAVIGATION_COMMAND_IDS.map(({ id, key }) => ({ id, name: names[key] }));
}

/** The name shown for one pointer chord, in the language in use. */
export function pointerBindingLabel(binding: PointerBinding): string {
  const labels = words().settings.pointerBindings;
  switch (binding) {
    case "none": return labels.none;
    case "right": return labels.right;
    case "alt+left": return labels.altLeft;
    case "shift+left": return labels.shiftLeft;
    case "ctrl+left": return labels.ctrlLeft;
    case "ctrl+shift+left": return labels.ctrlShiftLeft;
    case "alt+right": return labels.altRight;
  }
}
