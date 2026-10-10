import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { App, TFile, Vault } from "obsidian";
import { importIntoBoard, type ImportHost } from "../src/import-command";
import { publishImportAssets } from "../src/import-assets";
import { ImportAssets, MAX_IMPORT_ASSET_BYTES, readEmbeddedRaster } from "../src/importers/assets";
import { BoardBuilder, idFactory, addReportCard } from "../src/importers/board-builder";
import type { FormatAdapter, ImportAsset, ImportContext } from "../src/importers/types";
import { words } from "../src/i18n";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
const folder = "Maps/Miro Canvas assets 0000000000000001";
const path = `${folder}/0000000000000002.png`;
const asset: ImportAsset = { path, bytes: new Uint8Array([1, 2, 3]) };

function fakeVault(options: { binaryFailure?: number; boardFailure?: boolean; collide?: boolean; changedAsset?: boolean; renamedAsset?: boolean } = {}) {
	const source = { path: "Maps/Source.excalidraw", extension: "excalidraw", content: "original" };
	const files = new Map<string, Record<string, unknown>>([[source.path, source]]);
	if (options.collide) files.set(folder, { path: folder, children: [] });
	let writes = 0;
	const vault = {
		getAbstractFileByPath: (name: string) => files.get(name) ?? null,
		read: vi.fn(async (file: typeof source) => file.content),
		readBinary: vi.fn(async (file: Record<string, unknown>) => file.bytes),
		createFolder: vi.fn(async (name: string) => {
			if (files.has(name)) throw new Error("exists");
			const file = { path: name, children: [] as unknown[] };
			files.set(name, file);
			return file;
		}),
		createBinary: vi.fn(async (name: string, bytes: ArrayBuffer) => {
			writes += 1;
			if (writes === options.binaryFailure) throw new Error("binary failure");
			if (files.has(name)) throw new Error("exists");
			const file = { path: name, bytes };
			files.set(name, file);
			return file;
		}),
		create: vi.fn(async (name: string, content: string) => {
			if (options.changedAsset) files.get(path)!.bytes = new Uint8Array([9]).buffer;
			if (options.renamedAsset) files.get(path)!.path = "Maps/User moved.png";
			if (options.boardFailure) throw new Error("board failure");
			const file = { path: name, content };
			files.set(name, file);
			return file;
		}),
		delete: vi.fn(async (file: { path: string }) => { files.delete(file.path); }),
	};
	return { vault: vault as unknown as Vault, mocks: vault, files, source };
}

const adapter: FormatAdapter = {
	id: "excalidraw",
	detect: () => true,
	convert: (source, context) => {
		const builder = new BoardBuilder("excalidraw", context);
		builder.file({ x: -20, y: 3, width: 10, height: 10 }, path);
		return { ...builder.finish({ sourcePath: source.path }), assets: [asset] };
	},
};

function host(fake: ReturnType<typeof fakeVault>, confirm: ImportHost["confirm"]): ImportHost {
	return {
		app: { vault: fake.vault, fileManager: { trashFile: fake.mocks.delete }, metadataCache: { getFirstLinkpathDest: () => null }, workspace: { getLeaf: () => ({ openFile: async () => {} }) } } as unknown as App,
		isFile: (value: unknown): value is TFile => !!value && typeof value === "object" && "path" in value,
		pluginVersion: "test",
		notice: vi.fn(),
		confirm,
		adapters: [adapter],
	};
}

describe("bounded embedded raster assets", () => {
	it("reads dimensions of generated actual PNG, JPEG, GIF and WebP files", () => {
		const fixtures = JSON.parse(readFileSync(new URL("./fixtures/import/embedded-rasters.json", import.meta.url), "utf8")) as Record<string, string>;
		for (const dataURL of Object.values(fixtures)) expect(readEmbeddedRaster(dataURL)).toMatchObject({ ok: true, width: 7, height: 3 });
	});
	it("refuses tiny files claiming excessive decoded image dimensions", () => {
		const raw = Uint8Array.from(atob(PNG.split(",")[1]!), character => character.charCodeAt(0));
		new DataView(raw.buffer).setUint32(16, 100_000);
		const dataURL = "data:image/png;base64," + Buffer.from(raw).toString("base64");
		expect(readEmbeddedRaster(dataURL)).toEqual({ ok: false, reason: "assetTooLarge" });
	});
	it("decodes PNG and shares one attachment between images", () => {
		const read = readEmbeddedRaster(PNG);
		expect(read.ok).toBe(true);
		const assets = new ImportAssets("Maps/Карта.excalidraw", idFactory(1));
		expect(assets.add("../../untrusted:id", PNG)).toEqual(assets.add("../../untrusted:id", PNG));
		expect(assets.list()).toHaveLength(1);
		expect(assets.list()[0]!.path).toMatch(/^Maps\/Miro Canvas pictures [a-f0-9]{16}\/[a-f0-9]{16}\.png$/u);
	});
	it("refuses active, remote, mismatched, malformed and oversized data", () => {
		for (const value of ["https://example.com/a.png", "data:image/svg+xml;base64,PHN2Zz4=", "data:text/html;base64,YQ=="]) expect(readEmbeddedRaster(value).ok).toBe(false);
		for (const value of [null, "data:image/png;base64,!!!!", "data:image/png;base64,YQ==", PNG.replace("image/png", "image/jpeg")]) expect(readEmbeddedRaster(value)).toEqual({ ok: false, reason: "invalidAsset" });
		expect(readEmbeddedRaster(`data:image/png;base64,${"A".repeat(Math.ceil(MAX_IMPORT_ASSET_BYTES / 3) * 4 + 4)}`)).toEqual({ ok: false, reason: "assetTooLarge" });
	});
	it("retains planned attachments when adding the report card", () => {
		const context: ImportContext = { importerVersion: "test", now: "2026-10-11T00:00:00Z", newId: idFactory(7), resolveLink: () => undefined };
		const result = adapter.convert({ path: "Maps/Source.excalidraw", extension: "excalidraw", text: "original" }, context);
		expect(addReportCard(result, context.newId).assets).toEqual([asset]);
	});
});

describe("import publication boundary", () => {
	it("writes nothing before confirm and publishes attachments before the board", async () => {
		const fake = fakeVault();
		const h = host(fake, async (preview) => {
			expect(preview.assetCount).toBe(1);
			expect(fake.mocks.createBinary).not.toHaveBeenCalled();
			expect(fake.mocks.createFolder).not.toHaveBeenCalled();
			return { reportCard: true };
		});
		expect((await importIntoBoard(h, fake.source as unknown as TFile))?.path).toBe("Maps/Source (board).canvas");
		expect(fake.mocks.createBinary).toHaveBeenCalledOnce();
		expect(fake.mocks.create.mock.invocationCallOrder[0]).toBeGreaterThan(fake.mocks.createBinary.mock.invocationCallOrder[0]!);
		expect(fake.source.content).toBe("original");
	});
	it("cancellation and source changes leave no new attachments or board", async () => {
		for (const stale of [false, true]) {
			const fake = fakeVault();
			const h = host(fake, async () => {
				if (stale) fake.source.content = "edited";
				return stale ? { reportCard: false } : null;
			});
			expect(await importIntoBoard(h, fake.source as unknown as TFile)).toBeNull();
			expect(fake.mocks.createFolder).not.toHaveBeenCalled();
			expect(fake.files.size).toBe(1);
			if (stale) expect(h.notice).toHaveBeenCalledWith(words().importer.staleSource);
		}
	});
	it("rolls back unchanged owned attachments after a board failure", async () => {
		const fake = fakeVault({ boardFailure: true });
		expect(await importIntoBoard(host(fake, async () => ({ reportCard: true })), fake.source as unknown as TFile)).toBeNull();
		expect(fake.files.has(path)).toBe(false);
		expect(fake.source.content).toBe("original");
		// The empty folder is kept to avoid racing recursive deletion of user files.
		expect(fake.files.has(folder)).toBe(true);
	});
	it("never deletes a user-edited or moved attachment during rollback", async () => {
		for (const option of [{ changedAsset: true }, { renamedAsset: true }]) {
			const fake = fakeVault({ ...option, boardFailure: true });
			await importIntoBoard(host(fake, async () => ({ reportCard: false })), fake.source as unknown as TFile);
			expect(fake.mocks.delete).not.toHaveBeenCalled();
		}
	});
	it("rejects collision and traversal before overwriting anything", async () => {
		const fake = fakeVault({ collide: true });
		await expect(publishImportAssets(fake.vault, [asset], fake.source.path, (file) => fake.vault.delete(file, true))).rejects.toThrow("already exists");
		expect(fake.mocks.createBinary).not.toHaveBeenCalled();
		for (const unsafe of ["../outside.png", "Maps/../outside.png", "C:/outside.png", "Maps/other/image.png"]) {
			await expect(publishImportAssets(fake.vault, [{ ...asset, path: unsafe }], fake.source.path, (file) => fake.vault.delete(file, true))).rejects.toThrow();
		}
		expect(fake.mocks.delete).not.toHaveBeenCalled();
	});
	it("cleans earlier successful assets when a later binary write fails", async () => {
		const fake = fakeVault({ binaryFailure: 2 });
		await expect(publishImportAssets(fake.vault, [asset, { ...asset, path: `${folder}/0000000000000003.png` }], fake.source.path, (file) => fake.vault.delete(file, true))).rejects.toThrow("binary failure");
		expect(fake.files.has(path)).toBe(false);
		expect(fake.mocks.delete).toHaveBeenCalledOnce();
	});
});
