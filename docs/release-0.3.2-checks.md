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


## Publication — 2026-10-10

[PR 18](https://github.com/NixWrk/Obsidian-Plugin---Miro-Canvas/pull/18), candidate
9e1c555e722eab37037a4337df20fa9894badf16, passed both plugin and smoke jobs in
[CI 38082407115](https://github.com/NixWrk/Obsidian-Plugin---Miro-Canvas/actions/runs/38082407115).
The merged tree at 2a6995ac6d2d413a73796a089a56545919f51f76 equals that tested
candidate. Both fresh tags point to the merged commit; existing tags and assets
were preserved. The original checkout was fast-forwarded and rebuilt from a
clean npm ci. Its four unrelated untracked files remain untouched.

[Plugin 0.3.2](https://github.com/NixWrk/Obsidian-Plugin---Miro-Canvas/releases/tag/0.3.2)
is public and contains exactly main.js (4,628,598 bytes), manifest.json (323)
and styles.css (166,242). The separate
[tools-0.3.2 prerelease](https://github.com/NixWrk/Obsidian-Plugin---Miro-Canvas/releases/tag/tools-0.3.2)
contains only CLI (1,104,971 bytes) and MCP (1,105,388); it is not the latest
plugin release. All five downloads match the tested builds after CRLF/LF
normalization, with matching GitHub SHA-256 digests. The default-branch manifest
matches. Downloaded CLI and read-only MCP both report 0.3.2.

GitHub-published provenance exists for all five assets. DSSE signatures,
subjects, source commit and tag/workflow identity were checked against the
returned certificates. Full Sigstore root/transparency trust validation remains
the GitHub reviewer responsibility. Receipts are ignored under
.out/release-032-verification. The final repeated hidden Windows export and
independent content checks pass; no current Android-device result is claimed.
Community Directory review must be rerun for this version.
