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
// Dense per-object hachures need more elements; geometry has a separate shared budget.
export const MAX_IMPORT_SVG_ELEMENTS = 4_096;
export const MAX_IMPORT_SVG_SEGMENTS = 32_768;
export const MAX_IMPORT_SVG_PATH_SEGMENTS = 8_192;
export const MAX_IMPORT_SVG_TRANSFORMS = 8_192;
export const MAX_IMPORT_SVG_DASHES = 100_000;
export const MAX_IMPORT_SVG_RASTER_PIXELS = 32_000_000;
export const MAX_IMPORT_SVG_DEPTH = 16;
const MAX_SVG_TEXT = 65_536;
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const SVG_NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/iu;
const SVG_SPACE = /^[ \t\r\n]*$/u;
const SVG_COMMON = new Set(["fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "stroke-dashoffset", "fill-rule", "opacity", "fill-opacity", "stroke-opacity"]);
const SVG_FIELDS: Readonly<Record<string, ReadonlySet<string>>> = {
	svg: new Set(["xmlns", "width", "height", "viewBox", "preserveAspectRatio"]),
	g: new Set(["transform"]),
	rect: new Set(["x", "y", "width", "height", "rx", "ry", "transform"]),
	path: new Set(["d", "transform"]),
	ellipse: new Set(["cx", "cy", "rx", "ry", "transform"]),
	circle: new Set(["cx", "cy", "r", "transform"]),
	line: new Set(["x1", "y1", "x2", "y2", "transform"]),
	polyline: new Set(["points", "transform"]),
	polygon: new Set(["points", "transform"]),
	text: new Set(["transform", "x", "y", "dx", "dy", "font-family", "font-size", "font-weight", "font-style", "text-anchor", "dominant-baseline", "xml:space"]),
	tspan: new Set(["x", "y", "dx", "dy", "font-family", "font-size", "font-weight", "font-style", "text-anchor", "dominant-baseline", "xml:space"]),
	image: new Set(["x", "y", "width", "height", "href", "preserveAspectRatio", "transform"]),
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

function svgNumberList(value: string, maximumCount: number): number[] {
	if (!/^[+\-0-9.eE, \t\r\n]+$/u.test(value) || /,\s*,|^\s*,|,\s*$/u.test(value)) return refuseSvg();
	const pieces = value.trim().split(/[, \t\r\n]+/u);
	if (pieces.length > maximumCount) return refuseSvg("assetTooLarge");
	return pieces.map((piece) => svgNumber(piece));
}

function svgNumbers(value: string, count: number): number[] {
	const numbers = svgNumberList(value, count);
	if (numbers.length !== count) return refuseSvg();
	return numbers;
}

type SvgMatrix = readonly [number, number, number, number, number, number];
type SvgPoint = readonly [number, number];
const SVG_IDENTITY: SvgMatrix = [1, 0, 0, 1, 0, 0];
const MAX_SVG_COORDINATE = 1_000_000;
const MAX_SVG_MATRIX_SCALE = 1_024;

interface SvgBudget {
	segments: number;
	transforms: number;
	dashes: number;
	rasterPixels: number;
}

interface SvgFrame {
	readonly tag: string;
	readonly matrix: SvgMatrix;
	readonly stroke: string;
	readonly dasharray: readonly number[];
}

function svgSegments(budget: SvgBudget, count: number): void {
	budget.segments += count;
	if (budget.segments > MAX_IMPORT_SVG_SEGMENTS) return refuseSvg("assetTooLarge");
}

function svgMatrix(matrix: SvgMatrix): SvgMatrix {
	if (matrix.some((number, index) => !Number.isFinite(number) || Math.abs(number) > (index < 4 ? MAX_SVG_MATRIX_SCALE : MAX_SVG_COORDINATE))) return refuseSvg("assetTooLarge");
	return matrix;
}

function multiplySvgMatrix(left: SvgMatrix, right: SvgMatrix): SvgMatrix {
	const [a, b, c, d, e, f] = left;
	const [g, h, i, j, k, l] = right;
	return svgMatrix([a * g + c * h, b * g + d * h, a * i + c * j, b * i + d * j, a * k + c * l + e, b * k + d * l + f]);
}

/** SVG attribute transforms only; CSS functions, units and 3D transforms are absent. */
function svgTransform(value: string, budget: SvgBudget): { value: string; matrix: SvgMatrix } {
	const transform = /(matrix|translate|scale|rotate|skewX|skewY)[ \t\r\n]*\(([^()]*)\)/uy;
	let offset = 0;
	let count = 0;
	let matrix = SVG_IDENTITY;
	const saved: string[] = [];
	while (offset < value.length) {
		const separatorStart = offset;
		while (/[ \t\r\n]/u.test(value[offset] ?? "")) offset += 1;
		if (offset === value.length) break;
		if (count > 0 && value[offset] === ",") {
			offset += 1;
			while (/[ \t\r\n]/u.test(value[offset] ?? "")) offset += 1;
		}
		if (count > 0 && offset === separatorStart) return refuseSvg();
		transform.lastIndex = offset;
		const match = transform.exec(value);
		if (match === null) return refuseSvg("unsupportedAsset");
		const name = match[1];
		const numbers = svgNumberList(match[2], 6);
		const sizes: Readonly<Record<string, readonly number[]>> = { matrix: [6], translate: [1, 2], scale: [1, 2], rotate: [1, 3], skewX: [1], skewY: [1] };
		if (!sizes[name].includes(numbers.length)) return refuseSvg();
		count += 1;
		budget.transforms += 1;
		if (count > 16 || budget.transforms > MAX_IMPORT_SVG_TRANSFORMS) return refuseSvg("assetTooLarge");
		let next: SvgMatrix;
		if (name === "matrix") next = numbers as unknown as SvgMatrix;
		else if (name === "translate") next = [1, 0, 0, 1, numbers[0], numbers[1] ?? 0];
		else if (name === "scale") next = [numbers[0], 0, 0, numbers[1] ?? numbers[0], 0, 0];
		else if (name === "rotate") {
			const radians = numbers[0] * Math.PI / 180;
			const sine = Math.sin(radians);
			const cosine = Math.cos(radians);
			const x = numbers[1] ?? 0;
			const y = numbers[2] ?? 0;
			next = [cosine, sine, -sine, cosine, x - cosine * x + sine * y, y - sine * x - cosine * y];
		} else {
			const tangent = Math.tan(numbers[0] * Math.PI / 180);
			next = name === "skewX" ? [1, 0, tangent, 1, 0, 0] : [1, tangent, 0, 1, 0, 0];
		}
		matrix = multiplySvgMatrix(matrix, svgMatrix(next));
		saved.push(`${name}(${numbers.join(" ")})`);
		offset = transform.lastIndex;
	}
	if (count === 0) return refuseSvg();
	return { value: saved.join(" "), matrix };
}

function svgPoint(point: SvgPoint, matrix: SvgMatrix): void {
	const [x, y] = point;
	const [a, b, c, d, e, f] = matrix;
	if ([x, y, a * x + c * y + e, b * x + d * y + f].some((number) => !Number.isFinite(number) || Math.abs(number) > MAX_SVG_COORDINATE)) return refuseSvg("assetTooLarge");
}

/** Full numeric consumption, including compact signed coordinates and arc flags. */
class SvgPathNumbers {
	offset = 0;
	private readonly number = /[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/iuy;

	constructor(readonly value: string) {}

	space(): void {
		while (/[ \t\r\n]/u.test(this.value[this.offset] ?? "")) this.offset += 1;
	}

	read(commaAllowed: boolean, flag = false, separatorRequired = false): number {
		const start = this.offset;
		this.space();
		if (this.value[this.offset] === ",") {
			if (!commaAllowed) return refuseSvg();
			this.offset += 1;
			this.space();
		}
		if (separatorRequired && this.offset === start) return refuseSvg();
		if (flag) {
			const character = this.value[this.offset++];
			if (character !== "0" && character !== "1") return refuseSvg();
			return Number(character);
		}
		this.number.lastIndex = this.offset;
		const match = this.number.exec(this.value);
		if (match === null) return refuseSvg();
		this.offset = this.number.lastIndex;
		return svgNumber(match[0]);
	}
}

interface SvgMeasure {
	readonly length: number;
	readonly subpaths: number;
}

/** Check endpoints/control hulls and bound the decoder's segments, not just command letters. */
function svgPath(value: string, matrix: SvgMatrix, budget: SvgBudget): { value: string; measure: SvgMeasure } {
	const input = new SvgPathNumbers(value);
	const arity: Readonly<Record<string, number>> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7 };
	const saved: string[] = [];
	let command: string | undefined;
	let previous = "";
	let current: SvgPoint = [0, 0];
	let start = current;
	let control = current;
	let segments = 0;
	let subpaths = 0;
	let length = 0;
	input.space();
	if (input.value[input.offset] !== "M" && input.value[input.offset] !== "m") return refuseSvg();
	while (input.offset < value.length) {
		input.space();
		if (input.offset === value.length) break;
		const explicit = /^[MmLlHhVvCcSsQqTtAaZz]$/u.test(value[input.offset]);
		if (explicit) command = value[input.offset++];
		if (command === undefined) return refuseSvg();
		const kind = command.toUpperCase();
		const relative = command === command.toLowerCase();
		segments += 1;
		if (segments > MAX_IMPORT_SVG_PATH_SEGMENTS) return refuseSvg("assetTooLarge");
		svgSegments(budget, 1);
		if (kind === "Z") {
			length += Math.hypot(current[0] - start[0], current[1] - start[1]);
			current = start;
			previous = kind;
			saved.push(command);
			command = undefined;
			continue;
		}
		const numbers = Array.from({ length: arity[kind] }, (_, index) => input.read(index > 0 || !explicit, kind === "A" && (index === 3 || index === 4), kind === "A" && index === 3));
		const point = (index: number): SvgPoint => [numbers[index] + (relative ? current[0] : 0), numbers[index + 1] + (relative ? current[1] : 0)];
		let points: SvgPoint[];
		if (kind === "H") points = [[numbers[0] + (relative ? current[0] : 0), current[1]]];
		else if (kind === "V") points = [[current[0], numbers[0] + (relative ? current[1] : 0)]];
		else if (kind === "C") points = [point(0), point(2), point(4)];
		else if (kind === "Q") points = [point(0), point(2)];
		else if (kind === "S" || kind === "T") {
			const smooth = kind === "S" ? previous === "C" || previous === "S" : previous === "Q" || previous === "T";
			const reflected: SvgPoint = smooth ? [current[0] * 2 - control[0], current[1] * 2 - control[1]] : current;
			points = kind === "S" ? [reflected, point(0), point(2)] : [reflected, point(0)];
		} else if (kind === "A") {
			if (numbers[0] < 0 || numbers[1] < 0) return refuseSvg();
			points = [point(5)];
			if (numbers[0] > 0 && numbers[1] > 0 && (current[0] !== points[0][0] || current[1] !== points[0][1])) {
				const angle = numbers[2] * Math.PI / 180;
				const dx = (current[0] - points[0][0]) / 2;
				const dy = (current[1] - points[0][1]) / 2;
				const scale = Math.max(1, Math.hypot((Math.cos(angle) * dx + Math.sin(angle) * dy) / numbers[0], (-Math.sin(angle) * dx + Math.cos(angle) * dy) / numbers[1]));
				const radius = Math.hypot(numbers[0], numbers[1]) * scale;
				const x = (current[0] + points[0][0]) / 2;
				const y = (current[1] + points[0][1]) / 2;
				// Conservative arc envelope includes SVG's automatic radius enlargement.
				for (const sideX of [-1, 1]) for (const sideY of [-1, 1]) svgPoint([x + sideX * radius * 2, y + sideY * radius * 2], matrix);
				length += 2 * Math.PI * radius;
			}
		} else points = [point(0)];
		let from = current;
		for (const next of points) {
			svgPoint(next, matrix);
			if (kind !== "M") length += Math.hypot(next[0] - from[0], next[1] - from[1]);
			from = next;
		}
		current = points[points.length - 1];
		control = points.length > 1 ? points[points.length - 2] : current;
		if (kind === "M") {
			start = current;
			subpaths += 1;
		}
		if (previous === "Z" && kind !== "M") subpaths += 1;
		previous = kind;
		saved.push(`${command} ${numbers.join(" ")}`);
		if (kind === "M") command = relative ? "l" : "L";
	}
	return { value: saved.join(" "), measure: { length, subpaths } };
}

function svgGeometry(tag: string, fields: Map<string, string>, matrix: SvgMatrix, budget: SvgBudget): SvgMeasure | undefined {
	if (tag === "path") {
		const path = svgPath(fields.get("d") ?? "", matrix, budget);
		fields.set("d", path.value);
		return path.measure;
	}
	const number = (name: string): number => Number(fields.get(name) ?? 0);
	if (tag === "polyline" || tag === "polygon") {
		const points = svgNumberList(fields.get("points") ?? "", MAX_IMPORT_SVG_PATH_SEGMENTS * 2);
		if (points.length % 2 !== 0 || points.length < (tag === "polygon" ? 6 : 4)) return refuseSvg();
		svgSegments(budget, points.length / 2);
		fields.set("points", points.join(" "));
		let length = 0;
		for (let index = 0; index < points.length; index += 2) {
			svgPoint([points[index], points[index + 1]], matrix);
			if (index > 0) length += Math.hypot(points[index] - points[index - 2], points[index + 1] - points[index - 1]);
		}
		if (tag === "polygon") length += Math.hypot(points[0] - points[points.length - 2], points[1] - points[points.length - 1]);
		return { length, subpaths: 1 };
	}
	if (tag === "line") {
		svgSegments(budget, 1);
		svgPoint([number("x1"), number("y1")], matrix);
		svgPoint([number("x2"), number("y2")], matrix);
		return { length: Math.hypot(number("x2") - number("x1"), number("y2") - number("y1")), subpaths: 1 };
	}
	if (tag === "circle" || tag === "ellipse") {
		const rx = number(tag === "circle" ? "r" : "rx");
		const ry = number(tag === "circle" ? "r" : "ry");
		for (const x of [-rx, rx]) for (const y of [-ry, ry]) svgPoint([number("cx") + x, number("cy") + y], matrix);
		svgSegments(budget, 4);
		return { length: 2 * Math.PI * Math.max(rx, ry), subpaths: 1 };
	}
	if (tag === "rect" || tag === "image") {
		for (const x of [0, number("width")]) for (const y of [0, number("height")]) svgPoint([number("x") + x, number("y") + y], matrix);
		if (tag === "image") return undefined;
		svgSegments(budget, 4);
		return { length: 2 * (number("width") + number("height")), subpaths: 1 };
	}
	if (tag === "text" || tag === "tspan") svgPoint([number("x") + number("dx"), number("y") + number("dy")], matrix);
	return undefined;
}

function svgFrame(tag: string, fields: Map<string, string>, parent: SvgFrame | undefined, budget: SvgBudget): SvgFrame {
	let matrix = parent?.matrix ?? SVG_IDENTITY;
	if (fields.has("transform")) {
		const transform = svgTransform(fields.get("transform")!, budget);
		fields.set("transform", transform.value);
		matrix = multiplySvgMatrix(matrix, transform.matrix);
	}
	const stroke = fields.get("stroke") ?? parent?.stroke ?? "none";
	const dasharray = fields.has("stroke-dasharray") ? fields.get("stroke-dasharray") === "none" ? [] : svgNumberList(fields.get("stroke-dasharray")!, 64) : parent?.dasharray ?? [];
	const measure = svgGeometry(tag, fields, matrix, budget);
	const period = dasharray.reduce((sum, number) => sum + number, 0);
	if (stroke !== "none" && period > 0) {
		if (tag === "text" || tag === "tspan") return refuseSvg("unsupportedAsset");
		if (measure !== undefined) {
			budget.dashes += (Math.ceil(measure.length / period) + measure.subpaths) * dasharray.length;
			if (!Number.isFinite(budget.dashes) || budget.dashes > MAX_IMPORT_SVG_DASHES) return refuseSvg("assetTooLarge");
		}
	}
	return { tag, matrix, stroke, dasharray };
}

function svgAttribute(name: string, value: string, budget: SvgBudget): string {
	if (name === "xmlns") {
		if (value !== SVG_NAMESPACE) return refuseSvg("unsupportedAsset");
		return value;
	}
	if (name === "href") {
		const raster = readEmbeddedRaster(value);
		if (!raster.ok) return refuseSvg(raster.reason);
		budget.rasterPixels += raster.width * raster.height;
		if (budget.rasterPixels > MAX_IMPORT_SVG_RASTER_PIXELS) return refuseSvg("assetTooLarge");
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
	// Geometry needs the complete primitive's transform and the document-wide budget.
	if (name === "transform" || name === "d" || name === "points") return value;
	if (name === "stroke-dasharray") {
		if (value === "none") return value;
		const numbers = svgNumberList(value, 64);
		if (numbers.some((number) => number < 0)) return refuseSvg();
		return numbers.join(" ");
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
		"fill-rule": ["nonzero", "evenodd"],
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
	if (["width", "height", "r", "rx", "ry", "stroke-width", "font-size"].includes(name) && number < 0) return refuseSvg();
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
	const stack: SvgFrame[] = [];
	const budget: SvgBudget = { segments: 0, transforms: 0, dashes: 0, rasterPixels: 0 };
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
			const parent = stack[stack.length - 1]?.tag;
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
			if (closing === null || stack.pop()?.tag !== closing[1]) return refuseSvg();
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
		const parentFrame = stack[stack.length - 1];
		const parent = parentFrame?.tag;
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
				const frame = svgFrame(tag, fields, parentFrame, budget);
				if (tag === "svg") {
					if (fields.get("xmlns") !== SVG_NAMESPACE) return refuseSvg("unsupportedAsset");
					attributes = fields;
					if (end[1] === "/") ended = true;
				} else {
					if (tag === "image" && (!fields.has("href") || !fields.has("width") || !fields.has("height"))) return refuseSvg();
					body.push(`<${tag}${svgAttributes(fields)}${end[1] === "/" ? "/" : ""}>`);
				}
				if (end[1] !== "/") stack.push(frame);
				break;
			}
			attribute.lastIndex = offset;
			const field = attribute.exec(source);
			if (field === null || fields.has(field[1])) return refuseSvg();
			if (!SVG_FIELDS[tag].has(field[1]) && !SVG_COMMON.has(field[1])) return refuseSvg("unsupportedAsset");
			if (fields.size >= 24) return refuseSvg("assetTooLarge");
			fields.set(field[1], svgAttribute(field[1], xmlReferences((field[2] ?? field[3]).replace(/[\t\r\n]/gu, " ")), budget));
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
