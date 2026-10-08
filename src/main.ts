import { replaceInvalidFilenameCharacters } from "./control-characters";
import { createHtmlElement } from "./dom-elements";
import * as obsidian from "obsidian";
import { Component, MarkdownRenderChild, MarkdownRenderer, Menu, Modal, Notice, Platform, Plugin, Setting, TFile, getLanguage, normalizePath, parseYaml, stringifyYaml, requestUrl, setIcon, type Events, type WorkspaceLeaf } from "obsidian";

import { DEFAULT_FONT_FAMILY, OFFERED_FONT_FAMILIES, normalizeFontFamily, defaultPalette } from "./appearance";
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
import { storeDeviceFiles } from "./device-files";
import { M1CanvasSession } from "./m1-session";
import { PaletteEditor } from "./palette-editor";
import { CustomStyleEditor } from "./custom-style-editor";
import { cloneCanvasJson } from "./canvas-json";
import { newCanvasId } from "./canvas-ids";
import { graphDrift } from "./native-graph";
import { CanvasAuthoring } from "./canvas-authoring";
import { planEncapsulateSelection } from "./board-encapsulation";
import { BoardTransferPublisher, type BoardTransferPublishResult, type TransferFileStat } from "./board-transfer-publisher";
import { createObsidianBoardIndex, type ObsidianBoardIndex } from "./obsidian-board-index";
import { CanvasOutgoingLinks } from "./canvas-outgoing-links";
import { CanvasBacklinks } from "./canvas-backlinks";
import { CanvasPropertyResults } from "./canvas-property-results";
import { BoardCardResolver, BoardCardEmbeds, canvasCardLink, installCanvasCardLinkOpener, installCanvasCardEmbedCreator } from "./board-card-links";
import { planBoardLinkRename, planReconcileNotePropertyEdges } from "./board-link-lifecycle";
import type { BoardKnowledge } from "./board-knowledge";
import { prepareBoardMetadataRename } from "./board-metadata-maintenance";
import { DEFAULT_TOOLBAR_ITEMS } from "./quick-tools";
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
  layoutKindFor,
  mergeSettings,
  sameOnThisDevice,
  settingsFromExternalChange,
  withOtherKindsFromDisk,
  moveFontListEntry,
  navigationCommands,
  normalizeSettings,
  obsidianAccountName,
  removeFromFontList,
  settingsForStorage,
  shouldAskImportQuestion,
  useLayoutKind,
  type MiroCanvasSettings,
  type PanDirection,
} from "./settings";
import { MiroCanvasSettingTab } from "./settings-tab";
import { setAuthorColors } from "./comment-thread";
import { layerActions } from "./layer-order";
import { localeFor, setLocale, words } from "./i18n";
import { createWelcomeBoard } from "./welcome-board";
import { PenTooltips } from "./pen-tooltips";
import { bindingOf, stillTheBoard, type BoardBinding } from "./board-binding";
import { canImportFile, importIntoBoard, showImportPreview } from "./import-command";
import { automaticCheckDue, checkForUpdate, isNewerVersion, type ReleaseRequest, type UpdateCheck } from "./update-check";

const NATIVE_CANVAS_VIEW_TYPE = "canvas";

/** A font file's own name, safe on every filesystem the plugin's vaults run on. */
function sanitizeFontFileName(name: string): string {
  const cleaned = replaceInvalidFilenameCharacters(name).trim();
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

/** The minimum supported Obsidian exposes its language through the public API. */
function obsidianLanguage(): string {
  return getLanguage();
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
  private readonly exportJobs = new Set<AbortController>();
  private advancedInspection: AdvancedCanvasInspection | null = null;
  private canvasInspection: CanvasSessionInspection | null = null;
  private metadataStoreProbe: ObsidianMetadataStoreProbe | null = null;
  private metadataWriter: MetadataWriter | null = null;
  private currentCanvasView: unknown = null;
  /** What the session now standing was built for, to tell a board still on screen from another; see `board-binding.ts`. */
  private currentCanvasBinding: BoardBinding | null = null;
  private m1Session: M1CanvasSession | null = null;
  private boardIndex: ObsidianBoardIndex | undefined;
  private outgoingLinks: CanvasOutgoingLinks | undefined;
  private backlinks: CanvasBacklinks | undefined;
  private propertyResults: CanvasPropertyResults | undefined;
  private cardResolver: BoardCardResolver | undefined;
  private cardEmbeds: BoardCardEmbeds | undefined;
  private cardLinkCleanup: (() => void) | undefined;
  private cardCreatorCleanup: (() => void) | undefined;
  private readonly enhancementModals = new Set<Modal>();
  /** Bounded maintainer receipt for the last transfer; no source or target document bodies. */
  private transferReceipt: {
    sourcePath: string;
    targetPath: string;
    result?: BoardTransferPublishResult;
    refused?: string;
    applyChecks: Array<{
      reason: string;
      identitySame: boolean;
      expected: Pick<TransferFileStat, "mtime" | "size" | "revision">;
      observed?: Pick<TransferFileStat, "mtime" | "size" | "revision">;
      authoring?: { ok: boolean; status: string; diagnostics: string[] };
    }>;
    saveChecks: Array<{ status: "saved" | "failed"; reason: string; graphDrift?: string }>;
  } | undefined;
  private relationTimer: number | undefined;
  private renameWork = Promise.resolve();
  private renameReceipt: {
    oldPath: string;
    newPath: string;
    folder: boolean;
    processed: number;
    error?: string;
    boards: Array<{
      path: string;
      status: string;
      save?: string;
      diagnostics: readonly string[];
      references: Array<{ nodeId?: string; link: string; original: string; resolvedPath?: string; start?: number; end?: number }>;
    }>;
  } | undefined;
  private toolsModal: Modal | null = null;
  private importGuideModal: Modal | null = null;
  /** The status bar's mark while a newer release is known; absent otherwise. */
  private updateIndicator: HTMLElement | undefined;
  private readonly initializationTimerHost: Window = window;
  private initializationRetry: number | null = null;
  public canvasSettings: MiroCanvasSettings = DEFAULT_SETTINGS;
  /** The `<style>` this plugin owns in every window's head; loads a family's faces lazily, only once something wants it. */
  private readonly fontFaces = new FontFaceRegistry();
  /** The hover text of a stylus, which Obsidian's own tooltips do not show on a phone or a tablet; every window gets it, and the computer's none. */
  private readonly penTooltips = new PenTooltips({ isMobile: () => Platform.isMobile });
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
    this.canvasSettings = normalizeSettings(await this.loadData(), layoutKindFor(Platform));
    setAuthorColors(this.canvasSettings.commentAuthorColors);
    // Every window that can show a Canvas gets the plugin's own font-face
    // sheet; a popout gets one as it opens, and loses it as it closes.  A
    // face's bytes are read only once something wants that family.
    this.fontFaces.setFileReader((path) => this.app.vault.adapter.readBinary(path));
    this.fontFaces.attach(document);
    this.penTooltips.attach(document);
    this.registerEvent(this.app.workspace.on("window-open", (_win, openedWindow) => {
      this.fontFaces.attach(openedWindow.document);
      this.penTooltips.attach(openedWindow.document);
    }));
    this.registerEvent(this.app.workspace.on("window-close", (_win, closedWindow) => {
      this.fontFaces.detach(closedWindow.document);
      this.penTooltips.detach(closedWindow.document);
    }));
    await this.loadFontPacks();
    this.addSettingTab(new MiroCanvasSettingTab(this.app, this, {
      get settings(): MiroCanvasSettings { return self.settingsOfThisDevice(); },
      saveSettings: (patch) => this.saveCanvasSettings(patch),
      commentAuthors: () => this.m1Session?.commentAuthors() ?? [],
      accountName: () => obsidianAccountName(window.localStorage),
      openImportGuide: () => this.openImportGuide(),
      createWelcomeBoard: () => void this.openWelcomeBoard(true),
      openPalette: () => this.openPermanentPalette(),
      openCustomStyles: () => this.openCustomStyles(),
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
    this.registerEvent(this.app.vault.on("modify", (file) => {
      if ((this.currentCanvasView as { file?: unknown } | null)?.file === file) this.m1Session?.notifyCommittedBoardDocument();
    }));

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
      if (menu instanceof Menu) for (const action of this.activeM1Session()?.enhancementActions() ?? []) {
        menu.addItem((item) => item.setTitle(action.title).setDisabled(action.disabled === true).setSection("miro-canvas-actions").onClick(action.run));
      }
    }));
    const enhanced = words().enhancements;
    for (const [id, name, action] of [
      ["flip-edges", enhanced.flipEdges, (session: M1CanvasSession) => session.flipSelectionEdges()],
      ["select-connected-lines", enhanced.selectConnected, (session: M1CanvasSession) => session.selectRelatedLines()],
      ["select-incoming-lines", enhanced.selectIncoming, (session: M1CanvasSession) => session.selectRelatedLines("incoming")],
      ["select-outgoing-lines", enhanced.selectOutgoing, (session: M1CanvasSession) => session.selectRelatedLines("outgoing")],
      ["toggle-group-collapse", enhanced.collapseGroup, (session: M1CanvasSession) => session.toggleSelectedGroup()],
      ["board-properties", enhanced.boardProperties, () => this.openBoardProperties()],
      ["encapsulate-selection", enhanced.encapsulate, () => this.openSelectionTransfer()],
    ] as const) this.addCommand({ id, name, checkCallback: (checking) => this.runM1Command(checking, action) });
    this.addCommand({ id: "permanent-palette", name: enhanced.paletteTitle, callback: () => this.openPermanentPalette() });
    this.addCommand({ id: "custom-styles", name: enhanced.editStyles, callback: () => this.openCustomStyles() });
    this.addCommand({ id: "update-property-edges", name: enhanced.updatePropertyEdges,
      checkCallback: (checking) => this.runM1Command(checking, () => this.reconcilePropertyEdges()) });
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
    this.addCommand({
      id: "m1-arrange-panels",
      name: words().commands.arrangePanels,
      // No default hotkey: entering this mode is deliberate, from the board menu or the palette.
      checkCallback: (checking) => this.runM1Command(checking, (session) => session.toggleArrangeMode()),
    });
    this.addCommand({
      id: "m1-search-board",
      name: words().commands.searchBoard,
      // No default hotkey: the board takes Ctrl+F itself while it has focus
      // (a setting), and a card being written keeps Obsidian's own search.
      checkCallback: (checking) => this.runM1Command(checking, (session) => session.openSearch()),
    });

    // Import from another plugin's file into a new board: offered for the
    // open file and in a file's own menu, and only for files an importer
    // might read.  No default hotkey: an import is a deliberate step.
    this.addCommand({
      id: "import-into-board",
      name: words().commands.importIntoBoard,
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (file === null || !canImportFile(this.app, file)) {
          return false;
        }
        if (!checking) {
          this.importIntoBoard(file);
        }
        return true;
      },
    });
    this.registerEvent(this.app.workspace.on("file-menu", (menu, file) => {
      if (!(file instanceof TFile) || !canImportFile(this.app, file)) return;
      menu.addItem((item) => item
        .setTitle(words().commands.importIntoBoard)
        .setIcon("import")
        .onClick(() => this.importIntoBoard(file)));
    }));

    this.registerEvent(
      this.app.workspace.on(
        "active-leaf-change",
        this.handleActiveLeafChange
      )
    );
    // A Canvas view can be reused for another file, or finish constructing its
    // private runtime after active-leaf-change. Never bind permanently to the
    // half-initialized object or carry a previous file's review overlay across.
    this.registerEvent(this.app.workspace.on("file-open", () => {
      const leaf = this.focusedLeaf();
      // Obsidian says a file was opened whenever a card's editor takes the focus - one card picked, for one -
      // with the same board still on screen.  Its session keeps what it holds, an armed lasso among it.
      if (!stillTheBoard(this.currentCanvasBinding, leaf?.view, this.m1Session?.status === "ready")) this.handleActiveLeafChange(leaf);
    }));
    this.registerEvent(this.app.workspace.on("layout-change", () => {
      const currentClosed = this.currentCanvasView !== null && !this.currentCanvasStillOpen();
      if (currentClosed || this.m1Session?.status !== "ready") {
        this.handleActiveLeafChange(this.focusedLeaf());
      }
    }));
    this.handleActiveLeafChange(this.focusedLeaf());
    // Asked once, after Obsidian's own startup has settled; a plugin-only
    // person can decline it without ever seeing Miro mentioned again outside
    // the settings tab's own button.
    this.app.workspace.onLayoutReady(() => {
      this.startBoardIntegration();
      this.maybeAskImportQuestion();
      void this.checkForUpdatesAtStart();
    });
  }

  override onunload(): void {
    this.disposeShell();
    this.fontFaces.dispose();
    this.penTooltips.dispose();
  }

  private readonly handleActiveLeafChange = (
    leaf: WorkspaceLeaf | null,
    attempt = 0,
  ): void => {
    if (this.shellDisposed) return;
    this.settingsOfThisDevice();
    if (this.initializationRetry !== null) this.initializationTimerHost.clearTimeout(this.initializationRetry);
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
      this.currentCanvasBinding = null;
      this.updateStatus(false);
      return;
    }

    // A settings save from inside "arrange panels" rebuilds this same board's
    // session; the mode must stay open through that.  Switching to a
    // different board is a real departure, so it closes the mode instead.
    if (view === undefined) return;
    const sameBoard = this.currentCanvasView === view;
    const wasArranging = sameBoard && this.m1Session?.arrangeModeActive === true;
    this.toolsModal?.close();
    this.m1Session?.dispose();
    this.m1Session = null;
    this.currentCanvasView = view;
    this.currentCanvasBinding = bindingOf(view);
    this.canvasInspection = inspectCanvasView(view);
    this.metadataStoreProbe = createObsidianMetadataStore(view);
    this.metadataWriter = this.metadataStoreProbe.store
      ? new MetadataWriter(this.metadataStoreProbe.store)
      : null;
    const indexedFile = (view as { file?: unknown }).file;
    this.m1Session = new M1CanvasSession(view, this.metadataWriter, {
      onCommittedBoardDocument: (document, identity) => {
        if (this.currentCanvasView !== view || !(indexedFile instanceof TFile) || (view as { file?: unknown }).file !== indexedFile) return;
        this.boardIndex?.ingestLiveDocument(indexedFile, document, { owner: view, identity });
      },
      onReleaseBoardDocument: () => {
        if (indexedFile instanceof TFile) this.boardIndex?.releaseLiveDocument(indexedFile, view);
      },
      noteSearchAdapter: {
        stat: (path) => {
          const file = this.app.vault.getAbstractFileByPath(path);
          return file instanceof TFile ? { mtime: file.stat.mtime, size: file.stat.size } : undefined;
        },
        read: async (path, signal) => {
          const file = this.app.vault.getAbstractFileByPath(path);
          if (signal.aborted || !(file instanceof TFile)) throw new Error("Linked note unavailable");
          return this.app.vault.cachedRead(file);
        },
      },
      subscribeNoteChanges: (changed) => {
        const events = [
          this.app.vault.on("modify", (file) => changed(file.path)),
          this.app.vault.on("delete", (file) => changed(file.path)),
          this.app.vault.on("rename", (file, oldPath) => { changed(oldPath); changed(file.path); }),
        ];
        return () => events.forEach((event) => this.app.vault.offref(event));
      },
      onSelectionActions: (button, actions) => {
        const menu = new Menu();
        for (const action of actions) menu.addItem((item) => item.setTitle(action.title).setDisabled(action.disabled === true).onClick(action.run));
        const rect = button.getBoundingClientRect();
        menu.showAtPosition({ x: rect.left, y: rect.bottom });
      },
      onOpenPalette: () => this.openPermanentPalette(),
      onOpenBoardProperties: () => this.openBoardProperties(),
      onEncapsulateSelection: () => this.openSelectionTransfer(),
      onCopyNodeReference: (id, embed) => void this.copyCardReference(id, embed),
      onNotice: (message) => new Notice(message),
      onStateChange: () => this.updateStatus(true),
      setIcon: (element, icon) => setIcon(element, icon),
      onOpenSettings: () => this.openOwnSettings(),
      onExportJob: (controller) => {
        this.exportJobs.add(controller);
        return () => this.exportJobs.delete(controller);
      },
      onSaveExport: async (name, bytes, sourcePath) => {
        const path = await this.app.fileManager.getAvailablePathForAttachment(name, sourcePath);
        await this.app.vault.createBinary(path, bytes.slice().buffer);
        return path;
      },
      onAddFile: (button, fromVault) => this.openFileSourceMenu(button, fromVault),
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
      initialArrangeMode: wasArranging,
      onPanelLayoutChanged: (layout) => void this.saveSettingsQuietly({ panelLayout: layout }),
      onToolbarItemsChanged: (items) => void this.saveCanvasSettings({ toolbarItems: items }),
      onResetPanels: () => void this.saveCanvasSettings({ toolbarItems: DEFAULT_TOOLBAR_ITEMS, panelLayout: {} }),
      ...(this.metadataStoreProbe?.store !== undefined ? {} : {
        persistenceProblem: this.metadataStoreProbe?.diagnostics
          .map((item) => item.message).join(" ") || "no native Canvas runtime was found.",
      }),
    });
    const mounted = this.m1Session.mount();
    if (mounted && this.canvasSettings.automaticPropertyEdges) this.queuePropertyEdges();
    this.updateStatus(true);
    // A Canvas leaf can mount before its runtime exposes the data and save
    // members the metadata store needs.  Mounting alone is therefore not
    // enough: without persistence every write is refused, so keep probing.
    if ((!mounted || this.metadataWriter === null) && attempt < 20) {
      this.initializationRetry = this.initializationTimerHost.setTimeout(() => {
        this.initializationRetry = null;
        if (this.focusedLeaf() === leaf) this.handleActiveLeafChange(leaf, attempt + 1);
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
    const previous = this.canvasSettings;
    this.canvasSettings = mergeSettings(this.settingsOfThisDevice(), patch);
    setAuthorColors(this.canvasSettings.commentAuthorColors);
    const pending = this.canvasSettings;
    try {
      await this.persistSettings();
    } catch (error) {
      if (this.canvasSettings === pending) this.canvasSettings = previous;
      setAuthorColors(this.canvasSettings.commentAuthorColors);
      throw error;
    }
    if ("boardKnowledge" in patch) this.configureBoardIndex();
    const leaf = this.focusedLeaf();
    if (this.m1Session !== null && leaf !== null && leaf !== undefined) {
      this.handleActiveLeafChange(leaf);
    }
  }

  /** A settings change that needs no rebuilt session: when updates were last checked, or a panel's new place. */
  private async saveSettingsQuietly(patch: Partial<MiroCanvasSettings>): Promise<void> {
    this.canvasSettings = mergeSettings(this.settingsOfThisDevice(), patch);
    await this.persistSettings();
  }

  /**
   * Write the settings.  The file is read first: another device's sync may
   * have changed its own kind's layout there since this one last read it,
   * and a save must not take that back.
   */
  private async persistSettings(): Promise<void> {
    let onDisk: unknown;
    try {
      onDisk = await this.loadData();
    } catch {
      onDisk = undefined;
    }
    const current = this.canvasSettings;
    const merged = withOtherKindsFromDisk(current, onDisk);
    await this.saveData(settingsForStorage(merged));
    if (this.canvasSettings === current) this.canvasSettings = merged;
  }

  /**
   * Obsidian calls this when `data.json` changed on disk, by a sync from
   * another device.  The settings are read again and applied; nothing is
   * written back.  The session is rebuilt only when something this device
   * shows changed, so another kind's new layout leaves the panels alone.
   */
  override async onExternalSettingsChange(): Promise<void> {
    if (this.shellDisposed) return;
    const before = this.settingsOfThisDevice();
    this.canvasSettings = settingsFromExternalChange(before, await this.loadData());
    if (before.boardKnowledge !== this.canvasSettings.boardKnowledge) this.configureBoardIndex();
    setAuthorColors(this.canvasSettings.commentAuthorColors);
    if (sameOnThisDevice(before, this.canvasSettings)) return;
    const leaf = this.focusedLeaf();
    if (this.m1Session !== null && leaf !== null && leaf !== undefined) {
      this.handleActiveLeafChange(leaf);
    }
  }

  /**
   * The settings as this kind of device sees them.  The kind is read each
   * time, not once at start: a window can turn into a phone's (Obsidian's
   * mobile emulation), and the bar and panels then take that kind's layout.
   */
  private settingsOfThisDevice(): MiroCanvasSettings {
    this.canvasSettings = useLayoutKind(this.canvasSettings, layoutKindFor(Platform));
    return this.canvasSettings;
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
    const renderComponent = new Component();
    renderComponent.load();
    const modal = new class extends Modal {
      override onClose(): void { renderComponent.unload(); }
    }(this.app);
    modal.setTitle(labels.modalTitle(update.version));
    const notes = modal.contentEl.createDiv({ cls: "miro-canvas-update-notes" });
    if (update.notes === "") notes.createEl("p", { text: labels.noNotes });
    else void MarkdownRenderer.render(this.app, update.notes, notes, "", renderComponent);
    modal.contentEl.createEl("p", { text: labels.howToUpdate });
    const buttons = modal.contentEl.createDiv({ cls: "modal-button-container" });
    buttons.createEl("button", { text: labels.openRelease, cls: "mod-cta" }).addEventListener("click", () => {
      openExternalLink(update.url);
      modal.close();
    });
    buttons.createEl("button", { text: labels.later }).addEventListener("click", () => modal.close());
    modal.open();
  }

  private openFileSourceMenu(button: HTMLElement, fromVault: () => void): void {
    const labels = words().deviceFiles;
    const session = this.activeM1Session();
    if (session === null) return;
    const sourceView = this.currentCanvasView;
    const focusedView = this.app.workspace.getActiveViewOfType(obsidian.FileView);
    const sourcePath = focusedView?.file?.path;
    const menu = new Menu();
    menu.addItem(item => item.setTitle(labels.fromVault).setIcon("vault").onClick(fromVault));
    menu.addItem(item => item.setTitle(labels.fromDevice).setIcon("upload").onClick(() => {
      const input = createHtmlElement(button.ownerDocument, "input");
      input.type = "file";
      input.multiple = true;
      input.hidden = true;
      const cleanup = (): void => input.remove();
      input.addEventListener("cancel", cleanup, { once: true });
      input.addEventListener("change", () => {
        const files = Array.from(input.files ?? []);
        cleanup();
        if (files.length === 0) return;
        void (async () => {
          const stored = await storeDeviceFiles(files, {
            availablePath: name => this.app.fileManager.getAvailablePathForAttachment(name, sourcePath),
            createBinary: (path, bytes) => this.app.vault.createBinary(path, bytes),
          });
          if (this.currentCanvasView !== sourceView || this.m1Session === null || !this.m1Session.addFiles(stored)) {
            new Notice(labels.savedWithoutBoard);
          }
        })().catch(() => new Notice(labels.importFailed));
      }, { once: true });
      button.ownerDocument.body.appendChild(input);
      this.register(cleanup);
      input.click();
    }));
    const rect = button.getBoundingClientRect();
    menu.showAtPosition({ x: rect.left, y: rect.bottom });
  }

  /** Obsidian's settings, open on this plugin's page. */
  private openOwnSettings(): void {
    const setting = (this.app as unknown as {
      setting?: { open?: () => void; openTabById?: (id: string) => void };
    }).setting;
    setting?.open?.();
    setting?.openTabById?.(this.manifest.id);
  }

  private focusedLeaf(): WorkspaceLeaf | null {
    return this.app.workspace.getActiveViewOfType(obsidian.View)?.leaf ?? null;
  }

  private activeM1Session(): M1CanvasSession | null {
    const view = this.focusedLeaf()?.view;
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
      void this.openWelcomeBoard();
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
  private async openWelcomeBoard(fresh = false): Promise<void> {
    await createWelcomeBoard({ app: this.app, isFile: (value): value is TFile => value instanceof TFile, normalizePath }, fresh).catch(
      () => new Notice(words().importGuide.createWelcomeBoardFailed),
    );
  }

  /** A new board from another plugin's file; the file itself is only read. */
  private importIntoBoard(file: TFile): void {
    void importIntoBoard({
      app: this.app,
      isFile: (value): value is TFile => value instanceof TFile,
      normalizePath,
      pluginVersion: this.manifest.version,
      notice: (message) => new Notice(message),
      confirm: (preview) => showImportPreview(new Modal(this.app), preview),
      // A new board has no theme of its own: it follows the system's, as
      // the board itself works it out once it is open.
      theme: () => (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
    }, file).catch((error: unknown) => {
      console.error("[miro-canvas] import failed", error);
      new Notice(words().importer.failed);
    });
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
    const view = this.focusedLeaf()?.view;
    if (!isNativeCanvasView(view)) {
      return null;
    }
    if (this.currentCanvasView !== view) {
      this.handleActiveLeafChange(this.focusedLeaf());
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
      this.statusBarItem.setText(this.manifest.id);
      return;
    }

    const inspection = this.canvasInspection;
    if (!inspection) {
      this.statusBarItem.setText(`${this.manifest.id} · Canvas`);
      return;
    }

    const diagnosticCount = inspection.diagnostics.length
      + (this.metadataStoreProbe?.diagnostics.length ?? 0);
    const issueMarker = diagnosticCount > 0 ? " · ⚠" : "";
    const writerStatus = this.metadataStoreProbe?.status ?? "unavailable";
    const m1Status = this.m1Session?.status ?? "unavailable";
    this.statusBarItem.setText(
      `${this.manifest.id} · Canvas (${inspection.adapter.status}/${inspection.metadata.status}/${writerStatus}/${m1Status})${issueMarker}`,
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
      await this.persistSettings();
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
      const input = createHtmlElement(document, "input");
      input.type = "file";
      input.accept = ".ttf,.otf,.woff,.woff2";
      input.hidden = true;
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

  private enhancementModal(title: string, cleanup: () => void = () => {}): Modal {
    const modal = new Modal(this.app);
    modal.setTitle(title);
    modal.containerEl.classList.add("miro-canvas-enhancement-container");
    modal.modalEl.classList.add("miro-canvas-enhancement-dialog");
    modal.contentEl.addClass("miro-canvas-enhancement-modal");
    modal.onClose = () => {
      cleanup();
      this.enhancementModals.delete(modal);
      modal.contentEl.empty();
    };
    this.enhancementModals.add(modal);
    return modal;
  }

  private openPermanentPalette(): void {
    let editor: PaletteEditor | undefined;
    const modal = this.enhancementModal(words().enhancements.paletteTitle, () => editor?.dispose());
    editor = new PaletteEditor(modal.contentEl.ownerDocument, this.canvasSettings.permanentPalette ?? defaultPalette(), defaultPalette(), words().enhancements.palette, {
      onChange: async (palette) => this.saveCanvasSettings({ permanentPalette: [...palette] }),
    });
    modal.contentEl.append(editor.element);
    modal.open();
  }

  private openCustomStyles(): void {
    let editor: CustomStyleEditor | undefined;
    const modal = this.enhancementModal(words().enhancements.customStyles, () => editor?.dispose());
    editor = new CustomStyleEditor(modal.contentEl.ownerDocument, this.canvasSettings.customStyles, words().enhancements.styles, {
      onChange: async (styles) => this.saveCanvasSettings({ customStyles: [...styles] }),
    });
    modal.contentEl.append(editor.element);
    modal.open();
  }

  private openBoardProperties(): void {
    const session = this.activeM1Session();
    const before = session?.actionSnapshot();
    if (session === null || session === undefined || before === undefined) return;
    const metadata = before.miroCanvas as Record<string, unknown> | undefined;
    let yaml = stringifyYaml(metadata?.properties ?? {});
    const labels = words().enhancements;
    const modal = this.enhancementModal(labels.boardProperties);
    new Setting(modal.contentEl).setClass("miro-canvas-properties-setting").setDesc(labels.propertiesHint).addTextArea((input) => {
      input.setValue(yaml).onChange((value) => { yaml = value; });
      input.inputEl.classList.add("miro-canvas-properties-input");
      input.inputEl.setAttribute("aria-label", labels.boardProperties);
      input.inputEl.spellcheck = false;
    });
    const error = modal.contentEl.createEl("p", { cls: "miro-canvas-enhancement-status" });
    error.setAttribute("role", "status");
    new Setting(modal.contentEl).addButton((button) => button.setButtonText(labels.cancel).onClick(() => modal.close()))
      .addButton((button) => button.setButtonText(labels.save).setCta().onClick(() => {
        try {
          const properties: unknown = parseYaml(yaml);
          if (properties === null || typeof properties !== "object" || Array.isArray(properties) || Object.keys(properties).length > 256) throw new Error("Invalid board properties");
          const plain = cloneCanvasJson(properties);
          const next = cloneCanvasJson(before) as Record<string, unknown>;
          next.miroCanvas = { ...(metadata ?? { schemaVersion: 1 }), properties: plain };
          if (this.activeM1Session() !== session || !session.applyFeatureDocument(next, before)) {
            error.textContent = labels.propertiesFailed;
            return;
          }
          modal.close();
        } catch { error.textContent = labels.propertiesInvalid; }
      }));
    modal.open();
  }

  private openSelectionTransfer(): void {
    const session = this.activeM1Session();
    const view = this.currentCanvasView as { file?: TFile; save?: () => Promise<void>; saving?: boolean } | null;
    const file = view?.file;
    const before = session?.actionSnapshot();
    if (session === null || session === undefined || before === undefined || file === undefined || typeof view?.save !== "function" || session.featureBusy()) return;
    const labels = words().enhancements;
    const selection = session.selectionForTransfer();
    let name = "";
    const lifetime = new AbortController();
    const modal = this.enhancementModal(labels.encapsulate, () => lifetime.abort());
    modal.contentEl.createEl("p", { text: labels.transferHint });
    new Setting(modal.contentEl).setName(labels.destinationName).addText((input) => input.onChange((value) => { name = value.trim(); }));
    const status = modal.contentEl.createEl("p");
    status.setAttribute("role", "status");
    let running = false;
    new Setting(modal.contentEl).addButton((button) => button.setButtonText(labels.cancel).onClick(() => modal.close()))
      .addButton((button) => button.setButtonText(labels.transfer).setCta().onClick(() => {
        if (running) return;
        if (!name || replaceInvalidFilenameCharacters(name) !== name || name === "." || name === "..") { status.textContent = labels.invalidName; return; }
        const folder = file.parent?.path === "/" ? "" : file.parent?.path ?? "";
        const filename = name.endsWith(".canvas") ? name : `${name}.canvas`;
        const targetPath = normalizePath(`${folder ? `${folder}/` : ""}${filename}`);
        if (this.app.vault.getAbstractFileByPath(targetPath) !== null) { status.textContent = labels.invalidName; return; }
        const plan = planEncapsulateSelection(before, selection.ids, { targetPath, proxyId: newCanvasId(), routeEnds: selection.routeEnds });
        if (!plan.ok) { status.textContent = labels.actionFailed; return; }
        running = true;
        button.setDisabled(true);
        status.textContent = labels.transferBusy;
        void this.publishSelectionTransfer(session, view, file, before, plan.source, targetPath, plan.target, lifetime.signal).then((result) => {
          if (lifetime.signal.aborted) return;
          if (result === "applied") modal.close();
          else status.textContent = result === "partial" ? labels.transferPartial : labels.transferFailed;
        }).catch(() => { if (!lifetime.signal.aborted) status.textContent = labels.transferPartial; }).finally(() => {
          running = false;
          if (!lifetime.signal.aborted) button.setDisabled(false);
        });
      }));
    modal.open();
  }

  private async publishSelectionTransfer(session: M1CanvasSession, view: { file?: TFile; save?: () => Promise<void>; saving?: boolean }, file: TFile,
    before: Readonly<Record<string, unknown>>, after: Record<string, unknown>, targetPath: string, target: Record<string, unknown>, signal: AbortSignal): Promise<string> {
    const sourcePath = file.path;
    const receipt: NonNullable<typeof this.transferReceipt> = { sourcePath, targetPath, applyChecks: [], saveChecks: [] };
    this.transferReceipt = receipt;
    const revisions = new WeakMap<TFile, number>();
    const createdFiles = new WeakMap<TFile, { readonly path: string; readonly stat: TransferFileStat }>();
    const events: obsidian.EventRef[] = [];
    const changed = (item: unknown): void => {
      if (item instanceof TFile) revisions.set(item, (revisions.get(item) ?? 0) + 1);
    };
    try {
      events.push(this.app.vault.on("create", (item) => {
        changed(item);
        if (item instanceof TFile) createdFiles.set(item, {
          path: item.path,
          stat: { identity: item, mtime: item.stat.mtime, size: item.stat.size, revision: revisions.get(item) ?? 0 },
        });
      }));
      events.push(this.app.vault.on("modify", changed));
      events.push(this.app.vault.on("delete", changed));
      events.push(this.app.vault.on("rename", changed));
      const stat = (path: string): TransferFileStat | undefined => {
        const item = this.app.vault.getAbstractFileByPath(path);
        return item instanceof TFile && item.path === path
          ? { identity: item, mtime: item.stat.mtime, size: item.stat.size, revision: revisions.get(item) ?? 0 } : undefined;
      };
      const sameStat = (path: string, expected: TransferFileStat): boolean => {
        const current = stat(path);
        return current?.identity === expected.identity && current.mtime === expected.mtime
          && current.size === expected.size && current.revision === expected.revision;
      };
      const cancelled = (cancellation: AbortSignal): boolean => cancellation.aborted || this.shellDisposed;
      const read = async (path: string): Promise<string> => {
        const item = this.app.vault.getAbstractFileByPath(path);
        if (!(item instanceof TFile)) throw new Error("Transfer file unavailable");
        return this.app.vault.read(item);
      };
      const json = (value: unknown): string => JSON.stringify(value, (_key, item: unknown) => {
        if (item === null || typeof item !== "object" || Array.isArray(item)) return item;
        return Object.fromEntries(Object.entries(item).sort(([left], [right]) => left.localeCompare(right)));
      });
      const same = (left: Readonly<Record<string, unknown>>, right: Readonly<Record<string, unknown>>): boolean => {
        if (left === after || right === after) {
          const stored = left === after ? right : left;
          return graphDrift(stored, after) === undefined && json({ ...stored, nodes: [], edges: [] }) === json({ ...after, nodes: [], edges: [] });
        }
        return json(left) === json(right);
      };
      const snapshot = (): Readonly<Record<string, unknown>> => {
        const current = session.actionSnapshot();
        if (this.shellDisposed || this.activeM1Session() !== session || view.file !== file || file.path !== sourcePath
          || current === undefined || session.featureBusy()) throw new Error("Transfer source changed");
        return current;
      };
      const checkDisk = async (path: string, expected: { stat: TransferFileStat; text: string }): Promise<boolean> => {
        return sameStat(path, expected.stat) && await read(path) === expected.text && sameStat(path, expected.stat);
      };
      const initial = stat(sourcePath);
      if (initial === undefined || cancelled(signal)) { receipt.refused = "source-unavailable-or-cancelled"; return "refused"; }
      let text: string;
      try { text = await read(sourcePath); } catch { receipt.refused = "initial-read-failed"; return "refused"; }
      if (cancelled(signal) || !sameStat(sourcePath, initial)) { receipt.refused = "initial-source-changed-or-cancelled"; return "refused"; }
      const publisher = new BoardTransferPublisher<Readonly<Record<string, unknown>>>({
        stat: (path) => stat(path), read: (path) => read(path), snapshotSource: () => snapshot(), sameSnapshot: same,
        createTarget: async (path, contents, cancellation) => {
          if (cancelled(cancellation) || this.app.vault.getAbstractFileByPath(path)) return { status: "exists" };
          const item = await this.app.vault.create(path, contents);
          const created = createdFiles.get(item);
          return created?.path !== path ? { status: "failed" } : { status: "created", stat: created.stat };
        },
        applySource: async (_path, next, expected, cancellation) => {
          type AuthoringResult = NonNullable<(typeof receipt.applyChecks)[number]["authoring"]>;
          let authoringResult: AuthoringResult | undefined;
          const checked = (reason: string): void => {
            if (receipt.applyChecks.length >= 4) return;
            const wanted = expected.fingerprint.stat;
            const observed = stat(expected.path);
            receipt.applyChecks.push({
              reason, identitySame: observed?.identity === wanted.identity,
              expected: { mtime: wanted.mtime, size: wanted.size, revision: wanted.revision },
              ...(observed === undefined ? {} : { observed: { mtime: observed.mtime, size: observed.size, revision: observed.revision } }),
              ...(authoringResult === undefined ? {} : { authoring: authoringResult }),
            });
          };
          const refused = (reason: string): { status: "refused" } => { checked(reason); return { status: "refused" }; };
          if (cancelled(cancellation)) return refused("cancelled-before-read");
          let diskMatches: boolean;
          try { diskMatches = await checkDisk(expected.path, expected.fingerprint); }
          catch (error) { checked("source-disk-read-failed"); throw error; }
          if (!diskMatches) return refused("source-disk-fingerprint-changed");
          if (cancelled(cancellation)) return refused("cancelled-after-read");
          if (!sameStat(expected.path, expected.fingerprint.stat)) return refused("source-revision-after-read");
          if (this.activeM1Session() !== session) return refused("inactive-session");
          const authoring = (session as unknown as { authoring?: CanvasAuthoring }).authoring;
          let restore: (() => void) | undefined;
          // actionSnapshot initializes this local authoring instance before publication.
          // Capture only diagnostic codes; preserve parent instrumentation and the exact result.
          if (authoring instanceof CanvasAuthoring) {
            const descriptor = Object.getOwnPropertyDescriptor(authoring, "applyDocument");
            if (descriptor === undefined && Object.isExtensible(authoring) || descriptor?.writable === true && "value" in descriptor) {
              const original = Reflect.get(authoring, "applyDocument");
              const wrapper = function (this: CanvasAuthoring, ...args: Parameters<CanvasAuthoring["applyDocument"]>): ReturnType<CanvasAuthoring["applyDocument"]> {
                const result = Reflect.apply(original, this, args);
                authoringResult = { ok: result.ok, status: result.status, diagnostics: result.diagnostics.slice(0, 16).map((diagnostic) => diagnostic.code) };
                return result;
              };
              try {
                Object.defineProperty(authoring, "applyDocument", { ...(descriptor ?? { configurable: true, enumerable: false, writable: true }), value: wrapper });
                restore = () => {
                  if (authoring.applyDocument !== wrapper) return;
                  if (descriptor === undefined) Reflect.deleteProperty(authoring, "applyDocument");
                  else Object.defineProperty(authoring, "applyDocument", descriptor);
                };
              } catch { /* Diagnostics never change whether native authoring can run. */ }
            }
          }
          try {
            if (!session.applyFeatureDocument(next, expected.snapshot)) return refused("native-feature-refused");
          } catch (error) { checked("native-feature-threw"); throw error; }
          finally { restore?.(); }
          checked("applied");
          return { status: "applied", snapshot: snapshot(), rollbackSafe: true };
        },
        awaitSourceSave: async (path, expected, cancellation) => {
          const failed = (reason: string, drift?: string): { status: "failed" } => {
            if (receipt.saveChecks.length < 4) receipt.saveChecks.push({ status: "failed", reason, ...(drift === undefined ? {} : { graphDrift: drift }) });
            return { status: "failed" };
          };
          try {
            const deadline = Date.now() + 5000;
            const saving = (): boolean => view.saving === true;
            const settleSave = async (): Promise<void> => {
              while (saving() && Date.now() < deadline && !cancelled(cancellation)) await new Promise((resolve) => window.setTimeout(resolve, 20));
            };
            await settleSave();
            if (cancelled(cancellation)) return failed("cancelled");
            if (saving()) return failed("save-busy-before");
            if (!same(snapshot(), expected)) return failed("source-snapshot-before-save");
            await view.save!();
            await settleSave();
            if (cancelled(cancellation)) return failed("cancelled");
            if (saving()) return failed("save-busy-after");
            if (!same(snapshot(), expected)) return failed("source-snapshot-after-save");
            const saved = stat(path);
            const contents = await read(path);
            if (cancelled(cancellation)) return failed("cancelled");
            if (saved === undefined || !sameStat(path, saved)) return failed("source-revision-during-save-read");
            if (!same(snapshot(), expected)) return failed("source-snapshot-during-save-read");
            const stored = JSON.parse(contents) as Record<string, unknown>;
            const drift = graphDrift(stored, expected);
            if (drift !== undefined) return failed("disk-graph-drift", drift);
            if (json({ ...stored, nodes: [], edges: [] }) !== json({ ...expected, nodes: [], edges: [] })) return failed("disk-root-drift");
            if (receipt.saveChecks.length < 4) receipt.saveChecks.push({ status: "saved", reason: "verified" });
            return { status: "saved", fingerprint: { stat: saved, text: contents } };
          } catch { return failed("native-save-or-read-failed"); }
        },
        rollbackSource: async (_prior, expected, cancellation) => !cancelled(cancellation) && await checkDisk(expected.path, expected.fingerprint)
          && !cancelled(cancellation) && sameStat(expected.path, expected.fingerprint.stat)
          && same(snapshot(), expected.snapshot) && session.rollbackFeatureDocument(),
        deleteTarget: async (path, expected, source, cancellation) => {
          if (cancelled(cancellation) || !await checkDisk(path, expected) || cancelled(cancellation)
            || !await checkDisk(source.path, source.fingerprint) || cancelled(cancellation)) return false;
          const item = this.app.vault.getAbstractFileByPath(path);
          if (item !== expected.stat.identity || !(item instanceof TFile) || !same(snapshot(), source.snapshot)
            || cancelled(cancellation) || !sameStat(path, expected.stat) || !sameStat(source.path, source.fingerprint.stat)) return false;
          await this.app.fileManager.trashFile(item);
          return this.app.vault.getAbstractFileByPath(path) === null;
        },
      });
      try {
        const result = await publisher.publish({ sourcePath, targetPath, sourceBefore: before, sourceAfter: after, sourceFingerprint: { stat: initial, text }, targetText: JSON.stringify(target, null, "\t") }, signal);
        receipt.result = result;
        return result.status;
      } finally { publisher.dispose(); }
    } finally {
      for (const event of events) this.app.vault.offref(event);
    }
  }

  private async copyCardReference(id: string, embed: boolean): Promise<void> {
    const file = (this.currentCanvasView as { file?: TFile } | null)?.file;
    const link = file === undefined ? undefined : canvasCardLink(file.path, id);
    if (link === undefined) { new Notice(words().enhancements.copyFailed); return; }
    try {
      await navigator.clipboard.writeText(`${embed ? "!" : ""}[[${link}]]`);
      new Notice(words().enhancements.copied);
    } catch { new Notice(words().enhancements.copyFailed); }
  }

  private configureBoardIndex(): void {
    this.backlinks?.dispose();
    this.propertyResults?.dispose();
    this.outgoingLinks?.dispose();
    this.boardIndex?.dispose();
    this.outgoingLinks = undefined;
    this.boardIndex = undefined;
    this.propertyResults = undefined;
    this.backlinks = undefined;
    if (this.shellDisposed || !this.canvasSettings.boardKnowledge) return;
    this.boardIndex = createObsidianBoardIndex(this.app, {
      onIndexed: () => { this.outgoingLinks?.refresh(); this.propertyResults?.refresh(); this.backlinks?.refresh(); if (this.canvasSettings.automaticPropertyEdges) this.queuePropertyEdges(); },
      onNotePropertiesChanged: () => { if (this.canvasSettings.automaticPropertyEdges) this.queuePropertyEdges(); },
      onRename: (file, oldPath, boards) => {
        this.maintainRenamedBoards(file, oldPath, boards);
      },
    });
    this.boardIndex.start();
    this.outgoingLinks = new CanvasOutgoingLinks(this.app, this.boardIndex);
    this.outgoingLinks.start();
    this.propertyResults = new CanvasPropertyResults(this.app, this.boardIndex, { labels: () => words().enhancements.propertyResults });
    this.propertyResults.start();
    this.backlinks = new CanvasBacklinks(this.app, this.boardIndex);
    this.backlinks.start();
  }

  /** The index supplies historical targets; never resolve a bare link after rename. */
  private maintainRenamedBoards(file: obsidian.TAbstractFile, oldPath: string, boards: ReadonlyMap<string, BoardKnowledge>): void {
    const newPath = file.path;
    const folder = !(file instanceof TFile);
    const receipt: NonNullable<typeof this.renameReceipt> = { oldPath, newPath, folder, processed: 0, boards: [] };
    this.renameReceipt = receipt;
    const snapshots = new Map<string, { knowledge: BoardKnowledge; board: TFile }>();
    for (const [previousPath, knowledge] of boards) {
      const path = previousPath === oldPath || previousPath.startsWith(`${oldPath}/`) ? newPath + previousPath.slice(oldPath.length) : previousPath;
      const board = this.app.vault.getAbstractFileByPath(path);
      if (!(board instanceof TFile) || board.extension !== "canvas") continue;
      try {
        // Newer native parsing/resolution cannot mutate queued historical evidence.
        const snapshot = typeof structuredClone === "function" ? structuredClone(knowledge) : cloneCanvasJson(knowledge);
        snapshots.set(path, { knowledge: snapshot, board });
      } catch { receipt.error = "historical-snapshot-unavailable"; }
    }
    this.renameWork = this.renameWork.catch(() => {}).then(async () => {
      for (const [path, { knowledge, board }] of snapshots) {
        if (this.shellDisposed) return;
        const row: (typeof receipt.boards)[number] = {
          path, status: "queued", diagnostics: [],
          references: [...knowledge.links, ...knowledge.embeds].slice(0, 8).map((reference) => ({
            nodeId: reference.position?.nodeId, link: reference.link.slice(0, 4096), original: reference.original.slice(0, 4096),
            resolvedPath: reference.resolvedPath, start: reference.position?.start.offset, end: reference.position?.end.offset,
          })),
        };
        if (receipt.boards.length < 64) receipt.boards.push(row);
        receipt.processed += 1;
        if (file.path !== newPath || this.app.vault.getAbstractFileByPath(newPath) !== file
          || this.app.vault.getAbstractFileByPath(path) !== board || board.path !== path) { row.status = "file-identity-changed"; continue; }
        const open = this.app.workspace.getLeavesOfType("canvas").find((leaf) => (leaf.view as unknown as { file?: TFile }).file === board);
        if (open !== undefined) {
          const deadline = Date.now() + 5000;
          while (!this.shellDisposed && this.renameViewBusy(open.view) && Date.now() < deadline) {
            await new Promise((resolve) => window.setTimeout(resolve, 50));
          }
          if (this.shellDisposed) return;
          const stillOpen = this.app.workspace.getLeavesOfType("canvas").some((leaf) => leaf.view === open.view);
          if (!stillOpen || (open.view as unknown as { file?: TFile }).file !== board || file.path !== newPath
            || this.app.vault.getAbstractFileByPath(path) !== board || this.app.vault.getAbstractFileByPath(newPath) !== file) {
            row.status = "view-or-file-changed";
            continue;
          }
          const result = this.renameBoardReferences(oldPath, newPath, folder, knowledge, open.view);
          row.status = result.status;
          row.diagnostics = result.diagnostics.slice(0, 16);
          if (result.status === "applied") row.save = await this.persistRenamedBoard(open.view, board);
          continue;
        }
        if (board.stat.size > 16 * 1024 * 1024) { row.status = "board-too-large"; continue; }
        try {
          const source = await this.app.vault.read(board);
          if (this.shellDisposed) return;
          const plan = prepareBoardMetadataRename(source, { sourcePath: path, oldPath, newPath, folder, preRename: knowledge });
          row.diagnostics = plan.diagnostics.slice(0, 16).map((diagnostic) => diagnostic.code);
          if (plan.status !== "prepared") { row.status = plan.status; continue; }
          let committed = false;
          await this.app.vault.process(board, (current) => {
            const opened = this.app.workspace.getLeavesOfType("canvas").some((leaf) => (leaf.view as unknown as { file?: TFile }).file === board);
            if (this.shellDisposed || opened || current !== plan.expectedSource || file.path !== newPath
              || this.app.vault.getAbstractFileByPath(newPath) !== file || this.app.vault.getAbstractFileByPath(path) !== board || board.path !== path) return current;
            committed = true;
            return JSON.stringify(plan.document, null, "\t");
          });
          row.status = committed ? "metadata-applied" : "source-changed-or-opened";
          if (committed) this.boardIndex?.reindex(path);
        } catch { row.status = "maintenance-failed"; }
      }
      // Let a successful M1 commit publish its coalesced live document before draining indexing.
      await Promise.resolve();
      if (!this.shellDisposed) await this.boardIndex?.flush();
    }).catch(() => { receipt.error = "rename-work-failed"; });
  }

  private renameViewBusy(view: unknown): boolean {
    const bound = this.m1Session;
    const session = this.currentCanvasView === view && bound !== null && bound.view === view ? bound : undefined;
    return session?.featureBusy() === true || (view as { canvas?: { isDragging?: boolean } } | null)?.canvas?.isDragging === true;
  }

  /** Drain the native view save, without hooking requestSave or adding another history step. */
  private async persistRenamedBoard(view: unknown, file: TFile): Promise<string> {
    const native = view as { file?: TFile; save?: () => Promise<void>; saving?: boolean };
    if (typeof native.save !== "function") return "save-unavailable";
    const path = file.path;
    const present = (): boolean => !this.shellDisposed && native.file === file && file.path === path
      && this.app.vault.getAbstractFileByPath(path) === file
      && this.app.workspace.getLeavesOfType("canvas").some((leaf) => leaf.view === view);
    const json = (value: unknown): string => JSON.stringify(value, (_key, item: unknown) => item === null || typeof item !== "object" || Array.isArray(item)
      ? item : Object.fromEntries(Object.entries(item).sort(([left], [right]) => left.localeCompare(right))));
    const same = (left: Record<string, unknown>, right: Record<string, unknown>): boolean => graphDrift(left, right) === undefined
      && json({ ...left, nodes: [], edges: [] }) === json({ ...right, nodes: [], edges: [] });
    const authoring = new CanvasAuthoring(view);
    try {
      if (!present() || this.renameViewBusy(view)) return "view-or-file-changed";
      const expected = authoring.readSnapshot().document;
      if (expected === undefined) return "snapshot-unavailable";
      const deadline = Date.now() + 5000;
      const saving = (): boolean => native.saving === true;
      const settle = async (): Promise<void> => {
        while (present() && saving() && Date.now() < deadline) await new Promise((resolve) => window.setTimeout(resolve, 20));
      };
      const current = (): boolean => {
        const document = authoring.readSnapshot().document;
        return document !== undefined && same(document, expected);
      };
      await settle();
      if (!present() || saving() || this.renameViewBusy(view) || !current()) return "source-changed-or-busy";
      await native.save();
      await settle();
      if (!present() || saving() || this.renameViewBusy(view) || !current()) return "source-changed-or-busy";
      const mtime = file.stat.mtime;
      const size = file.stat.size;
      const contents = await this.app.vault.read(file);
      if (!present() || file.stat.mtime !== mtime || file.stat.size !== size || this.renameViewBusy(view) || !current()) return "source-changed-during-read";
      const stored = JSON.parse(contents) as Record<string, unknown>;
      return same(stored, expected) ? "saved" : "disk-unverified";
    } catch { return "save-failed"; }
    finally { authoring.dispose(); }
  }

  private queuePropertyEdges(): void {
    if (this.shellDisposed || this.relationTimer !== undefined) return;
    this.relationTimer = window.setTimeout(() => {
      this.relationTimer = undefined;
      if (this.shellDisposed || !this.canvasSettings.automaticPropertyEdges) return;
      if (this.activeM1Session()?.featureBusy()) { this.queuePropertyEdges(); return; }
      this.reconcilePropertyEdges();
    }, 200);
  }

  private reconcilePropertyEdges(): void {
    const session = this.activeM1Session();
    const before = session?.actionSnapshot();
    const file = (this.currentCanvasView as { file?: TFile } | null)?.file;
    if (session === null || session === undefined || before === undefined || file === undefined || session.featureBusy()) return;
    const plan = planReconcileNotePropertyEdges(before, {
      sourcePath: file.path,
      properties: this.canvasSettings.relationProperties.length ? this.canvasSettings.relationProperties : undefined,
      resolveLink: (link, source) => this.app.metadataCache.getFirstLinkpathDest(link, source)?.path,
      getNoteCache: (path) => {
        const note = this.app.vault.getAbstractFileByPath(path);
        return note instanceof TFile ? this.app.metadataCache.getFileCache(note) : undefined;
      },
      createEdgeId: () => newCanvasId(),
    });
    if (plan.ok && plan.changed) session.applyFeatureDocument(plan.document, before, true);
  }

  private renameBoardReferences(oldPath: string, newPath: string, folder: boolean, knowledge: BoardKnowledge, view: unknown = this.currentCanvasView): { status: string; diagnostics: readonly string[] } {
    const file = (view as { file?: TFile } | null)?.file;
    if (!(file instanceof TFile) || this.shellDisposed) return { status: "view-unavailable", diagnostics: [] };
    if (this.renameViewBusy(view)) return { status: "view-busy", diagnostics: [] };
    const bound = this.m1Session;
    const session = this.currentCanvasView === view && bound !== null && bound.view === view ? bound : undefined;
    const authoring = session === undefined ? new CanvasAuthoring(view) : undefined;
    try {
      const before = session?.actionSnapshot() ?? authoring?.readSnapshot().document;
      if (before === undefined) return { status: "snapshot-unavailable", diagnostics: [] };
      const plan = planBoardLinkRename(before, { sourcePath: file.path, oldPath, newPath, folder, preRename: knowledge });
      if (!plan.ok) return { status: plan.reason, diagnostics: [] };
      const diagnostics = plan.diagnostics.map((diagnostic) => diagnostic.code);
      if (!plan.changed) return { status: "noop", diagnostics };
      if (session !== undefined) return { status: session.applyFeatureDocument(plan.document, before, true) ? "applied" : "native-feature-refused", diagnostics };
      const result = authoring!.applyDocument(plan.document, before);
      return { status: result.ok ? "applied" : "native-feature-refused", diagnostics: [...diagnostics, ...result.diagnostics.map((diagnostic) => diagnostic.code)] };
    } catch { return { status: "native-feature-failed", diagnostics: [] }; }
    finally { authoring?.dispose(); }
  }

  private startBoardIntegration(): void {
    if (this.shellDisposed || this.cardResolver !== undefined) return;
    this.configureBoardIndex();
    const resolver = new BoardCardResolver({
      resolvePath: (link, source) => this.app.metadataCache.getFirstLinkpathDest(link, source)?.path,
      stat: (path) => {
        const file = this.app.vault.getAbstractFileByPath(path);
        return file instanceof TFile ? { mtime: file.stat.mtime, size: file.stat.size } : undefined;
      },
      read: async (path, signal) => {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (signal.aborted || !(file instanceof TFile)) throw new Error("Card board unavailable");
        return this.app.vault.cachedRead(file);
      },
    });
    this.cardResolver = resolver;
    const render = async (text: string, context: import("./board-card-links").CardRenderContext): Promise<void> => {
      const component = new Component();
      component.load();
      context.registerCleanup(() => component.unload());
      if (!context.signal.aborted) await MarkdownRenderer.render(this.app, text, context.container, context.sourcePath, component);
    };
    const labels = words().enhancements.cardEmbed;
    const embeds = new BoardCardEmbeds(resolver, {
      labels: { ...labels, error: () => labels.error },
      renderMarkdown: render,
      renderFile: async (path, subpath, context) => {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile) || context.signal.aborted) return false;
        await render(`![[${path}${subpath}]]`, context);
        return true;
      },
    });
    this.cardEmbeds = embeds;
    const creator = installCanvasCardEmbedCreator(this.app, {
      Component,
      create: (request) => new class extends Component {
        public async loadFile(): Promise<void> {
          if (request.signal.aborted) return;
          const context = request.context;
          const handle = embeds.mountNative(context.containerEl, context.linktext, context.sourcePath, context.depth, request.registerCleanup);
          if (handle === undefined) {
            context.containerEl.textContent = words().enhancements.cardEmbed.error;
            return;
          }
          this.register(() => handle.dispose());
          request.registerCleanup(() => handle.dispose());
          await handle.ready;
        }
      }(),
      onError: (request) => { request.context.containerEl.textContent = words().enhancements.cardEmbed.error; },
    });
    this.cardCreatorCleanup = creator.dispose;
    const opener = installCanvasCardLinkOpener(this.app.workspace, resolver, () => new Notice(words().enhancements.cardEmbed.error));
    this.cardLinkCleanup = opener.dispose;
    this.registerMarkdownPostProcessor((element, context) => {
      for (const handle of embeds.postprocess(element, context.sourcePath)) {
        const child = new class extends MarkdownRenderChild {
          override onunload(): void { handle.dispose(); }
        }(handle.element);
        context.addChild(child);
      }
    });
    const changed = (path: string): void => {
      resolver.invalidate(path);
      void embeds.refresh();
    };
    this.registerEvent(this.app.vault.on("modify", (file) => changed(file.path)));
    this.registerEvent(this.app.vault.on("delete", (file) => changed(file.path)));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => { changed(oldPath); changed(file.path); }));
  }

  private disposeShell(): void {
    if (this.shellDisposed) {
      return;
    }

    this.shellDisposed = true;
    if (this.relationTimer !== undefined) window.clearTimeout(this.relationTimer);
    this.relationTimer = undefined;
    for (const modal of [...this.enhancementModals]) modal.close();
    this.cardLinkCleanup?.();
    this.cardCreatorCleanup?.();
    this.cardEmbeds?.dispose();
    this.cardResolver?.dispose();
    this.outgoingLinks?.dispose();
    this.backlinks?.dispose();
    this.propertyResults?.dispose();
    this.boardIndex?.dispose();
    for (const controller of this.exportJobs) controller.abort();
    this.exportJobs.clear();
    if (this.initializationRetry !== null) this.initializationTimerHost.clearTimeout(this.initializationRetry);
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
    this.currentCanvasBinding = null;
    this.advancedInspection = null;
    this.statusBarItem?.remove();
    this.statusBarItem = null;
  }
}
