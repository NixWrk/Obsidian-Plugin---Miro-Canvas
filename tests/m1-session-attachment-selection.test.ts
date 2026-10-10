import { describe, expect, it } from "vitest";
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
