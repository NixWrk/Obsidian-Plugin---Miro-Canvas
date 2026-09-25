/**
 * The Markdown link a card's whole text can become.
 *
 * A card keeps this in its own words, `[label](url)`, exactly as a person
 * typing the same link would - nothing is stored in metadata, so a card
 * linked this way still opens without the plugin.  Only http(s) and
 * obsidian:// addresses reach this module; the toolbar refuses anything else
 * before it ever calls in.
 */

/** A whole card's text, and nothing beside it, written as one Markdown link. */
const WHOLE_LINK = /^\s*\[([^\]]*)\]\(([^()\s]+)\)\s*$/u;

/** The address a card's whole text already forms a link to, if any. */
export function cardLinkUrl(text: string): string | undefined {
  return WHOLE_LINK.exec(text)?.[2];
}

/** The whole of a card's text turned into a link; its own words become the label. */
export function linkText(text: string, url: string): string {
  const label = WHOLE_LINK.exec(text)?.[1] ?? text;
  return `[${label}](${url})`;
}

/** A card's text with its whole-text link taken off, back to the plain words it labelled. */
export function unlinkText(text: string): string {
  return WHOLE_LINK.exec(text)?.[1] ?? text;
}

/** A stretch of text turned into a link, as the text it sits in writes one. */
export function linkSelection(selection: string, url: string): string {
  if (selection.trim() === "") return selection;
  return `[${selection}](${url})`;
}
