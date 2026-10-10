import { afterEach, describe, expect, it, vi } from "vitest";
import type { App, Plugin, Setting, SettingGroup, SettingDefinitionItem, SettingDefinitionRender } from "obsidian";
import { build } from "esbuild";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";

const native = vi.hoisted(() => {
  class Element {
    children: Element[] = [];
    attributes = new Map<string, string>();
    classes = new Set<string>();
    textContent = "";
    scrollTop = 0;
    tabIndex = 0;
    top = 0;
    style = { setProperty: vi.fn() };
    focus = vi.fn();
    ownerDocument = {
      defaultView: { getComputedStyle: () => ({ paddingTop: "20" }) },
      createElement: () => new Element(),
      createElementNS: () => new Element(),
    };
    empty() { this.children = []; this.textContent = ""; }
    addClass(name: string) { this.classes.add(name); }
    setAttribute(key: string, value: string) { this.attributes.set(key, value); }
    setText(value: string) { this.textContent = value; }
    appendText(value: string) { this.textContent += value; }
    appendChild(child: Element) { this.children.push(child); return child; }
    prepend(child: Element) { this.children = [child, ...this.children.filter(item => item !== child)]; }
    createDiv(options?: { cls?: string }) { return this.createEl("div", options); }
    createSpan(options?: { cls?: string }) { return this.createEl("span", options); }
    createEl(_tag: string, options?: { cls?: string; text?: string; href?: string }) {
      const element = new Element();
      if (options?.cls) element.addClass(options.cls);
      if (options?.text) element.setText(options.text);
      if (options?.href) element.setAttribute("href", options.href);
      return this.appendChild(element);
    }
    getBoundingClientRect() { return { top: this.top }; }
    scrollTo(options: { top: number }) { this.scrollTop = options.top; }
  }

  class Control {
    kind: string;
    value: unknown;
    text = "";
    icon = "";
    tooltip = "";
    disabled = false;
    destructive = false;
    cta = false;
    placeholder = "";
    limits: unknown[] = [];
    options = new Map<string, string>();
    selectEl = new Element();
    inputEl = new Element();
    change?: (value: unknown) => unknown;
    click?: () => unknown;
    constructor(kind: string) { this.kind = kind; }
    setValue(value: unknown) { this.value = value; return this; }
    setButtonText(value: string) { this.text = value; return this; }
    setIcon(value: string) { this.icon = value; return this; }
    setTooltip(value: string) { this.tooltip = value; return this; }
    setDisabled(value: boolean) { this.disabled = value; return this; }
    setDestructive() { this.destructive = true; return this; }
    setCta() { this.cta = true; return this; }
    setPlaceholder(value: string) { this.placeholder = value; return this; }
    setLimits(...limits: unknown[]) { this.limits = limits; return this; }
    addOption(value: string, label: string) { this.options.set(value, label); return this; }
    onChange(callback: (value: unknown) => unknown) { this.change = callback; return this; }
    onClick(callback: () => unknown) { this.click = callback; return this; }
  }

  class Setting {
    nameEl = new Element();
    descEl = new Element();
    settingEl = new Element();
    controls: Control[] = [];
    heading = false;
    constructor(container: Element) { container.appendChild(this.settingEl); }
    setName(value: string) { this.nameEl.setText(value); return this; }
    setDesc(value: string) { this.descEl.setText(value); return this; }
    setHeading() { this.heading = true; return this; }
    setClass(value: string) { this.settingEl.addClass(value); return this; }
    add(kind: string, callback: (control: Control) => void) {
      const control = new Control(kind);
      this.controls.push(control);
      callback(control);
      return this;
    }
    addButton(callback: (control: Control) => void) { return this.add("button", callback); }
    addToggle(callback: (control: Control) => void) { return this.add("toggle", callback); }
    addDropdown(callback: (control: Control) => void) { return this.add("dropdown", callback); }
    addExtraButton(callback: (control: Control) => void) { return this.add("extra", callback); }
    addText(callback: (control: Control) => void) { return this.add("text", callback); }
    addColorPicker(callback: (control: Control) => void) { return this.add("color", callback); }
    addSlider(callback: (control: Control) => void) { return this.add("slider", callback); }
  }

  class PluginSettingTab {
    containerEl = new Element();
    renderedRows: Setting[] = [];
    settingItems: unknown[] = [];
    updateCount = 0;
    constructor(_app: unknown, _plugin: unknown) {}
    getSettingDefinitions(): unknown[] { return []; }
    update() {
      this.updateCount += 1;
      this.settingItems = this.getSettingDefinitions();
      this.containerEl.empty();
      this.containerEl.scrollTop = 0;
      this.renderedRows = [];
      const render = (items: unknown[]) => {
        for (const item of items) {
          const def = item as { items?: unknown[]; name?: string; desc?: string; render?: (setting: Setting) => void };
          if (def.items) { render(def.items); continue; }
          const setting = new Setting(this.containerEl).setName(def.name ?? "").setDesc(def.desc ?? "");
          def.render?.(setting);
          this.renderedRows.push(setting);
        }
      };
      render(this.settingItems);
    }
  }
  return { PluginSettingTab, Setting, setIcon: vi.fn(), Element };
});

import type { SettingsTabHost } from "../src/settings-tab";
import * as i18n from "../src/i18n";
import { setLocale, words } from "../src/i18n";
import { FONT_PACK_CATALOGUE } from "../src/font-pack-catalogue";
import { ALL_TOOLBAR_ITEMS, DEFAULT_TOOLBAR_ITEMS, toolbarItemLabel } from "../src/quick-tools";
import { mergeSettings, normalizeSettings, SETTING_BOUNDS } from "../src/settings";

// The SDK package is declarations only; inject the native boundary into the bundle.
const bundle = await build({
  entryPoints: [fileURLToPath(new URL("../src/settings-tab.ts", import.meta.url))],
  bundle: true,
  format: "cjs",
  platform: "node",
  write: false,
  external: ["obsidian", "./i18n"],
});
const compiled = { exports: {} as { MiroCanvasSettingTab: typeof import("../src/settings-tab").MiroCanvasSettingTab } };
runInNewContext(bundle.outputFiles[0].text, {
  module: compiled,
  exports: compiled.exports,
  require: (id: string) => {
    if (id === "obsidian") return native;
    if (id === "./i18n") return i18n;
    throw new Error(`Unexpected runtime import ${id}`);
  },
});
const { MiroCanvasSettingTab } = compiled.exports;

afterEach(() => setLocale("en"));

function rig(cssSnippets: readonly string[] = []) {
  let settings = normalizeSettings({ fontPacks: [FONT_PACK_CATALOGUE[0].id], customFonts: [{ file: "custom.woff", family: "My font" }], commentAuthorColors: { Inter: "#123456" } });
  const saveSettings = vi.fn(async (patch) => { settings = mergeSettings(settings, patch); });
  const host: SettingsTabHost = {
    cssSnippets: () => cssSnippets,
    get settings() { return settings; },
    saveSettings,
    commentAuthors: () => ["Anna", "Inter"],
    accountName: () => "Account name",
    openImportGuide: vi.fn(),
    createWelcomeBoard: vi.fn(),
    pluginVersion: "0.2.7",
    checkForUpdate: vi.fn(async () => ({ kind: "current" as const, version: "0.2.7" })),
    fontPackCatalogue: FONT_PACK_CATALOGUE,
    downloadFontPack: vi.fn(async () => undefined),
    removeFontPack: vi.fn(async (id) => { settings = mergeSettings(settings, { fontPacks: settings.fontPacks.filter(pack => pack !== id) }); }),
    addCustomFont: vi.fn(async () => undefined),
    removeCustomFont: vi.fn(async () => undefined),
    renameCustomFont: vi.fn(async () => undefined),
    setFontShown: vi.fn(async () => undefined),
    moveFontInList: vi.fn(async () => undefined),
    wantFonts: vi.fn(),
  };
  const app = { vault: { setConfig: vi.fn() } };
  const plugin = { saveData: vi.fn() };
  const tab = new MiroCanvasSettingTab(app as unknown as App, plugin as unknown as Plugin, host);
  const facade = tab as unknown as InstanceType<typeof native.PluginSettingTab>;
  const row = (name: string) => {
    const result = facade.renderedRows.find(item => item.nameEl.textContent === name && !item.heading);
    if (!result) throw new Error(`Missing row ${name}`);
    return result;
  };
  const button = (text: string) => {
    const result = facade.renderedRows.flatMap(item => item.controls).find(control => control.text === text);
    if (!result) throw new Error(`Missing button ${text}`);
    return result;
  };
  return { tab, facade, host, app, plugin, row, button };
}

function rows(items: SettingDefinitionItem[]): SettingDefinitionRender[] {
  return items.flatMap(item => "items" in item ? rows(item.items ?? []) : [item as SettingDefinitionRender]);
}

describe("native searchable settings definitions", () => {
  it.each(["en", "ru"] as const)("indexes every section and row in %s without running actions", (locale) => {
    setLocale(locale);
    const r = rig();
    const definitions = r.tab.getSettingDefinitions();
    const entries = rows(definitions);
    expect(definitions).toHaveLength(13);
    const labels = words().settings;
    for (const name of [labels.zoomStepName, labels.zoomToCursorName, labels.wheelModifierName, labels.minZoomName, labels.maxZoomName, labels.panStepName, labels.fastPanName, labels.attachNodesName, labels.allowFreeName, labels.attachConnectorsName, labels.lassoGestureName, labels.panGestureName, labels.lineGestureName, labels.penPressureName, labels.fingerDrawingName, labels.holdStraightName, labels.shortcutsName, labels.boardFindKeyName, labels.minimapDefaultName, labels.toolbarName, labels.yourNameName, labels.developerDiagnosticsName, words().updates.checkName]) {
      expect(entries.some(item => item.name === name), name).toBe(true);
    }
    for (const tool of ALL_TOOLBAR_ITEMS) expect(entries.some(item => item.name === toolbarItemLabel(tool))).toBe(true);
    expect(entries.some(item => item.name === "custom.woff")).toBe(true);
    expect(entries.find(item => item.name === "custom.woff")?.aliases).toContain("My font");
    expect(entries.some(item => item.aliases?.includes(words().fonts.addCustomFontButton))).toBe(true);
    expect(entries.some(item => item.aliases?.includes(labels.toolBarReset))).toBe(true);
    expect(entries.filter(item => item.name === "Inter")).toHaveLength(2);
    for (const group of definitions) {
      if (!("items" in group)) continue;
      const keys = (group.items ?? []).map((item, index) => "name" in item && item.name ? `name:${item.name}` : `item#${index}`);
      expect(new Set(keys).size).toBe(keys.length);
    }
    expect(entries.find(item => item.name === labels.zoomStepName)?.desc).toContain(labels.zoomStepDesc);
    expect(r.host.saveSettings).not.toHaveBeenCalled();
    expect(r.host.wantFonts).not.toHaveBeenCalled();
    expect(r.host.downloadFontPack).not.toHaveBeenCalled();
    expect(r.host.checkForUpdate).not.toHaveBeenCalled();
    expect(r.host.addCustomFont).not.toHaveBeenCalled();
    expect(r.host.createWelcomeBoard).not.toHaveBeenCalled();
    expect(r.facade.renderedRows).toHaveLength(0);
  });

  it("saves scalar values only through the live device-specific host", async () => {
    const r = rig();
    r.tab.update();
    const labels = words().settings;
    await r.row(labels.zoomToCursorName).controls[0].change?.(false);
    await r.row(labels.wheelModifierName).controls[0].change?.("alt");
    const slider = r.row(labels.zoomStepName).controls[0];
    expect(slider.limits).toEqual([SETTING_BOUNDS.zoomStep.min, SETTING_BOUNDS.zoomStep.max, SETTING_BOUNDS.zoomStep.step]);
    await slider.change?.(1.5);
    await r.row(labels.yourNameName).controls[0].change?.("New author");
    expect(r.host.settings).toMatchObject({ zoomToCursor: false, wheelZoomModifier: "alt", zoomStep: 1.5, commentAuthor: "New author" });
    expect(r.row(labels.zoomStepName).descEl.textContent).toContain("50%");
    expect(r.app.vault.setConfig).not.toHaveBeenCalled();
    expect(r.plugin.saveData).not.toHaveBeenCalled();
  });

  it.each(["en", "ru"] as const)("indexes corner radius and individual snippet controls in %s", async locale => {
    setLocale(locale);
    const r = rig(["Red line", "Wide paragraphs"]);
    const entries = rows(r.tab.getSettingDefinitions());
    expect(entries.some(item => item.name === words().enhancements.cardCornerRadius)).toBe(true);
    expect(entries.some(item => item.name === "Red line")).toBe(true);
    r.tab.update();
    await r.row(words().enhancements.cardCornerRadius).controls[0].change?.(20);
    const numeric = r.row(words().enhancements.cardCornerRadius).controls[1];
    expect(numeric.value).toBe("20");
    await numeric.change?.("invalid");
    expect(r.host.settings.cardCornerRadius).toBe(20);
    await numeric.change?.("99");
    expect(r.host.settings.cardCornerRadius).toBe(48);
    expect(numeric.value).toBe("48");
    expect(r.row(words().enhancements.cardCornerRadius).controls[0].value).toBe(48);
    await numeric.change?.("20");
    await r.row("Red line").controls[0].change?.(true);
    await r.row("Wide paragraphs").controls[0].change?.(true);
    await r.row("Red line").controls[0].change?.(false);
    expect(r.host.settings).toMatchObject({ cardCornerRadius: 20, allowedCanvasSnippets: ["Wide paragraphs"] });
    expect(r.app.vault.setConfig).not.toHaveBeenCalled();
  });

  it.each(["en", "ru"] as const)("indexes and saves the radius zoom percentage with slider and exact input in %s", async locale => {
    setLocale(locale);
    const r = rig();
    const label = words().enhancements.shapeRadiusControlMinZoom;
    const entries = rows(r.tab.getSettingDefinitions());
    expect(entries.find(item => item.name === label)?.desc).toContain("200%");
    expect(r.host.saveSettings).not.toHaveBeenCalled();
    r.tab.update();
    const row = r.row(label);
    const [slider, input] = row.controls;
    expect(slider.limits).toEqual([0, 6400, 25]);
    expect(input.inputEl.attributes.get("aria-label")).toBe(label);
    await slider.change?.(300);
    expect(input.value).toBe("300");
    expect(r.host.settings.shapeRadiusControlMinZoomPercent).toBe(300);
    await input.change?.("125");
    expect(slider.value).toBe(125);
    expect(row.descEl.textContent).toContain("125%");
    for (const invalid of ["", "NaN", "Infinity"]) await input.change?.(invalid);
    expect(r.host.settings.shapeRadiusControlMinZoomPercent).toBe(125);
    await input.change?.("-1");
    expect(r.host.settings.shapeRadiusControlMinZoomPercent).toBe(0);
    expect(input.value).toBe("0");
    await input.change?.("9000");
    expect(r.host.settings.shapeRadiusControlMinZoomPercent).toBe(6400);
    expect(input.value).toBe("6400");
    expect(r.host.settings.shapeRadiusControlEnabled).toBe(true);
    expect(r.app.vault.setConfig).not.toHaveBeenCalled();
    expect(r.plugin.saveData).not.toHaveBeenCalled();
  });

  it("reads live values when native Obsidian reuses cached slider definitions after reopening", async () => {
    const r = rig();
    const entries = rows(r.tab.getSettingDefinitions());
    await r.host.saveSettings({ shapeRadiusControlMinZoomPercent: 125, cardCornerRadius: 17 });
    for (const [name, value] of [[words().enhancements.shapeRadiusControlMinZoom, 125], [words().enhancements.cardCornerRadius, 17]] as const) {
      const definition = entries.find(item => item.name === name)!;
      const setting = new native.Setting(new native.Element()).setName(name).setDesc(typeof definition.desc === "string" ? definition.desc : "");
      definition.render?.(setting as unknown as Setting, {} as SettingGroup);
      expect(setting.controls[0].value).toBe(value);
      expect(setting.controls[1].value).toBe(String(value));
      expect(setting.descEl.textContent).toContain(String(value));
    }
  });

  it("keeps toolbar ordering and scroll when definitions are updated", async () => {
    const r = rig();
    r.tab.update();
    r.facade.containerEl.scrollTop = 650;
    const second = r.host.settings.toolbarItems[1];
    const up = r.row(toolbarItemLabel(second)).controls.find(control => control.icon === "arrow-up");
    up?.click?.();
    await Promise.resolve();
    expect(r.host.settings.toolbarItems[0]).toBe(second);
    expect(r.facade.updateCount).toBe(2);
    expect(r.facade.containerEl.scrollTop).toBe(650);
    r.button(words().settings.toolBarReset).click?.();
    await Promise.resolve();
    expect(r.host.settings.toolbarItems).toEqual(DEFAULT_TOOLBAR_ITEMS);
    expect(r.facade.containerEl.scrollTop).toBe(650);
  });

  it("scrolls the first selector to the actual rendered section and focuses its heading", () => {
    const r = rig();
    r.tab.update();
    const jump = r.facade.renderedRows[0].controls[0];
    expect(jump.options.size).toBe(13);
    const heading = r.facade.renderedRows.find(item => item.settingEl.attributes.get("data-miro-settings-section") === "fonts")!;
    heading.nameEl.top = 420;
    r.facade.containerEl.scrollTop = 100;
    jump.change?.("fonts");
    expect(r.facade.containerEl.scrollTop).toBe(500);
    expect(heading.nameEl.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(jump.value).toBe("");
  });

  it("retains destructive styling and refreshes font removal and author reset", async () => {
    const r = rig();
    r.tab.update();
    const remove = r.button(words().fonts.removeButton);
    expect(remove.destructive).toBe(true);
    expect(remove.cta).toBe(true);
    remove.click?.();
    await Promise.resolve();
    expect(r.host.removeFontPack).toHaveBeenCalledWith(FONT_PACK_CATALOGUE[0].id);
    expect(r.host.settings.fontPacks).not.toContain(FONT_PACK_CATALOGUE[0].id);
    const author = r.row("Inter");
    const reset = author.controls.find(control => control.icon === "rotate-ccw")!;
    reset.click?.();
    await Promise.resolve();
    expect(r.host.settings.commentAuthorColors).toEqual({});
    expect(r.host.wantFonts).toHaveBeenCalled();
  });

  it("opens guides, checks updates and changes custom fonts only after presses", async () => {
    const r = rig();
    r.tab.update();
    expect(r.host.checkForUpdate).not.toHaveBeenCalled();
    r.button(words().importGuide.createWelcomeBoardButton).click?.();
    r.button(words().importGuide.openGuideButton).click?.();
    expect(r.host.createWelcomeBoard).toHaveBeenCalledOnce();
    expect(r.host.openImportGuide).toHaveBeenCalledOnce();
    await r.button(words().updates.checkButton).click?.();
    expect(r.host.checkForUpdate).toHaveBeenCalledOnce();
    expect(r.row(words().updates.checkName).descEl.children[0].textContent).toBe(words().updates.current("0.2.7"));
    r.row("custom.woff").controls[0].change?.("Renamed");
    expect(r.host.renameCustomFont).toHaveBeenCalledWith("custom.woff", "Renamed");
    r.row("custom.woff").controls.find(control => control.icon === "trash-2")?.click?.();
    await Promise.resolve();
    expect(r.host.removeCustomFont).toHaveBeenCalledWith("custom.woff");
  });

  it("shows download progress and failure without starting a download during indexing", () => {
    const r = rig();
    r.tab.getSettingDefinitions();
    expect(r.host.downloadFontPack).not.toHaveBeenCalled();
    r.tab.update();
    vi.mocked(r.host.downloadFontPack).mockImplementation(async (_id, progress) => {
      progress("downloading");
      progress("installing");
      progress("failed", "Test failure");
    });
    const button = r.button(words().fonts.downloadButton);
    const row = r.facade.renderedRows.find(item => item.controls.includes(button))!;
    button.click?.();
    expect(r.host.downloadFontPack).toHaveBeenCalledOnce();
    expect(row.descEl.children[0].textContent).toBe("Test failure");
    expect(button.disabled).toBe(false);
  });

  it("keeps hidden toolbar controls and font pool actions on their host paths", async () => {
    const r = rig();
    r.tab.update();
    await r.row(words().settings.collapseToolsButton).controls[0].change?.(false);
    expect(r.host.settings.hiddenPanelButtons).toContain("toolbar");
    const font = r.facade.renderedRows.find(item => item.nameEl.textContent === "Inter" && item.controls.some(control => control.icon === "arrow-down"))!;
    font.controls.find(control => control.kind === "toggle")?.change?.(false);
    expect(r.host.setFontShown).toHaveBeenCalledWith("Inter", false);
    font.controls.find(control => control.icon === "arrow-down")?.click?.();
    await Promise.resolve();
    expect(r.host.moveFontInList).toHaveBeenCalledWith("Inter", "down");
  });
});
