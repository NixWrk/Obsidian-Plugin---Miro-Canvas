/**
 * The board's creation tools, at the bottom of the view where native Canvas
 * keeps its own card menu: Miro's quick-access set of select, text, sticky
 * note, shape, connection line, comment and frame, and a "more" menu for
 * whatever a person has left off the bar.  A tool is armed by its button or
 * its letter and used once on the board; the host owns the gesture and the
 * creation.  Native Canvas's own card, note and media buttons live among
 * these too, as slots this module builds but the session fills: the real
 * button elements move in from `cardMenuEl`, carrying their own drag-to-add
 * and click behaviour with them.
 */
import { words } from "./i18n";
import { SHAPE_CATALOG, shapeCatalogEntry, shapeCatalogLabel } from "./shape-catalog";
import { shapePicture } from "./selection-toolbar";
import { LINE_KINDS, lineKind, lineLabel, type LineKindSpec } from "./free-line";
import { validHeadSize } from "./connector-style";
import { defaultPalette } from "./appearance";
import { miroStickyColors } from "./miro-palette";
import { BAR_TOOLTIP_DELAY, PICTURE_TOOLTIP_DELAY } from "./tooltips";

export const QUICK_TOOLS = [
  "select", "text", "sticky", "shape", "pen", "highlighter", "smart", "eraser", "erase-part", "lasso",
  "connector", "comment", "frame", "code", "table", "link",
] as const;
export type QuickTool = (typeof QUICK_TOOLS)[number];

/** Native Canvas's own three card-menu buttons, moved into this bar rather than built by it. */
export const NATIVE_TOOLBAR_ITEMS = ["card", "note", "media"] as const;
export type NativeToolbarItem = (typeof NATIVE_TOOLBAR_ITEMS)[number];

/**
 * Everything a person can place on the bar or leave under More: the
 * plugin's own tools that belong at this level (not the pen's own row, which
 * keeps its tools regardless) and native Canvas's three.  In the order Miro's
 * own bar lists its tools, native Canvas's between the ones closest to it.
 * The setting `toolbarItems` (settings.ts) is an ordered, de-duplicated
 * subset of this list: the bar's own content, in the order shown; whatever
 * is missing sits under More, in this list's order.
 */
export const ALL_TOOLBAR_ITEMS = [
  "select", "lasso", "text", "card", "sticky", "shape", "pen", "connector", "comment", "frame", "note", "media",
  "code", "table", "link",
] as const;
export type ToolbarItem = (typeof ALL_TOOLBAR_ITEMS)[number];

/** The bar's content before anyone has chosen otherwise: everything but code, the grid and the link. */
export const DEFAULT_TOOLBAR_ITEMS: readonly ToolbarItem[] =
  ALL_TOOLBAR_ITEMS.filter((item) => item !== "code" && item !== "table" && item !== "link");

/** True for one of native Canvas's own three buttons, as opposed to one of the plugin's own tools. */
export function isNativeToolbarItem(item: ToolbarItem): item is NativeToolbarItem {
  return (NATIVE_TOOLBAR_ITEMS as readonly string[]).includes(item);
}

/**
 * Pure edits of the bar's own content, shared by the settings list and the
 * "arrange panels" mode so both write the very same `toolbarItems` and
 * neither invents a second way to read or change it.
 */

/**
 * Puts an item at a given index on the bar, whether it was already there
 * (a reorder) or came from the tray of items under "+" (an add); either way
 * it appears exactly once, never duplicated.
 */
export function moveToolbarItem(items: readonly ToolbarItem[], item: ToolbarItem, toIndex: number): readonly ToolbarItem[] {
  const without = items.filter((existing) => existing !== item);
  const at = Math.min(Math.max(toIndex, 0), without.length);
  return Object.freeze([...without.slice(0, at), item, ...without.slice(at)]);
}

/** Takes an item off the bar; it becomes reachable under "+" again, in `ALL_TOOLBAR_ITEMS` order. */
export function removeToolbarItem(items: readonly ToolbarItem[], item: ToolbarItem): readonly ToolbarItem[] {
  return Object.freeze(items.filter((existing) => existing !== item));
}

/** Which toolbar item one of the bar's real elements stands for: its own attribute, the pen's group, or - for the shape popover - its inner button's. */
function toolbarItemOfElement(node: Element): ToolbarItem | undefined {
  const native = node.getAttribute("data-native");
  if (native !== null) return native as ToolbarItem;
  const tool = node.getAttribute("data-tool");
  if (tool !== null) return tool as ToolbarItem;
  if (node.getAttribute("data-tool-group") === "drawing") return "pen";
  const inner = node.querySelector("[data-tool]");
  return inner === null ? undefined : (inner.getAttribute("data-tool") as ToolbarItem | undefined);
}

/**
 * The bar's real elements, left to right, stopping at the "+" popover: what
 * the "arrange panels" mode reads to know where each item sits and drags to
 * reorder, remove or add one.  The settings list edits the same
 * `toolbarItems` without ever touching this DOM.
 */
export function barItemElements(bar: Element): ReadonlyArray<{ readonly item: ToolbarItem; readonly element: Element }> {
  const entries: { readonly item: ToolbarItem; readonly element: Element }[] = [];
  for (const child of Array.from(bar.children)) {
    if (child.classList.contains("miro-canvas-tools__more")) break;
    const item = toolbarItemOfElement(child);
    if (item !== undefined) entries.push({ item, element: child });
  }
  return entries;
}

interface ToolIconSpec {
  readonly tool: QuickTool;
  readonly icon: string;
  readonly glyph: string;
  /** The key that arms the tool, as Miro binds it. */
  readonly key?: string;
}

interface ToolSpec extends ToolIconSpec {
  readonly label: string;
}

/** Every plugin tool the bar or More can hold, in `ALL_TOOLBAR_ITEMS` order. */
const TOOLBAR_TOOL_ICONS: readonly ToolIconSpec[] = [
  { tool: "select", icon: "mouse-pointer-2", glyph: "↖", key: "V" },
  // Next to Select: it is a way of selecting large parts of a board.
  { tool: "lasso", icon: "lasso", glyph: "◌" },
  { tool: "text", icon: "type", glyph: "T", key: "T" },
  // A plain square: native Canvas's card button already wears the note icon.
  { tool: "sticky", icon: "square", glyph: "▢", key: "N" },
  { tool: "shape", icon: "shapes", glyph: "◇", key: "S" },
  { tool: "pen", icon: "pen", glyph: "✎", key: "P" },
  { tool: "connector", icon: "move-up-right", glyph: "↗", key: "L" },
  { tool: "comment", icon: "message-circle", glyph: "💬", key: "C" },
  { tool: "frame", icon: "frame", glyph: "#", key: "F" },
  { tool: "code", icon: "code-xml", glyph: "</>" },
  { tool: "table", icon: "table", glyph: "▦" },
  { tool: "link", icon: "link", glyph: "🔗" },
];

/** Native Canvas's own icon for each of its buttons, for the settings list only: the real button on the bar keeps its true icon regardless of this. */
const NATIVE_ITEM_ICONS: Readonly<Record<NativeToolbarItem, string>> = {
  card: "sticky-note", note: "file-text", media: "file-image",
};

function toolIconSpec(tool: QuickTool): ToolIconSpec {
  const spec = TOOLBAR_TOOL_ICONS.find((entry) => entry.tool === tool);
  if (spec === undefined) throw new Error(`no icon for tool ${tool}`);
  return spec;
}

/** A tool's name, in the language in use. */
function toolLabel(tool: QuickTool): string {
  const names = words().tools;
  const labelOf: Readonly<Record<QuickTool, string>> = {
    select: names.select, lasso: names.lasso, text: names.text, sticky: names.sticky, shape: names.shape,
    pen: names.pen, highlighter: names.highlighter, smart: names.smartDrawing, eraser: names.eraser,
    "erase-part": names.precisionEraser, connector: names.connector, comment: names.comment, frame: names.frame,
    code: names.codeBlock, table: names.grid, link: names.webLink,
  };
  return labelOf[tool];
}

/** A toolbar item's name, in the language in use: a plugin tool's own name, or native Canvas's item name for the settings list. */
export function toolbarItemLabel(item: ToolbarItem): string {
  if (isNativeToolbarItem(item)) {
    const names = words().tools;
    return item === "card" ? names.card : item === "note" ? names.note : names.media;
  }
  return toolLabel(item);
}

function withLabels(specs: readonly ToolIconSpec[]): readonly ToolSpec[] {
  return specs.map((spec) => ({ ...spec, label: toolLabel(spec.tool) }));
}

/**
 * Paints one toolbar item's icon into an element the caller owns, for the
 * settings list: the plugin's own drawing for the sticky note (so it never
 * looks like native Canvas's card there either), a plugin icon name for the
 * rest, and native Canvas's own icon name for its three, purely as a
 * reference - the real button on the bar always keeps its own true icon.
 * Falls back to a glyph where nothing can be drawn, as in tests.
 */
export function paintToolbarIcon(
  target: HTMLElement, item: ToolbarItem, document: Document, setIcon?: (element: HTMLElement, icon: string) => void,
): void {
  if (item === "shape") {
    const picture = shapesPicture(document);
    if (picture !== undefined) {
      target.appendChild(picture);
      return;
    }
  }
  const icon = isNativeToolbarItem(item) ? NATIVE_ITEM_ICONS[item] : toolIconSpec(item).icon;
  const glyph = isNativeToolbarItem(item) ? "▢" : toolIconSpec(item).glyph;
  if (setIcon !== undefined) {
    try {
      setIcon(target, icon);
      return;
    } catch {
      // Falls through to the glyph.
    }
  }
  target.textContent = glyph;
}

export interface QuickToolsState {
  readonly connectorColor?: string;
  readonly connectorWidth?: number;
  readonly connectorHeadSize?: number;
  /** False in review mode: nothing can be made. */
  readonly editable: boolean;
  readonly armed: QuickTool;
  /** The shape the shape tool makes. */
  readonly shape: string;
  /** What the pen draws with. */
  readonly penColor: string;
  readonly penWidth: number;
  /** How wide the erasers are, in screen pixels. */
  readonly eraserSize: number;
}

export interface QuickToolsActions {
  readonly onConnector?: (settings: {color?:string;width?:number;headSize?:number}) => void;
  readonly onArm: (tool: QuickTool) => void;
  readonly onShape: (shape: string) => void;
  readonly onPen: (settings: { readonly color?: string; readonly width?: number; readonly eraserSize?: number }) => void;
}

/** What Miro keeps in a pen preset: its own colours and three thicknesses. */
export const PEN_COLORS = ["#1a1a1a", "#ffffff", "#f24726", "#ff9d48", "#ffd02f", "#67c6a0", "#2d9bf0", "#9b51e0"] as const;

/** A swatch's name, from a palette that already names it; the hex code otherwise. */
function colorSwatchLabel(color: string): string {
  const named = [...defaultPalette(), ...miroStickyColors()].find((entry) => entry.color.toLowerCase() === color.toLowerCase());
  return named?.label ?? color;
}
/** The ranges the size slider covers: a line's width, an eraser's in pixels. */
export const PEN_WIDTH_RANGE = { min: 1, max: 60 } as const;
export const ERASER_SIZE_RANGE = { min: 8, max: 200 } as const;

const DRAWING_TOOL_ICONS: readonly ToolIconSpec[] = [
  { tool: "pen", icon: "pen", glyph: "✎" },
  { tool: "highlighter", icon: "highlighter", glyph: "▨" },
  { tool: "smart", icon: "wand-2", glyph: "✧" },
  { tool: "eraser", icon: "eraser", glyph: "⌫" },
  { tool: "erase-part", icon: "scissors", glyph: "✁" },
];

/** The pen's own row of tools, with their names in the language in use. */
function drawingTools(): readonly ToolSpec[] {
  return withLabels(DRAWING_TOOL_ICONS);
}

/** A line kind's picture: its course, and a block arrow filled. */
function linePicture(document: Document, spec: LineKindSpec): SVGSVGElement | undefined {
  if (typeof document.createElementNS !== "function") return undefined;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "miro-canvas-shape-icon miro-canvas-shape-icon--square miro-canvas-line-icon");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", spec.icon);
  if (spec.block === true) path.setAttribute("fill", "currentColor");
  svg.appendChild(path);
  return svg;
}

/**
 * The shape tool's picture, as Miro draws it: a square and a circle
 * overlapping, in the line style of the other icons.  It stays the same
 * whichever shape is chosen; the chosen one is marked in its menu.
 */
function shapesPicture(document: Document): SVGSVGElement | undefined {
  if (typeof document.createElementNS !== "function") return undefined;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "svg-icon miro-canvas-shapes-icon");
  svg.setAttribute("aria-hidden", "true");
  const square = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  for (const [name, value] of [["x", "3"], ["y", "3"], ["width", "11"], ["height", "11"], ["rx", "1.5"]]) square.setAttribute(name, value);
  svg.appendChild(square);
  const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  for (const [name, value] of [["cx", "15.5"], ["cy", "15.5"], ["r", "5.5"]]) circle.setAttribute(name, value);
  svg.appendChild(circle);
  return svg;
}

/** The largest sample the pen's row draws; a larger size is shown at this. */
const MAX_PREVIEW = 28;

/** Whether a tool is one of the pen's, which keep their panel open while armed. */
export function isDrawingTool(tool: QuickTool): boolean {
  return DRAWING_TOOL_ICONS.some((spec) => spec.tool === tool);
}

function isEraser(tool: QuickTool): boolean {
  return tool === "eraser" || tool === "erase-part";
}

export interface QuickToolsOptions {
  readonly document?: Document;
  readonly setIcon?: (element: HTMLElement, icon: string) => void;
  /** The bar's own content, in order; whatever is missing sits under More. Defaults to `DEFAULT_TOOLBAR_ITEMS`. */
  readonly toolbarItems?: readonly ToolbarItem[];
}

/** The letter each tool answers to, whatever the bar holds: letters arm a tool whether it sits on the bar or under More. */
export const QUICK_TOOL_KEYS: ReadonlyMap<string, QuickTool> = new Map(
  TOOLBAR_TOOL_ICONS.filter((spec) => spec.key !== undefined).map((spec) => [spec.key!, spec.tool]),
);

export class QuickTools {
  public readonly element: HTMLElement;
  /** The bar's own row of items, up to the "+" popover - what the arrange mode drags to reorder, remove or add. */
  public itemsRow!: HTMLElement;
  private readonly document: Document;
  /** Where the session puts native Canvas's own card, note and media buttons, by which one it is. */
  private readonly nativeSlots = new Map<NativeToolbarItem, HTMLElement>();
  private readonly buttons = new Map<QuickTool, HTMLButtonElement>();
  private readonly shapeButtons = new Map<string, HTMLButtonElement>();
  private readonly penColors = new Map<string, HTMLButtonElement>();
  private readonly penColor: HTMLInputElement;
  private penButton: HTMLButtonElement | undefined;
  /** The pen's own row, open for as long as one of its tools is armed. */
  private drawingBar: HTMLElement | undefined;
  private colorRow: HTMLElement | undefined;
  private sizeInput: HTMLInputElement | undefined;
  private sizeNumber: HTMLInputElement | undefined;
  private sizePreview: HTMLElement | undefined;
  private armed: QuickTool = "select";
  /** The drawing tool the pen button goes back to. */
  private drawingTool: QuickTool = "pen";
  private readonly panels: { readonly button: HTMLButtonElement; readonly panel: HTMLElement }[] = [];
  private readonly listeners: (() => void)[] = [];
  private shownShape = "";
  private connectorBar: HTMLElement;
  private connectorColor: HTMLInputElement;
  private connectorWidth: HTMLInputElement;
  private connectorHeadSize: HTMLInputElement;
  private connectorRange: HTMLInputElement;
  private connectorPreview: HTMLElement;
  private readonly connectorColors=new Map<string,HTMLButtonElement>();

  public constructor(private readonly actions: QuickToolsActions, private readonly options: QuickToolsOptions = {}) {
    const document = options.document ?? globalThis.document;
    this.document = document;
    const root = this.make("div", "miro-canvas-toolbar miro-canvas-tools");
    this.connectorBar = root.appendChild(this.make("div", "miro-canvas-toolbar__bar miro-canvas-tools__connectors"));
    this.connectorBar.hidden = true;
    for(const line of [...LINE_KINDS].sort((a,b)=>Number(!!b.endCap||!!b.block)-Number(!!a.endCap||!!a.block))) {
      const button=this.connectorBar.appendChild(this.make("button","miro-canvas-toolbar__button"));
      button.type="button";button.setAttribute("aria-label",lineLabel(line.kind));button.setAttribute("data-shape",line.kind);
      const picture=linePicture(document,line);if(picture)button.appendChild(picture);else button.textContent=line.kind;
      this.shapeButtons.set(line.kind,button);
      this.listen(button,"click",()=>{this.actions.onShape(line.kind);this.actions.onArm("connector");this.closePanels();});
    }
    const connectorColors=this.connectorBar.appendChild(this.make("span","miro-canvas-tools__swatches"));
    for(const color of PEN_COLORS){
      const option=connectorColors.appendChild(this.make("button","miro-canvas-toolbar__button miro-canvas-toolbar__button--swatch"));
      option.type="button";option.setAttribute("aria-label",colorSwatchLabel(color));option.setAttribute("data-connector-color",color);
      option.setAttribute("data-tooltip-delay",PICTURE_TOOLTIP_DELAY);option.style?.setProperty?.("--miro-canvas-swatch",color);
      this.listen(option,"click",()=>this.actions.onConnector?.({color}));this.connectorColors.set(color,option);
    }
    this.connectorColor=connectorColors.appendChild(this.make("input","miro-canvas-toolbar__swatch"));
    this.connectorColor.type="color";this.connectorColor.setAttribute("aria-label",words().tools.newConnectorColor);
    this.listen(this.connectorColor,"input",()=>this.actions.onConnector?.({color:this.connectorColor.value}));
    const connectorSize=this.connectorBar.appendChild(this.make("span","miro-canvas-tools__size"));
    this.connectorPreview=connectorSize.appendChild(this.make("span","miro-canvas-tools__preview"));
    this.connectorPreview.setAttribute("aria-hidden","true");this.connectorPreview.setAttribute("data-kind","pen");
    this.connectorRange=connectorSize.appendChild(this.make("input","miro-canvas-toolbar__range"));
    this.connectorRange.type="range";this.connectorRange.min="1";this.connectorRange.max=String(PEN_WIDTH_RANGE.max);this.connectorRange.step="1";
    this.connectorRange.setAttribute("aria-label",words().tools.newConnectorWidthSlider);
    this.listen(this.connectorRange,"input",()=>this.actions.onConnector?.({width:Number(this.connectorRange.value)}));
    this.connectorWidth=connectorSize.appendChild(this.make("input","miro-canvas-toolbar__number miro-canvas-tools__number"));
    this.connectorWidth.type="number";this.connectorWidth.min="1";this.connectorWidth.max="1000";this.connectorWidth.setAttribute("aria-label",words().tools.newConnectorWidth);
    this.listen(this.connectorWidth,"change",()=>{const width=Number(this.connectorWidth.value);if(Number.isFinite(width)&&width>=1&&width<=1000)this.actions.onConnector?.({width});});
    this.connectorHeadSize=connectorSize.appendChild(this.make("input","miro-canvas-toolbar__number miro-canvas-tools__number"));
    this.connectorHeadSize.type="number";this.connectorHeadSize.min="1";this.connectorHeadSize.max="1000";this.connectorHeadSize.step="any";
    this.connectorHeadSize.placeholder=words().toolbar.auto;this.connectorHeadSize.setAttribute("aria-label",words().tools.newConnectorHeadSize);
    this.connectorHeadSize.title=words().tools.arrowheadSizeHint;
    this.listen(this.connectorHeadSize,"change",()=>{
      const headSize=Number(this.connectorHeadSize.value);
      if(!this.connectorHeadSize.disabled && validHeadSize(headSize))this.actions.onConnector?.({headSize});
    });
    root.setAttribute("role", "toolbar");
    root.setAttribute("aria-label", words().tools.ariaLabel);
    // Miro keeps the pen, the highlighter, smart drawing, the erasers and the
    // colour and size of the line in a row of their own, which stays open
    // while any of them is in use, so a colour or a size is one press away.
    const drawingBar = root.appendChild(this.make("div", "miro-canvas-toolbar__bar miro-canvas-tools__drawing"));
    drawingBar.hidden = true;
    for (const drawing of drawingTools()) drawingBar.appendChild(this.toolButton(drawing));
    const colors = drawingBar.appendChild(this.make("span", "miro-canvas-tools__swatches"));
    for (const color of PEN_COLORS) {
      const option = colors.appendChild(this.make("button", "miro-canvas-toolbar__button miro-canvas-toolbar__button--swatch"));
      option.type = "button";
      option.setAttribute("aria-label", colorSwatchLabel(color));
      option.setAttribute("data-tooltip-delay", PICTURE_TOOLTIP_DELAY);
      option.setAttribute("data-pen-color", color);
      option.style?.setProperty?.("--miro-canvas-swatch", color);
      this.listen(option, "click", () => this.actions.onPen({ color }));
      this.penColors.set(color, option);
    }
    this.penColor = colors.appendChild(this.make("input", "miro-canvas-toolbar__swatch"));
    this.penColor.type = "color";
    this.penColor.setAttribute("aria-label", words().tools.newDrawingColor);
    this.listen(this.penColor, "input", () => this.actions.onPen({color: this.penColor.value}));
    // The size: a sample of it, a slider that acts as it moves, and the exact
    // number, which can be typed.
    const size = drawingBar.appendChild(this.make("span", "miro-canvas-tools__size"));
    const sizePreview = size.appendChild(this.make("span", "miro-canvas-tools__preview"));
    sizePreview.setAttribute("aria-hidden", "true");
    const sizeInput = size.appendChild(this.make("input", "miro-canvas-toolbar__range"));
    sizeInput.type = "range";
    sizeInput.step = "1";
    sizeInput.setAttribute("aria-label", words().tools.lineWidth);
    const sizeNumber = size.appendChild(this.make("input", "miro-canvas-toolbar__number miro-canvas-tools__number"));
    sizeNumber.type = "number";
    sizeNumber.step = "1";
    sizeNumber.setAttribute("aria-label", words().tools.lineWidthPoints);
    const apply = (raw: string): void => {
      const range = isEraser(this.armed) ? ERASER_SIZE_RANGE : PEN_WIDTH_RANGE;
      const value = Number(raw);
      if (!Number.isFinite(value) || raw.trim() === "") return;
      const clamped = Math.min(Math.max(Math.round(value), range.min), range.max);
      this.actions.onPen(isEraser(this.armed) ? { eraserSize: clamped } : { width: clamped });
    };
    this.listen(sizeInput, "input", () => apply(sizeInput.value));
    // A typed number counts once it is complete: on Enter or on leaving the field.
    this.listen(sizeNumber, "change", () => apply(sizeNumber.value));
    this.listen(sizeNumber, "keydown", (event) => {
      if ((event as KeyboardEvent).key === "Enter") apply(sizeNumber.value);
      // The board's own letters must not fire while a number is typed.
      event.stopPropagation();
    });
    this.drawingBar = drawingBar;
    this.colorRow = colors;
    this.sizeInput = sizeInput;
    this.sizeNumber = sizeNumber;
    this.sizePreview = sizePreview;
    const bar = root.appendChild(this.make("div", "miro-canvas-toolbar__bar"));
    this.itemsRow = bar;
    const configured = this.options.toolbarItems ?? DEFAULT_TOOLBAR_ITEMS;
    const onBar = new Set<ToolbarItem>(configured);
    for (const item of configured) this.placeToolbarItem(bar, item, false);
    const moreHost = bar.appendChild(this.make("span", "miro-canvas-toolbar__popover miro-canvas-tools__more"));
    const more = moreHost.appendChild(this.iconButton(words().tools.more, "plus", "+"));
    const morePanel = moreHost.appendChild(this.panel(more, "miro-canvas-tools__menu"));
    for (const item of ALL_TOOLBAR_ITEMS) {
      if (!onBar.has(item)) this.placeToolbarItem(morePanel, item, true);
    }
    // The board must not start a drag or a selection under the bar.
    this.listen(root, "pointerdown", (event) => event.stopPropagation());
    this.listen(root, "keydown", (event) => {
      if ((event as KeyboardEvent).key === "Escape") this.closePanels();
    });
    this.element = root;
  }

  public update(state: QuickToolsState): void {
    if (state.armed !== this.armed) this.closePanels();
    this.connectorBar.hidden = state.armed !== "connector" || !state.editable;
    this.connectorColor.value = state.connectorColor ?? "#1a1a1a";
    this.connectorHeadSize.disabled = !state.editable;
    if(this.document.activeElement!==this.connectorHeadSize)this.connectorHeadSize.value=state.connectorHeadSize===undefined?"":String(state.connectorHeadSize);
    this.penColor.value = state.penColor;
    this.penColor.disabled = !state.editable;
    for(const [color,button] of this.connectorColors)button.setAttribute("aria-pressed",color===this.connectorColor.value?"true":"false");
    if(this.document.activeElement!==this.connectorRange)this.connectorRange.value=String(state.connectorWidth??2);
    this.connectorPreview.style?.setProperty?.("--miro-canvas-preview-size",`${Math.min(state.connectorWidth??2,MAX_PREVIEW)}px`);
    this.connectorPreview.style?.setProperty?.("--miro-canvas-preview-color",this.connectorColor.value);
    if(this.document.activeElement!==this.connectorWidth)this.connectorWidth.value=String(state.connectorWidth??2);
    this.element.setAttribute("data-miro-canvas-editable", state.editable ? "true" : "false");
    for (const [tool, button] of this.buttons) {
      button.setAttribute("aria-pressed", tool === state.armed ? "true" : "false");
      // Selecting changes nothing, so review mode keeps Select and the lasso.
      button.disabled = tool !== "select" && tool !== "lasso" && !state.editable;
    }
    for (const [kind, button] of this.shapeButtons) {
      button.setAttribute("aria-pressed", kind === state.shape ? "true" : "false");
    }
    for (const [color, button] of this.penColors) {
      button.setAttribute("aria-pressed", color === state.penColor ? "true" : "false");
    }
    // The pen button carries the colour it draws with, and stays marked while
    // any of the drawing tools is the armed one; so does the pen's row.
    this.armed = state.armed;
    const drawing = isDrawingTool(state.armed);
    if (drawing) this.drawingTool = state.armed;
    this.penButton?.style?.setProperty?.("--miro-canvas-swatch", state.penColor);
    this.penButton?.setAttribute("aria-pressed", drawing ? "true" : "false");
    if (this.drawingBar !== undefined) this.drawingBar.hidden = !drawing || !state.editable;
    // An eraser has a size but no colour; a line has both.
    const erasing = isEraser(state.armed);
    if (this.colorRow !== undefined) this.colorRow.hidden = erasing;
    if (this.sizeInput !== undefined && this.sizeNumber !== undefined) {
      const range = erasing ? ERASER_SIZE_RANGE : PEN_WIDTH_RANGE;
      const value = erasing ? state.eraserSize : state.penWidth;
      for (const input of [this.sizeInput, this.sizeNumber]) {
        input.min = String(range.min);
        input.max = String(range.max);
        if (input.value !== String(value) && this.document.activeElement !== input) input.value = String(value);
      }
      this.sizeInput.setAttribute("aria-label", erasing ? words().tools.eraserSize : words().tools.lineWidth);
      this.sizeNumber.setAttribute("aria-label", erasing ? words().tools.eraserSizePixels : words().tools.lineWidthPoints);
    }
    if (this.sizePreview !== undefined) {
      // The sample is drawn at its true size up to the room the row has.
      const value = erasing ? state.eraserSize : state.penWidth;
      const shown = Math.min(Math.max(value, 2), MAX_PREVIEW);
      this.sizePreview.setAttribute("data-kind", erasing ? "eraser" : "pen");
      this.sizePreview.setAttribute("data-clipped", value > MAX_PREVIEW ? "true" : "false");
      this.sizePreview.style?.setProperty?.("--miro-canvas-preview-size", `${shown}px`);
      this.sizePreview.style?.setProperty?.("--miro-canvas-preview-color", state.penColor);
    }
    const entry = shapeCatalogEntry(state.shape);
    const line = lineKind(state.shape);
    if ((entry !== undefined || line !== undefined) && this.shownShape !== state.shape) {
      // The lines button shows the line it will draw; the shape button keeps
      // Miro's picture of shapes whichever shape is chosen - the chosen one
      // is marked in its menu.
      const lineButton = this.buttons.get("connector");
      const picture = line !== undefined ? linePicture(this.document, line) : undefined;
      if (lineButton !== undefined && picture !== undefined) {
        while (lineButton.firstChild !== null) lineButton.removeChild(lineButton.firstChild);
        lineButton.appendChild(picture);
      }
      this.shownShape = state.shape;
    }
    if (!state.editable) this.closePanels();
  }

  /**
   * Closes every open popover, except one a `keepOpen` button sits inside -
   * so opening a nested popover (the shape picker, moved under More) does
   * not hide the More menu that holds its own button.
   */
  public closePanels(keepOpen?: HTMLButtonElement): void {
    for (const { button, panel } of this.panels) {
      if (keepOpen !== undefined && panel.contains(keepOpen)) continue;
      panel.hidden = true;
      button.setAttribute("aria-expanded", "false");
    }
  }

  public dispose(): void {
    for (const remove of this.listeners.splice(0)) remove();
    this.element.remove();
  }

  /** Where the session puts one of native Canvas's own card, note or media buttons, wherever it currently sits. */
  public nativeSlot(item: NativeToolbarItem): HTMLElement | undefined {
    return this.nativeSlots.get(item);
  }

  /** Moves one of native Canvas's own buttons - the element itself, never a copy - into its configured place. */
  public placeNativeButton(item: NativeToolbarItem, button: HTMLElement): void {
    this.nativeSlots.get(item)?.prepend(button);
  }

  /** One item of the bar or More: a native slot the session fills, or one of the plugin's own tools. */
  private placeToolbarItem(host: HTMLElement, item: ToolbarItem, withLabel: boolean): void {
    if (isNativeToolbarItem(item)) {
      const slot = host.appendChild(this.make("span", `miro-canvas-toolbar__native-slot${withLabel ? " miro-canvas-tools__native" : ""}`));
      slot.setAttribute("data-native", item);
      if (withLabel) {
        slot.appendChild(this.make("span", "miro-canvas-tools__item-label", toolbarItemLabel(item)));
        this.listen(slot, "click", () => this.closePanels());
      }
      this.nativeSlots.set(item, slot);
      return;
    }
    const spec: ToolSpec = { ...toolIconSpec(item), label: toolLabel(item) };
    if (item === "shape") {
      this.placeShapeButton(host, spec, withLabel);
      return;
    }
    if (item === "pen") {
      this.placePenButton(host, spec, withLabel);
      return;
    }
    const button = host.appendChild(this.toolButton(spec, withLabel));
    if (withLabel) this.listen(button, "click", () => this.closePanels());
  }

  /** The shape tool: a button that opens a picker of lines, basic shapes and flowchart symbols. */
  private placeShapeButton(host: HTMLElement, spec: ToolSpec, withLabel: boolean): void {
    const shapeHost = host.appendChild(this.make("span", "miro-canvas-toolbar__popover"));
    const button = shapeHost.appendChild(this.toolButton(spec, withLabel));
    const picture = shapesPicture(this.document);
    if (picture !== undefined) {
      button.querySelector?.("svg")?.remove();
      button.prepend(picture);
    }
    const panel = shapeHost.appendChild(this.panel(button, "miro-canvas-toolbar__panel--shapes", () => {
      if (lineKind(this.shownShape)) this.actions.onShape("rectangle");
      this.actions.onArm("shape");
    }));
    // Lines first, as Miro lists them, then the basic shapes and the
    // flowchart's own symbols.
    const option = (grid: HTMLElement, kind: string, label: string, picture: Element | undefined, glyph: string): void => {
      const choice = grid.appendChild(this.make("button", "miro-canvas-toolbar__button miro-canvas-toolbar__button--picture"));
      choice.type = "button";
      choice.setAttribute("aria-label", label);
      choice.setAttribute("data-tooltip-delay", PICTURE_TOOLTIP_DELAY);
      choice.setAttribute("data-shape", kind);
      if (picture !== undefined) choice.appendChild(picture);
      else choice.textContent = glyph;
      this.listen(choice, "click", () => {
        this.closePanels();
        this.actions.onShape(kind);
        this.actions.onArm(lineKind(kind) ? "connector" : "shape");
      });
      this.shapeButtons.set(kind, choice);
    };
    const section = (title: string): HTMLElement => {
      panel.appendChild(this.make("div", "miro-canvas-toolbar__heading", title));
      return panel.appendChild(this.make("div", "miro-canvas-toolbar__pictures miro-canvas-toolbar__pictures--shapes"));
    };
    for (const [part, title] of [["basic", words().toolbar.basic], ["flowchart", words().toolbar.flowchart]] as const) {
      const grid = section(title);
      for (const entry of SHAPE_CATALOG.filter((item) => item.section === part)) {
        option(grid, entry.kind, shapeCatalogLabel(entry), shapePicture(this.document, entry), entry.name);
      }
    }
  }

  /** The pen: wears the colour it will draw with and arms whichever drawing tool was last used, which opens the pen's row. */
  private placePenButton(host: HTMLElement, spec: ToolSpec, withLabel: boolean): void {
    const button = host.appendChild(this.iconButton(`${spec.label}\n${spec.key}`, spec.icon, spec.glyph));
    button.setAttribute("data-tool-group", "drawing");
    if (withLabel) {
      button.classList.add("miro-canvas-tools__item");
      button.appendChild(this.make("span", "miro-canvas-tools__item-label", spec.label));
    }
    this.listen(button, "click", () => {
      this.actions.onArm(this.drawingTool);
      if (withLabel) this.closePanels();
    });
    this.penButton = button;
  }

  private toolButton(spec: ToolSpec, withLabel = false): HTMLButtonElement {
    const label = spec.key === undefined ? spec.label : `${spec.label}\n${spec.key}`;
    const button = this.iconButton(label, spec.icon, spec.glyph);
    button.setAttribute("data-tool", spec.tool);
    button.setAttribute("aria-pressed", "false");
    if (withLabel) {
      button.classList.add("miro-canvas-tools__item");
      button.appendChild(this.make("span", "miro-canvas-tools__item-label", spec.label));
    }
    if (spec.tool !== "shape") this.listen(button, "click", () => this.actions.onArm(spec.tool));
    this.buttons.set(spec.tool, button);
    return button;
  }

  private iconButton(label: string, icon: string, glyph: string): HTMLButtonElement {
    const button = this.make("button", "miro-canvas-toolbar__button");
    button.type = "button";
    button.setAttribute("aria-label", label);
    button.setAttribute("data-tooltip-position", "top");
    button.setAttribute("data-tooltip-delay", BAR_TOOLTIP_DELAY);
    let drawn = false;
    if (this.options.setIcon !== undefined) {
      try {
        this.options.setIcon(button, icon);
        drawn = true;
      } catch {
        drawn = false;
      }
    }
    if (!drawn) button.textContent = glyph;
    return button;
  }

  /** A menu that opens above its button; one at a time. */
  private panel(button: HTMLButtonElement, className: string, onOpen?: () => void): HTMLElement {
    const panel = this.make("div", `miro-canvas-toolbar__panel ${className}`);
    panel.hidden = true;
    button.setAttribute("aria-haspopup", "true");
    button.setAttribute("aria-expanded", "false");
    this.listen(button, "click", () => {
      const open = panel.hidden;
      if (open) onOpen?.();
      // Keep an ancestor open: this button may be a shape picker moved under
      // More, nested inside the very panel this closes everything else in.
      this.closePanels(button);
      if (!open) return;
      panel.hidden = false;
      button.setAttribute("aria-expanded", "true");
    });
    this.panels.push({ button, panel });
    return panel;
  }

  private make<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
    const element = this.document.createElement(tag);
    element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  private listen(target: EventTarget, type: string, handler: EventListener): void {
    target.addEventListener(type, handler);
    this.listeners.push(() => target.removeEventListener(type, handler));
  }
}
