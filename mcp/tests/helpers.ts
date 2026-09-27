/** Throwaway vaults for the server's tests: a temp folder with .obsidian and copies of the schema's fixtures. */

import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const FIXTURES_DIR = path.join(REPOSITORY_ROOT, "schema", "v1", "fixtures");

const made: string[] = [];

/** An empty vault: a temp folder holding .obsidian. */
export function makeVault(): string {
	const root = mkdtempSync(path.join(tmpdir(), "miro-canvas-mcp-"));
	mkdirSync(path.join(root, ".obsidian"));
	made.push(root);
	return root;
}

/** A vault with every valid fixture board copied into `boards/`. */
export function makeFixtureVault(): string {
	const root = makeVault();
	const boards = path.join(root, "boards");
	mkdirSync(boards);
	for (const name of readdirSync(path.join(FIXTURES_DIR, "valid"))) {
		copyFileSync(path.join(FIXTURES_DIR, "valid", name), path.join(boards, name));
	}
	return root;
}

/** Remove every vault this test file made. */
export function removeVaults(): void {
	while (made.length > 0) {
		rmSync(made.pop()!, { recursive: true, force: true });
	}
}
