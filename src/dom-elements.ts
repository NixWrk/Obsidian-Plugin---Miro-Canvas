/** Detached elements in their owning document, including plain test hosts. */
type HtmlWindow = Window & { createEl?: typeof createEl };
type SvgWindow = Window & { createSvg?: typeof createSvg };

/** The native browser contract used only when Obsidian helpers are absent. */
interface PlainElementDocument {
  createElement<Tag extends keyof HTMLElementTagNameMap>(tag: Tag): HTMLElementTagNameMap[Tag];
  createElementNS(namespace: string, tag: string): Element;
}

export function createHtmlElement<Tag extends keyof HTMLElementTagNameMap>(
  document: Document,
  tag: Tag,
): HTMLElementTagNameMap[Tag] {
  const owner = document.defaultView as HtmlWindow | null;
  if (typeof owner?.createEl === "function") {
    return owner.createEl(tag);
  }
  // Minimal DOM hosts lack Obsidian's extensions; retain their native receiver.
  const plain = document as PlainElementDocument;
  return plain.createElement(tag);
}

export function createSvgElement<Tag extends keyof SVGElementTagNameMap>(
  document: Document,
  tag: Tag,
): SVGElementTagNameMap[Tag] {
  const owner = document.defaultView as SvgWindow | null;
  if (typeof owner?.createSvg === "function") {
    return owner.createSvg(tag);
  }
  const plain = document as PlainElementDocument;
  return plain.createElementNS("http://www.w3.org/2000/svg", tag) as SVGElementTagNameMap[Tag];
}
