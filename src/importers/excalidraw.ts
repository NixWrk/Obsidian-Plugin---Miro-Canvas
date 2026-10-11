/**
 * An Excalidraw drawing, a plain .excalidraw file or the Excalidraw plugin's
 * .excalidraw.md note, as a board: shapes as shape cards, text as text,
 * arrows and lines as lines, pen strokes as drawings, frames as frames and
 * pictures as file cards.
 *
 * The geometry is Excalidraw's own, one board unit to one drawing unit.  An
 * element's `x` and `y` are its top-left corner before it is turned; `angle`
 * turns it clockwise, in radians, about the middle of that box.  The points
 * of a line, an arrow or a pen stroke are measured from `x` and `y`, and the
 * turn goes about the middle of the box the points span.  A card keeps the
 * turn as its rotation; a line or a stroke has it worked into its points.
 *
 * An arrow bound to a shape (`startBinding` / `endBinding`, whose
 * `elementId` names the shape) holds on to that shape's card where its end
 * lies, measured in the shape's own unturned box - the same share of width
 * and height Excalidraw's `fixedPoint` gives.  The end's position is read,
 * not `fixedPoint` itself: in the newer "orbit" binding `fixedPoint` names
 * the point the arrow aims at, not where it ends.  An end bound to nothing
 * on the board stays where it is, on the board.
 *
 * Text inside a shape or on an arrow (`containerId` on the text) becomes the
 * card's text or the line's label; the Excalidraw plugin's raw Markdown from
 * `## Text Elements` wins over the scene's own text, so wikilinks survive.
 *
 * Every element either comes over, bound to its card or line, or is an entry
 * of the report (LIMIT-001); a visual element that cannot come over leaves
 * a placeholder card where it was.  What the board cannot draw at all -
 * hand-drawn roughness, hatching, transparency, cropping, the
 * background colour - is reported once per kind, not once per element.
 * Excalidraw's bookkeeping (`seed`, `version`, `versionNonce`, `index`,
 * `updated`, `boundElements`, `lastCommittedPoint`, `status`) is not kept.
 * Pressure samples become per-point widths, but the freehand outline and
 * simulated pressure remain approximations. Image flips, explicit frame
 * membership/clipping and non-empty custom data are reported as losses.
 * Groups become transparent spatial frames with explicit approximation
 * entries: native containment may capture unrelated cards. Groups without
 * any card remain unsupported. Scene array order is authoritative;
 * fractional indices are not re-sorted.
 *
 * Pure: the source text is only read, and the vault is reached only
 * through `ImportContext.resolveLink`.
 */

import type { CanvasAnchor } from "../anchors";
import { isValidFontSize, isValidLineHeight } from "../appearance";
import { MAX_WAYPOINTS } from "../connector-route";
import { defaultPenInk, simplifyPoints, strokeBounds, type StrokePoint } from "../drawing";
import { MAX_STROKE_POINTS, readLocalStroke, type LocalStroke } from "../local-items";
import { ImportAssets } from "./assets";
import { BoardBuilder, type BoardRect, type ImportedCardStyle, type SourceElement } from "./board-builder";
import { readExcalidrawFile, type ExcalidrawFile, type ExcalidrawReadErrorCode } from "./excalidraw-file";
import {
	ImportError,
	MAX_IMPORT_ELEMENTS,
	MAX_IMPORT_SOURCE_LENGTH,
	type FormatAdapter,
	type ImportContext,
	type ImportEntryStatus,
	type ImportReason,
	type ImportResult,
	type ImportSource,
} from "./types";

type ElementRecord = Readonly<Record<string, unknown>>;

/** One live element of the drawing, checked enough to be placed. */
interface DrawingElement {
	readonly id: string;
	readonly type: string;
	readonly data: ElementRecord;
}

/** Where an element's card went, for the arrows that hold on to it. */
interface PlacedCard {
	readonly nodeId: string;
	/** The element's own box before it is turned, in board units. */
	readonly rect: BoardRect;
	/** Radians, clockwise, about the middle of `rect`. */
	readonly angle: number;
}

/** A colour as Excalidraw writes it, read into what a board can hold. */
type ReadColor =
	| { readonly kind: "transparent" }
	| { readonly kind: "hex"; readonly hex: string; readonly opaqueHex: string; readonly alpha: number };

/** The note property the Excalidraw plugin marks its drawings with. */
const PLUGIN_PROPERTY = "excalidraw-plugin";

/** Why a drawing file could not be read at all, in the report's words. */
const READ_ERROR_REASONS: Readonly<Record<ExcalidrawReadErrorCode, ImportReason>> = {
	"no-drawing": "unknownStructure",
	"decompress-failed": "unreadableData",
	"invalid-json": "unreadableData",
	"not-a-scene": "unknownStructure",
};

const SHAPE_TYPES = new Set(["rectangle", "ellipse", "diamond"]);
const LINE_TYPES = new Set(["arrow", "line"]);
const FRAME_TYPES = new Set(["frame", "magicframe"]);
/** What text can sit inside: a shape's text, or an arrow's or a line's label. */
const CONTAINER_TYPES = new Set([...SHAPE_TYPES, ...LINE_TYPES]);
/** The elements Excalidraw draws with a rough, hand-drawn outline. */
const ROUGH_TYPES = new Set([...SHAPE_TYPES, ...LINE_TYPES]);
/**
 * The elements whose fill may be hatched and whose card keeps the fill's
 * colour.  A closed line or pen stroke is filled too, but its fill does not
 * come over at all (`lineFill`), hatched or not.
 */
const FILLED_TYPES = new Set([...SHAPE_TYPES]);
/** The elements Excalidraw fills only when their course closes on itself. */
const LOOP_FILLED_TYPES = new Set(["line", "freedraw"]);
/**
 * How near a course's last point must come to its first for Excalidraw to
 * call it closed and fill it: its `LINE_CONFIRM_THRESHOLD`, at full zoom.
 */
const LOOP_CLOSE_DISTANCE = 8;

/** Excalidraw's fonts by number, named as the Excalidraw font pack names them. */
const FONT_FAMILIES: Readonly<Record<number, string>> = {
	1: "Virgil",
	2: "Helvetica",
	3: "Cascadia Code",
	5: "Excalifont",
	6: "Nunito",
	7: "Lilita One",
	8: "Comic Shanns",
	9: "Liberation Sans",
	10: "Assistant",
};

/** Excalidraw's arrowheads as the board's line ends; `exact: false` when the nearest one is drawn instead. */
const ARROWHEADS: Readonly<Record<string, { readonly cap: string; readonly exact: boolean }>> = {
	arrow: { cap: "arrow", exact: true },
	triangle: { cap: "filled_triangle", exact: true },
	triangle_outline: { cap: "triangle", exact: true },
	// Round ends are the board's ovals: the ends a native edge draws as well
	// as a free line (`circle` / `filled_circle` are drawn on free lines only).
	dot: { cap: "filled_oval", exact: true },
	circle: { cap: "filled_oval", exact: true },
	circle_outline: { cap: "oval", exact: true },
	diamond: { cap: "filled_diamond", exact: true },
	diamond_outline: { cap: "diamond", exact: true },
	crowfoot_one: { cap: "erd_one", exact: true },
	crowfoot_many: { cap: "erd_many", exact: true },
	crowfoot_one_or_many: { cap: "erd_one_or_many", exact: true },
	// A bar across the end: the "exactly one" mark is the nearest end a line has.
	bar: { cap: "erd_one", exact: false },
};
/** An arrowhead this importer does not know: drawn as a plain arrow. */
const UNKNOWN_ARROWHEAD = { cap: "arrow", exact: false } as const;

/**
 * How long Excalidraw draws each arrowhead, in drawing units, whatever the
 * line's width (its `getArrowheadSize`).  The board would otherwise size an
 * end from the line's width, and a thin Excalidraw arrow would end in a
 * head too small to see.
 */
const ARROWHEAD_SIZES: Readonly<Record<string, number>> = {
	arrow: 25,
	diamond: 12,
	diamond_outline: 12,
	crowfoot_one: 20,
	crowfoot_many: 20,
	crowfoot_one_or_many: 20,
};
/** Every other arrowhead Excalidraw draws: triangles, dots, circles, the bar. */
const DEFAULT_ARROWHEAD_SIZE = 15;

/**
 * How wide a pen stroke is drawn for each unit of Excalidraw's stroke width:
 * Excalidraw hands `4.25 * strokeWidth` to its freehand outline as the
 * stroke's size.
 */
const FREEDRAW_SIZE_PER_WIDTH = 4.25;
/** Published outline parameters, not an imported freehand renderer. */
const FREEDRAW_THINNING = 0.6;
const CONSTANT_FREEDRAW_SIZE_PER_WIDTH = 1.4;
/**
 * Excalidraw's default ink, today's and the plain black of older drawings.
 * Excalidraw turns it light on a dark canvas; kept as it is, text and
 * outlines in it would all but vanish on a dark board.  A card's text and
 * outline and a line in this ink take the board's own colours instead,
 * which read on light and dark boards alike.  A pen stroke must name a
 * colour: it takes the one the board's own pen draws with by default.
 */
const DEFAULT_INKS = new Set(["#1e1e1e", "#000000"]);
/** The longest label a line keeps. */
const MAX_LABEL_LENGTH = 1024;
/** A web address, or any other link with a scheme (`https:`, `obsidian:`), as opposed to a vault link. */
const URL_START = /^[a-z][a-z0-9+.-]*:/iu;
/** Excalidraw's default background, which a board needs no word about. */
const PLAIN_BACKGROUNDS = new Set(["#ffffff", "#fff", "transparent"]);

/**
 * What the board cannot draw, reported once per kind, in this order: the
 * reason and the Excalidraw field that carries it.
 */
const LOST_STYLES: readonly (readonly [ImportReason, string])[] = [
	["roughness", "roughness"],
	["hatch", "fillStyle"],
	["groups", "groupIds"],
	["opacity", "opacity"],
	["imageCrop", "crop"],
	["background", "viewBackgroundColor"],
];

export const excalidrawAdapter: FormatAdapter = {
	id: "excalidraw",
	detect: detectExcalidraw,
	convert: convertExcalidraw,
};

/** A plain `.excalidraw` file, or a note the Excalidraw plugin marked as its own. */
export function detectExcalidraw(source: ImportSource): boolean {
	const extension = source.extension.toLowerCase();
	if (extension === "excalidraw") return true;
	if (extension !== "md") return false;
	const frontmatter = source.frontmatter;
	if (frontmatter !== undefined && Object.prototype.hasOwnProperty.call(frontmatter, PLUGIN_PROPERTY)) return true;
	// Obsidian may not have read the note's properties yet; its first lines say as much.
	return textFrontmatterHas(source.text, PLUGIN_PROPERTY);
}

/** The board a drawing makes; throws `ImportError` when the file holds no drawing that can be read. */
export function convertExcalidraw(source: ImportSource, context: ImportContext): ImportResult {
	if (source.text.length > MAX_IMPORT_SOURCE_LENGTH) throw new ImportError("tooLarge", "Excalidraw source exceeds the text limit");
	const read = readExcalidrawFile(source.text);
	if (!read.ok) throw new ImportError(READ_ERROR_REASONS[read.error.code], read.error.detail);
	if (read.file.scene.elements.length > MAX_IMPORT_ELEMENTS) throw new ImportError("tooLarge", "Excalidraw scene exceeds the element limit");
	const drawing = new DrawingImport(read.file, source.path, context, source.frontmatter);
	return drawing.build();
}

/** One drawing on its way to a board. */
class DrawingImport {
	private readonly builder: BoardBuilder;
	private readonly assets: ImportAssets;
	private readonly file: ExcalidrawFile;
	private readonly sourcePath: string;
	private readonly context: ImportContext;
	private readonly displayTheme: "light" | "dark" | undefined;
	/** Live elements in the drawing's own order, back to front. */
	private readonly elements: DrawingElement[] = [];
	private readonly byId = new Map<string, DrawingElement>();
	/** A shape's or a line's id -> the text inside it. */
	private readonly labels = new Map<string, DrawingElement>();
	/** Ids of text elements that went into a shape's card or a line's label. */
	private readonly containedTexts = new Set<string>();
	/** Source ids that have an entry of their own in the report. */
	private readonly reported = new Set<string>();
	/** Cards arrows may hold on to, by the id of the element they stand for. */
	private readonly placed = new Map<string, PlacedCard>();
	private readonly lostStyles = new Set<ImportReason>();
	private readonly reflectedImages = new Set<string>();

	constructor(file: ExcalidrawFile, sourcePath: string, context: ImportContext, private readonly frontmatter?: Readonly<Record<string, unknown>>) {
		this.builder = new BoardBuilder("excalidraw", context);
		this.assets = new ImportAssets(sourcePath, context.newId);
		this.file = file;
		this.sourcePath = sourcePath;
		const sourceTheme = isRecord(file.scene.appState) ? file.scene.appState.theme : undefined;
		this.displayTheme = sourceTheme === "light" || sourceTheme === "dark" ? sourceTheme : undefined;
		this.context = this.displayTheme === undefined ? context : { ...context, theme: this.displayTheme };
	}

	build(): ImportResult {
		this.readElements();
		this.matchContainedTexts();
		// Cards first, so every arrow finds the card it holds on to whatever
		// the order of the drawing.
		for (const element of this.elements) {
			if (this.containedTexts.has(element.id) || LINE_TYPES.has(element.type)) continue;
			this.placeElement(element);
		}
		for (const element of this.elements) {
			if (LINE_TYPES.has(element.type)) this.placeLine(element);
		}
		this.placeGroups();
		for (const element of this.elements) this.collectLostStyles(element);
		this.collectBackground();
		this.noteLostStyles();
		this.noteOrderLoss();
		if (this.file.noteBody !== undefined) this.note({ sourceId: "noteBody", sourceType: "Markdown", status: "plugin-unsupported", reason: "noteBody" });
		for (const key of Object.keys(this.frontmatter ?? {})) {
			if (key === "excalidraw-plugin" || key === "position") continue;
			this.note({ sourceId: `frontmatter:${key}`, sourceType: key, status: "plugin-unsupported", reason: "frontmatter" });
		}
		// Text inside a shape or on a line came over with it, as its text.
		for (const textId of this.containedTexts) {
			if (!this.reported.has(textId)) this.builder.countConverted();
		}
		const formatVersion = this.file.formatVersion === "unknown" ? undefined : this.file.formatVersion;
		const result = this.builder.finish({
			sourcePath: this.sourcePath,
			...(formatVersion === undefined ? {} : { formatVersion }),
		}, this.displayTheme);
		const assets = this.assets.list();
		return assets.length === 0 ? result : { ...result, assets };
	}

	/** Every element of the scene: deleted ones counted, unreadable ones reported, the rest kept. */
	private readElements(): void {
		this.file.scene.elements.forEach((value, index) => {
			if (!isRecord(value)) {
				this.note({ sourceId: `#${index}`, sourceType: "element", status: "invalid-source", reason: "invalidElement" });
				return;
			}
			const id = typeof value.id === "string" && value.id !== "" ? value.id : `#${index}`;
			const type = typeof value.type === "string" && value.type !== "" ? value.type : "element";
			if (value.isDeleted === true) {
				this.builder.countSkipped();
				return;
			}
			if (id !== value.id || this.byId.has(id) || !isReadableElement(type, value)) {
				this.note({ sourceId: id, sourceType: type, status: "invalid-source", reason: "invalidElement" });
				return;
			}
			const data = this.file.links.has(id) ? { ...value, link: this.file.links.get(id) } : value;
			const element = { id, type, data };
			this.elements.push(element);
			this.byId.set(id, element);
		});
	}

	/** Pairs each shape, arrow and line with the one text inside it. */
	private matchContainedTexts(): void {
		for (const element of this.elements) {
			if (element.type !== "text") continue;
			const containerId = element.data.containerId;
			if (typeof containerId !== "string") continue;
			const container = this.byId.get(containerId);
			if (container === undefined || !CONTAINER_TYPES.has(container.type)) continue;
			// A second text claiming the same container stays text of its own.
			if (this.labels.has(containerId)) continue;
			this.labels.set(containerId, element);
			this.containedTexts.add(element.id);
		}
	}

	private placeElement(element: DrawingElement): void {
		if (SHAPE_TYPES.has(element.type)) this.placeShape(element);
		else if (element.type === "text") this.placeText(element);
		else if (element.type === "freedraw") this.placeStroke(element);
		else if (FRAME_TYPES.has(element.type)) this.placeFrame(element);
		else if (element.type === "image") this.placeImage(element);
		else if (element.type === "embeddable") this.placeEmbeddable(element);
		else if (element.type === "iframe") this.placeholder(element, "unsupported", "iframe");
		else this.placeholder(element, "unsupported", "unknownElement");
	}

	/** A rectangle, an ellipse or a diamond: a shape card with the text inside it. */
	private placeShape(element: DrawingElement): void {
		const rect = boxOf(element.data);
		const label = this.labels.get(element.id);
		const kind = shapeKindOf(element);
		const linked = this.withLinks(label === undefined ? "" : this.textOf(label), [element, label]);
		const style = cardStyle(element.data, label?.data);
		const nodeId = this.builder.shapeCard(rect, linked.text, { kind, fallback: "text" }, { source: sourceOf(element), style });
		this.remember(element, nodeId, rect);
		// An arrow bound to the text inside holds on to the shape.
		if (label !== undefined) this.placed.set(label.id, this.placed.get(element.id)!);
		this.noteLinks(linked.linked, nodeId);
	}

	/** Text on the board itself, with no card around it. */
	private placeText(element: DrawingElement): void {
		const rect = boxOf(element.data);
		const linked = this.withLinks(this.textOf(element), [element]);
		const style = cardStyle(undefined, element.data);
		const nodeId = this.builder.item(rect, linked.text, { type: "text" }, { source: sourceOf(element), style });
		this.remember(element, nodeId, rect);
		this.noteLinks(linked.linked, nodeId);
	}

	/** A frame: a named group under every card, as Excalidraw draws frames under everything else. */
	private placeFrame(element: DrawingElement): void {
		const rect = boxOf(element.data);
		const name = typeof element.data.name === "string" ? element.data.name : "";
		const nodeId = this.builder.frame(rect, name, { source: sourceOf(element), ...styleOption(turnedStyle(element.data)) });
		this.remember(element, nodeId, rect);
		this.noteLostLink(element);
	}

	/**
	 * A picture.  In a plugin note `## Embedded Files` says where it comes
	 * from: a vault file becomes a file card, a formula its LaTeX in a card,
	 * a web address a link.  A picture stored inside the drawing itself
	 * (`files[fileId].dataURL`) has no file in the vault yet.
	 */
	private placeImage(element: DrawingElement): void {
		const rect = boxOf(element.data);
		const fileId = typeof element.data.fileId === "string" ? element.data.fileId : undefined;
		const embed = fileId === undefined ? undefined : this.file.embeds.get(fileId);
		if (embed?.kind === "link") {
			const target = linkPath(embed.link);
			const path = this.context.resolveLink(target, this.sourcePath);
			if (path === undefined) {
				// The plugin shows a note as a picture of it; a missing one is a missing note.
				this.placeholder(element, "missing-asset", isNoteLink(target) ? "fileNotFound" : "imageNotFound");
				return;
			}
			const nodeId = this.builder.file(rect, path, { source: sourceOf(element), ...fileSubpath(embed.link), ...styleOption(turnedStyle(element.data)) });
			this.remember(element, nodeId, rect);
			this.noteLostLink(element);
			return;
		}
		if (embed?.kind === "tex") {
			this.approximateAsCard(element, rect, `$$${embed.tex}$$`, "formula");
			return;
		}
		if (embed?.kind === "url") {
			this.approximateAsCard(element, rect, markdownLink(embed.url), "embed");
			return;
		}
		if (embed === undefined && fileId !== undefined && isRecord(this.file.scene.files)) {
			const entry = Object.prototype.hasOwnProperty.call(this.file.scene.files, fileId) ? this.file.scene.files[fileId] : undefined;
			if (isRecord(entry)) {
				const scale = element.data.scale;
				const validScale = Array.isArray(scale) && scale.length === 2 && scale.every(value => value === 1 || value === -1);
				const reflection = validScale ? { flipX: scale[0] === -1, flipY: scale[1] === -1 } : {};
				const asset = this.assets.add(fileId, entry.dataURL, reflection);
				if (!asset.ok) {
					this.placeholder(element, asset.reason === "unsupportedAsset" ? "plugin-unsupported" : "invalid-source", asset.reason);
					return;
				}
				const nodeId = this.builder.file(rect, asset.path, { source: sourceOf(element), style: { ...turnedStyle(element.data), showAttachmentName: false } });
				if (reflection.flipX || reflection.flipY) this.reflectedImages.add(element.id);
				this.remember(element, nodeId, rect);
				if (Math.abs(rect.width / rect.height - asset.width / asset.height) > 0.001) {
					this.note({ sourceId: element.id, sourceType: "image", status: "approximated", reason: "imageAspect", nodeId });
				}
				this.noteLostLink(element);
				return;
			}
		}
		this.placeholder(element, "missing-asset", "imageNotFound");
	}

	/** A note or a web page shown inside the drawing: the note as a file card, the page as a link. */
	private placeEmbeddable(element: DrawingElement): void {
		const rect = boxOf(element.data);
		const link = typeof element.data.link === "string" ? element.data.link.trim() : "";
		if (link === "") {
			this.placeholder(element, "unsupported", "iframe");
			return;
		}
		if (URL_START.test(link)) {
			this.approximateAsCard(element, rect, markdownLink(link), "embed");
			return;
		}
		const path = this.context.resolveLink(linkPath(link), this.sourcePath);
		if (path === undefined) {
			this.placeholder(element, "missing-asset", "fileNotFound");
			return;
		}
		const nodeId = this.builder.file(rect, path, { source: sourceOf(element), ...fileSubpath(link), ...styleOption(turnedStyle(element.data)) });
		this.remember(element, nodeId, rect);
	}

	/** A card with text standing for an element the board shows only approximately. */
	private approximateAsCard(element: DrawingElement, rect: BoardRect, text: string, reason: ImportReason): void {
		const nodeId = this.builder.card(rect, text, { source: sourceOf(element), ...styleOption(turnedStyle(element.data)) });
		this.remember(element, nodeId, rect);
		this.note({ sourceId: element.id, sourceType: element.type, status: "approximated", reason, nodeId });
	}

	/** A dashed card where an element that could not come over was. */
	private placeholder(element: DrawingElement, status: ImportEntryStatus, reason: ImportReason): void {
		const rect = boxOf(element.data);
		this.reported.add(element.id);
		const nodeId = this.builder.placeholder(rect, { sourceId: element.id, sourceType: element.type, status, reason });
		// Arrows bound to it still hold on to it, at the same share of its box.
		this.remember(element, nodeId, rect);
	}

	/** A pen stroke: a drawing whose points carry the turn. */
	private placeStroke(element: DrawingElement): void {
		const data = element.data;
		let points = boardPoints(data);
		const strokeWidth = positiveNumber(data.strokeWidth) ?? 1;
		const constantWidth = isRecord(data.strokeOptions) && data.strokeOptions.variability === "constant";
		const size = strokeWidth * (constantWidth ? CONSTANT_FREEDRAW_SIZE_PER_WIDTH : FREEDRAW_SIZE_PER_WIDTH);
		const pressures = constantWidth || data.simulatePressure !== false ? undefined : readPressures(data.pressures, points.length);
		let widths = pressures?.map((pressure) => pressureWidth(size, pressure));
		// A single touch of the pen is a dot: a stroke from the point to itself.
		if (points.length === 1) {
			points = [points[0], points[0]];
			if (widths !== undefined) widths = [widths[0], widths[0]];
		}
		const kept = fewerStrokePoints(points, widths, MAX_STROKE_POINTS);
		points = kept.points;
		widths = kept.widths;
		const width = widths === undefined ? Math.min(1_000, Math.max(0.01, roundTo(size, 2))) : maximum(widths);
		const bounds = strokeBounds(points, width);
		const left = Math.floor(bounds.x);
		const top = Math.floor(bounds.y);
		const right = Math.ceil(bounds.x + bounds.width);
		const bottom = Math.ceil(bounds.y + bounds.height);
		const color = readColor(data.strokeColor);
		const opacityShare = (finiteNumber(data.opacity) ?? 100) / 100;
		const colorAlpha = color === undefined ? 1 : color.kind === "hex" ? color.alpha : 0;
		// A stroke nobody can see is still a stroke: the faintest the board draws.
		const opacity = Math.min(1, Math.max(0.01, roundTo(opacityShare * colorAlpha, 2)));
		// The default ink, or a colour that cannot be read, becomes the pen's
		// own default; the stroke's transparency is kept apart from its colour.
		const ownColor = color?.kind === "hex" && !DEFAULT_INKS.has(color.opaqueHex) ? color.opaqueHex : undefined;
		const candidate: LocalStroke = {
			color: ownColor ?? defaultPenInk(this.context.theme ?? "light"),
			width,
			...(widths === undefined ? {} : { widths }),
			...(opacity < 1 ? { opacity } : {}),
			box: { width: right - left, height: bottom - top },
			points: points.flatMap((point) => [roundTo(point.x - left, 2), roundTo(point.y - top, 2)]),
		};
		const stroke = readLocalStroke(candidate);
		if (stroke === undefined) {
			this.note({ sourceId: element.id, sourceType: element.type, status: "invalid-source", reason: "invalidElement" });
			return;
		}
		const rect = { x: left, y: top, width: right - left, height: bottom - top };
		const nodeId = this.builder.drawing(rect, stroke, { source: sourceOf(element), ...styleOption(lockedStyle(data)) });
		this.placed.set(element.id, { nodeId, rect, angle: 0 });
		if (!constantWidth && (data.simulatePressure === true || data.simulatePressure === false || Array.isArray(data.pressures) && data.pressures.length > 0)) {
			this.note({ sourceId: element.id, sourceType: "pressures", status: data.simulatePressure === false && pressures === undefined ? "invalid-source" : "approximated", reason: "pressure", nodeId });
		}
		this.noteLostFill(element, nodeId);
		this.noteLostLink(element);
	}

	/**
	 * An arrow or a line.  Its ends hold on to the cards they are bound to;
	 * its middle points become the line's bends, its text its label.
	 */
	private placeLine(element: DrawingElement): void {
		const data = element.data;
		const points = boardPoints(data);
		const first = points[0];
		const last = points[points.length - 1];
		const bends = fewerPoints(points, MAX_WAYPOINTS + 2).slice(1, -1);
		const startHead = arrowheadOf(data.startArrowhead);
		const endHead = arrowheadOf(data.endArrowhead);
		const label = this.labels.get(element.id);
		const labelText = label === undefined ? "" : this.textOf(label).slice(0, MAX_LABEL_LENGTH);
		const color = readColor(data.strokeColor);
		const width = positiveNumber(data.strokeWidth);
		const strokeStyle = strokeStyleOf(data.strokeStyle);
		const headSize = headSizeOf(data.startArrowhead, data.endArrowhead);
		const line = {
			from: this.endAnchor(element, "startBinding", first),
			to: this.endAnchor(element, "endBinding", last),
			route: routeOf(data, points.length),
			startCap: startHead.cap,
			endCap: endHead.cap,
			waypoints: bends.map(roundPoint),
			...(labelText.trim() === "" ? {} : { label: labelText }),
			...(color?.kind === "hex" && !isDefaultInk(color) ? { color: color.opaqueHex } : {}),
			...(width === undefined ? {} : { width: Math.min(1_000, width) }),
			...(strokeStyle === undefined ? {} : { strokeStyle }),
			...(headSize === undefined ? {} : { headSize }),
		};
		this.builder.connect(line, { source: sourceOf(element) });
		if (!startHead.exact || !endHead.exact) {
			this.note({ sourceId: element.id, sourceType: element.type, status: "approximated", reason: "arrowhead" });
		}
		this.noteLostFill(element);
		this.noteLostLink(element);
		if (label !== undefined) this.noteLostLink(label);
	}

	/**
	 * Where one end of a line holds: on the card of the element it is bound
	 * to, at the share of that element's unturned box the end lies at, or on
	 * the board where it is.
	 */
	private endAnchor(element: DrawingElement, field: "startBinding" | "endBinding", point: StrokePoint): CanvasAnchor {
		const binding = element.data[field];
		const free: CanvasAnchor = { type: "free", ...roundPoint(point) };
		if (binding === undefined || binding === null) return free;
		if (!isRecord(binding) || typeof binding.elementId !== "string" || binding.elementId === "") {
			this.note({ sourceId: element.id, sourceType: field, status: "invalid-source", reason: "binding" });
			return free;
		}
		const target = this.placed.get(binding.elementId);
		if (target === undefined) {
			this.note({ sourceId: element.id, sourceType: field, status: "source-limited", reason: "binding" });
			return free;
		}
		const rect = target.rect;
		const centre = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
		const local = rotateAround(point, centre, -target.angle);
		const rawU = rect.width > 0 ? (local.x - rect.x) / rect.width : 0.5;
		const rawV = rect.height > 0 ? (local.y - rect.y) / rect.height : 0.5;
		const u = clampUnit(rawU);
		const v = clampUnit(rawV);
		// A native card anchor has no outside gap or orbit-binding behaviour.
		if (Math.abs(rawU - u) > 0.0001 || Math.abs(rawV - v) > 0.0001 || binding.mode === "orbit") {
			this.note({ sourceId: element.id, sourceType: field, status: "approximated", reason: "binding" });
		}
		return { type: "node", nodeId: target.nodeId, u: roundTo(u, 4), v: roundTo(v, 4) };
	}

	/** An element's text: the plugin note's raw Markdown first, then the text before Excalidraw wrapped it. */
	private textOf(element: DrawingElement): string {
		const raw = this.file.texts.get(element.id);
		if (raw !== undefined) return raw;
		// The plugin keeps the same raw Markdown in the scene as well.
		if (typeof element.data.rawText === "string") return element.data.rawText;
		if (typeof element.data.originalText === "string") return element.data.originalText;
		if (typeof element.data.text === "string") return element.data.text;
		return "";
	}

	/** The text with each element's own link on a line of its own below it. */
	private withLinks(text: string, elements: readonly (DrawingElement | undefined)[]): { readonly text: string; readonly linked: DrawingElement[] } {
		const lines: string[] = [];
		const linked: DrawingElement[] = [];
		for (const element of elements) {
			if (element === undefined) continue;
			const link = linkOf(element.data);
			if (link === undefined) continue;
			linked.push(element);
			const line = link.startsWith("[[") ? link : markdownLink(link);
			if (!lines.includes(line)) lines.push(line);
		}
		if (lines.length === 0) return { text, linked };
		const joined = text === "" ? lines.join("\n") : `${text}\n\n${lines.join("\n")}`;
		return { text: joined, linked };
	}

	private noteLinks(elements: readonly DrawingElement[], nodeId: string): void {
		for (const element of elements) {
			this.note({ sourceId: element.id, sourceType: element.type, status: "approximated", reason: "elementLink", nodeId });
		}
	}

	/** A link on an element with no text of its own to carry it (a line, a stroke, a picture, a frame). */
	private noteLostLink(element: DrawingElement): void {
		if (linkOf(element.data) === undefined) return;
		this.note({ sourceId: element.id, sourceType: element.type, status: "plugin-unsupported", reason: "elementLinkDropped" });
	}

	/**
	 * A line or a pen stroke whose course closes on itself is filled by
	 * Excalidraw; the board draws its course but not the fill.
	 */
	private noteLostFill(element: DrawingElement, nodeId?: string): void {
		if (!LOOP_FILLED_TYPES.has(element.type)) return;
		const fill = readColor(element.data.backgroundColor);
		if (fill === undefined || fill.kind !== "hex" || fill.alpha === 0) return;
		if (!isClosedCourse(element.data)) return;
		this.note({
			sourceId: element.id,
			sourceType: element.type,
			status: "approximated",
			reason: "lineFill",
			...(nodeId === undefined ? {} : { nodeId }),
		});
	}

	private remember(element: DrawingElement, nodeId: string, rect: BoardRect): void {
		this.placed.set(element.id, { nodeId, rect, angle: finiteNumber(element.data.angle) ?? 0 });
	}

	private note(entry: { sourceId: string; sourceType: string; status: ImportEntryStatus; reason: ImportReason; nodeId?: string }): void {
		this.reported.add(entry.sourceId);
		this.builder.note(entry);
	}

	/** The looks of an element the board cannot draw, each kind remembered once. */
	private collectLostStyles(element: DrawingElement): void {
		const data = element.data;
		if (element.type === "text" && data.fontFamily !== undefined && (typeof data.fontFamily !== "number" || FONT_FAMILIES[data.fontFamily] === undefined)) {
			this.note({ sourceId: element.id, sourceType: "fontFamily", status: "plugin-unsupported", reason: "customStyle" });
		}
		const roughness = finiteNumber(data.roughness);
		if (ROUGH_TYPES.has(element.type) && roughness !== undefined && roughness > 0) this.lostStyles.add("roughness");
		const fill = readColor(data.backgroundColor);
		const filled = fill !== undefined && fill.kind === "hex";
		if (FILLED_TYPES.has(element.type) && filled && typeof data.fillStyle === "string" && data.fillStyle !== "solid") {
			this.lostStyles.add("hatch");
		}
		const opacity = finiteNumber(data.opacity);
		// A pen stroke keeps its transparency; nothing else on a board has one.
		if (element.type !== "freedraw" && opacity !== undefined && opacity < 100) this.lostStyles.add("opacity");
		if (element.type === "image" && isRecord(data.crop)) this.lostStyles.add("imageCrop");
		if (element.type === "image" && data.scale !== undefined) {
			const scale = data.scale;
			const valid = Array.isArray(scale) && scale.length === 2 && scale.every((value) => value === 1 || value === -1);
			if (!valid || (scale[0] !== 1 || scale[1] !== 1) && !this.reflectedImages.has(element.id)) {
				this.note({ sourceId: element.id, sourceType: "scale", status: valid ? "plugin-unsupported" : "invalid-source", reason: "imageScale" });
			}
		}
		if (data.frameId !== undefined && data.frameId !== null) {
			const frame = typeof data.frameId === "string" ? this.byId.get(data.frameId) : undefined;
			const valid = frame !== undefined && FRAME_TYPES.has(frame.type) && frame.id !== element.id;
			this.note({ sourceId: element.id, sourceType: "frameId", status: valid ? "plugin-unsupported" : "invalid-source", reason: "frameMembership" });
		}
		if (data.customData !== undefined && data.customData !== null && (!isRecord(data.customData) || Object.keys(data.customData).length > 0)) {
			this.note({ sourceId: element.id, sourceType: "customData", status: isRecord(data.customData) ? "plugin-unsupported" : "invalid-source", reason: "customData" });
		}
	}

	/** A source group becomes a transparent spatial frame, never exact membership. */
	private placeGroups(): void {
		const groups = new Map<string, { cards: Set<string>; bounds?: BoardRect; depth: number; locked: boolean }>();
		for (const element of this.elements) {
			const groupIds = element.data.groupIds;
			if (groupIds === undefined || groupIds === null) continue;
			if (!Array.isArray(groupIds) || groupIds.some((id) => typeof id !== "string" || id === "")) {
				this.note({ sourceId: element.id, sourceType: "groupIds", status: "invalid-source", reason: "groups" });
				continue;
			}
			const card = this.placed.get(element.id);
			const bounds = card === undefined ? LINE_TYPES.has(element.type) ? strokeBounds(boardPoints(element.data), positiveNumber(element.data.strokeWidth) ?? 1) : undefined : cardBounds(card);
			for (let index = 0; index < groupIds.length; index += 1) {
				const groupId = groupIds[index] as string;
				let group = groups.get(groupId);
				if (group === undefined) {
					if (groups.size >= MAX_IMPORT_ELEMENTS) throw new ImportError("tooLarge", "Excalidraw scene exceeds the group limit");
					group = { cards: new Set(), depth: 0, locked: false };
					groups.set(groupId, group);
				}
				group.depth = Math.max(group.depth, groupIds.length - index - 1);
				group.locked ||= element.data.locked === true;
				if (card !== undefined) group.cards.add(card.nodeId);
				if (bounds !== undefined) group.bounds = unionBounds(group.bounds, bounds);
			}
		}
		// Outer frames precede inner ones; equal-depth groups keep source order.
		const ordered = [...groups].sort((left, right) => left[1].depth - right[1].depth);
		const sourceIds = new Set(this.byId.keys());
		for (const [groupId, group] of ordered) {
			if (group.cards.size === 0 || group.bounds === undefined) {
				this.lostStyles.add("groups");
				continue;
			}
			let sourceId = `group:${groupId}`;
			while (sourceIds.has(sourceId)) sourceId = `group:${sourceId}`;
			sourceIds.add(sourceId);
			const nodeId = this.builder.frame(group.bounds, "", {
				source: { id: sourceId, type: "group" },
				style: { colors: { fill: null }, borderStyle: "none", borderWidth: 0, ...(group.locked ? { locked: true } : {}) },
			});
			this.note({ sourceId, sourceType: "groupIds", status: "approximated", reason: "groups", nodeId });
		}
	}

	/** Cards retain their relative order; lines are placed afterwards to resolve bindings. */
	private noteOrderLoss(): void {
		let sawLine = false;
		for (const element of this.elements) {
			if (this.containedTexts.has(element.id) || FRAME_TYPES.has(element.type)) continue;
			if (LINE_TYPES.has(element.type)) sawLine = true;
			else if (sawLine) {
				this.note({ sourceId: "zOrder", sourceType: "elements", status: "plugin-unsupported", reason: "zOrder" });
				return;
			}
		}
	}

	private collectBackground(): void {
		const appState = this.file.scene.appState;
		if (!isRecord(appState)) return;
		const background = appState.viewBackgroundColor;
		if (typeof background !== "string") return;
		if (PLAIN_BACKGROUNDS.has(background.trim().toLowerCase())) return;
		this.lostStyles.add("background");
	}

	private noteLostStyles(): void {
		for (const [reason, field] of LOST_STYLES) {
			if (!this.lostStyles.has(reason)) continue;
			this.note({ sourceId: reason, sourceType: field, status: "plugin-unsupported", reason });
		}
	}
}

/** Whether an element carries what placing it needs: numbers where its box or its points are. */
function isReadableElement(type: string, data: ElementRecord): boolean {
	if (finiteNumber(data.x) === undefined || finiteNumber(data.y) === undefined) return false;
	if (data.angle !== undefined && finiteNumber(data.angle) === undefined) return false;
	if (LINE_TYPES.has(type)) return readPoints(data.points).length >= 2;
	if (type === "freedraw") return readPoints(data.points).length >= 1;
	if (SHAPE_TYPES.has(type) || type === "text" || FRAME_TYPES.has(type) || type === "image" || type === "embeddable" || type === "iframe") {
		return finiteNumber(data.width) !== undefined && finiteNumber(data.height) !== undefined;
	}
	// An element of a kind this importer does not know needs only a place for its placeholder.
	return true;
}

function sourceOf(element: DrawingElement): SourceElement {
	return { id: element.id, type: element.type };
}

/** An element's box before it is turned; a box drawn backwards is turned the right way round. */
function boxOf(data: ElementRecord): BoardRect {
	const x = finiteNumber(data.x) ?? 0;
	const y = finiteNumber(data.y) ?? 0;
	const width = finiteNumber(data.width) ?? 0;
	const height = finiteNumber(data.height) ?? 0;
	return {
		x: width < 0 ? x + width : x,
		y: height < 0 ? y + height : y,
		width: Math.abs(width),
		height: Math.abs(height),
	};
}

function shapeKindOf(element: DrawingElement): "rectangle" | "round_rectangle" | "ellipse" | "diamond" {
	if (element.type === "ellipse") return "ellipse";
	if (element.type === "diamond") return "diamond";
	return isRecord(element.data.roundness) ? "round_rectangle" : "rectangle";
}

/**
 * A card's look: the shape's fill, outline and turn, and the text's size,
 * font, alignment and colour.  A standalone text has only the text half.
 */
function cardStyle(shape: ElementRecord | undefined, text: ElementRecord | undefined): ImportedCardStyle | undefined {
	const colors: Record<string, string | null> = {};
	let borderStyle: ImportedCardStyle["borderStyle"];
	let borderWidth: number | undefined;
	if (shape !== undefined) {
		const fill = readColor(shape.backgroundColor);
		if (fill !== undefined) colors.fill = fill.kind === "hex" ? fill.hex : null;
		const outline = readColor(shape.strokeColor);
		if (outline?.kind === "hex" && !isDefaultInk(outline)) colors.border = outline.hex;
		borderStyle = outline?.kind === "transparent" ? "none" : strokeStyleOf(shape.strokeStyle);
		const strokeWidth = finiteNumber(shape.strokeWidth);
		if (strokeWidth !== undefined && strokeWidth >= 0) borderWidth = Math.min(100, strokeWidth);
	}
	const typography = text === undefined ? undefined : typographyOf(text);
	if (text !== undefined) {
		const ink = readColor(text.strokeColor);
		if (ink?.kind === "hex" && !isDefaultInk(ink)) colors.text = ink.hex;
	}
	const owner = shape ?? text;
	const locked = owner?.locked === true;
	const rotation = owner === undefined ? 0 : rotationOf(owner.angle);
	const style: ImportedCardStyle = {
		...(typography === undefined ? {} : { typography }),
		...(Object.keys(colors).length === 0 ? {} : { colors }),
		...(borderStyle === undefined ? {} : { borderStyle }),
		...(borderWidth === undefined ? {} : { borderWidth }),
		...(locked ? { locked: true as const } : {}),
		...(rotation === 0 ? {} : { rotation }),
	};
	return Object.keys(style).length === 0 ? undefined : style;
}

/** The text's size, font and alignment, as far as the board can hold them. */
function typographyOf(text: ElementRecord): Record<string, unknown> | undefined {
	const typography: Record<string, unknown> = {};
	if (isValidFontSize(text.fontSize)) typography.fontSize = roundTo(text.fontSize, 2);
	if (isValidLineHeight(text.lineHeight)) typography.lineHeight = roundTo(text.lineHeight, 4);
	const family = typeof text.fontFamily === "number" ? FONT_FAMILIES[text.fontFamily] : undefined;
	if (family !== undefined) typography.fontFamily = family;
	if (text.textAlign === "left" || text.textAlign === "center" || text.textAlign === "right") typography.alignment = text.textAlign;
	if (text.verticalAlign === "top" || text.verticalAlign === "bottom") typography.verticalAlign = text.verticalAlign;
	if (text.verticalAlign === "middle") typography.verticalAlign = "center";
	return Object.keys(typography).length === 0 ? undefined : typography;
}

/** Only the turn, for a card that shows a file or a link. */
function turnedStyle(data: ElementRecord): ImportedCardStyle | undefined {
	const rotation = rotationOf(data.angle);
	const locked = data.locked === true;
	if (rotation === 0 && !locked) return undefined;
	return { ...(rotation === 0 ? {} : { rotation }), ...(locked ? { locked: true as const } : {}) };
}

function lockedStyle(data: ElementRecord): ImportedCardStyle | undefined {
	return data.locked === true ? { locked: true } : undefined;
}

function styleOption(style: ImportedCardStyle | undefined): { readonly style?: ImportedCardStyle } {
	return style === undefined ? {} : { style };
}

/** Radians clockwise as degrees clockwise, between -180 and 180 as the rotation handle writes them. */
function rotationOf(angle: unknown): number {
	const radians = finiteNumber(angle) ?? 0;
	if (radians === 0) return 0;
	const degrees = roundTo((radians * 180) / Math.PI, 2);
	const normalized = ((((degrees + 180) % 360) + 360) % 360) - 180;
	return Object.is(normalized, -0) ? 0 : roundTo(normalized, 2);
}

function strokeStyleOf(value: unknown): "solid" | "dashed" | "dotted" | undefined {
	if (value === "solid" || value === "dashed" || value === "dotted") return value;
	return undefined;
}

/** Elbowed arrows keep their elbows, rounded lines through several points curve, the rest run straight. */
function routeOf(data: ElementRecord, pointCount: number): "straight" | "elbowed" | "curved" {
	if (data.elbowed === true) return "elbowed";
	if (isRecord(data.roundness) && pointCount > 2) return "curved";
	return "straight";
}

/** The size the line's ends are drawn at: the larger of its two arrowheads, or none for a line without one. */
function headSizeOf(start: unknown, end: unknown): number | undefined {
	const sizes = [start, end]
		.filter((value) => value !== null && value !== undefined)
		.map((value) => (typeof value === "string" && Object.prototype.hasOwnProperty.call(ARROWHEAD_SIZES, value) ? ARROWHEAD_SIZES[value] : DEFAULT_ARROWHEAD_SIZE));
	return sizes.length === 0 ? undefined : Math.max(...sizes);
}

function arrowheadOf(value: unknown): { readonly cap: string; readonly exact: boolean } {
	if (value === null || value === undefined) return { cap: "none", exact: true };
	if (typeof value !== "string") return UNKNOWN_ARROWHEAD;
	return Object.prototype.hasOwnProperty.call(ARROWHEADS, value) ? ARROWHEADS[value] : UNKNOWN_ARROWHEAD;
}

/** The points of a line or a stroke as `[x, y]` pairs, relative to its x and y; nothing when one is unreadable. */
function readPoints(value: unknown): StrokePoint[] {
	if (!Array.isArray(value)) return [];
	const points: StrokePoint[] = [];
	for (const pair of value) {
		if (!Array.isArray(pair)) return [];
		const x = finiteNumber(pair[0]);
		const y = finiteNumber(pair[1]);
		if (x === undefined || y === undefined) return [];
		points.push({ x, y });
	}
	return points;
}

/**
 * A line's or a stroke's points on the board: moved by its x and y, then
 * turned by its angle about the middle of the box the points span.
 */
function boardPoints(data: ElementRecord): StrokePoint[] {
	const relative = readPoints(data.points);
	const originX = finiteNumber(data.x) ?? 0;
	const originY = finiteNumber(data.y) ?? 0;
	const angle = finiteNumber(data.angle) ?? 0;
	const bounds = strokeBounds(relative);
	const centre = {
		x: originX + bounds.x + bounds.width / 2,
		y: originY + bounds.y + bounds.height / 2,
	};
	return relative.map((point) => rotateAround({ x: originX + point.x, y: originY + point.y }, centre, angle));
}

/** A turned card's full box, with a unit of slack for native spatial containment. */
function cardBounds(card: PlacedCard): BoardRect {
	const { rect, angle } = card;
	const centre = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
	return strokeBounds([
		{ x: rect.x, y: rect.y },
		{ x: rect.x + rect.width, y: rect.y },
		{ x: rect.x + rect.width, y: rect.y + rect.height },
		{ x: rect.x, y: rect.y + rect.height },
	].map((point) => rotateAround(point, centre, angle)));
}

function unionBounds(before: BoardRect | undefined, added: BoardRect): BoardRect {
	if (before === undefined) return added;
	const x = Math.min(before.x, added.x);
	const y = Math.min(before.y, added.y);
	return { x, y, width: Math.max(before.x + before.width, added.x + added.width) - x, height: Math.max(before.y + before.height, added.y + added.height) - y };
}

/** Measured pressure must name every source point; zero is a valid light touch. */
function readPressures(value: unknown, pointCount: number): number[] | undefined {
	if (!Array.isArray(value) || value.length !== pointCount) return undefined;
	if (value.some((pressure) => finiteNumber(pressure) === undefined || pressure < 0 || pressure > 1)) return undefined;
	return value as number[];
}

/** The published radius model as a diameter; smoothing and caps are still approximated. */
function pressureWidth(size: number, pressure: number): number {
	const share = 0.5 + FREEDRAW_THINNING * (pressure - 0.5);
	return Math.min(1_000, Math.max(0.01, roundTo(2 * size * Math.sin(share * Math.PI / 2), 2)));
}

function maximum(values: readonly number[]): number {
	let result = 0;
	for (const value of values) result = Math.max(result, value);
	return result;
}

/** Keep both the course and pressure changes; the same source indices choose both arrays. */
function fewerStrokePoints(points: StrokePoint[], widths: number[] | undefined, limit: number): { points: StrokePoint[]; widths?: number[] } {
	if (widths === undefined) return { points: fewerPoints(points, limit) };
	if (points.length <= limit) return { points, widths };
	const indices = new Map(points.map((point, index) => [point, index]));
	const pressurePoints = widths.map((width, index) => ({ x: index, y: width }));
	let tolerance = 0.25;
	let kept: number[];
	do {
		const geometry = simplifyPoints(points, tolerance).map((point) => indices.get(point)!);
		const pressure = simplifyPoints(pressurePoints, tolerance).map((point) => point.x);
		kept = [...new Set([...geometry, ...pressure])].sort((left, right) => left - right);
		tolerance *= 2;
	} while (kept.length > limit);
	return { points: kept.map((index) => points[index]), widths: kept.map((index) => widths[index]) };
}

/** The same course in at most `limit` points, dropping the ones that say least about its shape. */
function fewerPoints(points: readonly StrokePoint[], limit: number): StrokePoint[] {
	let kept = [...points];
	let tolerance = 0.25;
	while (kept.length > limit) {
		kept = [...simplifyPoints(points, tolerance)];
		tolerance *= 2;
	}
	return kept;
}

/** A point turned clockwise by `radians` about `centre` (the board's y runs down). */
function rotateAround(point: StrokePoint, centre: StrokePoint, radians: number): StrokePoint {
	if (radians === 0) return point;
	const cosine = Math.cos(radians);
	const sine = Math.sin(radians);
	const dx = point.x - centre.x;
	const dy = point.y - centre.y;
	return { x: centre.x + dx * cosine - dy * sine, y: centre.y + dx * sine + dy * cosine };
}

function roundPoint(point: StrokePoint): { x: number; y: number } {
	return { x: roundTo(point.x, 2), y: roundTo(point.y, 2) };
}

/**
 * A colour as Excalidraw writes it: "transparent", or a hex colour of three,
 * six or eight digits.  Anything else (a CSS name, `rgb()`) is not read, and
 * the board's own colour stays.
 */
function readColor(value: unknown): ReadColor | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim().toLowerCase();
	if (trimmed === "transparent") return { kind: "transparent" };
	const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/u.exec(trimmed);
	if (short !== null) {
		const hex = `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
		return { kind: "hex", hex, opaqueHex: hex, alpha: 1 };
	}
	if (/^#[0-9a-f]{6}$/u.test(trimmed)) return { kind: "hex", hex: trimmed, opaqueHex: trimmed, alpha: 1 };
	if (/^#[0-9a-f]{8}$/u.test(trimmed)) {
		const alpha = parseInt(trimmed.slice(7, 9), 16) / 255;
		return { kind: "hex", hex: trimmed, opaqueHex: trimmed.slice(0, 7), alpha };
	}
	return undefined;
}

/** Whether a colour is Excalidraw's default ink, drawn fully opaque. */
function isDefaultInk(color: ReadColor): boolean {
	return color.kind === "hex" && color.alpha === 1 && DEFAULT_INKS.has(color.opaqueHex);
}

/** An element's own link (`link`), when it has one. */
function linkOf(data: ElementRecord): string | undefined {
	if (typeof data.link !== "string") return undefined;
	const link = data.link.trim();
	return link === "" ? undefined : link;
}


/**
 * Whether Excalidraw fills a line's or a stroke's course: a line marked a
 * polygon (`polygon`, newer drawings), or a course of three points or more
 * whose last point lies within `LOOP_CLOSE_DISTANCE` of its first.
 */
function isClosedCourse(data: ElementRecord): boolean {
	if (data.polygon === true) return true;
	const points = readPoints(data.points);
	if (points.length < 3) return false;
	const first = points[0];
	const last = points[points.length - 1];
	return Math.hypot(last.x - first.x, last.y - first.y) <= LOOP_CLOSE_DISTANCE;
}

/** A link names a note when it has no extension or ends in `.md`; anything else is a picture or a document. */
function isNoteLink(path: string): boolean {
	const name = path.split("/").pop() ?? "";
	const dot = name.lastIndexOf(".");
	if (dot <= 0) return true;
	return name.slice(dot + 1).toLowerCase() === "md";
}

/** The file a link names: `[[target#heading|alias]]` or a bare path, without the heading and the alias. */
function linkPath(link: string): string {
	const wiki = /^!?\[\[([^\]]*)\]\]/u.exec(link.trim());
	const inner = wiki === null ? link.trim() : wiki[1];
	const withoutAlias = inner.split("|")[0];
	return withoutAlias.split("#")[0].trim();
}

/** A Markdown link to a web address, showing the address. */
function markdownLink(url: string): string {
	const shown = url.replace(/([\\[\]])/gu, "\\$1");
	// An address with spaces or brackets goes between angle brackets, which
	// themselves must not appear inside.
	const needsBrackets = /[\s()<>]/u.test(url);
	const bracketed = url.replace(/</gu, "%3C").replace(/>/gu, "%3E");
	const target = needsBrackets ? `<${bracketed}>` : url;
	return `[${shown}](${target})`;
}

/** Keep heading, block and PDF subpaths exactly as the native file card reads them. */
function fileSubpath(link: string): { readonly subpath?: string } {
	const wiki = /^!?\[\[([^\]]*)\]\]/u.exec(link.trim());
	const inner = (wiki === null ? link.trim() : wiki[1]).split("|")[0];
	const hash = inner.indexOf("#");
	return hash < 0 ? {} : { subpath: inner.slice(hash) };
}

/** Whether a note's frontmatter, read from its first lines, has `key`. */
function textFrontmatterHas(text: string, key: string): boolean {
	const normalized = text.replace(/^\ufeff/u, "").replace(/\r\n?/gu, "\n");
	if (!normalized.startsWith("---\n")) return false;
	const end = normalized.indexOf("\n---", 3);
	if (end < 0) return false;
	const lines = normalized.slice(4, end).split("\n");
	return lines.some((line) => line.split(":")[0].trim() === key && line.includes(":"));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function positiveNumber(value: unknown): number | undefined {
	const number = finiteNumber(value);
	return number !== undefined && number > 0 ? number : undefined;
}

function clampUnit(value: number): number {
	return Math.min(1, Math.max(0, value));
}

function roundTo(value: number, digits: number): number {
	const factor = 10 ** digits;
	return Math.round(value * factor) / factor;
}
