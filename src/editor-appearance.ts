/**
 * A card's own look, carried into the frame its text is edited in.
 *
 * Obsidian 1.13 edits a text card's Markdown inside a same-origin iframe the
 * node keeps for it (`.canvas-node-content > .markdown-embed-content >
 * iframe.embed-iframe`); that frame is its own document, with Obsidian's
 * default font, size, alignment, ink and a dark background of its own, so
 * the board's inline styles on the node never reach it.  A card styled
 * through the plugin would otherwise look native the moment it is opened for
 * editing and styled again only once the edit ends.
 *
 * This module turns a card's typography and colours into CSS rules and
 * paints them into one `<style>` element this module owns in the frame's
 * head, through the CSSOM rather than by building CSS text, so no card
 * value ever has to be escaped.
 */

import { colorToCss, typographyDeclarations, type ColorSettings, type TypographySettings } from "./appearance";
import { readableInk } from "./miro-palette";

/** One CSS rule inside the editor frame: a selector and the declarations it carries. */
export interface EditorAppearanceRule {
	readonly selector: string;
	readonly declarations: readonly (readonly [property: string, value: string])[];
}

/** Marks the one `<style>` element this module owns per editor frame. */
export const EDITOR_APPEARANCE_ATTRIBUTE = "data-miro-canvas-editor-appearance";

const BODY_SELECTOR = "body";
const CONTENT_SELECTOR = ".markdown-source-view.mod-cm6 .cm-content";
const HIGHLIGHT_SELECTOR = ".markdown-source-view.mod-cm6 .cm-highlight";

/**
 * The rules a card's editor needs to look like the card does while it is
 * shown.  Vertical alignment is not part of this: the editor never gets it.
 * A card with neither typography nor colours set returns no rules at all, so
 * a plain card's editor stays exactly native.
 */
export function buildEditorAppearanceRules(
	typography: TypographySettings | undefined,
	colors: ColorSettings | undefined,
): readonly EditorAppearanceRule[] {
	if (typography === undefined && colors === undefined) {
		return [];
	}
	const rules: EditorAppearanceRule[] = [];
	if (colors?.fill !== undefined) {
		// The fill is painted on the node shell, behind the frame.  Without
		// this the frame's own dark background hides it the moment the card
		// is opened for editing.
		rules.push({ selector: BODY_SELECTOR, declarations: [["background-color", "transparent"]] });
	}
	const content: (readonly [string, string])[] = typography === undefined ? [] : [...typographyDeclarations(typography)];
	if (colors?.text !== undefined) {
		content.push(["color", colorToCss(colors.text)]);
	}
	if (content.length > 0) {
		rules.push({ selector: CONTENT_SELECTOR, declarations: Object.freeze(content) });
	}
	if (colors?.highlight !== undefined && colors.highlight !== null) {
		// The shown card leaves a marked word's ink to inherit from its own
		// text colour, which CSS falls back to when nothing more specific
		// wins; the editor's own marker rule is specific enough to always
		// win over inheritance, so its ink has to be spelled out here too -
		// the card's own text colour when it sets one, otherwise the same
		// readable ink the shown card falls back to.
		const ink = colors.text !== undefined ? colorToCss(colors.text) : readableInk(colorToCss(colors.highlight).slice(0, 7));
		rules.push({
			selector: HIGHLIGHT_SELECTOR,
			declarations: [["background-color", colorToCss(colors.highlight)], ["color", ink]],
		});
	}
	return Object.freeze(rules);
}

function readSafe<T>(read: () => T): T | undefined {
	try {
		return read();
	} catch {
		// A cross-origin or torn-down frame throws on nearly every access;
		// this module fails closed rather than break the board over it.
		return undefined;
	}
}

function isDocumentLike(value: unknown): value is Document {
	return typeof value === "object" && value !== null
		&& typeof (value as Document).createElement === "function"
		&& (value as Document).head != null;
}

function frameDocument(frame: unknown): Document | undefined {
	if (typeof frame !== "object" || frame === null) {
		return undefined;
	}
	const doc = readSafe(() => (frame as { readonly contentDocument?: unknown }).contentDocument);
	return isDocumentLike(doc) ? doc : undefined;
}

function isStyleElementLike(value: unknown): value is HTMLStyleElement {
	return typeof value === "object" && value !== null && typeof (value as HTMLStyleElement).remove === "function";
}

function ownedStyleElement(doc: Document): HTMLStyleElement | undefined {
	return readSafe(() => {
		const existing = doc.head.querySelector(`style[${EDITOR_APPEARANCE_ATTRIBUTE}]`);
		if (isStyleElementLike(existing)) {
			return existing;
		}
		const created = doc.createElement("style");
		created.setAttribute(EDITOR_APPEARANCE_ATTRIBUTE, "true");
		doc.head.appendChild(created);
		return created;
	});
}

function removeOwnedStyleElement(doc: Document): void {
	readSafe(() => doc.head.querySelector(`style[${EDITOR_APPEARANCE_ATTRIBUTE}]`)?.remove());
}

function paintRules(style: HTMLStyleElement, rules: readonly EditorAppearanceRule[]): void {
	readSafe(() => {
		const sheet = style.sheet;
		if (sheet == null) {
			return;
		}
		// Clear from the end: deleting rule 0 first would shift every later
		// index down and skip one.
		for (let index = sheet.cssRules.length - 1; index >= 0; index -= 1) {
			readSafe(() => sheet.deleteRule(index));
		}
		for (const rule of rules) {
			const insertedAt = readSafe(() => sheet.insertRule(`${rule.selector} {}`, sheet.cssRules.length));
			if (insertedAt === undefined) {
				continue;
			}
			const inserted = sheet.cssRules[insertedAt] as CSSStyleRule | undefined;
			if (inserted === undefined) {
				continue;
			}
			// Values go through the CSSOM property by property, never through
			// concatenated CSS text, so a card's own font name or colour can
			// never break out of its declaration.
			for (const [property, value] of rule.declarations) {
				readSafe(() => inserted.style.setProperty(property, value, "important"));
			}
		}
	});
}

const FRAME_RULES = new WeakMap<object, readonly EditorAppearanceRule[]>();
const WATCHED_FRAMES = new WeakSet<object>();

function paintFrame(frame: unknown, rules: readonly EditorAppearanceRule[]): void {
	const doc = frameDocument(frame);
	if (doc === undefined) {
		return;
	}
	if (rules.length === 0) {
		removeOwnedStyleElement(doc);
		return;
	}
	const style = ownedStyleElement(doc);
	if (style === undefined) {
		return;
	}
	paintRules(style, rules);
}

/** Obsidian may still be filling the frame; catch that once it has loaded. */
function watchFrameLoad(frame: object): void {
	if (WATCHED_FRAMES.has(frame)) {
		return;
	}
	const addEventListener = readSafe(() => (frame as { readonly addEventListener?: unknown }).addEventListener);
	if (typeof addEventListener !== "function") {
		return;
	}
	WATCHED_FRAMES.add(frame);
	readSafe(() => Reflect.apply(addEventListener as (...args: unknown[]) => unknown, frame, [
		"load",
		() => paintFrame(frame, FRAME_RULES.get(frame) ?? []),
	]));
}

/**
 * Paint a card's editor rules into its frame, now and again once the frame
 * has loaded.  An empty rule list removes this module's style element
 * instead of leaving an empty one behind; a frame this module has never
 * decorated and owes nothing to is left completely alone by the caller.
 */
export function applyEditorAppearanceToFrame(frame: unknown, rules: readonly EditorAppearanceRule[]): void {
	if (typeof frame !== "object" || frame === null) {
		return;
	}
	FRAME_RULES.set(frame, rules);
	paintFrame(frame, rules);
	watchFrameLoad(frame);
}
