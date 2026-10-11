/** Copy bounded static SVG geometry, never the source DOM, CSS or executable content. */
import { MAX_IMPORT_SVG_BYTES, MAX_IMPORT_SVG_DEPTH, MAX_IMPORT_SVG_ELEMENTS, readEmbeddedRaster, readPassiveSvg } from "./importers/assets";

const SVG_NS = "http://www.w3.org/2000/svg";
const GEOMETRY: Readonly<Record<string, readonly string[]>> = {
	g: [],
	path: ["d"],
	rect: ["x", "y", "width", "height", "rx", "ry"],
	circle: ["cx", "cy", "r"],
	ellipse: ["cx", "cy", "rx", "ry"],
	line: ["x1", "y1", "x2", "y2"],
	polyline: ["points"],
	polygon: ["points"],
	image: ["x", "y", "width", "height", "preserveAspectRatio"],
	text: ["x", "y", "dx", "dy", "xml:space"],
	tspan: ["x", "y", "dx", "dy", "xml:space"],
};
const PAINT = ["fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "stroke-dashoffset", "fill-rule", "opacity", "fill-opacity", "stroke-opacity"] as const;
const TEXT = ["font-family", "font-size", "font-weight", "font-style", "text-anchor", "dominant-baseline"] as const;
const DEFAULT_PAINT: Readonly<Record<string, string>> = { fill: "black", stroke: "none", "stroke-width": "1", "stroke-linecap": "butt", "stroke-linejoin": "miter", "stroke-dasharray": "none", "stroke-dashoffset": "0", "fill-rule": "nonzero", opacity: "1", "fill-opacity": "1", "stroke-opacity": "1" };

export interface SvgSnapshotBox {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

function escapeXML(value: string): string {
	return value.replace(/[&<>"\r]/gu, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "\r": "&#13;" })[character]!);
}

function paintColor(value: string): string {
	const match = /^rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/u.exec(value);
	if (match === null) return value;
	const bytes = match.slice(1, 4).map(Number);
	const alpha = match[4] === undefined ? 1 : Number(match[4]);
	if (bytes.some(byte => !Number.isInteger(byte) || byte < 0 || byte > 255) || !Number.isFinite(alpha) || alpha < 0 || alpha > 1) return value;
	return "#" + [...bytes, ...(alpha === 1 ? [] : [Math.round(alpha * 255)])].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

/** No insertion, listeners, export calls, font loading or changes to the original element. */
export function capturePassiveSvg(root: SVGElement, box?: SvgSnapshotBox): string | undefined {
	try {
		const owner = root.ownerDocument.defaultView;
		if (owner === null || !root.instanceOf(owner.SVGElement) || root.namespaceURI !== SVG_NS) return undefined;
		const viewport = box ?? (root.instanceOf(owner.SVGSVGElement) ? { x: root.viewBox.baseVal.x, y: root.viewBox.baseVal.y, width: root.viewBox.baseVal.width || root.width.baseVal.value, height: root.viewBox.baseVal.height || root.height.baseVal.value } : undefined);
		if (viewport === undefined || Object.values(viewport).some(value => !Number.isFinite(value)) || viewport.width < 1 || viewport.height < 1) return undefined;
		let elements = 0;
		let length = 0;
		const copy = (node: Element, inherited: Readonly<Record<string, string>>, depth: number): string => {
			if (depth > MAX_IMPORT_SVG_DEPTH || ++elements > MAX_IMPORT_SVG_ELEMENTS || node.namespaceURI !== SVG_NS) throw new Error("SVG snapshot limit");
			const tag = node.localName;
			// Audited Excalidraw exports include inert metadata and an empty font style.
			if (tag === "metadata" && node.textContent === "") return "";
			if (tag === "defs" && Array.from(node.children).every(child => child.localName === "style" && child.textContent?.trim() === "")) return "";
			if (tag !== "svg" && !Object.prototype.hasOwnProperty.call(GEOMETRY, tag)) throw new Error("SVG snapshot element");
			if (tag === "svg" && node !== root) throw new Error("Nested SVG viewport");
			const computed = node.isConnected ? owner.getComputedStyle(node) : undefined;
			for (const name of ["filter", "clip-path", "mask", "marker-start", "marker-mid", "marker-end"]) {
				const value = computed?.getPropertyValue(name) || node.getAttribute(name);
				if (value && value !== "none") throw new Error("SVG snapshot referenced paint");
			}
			if (computed?.display === "none" || computed?.visibility === "hidden") return "";
			if (Array.from(node.attributes).some(attribute => /^on/iu.test(attribute.name) || tag !== "image" && ["href", "xlink:href"].includes(attribute.name))) throw new Error("SVG snapshot active attribute");
			const attributes: string[] = [];
			if (tag === "image") {
				const href = node.getAttribute("href") ?? node.getAttributeNS("http://www.w3.org/1999/xlink", "href");
				if (!readEmbeddedRaster(href).ok) throw new Error("SVG snapshot image");
				attributes.push(` href="${escapeXML(href!)}"`);
			}
			for (const name of GEOMETRY[tag] ?? []) {
				const value = node.getAttribute(name);
				if (value !== null) attributes.push(` ${name}="${escapeXML(value)}"`);
			}
			const paints: Record<string, string> = {};
			for (const name of [...PAINT, ...(tag === "text" || tag === "tspan" ? TEXT : [])]) {
				const value = computed?.getPropertyValue(name) || node.getAttribute(name) || (name === "opacity" ? "1" : inherited[name]) || DEFAULT_PAINT[name];
				if (value === undefined || value === "") continue;
				paints[name] = value;
				attributes.push(` ${name}="${escapeXML(name === "fill" || name === "stroke" ? paintColor(value) : value)}"`);
			}
			const transform = node.getAttribute("transform");
			if (transform !== null) {
				const clone = node.cloneNode(false) as SVGGraphicsElement;
				const consolidated = clone.transform.baseVal.consolidate();
				if (consolidated === null) throw new Error("SVG snapshot transform");
				const matrix = consolidated.matrix;
				attributes.push(` transform="matrix(${[matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f].join(" ")})"`);
			}
			let body = "";
			for (const child of Array.from(node.childNodes)) {
				if (child.nodeType === 1) body += copy(child as Element, paints, depth + 1);
				else if (child.nodeType === 3 && (tag === "text" || tag === "tspan")) body += escapeXML(child.textContent ?? "");
				else if (child.nodeType !== 8 && child.textContent?.trim()) throw new Error("SVG snapshot text");
			}
			const output = `<${tag === "svg" ? "g" : tag}${attributes.join("")}>${body}</${tag === "svg" ? "g" : tag}>`;
			length += output.length;
			if (length > MAX_IMPORT_SVG_BYTES) throw new Error("SVG snapshot bytes");
			return output;
		};
		const markup = `<svg xmlns="${SVG_NS}" width="${viewport.width}" height="${viewport.height}" viewBox="${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}">${copy(root, DEFAULT_PAINT, 1)}</svg>`;
		const safe = readPassiveSvg(new TextEncoder().encode(markup));
		if (!safe.ok) return undefined;
		return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new TextDecoder().decode(safe.bytes))}`;
	} catch {
		return undefined;
	}
}
