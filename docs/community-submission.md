# Community directory submission package

Prepared on 2026-10-05 for Miro Canvas 0.2.3. **Not submitted or approved.**
Packaging readiness and policy approval are separate; see the open review
question below before submitting. This document must not be used as a claim
that Obsidian has accepted the plugin.

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
| Version | 0.2.3 |
| Minimum app version | 1.13.7 |
| Platforms | Desktop and mobile editing; desktop export only |
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
> to PDF and PowerPoint on desktop. English and Russian interfaces are included.
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
- Selected external files are copied into the vault; desktop export can write
  outside it after the save/overwrite dialog. No external-folder scanning.
- MIT license and adapted LZ-string notice are linked. Font-pack licenses are
  distributed with the packs. The README states independent project ownership.
- Current limitations, desktop export, unverified iOS/macOS/Linux platforms and
  experimental connector chains are disclosed, rather than marked as tested.

## Open review question: desktop export in a mobile plugin

The current submission requirements say that a plugin using Node.js or
Electron APIs must set `isDesktopOnly: true`. Miro Canvas has
`isDesktopOnly: false` because its editor supports Android tablets.
The export backend uses `@electron/remote` to capture rendered board pages
and `original-fs` to save the chosen PDF/PPTX path:

- `src/board-export.ts`: `electronRemote`, `capturePages`.
- `src/m1-session.ts`: `saveExportFile`, export availability and actions.

These modules are accessed lazily through desktop host capabilities; mobile
has no capture backend and export is unavailable. There are no top-level
Node/Electron imports in the plugin source, and real Android editing has been
tested. Nevertheless, conditional execution alone does **not** establish
compliance with the wording of the published requirement.

Do not tick a blanket policy-compliance declaration until one of these is
resolved: Obsidian confirms the isolated desktop backend is acceptable;
the backend is replaced/removed for the mobile-capable release; or the
manifest is deliberately changed to desktop-only. The last option prevents
normal installation on tablets and phones.

Prepared clarification text (not sent):

> Miro Canvas edits native Canvas boards on desktop and Android, with
> isDesktopOnly set to false. Its optional PDF/PPTX export accesses Electron
> capture and a system save dialog only through available desktop host
> capabilities; mobile export is unavailable. There are no top-level
> Node/Electron imports. Does the current directory allow this isolated
> desktop-only feature in a mobile-capable plugin, or must we replace/remove
> that backend before submitting?

## Reproducible verification

Run from the repository root:

```sh
npm run check
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
The checker explicitly reports the export policy question; a successful exit
verifies packaging, not acceptance or full policy compliance.

Preparation checks on 2026-10-05: types, production build, MCP build and pinned
schema passed; 109 Vitest files passed (1689 tests, one skipped); three submission
checker tests passed; all three browser smoke modes and 25 Python tests passed.
An isolated Windows Obsidian 1.13.7 loaded the 0.2.3 manifest and current welcome
board (79 nodes, real PDF/PPTX examples, one plugin root); an actual Escape key
press and screenshot confirmed the visible board. No runtime feature code was
changed for this preparation release. These checks do not cover iOS or certify
the unresolved export policy requirement.

The legacy catalog contained no matching ID or repository on this check.
The new directory page could not be checked from the command-line client
(HTTP 403), so uniqueness in the current directory still needs its form's
validation; absence from the legacy catalog alone is not proof.

## Owner's final steps

1. Resolve the export policy question above before asserting compliance.
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
