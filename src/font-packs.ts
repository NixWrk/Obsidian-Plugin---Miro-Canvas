/**
 * Downloadable font packs: reading the ZIP a release publishes, validating
 * its manifest, turning it into `@font-face` rules, and orchestrating the
 * download/verify/unpack steps a press on "Download" runs.
 *
 * Framework-free where the design asks for it: `readStoredZip` and
 * `readPackManifest` take plain bytes/JSON and can be tested without
 * Obsidian or a network.  Everything that touches the vault or the network
 * is passed in as a small dependency object, so the download flow itself is
 * testable too.
 */

import { isSafeFontFamily } from "./appearance";
import type { FontPackCatalogueEntry } from "./font-pack-catalogue";

// --- Reading a stored (uncompressed) ZIP archive --------------------------

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIR_SIGNATURE = 0x02014b50;
const LOCAL_HEADER_SIGNATURE = 0x04034b50;
/** A font pack never has anywhere near this many parts; more means the archive is not one of ours. */
const MAX_ZIP_ENTRIES = 4096;
/** The largest end-of-central-directory record: 22 fixed bytes plus the longest comment a ZIP allows. */
const MAX_EOCD_SEARCH = 22 + 65535;

export class FontPackArchiveError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "FontPackArchiveError";
  }
}

function findEndOfCentralDirectory(view: DataView): number {
  const start = Math.max(0, view.byteLength - MAX_EOCD_SEARCH);
  for (let offset = view.byteLength - 22; offset >= start; offset -= 1) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) {
      return offset;
    }
  }
  throw new FontPackArchiveError("not a ZIP archive: no end-of-central-directory record");
}

/** Refuse a name that could climb out of the folder the plugin unpacks the pack into. */
function safeEntryName(name: string): string {
  if (name.length === 0 || name.length > 512 || name.includes("\u0000") || name.includes("\\") || name.startsWith("/")) {
    throw new FontPackArchiveError(`unsafe entry name: ${JSON.stringify(name)}`);
  }
  if (name.split("/").some((segment) => segment === "." || segment === "..")) {
    throw new FontPackArchiveError(`unsafe entry name: ${JSON.stringify(name)}`);
  }
  return name;
}

/**
 * Read a ZIP built the way `tools/build_font_packs.py` writes one: every
 * entry stored, not deflated, because WOFF2 is compressed already and this
 * reads the archive without pulling in a general-purpose ZIP library.  A
 * deflated entry, a path escaping the archive, more entries than a font pack
 * ever needs, or a size that runs past the buffer is refused outright.
 */
export function readStoredZip(bytes: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEndOfCentralDirectory(view);
  const totalEntries = view.getUint16(eocd + 10, true);
  const centralDirSize = view.getUint32(eocd + 12, true);
  const centralDirOffset = view.getUint32(eocd + 16, true);
  if (totalEntries > MAX_ZIP_ENTRIES) {
    throw new FontPackArchiveError(`too many entries for a font pack: ${totalEntries}`);
  }
  if (centralDirOffset + centralDirSize > eocd) {
    throw new FontPackArchiveError("the central directory runs past the archive");
  }

  const entries = new Map<string, Uint8Array>();
  let offset = centralDirOffset;
  for (let index = 0; index < totalEntries; index += 1) {
    if (offset + 46 > view.byteLength || view.getUint32(offset, true) !== CENTRAL_DIR_SIGNATURE) {
      throw new FontPackArchiveError("the central directory is corrupt");
    }
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const nameStart = offset + 46;
    if (nameStart + nameLength > view.byteLength) {
      throw new FontPackArchiveError("a central directory record is truncated");
    }
    const name = safeEntryName(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(nameStart, nameStart + nameLength)));
    if (method !== 0) {
      throw new FontPackArchiveError(`${name}: only stored (uncompressed) entries are accepted`);
    }
    if (compressedSize !== uncompressedSize) {
      throw new FontPackArchiveError(`${name}: a stored entry's sizes disagree`);
    }
    if (localHeaderOffset + 30 > view.byteLength || view.getUint32(localHeaderOffset, true) !== LOCAL_HEADER_SIGNATURE) {
      throw new FontPackArchiveError(`${name}: its local header is missing or corrupt`);
    }
    const localNameLength = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    if (dataStart + compressedSize > view.byteLength) {
      throw new FontPackArchiveError(`${name}: its data runs past the archive`);
    }
    entries.set(name, bytes.subarray(dataStart, dataStart + compressedSize));
    offset = nameStart + nameLength + extraLength + commentLength;
  }
  return entries;
}

// --- Validating a pack's manifest ------------------------------------------

export interface FontFaceManifest {
  readonly style: "normal" | "italic";
  readonly weight: string;
  readonly file: string;
  readonly unicodeRange?: string;
}
export interface FontFamilyManifest {
  readonly family: string;
  readonly faces: readonly FontFaceManifest[];
}
export interface FontAliasManifest {
  readonly family: string;
  readonly target: string;
}
export interface FontLicenseManifest {
  readonly family: string;
  readonly file: string;
}
export interface FontPackManifest {
  readonly schema: 1;
  readonly id: string;
  readonly title: Readonly<Record<string, string>>;
  readonly description: Readonly<Record<string, string>>;
  readonly size: number;
  readonly families: readonly FontFamilyManifest[];
  readonly aliases: readonly FontAliasManifest[];
  readonly licenses: readonly FontLicenseManifest[];
}

export class FontPackManifestError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "FontPackManifestError";
  }
}

/** The pack ids `tools/build_font_packs.py` mints: lower-case words joined by hyphens. */
const SAFE_PACK_ID = /^[a-z][a-z0-9-]{0,63}$/u;
const SAFE_WEIGHT = /^[1-9]00$/u;
/**
 * A CSS `unicode-range` value: one or more `U+hex` or `U+hex-hex` ranges,
 * comma-separated - Google Fonts' own CSS puts a space after the comma,
 * so that space is allowed but never required.
 */
const SAFE_UNICODE_RANGE = /^U\+[0-9a-f]{1,6}(-[0-9a-f]{1,6})?(,\s?U\+[0-9a-f]{1,6}(-[0-9a-f]{1,6})?)*$/iu;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readLocalizedText(value: unknown, path: string): Readonly<Record<string, string>> {
  if (!isPlainRecord(value)) {
    throw new FontPackManifestError(`${path} must be an object`);
  }
  const en = value.en;
  const ru = value.ru;
  if (typeof en !== "string" || en.trim() === "" || en.length > 4000) {
    throw new FontPackManifestError(`${path}.en must be a short piece of text`);
  }
  if (typeof ru !== "string" || ru.trim() === "" || ru.length > 4000) {
    throw new FontPackManifestError(`${path}.ru must be a short piece of text`);
  }
  return Object.freeze({ en, ru });
}

function safePackPath(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 512 || value.includes("..") || value.startsWith("/")) {
    throw new FontPackManifestError(`${path} is not a safe path`);
  }
  return value;
}

function readFace(value: unknown, path: string): FontFaceManifest {
  if (!isPlainRecord(value)) {
    throw new FontPackManifestError(`${path} must be an object`);
  }
  const style = value.style;
  if (style !== "normal" && style !== "italic") {
    throw new FontPackManifestError(`${path}.style must be "normal" or "italic"`);
  }
  const weight = value.weight;
  if (typeof weight !== "string" || !SAFE_WEIGHT.test(weight)) {
    throw new FontPackManifestError(`${path}.weight must be "100" through "900"`);
  }
  const file = safePackPath(value.file, `${path}.file`);
  const unicodeRange = value.unicodeRange;
  if (unicodeRange !== undefined && (typeof unicodeRange !== "string" || !SAFE_UNICODE_RANGE.test(unicodeRange))) {
    throw new FontPackManifestError(`${path}.unicodeRange is not a valid unicode-range list`);
  }
  return Object.freeze({
    style, weight, file,
    ...(typeof unicodeRange === "string" ? { unicodeRange } : {}),
  });
}

function readFamily(value: unknown, path: string): FontFamilyManifest {
  if (!isPlainRecord(value)) {
    throw new FontPackManifestError(`${path} must be an object`);
  }
  const family = value.family;
  if (!isSafeFontFamily(family)) {
    throw new FontPackManifestError(`${path}.family is not a safe font name`);
  }
  if (!Array.isArray(value.faces) || value.faces.length === 0) {
    throw new FontPackManifestError(`${path}.faces must be a non-empty array`);
  }
  const faces = value.faces.map((face, index) => readFace(face, `${path}.faces[${index}]`));
  return Object.freeze({ family, faces: Object.freeze(faces) });
}

function readAlias(value: unknown, path: string, familyNames: ReadonlySet<string>): FontAliasManifest {
  if (!isPlainRecord(value)) {
    throw new FontPackManifestError(`${path} must be an object`);
  }
  const family = value.family;
  const target = value.target;
  if (!isSafeFontFamily(family)) {
    throw new FontPackManifestError(`${path}.family is not a safe font name`);
  }
  if (typeof target !== "string" || !familyNames.has(target)) {
    throw new FontPackManifestError(`${path}.target does not name a family the pack carries`);
  }
  return Object.freeze({ family, target });
}

function readLicense(value: unknown, path: string): FontLicenseManifest {
  if (!isPlainRecord(value)) {
    throw new FontPackManifestError(`${path} must be an object`);
  }
  const family = value.family;
  if (!isSafeFontFamily(family)) {
    throw new FontPackManifestError(`${path}.family is not a safe font name`);
  }
  const file = safePackPath(value.file, `${path}.file`);
  return Object.freeze({ family, file });
}

/** Schema, ids, names, faces and aliases - everything but whether the referenced files exist. */
function validateManifestCore(json: unknown): FontPackManifest {
  if (!isPlainRecord(json)) {
    throw new FontPackManifestError("a font pack manifest must be an object");
  }
  if (json.schema !== 1) {
    throw new FontPackManifestError("only schema 1 is understood");
  }
  const id = json.id;
  if (typeof id !== "string" || !SAFE_PACK_ID.test(id)) {
    throw new FontPackManifestError("id is not a safe pack identifier");
  }
  const title = readLocalizedText(json.title, "title");
  const description = readLocalizedText(json.description, "description");
  const size = json.size;
  if (typeof size !== "number" || !Number.isFinite(size) || size < 0) {
    throw new FontPackManifestError("size must be a non-negative number");
  }
  if (!Array.isArray(json.families) || json.families.length === 0) {
    throw new FontPackManifestError("families must be a non-empty array");
  }
  const families = json.families.map((family, index) => readFamily(family, `families[${index}]`));
  const familyNames = new Set(families.map((family) => family.family));
  const aliasesInput = json.aliases;
  const aliases = Array.isArray(aliasesInput)
    ? aliasesInput.map((alias, index) => readAlias(alias, `aliases[${index}]`, familyNames))
    : [];
  const licensesInput = json.licenses;
  const licenses = Array.isArray(licensesInput)
    ? licensesInput.map((license, index) => readLicense(license, `licenses[${index}]`))
    : [];
  return Object.freeze({
    schema: 1, id, title, description, size,
    families: Object.freeze(families), aliases: Object.freeze(aliases), licenses: Object.freeze(licenses),
  });
}

/** Validate a downloaded pack's manifest against the archive it came in: every named file must exist there. */
export function readPackManifest(json: unknown, entryNames: ReadonlySet<string>): FontPackManifest {
  const manifest = validateManifestCore(json);
  for (const family of manifest.families) {
    for (const face of family.faces) {
      if (!entryNames.has(face.file)) {
        throw new FontPackManifestError(`${family.family}: ${face.file} is not in the archive`);
      }
    }
  }
  for (const license of manifest.licenses) {
    if (!entryNames.has(license.file)) {
      throw new FontPackManifestError(`${license.family}: ${license.file} is not in the archive`);
    }
  }
  return manifest;
}

/** The same validation for a pack already unpacked on disk, where there is no archive to check files against. */
export function readInstalledPackManifest(json: unknown): FontPackManifest | undefined {
  try {
    return validateManifestCore(json);
  } catch {
    return undefined;
  }
}

// --- `@font-face` rules -----------------------------------------------------

/** A CSS string literal, escaped defensively even though every value placed here is already validated. */
function cssString(value: string): string {
  return `"${value.replace(/\\/gu, "\\\\").replace(/"/gu, "\\\"")}"`;
}

function faceRuleText(family: string, face: FontFaceManifest, sources: readonly string[]): string {
  const declarations = [
    `font-family: ${cssString(family)}`,
    `src: ${sources.join(", ")}`,
    `font-style: ${face.style}`,
    `font-weight: ${face.weight}`,
    ...(face.unicodeRange === undefined ? [] : [`unicode-range: ${face.unicodeRange}`]),
    "font-display: swap",
  ];
  return `@font-face { ${declarations.join("; ")}; }`;
}

/**
 * The `@font-face` rules a pack contributes: one per face of every family it
 * carries, and one per face of an alias's target - named after the alias, so
 * a board naming Miro's `open_sans` or Word's `Calibri` renders in it.  An
 * alias's rule tries the system's own font of that name first (`local()`):
 * a real installed Calibri or Arial wins over the pack's stand-in.
 */
export function packFontFaceRules(manifest: FontPackManifest, resolveUrl: (file: string) => string): readonly string[] {
  const rules: string[] = [];
  const byFamily = new Map(manifest.families.map((family) => [family.family, family] as const));
  for (const family of manifest.families) {
    for (const face of family.faces) {
      rules.push(faceRuleText(family.family, face, [`url(${cssString(resolveUrl(face.file))}) format("woff2")`]));
    }
  }
  for (const alias of manifest.aliases) {
    const target = byFamily.get(alias.target);
    if (target === undefined) {
      continue;
    }
    for (const face of target.faces) {
      rules.push(faceRuleText(alias.family, face, [
        `local(${cssString(alias.family)})`,
        `url(${cssString(resolveUrl(face.file))}) format("woff2")`,
      ]));
    }
  }
  return rules;
}

const CUSTOM_FONT_FORMATS: Readonly<Record<string, string>> = {
  ttf: "truetype", otf: "opentype", woff: "woff", woff2: "woff2",
};

/** The `format()` a custom font file's extension maps to, or undefined for one the browser cannot load this way. */
export function customFontFormat(file: string): string | undefined {
  const extension = file.slice(file.lastIndexOf(".") + 1).toLowerCase();
  return CUSTOM_FONT_FORMATS[extension];
}

/** A custom font's own `@font-face` rule, or undefined where its file's format is not one of the four supported. */
export function customFontFaceRule(family: string, url: string, file: string): string | undefined {
  const format = customFontFormat(file);
  if (format === undefined) {
    return undefined;
  }
  return `@font-face { font-family: ${cssString(family)}; src: url(${cssString(url)}) format(${cssString(format)}); font-display: swap; }`;
}

/**
 * The `<style>` element the plugin owns, kept in the head of every window
 * that shows a Canvas - the main one and any popout.  Rules are rebuilt
 * through the CSSOM's own `insertRule`, so a malformed rule is rejected by
 * the browser's own CSS parser rather than ever reaching the DOM as raw text.
 */
/** One installed pack's families and aliases, and where its face files live. */
export interface FontFacePackDefinition {
  /** The pack's own id. */
  readonly id: string;
  /** Every face's `file` is read from `${dir}/${file}`. */
  readonly dir: string;
  readonly families: readonly FontFamilyManifest[];
  readonly aliases: readonly FontAliasManifest[];
}

/** One font file added by hand. */
export interface CustomFontDefinition {
  readonly family: string;
  readonly file: string;
}

interface PackFamilyEntry {
  readonly packId: string;
  readonly dir: string;
  readonly faces: readonly FontFaceManifest[];
}

interface CustomFamilyEntry {
  readonly packId: string;
  readonly dir: string;
  readonly file: string;
}

interface AliasEntry {
  readonly packId: string;
  readonly target: string;
}

/** A custom font's own synthetic id, so its rule and blob are bookkept and revoked the same way a pack's are. */
function customFontOwnerId(file: string): string {
  return `custom:${file}`;
}

/**
 * The `<style>` this plugin owns in every window's head, one `@font-face`
 * rule per face - loaded lazily, per family, so a person who never opens
 * the font list or a board using a pack's fonts never has that pack's bytes
 * read into memory.  `configure` only tells the registry what exists and
 * where; nothing is read and no rule exists until `want` asks for a family
 * by name.  Rules are rebuilt through the CSSOM's own `insertRule`, so a
 * malformed rule is rejected by the browser's own CSS parser rather than
 * ever reaching the DOM as raw text.
 */
export class FontFaceRegistry {
  private readonly styles = new Map<Document, HTMLStyleElement>();
  private readFile: ((path: string) => Promise<ArrayBuffer>) | undefined;

  private packFamilies = new Map<string, PackFamilyEntry>();
  private customFamilies = new Map<string, CustomFamilyEntry>();
  private aliases = new Map<string, AliasEntry>();

  /** Families/aliases whose rule is currently inserted, and which pack owns each one. */
  private readonly loadedOwnerPack = new Map<string, string>();
  private readonly rulesByOwner = new Map<string, readonly string[]>();
  /** Only the owner that actually read the bytes holds their blob URLs; an alias reuses its target's. */
  private readonly blobsByOwner = new Map<string, readonly string[]>();
  private readonly pending = new Set<string>();
  private flushScheduled = false;
  /** One promise per name currently being loaded, so two callers wanting the same family in-flight share the one read instead of each starting their own. */
  private readonly inFlight = new Map<string, Promise<void>>();

  /** How many individual face files have been read so far; for tests and measurement, never for behaviour. */
  public facesRead = 0;

  public attach(doc: Document | undefined | null): void {
    if (doc === undefined || doc === null || this.styles.has(doc) || doc.head === null) {
      return;
    }
    const style = doc.createElement("style");
    style.setAttribute("data-miro-canvas-fonts", "true");
    doc.head.appendChild(style);
    this.styles.set(doc, style);
    this.paint(style);
  }

  public detach(doc: Document | undefined | null): void {
    if (doc === undefined || doc === null) {
      return;
    }
    this.styles.get(doc)?.remove();
    this.styles.delete(doc);
  }

  /** How a face's bytes are read; set once, before the first `want`. */
  public setFileReader(readFile: (path: string) => Promise<ArrayBuffer>): void {
    this.readFile = readFile;
  }

  /**
   * Replace the whole catalog of installed packs and custom fonts: which
   * families and aliases exist, and where their files live.  Reads no
   * bytes and inserts no rule.  A family or alias that no longer resolves
   * to the same pack it did before - its pack was removed, or a custom
   * font was renamed - has its rule and blob revoked; anything else already
   * loaded keeps its place.
   */
  public configure(packs: readonly FontFacePackDefinition[], customFonts: readonly CustomFontDefinition[], customDir: string): void {
    const packFamilies = new Map<string, PackFamilyEntry>();
    const customFamilies = new Map<string, CustomFamilyEntry>();
    const aliases = new Map<string, AliasEntry>();
    for (const pack of packs) {
      for (const family of pack.families) {
        packFamilies.set(family.family, { packId: pack.id, dir: pack.dir, faces: family.faces });
      }
      for (const alias of pack.aliases) {
        aliases.set(alias.family, { packId: pack.id, target: alias.target });
      }
    }
    for (const font of customFonts) {
      customFamilies.set(font.family, { packId: customFontOwnerId(font.file), dir: customDir, file: font.file });
    }
    let changed = false;
    for (const owner of [...this.loadedOwnerPack.keys()]) {
      const packId = this.loadedOwnerPack.get(owner)!;
      const stillOwned = packFamilies.get(owner)?.packId === packId
        || customFamilies.get(owner)?.packId === packId
        || aliases.get(owner)?.packId === packId;
      if (!stillOwned) {
        this.dropOwner(owner);
        changed = true;
      }
    }
    this.packFamilies = packFamilies;
    this.customFamilies = customFamilies;
    this.aliases = aliases;
    if (changed) this.paintAll();
  }

  /**
   * Ask for one or more families to be ready to render.  A family already
   * loaded, or one this registry does not know, costs nothing.  Calls made
   * within the same microtask are coalesced into one pass, so a board with
   * many cards in the same family reads it once.
   */
  public want(families: Iterable<string>): void {
    for (const family of families) {
      if (this.loadedOwnerPack.has(family) || this.inFlight.has(family)) continue;
      if (!this.packFamilies.has(family) && !this.customFamilies.has(family) && !this.aliases.has(family)) continue;
      this.pending.add(family);
    }
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.flushScheduled || this.pending.size === 0) {
      return;
    }
    this.flushScheduled = true;
    void Promise.resolve().then(() => {
      this.flushScheduled = false;
      const batch = [...this.pending];
      this.pending.clear();
      for (const name of batch) this.startLoad(name);
    });
  }

  /**
   * Start reading one family, or return the promise already reading it.
   * Every path that wants a family's bytes - `want`'s own flush, and an
   * alias pulling in its target - goes through here, so two requests for
   * the same family in flight at once still read it exactly once.
   */
  private startLoad(name: string): Promise<void> {
    const existing = this.inFlight.get(name);
    if (existing !== undefined) return existing;
    if (this.loadedOwnerPack.has(name)) return Promise.resolve();
    const promise = this.loadFamily(name).finally(() => this.inFlight.delete(name));
    this.inFlight.set(name, promise);
    return promise;
  }

  private async loadFamily(name: string): Promise<void> {
    if (this.readFile === undefined) {
      return;
    }
    const alias = this.aliases.get(name);
    if (alias !== undefined) {
      await this.startLoad(alias.target);
      const target = this.packFamilies.get(alias.target);
      const targetBlobs = this.blobsByOwner.get(alias.target);
      if (target === undefined || targetBlobs === undefined || this.loadedOwnerPack.has(name)) {
        return;
      }
      const rules = target.faces.map((face, index) => faceRuleText(name, face, [
        `local(${cssString(name)})`,
        `url(${cssString(targetBlobs[index]!)}) format("woff2")`,
      ]));
      this.loadedOwnerPack.set(name, alias.packId);
      this.rulesByOwner.set(name, rules);
      this.blobsByOwner.set(name, []);
      this.paintAll();
      return;
    }
    const packFamily = this.packFamilies.get(name);
    if (packFamily !== undefined) {
      const blobs: string[] = [];
      const rules: string[] = [];
      for (const face of packFamily.faces) {
        const url = await this.readAsBlobUrl(`${packFamily.dir}/${face.file}`);
        blobs.push(url);
        rules.push(faceRuleText(name, face, [`url(${cssString(url)}) format("woff2")`]));
      }
      this.loadedOwnerPack.set(name, packFamily.packId);
      this.rulesByOwner.set(name, rules);
      this.blobsByOwner.set(name, blobs);
      this.paintAll();
      return;
    }
    const custom = this.customFamilies.get(name);
    if (custom !== undefined) {
      const url = await this.readAsBlobUrl(`${custom.dir}/${custom.file}`);
      const rule = customFontFaceRule(name, url, custom.file);
      this.loadedOwnerPack.set(name, custom.packId);
      this.rulesByOwner.set(name, rule === undefined ? [] : [rule]);
      this.blobsByOwner.set(name, [url]);
      this.paintAll();
    }
  }

  private async readAsBlobUrl(path: string): Promise<string> {
    const bytes = await this.readFile!(path);
    this.facesRead += 1;
    return URL.createObjectURL(new Blob([bytes]));
  }

  private dropOwner(owner: string): void {
    for (const url of this.blobsByOwner.get(owner) ?? []) {
      URL.revokeObjectURL(url);
    }
    this.blobsByOwner.delete(owner);
    this.rulesByOwner.delete(owner);
    this.loadedOwnerPack.delete(owner);
  }

  private paintAll(): void {
    const rules = [...this.rulesByOwner.values()].flat();
    for (const style of this.styles.values()) {
      this.paint(style, rules);
    }
  }

  private paint(style: HTMLStyleElement, rules: readonly string[] = [...this.rulesByOwner.values()].flat()): void {
    const sheet = style.sheet;
    if (sheet === null) {
      return;
    }
    while (sheet.cssRules.length > 0) {
      sheet.deleteRule(0);
    }
    for (const rule of rules) {
      try {
        sheet.insertRule(rule, sheet.cssRules.length);
      } catch {
        // A rule the browser's own parser refuses is skipped, never applied raw.
      }
    }
  }

  public dispose(): void {
    for (const style of this.styles.values()) {
      style.remove();
    }
    this.styles.clear();
    for (const owner of [...this.loadedOwnerPack.keys()]) {
      this.dropOwner(owner);
    }
    this.pending.clear();
    this.inFlight.clear();
  }
}

// --- Downloading a pack ------------------------------------------------------

/** A release of this repository's own tag, separate from plugin releases so packs are not re-uploaded each one. */
export const FONT_PACKS_RELEASE_BASE = "https://github.com/NixWrk/Obsidian-Plugin---Miro-Canvas/releases/download/fonts-1/";

/**
 * The address a download starts from: the real release, unless a harness's
 * own devtools console has set `globalThis.__miroCanvasFontPacksTestBaseUrl`
 * first.  That property is never a user setting and nothing in the plugin
 * ever sets it; it exists only so a verification run can point a download at
 * a local server instead of GitHub's real release, which does not carry the
 * packs yet.
 */
export function fontPackDownloadUrl(file: string): string {
  const testBase = (globalThis as { __miroCanvasFontPacksTestBaseUrl?: string }).__miroCanvasFontPacksTestBaseUrl;
  return `${testBase ?? FONT_PACKS_RELEASE_BASE}${file}`;
}

export type FontPackFailureReason = "not-published" | "network" | "integrity" | "invalid";

export class FontPackDownloadError extends Error {
  public readonly reason: FontPackFailureReason;
  public constructor(reason: FontPackFailureReason, message: string) {
    super(message);
    this.name = "FontPackDownloadError";
    this.reason = reason;
  }
}

/** A download's stages, as the settings tab shows them in its row for a pack. */
export type FontPackProgress = "downloading" | "installing" | "done" | "failed";

export type FetchFontPack = (url: string) => Promise<{ readonly status: number; readonly arrayBuffer: ArrayBuffer }>;
export type Sha256Digest = (data: ArrayBuffer) => Promise<ArrayBuffer>;

export interface FontPackFileWriter {
  readonly mkdir: (path: string) => Promise<void>;
  readonly writeBinary: (path: string, data: ArrayBuffer) => Promise<void>;
  readonly write: (path: string, data: string) => Promise<void>;
}

function bytesToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  // `.slice()` always allocates a fresh, plain ArrayBuffer, never the shared
  // kind a wider typed-array view could in principle be backed by.
  return bytes.slice().buffer as ArrayBuffer;
}

/**
 * Download a pack on a press, verify it byte for byte against the catalogue
 * the plugin ships, then unpack it into `packDir`.  Every side effect -
 * fetching, hashing, writing - comes through `deps`, so the flow itself is
 * testable without a network or a vault.  A 404 means the release the packs
 * live in has not been published yet; the caller shows that plainly instead
 * of a raw error.
 */
export async function downloadFontPack(
  entry: Pick<FontPackCatalogueEntry, "id" | "file" | "sha256">,
  deps: { readonly fetch: FetchFontPack; readonly digest: Sha256Digest; readonly writer: FontPackFileWriter },
  packDir: string,
  onProgress?: (stage: Extract<FontPackProgress, "downloading" | "installing">) => void,
): Promise<FontPackManifest> {
  onProgress?.("downloading");
  let response: { readonly status: number; readonly arrayBuffer: ArrayBuffer };
  try {
    response = await deps.fetch(fontPackDownloadUrl(entry.file));
  } catch {
    throw new FontPackDownloadError("network", "the request failed");
  }
  if (response.status === 404) {
    throw new FontPackDownloadError("not-published", "this pack is not published yet");
  }
  if (response.status !== 200) {
    throw new FontPackDownloadError("network", `unexpected response status ${response.status}`);
  }
  const digestBuffer = await deps.digest(response.arrayBuffer);
  if (bytesToHex(digestBuffer) !== entry.sha256.toLowerCase()) {
    throw new FontPackDownloadError("integrity", "the download does not match the published checksum");
  }

  onProgress?.("installing");
  let entries: Map<string, Uint8Array>;
  let manifest: FontPackManifest;
  try {
    entries = readStoredZip(new Uint8Array(response.arrayBuffer));
    const packJson = entries.get("pack.json");
    if (packJson === undefined) {
      throw new FontPackManifestError("the archive has no pack.json");
    }
    manifest = readPackManifest(JSON.parse(new TextDecoder().decode(packJson)) as unknown, new Set(entries.keys()));
  } catch (error) {
    const message = error instanceof Error ? error.message : "the archive is not a valid font pack";
    throw new FontPackDownloadError("invalid", message);
  }
  if (manifest.id !== entry.id) {
    throw new FontPackDownloadError("invalid", "the archive's id does not match the catalogue entry");
  }

  const madeDirs = new Set<string>([packDir]);
  await deps.writer.mkdir(packDir);
  for (const [name, data] of entries) {
    const slash = name.lastIndexOf("/");
    if (slash > 0) {
      const dir = `${packDir}/${name.slice(0, slash)}`;
      if (!madeDirs.has(dir)) {
        await deps.writer.mkdir(dir);
        madeDirs.add(dir);
      }
    }
    if (name === "pack.json") {
      await deps.writer.write(`${packDir}/${name}`, new TextDecoder().decode(data));
    } else {
      await deps.writer.writeBinary(`${packDir}/${name}`, toArrayBuffer(data));
    }
  }
  return manifest;
}
