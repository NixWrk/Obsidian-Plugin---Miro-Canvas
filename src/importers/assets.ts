/** Bounded raster attachments; no editor runtime, network, SVG or active content. */
import { words } from "../i18n";
import type { ImportAsset, ImportReason } from "./types";

export const MAX_IMPORT_ASSET_BYTES = 8 * 1024 * 1024;
export const MAX_IMPORT_ASSET_TOTAL_BYTES = 32 * 1024 * 1024;
export const MAX_IMPORT_ASSETS = 1_000;

type AssetRead =
	| { readonly ok: true; readonly bytes: Uint8Array; readonly extension: string; readonly width: number; readonly height: number }
	| { readonly ok: false; readonly reason: ImportReason };

const MIME_EXTENSIONS: Readonly<Record<string, string>> = {
	"image/png": "png",
	"image/jpeg": "jpg",
	"image/gif": "gif",
	"image/webp": "webp",
};

export function readEmbeddedRaster(dataURL: unknown): AssetRead {
	if (typeof dataURL !== "string") return { ok: false, reason: "invalidAsset" };
	const comma = dataURL.indexOf(",");
	if (comma < 0 || comma > 80) return { ok: false, reason: "invalidAsset" };
	const header = /^data:([^;,]+);base64$/iu.exec(dataURL.slice(0, comma));
	if (header === null) return { ok: false, reason: "unsupportedAsset" };
	const mime = header[1]?.toLowerCase() ?? "";
	const extension = MIME_EXTENSIONS[mime];
	if (extension === undefined) return { ok: false, reason: "unsupportedAsset" };
	const encoded = dataURL.slice(comma + 1);
	if (encoded.length > Math.ceil(MAX_IMPORT_ASSET_BYTES / 3) * 4) return { ok: false, reason: "assetTooLarge" };
	if (encoded.length === 0 || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/u.test(encoded)) {
		return { ok: false, reason: "invalidAsset" };
	}
	let decoded: string;
	try {
		decoded = atob(encoded);
	} catch {
		return { ok: false, reason: "invalidAsset" };
	}
	if (decoded.length > MAX_IMPORT_ASSET_BYTES) return { ok: false, reason: "assetTooLarge" };
	const bytes = Uint8Array.from(decoded, (character) => character.charCodeAt(0));
	if (!hasRasterSignature(bytes, extension)) return { ok: false, reason: "invalidAsset" };
	const dimensions = rasterDimensions(bytes, extension);
	if (dimensions === undefined || dimensions.width < 1 || dimensions.height < 1) return { ok: false, reason: "invalidAsset" };
	if (dimensions.width > 32_768 || dimensions.height > 32_768 || dimensions.width * dimensions.height > 32_000_000) return { ok: false, reason: "assetTooLarge" };
	return { ok: true, bytes, extension, ...dimensions };
}

function hasRasterSignature(bytes: Uint8Array, extension: string): boolean {
	const starts = (signature: readonly number[]): boolean => signature.every((value, index) => bytes[index] === value);
	if (extension === "png") return bytes.length >= 24 && starts([137, 80, 78, 71, 13, 10, 26, 10]);
	if (extension === "jpg") return bytes.length >= 4 && starts([255, 216, 255]);
	if (extension === "gif") return bytes.length >= 10 && (starts([71, 73, 70, 56, 55, 97]) || starts([71, 73, 70, 56, 57, 97]));
	return bytes.length >= 16 && starts([82, 73, 70, 70]) && [87, 69, 66, 80].every((value, index) => bytes[index + 8] === value);
}

/** Header dimensions bound native image decoding and identify stretched source images. */
function rasterDimensions(bytes: Uint8Array, extension: string): { readonly width: number; readonly height: number } | undefined {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (extension === "png") return { width: view.getUint32(16), height: view.getUint32(20) };
	if (extension === "gif") return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
	if (extension === "webp") {
		const tag = String.fromCharCode(...bytes.slice(12, 16));
		if (tag === "VP8X" && bytes.length >= 30) {
			const uint24 = (at: number): number => bytes[at] + bytes[at + 1] * 256 + bytes[at + 2] * 65_536;
			return { width: uint24(24) + 1, height: uint24(27) + 1 };
		}
		if (tag === "VP8L" && bytes.length >= 25 && bytes[20] === 47) {
			const bits = view.getUint32(21, true);
			return { width: (bits & 16_383) + 1, height: ((bits >>> 14) & 16_383) + 1 };
		}
		if (tag === "VP8 " && bytes.length >= 30 && bytes[23] === 157 && bytes[24] === 1 && bytes[25] === 42) {
			return { width: view.getUint16(26, true) & 16_383, height: view.getUint16(28, true) & 16_383 };
		}
		return undefined;
	}
	let at = 2;
	while (at + 4 <= bytes.length) {
		if (bytes[at] !== 255) return undefined;
		while (bytes[at] === 255) at += 1;
		const marker = bytes[at++];
		if (marker === undefined || marker === 217 || marker === 218 || at + 2 > bytes.length) return undefined;
		if (marker === 1 || marker >= 208 && marker <= 215) continue;
		const length = view.getUint16(at);
		if (length < 2 || at + length > bytes.length) return undefined;
		if (marker >= 192 && marker <= 207 && ![196, 200, 204].includes(marker) && length >= 7) {
			return { width: view.getUint16(at + 5), height: view.getUint16(at + 3) };
		}
		at += length;
	}
	return undefined;
}

/** Paths are generated IDs under one new folder beside the source, never source IDs. */
export class ImportAssets {
	private readonly byId = new Map<string, ImportAsset & { readonly width: number; readonly height: number }>();
	private readonly failures = new Map<string, ImportReason>();
	private totalBytes = 0;
	private folder: string | undefined;

	constructor(private readonly sourcePath: string, private readonly newId: () => string) {}

	add(id: string, dataURL: unknown): { readonly ok: true; readonly path: string; readonly width: number; readonly height: number } | { readonly ok: false; readonly reason: ImportReason } {
		const failed = this.failures.get(id);
		if (failed !== undefined) return { ok: false, reason: failed };
		const existing = this.byId.get(id);
		if (existing !== undefined) return { ok: true, path: existing.path, width: existing.width, height: existing.height };
		const read = readEmbeddedRaster(dataURL);
		if (!read.ok) {
			this.failures.set(id, read.reason);
			return read;
		}
		if (this.byId.size >= MAX_IMPORT_ASSETS || this.totalBytes + read.bytes.length > MAX_IMPORT_ASSET_TOTAL_BYTES) {
			return { ok: false, reason: "assetTooLarge" };
		}
		if (this.folder === undefined) {
			const slash = this.sourcePath.lastIndexOf("/");
			const parent = slash < 0 ? "" : this.sourcePath.slice(0, slash + 1);
			this.folder = `${parent}${words().importer.assetsFolder} ${this.newId()}`;
		}
		const path = `${this.folder}/${this.newId()}.${read.extension}`;
		this.byId.set(id, { path, bytes: read.bytes, width: read.width, height: read.height });
		this.totalBytes += read.bytes.length;
		return { ok: true, path, width: read.width, height: read.height };
	}

	list(): readonly ImportAsset[] {
		return [...this.byId.values()].map(({ path, bytes }) => ({ path, bytes }));
	}
}
