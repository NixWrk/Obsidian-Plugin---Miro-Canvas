import { describe, expect, it } from "vitest";
import {
  hasAsciiControl,
  hasControlOrFormat,
  hasInvalidFilenameCharacter,
  hasValidFilenameCharacters,
  replaceInvalidFilenameCharacters,
} from "../src/control-characters";

const ascii = /[\u0000-\u001f\u007f]/u;
const c0 = /[\u0000-\u001f]/u;
const format = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u200b\u200c\u200e\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/u;
const filename = /[/\\:*?"<>|\u0000-\u001f]/u;
const segment = /[<>"|?*\u0000-\u001f]/;
const validFilename = /^[^/\\:*?"<>|\u0000-\u001f]{1,180}$/u;
const filenameReplace = /[/\\:*?"<>|\u0000-\u001f]/gu;

function compare(value: string): void {
  const expected = [ascii.test(value), c0.test(value), format.test(value), filename.test(value), segment.test(value), validFilename.test(value), value.replace(filenameReplace, "_")];
  const actual = [hasAsciiControl(value), hasAsciiControl(value, false), hasControlOrFormat(value), hasInvalidFilenameCharacter(value), hasInvalidFilenameCharacter(value, false), hasValidFilenameCharacters(value), replaceInvalidFilenameCharacters(value)];
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Profile mismatch for ${JSON.stringify(value)}: ${JSON.stringify({ expected, actual })}`);
  }
}

describe("exact character profiles", () => {
  it("matches all 65,536 code units alone and at each string position", () => {
    for (let code = 0; code <= 65535; code += 1) {
      const character = String.fromCharCode(code);
      for (const value of [character, `${character}ab`, `a${character}b`, `ab${character}`]) {
        compare(value);
      }
    }
  });

  it("matches mixed controls, whitespace, Unicode and surrogate sequences", () => {
    const values = ["", " \t\n ", "Привет-🌿", "e\u0301", "a\u0000b\u007fc", "\u0080\u009f", "\u200c\u200d\u200e", "\u2064\u2065\u2066", "\ud800", "\udfff", "\ud800a\udfff", "\ud800\udfff", "\ud800\ud800\udfff", "\ufefftext\u2028", "../C:\\file\n:name?.woff"];
    for (const left of values) {
      compare(left);
      for (const right of values) {
        compare(left + right);
      }
    }
  });

  it("retains the 180-codepoint filename bound with astral and lone-surrogate text", () => {
    for (const character of ["a", "🌿", "\ud800", "\udfff", "e\u0301"]) {
      for (const count of [89, 90, 91, 179, 180, 181]) {
        compare(character.repeat(count));
      }
    }
    expect(hasValidFilenameCharacters("🌿".repeat(180))).toBe(true);
    expect(hasValidFilenameCharacters("🌿".repeat(181))).toBe(false);
    expect(hasValidFilenameCharacters("🌿".repeat(181), 181)).toBe(true);
    expect(hasValidFilenameCharacters("", 180)).toBe(false);
  });

  it("does not trim or add caller path and reserved-name restrictions", () => {
    expect(hasAsciiControl("\tnode\n")).toBe(true);
    expect(hasAsciiControl("\tnode\n".trim())).toBe(false);
    expect(hasAsciiControl("\u007f", false)).toBe(false);
    expect(hasAsciiControl("\u0080")).toBe(false);
    expect(hasControlOrFormat("\u200d\u2065")).toBe(false);
    expect(hasInvalidFilenameCharacter("a/b:c\\d", false)).toBe(false);
    expect(hasValidFilenameCharacters("con.woff")).toBe(true);
    expect(replaceInvalidFilenameCharacters("..a/b\n ")).toBe("..a_b_ ");
    expect(replaceInvalidFilenameCharacters("a\u0000b?c", "--")).toBe("a--b--c");
    expect(replaceInvalidFilenameCharacters("a?b", "$&")).toBe("a$&b");
  });
});
