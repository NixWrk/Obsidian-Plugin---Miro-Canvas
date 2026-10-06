/** Local native markup state for styles; no board data or per-frame card scans. */
function setMark(element: Element, name: string, value: string | null): void {
  if (element.getAttribute(name) === value) return;
  if (value === null) element.removeAttribute(name);
  else element.setAttribute(name, value);
}

/** A fallback file name steps aside as soon as the native name arrives. */
export function watchAttachmentLabel(shell: HTMLElement, label: HTMLElement): {
  readonly refresh: () => void;
  readonly dispose: () => void;
} {
  const name = "data-miro-native-label";
  const previous = label.getAttribute(name);
  let active = true;
  let last: string | undefined;
  const refresh = (): void => {
    if (!active) return;
    last = String(shell.querySelector(":scope > .canvas-node-label") !== null);
    setMark(label, name, last);
  };
  const Observer = shell.ownerDocument?.defaultView?.MutationObserver;
  const observer = Observer === undefined ? undefined : new Observer(refresh);
  observer?.observe(shell, { childList: true });
  refresh();
  return {
    refresh,
    dispose: () => {
      active = false;
      observer?.disconnect();
      if (label.getAttribute(name) === last) setMark(label, name, previous);
    },
  };
}

/** Marks only the native paragraph that duplicates the title just before code. */
export class CodeHeadingMarks {
  private readonly marked = new Map<Element, string | null>();
  private active = true;
  private readonly name = "data-miro-code-heading";

  public constructor(private readonly root: Element) {}

  public refresh(): void {
    if (!this.active || typeof Reflect.get(this.root, "querySelectorAll") !== "function") return;
    const wanted = new Set<Element>();
    for (const paragraph of Array.from(this.root.querySelectorAll(".markdown-preview-view p"))) {
      if (paragraph.nextElementSibling?.tagName === "PRE") {
        wanted.add(paragraph);
        continue;
      }
      const wrapper = paragraph.parentElement;
      const next = wrapper?.nextElementSibling;
      if (wrapper?.classList.contains("el-p") && next?.classList.contains("el-pre")
        && next.querySelector(":scope > pre") !== null) {
        wanted.add(paragraph);
        if (wrapper.childElementCount === 1) wanted.add(wrapper);
      }
    }
    for (const element of wanted) {
      if (!this.marked.has(element)) this.marked.set(element, element.getAttribute(this.name));
      setMark(element, this.name, "true");
    }
    for (const [element, previous] of this.marked) {
      if (wanted.has(element)) continue;
      this.restore(element, previous);
      this.marked.delete(element);
    }
  }

  public dispose(): void {
    this.active = false;
    for (const [element, previous] of this.marked) this.restore(element, previous);
    this.marked.clear();
  }

  private restore(element: Element, previous: string | null): void {
    if (element.getAttribute(this.name) === "true") setMark(element, this.name, previous);
  }
}
