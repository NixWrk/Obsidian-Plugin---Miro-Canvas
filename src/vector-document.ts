import { createHtmlElement } from "./dom-elements";
import { abortable } from "./board-export";
import { words } from "./i18n";

/** A prepared SVG page and its target size in points (1/72 inch). */
export interface VectorDocumentPage {
  readonly svg: string;
  readonly width: number;
  readonly height: number;
  readonly title?: string;
}

/** Separate the generated stacked SVG, keeping each page's clip and local coordinates. */
export function splitVectorDocuments(bytes: Uint8Array, pages: readonly Omit<VectorDocumentPage, "svg">[], document: Document): VectorDocumentPage[] {
  const view = document.defaultView;
  if (view === null || bytes.length > 32 * 1024 * 1024) throw new Error(words().export.tooLarge);
  const parsed = new view.DOMParser().parseFromString(new TextDecoder().decode(bytes), "image/svg+xml");
  const root = parsed.documentElement;
  if (root.localName !== "svg" || parsed.querySelector("parsererror") !== null) throw new Error(words().export.pageNotEncoded);
  const children = Array.from(root.children);
  if (children.length !== pages.length || children.some(child => child.localName !== "svg" || !child.hasAttribute("data-miro-page"))) throw new Error(words().export.pageNotEncoded);
  return children.map((child, index) => {
    child.setAttribute("x", "0");
    child.setAttribute("y", "0");
    return { ...pages[index], svg: new view.XMLSerializer().serializeToString(child) };
  });
}

/** A compatibility picture for older PPTX readers; the slide's actual content remains SVG. */
export async function vectorPageFallback(page: VectorDocumentPage, document: Document, signal: AbortSignal): Promise<{ image: Uint8Array; pixelWidth: number; pixelHeight: number }> {
  const view = document.defaultView;
  if (view === null || signal.aborted) throw new Error(words().export.exportStopped);
  const url = view.URL.createObjectURL(new view.Blob([page.svg], { type: "image/svg+xml" }));
  const image = createHtmlElement(document, "img");
  const canvas = createHtmlElement(document, "canvas");
  let timer: number | undefined;
  try {
    const ready = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error(words().export.pageNotDrawn));
      timer = view.setTimeout(() => reject(new Error(words().export.pageNotDrawn)), 10000);
      image.src = url;
    });
    await abortable(ready, signal);
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (context === null) throw new Error(words().export.pageNotDrawn);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await abortable(new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value === null ? reject(new Error(words().export.pageNotEncoded)) : resolve(value), "image/jpeg", .9)), signal);
    return { image: new Uint8Array(await abortable(blob.arrayBuffer(), signal)), pixelWidth: canvas.width, pixelHeight: canvas.height };
  } finally {
    if (timer !== undefined) view.clearTimeout(timer);
    image.onload = null;
    image.onerror = null;
    image.removeAttribute("src");
    canvas.width = canvas.height = 0;
    view.URL.revokeObjectURL(url);
  }
}
