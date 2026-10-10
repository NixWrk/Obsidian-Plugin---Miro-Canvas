import { describe, expect, it } from "vitest";
import { convertExcalidraw } from "../src/importers/excalidraw";
import { idFactory, assertImportedBoard } from "../src/importers/board-builder";
import { readExcalidrawFile } from "../src/importers/excalidraw-file";
import type { ImportContext, ImportSource } from "../src/importers/types";
import { compressToBase64 } from "./helpers/lz-string-compress";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
const context = (): ImportContext => ({ importerVersion: "test", now: "2026-10-11T00:00:00Z", newId: idFactory(8), resolveLink: (link) => link === "Note" ? "Notes/Note.md" : undefined });
const element = (id: string, type: string, more: Record<string, unknown> = {}) => ({ id, type, x: -20, y: 15, width: 100, height: 80, angle: Math.PI / 6, ...more });
const source = (scene: Record<string, unknown>): ImportSource => ({ path: "Drawings/Assets.excalidraw", extension: "excalidraw", text: JSON.stringify({ type: "excalidraw", version: 2, ...scene }) });

describe("Excalidraw assets and native note links", () => {
	it("shares decoded native image cards and retains rotation and bound arrows", () => {
		const input = source({ elements: [element("one", "image", { fileId: "../../id" }), element("two", "image", { fileId: "../../id", x: 400 }), element("arrow", "arrow", { angle: 0, x: 0, y: 40, width: 420, height: 0, points: [[0, 0], [420, 0]], startBinding: { elementId: "one" }, endBinding: { elementId: "two" } })], files: { "../../id": { dataURL: PNG } } });
		const before = input.text;
		const result = convertExcalidraw(input, context());
		expect(input.text).toBe(before);
		expect(result.assets).toHaveLength(1);
		const nodes = result.document.nodes as Record<string, unknown>[];
		expect(nodes.map(node => node.file)).toEqual([result.assets![0]!.path, result.assets![0]!.path]);
		expect(result.document.edges).toHaveLength(1);
		const metadata = result.document.miroCanvas as { localOverrides: Record<string, Record<string, unknown>> };
		expect(metadata.localOverrides[nodes[0]!.id as string]!.rotation).toBeCloseTo(30);
		assertImportedBoard(result.document);
	});
	it("decodes assets identically in plain and compressed plugin containers", () => {
		const plain = source({ elements: [element("one", "image", { fileId: "image" })], files: { image: { dataURL: PNG } } });
		const asNote = (compressed: boolean): ImportSource => ({ ...plain, path: "Drawings/Assets.excalidraw.md", extension: "md", text: `---\nexcalidraw-plugin: parsed\n---\n# Excalidraw Data\n## Drawing\n\`\`\`${compressed ? "compressed-json" : "json"}\n${compressed ? compressToBase64(plain.text) : plain.text}\n\`\`\`\n` });
		expect(convertExcalidraw(asNote(true), context())).toEqual(convertExcalidraw(asNote(false), context()));
	});
	it("retains heading and block subpaths in note embeds", () => {
		for (const subpath of ["#Heading", "#^block", "#page=2"]) {
			const result = convertExcalidraw(source({ elements: [element("note", "embeddable", { link: `[[Note${subpath}|alias]]` })] }), context());
			expect(result.document.nodes).toMatchObject([{ type: "file", file: "Notes/Note.md", subpath }]);
		}
	});
	it("Element Links override parsed scene links without consuming Embedded Files entries", () => {
		const input = source({ elements: [element("rect", "rectangle", { link: "[[Old]]" })] });
		const text = `---\nexcalidraw-plugin: parsed\n---\n# Excalidraw Data\n## Element Links\nrect: [[Note#Heading]]\n\n## Embedded Files\nasset: [[Different]]\n\n## Drawing\n\`\`\`json\n${input.text}\n\`\`\`\n`;
		const read = readExcalidrawFile(text);
		expect(read.ok && [...read.file.links]).toEqual([["rect", "[[Note#Heading]]"]]);
		const result = convertExcalidraw({ ...input, extension: "md", text }, context());
		expect((result.document.nodes as { text: string }[])[0]!.text).toContain("[[Note#Heading]]");
		expect((result.document.nodes as { text: string }[])[0]!.text).not.toContain("[[Old]]");
	});
	it("reports prose outside the scene instead of silently discarding it", () => {
		const input = source({ elements: [element("a", "rectangle")] });
		const text = `---\nexcalidraw-plugin: parsed\n---\nМои заметки [[Note]].\n# Excalidraw Data\n## Drawing\n\`\`\`json\n${input.text}\n\`\`\`\n`;
		const result = convertExcalidraw({ ...input, extension: "md", text }, context());
		expect(result.report.entries).toMatchObject([{ sourceId: "noteBody", reason: "noteBody" }]);
	});
	it("reports note properties without copying editor markers into board properties", () => {
		const input = source({ elements: [element("a", "rectangle")] });
		const result = convertExcalidraw({ ...input, frontmatter: { "excalidraw-plugin": "parsed", position: {}, tags: ["project"], aliases: ["Plan"] } }, context());
		expect(result.report.entries.map(entry => entry.sourceId)).toEqual(["frontmatter:tags", "frontmatter:aliases"]);
	});
	it("classifies contained text after its extension losses have been collected", () => {
		const result = convertExcalidraw(source({ elements: [element("a", "rectangle"), element("t", "text", { containerId: "a", text: "Label", customData: { extension: true } })] }), context());
		expect(result.report.counts).toEqual({ converted: 1, approximated: 0, notImported: 1, skipped: 0 });
	});
	it("reports intrinsic proportion normalization for stretched embedded images", () => {
		const result = convertExcalidraw(source({ elements: [element("i", "image", { fileId: "asset", width: 120, height: 80 })], files: { asset: { dataURL: PNG } } }), context());
		expect(result.report.entries).toMatchObject([{ sourceId: "i", status: "approximated", reason: "imageAspect" }]);
	});
	it("leaves diagnosed placeholders for SVG, remote and corrupt inline assets", () => {
		for (const [dataURL, reason] of [["data:image/svg+xml;base64,PHN2Zz4=", "unsupportedAsset"], ["https://example.com/image.png", "invalidAsset"], ["data:image/png;base64,YQ==", "invalidAsset"]]) {
			const result = convertExcalidraw(source({ elements: [element("image", "image", { fileId: "asset" })], files: { asset: { dataURL } } }), context());
			expect(result.assets).toBeUndefined();
			expect(result.report.entries[0]!.reason).toBe(reason);
			expect(result.document.nodes).toHaveLength(1);
		}
	});
});
