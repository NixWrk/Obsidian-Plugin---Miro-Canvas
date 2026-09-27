import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { ToolError, Vault } from "../src/vault";
import { makeVault, removeVaults } from "./helpers";

afterEach(removeVaults);

function codeOf(action: () => unknown): string | undefined {
	try {
		action();
	} catch (error) {
		return error instanceof ToolError ? error.code : `unexpected: ${String(error)}`;
	}
	return undefined;
}

/**
 * Make a link, a junction on Windows so no special right is needed.  Returns
 * false where the system will not let this user make one; the test is skipped.
 */
function tryLink(target: string, link: string): boolean {
	try {
		symlinkSync(target, link, process.platform === "win32" ? "junction" : "dir");
		return true;
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		if (code === "EPERM" || code === "EACCES") return false;
		throw error;
	}
}

describe("Vault.open", () => {
	it("opens a folder holding .obsidian", () => {
		const root = makeVault();
		expect(Vault.open(root).root).toBe(path.resolve(root));
	});

	it("refuses a relative path, a folder that is no vault and one that is not there", () => {
		const root = makeVault();
		mkdirSync(path.join(root, "plain"));
		expect(codeOf(() => Vault.open("relative/vault"))).toBe("vault-invalid");
		expect(codeOf(() => Vault.open(path.join(root, "plain")))).toBe("vault-invalid");
		expect(codeOf(() => Vault.open(path.join(root, "missing")))).toBe("vault-missing");
	});

	it("refuses a vault reached through a link", (context) => {
		const root = makeVault();
		const outside = makeVault();
		const link = path.join(outside, "through-link");
		if (!tryLink(root, link)) context.skip();
		expect(codeOf(() => Vault.open(link))).toBe("vault-link");
	});
});

describe("board paths", () => {
	it.each([
		["../outside.canvas", "path-invalid"],
		["boards/../../outside.canvas", "path-invalid"],
		["/abs.canvas", "path-invalid"],
		["\\abs.canvas", "path-invalid"],
		["C:/abs.canvas", "path-invalid"],
		["C:abs.canvas", "path-invalid"],
		["board.canvas:hidden", "path-invalid"],
		["board.canvas\0", "path-invalid"],
		["notes.md", "path-not-board"],
		["board.canvas.", "path-invalid"],
		["board.canvas ", "path-invalid"],
		["folder./board.canvas", "path-invalid"],
		["CON.canvas", "path-invalid"],
		["a//b.canvas", "path-invalid"],
		["./b.canvas", "path-invalid"],
		[".obsidian/board.canvas", "path-protected"],
		[".OBSIDIAN/board.canvas", "path-protected"],
		[".trash/board.canvas", "path-protected"],
		["", "path-invalid"],
	])("refuses %j", (relative, code) => {
		expect(codeOf(() => Vault.splitRelativePath(relative, "board"))).toBe(code);
	});

	it("takes forward and back slashes alike", () => {
		expect(Vault.splitRelativePath("a/b\\c.canvas", "board")).toEqual(["a", "b", "c.canvas"]);
	});

	it("resolves a board that is there, and says so of one that is not", () => {
		const root = makeVault();
		mkdirSync(path.join(root, "boards"));
		writeFileSync(path.join(root, "boards", "one.canvas"), "{}");
		const vault = Vault.open(root);
		expect(vault.relativePath(vault.resolveExisting("boards/one.canvas", "board"))).toBe("boards/one.canvas");
		expect(codeOf(() => vault.resolveExisting("boards/two.canvas", "board"))).toBe("not-found");
		expect(codeOf(() => vault.resolveExisting("boards", "board"))).toBe("path-not-board");
	});

	it("refuses a board behind a link that leads out of the vault", (context) => {
		const root = makeVault();
		const outside = makeVault();
		writeFileSync(path.join(outside, "secret.canvas"), "{}");
		if (!tryLink(outside, path.join(root, "linked"))) context.skip();
		const vault = Vault.open(root);
		expect(codeOf(() => vault.resolveExisting("linked/secret.canvas", "board"))).toBe("path-link");
		// A listing does not follow the link either.
		expect(vault.listBoards().map((board) => board.path)).toEqual([]);
	});
});

describe("Vault.listBoards", () => {
	it("lists .canvas files by path, skipping hidden folders", () => {
		const root = makeVault();
		mkdirSync(path.join(root, "b"));
		mkdirSync(path.join(root, ".git"));
		writeFileSync(path.join(root, "b", "two.canvas"), "{}");
		writeFileSync(path.join(root, "a.canvas"), "{}");
		writeFileSync(path.join(root, "notes.md"), "#");
		writeFileSync(path.join(root, ".git", "hidden.canvas"), "{}");
		writeFileSync(path.join(root, ".obsidian", "settings.canvas"), "{}");
		const vault = Vault.open(root);
		expect(vault.listBoards().map((board) => board.path)).toEqual(["a.canvas", "b/two.canvas"]);
		expect(vault.listBoards("b").map((board) => board.path)).toEqual(["b/two.canvas"]);
		expect(codeOf(() => vault.listBoards("../"))).toBe("path-invalid");
	});
});
