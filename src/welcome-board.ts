/**
 * The optional welcome board: every tool of the plugin shown on real items,
 * so a new board is not a blank page.  Most frames show rather than tell: a
 * font is written in itself, a colour is painted, a line style is drawn.
 *
 * `buildWelcomeBoard` is a pure builder.  It never hand-invents a shape of
 * data: a card's look is the override the selection toolbar writes
 * (`typography`, `colors`, `borderStyle`, `borderWidth`); a sticky note, a
 * code block, a table, a drawing and a frame are all built the way
 * `createItem` (canvas-authoring.ts) builds them - a card node plus a
 * `miroCanvas.localOverrides[id].item` record `local-items.ts` can read back;
 * a shape is a card plus the `{ kind, fallback: "text" }` descriptor
 * `createShape` writes; a line that only holds on to a card at one end, or to
 * no card at all, is a `BoardConnector` (board-connectors.ts) exactly as the
 * line tool leaves one, turned into a native edge with `nativeEdgeOf`
 * wherever both its ends land on a card; a comment is built with the same
 * `addLocalComment`/`addReply` mutations the comments panel calls.
 *
 * The board never knows the theme it opens in, so everything it paints is
 * either a colour that reads on light and dark boards alike or left to
 * Obsidian's own colours.
 *
 * The "Files and notes" frame points native Canvas file nodes at a small
 * folder of sample files (welcome-samples.ts has the two binary ones' bytes;
 * `sampleNoteContent`/`sampleCanvasContent` below build the text ones) that
 * `createWelcomeBoard` writes next to the board, on the same press, so the
 * frame never points at a file that does not exist.
 */

import type { App, TFile } from "obsidian";

import type { CanvasAnchor } from "./anchors";
import { OFFERED_FONT_FAMILIES, fontLabel } from "./appearance";
import { readBoardConnector, nativeEdgeOf, fitsNativeEdge, type BoardConnector } from "./board-connectors";
import type { CanvasShapeDescriptor } from "./canvas-authoring";
import { exportRecord, pageAround, paperRatio, type ExportPageRecord, type ExportState } from "./export-pages";
import { words } from "./i18n";
import { readLocalItem, type LocalItem } from "./local-items";
import { addLocalComment, addReply } from "./local-comments";
import { MIRO_CANVAS_SCHEMA_VERSION, validateMiroCanvasMetadata } from "./metadata";
import { readableInk } from "./miro-palette";
import type { ShapeKind } from "./shape-catalog";
import { WELCOME_SAMPLE_DOCX_BASE64, WELCOME_SAMPLE_PDF_BASE64, WELCOME_SAMPLE_PNG_BASE64, decodeWelcomeSample } from "./welcome-samples";

export interface WelcomeBoardOptions {
	/** Makes every id reproducible, so two builds can be compared in a test. */
	readonly seed?: number;
	/** Where the "Files and notes" frame's file nodes point; defaults to `welcomeSamplePaths()` so a test can hand it fixed paths without a vault. */
	readonly samples?: WelcomeSamplePaths;
}

/** The vault paths of the small folder of sample files the board's frame points at. */
export interface WelcomeSamplePaths {
	readonly folder: string;
	readonly note: string;
	readonly canvas: string;
	readonly picture: string;
	readonly pdf: string;
	readonly docx: string;
}

/**
 * The two attachments with names fixed by the frame, not by the locale - a
 * translated file name would break the link the moment the language
 * changed.  The note and the small canvas keep their own words, since
 * nothing outside the board reads their file names.
 */
export const WELCOME_SAMPLE_ATTACHMENT_NAMES = { picture: "Picture.png", pdf: "Document.pdf", docx: "Document.docx" } as const;

/** The sample folder and files `createWelcomeBoard` writes, and where the board's file nodes point. */
export function welcomeSamplePaths(): WelcomeSamplePaths {
	const strings = words().welcome;
	const folder = strings.samplesFolderName;
	return {
		folder,
		note: `${folder}/${strings.samplesNoteFileName}`,
		canvas: `${folder}/${strings.samplesCanvasFileName}`,
		picture: `${folder}/${WELCOME_SAMPLE_ATTACHMENT_NAMES.picture}`,
		pdf: `${folder}/${WELCOME_SAMPLE_ATTACHMENT_NAMES.pdf}`,
		docx: `${folder}/${WELCOME_SAMPLE_ATTACHMENT_NAMES.docx}`,
	};
}

/**
 * The sample note's own words: a short paragraph, a list, and a wiki link
 * back to the board.  No heading: Canvas already shows the note's name above
 * it, and a heading repeating the name read twice.
 */
export function sampleNoteContent(): string {
	const strings = words().welcome;
	const boardName = strings.fileName.replace(/\.canvas$/, "");
	return [
		strings.samplesNoteIntro,
		"",
		`- ${strings.samplesNoteItem1}`,
		`- ${strings.samplesNoteItem2}`,
		"",
		`${strings.samplesNoteBackToBoard} [[${boardName}]]`,
		"",
	].join("\n");
}

/** The sample canvas: two text cards and the native edge joining them - a plain Canvas file, none of it plugin metadata. */
export function sampleCanvasContent(): string {
	const strings = words().welcome;
	const nextId = idFactory(0x53ee11a);
	const fromId = nextId();
	const toId = nextId();
	const document = {
		nodes: [
			{ id: fromId, type: "text", text: strings.samplesCanvasCard1, x: 0, y: 0, width: 240, height: 120 },
			{ id: toId, type: "text", text: strings.samplesCanvasCard2, x: 320, y: 0, width: 240, height: 120 },
		],
		edges: [{ id: nextId(), fromNode: fromId, fromSide: "right", toNode: toId, toSide: "left" }],
	};
	return JSON.stringify(document, null, "\t");
}

interface Rect {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

/** What a card's look sets, in the shape the selection toolbar writes it. */
interface CardStyle {
	readonly typography?: Readonly<Record<string, unknown>>;
	readonly colors?: Readonly<Record<string, string | null>>;
	readonly borderStyle?: "solid" | "dashed" | "dotted" | "none";
	readonly borderWidth?: number;
	readonly shape?: CanvasShapeDescriptor;
	readonly locked?: true;
}

/** The frames, in reading order: four columns, left to right, top to bottom. */
const FRAMES = [
	"welcome", "text", "colours", "stickies",
	"shapes", "lines", "drawing", "layers",
	"comments", "code", "files", "exportAndMiro",
] as const;
type FrameName = (typeof FRAMES)[number];

const COLUMNS = 4;
const FRAME_WIDTH = 720;
const FRAME_HEIGHT = 520;
const GAP = 80;

/** Miro's own colours, the ones the toolbar offers first. */
const MIRO = { red: "#f24726", orange: "#ff9d48", yellow: "#ffd02f", green: "#67c6a0", blue: "#4262ff", purple: "#9b51e0" } as const;
/** Marker colours, as the toolbar's highlight palette has them: light enough for dark ink. */
const MARKER = {
	yellow: "#fff59d", orange: "#ffd59a", pink: "#f8c4dc", violet: "#d9ccf0",
	blue: "#bfe3fb", cyan: "#b8ecf0", green: "#cde8b0", lime: "#e8f0a4", gray: "#e3e3e3",
} as const;
/** Pale fills Miro gives its sticky notes, for shapes and cards that should read as paper. */
const PAPER = {
	blue: "#b6d3fe", green: "#d5f1a8", orange: "#ffb575", pink: "#fd9ae7", yellow: "#fff7a1",
	gold: "#ffe86d", cyan: "#8ae9e0", violet: "#beb3fb", red: "#ff9f9f", rose: "#ffd4f2",
} as const;

/** A fixed moment, so a comment's timestamp never makes two builds differ. */
const FIXED_TIMESTAMP = "2026-01-01T00:00:00.000Z";

/** An id as native Canvas makes one: sixteen hex digits, drawn from a seed so builds compare equal. */
function idFactory(seed: number): () => string {
	let state = (seed >>> 0) || 0x2f6e2b1;
	const next32 = (): number => {
		state ^= state << 13; state >>>= 0;
		state ^= state >>> 17;
		state ^= state << 5; state >>>= 0;
		return state >>> 0;
	};
	return () => `${next32().toString(16).padStart(8, "0")}${next32().toString(16).padStart(8, "0")}`;
}

function frameRect(frame: FrameName): Rect {
	const index = FRAMES.indexOf(frame);
	const column = index % COLUMNS;
	const row = Math.floor(index / COLUMNS);
	return { x: column * (FRAME_WIDTH + GAP), y: row * (FRAME_HEIGHT + GAP), width: FRAME_WIDTH, height: FRAME_HEIGHT };
}

/** A rectangle inside a frame, `dx`/`dy` from its corner. */
function within(frame: FrameName, dx: number, dy: number, width: number, height: number): Rect {
	const rect = frameRect(frame);
	return { x: rect.x + dx, y: rect.y + dy, width, height };
}

/** A free point inside a frame, `dx`/`dy` from its corner. */
function pointIn(frame: FrameName, dx: number, dy: number): CanvasAnchor {
	const rect = frameRect(frame);
	return { type: "free", x: rect.x + dx, y: rect.y + dy };
}

/** Text of the given size in the middle of its card. */
function centred(fontSize: number): Readonly<Record<string, unknown>> {
	return { fontSize, alignment: "center", verticalAlign: "center" };
}

/** A card painted in a fill, with ink that reads on it. */
function painted(fill: string): Readonly<Record<string, string | null>> {
	return { fill, text: readableInk(fill) };
}

function round(value: number): number {
	return Math.round(value);
}

/** The override `createItem` writes for a card that stands for a Miro item Canvas has no field for. */
function itemOverride(item: LocalItem): Record<string, unknown> {
	const checked = readLocalItem(item);
	if (checked === undefined) throw new Error("welcome board: built an invalid local item");
	return { item: checked };
}

/** A connector with the line tool's own defaults (a plain, one-headed arrow), merged with what the frame asks for. */
function makeConnector(
	next: () => string,
	partial: { readonly from: CanvasAnchor; readonly to: CanvasAnchor } & Partial<BoardConnector>,
): BoardConnector {
	const candidate = { id: next(), route: "straight", color: MIRO.blue, width: 2, startCap: "none", endCap: "stealth", ...partial };
	const checked = readBoardConnector(candidate);
	if (checked === undefined) throw new Error("welcome board: built an invalid connector");
	return checked;
}

/** A pen stroke: `points` are x, y pairs inside a box of the given size. */
function stroke(color: string, width: number, box: { readonly width: number; readonly height: number }, points: readonly number[], opacity?: number): LocalItem {
	return { type: "drawing", stroke: { color, width, ...(opacity === undefined ? {} : { opacity }), box, points: points.map(round) } };
}

/** The document the welcome board writes: nodes, edges and the plugin's own `miroCanvas` record. */
export function buildWelcomeBoard(options: WelcomeBoardOptions = {}): Record<string, unknown> {
	const strings = words().welcome;
	const tools = words().tools;
	const toolbar = words().toolbar;
	const palette = words().palette.builtin;
	const markerNames = words().palette.highlight;
	const nextId = idFactory(options.seed ?? 1);

	const nodes: Record<string, unknown>[] = [];
	const edges: Record<string, unknown>[] = [];
	const overrides: Record<string, Record<string, unknown>> = {};
	const connectors: Record<string, BoardConnector> = {};

	const titles: Readonly<Record<FrameName, string>> = {
		welcome: strings.welcomeTitle, text: strings.textTitle, colours: strings.coloursTitle, stickies: strings.stickiesTitle,
		shapes: strings.shapesTitle, lines: strings.linesTitle, drawing: strings.drawingTitle, layers: strings.layersTitle,
		comments: strings.commentsTitle, code: strings.codeTitle, files: strings.filesTitle, exportAndMiro: strings.exportAndMiroTitle,
	};
	FRAMES.forEach((frame, index) => {
		const rect = frameRect(frame);
		const id = nextId();
		nodes.push({ id, type: "group", x: rect.x, y: rect.y, width: rect.width, height: rect.height, label: `${index + 1}. ${titles[frame]}` });
		overrides[id] = itemOverride({ type: "frame" });
	});

	/** A text card; with a style it looks the way the toolbar would have made it look. */
	const card = (rect: Rect, text: string, style?: CardStyle): string => {
		const id = nextId();
		nodes.push({ id, type: "text", x: round(rect.x), y: round(rect.y), width: round(rect.width), height: round(rect.height), text });
		if (style !== undefined) overrides[id] = { ...style };
		return id;
	};
	/** A card standing for a Miro item: a sticky note, a drawing, a code block, text. */
	const item = (rect: Rect, text: string, local: LocalItem): string => {
		const id = card(rect, text);
		overrides[id] = itemOverride(local);
		return id;
	};
	/** A caption: text as the text tool makes it, on the board itself with no card around it. */
	const caption = (rect: Rect, text: string): string => {
		const id = item(rect, text, { type: "text" });
		overrides[id] = { ...overrides[id], typography: { fontSize: 16, verticalAlign: "center" } };
		return id;
	};
	const connect = (partial: { readonly from: CanvasAnchor; readonly to: CanvasAnchor } & Partial<BoardConnector>): void => {
		const connector = makeConnector(nextId, partial);
		// A native edge, with its override, when both ends hold on to a card -
		// the same choice `placeConnector` (m1-session.ts) makes - or the
		// plugin's own record when they do not.
		if (fitsNativeEdge(connector)) {
			const { edge, override } = nativeEdgeOf(connector);
			edges.push(edge);
			overrides[connector.id] = { ...(overrides[connector.id] ?? {}), ...override };
		} else {
			connectors[connector.id] = connector;
		}
	};

	// 1. Welcome: a banner, one line of words, and the tools by their letters.
	card(within("welcome", 40, 40, 640, 100), "Miro Canvas", {
		typography: { ...centred(44), format: { bold: true } }, colors: { fill: MIRO.blue, text: "#ffffff" },
	});
	caption(within("welcome", 40, 160, 640, 60), strings.welcomeIntro);
	const letters: readonly (readonly [string, string, string])[] = [
		["V", tools.select, MARKER.yellow], ["T", tools.text, MARKER.orange], ["N", tools.sticky, MARKER.pink], ["S", tools.shape, MARKER.violet],
		["P", tools.pen, MARKER.blue], ["L", tools.connector, MARKER.cyan], ["C", tools.comment, MARKER.green], ["F", tools.frame, MARKER.lime],
	];
	letters.forEach(([letter, name, fill], index) => {
		const column = index % 4;
		const row = Math.floor(index / 4);
		card(within("welcome", 40 + column * 165, 240 + row * 110, 145, 90), `**${letter}**\n${name}`, { typography: centred(14), colors: painted(fill) });
	});

	// 2. Text: each font the toolbar offers, written in itself; sizes; the four
	// marks; and where text sits in its card.
	OFFERED_FONT_FAMILIES.forEach((fontFamily, index) => {
		card(within("text", 40 + index * 165, 40, 145, 60), fontLabel(fontFamily), { typography: { ...centred(14), fontFamily } });
	});
	[14, 20, 28, 40].forEach((fontSize, index) => {
		card(within("text", 40 + index * 165, 120, 145, 90), String(fontSize), { typography: centred(fontSize) });
	});
	const marks = [["bold", toolbar.bold], ["italic", toolbar.italic], ["underline", toolbar.underline], ["strike", toolbar.strikethrough]] as const;
	marks.forEach(([mark, name], index) => {
		card(within("text", 40 + index * 165, 230, 145, 60), name, { typography: { ...centred(13), format: { [mark]: true } } });
	});
	const placements = [["left", "top", toolbar.alignLeft], ["center", "center", toolbar.alignCenter], ["right", "bottom", toolbar.alignRight]] as const;
	placements.forEach(([alignment, verticalAlign, name], index) => {
		card(within("text", 40 + index * 220, 310, 200, 130), name, { typography: { fontSize: 16, alignment, verticalAlign } });
	});

	// 3. Colours: text in its colour, marker colours, fills, borders, and Markdown's own marks.
	const inks = [[palette.red, MIRO.red], [palette.orange, MIRO.orange], [palette.blue, MIRO.blue], [palette.purple, MIRO.purple]] as const;
	inks.forEach(([name, text], index) => {
		card(within("colours", 40 + index * 165, 40, 145, 60), name, { typography: { ...centred(15), format: { bold: true } }, colors: { text } });
	});
	const markers = [[markerNames.yellow, MARKER.yellow], [markerNames.green, MARKER.green], [markerNames.pink, MARKER.pink], [markerNames.blue, MARKER.blue]] as const;
	markers.forEach(([name, highlight], index) => {
		card(within("colours", 40 + index * 165, 120, 145, 60), `==${name}==`, { typography: centred(20), colors: { highlight } });
	});
	const fills = [[palette.yellow, MIRO.yellow], [palette.green, MIRO.green], [palette.blue, MIRO.blue], [palette.purple, MIRO.purple]] as const;
	fills.forEach(([name, fill], index) => {
		card(within("colours", 40 + index * 165, 200, 145, 70), name, { typography: centred(15), colors: painted(fill) });
	});
	const borders = [
		["solid", 2, MIRO.blue, toolbar.solidBorder], ["dashed", 4, MIRO.red, toolbar.dashedBorder],
		["dotted", 4, MIRO.green, toolbar.dottedBorder], ["none", 0, undefined, toolbar.noBorder],
	] as const;
	borders.forEach(([borderStyle, borderWidth, border, name], index) => {
		card(within("colours", 40 + index * 165, 290, 145, 70), name, {
			typography: centred(14), borderStyle, ...(border === undefined ? {} : { borderWidth, colors: { border } }),
		});
	});
	card(within("colours", 40, 390, 640, 70), strings.markdownSample);

	// 4. Sticky notes: Miro's colours, and a longer note that fits its text by itself.
	const stickies = [
		["yellow", strings.sticky1], ["orange", strings.sticky2], ["light_pink", strings.sticky3], ["light_green", strings.sticky4],
		["light_blue", strings.sticky5], ["red", strings.sticky6], ["violet", strings.sticky7], ["cyan", strings.stickyLong],
	] as const;
	stickies.forEach(([color, text], index) => {
		const column = index % 4;
		const row = Math.floor(index / 4);
		item(within("stickies", 40 + column * 165, 100 + row * 165, 145, 145), text, { type: "sticky_note", color });
	});

	// 5. Shapes and flowcharts: a gallery of outlines, and a small flow with a loop.
	// Kinds and their flowchart meaning come from shape-catalog.ts's SHAPE_CATALOG.
	const gallery: readonly (readonly [ShapeKind, string])[] = [
		["rectangle", PAPER.blue], ["round_rectangle", PAPER.green], ["circle", PAPER.orange],
		["triangle", PAPER.pink], ["rhombus", PAPER.yellow], ["star", PAPER.gold],
		["hexagon", PAPER.cyan], ["cloud", PAPER.violet], ["right_arrow", PAPER.red],
	];
	gallery.forEach(([kind, fill], index) => {
		const column = index % 3;
		const row = Math.floor(index / 3);
		card(within("shapes", 40 + column * 120, 60 + row * 120, 100, 100), "", { shape: { kind, fallback: "text" }, colors: painted(fill) });
	});
	const flow: readonly (readonly [ShapeKind, string, number, number, string])[] = [
		["flow_chart_terminator", strings.flowStart, 40, 60, PAPER.green],
		["rectangle", strings.flowStep, 150, 60, PAPER.blue],
		["rhombus", strings.flowDecision, 260, 120, PAPER.yellow],
		["flow_chart_terminator", strings.flowDone, 420, 60, PAPER.green],
	];
	const flowIds = flow.map(([kind, text, dy, height, fill]) =>
		card(within("shapes", 400, dy, 220, height), text, { shape: { kind, fallback: "text" }, typography: centred(16), colors: painted(fill) }));
	const flowEdges: readonly (readonly [number, string, number, string, string | undefined])[] = [
		[0, "bottom", 1, "top", strings.flowNext],
		[1, "bottom", 2, "top", undefined],
		[2, "bottom", 3, "top", strings.flowYes],
		[2, "right", 1, "right", strings.flowNo],
	];
	for (const [from, fromSide, to, toSide, label] of flowEdges) {
		edges.push({
			id: nextId(), fromNode: flowIds[from], fromSide, toNode: flowIds[to], toSide,
			...(label === undefined ? {} : { label }),
		});
	}

	// 6. Lines and arrows: a labelled line between two cards, then line styles
	// drawn from point to point - dashes, dots, ends, widths, elbows and curves.
	const fromId = card(within("lines", 40, 40, 180, 80), strings.lineFrom, { typography: centred(18) });
	const toId = card(within("lines", 500, 40, 180, 80), strings.lineTo, { typography: centred(18) });
	connect({
		from: { type: "node", nodeId: fromId, u: 1, v: 0.5 }, to: { type: "node", nodeId: toId, u: 0, v: 0.5 },
		label: strings.lineConnects,
	});
	const styles: readonly Partial<BoardConnector>[] = [
		{},
		{ strokeStyle: "dashed", color: MIRO.red, width: 3, endCap: "arrow" },
		{ strokeStyle: "dotted", color: MIRO.green, width: 3, startCap: "filled_oval", endCap: "filled_triangle" },
		{ color: MIRO.purple, width: 6, startCap: "stealth", endCap: "stealth" },
	];
	styles.forEach((style, index) => {
		const dy = 190 + index * 65;
		connect({ from: pointIn("lines", 60, dy), to: pointIn("lines", 320, dy), ...style });
	});
	connect({ from: pointIn("lines", 400, 180), to: pointIn("lines", 660, 290), route: "elbowed", color: MIRO.orange, label: strings.lineElbowed });
	connect({ from: pointIn("lines", 400, 330), to: pointIn("lines", 660, 400), route: "curved", color: MIRO.purple, width: 3, label: strings.lineCurved });
	caption(within("lines", 40, 440, 640, 40), strings.linesHint);

	// 7. Drawing: pen strokes in three colours, then highlighter strokes, each
	// row named by its tool.  A stroke is an item of its own: nothing here
	// lies over a card, where it would look like part of it.
	{
		const box = { width: 300, height: 120 };
		const points: number[] = [];
		for (let index = 0; index <= 12; index += 1) {
			const t = index / 12;
			points.push(t * box.width, box.height / 2 - Math.sin(t * Math.PI * 2) * box.height * 0.35);
		}
		item(within("drawing", 60, 40, box.width, box.height), "", stroke(MIRO.blue, 4, box, points));
	}
	{
		const box = { width: 110, height: 90 };
		item(within("drawing", 410, 55, box.width, box.height), "", stroke(MIRO.green, 6, box, [0, 50, 40, 90, 110, 0]));
	}
	{
		const box = { width: 110, height: 110 };
		const points: number[] = [];
		for (let index = 0; index <= 24; index += 1) {
			const angle = (index / 24) * Math.PI * 2;
			points.push(55 + Math.cos(angle) * 50, 55 + Math.sin(angle) * 50);
		}
		item(within("drawing", 560, 45, box.width, box.height), "", stroke(MIRO.red, 4, box, points));
	}
	caption(within("drawing", 40, 170, 640, 36), tools.pen);
	{
		const box = { width: 280, height: 60 };
		item(within("drawing", 60, 240, box.width, box.height), "", stroke(MIRO.yellow, 22, box, [0, 45, 70, 15, 140, 45, 210, 15, 280, 45], 0.5));
	}
	{
		const box = { width: 280, height: 60 };
		item(within("drawing", 400, 240, box.width, box.height), "", stroke(MIRO.green, 22, box, [0, 30, 280, 30], 0.5));
	}
	caption(within("drawing", 40, 320, 640, 36), tools.highlighter);
	caption(within("drawing", 40, 420, 640, 40), strings.drawingHint);

	// 8. Layers and locking: three overlapping cards, back to front by their
	// order in `nodes`, and a locked one beside them.
	const layers = [[strings.layerBack, PAPER.blue], [strings.layerMiddle, PAPER.yellow], [strings.layerFront, PAPER.rose]] as const;
	layers.forEach(([text, fill], index) => {
		card(within("layers", 60 + index * 100, 40 + index * 70, 240, 150), text, { typography: { fontSize: 18 }, colors: painted(fill) });
	});
	card(within("layers", 510, 60, 170, 110), strings.lockedCard, { typography: centred(15), colors: painted(MARKER.gray), locked: true });
	caption(within("layers", 40, 400, 640, 60), strings.layersHint);

	// 9. Comments: one pinned to a card, with a reply, and one on the empty
	// board - built with the same mutations the comments panel calls.
	const commentCardId = card(within("comments", 200, 120, 320, 140), strings.commentCard, { typography: centred(18) });
	let commentsMetadata: Record<string, unknown> = { schemaVersion: MIRO_CANVAS_SCHEMA_VERSION };
	const commentOptions = { idFactory: () => nextId(), now: () => FIXED_TIMESTAMP };
	const addedComment = addLocalComment(
		commentsMetadata,
		{ text: strings.comment, anchor: { type: "node", nodeId: commentCardId, u: 0.9, v: 0.1 } },
		commentOptions,
	);
	if (!addedComment.ok || addedComment.metadata === undefined || addedComment.comment === undefined) {
		throw new Error("welcome board: the pinned comment was rejected");
	}
	commentsMetadata = addedComment.metadata;
	const addedReply = addReply(commentsMetadata, addedComment.comment.id, strings.reply, commentOptions);
	if (!addedReply.ok || addedReply.metadata === undefined) {
		throw new Error("welcome board: the reply was rejected");
	}
	commentsMetadata = addedReply.metadata;
	const addedAnywhere = addLocalComment(commentsMetadata, { text: strings.commentAnywhere, anchor: pointIn("comments", 560, 380) }, commentOptions);
	if (!addedAnywhere.ok || addedAnywhere.metadata === undefined) {
		throw new Error("welcome board: the comment on the empty board was rejected");
	}
	commentsMetadata = addedAnywhere.metadata;

	// 10. Code and tables: a code block with a title, and a Markdown table.
	item(within("code", 40, 40, 640, 120), "```js\n" + strings.codeBody + "\n```", { type: "code", title: strings.codeFileName });
	{
		const table = [
			`| ${strings.tableStep} | ${strings.tableStatus} |`,
			"| --- | --- |",
			`| ${strings.tableImport} | ${strings.tableImportStatus} |`,
			`| ${strings.tableStyle} | ${strings.tableStyleStatus} |`,
		].join("\n");
		item(within("code", 40, 200, 640, 160), table, { type: "table", title: strings.tableTitle });
	}

	// 11. Files and notes: native Canvas file nodes, pointing at the sample
	// folder `createWelcomeBoard` writes alongside this board - a note,
	// another canvas, and the three attachment kinds Canvas already knows how
	// to show.  Sizes stay "about" the ones asked for: the frame has no room
	// to spare once a page-tall PDF preview sits beside everything else.
	const samples = options.samples ?? welcomeSamplePaths();
	const fileNode = (rect: Rect, path: string): void => {
		nodes.push({ id: nextId(), type: "file", file: path, x: round(rect.x), y: round(rect.y), width: round(rect.width), height: round(rect.height) });
	};
	fileNode(within("files", 40, 40, 300, 160), samples.note);
	fileNode(within("files", 380, 40, 300, 160), samples.canvas);
	fileNode(within("files", 40, 220, 200, 140), samples.picture);
	fileNode(within("files", 260, 220, 200, 200), samples.pdf);
	fileNode(within("files", 480, 220, 200, 120), samples.docx);
	caption(within("files", 40, 430, 640, 60), strings.filesHint);

	// 12. Export and Miro import: where each one lives, one card apiece,
	// stacked in the frame that used to hold "Export" and "Bring your Miro
	// boards" on their own.
	card(within("exportAndMiro", 40, 40, 640, 140), strings.exportHint, { typography: centred(20) });
	card(within("exportAndMiro", 40, 220, 640, 140), strings.fromMiroHint, { typography: { ...centred(22), format: { bold: true } }, colors: painted(MIRO.yellow) });

	// The export pages: one A4 sheet over Welcome, one over Sticky notes, so
	// the export panel opens with something to show.
	const ratio = paperRatio("a4", "landscape");
	const exportPages: ExportPageRecord[] = (["welcome", "stickies"] as const).map((frame) => ({
		id: nextId(), ...pageAround(frameRect(frame), ratio, 40), name: titles[frame],
	}));
	const exportState: ExportState = { format: "a4", orientation: "landscape", quality: "standard", pages: exportPages };

	const miroCanvas: Record<string, unknown> = {
		schemaVersion: MIRO_CANVAS_SCHEMA_VERSION,
		localOverrides: overrides,
		localComments: Array.isArray(commentsMetadata.localComments) ? commentsMetadata.localComments : [],
		connectors,
		export: exportRecord(exportState),
	};
	const validated = validateMiroCanvasMetadata(miroCanvas);
	if (!validated.valid) {
		throw new Error(`welcome board: invalid metadata (${validated.diagnostics.map((entry) => entry.message).join("; ")})`);
	}
	return { nodes, edges, miroCanvas: validated.metadata };
}

export interface WelcomeBoardHost {
	readonly app: App;
	/** The `instanceof TFile` check, passed in so this module never has to import "obsidian" at runtime. */
	readonly isFile: (value: unknown) => value is TFile;
	/**
	 * Obsidian's own path normalisation, lent the same way as `isFile` so this
	 * module never imports "obsidian" as a value.  Falls back to a plain
	 * slash cleanup - every path here is built by this module itself, from
	 * fixed names and the locale, never from outside input - when a host
	 * does not pass one.
	 */
	readonly normalizePath?: (path: string) => string;
}

/** The slash cleanup `normalizePath` does, for a host that has not lent the real one. */
function fallbackNormalizePath(path: string): string {
	return path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/+|\/+$/g, "");
}

/** A sample's bytes as `createBinary` wants them: an `ArrayBuffer`, not the `Uint8Array` it decodes to. */
function sampleBytes(base64: string): ArrayBuffer {
	const bytes = decodeWelcomeSample(base64);
	// This module's own decode always allocates a plain, whole ArrayBuffer -
	// never a SharedArrayBuffer or a view into a larger one - so the slice
	// below only ever produces an ArrayBuffer.
	return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/** Creates one sample file if it is missing; a file already there is kept exactly as it is. */
async function createSampleFile(host: WelcomeBoardHost, path: string, write: (path: string) => Promise<unknown>): Promise<void> {
	const normalize = host.normalizePath ?? fallbackNormalizePath;
	const normalized = normalize(path);
	if (host.app.vault.getAbstractFileByPath(normalized) !== null) return;
	await write(normalized);
}

/**
 * Writes the sample folder and the files in it that the "Files and notes"
 * frame points at - a note, a small canvas, a picture, a PDF and a Word
 * document - creating only what is missing.  Returns the paths whether or
 * not anything had to be written, so `buildWelcomeBoard` always points at
 * where the samples now are.
 */
export async function createWelcomeSamples(host: WelcomeBoardHost): Promise<WelcomeSamplePaths> {
	const paths = welcomeSamplePaths();
	const normalize = host.normalizePath ?? fallbackNormalizePath;
	const folder = normalize(paths.folder);
	if (host.app.vault.getAbstractFileByPath(folder) === null) {
		await host.app.vault.createFolder(folder);
	}
	await createSampleFile(host, paths.note, (path) => host.app.vault.create(path, sampleNoteContent()));
	await createSampleFile(host, paths.canvas, (path) => host.app.vault.create(path, sampleCanvasContent()));
	await createSampleFile(host, paths.picture, (path) => host.app.vault.createBinary(path, sampleBytes(WELCOME_SAMPLE_PNG_BASE64)));
	await createSampleFile(host, paths.pdf, (path) => host.app.vault.createBinary(path, sampleBytes(WELCOME_SAMPLE_PDF_BASE64)));
	await createSampleFile(host, paths.docx, (path) => host.app.vault.createBinary(path, sampleBytes(WELCOME_SAMPLE_DOCX_BASE64)));
	return paths;
}

/**
 * Writes the welcome board's sample folder and files, then the board itself,
 * and opens the board.  A file already at its path - the board, or any one
 * sample - is opened or kept exactly as it is, never overwritten or
 * rewritten; a missing one is created.  These, on the person's own press,
 * are the only files this module ever writes.
 */
export async function createWelcomeBoard(host: WelcomeBoardHost): Promise<TFile> {
	await createWelcomeSamples(host);
	const path = words().welcome.fileName;
	const existing = host.app.vault.getAbstractFileByPath(path);
	const file = host.isFile(existing) ? existing : await host.app.vault.create(path, JSON.stringify(buildWelcomeBoard(), null, "\t"));
	if (!host.isFile(file)) throw new Error("welcome board: the written file is not a TFile");
	const leaf = host.app.workspace.getLeaf("tab");
	await leaf.openFile(file, { active: true });
	return file;
}
