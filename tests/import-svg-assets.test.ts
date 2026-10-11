import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { idFactory } from "../src/importers/board-builder";
import {
	ImportAssets,
	MAX_IMPORT_ASSETS,
	MAX_IMPORT_SVG_BYTES,
	MAX_IMPORT_SVG_DEPTH,
	MAX_IMPORT_SVG_ELEMENTS,
	readEmbeddedAsset,
	readEmbeddedRaster,
	readPassiveSvg,
} from "../src/importers/assets";

// Synthetic rect/text badge matching the showcase's documented SVG subset.
const BADGE = '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="110"><rect width="240" height="110" rx="20" fill="#eedfff"/><text x="120" y="66" text-anchor="middle" font-family="Arial" font-size="34" fill="#7549bc">SVG</text></svg>';
const rasters = JSON.parse(readFileSync(new URL("./fixtures/import/embedded-rasters.json", import.meta.url), "utf8")) as Record<string, string>;
const PNG = Object.values(rasters).find((value) => value.startsWith("data:image/png;"))!;

function svgURL(text: string): string {
	return `data:image/svg+xml;base64,${Buffer.from(text, "utf8").toString("base64")}`;
}

function xml(text: string): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="110">${text}</svg>`;
}

function accepted(text: string): { bytes: Uint8Array; extension: string; width: number; height: number } {
	const result = readEmbeddedAsset(svgURL(text));
	if (!result.ok) throw new Error(`SVG rejected: ${result.reason}`);
	return result;
}

describe("strict passive SVG attachments", () => {
	it("preserves the rect/text showcase badge and its intrinsic dimensions", () => {
		const read = accepted(BADGE);
		expect(read).toMatchObject({ extension: "svg", width: 240, height: 110 });
		expect(new TextDecoder().decode(read.bytes)).toBe(BADGE);
		expect(readPassiveSvg(read.bytes)).toEqual({ ok: true, ...read });
		const assets = new ImportAssets("Maps/Источник.excalidraw", idFactory(7));
		expect(assets.add("unsafe/../badge", svgURL(BADGE))).toMatchObject({ ok: true, width: 240, height: 110 });
		expect(assets.list()[0]!.path).toMatch(/^Maps\/Miro Canvas pictures [a-f0-9]{16}\/[a-f0-9]{16}\.svg$/u);
	});

	it("reads base64 and percent-encoded UTF-8 without executing or fetching", () => {
		const fetch = vi.fn(() => { throw new Error("SVG parser attempted fetch"); });
		vi.stubGlobal("fetch", fetch);
		try {
			const text = xml('<text x="20" y="40" font-family="Arial">Привет &amp; &#x1f642; &lt;script&gt;</text>');
			const base64 = accepted(text);
			expect(readEmbeddedAsset(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`)).toEqual({ ok: true, ...base64 });
			expect(new TextDecoder().decode(base64.bytes)).toContain("Привет &amp; 🙂 &lt;script&gt;");
			expect(fetch).not.toHaveBeenCalled();
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it("derives missing absolute dimensions from a bounded viewBox and preserves its origin", () => {
		for (const [dimensions, width, height] of [
			['viewBox="10 -20 120 60"', 120, 60],
			['width="240px" viewBox="10 -20 120 60"', 240, 120],
			['height="120" viewBox="10 -20 120 60"', 240, 120],
		] as const) {
			const read = accepted(`<svg xmlns="http://www.w3.org/2000/svg" ${dimensions}><rect width="40" height="20"/></svg>`);
			expect(read).toMatchObject({ width, height });
			expect(new TextDecoder().decode(read.bytes)).toContain('viewBox="10 -20 120 60"');
		}
	});

	it("reserializes quotes, character references and tspan text as valid passive markup", () => {
		const read = accepted(xml(`<g fill="#f00" opacity=".5"><text x="1" y="20" font-family='"Arial", sans-serif'>A<tspan dx="2">&quot;B&apos; &#13; C</tspan></text></g>`));
		const saved = new TextDecoder().decode(read.bytes);
		expect(saved).toContain('font-family="&quot;Arial&quot;, sans-serif"');
		expect(saved).toContain('opacity="0.5"');
		expect(readPassiveSvg(read.bytes).ok).toBe(true);
	});

	it.each([
		'<script>alert(1)</script>', '<foreignObject><div>HTML</div></foreignObject>',
		'<style>@import "https://example.com/a.css";</style>', '<animate attributeName="opacity"/>', '<set attributeName="fill"/>',
		'<animateTransform attributeName="transform"/>', '<animateMotion/>', '<use href="#x"/>',
		'<a href="https://example.com/"><text>click</text></a>', '<filter/>', '<pattern/>', '<mask/>', '<path d="M0 0L1 1"/>',
		'<rect width="20" height="20" onclick="alert(1)"/>', '<rect width="20" height="20" oNlOaD="alert(1)"/>',
		'<rect style="fill:red"/>', '<rect class="remote"/>', '<rect fill="url(https://example.com/paint)"/>',
		'<rect fill="url(#paint)"/>', '<g transform="scale(2)"><rect width="20" height="20"/></g>',
		'<image width="1" height="1" href="https://example.com/a.png"/>', '<image width="1" height="1" href="file:///private/a.png"/>',
		'<image width="1" height="1" href="data:image/svg+xml;base64,PHN2Zy8+"/>',
		'<text xmlns="http://www.w3.org/1999/xhtml">HTML</text>', '<html:text>HTML</html:text>',
	])("refuses active, referencing or unimplemented SVG features: %s", (body) => {
		expect(readEmbeddedAsset(svgURL(xml(body))).ok).toBe(false);
	});

	it.each([
		'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><g></svg>',
		'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width=20/></svg>',
		'<svg xmlns="http://www.w3.org/2000/svg" width="20" width="30" height="20"/>',
		'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"/><svg/>',
		'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><text>&unknown;</text></svg>',
		'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><text>&#0;</text></svg>',
		'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><text>&#xD800;</text></svg>',
		'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><text>A & B</text></svg>',
		'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><text>]]></text></svg>',
		'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20">not text</svg>',
		'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect><text>bad nesting</text></rect></svg>',
		'<svg width="20" height="20"/>', '<?xml version="1.0"?>' + BADGE,
		'<!DOCTYPE svg [<!ENTITY external SYSTEM "file:///private">]>' + BADGE,
		'<!-- unsupported declaration -->' + BADGE,
	])("fails closed on malformed XML or unsupported declarations: %s", (text) => {
		expect(readEmbeddedAsset(svgURL(text)).ok).toBe(false);
	});

	it("fails closed on malformed encodings and illegal XML characters", () => {
		for (const value of ['data:image/svg+xml,%C0%AF', 'data:image/svg+xml,%', 'data:image/svg+xml;charset=latin1,' + encodeURIComponent(BADGE), 'data:image/svg+xml;base64,!!!!', 'data:image/svg+xml;base64,' + Buffer.from([0xff]).toString('base64'), svgURL(xml('<text>\u0000</text>'))]) {
			expect(readEmbeddedAsset(value).ok).toBe(false);
		}
	});

	it.each(['width="0" height="20"', 'width="-1" height="20"', 'width="20%" height="20"', 'width="NaN" height="20"', 'viewBox="0 0 20 0"', 'viewBox="0,,0,20,20"', ''])("requires finite positive absolute intrinsic dimensions: %s", (dimensions) => {
		expect(readEmbeddedAsset(svgURL(`<svg xmlns="http://www.w3.org/2000/svg" ${dimensions}/>`)).ok).toBe(false);
	});

	it("bounds bytes, elements, depth, text, numeric magnitude and intrinsic pixel area", () => {
		const bodies = [
			'<rect/>'.repeat(MAX_IMPORT_SVG_ELEMENTS),
			'<g>'.repeat(MAX_IMPORT_SVG_DEPTH) + '</g>'.repeat(MAX_IMPORT_SVG_DEPTH),
			'<text>' + 'a'.repeat(65_537) + '</text>',
			'<rect x="1000001" width="20" height="20"/>',
		];
		for (const body of bodies) expect(readEmbeddedAsset(svgURL(xml(body)))).toEqual({ ok: false, reason: "assetTooLarge" });
		expect(readEmbeddedAsset(svgURL(BADGE + " ".repeat(MAX_IMPORT_SVG_BYTES)))).toEqual({ ok: false, reason: "assetTooLarge" });
		for (const dimensions of ['width="32769" height="1"', 'width="8000" height="8000"']) {
			expect(readEmbeddedAsset(svgURL(`<svg xmlns="http://www.w3.org/2000/svg" ${dimensions}/>`))).toEqual({ ok: false, reason: "assetTooLarge" });
		}
	});

	it("accepts only bounded static raster data inside SVG image elements", () => {
		for (const dataURL of Object.values(rasters)) {
			const result = readEmbeddedAsset(svgURL(xml(`<image width="7" height="3" href="${dataURL}"/>`)));
			expect(result.ok).toBe(!dataURL.startsWith("data:image/gif;"));
		}
		expect(readEmbeddedAsset(svgURL(xml('<image width="7" height="3" href="data:image/png;base64,YQ=="/>'))).ok).toBe(false);
	});
});

describe("passive reflected attachment variants", () => {
	it("bakes horizontal, vertical and double reflection into different cached native file assets", () => {
		const assets = new ImportAssets("Maps/source.excalidraw", idFactory(13));
		const source = svgURL(BADGE);
		const normal = assets.add("badge", source);
		const variants = [{ flipX: true }, { flipY: true }, { flipX: true, flipY: true }];
		for (const reflection of variants) {
			const reflected = assets.add("badge", source, reflection);
			expect(reflected).toMatchObject({ ok: true, width: 240, height: 110 });
			expect(reflected).toEqual(assets.add("badge", source, reflection));
			expect(reflected).not.toEqual(normal);
		}
		expect(assets.list()).toHaveLength(4);
		const saved = assets.list().map((asset) => new TextDecoder().decode(asset.bytes));
		expect(saved[1]).toContain('matrix(-1 0 0 1 240 0)');
		expect(saved[2]).toContain('matrix(1 0 0 -1 0 110)');
		expect(saved[3]).toContain('matrix(-1 0 0 -1 240 110)');
		for (const asset of assets.list()) expect(readPassiveSvg(asset.bytes).ok).toBe(true);
		expect(source).toBe(svgURL(BADGE));
	});

	it("reflects around the saved viewBox centre, including a negative origin", () => {
		const assets = new ImportAssets("source.excalidraw", idFactory(1));
		const source = svgURL('<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 -20 120 60"><rect x="10" y="-20" width="20" height="20"/></svg>');
		expect(assets.add("viewBox", source, { flipX: true, flipY: true })).toMatchObject({ ok: true, width: 120, height: 60 });
		expect(new TextDecoder().decode(assets.list()[0]!.bytes)).toContain('matrix(-1 0 0 -1 140 20)');
	});

	it("embeds static PNG/JPEG/WebP bytes in a passive SVG to preserve reflection without new schema fields", () => {
		for (const source of Object.values(rasters).filter((value) => !value.startsWith("data:image/gif;"))) {
			const assets = new ImportAssets("source.excalidraw", idFactory(1));
			expect(assets.add("raster", source, { flipX: true })).toMatchObject({ ok: true, width: 7, height: 3 });
			const asset = assets.list()[0]!;
			expect(asset.path.endsWith(".svg")).toBe(true);
			const saved = new TextDecoder().decode(asset.bytes);
			expect(saved).toContain('matrix(-1 0 0 1 7 0)');
			expect(saved).toContain('href="' + source + '"');
			expect(readPassiveSvg(asset.bytes)).toMatchObject({ ok: true, width: 7, height: 3 });
		}
	});

	it("keeps ordinary raster attachments compatible and isolates reflected failures from the original", () => {
		const gif = Object.values(rasters).find((value) => value.startsWith("data:image/gif;"))!;
		const assets = new ImportAssets("source.excalidraw", idFactory(1));
		expect(assets.add("gif", gif, { flipX: true })).toEqual({ ok: false, reason: "unsupportedAsset" });
		expect(assets.add("gif", gif)).toMatchObject({ ok: true, width: 7, height: 3 });
		expect(assets.list()[0]!.path.endsWith(".gif")).toBe(true);
		expect(readEmbeddedRaster(svgURL(BADGE)).ok).toBe(false);
		expect(readEmbeddedAsset(PNG)).toEqual(readEmbeddedRaster(PNG));
	});

	it("refuses animated raster wrappers and asymmetrically aligned SVG reflection", () => {
		const pngBytes = Buffer.from(PNG.split(",")[1]!, "base64");
		const animationChunk = Buffer.alloc(20);
		animationChunk.writeUInt32BE(8, 0);
		animationChunk.write("acTL", 4);
		const apng = 'data:image/png;base64,' + Buffer.concat([pngBytes.subarray(0, 33), animationChunk, pngBytes.subarray(33)]).toString("base64");
		const webp = Object.values(rasters).find((value) => value.startsWith("data:image/webp;"))!;
		const webpBytes = Buffer.from(webp.split(",")[1]!, "base64");
		const animation = Buffer.concat([webpBytes, Buffer.from('ANIM'), Buffer.alloc(10)]);
		animation.writeUInt32LE(animation.length - 8, 4);
		animation.writeUInt32LE(6, webpBytes.length + 4);
		for (const source of [apng, 'data:image/webp;base64,' + animation.toString("base64")]) {
			const assets = new ImportAssets("source.excalidraw", idFactory(1));
			expect(assets.add("animated", source, { flipY: true })).toEqual({ ok: false, reason: "unsupportedAsset" });
			expect(assets.list()).toEqual([]);
		}
		const assets = new ImportAssets("source.excalidraw", idFactory(1));
		const source = svgURL(BADGE.replace('width="240"', 'preserveAspectRatio="xMinYMin" width="240"'));
		expect(assets.add("aligned", source, { flipX: true })).toEqual({ ok: false, reason: "unsupportedAsset" });
	});

	it("refuses EXIF orientation and oversized raster-to-SVG derivatives without affecting the original", () => {
		const jpeg = Object.values(rasters).find((value) => value.startsWith("data:image/jpeg;"))!;
		const original = Buffer.from(jpeg.split(",")[1]!, "base64");
		const exif = Buffer.from([255, 225, 0, 8, 69, 120, 105, 102, 0, 0]);
		const source = 'data:image/jpeg;base64,' + Buffer.concat([original.subarray(0, 2), exif, original.subarray(2)]).toString("base64");
		const assets = new ImportAssets("source.excalidraw", idFactory(1));
		expect(assets.add("oriented", source, { flipX: true })).toEqual({ ok: false, reason: "unsupportedAsset" });
		expect(assets.add("oriented", source)).toMatchObject({ ok: true, width: 7, height: 3 });
		const oversized = Buffer.alloc(MAX_IMPORT_SVG_BYTES);
		Buffer.from(PNG.split(",")[1]!, "base64").copy(oversized);
		expect(assets.add("large", 'data:image/png;base64,' + oversized.toString("base64"), { flipX: true })).toEqual({ ok: false, reason: "assetTooLarge" });
	});

	it("counts reflected variants against the existing attachment cap", () => {
		const assets = new ImportAssets("source.excalidraw", idFactory(3));
		for (let index = 0; index < MAX_IMPORT_ASSETS; index += 1) expect(assets.add(String(index), PNG).ok).toBe(true);
		expect(assets.add("0", PNG, { flipX: true })).toEqual({ ok: false, reason: "assetTooLarge" });
		expect(assets.list()).toHaveLength(MAX_IMPORT_ASSETS);
	});
});
