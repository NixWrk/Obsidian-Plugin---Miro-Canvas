import { describe, expect, it, vi } from "vitest";
import { ContentBreakpoints, contentThresholdBand, type ContentBreakpointSnapshot, type ContentTarget } from "../src/content-breakpoints";

class ContentElement {
  readonly attributes = new Map<string, string>();
  readonly styles = new Map<string, { value: string; priority: string }>();
  readonly classes = new Set<string>();
  readonly listeners = new Map<string, (event: Event) => void>();
  readonly children: ContentElement[] = [];
  readonly ownerDocument = { activeElement: null as ContentElement | null };
  readonly classList = { contains: (name: string) => this.classes.has(name), add: (name: string) => this.classes.add(name), remove: (name: string) => this.classes.delete(name) };
  readonly style = {
    getPropertyValue: (name: string) => this.styles.get(name)?.value ?? "",
    getPropertyPriority: (name: string) => this.styles.get(name)?.priority ?? "",
    setProperty: (name: string, value: string, priority = "") => this.styles.set(name, { value, priority }),
    removeProperty: (name: string) => this.styles.delete(name),
  };
  contains(element: ContentElement): boolean { return this === element || this.children.some(child => child.contains(element)); }
  getAttribute(name: string): string | null { return this.attributes.get(name) ?? null; }
  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
  removeAttribute(name: string): void { this.attributes.delete(name); }
  hasAttribute(name: string): boolean { return this.attributes.has(name); }
  addEventListener(name: string, listener: (event: Event) => void): void { this.listeners.set(name, listener); }
  removeEventListener(name: string): void { this.listeners.delete(name); }
}

function fixture(kind: ContentTarget["kind"] = "text") {
  const root = new ContentElement();
  const shell = new ContentElement();
  const content = new ContentElement();
  root.children.push(shell);
  shell.children.push(content);
  const target: ContentTarget = { id: "a", kind, shell: shell as unknown as HTMLElement, content: content as unknown as HTMLElement, nativeHiddenClasses: ["native-content-hidden"] };
  const targets = vi.fn(() => [target]);
  const snapshot: ContentBreakpointSnapshot = { zoom: 0.25, thresholds: { text: 0.5, file: 0.3, link: 0.4, plugin: 0.2 }, boardIdentity: {}, targetsIdentity: {}, interactionIdentity: {}, targets };
  const controller = new ContentBreakpoints(root as unknown as HTMLElement);
  return { root, shell, content, target, targets, snapshot, controller };
}

describe("content thresholds", () => {
  it("uses inclusive linear boundaries and independent card kinds", () => {
    const thresholds = { text: 0.5, file: 0.3, link: 0.4, plugin: 0.2 };
    expect(contentThresholdBand(0.25, thresholds)).toBe("0001");
    expect(contentThresholdBand(0.5, thresholds)).toBe("1111");
    for (const zoom of [0, -1, NaN, Infinity]) expect(() => contentThresholdBand(zoom, thresholds)).toThrow();
    expect(() => contentThresholdBand(1, { ...thresholds, plugin: -1 })).toThrow();
  });
  it.each(["text", "file", "link", "plugin"] as const)("hides %s content without hiding its shell", kind => {
    const { controller, snapshot, content, shell } = fixture(kind);
    controller.update({ ...snapshot, zoom: 0.1 });
    expect(content.style.getPropertyValue("visibility")).toBe("hidden");
    expect(shell.style.getPropertyValue("visibility")).toBe("");
    controller.dispose();
    expect(content.style.getPropertyValue("visibility")).toBe("");
  });
  it("does not enumerate cards on frames within a band; identity changes do", () => {
    const { controller, snapshot, targets } = fixture();
    controller.update(snapshot);
    for (let index = 0; index < 100; index++) expect(controller.update({ ...snapshot, zoom: 0.25 + index / 1000 })).toBe(index === 50);
    // This loop crosses the file threshold once; all other frames are constant-cost.
    expect(targets).toHaveBeenCalledTimes(2);
    controller.update({ ...snapshot, zoom: 0.349, targetsIdentity: {} });
    expect(targets).toHaveBeenCalledTimes(3);
  });
  it.each(["selected", "editing"] as const)("reveals %s content and restores native state and priority", key => {
    const { controller, snapshot, content, shell, target } = fixture();
    content.setAttribute("hidden", "until-found");
    content.style.setProperty("visibility", "collapse", "important");
    shell.classes.add("native-content-hidden");
    controller.update({ ...snapshot, targets: () => [{ ...target, [key]: true }] });
    expect(content.hasAttribute("hidden")).toBe(false);
    expect(shell.classes.has("native-content-hidden")).toBe(false);
    expect(content.style.getPropertyValue("visibility")).toBe("visible");
    controller.dispose();
    expect(content.getAttribute("hidden")).toBe("until-found");
    expect(shell.classes.has("native-content-hidden")).toBe(true);
    expect(content.styles.get("visibility")).toEqual({ value: "collapse", priority: "important" });
  });
  it("overrides native hiding above the configured threshold and restores when disabled", () => {
    const { controller, snapshot, shell, content } = fixture();
    shell.classes.add("native-content-hidden");
    content.setAttribute("hidden", "");
    controller.update({ ...snapshot, zoom: 0.8 });
    expect(shell.classes.size).toBe(0);
    expect(content.hasAttribute("hidden")).toBe(false);
    controller.update({ ...snapshot, zoom: 0.8, thresholds: { text: 0, file: 0, link: 0, plugin: 0 } });
    expect(shell.classes.has("native-content-hidden")).toBe(true);
    expect(content.hasAttribute("hidden")).toBe(true);
  });
  it("reveals focused content and hides it on focusout before activeElement changes", () => {
    const { controller, root, content, snapshot } = fixture();
    controller.update(snapshot);
    root.ownerDocument.activeElement = content;
    root.listeners.get("focusin")!({ type: "focusin" } as Event);
    expect(content.style.getPropertyValue("visibility")).toBe("visible");
    root.listeners.get("focusout")!({ type: "focusout", relatedTarget: null } as unknown as Event);
    expect(content.style.getPropertyValue("visibility")).toBe("hidden");
    controller.dispose();
    expect(root.listeners.size).toBe(0);
  });
  it("releases detached elements, refuses foreign targets and is inert after disposal", () => {
    const { controller, snapshot, root, shell, content } = fixture();
    controller.update(snapshot);
    root.children.length = 0;
    controller.update({ ...snapshot, targetsIdentity: {} });
    expect(content.style.getPropertyValue("visibility")).toBe("");
    root.children.push(shell);
    controller.update({ ...snapshot, targetsIdentity: {} });
    content.style.setProperty("visibility", "collapse");
    controller.dispose();
    expect(content.style.getPropertyValue("visibility")).toBe("collapse");
    expect(controller.update(snapshot)).toBe(false);
  });
});
