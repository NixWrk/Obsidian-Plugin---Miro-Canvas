/**
 * A mind map kept as an outline (`mindmap-plugin: basic`, Enhancing Mindmap and Markmind's outline mode): one card per heading or list item, joined parent to child and laid out as a tree.
 *
 * Not written yet: `detect` says no to every file, so the importer never
 * offers this format and `convert` is never reached.
 */

import type { FormatAdapter } from "./types";

export const mindmapOutlineAdapter: FormatAdapter = {
	id: "mindmap-outline",
	detect: () => false,
	convert: () => {
		throw new Error("import: the mindmap-outline importer is not written yet");
	},
};
