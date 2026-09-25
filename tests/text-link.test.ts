import { describe, expect, it } from "vitest";

import { cardLinkUrl, linkSelection, linkText, unlinkText } from "../src/text-link";

describe("a card's whole text as a Markdown link", () => {
  it("turns the whole of a card's text into a link", () => {
    expect(linkText("Read more", "https://example.test")).toBe("[Read more](https://example.test)");
  });

  it("finds the address an already-linked card's text carries", () => {
    expect(cardLinkUrl("[Read more](https://example.test)")).toBe("https://example.test");
    expect(cardLinkUrl("Read more")).toBeUndefined();
    // More than the link alone is not the whole-text link this module reads back.
    expect(cardLinkUrl("See [Read more](https://example.test) too")).toBeUndefined();
  });

  it("changes only the address of a card already linked, keeping its label", () => {
    expect(linkText("[Read more](https://example.test)", "obsidian://open?vault=x")).toBe(
      "[Read more](obsidian://open?vault=x)",
    );
  });

  it("takes a link off again, back to its label", () => {
    expect(unlinkText("[Read more](https://example.test)")).toBe("Read more");
    expect(unlinkText("Read more")).toBe("Read more");
  });

  it("links only a selected stretch of text, as a mark is only applied there", () => {
    expect(linkSelection("Read more", "https://example.test")).toBe("[Read more](https://example.test)");
    expect(linkSelection("  ", "https://example.test")).toBe("  ");
  });
});
