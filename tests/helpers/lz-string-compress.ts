/**
 * Test-only port of LZ-string 1.4.4's `compressToBase64` (Copyright (c) 2013
 * pieroxy, MIT licence - see THIRD_PARTY_NOTICES.md).  The plugin itself only
 * ever reads compressed drawings; the tests use this to build the
 * `compressed-json` fixtures the Obsidian Excalidraw plugin would write.
 */

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const BITS_PER_CHARACTER = 6;

/** Packs bits into Base64 characters, highest bit of each character first. */
class BitWriter {
  private readonly characters: string[] = [];
  private value = 0;
  private position = 0;

  /** Writes `count` bits of `bits`, lowest first, as LZ-string does for codes. */
  writeLowFirst(bits: number, count: number): void {
    let remaining = bits;
    for (let index = 0; index < count; index += 1) {
      this.pushBit(remaining & 1);
      remaining >>= 1;
    }
  }

  /** Pads the last character with zero bits. */
  flush(): string {
    while (true) {
      this.value <<= 1;
      if (this.position === BITS_PER_CHARACTER - 1) {
        this.characters.push(BASE64_ALPHABET.charAt(this.value));
        break;
      }
      this.position += 1;
    }
    return this.characters.join("");
  }

  private pushBit(bit: number): void {
    this.value = (this.value << 1) | bit;
    if (this.position === BITS_PER_CHARACTER - 1) {
      this.position = 0;
      this.characters.push(BASE64_ALPHABET.charAt(this.value));
      this.value = 0;
    } else {
      this.position += 1;
    }
  }
}

export function compressToBase64(input: string): string {
  const packed = compress(input);
  const remainder = packed.length % 4;
  if (remainder === 0) return packed;
  return packed + "=".repeat(4 - remainder);
}

function compress(input: string): string {
  const writer = new BitWriter();
  const dictionary = new Map<string, number>();
  const notYetWritten = new Set<string>();
  let enlargeIn = 2;
  let dictionarySize = 3;
  let codeBits = 2;
  let phrase = "";

  const shrinkBudget = (): void => {
    enlargeIn -= 1;
    if (enlargeIn === 0) {
      enlargeIn = 2 ** codeBits;
      codeBits += 1;
    }
  };

  const writePhrase = (): void => {
    if (notYetWritten.has(phrase)) {
      const charCode = phrase.charCodeAt(0);
      if (charCode < 256) {
        writer.writeLowFirst(0, codeBits);
        writer.writeLowFirst(charCode, 8);
      } else {
        writer.writeLowFirst(1, codeBits);
        writer.writeLowFirst(charCode, 16);
      }
      shrinkBudget();
      notYetWritten.delete(phrase);
    } else {
      writer.writeLowFirst(dictionary.get(phrase)!, codeBits);
    }
    shrinkBudget();
  };

  for (let index = 0; index < input.length; index += 1) {
    const character = input.charAt(index);
    if (!dictionary.has(character)) {
      dictionary.set(character, dictionarySize);
      dictionarySize += 1;
      notYetWritten.add(character);
    }
    const extended = phrase + character;
    if (dictionary.has(extended)) {
      phrase = extended;
      continue;
    }
    writePhrase();
    dictionary.set(extended, dictionarySize);
    dictionarySize += 1;
    phrase = character;
  }

  if (phrase !== "") writePhrase();

  // The end of the stream.
  writer.writeLowFirst(2, codeBits);
  return writer.flush();
}
