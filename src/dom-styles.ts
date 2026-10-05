/** Obsidian's style setter, with a browser-only fallback for the test host. */
export function setElementStyles(element: HTMLElement, styles: Record<string, string>): void {
  if (typeof element.setCssStyles === "function") {
    element.setCssStyles(styles);
    return;
  }
  for (const [property, value] of Object.entries(styles)) {
    if (typeof element.style.setProperty === "function") element.style.setProperty(property, value);
    else Reflect.set(element.style, property.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase()), value);
  }
}
