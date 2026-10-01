/**
 * The keyboard focus on a control of the plugin's, and when a press on the
 * board should take it back.
 *
 * Native Canvas ignores a double click while a button or an input has the
 * focus.  A press on the board does not move the focus off a tool of the bar
 * that was pressed before - native Canvas takes the press of a touch for
 * itself, and cancels the default that would move it - so a card did not open
 * on a double tap right after a tool had been used.
 */

/** The input types that are pressed or dragged, not written in; any other input takes text. */
const NON_TEXT_INPUT_TYPES: ReadonlySet<string> = new Set([
  "button", "checkbox", "color", "file", "image", "radio", "range", "reset", "submit",
]);

/**
 * The control the focus sits on, if it is a button or another control of the
 * plugin's that nobody writes in: the bar's and the dock's buttons, a size
 * slider, a colour swatch.  A card's editor, the search field, a comment's
 * reply box and every other field that takes text is not one, and keeps the
 * focus it was given.  `controls` selects the plugin's own controls.
 */
export function controlToLetGo(active: Element | null | undefined, controls: string): HTMLElement | undefined {
  if (active === null || active === undefined || active.closest(controls) === null) return undefined;
  const tag = active.tagName.toUpperCase();
  if (tag === "BUTTON" || active.getAttribute("role") === "button") return active as HTMLElement;
  if (tag !== "INPUT") return undefined;
  const type = (active.getAttribute("type") ?? "text").toLowerCase();
  return NON_TEXT_INPUT_TYPES.has(type) ? (active as HTMLElement) : undefined;
}
