# Excalidraw comprehensive showcase — own hidden 9353 QA

## Pre-change trace — 2026-10-11

Only port 9353 is owned by this worker. Fresh profile/vault:
`tools/obsidian_cdp/.out/import-expansion-9353` in the shared import-expansion
checkout. Never connect/control 9351/9352/9354/9355; 9351 files are read-only
authored/source-plugin inputs from the closed previous QA. No desktop switch,
Page.bringToFront or OS input. Use explicit guarded CDP renderer input and
hidden capture in the new noninteractive CodexMiroImport9353 desktop.

Primary output:
`J:/NIX/WRK/Code/Obsidian-Plugin---Miro-Canvas/tools/obsidian_cdp/.out/all-import-showcase/excalidraw`.
New scripts are specific to the owned port and must fail closed on vault/profile
mismatch, occupied port or an existing fresh-work directory. Existing 9351
scripts are references only and must not be run unchanged.

Source provenance: own authored 67-element snapshot from primary
`tools/obsidian_cdp/.out/import-showcase/Исходник.excalidraw.md`. Its SHA-256 is
`2dca21325b61d665c8d98323feba54380ae64d22211258767cc3c1a08f7a4f8e`.
It already serializes appState.theme=light, a strict passive rect/text SVG badge,
and PNG reflection scale=[-1,1]. Keep this original source byte-for-byte for
import. One inherited source caption says SVG -> placeholder; that is a
historical diagnostic label in the authored source, not the new support claim.
The original editor may extract images and recompress the source: capture and
retain its editor-exported note separately, then disable the source plugin and
restore the authored bytes before native Miro import.

Copy only Excalidraw 2.28.1 main.js/manifest.json/styles.css from the closed old
9351 test vault into the new isolated QA vault. Do not inspect/copy its
implementation into the product; do not package any foreign editor runtime.
The product's main.js/manifest.json/styles.css are copied only after the parent
explicit fresh-build ready notice. No worker build or commit/push.

Mandatory checks: source plugin/native view loaded and reported version; 67
authored elements; serialized source theme; SVG badge and reflected raster
visible in source/result; native command/preview/publish with report card off;
source SHA-256 unchanged; assets remain vault-local and safe; exact result
board saved/reopened; source/result shots use matched dimensions/zoom with
no selected nodes or notices. Record native app evidence separately from pure
metadata checks. Broader appearance approximations/losses remain honest.

Current status: launcher prepared; source-only QA may start before product
build readiness. Native result/import acceptance awaits fresh product files.

## Source-only native receipt

Owned hidden 9353 started (PID 13636, Obsidian 1.14.4). Only original source
plugin Excalidraw 2.28.1 files were staged, no Miro product files. Native source
view shows 67 elements, serialized light theme, passive SVG badge and reflected
PNG. Source screenshot is primary all-import-showcase/excalidraw/source.png.
Formula Extras prompt was ignored for this session; no additional runtime was
installed. The existing authored formula image still renders from its asset.
Source was saved with CDP renderer Ctrl+S. The editor changed/extracted data:
its separate source-editor-export.excalidraw.md hash is
`6b7b6c397ced50a7c5dc8ae5e28dafdcf8c239dd8920756ca691197587c0c58e`.
The source plugin was disabled and the exact authored source restored; SHA-256
remains `2dca21325b61d665c8d98323feba54380ae64d22211258767cc3c1a08f7a4f8e`.
Source receipt records native pose, 1800x2300 viewport, zoom 1.141301 and source
images/reflections. capturePage is warmed with showInactive only on the owned
noninteractive desktop, then hidden in finally; receipt confirms focused=false.
No Page.bringToFront, SwitchDesktop, OS input, other ports or user vault.

Rich pure surface patch is complete and 118 focused tests pass. Automatic
approval review rejected the basic importer/shared-test mutation because an
explicit Mencius lease release is not retained. Those files remain unchanged.
`basic-surface-pending.patch` is the exact reviewable suggestion for after lease
release; it has not been applied. Native result/publication still awaits the
parent fresh-build ready notice.

## Final ready-build native receipt

Parent ready notice authorized exact main.js 4,713,986 bytes; all three product
files copied only while source/product plugins were disabled, with SHA-256
receipts. Main bundle hash:
`c6322b7342f7f730d0b0aa50d976dc93381513c9feb94d8937aa31db1777394a`.
Native command palette and preview mouse input published with report card off.
52 nodes, 1 native edge, 2 independent connectors, 6 prepared/loaded images;
settings.displayTheme=light and note subpath=#Импорт are retained.

Source/result/reopened captures are matched at 1800x2300 and scale 1.141301.
Native source shows original SVG badge and blue/teal/pink/yellow reflected PNG;
result shows the same badge/reflection, all six image natural sizes 240x110.
File-card paint rectangles are about 238x109 due to native border, rather than
claiming exact pixel equality. Saved source hash is unchanged after import,
native Ctrl+S, actual tab close/reopen and re-render. Saved board bytes are
stable across reopen, metadata is exact; runtime node comparison accepts only
documented empty color/subpath/group-label defaults. Observed normalization was
one unnamed spatial group label omitted by native getData.

The real result has 6 attachment-name hiding warnings and 55
import-provenance binding-dangling warnings. Images load, but filenames/borders
remain; caption gutters, smaller arrow label, unsmoothed teal freehand samples,
formula/Markdown metrics and small note-embed clipping differ visibly.
Hatch/roughness/opacity, cross-kind stacking and spatial groups retain explicit
preview losses. Primary README/comparison-summary describe these limits; this
is not a zero-diagnostic or pixel-parity acceptance claim.

Mencius release was explicitly confirmed and the parent applied the pending
basic patch/reason update; the earlier auto-review lease blocker is resolved.
This worker made no further pure edits or builds after releasing those files.
Own 9353 will be stopped after the final disk/source proof.

Final stop receipt: only owned port 9353 was closed. TCP probe confirms no
listener. Source bytes and result JSON remain unchanged after shutdown.
`stop-receipt.json` records final hashes. No commits, builds or further pure
implementation changes were made during this native QA phase.

## Final provenance-diagnostic refresh

Parent-ready main.js 4,714,203 bytes, SHA-256
`f4fe11a406abefcc76259016ac539f5b9227f73e2db83adbc2655d9e191d4094`, copied with both plugins disabled into
the same owned stopped 9353 profile. Restarted only that profile; no reimport.
Actual native reopen now reports 0 import binding warnings and 6 attachment-name
warnings. Source/result bytes and metadata are unchanged, all six images decode
and their copied asset bytes match the vault. Refreshed canonical result.png,
result-reopened.png, renderer/reopen/build/stop receipts and comparison summary
supersede the historical 55 false provenance warnings above. A fresh hidden
window needed a warm capture before native lazy images mounted; strict six
loaded-image assertions pass after paint, rather than weakening that check.
Only 9353 was stopped again; closed-port and final disk/source proof pass.
Remaining visual limitations in the gallery README are unchanged. No builds,
commits or further pure implementation edits were performed by this worker.

## Latest label-fix build — final native handoff

Installed exact parent-ready 4,714,346-byte build while both plugins disabled.
Bundle SHA-256 `47e5d5e5a1425099a34814687d3784550d58a6f2c67719996217a3640f737071`. No reimport. Existing
board native save/reopen and six loaded-image checks pass; source/result bytes
and metadata remain unchanged. Binding warnings stay zero. Image label-hiding
assertion FAILS: 0/6 hidden, all actual labelEl display:block and hidden=false,
six runtime attachment-name warnings. Targets are verified inside outer nodeEl
and outside containerEl. Raw proof is image-label-proof-final.json. Canonical
result.png/result-reopened.png show this latest build, without manual masking.
The 24-label probe confirms item:text and transparent backgrounds; 1px native
borders and small preview overflow explain remaining gutters. No further
product edits or investigations. Own 9353 is stopped; final disk/asset hashes
and explicit failed label check are in the canonical comparison summary.

## Superseding parent 9356 check

The actual cause was late native markup mounting. Final 4,715,046-byte build
processes hidden image labels through the existing appearance-mutation batch,
reconciles source paint and transfers declared lineHeight. Actual fresh native
command import retains source bytes, publishes six assets and gives 6/6 loaded
images with display:none/hidden:true and zero session/source-renderer diagnostics.
The final result.png/Результат.canvas and labels-final-9356.json replace the
9353 target as the delivered example; its original source capture stays valid.
The earlier 0/6 failures above remain historical evidence. See
import-all-showcase-checks.md for final gates and remaining visual limits.
