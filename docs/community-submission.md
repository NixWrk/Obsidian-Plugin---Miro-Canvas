# Community directory submission package

Updated on 2026-10-05 for Miro Canvas 0.2.7. The owner has created a directory
draft; review of 0.2.3 reported blocking errors addressed by this release.
Acceptance and publication of the directory listing remain pending.

## Current submission process

New submissions use [Community Directory](https://community.obsidian.md/),
not a pull request against `obsidianmd/obsidian-releases`.
The current [submission walkthrough](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin),
[account setup](https://docs.obsidian.md/community-directory/set-up-and-claim),
[developer policies](https://docs.obsidian.md/community-directory/developer-policies)
and [plugin requirements](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins)
were checked on 2026-10-04, before preparation continued after midnight.

## Submission fields

| Field | Value |
| --- | --- |
| GitHub repository URL | `https://github.com/NixWrk/Obsidian-Plugin---Miro-Canvas` |
| Owner | The account linked to GitHub `NixWrk`, or its chosen organization |
| Name | Miro Canvas |
| Plugin ID | `miro-canvas` |
| Author | NixWrk |
| Version | 0.2.7 |
| Minimum app version | 1.13.7 |
| Platforms | Desktop and mobile editing and export |
| License | MIT; third-party notices in repository |
| Suggested categories, if offered | Visualization, Editing |

Short description (also in `manifest.json`):

> Add sticky notes, shapes, drawing tools, comments and layers to Canvas. Export boards to PDF and PowerPoint.

Long description, if a description field is offered:

> Miro Canvas adds sticky notes, shapes, frames, drawing tools, arrows,
> comments and layers to native Obsidian Canvas. Keep notes, Markdown links
> and attachments in your vault, customize panels and navigate with a
> minimap. Draw with a stylus or enable finger drawing on a tablet.
> Explore the editable welcome board with practical examples, resolved
> comments and sample exported documents. Export boards or presentations
> to PDF and PowerPoint on desktop and mobile. English and Russian interfaces are included.
>
> Board editing works offline. Optional GitHub update checks announce
> releases without installing them; font packs download only when requested.
> No account, payment, advertising or telemetry is required. Device files
> and custom fonts are read only after selection and copied into the vault.
> Desktop exports save to the location chosen in the system dialog.

The directory reads the manifest from the default branch and README excerpt
from the repository. The README includes bilingual instructions and 56 GIFs.
Examples for the listing or a reviewer:

- [First edit](media/en/sticky-with-note.gif)
- [Current welcome board](media/en/welcome-board.gif)
- [Feature coverage audit](welcome-board-coverage.md)
- [Full English instructions](../README.md) and [Russian instructions](../README.ru.md)

## Verified packaging and disclosures

- Root manifest, README, LICENSE and third-party notices are present.
- ID has no `obsidian` component; version follows `x.y.z`; description is
  below 250 characters, ends with a period and contains no emoji.
- Manifest, package, lockfile and `versions.json` agree. Earlier published
  versions keep their original compatibility entries.
- Minimum version is the oldest app verified by current real-app checks:
  Windows Obsidian 1.13.7; Android tablet Obsidian 1.13.8. No compatibility
  with older Canvas private APIs is claimed for this release.
- Editing works offline. GitHub release checks, optional font downloads,
  website links/embeds and selected-file access are disclosed in both READMEs.
- No payment, account, telemetry, advertising, self-installation or plugin
  self-update. The optional stdio MCP server is built and started separately.
- Selected external files are copied into the vault; exports create new vault
  attachments. No external-folder scanning.
- MIT license and adapted LZ-string notice are linked. Font-pack licenses are
  distributed with the packs. The README states independent project ownership.
- Current export limitations, unverified iOS/macOS/Linux platforms and
  experimental connector chains are disclosed, rather than marked as tested.

## Cross-platform export and lint checks

Version 0.2.4 replaces Electron capture and filesystem writes with bundled
html2canvas-pro and Obsidian Vault.createBinary. The plugin has no Node/Electron
runtime loaders. The optional Node MCP server is separate from main.js.
The official eslint-plugin-obsidianmd recommended configuration runs in CI and
release jobs. Obsidian blocking errors fail these jobs. Existing TypeScript
migration diagnostics remain warnings, as in the directory report.

Version 0.2.6 removes the search announcement's `clip-path`, seven `:has()`
selectors in plugin-owned controls, and four `!important` declarations used
to undo expanded panel spacing. The CSS regression check reports the remaining
90 `!important` declarations and 10 `:has()` selectors and rejects increases.
This is a regression budget, not the directory's CSS linter or a warning-free
certification. Remaining selectors bridge native Canvas/Markdown markup;
further cascade cleanup requires visual and interaction checks. The full
repository scan also reports Node imports in `mcp/`, the optional standalone
Node server. The submission packaging check rejects those imports in `main.js`.

## Reproducible verification

The 0.2.6 panel changes pass 28 repeated folds and held drags at each corner
in both orientations, using real mouse input in isolated Windows Obsidian.
Real ADB touches verify repeated folding, zero folded spacing and menu stacking
on Samsung SM-X736B (Obsidian 1.13.8) and SM-A336E (1.12.7), in portrait.
The phone check covers these controls only; the manifest minimum stays 1.13.7.
The search announcement remains exposed as an `aria-live="polite"` region in
the real desktop accessibility tree after its `clip-path` is removed.

Run from the repository root:

```sh
npm run check
npm run lint
npm run lint:css
npm test
npm run build
npm run mcp:build
npm run schema:check
node --test scripts/check-submission.test.mjs
npm run submission:check
python -m tools.obsidian_oracle.smoke_plugin_ui
python -m tools.obsidian_oracle.smoke_plugin_ui --interactions
python -m tools.obsidian_oracle.smoke_plugin_ui --controls
python -m pytest -q tools/obsidian_oracle/tests
git diff --check
```

After release publication, run `npm run submission:check -- --remote`.
It verifies the public release tag, default-branch manifest, attached files and
their contents against the local build (normalizing Windows line endings).
The checker verifies packaging and rejects desktop runtime loaders.
Success does not certify directory acceptance.

Version 0.2.4 is checked in isolated Windows Obsidian 1.13.7 and real Android
Obsidian 1.13.8 in MiroCanvasTest: multi-page PDF/PPTX, native and independent
connectors, pressure strokes, text and formulas. iOS, macOS and Linux are
unverified. The directory must scan the new release before acceptance.

The legacy catalog contained no matching ID or repository on this check.
The new directory page could not be checked from the command-line client
(HTTP 403), so uniqueness in the current directory still needs its form's
validation; absence from the legacy catalog alone is not proof.

## Owner's final steps

1. Refresh the existing draft’s automated review for version 0.2.7.
2. Sign in to Community Directory with your Obsidian account.
3. Connect GitHub `NixWrk` so the directory can verify repository ownership.
4. Open **Plugins → New plugin** and paste the repository URL above.
5. Choose yourself or your organization as owner. Review the actual form,
   developer policies and ongoing maintenance commitment before agreeing.
6. Submit, inspect automated review results and address each reported error.
   Publish corrected code as a new version; do not replace a published tag.
7. Publish the listing once review permits it. Update the README installation
   instructions only after the plugin is installable from the in-app catalog.

An Obsidian account sign-in, GitHub authorization and the owner's maintenance
commitment are not supplied by this repository. No submission or policy
agreement has been made on the owner's behalf.
