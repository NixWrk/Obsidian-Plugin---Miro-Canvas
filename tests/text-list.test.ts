import { describe, expect, it } from "vitest";

import { hasBulletList, toggleBulletList } from "../src/text-list";

describe("a bullet list on a card's text", () => {
  it("adds a bullet to every non-empty line", () => {
    expect(toggleBulletList("one\ntwo\nthree")).toBe("- one\n- two\n- three");
    expect(hasBulletList("- one\n- two")).toBe(true);
    expect(hasBulletList("one\ntwo")).toBe(false);
  });

  it("toggles the bullet off again once every line already has one", () => {
    const bulleted = toggleBulletList("one\ntwo");
    expect(toggleBulletList(bulleted)).toBe("one\ntwo");
  });

  it("leaves a blank line alone, keeping indentation on the rest", () => {
    expect(toggleBulletList("one\n\n  two")).toBe("- one\n\n  - two");
  });

  it("leaves a code fence and a table untouched", () => {
    expect(toggleBulletList("before\n```\ncode\nmore code\n```\nafter"))
      .toBe("- before\n```\ncode\nmore code\n```\n- after");
    expect(toggleBulletList("| a | b |\n| --- | --- |\n| 1 | 2 |"))
      .toBe("| a | b |\n| --- | --- |\n| 1 | 2 |");
    expect(hasBulletList("```\na\nb\n```")).toBe(false);
  });

  it("does not count an all-fenced or all-blank card as already bulleted", () => {
    expect(hasBulletList("```\na\n```")).toBe(false);
    expect(hasBulletList("\n\n")).toBe(false);
  });
});
