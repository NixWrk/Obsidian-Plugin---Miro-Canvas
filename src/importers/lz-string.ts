/**
 * The one piece of LZ-string an Excalidraw drawing needs: reading the
 * `compressed-json` block the Obsidian Excalidraw plugin writes into its
 * Markdown files with `LZString.compressToBase64`.
 *
 * A local port of `decompressFromBase64` from LZ-string 1.4.4
 * (Copyright (c) 2013 pieroxy, MIT licence - see THIRD_PARTY_NOTICES.md),
 * rewritten to fail closed: anything that is not a well-formed stream gives
 * `undefined`, never a partial drawing, and the output is bounded so a
 * hostile file cannot make the board allocate without limit.
 */

/** The largest drawing text we unpack: 64 MB of UTF-16 code units. */
export const LZ_MAX_OUTPUT_LENGTH = 64 * 1024 * 1024;

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Each Base64 character carries six bits, read from the highest down. */
const BITS_PER_CHARACTER = 6;

/** The codes below the first dictionary entry: an 8-bit character, a 16-bit character, the end. */
const CODE_CHAR_8 = 0;
const CODE_CHAR_16 = 1;
const CODE_END = 2;
const FIRST_DICTIONARY_CODE = 3;

/** Past this many bits per code a stream is not one LZ-string wrote. */
const MAX_CODE_BITS = 30;

const BASE64_VALUES: ReadonlyMap<string, number> = buildBase64Values();

function buildBase64Values(): Map<string, number> {
  const values = new Map<string, number>();
  for (let index = 0; index < BASE64_ALPHABET.length; index += 1) {
    values.set(BASE64_ALPHABET.charAt(index), index);
  }
  return values;
}

/**
 * The six-bit values of a Base64 string, or `undefined` when a character is
 * outside the alphabet or `=` padding appears anywhere but at the end.
 */
function base64Values(input: string): number[] | undefined {
  let end = input.length;
  let padding = 0;
  while (end > 0 && input.charAt(end - 1) === "=") {
    end -= 1;
    padding += 1;
  }
  // LZ-string pads to a multiple of four, so one character may carry three `=`.
  if (padding > 3) return undefined;
  const values: number[] = [];
  for (let index = 0; index < end; index += 1) {
    const value = BASE64_VALUES.get(input.charAt(index));
    if (value === undefined) return undefined;
    values.push(value);
  }
  // Padding reads as zero bits, as it does in LZ-string itself.
  for (let index = 0; index < padding; index += 1) {
    values.push(0);
  }
  return values;
}

/** Reads the stream bit by bit, lowest bit of each code first. */
class BitReader {
  private index = 0;
  private mask = 1 << (BITS_PER_CHARACTER - 1);

  constructor(private readonly values: readonly number[]) {}

  /** A `count`-bit number, or `undefined` when the stream runs out first. */
  read(count: number): number | undefined {
    let result = 0;
    let power = 1;
    for (let bit = 0; bit < count; bit += 1) {
      if (this.index >= this.values.length) return undefined;
      const value = this.values[this.index];
      if ((value & this.mask) !== 0) result += power;
      power *= 2;
      this.mask >>= 1;
      if (this.mask === 0) {
        this.mask = 1 << (BITS_PER_CHARACTER - 1);
        this.index += 1;
      }
    }
    return result;
  }
}

/** A character code read as a literal: 8 or 16 bits. */
function readLiteral(reader: BitReader, code: number): string | undefined {
  const width = code === CODE_CHAR_8 ? 8 : 16;
  const charCode = reader.read(width);
  if (charCode === undefined) return undefined;
  return String.fromCharCode(charCode);
}

/**
 * The text LZ-string's `compressToBase64` packed into `input`, or `undefined`
 * when the input is empty, malformed, truncated, or would unpack to more than
 * `maxOutputLength` characters.  Whitespace is not skipped: the caller strips
 * the line breaks a file puts into a long block.
 */
export function decompressFromBase64(input: string, maxOutputLength = LZ_MAX_OUTPUT_LENGTH): string | undefined {
  if (input.length === 0) return undefined;
  const values = base64Values(input);
  if (values === undefined) return undefined;
  const reader = new BitReader(values);

  // Slots 0-2 stand for the three control codes; phrases start at 3.
  const dictionary: string[] = ["", "", ""];
  let enlargeIn = 4;
  let codeBits = 3;

  const firstCode = reader.read(2);
  if (firstCode === undefined) return undefined;
  if (firstCode === CODE_END) return "";
  if (firstCode !== CODE_CHAR_8 && firstCode !== CODE_CHAR_16) return undefined;
  const firstCharacter = readLiteral(reader, firstCode);
  if (firstCharacter === undefined) return undefined;
  dictionary.push(firstCharacter);

  const output: string[] = [firstCharacter];
  let outputLength = firstCharacter.length;
  let previous = firstCharacter;

  while (true) {
    let code = reader.read(codeBits);
    if (code === undefined) return undefined;
    if (code === CODE_END) return output.join("");

    if (code === CODE_CHAR_8 || code === CODE_CHAR_16) {
      const character = readLiteral(reader, code);
      if (character === undefined) return undefined;
      dictionary.push(character);
      code = dictionary.length - 1;
      enlargeIn -= 1;
      if (enlargeIn === 0) {
        enlargeIn = 2 ** codeBits;
        codeBits += 1;
      }
    }

    let entry: string;
    if (code >= FIRST_DICTIONARY_CODE && code < dictionary.length) {
      entry = dictionary[code]!;
    } else if (code === dictionary.length) {
      // The one phrase a stream may use before it is stored: previous + its own first character.
      entry = previous + previous.charAt(0);
    } else {
      return undefined;
    }

    outputLength += entry.length;
    if (outputLength > maxOutputLength) return undefined;
    output.push(entry);

    dictionary.push(previous + entry.charAt(0));
    enlargeIn -= 1;
    previous = entry;

    if (enlargeIn === 0) {
      enlargeIn = 2 ** codeBits;
      codeBits += 1;
    }
    if (codeBits > MAX_CODE_BITS) return undefined;
  }
}
