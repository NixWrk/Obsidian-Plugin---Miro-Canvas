/** Mirror only the adopted native menu; board content is never observed. */
export function watchNativeMenuState(slot: HTMLElement, menu: HTMLElement, snapshot: HTMLElement,
  onLayoutChange: () => void = () => undefined): {
  readonly refresh: () => void;
  readonly dispose: () => void;
} {
  const duplicateAttribute = "data-miro-native-duplicate";
  const markedButtons = new Map<Element, string | null>();
  const stateAttributes = ["data-miro-native-menu", "data-miro-native-visible"] as const;
  const previousState = new Map(stateAttributes.map((name) => [name, slot.getAttribute(name)]));
  const set = (element: Element, name: string, value: string | null): void => {
    if (element.getAttribute(name) === value) return;
    if (value === null) element.removeAttribute(name);
    else element.setAttribute(name, value);
  };
  const restoreButton = (button: Element, previous: string | null): void => {
    if (button.getAttribute(duplicateAttribute) === "true") set(button, duplicateAttribute, previous);
  };
  const refresh = (): void => {
    const duplicates = new Set<Element>();
    for (const child of Array.from(menu.children)) {
      if (child.tagName !== "BUTTON") continue;
      if (child.querySelector(":scope > .lucide-palette, :scope > .lucide-arrow-right") === null) continue;
      duplicates.add(child);
      if (!markedButtons.has(child)) markedButtons.set(child, child.getAttribute(duplicateAttribute));
      set(child, duplicateAttribute, "true");
    }
    for (const [button, previous] of markedButtons) {
      if (duplicates.has(button)) continue;
      restoreButton(button, previous);
      markedButtons.delete(button);
    }
    const live = menu.childNodes.length > 0;
    const deleteButton = slot.querySelector(":scope > .miro-canvas-toolbar__button--delete:not([hidden])");
    set(slot, "data-miro-native-menu", String(live));
    set(slot, "data-miro-native-visible", String(live || !snapshot.hidden || deleteButton !== null));
    onLayoutChange();
  };
  const Observer = slot.ownerDocument.defaultView?.MutationObserver;
  const observer = Observer === undefined ? undefined : new Observer(refresh);
  observer?.observe(slot, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
  refresh();
  return {
    refresh,
    dispose: () => {
      observer?.disconnect();
      for (const [button, previous] of markedButtons) restoreButton(button, previous);
      markedButtons.clear();
      for (const [name, previous] of previousState) set(slot, name, previous);
    },
  };
}
