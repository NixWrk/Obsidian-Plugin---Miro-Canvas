import { describe, expect, it } from "vitest";

import { bindingOf, stillTheBoard } from "../src/board-binding";

/** A Canvas view showing a file; `null` for the runtime is a view that has not made one yet. */
const board = (path: string | undefined, runtime: object | null = {}) => ({ file: path === undefined ? null : { path }, canvas: runtime ?? undefined });

describe("which board a session was built for", () => {
  it("reads the view, the file it shows and the runtime it runs on", () => {
    const runtime = {};
    const view = board("Boards/Plan.canvas", runtime);
    expect(bindingOf(view)).toEqual({ view, file: "Boards/Plan.canvas", runtime });
    expect(bindingOf(board(undefined, null))).toEqual({ view: expect.anything(), file: undefined, runtime: undefined });
    expect(bindingOf(undefined).file).toBeUndefined();
    expect(bindingOf(null).runtime).toBeUndefined();
  });

  it("takes a ready session for the board it was built for, however often Obsidian says a file was opened", () => {
    const view = board("Boards/Plan.canvas");
    expect(stillTheBoard(bindingOf(view), view, true)).toBe(true);
  });

  it("does not, once it is another file in the same view", () => {
    const view = board("Boards/Plan.canvas");
    const bound = bindingOf(view);
    view.file = { path: "Boards/Other.canvas" };
    expect(stillTheBoard(bound, view, true)).toBe(false);
  });

  it("does not, for a runtime made anew, or one that is not there yet", () => {
    const view = board("Boards/Plan.canvas");
    const bound = bindingOf(view);
    view.canvas = {};
    expect(stillTheBoard(bound, view, true)).toBe(false);
    const unfinished = board("Boards/Plan.canvas", null);
    expect(stillTheBoard(bindingOf(unfinished), unfinished, true)).toBe(false);
  });

  it("does not, for another view, a session that is not ready, or none", () => {
    const view = board("Boards/Plan.canvas");
    expect(stillTheBoard(bindingOf(view), { ...view }, true)).toBe(false);
    expect(stillTheBoard(bindingOf(view), view, false)).toBe(false);
    expect(stillTheBoard(null, view, true)).toBe(false);
  });
});
