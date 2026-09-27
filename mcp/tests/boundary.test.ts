/**
 * What each bundle may carry.  The server is plain Node: nothing of Obsidian,
 * of the plugin's session or settings, and no network module.  The plugin
 * gains nothing from the server: no mcp/ source and no ajv in main.js.
 */

import path from "node:path";
import { pathToFileURL } from "node:url";
import esbuild, { type Metafile } from "esbuild";
import { describe, expect, it } from "vitest";

import { REPOSITORY_ROOT } from "./helpers";

const NETWORK_MODULES = ["http", "https", "net", "tls", "dgram", "http2", "dns"];

function normalise(file: string): string {
	return file.split(path.sep).join("/");
}

async function serverMetafile(): Promise<Metafile> {
	const url = pathToFileURL(path.join(REPOSITORY_ROOT, "esbuild.mcp.mjs")).href;
	const { mcpBuildOptions } = await import(/* @vite-ignore */ url);
	const result = await esbuild.build({ ...mcpBuildOptions(REPOSITORY_ROOT), write: false, metafile: true, logLevel: "silent" });
	return result.metafile!;
}

/** The plugin's build as esbuild.config.mjs makes it, without writing main.js. */
async function pluginMetafile(): Promise<Metafile> {
	const result = await esbuild.build({
		entryPoints: [path.join(REPOSITORY_ROOT, "src", "main.ts")],
		outfile: path.join(REPOSITORY_ROOT, "main.js"),
		bundle: true,
		platform: "browser",
		format: "cjs",
		target: "es2020",
		external: ["obsidian", "electron"],
		write: false,
		metafile: true,
		logLevel: "silent",
	});
	return result.metafile!;
}

describe("the server bundle", () => {
	it("carries nothing of Obsidian, the plugin's session, main.ts or the settings tab", async () => {
		const metafile = await serverMetafile();
		const inputs = Object.keys(metafile.inputs).map(normalise);
		expect(inputs).toContain("mcp/src/server.ts");
		expect(inputs.some((input) => input.includes("node_modules/ajv/"))).toBe(true);
		for (const forbidden of ["src/m1-session.ts", "src/main.ts", "src/settings-tab.ts", "src/obsidian-document-host.ts", "src/welcome-board.ts"]) {
			expect(inputs).not.toContain(forbidden);
		}
		expect(inputs.some((input) => input.includes("node_modules/obsidian/"))).toBe(false);
	}, 60_000);

	it("imports no network module", async () => {
		const metafile = await serverMetafile();
		const external = Object.values(metafile.outputs).flatMap((output) => output.imports.filter((item) => item.external).map((item) => item.path));
		for (const name of NETWORK_MODULES) {
			expect(external).not.toContain(name);
			expect(external).not.toContain(`node:${name}`);
		}
	}, 60_000);

	it("refuses to build when the server reaches for Obsidian", async () => {
		const url = pathToFileURL(path.join(REPOSITORY_ROOT, "esbuild.mcp.mjs")).href;
		const { noObsidianPlugin } = await import(/* @vite-ignore */ url);
		const attempt = esbuild.build({
			stdin: { contents: "import 'obsidian';", resolveDir: REPOSITORY_ROOT, loader: "ts" },
			bundle: true,
			write: false,
			platform: "node",
			plugins: [noObsidianPlugin],
			logLevel: "silent",
		});
		await expect(attempt).rejects.toThrow(/must not import 'obsidian'/);
	}, 60_000);
});

describe("the plugin bundle", () => {
	it("gains nothing from the server: no mcp/ source and no ajv", async () => {
		const metafile = await pluginMetafile();
		const inputs = Object.keys(metafile.inputs).map(normalise);
		expect(inputs).toContain("src/main.ts");
		expect(inputs.some((input) => input.startsWith("mcp/"))).toBe(false);
		expect(inputs.some((input) => input.includes("node_modules/ajv/"))).toBe(false);
		expect(inputs.some((input) => input.startsWith("schema/"))).toBe(false);
	}, 60_000);
});
