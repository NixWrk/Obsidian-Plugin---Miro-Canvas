/** The only attachment writer for imports: publish new owned files, then the board. */
import type { TFile, Vault } from "obsidian";
import { MAX_IMPORT_ASSET_BYTES, MAX_IMPORT_ASSET_TOTAL_BYTES, MAX_IMPORT_ASSETS, readPassiveSvg } from "./importers/assets";
import type { ImportAsset } from "./importers/types";

interface OwnedAsset {
	readonly file: TFile;
	readonly path: string;
	readonly bytes: Uint8Array;
}

export interface PublishedImportAssets {
	/** On failure, remove only unchanged files created by this attempt. */
	readonly rollback: () => Promise<void>;
}

/** Refuse every path that could escape the source folder or name an existing attachment. */
function assetFolder(assets: readonly ImportAsset[], sourcePath: string): string | undefined {
	if (assets.length === 0) return undefined;
	if (assets.length > MAX_IMPORT_ASSETS) throw new Error("import: too many attachments");
	const slash = sourcePath.lastIndexOf("/");
	const parent = slash < 0 ? "" : sourcePath.slice(0, slash + 1);
	const paths = new Set<string>();
	let folder: string | undefined;
	let bytes = 0;
	for (const asset of assets) {
		const path = asset.path;
		if (path.length > 4096 || [...path].some((character) => character.charCodeAt(0) < 32) || /[<>"|?*]/u.test(path) || path.includes("\\") || path.includes(":") || path.split("/").some((part) => part === "" || part === "." || part === "..")) {
			throw new Error("import: unsafe attachment path");
		}
		if (!path.startsWith(parent)) throw new Error("import: attachment outside source folder");
		const local = path.slice(parent.length);
		if (!/^[^/]+ [0-9a-f]{16}\/[0-9a-f]{16}\.(png|jpg|gif|webp|svg)$/u.test(local) || paths.has(path)) {
			throw new Error("import: invalid attachment name");
		}
		paths.add(path);
		const current = path.slice(0, path.lastIndexOf("/"));
		if (folder !== undefined && folder !== current) throw new Error("import: attachments span folders");
		folder = current;
		if (!(asset.bytes instanceof Uint8Array) || asset.bytes.length === 0 || asset.bytes.length > MAX_IMPORT_ASSET_BYTES) {
			throw new Error("import: invalid attachment bytes");
		}
		if (path.endsWith(".svg") && !readPassiveSvg(asset.bytes).ok) throw new Error("import: unsafe SVG attachment");
		bytes += asset.bytes.length;
		if (bytes > MAX_IMPORT_ASSET_TOTAL_BYTES) throw new Error("import: attachments too large");
	}
	return folder;
}

export async function publishImportAssets(vault: Vault, assets: readonly ImportAsset[], sourcePath: string, trashFile: (file: TFile) => Promise<void>): Promise<PublishedImportAssets> {
	const folderPath = assetFolder(assets, sourcePath);
	const owned: OwnedAsset[] = [];
	const rollback = async (): Promise<void> => {
		for (const asset of [...owned].reverse()) {
			try {
				if (asset.file.path !== asset.path || vault.getAbstractFileByPath(asset.path) !== asset.file) continue;
				const current = new Uint8Array(await vault.readBinary(asset.file));
				if (current.length !== asset.bytes.length || !current.every((byte, index) => byte === asset.bytes[index])) continue;
				await trashFile(asset.file);
			} catch (error) {
				console.error("[miro-canvas] import attachment cleanup failed", error);
			}
		}
		// Keep the empty folder: recursive Vault deletion could race another file creation.
	};
	try {
		if (folderPath !== undefined) {
			if (vault.getAbstractFileByPath(folderPath) !== null) throw new Error("import: attachment folder already exists");
			await vault.createFolder(folderPath);
			for (const asset of assets) {
				if (vault.getAbstractFileByPath(asset.path) !== null) throw new Error("import: attachment already exists");
				const bytes = new Uint8Array(asset.bytes).buffer;
				const file = await vault.createBinary(asset.path, bytes);
				owned.push({ file, path: asset.path, bytes: new Uint8Array(asset.bytes) });
			}
		}
		return { rollback };
	} catch (error) {
		await rollback();
		throw error;
	}
}
