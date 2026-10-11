/** Read-only static exports from an already-open, audited Excalidraw 2.28.1 source. */
import type { App, TFile } from "obsidian";
import { capturePassiveSvg } from "./import-svg-snapshot";
import { readExcalidrawFile } from "./importers/excalidraw-file";
import { needsExcalidrawVisual } from "./importers/excalidraw-visual";
import { MAX_IMPORT_ASSET_TOTAL_BYTES, readEmbeddedRaster } from "./importers/assets";

type RecordValue = Record<string, unknown>;
const MAX_SNAPSHOTS = 512;
const MAX_COORDINATE = 100_000;
const LOAD_BOOKKEEPING = new Set(["version", "versionNonce", "updated"]);

function read(value: unknown, key: PropertyKey): unknown {
	if ((typeof value !== "object" || value === null) && typeof value !== "function") return undefined;
	try { return Reflect.get(value, key); } catch { return undefined; }
}

function record(value: unknown): value is RecordValue {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invoke(value: unknown, key: string, ...args: unknown[]): unknown {
	const method = read(value, key);
	if (typeof method !== "function") throw new Error("source export unavailable");
	return Reflect.apply(method, value, args) as unknown;
}

function equal(saved: unknown, live: unknown, depth = 0): boolean {
	if (depth > 32) return false;
	if (saved === live) return true;
	if (Array.isArray(saved)) return Array.isArray(live) && saved.length === live.length && saved.every((value: unknown, index) => equal(value, live[index], depth + 1));
	if (!record(saved) || !record(live)) return false;
	const keys = Object.keys(saved);
	return keys.length === Object.keys(live).length && keys.every(key => equal(saved[key], live[key], depth + 1));
}

function finite(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= MAX_COORDINATE;
}

/** Missing, dirty, changed or unfamiliar source views retain the offline native approximation. */
export async function readOpenExcalidrawAppearance(app: App, file: TFile, sourceText: string): Promise<unknown> {
	try {
		const plugin = read(read(read(app, "plugins"), "plugins"), "obsidian-excalidraw-plugin");
		const view = app.workspace.getMostRecentLeaf()?.view;
		if (read(read(plugin, "manifest"), "version") !== "2.28.1" || view?.getViewType() !== "excalidraw"
			|| read(view, "file") !== file || read(view, "dirty") !== false || read(view, "saving") !== false
			|| read(view, "data") !== sourceText) return undefined;
		const parsed = readExcalidrawFile(sourceText);
		if (!parsed.ok) return undefined;
		const api = read(view, "excalidrawAPI");
		const library = read(read(view, "packages"), "excalidrawLib");
		const saved = parsed.file.scene.elements.filter(value => record(value) && value.isDeleted !== true) as RecordValue[];
		const current = (): boolean => {
			if (read(view, "file") !== file || read(view, "data") !== sourceText || read(view, "dirty") !== false || read(view, "saving") !== false) return false;
			const live = invoke(api, "getSceneElements");
			if (!Array.isArray(live) || live.length !== saved.length) return false;
			// Loading a note preview increments revisions without changing its visible fields.
			return saved.every((element, index) => record(live[index]) && Object.keys(element).every(key => LOAD_BOOKKEEPING.has(key) || equal(element[key], (live[index] as RecordValue)[key])));
		};
		if (!current()) return undefined;
		const state = invoke(api, "getAppState");
		// Dark source inversion is a filter, outside the passive geometry contract.
		if (!record(state) || state.theme !== "light") return undefined;
		const snapshots: unknown[] = [];
		const rasters: unknown[] = [];
		let totalLength = 0;
		let attempted = 0;
		let rasterLength = 0;
		for (const element of saved) {
			if (!needsExcalidrawVisual(element) || typeof element.id !== "string" || element.frameId != null
				|| element.link != null || parsed.file.links.has(element.id)) continue;
			if (++attempted > MAX_SNAPSHOTS) break;
			const label = saved.find(value => value.type === "text" && value.containerId === element.id);
			if (label?.link != null || typeof label?.id === "string" && parsed.file.links.has(label.id)) continue;
			const elements = label === undefined ? [element] : [element, label];
			let files: Record<string, unknown> = {};
			if (element.type === "image") {
				const loaded = invoke(api, "getFiles");
				const asset = typeof element.fileId === "string" ? read(loaded, element.fileId) : undefined;
				if (!record(asset) || typeof asset.dataURL !== "string" || rasterLength + asset.dataURL.length > MAX_IMPORT_ASSET_TOTAL_BYTES
					|| !readEmbeddedRaster(asset.dataURL).ok) continue;
				rasterLength += asset.dataURL.length;
				files = { [element.fileId as string]: asset };
				rasters.push({ sourceId: element.id, fileId: element.fileId, dataURL: asset.dataURL });
			}
			const bounds = invoke(library, "getCommonBoundingBox", elements);
			if (!record(bounds) || !finite(bounds.minX) || !finite(bounds.minY) || !finite(bounds.width) || !finite(bounds.height)
				|| bounds.width < 1 || bounds.height < 1) continue;
			const padding = Math.max(8, typeof element.strokeWidth === "number" ? element.strokeWidth * 8 : 8);
			if (padding > 1_000) continue;
			// Pictures use only already-loaded, validated data rasters; no asset or font is requested.
			const svg: unknown = await invoke(library, "exportToSvg", { elements, appState: { ...state, exportBackground: false, exportWithDarkMode: false, exportEmbedScene: false }, files, exportPadding: padding, skipInliningFonts: true, renderEmbeddables: false });
			const owner = view.containerEl.ownerDocument.defaultView;
			if (owner === null || !owner.SVGSVGElement || !(svg instanceof owner.SVGSVGElement)) continue;
			if (svg.querySelector("path,rect,ellipse,circle,image,text,polyline,polygon,line") === null) continue;
			const dataURL = capturePassiveSvg(svg);
			if (dataURL === undefined) continue;
			totalLength += dataURL.length;
			if (totalLength > MAX_IMPORT_ASSET_TOTAL_BYTES) break;
			snapshots.push({ sourceId: element.id, dataURL, x: bounds.minX - padding, y: bounds.minY - padding, width: bounds.width + padding * 2, height: bounds.height + padding * 2,
				...(label === undefined ? {} : { labelId: label.id }) });
		}
		return current() ? { sourceText, snapshots, ...(rasters.length === 0 ? {} : { rasters }) } : undefined;
	} catch {
		return undefined;
	}
}
