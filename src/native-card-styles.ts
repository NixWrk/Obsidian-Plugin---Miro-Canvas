type StyleWriter = (element: HTMLElement, property: string, value: string, variable?: string) => void;

const faces = "> .canvas-node-container, .canvas-node-content, .markdown-preview-view, .markdown-embed";
const transparentKinds = ["sticky", "table", "code"];
const sizer = ".markdown-preview-view > .markdown-preview-sizer";

// The pure projector also accepts ordinary browser elements without Obsidian helpers.
interface PlainCardElement {
  querySelectorAll(selector: string): NodeListOf<Element>;
}

/** Project only the native inline declarations which compete with our scoped CSS. */
export function projectNativeCardStyles(shell: HTMLElement, write: StyleWriter): void {
  if (typeof shell.matches !== "function"
    || (typeof shell.findAll !== "function" && typeof (shell as PlainCardElement).querySelectorAll !== "function")) return;
  const selected = (selector: string): HTMLElement[] => [
    ...(shell.matches(selector) ? [shell] : []),
    ...(typeof shell.findAll === "function" ? shell.findAll(selector)
      : Array.from((shell as PlainCardElement).querySelectorAll(selector), element => element as HTMLElement)),
  ];
  const clear = (selector: string, properties: readonly string[]): void => {
    for (const element of selected(selector)) {
      for (const property of properties) {
        write(element, property, "");
      }
    }
  };
  const project = (selector: string, properties: Readonly<Record<string, string>>): void => {
    for (const element of selected(selector)) {
      for (const [property, value] of Object.entries(properties)) write(element, property, value);
    }
  };
  for (const kind of transparentKinds) {
    const root = `.miro-source-${kind}`;
    const selectors = [root, ...faces.split(", ").map(face => `${root} ${face}`)].join(", ");
    clear(selectors, ["background-color", "border-color"]);
  }
  clear('.miro-source-drawing, .miro-source-drawing > .canvas-node-container, .miro-source-drawing .canvas-node-content', ["background-color", "border-color"]);
  clear('.miro-source-mindmap-node, .miro-source-mindmap-node > .canvas-node-container, .miro-source-mindmap-node .canvas-node-content, .miro-source-mindmap-node .markdown-preview-view', ["background-color", "border-color"]);
  const shape = '[data-miro-source-kind="shape"]';
  clear([shape, ...faces.split(", ").map(face => `${shape} ${face}`)].join(", "), ["background-color", "border-color"]);
  const text = '.miro-source-text:is([data-miro-source-id], [data-miro-local-item="text"]):not([data-miro-source-card-kind], .miro-source-mindmap-node)';
  clear(faces.split(", ").map(face => `${text} ${face}`).join(", "), ["background-color", "border-color"]);
  project('.miro-source-rendered[data-miro-source-border="none"] > .canvas-node-container', { "border-style": "none", "box-shadow": "none" });
  project('.miro-source-rendered[data-miro-source-container="invisible"] > .canvas-node-container', { "background-color": "transparent" });
  project('[data-miro-canvas-native-label-hidden="true"]', { display: "none" });
  const compactText = [shape, text];
  project(compactText.map(root => `${root} .markdown-preview-view`).join(", "), { padding: "0", "scrollbar-gutter": "auto" });
  project(compactText.map(root => `${root} ${sizer}`).join(", "), { "padding-top": "0", "padding-right": "0", "padding-bottom": "0", "padding-left": "0" });
  project(compactText.map(root => `${root} .markdown-preview-view p`).join(", "), { margin: "0" });
  clear('.miro-source-preview > .canvas-node-container, .miro-source-document > .canvas-node-container, .miro-source-embed > .canvas-node-container', ["border-color"]);
  clear('.miro-source-embed > .canvas-node-container', ["background-color", "background-image", "background-position", "background-size", "background-repeat", "background-origin", "background-clip", "background-attachment"]);
  clear('.miro-source-deck > .canvas-node-container', ["background-color", "border-color"]);
  clear('.miro-source-slide > .canvas-node-container', ["top", "right", "bottom", "left"].flatMap(side =>
    ["width", "style", "color"].map(component => `border-${side}-${component}`)));
  clear('.miro-source-group > .canvas-node-container, .miro-source-group .canvas-node-content', ["background-color"]);
  // Variables follow the native selection classes without observing every card.
  for (const element of selected('.miro-source-group > .canvas-node-container')) {
    for (const property of ["border-width", "border-style"] as const) {
      const before = element.style.getPropertyValue(property);
      write(element, property, before === "" ? "" : `var(--miro-source-group-${property}, ${before})`, `--miro-source-group-${property}`);
    }
    write(element, "border-color", "var(--miro-source-group-border-color, transparent)");
  }
  project(`.miro-source-rendered[data-miro-source-valign] ${sizer}, .miro-source-code ${sizer}`, { flex: "0 0 auto", "min-height": "0", "padding-bottom": "0" });
  project(`.miro-source-table ${sizer}`, { height: "100%", "min-height": "0", "padding-top": "0", "padding-right": "0", "padding-bottom": "0", "padding-left": "0" });
  project('.miro-source-sticky[data-miro-source-fit="true"] .markdown-preview-view :is(div, p, span)[style]', { "font-size": "inherit", "line-height": "inherit" });
}
