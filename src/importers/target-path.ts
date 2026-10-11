/**
 * Where an imported board goes: next to its source, named after it, never
 * over a file already there.  "Drawing.excalidraw.md" becomes
 * "Drawing (board).canvas", then "Drawing (board 2).canvas" and so on while
 * a name is taken.  The word "board" comes from the person's language.
 */

/** The endings a source's name loses before it names the board; the longest first. */
const SOURCE_ENDINGS = [".tldr.md", ".tldr", ".excalidraw.md", ".excalidraw", ".md", ".canvas"] as const;

/** More boards from one source than anyone makes; past it the import gives up rather than looping. */
const MAX_ATTEMPTS = 10_000;

/** The source's name without its folder and without the ending that says what kind of file it is. */
export function importBaseName(sourcePath: string): string {
	const slash = sourcePath.lastIndexOf("/");
	const name = slash === -1 ? sourcePath : sourcePath.slice(slash + 1);
	const lower = name.toLowerCase();
	for (const ending of SOURCE_ENDINGS) {
		if (lower.endsWith(ending) && name.length > ending.length) return name.slice(0, name.length - ending.length);
	}
	return name;
}

/** The folder the source is in, "" for the vault's root. */
function folderOf(sourcePath: string): string {
	const slash = sourcePath.lastIndexOf("/");
	return slash === -1 ? "" : sourcePath.slice(0, slash);
}

/**
 * The first free path for a board imported from `sourcePath`, in the same
 * folder: `<base> (<word>).canvas`, then `<base> (<word> 2).canvas`, ...
 * `exists` says whether a path is taken; `word` is the locale's "board".
 */
export function importTargetPath(sourcePath: string, exists: (path: string) => boolean, word: string): string {
	const folder = folderOf(sourcePath);
	const base = importBaseName(sourcePath);
	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
		const suffix = attempt === 1 ? word : `${word} ${attempt}`;
		const name = `${base} (${suffix}).canvas`;
		const path = folder === "" ? name : `${folder}/${name}`;
		if (!exists(path)) return path;
	}
	throw new Error(`import: no free board name next to ${sourcePath}`);
}
