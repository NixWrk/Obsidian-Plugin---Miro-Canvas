type CanvasTheme = "light" | "dark";
type LegacyMediaListeners = {
  addListener?: (listener: () => void) => void;
  removeListener?: (listener: () => void) => void;
};

function hostTheme(document: Document | undefined): CanvasTheme | undefined {
  try {
    const classes = document?.body?.classList;
    if (classes?.contains("theme-dark")) return "dark";
    if (classes?.contains("theme-light")) return "light";
  } catch {
    // An unavailable host theme leaves the board's system fallback in charge.
  }
  return undefined;
}

function systemMedia(document: Document | undefined): MediaQueryList | undefined {
  try {
    return document?.defaultView?.matchMedia?.("(prefers-color-scheme: dark)");
  } catch {
    return undefined;
  }
}

function mediaTheme(media: MediaQueryList | undefined): CanvasTheme {
  try {
    return media?.matches === true ? "dark" : "light";
  } catch {
    return "light";
  }
}

/** System follows the board window's Obsidian appearance before its OS preference. */
export function resolveCanvasTheme(theme: unknown, document: Document | undefined): CanvasTheme {
  if (theme === "light" || theme === "dark") return theme;
  return hostTheme(document) ?? mediaTheme(systemMedia(document));
}

function release(dispose: (() => void) | undefined): void {
  try {
    dispose?.();
  } catch {
    // A closing board window must not prevent the other watcher from stopping.
  }
}

/** Watch only the host theme and the OS fallback; never decorate the document. */
export function watchCanvasTheme(document: Document | undefined, callback: () => void): () => void {
  const media = systemMedia(document);
  let lastTheme = hostTheme(document) ?? mediaTheme(media);
  let active = true;
  let stopObserver: (() => void) | undefined;
  let stopMedia: (() => void) | undefined;
  const changed = (): void => {
    if (!active) return;
    const theme = hostTheme(document) ?? mediaTheme(media);
    if (theme === lastTheme) return;
    lastTheme = theme;
    callback();
  };

  try {
    const body = document?.body;
    const owner = document?.defaultView as (Window & { MutationObserver?: typeof MutationObserver }) | null | undefined;
    const Observer = owner?.MutationObserver;
    if (body && typeof Observer === "function") {
      let observing = true;
      const observer = new Observer(() => {
        if (observing) changed();
      });
      stopObserver = () => {
        observing = false;
        observer.disconnect();
      };
      observer.observe(body, { attributes: true, attributeFilter: ["class"] });
    }
  } catch {
    release(stopObserver);
    stopObserver = undefined;
  }

  const legacy = media as unknown as LegacyMediaListeners | undefined;
  try {
    if (media && typeof media.addEventListener === "function" && typeof media.removeEventListener === "function") {
      let listening = true;
      const listener = (): void => {
        if (listening) changed();
      };
      stopMedia = () => {
        listening = false;
        media.removeEventListener("change", listener);
      };
      media.addEventListener("change", listener);
    } else if (legacy && typeof legacy.addListener === "function" && typeof legacy.removeListener === "function") {
      let listening = true;
      const listener = (): void => {
        if (listening) changed();
      };
      stopMedia = () => {
        listening = false;
        legacy.removeListener?.(listener);
      };
      legacy.addListener(listener);
    }
  } catch {
    release(stopMedia);
    stopMedia = undefined;
  }

  return () => {
    if (!active) return;
    active = false;
    release(stopObserver);
    release(stopMedia);
    stopObserver = undefined;
    stopMedia = undefined;
  };
}
