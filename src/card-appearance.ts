import type { MiroCanvasSettings } from "./settings";

const CORNERS = "data-miro-canvas-card-corners";
const RADIUS = "--miro-canvas-card-radius";
const CARD_SOURCE_KINDS = new Set(["card", "app-card", "preview", "document", "embed", "image"]);

/** Diagram geometry belongs to the figure; only card faces get a default radius. */
export function hasCardCorners(kind: string | undefined, sourceKind: string | null, appCard: boolean): boolean {
  if (kind !== "text" && kind !== "file" && kind !== "link") return false;
  return appCard || sourceKind === null || CARD_SOURCE_KINDS.has(sourceKind);
}

/** Own only board decoration, restoring pre-existing values even on detached cards. */
export class CardAppearance {
  private readonly cards = new Map<HTMLElement, string | null>();
  private readonly priorRadius: string;
  private readonly priorPriority: string;

  public constructor(private readonly root: HTMLElement, settings: Pick<MiroCanvasSettings, "cardCornerRadius">) {
    this.priorRadius = root.style.getPropertyValue(RADIUS);
    this.priorPriority = root.style.getPropertyPriority(RADIUS);
    root.style.setProperty(RADIUS, `${settings.cardCornerRadius}px`);
  }

  public mark(shell: HTMLElement, kind: string | undefined): void {
    if (!this.root.contains(shell)) return;
    const eligible = hasCardCorners(kind, shell.getAttribute("data-miro-source-kind"), shell.getAttribute("data-miro-source-card-kind") !== null);
    if (eligible) {
      if (!this.cards.has(shell)) this.cards.set(shell, shell.getAttribute(CORNERS));
      shell.setAttribute(CORNERS, "true");
    } else if (this.cards.has(shell)) {
      this.restoreCard(shell, this.cards.get(shell) ?? null);
      this.cards.delete(shell);
    }
  }

  public dispose(): void {
    for (const [shell, prior] of this.cards) this.restoreCard(shell, prior);
    this.cards.clear();
    if (this.priorRadius === "") this.root.style.removeProperty(RADIUS);
    else this.root.style.setProperty(RADIUS, this.priorRadius, this.priorPriority);
  }

  private restoreCard(shell: HTMLElement, prior: string | null): void {
    if (prior === null) shell.removeAttribute(CORNERS);
    else shell.setAttribute(CORNERS, prior);
  }
}
