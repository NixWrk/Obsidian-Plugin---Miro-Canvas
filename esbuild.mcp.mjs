// Builds the MCP server an agent runs next to a vault:
//
//   node esbuild.mcp.mjs     mcp/src/server.ts -> mcp/dist/miro-canvas-mcp.mjs
//
// One file for Node 20 or later with everything inside it - ajv and the
// pinned schema too - so running it needs no install.  The plugin's build
// (esbuild.config.mjs) never sees mcp/, and this one fails the moment the
// server reaches for Obsidian or Electron: it must stay plain Node.
import esbuild from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

/** Refuses any import of Obsidian or Electron, however deep in the graph. */
export const noObsidianPlugin = {
	name: "no-obsidian",
	setup(build) {
		build.onResolve({ filter: /^(obsidian|electron)(\/.*)?$/ }, (args) => ({
			errors: [{ text: `The MCP server must not import '${args.path}' (from ${args.importer}).` }],
		}));
	},
};

/** The build options, shared with mcp/tests/boundary.test.ts. */
export function mcpBuildOptions(root = rootDir) {
	return {
		entryPoints: [path.join(root, "mcp", "src", "server.ts")],
		outfile: path.join(root, "mcp", "dist", "miro-canvas-mcp.mjs"),
		bundle: true,
		platform: "node",
		format: "esm",
		target: "node20",
		banner: { js: "#!/usr/bin/env node" },
		plugins: [noObsidianPlugin],
		legalComments: "none",
		logLevel: "info",
	};
}

// Build only when run, not when a test imports the options.
const spelling = (file) => (process.platform === "win32" ? file.toLowerCase() : file);
const invokedAs = process.argv[1] === undefined ? "" : spelling(path.resolve(process.argv[1]));
if (invokedAs === spelling(fileURLToPath(import.meta.url))) {
	await esbuild.build(mcpBuildOptions());
}
