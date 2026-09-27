/**
 * An Advanced Canvas board: a copy of the whole board, every field kept, with Advanced Canvas's styles written again as the plugin's own overrides.
 *
 * Not written yet: `detect` says no to every file, so the importer never
 * offers this format and `convert` is never reached.
 */

import type { FormatAdapter } from "./types";

export const advancedCanvasAdapter: FormatAdapter = {
	id: "advanced-canvas",
	detect: () => false,
	convert: () => {
		throw new Error("import: the advanced-canvas importer is not written yet");
	},
};
