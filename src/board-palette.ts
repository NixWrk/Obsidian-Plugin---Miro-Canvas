import { defaultPalette, isBuiltinPaletteLabel, mergeAppearanceMetadata, normalizePalette, type PaletteColor } from "./appearance";

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

/** Old untouched built-in snapshots inherit; individual colors/order remain local. */
export function displayedBoardPalette(metadata: unknown, permanent: readonly PaletteColor[] | undefined): readonly PaletteColor[] | undefined {
  if (permanent === undefined || permanent.length === 0) return undefined;
  const settings = record(metadata) && record(metadata.settings) ? metadata.settings : {};
  if (settings.palette === undefined) return permanent;
  const local = normalizePalette(settings.palette);
  const defaults = defaultPalette();
  const unchanged = local.length === defaults.length && local.every((entry, index) => {
    const base = defaults[index];
    return entry.id === base.id && entry.color.toLowerCase() === base.color.toLowerCase() && entry.source === base.source && isBuiltinPaletteLabel(entry.id, entry.label);
  });
  return unchanged ? permanent : undefined;
}

/** A card restyle must not persist the displayed global palette as a local one. */
export function mergeDisplayedAppearance(metadata: unknown, state: unknown, permanent: readonly PaletteColor[] | undefined, changesPalette: boolean): Record<string, unknown> {
  const merged = mergeAppearanceMetadata(metadata, state);
  if (changesPalette || displayedBoardPalette(metadata, permanent) === undefined || !record(merged.settings)) return merged;
  const original = record(metadata) && record(metadata.settings) ? metadata.settings : {};
  if (Object.prototype.hasOwnProperty.call(original, "palette")) merged.settings.palette = original.palette;
  else delete merged.settings.palette;
  return merged;
}
