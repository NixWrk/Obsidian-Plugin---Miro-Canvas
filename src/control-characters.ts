/** Exact character checks shared by board values and local filenames. */
export function hasAsciiControl(value: string, includeDelete = true): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || (includeDelete && code === 127)) {
      return true;
    }
  }
  return false;
}

/** The existing attachment-name profile, including its format characters. */
export function hasControlOrFormat(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || (code >= 127 && code <= 159)
      || code === 8232 || code === 8233
      || code === 8203 || code === 8204 || code === 8206 || code === 8207
      || (code >= 8234 && code <= 8238)
      || (code >= 8288 && code <= 8292)
      || (code >= 8294 && code <= 8297)
      || code === 65279) {
      return true;
    }
  }
  return false;
}

function invalidFilenameCode(code: number, includePathCharacters: boolean): boolean {
  return code <= 31 || code === 34 || code === 42 || code === 60
    || code === 62 || code === 63 || code === 124
    || (includePathCharacters && (code === 47 || code === 58 || code === 92));
}

/** Path separators and colons can be checked separately by a path parser. */
export function hasInvalidFilenameCharacter(value: string, includePathCharacters = true): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (invalidFilenameCode(value.charCodeAt(index), includePathCharacters)) {
      return true;
    }
  }
  return false;
}

/** Leave trimming, leading dots and fallback names to the caller. */
export function replaceInvalidFilenameCharacters(value: string, replacement = "_"): string {
  let result = "";
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (invalidFilenameCode(value.charCodeAt(index), true)) {
      result += value.slice(start, index) + replacement;
      start = index + 1;
    }
  }
  return start === 0 ? value : result + value.slice(start);
}

/** Count supplementary characters once, matching the filename's /u limit. */
export function hasValidFilenameCharacters(value: string, maxCodePoints = 180): boolean {
  let count = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (invalidFilenameCode(code, true)) {
      return false;
    }
    count += 1;
    if (count > maxCodePoints) {
      return false;
    }
    if (code >= 55296 && code <= 56319) {
      const next = value.charCodeAt(index + 1);
      if (next >= 56320 && next <= 57343) {
        index += 1;
      }
    }
  }
  return count > 0;
}
