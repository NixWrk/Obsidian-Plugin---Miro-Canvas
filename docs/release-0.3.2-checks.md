# Release 0.3.2 — deprecated Range cleanup

The vector serializer used Range.detach after measuring glyphs. The DOM Standard
makes this legacy method a no-op, so the call and its redundant finally block
were removed. Glyph bounds, escaping, typography and cancellation are unchanged.
The usage trace and mandatory checks were recorded in
[the remediation register](lint-remediation-checks.md) before implementation.

## Verification

Local verification passes 3520 Vitest tests across 168 files, with one existing
skip; 22 Node packaging/CSS/offline-PDF tests; 33 Python oracle cases; and all
three synthetic UI smokes. TypeScript, source/MCP/CSS lint, production/MCP/CLI
builds, schema/submission gates, font reproducibility and the production audit
pass. Source lint retains one compatibility command-ID advisory. The production
bundle is 4,628,598 bytes, below the 5,000,000-byte Sync limit; the parsed runtime
script-creation gate still passes.

Real hidden Windows Obsidian 1.14.4 passes standalone SVG, vector PDF/PowerPoint,
raster PDF and Stop. Trusted renderer input was used; no export screenshots or
OS foreground changes were made. The original board and camera are restored,
and no export jobs or independent surfaces remain. Independent parsing confirms
two vector PDF pages with 13/8 drawing paths, no whole-page images, all four
Cyrillic typography fixture words, and four distinct embedded font programs.
SVG retains normal/bold/italic/bold-italic text; PowerPoint retains two genuine
SVG slide parts. Receipts are ignored under .out/vector-viewing.

Android acceptance is pending: neither the tablet nor phone is currently listed
by ADB. The preceding 0.3.1 tablet result is not counted as a 0.3.2 pass.
After this device limitation was reported, the owner instructed testing and
release on 2026-10-10. Publication proceeds with the verified Windows and
automated evidence; current Android acceptance remains unverified.

## Retained source warnings

Node imports belong to the optional standalone CLI/MCP tools, which require
Node and never enter the plugin/mobile bundle. Importing Obsidian's Platform
into them would break their independent runtime. Their active configDir already
supports --config-dir; the literal .obsidian is the protected default for tools
outside Obsidian, not a forced plugin folder. The m1-commands ID preserves saved
hotkeys. Their isolation, custom-folder and registration regressions pass.
Reasons are documented in both READMEs and
[the source compatibility notes](contributing.md#remaining-source-warnings).
The directory scanner must be rerun after publication; local gates do not claim
a new Community Directory acceptance.
