import { mkdirSync, readFileSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { hasInvalidFilenameCharacter } from "../../src/control-characters";
import { boardOpenInObsidian, createServerTools } from "../src/tools-edit";
import { ToolError, Vault } from "../src/vault";
import { makeFixtureVault, makeVault, removeVaults } from "./helpers";

afterEach(removeVaults);

function refusal(action: () => unknown): string | undefined {
	try {
		action();
	} catch (error) {
		if (error instanceof ToolError) return error.code;
		throw error;
	}
	return undefined;
}

function customVault(configDir: string): { root: string; vault: Vault } {
	const root = makeFixtureVault();
	mkdirSync(path.join(root, configDir), { recursive: true });
	return { root, vault: Vault.open(root, configDir) };
}

function tools(vault: Vault, beforeWrite?: (file: string) => void) {
	const definitions = new Map(createServerTools({ vault, readOnly: false, beforeWrite }).map(tool => [tool.name, tool]));
	return (name: string, args: Record<string, unknown>): Record<string, any> => definitions.get(name)!.run(args);
}

describe("custom configuration directories", () => {
	it("opens a custom configuration without the default folder", () => {
		const root = makeVault();
		renameSync(path.join(root, ".obsidian"), path.join(root, "Config"));
		expect(Vault.open(root, "Config").configDir).toBe("Config");
		expect(refusal(() => Vault.open(root))).toBe("vault-invalid");
	});

	it.each(["Config", "private/settings", "private\\settings/"])("protects and skips %s without hiding sibling prefixes", configDir => {
		const normalized = configDir.split("\\").join("/").replace(/\/$/, "");
		const { root, vault } = customVault(normalized);
		const selected = Vault.open(root, configDir);
		expect(selected.configDir).toBe(normalized);
		writeFileSync(path.join(root, normalized, "secret.canvas"), "{}");
		mkdirSync(path.join(root, `${normalized}-other`), { recursive: true });
		writeFileSync(path.join(root, `${normalized}-other`, "public.canvas"), "{}");
		for (const folder of [normalized, normalized.toUpperCase(), ".obsidian", ".OBSIDIAN", ".trash"]) {
			expect(refusal(() => vault.resolveExisting(`${folder}/secret.canvas`, "board"))).toBe("path-protected");
			expect(refusal(() => vault.listBoards(folder))).toBe("path-protected");
			expect(refusal(() => vault.splitRelativePath(`${folder}/file.md`, "folder"))).toBe("path-protected");
		}
		const listed = vault.listBoards().map(board => board.path);
		expect(listed).not.toContain(`${normalized}/secret.canvas`);
		expect(listed).toContain(`${normalized}-other/public.canvas`);
	});

	it.each(["", "../settings", "/settings", "C:/settings", "a:settings", "a//settings", ".", "..", "NUL", "settings.", "settings ", " settings", "set\0tings", ".trash"])("refuses unsafe config %j", configDir => {
		expect(refusal(() => Vault.open(makeVault(), configDir))).toBeDefined();
	});

	it("refuses missing configuration or a file in its place", () => {
		const root = makeVault();
		writeFileSync(path.join(root, "config-file"), "{}");
		expect(refusal(() => Vault.open(root, "missing"))).toBe("vault-invalid");
		expect(refusal(() => Vault.open(root, "config-file"))).toBe("vault-invalid");
	});

	it("rejects config links and rechecks replaced config ancestors before workspace reads", () => {
		const { root, vault } = customVault("private/settings");
		const outside = makeVault();
		mkdirSync(path.join(outside, "settings"));
		writeFileSync(path.join(outside, "settings", "workspace.json"), JSON.stringify({ type: "canvas", state: { file: "boards/native-board.canvas" } }));
		symlinkSync(outside, path.join(root, "linked"), process.platform === "win32" ? "junction" : "dir");
		expect(refusal(() => Vault.open(root, "linked/settings"))).toBe("vault-invalid");
		renameSync(path.join(root, "private"), path.join(root, "old-private"));
		symlinkSync(outside, path.join(root, "private"), process.platform === "win32" ? "junction" : "dir");
		expect(refusal(() => vault.resolveConfigurationFile("workspace.json"))).toBe("path-link");
		expect(boardOpenInObsidian(vault, "boards/native-board.canvas")).toBe(false);
	});

	it.each(["workspace.json", "workspace-mobile.json"])("reads %s only from the selected config", name => {
		const { root, vault } = customVault("private/settings");
		const workspace = JSON.stringify({ type: "canvas", state: { file: "boards/native-board.canvas" } });
		writeFileSync(path.join(root, ".obsidian", name), workspace);
		expect(boardOpenInObsidian(vault, "boards/native-board.canvas")).toBe(false);
		writeFileSync(path.join(root, "private/settings", name), workspace);
		expect(boardOpenInObsidian(vault, "boards/native-board.canvas")).toBe(true);
		expect(refusal(() => vault.resolveConfigurationFile("../workspace.json"))).toBe("path-invalid");
	});

	it("keeps source, unknown fields, locks, dry runs and exact undo with custom config", () => {
		const { root, vault } = customVault("Config");
		const call = tools(vault);
		const board = "boards/future-fields-board.canvas";
		const file = path.join(root, board);
		const original = readFileSync(file);
		const before = JSON.parse(original.toString("utf8"));
		const read = call("read_board", { path: board });
		expect(call("update_node", { path: board, id: "n1", text: "dry", dryRun: true, expectedRevision: read.revision }).written).toBe(false);
		expect(readFileSync(file).equals(original)).toBe(true);
		expect(call("update_node", { path: board, id: "n1", text: "changed", expectedRevision: read.revision }).status).toBe("applied");
		const after = JSON.parse(readFileSync(file, "utf8"));
		const expected = structuredClone(before);
		expected.nodes[0].text = "changed";
		expect(after).toStrictEqual(expected);
		expect(call("undo_last", { path: board }).status).toBe("applied");
		expect(readFileSync(file).equals(original)).toBe(true);
		expect(call("lock", { path: board, ids: ["n1"], locked: true }).status).toBe("applied");
		const locked = readFileSync(file);
		expect(call("update_node", { path: board, id: "n1", text: "blocked" }).status).toBe("rejected");
		expect(readFileSync(file).equals(locked)).toBe(true);
		const protectedFile = call("add_card", { path: board, kind: "file", file: "Config/private.md", x: 0, y: 0 });
		expect(protectedFile.status).toBe("rejected");
		expect(protectedFile.diagnostics[0].code).toBe("path-protected");
		expect(readFileSync(file).equals(locked)).toBe(true);
	});

	it("keeps disk-stale rejection with a custom configuration", () => {
		const { root, vault } = customVault("Config");
		const board = "boards/native-board.canvas";
		const newer = '{"nodes":[],"edges":[]}';
		const call = tools(vault, file => writeFileSync(file, newer));
		const result = call("update_node", { path: board, id: "note-1", text: "late" });
		expect(result.status).toBe("rejected");
		expect(result.diagnostics[0].code).toBe("stale-board");
		expect(readFileSync(path.join(root, board), "utf8")).toBe(newer);
	});
});

describe("MCP filename segment profile", () => {
	it("matches the original regex for every UTF-16 unit in all segment positions", () => {
		const original = /[<>"|?*\u0000-\u001f]/;
		for (let code = 0; code <= 65535; code += 1) {
			const character = String.fromCharCode(code);
			for (const name of [character, `${character}ab`, `a${character}b`, `ab${character}`]) {
				if (hasInvalidFilenameCharacter(name, false) !== original.test(name)) throw new Error(`Profile mismatch at ${code}`);
			}
		}
	});

	it("retains caller-owned punctuation, Unicode and path rules", () => {
		for (const name of ["a\u007f.canvas", "a\u0080.canvas", "a😀.canvas", "a\ud800.canvas"]) {
			expect(Vault.splitRelativePath(name, "board")).toEqual([name]);
		}
		for (const name of ["a\u001f.canvas", "a:b.canvas", "a/../b.canvas", "COM0.canvas", "LPT9.canvas", "a?.canvas"]) {
			expect(refusal(() => Vault.splitRelativePath(name, "board"))).toBe("path-invalid");
		}
	});
});
