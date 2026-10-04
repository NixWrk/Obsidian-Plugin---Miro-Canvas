import { describe, expect, it } from "vitest";
import { APPEARANCE_ACTIONS as A } from "../src/appearance";
import { formatTextSelection } from "../src/text-format";

describe("formatting selected words", () => {
  it("changes only the fragment, keeping whitespace outside Markdown marks", () => {
    expect(formatTextSelection(" слово \n ещё ", { type: A.setFormat, format: { bold: true } }))
      .toBe(" **слово** \n **ещё** ");
  });
  it("toggles the same mark off and nests other marks", () => {
    expect(formatTextSelection("**слово**", { type: A.setFormat, format: { bold: true } })).toBe("слово");
    expect(formatTextSelection("**слово**", { type: A.setFormat, format: { italic: true } })).toBe("***слово***");
    expect(formatTextSelection("слово", { type: A.setFormat, format: { strike: true } })).toBe("~~слово~~");
  });
  it("uses native HTML inline tags for underline and existing HTML cards", () => {
    expect(formatTextSelection("слово", { type: A.setFormat, format: { underline: true } })).toBe("<u>слово</u>");
    expect(formatTextSelection("слово", { type: A.setFormat, format: { bold: true } }, true)).toBe("<strong>слово</strong>");
  });
  it("toggles a mark inside a fragment's font wrapper", () => {
    const text = '<span style="font-size: 24px">**слово**</span>';
    expect(formatTextSelection(text, { type: A.setFormat, format: { bold: true } }))
      .toBe('<span style="font-size: 24px">слово</span>');
  });
  it("keeps a fragment's font and size in its own text, rejecting unsafe CSS", () => {
    expect(formatTextSelection("слово", { type: A.setFontFamily, fontFamily: "Georgia" })).toContain("font-family: &quot;Georgia&quot;");
    expect(formatTextSelection("слово", { type: A.setFontSize, fontSize: 24 })).toBe('<span style="font-size: 24px">слово</span>');
    expect(formatTextSelection("слово", { type: A.setFontFamily, fontFamily: 'bad; color:red' })).toBeUndefined();
    expect(formatTextSelection("слово", { type: A.setFontSize, fontSize: NaN })).toBeUndefined();
  });
  it("leaves paragraph alignment and card colours to the card", () => {
    expect(formatTextSelection("слово", { type: A.setAlignment, alignment: "left" })).toBeUndefined();
  });
});
