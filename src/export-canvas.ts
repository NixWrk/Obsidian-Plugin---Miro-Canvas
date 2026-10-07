import { createHtmlElement } from "./dom-elements";
import { words } from "./i18n";

interface BackgroundCanvas {
  readonly view: unknown;
  readonly canvas: unknown;
  dispose(): void;
}

function property(value: unknown, name: string): unknown {
  if (typeof value !== "object" || value === null) return undefined;
  try {
    return Reflect.get(value, name);
  } catch {
    return undefined;
  }
}

function call(value: unknown, name: string, ...args: unknown[]): unknown {
  const method = property(value, name);
  if (typeof method !== "function") throw new Error(words().export.unavailable);
  return Reflect.apply(method, value, args);
}

/** An unregistered native view: never open a workspace leaf or bind global keys. */
export function createExportCanvas(sourceView: unknown, snapshot: unknown, document: Document): BackgroundCanvas {
  const sourceLeaf = property(sourceView, "leaf");
  const app = property(sourceView, "app");
  const Leaf = property(sourceLeaf, "constructor");
  const registry = property(app, "viewRegistry");
  const factory = property(property(registry, "viewByType"), "canvas");
  if (typeof Leaf !== "function" || typeof factory !== "function" || document.defaultView === null) {
    throw new Error(words().export.unavailable);
  }
  const host = createHtmlElement(document, "div");
  host.className = "miro-canvas-export-renderer";
  host.setAttribute("inert", "");
  host.setAttribute("aria-hidden", "true");
  let leaf: unknown;
  let view: unknown;
  let canvas: unknown;
  let disposed = false;
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    for (const [owner, method] of [
      [canvas, "unload"],
      [view, "unload"],
      [property(leaf, "resizeObserver"), "disconnect"],
      [property(leaf, "_empty"), "unload"],
    ] as const) {
      try {
        if (typeof property(owner, method) === "function") call(owner, method);
      } catch {
        // A failed render must still remove the independently owned surface.
      }
    }
    host.remove();
  };
  try {
    leaf = Reflect.construct(Leaf, [app]);
    call(property(leaf, "resizeObserver"), "disconnect");
    const leafElement = property(leaf, "containerEl");
    if (!(leafElement instanceof document.defaultView.HTMLElement)) throw new Error(words().export.unavailable);
    host.appendChild(leafElement);
    document.body.appendChild(host);
    view = Reflect.apply(factory, registry, [leaf]);
    if (typeof view !== "object" || view === null) throw new Error(words().export.unavailable);
    if (typeof leaf !== "object" || leaf === null) throw new Error(words().export.unavailable);
    Reflect.set(leaf, "view", view);
    // Native file rendering may request a save; this view must never write a file.
    Reflect.set(view, "requestSave", () => undefined);
    Reflect.set(view, "saveLocalData", () => undefined);
    Reflect.set(view, "file", property(sourceView, "file"));
    const viewElement = property(view, "containerEl");
    const content = property(view, "contentEl");
    if (!(viewElement instanceof document.defaultView.HTMLElement) || !(content instanceof document.defaultView.HTMLElement)) {
      throw new Error(words().export.unavailable);
    }
    leafElement.appendChild(viewElement);
    content.classList.add("miro-canvas-export-renderer__content");
    // Component.load enables native Markdown children. onOpen would bind global keys.
    call(view, "load");
    canvas = property(view, "canvas");
    if (typeof canvas !== "object" || canvas === null) throw new Error(words().export.unavailable);
    const wrapper = property(canvas, "wrapperEl");
    if (!(wrapper instanceof document.defaultView.HTMLElement)) throw new Error(words().export.unavailable);
    wrapper.setAttribute("data-miro-canvas-export-renderer", "true");
    const sourceWrapper = property(property(sourceView, "canvas"), "wrapperEl");
    if (sourceWrapper instanceof document.defaultView.HTMLElement) {
      const palette = document.defaultView.getComputedStyle(sourceWrapper);
      for (let index = 0; index < palette.length; index += 1) {
        const name = palette.item(index);
        if (name.startsWith("--")) wrapper.style.setProperty(name, palette.getPropertyValue(name));
      }
    }
    call(canvas, "setData", snapshot);
    Reflect.set(canvas, "getData", () => snapshot);
    call(canvas, "onResize");
    return { view, canvas, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
