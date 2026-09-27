/**
 * Every importer the plugin has, and the one a file belongs to.
 *
 * `mayImport` is the cheap question the file menu and the command ask of
 * every file - its extension and its properties only, never its text - and
 * `findAdapter` the real one, asked of the text once a person chose to
 * import: a ".canvas" is offered whatever it holds, and its contents decide.
 */

import { advancedCanvasAdapter } from "./advanced-canvas";
import { excalidrawAdapter } from "./excalidraw";
import { markmindRichAdapter } from "./markmind-rich";
import { mindmapOutlineAdapter } from "./mindmap-outline";
import type { FormatAdapter, ImportSource } from "./types";

/** In the order they are asked; the first whose `detect` says yes imports the file. */
export const IMPORT_ADAPTERS: readonly FormatAdapter[] = Object.freeze([
	advancedCanvasAdapter,
	excalidrawAdapter,
	mindmapOutlineAdapter,
	markmindRichAdapter,
]);

/** The note properties the Excalidraw and mind-map plugins mark their notes with. */
const IMPORTABLE_PROPERTIES = ["excalidraw-plugin", "mindmap-plugin"] as const;

/**
 * Whether a file may be offered for import: a plain Excalidraw file, any
 * Canvas board, or a note the Excalidraw or a mind-map plugin marked as its
 * own.
 */
export function mayImport(extension: string, frontmatter?: Readonly<Record<string, unknown>> | null): boolean {
	const lower = extension.toLowerCase();
	if (lower === "excalidraw" || lower === "canvas") return true;
	if (lower !== "md" || frontmatter === undefined || frontmatter === null) return false;
	return IMPORTABLE_PROPERTIES.some((key) => Object.prototype.hasOwnProperty.call(frontmatter, key));
}

/** The importer for this source, or undefined when none recognises it.  An importer that throws while looking counts as a no. */
export function findAdapter(source: ImportSource, adapters: readonly FormatAdapter[] = IMPORT_ADAPTERS): FormatAdapter | undefined {
	for (const adapter of adapters) {
		let recognised = false;
		try {
			recognised = adapter.detect(source);
		} catch {
			recognised = false;
		}
		if (recognised) return adapter;
	}
	return undefined;
}
