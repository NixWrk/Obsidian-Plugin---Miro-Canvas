/** Content thresholds use linear Canvas scale (1 = 100%). Zero disables hiding. */
export const CONTENT_KINDS = ["text", "file", "link", "plugin"] as const;
export type ContentKind = typeof CONTENT_KINDS[number];
export type ContentThresholds = Readonly<Record<ContentKind, number>>;
export const DEFAULT_CONTENT_THRESHOLDS: ContentThresholds = Object.freeze({ text: 0, file: 0, link: 0, plugin: 0 });

export interface ContentTarget {
  readonly id: string;
  readonly kind: ContentKind;
  /** Content only: never the card shell, selection outline or resize handles. */
  readonly content: HTMLElement | SVGElement;
  readonly shell: HTMLElement;
  readonly selected?: boolean;
  readonly editing?: boolean;
  /** Verified native classes which hide content, on the shell. */
  readonly nativeHiddenClasses?: readonly string[];
}

export interface ContentBreakpointSnapshot {
  readonly zoom: number;
  readonly thresholds: ContentThresholds;
  readonly boardIdentity: unknown;
  /** Change on mount/unmount, native hidden-state changes or content replacement. */
  readonly targetsIdentity: unknown;
  /** Change when selection or editing changes. */
  readonly interactionIdentity: unknown;
  readonly targets: () => readonly ContentTarget[];
}

interface ContentPatch {
  readonly target: ContentTarget;
  readonly restore: () => void;
}

export function contentThresholdBand(zoom: number, thresholds: ContentThresholds): string {
  if (!Number.isFinite(zoom) || zoom <= 0) throw new Error("Content scale must be finite and positive.");
  return CONTENT_KINDS.map(kind => {
    const threshold = thresholds[kind];
    if (!Number.isFinite(threshold) || threshold < 0) throw new Error(`Invalid content threshold: ${kind}.`);
    return zoom < threshold ? "0" : "1";
  }).join("");
}

/** Parent invalidates identities; unchanged zoom bands perform no card work. */
export class ContentBreakpoints {
  private snapshot: ContentBreakpointSnapshot | undefined;
  private band: string | undefined;
  private readonly patches: ContentPatch[] = [];
  private disposed = false;
  private readonly onFocus = (event: Event): void => {
    this.apply(event.type === "focusout" ? (event as FocusEvent).relatedTarget as Element | null : undefined);
  };

  public constructor(private readonly root: HTMLElement) {
    root.addEventListener("focusin", this.onFocus);
    root.addEventListener("focusout", this.onFocus);
  }

  public update(next: ContentBreakpointSnapshot): boolean {
    if (this.disposed) return false;
    const band = `${contentThresholdBand(next.zoom, next.thresholds)}:${CONTENT_KINDS.map(kind => next.thresholds[kind]).join(",")}`;
    const previous = this.snapshot;
    this.snapshot = next;
    if (previous !== undefined && band === this.band && next.boardIdentity === previous.boardIdentity
      && next.targetsIdentity === previous.targetsIdentity && next.interactionIdentity === previous.interactionIdentity) return false;
    this.band = band;
    this.apply();
    return true;
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeEventListener("focusin", this.onFocus);
    this.root.removeEventListener("focusout", this.onFocus);
    this.release();
    this.snapshot = undefined;
  }

  private release(): void {
    for (const patch of this.patches.splice(0)) patch.restore();
  }

  private apply(focused?: Element | null): void {
    this.release();
    const snapshot = this.snapshot;
    if (this.disposed || snapshot === undefined) return;
    const active = focused === undefined ? this.root.ownerDocument.activeElement : focused;
    for (const target of snapshot.targets()) {
      // Offscreen targets are handled when the parent changes targetsIdentity.
      if (!this.root.contains(target.shell) || !target.shell.contains(target.content)) continue;
      const protectedContent = target.selected === true || target.editing === true || (active !== null && target.shell.contains(active));
      const hidden = snapshot.zoom < snapshot.thresholds[target.kind];
      if (snapshot.thresholds[target.kind] === 0 && !protectedContent) continue;
      const reveal = !hidden || protectedContent;
      const content = target.content;
      const originalVisibility = content.style.getPropertyValue("visibility");
      const originalPriority = content.style.getPropertyPriority("visibility");
      const visibility = reveal ? "visible" : "hidden";
      content.style.setProperty("visibility", visibility);
      const originalHidden = content.getAttribute("hidden");
      const removedClasses = reveal
        ? (target.nativeHiddenClasses ?? []).filter(name => target.shell.classList.contains(name)) : [];
      if (reveal) {
        content.removeAttribute("hidden");
        for (const name of removedClasses) target.shell.classList.remove(name);
      }
      this.patches.push({ target, restore: () => {
        if (content.style.getPropertyValue("visibility") === visibility && content.style.getPropertyPriority("visibility") === "") {
          if (originalVisibility === "") content.style.removeProperty("visibility");
          else content.style.setProperty("visibility", originalVisibility, originalPriority);
        }
        if (reveal && originalHidden !== null && !content.hasAttribute("hidden")) content.setAttribute("hidden", originalHidden);
        for (const name of removedClasses) target.shell.classList.add(name);
      } });
    }
  }
}
