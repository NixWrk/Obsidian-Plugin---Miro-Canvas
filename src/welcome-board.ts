/**
 * The optional welcome board: twelve practical sections and a sandbox,
 * with real notes, cards, lines and files to try.
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
 * folder of sample files (welcome-samples.ts and welcome-export-samples.ts
 * hold the binary bytes;
 * `sampleNoteContent`/`sampleCanvasContent` below build the text ones) that
 * `createWelcomeBoard` writes next to the board, on the same press, so the
 * frame never points at a file that does not exist.
 */

import type { App, TFile } from "obsidian";

import type { CanvasAnchor } from "./anchors";
import { readBoardConnector, nativeEdgeOf, fitsNativeEdge, type BoardConnector } from "./board-connectors";
import type { CanvasShapeDescriptor } from "./canvas-authoring";
import { exportRecord, pageAround, paperRatio, type ExportPageRecord, type ExportState } from "./export-pages";
import { currentLocale, words } from "./i18n";
import { idFactory } from "./importers/board-builder";
import { readLocalItem, type LocalItem } from "./local-items";
import { addLocalComment, addReply, resolveComment } from "./local-comments";
import { MIRO_CANVAS_SCHEMA_VERSION, validateMiroCanvasMetadata } from "./metadata";
import { readableInk } from "./miro-palette";
import { WELCOME_SAMPLE_DOCX_BASE64, WELCOME_SAMPLE_PDF_BASE64, WELCOME_SAMPLE_PNG_BASE64, decodeWelcomeSample } from "./welcome-samples";
import { WELCOME_EXPORTS } from "./welcome-export-samples";

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
	readonly exportPdf: string;
	readonly exportPptx: string;
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
		exportPdf: `${folder}/Board-export.pdf`,
		exportPptx: `${folder}/Board-export.pptx`,
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

/** Introduction, twelve sections in two columns, and a place to try things. */
const FRAMES = ["welcome", "start", "plan", "files", "appearance", "drawing", "comments", "settings", "exportAndMiro", "selection", "content", "navigation", "preferences", "sandbox"] as const;
type FrameName = (typeof FRAMES)[number];
const FRAME_WIDTH = 900;
const FRAME_HEIGHT = 700;
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

function frameRect(frame: FrameName): Rect {
	if (frame === "welcome") return { x: 0, y: 0, width: FRAME_WIDTH * 2 + GAP, height: 600 };
	if (frame === "sandbox") return { x: 0, y: 5360, width: FRAME_WIDTH * 2 + GAP, height: FRAME_HEIGHT };
	const index = FRAMES.indexOf(frame) - 1;
	return { x: (index % 2) * (FRAME_WIDTH + GAP), y: 680 + Math.floor(index / 2) * (FRAME_HEIGHT + GAP), width: FRAME_WIDTH, height: FRAME_HEIGHT };
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
function stroke(color: string, width: number, box: { readonly width: number; readonly height: number }, points: readonly number[], opacity?: number, widths?: readonly number[]): LocalItem {
	return { type: "drawing", stroke: { color, width, ...(opacity === undefined ? {} : { opacity }), ...(widths === undefined ? {} : { widths }), box, points: points.map(round) } };
}

/** The document the welcome board writes: nodes, edges and the plugin's own `miroCanvas` record. */
export function buildWelcomeBoard(options: WelcomeBoardOptions = {}): Record<string, unknown> {
	const strings = words().welcome;
	const nextId = idFactory(options.seed ?? 1);

	const nodes: Record<string, unknown>[] = [];
	const edges: Record<string, unknown>[] = [];
	const overrides: Record<string, Record<string, unknown>> = {};
	const connectors: Record<string, BoardConnector> = {};

	const titles: Readonly<Record<FrameName, string>> = {
		welcome: strings.welcomeTitle, start: strings.startTitle, plan: strings.planTitle, appearance: strings.appearanceTitle,
		drawing: strings.drawingTitle, comments: strings.discussionTitle, settings: strings.settingsTitle,
		files: strings.notesTitle, exportAndMiro: strings.shareTitle, sandbox: strings.sandboxTitle,
		selection: strings.selectionTitle, content: strings.contentTitle, navigation: strings.navigationTitle, preferences: strings.preferencesTitle,
	};
	FRAMES.forEach((frame, index) => {
		const rect = frameRect(frame);
		const id = nextId();
		nodes.push({ id, type: "group", x: rect.x, y: rect.y, width: rect.width, height: rect.height, label: index > 0 && index < FRAMES.length - 1 ? `${index}. ${titles[frame]}` : titles[frame] });
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

	const samples = options.samples ?? welcomeSamplePaths();
	const fileNode = (rect: Rect, path: string): void => {
		nodes.push({ id: nextId(), type: "file", file: path, ...rect });
	};
	const explanation = (frame: FrameName, text: string, dy = 360, height = 280): void => {
		const id = caption(within(frame, 40, dy, frameRect(frame).width - 80, height), text);
		overrides[id] = { ...overrides[id], typography: { fontSize: 22, verticalAlign: "top" } };
	};
	const hero = caption(within("welcome", 40, 30, 1800, 100), strings.hero);
	overrides[hero] = { ...overrides[hero], typography: { fontSize: 42, format: { bold: true } } };
	explanation("welcome", strings.heroIntro, 150, 70);
	const origins = [[strings.fromMiro, strings.miroIntro], [strings.fromObsidian, strings.obsidianIntro], [strings.yourWay, strings.deviceIntro]] as const;
	origins.forEach(([title, body], index) => {
		const id = caption(within("welcome", 40 + index * 610, 250, 580, 220), `**${title}**\n\n${body}`);
		overrides[id] = { ...overrides[id], typography: { fontSize: 24 } };
	});
	const route = caption(within("welcome", 40, 510, 1800, 60), strings.route);
	overrides[route] = { ...overrides[route], typography: { fontSize: 22, verticalAlign: "center" } };
	for (const y of [230, 490]) connect({ from: pointIn("welcome", 40, y), to: pointIn("welcome", 1840, y), color: "#747474", width: 1, endCap: "none" });
	const startTitle = caption(within("start", 40, 40, 820, 80), strings.startIntro);
	overrides[startTitle] = { ...overrides[startTitle], typography: { fontSize: 32 } };
	[["N", strings.startSticky], ["L", strings.startConnect], ["↶", strings.startUndo]].forEach(([key, text], index) => {
		card(within("start", 40, 150 + index * 130, 64, 64), key, { shape: { kind: "round_rectangle", fallback: "text" }, typography: centred(26) });
		const id = caption(within("start", 130, 140 + index * 130, 720, 110), text);
		overrides[id] = { ...overrides[id], typography: { fontSize: 21 } };
	});
	caption(within("start", 40, 565, 820, 100), strings.startEscape);
	const first = item(within("plan", 40, 40, 210, 210), strings.meetingIdea, { type: "sticky_note", color: "yellow" });
	const second = item(within("plan", 345, 40, 210, 210), strings.meetingStep, { type: "sticky_note", color: "light_blue" });
	const third = item(within("plan", 650, 40, 210, 210), strings.meetingDone, { type: "sticky_note", color: "light_green" });
	for (const id of [first, second, third]) overrides[id] = { ...overrides[id], typography: centred(22) };
	for (const [from, to] of [[first, second], [second, third]]) {
		connect({ from: { type: "node", nodeId: from, u: 1, v: 0.5 }, to: { type: "node", nodeId: to, u: 0, v: 0.5 } });
	}
	fileNode(within("plan", 40, 250, 820, 210), samples.note);
	explanation("plan", strings.planHint, 490, 160);
	card(within("appearance", 40, 40, 270, 220), strings.important, { typography: { fontSize: 30, fontFamily: "Inter", format: { bold: true } }, colors: { highlight: MARKER.yellow } });
	card(within("appearance", 365, 70, 200, 160), strings.flowYes, { shape: { kind: "rhombus", fallback: "text" }, typography: centred(22), colors: painted(PAPER.green) });
	const rotatedSticky = item(within("appearance", 640, 45, 200, 200), strings.rotateAction, { type: "sticky_note", color: "light_pink" });
	overrides[rotatedSticky] = { ...overrides[rotatedSticky], rotation: -12 };
	connect({ from: pointIn("appearance", 60, 315), to: { type: "node", nodeId: rotatedSticky, u: 0, v: 0.5 }, route: "elbowed", color: MIRO.purple, width: 3, label: strings.rotateHint, labelT: 0.45, endCap: "filled_triangle" });
	explanation("appearance", strings.appearanceHint, 410, 240);
	const arrowStart = card(within("drawing", 40, 40, 150, 90), strings.lineStart, { typography: centred(22), colors: painted("#e8edf5") });
	const arrowEnd = card(within("drawing", 710, 40, 150, 90), strings.lineEnd, { typography: centred(22), colors: painted("#edeaf5") });
	connect({ from: { type: "node", nodeId: arrowStart, u: 1, v: 0.5 }, to: { type: "node", nodeId: arrowEnd, u: 0, v: 0.5 }, color: MIRO.blue, width: 2, label: strings.labelOnArrow, endCap: "stealth" });
	connect({ from: pointIn("drawing", 40, 190), to: pointIn("drawing", 860, 190), color: MIRO.purple, width: 4, label: strings.labelMoved, labelT: 0.72, startCap: "filled_oval", endCap: "triangle" });
	connect({ from: pointIn("drawing", 40, 290), to: { type: "node", nodeId: arrowEnd, u: 0.5, v: 1 }, route: "curved", waypoints: [{ x: frameRect("drawing").x + 430, y: frameRect("drawing").y + 370 }], color: MIRO.orange, width: 3, label: strings.labelBent, labelT: 0.38, strokeStyle: "dashed", startCap: "diamond", endCap: "filled_triangle" });
	caption(within("drawing", 40, 405, 820, 90), strings.tryLine);
	item(within("drawing", 40, 475, 360, 50), "", stroke(MIRO.blue, 10, { width: 360, height: 50 }, [5, 35, 55, 10, 110, 40, 180, 15, 250, 40, 355, 5], undefined, [2, 4, 10, 8, 4, 2]));
	item(within("drawing", 480, 485, 340, 24), "", stroke(MIRO.yellow, 22, { width: 340, height: 24 }, [0, 12, 340, 12], 0.5));
	const drawingHint = caption(within("drawing", 40, 535, 820, 155), strings.drawingPractice);
	overrides[drawingHint] = { ...overrides[drawingHint], typography: { fontSize: 16, verticalAlign: "top" } };
	const commentCardId = card(within("comments", 40, 70, 390, 180), strings.meetingPlace, { typography: centred(28), colors: painted("#e8edf5") });
	const lockedCardId = card(within("comments", 480, 70, 380, 180), strings.lockedCard, { typography: centred(24), locked: true, colors: painted(MARKER.gray) });
	caption(within("comments", 40, 270, 390, 90), strings.tryComment);
	caption(within("comments", 480, 270, 380, 70), strings.tryLocked);
	const discussionHint = caption(within("comments", 40, 425, 820, 250), `${strings.discussionHint}\n\n${strings.commentListHint}`);
	overrides[discussionHint] = { ...overrides[discussionHint], typography: { fontSize: 18, verticalAlign: "top" } };
	let commentsMetadata: Record<string, unknown> = { schemaVersion: MIRO_CANVAS_SCHEMA_VERSION };
	const commentOptions = { idFactory: () => nextId(), now: () => FIXED_TIMESTAMP };
	const addedComment = addLocalComment(
		commentsMetadata,
		{ text: strings.meetingComment, anchor: { type: "node", nodeId: commentCardId, u: 0.9, v: 0.1 } },
		commentOptions,
	);
	if (!addedComment.ok || addedComment.metadata === undefined || addedComment.comment === undefined) {
		throw new Error("welcome board: the pinned comment was rejected");
	}
	commentsMetadata = addedComment.metadata;
	const addedReply = addReply(commentsMetadata, addedComment.comment.id, strings.meetingReply, commentOptions);
	if (!addedReply.ok || addedReply.metadata === undefined) {
		throw new Error("welcome board: the reply was rejected");
	}
	commentsMetadata = addedReply.metadata;
	const addedAnywhere = addLocalComment(commentsMetadata, { text: strings.commentAnywhere, anchor: pointIn("comments", 60, 385) }, commentOptions);
	if (!addedAnywhere.ok || addedAnywhere.metadata === undefined) {
		throw new Error("welcome board: the comment on the empty board was rejected");
	}
	commentsMetadata = addedAnywhere.metadata;
	const finished = addLocalComment(commentsMetadata, { text: strings.resolvedComment, anchor: { type: "node", nodeId: lockedCardId, u: 0.9, v: 0.1 } }, commentOptions);
	if (!finished.ok || finished.metadata === undefined || finished.comment === undefined) {
		throw new Error("welcome board: the completed comment was rejected");
	}
	const resolved = resolveComment(finished.metadata, finished.comment.id, commentOptions);
	if (!resolved.ok || resolved.metadata === undefined) throw new Error("welcome board: resolving the comment failed");
	commentsMetadata = resolved.metadata;
	const resolvedHint = caption(within("comments", 480, 350, 380, 70), strings.resolvedHint);
	overrides[resolvedHint] = { ...overrides[resolvedHint], typography: { fontSize: 16 } };

	card(within("settings", 40, 40, 820, 100), strings.devices, { typography: centred(24), colors: painted("#e7efee") });
	const settingsHint = caption(within("settings", 40, 180, 820, 500), `${strings.settingsSteps}\n\n${strings.panelOptionsHint}`);
	overrides[settingsHint] = { ...overrides[settingsHint], typography: { fontSize: 18, verticalAlign: "top" } };
	fileNode(within("files", 40, 40, 380, 170), samples.canvas);
	card(within("files", 460, 40, 400, 170), `[[${samples.note.replace(/\.md$/, "")}|${strings.openSampleNote}]]`, { typography: centred(22) });
	caption(within("files", 40, 215, 380, 80), strings.tryCanvas);
	caption(within("files", 460, 215, 400, 80), strings.tryNoteLink);
	fileNode(within("files", 40, 315, 200, 160), samples.picture);
	fileNode(within("files", 270, 315, 210, 220), samples.pdf);
	fileNode(within("files", 520, 285, 160, 140), samples.docx);
	item(within("files", 520, 430, 340, 120), `| ${strings.tableStep} | ${strings.tableStatus} |\n| --- | --- |\n| ${strings.meetingPlace} | ${strings.tableStyleStatus} |`, { type: "table" });
	const filesHint = caption(within("files", 40, 560, 820, 130), `${strings.notesPractice}\n\n${strings.fileFromDeviceHint}`);
	overrides[filesHint] = { ...overrides[filesHint], typography: { fontSize: 16, verticalAlign: "top" } };
	fileNode(within("exportAndMiro", 40, 40, 390, 245), samples.exportPdf);
	fileNode(within("exportAndMiro", 470, 40, 390, 155), samples.exportPptx);
	caption(within("exportAndMiro", 470, 210, 390, 95), strings.exportFilesHint);
	const exportHint = caption(within("exportAndMiro", 40, 325, 820, 340), strings.shareSteps);
	overrides[exportHint] = { ...overrides[exportHint], typography: { fontSize: 18, verticalAlign: "top" } };
	const group = within("selection", 40, 40, 820, 270);
	nodes.push({ id: nextId(), type: "group", ...group, label: strings.frameTryTitle });
	const groupStart = item(within("selection", 80, 90, 160, 160), strings.sandboxMove, { type: "sticky_note", color: "yellow" });
	const groupEnd = item(within("selection", 540, 90, 160, 160), strings.sandboxConnect, { type: "sticky_note", color: "light_blue" });
	connect({ from: { type: "node", nodeId: groupStart, u: 1, v: 0.5 }, to: { type: "node", nodeId: groupEnd, u: 0, v: 0.5 } });
	const selectionHint = caption(within("selection", 40, 350, 820, 320), strings.selectionHint);
	overrides[selectionHint] = { ...overrides[selectionHint], typography: { fontSize: 20, verticalAlign: "top" } };
	card(within("content", 40, 40, 390, 220), `${strings.markdownSample}\n\n$$E = mc^2$$`);
	item(within("content", 470, 40, 390, 220), strings.codeSample, { type: "code" });
	card(within("content", 40, 285, 820, 70), strings.websiteSample);
	const contentHint = caption(within("content", 40, 390, 820, 270), strings.contentHint);
	overrides[contentHint] = { ...overrides[contentHint], typography: { fontSize: 20, verticalAlign: "top" } };
	const navigationHint = caption(within("navigation", 40, 40, 820, 475), strings.navigationHint);
	overrides[navigationHint] = { ...overrides[navigationHint], typography: { fontSize: 20, verticalAlign: "top" } };
	caption(within("navigation", 40, 545, 820, 125), strings.lineSettingsHint);
	const preferencesHint = caption(within("preferences", 40, 40, 820, 620), strings.preferencesHint);
	overrides[preferencesHint] = { ...overrides[preferencesHint], typography: { fontSize: 20, verticalAlign: "top" } };
	explanation("sandbox", strings.sandboxHint, 40, 130);
	item(within("sandbox", 80, 250, 250, 250), strings.sandboxMove, { type: "sticky_note", color: "yellow" });
	item(within("sandbox", 520, 250, 250, 250), strings.sandboxConnect, { type: "sticky_note", color: "light_blue" });
	const sandboxRotate = item(within("sandbox", 960, 250, 250, 250), strings.sandboxRotate, { type: "sticky_note", color: "light_green" });
	overrides[sandboxRotate] = { ...overrides[sandboxRotate], rotation: 10 };
	const ratio = paperRatio("a4", "landscape");
	const exportPages: ExportPageRecord[] = (["welcome", "plan"] as const).map((frame) => ({
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
 * document and actual PDF/PPTX exports - creating only what is missing. Returns the paths whether or
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
	const exports = WELCOME_EXPORTS[currentLocale()];
	await createSampleFile(host, paths.exportPdf, (path) => host.app.vault.createBinary(path, sampleBytes(exports.pdf)));
	await createSampleFile(host, paths.exportPptx, (path) => host.app.vault.createBinary(path, sampleBytes(exports.pptx)));
	return paths;
}

/**
 * Writes the welcome board's sample folder and files, then the board itself,
 * and opens the board.  A file already at its path - the board, or any one
 * sample - is opened or kept exactly as it is, never overwritten or
 * rewritten; a missing one is created.  These, on the person's own press,
 * are the only files this module ever writes. A fresh request picks an unused
 * numbered path for the board, keeping older copies and their edits.
 */
export async function createWelcomeBoard(host: WelcomeBoardHost, fresh = false): Promise<TFile> {
	await createWelcomeSamples(host);
	let path = words().welcome.fileName;
	if (fresh) {
		const base = path.replace(/\.canvas$/, "");
		for (let copy = 2; host.app.vault.getAbstractFileByPath(path) !== null; copy += 1) {
			path = `${base} (${copy}).canvas`;
		}
	}
	const existing = host.app.vault.getAbstractFileByPath(path);
	const file = host.isFile(existing) ? existing : await host.app.vault.create(path, JSON.stringify(buildWelcomeBoard(), null, "\t"));
	if (!host.isFile(file)) throw new Error("welcome board: the written file is not a TFile");
	const leaf = host.app.workspace.getLeaf("tab");
	await leaf.openFile(file, { active: true });
	if (existing === null) {
		// Native Canvas fits the whole board on first open; start at readable text.
		const view = leaf.view as unknown as {
			readonly containerEl?: { readonly clientWidth: number };
			readonly canvas?: { zoomToBbox?: (bounds: { minX: number; minY: number; maxX: number; maxY: number }) => void };
		};
		const canvas = view?.canvas;
		if (typeof canvas?.zoomToBbox === "function") {
			const width = view.containerEl?.clientWidth;
			if (typeof width === "number" && width > 0 && width < 500) {
				const start = frameRect("start");
				canvas.zoomToBbox({ minX: start.x - 40, minY: start.y - 40, maxX: start.x + start.width + 40, maxY: start.y + start.height + 40 });
			} else {
				const introduction = frameRect("welcome");
				canvas.zoomToBbox({ minX: -40, minY: -40, maxX: introduction.width + 40, maxY: frameRect("plan").y + FRAME_HEIGHT + 40 });
			}
		}
	}
	return file;
}
