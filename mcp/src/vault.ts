/**
 * The vault the server works in, and the only boards it will touch.
 *
 * An agent names a board by its path inside the vault.  Every path is checked
 * before a byte is read: it must stay inside the vault, end in `.canvas`,
 * keep out of Obsidian's own folders, and pass through no link or junction -
 * a link could lead a write out of the vault and into someone's other files.
 * The rules follow tools/obsidian_oracle/common.py.
 */

import { lstatSync, readdirSync, realpathSync, type Stats } from "node:fs";
import path from "node:path";

import { hasInvalidFilenameCharacter } from "../../src/control-characters";

/** A refusal the agent reads: a stable code and a sentence. */
export class ToolError extends Error {
	public readonly code: string;

	public constructor(code: string, message: string) {
		super(message);
		this.code = code;
	}
}

/** The default remains available when the client has not named another folder. */
export const DEFAULT_CONFIG_DIR = ".obsidian";

/** These folders remain protected even with a different active configuration. */
const PROTECTED_FOLDERS = new Set([DEFAULT_CONFIG_DIR, ".trash"]);

/** Names Windows keeps for devices, with or without an extension. */
const RESERVED_NAMES = /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\..*)?$/i;

const MAX_PATH_LENGTH = 1024;

/** How many folders and files one listing walks before it stops. */
const MAX_WALK_ENTRIES = 200_000;

const caseInsensitive = process.platform === "win32" || process.platform === "darwin";

function samePath(left: string, right: string): boolean {
	return caseInsensitive ? left.toLowerCase() === right.toLowerCase() : left === right;
}

function insideDirectory(names: readonly string[], directory: readonly string[]): boolean {
	return names.length >= directory.length && directory.every((name, index) => name.toLowerCase() === names[index].toLowerCase());
}

function lstatOrUndefined(target: string): Stats | undefined {
	try {
		return lstatSync(target);
	} catch {
		return undefined;
	}
}

/** Every folder from the drive or root down to `target`, the target last. */
function pathChain(target: string): string[] {
	const chain: string[] = [];
	let current = target;
	while (true) {
		chain.unshift(current);
		const parent = path.dirname(current);
		if (parent === current) return chain;
		current = parent;
	}
}

/** A board found by a listing: its path inside the vault and what the folder says of it. */
export interface VaultBoardEntry {
	/** Relative to the vault, with forward slashes. */
	readonly path: string;
	readonly absolutePath: string;
	readonly bytes: number;
	readonly mtimeMs: number;
}

export class Vault {
	/** The vault folder as given, absolute. */
	public readonly root: string;
	/** The same folder with every name as the disk spells it. */
	public readonly realRoot: string;
	/** Relative to the vault, with forward slashes, as configured by the client. */
	public readonly configDir: string;

	private constructor(root: string, realRoot: string, configDir: string) {
		this.root = root;
		this.realRoot = realRoot;
		this.configDir = configDir;
	}

	/**
	 * Open the vault at `root`: an absolute folder that holds its configuration, with
	 * no link or junction anywhere on the way to it.
	 */
	public static open(root: string, configDir = DEFAULT_CONFIG_DIR): Vault {
		const configuration = Vault.configurationNames(configDir);
		if (typeof root !== "string" || root.length === 0 || !path.isAbsolute(root) || root.includes("\0")) {
			throw new ToolError("vault-invalid", "The vault must be given as an absolute folder path.");
		}
		const absolute = path.resolve(root);
		for (const part of pathChain(absolute)) {
			const stats = lstatOrUndefined(part);
			if (stats === undefined) {
				throw new ToolError("vault-missing", `The vault folder does not exist: ${absolute}`);
			}
			if (stats.isSymbolicLink()) {
				throw new ToolError("vault-link", `The vault path passes through a link or junction: ${part}`);
			}
		}
		if (!lstatSync(absolute).isDirectory()) {
			throw new ToolError("vault-invalid", `The vault is not a folder: ${absolute}`);
		}
		const vault = new Vault(absolute, realpathSync.native(absolute), configuration.join("/"));
		try {
			vault.resolveNames(configuration, "folder");
		} catch {
			throw new ToolError("vault-invalid", `The vault has no safe configuration folder '${vault.configDir}': ${absolute}`);
		}
		return vault;
	}

	/**
	 * The names of a path an agent gave, checked for shape only: relative,
	 * forward or back slashes, no `..`, no drive, no stream, no device name,
	 * nothing Windows would quietly change, nothing in Obsidian's folders.
	 */
	private static pathNames(relative: unknown, kind: "board" | "folder"): string[] {
		if (typeof relative !== "string" || relative.length === 0 || relative.length > MAX_PATH_LENGTH) {
			throw new ToolError("path-invalid", "A path inside the vault is needed.");
		}
		if (relative.includes("\0") || relative.includes(":")) {
			throw new ToolError("path-invalid", "A path may not hold a drive, a stream name or a NUL character.");
		}
		if (path.isAbsolute(relative) || relative.startsWith("/") || relative.startsWith("\\")) {
			throw new ToolError("path-invalid", "A path must be relative to the vault.");
		}
		const names = relative.split(/[\\/]/);
		// A folder may be named with a slash at its end.
		if (kind === "folder" && names.length > 1 && names[names.length - 1] === "") names.pop();
		for (const name of names) {
			if (name === "" || name === "." || name === "..") {
				throw new ToolError("path-invalid", "A path may not hold empty names, '.' or '..'.");
			}
			if (name.endsWith(".") || name.endsWith(" ") || name.startsWith(" ")) {
				throw new ToolError("path-invalid", "A name may not start with a space or end with a dot or a space.");
			}
			if (RESERVED_NAMES.test(name) || hasInvalidFilenameCharacter(name, false)) {
				throw new ToolError("path-invalid", `The name '${name}' is not one a file can safely have.`);
			}
		}
		return names;
	}

	private static configurationNames(configDir: string): string[] {
		const names = Vault.pathNames(configDir, "folder");
		if (names[0].toLowerCase() === ".trash") {
			throw new ToolError("config-invalid", "The configuration folder cannot be the trash folder.");
		}
		return names;
	}

	public static splitRelativePath(relative: unknown, kind: "board" | "folder", configDir = DEFAULT_CONFIG_DIR): string[] {
		const names = Vault.pathNames(relative, kind);
		if (PROTECTED_FOLDERS.has(names[0].toLowerCase()) || insideDirectory(names, Vault.configurationNames(configDir))) {
			throw new ToolError("path-protected", "Obsidian's configuration and trash folders are out of reach.");
		}
		if (kind === "board" && !names[names.length - 1].endsWith(".canvas")) {
			throw new ToolError("path-not-board", "Only .canvas files are boards.");
		}
		return names;
	}

	public splitRelativePath(relative: unknown, kind: "board" | "folder"): string[] {
		return Vault.splitRelativePath(relative, kind, this.configDir);
	}

	/** Workspace reads use the same containment and link checks as board reads. */
	public resolveConfigurationFile(name: string): string {
		const names = Vault.pathNames(name, "folder");
		if (names.length !== 1) throw new ToolError("path-invalid", "A configuration filename is needed.");
		return this.resolveNames([...this.configDir.split("/"), ...names], "file");
	}

	/**
	 * The absolute path of a board or folder that exists in the vault, after
	 * making sure no name on the way is a link and the disk agrees the path
	 * is where it looks to be.
	 */
	public resolveExisting(relative: unknown, kind: "board" | "folder"): string {
		return this.resolveNames(this.splitRelativePath(relative, kind), kind === "board" ? "file" : "folder");
	}

	private resolveNames(names: readonly string[], kind: "file" | "folder"): string {
		let current = this.realRoot;
		for (let index = 0; index < names.length; index += 1) {
			current = path.join(current, names[index]);
			const stats = lstatOrUndefined(current);
			if (stats === undefined) {
				throw new ToolError("not-found", `Nothing is at ${names.slice(0, index + 1).join("/")} in the vault.`);
			}
			if (stats.isSymbolicLink()) {
				throw new ToolError("path-link", `${names.slice(0, index + 1).join("/")} is a link or junction; links are not followed.`);
			}
			const last = index === names.length - 1;
			const wantFolder = !last || kind === "folder";
			if (wantFolder ? !stats.isDirectory() : !stats.isFile()) {
				throw new ToolError("not-found", `${names.slice(0, index + 1).join("/")} is not a ${wantFolder ? "folder" : "file"}.`);
			}
		}
		// A short 8.3 name, a hard-to-see link or a different spelling ends somewhere else.
		const real = realpathSync.native(current);
		if (!samePath(real, current) || !this.contains(real)) {
			throw new ToolError("path-outside", "The path does not stay inside the vault as written.");
		}
		return current;
	}

	/** Whether an absolute, real path lies inside the vault. */
	public contains(absolute: string): boolean {
		const relative = path.relative(this.realRoot, absolute);
		return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
	}

	/** A path inside the vault as an agent writes it: relative, forward slashes. */
	public relativePath(absolute: string): string {
		return path.relative(this.realRoot, absolute).split(path.sep).join("/");
	}

	/**
	 * Every board under `folder` (the whole vault when absent), sorted by
	 * path.  Links and junctions are never followed, and hidden folders -
	 * .obsidian, .trash, .git - are skipped, as Obsidian skips them.
	 */
	public listBoards(folder?: string): VaultBoardEntry[] {
		const start = folder === undefined || folder === "" ? this.realRoot : this.resolveExisting(folder, "folder");
		const boards: VaultBoardEntry[] = [];
		const pending = [start];
		let walked = 0;
		while (pending.length > 0) {
			const directory = pending.pop()!;
			let entries;
			try {
				entries = readdirSync(directory, { withFileTypes: true });
			} catch {
				continue;
			}
			for (const entry of entries) {
				walked += 1;
				if (walked > MAX_WALK_ENTRIES) {
					throw new ToolError("vault-too-large", "The vault holds too many files to list; name a folder.");
				}
				const absolute = path.join(directory, entry.name);
				if (entry.name.startsWith(".") || insideDirectory(this.relativePath(absolute).split("/"), this.configDir.split("/"))) continue;
				// Dirent says what the entry is without following it; lstat makes sure.
				const stats = lstatOrUndefined(absolute);
				if (stats === undefined || stats.isSymbolicLink() || entry.isSymbolicLink()) continue;
				if (stats.isDirectory()) {
					pending.push(absolute);
					continue;
				}
				if (stats.isFile() && entry.name.endsWith(".canvas")) {
					boards.push({ path: this.relativePath(absolute), absolutePath: absolute, bytes: stats.size, mtimeMs: stats.mtimeMs });
				}
			}
		}
		boards.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
		return boards;
	}
}
