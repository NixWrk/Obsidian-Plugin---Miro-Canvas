import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { transformSync } from "esbuild";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { bindingOf, stillTheBoard } from "../src/board-binding";

const source = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
const ast = ts.createSourceFile("main.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const plugin = ast.statements.find(ts.isClassDeclaration)!;
const member = plugin.members.find((item) => item.name?.getText(ast) === "handleLeafActivated")!;
const code = transformSync(`class LeafProbe { ${member.getText(ast)} } this.LeafProbe = LeafProbe;`, { loader: "ts", target: "es2020" }).code;

function probe(boundView: unknown, status: string | undefined) {
  const context = createContext({ stillTheBoard });
  runInContext(code, context);
  const LeafProbe = (context as unknown as { LeafProbe: new () => Record<string, unknown> }).LeafProbe;
  const instance = new LeafProbe() as Record<string, unknown> & { handleLeafActivated: (leaf: unknown) => void };
  const rebuild = vi.fn();
  const scopes = vi.fn();
  Object.assign(instance, {
    currentCanvasBinding: boundView === null ? null : bindingOf(boundView),
    m1Session: status === undefined ? null : { status },
    handleActiveLeafChange: rebuild,
    syncCanvasSnippetScopes: scopes,
    settingsOfThisDevice: vi.fn(),
  });
  return { instance, rebuild, scopes };
}

describe("a leaf that becomes the active one", () => {
  const view = { file: { path: "Boards/Plan.canvas" }, canvas: {}, containerEl: { ownerDocument: {} } };

  it("leaves the session of a board that gets the focus back, so a press on its dock keeps what it opened", () => {
    const { instance, rebuild, scopes } = probe(view, "ready");
    instance.handleLeafActivated({ view });
    expect(rebuild).not.toHaveBeenCalled();
    expect(scopes).toHaveBeenCalledOnce();
  });

  it("builds a session for another board, an unfinished one, or a leaf that is no board", () => {
    const other = { ...view, canvas: {} };
    for (const [bound, status, leaf] of [[view, "ready", { view: other }], [view, "mounting", { view }], [null, undefined, { view }], [view, "ready", { view: {} }], [view, "ready", null]] as const) {
      const { instance, rebuild } = probe(bound, status);
      instance.handleLeafActivated(leaf);
      expect(rebuild).toHaveBeenCalledWith(leaf);
    }
  });
});
