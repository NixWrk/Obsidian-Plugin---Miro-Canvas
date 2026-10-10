import { describe, expect, it } from "vitest";

import { decompressFromBase64, LZ_MAX_INPUT_LENGTH } from "../src/importers/lz-string";
import { compressToBase64 } from "./helpers/lz-string-compress";

/** A repeatable stream of pseudo-random numbers, so a failing case can be replayed. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function randomText(length: number, alphabet: string, seed: number): string {
  const next = seededRandom(seed);
  const characters: string[] = [];
  for (let index = 0; index < length; index += 1) {
    characters.push(alphabet.charAt(Math.floor(next() * alphabet.length)));
  }
  return characters.join("");
}

describe("decompressFromBase64", () => {
  it("refuses oversized encoded input before allocating values", () => {
    expect(decompressFromBase64("A".repeat(LZ_MAX_INPUT_LENGTH + 1))).toBeUndefined();
  });
  // Worked out by hand from the algorithm: a 2-bit code, then an 8-bit
  // literal written lowest bit first, then the 3-bit end code, six bits to a
  // Base64 character.
  it("reads streams whose bits were worked out by hand", () => {
    expect(decompressFromBase64("Q===")).toBe("");
    expect(decompressFromBase64("IZA=")).toBe("a");
    expect(decompressFromBase64("IbI=")).toBe("aa");
  });

  it("agrees with the test compressor on the hand-worked streams", () => {
    expect(compressToBase64("")).toBe("Q===");
    expect(compressToBase64("a")).toBe("IZA=");
    expect(compressToBase64("aa")).toBe("IbI=");
  });

  it("gives back what the compressor packed, for every kind of text a drawing holds", () => {
    const samples = [
      "Hello, world",
      "ab".repeat(500),
      "a".repeat(20000),
      "Доска: карточки и линии",
      "emoji 🎨🧭 and a lone high byte ÿ and CJK 漢字",
      JSON.stringify({ type: "excalidraw", elements: [{ id: "x", text: "[[Note]]" }] }, null, "\t"),
      randomText(5000, "abcdefghijklmnopqrstuvwxyz {}[]\":,0123456789", 7),
      randomText(3000, "αβγδεζηθ日本語テキスト한국어😀", 11),
    ];
    for (const sample of samples) {
      expect(decompressFromBase64(compressToBase64(sample))).toBe(sample);
    }
  });

  it("reads a stream whose padding was left off", () => {
    expect(decompressFromBase64("IZA")).toBe("a");
  });

  it("gives undefined for empty or malformed input, never a partial text", () => {
    expect(decompressFromBase64("")).toBeUndefined();
    expect(decompressFromBase64("!!!!")).toBeUndefined();
    expect(decompressFromBase64("IZ A=")).toBeUndefined();
    expect(decompressFromBase64("=IZA")).toBeUndefined();
    expect(decompressFromBase64("IZA====")).toBeUndefined();
    // Every bit set: the first code is 3, which no stream starts with.
    expect(decompressFromBase64("////")).toBeUndefined();
    // Zero bits only: literals forever and no end code.
    expect(decompressFromBase64("AAAA")).toBeUndefined();
    // "a", then code 7 while the dictionary holds only 4 entries.
    expect(decompressFromBase64("IZ4=")).toBeUndefined();
  });

  it("gives undefined for a stream cut short", () => {
    const packed = compressToBase64(randomText(4000, "abcdef", 3));
    expect(decompressFromBase64(packed.slice(0, Math.floor(packed.length / 2)))).toBeUndefined();
    expect(decompressFromBase64(packed.slice(0, -4))).toBeUndefined();
  });

  it("stops at the output bound instead of unpacking without limit", () => {
    const text = "abcdef".repeat(100);
    const packed = compressToBase64(text);
    expect(decompressFromBase64(packed, 599)).toBeUndefined();
    expect(decompressFromBase64(packed, 600)).toBe(text);
    // A small stream that unpacks far larger than itself is caught all the same.
    const flood = compressToBase64("x".repeat(200000));
    expect(flood.length).toBeLessThan(2000);
    expect(decompressFromBase64(flood, 1000)).toBeUndefined();
  });
});
