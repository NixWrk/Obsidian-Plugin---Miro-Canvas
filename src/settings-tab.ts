/**
 * The Obsidian-facing settings tab.
 *
 * Everything this tab decides lives in `settings.ts`; the tab itself only
 * renders controls and reports the chosen value, so the bounds and the
 * fallbacks stay testable without an Obsidian runtime.
 */

import { PluginSettingTab, setIcon, type App, type Plugin, type Setting, type SettingDefinitionItem, type SettingDefinitionRender, type SliderComponent, type TextComponent } from "obsidian";

import { fontStack } from "./appearance";
import { authorColor } from "./comment-thread";
import type { FontPackCatalogueEntry } from "./font-pack-catalogue";
import type { FontPackProgress } from "./font-packs";
import { currentLocale, words } from "./i18n";
import { POINTER_BINDINGS, type PointerBinding } from "./pointer-bindings";
import { ALL_TOOLBAR_ITEMS, DEFAULT_TOOLBAR_ITEMS, paintToolbarIcon, toolbarItemLabel, type ToolbarItem } from "./quick-tools";
import type { UpdateCheck } from "./update-check";
import {
  DEFAULT_COMMENT_AUTHOR,
  SETTING_BOUNDS,
  WHEEL_ZOOM_MODIFIERS,
  pointerBindingLabel,
  type FontListDirection,
  type MiroCanvasSettings,
  type WheelZoomModifier,
} from "./settings";

export interface SettingsTabHost {
  readonly openCustomStyles?: () => void;
  readonly openPalette?: () => void;
  readonly cssSnippets?: () => readonly string[];
  readonly settings: MiroCanvasSettings;
  readonly saveSettings: (patch: Partial<MiroCanvasSettings>) => Promise<void>;
  /** Everyone who has written on the open board, for their colours. */
  readonly commentAuthors?: () => readonly string[];
  /** The Obsidian account's name, which signs comments when no name is set. */
  readonly accountName?: () => string | undefined;
  /** Opens the "Import boards from Miro" guide; the same one the first-run question offers. */
  readonly openImportGuide: () => void;
  /** Creates a fresh welcome board, preserving any existing board at its path. */
  readonly createWelcomeBoard: () => void;
  /** The installed version, from the plugin's manifest. */
  readonly pluginVersion: string;
  /** Asks GitHub for the latest release; called only on the button's press. */
  readonly checkForUpdate: () => Promise<UpdateCheck>;
  /** The downloadable font packs' names, sizes and checksums; embedded, so listing them asks nobody. */
  readonly fontPackCatalogue: readonly FontPackCatalogueEntry[];
  /** Downloads and installs one pack, reporting its progress as it goes; called only on the button's press. */
  readonly downloadFontPack: (id: string, onProgress: (stage: FontPackProgress, detail?: string) => void) => Promise<void>;
  readonly removeFontPack: (id: string) => Promise<void>;
  /** Opens a file picker and copies the chosen font into the plugin's own folder. */
  readonly addCustomFont: () => Promise<void>;
  readonly removeCustomFont: (file: string) => Promise<void>;
  readonly renameCustomFont: (file: string, family: string) => Promise<void>;
  readonly setFontShown: (family: string, shown: boolean) => Promise<void>;
  readonly moveFontInList: (family: string, direction: FontListDirection) => Promise<void>;
  /** Asks for these families' faces to be read, so the pool's own names show in their own font. */
  readonly wantFonts: (families: readonly string[]) => void;
}

/** Record each row for native rendering and search without opening its controls. */
class SettingsRow {
  public readonly definition: SettingDefinitionRender;
  private readonly steps: ((setting: Setting) => void)[] = [];

  public constructor(rows: SettingDefinitionRender[]) {
    this.definition = {
      name: "",
      render: (setting) => {
        for (const step of this.steps) {
          step(setting);
        }
      },
    };
    rows.push(this.definition);
  }

  public setName(name: string): this {
    this.definition.name = name;
    return this;
  }

  public setDesc(description: string): this {
    this.definition.desc = description;
    return this;
  }

  public setAliases(...aliases: string[]): this {
    this.definition.aliases = aliases;
    return this;
  }

  public configure(callback: (setting: Setting) => void): this {
    this.steps.push(callback);
    return this;
  }

  public setClass(name: string): this {
    return this.configure((setting) => {
      setting.setClass(name);
    });
  }

  public setHeading(): this {
    return this.configure((setting) => {
      setting.setHeading();
    });
  }

  public addButton(callback: Parameters<Setting["addButton"]>[0]): this {
    return this.configure((setting) => {
      setting.addButton(callback);
    });
  }

  public addToggle(callback: Parameters<Setting["addToggle"]>[0]): this {
    return this.configure((setting) => {
      setting.addToggle(callback);
    });
  }

  public addDropdown(callback: Parameters<Setting["addDropdown"]>[0]): this {
    return this.configure((setting) => {
      setting.addDropdown(callback);
    });
  }

  public addText(callback: Parameters<Setting["addText"]>[0]): this {
    return this.configure((setting) => {
      setting.addText(callback);
    });
  }

  public addExtraButton(callback: Parameters<Setting["addExtraButton"]>[0]): this {
    return this.configure((setting) => {
      setting.addExtraButton(callback);
    });
  }

  public addColorPicker(callback: Parameters<Setting["addColorPicker"]>[0]): this {
    return this.configure((setting) => {
      setting.addColorPicker(callback);
    });
  }
}

export class MiroCanvasSettingTab extends PluginSettingTab {
  private readonly host: SettingsTabHost;
  private readonly sectionTargets = new Map<string, HTMLElement>();
  private readonly sectionNames = new Map<string, string>();
  private readonly sectionDefinitions = new Set<SettingDefinitionRender>();

  public constructor(app: App, plugin: Plugin, host: SettingsTabHost) {
    super(app, plugin);
    this.host = host;
  }

  public override getSettingDefinitions(): SettingDefinitionItem[] {
    const rows: SettingDefinitionRender[] = [];
    this.containerEl.addClass("miro-canvas-settings");
    this.sectionTargets.clear();
    this.sectionNames.clear();
    this.sectionDefinitions.clear();
    const labels = words().settings;

    const importLabels = words().importGuide;
    this.sectionHeading(rows, "getting-started", importLabels.settingsHeading);
    new SettingsRow(rows)
      .setClass("miro-canvas-settings-action")
      .setName(labels.welcomeBoardName)
      .setDesc(labels.welcomeBoardDesc)
      .addButton(button => button.setButtonText(importLabels.createWelcomeBoardButton)
        .setCta().onClick(() => this.host.createWelcomeBoard()));
    new SettingsRow(rows)
      .setClass("miro-canvas-settings-action")
      .setName(labels.importGuideName)
      .setDesc(labels.importGuideDesc)
      .addButton(button => button.setButtonText(importLabels.openGuideButton)
        .onClick(() => this.host.openImportGuide()));

    this.sectionHeading(rows, "navigation", labels.navigationHeading);

    this.slider(rows, labels.zoomStepName, labels.zoomStepDesc,
      "zoomStep", (value) => `${Math.round((value - 1) * 100)}%`);

    new SettingsRow(rows)
      .setName(labels.zoomToCursorName)
      .setDesc(labels.zoomToCursorDesc)
      .addToggle((toggle) => toggle
        .setValue(this.host.settings.zoomToCursor)
        .onChange((value) => void this.host.saveSettings({ zoomToCursor: value })));

    new SettingsRow(rows)
      .setName(labels.wheelModifierName)
      .setDesc(labels.wheelModifierDesc)
      .addDropdown((dropdown) => {
        for (const modifier of WHEEL_ZOOM_MODIFIERS) {
          dropdown.addOption(modifier, modifier === "none" ? labels.noModifier : modifier.toUpperCase());
        }
        dropdown
          .setValue(this.host.settings.wheelZoomModifier)
          .onChange((value) => void this.host.saveSettings({ wheelZoomModifier: value as WheelZoomModifier }));
      });

    new SettingsRow(rows)
      .setName(labels.invertWheelName)
      .addToggle((toggle) => toggle
        .setValue(this.host.settings.invertWheelZoom)
        .onChange((value) => void this.host.saveSettings({ invertWheelZoom: value })));

    this.slider(rows, labels.minZoomName, labels.minZoomDesc,
      "minZoom", (value) => `${Math.round(value * 100)}%`);
    this.slider(rows, labels.maxZoomName, labels.maxZoomDesc,
      "maxZoom", (value) => `${Math.round(value * 100)}%`);
    const enhancementLabels = words().enhancements;
    this.slider(rows, enhancementLabels.cardCornerRadius, enhancementLabels.cardCornerRadiusHint,
      "cardCornerRadius", (value) => `${value} px`);
    new SettingsRow(rows).setName(enhancementLabels.canvasSnippets).setDesc(enhancementLabels.canvasSnippetsHint);
    const snippetNames = this.host.cssSnippets?.() ?? [];
    if (snippetNames.length === 0) new SettingsRow(rows).setName(enhancementLabels.noSnippets);
    for (const name of snippetNames) {
      new SettingsRow(rows).setName(name).setDesc(enhancementLabels.snippetEnabledHint)
        .addToggle((toggle) => toggle.setValue(this.host.settings.allowedCanvasSnippets.includes(name))
          .onChange((enabled) => {
            const selected = new Set(this.host.settings.allowedCanvasSnippets);
            if (enabled) selected.add(name);
            else selected.delete(name);
            void this.host.saveSettings({ allowedCanvasSnippets: [...selected] });
          }));
    }
    for (const [key, title] of [
      ["contentTextThreshold", enhancementLabels.contentText],
      ["contentFileThreshold", enhancementLabels.contentFile],
      ["contentLinkThreshold", enhancementLabels.contentLink],
      ["contentPluginThreshold", enhancementLabels.contentPlugin],
    ] as const) this.slider(rows, title, enhancementLabels.contentHint, key, (value) => `${Math.round(value * 100)}%`);
    for (const [key, title, description] of [
      ["highlightConnectedLines", enhancementLabels.highlightLines, enhancementLabels.highlightLinesHint],
      ["boardKnowledge", enhancementLabels.knowledge, enhancementLabels.knowledgeHint],
      ["automaticPropertyEdges", enhancementLabels.propertyEdges, enhancementLabels.propertyEdgesHint],
    ] as const) {
      new SettingsRow(rows).setName(title).setDesc(description)
        .addToggle((toggle) => toggle.setValue(this.host.settings[key])
          .onChange((value) => void this.host.saveSettings({ [key]: value })));
    }
    new SettingsRow(rows).setName(enhancementLabels.relationProperties).setDesc(enhancementLabels.relationPropertiesHint)
      .configure((setting) => {
        setting.addText((text) => text.setValue(this.host.settings.relationProperties.join(", "))
          .onChange((value) => void this.host.saveSettings({ relationProperties: value.split(",").map((name) => name.trim()).filter(Boolean) })));
      });
    if (this.host.openCustomStyles !== undefined) {
      new SettingsRow(rows).setName(enhancementLabels.customStyles).setDesc(enhancementLabels.stylesHint)
        .addButton((button) => button.setButtonText(enhancementLabels.editStyles).onClick(() => { void this.host.openCustomStyles?.(); }));
    }
    if (this.host.openPalette !== undefined) {
      new SettingsRow(rows).setName(enhancementLabels.paletteTitle)
        .addButton((button) => button.setButtonText(enhancementLabels.paletteTitle).onClick(() => { void this.host.openPalette?.(); }));
    }

    this.sectionHeading(rows, "panning", labels.panningHeading);

    this.slider(rows, labels.panStepName, labels.panStepDesc,
      "panStep", (value) => `${value} px`);
    this.slider(rows, labels.fastPanName, labels.fastPanDesc,
      "fastPanMultiplier", (value) => `${value}×`);

    this.sectionHeading(rows, "connectors", labels.connectorsHeading);
    // Where an end of a line or an arrow may be put down.  Existing
    // connections keep their ends whatever is chosen here.
    for (const [key, title, description] of [
      ["connectorAttachNodes", labels.attachNodesName, labels.attachNodesDesc],
      ["connectorAllowFree", labels.allowFreeName, labels.allowFreeDesc],
      ["connectorAttachConnectors", labels.attachConnectorsName, labels.attachConnectorsDesc],
    ] as const) {
      new SettingsRow(rows).setName(title)
        .setDesc(description)
        .addToggle((toggle) => toggle.setValue(this.host.settings[key])
          .onChange((value) => void this.host.saveSettings({ [key]: value })));
    }
    new SettingsRow(rows).setName(labels.lassoGestureName)
      .setDesc(labels.lassoGestureDesc)
      .addDropdown(dropdown => {
        for (const chord of POINTER_BINDINGS) dropdown.addOption(chord, pointerBindingLabel(chord));
        dropdown.setValue(this.host.settings.lassoBinding).onChange(value => void this.host.saveSettings({ lassoBinding: value as PointerBinding }));
      });
    for (const [key, title, description] of [
      ["panBinding", labels.panGestureName, labels.panGestureDesc],
      ["lineBinding", labels.lineGestureName, labels.lineGestureDesc],
    ] as const) {
      new SettingsRow(rows).setName(title).setDesc(description).addDropdown(dropdown => {
        for (const chord of POINTER_BINDINGS) dropdown.addOption(chord, pointerBindingLabel(chord));
        dropdown.setValue(this.host.settings[key]).onChange(value => void this.host.saveSettings({ [key]: value as PointerBinding }));
      });
    }

    this.slider(rows, labels.magnetName, labels.magnetDesc,
      "connectorMagnet", (value) => `${value} px`);
    this.slider(rows, labels.snapName, labels.snapDesc,
      "connectorSnap", (value) => `${value} px`);
    this.slider(rows, labels.labelPositionName, labels.labelPositionDesc,
      "connectorLabelPosition", (value) => `${Math.round(value * 100)}%`);

    this.sectionHeading(rows, "drawing", labels.drawingHeading);

    new SettingsRow(rows).setName(labels.penPressureName).setDesc(labels.penPressureDesc)
      .addToggle(toggle => toggle.setValue(this.host.settings.penPressure)
        .onChange(value => void this.host.saveSettings({ penPressure: value })));
    new SettingsRow(rows).setName(labels.fingerDrawingName).setDesc(labels.fingerDrawingDesc)
      .addToggle(toggle => toggle.setValue(this.host.settings.fingerDrawing)
        .onChange(value => void this.host.saveSettings({ fingerDrawing: value })));

    new SettingsRow(rows)
      .setName(labels.holdStraightName)
      .setDesc(labels.holdStraightDesc)
      .addToggle((toggle) => toggle
        .setValue(this.host.settings.holdStraightLine)
        .onChange((value) => void this.host.saveSettings({ holdStraightLine: value })));

    this.sectionHeading(rows, "keyboard", labels.keyboardHeading);

    new SettingsRow(rows)
      .setName(labels.shortcutsName)
      .setDesc(labels.shortcutsDesc(words().commands.resetTools))
      .addButton((button) => button
        .setButtonText(labels.openHotkeys)
        .onClick(() => {
          const setting = (this.app as unknown as {
            setting?: { open?: () => void; openTabById?: (id: string) => void };
          }).setting;
          setting?.open?.();
          setting?.openTabById?.("hotkeys");
        }));

    new SettingsRow(rows)
      .setName(labels.boardFindKeyName)
      .setDesc(labels.boardFindKeyDesc)
      .addToggle((toggle) => toggle
        .setValue(this.host.settings.boardFindKey)
        .onChange((value) => void this.host.saveSettings({ boardFindKey: value })));

    this.sectionHeading(rows, "interface", labels.interfaceName, labels.interfaceDesc);

    new SettingsRow(rows)
      .setName(labels.minimapDefaultName)
      .addToggle((toggle) => toggle
        .setValue(this.host.settings.minimapVisible)
        .onChange((value) => void this.host.saveSettings({ minimapVisible: value })));

    new SettingsRow(rows)
      .setName(labels.toolbarName)
      .setDesc(labels.toolbarDesc)
      .addToggle((toggle) => toggle
        .setValue(this.host.settings.selectionToolbarEnabled)
        .onChange((value) => void this.host.saveSettings({ selectionToolbarEnabled: value })));

    this.toolBar(rows);
    this.comments(rows);

    this.fonts(rows);
    this.updates(rows);

    this.sectionHeading(rows, "advanced", labels.advancedHeading);
    new SettingsRow(rows)
      .setName(labels.developerDiagnosticsName)
      .setDesc(labels.developerDiagnosticsDesc)
      .addToggle((toggle) => toggle
        .setValue(this.host.settings.developerDiagnostics)
        .onChange((value) => void this.host.saveSettings({ developerDiagnostics: value })));
    this.sectionNavigation(rows);
    const groups: SettingDefinitionItem[] = [];
    let items: SettingDefinitionRender[] = [];
    for (const row of rows) {
      if (this.sectionDefinitions.has(row) || items.length === 0) {
        items = [];
        groups.push({ type: "group", items });
      }
      items.push(row);
    }
    return groups;
  }

  private sectionHeading(rows: SettingDefinitionRender[], id: string, name: string, description?: string): void {
    const heading = new SettingsRow(rows).setName(name).setHeading();
    if (description !== undefined) heading.setDesc(description);
    this.sectionNames.set(id, name);
    this.sectionDefinitions.add(heading.definition);
    heading.configure((setting) => {
      setting.nameEl.tabIndex = -1;
      setting.nameEl.setAttribute("role", "heading");
      setting.nameEl.setAttribute("aria-level", "2");
      setting.settingEl.setAttribute("data-miro-settings-section", id);
      this.sectionTargets.set(id, setting.nameEl);
    });
  }

  private sectionNavigation(rows: SettingDefinitionRender[]): void {
    const labels = words().settings;
    const row = new SettingsRow(rows).setName(labels.sectionJumpName).setDesc(labels.sectionJumpDesc);
    row.setClass("miro-canvas-settings-jump");
    const sections = new Map(this.sectionNames);
    row.addDropdown(dropdown => {
      dropdown.selectEl.setAttribute("aria-label", labels.sectionJumpName);
      dropdown.addOption("", labels.sectionJumpPlaceholder);
      for (const [id, name] of sections) dropdown.addOption(id, name);
      dropdown.onChange(id => {
        const heading = this.sectionTargets.get(id);
        if (heading === undefined) return;
        const container = this.containerEl;
        const view = container.ownerDocument.defaultView;
        const inset = Number.parseFloat(view?.getComputedStyle(container).paddingTop ?? "0") || 0;
        const top = container.scrollTop + heading.getBoundingClientRect().top - container.getBoundingClientRect().top - inset;
        container.scrollTo({ top: Math.max(0, top), behavior: "auto" });
        heading.focus({ preventScroll: true });
        dropdown.setValue("");
      });
    });
    rows.pop();
    rows.unshift(row.definition);
  }

  /**
   * "Fonts": downloadable packs with Download/Remove and progress, a custom
   * font file, and the person's own pool - which families the toolbar's
   * font list offers, and in what order.  Nothing here is downloaded
   * without a press (QUAL-003); the line under the heading says so.
   */
  private fonts(rows: SettingDefinitionRender[]): void {
    const labels = words().fonts;
    this.sectionHeading(rows, "fonts", labels.heading, labels.networkLine);

    const locale = currentLocale();
    for (const pack of this.host.fontPackCatalogue) {
      const installed = this.host.settings.fontPacks.includes(pack.id);
      const megabytes = (pack.bytes / (1024 * 1024)).toFixed(1);
      const setting = new SettingsRow(rows)
        .setName(pack.title[locale] ?? pack.title.en)
        .setDesc(`${pack.description[locale] ?? pack.description.en} ${labels.sizeMB(megabytes)}`);
      setting.configure((nativeSetting) => {
        const status = nativeSetting.descEl.createDiv({ cls: "miro-canvas-fontpack-status" });
        nativeSetting.addButton((button) => {
          button.setButtonText(installed ? labels.removeButton : labels.downloadButton);
          if (installed) {
            button.setDestructive().setCta();
            button.onClick(() => {
              button.setDisabled(true);
              void this.host.removeFontPack(pack.id).then(() => this.redisplayInPlace());
            });
            return;
          }
          button.onClick(() => {
            button.setDisabled(true);
            void this.host.downloadFontPack(pack.id, (stage, detail) => {
              if (stage === "downloading") {
                status.setText(labels.downloading);
              } else if (stage === "installing") {
                status.setText(labels.installing);
              } else if (stage === "done") {
                this.redisplayInPlace();
              } else {
                button.setDisabled(false);
                status.setText(detail ?? labels.failed);
              }
            });
          });
        });
      });
    }

    new SettingsRow(rows)
      .setAliases(labels.addCustomFontButton)
      .addButton((button) => button
        .setButtonText(labels.addCustomFontButton)
        .onClick(() => void this.host.addCustomFont().then(() => this.redisplayInPlace())));
    for (const custom of this.host.settings.customFonts) {
      new SettingsRow(rows)
        .setName(custom.file)
        .setAliases(custom.family)
        .addText((text) => text
          .setValue(custom.family)
          .onChange((value) => void this.host.renameCustomFont(custom.file, value)))
        .addExtraButton((extra) => extra
          .setIcon("trash-2")
          .setTooltip(labels.removeCustomFontTooltip)
          .onClick(() => void this.host.removeCustomFont(custom.file).then(() => this.redisplayInPlace())));
    }

    const pool = this.host.settings.fontList;
    new SettingsRow(rows).setName(labels.poolHeading).setDesc(labels.poolDesc)
      .configure(() => this.host.wantFonts(pool.map((entry) => entry.family)));
    pool.forEach((entry, index) => {
      const setting = new SettingsRow(rows).setName(entry.family);
      setting.configure((nativeSetting) => nativeSetting.nameEl.style.setProperty("font-family", fontStack(entry.family)));
      setting
        .addToggle((toggle) => toggle
          .setTooltip(labels.shownTooltip)
          .setValue(entry.shown)
          .onChange((value) => void this.host.setFontShown(entry.family, value)))
        .addExtraButton((extra) => extra
          .setIcon("arrow-up")
          .setTooltip(words().settings.toolBarMoveUp)
          .setDisabled(index === 0)
          .onClick(() => void this.host.moveFontInList(entry.family, "up").then(() => this.redisplayInPlace())))
        .addExtraButton((extra) => extra
          .setIcon("arrow-down")
          .setTooltip(words().settings.toolBarMoveDown)
          .setDisabled(index === pool.length - 1)
          .onClick(() => void this.host.moveFontInList(entry.family, "down").then(() => this.redisplayInPlace())));
    });
  }

  /** "Check for updates": the installed version, and on a press what GitHub has. */
  private updates(rows: SettingDefinitionRender[]): void {
    const labels = words().updates;
    this.sectionHeading(rows, "updates", labels.heading);
    new SettingsRow(rows)
      .setName(labels.autoName)
      .setDesc(labels.autoDesc)
      .addToggle((toggle) => toggle
        .setValue(this.host.settings.checkUpdatesAutomatically)
        .onChange((value) => void this.host.saveSettings({ checkUpdatesAutomatically: value })));
    const setting = new SettingsRow(rows).setName(labels.checkName).setDesc(labels.checkDesc(this.host.pluginVersion));
    setting.configure((nativeSetting) => {
      const status = nativeSetting.descEl.createDiv({ cls: "miro-canvas-update-status" });
      nativeSetting.addButton((button) => button
        .setButtonText(labels.checkButton)
        .onClick(async () => {
          button.setDisabled(true);
          status.setText(labels.checking);
          const result = await this.host.checkForUpdate();
          button.setDisabled(false);
          status.empty();
          if (result.kind === "newer") {
            status.appendText(`${labels.newer(result.version)} `);
            status.createEl("a", { text: labels.openRelease, href: result.url });
          } else {
            status.setText(result.kind === "current" ? labels.current(result.version)
              : result.kind === "unpublished" ? labels.unpublished
                : labels.failed);
          }
        }));
    });
  }

  /**
   * The bottom tool bar: every item, on the bar or under More, with a toggle
   * for "on the bar" and up/down buttons that reorder the ones on it.  The
   * list shows the bar's own items first, in their order, then the rest in
   * `ALL_TOOLBAR_ITEMS` order; changing anything rebuilds this same list so
   * moving an item always shows where it landed.
   */
  private toolBar(rows: SettingDefinitionRender[]): void {
    const labels = words().settings;
    this.sectionHeading(rows, "tools", labels.toolBarHeading, labels.toolBarDesc);
    new SettingsRow(rows).setDesc(labels.toolBarArrangeHint);
    new SettingsRow(rows).setDesc(labels.toolBarLayoutKept(labels.layoutKinds[this.host.settings.layoutKind]));
    new SettingsRow(rows)
      .setAliases(labels.toolBarReset)
      .addButton((button) => button
        .setButtonText(labels.toolBarReset)
        .onClick(() => void this.host.saveSettings({ toolbarItems: DEFAULT_TOOLBAR_ITEMS }).then(() => this.redisplayInPlace())));
    for (const id of ["toolbar", "dockBar"] as const) {
      new SettingsRow(rows)
        .setName(id === "toolbar" ? labels.collapseToolsButton : labels.collapseNavigationButton)
        .setDesc(labels.collapseButtonDesc)
        .addToggle((toggle) => toggle
          .setValue(!this.host.settings.hiddenPanelButtons?.includes(id))
          .onChange((shown) => {
            const hidden = this.host.settings.hiddenPanelButtons ?? [];
            void this.host.saveSettings({ hiddenPanelButtons: shown ? hidden.filter((entry) => entry !== id) : [...hidden, id] });
          }));
    }
    const current = this.host.settings.toolbarItems;
    const onBar = new Set(current);
    const listed: readonly ToolbarItem[] = [...current, ...ALL_TOOLBAR_ITEMS.filter((item) => !onBar.has(item))];
    for (const item of listed) {
      const position = current.indexOf(item);
      const setting = new SettingsRow(rows).setName(toolbarItemLabel(item));
      setting.configure((nativeSetting) => {
        const icon = nativeSetting.nameEl.createSpan({ cls: "miro-canvas-settings-tool-icon" });
        nativeSetting.nameEl.prepend(icon);
        paintToolbarIcon(icon, item, nativeSetting.settingEl.ownerDocument, (element, name) => setIcon(element, name));
      });
      setting
        .addToggle((toggle) => toggle
          .setTooltip(labels.toolBarOnBar)
          .setValue(position !== -1)
          .onChange((value) => {
            const next = value ? [...current, item] : current.filter((existing) => existing !== item);
            void this.host.saveSettings({ toolbarItems: next }).then(() => this.redisplayInPlace());
          }))
        .addExtraButton((extra) => extra
          .setIcon("arrow-up")
          .setTooltip(labels.toolBarMoveUp)
          .setDisabled(position <= 0)
          .onClick(() => {
            const next = [...current];
            [next[position - 1], next[position]] = [next[position], next[position - 1]];
            void this.host.saveSettings({ toolbarItems: next }).then(() => this.redisplayInPlace());
          }))
        .addExtraButton((extra) => extra
          .setIcon("arrow-down")
          .setTooltip(labels.toolBarMoveDown)
          .setDisabled(position === -1 || position === current.length - 1)
          .onClick(() => {
            const next = [...current];
            [next[position], next[position + 1]] = [next[position + 1], next[position]];
            void this.host.saveSettings({ toolbarItems: next }).then(() => this.redisplayInPlace());
          }));
    }
  }

  /**
   * Draw the tab again without moving it: a change in a list far down the
   * page (the tool bar, the authors' colours) otherwise sent the reader back
   * to the top after every click.
   */
  private redisplayInPlace(): void {
    const top = this.containerEl.scrollTop;
    this.update();
    this.containerEl.scrollTop = top;
  }

  /** Who signs the comments written here, and the colour each author's pins wear. */
  private comments(rows: SettingDefinitionRender[]): void {
    const labels = words().settings;
    this.sectionHeading(rows, "comments", labels.commentsHeading);
    const account = this.host.accountName?.();
    new SettingsRow(rows)
      .setName(labels.yourNameName)
      .setDesc(account === undefined
        ? labels.yourNameDescDefault(DEFAULT_COMMENT_AUTHOR)
        : labels.yourNameDescAccount(account))
      .addText((text) => text
        .setPlaceholder(account ?? DEFAULT_COMMENT_AUTHOR)
        .setValue(this.host.settings.commentAuthor)
        .onChange((value) => void this.host.saveSettings({ commentAuthor: value })));
    const colors = this.host.settings.commentAuthorColors;
    const authors = [...new Set([...(this.host.commentAuthors?.() ?? []), ...Object.keys(colors)])]
      .sort((a, b) => a.localeCompare(b));
    if (authors.length === 0) {
      new SettingsRow(rows).setName(labels.authorColorsName).setDesc(labels.authorColorsDesc);
      return;
    }
    for (const author of authors) {
      new SettingsRow(rows)
        .setName(author)
        .setDesc(colors[author] === undefined ? labels.colorMadeUp : labels.colorChosen)
        .addColorPicker((picker) => picker
          .setValue(colors[author] ?? authorColor(author))
          .onChange((value) => void this.host.saveSettings({ commentAuthorColors: { ...this.host.settings.commentAuthorColors, [author]: value } })))
        .addExtraButton((button) => button
          .setIcon("rotate-ccw")
          .setTooltip(labels.resetColorTooltip)
          .setDisabled(colors[author] === undefined)
          .onClick(() => {
            const { [author]: _dropped, ...rest } = this.host.settings.commentAuthorColors;
            void this.host.saveSettings({ commentAuthorColors: rest }).then(() => this.redisplayInPlace());
          }));
    }
  }

  private slider(
    rows: SettingDefinitionRender[],
    name: string,
    description: string,
    key: keyof typeof SETTING_BOUNDS,
    format: (value: number) => string,
  ): void {
    const bound = SETTING_BOUNDS[key];
    const value = this.host.settings[key];
    const currently = words().settings.currently;
    new SettingsRow(rows).setName(name).setDesc(`${description} ${currently(format(value))}`)
      .configure((setting) => {
        let valueInput: TextComponent | undefined;
        let valueSlider: SliderComponent | undefined;
        setting.addSlider((slider) => {
          valueSlider = slider;
          slider
          .setLimits(bound.min, bound.max, bound.step)
          .setValue(value)
          .onChange((next) => {
            valueInput?.setValue(String(next));
            setting.setDesc(`${description} ${currently(format(next))}`);
            void this.host.saveSettings({ [key]: next });
          });
        });
        if (key === "cardCornerRadius") {
          setting.addText((text) => {
            valueInput = text;
            text.inputEl.addClass("miro-canvas-card-radius-value");
            text.inputEl.setAttribute("inputmode", "decimal");
            text.inputEl.setAttribute("aria-label", name);
            text.setValue(String(value)).onChange((entered) => {
              if (entered.trim() === "") return;
              const number = Number(entered);
              if (!Number.isFinite(number)) return;
              const next = Math.max(bound.min, Math.min(bound.max, number));
              valueSlider?.setValue(next);
              if (number !== next) text.setValue(String(next));
              setting.setDesc(`${description} ${currently(format(next))}`);
              void this.host.saveSettings({ cardCornerRadius: next });
            });
          });
        }
      });
  }
}
