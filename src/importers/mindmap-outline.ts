/**
 * A mind map kept as an outline: a note whose property `mindmap-plugin` is
 * `basic`, as Enhancing Mindmap writes every map and Markmind writes a map
 * in its basic mode (its outline and table views are the same file with a
 * `display-mode` property).  The map is the note's headings and lists: a
 * heading's level sets its depth, list items go one level deeper than the
 * heading above them and deeper again as they are indented.
 *
 * Each heading and list item becomes one card, sized from its text, joined
 * to its parent by a curved line with no arrowhead, and the whole map is
 * laid out anew as a tree growing to the right (the note keeps no
 * positions).  The root is drawn as Miro draws a map's centre: bold, large,
 * on Miro's blue.
 *
 * What the files look like, as Enhancing Mindmap (MIT) writes them in
 * `getMarkdown` (src/mindmap/mindmap.ts) and reads them back through
 * markmap's transformer (src/MindMapView.ts):
 * - levels above the "heading level" setting are `#` headings, deeper ones
 *   `- ` list items indented with one tab per level;
 * - a node of several lines is written as its first line after the `- `
 *   and the rest on lines of their own at the item's indentation; a node
 *   that is code is a bare `-` with the fence indented two spaces under it;
 * - an empty node is a bare `-`, indented three spaces per level;
 * - a folded node ends its last line with ` ^<id>`: the id marks it folded.
 *
 * Every non-empty line of the note ends on the board or in the report:
 * cards are bound to their first line (`mindmap-outline:line:<n>`), and a
 * line of a card's text past the first belongs to that card.
 */

import { readableInk } from "../miro-palette";
import { BoardBuilder, type BoardRect } from "./board-builder";
import type { FormatAdapter, ImportContext, ImportResult, ImportSource } from "./types";

/** The property the mind-map plugins mark their notes with. */
const FORMAT_PROPERTY = "mindmap-plugin";
/** Its value for a map kept as headings and lists. */
const OUTLINE_FORMAT = "basic";

/** Miro's blue, the colour of a map's centre. */
const ROOT_FILL = "#4262ff";
const ROOT_FONT_SIZE = 24;
/** Obsidian's own size for a card's text. */
const CARD_FONT_SIZE = 16;

/** How wide a card may be: narrower cards look like chips, wider ones like pages. */
const MIN_CARD_WIDTH = 120;
const MAX_CARD_WIDTH = 360;
const MIN_CARD_HEIGHT = 60;
const MIN_ROOT_HEIGHT = 80;
/** The card's own padding around its text, both sides together. */
const CARD_PADDING_X = 40;
const CARD_PADDING_Y = 32;
const LINE_HEIGHT = 1.5;
/** Rough advance of one character, as a share of the font size. */
const NARROW_CHARACTER = 0.55;
const WIDE_CHARACTER = 1;
const BOLD_FACTOR = 1.08;

/** From a card's right side to its children's left sides. */
const LEVEL_GAP = 80;
/** Between two branches of the same card. */
const SIBLING_GAP = 24;
/** Between two maps of one note, and the note's opening text. */
const TREE_GAP = 160;

/** A tab indents to the next multiple of four columns, as in CommonMark. */
const TAB_WIDTH = 4;
/** Enhancing Mindmap indents an empty node three spaces per level where the others get a tab. */
const EMPTY_NODE_INDENT = 3;

export type OutlineNodeKind = "heading" | "list item" | "text";

/** One card of the map: a heading, a list item, or the text before the map. */
export interface OutlineNode {
	readonly kind: OutlineNodeKind;
	/** The line it starts on, counting from 1 over the whole file. */
	readonly line: number;
	/** Its text, as the card shows it. */
	text: string;
	/** Every line of the file it took, the first included. */
	readonly lines: number[];
	readonly children: OutlineNode[];
	/** Whether the map had it folded (Enhancing Mindmap's ` ^id`). */
	folded: boolean;
}

/** A note property other than the format mark: kept on the note, not on the board. */
export interface OutlineProperty {
	readonly key: string;
	readonly line: number;
	/** Its lines, the key's own and those of a value spread over several. */
	readonly lines: number[];
}

export interface ParsedOutline {
	/** The value of `mindmap-plugin` as the note's properties give it, when they do. */
	readonly format?: string;
	/** The properties block's own lines: its fences, the format mark, comments. */
	readonly frontmatterLines: readonly number[];
	readonly properties: readonly OutlineProperty[];
	/** The text before the map's first heading (or first item, when there is no heading). */
	readonly preamble?: OutlineNode;
	/** One map per root; the first is the map, the rest extra roots. */
	readonly roots: readonly OutlineNode[];
}

type LineClass =
	| { readonly kind: "blank" }
	/** A line of a code fence, its opening line marked. */
	| { readonly kind: "fence"; readonly opens: boolean }
	| { readonly kind: "heading"; readonly level: number; readonly text: string }
	| { readonly kind: "item"; readonly indent: number; readonly text: string }
	| { readonly kind: "text" };

const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/u;
const LIST_ITEM = /^([ \t]*)(?:[-*+]|\d{1,9}[.)])(?:[ \t]+(.*))?$/u;
const FENCE_OPEN = /^([ \t]*)(`{3,}|~{3,})/u;
/** A closing fence; Enhancing Mindmap may write a folded code node's ` ^id` after it. */
const FENCE_CLOSE = /^[ \t]*(`{3,}|~{3,})[ \t]*(?:\^[A-Za-z0-9-]+)?[ \t]*$/u;
/** Enhancing Mindmap's mark of a folded node, at the end of its last line. */
const FOLD_MARK = / \^([A-Za-z0-9-]+)$/u;
const PROPERTY_KEY = /^([^\s#:][^:]*?)[ \t]*:(.*)$/u;

/** A heading's text without CommonMark's optional closing run of `#`. */
function headingText(raw: string | undefined): string {
	if (raw === undefined) return "";
	return raw.replace(/(?:^|[ \t]+)#+[ \t]*$/u, "").trim();
}

/** Columns of leading whitespace, a tab reaching the next tab stop. */
function indentWidth(whitespace: string): number {
	let columns = 0;
	for (const character of whitespace) {
		if (character === "\t") columns += TAB_WIDTH - (columns % TAB_WIDTH);
		else columns += 1;
	}
	return columns;
}

/** A property value without the quotes YAML may put round it. */
function unquoted(value: string): string {
	const trimmed = value.trim();
	const quoted = /^(["'])(.*)\1$/u.exec(trimmed);
	return quoted === null ? trimmed : quoted[2];
}

/** The mark some editors put at a file's very start. */
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);

/** The text's lines, a byte-order mark dropped and any line ending accepted. */
function splitLines(text: string): string[] {
	const withoutMark = text.startsWith(BYTE_ORDER_MARK) ? text.slice(1) : text;
	return withoutMark.split(/\r\n|\r|\n/u);
}

interface Frontmatter {
	/** The first line after it, as an index into the lines. */
	readonly bodyStart: number;
	readonly format?: string;
	readonly ownLines: number[];
	readonly properties: OutlineProperty[];
}

/** The note's properties block, read far enough to name its keys. */
function readFrontmatter(lines: readonly string[]): Frontmatter {
	if (lines.length === 0 || lines[0].trimEnd() !== "---") return { bodyStart: 0, ownLines: [], properties: [] };
	let closing = -1;
	for (let index = 1; index < lines.length; index += 1) {
		const trimmed = lines[index].trimEnd();
		if (trimmed === "---" || trimmed === "...") {
			closing = index;
			break;
		}
	}
	// Without a closing fence Obsidian reads no properties, and neither do we.
	if (closing === -1) return { bodyStart: 0, ownLines: [], properties: [] };

	const ownLines = [1, closing + 1];
	const properties: OutlineProperty[] = [];
	let format: string | undefined;
	// The property a line of a value spread over several lines belongs to.
	let open: OutlineProperty | undefined;
	for (let index = 1; index < closing; index += 1) {
		const line = lines[index];
		const lineNumber = index + 1;
		if (line.trim() === "") continue;
		const key = PROPERTY_KEY.exec(line);
		if (key !== null) {
			const name = key[1].trim();
			if (name === FORMAT_PROPERTY) {
				format = unquoted(key[2]);
				ownLines.push(lineNumber);
				open = undefined;
			} else {
				open = { key: name, line: lineNumber, lines: [lineNumber] };
				properties.push(open);
			}
			continue;
		}
		if (open !== undefined && !line.trimStart().startsWith("#")) {
			open.lines.push(lineNumber);
			continue;
		}
		// A comment, or a stray line YAML would refuse: part of the block, not of the map.
		ownLines.push(lineNumber);
	}
	return { bodyStart: closing + 1, ...(format === undefined ? {} : { format }), ownLines, properties };
}

/** What each line of the body is; a fence's lines are all "fence", whatever they hold. */
function classifyLines(lines: readonly string[], start: number): LineClass[] {
	const classes: LineClass[] = [];
	let fence: { readonly marker: string } | undefined;
	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index];
		if (index < start) {
			classes.push({ kind: "blank" });
			continue;
		}
		if (fence !== undefined) {
			classes.push({ kind: "fence", opens: false });
			const close = FENCE_CLOSE.exec(line);
			if (close !== null && close[1][0] === fence.marker[0] && close[1].length >= fence.marker.length) fence = undefined;
			continue;
		}
		if (line.trim() === "") {
			classes.push({ kind: "blank" });
			continue;
		}
		const open = FENCE_OPEN.exec(line);
		// A backtick fence's info string may not hold a backtick.
		if (open !== null && (open[2][0] !== "`" || !line.slice(open[0].length).includes("`"))) {
			fence = { marker: open[2] };
			classes.push({ kind: "fence", opens: true });
			continue;
		}
		const heading = HEADING.exec(line);
		if (heading !== null) {
			classes.push({ kind: "heading", level: heading[1].length, text: headingText(heading[2]) });
			continue;
		}
		const item = LIST_ITEM.exec(line);
		if (item !== null) {
			classes.push({ kind: "item", indent: indentWidth(item[1]), text: (item[2] ?? "").trim() });
			continue;
		}
		classes.push({ kind: "text" });
	}
	return classes;
}

/**
 * The indentation of an empty node as Enhancing Mindmap meant it: three
 * spaces per level, read as the tabs its other nodes get.  Only in a note
 * whose lists are indented with tabs, so no other list is read wrong.
 */
function itemIndent(line: string, indent: number, empty: boolean, listsUseTabs: boolean): number {
	if (!empty || !listsUseTabs) return indent;
	const spaces = /^( +)[-*+]/u.exec(line);
	if (spaces === null || spaces[1].length % EMPTY_NODE_INDENT !== 0) return indent;
	return (spaces[1].length / EMPTY_NODE_INDENT) * TAB_WIDTH;
}

function newNode(kind: OutlineNodeKind, line: number, text: string): OutlineNode {
	return { kind, line, text, lines: [line], children: [], folded: false };
}

/** Adds a line to a card's text, a blank line kept between paragraphs. */
function appendLine(node: OutlineNode, line: string, lineNumber: number, afterBlank: boolean): void {
	node.lines.push(lineNumber);
	if (node.text === "") {
		node.text = line;
		return;
	}
	node.text += afterBlank ? `\n\n${line}` : `\n${line}`;
}

/**
 * Reads the note into its maps.  Pure; never throws on any text.
 *
 * Headings set the depth; list items go one deeper than the heading above
 * them and deeper again with their indentation; a code fence or a table
 * stays inside the card it follows, and so does any other line that is
 * neither a heading nor an item.  Everything before the first heading (the
 * first item, in a note with no heading) is the preamble.
 */
export function parseMindmapOutline(text: string): ParsedOutline {
	const lines = splitLines(text);
	const frontmatter = readFrontmatter(lines);
	const classes = classifyLines(lines, frontmatter.bodyStart);
	const hasHeadings = classes.some((entry) => entry.kind === "heading");
	const listsUseTabs = classes.some((entry, index) => entry.kind === "item" && lines[index].startsWith("\t"));

	const roots: OutlineNode[] = [];
	let preamble: OutlineNode | undefined;
	/** The card further lines are added to. */
	let current: OutlineNode | undefined;
	let started = false;
	let afterBlank = false;
	/** The heading each level is under, deepest last. */
	const headings: { readonly level: number; readonly node: OutlineNode }[] = [];
	/** The items the next item may be nested in, deepest last. */
	const items: { readonly indent: number; readonly node: OutlineNode }[] = [];
	/** Leading whitespace of the fence being read, taken off each of its lines. */
	let fenceIndent = "";

	const attach = (node: OutlineNode, parent: OutlineNode | undefined): void => {
		if (parent === undefined) roots.push(node);
		else parent.children.push(node);
	};

	for (let index = frontmatter.bodyStart; index < lines.length; index += 1) {
		const entry = classes[index];
		const lineNumber = index + 1;
		const raw = lines[index];
		if (entry.kind === "blank") {
			afterBlank = true;
			continue;
		}
		const structural = hasHeadings ? entry.kind === "heading" : entry.kind === "item";
		if (!started && !structural) {
			// Text before the map begins: kept as it is written, on a card of its own.
			if (preamble === undefined) {
				preamble = newNode("text", lineNumber, raw);
			} else {
				appendLine(preamble, raw, lineNumber, afterBlank);
			}
			afterBlank = false;
			continue;
		}
		if (entry.kind === "heading") {
			started = true;
			while (headings.length > 0 && headings[headings.length - 1].level >= entry.level) headings.pop();
			const node = newNode("heading", lineNumber, entry.text);
			attach(node, headings[headings.length - 1]?.node);
			headings.push({ level: entry.level, node });
			items.length = 0;
			current = node;
			afterBlank = false;
			continue;
		}
		if (entry.kind === "item") {
			started = true;
			const indent = itemIndent(raw, entry.indent, entry.text === "", listsUseTabs);
			while (items.length > 0 && items[items.length - 1].indent >= indent) items.pop();
			const parent = items[items.length - 1]?.node ?? headings[headings.length - 1]?.node;
			const node = newNode("list item", lineNumber, entry.text);
			attach(node, parent);
			items.push({ indent, node });
			current = node;
			afterBlank = false;
			continue;
		}
		// Only a started map reaches here, so there is always a card to add to.
		const owner = current!;
		if (entry.kind === "fence") {
			if (entry.opens) fenceIndent = /^[ \t]*/u.exec(raw)![0];
			const body = raw.startsWith(fenceIndent) ? raw.slice(fenceIndent.length) : raw.trimStart();
			appendLine(owner, body, lineNumber, afterBlank);
			// A blank line inside the fence is part of the code, not a paragraph break.
			afterBlank = false;
			continue;
		}
		const line = raw.trim();
		// A table needs a blank line above it to be read as one on a card.
		const opensTable = line.startsWith("|") && !owner.text.split("\n").pop()!.trimStart().startsWith("|");
		appendLine(owner, line, lineNumber, afterBlank || (opensTable && owner.text !== ""));
		afterBlank = false;
	}

	// A folded node's mark is the map's own bookkeeping, not its text.
	const stack = [...roots];
	while (stack.length > 0) {
		const node = stack.pop()!;
		const folded = FOLD_MARK.exec(node.text);
		if (folded !== null) {
			node.text = node.text.slice(0, folded.index);
			node.folded = true;
		}
		stack.push(...node.children);
	}

	return {
		...(frontmatter.format === undefined ? {} : { format: frontmatter.format }),
		frontmatterLines: frontmatter.ownLines,
		properties: frontmatter.properties,
		...(preamble === undefined ? {} : { preamble }),
		roots,
	};
}

/** The value of `mindmap-plugin`: Obsidian's reading of the note when there is one, else our own. */
function formatOf(source: ImportSource): string | undefined {
	const fromProperties = source.frontmatter?.[FORMAT_PROPERTY];
	if (typeof fromProperties === "string") return fromProperties;
	return readFrontmatter(splitLines(source.text)).format;
}

function isOutlineFormat(value: string | undefined): boolean {
	return value !== undefined && value.trim().toLowerCase() === OUTLINE_FORMAT;
}

/** The advance of one character, wide for East Asian scripts. */
function characterWidth(character: string): number {
	const code = character.codePointAt(0) ?? 0;
	return code >= 0x2e80 ? WIDE_CHARACTER : NARROW_CHARACTER;
}

function lineWidth(line: string, fontSize: number, bold: boolean): number {
	let width = 0;
	for (const character of line) width += characterWidth(character);
	return width * fontSize * (bold ? BOLD_FACTOR : 1);
}

/** A card's size worked out from its text: as wide as its longest line within the bounds, as tall as its wrapped lines. */
export function estimateCardSize(text: string, root: boolean): { readonly width: number; readonly height: number } {
	const fontSize = root ? ROOT_FONT_SIZE : CARD_FONT_SIZE;
	const lines = text.split("\n");
	const widths = lines.map((line) => lineWidth(line, fontSize, root));
	const natural = Math.max(0, ...widths) + CARD_PADDING_X;
	// Rounded up, so a line that fits is never wrapped by the rounding.
	const width = Math.ceil(Math.min(MAX_CARD_WIDTH, Math.max(MIN_CARD_WIDTH, natural)));
	const room = width - CARD_PADDING_X;
	let rows = 0;
	for (const lineWidthValue of widths) rows += Math.max(1, Math.ceil(lineWidthValue / room));
	const minHeight = root ? MIN_ROOT_HEIGHT : MIN_CARD_HEIGHT;
	const height = Math.round(Math.max(minHeight, rows * fontSize * LINE_HEIGHT + CARD_PADDING_Y));
	return { width, height };
}

interface Placed {
	readonly node: OutlineNode;
	readonly width: number;
	readonly height: number;
	/** The height of the band its branch takes: the card or its children, whichever is taller. */
	band: number;
	childrenBlock: number;
	x: number;
	y: number;
	readonly children: Placed[];
}

/**
 * Lays a map out as a tree growing to the right.  Each branch owns a band
 * of the board's height, stacked under its siblings' bands, and its card sits
 * in the middle of it; every child starts a fixed gap right of its parent.
 * Bands never share height and a child is always right of its parent, so no
 * two cards overlap.  Iterative, so a deep outline cannot exhaust the stack.
 */
function layoutTree(root: OutlineNode, left: number, top: number): Placed[] {
	const measure = (node: OutlineNode): Placed => {
		const size = estimateCardSize(node.text, node === root);
		return { node, ...size, band: 0, childrenBlock: 0, x: 0, y: 0, children: [] };
	};
	const placedRoot = measure(root);
	// Every card, parents before their children.
	const order: Placed[] = [];
	const pending = [placedRoot];
	while (pending.length > 0) {
		const placed = pending.pop()!;
		order.push(placed);
		for (const child of placed.node.children) placed.children.push(measure(child));
		for (let index = placed.children.length - 1; index >= 0; index -= 1) pending.push(placed.children[index]);
	}
	// Bands, children before their parents.
	for (let index = order.length - 1; index >= 0; index -= 1) {
		const placed = order[index];
		let block = 0;
		placed.children.forEach((child, childIndex) => {
			block += child.band + (childIndex > 0 ? SIBLING_GAP : 0);
		});
		placed.childrenBlock = block;
		placed.band = Math.max(placed.height, block);
	}
	// Places, parents before their children.
	placedRoot.x = left;
	placedRoot.y = top + Math.round((placedRoot.band - placedRoot.height) / 2);
	const bandTops = new Map<Placed, number>([[placedRoot, top]]);
	for (const placed of order) {
		const bandTop = bandTops.get(placed)!;
		let childTop = bandTop + Math.round((placed.band - placed.childrenBlock) / 2);
		for (const child of placed.children) {
			child.x = placed.x + placed.width + LEVEL_GAP;
			child.y = childTop + Math.round((child.band - child.height) / 2);
			bandTops.set(child, childTop);
			childTop += child.band + SIBLING_GAP;
		}
	}
	return order;
}

function rectOf(placed: Placed): BoardRect {
	return { x: placed.x, y: placed.y, width: placed.width, height: placed.height };
}

/** The root card's look: Miro's blue, bold, large, in the middle. */
function rootStyle(): { typography: Record<string, unknown>; colors: Record<string, string> } {
	return {
		typography: { fontSize: ROOT_FONT_SIZE, alignment: "center", verticalAlign: "center", format: { bold: true } },
		colors: { fill: ROOT_FILL, text: readableInk(ROOT_FILL) },
	};
}

function convertOutline(source: ImportSource, context: ImportContext): ImportResult {
	const builder = new BoardBuilder("mindmap-outline", context);
	const outline = parseMindmapOutline(source.text);
	let left = 0;

	// The text before the map: on a card of its own, left of the maps.
	if (outline.preamble !== undefined) {
		const size = estimateCardSize(outline.preamble.text, false);
		const preambleId = builder.card({ x: left, y: 0, ...size }, outline.preamble.text, {
			source: { id: `line:${outline.preamble.line}`, type: outline.preamble.kind },
		});
		builder.note({ sourceId: `line:${outline.preamble.line}`, sourceType: outline.preamble.kind, status: "approximated", reason: "textBeforeRoot", nodeId: preambleId });
		left += size.width + TREE_GAP;
	}

	// Each map, side by side; every root after the first is reported.
	outline.roots.forEach((root, rootIndex) => {
		const placed = layoutTree(root, left, 0);
		const ids = new Map<OutlineNode, string>();
		let right = left;
		for (const card of placed) {
			const isRoot = card.node === root;
			const sourceId = `line:${card.node.line}`;
			const id = builder.card(rectOf(card), card.node.text, {
				source: { id: sourceId, type: card.node.kind },
				...(isRoot ? { style: rootStyle() } : {}),
			});
			ids.set(card.node, id);
			right = Math.max(right, card.x + card.width);
			if (isRoot && rootIndex > 0) {
				builder.note({ sourceId, sourceType: card.node.kind, status: "approximated", reason: "extraRoots", nodeId: id });
			}
			if (card.node.folded) {
				builder.note({ sourceId, sourceType: card.node.kind, status: "approximated", reason: "foldedBranch", nodeId: id });
			}
		}
		// Each branch: a curved line from the parent's right side to the child's left, with no arrowhead.
		for (const card of placed) {
			const parentId = ids.get(card.node)!;
			for (const child of card.node.children) {
				builder.connect({
					from: { type: "node", nodeId: parentId, u: 1, v: 0.5 },
					to: { type: "node", nodeId: ids.get(child)!, u: 0, v: 0.5 },
					route: "curved",
					startCap: "none",
					endCap: "none",
				});
			}
		}
		left = right + TREE_GAP;
	});

	for (const property of outline.properties) {
		builder.note({ sourceId: `line:${property.line}`, sourceType: `property ${property.key}`, status: "plugin-unsupported", reason: "frontmatter" });
	}
	// The note keeps no places, so every card's place was worked out here.
	// The whole map came over and only where its cards stand is new, so the
	// map counts as approximated, not as something left out.
	if (outline.roots.length > 0) {
		builder.note({ sourceId: "layout", sourceType: "mind map", status: "approximated", reason: "layout" });
	}

	return builder.finish({ sourcePath: source.path, formatVersion: OUTLINE_FORMAT });
}

export const mindmapOutlineAdapter: FormatAdapter = {
	id: "mindmap-outline",
	detect: (source) => source.extension.toLowerCase() === "md" && isOutlineFormat(formatOf(source)),
	convert: convertOutline,
};
