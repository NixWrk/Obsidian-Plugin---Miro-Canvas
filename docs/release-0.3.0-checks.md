# Release 0.3.0 checks

Owner explicitly requested publication on 2026-10-10 after final checks.
This release collects the Canvas expansion, vector PDF/PPTX/SVG, card/figure
radius, snippet permissions, viewing/laser/slideshow and native pan fixes.
Minimum Obsidian stays 1.13.7; downloaded CLI/MCP stay Node 20+.

## Before publishing

Feature commit 24bfe03 passes both GitHub plugin and smoke jobs. The final
local feature suite passes 3497 tests across 168 files with one existing skip,
all three UI smokes and 33 Python oracle tests. TypeScript, production/MCP/CLI
builds, schema/submission, source/CSS lint and diff checks pass. Source lint
retains one compatibility command-ID advisory; CSS has no !important/:has.

These preflight results preceded the versioned candidate and remote-asset gate.
Final native evidence and completed publication are recorded below. Coverage
follow-ups remain explicitly pending rather than being claimed as passed.

## Coverage boundaries

Use the scoped receipts: [feature plan](canvas-enhancement-plan.md),
[integration](obsidian-integration-checks.md),
[vector/viewing](vector-viewing-acceptance.md),
[pan](review-pan-checks.md), [snippets](canvas-snippet-checks.md) and
[radius](shape-radius-acceptance.md). Existing historical failures are superseded
only by the exact later passing scenarios, not deleted.

Current smartphone is not connected. Earlier SM-A336E/Obsidian 1.12.7 evidence
is below the supported minimum. Physical S Pen/palm and Windows touchscreen,
actual PowerPoint viewer opening, and advanced query/rename/transfer/style
lifecycle matrices remain coverage follow-ups. They are not claimed as passed.
Vector/rich-content restrictions, PDF font substitution and supported property
query/CSS subsets remain documented product limits. Shared schema is pinned
to immutable upstream commit 2679e203; the copied contract does not require
a converter runtime or install.


## Final versioned candidate

3518 Vitest tests pass across168 files, one existing skip; all three synthetic
UI modes and33 Python oracle cases pass. TypeScript, source/MCP/CSS lint,
production/MCP/CLI builds, schema/submission and diff checks pass. Production
npm audit has zero advisories. The local artifact audit verified version parity,
Node/MCP exclusion from main.js, bundled font hashes/full SIL-OFL, CLI JSON
version and read-only MCP initialization. Remote bytes remain a separate gate.

All nine native feature phases pass on Windows1.14.4 and supported
SM-X736B/Android16/Obsidian1.13.8: search, connections, held groups, transfer,
linked notes/property connections/rename, integration/backlinks/graph, card
embeds, styles/zoom thresholds and palette. Native pan/viewing/laser/slideshow
checks also pass. Windows stays hidden/unfocused with trusted renderer input;
tablet actions use actual ADB input and separately recorded CDP preparation.
Checker fixes replace retained palette text, wait for translated rename
confirmation, and prepare the genuine visible note/backlink/preview leaf.
Those changes repair test setup, not application source or native caches.

[Radius zoom checks](radius-zoom-checks.md) pass on both surfaces; tablet finger,
stylus-source, exact input, settings switch, cancellation and creation shape
proportions also pass at200%. The final source is rebuilt with that policy.

Both native export runs save standalone SVG, vector PDF/PPTX and raster PDF,
preserve source/camera/selection and stop without another save. Independent
PyMuPDF parsing confirms two pages, extractable Cyrillic,13/8 drawings, zero
vector-PDF images and source aspect ratios; free-page PDF sizes are841.89x315.71
and841.89x651.79 points, not raw640x240/310x240 board units. PPTX ZIP/XML has
two genuine SVG parts and two JPEG compatibility pictures; SVG parses with
real text and no foreignObject. Jobs/surfaces are zero and originals restored.

Publication completed on2026-10-10; exact commits, CI and remote asset checks
are recorded below.


The configurable-radius follow-up passes3518 Vitest tests plus all16 native
settings/visibility checks on each supported surface. Default200%, custom100/300
and0-any-zoom, actual slider/exact entry, disk persistence and native reopen pass;
the cached Windows render-definition issue is fixed. Both final rebuilt native
exports pass independently with original file restoration and zero jobs/surfaces.
Final controls smoke, strict TypeScript/lint/build and local artifact audit pass.


## Published 0.3.0

[PR16](https://github.com/NixWrk/Obsidian-Plugin---Miro-Canvas/pull/16) was merged
at15da03a5e50716b5e370be6b71a88537c00c669c after the exact candidate
85d5be8fdd2dd6cc5547feed9232cf5ec965c2d5 passed both plugin and smoke jobs in
[run38053427774](https://github.com/NixWrk/Obsidian-Plugin---Miro-Canvas/actions/runs/38053427774).
The merge tree equals that tested candidate. Plain tag0.3.0 points to the merge.
The tag workflow published the normal public
[release0.3.0](https://github.com/NixWrk/Obsidian-Plugin---Miro-Canvas/releases/tag/0.3.0).

Downloaded main.js, manifest.json, styles.css, miro-canvas-cli.mjs and
miro-canvas-mcp.mjs all exactly match the final local builds after CRLF/LF
normalization. The downloaded CLI reports0.3.0; downloaded read-only MCP
initializes as0.3.0. Remote submission checking confirms the public tag,
default-branch manifest and all three plugin asset contents. Version parity
and minimum Obsidian1.13.7 remain. No tag was rewritten. The primary checkout
was fast-forwarded and rebuilt; its four unrelated untracked files were kept.
Receipts with GitHub asset digests are under ignored .out/release-030-verification.
