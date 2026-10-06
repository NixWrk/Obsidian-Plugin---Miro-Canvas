import path from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

import { REPOSITORY_ROOT } from "./helpers";

const eslint = new ESLint({
	cwd: REPOSITORY_ROOT,
	overrideConfigFile: path.join(REPOSITORY_ROOT, "mcp/eslint.config.mjs"),
	// Repeated lintText fixtures need the updated project, including under CI=true.
	overrideConfig: {
		files: ["mcp/src/**/*.ts"],
		languageOptions: { parserOptions: { disallowAutomaticSingleRunInference: true } },
	},
	cache: false,
});

async function lint(source: string, module = "server"): Promise<string[]> {
	const results = await eslint.lintText(source, { filePath: path.join(REPOSITORY_ROOT, `mcp/src/${module}.ts`) });
	return results.flatMap(result => result.messages.map(message => message.ruleId ?? "parser-error"));
}

describe("enforced standalone Node lint runtime", () => {
	it("accepts required Node APIs and exact stderr redirects", async () => {
		expect(await lint('import { randomBytes } from "node:crypto"; export const id = randomBytes(8); console.log = console.error; console.info = console.error; console.debug = console.error;')).toEqual([]);
		expect(await lint('export const DEFAULT_CONFIG_DIR = ".obsidian";', "vault")).toEqual([]);
	}, 30000); // Loading the typed ESLint project is slower on a cold Windows CI host.

	it.each([
		'console.log("bad");',
		'console.info = console.log;',
		'console["log"] = console.error;',
		'const output = console; export { output };',
		'console.log = () => undefined;',
		'process.stdout.write("bad");',
		'process["stdout"].write("bad");',
	])("rejects unsafe stdout console use: %s", async source => {
		expect(await lint(source)).toContain("mcp-runtime/stdio");
	});

	it("rejects even exact redirects outside startup", async () => {
		expect(await lint("console.log = console.error;", "tools-edit")).toContain("mcp-runtime/stdio");
	});

	it.each([
		'import "node:http";',
		'import "dns/promises";',
		'import "obsidian";',
		'import "electron";',
		'export * from "node:net";',
		'void import("node:tls");',
		'require("node:child_process");',
		'void import("undici");',
	])("rejects forbidden module: %s", async source => {
		expect(await lint(source)).toContain("mcp-runtime/modules");
	});

	it.each([
		['export const folder = ".obsidian";', "mcp-runtime/config-path"],
		['async function noWait() { return 1; } export { noWait };', "@typescript-eslint/require-await"],
		['Promise.resolve(1);', "@typescript-eslint/no-floating-promises"],
		['export function same(value: string): string { return value as string; }', "@typescript-eslint/no-unnecessary-type-assertion"],
		['export const pattern = /[\\u0000-\\u001f]/;', "no-control-regex"],
		['eval("1");', "no-eval"],
		['void fetch("https://example.invalid");', "no-restricted-globals"],
		['void globalThis.fetch("https://example.invalid");', "no-restricted-properties"],
	])("keeps config/Promise/type/security enforcement: %s", async (source, rule) => {
		expect(await lint(source)).toContain(rule);
	});
});
