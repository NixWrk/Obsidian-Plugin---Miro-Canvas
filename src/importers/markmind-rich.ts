/**
 * A Markmind mind map in its rich form (any other `mindmap-plugin` value): read only from a real file's fields, named in its fixture.
 *
 * Not written yet: `detect` says no to every file, so the importer never
 * offers this format and `convert` is never reached.
 */

import type { FormatAdapter } from "./types";

export const markmindRichAdapter: FormatAdapter = {
	id: "markmind-rich",
	detect: () => false,
	convert: () => {
		throw new Error("import: the markmind-rich importer is not written yet");
	},
};
