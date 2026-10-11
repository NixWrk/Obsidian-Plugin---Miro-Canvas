import { describe, expect, it } from "vitest";
import { idFactory } from "../src/importers/board-builder";
import { convertExcalidraw } from "../src/importers/excalidraw";
import { validateMiroCanvasMetadata } from "../src/metadata";

function convert(theme: unknown, host: "light" | "dark") {
	const text = JSON.stringify({ type: "excalidraw", version: 2, appState: { theme }, elements: [
		{ id: "pen", type: "freedraw", x: 0, y: 0, width: 40, height: 20, points: [[0, 0], [40, 20]], strokeColor: "#1e1e1e", strokeWidth: 2 },
	] });
	const source = { path: "theme.excalidraw", extension: "excalidraw", text };
	const result = convertExcalidraw(source, { now: "2026-10-11T00:00:00Z", importerVersion: "test", theme: host, newId: idFactory(10), resolveLink: () => undefined });
	expect(source.text).toBe(text);
	expect(validateMiroCanvasMetadata(result.document.miroCanvas).diagnostics).toEqual([]);
	const metadata = result.document.miroCanvas as { settings?: { displayTheme: string }; localOverrides: Record<string, { item: { stroke: { color: string } } }> };
	return { metadata, ink: Object.values(metadata.localOverrides)[0]!.item.stroke.color };
}

describe("Excalidraw source theme", () => {
	it("retains a declared text line height without changing the source", () => {
		const text = JSON.stringify({ type: "excalidraw", version: 2, elements: [
			{ id: "caption", type: "text", x: 0, y: 0, width: 150, height: 25, text: "Caption", fontSize: 20, fontFamily: 2, lineHeight: 1.25 },
		] });
		const source = { path: "caption.excalidraw", extension: "excalidraw", text };
		const result = convertExcalidraw(source, { now: "2026-10-11T00:00:00Z", importerVersion: "test", newId: idFactory(10), resolveLink: () => undefined });
		const metadata = result.document.miroCanvas as { localOverrides: Record<string, { typography: Record<string, unknown> }> };
		expect(Object.values(metadata.localOverrides)[0].typography).toMatchObject({ fontSize: 20, lineHeight: 1.25 });
		expect(source.text).toBe(text);
	});

	it("keeps a declared light board and dark ink on a dark host", () => {
		const { metadata, ink } = convert("light", "dark");
		expect(metadata.settings?.displayTheme).toBe("light");
		expect(ink).toBe("#1a1a1a");
	});
	it("keeps a declared dark board and light ink on a light host", () => {
		const { metadata, ink } = convert("dark", "light");
		expect(metadata.settings?.displayTheme).toBe("dark");
		expect(ink).not.toBe("#1a1a1a");
	});
	it.each([undefined, "unknown", null, 1])("uses the prior host behavior for %s", theme => {
		const { metadata, ink } = convert(theme, "dark");
		expect(metadata.settings).toBeUndefined();
		expect(ink).not.toBe("#1a1a1a");
	});
});
