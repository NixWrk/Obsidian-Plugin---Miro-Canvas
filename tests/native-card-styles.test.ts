import { describe, expect, it, vi } from "vitest";
import { projectNativeCardStyles } from "../src/native-card-styles";

function element(values: Record<string, string> = {}, priorities: Record<string, string> = {}) {
  return {
    style: {
      getPropertyValue: (key: string) => values[key] ?? "",
      getPropertyPriority: (key: string) => priorities[key] ?? "",
      setProperty: (key: string, value: string) => { values[key] = value; priorities[key] = ""; },
    },
    values, priorities,
  };
}

function fixture(accept: (selector: string) => boolean, target = element()) {
  const root = { matches: () => false, querySelectorAll: (selector: string) => accept(selector) ? [target] : [] };
  const write = vi.fn((item: HTMLElement, key: string, value: string) => item.style.setProperty(key, value));
  return { root: root as unknown as HTMLElement, target, write };
}

describe("native inline styles participating in scoped card CSS", () => {
  it.each(["drawing", "sticky", "table", "code", "mindmap-node"])("clears only competing native paint for %s", kind => {
    const f = fixture(selector => selector.startsWith(`.miro-source-${kind},`), element({ "background-color": "red", "border-color": "blue", "background-image": "url(example)", "border-width": "3px" }, { "border-color": "important" }));
    projectNativeCardStyles(f.root,f.write);
    expect(f.target.values).toEqual({ "background-color": "", "border-color": "", "background-image": "url(example)", "border-width": "3px" });
    expect(f.target.priorities["border-color"]).toBe("");
    f.write.mockClear();
    projectNativeCardStyles(f.root,f.write);
    // Empty declarations still register ownership of later native writes.
    expect(f.write.mock.calls.map(([, key, value]) => [key, value])).toEqual([
      ["background-color", ""], ["border-color", ""],
    ]);
  });

  it("retains unselected group border width/style behind live selection variables", () => {
    const f = fixture(selector => selector === ".miro-source-group > .canvas-node-container", element({ "border-width":"3px", "border-style":"solid", "border-color":"red" }));
    projectNativeCardStyles(f.root,f.write);
    expect(f.target.values["border-width"]).toBe("var(--miro-source-group-border-width, 3px)");
    expect(f.target.values["border-style"]).toBe("var(--miro-source-group-border-style, solid)");
    expect(f.target.values["border-color"]).toBe("var(--miro-source-group-border-color, transparent)");
  });

  it("projects the table sizer without changing its text or unrelated native styles", () => {
    const f = fixture(selector => selector.startsWith(".miro-source-table .markdown-preview-view >"), element({ height:"180px", padding:"12px", "min-height":"100%", color:"red" }));
    projectNativeCardStyles(f.root,f.write);
    expect(f.target.values).toEqual({ height:"100%", padding:"12px", "min-height":"0", color:"red", "padding-top":"0", "padding-right":"0", "padding-bottom":"0", "padding-left":"0" });
  });

  it("projects source/code sizers and fitted rich text with normal priorities", () => {
    const f = fixture(selector => selector.includes("[data-miro-source-valign]") || selector.includes('[data-miro-source-fit="true"]'), element({ "font-size":"40px", "line-height":"2" }, { "font-size":"important" }));
    projectNativeCardStyles(f.root,f.write);
    expect(f.target.values).toMatchObject({ flex:"0 0 auto", "min-height":"0", "padding-bottom":"0", "font-size":"inherit", "line-height":"inherit" });
    expect(f.target.priorities["font-size"]).toBe("");
  });

  it("does no projection in a minimal non-DOM host", () => {
    const write = vi.fn();
    projectNativeCardStyles({} as HTMLElement, write);
    expect(write).not.toHaveBeenCalled();
  });

  it("uses the native owner's findAll helper with its original receiver", () => {
    const target = element({ "background-color":"red" });
    const root = {
      matches: () => false,
      findAll(this: unknown, selector: string) { expect(this).toBe(root); return selector.startsWith(".miro-source-code,") ? [target] : []; },
      querySelectorAll: vi.fn(() => { throw Error("native helper bypassed"); }),
    };
    projectNativeCardStyles(root as unknown as HTMLElement, (item,key,value) => item.style.setProperty(key,value));
    expect(target.values["background-color"]).toBe("");
    expect(root.querySelectorAll).not.toHaveBeenCalled();
  });
});
