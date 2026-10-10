import { createHtmlElement } from "./dom-elements";

interface NativeMenuButtonState {
  readonly attributes: Map<string, string | null>;
  label?: HTMLSpanElement;
  shortcut?: HTMLSpanElement;
  originalOrder?: readonly Node[];
}

/** Mirror only the adopted native menu; board content is never observed. */
export function watchNativeMenuState(slot: HTMLElement, menu: HTMLElement, snapshot: HTMLElement,
  onLayoutChange: () => void = () => undefined): {
  readonly refresh: () => void;
  readonly dispose: () => void;
} {
  const duplicateAttribute = "data-miro-native-duplicate";
  const dangerAttribute = "data-miro-native-danger";
  const unlabeledAttribute = "data-miro-native-unlabeled";
  const buttons = new Map<Element, NativeMenuButtonState>();
  const stateAttributes = ["data-miro-native-menu", "data-miro-native-visible"] as const;
  const previousState = new Map(stateAttributes.map((name) => [name, slot.getAttribute(name)]));
  let disposed = false;
  let observer: MutationObserver | undefined;
  const set = (element: Element, name: string, value: string | null): void => {
    if (element.getAttribute(name) === value) return;
    if (value === null) element.removeAttribute(name);
    else element.setAttribute(name, value);
  };
  const mark = (button: Element, state: NativeMenuButtonState, name: string, active: boolean): void => {
    if (active) {
      if (!state.attributes.has(name)) state.attributes.set(name, button.getAttribute(name));
      set(button, name, "true");
    } else if (state.attributes.has(name)) {
      if (button.getAttribute(name) === "true") set(button, name, state.attributes.get(name) ?? null);
      state.attributes.delete(name);
    }
  };
  const restoreOrder = (button: Element, state: NativeMenuButtonState): void => {
    const order = state.originalOrder;
    state.originalOrder = undefined;
    if (order === undefined || button.parentNode !== menu) return;
    const index = order.indexOf(button);
    const following = order.slice(index + 1).find((node) => node.parentNode === menu);
    const preceding = order.slice(0, index).reverse().find((node) => node.parentNode === menu);
    const next = following ?? preceding?.nextSibling;
    if (next !== undefined && next !== button && button.nextSibling !== next) menu.insertBefore(button, next);
  };
  const clearLabels = (state: NativeMenuButtonState): void => {
    state.label?.remove();
    state.shortcut?.remove();
    state.label = undefined;
    state.shortcut = undefined;
  };
  const restoreButton = (button: Element, state: NativeMenuButtonState): void => {
    clearLabels(state);
    for (const [name, previous] of state.attributes) {
      if (button.getAttribute(name) === "true") set(button, name, previous);
    }
    restoreOrder(button, state);
  };
  const syncText = (button: Element, element: HTMLSpanElement | undefined, className: string,
    text: string): HTMLSpanElement | undefined => {
    if (text.length === 0) {
      element?.remove();
      return undefined;
    }
    if (element === undefined) {
      element = createHtmlElement(button.ownerDocument, "span");
      element.className = className;
      element.setAttribute("aria-hidden", "true");
    }
    if (element.textContent !== text) element.textContent = text;
    if (element.parentNode !== button) button.appendChild(element);
    return element;
  };
  const refresh = (): void => {
    if (disposed) return;
    const children = Array.from(menu.children);
    const order = Array.from(menu.childNodes);
    const current = new Set(children.filter((child) => child.tagName === "BUTTON"));
    for (const [button, state] of buttons) {
      if (current.has(button)) continue;
      restoreButton(button, state);
      buttons.delete(button);
    }
    const dangers = new Set<Element>();
    for (const button of current) {
      let state = buttons.get(button);
      if (state === undefined) {
        state = { attributes: new Map() };
        buttons.set(button, state);
      }
      const duplicate = button.querySelector(":scope > .lucide-palette, :scope > .lucide-arrow-right") !== null;
      mark(button, state, duplicateAttribute, duplicate);
      const danger = !duplicate && button.querySelector(":scope > .lucide-trash-2") !== null;
      mark(button, state, dangerAttribute, danger);
      if (danger) dangers.add(button);
      else restoreOrder(button, state);
      const lines = (button.getAttribute("aria-label") ?? "").split(/\r?\n/);
      const label = lines[0]?.trim() ?? "";
      mark(button, state, unlabeledAttribute, !duplicate && label.length === 0);
      if (duplicate || label.length === 0) {
        clearLabels(state);
        continue;
      }
      const shortcut = lines.slice(1).map((line) => line.trim()).filter(Boolean).join(" ")
        .replace(/^\(([^()]*)\)$/, "$1").trim();
      state.label = syncText(button, state.label, "miro-canvas-toolbar__menu-label", label);
      state.shortcut = syncText(button, state.shortcut, "miro-canvas-toolbar__menu-shortcut", shortcut);
    }
    for (const button of dangers) {
      let next = button.nextSibling;
      while (next !== null && dangers.has(next as Element)) next = next.nextSibling;
      if (next === null) continue;
      const state = buttons.get(button);
      if (state === undefined) continue;
      state.originalOrder ??= order;
      menu.appendChild(button);
    }
    const live = menu.childNodes.length > 0;
    const deleteButton = slot.querySelector(":scope > .miro-canvas-toolbar__button--delete:not([hidden])");
    set(slot, "data-miro-native-menu", String(live));
    set(slot, "data-miro-native-visible", String(live || !snapshot.hidden || deleteButton !== null));
    // All queued native changes have just been reconciled. Drain our label/order echoes
    // before placement runs, so its own hidden changes still reach the observer.
    observer?.takeRecords();
    onLayoutChange();
  };
  const Observer = slot.ownerDocument.defaultView?.MutationObserver;
  observer = Observer === undefined ? undefined : new Observer((records) => {
    // A native button reinserted in one batch starts with its new native order.
    for (const record of records) {
      if (record.type !== "childList" || record.target !== menu) continue;
      for (const node of Array.from(record.removedNodes)) {
        const state = buttons.get(node as Element);
        if (state === undefined) continue;
        state.originalOrder = undefined;
        restoreButton(node as Element, state);
        buttons.delete(node as Element);
      }
    }
    refresh();
  });
  observer?.observe(slot, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "aria-label"] });
  refresh();
  return {
    refresh,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      observer?.disconnect();
      for (const [button, state] of Array.from(buttons).reverse()) restoreButton(button, state);
      buttons.clear();
      for (const [name, previous] of previousState) set(slot, name, previous);
    },
  };
}
