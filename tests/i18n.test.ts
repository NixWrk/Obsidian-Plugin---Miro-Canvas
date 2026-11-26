import { afterEach, describe, expect, it } from "vitest";

import { currentLocale, localeFor, sentences, setLocale, words } from "../src/i18n";
import { EN } from "../src/locales/en";
import { RU } from "../src/locales/ru";
import { ZH } from "../src/locales/zh";

/**
 * Strings that stay the same in Russian: names of products and formats.
 * Anything else equal to the English is a string someone forgot to
 * translate.
 */
const SAME_IN_RUSSIAN = new Set<string>([
  "export.paperLabels.a4",
  "export.paperLabels.a3",
  "export.paperLabels.letter",
  "export.pdfCaption",
  "export.pptxCaption",
  "export.svgCaption",
  "importGuide.windows",
  "importGuide.macos",
  "importGuide.linux",
  // The plugin's name and a version number: the same in every language.
  "updates.indicator",
  "updates.modalTitle",
  // A file name and a line of code: neither is prose.
  "welcome.codeFileName",
  "welcome.codeBody",
  // An example web address, not a word to translate.
  "toolbar.linkPlaceholder",
  // The search counter, "3 / 12": numbers only.
  "search.count",
  // The space between two sentences.
  "settings.sentenceGap",
]);

/** Product names and short labels Chinese keeps as they are, beside the Russian list. */
const SAME_IN_CHINESE = new Set<string>([...SAME_IN_RUSSIAN, "dock.themeSystem"]);

type Table = { readonly [key: string]: unknown };

/** Every leaf of a table, by its dotted path. */
function leaves(table: Table, prefix = ""): Map<string, unknown> {
	const found = new Map<string, unknown>();
	for (const [key, value] of Object.entries(table)) {
		const path = prefix === "" ? key : `${prefix}.${key}`;
		if (typeof value === "string" || typeof value === "function") found.set(path, value);
		else for (const [inner, leaf] of leaves(value as Table, path)) found.set(inner, leaf);
	}
	return found;
}

/** A string a function gives for sample values of the kinds it takes. */
function sample(value: unknown): string {
	if (typeof value !== "function") return String(value);
	const values = Array.from({ length: value.length }, (_, index) => (index === 0 ? 3 : 12));
	return String((value as (...args: unknown[]) => unknown)(...values));
}

afterEach(() => setLocale("en"));

describe("the plugin's language", () => {
	it("follows Obsidian's language, falling back to English", () => {
		expect(localeFor("ru")).toBe("ru");
		expect(localeFor("ru-RU")).toBe("ru");
		expect(localeFor(" RU ")).toBe("ru");
		expect(localeFor("en")).toBe("en");
		expect(localeFor("en-GB")).toBe("en");
		expect(localeFor("de")).toBe("en");
		expect(localeFor("rus")).toBe("en");
		expect(localeFor("zh")).toBe("zh");
		expect(localeFor("zh-CN")).toBe("zh");
		expect(localeFor("zh-Hans-CN")).toBe("zh");
		expect(localeFor("zh-TW")).toBe("en");
		expect(localeFor("zh-HK")).toBe("en");
		expect(localeFor("zh-Hant")).toBe("en");
		expect(localeFor("zhx")).toBe("en");
		expect(localeFor(null)).toBe("en");
		expect(localeFor(undefined)).toBe("en");
	});

	it("serves the table of the language set", () => {
		expect(currentLocale()).toBe("en");
		expect(words().layer.front).toBe(EN.layer.front);
		setLocale("ru");
		expect(words().layer.front).toBe(RU.layer.front);
    expect(words().export.capturingProgress(2, 20)).toBe("Отрисовка страниц: 2 из 20");
	});

	it("has every English string in Russian, of the same kind", () => {
		const english = leaves(EN);
		const russian = leaves(RU as unknown as Table);
		expect([...russian.keys()].sort()).toEqual([...english.keys()].sort());
		for (const [path, value] of english) {
			const other = russian.get(path);
			expect(typeof other, path).toBe(typeof value);
			if (typeof value === "function") expect((other as (...args: unknown[]) => unknown).length, path).toBe(value.length);
		}
	});

	it("spaces sentences as the language does", () => {
		expect(sentences("One.", "Two.")).toBe("One. Two.");
		setLocale("ru");
		expect(sentences("Раз.", "Два.")).toBe("Раз. Два.");
		setLocale("zh");
		expect(sentences("一。", "二。")).toBe("一。二。");
	});

	it("ends every Chinese description a value follows with a full stop", () => {
		const { settings, enhancements } = ZH;
		const descriptions = [
			settings.zoomStepDesc, settings.minZoomDesc, settings.maxZoomDesc, settings.panStepDesc, settings.fastPanDesc,
			settings.magnetDesc, settings.snapDesc, settings.labelPositionDesc,
			enhancements.shapeRadiusControlMinZoomHint, enhancements.cardCornerRadiusHint, enhancements.contentHint,
		];
		for (const description of descriptions) expect(description.endsWith("。"), description).toBe(true);
	});

	it("has every English string in Chinese, of the same kind", () => {
		const english = leaves(EN);
		const chinese = leaves(ZH as unknown as Table);
		expect([...chinese.keys()].sort()).toEqual([...english.keys()].sort());
		for (const [path, value] of english) {
			const other = chinese.get(path);
			expect(typeof other, path).toBe(typeof value);
			if (typeof value === "function") expect((other as (...args: unknown[]) => unknown).length, path).toBe(value.length);
		}
	});

	it("leaves no English string untranslated in Chinese", () => {
		const english = leaves(EN);
		const untranslated = [...leaves(ZH as unknown as Table)]
			.filter(([path, value]) => !SAME_IN_CHINESE.has(path) && sample(value) === sample(english.get(path)))
			.map(([path]) => path);
		expect(untranslated).toEqual([]);
	});

	it("leaves no English string untranslated in Russian", () => {
		const english = leaves(EN);
		const untranslated = [...leaves(RU as unknown as Table)]
			.filter(([path, value]) => !SAME_IN_RUSSIAN.has(path) && sample(value) === sample(english.get(path)))
			.map(([path]) => path);
		expect(untranslated).toEqual([]);
		for (const [path, value] of leaves(RU as unknown as Table)) {
			if (SAME_IN_RUSSIAN.has(path)) continue;
			expect(sample(value).trim().length, path).toBeGreaterThan(0);
		}
	});
});
