/**
 * The Obsidian-facing settings tab.
 *
 * Everything this tab decides lives in `settings.ts`; the tab itself only
 * renders controls and reports the chosen value, so the bounds and the
 * fallbacks stay testable without an Obsidian runtime.
 */

import { PluginSettingTab, Setting, setIcon, type App, type Plugin } from "obsidian";

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
  readonly settings: MiroCanvasSettings;
  readonly saveSettings: (patch: Partial<MiroCanvasSettings>) => Promise<void>;
  /** Everyone who has written on the open board, for their colours. */
  readonly commentAuthors?: () => readonly string[];
  /** The Obsidian account's name, which signs comments when no name is set. */
  readonly accountName?: () => string | undefined;
  /** Opens the "Import boards from Miro" guide; the same one the first-run question offers. */
  readonly openImportGuide: () => void;
  /** Writes (or opens, if it already exists) the welcome board; the same action the first-run question offers. */
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

export class MiroCanvasSettingTab extends PluginSettingTab {
  private readonly host: SettingsTabHost;

  public constructor(app: App, plugin: Plugin, host: SettingsTabHost) {
    super(app, plugin);
    this.host = host;
  }

  public override display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const labels = words().settings;

    new Setting(containerEl).setName(labels.navigationHeading).setHeading();

    this.slider(containerEl, labels.zoomStepName, labels.zoomStepDesc,
      "zoomStep", (value) => `${Math.round((value - 1) * 100)}%`);

    new Setting(containerEl)
      .setName(labels.zoomToCursorName)
      .setDesc(labels.zoomToCursorDesc)
      .addToggle((toggle) => toggle
        .setValue(this.host.settings.zoomToCursor)
        .onChange((value) => void this.host.saveSettings({ zoomToCursor: value })));

    new Setting(containerEl)
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

    new Setting(containerEl)
      .setName(labels.invertWheelName)
      .addToggle((toggle) => toggle
        .setValue(this.host.settings.invertWheelZoom)
        .onChange((value) => void this.host.saveSettings({ invertWheelZoom: value })));

    this.slider(containerEl, labels.minZoomName, labels.minZoomDesc,
      "minZoom", (value) => `${Math.round(value * 100)}%`);
    this.slider(containerEl, labels.maxZoomName, labels.maxZoomDesc,
      "maxZoom", (value) => `${Math.round(value * 100)}%`);

    new Setting(containerEl).setName(labels.panningHeading).setHeading();

    this.slider(containerEl, labels.panStepName, labels.panStepDesc,
      "panStep", (value) => `${value} px`);
    this.slider(containerEl, labels.fastPanName, labels.fastPanDesc,
      "fastPanMultiplier", (value) => `${value}×`);

    new Setting(containerEl).setName(labels.connectorsHeading).setHeading();
    // Where an end of a line or an arrow may be put down.  Existing
    // connections keep their ends whatever is chosen here.
    for (const [key, title, description] of [
      ["connectorAttachNodes", labels.attachNodesName, labels.attachNodesDesc],
      ["connectorAllowFree", labels.allowFreeName, labels.allowFreeDesc],
      ["connectorAttachConnectors", labels.attachConnectorsName, labels.attachConnectorsDesc],
    ] as const) {
      new Setting(containerEl).setName(title)
        .setDesc(description)
        .addToggle((toggle) => toggle.setValue(this.host.settings[key])
          .onChange((value) => void this.host.saveSettings({ [key]: value })));
    }
    new Setting(containerEl).setName(labels.lassoGestureName)
      .setDesc(labels.lassoGestureDesc)
      .addDropdown(dropdown => {
        for (const chord of POINTER_BINDINGS) dropdown.addOption(chord, pointerBindingLabel(chord));
        dropdown.setValue(this.host.settings.lassoBinding).onChange(value => void this.host.saveSettings({ lassoBinding: value as PointerBinding }));
      });
    for (const [key, title, description] of [
      ["panBinding", labels.panGestureName, labels.panGestureDesc],
      ["lineBinding", labels.lineGestureName, labels.lineGestureDesc],
    ] as const) {
      new Setting(containerEl).setName(title).setDesc(description).addDropdown(dropdown => {
        for (const chord of POINTER_BINDINGS) dropdown.addOption(chord, pointerBindingLabel(chord));
        dropdown.setValue(this.host.settings[key]).onChange(value => void this.host.saveSettings({ [key]: value as PointerBinding }));
      });
    }

    this.slider(containerEl, labels.magnetName, labels.magnetDesc,
      "connectorMagnet", (value) => `${value} px`);
    this.slider(containerEl, labels.snapName, labels.snapDesc,
      "connectorSnap", (value) => `${value} px`);
    this.slider(containerEl, labels.labelPositionName, labels.labelPositionDesc,
      "connectorLabelPosition", (value) => `${Math.round(value * 100)}%`);

    new Setting(containerEl).setName(labels.keyboardHeading).setHeading();

    new Setting(containerEl)
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

    new Setting(containerEl)
      .setName(labels.interfaceName)
      .setDesc(labels.interfaceDesc)
      .setHeading();

    new Setting(containerEl)
      .setName(labels.minimapDefaultName)
      .addToggle((toggle) => toggle
        .setValue(this.host.settings.minimapVisible)
        .onChange((value) => void this.host.saveSettings({ minimapVisible: value })));

    new Setting(containerEl)
      .setName(labels.toolbarName)
      .setDesc(labels.toolbarDesc)
      .addToggle((toggle) => toggle
        .setValue(this.host.settings.selectionToolbarEnabled)
        .onChange((value) => void this.host.saveSettings({ selectionToolbarEnabled: value })));

    this.toolBar(containerEl);
    this.comments(containerEl);

    const importLabels = words().importGuide;
    new Setting(containerEl).setName(importLabels.settingsHeading).setHeading();
    new Setting(containerEl)
      .addButton((button) => button
        .setButtonText(importLabels.createWelcomeBoardButton)
        .setCta()
        .onClick(() => this.host.createWelcomeBoard()));
    new Setting(containerEl)
      .addButton((button) => button
        .setButtonText(importLabels.openGuideButton)
        .onClick(() => this.host.openImportGuide()));

    this.fonts(containerEl);
    this.updates(containerEl);

    new Setting(containerEl)
      .setName(labels.developerDiagnosticsName)
      .setDesc(labels.developerDiagnosticsDesc)
      .addToggle((toggle) => toggle
        .setValue(this.host.settings.developerDiagnostics)
        .onChange((value) => void this.host.saveSettings({ developerDiagnostics: value })));
  }

  /**
   * "Fonts": downloadable packs with Download/Remove and progress, a custom
   * font file, and the person's own pool - which families the toolbar's
   * font list offers, and in what order.  Nothing here is downloaded
   * without a press (QUAL-003); the line under the heading says so.
   */
  private fonts(containerEl: HTMLElement): void {
    const labels = words().fonts;
    new Setting(containerEl).setName(labels.heading).setDesc(labels.networkLine).setHeading();

    const locale = currentLocale();
    for (const pack of this.host.fontPackCatalogue) {
      const installed = this.host.settings.fontPacks.includes(pack.id);
      const megabytes = (pack.bytes / (1024 * 1024)).toFixed(1);
      const setting = new Setting(containerEl)
        .setName(pack.title[locale] ?? pack.title.en)
        .setDesc(`${pack.description[locale] ?? pack.description.en} ${labels.sizeMB(megabytes)}`);
      const status = setting.descEl.createDiv({ cls: "miro-canvas-fontpack-status" });
      setting.addButton((button) => {
        button.setButtonText(installed ? labels.removeButton : labels.downloadButton);
        if (installed) {
          button.setWarning();
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
    }

    new Setting(containerEl)
      .addButton((button) => button
        .setButtonText(labels.addCustomFontButton)
        .onClick(() => void this.host.addCustomFont().then(() => this.redisplayInPlace())));
    for (const custom of this.host.settings.customFonts) {
      new Setting(containerEl)
        .setName(custom.file)
        .addText((text) => text
          .setValue(custom.family)
          .onChange((value) => void this.host.renameCustomFont(custom.file, value)))
        .addExtraButton((extra) => extra
          .setIcon("trash-2")
          .setTooltip(labels.removeCustomFontTooltip)
          .onClick(() => void this.host.removeCustomFont(custom.file).then(() => this.redisplayInPlace())));
    }

    new Setting(containerEl).setName(labels.poolHeading).setDesc(labels.poolDesc);
    const pool = this.host.settings.fontList;
    // Each row writes its family's name in that family's own face.
    this.host.wantFonts(pool.map((entry) => entry.family));
    pool.forEach((entry, index) => {
      const setting = new Setting(containerEl).setName(entry.family);
      setting.nameEl.style.setProperty("font-family", fontStack(entry.family));
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
  private updates(containerEl: HTMLElement): void {
    const labels = words().updates;
    new Setting(containerEl).setName(labels.heading).setHeading();
    new Setting(containerEl)
      .setName(labels.autoName)
      .setDesc(labels.autoDesc)
      .addToggle((toggle) => toggle
        .setValue(this.host.settings.checkUpdatesAutomatically)
        .onChange((value) => void this.host.saveSettings({ checkUpdatesAutomatically: value })));
    const setting = new Setting(containerEl).setName(labels.checkName).setDesc(labels.checkDesc(this.host.pluginVersion));
    const status = setting.descEl.createDiv({ cls: "miro-canvas-update-status" });
    setting.addButton((button) => button
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
  }

  /**
   * The bottom tool bar: every item, on the bar or under More, with a toggle
   * for "on the bar" and up/down buttons that reorder the ones on it.  The
   * list shows the bar's own items first, in their order, then the rest in
   * `ALL_TOOLBAR_ITEMS` order; changing anything rebuilds this same list so
   * moving an item always shows where it landed.
   */
  private toolBar(containerEl: HTMLElement): void {
    const labels = words().settings;
    new Setting(containerEl).setName(labels.toolBarHeading).setDesc(labels.toolBarDesc).setHeading();
    new Setting(containerEl).setDesc(labels.toolBarArrangeHint);
    new Setting(containerEl)
      .addButton((button) => button
        .setButtonText(labels.toolBarReset)
        .onClick(() => void this.host.saveSettings({ toolbarItems: DEFAULT_TOOLBAR_ITEMS }).then(() => this.redisplayInPlace())));
    const current = this.host.settings.toolbarItems;
    const onBar = new Set(current);
    const listed: readonly ToolbarItem[] = [...current, ...ALL_TOOLBAR_ITEMS.filter((item) => !onBar.has(item))];
    for (const item of listed) {
      const position = current.indexOf(item);
      const setting = new Setting(containerEl).setName(toolbarItemLabel(item));
      const icon = setting.nameEl.createSpan({ cls: "miro-canvas-settings-tool-icon" });
      setting.nameEl.prepend(icon);
      paintToolbarIcon(icon, item, containerEl.ownerDocument, (element, name) => setIcon(element, name));
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
            [next[position - 1], next[position]] = [next[position]!, next[position - 1]!];
            void this.host.saveSettings({ toolbarItems: next }).then(() => this.redisplayInPlace());
          }))
        .addExtraButton((extra) => extra
          .setIcon("arrow-down")
          .setTooltip(labels.toolBarMoveDown)
          .setDisabled(position === -1 || position === current.length - 1)
          .onClick(() => {
            const next = [...current];
            [next[position], next[position + 1]] = [next[position + 1]!, next[position]!];
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
    this.display();
    this.containerEl.scrollTop = top;
  }

  /** Who signs the comments written here, and the colour each author's pins wear. */
  private comments(containerEl: HTMLElement): void {
    const labels = words().settings;
    new Setting(containerEl).setName(labels.commentsHeading).setHeading();
    const account = this.host.accountName?.();
    new Setting(containerEl)
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
      new Setting(containerEl).setName(labels.authorColorsName).setDesc(labels.authorColorsDesc);
      return;
    }
    for (const author of authors) {
      new Setting(containerEl)
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
    container: HTMLElement,
    name: string,
    description: string,
    key: keyof typeof SETTING_BOUNDS,
    format: (value: number) => string,
  ): void {
    const bound = SETTING_BOUNDS[key];
    const setting = new Setting(container).setName(name).setDesc(description);
    const value = this.host.settings[key];
    const currently = words().settings.currently;
    setting.addSlider((slider) => slider
      .setLimits(bound.min, bound.max, bound.step)
      .setValue(value)
      .setDynamicTooltip()
      .onChange((next) => {
        setting.setDesc(`${description} ${currently(format(next))}`);
        void this.host.saveSettings({ [key]: next } as Partial<MiroCanvasSettings>);
      }));
    setting.setDesc(`${description} ${currently(format(value))}`);
  }
}
