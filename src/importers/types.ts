/**
 * The shapes every importer shares: the file it reads, what it may ask of
 * the vault, what it hands back, and the report of what it could not bring.
 *
 * An importer is pure.  It never imports "obsidian", never writes a file and
 * never reads one but the source it is given; the vault is reached only
 * through `ImportContext.resolveLink`, and the board it builds goes back to
 * `import-command.ts`, which alone creates the file.
 *
 * `ImportReport` already has the shape a future `miroCanvas.imports[]`
 * record would take (the proposal for miro2obsidian's schema), so the day
 * the schema carries it the report can be written as it is.
 */

/** The formats a board can be imported from, by the importer's own name. */
export const IMPORT_FORMATS = ["advanced-canvas", "excalidraw", "mindmap-outline", "markmind-rich"] as const;
export type ImportFormat = (typeof IMPORT_FORMATS)[number];

/** The file being imported, as read once from the vault; never written back. */
export interface ImportSource {
	/** The vault path of the source file. */
	readonly path: string;
	/** Its extension, lower case and without the dot ("md", "excalidraw", "canvas"). */
	readonly extension: string;
	/** Its whole text. */
	readonly text: string;
	/** A note's properties, as Obsidian parsed them; absent for anything that is not a note. */
	readonly frontmatter?: Readonly<Record<string, unknown>>;
}

/** What an importer may ask of the world around it. */
export interface ImportContext {
	/** The plugin's version, written into the report. */
	readonly importerVersion: string;
	/** The moment of the import, as an ISO timestamp; fixed for the whole import so two runs compare equal. */
	readonly now: string;
	/** A new element id, as native Canvas makes one. */
	readonly newId: () => string;
	/** The vault path a link in the source points at, seen from `from`; undefined when no such file exists. */
	readonly resolveLink: (link: string, from: string) => string | undefined;
}

/**
 * How an element of the source fared, in the vocabulary of LIMIT-002.
 *
 * - `approximated`: on the board, but not exactly as it was;
 * - `unsupported`: a board has nothing to show it with;
 * - `source-limited`: the source itself does not say enough (a mind map has no positions);
 * - `missing-asset`: it points at a file that is not in the vault;
 * - `invalid-source`: its data could not be read;
 * - `plugin-unsupported`: a board could show it, but the plugin does not yet;
 * - `skipped`: deliberately left out (deleted in the source).
 */
export const IMPORT_ENTRY_STATUSES = [
	"approximated",
	"unsupported",
	"source-limited",
	"missing-asset",
	"invalid-source",
	"plugin-unsupported",
	"skipped",
] as const;
export type ImportEntryStatus = (typeof IMPORT_ENTRY_STATUSES)[number];

/**
 * Why an entry is in the report, as a stable code.  Each code has its words
 * under `importer.reasons` in every locale, so the report card reads in the
 * person's language while the code itself stays the same.
 */
export const IMPORT_REASONS = [
	// Excalidraw
	"roughness",
	"hatch",
	"groups",
	"opacity",
	"imageCrop",
	"background",
	"embed",
	"iframe",
	"formula",
	"embeddedImage",
	"imageNotFound",
	"elementLink",
	"arrowhead",
	"unknownElement",
	"invalidElement",
	"deleted",
	// Mind maps
	"layout",
	"frontmatter",
	"textBeforeRoot",
	"extraRoots",
	// Advanced Canvas
	"portal",
	"portalEdge",
	"collapsed",
	"customStyle",
	"longDash",
	"pathfinding",
	"branchingDeck",
	"existingOverride",
	// A whole file that cannot be imported
	"unreadableData",
	"unknownStructure",
	"tooLarge",
] as const;
export type ImportReason = (typeof IMPORT_REASONS)[number];

/** One element of the source that was approximated or left out. */
export interface ImportEntry {
	/** The element's id in the source, or the name of a kind of setting counted once ("roughness"). */
	readonly sourceId: string;
	/** What the element is, in the source's own words ("rectangle", "iframe", "heading"). */
	readonly sourceType: string;
	readonly status: ImportEntryStatus;
	readonly reason: ImportReason;
	/** The card that stands for it on the board, when there is one (an approximation, a placeholder). */
	readonly nodeId?: string;
}

/**
 * How many elements ended up where.  An element counts once: converted when
 * it came over exactly, otherwise under its entry.
 */
export interface ImportCounts {
	/** Elements on the board exactly as they were. */
	readonly converted: number;
	/** Entries with status `approximated`. */
	readonly approximated: number;
	/** Entries with any status but `approximated` and `skipped`. */
	readonly notImported: number;
	/** Elements deliberately left out: `skipped` entries and elements only counted. */
	readonly skipped: number;
}

/** The most entries a report keeps, as the `imports[]` proposal caps them. */
export const MAX_IMPORT_ENTRIES = 10_000;

/** The record of one import: the shape of a future `miroCanvas.imports[]` entry. */
export interface ImportReport {
	readonly id: string;
	readonly format: ImportFormat;
	/** The source format's own version, where it has one ("2" for Excalidraw, "basic" for a mind map). */
	readonly formatVersion?: string;
	readonly sourcePath: string;
	/** The plugin that imported it: always "miro-canvas". */
	readonly importer: string;
	readonly importerVersion: string;
	/** ISO timestamp. */
	readonly importedAt: string;
	/** The report card on the board, when the person asked for one. */
	readonly reportNodeId?: string;
	readonly counts: ImportCounts;
	/** At most `MAX_IMPORT_ENTRIES`; `counts` still counts every one. */
	readonly entries: readonly ImportEntry[];
}

/** A board built from a source, not yet written: a JSON Canvas document and its report. */
export interface ImportResult {
	readonly document: Record<string, unknown>;
	readonly report: ImportReport;
}

/** One importer: whether a source is its format, and the board it makes of one. */
export interface FormatAdapter {
	readonly id: ImportFormat;
	/** Whether the source is this importer's format; never throws. */
	readonly detect: (source: ImportSource) => boolean;
	/** The board; throws `ImportError` when the source is this format but cannot be read. */
	readonly convert: (source: ImportSource, context: ImportContext) => ImportResult;
}

/** A source of the right format whose contents cannot be read; no board is made. */
export class ImportError extends Error {
	readonly reason: ImportReason;

	constructor(reason: ImportReason, detail?: string) {
		super(detail === undefined ? `import failed: ${reason}` : `import failed: ${reason} (${detail})`);
		this.name = "ImportError";
		this.reason = reason;
	}
}
