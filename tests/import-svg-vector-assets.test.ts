import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { Vault } from "obsidian";
import { publishImportAssets } from "../src/import-assets";
import { idFactory } from "../src/importers/board-builder";
import {
	ImportAssets,
	MAX_IMPORT_SVG_DASHES,
	MAX_IMPORT_SVG_ELEMENTS,
	MAX_IMPORT_SVG_PATH_SEGMENTS,
	MAX_IMPORT_SVG_SEGMENTS,
	MAX_IMPORT_SVG_TRANSFORMS,
	readEmbeddedAsset,
	readPassiveSvg,
} from "../src/importers/assets";

const namespace = "http://www.w3.org/2000/svg";
const rasters = JSON.parse(readFileSync(new URL("./fixtures/import/embedded-rasters.json", import.meta.url), "utf8")) as Record<string, string>;
const png = Object.values(rasters).find((value) => value.startsWith("data:image/png;"))!;

function svg(body: string): string {
	return `<svg xmlns="${namespace}" width="240" height="110" viewBox="0 0 240 110">${body}</svg>`;
}

function read(body: string) {
	return readPassiveSvg(new TextEncoder().encode(svg(body)));
}

function checked(body: string): string {
	const result = read(body);
	if (!result.ok) throw new Error(`SVG refused (${result.reason})`);
	expect(result).toMatchObject({ extension: "svg", width: 240, height: 110 });
	// The publisher's second parse must accept exactly the normalized bytes.
	expect(readPassiveSvg(result.bytes)).toEqual(result);
	return new TextDecoder().decode(result.bytes);
}

function path(data: string, attributes = ""): string {
	return `<path d="${data}"${attributes}/>`;
}

// Synthetic per-object contour/hachure and smoothed-outline examples; no editor runtime.
const roughContour = path("M10 10 C12 9 90 11 100 10 C102 30 101 70 100 90 C80 91 20 89 10 90 C9 60 11 30 10 10", ' fill="none" stroke="#1e1e1e" stroke-width="2"');
const outline = path("M10 55 Q10 20 45 20 T80 55 Q80 90 45 90 T10 55 Z", ' fill="#b8e5ca" fill-rule="evenodd"');

describe("bounded passive SVG vector geometry", () => {
	it("retains a dense per-object rough contour/hachure and smoothed filled outline", () => {
		const hachure = Array.from({ length: 700 }, (_, index) => path(`M10 ${10 + index / 10} C30 ${12 + index / 10} 70 ${9 + index / 10} 100 ${10 + index / 10}`, ' fill="none" stroke="#666" stroke-width="0.4"')).join("");
		const body = `<g opacity="0.6" transform="translate(2 3) rotate(4 55 50)">${roughContour}${hachure}${outline}</g>`;
		const original = svg(body);
		const bytes = new TextEncoder().encode(original);
		const before = bytes.slice();
		const result = readPassiveSvg(bytes);
		expect(result.ok).toBe(true);
		expect(bytes).toEqual(before);
		const saved = checked(body);
		expect(saved.match(/<path /gu)).toHaveLength(702);
		expect(saved).toContain('opacity="0.6"');
		expect(saved).toContain('fill-rule="evenodd"');
		expect(saved).toContain('transform="translate(2 3) rotate(4 55 50)"');
		expect(readEmbeddedAsset(`data:image/svg+xml,${encodeURIComponent(original)}`)).toEqual(result);
	});

	it("parses vector bytes without invoking XML/DOM parsers, fetch or editor code", () => {
		const forbidden = vi.fn(() => { throw new Error("Unexpected SVG runtime operation"); });
		vi.stubGlobal("DOMParser", forbidden);
		vi.stubGlobal("fetch", forbidden);
		try {
			expect(read(roughContour + outline).ok).toBe(true);
			expect(forbidden).not.toHaveBeenCalled();
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it.each([
		["M10-20L.5.6", "M 10 -20 L 0.5 0.6"],
		["m1e1 2E1 3-4 5,6", "m 10 20 l 3 -4 l 5 6"],
		["M0 0 H10 20 h-3 V15 30 v-4 Z", "M 0 0 H 10 H 20 h -3 V 15 V 30 v -4 Z"],
		["M0 0 C1 2 3 4 5 6 7 8 9 10 11 12 S13 14 15 16", "M 0 0 C 1 2 3 4 5 6 C 7 8 9 10 11 12 S 13 14 15 16"],
		["M0 0 c1 2 3 4 5 6 s7 8 9 10 q1 2 3 4 t5 6 z", "M 0 0 c 1 2 3 4 5 6 s 7 8 9 10 q 1 2 3 4 t 5 6 z"],
		["M10 10 Q20 30 40 50 T60 70 M5 5 L6 6 Z L7 7", "M 10 10 Q 20 30 40 50 T 60 70 M 5 5 L 6 6 Z L 7 7"],
		["M0 0 A10 20 30 0110 20 a5,6,-20,1,0,-2,-3", "M 0 0 A 10 20 30 0 1 10 20 a 5 6 -20 1 0 -2 -3"],
	])("fully consumes and preserves path semantics: %s", (data, expected) => {
		expect(checked(path(data))).toContain(`d="${expected}"`);
	});

	it.each([
		'<ellipse cx="70" cy="50" rx="30" ry="20" transform="rotate(30 70 50)"/>',
		'<circle cx="50" cy="50" r="20" transform="scale(1.5 -1) translate(0 -80)"/>',
		'<line x1="10" y1="20" x2="80" y2="70" transform="matrix(1 .2 .3 1 2 3)"/>',
		'<polyline points="1,2 3,4 5,6" transform="skewX(10)"/>',
		'<polygon points="1 2,3 4,5 6" transform="skewY(-5)"/>',
		'<rect x="10" y="10" width="50" height="30" rx="4" transform="translate(20)"/>',
	])("accepts bounded primitive geometry and its own transform: %s", (body) => {
		expect(checked(body)).toContain(body.split(" ")[0]);
	});

	it("preserves transform order, centred rotation, reflection and group inheritance", () => {
		const body = '<g transform="translate(10,20),scale(2) rotate(90 5 6)"><rect width="2" height="3" transform="matrix(-1 0 0 1 2 0)"/></g>';
		expect(checked(body)).toContain('transform="translate(10 20) scale(2) rotate(90 5 6)"');
		const source = `data:image/svg+xml;base64,${Buffer.from(svg(body)).toString("base64")}`;
		const assets = new ImportAssets("Maps/source.excalidraw", idFactory(23));
		expect(assets.add("contour", source, { flipX: true })).toMatchObject({ ok: true, width: 240, height: 110 });
		const saved = new TextDecoder().decode(assets.list()[0].bytes);
		expect(saved).toContain('matrix(-1 0 0 1 240 0)');
		expect(readPassiveSvg(assets.list()[0].bytes).ok).toBe(true);
	});

	it.each(["4, 2 1", "0 8", "0 0", "none"])("accepts safe unitless dash patterns: %s", (dash) => {
		const body = path("M0 0 L100 0", ` fill="none" stroke="#000" stroke-dasharray="${dash}" stroke-dashoffset="-1.5px" fill-rule="nonzero"`);
		expect(checked(body)).toContain('stroke-dashoffset="-1.5"');
	});

	it.each([
		"", " ", "L0 0", "Z", "M", "M0", "M0 0 L", "M0 0 L1", "M0,0,", "M,0 0", "M0,,0", "M0 0,L1 1",
		"M0 0 Z 1 2", "M0 0 R1 2", "M0 0 C1 2 3 4 5", "M0 0 S1 2 3", "M0 0 Q1 2 3", "M0 0 T1",
		"MNaN 0", "MInfinity 0", "M1e 0", "M1e999 0", "M0 0 L1 1 bad", "M0 0;L1 1", "M0 0 L1px 2", "M0 0 /* x */ L1 1",
		"M0 0 A1 1 0 2 0 1 1", "M0 0 A1 1 0 -1 0 1 1", "M0 0 A1 1 0 1.0 0 1 1", "M0 0 A-1 1 0 0 1 1 1", "M0 0 A1 1 000 1 1 1",
	])("rejects the entire path on invalid grammar: %s", (data) => {
		expect(read(path(data)).ok).toBe(false);
	});

	it.each([
		'<path/>', '<polyline/>', '<polyline points="0 0 1"/>', '<polyline points="0 0"/>', '<polygon points="0 0 1 1"/>',
		'<polygon points="0 0,1 1,,2 2"/>', '<polygon points="0 0,1 1,2 2,"/>', '<polygon points="0 0 1% 1 2 2"/>',
		'<circle r="-1"/>', '<ellipse rx="1" ry="-2"/>', '<line x1="NaN"/>',
		'<rect transform=""/>', '<rect transform="scale()"/>', '<rect transform="translate(1 2 3)"/>',
		'<rect transform="matrix(1 0 0 1)"/>', '<rect transform="rotate(1 2)"/>', '<rect transform="rotate(90deg)"/>',
		'<rect transform="translateX(1)"/>', '<rect transform="matrix3d(1)"/>', '<rect transform="scale(1,,2)"/>',
		'<rect transform="scale(2)rotate(3)"/>', '<rect transform="scale(2),"/>', '<rect transform="scale(2),,rotate(3)"/>', '<rect transform="scale(2) nonsense"/>',
		'<line stroke-dasharray="1 -2"/>', '<line stroke-dasharray="1% 2%"/>', '<line stroke-dasharray="1px 2px"/>',
		'<line stroke-dasharray="1,,2"/>', '<line stroke-dasharray=""/>', '<line stroke-dashoffset="calc(1 + 2)"/>', '<path d="M0 0" fill-rule="inherit"/>',
	])("rejects invalid primitives/presentation/transforms without stripping: %s", (body) => {
		expect(read(body).ok).toBe(false);
	});

	it.each([
		'<path d="M0 0L1 1" onload="alert(1)"/>', '<circle r="1" onclick="alert(1)"/>',
		'<path d="M0 0L1 1" style="stroke:red"/>', '<path d="M0 0L1 1" fill="url(#paint)"/>',
		'<path d="M0 0L1 1" stroke="url(https://example.com/paint)"/>', '<path d="M0 0L1 1" marker-end="url(#arrow)"/>',
		'<path d="M0 0L1 1" filter="url(#blur)"/>', '<path d="M0 0L1 1" clip-path="url(#clip)"/>',
		'<path d="M0 0L1 1" pathLength="1"/>', '<path d="M0 0L1 1" vector-effect="non-scaling-stroke"/>',
		'<defs><path d="M0 0L1 1"/></defs>', '<use href="#path"/>', '<foreignObject/>', '<style/>', '<script/>', '<animate/>',
		'<font/>', '<font-face/>', '<image width="1" height="1" href="https://example.com/a.png"/>',
	])("keeps active, CSS, font resources and reference features refused: %s", (body) => {
		expect(read(roughContour + body)).toMatchObject({ ok: false });
	});

	it("bounds scalar, relative, reflected-control, transformed and radius-corrected geometry", () => {
		for (const body of [
			path("M1000001 0"), path("M999999 0 l2 0"), path("M0 0 q999999 0 -2 0 t0 0"), path("M0 0 C0 0 999999 0 -2 0 S0 0 0 0"),
			path("M0 0 A0.000001 1000000 0 0 0 100 100"), '<circle cx="999999" r="2"/>',
			'<line x2="600000" transform="scale(2)"/>', '<g transform="scale(32)"><g transform="scale(64)"><line/></g></g>',
			'<line transform="translate(999999) translate(2)"/>', '<line transform="scale(1025)"/>', '<line transform="skewX(90)"/>',
		]) expect(read(body)).toEqual({ ok: false, reason: "assetTooLarge" });
		expect(checked(path("M999999 0 l1 0"))).toContain('l 1 0');
		expect(read(path("M0 0 A0 1 0 0 1 10 10")).ok).toBe(true);
	});

	it("admits up to 4096 elements and bounds implicit segments per path and document", () => {
		expect(MAX_IMPORT_SVG_ELEMENTS).toBe(4_096);
		expect(read('<line/>'.repeat(MAX_IMPORT_SVG_ELEMENTS - 1)).ok).toBe(true);
		expect(read('<line/>'.repeat(MAX_IMPORT_SVG_ELEMENTS))).toEqual({ ok: false, reason: "assetTooLarge" });
		const atLimit = "M0 0" + " 0 0".repeat(MAX_IMPORT_SVG_PATH_SEGMENTS - 1);
		expect(read(path(atLimit)).ok).toBe(true);
		expect(read(path(atLimit + " 0 0"))).toEqual({ ok: false, reason: "assetTooLarge" });
		const fullDocument = path(atLimit).repeat(MAX_IMPORT_SVG_SEGMENTS / MAX_IMPORT_SVG_PATH_SEGMENTS);
		expect(read(fullDocument).ok).toBe(true);
		expect(read(fullDocument + '<line/>')).toEqual({ ok: false, reason: "assetTooLarge" });
		const points = "0 0 ".repeat(MAX_IMPORT_SVG_PATH_SEGMENTS).trim();
		expect(read(`<polyline points="${points}"/>`).ok).toBe(true);
		expect(read(`<polyline points="${points} 0 0"/>`)).toEqual({ ok: false, reason: "assetTooLarge" });
	});

	it("bounds transform operations per primitive and across the document", () => {
		const transforms = "translate(0) ".repeat(16).trim();
		expect(read(`<line transform="${transforms}"/>`).ok).toBe(true);
		expect(read(`<line transform="${transforms} translate(0)"/>`)).toEqual({ ok: false, reason: "assetTooLarge" });
		const repetitions = Math.floor(MAX_IMPORT_SVG_TRANSFORMS / 3);
		const body = '<line transform="translate(0) translate(0) translate(0)"/>'.repeat(repetitions);
		expect(read(body + '<line transform="translate(0) translate(0)"/>').ok).toBe(true);
		expect(read(body + '<line transform="translate(0) translate(0) translate(0)"/>')).toEqual({ ok: false, reason: "assetTooLarge" });
	});

	it("bounds dash lists and cumulative inherited dash work rather than accepting microscopic periods", () => {
		expect(read('<line stroke-dasharray="' + '1 '.repeat(64).trim() + '"/>').ok).toBe(true);
		expect(read('<line stroke-dasharray="' + '1 '.repeat(65).trim() + '"/>')).toEqual({ ok: false, reason: "assetTooLarge" });
		const inherited = '<g stroke="#000" stroke-dasharray="0.000000001 0.000000001"><line x2="100"/></g>';
		expect(read(inherited)).toEqual({ ok: false, reason: "assetTooLarge" });
		const one = path(`M0 0 L${MAX_IMPORT_SVG_DASHES / 4} 0`);
		expect(read(`<g stroke="#000" stroke-dasharray="1 1">${one}</g>`).ok).toBe(true);
		expect(read(`<g stroke="#000" stroke-dasharray="1 1">${one.repeat(4)}</g>`)).toEqual({ ok: false, reason: "assetTooLarge" });
	});

	it("bounds the total latent raster pixel area inside one vector attachment", () => {
		const bytes = Buffer.from(png.split(",")[1], "base64");
		bytes.writeUInt32BE(4000, 16);
		bytes.writeUInt32BE(4000, 20);
		const largeHeader = 'data:image/png;base64,' + bytes.toString("base64");
		const image = `<image width="1" height="1" href="${largeHeader}"/>`;
		expect(read(image.repeat(2)).ok).toBe(true);
		expect(read(image.repeat(3))).toEqual({ ok: false, reason: "assetTooLarge" });
	});
});

describe("vector attachment publication boundary", () => {
	it("publishes the accepted subset and rejects any unsafe suffix before writes", async () => {
		const files = new Map<string, unknown>();
		const createFolder = vi.fn(async (name: string) => { files.set(name, { path: name }); });
		const createBinary = vi.fn(async (name: string, bytes: ArrayBuffer) => {
			const file = { path: name, bytes };
			files.set(name, file);
			return file;
		});
		const vault = { getAbstractFileByPath: (name: string) => files.get(name) ?? null, createFolder, createBinary } as unknown as Vault;
		const assets = new ImportAssets("Maps/source.excalidraw", idFactory(33));
		expect(assets.add("contour", `data:image/svg+xml,${encodeURIComponent(svg(roughContour + outline))}`).ok).toBe(true);
		const planned = assets.list();
		const original = planned[0].bytes.slice();
		await publishImportAssets(vault, planned, "Maps/source.excalidraw", vi.fn());
		expect(createBinary).toHaveBeenCalledOnce();
		expect(new Uint8Array(createBinary.mock.calls[0][1])).toEqual(original);
		createFolder.mockClear();
		createBinary.mockClear();
		for (const body of [roughContour + '<script/>', path("M0 0 L1"), roughContour + '<path d="M0 0" fill="url(#paint)"/>']) {
			const unsafe = { path: planned[0].path, bytes: new TextEncoder().encode(svg(body)) };
			await expect(publishImportAssets(vault, [unsafe], "Maps/source.excalidraw", vi.fn())).rejects.toThrow("unsafe SVG");
		}
		expect(createFolder).not.toHaveBeenCalled();
		expect(createBinary).not.toHaveBeenCalled();
	});
});
