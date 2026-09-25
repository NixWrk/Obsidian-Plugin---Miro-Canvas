import { describe, expect, it } from "vitest";

import {
  WELCOME_SAMPLE_DOCX_BASE64,
  WELCOME_SAMPLE_PDF_BASE64,
  WELCOME_SAMPLE_PNG_BASE64,
  decodeWelcomeSample,
} from "../src/welcome-samples";

/** The bytes of a decoded ASCII prefix, for a signature check that reads like the spec. */
function prefix(bytes: Uint8Array, length: number): string {
  return Array.from(bytes.slice(0, length), (byte) => String.fromCharCode(byte)).join("");
}

describe("the welcome board's sample attachments", () => {
  it("decodes to a PNG with the right signature", () => {
    const bytes = decodeWelcomeSample(WELCOME_SAMPLE_PNG_BASE64);
    expect(bytes[0]).toBe(0x89);
    expect(prefix(bytes, 4).slice(1)).toBe("PNG");
  });

  it("decodes to a PDF with the right signature and a proper trailer", () => {
    const bytes = decodeWelcomeSample(WELCOME_SAMPLE_PDF_BASE64);
    expect(prefix(bytes, 5)).toBe("%PDF-");
    const tail = prefix(bytes.slice(-6), 6);
    expect(tail).toBe("%%EOF\n");
  });

  it("decodes to a DOCX, a zip archive by its own signature", () => {
    const bytes = decodeWelcomeSample(WELCOME_SAMPLE_DOCX_BASE64);
    expect(prefix(bytes, 2)).toBe("PK");
  });

  it("decodes each constant to more than a trivial number of bytes", () => {
    expect(decodeWelcomeSample(WELCOME_SAMPLE_PNG_BASE64).length).toBeGreaterThan(200);
    expect(decodeWelcomeSample(WELCOME_SAMPLE_PDF_BASE64).length).toBeGreaterThan(200);
    expect(decodeWelcomeSample(WELCOME_SAMPLE_DOCX_BASE64).length).toBeGreaterThan(200);
  });
});
