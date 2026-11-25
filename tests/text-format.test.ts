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
  it("colors selected text in place, keeping newlines, whitespace and other styles", () => {
    expect(formatTextSelection(" **слово** \n\n ещё ", { type: A.setColor, slot: "text", color: "#F15" }))
      .toBe(' <span style="color: #ff1155">**слово**</span> \n\n <span style="color: #ff1155">ещё</span> ');
    expect(formatTextSelection("<em>слово</em>", { type: A.setColor, slot: "text", color: "#ff1155" }, true))
      .toBe('<span style="color: #ff1155"><em>слово</em></span>');
  });
  it("replaces or removes selected inline colors without rewriting other styles", () => {
    const text = '<span style="color: #112233">одно</span> <span style="color: #aabbccff">другое</span>';
    expect(formatTextSelection(text, { type: A.setColor, slot: "text", color: "#ff1155" }))
      .toBe('<span style="color: #ff1155">одно другое</span>');
    expect(formatTextSelection(text, { type: A.setColor, slot: "text", color: null })).toBe("одно другое");
    expect(formatTextSelection(text, { type: A.resetColor, slot: "text" })).toBe("одно другое");
    expect(formatTextSelection("слово", { type: A.setColor, slot: "text", color: "red; display: none" })).toBeUndefined();
  });
  it("recolors an already colored range without losing its nested font size", () => {
    const text = '<span style="color: #112233"><span style="font-size: 24px">слово</span></span>';
    expect(formatTextSelection(text, { type: A.setColor, slot: "text", color: "#ff1155" }))
      .toBe('<span style="color: #ff1155"><span style="font-size: 24px">слово</span></span>');
    expect(formatTextSelection(text, { type: A.resetColor, slot: "text" })).toBe('<span style="font-size: 24px">слово</span>');
  });
  it("leaves paragraph alignment and other color slots to the card", () => {
    expect(formatTextSelection("слово", { type: A.setAlignment, alignment: "left" })).toBeUndefined();
    expect(formatTextSelection("слово", { type: A.setColor, slot: "fill", color: "#ff1155" })).toBeUndefined();
  });
});
