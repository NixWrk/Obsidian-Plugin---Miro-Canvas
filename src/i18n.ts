/**
 * The plugin's words, in the language Obsidian itself speaks.
 *
 * Every string a person reads - labels, hints, menus, notices, settings,
 * command names - comes from one table per language.  English is the
 * reference every other table must match key for key, and the fallback for
 * any language without a table.  Diagnostics written for maintainers stay in
 * English, as Obsidian's own console messages do.
 *
 * The language is chosen once, when the plugin loads, as Obsidian chooses its
 * own: a change of language in Obsidian's settings takes effect after a
 * restart there too.
 */

import { EN, type Messages } from "./locales/en";
import { RU } from "./locales/ru";
import { ZH } from "./locales/zh";

export type Locale = "en" | "ru" | "zh";

const TABLES: Readonly<Record<Locale, Messages>> = Object.freeze({ en: EN, ru: RU, zh: ZH });

let current: Locale = "en";

/**
 * The table for an Obsidian language code such as "ru", "ru-RU", "zh" or
 * "en-GB"; English otherwise.  The Chinese table is Simplified, so Traditional
 * codes stay with English.
 */
export function localeFor(language: string | null | undefined): Locale {
	const code = (language ?? "").trim().toLowerCase();
	if (code === "ru" || code.startsWith("ru-")) return "ru";
	if (/^zh(?:-(?:cn|sg|hans)(?:-|$)|$)/u.test(code)) return "zh";
	return "en";
}

export function setLocale(locale: Locale): void {
	current = locale;
}

export function currentLocale(): Locale {
	return current;
}

/** The words of the language in use. */
export function words(): Messages {
	return TABLES[current];
}

/** Sentences side by side, as the language in use spaces them: Chinese leaves no gap. */
export function sentences(...parts: readonly string[]): string {
	return parts.join(words().settings.sentenceGap);
}

export type { Messages };
