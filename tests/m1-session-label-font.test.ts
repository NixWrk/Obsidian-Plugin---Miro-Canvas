import { describe, expect, it } from "vitest";

import { DEFAULT_TYPOGRAPHY } from "../src/appearance";
import { labelFont } from "../src/m1-session";

describe("a connector label's font", () => {
  it("keeps native Canvas's own rule when neither an override nor an import set anything", () => {
    expect(labelFont(undefined, undefined)).toBeUndefined();
    expect(labelFont(undefined, {})).toBeUndefined();
    // A colour or a route on the descriptor's css is not a font property.
    expect(labelFont(undefined, { stroke: "#123456" })).toBeUndefined();
  });

  it("takes only the properties the Miro source's own label style set", () => {
    expect(labelFont(undefined, { "font-family": "Merriweather", "font-size": "22px" })).toEqual({
      "font-family": "\"Merriweather\", serif",
      "font-size": "22px",
    });
    // A weight or style the import never named stays clear, so Canvas's own default keeps painting it.
    expect(labelFont(undefined, { "font-weight": "bold", "text-decoration": "underline" })).toEqual({
      "font-weight": "bold",
      "text-decoration": "underline",
    });
  });

  it("writes an edited override in full, the way a card's own typography is, and it wins over an import", () => {
    const override = { ...DEFAULT_TYPOGRAPHY, fontFamily: "serif", fontSize: 24, format: { ...DEFAULT_TYPOGRAPHY.format, bold: true } };
    expect(labelFont(override, { "font-family": "Georgia", "font-weight": "300" })).toEqual({
      "font-family": "serif",
      "font-size": "24px",
      "font-weight": "700",
      "font-style": "normal",
      "text-decoration": "none",
    });
  });
});
