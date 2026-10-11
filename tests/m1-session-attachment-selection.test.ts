import { describe, expect, it, vi } from "vitest";
import { M1CanvasSession } from "../src/m1-session";

class NativeFile {
  readonly id = "file";
  readonly type = "file";
  readonly file = "image.png";
}

function selection(metadata: unknown, ids: string[] = ["file"], nodes: unknown[] = [new NativeFile()]): boolean | undefined {
  const session = Object.create(M1CanvasSession.prototype) as {
    selectedAttachmentVisibility(): boolean | undefined;
  };
  Object.assign(session, { selectedIds: ids, currentMetadata: metadata, scene: { nodes, edges: [] } });
  return session.selectedAttachmentVisibility();
}

describe("selected attachment checkbox with native runtime nodes", () => {
  it("hides a label that arrives after the card without overriding an explicit visible name", () => {
    const label = { nodeType: 1, appendChild() {}, removeChild() {} };
    const dom = { querySelectorAll: vi.fn((): unknown[] => []) };
    const hide = vi.fn();
    const metadata = { settings: { showAttachmentNames: true }, localOverrides: { file: { showAttachmentName: false } } };
    const session = Object.create(M1CanvasSession.prototype) as { refreshHiddenAttachmentLabels(node: unknown, dom: unknown): void };
    Object.assign(session, { currentMetadata: metadata, hideNativeAttachmentLabel: hide });
    session.refreshHiddenAttachmentLabels(new NativeFile(), dom);
    expect(hide).not.toHaveBeenCalled();
    dom.querySelectorAll.mockReturnValue([label]);
    session.refreshHiddenAttachmentLabels(new NativeFile(), dom);
    expect(hide).toHaveBeenCalledWith(label);
    hide.mockClear();
    metadata.localOverrides.file.showAttachmentName = true;
    session.refreshHiddenAttachmentLabels(new NativeFile(), dom);
    expect(hide).not.toHaveBeenCalled();
    expect(metadata.settings.showAttachmentNames).toBe(true);
  });

  it("finds the native shell when a scene snapshot exposes only its inner container", () => {
    const document = {};
    const label = { nodeType: 1, appendChild() {}, removeChild() {} };
    const container: Record<string, unknown> = { ownerDocument: document, querySelectorAll: vi.fn(() => []) };
    const shell = { ownerDocument: document, nodeType: 1, appendChild() {}, removeChild() {}, contains: (element: unknown) => element === container,
      querySelectorAll: vi.fn(() => [label]) };
    container.closest = vi.fn((selector: string) => selector === ".canvas-node" ? shell : null);
    const session = Object.create(M1CanvasSession.prototype) as { attachmentLabelTargets(element: unknown, shell?: unknown): unknown[] };
    expect(session.attachmentLabelTargets(container)).toEqual([label]);
    expect(container.closest).toHaveBeenCalledWith(".canvas-node");
    expect(container.querySelectorAll).not.toHaveBeenCalled();
  });

  it("finds a sibling image label under the verified native node shell", () => {
    const document = {};
    const label = { nodeType: 1, appendChild() {}, removeChild() {} };
    const container = { ownerDocument: document, querySelectorAll: vi.fn(() => []) };
    const shell = { ownerDocument: document, nodeType: 1, appendChild() {}, removeChild() {}, contains: (element: unknown) => element === container,
      querySelectorAll: vi.fn(() => [label]) };
    const session = Object.create(M1CanvasSession.prototype) as { attachmentLabelTargets(element: unknown, shell?: unknown): unknown[] };
    expect(session.attachmentLabelTargets(container, shell)).toEqual([label]);
    expect(shell.querySelectorAll).toHaveBeenCalledWith(".canvas-node-label, .file-embed-title, .internal-embed-title");
    expect(container.querySelectorAll).not.toHaveBeenCalled();
  });

  it("refuses outside or other-window label roots", () => {
    const document = {};
    const container = { ownerDocument: document, querySelectorAll: vi.fn(() => []) };
    const shell = { ownerDocument: document, nodeType: 1, appendChild() {}, removeChild() {}, contains: () => false, querySelectorAll: vi.fn(() => [{ nodeType: 1 }]) };
    const session = Object.create(M1CanvasSession.prototype) as { attachmentLabelTargets(element: unknown, shell?: unknown): unknown[] };
    expect(session.attachmentLabelTargets(container, shell)).toEqual([]);
    expect(session.attachmentLabelTargets(container, { ...shell, contains: () => true, ownerDocument: {} })).toEqual([]);
    expect(shell.querySelectorAll).not.toHaveBeenCalled();
    expect(container.querySelectorAll).toHaveBeenCalledTimes(2);
  });

  it("reflects an enabled local name while global names are hidden", () => {
    expect(selection({ settings: { showAttachmentNames: false }, localOverrides: { file: { showAttachmentName: true } } })).toBe(true);
  });

  it("reflects disabling the same local name and respects a global fallback", () => {
    expect(selection({ settings: { showAttachmentNames: true }, localOverrides: { file: { showAttachmentName: false } } })).toBe(false);
    expect(selection({ settings: { showAttachmentNames: true } })).toBe(true);
  });

  it("has no state without a selected runtime node", () => {
    expect(selection({}, [])).toBeUndefined();
    expect(selection({}, ["missing"])).toBeUndefined();
  });

  it("does not treat a native text card as an attachment", () => {
    class NativeText { readonly id = "file"; readonly type = "text"; }
    expect(selection({ settings: { showAttachmentNames: true } }, ["file"], [new NativeText()])).toBe(false);
  });
});
