/**
 * "Import into a board": the Obsidian side of the importers.
 *
 * Reads the source once (`cachedRead`: the source is only ever read), asks
 * the importers which of them it belongs to, builds the board in memory,
 * shows what was found and where the board will go, and on the person's
 * press creates one new file and opens it.  The import is that single
 * creation: no file is ever modified or overwritten, the source least of
 * all, and undoing it is deleting the new board.
 *
 * Everything Obsidian lends - the vault, the workspace, notices, the modal -
 * comes in through `ImportHost`, as `WelcomeBoardHost` does for the welcome
 * board, so this module never imports "obsidian" as a value.
 */

import type { App, Modal, TFile } from "obsidian";

import { words } from "./i18n";
import {
	addReportCard,
	idFactory,
	importEntryWhy,
	importFormatLabel,
	importFormatName,
	importReasonName,
} from "./importers/board-builder";
import { IMPORT_ADAPTERS, findAdapter, mayImport } from "./importers/registry";
import { importTargetPath } from "./importers/target-path";
import { ImportError, type FormatAdapter, type ImportContext, type ImportReport, type ImportResult, type ImportSource } from "./importers/types";

/** What the preview shows before anything is written. */
export interface ImportPreview {
	/** The format found, with its version: "Excalidraw drawing, version 2". */
	readonly formatLabel: string;
	/** Where the new board will be created. */
	readonly targetPath: string;
	readonly report: ImportReport;
}

/** What the person chose in the preview. */
export interface ImportChoice {
	/** Whether the board gets a card with the import report. */
	readonly reportCard: boolean;
}

export interface ImportHost {
	readonly app: App;
	/** The `instanceof TFile` check, passed in so this module never has to import "obsidian" at runtime. */
	readonly isFile: (value: unknown) => value is TFile;
	/** Obsidian's own path normalisation, lent the same way; a plain slash cleanup when absent. */
	readonly normalizePath?: (path: string) => string;
	/** The plugin's version, written into the report. */
	readonly pluginVersion: string;
	readonly notice: (message: string) => void;
	/** Shows the preview; resolves with the person's choice, or null when they cancel or close it. */
	readonly confirm: (preview: ImportPreview) => Promise<ImportChoice | null>;
	/** The importers to ask; every importer the plugin has unless a test lends its own. */
	readonly adapters?: readonly FormatAdapter[];
	/** The clock; the real one unless a test fixes it. */
	readonly now?: () => Date;
	/** Seeds the new board's ids; random unless a test fixes it. */
	readonly seed?: number;
}

/** How many entries the preview lists; the report card lists the rest. */
const PREVIEW_ENTRIES = 20;

/** The slash cleanup `normalizePath` does, for a host that has not lent the real one. */
function fallbackNormalizePath(path: string): string {
	return path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/+|\/+$/g, "");
}

/** Whether a file may be offered for import, by its extension and a note's properties - never its text. */
export function canImportFile(app: App, file: TFile): boolean {
	const isNote = file.extension.toLowerCase() === "md";
	const frontmatter = isNote ? app.metadataCache.getFileCache(file)?.frontmatter : undefined;
	return mayImport(file.extension, frontmatter);
}

/**
 * Creates the board at the first free name.  Should the name be taken
 * between the preview and the press (another window, a sync), the next free
 * name is tried once; a file already there is never written over.
 */
async function createBoard(host: ImportHost, sourcePath: string, content: string): Promise<TFile> {
	const normalize = host.normalizePath ?? fallbackNormalizePath;
	const exists = (path: string): boolean => host.app.vault.getAbstractFileByPath(normalize(path)) !== null;
	const word = words().importer.boardSuffix;
	const first = normalize(importTargetPath(sourcePath, exists, word));
	try {
		return await host.app.vault.create(first, content);
	} catch (error) {
		if (!exists(first)) throw error;
		const second = normalize(importTargetPath(sourcePath, exists, word));
		return await host.app.vault.create(second, content);
	}
}

/**
 * Imports one file into a new board: read, recognise, build, preview,
 * create, open.  Resolves with the new board, or null when nothing was
 * created (not recognised, nothing to import, cancelled, failed) - each
 * with its notice.
 */
export async function importIntoBoard(host: ImportHost, file: TFile): Promise<TFile | null> {
	const strings = words().importer;
	const normalize = host.normalizePath ?? fallbackNormalizePath;

	let text: string;
	try {
		text = await host.app.vault.cachedRead(file);
	} catch {
		host.notice(strings.readFailed);
		return null;
	}
	const isNote = file.extension.toLowerCase() === "md";
	const frontmatter = isNote ? host.app.metadataCache.getFileCache(file)?.frontmatter : undefined;
	const source: ImportSource = {
		path: file.path,
		extension: file.extension.toLowerCase(),
		text,
		...(frontmatter === undefined ? {} : { frontmatter }),
	};

	const adapter = findAdapter(source, host.adapters ?? IMPORT_ADAPTERS);
	if (adapter === undefined) {
		host.notice(strings.notRecognised);
		return null;
	}

	const newId = idFactory(host.seed ?? Math.floor(Math.random() * 0x1_0000_0000));
	const context: ImportContext = {
		importerVersion: host.pluginVersion,
		now: (host.now?.() ?? new Date()).toISOString(),
		newId,
		resolveLink: (link, from) => host.app.metadataCache.getFirstLinkpathDest(link, from)?.path,
	};
	let result: ImportResult;
	try {
		result = adapter.convert(source, context);
	} catch (error) {
		if (error instanceof ImportError) {
			host.notice(strings.invalid(importFormatName(adapter.id), importReasonName(error.reason)));
		} else {
			console.error("[miro-canvas] import failed while reading the source", error);
			host.notice(strings.failed);
		}
		return null;
	}
	const nodes = result.document.nodes;
	const edges = result.document.edges;
	const empty = (!Array.isArray(nodes) || nodes.length === 0) && (!Array.isArray(edges) || edges.length === 0);
	if (empty) {
		host.notice(strings.nothingToImport);
		return null;
	}

	const exists = (path: string): boolean => host.app.vault.getAbstractFileByPath(normalize(path)) !== null;
	const targetPath = normalize(importTargetPath(source.path, exists, strings.boardSuffix));
	const choice = await host.confirm({ formatLabel: importFormatLabel(result.report), targetPath, report: result.report });
	if (choice === null) return null;

	let board: TFile;
	try {
		const finished = choice.reportCard ? addReportCard(result, newId) : result;
		board = await createBoard(host, source.path, JSON.stringify(finished.document, null, "\t"));
	} catch (error) {
		console.error("[miro-canvas] import failed while creating the board", error);
		host.notice(strings.failed);
		return null;
	}
	host.notice(strings.created(board.path));
	try {
		const leaf = host.app.workspace.getLeaf("tab");
		await leaf.openFile(board, { active: true });
	} catch (error) {
		// The board is there all the same; only opening it went wrong.
		console.error("[miro-canvas] the imported board could not be opened", error);
	}
	return board;
}

/** One row of the preview's short table: what, its id, and why. */
function appendEntryRow(body: HTMLElement, cells: readonly string[], tag: "td" | "th"): void {
	const row = body.createEl("tr");
	// A long id is cut short in its cell; hovering it shows it whole.
	for (const cell of cells) row.createEl(tag, { text: cell, attr: { title: cell } });
}

/**
 * The preview (MIGRATE-003) in the modal it is given: the format found,
 * where the board will go, how many elements came over and how, the first
 * entries of the report, whether to add the report card, and Create or
 * Cancel.  Resolves with the choice, or null however else the modal closes.
 */
export function showImportPreview(modal: Modal, preview: ImportPreview): Promise<ImportChoice | null> {
	const strings = words().importer;
	const reportWords = strings.report;
	const { counts } = preview.report;
	return new Promise((resolve) => {
		modal.modalEl.classList.add("miro-canvas-import-preview-modal");
		modal.setTitle(strings.previewTitle);
		const content = modal.contentEl;
		content.classList.add("miro-canvas-import-preview");
		const summary = content.createDiv({ cls: "miro-canvas-import-preview__summary" });
		summary.createEl("p", { text: strings.formatLine(preview.formatLabel) });
		summary.createEl("p", { text: strings.targetLine(preview.targetPath) });
		summary.createEl("p", { text: strings.countsLine(counts.converted, counts.approximated, counts.notImported) });
		if (counts.skipped > 0) summary.createEl("p", { text: strings.skippedLine(counts.skipped) });

		// The first entries, so a person sees what will not look the same
		// before anything is written; the report card has them all.  The
		// table scrolls on its own, so Create stays in view.
		const listed = preview.report.entries.filter((entry) => entry.status !== "skipped");
		if (listed.length > 0) {
			content.createEl("h4", { text: strings.entriesHeading });
			const scroller = content.createDiv({ cls: "miro-canvas-import-preview__entries-scroll" });
			const table = scroller.createEl("table", { cls: "miro-canvas-import-preview__entries" });
			appendEntryRow(table.createEl("thead"), [reportWords.what, reportWords.id, reportWords.why], "th");
			const body = table.createEl("tbody");
			for (const entry of listed.slice(0, PREVIEW_ENTRIES)) {
				appendEntryRow(body, [entry.sourceType, entry.sourceId, importEntryWhy(entry)], "td");
			}
			const more = counts.approximated + counts.notImported - Math.min(listed.length, PREVIEW_ENTRIES);
			if (more > 0) content.createEl("p", { text: reportWords.more(more), cls: "miro-canvas-import-preview__more" });
		}

		content.createEl("p", { text: strings.originalUnchanged, cls: "miro-canvas-import-preview__note" });
		const label = content.createEl("label", { cls: "miro-canvas-import-preview__report-card" });
		const checkbox = label.createEl("input", { type: "checkbox" });
		checkbox.checked = true;
		label.appendText(` ${strings.reportCardCheckbox}`);

		const buttons = content.createDiv({ cls: "modal-button-container" });
		buttons.createEl("button", { text: strings.create, cls: "mod-cta" }).addEventListener("click", () => {
			resolve({ reportCard: checkbox.checked });
			modal.close();
		});
		buttons.createEl("button", { text: strings.cancel }).addEventListener("click", () => modal.close());
		// Escape, the close control and Cancel all end here; after Create the
		// promise is already settled and this changes nothing.
		modal.onClose = () => resolve(null);
		modal.open();
	});
}
