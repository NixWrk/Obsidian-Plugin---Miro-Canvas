/** Bounded raster and strictly passive SVG attachments; no runtime, fetch or active content. */
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

/** SVG is a restricted attachment format, not a general XML/HTML sanitizer. */
export const MAX_IMPORT_SVG_BYTES = 1024 * 1024;
export const MAX_IMPORT_SVG_ELEMENTS = 512;
export const MAX_IMPORT_SVG_DEPTH = 16;
const MAX_SVG_TEXT = 65_536;
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const SVG_NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/iu;
const SVG_SPACE = /^[ \t\r\n]*$/u;
const SVG_COMMON = new Set(["fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "opacity", "fill-opacity", "stroke-opacity"]);
const SVG_FIELDS: Readonly<Record<string, ReadonlySet<string>>> = {
	svg: new Set(["xmlns", "width", "height", "viewBox", "preserveAspectRatio"]),
	g: new Set(["transform"]),
	rect: new Set(["x", "y", "width", "height", "rx", "ry"]),
	text: new Set(["x", "y", "dx", "dy", "font-family", "font-size", "font-weight", "font-style", "text-anchor", "dominant-baseline", "xml:space"]),
	tspan: new Set(["x", "y", "dx", "dy", "font-family", "font-size", "font-weight", "font-style", "text-anchor", "dominant-baseline", "xml:space"]),
	image: new Set(["x", "y", "width", "height", "href", "preserveAspectRatio"]),
};
const SVG_COLORS = new Set(["none", "transparent", "black", "white", "red", "green", "blue", "yellow", "gray", "grey", "silver", "maroon", "purple", "fuchsia", "lime", "olive", "navy", "teal", "aqua"]);

export interface AssetReflection {
	readonly flipX?: boolean;
	readonly flipY?: boolean;
}

interface PassiveSvg {
	readonly attributes: Map<string, string>;
	readonly body: string;
	readonly width: number;
	readonly height: number;
	readonly viewBox: readonly number[];
}

class SvgRefusal extends Error {
	constructor(readonly reason: ImportReason) {
		super(`import: SVG refused (${reason})`);
	}
}

function refuseSvg(reason: ImportReason = "invalidAsset"): never {
	throw new SvgRefusal(reason);
}

function xmlCharacters(value: string): boolean {
	for (const character of value) {
		const code = character.codePointAt(0)!;
		if (code !== 9 && code !== 10 && code !== 13 && !(code >= 32 && code <= 0xd7ff || code >= 0xe000 && code <= 0xfffd || code >= 0x10000 && code <= 0x10ffff)) return false;
	}
	return true;
}

function xmlReferences(value: string): string {
	const references: Readonly<Record<string, string>> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
	return value.replace(/&([^;]*);?|\]\]>/gu, (match, reference: string | undefined) => {
		if (reference === undefined || !match.endsWith(";")) return refuseSvg();
		if (Object.prototype.hasOwnProperty.call(references, reference)) return references[reference];
		if (!/^#(?:[0-9]+|x[0-9a-f]+)$/iu.test(reference)) return refuseSvg();
		const code = reference[1] === "x" ? parseInt(reference.slice(2), 16) : Number(reference.slice(1));
		if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) return refuseSvg();
		const character = String.fromCodePoint(code);
		if (!xmlCharacters(character)) return refuseSvg();
		return character;
	});
}

function xmlEscape(value: string): string {
	return value.replace(/[&<>"\r]/gu, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "\r": "&#13;" })[character]!);
}

function svgNumber(value: string, maximum = 1_000_000): number {
	if (!SVG_NUMBER.test(value)) return refuseSvg();
	const number = Number(value);
	if (!Number.isFinite(number)) return refuseSvg();
	if (Math.abs(number) > maximum) return refuseSvg("assetTooLarge");
	return number;
}

function svgNumbers(value: string, count: number): number[] {
	if (!/^[+\-0-9.eE, \t\r\n]+$/u.test(value) || /,\s*,|^\s*,|,\s*$/u.test(value)) return refuseSvg();
	const pieces = value.trim().split(/[, \t\r\n]+/u);
	if (pieces.length !== count) return refuseSvg();
	return pieces.map((piece) => svgNumber(piece));
}

function svgAttribute(name: string, value: string): string {
	if (name === "xmlns") {
		if (value !== SVG_NAMESPACE) return refuseSvg("unsupportedAsset");
		return value;
	}
	if (name === "href") {
		const raster = readEmbeddedRaster(value);
		if (!raster.ok) return refuseSvg(raster.reason);
		const staticReason = staticRasterReason(raster.bytes, raster.extension);
		if (staticReason !== undefined) return refuseSvg(staticReason);
		return rasterDataURL(raster.bytes, raster.extension);
	}
	if (name === "fill" || name === "stroke") {
		if (!/^#(?:[a-f0-9]{3}|[a-f0-9]{4}|[a-f0-9]{6}|[a-f0-9]{8})$/iu.test(value) && !SVG_COLORS.has(value)) return refuseSvg("unsupportedAsset");
		return value;
	}
	if (name.endsWith("opacity")) {
		const opacity = svgNumber(value, 1);
		if (opacity < 0) return refuseSvg();
		return String(opacity);
	}
	if (name === "viewBox") {
		const box = svgNumbers(value, 4);
		if (box[2] <= 0 || box[3] <= 0) return refuseSvg();
		return box.join(" ");
	}
	if (name === "transform") {
		const matrix = /^matrix\(([^()]*)\)$/u.exec(value);
		if (matrix === null) return refuseSvg("unsupportedAsset");
		const values = svgNumbers(matrix[1], 6);
		if (![1, -1].includes(values[0]) || values[1] !== 0 || values[2] !== 0 || ![1, -1].includes(values[3])) return refuseSvg("unsupportedAsset");
		return `matrix(${values.join(" ")})`;
	}
	if (name === "preserveAspectRatio") {
		if (!/^(?:none|x(?:Min|Mid|Max)Y(?:Min|Mid|Max)(?: (?:meet|slice))?)$/u.test(value)) return refuseSvg();
		return value;
	}
	if (name === "font-family") {
		if (value.length > 128 || !/^[\p{L}\p{N} _,'"-]+$/u.test(value)) return refuseSvg("unsupportedAsset");
		return value;
	}
	if (name === "font-weight") {
		if (value === "normal" || value === "bold") return value;
		const weight = svgNumber(value, 1_000);
		if (!Number.isInteger(weight) || weight < 1) return refuseSvg();
		return String(weight);
	}
	const choices: Readonly<Record<string, readonly string[]>> = {
		"stroke-linecap": ["butt", "round", "square"],
		"stroke-linejoin": ["miter", "round", "bevel"],
		"font-style": ["normal", "italic", "oblique"],
		"text-anchor": ["start", "middle", "end"],
		"dominant-baseline": ["auto", "middle", "central", "alphabetic", "hanging", "ideographic", "mathematical", "text-before-edge", "text-after-edge"],
		"xml:space": ["default", "preserve"],
	};
	if (Object.prototype.hasOwnProperty.call(choices, name)) {
		if (!choices[name].includes(value)) return refuseSvg();
		return value;
	}
	const number = svgNumber(value.endsWith("px") ? value.slice(0, -2) : value, name === "font-size" ? 512 : 1_000_000);
	if (["width", "height", "rx", "ry", "stroke-width", "font-size"].includes(name) && number < 0) return refuseSvg();
	return String(number);
}

function svgDimensions(attributes: Map<string, string>): { width: number; height: number; viewBox: readonly number[] } {
	const box = attributes.has("viewBox") ? svgNumbers(attributes.get("viewBox")!, 4) : undefined;
	let width = attributes.has("width") ? Number(attributes.get("width")) : undefined;
	let height = attributes.has("height") ? Number(attributes.get("height")) : undefined;
	if (width === undefined) width = box === undefined ? undefined : height === undefined ? box[2] : height * box[2] / box[3];
	if (height === undefined) height = box === undefined || width === undefined ? undefined : width * box[3] / box[2];
	if (width === undefined || height === undefined || !Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) return refuseSvg();
	if (width > 32_768 || height > 32_768 || width * height > 32_000_000) return refuseSvg("assetTooLarge");
	attributes.set("width", String(width));
	attributes.set("height", String(height));
	return { width, height, viewBox: box ?? [0, 0, width, height] };
}

function svgAttributes(attributes: Map<string, string>): string {
	return [...attributes].map(([name, value]) => ` ${name}="${xmlEscape(value)}"`).join("");
}

/** Parse only this grammar. Unknown tokens never reach a DOM or decoder. */
function parsePassiveSvg(bytes: Uint8Array): PassiveSvg {
	if (!(bytes instanceof Uint8Array) || bytes.length === 0) return refuseSvg();
	if (bytes.length > MAX_IMPORT_SVG_BYTES) return refuseSvg("assetTooLarge");
	let source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	if (!xmlCharacters(source)) return refuseSvg();
	source = source.replace(/\r\n?/gu, "\n");
	const tagStart = /<([a-z]+)(?=[ \t\r\n/>])/uy;
	const attribute = /[ \t\r\n]+([A-Za-z_:][A-Za-z0-9_:.-]*)[ \t\r\n]*=[ \t\r\n]*(?:"([^"<]*)"|'([^'<]*)')/uy;
	const close = /<\/([a-z]+)[ \t\r\n]*>/uy;
	const stack: string[] = [];
	const body: string[] = [];
	let attributes: Map<string, string> | undefined;
	let offset = 0;
	let elements = 0;
	let textSize = 0;
	let ended = false;
	while (offset < source.length) {
		if (source[offset] !== "<") {
			const next = source.indexOf("<", offset);
			const raw = source.slice(offset, next < 0 ? source.length : next);
			const text = xmlReferences(raw);
			const parent = stack[stack.length - 1];
			if (parent !== "text" && parent !== "tspan" && !SVG_SPACE.test(text)) return refuseSvg();
			textSize += text.length;
			if (textSize > MAX_SVG_TEXT) return refuseSvg("assetTooLarge");
			if (stack.length > 0) body.push(xmlEscape(text));
			offset += raw.length;
			continue;
		}
		if (source.startsWith("</", offset)) {
			close.lastIndex = offset;
			const closing = close.exec(source);
			if (closing === null || stack.pop() !== closing[1]) return refuseSvg();
			offset = close.lastIndex;
			if (closing[1] === "svg") ended = true;
			else body.push(`</${closing[1]}>`);
			continue;
		}
		if (ended) return refuseSvg();
		tagStart.lastIndex = offset;
		const opening = tagStart.exec(source);
		if (opening === null) return refuseSvg("unsupportedAsset");
		const tag = opening[1];
		if (!Object.prototype.hasOwnProperty.call(SVG_FIELDS, tag)) return refuseSvg("unsupportedAsset");
		const parent = stack[stack.length - 1];
		if (attributes === undefined ? tag !== "svg" : parent === undefined || tag === "svg") return refuseSvg();
		if (parent === "text" || parent === "tspan") {
			if (tag !== "tspan") return refuseSvg("unsupportedAsset");
		} else if (parent !== undefined && parent !== "svg" && parent !== "g") return refuseSvg();
		elements += 1;
		if (elements > MAX_IMPORT_SVG_ELEMENTS || stack.length >= MAX_IMPORT_SVG_DEPTH) return refuseSvg("assetTooLarge");
		offset = tagStart.lastIndex;
		const fields = new Map<string, string>();
		while (true) {
			const end = /^[ \t\r\n]*(\/?)>/u.exec(source.slice(offset));
			if (end !== null) {
				offset += end[0].length;
				if (tag === "svg") {
					if (fields.get("xmlns") !== SVG_NAMESPACE) return refuseSvg("unsupportedAsset");
					attributes = fields;
					if (end[1] === "/") ended = true;
				} else {
					if (tag === "image" && (!fields.has("href") || !fields.has("width") || !fields.has("height"))) return refuseSvg();
					body.push(`<${tag}${svgAttributes(fields)}${end[1] === "/" ? "/" : ""}>`);
				}
				if (end[1] !== "/") stack.push(tag);
				break;
			}
			attribute.lastIndex = offset;
			const field = attribute.exec(source);
			if (field === null || fields.has(field[1])) return refuseSvg();
			if (!SVG_FIELDS[tag].has(field[1]) && !SVG_COMMON.has(field[1])) return refuseSvg("unsupportedAsset");
			if (fields.size >= 24) return refuseSvg("assetTooLarge");
			fields.set(field[1], svgAttribute(field[1], xmlReferences((field[2] ?? field[3]).replace(/[\t\r\n]/gu, " "))));
			offset = attribute.lastIndex;
		}
	}
	if (attributes === undefined || !ended || stack.length !== 0) return refuseSvg();
	return { attributes, body: body.join(""), ...svgDimensions(attributes) };
}

function serializedSvg(document: PassiveSvg, body = document.body): Uint8Array {
	return new TextEncoder().encode(`<svg${svgAttributes(document.attributes)}>${body}</svg>`);
}

/** The publisher can recheck SVG bytes through this same fail-closed boundary. */
export function readPassiveSvg(bytes: Uint8Array): AssetRead {
	try {
		const document = parsePassiveSvg(bytes);
		const checked = serializedSvg(document);
		if (checked.length > MAX_IMPORT_SVG_BYTES) return { ok: false, reason: "assetTooLarge" };
		return { ok: true, bytes: checked, extension: "svg", width: document.width, height: document.height };
	} catch (error) {
		return { ok: false, reason: error instanceof SvgRefusal ? error.reason : "invalidAsset" };
	}
}

export function readEmbeddedAsset(dataURL: unknown): AssetRead {
	if (typeof dataURL !== "string" || !/^data:image\/svg\+xml(?:;|,)/iu.test(dataURL)) return readEmbeddedRaster(dataURL);
	const comma = dataURL.indexOf(",");
	if (comma < 0 || comma > 80) return { ok: false, reason: "invalidAsset" };
	const header = /^data:image\/svg\+xml(?:;charset=utf-8)?(;base64)?$/iu.exec(dataURL.slice(0, comma));
	if (header === null) return { ok: false, reason: "unsupportedAsset" };
	const encoded = dataURL.slice(comma + 1);
	if (encoded.length > MAX_IMPORT_SVG_BYTES * (header[1] === undefined ? 3 : 4 / 3) + 4) return { ok: false, reason: "assetTooLarge" };
	try {
		if (header[1] !== undefined) {
			if (encoded.length === 0 || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/u.test(encoded)) return { ok: false, reason: "invalidAsset" };
			return readPassiveSvg(Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0)));
		}
		const decoded = decodeURIComponent(encoded);
		if (!xmlCharacters(decoded)) return { ok: false, reason: "invalidAsset" };
		return readPassiveSvg(new TextEncoder().encode(decoded));
	} catch {
		return { ok: false, reason: "invalidAsset" };
	}
}

function rasterDataURL(bytes: Uint8Array, extension: string): string {
	const chunks: string[] = [];
	for (let offset = 0; offset < bytes.length; offset += 8_192) chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8_192)));
	return `data:image/${extension === "jpg" ? "jpeg" : extension};base64,${btoa(chunks.join(""))}`;
}

/** Static rasters only; animation and unverified EXIF orientation are refused. */
function staticRasterReason(bytes: Uint8Array, extension: string): ImportReason | undefined {
	if (extension === "jpg") {
		const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
		let offset = 2;
		while (offset + 4 <= bytes.length) {
			if (bytes[offset] !== 255) return "invalidAsset";
			while (bytes[offset] === 255) offset += 1;
			const marker = bytes[offset++];
			if (marker === 218) return undefined;
			if (marker === undefined || marker === 217 || offset + 2 > bytes.length) return "invalidAsset";
			if (marker === 1 || marker >= 208 && marker <= 215) continue;
			const length = view.getUint16(offset);
			if (length < 2 || offset + length > bytes.length) return "invalidAsset";
			if (marker === 225 && length >= 8 && String.fromCharCode(...bytes.subarray(offset + 2, offset + 8)) === "Exif\0\0") return "unsupportedAsset";
			offset += length;
		}
		return "invalidAsset";
	}
	if (extension === "gif") return "unsupportedAsset";
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	let offset = extension === "png" ? 8 : 12;
	let chunks = 0;
	let pixels = false;
	if (extension === "webp" && view.getUint32(4, true) + 8 !== bytes.length) return "invalidAsset";
	while (offset + (extension === "png" ? 12 : 8) <= bytes.length) {
		chunks += 1;
		if (chunks > 4_096) return "assetTooLarge";
		const length = view.getUint32(offset + (extension === "png" ? 0 : 4), extension !== "png");
		const nameOffset = offset + (extension === "png" ? 4 : 0);
		const name = String.fromCharCode(...bytes.subarray(nameOffset, nameOffset + 4));
		const end = offset + length + (extension === "png" ? 12 : 8 + length % 2);
		if (end > bytes.length || end <= offset) return "invalidAsset";
		if (extension === "png" && (chunks === 1 ? name !== "IHDR" || length !== 13 : name === "IHDR")) return "invalidAsset";
		if (["acTL", "fcTL", "fdAT", "ANIM", "ANMF", "eXIf", "EXIF"].includes(name)) return "unsupportedAsset";
		if (name === "VP8X" && (length < 10 || bytes[offset + 8] & 2)) return "unsupportedAsset";
		if (name === "IDAT" || name === "VP8 " || name === "VP8L") pixels = true;
		if (name === "IEND") return pixels && length === 0 && end === bytes.length ? undefined : "invalidAsset";
		offset = end;
	}
	return extension === "webp" && pixels && offset === bytes.length ? undefined : "invalidAsset";
}

function reflectedAsset(read: Extract<AssetRead, { ok: true }>, reflection: AssetReflection): AssetRead {
	try {
		let document: PassiveSvg;
		if (read.extension === "svg") {
			document = parsePassiveSvg(read.bytes);
			const alignment = document.attributes.get("preserveAspectRatio");
			if (alignment !== undefined && alignment !== "none" && !alignment.startsWith("xMidYMid")) return { ok: false, reason: "unsupportedAsset" };
		} else {
			if (Math.ceil(read.bytes.length / 3) * 4 > MAX_IMPORT_SVG_BYTES - 512) return { ok: false, reason: "assetTooLarge" };
			const reason = staticRasterReason(read.bytes, read.extension);
			if (reason !== undefined) return { ok: false, reason };
			const attributes = new Map([["xmlns", SVG_NAMESPACE], ["width", String(read.width)], ["height", String(read.height)]]);
			document = { attributes, width: read.width, height: read.height, viewBox: [0, 0, read.width, read.height], body: `<image width="${read.width}" height="${read.height}" preserveAspectRatio="none" href="${rasterDataURL(read.bytes, read.extension)}"/>` };
		}
		const [x, y, width, height] = document.viewBox;
		const matrix = [reflection.flipX ? -1 : 1, 0, 0, reflection.flipY ? -1 : 1, reflection.flipX ? x * 2 + width : 0, reflection.flipY ? y * 2 + height : 0];
		return readPassiveSvg(serializedSvg(document, `<g transform="matrix(${matrix.join(" ")})">${document.body}</g>`));
	} catch (error) {
		return { ok: false, reason: error instanceof SvgRefusal ? error.reason : "invalidAsset" };
	}
}

/** Paths are generated IDs under one new folder beside the source, never source IDs. */
export class ImportAssets {
	private readonly byId = new Map<string, ImportAsset & { readonly width: number; readonly height: number }>();
	private readonly failures = new Map<string, ImportReason>();
	private totalBytes = 0;
	private folder: string | undefined;

	constructor(private readonly sourcePath: string, private readonly newId: () => string) {}

	add(id: string, dataURL: unknown, reflection: AssetReflection = {}): { readonly ok: true; readonly path: string; readonly width: number; readonly height: number } | { readonly ok: false; readonly reason: ImportReason } {
		if (reflection.flipX !== undefined && typeof reflection.flipX !== "boolean" || reflection.flipY !== undefined && typeof reflection.flipY !== "boolean") return { ok: false, reason: "invalidAsset" };
		const key = JSON.stringify([id, reflection.flipX === true, reflection.flipY === true]);
		const failed = this.failures.get(key);
		if (failed !== undefined) return { ok: false, reason: failed };
		const existing = this.byId.get(key);
		if (existing !== undefined) return { ok: true, path: existing.path, width: existing.width, height: existing.height };
		const source = readEmbeddedAsset(dataURL);
		const read = source.ok && (reflection.flipX || reflection.flipY) ? reflectedAsset(source, reflection) : source;
		if (!read.ok) {
			this.failures.set(key, read.reason);
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
		this.byId.set(key, { path, bytes: read.bytes, width: read.width, height: read.height });
		this.totalBytes += read.bytes.length;
		return { ok: true, path, width: read.width, height: read.height };
	}

	list(): readonly ImportAsset[] {
		return [...this.byId.values()].map(({ path, bytes }) => ({ path, bytes }));
	}
}
