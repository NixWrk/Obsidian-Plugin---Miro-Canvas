/**
 * Which board a session was made for, so that the plugin can tell a Canvas
 * view that is still the same board from one that is another, or has not
 * finished building.
 *
 * Obsidian reports a file opened whenever a card's editor takes the focus,
 * a single card picked with a press being enough, with the same board still
 * on screen.  Rebuilding the session on each of those would throw away what
 * it holds - the armed tool, the lasso among them, which is to stay armed
 * until another tool is picked - so a session that stands for the board still
 * on screen is left as it is.
 */

/** What a session was built for: the Canvas view, the file it showed, and the runtime it reads and writes. */
export interface BoardBinding {
  readonly view: unknown;
  readonly file: string | undefined;
  readonly runtime: unknown;
}

/** What a Canvas view stands for now. */
export function bindingOf(view: unknown): BoardBinding {
  const shown = view as { readonly file?: { readonly path?: unknown } | null; readonly canvas?: unknown } | null | undefined;
  const path = shown?.file?.path;
  return { view, file: typeof path === "string" ? path : undefined, runtime: shown?.canvas };
}

/**
 * Whether a session built for `bound` still stands for `view`: it was built
 * for this very view, showing this very file, on this very runtime, and has
 * finished building.  Anything less - another file in the same view, a
 * runtime made anew, a view whose runtime is not there yet - is a board that
 * needs a session of its own.
 */
export function stillTheBoard(bound: BoardBinding | null, view: unknown, ready: boolean): boolean {
  if (bound === null || !ready) return false;
  const now = bindingOf(view);
  return now.view === bound.view && now.runtime !== undefined && now.runtime === bound.runtime && now.file === bound.file;
}
