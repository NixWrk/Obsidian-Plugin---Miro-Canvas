import { afterEach, expect, it, vi } from "vitest";
import { M1CanvasSession } from "../src/m1-session";
import { DEFAULT_SETTINGS, type MiroCanvasSettings } from "../src/settings";
import { DEFAULT_EXPORT_STATE } from "../src/export-pages";

// Exercise the real export caller/independent constructor, with UI/raster/packing boundaries stubbed.
vi.mock("../src/m1-controls", async original => ({ ...await original<object>(), M1Controls: class {} }));
vi.mock("../src/selection-toolbar", async original => ({ ...await original<object>(), SelectionToolbar: class {} }));
vi.mock("../src/selection-handles", async original => ({ ...await original<object>(), SelectionHandles: class {} }));
vi.mock("../src/comment-markers", () => ({ CommentMarkers: class {} }));
vi.mock("../src/quick-tools", async original => ({ ...await original<object>(), QuickTools: class {} }));

const boundary = vi.hoisted(() => ({ create: vi.fn(), render: vi.fn(), pack: vi.fn() }));
vi.mock("../src/export-canvas", async original => ({ ...await original<object>(), createExportCanvas: boundary.create }));
vi.mock("../src/board-export", async original => ({ ...await original<object>(), renderExportPages: boundary.render }));
vi.mock("../src/export-worker-client", () => ({ packExport: boundary.pack }));

afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });

it.each([false, true])("isolates exported styles, palette, zoom and collapsed state (raster fails: %s)", async fails => {
  const saved = {
    nodes: [{ id: "group", type: "group", x: 0, y: 0, width: 900, height: 700 }], edges: [],
    miroSource: { evidence: "keep" }, future: { keep: true },
    miroCanvas: { schemaVersion: 1, settings: { palette: [{ id: "board", label: "Board", color: "#123456", source: "custom" }] },
      localOverrides: { group: { customStyles: ["style"], groupCollapse: { width: 900, height: 700, children: [] } } } },
  };
  const before = JSON.stringify(saved);
  const settings = { ...DEFAULT_SETTINGS, contentTextThreshold: .5, contentFileThreshold: .6, contentLinkThreshold: .7, contentPluginThreshold: .8,
    customStyles: [{ id: "style", name: "Original", declarations: "opacity: .6" }],
    permanentPalette: [{ id: "global", label: "Global", color: "#abcdef", source: "custom" as const }] };
  const activeCanvas = { x: 17, y: 29, zoom: 2, selection: new Set(["group"]), requestFrame: vi.fn(), deselectAll: vi.fn() };
  const activeView = { canvas: activeCanvas, file: { basename: "Board", path: "Board.canvas" } };
  const exportCanvas = { getData: () => boundary.create.mock.calls[0]![1] as typeof saved };
  const exportView = { canvas: exportCanvas };
  const disposeBackground = vi.fn();
  boundary.create.mockReturnValue({ view: exportView, canvas: exportCanvas, dispose: disposeBackground });
  boundary.pack.mockResolvedValue(new Uint8Array([1, 2, 3]));
  const settingsSeen: MiroCanvasSettings[] = [];
  const disposeRenderer = vi.spyOn(M1CanvasSession.prototype, "dispose").mockImplementation(() => undefined);
  vi.spyOn(M1CanvasSession.prototype, "refresh").mockImplementation(function (this: M1CanvasSession) {
    if (Reflect.get(this, "view") === exportView) settingsSeen.push(Reflect.get(this, "settings") as MiroCanvasSettings);
  });
  boundary.render.mockImplementation(async (canvas, _pages, _quality, progress, _signal, prepare) => {
    expect(canvas).toBe(exportCanvas);
    expect(progress(0, 1)).toBe(true);
    settings.customStyles[0]!.name = "Edited during capture";
    settings.permanentPalette[0]!.color = "#000000";
    prepare();
    if (fails) throw new Error("raster failed");
    return [{ jpeg: new Uint8Array([4, 5]), width: 2000, height: 1600 }];
  });
  const save = vi.fn(async () => "Board.pdf");
  const notice = vi.fn();
  const release = vi.fn();
  // The active session is intentionally unmounted: no unrelated board UI is exercised.
  const session = Object.create(M1CanvasSession.prototype) as M1CanvasSession;
  for (const [key, value] of Object.entries({
    view: activeView, settings, root: { ownerDocument: { createElement() {} }, getAttribute: () => "dark" },
    options: { onSaveExport: save, onNotice: notice, onExportJob: () => release },
    exporting: { state: { ...DEFAULT_EXPORT_STATE, pages: [{ id: "page", x: 0, y: 0, width: 10000, height: 8000 }] }, stop: false },
    nativeCanvas: (): typeof activeCanvas => activeCanvas, savedDocument: (): typeof saved => saved, renderExport: (): void => undefined,
  })) Reflect.set(session, key, value);
  const runExport = Reflect.get(session, "runExport") as (kind: "pdf") => Promise<void>;
  await runExport.call(session, "pdf");
  expect(boundary.create).toHaveBeenCalledOnce();
  expect(boundary.create.mock.calls[0]![0]).toBe(activeView);
  const exported = exportCanvas.getData();
  expect(exported).not.toBe(saved);
  expect(exported.miroCanvas.settings).toMatchObject({ displayTheme: "dark", palette: saved.miroCanvas.settings.palette });
  expect(exported.miroCanvas.localOverrides).toEqual(saved.miroCanvas.localOverrides);
  expect(exported.miroSource).toEqual(saved.miroSource);
  expect(settingsSeen.length).toBeGreaterThanOrEqual(2);
  for (const captured of settingsSeen) {
    expect(captured).not.toBe(settings);
    expect(captured).toMatchObject({ contentTextThreshold: 0, contentFileThreshold: 0, contentLinkThreshold: 0, contentPluginThreshold: 0 });
    expect(captured.customStyles[0]!.name).toBe("Original");
    expect(captured.permanentPalette![0]!.color).toBe("#abcdef");
  }
  expect(settings.contentTextThreshold).toBe(.5);
  expect(JSON.stringify(saved)).toBe(before);
  expect(activeCanvas).toMatchObject({ x: 17, y: 29, zoom: 2 });
  expect([...activeCanvas.selection]).toEqual(["group"]);
  expect(activeCanvas.requestFrame).not.toHaveBeenCalled();
  expect(activeCanvas.deselectAll).not.toHaveBeenCalled();
  expect(disposeRenderer).toHaveBeenCalledOnce();
  expect(disposeRenderer.mock.instances[0]).not.toBe(session);
  expect(disposeBackground).toHaveBeenCalledOnce();
  expect(release).toHaveBeenCalledOnce();
  expect(Reflect.get(session, "exporting")).toMatchObject({ busy: undefined, abort: undefined });
  expect(save).toHaveBeenCalledTimes(fails ? 0 : 1);
  expect(boundary.pack).toHaveBeenCalledTimes(fails ? 0 : 1);
  if (fails) expect(notice).toHaveBeenCalledWith("raster failed");
});
