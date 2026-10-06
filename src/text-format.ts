import { APPEARANCE_ACTIONS, fontStack, isSafeFontFamily, type AppearanceAction } from "./appearance";

/** Selected words keep their formatting in the card's own text. */
export function formatTextSelection(text: string, action: AppearanceAction, html = false): string | undefined {
  if (action.type === APPEARANCE_ACTIONS.setFormat) {
    const outerSpan = /^(<span\s+style="[^"]*">)([\s\S]*)(<\/span>)$/u.exec(text);
    if (outerSpan !== null) {
      const inner = formatTextSelection(outerSpan[2], action, html);
      return inner === undefined ? undefined : `${outerSpan[1]}${inner}${outerSpan[3]}`;
    }
    const format = action.format;
    if (format === null || typeof format !== "object") return undefined;
    for (const [key, markdown, tag] of [
      ["bold", "**", "strong"], ["italic", "*", "em"],
      ["strike", "~~", "s"], ["underline", "", "u"],
    ] as const) {
      if (typeof (format as Record<string, unknown>)[key] !== "boolean") continue;
      const open = html || markdown === "" ? `<${tag}>` : markdown;
      const close = html || markdown === "" ? `</${tag}>` : markdown;
      const sameMark = markdown !== "*" || !text.startsWith("**") && !text.endsWith("**");
      if (sameMark && text.startsWith(open) && text.endsWith(close) && text.length >= open.length + close.length) {
        return text.slice(open.length, -close.length);
      }
      return text.split("\n").map((line) => {
        const match = /^(\s*)(.*?)(\s*)$/u.exec(line)!;
        return match[2] === "" ? line : `${match[1]}${open}${match[2]}${close}${match[3]}`;
      }).join("\n");
    }
  }
  if (action.type === APPEARANCE_ACTIONS.setFontFamily && isSafeFontFamily(action.fontFamily)) {
    return span(text, "font-family", fontStack(action.fontFamily));
  }
  if (action.type === APPEARANCE_ACTIONS.setFontSize && typeof action.fontSize === "number"
    && Number.isFinite(action.fontSize) && action.fontSize >= 6 && action.fontSize <= 256) {
    return span(text, "font-size", `${action.fontSize}px`);
  }
  return undefined;
}

function span(text: string, property: string, value: string): string {
  const escaped = value.replace(/&/gu, "&amp;").replace(/"/gu, "&quot;").replace(/</gu, "&lt;");
  return `<span style="${property}: ${escaped}">${text}</span>`;
}
