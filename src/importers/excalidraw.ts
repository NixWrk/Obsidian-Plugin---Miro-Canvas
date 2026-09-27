/**
 * An Excalidraw drawing, a plain .excalidraw file or the Excalidraw plugin's .excalidraw.md note: shapes, text, lines, pen strokes, frames and pictures as cards and lines.
 *
 * Not written yet: `detect` says no to every file, so the importer never
 * offers this format and `convert` is never reached.
 */

import type { FormatAdapter } from "./types";

export const excalidrawAdapter: FormatAdapter = {
	id: "excalidraw",
	detect: () => false,
	convert: () => {
		throw new Error("import: the excalidraw importer is not written yet");
	},
};
