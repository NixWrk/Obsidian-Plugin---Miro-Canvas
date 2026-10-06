import { describe, expect, it, vi } from "vitest";
import { NativeStyleProperties } from "../src/native-style-properties";

function target(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const priorities = new Map<string, string>();
  const style = {
    getPropertyValue: (key: string) => values.get(key) ?? "",
    getPropertyPriority: (key: string) => priorities.get(key) ?? "",
    setProperty: vi.fn((key: string, value: string, priority = "") => {
      values.set(key, value === "0" ? "0px" : value);
      priorities.set(key, priority);
    }),
    removeProperty: vi.fn((key: string) => { values.delete(key); priorities.delete(key); }),
  };
  return { element: { style } as unknown as HTMLElement, style };
}

describe("fixed native style ownership", () => {
  it("restores and forgets replaced targets across 100 content replacements", () => {
    const owner = new NativeStyleProperties();
    let previous = target({ "padding-bottom": "18px" });
    owner.write(previous.element, "padding-bottom", "0");
    for (let index = 0; index < 100; index += 1) {
      const current = target({ "padding-bottom": "12px" });
      expect(owner.retain(element => element === current.element)).toBe(1);
      expect(previous.style.getPropertyValue("padding-bottom")).toBe(index === 0 ? "18px" : "12px");
      owner.write(current.element, "padding-bottom", "0");
      expect([...owner.elements]).toEqual([current.element]);
      previous = current;
    }
  });
  it("reconciles late layout and restores the latest native value and priority", () => {
    const f = target({ "padding-bottom": "12px" });
    const owner = new NativeStyleProperties();
    owner.write(f.element, "padding-bottom", "0");
    f.style.setProperty("padding-bottom", "18px", "important");
    owner.refresh(f.element);
    expect(f.style.getPropertyValue("padding-bottom")).toBe("0px");
    expect(f.style.getPropertyPriority("padding-bottom")).toBe("");
    owner.restore();
    expect(f.style.getPropertyValue("padding-bottom")).toBe("18px");
    expect(f.style.getPropertyPriority("padding-bottom")).toBe("important");
    expect([...owner.elements]).toEqual([]);
  });

  it("registers an empty paint property before the native writer first sets it", () => {
    const f = target();
    const owner = new NativeStyleProperties();
    owner.write(f.element, "background-color", "");
    expect(f.style.removeProperty).not.toHaveBeenCalled();
    f.style.setProperty("background-color", "red");
    owner.refresh(f.element);
    expect(f.style.getPropertyValue("background-color")).toBe("");
    owner.restore();
    expect(f.style.getPropertyValue("background-color")).toBe("red");
  });

  it("does not overwrite an unreconciled external declaration on teardown", () => {
    const f = target({ flex: "1 0 auto" });
    const owner = new NativeStyleProperties();
    owner.write(f.element, "flex", "0 0 auto");
    f.style.setProperty("flex", "0 0 auto", "important");
    owner.restore();
    expect(f.style.getPropertyPriority("flex")).toBe("important");
  });

  it("performs no repeated writes for normalized CSS or observer echoes", () => {
    const f = target();
    const owner = new NativeStyleProperties();
    owner.write(f.element, "min-height", "0");
    f.style.setProperty.mockClear();
    for (let index = 0; index < 1000; index += 1) {
      owner.write(f.element, "min-height", "0");
      owner.refresh(f.element);
    }
    expect(f.style.setProperty).not.toHaveBeenCalled();
    expect([...owner.elements]).toEqual([f.element]);
  });

  it("updates a group variable fallback when native border styling changes", () => {
    const f = target({ "border-width": "3px" });
    const owner = new NativeStyleProperties();
    owner.write(f.element, "border-width", "", "--miro-source-group-border-width");
    expect(f.style.getPropertyValue("border-width")).toBe("var(--miro-source-group-border-width, 3px)");
    f.style.setProperty("border-width", "5px");
    owner.refresh(f.element);
    expect(f.style.getPropertyValue("border-width")).toBe("var(--miro-source-group-border-width, 5px)");
    owner.restore();
    expect(f.style.getPropertyValue("border-width")).toBe("5px");
  });
});
