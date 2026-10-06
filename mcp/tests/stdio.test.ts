import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import esbuild from "esbuild";
import { beforeAll, describe, expect, it } from "vitest";

import { FIXTURES_DIR, REPOSITORY_ROOT } from "./helpers";

const artifacts = path.join(REPOSITORY_ROOT, "tools/obsidian_cdp/.out/l20-mcp");
const executable = path.join(artifacts, "stdio-server.mjs");

beforeAll(async () => {
	mkdirSync(artifacts, { recursive: true });
	const url = pathToFileURL(path.join(REPOSITORY_ROOT, "esbuild.mcp.mjs")).href;
	const { mcpBuildOptions } = await import(/* @vite-ignore */ url);
	const result = await esbuild.build({ ...mcpBuildOptions(REPOSITORY_ROOT), outfile: executable, write: false, metafile: true, logLevel: "silent" });
	const output = result.outputFiles?.[0];
	if (output === undefined) throw new Error("The isolated stdio build produced no executable.");
	writeFileSync(executable, output.contents);
	writeFileSync(path.join(artifacts, "stdio-bundle-metafile.json"), JSON.stringify(result.metafile, null, 2));
});

function makeProcessVault(configDir: string): string {
	const root = mkdtempSync(path.join(artifacts, "stdio-vault-"));
	mkdirSync(path.join(root, configDir), { recursive: true });
	const document = JSON.parse(readFileSync(path.join(FIXTURES_DIR, "valid/plugin-authored-board.canvas"), "utf8"));
	document.futureProcessField = { sentinel: "keep-root" };
	document.nodes[0].futureProcessField = { sentinel: "keep-node" };
	document.miroCanvas.futureProcessField = { sentinel: "keep-metadata" };
	writeFileSync(path.join(root, "board.canvas"), JSON.stringify(document));
	writeFileSync(path.join(root, configDir, "private.canvas"), "{}");
	writeFileSync(path.join(root, configDir, "workspace.json"), JSON.stringify({ type: "canvas", state: { file: "board.canvas" } }));
	return root;
}

function request(id: number, method: string, params?: unknown) {
	return { jsonrpc: "2.0", id, method, ...(params === undefined ? {} : { params }) };
}

function call(id: number, name: string, args: Record<string, unknown>) {
	return request(id, "tools/call", { name, arguments: args });
}

function run(label: string, argv: string[], messages: unknown[]) {
	const result = spawnSync(process.execPath, [executable, ...argv], {
		input: messages.map(message => JSON.stringify(message)).join("\n") + "\n",
		encoding: "utf8", timeout: 10_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true,
	});
	if (result.error) throw result.error;
	writeFileSync(path.join(artifacts, `stdio-${label}.stdout.txt`), result.stdout);
	writeFileSync(path.join(artifacts, `stdio-${label}.stderr.txt`), result.stderr);
	const answers = result.stdout.split("\n").filter(Boolean).map(line => JSON.parse(line));
	return { ...result, answers };
}

describe("real bounded MCP stdio processes", () => {
	for (const configDir of [".obsidian", "Config", "private/settings"]) {
		it(`reads, edits, protects paths and rejects stale writes with ${configDir}`, () => {
			const root = makeProcessVault(configDir);
			const file = path.join(root, "board.canvas");
			const before = JSON.parse(readFileSync(file, "utf8"));
			const revision = createHash("sha256").update(readFileSync(file)).digest("hex");
			const argv = ["--vault", root];
			if (configDir === "Config") argv.push(`--config-dir=${configDir}`);
			if (configDir === "private/settings") argv.push("--config-dir", configDir);
			const result = run(configDir.replace(/[/.]/g, "_"), argv, [
				request(1, "initialize", { protocolVersion: "2025-06-18" }),
				{ jsonrpc: "2.0", method: "notifications/initialized" },
				request(2, "tools/list"),
				call(3, "list_boards", {}),
				call(4, "read_board", { path: "board.canvas" }),
				call(5, "update_node", { path: "board.canvas", id: "card-1", text: "process updated", expectedRevision: revision }),
				call(6, "update_node", { path: "board.canvas", id: "card-1", text: "stale", expectedRevision: revision }),
				call(7, "lock", { path: "board.canvas", ids: ["card-1"], locked: true }),
				call(8, "update_node", { path: "board.canvas", id: "card-1", text: "locked" }),
				call(9, "read_board", { path: `${configDir}/private.canvas` }),
				call(10, "read_board", { path: "../outside.canvas" }),
				request(11, "unknown/method"),
			]);
			expect(result.status).toBe(0);
			expect(result.stderr).toMatch(/^miro-canvas-mcp [^\n]+: vault /);
			expect(result.answers.map(answer => answer.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
			expect(result.answers.every(answer => answer.jsonrpc === "2.0")).toBe(true);
			expect(result.answers[2].result.structuredContent.boards.map((board: { path: string }) => board.path)).toEqual(["board.canvas"]);
			expect(result.answers[4].result.structuredContent.status).toBe("applied");
			expect(result.answers[4].result.structuredContent.warnings.map((warning: { code: string }) => warning.code)).toContain("open-in-obsidian");
			expect(result.answers[5].result.structuredContent.diagnostics[0].code).toBe("stale-board");
			expect(result.answers[7].result.isError).toBe(true);
			expect(result.answers[8].result.content[0].text).toMatch(/^path-protected:/);
			expect(result.answers[9].result.content[0].text).toMatch(/^path-invalid:/);
			expect(result.answers[10].error.code).toBe(-32601);
			const after = JSON.parse(readFileSync(file, "utf8"));
			expect(after.nodes.find((node: { id: string }) => node.id === "card-1").text).toBe("process updated");
			expect(after.miroSource).toStrictEqual(before.miroSource);
			expect(after.futureProcessField).toStrictEqual(before.futureProcessField);
			expect(after.nodes[0].futureProcessField).toStrictEqual(before.nodes[0].futureProcessField);
			expect(after.miroCanvas.futureProcessField).toStrictEqual(before.miroCanvas.futureProcessField);
		}, 15_000);
	}

	it("advertises only reads in a custom-config read-only process", () => {
		const root = makeProcessVault("Config");
		const before = readFileSync(path.join(root, "board.canvas"));
		const result = run("readonly", ["--vault", root, "--config-dir", "Config", "--read-only"], [request(1, "tools/list"), call(2, "update_node", { path: "board.canvas", id: "card-1", text: "blocked" })]);
		expect(result.status).toBe(0);
		expect(result.answers[0].result.tools.map((tool: { name: string }) => tool.name)).toEqual(["list_boards", "read_board", "validate_board"]);
		expect(result.answers[1].error.code).toBe(-32602);
		expect(readFileSync(path.join(root, "board.canvas")).equals(before)).toBe(true);
	});

	it.each([[], ["--config-dir"], ["--config-dir", "--read-only"], ["--config-dir="], ["--config-dir", "../outside"], ["--config-dir", "missing"]].map(extra => ({ extra })))("keeps startup errors on stderr for args $extra", ({ extra }) => {
		const root = makeProcessVault("Config");
		const result = run(`invalid-${extra.join("_").replace(/[^a-zA-Z0-9]/g, "_")}`, ["--vault", root, ...extra], [request(1, "ping")]);
		expect(result.status).toBe(2);
		expect(result.stdout).toBe("");
		expect(result.stderr).toMatch(/^miro-canvas-mcp:/);
	});
});
