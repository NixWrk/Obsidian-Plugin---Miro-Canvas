import { describe, expect, it, vi } from "vitest";
import { CustomBoardStyles, customStyleChannel, parseLocalCss, type CustomStyleSnapshot } from "../src/custom-board-styles";

class StyleElement {
  readonly children: StyleElement[] = [];
  parent: StyleElement | undefined;
  readonly values = new Map<string, { value: string; priority: string }>();
  readonly classes = new Set<string>();
  readonly classList = { contains: (name: string) => this.classes.has(name) };
  get namespaceURI(): string { return this.kind === "node" ? "http://www.w3.org/1999/xhtml" : "http://www.w3.org/2000/svg"; }
  get localName(): string { return this.kind === "node" ? "div" : ["path", "casing", "hit", "marker"].includes(this.kind) ? "path" : this.kind; }
  readonly style: CSSStyleDeclaration;
  readonly observers = new Set<StyleObserver>();
  constructor(readonly kind = "node") {
    const owner = this;
    this.style = {
      get length() { return owner.values.size; },
      item: (index: number) => [...this.values.keys()][index],
      getPropertyValue: (name: string) => this.values.get(name)?.value ?? "",
      getPropertyPriority: (name: string) => this.values.get(name)?.priority ?? "",
      setProperty: (name: string, value: string, priority = "") => {
        const oldValue = this.getAttribute("style");
        this.values.set(name, { value, priority });
        this.styleChanged(oldValue);
      },
      removeProperty: (name: string) => {
        const oldValue = this.getAttribute("style");
        this.values.delete(name);
        this.styleChanged(oldValue);
      },
    } as unknown as CSSStyleDeclaration;
    Object.defineProperty(this.style, "cssText", { get: () => this.getAttribute("style") ?? "", set: () => {
      const oldValue = this.getAttribute("style");
      this.values.clear();
      this.styleChanged(oldValue);
    } });
  }
  append(child: StyleElement): void { this.children.push(child); child.parent = this; }
  contains(element: StyleElement): boolean { return this === element || this.children.some(child => child.contains(element)); }
  closest(_selector: string): StyleElement | null {
    return ["hit", "defs", "marker"].includes(this.kind) ? this : this.parent?.closest(_selector) ?? null;
  }
  html(): HTMLElement { return this as unknown as HTMLElement; }
  svg(): SVGElement { return this as unknown as SVGElement; }
  getAttribute(name: string): string | null { return name === "style" && this.values.size > 0 ? JSON.stringify([...this.values]) : null; }
  private styleChanged(oldValue: string | null): void {
    for (const observer of this.observers) observer.records.push({ target: this, attributeName: "style", oldValue } as unknown as MutationRecord);
  }
}
class StyleObserver {
  static instances: StyleObserver[] = [];
  readonly targets = new Set<StyleElement>();
  readonly records: MutationRecord[] = [];
  readonly observed: { target: StyleElement; options: MutationObserverInit }[] = [];
  constructor(readonly callback: (records: MutationRecord[]) => void) { StyleObserver.instances.push(this); }
  observe(target: StyleElement, options: MutationObserverInit): void {
    this.targets.add(target);
    target.observers.add(this);
    this.observed.push({ target, options });
  }
  takeRecords(): MutationRecord[] { return this.records.splice(0); }
  disconnect(): void {
    for (const target of this.targets) target.observers.delete(this);
    this.targets.clear();
    this.records.length = 0;
  }
  deliver(): void { this.callback(this.takeRecords()); }
}
const supports = (property: string, value: string) => property !== "unknown-property" && value !== "invalid-value";
function fixture() {
  const root = new StyleElement();
  const shell = new StyleElement();
  const path = new StyleElement("path");
  const casing = new StyleElement("casing");
  const hit = new StyleElement("hit");
  root.append(shell);
  shell.append(path);
  shell.append(casing);
  shell.append(hit);
  const snapshot: CustomStyleSnapshot = {
    definitions: [{ id: "style", name: "Warning", declarations: "stroke: #abc; stroke-width: 4; font-family: serif; border: 2px solid red" }],
    assignments: { line: ["style"] },
    targets: [{ id: "line", shell: shell.svg(), elements: [path.svg(), hit.svg(), casing.svg()], casing: { element: casing.svg(), widthPadding: 6 } }],
  };
  return { root, shell, path, casing, hit, snapshot, controller: new CustomBoardStyles(root.html(), supports) };
}
function observedFixture() {
  const fixtureValue = fixture();
  fixtureValue.controller.dispose();
  Object.assign(fixtureValue.root, { ownerDocument: {
    defaultView: { MutationObserver: StyleObserver },
    createElement: () => new StyleElement().html(),
  } });
  const controller = new CustomBoardStyles(fixtureValue.root.html(), supports);
  const observer = StyleObserver.instances[StyleObserver.instances.length - 1];
  return { ...fixtureValue, controller, observer };
}

describe("local CSS declarations", () => {
  it("keeps declaration order, repeated properties, functions and quoted separators", () => {
    expect(parseLocalCss('font-family: "A;B", serif; color: var(--text-normal); color: rgb(1 2 3 / 50%); font-size: var(--font-ui-small);', supports)).toEqual({
      valid: true,
      declarations: [
        { property: "font-family", value: '"A;B", serif' }, { property: "color", value: "var(--text-normal)" },
        { property: "color", value: "rgb(1 2 3 / 50%)" }, { property: "font-size", value: "var(--font-ui-small)" },
      ],
    });
  });
  it.each([
    "body { color:red }", "color:red; } body { color:blue", "@import 'x';", "color:red !important",
    "background:url(https://example.com)", "background:URL (#a)", "background:u\\72l(x)",
    "background:u/**/rl(x)", 'background:image-set("x" 1x)', "cursor:var(--remote)", "fill:var(--remote)",
    "content:attr(data-remote)", "--image:url(x)", "color:expression(x)", "behavior:x", "-moz-binding:x",
    "-webkit-box-reflect: below var(--remote)", "-webkit-border-image: var(--remote)", "list-style-type:var(--remote)",
    "color: red;; font-size: 10px", "color:", "font-family:'unclosed", "width:calc(1px", "width:1px)",
    "unknown-property:red", "color:invalid-value",
  ])("rejects the entire unsafe/invalid block: %s", declaration => {
    const parsed = parseLocalCss(`font-size: 12px; ${declaration}`, supports);
    expect(parsed.valid).toBe(false);
    expect("declarations" in parsed).toBe(false);
    if (!parsed.valid) expect(parsed.errors.length).toBeGreaterThan(0);
  });
  it("reports every invalid declaration rather than silently dropping it", () => {
    const parsed = parseLocalCss("color: red; unknown-property:red; color:invalid-value", supports);
    expect(parsed).toMatchObject({ valid: false, errors: [{ index: 1, reason: "unsupported" }, { index: 2, reason: "unsupported" }] });
  });
  it("accepts declaration whitespace but rejects embedded control characters", () => {
    expect(parseLocalCss("color:\tred;\nfont-size: 12px", supports).valid).toBe(true);
    expect(parseLocalCss("color:r\u0000ed", supports).valid).toBe(false);
  });
  it.each([
    ["transform", "none"], ["rotate", "45deg"], ["translate", "1px 2px"], ["scale", "2"], ["width", "100px"], ["height", "auto"],
    ["position", "absolute"], ["display", "none"], ["z-index", "5"], ["transform-origin", "top left"], ["transform-box", "fill-box"],
    ["-webkit-transform", "translateX(20px)"], ["-moz-transform", "none"], ["-ms-transform", "none"], ["-o-transform", "none"],
    ["min-width", "100px"], ["max-block-size", "200px"], ["inline-size", "100px"], ["aspect-ratio", "2"], ["inset-inline-start", "1px"],
    ["top", "10px"], ["margin", "20px"], ["padding-block", "20px"], ["box-sizing", "content-box"], ["flex", "1"], ["grid-template", "none"],
    ["align-self", "stretch"], ["order", "2"], ["-webkit-box-flex", "1"], ["overflow", "visible"], ["contain", "size"],
    ["content-visibility", "hidden"], ["visibility", "hidden"], ["zoom", "2"], ["offset-path", 'path("M0 0 L10 10")'],
    ["offset-distance", "50%"], ["animation", "host-move 1s"], ["transition-property", "transform"], ["will-change", "transform"],
    ["all", "unset"], ["d", 'path("M0 0 L1 1")'], ["x", "100px"], ["cy", "20px"], ["r", "10px"], ["vector-effect", "non-scaling-stroke"],
    ["clip-path", "circle(50%)"], ["mask-image", "linear-gradient(black, transparent)"], ["--canvas-node-width", "100px"], ["--local", "2px"],
  ])("rejects geometry owned %s before browser validation", (property, value) => {
    const support = vi.fn(() => true);
    const result = parseLocalCss(`color: red; ${property}: ${value}`, support);
    expect(result).toMatchObject({ valid: false, errors: [{ index: 1, property, restriction: "geometry", reason: "unsafe" }] });
    expect(support).toHaveBeenCalledTimes(1);
    expect("declarations" in result).toBe(false);
  });
  it.each(["pointer-events", "touch-action", "user-select", "-webkit-user-select", "cursor", "resize", "appearance", "scroll-snap-type", "overscroll-behavior"])("rejects gesture owned %s", property => {
    expect(parseLocalCss(`${property}: none`, () => true)).toMatchObject({ valid: false, errors: [{ property, restriction: "gesture", reason: "unsafe" }] });
  });
  it("normalizes property casing in diagnostics without adding a new reason enum", () => {
    expect(parseLocalCss("TrAnSfOrM: none", () => true)).toEqual({ valid: false, errors: [{
      index: 0, declaration: "TrAnSfOrM: none", property: "transform", restriction: "geometry", reason: "unsafe",
    }] });
  });
  it("allows local visual typography, logical borders, opacity and safe SVG theme paint", () => {
    const css = "font: italic 18px serif; line-height: 1.2; letter-spacing: 1px; color: var(--text-normal); border: 2px solid red; border-inline-width: 3px; border-radius: 4px; background: var(--background-primary); background-color: var(--background-secondary); opacity: .5; stroke: var(--interactive-accent); fill: var(--canvas-background); stroke-width: 4px; stroke-opacity: .8; fill-opacity: .9";
    expect(parseLocalCss(css, supports).valid).toBe(true);
    expect(parseLocalCss("stroke: var(--text-normal, var(--remote))", supports).valid).toBe(false);
    expect(parseLocalCss("stroke: attr(data-paint)", supports).valid).toBe(false);
  });
});

describe("scoped board styles", () => {
  it("styles visible lines, widens casing and preserves casing accent and hit paths", () => {
    const { controller, snapshot, path, casing, hit } = fixture();
    path.style.setProperty("stroke", "native", "important");
    casing.style.setProperty("stroke", "var(--interactive-accent)");
    casing.style.setProperty("stroke-width", "8");
    hit.style.setProperty("stroke-width", "24");
    controller.update(snapshot);
    expect(path.style.getPropertyValue("stroke")).toBe("#abc");
    expect(casing.style.getPropertyValue("stroke")).toBe("var(--interactive-accent)");
    expect(casing.style.getPropertyValue("stroke-width")).toBe("10");
    expect(hit.style.getPropertyValue("stroke-width")).toBe("24");
    controller.dispose();
    expect(path.values.get("stroke")).toEqual({ value: "native", priority: "important" });
    expect(casing.style.getPropertyValue("stroke-width")).toBe("8");
    expect(path.style.getPropertyValue("font-family")).toBe("");
  });
  it("applies typography and border declarations to native and plugin card faces", () => {
    const { root, controller, snapshot } = fixture();
    const native = new StyleElement();
    const plugin = new StyleElement();
    root.append(native);
    root.append(plugin);
    controller.update({ ...snapshot, assignments: { native: ["style"], plugin: ["style"] }, targets: [
      { id: "native", shell: native.html(), elements: [native.html()] },
      { id: "plugin", shell: plugin.html(), elements: [plugin.html()] },
    ] });
    expect(native.style.getPropertyValue("border")).toBe("2px solid red");
    expect(plugin.style.getPropertyValue("font-family")).toBe("serif");
  });
  it("isolates two boards and refuses foreign descendants and marker/hit elements", () => {
    const first = fixture();
    const second = fixture();
    first.controller.update({ ...first.snapshot, targets: [...first.snapshot.targets, ...second.snapshot.targets] });
    expect(first.path.style.getPropertyValue("stroke")).toBe("#abc");
    expect(second.path.values.size).toBe(0);
    const marker = new StyleElement("marker");
    first.shell.append(marker);
    first.controller.update({ ...first.snapshot, targets: [{ ...first.snapshot.targets[0], elements: [marker.svg()] }] });
    expect(marker.values.size).toBe(0);
  });
  it("restores detached/replaced paths and applies to replacement selected groups", () => {
    const { controller, root, shell, path, snapshot } = fixture();
    path.style.setProperty("stroke-width", "2");
    controller.update(snapshot);
    root.children.length = 0;
    controller.update(snapshot);
    expect(path.style.getPropertyValue("stroke-width")).toBe("2");
    root.append(shell);
    const replacement = new StyleElement("path");
    shell.append(replacement);
    controller.update({ ...snapshot, targets: [{ ...snapshot.targets[0], elements: [replacement.svg()] }] });
    expect(replacement.style.getPropertyValue("stroke-width")).toBe("4");
    controller.dispose();
    expect(replacement.values.size).toBe(0);
  });
  it("does not erase newer host changes and removes assignments reversibly", () => {
    const { controller, path, snapshot } = fixture();
    controller.update(snapshot);
    path.style.setProperty("stroke", "new-native");
    controller.update({ ...snapshot, assignments: {} });
    expect(path.style.getPropertyValue("stroke")).toBe("new-native");
    expect(path.style.getPropertyValue("border")).toBe("");
  });
  it("does not apply a partial invalid style or ambiguous duplicate ids", () => {
    const { controller, snapshot, path } = fixture();
    const definitions = [{ id: "style", name: "Bad", declarations: "color: red; background: url(x)" }];
    expect(controller.update({ ...snapshot, definitions })).toHaveLength(1);
    expect(path.values.size).toBe(0);
    expect(controller.update({ ...snapshot, definitions: [...snapshot.definitions, ...snapshot.definitions] })).toHaveLength(1);
    expect(path.values.size).toBe(0);
    controller.dispose();
    expect(controller.update(snapshot)).toEqual([]);
  });
  it("resolves computed line widths once when widening selected casing", () => {
    const { controller, snapshot, path, casing } = fixture();
    Object.assign(path, { ownerDocument: { defaultView: { getComputedStyle: () => ({ getPropertyValue: () => "12px" }) } } });
    controller.update({ ...snapshot, definitions: [{ id: "style", name: "Large", declarations: "stroke-width: 1em" }] });
    expect(path.style.getPropertyValue("stroke-width")).toBe("1em");
    expect(casing.style.getPropertyValue("stroke-width")).toBe("18");
    controller.dispose();
    expect(casing.style.getPropertyValue("stroke-width")).toBe("");
  });
  it("routes borders to one face, typography to content, opacity once and SVG paint to visible paths", () => {
    const { controller, root, shell, path, casing, hit } = fixture();
    shell.classes.add("canvas-node");
    const face = new StyleElement();
    const content = new StyleElement();
    const inner = new StyleElement();
    shell.append(face);
    face.append(content);
    content.append(inner);
    casing.style.setProperty("stroke", "accent");
    hit.style.setProperty("stroke-width", "24");
    const outside = new StyleElement();
    const svgGroup = new StyleElement("g");
    root.append(outside);
    shell.append(svgGroup);
    controller.update({ definitions: [{ id: "visual", name: "Visual", declarations: "border: 2px solid red; background-color: #abc; color: blue; font-size: 20px; opacity: .5; stroke: red; fill: blue; stroke-width: 4; stroke-opacity: .7" }],
      assignments: { item: ["visual"] }, targets: [{ id: "item", shell: shell.html(),
        // Include nested/foreign/hit/casing targets to prove the controller filters them.
        channels: { face: [face.html(), content.html(), outside.html()], content: [content.html(), inner.html()], paint: [path.svg(), hit.svg(), casing.svg(), svgGroup.svg()], opacity: shell.html() },
        elements: [outside.html()], casing: { element: casing.svg(), widthPadding: 6 } }] });
    expect(face.style.getPropertyValue("border")).toBe("2px solid red");
    expect(content.style.getPropertyValue("border")).toBe("");
    expect(shell.style.getPropertyValue("border")).toBe("");
    expect(content.style.getPropertyValue("font-size")).toBe("20px");
    expect(content.style.getPropertyValue("color")).toBe("blue");
    expect(face.style.getPropertyValue("font-size")).toBe("");
    expect(shell.style.getPropertyValue("opacity")).toBe(".5");
    for (const element of [face, content, inner, path, casing, hit]) expect(element.style.getPropertyValue("opacity")).toBe("");
    expect(path.style.getPropertyValue("stroke")).toBe("red");
    expect(path.style.getPropertyValue("fill")).toBe("blue");
    expect(path.style.getPropertyValue("stroke-opacity")).toBe(".7");
    expect(casing.style.getPropertyValue("stroke-width")).toBe("10");
    expect(casing.style.getPropertyValue("stroke")).toBe("accent");
    expect(hit.style.getPropertyValue("stroke-width")).toBe("24");
    expect(inner.values.size).toBe(0);
    expect(outside.values.size).toBe(0);
    expect(svgGroup.values.size).toBe(0);
  });
  it("exports the property channel contract and protects a native outer shell from face paint", () => {
    expect(["opacity", "border-width", "background-color", "font-size", "color", "text-shadow", "-webkit-text-fill-color", "stroke-width", "fill"].map(customStyleChannel))
      .toEqual(["opacity", "face", "face", "content", "content", "content", "content", "paint", "paint"]);
    const { controller, snapshot, shell } = fixture();
    shell.classes.add("canvas-node");
    controller.update({ ...snapshot, targets: [{ id: "line", shell: shell.html(), channels: { face: [shell.html()], content: [shell.html()] } }] });
    expect(shell.values.size).toBe(0);
  });
  it("retains parent's restoreBeforeRender and captures the renderer's new baseline on reapply", () => {
    const { controller, snapshot, path } = fixture();
    path.style.setProperty("stroke-width", "2");
    controller.update(snapshot);
    expect(path.style.getPropertyValue("stroke-width")).toBe("4");
    controller.restoreBeforeRender();
    expect(path.style.getPropertyValue("stroke-width")).toBe("2");
    path.style.setProperty("stroke-width", "3");
    controller.update(snapshot);
    controller.dispose();
    expect(path.style.getPropertyValue("stroke-width")).toBe("3");
  });
  it("refuses a mixed visual/geometry style without patching any channel", () => {
    const { controller, root, shell, path } = fixture();
    const face = new StyleElement();
    shell.append(face);
    const before = root.values.size + shell.values.size + path.values.size + face.values.size;
    const diagnostics = controller.update({ definitions: [{ id: "unsafe", name: "Bad", declarations: "color: red; transform: rotate(45deg)" }],
      assignments: { item: ["unsafe"] }, targets: [{ id: "item", shell: shell.html(), channels: { face: [face.html()], content: [face.html()], paint: [path.svg()], opacity: shell.html() } }] });
    expect(diagnostics).toMatchObject([{ styleId: "unsafe", errors: [{ property: "transform", reason: "unsafe", restriction: "geometry" }] }]);
    expect(root.values.size + shell.values.size + path.values.size + face.values.size).toBe(before);
  });
});

describe("registered custom paint observation", () => {
  it("watches style only on actual patched targets and reapplies only overwritten paint", () => {
    const { controller, observer, path, casing, hit, shell, root, snapshot } = observedFixture();
    path.style.setProperty("stroke", "native-original", "important");
    path.style.setProperty("stroke-width", "2");
    controller.update(snapshot);
    expect(observer.targets).toEqual(new Set([path, casing]));
    expect(observer.observed.every(entry => entry.options.attributes === true && entry.options.attributeOldValue === true
      && entry.options.attributeFilter?.join() === "style" && entry.options.subtree === undefined)).toBe(true);
    const strokeWrite = vi.spyOn(path.style, "setProperty");
    const unaffectedReads = [root, shell, casing, hit].map(element => vi.spyOn(element.style, "getPropertyValue"));
    path.style.setProperty("stroke", "native-route-redraw", "important");
    path.style.setProperty("vector-effect", "non-scaling-stroke");
    strokeWrite.mockClear();
    observer.deliver();
    expect(strokeWrite.mock.calls).toEqual([["stroke", "#abc", ""]]);
    expect(path.style.getPropertyValue("vector-effect")).toBe("non-scaling-stroke");
    expect(path.style.getPropertyValue("stroke-width")).toBe("4");
    expect(observer.records).toHaveLength(0);
    for (const read of unaffectedReads) expect(read).not.toHaveBeenCalled();
    controller.dispose();
    expect(path.style.getPropertyValue("stroke")).toBe("native-route-redraw");
    expect(path.style.getPropertyPriority("stroke")).toBe("important");
    expect(path.style.getPropertyValue("stroke-width")).toBe("2");
  });
  it("registers equal-valued definitions without initial setters and keeps the latest baseline", () => {
    const { controller, observer, path, snapshot } = observedFixture();
    path.style.setProperty("stroke", "#abc");
    const writes = vi.spyOn(path.style, "setProperty");
    controller.update({ ...snapshot, definitions: [{ id: "style", name: "Same", declarations: "stroke: #abc" }], targets: [{ ...snapshot.targets[0], casing: undefined }] });
    expect(writes).not.toHaveBeenCalled();
    expect(observer.targets.has(path)).toBe(true);
    path.style.setProperty("stroke", "new-native");
    writes.mockClear();
    observer.deliver();
    expect(writes.mock.calls).toEqual([["stroke", "#abc", ""]]);
    controller.dispose();
    expect(path.style.getPropertyValue("stroke")).toBe("new-native");
  });
  it("does no setters for same-valued, unrelated or non-style mutations", () => {
    const { controller, observer, path, snapshot } = observedFixture();
    controller.update(snapshot);
    path.style.setProperty("stroke", "#abc");
    path.style.setProperty("native-extra", "kept");
    const writes = vi.spyOn(path.style, "setProperty");
    observer.deliver();
    expect(writes).not.toHaveBeenCalled();
    const reads = vi.spyOn(path.style, "getPropertyValue");
    observer.callback([{ target: path, attributeName: "d" } as unknown as MutationRecord]);
    expect(reads).not.toHaveBeenCalled();
    expect(observer.records).toHaveLength(0);
  });
  it("deduplicates a renderer batch and drains own records without callback feedback", () => {
    const { controller, observer, path, snapshot } = observedFixture();
    controller.update(snapshot);
    path.style.setProperty("stroke", "route-a");
    path.style.setProperty("stroke", "route-b");
    path.style.setProperty("stroke-width", "6");
    const writes = vi.spyOn(path.style, "setProperty");
    observer.deliver();
    expect(writes.mock.calls).toEqual([["stroke", "#abc", ""], ["stroke-width", "4", ""]]);
    expect(observer.records).toHaveLength(0);
    writes.mockClear();
    observer.deliver();
    expect(writes).not.toHaveBeenCalled();
    controller.dispose();
    expect(path.style.getPropertyValue("stroke")).toBe("route-b");
    expect(path.style.getPropertyValue("stroke-width")).toBe("6");
  });
  it("captures native removals and priorities and restores them on dispose", () => {
    const { controller, observer, path, snapshot } = observedFixture();
    controller.update(snapshot);
    path.style.removeProperty("stroke");
    path.style.setProperty("stroke-width", "9", "important");
    observer.deliver();
    expect(path.style.getPropertyValue("stroke")).toBe("#abc");
    expect(path.style.getPropertyPriority("stroke-width")).toBe("");
    controller.dispose();
    expect(path.style.getPropertyValue("stroke")).toBe("");
    expect(path.style.getPropertyValue("stroke-width")).toBe("9");
    expect(path.style.getPropertyPriority("stroke-width")).toBe("important");
  });
  it("captures pending changes before release without reapplying custom properties", () => {
    const { controller, observer, path, snapshot } = observedFixture();
    controller.update(snapshot);
    path.style.setProperty("stroke", "native-pending");
    const writes = vi.spyOn(path.style, "setProperty");
    controller.restoreBeforeRender();
    expect(writes.mock.calls.some(call => call[0] === "stroke" && call[1] === "#abc")).toBe(false);
    expect(path.style.getPropertyValue("stroke")).toBe("native-pending");
    expect(observer.targets.size).toBe(0);
    controller.update(snapshot);
    controller.dispose();
    expect(path.style.getPropertyValue("stroke")).toBe("native-pending");
  });
  it("replaces registrations and stays inert after release/disposal", () => {
    const { controller, observer, path, shell, snapshot } = observedFixture();
    controller.update(snapshot);
    const replacement = new StyleElement("path");
    shell.append(replacement);
    controller.update({ ...snapshot, targets: [{ ...snapshot.targets[0], elements: [replacement.svg()], casing: undefined }] });
    expect(observer.targets).toEqual(new Set([replacement]));
    path.style.setProperty("stroke", "old-host");
    expect(observer.records).toHaveLength(0);
    replacement.style.setProperty("stroke", "new-host");
    observer.deliver();
    expect(replacement.style.getPropertyValue("stroke")).toBe("#abc");
    controller.dispose();
    expect(observer.targets.size).toBe(0);
    const writes = vi.spyOn(replacement.style, "setProperty");
    observer.callback([{ target: replacement, attributeName: "style", oldValue: null } as unknown as MutationRecord]);
    expect(writes).not.toHaveBeenCalled();
    expect(replacement.style.getPropertyValue("stroke")).toBe("new-host");
  });
  it("does not reapply into a detached target but retains its latest native baseline", () => {
    const { controller, observer, path, root, snapshot } = observedFixture();
    controller.update(snapshot);
    root.children.length = 0;
    path.style.setProperty("stroke", "detached-native");
    const writes = vi.spyOn(path.style, "setProperty");
    observer.deliver();
    expect(writes).not.toHaveBeenCalled();
    controller.dispose();
    expect(path.style.getPropertyValue("stroke")).toBe("detached-native");
  });
});
