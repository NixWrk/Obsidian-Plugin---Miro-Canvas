import * as obsidian from "obsidian";
import { MarkdownRenderer, Menu, Modal, Notice, Platform, Plugin, TFile, normalizePath, requestUrl, setIcon, type Events, type WorkspaceLeaf } from "obsidian";

import { DEFAULT_FONT_FAMILY, OFFERED_FONT_FAMILIES, normalizeFontFamily } from "./appearance";
import {
  inspectAdvancedCanvas,
  inspectCanvasView,
  type AdvancedCanvasInspection,
  type CanvasSessionInspection,
} from "./canvas-session";
import { MetadataWriter, type MetadataWriteResult } from "./metadata-writer";
import {
  createObsidianMetadataStore,
  type ObsidianMetadataStoreProbe,
} from "./obsidian-metadata-store";
import { M1CanvasSession } from "./m1-session";
import { M2CanvasTools, type InitialCommentTarget } from "./m2-tools";
import { createObsidianDocumentHost } from "./obsidian-document-host";
import { buildImportGuide, openExternalLink, vaultFolderPath, type ImportGuideActions } from "./import-guide";
import { FONT_PACK_CATALOGUE } from "./font-pack-catalogue";
import {
  FontFaceRegistry,
  FontPackDownloadError,
  downloadFontPack,
  readInstalledPackManifest,
  type CustomFontDefinition,
  type FontFacePackDefinition,
  type FontPackManifest,
  type FontPackProgress,
} from "./font-packs";
import {
  DEFAULT_SETTINGS,
  addToFontList,
  moveFontListEntry,
  navigationCommands,
  normalizeSettings,
  obsidianAccountName,
  removeFromFontList,
  shouldAskImportQuestion,
  type MiroCanvasSettings,
  type PanDirection,
} from "./settings";
import { MiroCanvasSettingTab } from "./settings-tab";
import { setAuthorColors } from "./comment-thread";
import { layerActions } from "./layer-order";
import { localeFor, setLocale, words } from "./i18n";
import { createWelcomeBoard } from "./welcome-board";
import { automaticCheckDue, checkForUpdate, isNewerVersion, type ReleaseRequest, type UpdateCheck } from "./update-check";

const NATIVE_CANVAS_VIEW_TYPE = "canvas";

/** A font file's own name, safe on every filesystem the plugin's vaults run on. */
function sanitizeFontFileName(name: string): string {
  const cleaned = name.replace(/[/\\:*?"<>|\u0000-\u001f]/gu, "_").trim();
  return cleaned === "" ? "font" : cleaned.slice(0, 180);
}

/** The chosen name, or the same name with a counter where it is already taken. */
function uniqueFontFileName(name: string, taken: ReadonlySet<string>): string {
  if (!taken.has(name)) return name;
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : "";
  for (let index = 2; ; index += 1) {
    const candidate = `${stem} (${index})${extension}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * The language Obsidian shows itself in.  `getLanguage` arrived in Obsidian
 * 1.8; before it, Obsidian kept its choice in local storage.
 */
function obsidianLanguage(): string | null {
  const getLanguage = (obsidian as { getLanguage?: () => string }).getLanguage;
  if (typeof getLanguage === "function") {
    try {
      return getLanguage();
    } catch {
      // Fall back to where older Obsidian kept its choice.
    }
  }
  try {
    return window.localStorage.getItem("language");
  } catch {
    return null;
  }
}
const LAYER_MENU_SECTION = "miro-canvas-layer";

/**
 * Put a section of ours just before a menu's "danger" section, so deleting
 * stays the last thing a native Canvas menu offers.  A menu orders its
 * sections as it first meets them, which would put ours after it.
 */
function placeBeforeDanger(menu: Menu, section: string): void {
  const items = (menu as unknown as { items?: unknown }).items;
  const addSections = (menu as unknown as { addSections?: unknown }).addSections;
  if (!Array.isArray(items) || typeof addSections !== "function") return;
  const order: string[] = [];
  for (const item of items) {
    const name = (item as { section?: unknown } | null)?.section;
    if (typeof name === "string" && name !== "" && name !== section && !order.includes(name)) order.push(name);
  }
  const danger = order.indexOf("danger");
  order.splice(danger < 0 ? order.length : danger, 0, section);
  Reflect.apply(addSections, menu, [order]);
}

function isNativeCanvasView(view: unknown): boolean {
  if (view === null || (typeof view !== "object" && typeof view !== "function")) {
    return false;
  }

  try {
    const getViewType = (view as { getViewType?: unknown }).getViewType;
    return typeof getViewType === "function" && Reflect.apply(getViewType, view, []) === NATIVE_CANVAS_VIEW_TYPE;
  } catch {
    return false;
  }
}

/**
 * The shell intentionally has no file or network side effects on startup.
 * It probes Advanced Canvas once and reads a native Canvas document only when
 * the active leaf is a Canvas.  All inspection is delegated to read-only
 * adapters; no Canvas save or viewport mutation is part of this lifecycle.
 */
export default class MiroCanvasPlugin extends Plugin {
  private statusBarItem: HTMLElement | null = null;
  private shellDisposed = false;
  private advancedInspection: AdvancedCanvasInspection | null = null;
  private canvasInspection: CanvasSessionInspection | null = null;
  private metadataStoreProbe: ObsidianMetadataStoreProbe | null = null;
  private metadataWriter: MetadataWriter | null = null;
  private currentCanvasView: unknown = null;
  private m1Session: M1CanvasSession | null = null;
  private toolsModal: Modal | null = null;
  private importGuideModal: Modal | null = null;
  /** The status bar's mark while a newer release is known; absent otherwise. */
  private updateIndicator: HTMLElement | undefined;
  private initializationRetry: ReturnType<typeof setTimeout> | null = null;
  public canvasSettings: MiroCanvasSettings = DEFAULT_SETTINGS;
  /** The `<style>` this plugin owns in every window's head; loads a family's faces lazily, only once something wants it. */
  private readonly fontFaces = new FontFaceRegistry();
  /** The installed packs' manifests, kept for the font-face catalog and for what a removal drops from the pool. */
  private installedFontPackManifests: readonly FontPackManifest[] = [];

  override async onload(): Promise<void> {
    // Every word below, command names included, is in Obsidian's own language.
    setLocale(localeFor(obsidianLanguage()));
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- the tab host reads settings lazily.
    const self = this;
    this.shellDisposed = false;
    // A stored settings file is user-editable and may predate this release,
    // so it is normalized rather than trusted.
    this.canvasSettings = normalizeSettings(await this.loadData());
    setAuthorColors(this.canvasSettings.commentAuthorColors);
    // Every window that can show a Canvas gets the plugin's own font-face
    // sheet; a popout gets one as it opens, and loses it as it closes.  A
    // face's bytes are read only once something wants that family.
    this.fontFaces.setFileReader((path) => this.app.vault.adapter.readBinary(path));
    this.fontFaces.attach(document);
    this.registerEvent(this.app.workspace.on("window-open", (_win, openedWindow) => this.fontFaces.attach(openedWindow.document)));
    this.registerEvent(this.app.workspace.on("window-close", (_win, closedWindow) => this.fontFaces.detach(closedWindow.document)));
    await this.loadFontPacks();
    this.addSettingTab(new MiroCanvasSettingTab(this.app, this, {
      get settings(): MiroCanvasSettings { return self.canvasSettings; },
      saveSettings: (patch) => this.saveCanvasSettings(patch),
      commentAuthors: () => this.m1Session?.commentAuthors() ?? [],
      accountName: () => obsidianAccountName(window.localStorage),
      openImportGuide: () => this.openImportGuide(),
      createWelcomeBoard: () => this.openWelcomeBoard(),
      pluginVersion: this.manifest.version,
      checkForUpdate: () => this.checkForUpdates(),
      fontPackCatalogue: FONT_PACK_CATALOGUE,
      downloadFontPack: (id, onProgress) => this.downloadFontPackAction(id, onProgress),
      removeFontPack: (id) => this.removeFontPackAction(id),
      addCustomFont: () => this.addCustomFontAction(),
      removeCustomFont: (file) => this.removeCustomFontAction(file),
      renameCustomFont: (file, family) => this.renameCustomFontAction(file, family),
      setFontShown: (family, shown) => this.saveCanvasSettings({
        fontList: this.canvasSettings.fontList.map((entry) => (entry.family === family ? { ...entry, shown } : entry)),
      }),
      moveFontInList: (family, direction) => this.saveCanvasSettings({
        fontList: moveFontListEntry(this.canvasSettings.fontList, family, direction),
      }),
      wantFonts: (families) => this.fontFaces.want(families),
    }));
    // Advanced Canvas is optional.  Its adapter fails closed, so this probe
    // cannot prevent the native Canvas shell from loading.
    this.advancedInspection = inspectAdvancedCanvas(this.app);

    const statusBarItem = this.addStatusBarItem();
    statusBarItem.addClass("miro-canvas-status");
    statusBarItem.setAttribute(
      "aria-label",
      words().shell.statusAriaLabel
    );
    this.statusBarItem = statusBarItem;
    // Register cleanup as soon as the shell owns a DOM element. This also
    // covers a partially loaded plugin if a later registration throws.
    this.register(() => this.disposeShell());

    this.addCommand({
      id: "show-status",
      name: words().commands.showStatus,
      callback: () => this.showStatus(),
    });

    this.addCommand({
      id: "initialize-metadata",
      name: words().commands.initializeMetadata,
      checkCallback: (checking) => {
        const writer = this.ensureMetadataWriter();
        if (!writer) {
          return false;
        }
        if (!checking) {
          this.runMetadataAction(
            writer.write("initialize-metadata", () => undefined),
          );
        }
        return true;
      },
    });

    // M1 commands are scoped to the active native Canvas.  The command
    // callbacks never touch the document directly; M1CanvasSession routes
    // explicit mutations through MetadataWriter and camera actions through
    // its safe viewport controller.
    this.addCommand({
      id: "m1-commands",
      name: words().commands.openControls,
      checkCallback: (checking) => {
        const session = this.activeM1Session();
        if (!session) {
          return false;
        }
        if (!checking) {
          session.openCommands();
        }
        return true;
      },
    });
    this.addCommand({
      id: "local-tools",
      name: words().commands.localTools,
      checkCallback: (checking) => this.runM1Command(checking, (session) => this.openLocalTools(session)),
    });
    this.addCommand({
      id: "source-provenance-inspector",
      name: words().commands.sourceInspector,
      checkCallback: (checking) => this.runM1Command(checking, (session) => session.openSourceInspector()),
    });
    this.addCommand({
      id: "m1-theme-system",
      name: words().commands.themeSystem,
      checkCallback: (checking) => this.runM1Command(checking, (session) => session.setTheme("system")),
    });
    this.addCommand({
      id: "m1-theme-light",
      name: words().commands.themeLight,
      checkCallback: (checking) => this.runM1Command(checking, (session) => session.setTheme("light")),
    });
    this.addCommand({
      id: "m1-theme-dark",
      name: words().commands.themeDark,
      checkCallback: (checking) => this.runM1Command(checking, (session) => session.setTheme("dark")),
    });
    this.addCommand({
      id: "m1-toggle-review-mode",
      name: words().commands.toggleReviewMode,
      checkCallback: (checking) => this.runM1Command(checking, (session) => session.toggleReviewMode()),
    });
    this.addCommand({
      id: "m1-lock-selection",
      name: words().commands.lockSelection,
      checkCallback: (checking) => this.runM1Command(checking, (session) => session.lockSelection()),
    });
    this.addCommand({
      id: "m1-unlock-selection",
      name: words().commands.unlockSelection,
      checkCallback: (checking) => this.runM1Command(checking, (session) => session.unlockSelection()),
    });
    // Only cards have layers, so the commands are offered only with a card
    // selected.  No default hotkeys: Obsidian's editor uses the bracket keys,
    // and a board's keys are the user's to assign.
    for (const action of layerActions()) {
      this.addCommand({
        id: `layer-${action.direction}`,
        name: action.label,
        checkCallback: (checking) => {
          const session = this.activeM1Session();
          if (session === null || session.layeredCards().length === 0) {
            return false;
          }
          if (!checking) {
            session.changeLayer(action.direction);
          }
          return true;
        },
      });
    }
    // Native Canvas's own menus for a card and for a selection offer the
    // layer order as well; a frame's or a line's menu does not, as neither
    // has a layer.  Obsidian's typings do not name the Canvas menu events.
    const workspaceEvents: Events = this.app.workspace;
    this.registerEvent(workspaceEvents.on("canvas:node-menu", (menu: unknown, node: unknown) => {
      const id = (node as { id?: unknown } | null)?.id;
      if (typeof id === "string") this.addLayerItems(menu, [id]);
    }));
    this.registerEvent(workspaceEvents.on("canvas:selection-menu", (menu: unknown) => {
      this.addLayerItems(menu);
    }));
    // Registered without default hotkeys so Obsidian's own editor can bind
    // them and nothing is taken from the user or another plugin.
    for (const command of navigationCommands()) {
      this.addCommand({
        id: command.id,
        name: command.name,
        checkCallback: (checking) => this.runM1Command(checking, (session) => {
          const direction = command.id.startsWith("m1-pan-")
            ? command.id.slice("m1-pan-".length) as PanDirection
            : undefined;
          if (direction !== undefined) {
            session.pan(direction);
            return;
          }
          session.navigate(command.id.slice("m1-".length) as
            "zoom-in" | "zoom-out" | "zoom-reset" | "zoom-fit" | "toggle-minimap");
        }),
      });
    }

    this.addCommand({
      id: "m1-describe-selection",
      name: words().commands.describeSelection,
      checkCallback: (checking) => this.runM1Command(checking, (session) => {
        const description = session.describeSelection();
        // A notice can be copied out of, which a panel line cannot.
        new Notice(description, 20000);
        console.info(`[miro-canvas] ${description}`);
      }),
    });
    this.addCommand({
      id: "migrate-line-nodes",
      name: words().commands.migrateLines,
      checkCallback: checking => this.runM1Command(checking, session => session.migrateLines()),
    });
    this.addCommand({
      id: "reset-tools",
      name: words().commands.resetTools,
      // No default hotkey: Obsidian would take Escape from every card being
      // written, every label and every field.  The board resets on Escape itself.
      checkCallback: checking => this.runM1Command(checking,session=>session.resetTools()),
    });

    this.addCommand({
      id: "m1-toggle-attachment-names",
      name: words().commands.toggleAttachmentNames,
      checkCallback: (checking) => this.runM1Command(checking, (session) => session.toggleAttachmentNames()),
    });
    this.addCommand({
      id: "m1-zoom-in",
      name: words().commands.zoomIn,
      checkCallback: (checking) => this.runM1Command(checking, (session) => session.navigate("zoom-in")),
    });
    this.addCommand({
      id: "m1-zoom-out",
      name: words().commands.zoomOut,
      checkCallback: (checking) => this.runM1Command(checking, (session) => session.navigate("zoom-out")),
    });
    this.addCommand({
      id: "m1-zoom-reset",
      name: words().commands.zoomReset,
      checkCallback: (checking) => this.runM1Command(checking, (session) => session.navigate("zoom-reset")),
    });
    this.addCommand({
      id: "m1-fit-board",
      name: words().commands.fitBoard,
      checkCallback: (checking) => this.runM1Command(checking, (session) => session.navigate("zoom-fit")),
    });
    this.addCommand({
      id: "m1-toggle-minimap",
      name: words().commands.toggleMinimap,
      checkCallback: (checking) => this.runM1Command(checking, (session) => session.navigate("toggle-minimap")),
    });

    this.registerEvent(
      this.app.workspace.on(
        "active-leaf-change",
        this.handleActiveLeafChange
      )
    );
    // A Canvas view can be reused for another file, or finish constructing its
    // private runtime after active-leaf-change. Never bind permanently to the
    // half-initialized object or carry a previous file's review overlay across.
    this.registerEvent(this.app.workspace.on("file-open", () => this.handleActiveLeafChange(this.app.workspace.activeLeaf)));
    this.registerEvent(this.app.workspace.on("layout-change", () => {
      const currentClosed = this.currentCanvasView !== null && !this.currentCanvasStillOpen();
      if (currentClosed || this.m1Session?.status !== "ready") {
        this.handleActiveLeafChange(this.app.workspace.activeLeaf);
      }
    }));
    this.handleActiveLeafChange(this.app.workspace.activeLeaf);
    // Asked once, after Obsidian's own startup has settled; a plugin-only
    // person can decline it without ever seeing Miro mentioned again outside
    // the settings tab's own button.
    this.app.workspace.onLayoutReady(() => {
      this.maybeAskImportQuestion();
      void this.checkForUpdatesAtStart();
    });
  }

  override onunload(): void {
    this.disposeShell();
    this.fontFaces.dispose();
  }

  private readonly handleActiveLeafChange = (
    leaf: WorkspaceLeaf | null,
    attempt = 0,
  ): void => {
    if (this.shellDisposed) return;
    if (this.initializationRetry !== null) clearTimeout(this.initializationRetry);
    this.initializationRetry = null;
    const view = leaf?.view;
    if (!isNativeCanvasView(view)) {
      if (this.currentCanvasStillOpen()) return;
      this.toolsModal?.close();
      this.m1Session?.dispose();
      this.m1Session = null;
      this.canvasInspection = null;
      this.metadataStoreProbe = null;
      this.metadataWriter = null;
      this.currentCanvasView = null;
      this.updateStatus(false);
      return;
    }

    this.toolsModal?.close();
    this.m1Session?.dispose();
    this.m1Session = null;
    this.currentCanvasView = view;
    this.canvasInspection = inspectCanvasView(view);
    this.metadataStoreProbe = createObsidianMetadataStore(view);
    this.metadataWriter = this.metadataStoreProbe.store
      ? new MetadataWriter(this.metadataStoreProbe.store)
      : null;
    this.m1Session = new M1CanvasSession(view, this.metadataWriter, {
      onNotice: (message) => new Notice(message),
      onStateChange: () => this.updateStatus(true),
      setIcon: (element, icon) => setIcon(element, icon),
      onOpenSettings: () => this.openOwnSettings(),
      onConnectorMenu: (event, run) => {
        // The clipboard and danger sections of native Canvas's selection menu.
        const menu = new Menu();
        const connectorMenuLabels = words().shell.connectorMenu;
        for (const [action, title, icon] of [
          ["cut", connectorMenuLabels.cut, "lucide-scissors"],
          ["copy", connectorMenuLabels.copy, "lucide-copy"],
          ["paste", connectorMenuLabels.paste, "lucide-clipboard-check"],
        ] as const) {
          menu.addItem((item) => item.setTitle(title).setIcon(icon).setSection("clipboard").onClick(() => run(action)));
        }
        menu.addItem((item) => item.setTitle(connectorMenuLabels.delete).setIcon("lucide-trash-2").setSection("danger").onClick(() => run("delete")));
        menu.showAtMouseEvent(event);
      },
      onOpenCommentThread: (threadId, origin) => {
        const session = this.activeM1Session();
        if (session !== null) this.openLocalTools(session, { threadId, origin });
      },
      // A card, a label or the toolbar's own font list naming a family is
      // the one signal that family's bytes are worth reading.
      onFontUsed: (family) => this.fontFaces.want([family]),
      settings: this.canvasSettings,
      ...(this.metadataStoreProbe?.store !== undefined ? {} : {
        persistenceProblem: this.metadataStoreProbe?.diagnostics
          .map((item) => item.message).join(" ") || "no native Canvas runtime was found.",
      }),
    });
    const mounted = this.m1Session.mount();
    this.updateStatus(true);
    // A Canvas leaf can mount before its runtime exposes the data and save
    // members the metadata store needs.  Mounting alone is therefore not
    // enough: without persistence every write is refused, so keep probing.
    if ((!mounted || this.metadataWriter === null) && attempt < 20) {
      this.initializationRetry = setTimeout(() => {
        this.initializationRetry = null;
        if (this.app.workspace.activeLeaf === leaf) this.handleActiveLeafChange(leaf, attempt + 1);
      }, 250);
    }
  };

  private currentCanvasStillOpen(): boolean {
    return this.currentCanvasView !== null
      && this.app.workspace.getLeavesOfType(NATIVE_CANVAS_VIEW_TYPE)
        .some((leaf) => leaf.view === this.currentCanvasView);
  }

  /** Persist a settings change and rebuild the session so it takes effect. */
  public async saveCanvasSettings(patch: Partial<MiroCanvasSettings>): Promise<void> {
    this.canvasSettings = normalizeSettings({ ...this.canvasSettings, ...patch });
    setAuthorColors(this.canvasSettings.commentAuthorColors);
    await this.saveData(this.canvasSettings);
    const leaf = this.app.workspace.activeLeaf;
    if (this.m1Session !== null && leaf !== null && leaf !== undefined) {
      this.handleActiveLeafChange(leaf);
    }
  }

  /** A settings change that needs no rebuilt session: when updates were last checked. */
  private async saveSettingsQuietly(patch: Partial<MiroCanvasSettings>): Promise<void> {
    this.canvasSettings = normalizeSettings({ ...this.canvasSettings, ...patch });
    await this.saveData(this.canvasSettings);
  }

  /** Once a day at start, unless turned off, ask GitHub whether a newer release is out. */
  private async checkForUpdatesAtStart(): Promise<void> {
    this.showUpdateIndicator();
    const settings = this.canvasSettings;
    if (!automaticCheckDue(settings.checkUpdatesAutomatically, settings.lastUpdateCheck, Date.now())) return;
    const known = settings.availableUpdate?.version;
    const result = await this.checkForUpdates();
    // A phone has no status bar: a newer release found now is said once.
    if (Platform.isMobile && result.kind === "newer" && result.version !== known) {
      new Notice(words().updates.mobileNotice(result.version), 10_000);
    }
  }

  /** Ask GitHub now; remember a newer release and show it in the corner. */
  private async checkForUpdates(): Promise<UpdateCheck> {
    const request: ReleaseRequest = async (url) => {
      const response = await requestUrl({ url, throw: false });
      let json: unknown;
      try {
        json = response.json;
      } catch {
        // Not JSON: the check reports that it failed.
      }
      return { status: response.status, json };
    };
    const result = await checkForUpdate(request, this.manifest.version);
    if (this.shellDisposed) return result;
    await this.saveSettingsQuietly({
      lastUpdateCheck: Date.now(),
      ...(result.kind === "newer" ? { availableUpdate: { version: result.version, url: result.url, notes: result.notes } } : {}),
      ...(result.kind === "current" || result.kind === "unpublished" ? { availableUpdate: undefined } : {}),
    });
    this.showUpdateIndicator();
    return result;
  }

  /** The mark in the status bar's corner while a newer release than this one is known. */
  private showUpdateIndicator(): void {
    const update = this.canvasSettings.availableUpdate;
    if (update === undefined || !isNewerVersion(update.version, this.manifest.version)) {
      this.updateIndicator?.remove();
      this.updateIndicator = undefined;
      return;
    }
    if (this.updateIndicator === undefined) {
      const item = this.addStatusBarItem();
      item.addClasses(["miro-canvas-update", "mod-clickable"]);
      this.registerDomEvent(item, "click", () => this.openUpdateNotes());
      this.updateIndicator = item;
    }
    const item = this.updateIndicator;
    item.empty();
    setIcon(item.createSpan({ cls: "miro-canvas-update__icon" }), "arrow-up-circle");
    item.createSpan({ text: words().updates.indicator(update.version) });
    item.setAttribute("aria-label", words().updates.indicatorTooltip);
  }

  /** What the newer release changed, in its own words, and where to get it. */
  private openUpdateNotes(): void {
    const update = this.canvasSettings.availableUpdate;
    if (update === undefined) return;
    const labels = words().updates;
    const modal = new Modal(this.app);
    modal.setTitle(labels.modalTitle(update.version));
    const notes = modal.contentEl.createDiv({ cls: "miro-canvas-update-notes" });
    if (update.notes === "") notes.createEl("p", { text: labels.noNotes });
    else void MarkdownRenderer.render(this.app, update.notes, notes, "", this);
    modal.contentEl.createEl("p", { text: labels.howToUpdate });
    const buttons = modal.contentEl.createDiv({ cls: "modal-button-container" });
    buttons.createEl("button", { text: labels.openRelease, cls: "mod-cta" }).addEventListener("click", () => {
      openExternalLink(update.url);
      modal.close();
    });
    buttons.createEl("button", { text: labels.later }).addEventListener("click", () => modal.close());
    modal.open();
  }

  /** Obsidian's settings, open on this plugin's page. */
  private openOwnSettings(): void {
    const setting = (this.app as unknown as {
      setting?: { open?: () => void; openTabById?: (id: string) => void };
    }).setting;
    setting?.open?.();
    setting?.openTabById?.(this.manifest.id);
  }

  private activeM1Session(): M1CanvasSession | null {
    const view = this.app.workspace.activeLeaf?.view;
    return this.m1Session !== null && view === this.currentCanvasView
      ? this.m1Session
      : null;
  }

  /** The four layer actions in a native Canvas menu, when what it is for holds a card. */
  private addLayerItems(menu: unknown, ids?: readonly string[]): void {
    const session = this.activeM1Session();
    if (session === null || !(menu instanceof Menu)) return;
    session.refresh();
    if (session.layeredCards(ids).length === 0) return;
    for (const action of layerActions()) {
      menu.addItem((item) => item
        .setTitle(action.label)
        .setIcon(action.icon)
        .setSection(LAYER_MENU_SECTION)
        .onClick(() => session.changeLayer(action.direction, ids)));
    }
    placeBeforeDanger(menu, LAYER_MENU_SECTION);
  }

  private runM1Command(checking: boolean, callback: (session: M1CanvasSession) => void): boolean {
    const session = this.activeM1Session();
    if (!session) {
      return false;
    }
    if (!checking) {
      session.refresh();
      callback(session);
    }
    return true;
  }

  /** The first-run welcome question; never asked twice. */
  private maybeAskImportQuestion(): void {
    if (this.shellDisposed || !shouldAskImportQuestion(this.canvasSettings)) return;
    this.openImportQuestion();
  }

  private openImportQuestion(): void {
    const strings = words().importGuide;
    const modal = new Modal(this.app);
    modal.modalEl.classList.add("miro-canvas-import-question-modal");
    modal.setTitle(strings.questionTitle);
    modal.contentEl.createEl("p", { text: strings.questionBody1 });
    modal.contentEl.createEl("p", { text: strings.questionBody2 });
    const buttons = modal.contentEl.createDiv({ cls: "miro-canvas-import-question__buttons" });
    const openWelcomeBoard = buttons.createEl("button", { text: strings.openWelcomeBoardButton, cls: "mod-cta" });
    openWelcomeBoard.addEventListener("click", () => {
      modal.close();
      this.openWelcomeBoard();
    });
    const showMeHow = buttons.createEl("button", { text: strings.showMeHow });
    showMeHow.addEventListener("click", () => {
      modal.close();
      this.openImportGuide();
    });
    buttons.createEl("button", { text: strings.notNow }).addEventListener("click", () => modal.close());
    modal.contentEl.createEl("p", { text: strings.notNowNote, cls: "miro-canvas-import-question__note" });
    // Every button closes the modal, and so does the native close control or
    // Escape; onClose is the one place that records an answer, so the
    // question is put once regardless of how a person leaves it.
    modal.onClose = () => void this.saveCanvasSettings({ importQuestionAnswered: true });
    modal.open();
  }

  /** The same welcome board the first-run question and the settings tab's button write and open. */
  private openWelcomeBoard(): void {
    void createWelcomeBoard({ app: this.app, isFile: (value): value is TFile => value instanceof TFile, normalizePath }).catch(
      () => new Notice(words().importGuide.createWelcomeBoardFailed),
    );
  }

  /** The same guide the first-run question and the settings tab's button open. */
  private openImportGuide(): void {
    this.importGuideModal?.close();
    const modal = new Modal(this.app);
    this.importGuideModal = modal;
    modal.modalEl.classList.add("miro-canvas-import-guide-modal");
    modal.setTitle(words().importGuide.guideTitle);
    const actions: ImportGuideActions = {
      onOpenLink: (url) => openExternalLink(url),
      onCopy: (text) => {
        void navigator.clipboard.writeText(text).then(
          () => new Notice(words().importGuide.copied),
          () => new Notice(words().importGuide.copyFailed),
        );
      },
    };
    const content = buildImportGuide(actions, {
      document: modal.contentEl.ownerDocument,
      setIcon: (element, icon) => setIcon(element, icon),
      platform: Platform,
      vaultPath: vaultFolderPath(this.app.vault.adapter, this.app.vault.getName()),
    });
    modal.contentEl.append(content);
    modal.onClose = () => {
      if (this.importGuideModal === modal) this.importGuideModal = null;
    };
    modal.open();
  }

  private openLocalTools(session: M1CanvasSession, initialComment?: InitialCommentTarget): void {
    this.toolsModal?.close();
    const modal = new Modal(this.app);
    this.toolsModal = modal;
    modal.modalEl.classList.add("miro-canvas-local-tools-modal");
    modal.contentEl.classList.add("miro-canvas-local-tools-modal__content");
    // Opened from a comment, the dialog is the comments panel and nothing
    // else: the shape, anchor, connector and layer tools have no part in it.
    const commentsOnly = initialComment !== undefined;
    if (commentsOnly) modal.modalEl.classList.add("miro-canvas-local-tools-modal--comments");
    modal.setTitle(commentsOnly ? words().shell.commentsModalTitle : words().shell.localToolsTitle);
    const tools = new M2CanvasTools(session, createObsidianDocumentHost(
      this.app, (message) => new Notice(message), (value): value is TFile => value instanceof TFile,
    ), modal.contentEl.ownerDocument, initialComment);
    if (commentsOnly) tools.element.classList.add("miro-canvas-m2-tools--comments");
    modal.contentEl.append(tools.element);
    modal.onClose = () => {
      tools.dispose();
      if (this.toolsModal === modal) this.toolsModal = null;
    };
    modal.open();
  }

  private ensureMetadataWriter(): MetadataWriter | null {
    const view = this.app.workspace.activeLeaf?.view;
    if (!isNativeCanvasView(view)) {
      return null;
    }
    if (this.currentCanvasView !== view) {
      this.handleActiveLeafChange(this.app.workspace.activeLeaf);
      return this.metadataWriter;
    }
    if (this.metadataWriter) {
      return this.metadataWriter;
    }

    // Canvas internals can finish initializing after active-leaf-change. A
    // command check may safely retry the read-only capability probe.
    this.metadataStoreProbe = createObsidianMetadataStore(view);
    this.metadataWriter = this.metadataStoreProbe.store
      ? new MetadataWriter(this.metadataStoreProbe.store)
      : null;
    this.m1Session?.setWriter(this.metadataWriter);
    this.updateStatus(true);
    return this.metadataWriter;
  }

  private updateStatus(isCanvas: boolean): void {
    if (!this.statusBarItem) {
      return;
    }
    // The adapter's state is for whoever develops or debugs the plugin: it
    // shows only with the developer diagnostics turned on.
    this.statusBarItem.toggle(this.canvasSettings.developerDiagnostics);

    this.statusBarItem.dataset.miroCanvasState = isCanvas
      ? "canvas"
      : "idle";
    if (!isCanvas) {
      this.statusBarItem.setText("miro-canvas");
      return;
    }

    const inspection = this.canvasInspection;
    if (!inspection) {
      this.statusBarItem.setText("miro-canvas · Canvas");
      return;
    }

    const diagnosticCount = inspection.diagnostics.length
      + (this.metadataStoreProbe?.diagnostics.length ?? 0);
    const issueMarker = diagnosticCount > 0 ? " · ⚠" : "";
    const writerStatus = this.metadataStoreProbe?.status ?? "unavailable";
    const m1Status = this.m1Session?.status ?? "unavailable";
    this.statusBarItem.setText(
      `miro-canvas · Canvas (${inspection.adapter.status}/${inspection.metadata.status}/${writerStatus}/${m1Status})${issueMarker}`,
    );
  }

  private showStatus(): void {
    const advancedStatus = this.advancedInspection?.status ?? "not-probed";
    const inspection = this.canvasInspection;
    if (!inspection) {
      new Notice(words().shell.offlineNotice(advancedStatus));
      return;
    }

    const diagnosticCount = inspection.diagnostics.length
      + (this.metadataStoreProbe?.diagnostics.length ?? 0);
    const diagnosticSuffix = diagnosticCount > 0
      ? ` ${words().shell.diagnosticsReported(diagnosticCount)}`
      : "";
    const persistenceStatus = this.metadataStoreProbe?.status ?? "unavailable";
    new Notice(
      words().shell.statusNotice(inspection.adapter.status, inspection.metadata.status, persistenceStatus, advancedStatus) + diagnosticSuffix,
    );
  }

  private runMetadataAction(result: MetadataWriteResult): void {
    if (this.currentCanvasView !== null) {
      this.canvasInspection = inspectCanvasView(this.currentCanvasView);
      this.updateStatus(true);
    }

    if (result.status === "applied") {
      new Notice(words().shell.actionApplied(result.action));
      return;
    }
    if (result.status === "noop") {
      new Notice(words().shell.actionNoop(result.action));
      return;
    }

    // A diagnostic's own message stays in English, as diagnostics for
    // maintainers do; only the fallback sentence is translated.
    const reason = result.diagnostics[0]?.message ?? words().shell.transactionRejected;
    new Notice(words().shell.actionRejected(reason));
  }

  /** Where downloaded and custom fonts live: a subfolder of the plugin's own folder. */
  private fontsDir(): string {
    return normalizePath(`${this.manifest.dir}/fonts`);
  }

  /** Verify every installed pack still has its folder; one that has gone missing drops quietly, id and families both. */
  private async loadFontPacks(): Promise<void> {
    const adapter = this.app.vault.adapter;
    const dir = this.fontsDir();
    const survivingIds: string[] = [];
    const manifests: FontPackManifest[] = [];
    for (const id of this.canvasSettings.fontPacks) {
      try {
        const path = `${dir}/${id}/pack.json`;
        if (!(await adapter.exists(path))) continue;
        const manifest = readInstalledPackManifest(JSON.parse(await adapter.read(path)) as unknown);
        if (manifest === undefined || manifest.id !== id) continue;
        survivingIds.push(id);
        manifests.push(manifest);
      } catch {
        // A folder that cannot be read is treated as gone.
      }
    }
    this.installedFontPackManifests = manifests;
    const known = new Set<string>([
      ...OFFERED_FONT_FAMILIES,
      ...manifests.flatMap((manifest) => manifest.families.map((family) => family.family)),
      ...this.canvasSettings.customFonts.map((font) => font.family),
    ]);
    const prunedFontList = this.canvasSettings.fontList.filter((entry) => known.has(entry.family));
    if (survivingIds.length !== this.canvasSettings.fontPacks.length || prunedFontList.length !== this.canvasSettings.fontList.length) {
  this.canvasSettings = normalizeSettings({
        ...this.canvasSettings,
        fontPacks: survivingIds,
        fontList: prunedFontList.length > 0 ? prunedFontList : this.canvasSettings.fontList,
      });
      await this.saveData(this.canvasSettings);
    }
    this.syncFontCatalog();
  }

  /**
   * Tell the font-face registry which packs and custom fonts exist and
   * where their files live.  This reads no bytes and inserts no rule: a
   * family's own faces are read only once something actually asks for it
   * through `FontFaceRegistry.want` - the toolbar's font popover opening,
   * a card or label naming it, or the settings' own font list drawing its
   * names.  Call this after any change to the installed packs or custom
   * fonts; a family whose pack is gone has its rule and blob revoked by
   * `configure` itself.
   */
  private syncFontCatalog(): void {
    const dir = this.fontsDir();
    const packs: FontFacePackDefinition[] = this.installedFontPackManifests.map((manifest) => ({
      id: manifest.id, dir: `${dir}/${manifest.id}`, families: manifest.families, aliases: manifest.aliases,
    }));
    const customFonts: CustomFontDefinition[] = this.canvasSettings.customFonts.map((font) => ({
      family: font.family, file: font.file,
    }));
    this.fontFaces.configure(packs, customFonts, `${dir}/custom`);
  }

  /** The message a failed download shows, in the language in use. */
  private fontPackFailureMessage(error: unknown): string {
    const labels = words().fonts;
    if (!(error instanceof FontPackDownloadError)) return labels.failed;
    switch (error.reason) {
      case "not-published": return labels.notPublishedYet;
      case "integrity": return labels.integrityMismatch;
      case "invalid": return labels.invalidPack;
      case "network": return labels.failed;
    }
  }

  /** Download, verify and unpack one catalogue pack on a press; a failure leaves nothing behind. */
  private async downloadFontPackAction(id: string, onProgress: (stage: FontPackProgress, detail?: string) => void): Promise<void> {
    const entry = FONT_PACK_CATALOGUE.find((item) => item.id === id);
    const dir = this.fontsDir();
    const adapter = this.app.vault.adapter;
    if (entry === undefined) {
      onProgress("failed", words().fonts.failed);
      return;
    }
    try {
      const manifest = await downloadFontPack(entry, {
        fetch: async (url) => {
          const response = await requestUrl({ url, throw: false });
          return { status: response.status, arrayBuffer: response.arrayBuffer };
        },
        digest: (data) => crypto.subtle.digest("SHA-256", data),
        writer: {
          mkdir: (path) => adapter.mkdir(path),
          writeBinary: (path, data) => adapter.writeBinary(path, data),
          write: (path, data) => adapter.write(path, data),
        },
      }, `${dir}/${id}`, (stage) => onProgress(stage));
      this.installedFontPackManifests = [...this.installedFontPackManifests.filter((existing) => existing.id !== id), manifest];
      await this.saveCanvasSettings({
        fontPacks: [...this.canvasSettings.fontPacks.filter((existing) => existing !== id), id],
        fontList: addToFontList(this.canvasSettings.fontList, manifest.families.map((family) => family.family)),
      });
      this.syncFontCatalog();
      onProgress("done");
    } catch (error) {
      await adapter.rmdir(`${dir}/${id}`, true).catch(() => undefined);
      onProgress("failed", this.fontPackFailureMessage(error));
    }
  }

  /** Remove a pack's folder and drop its families from the pool, unless something else still needs them. */
  private async removeFontPackAction(id: string): Promise<void> {
    const dir = this.fontsDir();
    const manifest = this.installedFontPackManifests.find((item) => item.id === id);
    await this.app.vault.adapter.rmdir(`${dir}/${id}`, true).catch(() => undefined);
    this.installedFontPackManifests = this.installedFontPackManifests.filter((item) => item.id !== id);
    const stillNeeded = new Set<string>([
      ...OFFERED_FONT_FAMILIES,
      ...this.canvasSettings.customFonts.map((font) => font.family),
      ...this.installedFontPackManifests.flatMap((item) => item.families.map((family) => family.family)),
    ]);
    const dropped = (manifest?.families.map((family) => family.family) ?? []).filter((family) => !stillNeeded.has(family));
    await this.saveCanvasSettings({
      fontPacks: this.canvasSettings.fontPacks.filter((existing) => existing !== id),
      fontList: removeFromFontList(this.canvasSettings.fontList, dropped),
    });
    this.syncFontCatalog();
  }

  /** A file picker for one font file; resolves to undefined where nothing was chosen. */
  private pickFontFile(): Promise<File | undefined> {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".ttf,.otf,.woff,.woff2";
      input.style.display = "none";
      input.addEventListener("change", () => {
        resolve(input.files?.[0] ?? undefined);
        input.remove();
      }, { once: true });
      document.body.appendChild(input);
      input.click();
    });
  }

  /** "Add a font file": copy the chosen file into the plugin's own folder and add it to the pool. */
  private async addCustomFontAction(): Promise<void> {
    const file = await this.pickFontFile();
    if (file === undefined) return;
    const dir = this.fontsDir();
    const adapter = this.app.vault.adapter;
    const taken = new Set(this.canvasSettings.customFonts.map((font) => font.file));
    const fileName = uniqueFontFileName(sanitizeFontFileName(file.name), taken);
    await adapter.mkdir(`${dir}/custom`);
    await adapter.writeBinary(`${dir}/custom/${fileName}`, await file.arrayBuffer());
    const family = normalizeFontFamily(file.name.replace(/\.[^./]+$/u, ""));
    await this.saveCanvasSettings({
      customFonts: [...this.canvasSettings.customFonts, { family, file: fileName }],
      fontList: addToFontList(this.canvasSettings.fontList, [family]),
    });
    this.syncFontCatalog();
  }

  /** Remove a custom font's file, and its family from the pool unless something else still needs it. */
  private async removeCustomFontAction(file: string): Promise<void> {
    const custom = this.canvasSettings.customFonts.find((font) => font.file === file);
    await this.app.vault.adapter.remove(`${this.fontsDir()}/custom/${file}`).catch(() => undefined);
    const remaining = this.canvasSettings.customFonts.filter((font) => font.file !== file);
    const stillNeeded = new Set<string>([
      ...OFFERED_FONT_FAMILIES,
      ...this.installedFontPackManifests.flatMap((item) => item.families.map((family) => family.family)),
      ...remaining.map((font) => font.family),
    ]);
    const dropped = custom !== undefined && !stillNeeded.has(custom.family) ? [custom.family] : [];
    await this.saveCanvasSettings({ customFonts: remaining, fontList: removeFromFontList(this.canvasSettings.fontList, dropped) });
    this.syncFontCatalog();
  }

  /** Rename a custom font's family; its row in the pool keeps its place. */
  private async renameCustomFontAction(file: string, family: string): Promise<void> {
    const current = this.canvasSettings.customFonts.find((font) => font.file === file);
    if (current === undefined) return;
    const safe = normalizeFontFamily(family, current.family || DEFAULT_FONT_FAMILY);
    if (safe === current.family) return;
    await this.saveCanvasSettings({
      customFonts: this.canvasSettings.customFonts.map((font) => (font.file === file ? { ...font, family: safe } : font)),
      fontList: this.canvasSettings.fontList.map((entry) => (entry.family === current.family ? { ...entry, family: safe } : entry)),
    });
    this.syncFontCatalog();
  }

  private disposeShell(): void {
    if (this.shellDisposed) {
      return;
    }

    this.shellDisposed = true;
    if (this.initializationRetry !== null) clearTimeout(this.initializationRetry);
    this.initializationRetry = null;
    this.toolsModal?.close();
    this.toolsModal = null;
    this.importGuideModal?.close();
    this.importGuideModal = null;
    this.canvasInspection = null;
    this.metadataStoreProbe = null;
    this.metadataWriter = null;
    this.m1Session?.dispose();
    this.m1Session = null;
    this.currentCanvasView = null;
    this.advancedInspection = null;
    this.statusBarItem?.remove();
    this.statusBarItem = null;
  }
}
