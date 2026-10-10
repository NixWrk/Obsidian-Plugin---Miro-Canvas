import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { transformSync } from "esbuild";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { createHtmlElement } from "../src/dom-elements";
import { words } from "../src/i18n";
import { replaceInvalidFilenameCharacters } from "../src/control-characters";

// Execute the assigned main methods without loading Obsidian's runtime or M1.
const source = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
const ast = ts.createSourceFile("main.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const plugin = ast.statements.find(ts.isClassDeclaration)!;
const names = ["initializationTimerHost", "initializationRetry", "shellDisposed", "canvasSnippets", "canvasSnippetScopes", "syncCanvasSnippetScopes", "exportJobs", "enhancementModals", "focusedLeaf", "handleActiveLeafChange", "disposeShell", "activeM1Session", "updateStatus", "pickFontFile", "openFileSourceMenu"];
const methods = names.map(name => plugin.members.find(member => member.name?.getText(ast) === name)!.getText(ast)).join("\n");
const sanitizer = ast.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === "sanitizeFontFileName")!;
const code = transformSync(`class PlatformProbe { ${methods}\nsettingsOfThisDevice() {}\ncurrentCanvasStillOpen() { return false; } }\nthis.PlatformProbe = PlatformProbe;\nthis.sanitize = ${sanitizer.getText(ast)};`, { loader: "ts", target: "es2020" }).code;

class ProbeView {
  leaf!: { view: ProbeView };
  constructor(readonly kind: string) {}
}
class ProbeFileView extends ProbeView { file: { path: string } | null = null; }

function timerOwner() {
  const callbacks = new Map<number, () => void>();
  let next = 0;
  const owner = {
    callbacks,
    setTimeout: vi.fn(function (this: unknown, callback: () => void, delay: number) {
      expect(this).toBe(owner);
      expect(delay).toBe(250);
      const handle = next++;
      callbacks.set(handle, callback);
      return handle;
    }),
    clearTimeout: vi.fn(function (this: unknown, handle: number) {
      expect(this).toBe(owner);
      callbacks.delete(handle);
    }),
    fire() {
      const [handle, callback] = callbacks.entries().next().value!;
      callbacks.delete(handle);
      callback();
    },
  };
  return owner;
}

function shell() {
  const owner = timerOwner();
  const state = { ready: false, mounts: 0 };
  const workspace = {
    activeLeaf: null as { view: ProbeView } | null,
    getActiveViewOfType: vi.fn((type: typeof ProbeView) => {
      // Native 1.13.7/1.14.4 implementation: focused view, no recent-leaf fallback.
      const view = workspace.activeLeaf?.view;
      return view instanceof type ? view : null;
    }),
  };
  const context = createContext({
    window: owner,
    obsidian: { View: ProbeView, FileView: ProbeFileView },
    isNativeCanvasView: (view: ProbeView | undefined) => view?.kind === "canvas",
    bindingOf: () => null,
    inspectCanvasView: () => null,
    createObsidianMetadataStore: () => ({ store: state.ready ? {} : null, diagnostics: [] }),
    MetadataWriter: class {},
    M1CanvasSession: class {
      mount() { state.mounts++; return state.ready; }
      dispose() {}
    },
    createHtmlElement,
    replaceInvalidFilenameCharacters,
  });
  runInContext(code, context);
  const instance = new context.PlatformProbe();
  instance.app = { workspace };
  instance.manifest = { id: "miro-canvas" };
  instance.canvasSettings = { automaticPropertyEdges: false };
  return { instance, context, workspace, owner, state };
}
function leaf(kind: string) {
  const view = new ProbeView(kind);
  const leaf = { view };
  view.leaf = leaf;
  return leaf;
}

describe("main platform methods (synthetic native contract)", () => {
  it("aborts independent jobs from every board only when the plugin unloads", () => {
    const f = shell();
    const first = new AbortController();
    const second = new AbortController();
    f.instance.exportJobs.add(first);
    f.instance.exportJobs.add(second);
    f.instance.disposeShell();
    expect(first.signal.aborted).toBe(true);
    expect(second.signal.aborted).toBe(true);
    expect(f.instance.exportJobs.size).toBe(0);
  });

  it("retains focused Canvas/sidebar/file/null identity rather than choosing a recent board", () => {
    const f = shell();
    expect(f.instance.focusedLeaf()).toBeNull();
    for (const kind of ["canvas", "markdown", "sidebar"]) {
      f.workspace.activeLeaf = leaf(kind);
      expect(f.instance.focusedLeaf()).toBe(f.workspace.activeLeaf);
    }
    f.workspace.activeLeaf = null;
    expect(f.instance.focusedLeaf()).toBeNull();
    expect(f.workspace.getActiveViewOfType).toHaveBeenCalledWith(ProbeView);
  });

  it("checks the actual focused view before offering the board session", () => {
    const f = shell();
    const board = leaf("canvas");
    const session = {};
    f.instance.currentCanvasView = board.view;
    f.instance.m1Session = session;
    f.workspace.activeLeaf = board;
    expect(f.instance.activeM1Session()).toBe(session);
    f.workspace.activeLeaf = leaf("sidebar");
    expect(f.instance.activeM1Session()).toBeNull();
    f.workspace.activeLeaf = null;
    expect(f.instance.activeM1Session()).toBeNull();
  });

  it("keeps retry guard, twenty attempts, 250ms and the same cleanup owner", () => {
    const f = shell();
    f.instance.updateStatus = () => {};
    const board = leaf("canvas");
    f.workspace.activeLeaf = board;
    f.instance.handleActiveLeafChange(board);
    expect(f.instance.initializationRetry).toBe(0);
    const other = timerOwner();
    f.context.window = other;
    f.workspace.activeLeaf = leaf("sidebar");
    f.owner.fire();
    expect(f.state.mounts).toBe(1);
    f.workspace.activeLeaf = board;
    f.instance.handleActiveLeafChange(board);
    for (let i = 0; i < 20; i++) f.owner.fire();
    expect(f.state.mounts).toBe(22);
    expect(f.owner.callbacks.size).toBe(0);
    f.state.ready = true;
    f.instance.handleActiveLeafChange(board);
    expect(f.owner.callbacks.size).toBe(0);
    f.state.ready = false;
    f.instance.handleActiveLeafChange(board);
    const handle = f.instance.initializationRetry;
    f.instance.disposeShell();
    expect(f.owner.clearTimeout).toHaveBeenCalledWith(handle);
    expect(f.owner.callbacks.size).toBe(0);
    const mounts = f.state.mounts;
    f.instance.disposeShell();
    f.instance.handleActiveLeafChange(board);
    expect(f.state.mounts).toBe(mounts);
    expect(other.setTimeout).not.toHaveBeenCalled();
    expect(other.clearTimeout).not.toHaveBeenCalled();
  });

  it("clears a pending retry before rebuilding for another leaf", () => {
    const f = shell();
    f.instance.updateStatus = () => {};
    const first = leaf("canvas"), second = leaf("canvas");
    f.workspace.activeLeaf = first;
    f.instance.handleActiveLeafChange(first);
    f.workspace.activeLeaf = second;
    f.instance.handleActiveLeafChange(second);
    expect(f.owner.clearTimeout).toHaveBeenCalledExactlyOnceWith(0);
    expect(f.owner.callbacks.size).toBe(1);
    f.instance.disposeShell();
    expect(f.owner.callbacks.size).toBe(0);
  });

  it("keeps the developer status text, visibility and state for the current plugin identity", () => {
    const f = shell();
    const status = { toggle: vi.fn(), setText: vi.fn(), dataset: {} as Record<string, string> };
    f.instance.statusBarItem = status;
    f.instance.canvasSettings = { developerDiagnostics: false };
    f.instance.updateStatus(false);
    expect(status.setText).toHaveBeenLastCalledWith("miro-canvas");
    expect(status.dataset.miroCanvasState).toBe("idle");
    f.instance.updateStatus(true);
    expect(status.setText).toHaveBeenLastCalledWith("miro-canvas · Canvas");
    expect(status.dataset.miroCanvasState).toBe("canvas");
    expect(status.toggle).toHaveBeenCalledWith(false);
  });

  it("creates the custom font picker in the supplied document and removes it after selection", async () => {
    const f = shell();
    const handlers = new Map<string, () => void>();
    const file = {};
    const input = { type: "", accept: "", hidden: false, files: [file], click: vi.fn(), remove: vi.fn(), addEventListener: (event: string, handler: () => void) => handlers.set(event, handler) };
    const owner = { createEl: vi.fn(function (this: unknown, tag: string) { expect(this).toBe(owner); expect(tag).toBe("input"); return input; }) };
    const doc = { defaultView: owner, body: { appendChild: vi.fn() } };
    f.context.document = doc;
    const result = f.instance.pickFontFile();
    expect(input.type).toBe("file");
    expect(input.accept).toBe(".ttf,.otf,.woff,.woff2");
    expect(input.hidden).toBe(true);
    expect(doc.body.appendChild).toHaveBeenCalledWith(input);
    handlers.get("change")!();
    expect(await result).toBe(file);
    expect(input.remove).toHaveBeenCalledOnce();
  });

  it("keeps attachment paths on the focused FileView and creates the picker in the button document", async () => {
    const f = shell();
    const view = new ProbeFileView("canvas");
    view.file = { path: "folder/board.canvas" };
    const active = { view };
    view.leaf = active;
    f.workspace.activeLeaf = active;
    f.instance.currentCanvasView = view;
    f.instance.m1Session = { addFiles: vi.fn(() => true) };
    const availablePath = vi.fn(async () => "attachment.txt");
    f.instance.app.fileManager = { getAvailablePathForAttachment: availablePath };
    f.instance.app.vault = { createBinary: vi.fn() };
    f.instance.register = vi.fn();
    const choices: (() => void)[] = [];
    f.context.Menu = class {
      addItem(build: (item: object) => void) {
        const item = { setTitle() { return item; }, setIcon() { return item; }, onClick(callback: () => void) { choices.push(callback); return item; } };
        build(item);
      }
      showAtPosition() {}
    };
    f.context.words = () => ({ deviceFiles: { fromVault: "Vault", fromDevice: "Device" } });
    f.context.storeDeviceFiles = async (_files: File[], deps: { availablePath: (name: string) => Promise<string> }) => { await deps.availablePath("attachment.txt"); return []; };
    const events = new Map<string, () => void>();
    const input = { files: [{}], type: "", multiple: false, hidden: false, click: vi.fn(), remove: vi.fn(), addEventListener: (event: string, callback: () => void) => events.set(event, callback) };
    const owner = { createEl: vi.fn(() => input) };
    const doc = { defaultView: owner, body: { appendChild: vi.fn() } };
    const button = { ownerDocument: doc, getBoundingClientRect: () => ({ left: 1, bottom: 2 }) };
    f.instance.openFileSourceMenu(button, vi.fn());
    expect(f.workspace.getActiveViewOfType).toHaveBeenCalledWith(ProbeFileView);
    choices[1]!();
    expect(input.multiple).toBe(true);
    expect(input.hidden).toBe(true);
    expect(owner.createEl.mock.contexts).toEqual([owner]);
    expect(doc.body.appendChild).toHaveBeenCalledWith(input);
    events.get("change")!();
    await vi.waitFor(() => expect(availablePath).toHaveBeenCalledWith("attachment.txt", "folder/board.canvas"));
    expect(input.remove).toHaveBeenCalledOnce();
  });

  it("preserves the full legacy registration, visible command name and custom hotkey mapping", () => {
    function registration(text: string) {
      const tree = ts.createSourceFile("main.ts", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
      let found: ts.CallExpression | undefined;
      function visit(node: ts.Node) {
        if (ts.isCallExpression(node) && node.expression.getText(tree) === "this.addCommand"
          && ts.isObjectLiteralExpression(node.arguments[0]!)) {
          const id = node.arguments[0]!.properties.find(property => ts.isPropertyAssignment(property) && property.name.getText(tree) === "id");
          if (id && ts.isPropertyAssignment(id) && id.initializer.getText(tree) === '"m1-commands"') found = node;
        }
        ts.forEachChild(node, visit);
      }
      visit(tree);
      return found!.getText(tree);
    }
    const f = shell();
    f.instance.manifest.name = "Miro Canvas";
    const customHotkeys = { "miro-canvas:m1-commands": [{ modifiers: ["Mod"], key: "M" }] };
    const saved = JSON.stringify(customHotkeys);
    const commands = new Map<string, { id: string; name: string }>();
    // Plugin.addCommand's verified native prefix/name behavior, no hotkey rewrite.
    f.instance.addCommand = (command: { id: string; name: string }) => {
      command.id = f.instance.manifest.id + ":" + command.id;
      command.name = f.instance.manifest.name + ": " + command.name;
      commands.set(command.id, command);
      return command;
    };
    f.context.words = words;
    f.context.plugin = f.instance;
    const registrationCode = transformSync('(function () { ' + registration(source) + '; }).call(plugin);', { loader: "ts" }).code;
    runInContext(registrationCode, f.context);
    expect([...commands.keys()]).toEqual(["miro-canvas:m1-commands"]);
    expect(commands.get("miro-canvas:m1-commands")!.name).toBe("Miro Canvas: " + words().commands.openControls);
    expect(JSON.stringify(customHotkeys)).toBe(saved);
  });

  it("preserves every UTF-16 filename character, trim, fallback and code-unit boundary", () => {
    const f = shell();
    const before = (name: string) => {
      const cleaned = name.replace(/[/\\:*?"<>|\u0000-\u001f]/gu, "_").trim();
      return cleaned === "" ? "font" : cleaned.slice(0, 180);
    };
    for (let code = 0; code < 65536; code++) {
      const char = String.fromCharCode(code);
      const value = `a${char}b`;
      if (f.context.sanitize(value) !== before(value)) throw new Error(`Filename mismatch U+${code.toString(16)}`);
    }
    for (const value of ["", " \t ", "font/../name:\u0000.woff2", "😀".repeat(91), "я".repeat(181), "x\ud800\udfff\u007f\u0085", " .file.ttf "]) {
      expect(f.context.sanitize(value)).toBe(before(value));
    }
  });
});
