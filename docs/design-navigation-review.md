# First design navigation pass — 2026-10-05

This is an unreleased refinement on `codex/design-navigation`, based on 0.2.7.
It preserves native Obsidian controls, all settings and twelve welcome sections.
`DESIGN.md` records the existing visual foundation; it is not a new theme.

## Real Obsidian checks

| Device | Obsidian | Viewport in CSS pixels | Input |
| --- | --- | --- | --- |
| Windows | 1.14.4 | 900 × 700 settings; 1280 × 800 board | Mouse and keyboard |
| Samsung SM-X736B tablet | 1.13.8 | 753 × 1204 | ADB touch, native picker keys and Tab |
| Samsung SM-A336E phone | 1.12.7 | 384 × 853 | ADB touch, native picker keys and Tab |

`tools/obsidian_cdp/check-settings-navigation.mjs` passed on each device in
dark and light themes. Desktop used an isolated profile/vault; Android used
only MiroCanvasTest. Each run restored the previous theme and active file.

The runner verifies twelve settings sections; a real selection of Drawing;
focus on its heading above the native header; Tab continuing to the first
parameter; creation of a fresh welcome board with twelve numbered sections;
the unchanged prior active board; the short introduction route; and visible
export help without horizontal panel overflow. Screenshots are saved under
`tools/obsidian_cdp/.out/design-*` for local review.

Visual review caught two issues and the final checks confirmed their fixes:
tablet action buttons squeezed descriptions into a narrow column, and mobile
section navigation placed a heading behind Obsidian's header. Controls now
sit below the tablet descriptions; scrolling respects native content padding.
Both locales were inspected: Russian on Windows/tablet and English on phone.

This is a targeted implementation check, not a usability study. iOS and
landscape layouts were not tested in this pass.

## Automated checks

TypeScript, build, schema pin, MCP build and submission packaging passed.
Vitest passed 1713 tests with one skipped; oracle pytest passed 25 tests.
All three synthetic browser smoke suites passed, including tablet padding.
ESLint reported zero errors and 761 existing warnings. CSS budgets remained
at 90 `!important` declarations and 10 `:has` selectors.

Impeccable's manual detector reported existing CSS findings: two semantic
coloured side borders, one layout transition and 46 palette/fallback-colour
advisories. None points to the newly added rules. Content palettes and author
colours retain their meaning; this pass does not claim to resolve all CSS
advisories or the community review warnings.
