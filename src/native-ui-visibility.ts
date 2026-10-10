interface DisplayValue {
  readonly value: string;
  readonly priority: string;
}

interface NativeUiTarget {
  readonly element: HTMLElement;
  kind: "controls" | "menu";
  active: boolean;
  display?: DisplayValue;
  hidden: string | null;
}

interface OwnMutation {
  readonly element: HTMLElement;
  readonly attribute: "style" | "hidden";
  readonly oldValue: string | null;
}

function displayValue(element: HTMLElement): DisplayValue | undefined {
  const style = element.style;
  if (typeof style?.getPropertyValue !== "function" || typeof style.getPropertyPriority !== "function"
    || typeof style.setProperty !== "function" || typeof style.removeProperty !== "function") return undefined;
  return { value: style.getPropertyValue("display"), priority: style.getPropertyPriority("display") };
}

/** Reversibly suppress only the fixed native controls and menus this board owns. */
export function watchNativeUiVisibility(root: HTMLElement,
  elements: readonly { element: HTMLElement; kind: "controls" | "menu" }[],
  isIndependentOnly: () => boolean): { refresh(): void; dispose(): void } {
  const targets = new Map<HTMLElement, NativeUiTarget>();
  for (const { element, kind } of elements) {
    const previous = targets.get(element);
    if (previous !== undefined) {
      if (kind === "controls") previous.kind = kind;
      continue;
    }
    targets.set(element, { element, kind, active: false, hidden: null });
  }
  const ownMutations: OwnMutation[] = [];
  let observer: MutationObserver | undefined;
  let disposed = false;
  const write = (element: HTMLElement, attribute: "style" | "hidden", change: () => void): void => {
    const own = observer === undefined ? undefined : { element, attribute, oldValue: element.getAttribute(attribute) };
    if (own !== undefined) ownMutations.push(own);
    try {
      change();
    } catch (error) {
      if (own !== undefined) ownMutations.splice(ownMutations.indexOf(own), 1);
      throw error;
    }
  };
  const setDisplay = (element: HTMLElement, desired: DisplayValue): void => {
    const current = displayValue(element);
    if (current === undefined || (current.value === desired.value && current.priority === desired.priority)) return;
    write(element, "style", () => {
      if (desired.value === "") element.style.removeProperty("display");
      else element.style.setProperty("display", desired.value, desired.priority);
    });
  };
  const setHidden = (element: HTMLElement, desired: string | null): void => {
    if (element.getAttribute("hidden") === desired) return;
    write(element, "hidden", () => {
      if (desired === null) element.removeAttribute("hidden");
      else element.setAttribute("hidden", desired);
    });
  };
  const consume = (records: readonly MutationRecord[] = []): void => {
    for (const record of records) {
      const index = ownMutations.findIndex(own => own.element === record.target && own.attribute === record.attributeName);
      if (index >= 0 && ownMutations[index].oldValue === record.oldValue) {
        ownMutations.splice(index, 1);
        continue;
      }
      if (record.attributeName !== "hidden") continue;
      const target = targets.get(record.target as HTMLElement);
      if (target?.active) target.hidden = target.element.getAttribute("hidden");
    }
  };
  const drain = (): void => {
    if (typeof observer?.takeRecords === "function") consume(observer.takeRecords());
  };
  const release = (target: NativeUiTarget): void => {
    if (!target.active) return;
    const current = displayValue(target.element);
    if (target.display !== undefined && current?.value === "none" && current.priority === "") {
      setDisplay(target.element, target.display);
    }
    if (target.element.getAttribute("hidden") === "") setHidden(target.element, target.hidden);
    target.active = false;
    target.display = undefined;
  };
  const refresh = (): void => {
    if (disposed) return;
    drain();
    const hideMenus = root.classList.contains("is-screenshotting")
      || root.classList.contains("miro-canvas-presenting")
      || root.classList.contains("miro-canvas-reviewing") || isIndependentOnly();
    for (const target of targets.values()) {
      if (target.kind === "menu" && !hideMenus) {
        release(target);
        continue;
      }
      const current = displayValue(target.element);
      const hidden = target.element.getAttribute("hidden");
      if (!target.active || target.display === undefined || current?.value !== "none" || current.priority !== "") {
        target.display = current;
      }
      if (!target.active || hidden !== "") target.hidden = hidden;
      target.active = true;
      setDisplay(target.element, { value: "none", priority: "" });
      setHidden(target.element, "");
    }
  };
  try {
    refresh();
  } catch (error) {
    for (const target of targets.values()) release(target);
    throw error;
  }
  const Observer = root.ownerDocument?.defaultView?.MutationObserver;
  if (typeof Observer === "function") {
    try {
      observer = new Observer(records => {
        if (disposed) return;
        consume(records);
        refresh();
      });
      if (typeof observer.observe !== "function" || typeof observer.disconnect !== "function" || typeof observer.takeRecords !== "function") {
        if (typeof observer.disconnect === "function") observer.disconnect();
        observer = undefined;
      } else {
        observer.observe(root, { attributes: true, attributeFilter: ["class"] });
        for (const target of targets.values()) {
          observer.observe(target.element, { attributes: true, attributeFilter: ["style", "hidden"], attributeOldValue: true });
        }
      }
    } catch {
      if (typeof observer?.disconnect === "function") observer.disconnect();
      observer = undefined;
      ownMutations.length = 0;
    }
  }
  return {
    refresh,
    dispose: () => {
      if (disposed) return;
      drain();
      disposed = true;
      if (typeof observer?.disconnect === "function") observer.disconnect();
      observer = undefined;
      ownMutations.length = 0;
      for (const target of targets.values()) release(target);
      targets.clear();
    },
  };
}
