# L20 final tablet QA — Parfit

Authorized device only: Samsung SM-X736B / R52Y808PDJB / Obsidian 1.13.8, MiroCanvasTest, forwarded port 9340. Parent owns Windows and phone. No source/CSS/build changes, production builds, shared register edits, commits or app access on other devices. Deployment is exactly the current root main.js, manifest.json and styles.css through guarded android.mjs; original active file bytes/theme and installed/root SHA256 are captured before and after.

The ten requested checks run sequentially and stop on an actual failure: native style owners; owned hidden; owned visibility; CSS state --expect-marks; current PDF timer owners; card fill; font failures (positional port); arrow colour; held drawing/smart shapes (ADB pen plus separately labelled CDP pressure); supported declarative settings navigation. Vault and foreground md.obsidian are checked before each script, and each script's documented input guards are retained. Existing node_modules reused. No blind input or harness changes without the parent's narrow approval.

Initial identity verified via selected-serial ADB read-only queries: model SM-X736B, md.obsidian versionName=1.13.8, mCurrentFocus md.obsidian/md.obsidian.MainActivity. Port 9340 forwarded explicitly to that device PID 24934. CDP status confirms MiroCanvasTest/mobile/tablet/plugin enabled/version 0.2.7. Initial snapshot and exact file text/hash are under tools/obsidian_cdp/.out/l20-tablet-final/before.json. The original file will be checked/restored after every affected matrix and after final QA. Installed/readback hash results and native SDK version will be appended below.

Evidence: native style-owner and timer/font instrumentation use actual installed app DOM/native APIs with CDP preparations; they are not human input. Hidden/visibility, selection/cancel/Undo/Redo, card/arrow and settings controls use guarded ADB touch where the script supports it. Drawing uses real adb input stylus events; pressure pulses are CDP synthesis. Neither proves handling by a physical S Pen. Fixed harness artifact paths are recorded separately from this worker's log/snapshot directory. App/data originals are preserved; additional generated test fixtures are confined to MiroCanvasTest.

Status: deployment/checks pending. Parent integration gates and other devices are not certified by this record.

## Freeze withdrawn — queue stopped before first matrix

Parent withdrew the immutable build grant after finding runtime restoration shorthand/replaced-target retention bugs. Deployment had completed, but no native matrix was running or had started. Accordingly there was no in-flight test to finish. No further redeploy, matrix, ADB gesture, device access outside this tablet or harness/source/CSS/build mutation was performed. All ten requested checks remain pending until a new immutable-build grant.

Deployed main.js, manifest.json and styles.css through android.mjs --port 9340; plugin 0.2.7 enabled. Read-only paused snapshot verifies installed/readback SHA256 exactly matches the deployed root assets:

- main.js: ddf7119e528892b65762771f3c62964bf2c7aa6fb7d29afa926bfc251dd3579a
- styles.css: 7c5ce8c141b048ae4382abb83f6c3a309a0bfef5c21290bc527184202a76208c
- manifest.json: 68169dd642f5654f4a1c3fdf0f64510dd5dba5a72c9d9a3abf39f1a6d4f1c174

Original active file Export touch test.canvas: SHA256 2c7b4b8c34a6981ca326e2425fc6ce1708d44d5710a5cc4e59f1ffa1f016b3c2. Paused readback has the same active path and exact text bytes (PASS). Foreground remains md.obsidian/MainActivity, MiroCanvasTest, Samsung SM-X736B/R52Y808PDJB, app 1.13.8. Root asset hashes remain unchanged since deployment. Tablet queue is explicitly paused by the parent; no QA pass is claimed.

Artifacts: tools/obsidian_cdp/.out/l20-tablet-final/before.json, paused.json, paused-summary.json and snapshot.mjs. No fixed matrix artifacts were produced because no matrix began. Evidence to date is read-only selected-tablet ADB identity/foreground/socket queries and CDP deployment/readback; no ADB touch/stylus input or pressure synthesis was sent. Native SDK capture did not run; app version is the selected device's dumpsys versionName.

## New immutable build grant — resumed

Parent issued a new freeze after Windows passed the latest color/priority/table teardown and bounded 200-preview replacement harness. Current three assets redeployed through guarded android.mjs to port 9340; waited 800ms. Installed readback matches the new root SHA256 exactly (deployed-new.json): main.js aff2ee3a34a3045a30075c5736091c5cde937e3e06d2c1d327659ae5705aa200; styles.css 7c5ce8c141b048ae4382abb83f6c3a309a0bfef5c21290bc527184202a76208c; manifest.json 68169dd642f5654f4a1c3fdf0f64510dd5dba5a72c9d9a3abf39f1a6d4f1c174. Tablet/app/vault/foreground and original Export touch test.canvas bytes remain as initially recorded.

The queue resumes sequentially on only R52Y808PDJB. Before each matrix the wrapper checks the immutable root hashes, foreground md.obsidian, MiroCanvasTest and exact original active file bytes. After each matrix it verifies the original active path/text again and records a separate result/log. No source/CSS/build or shared harness edits. Native style-owner harness now includes actual-host CSSOM shorthand/later-color-priority restoration, table teardown, 100 source preview plus 100 ordinary preview replacements, bounded targets and unchanged history. Its compiled pure-helper CSSOM probes are distinguished from installed-plugin lifecycle and from ADB input.

- New-freeze native-style-owners: STOP — FAILURE; original file bytes preserved; 2026-10-06T20:00:28.409Z → 2026-10-06T20:00:32.107Z. Evidence tools/obsidian_cdp/.out/l20-tablet-final/native-style-owners.log and .result.json.

## New-freeze STOP — first matrix exact border-width assertion

check-native-style-owners stopped at its selected group-border assertion, tools/obsidian_cdp/check-native-style-owners.mjs:61: expected width 1px/style dashed; actual width 0.941176px/style dashed. Tablet DPR 2.125; computed CSS width maps to 1.999999 physical pixels. This suggests Blink fractional-DPR border-width quantization, but is an inference; no runtime pass is certified and no harness was changed. Group after-state equals the captured before-state in the saved report. Both paint-theme loops and native visibility competition/presentation-capture/latest-external-priority checks completed before the assertion. The new pure-helper CSSOM/color-priority/table teardown and 200 installed preview replacement checks were not reached.

Stop policy obeyed: no other matrix started, no redeploy after failure and no source/CSS/build/shared harness changes. A final read-only snapshot verifies original Export touch test.canvas path and exact bytes/hash still preserved (2c7b4b8c34a6981ca326e2425fc6ce1708d44d5710a5cc4e59f1ffa1f016b3c2); all three installed readback hashes match the immutable grant/root assets, unchanged. This first matrix used CDP native API/inline-style instrumentation, not ADB touch/stylus input. Remaining nine matrices, and the later portions of the first, remain pending.

Evidence: native-style-owners.log/result.json; native-style-owners.partial.json copied from the harness fixed artifact tools/obsidian_cdp/.out/l20-native/styles-R52Y808PDJB.json; final.json; stopped-summary.json. All worker evidence is under tools/obsidian_cdp/.out/l20-tablet-final.

A concrete narrow proposed harness patch exists only as tools/obsidian_cdp/.out/l20-tablet-final/harness-proposal.patch (NOT APPLIED). It compares the selected border against an offscreen actual CSSOM reference with the same 1px dashed declaration in the same host, preserving an exact comparison rather than adding a permissive tolerance. Reference creation/removal and the assertion are the only proposed changes. Parent approval is required before editing the shared harness or rerunning the queue.

## Authorized narrow harness correction — before edit

Parent explicitly granted the sole lease of tools/obsidian_cdp/check-native-style-owners.mjs for this correction; no concurrent Windows run/edit is permitted during the lease. Previous selected-width discrepancy at DPR 2.125 is still recorded as an inference until the same-host reference is measured.

Only group selection probe/assertions change: capture focused group-face CSS custom declarations --miro-source-group-border-width and --miro-source-group-border-style, assert their trimmed values remain EXACTLY 1px and dashed; create/remove an offscreen same-host div with an explicit 1px dashed border and compare exact computed selected width/style against its CSSOM reference. Keep before/after group restoration assertion and all paint/visibility/CSSOM/table/replacement/history/source/unknown checks. No permissive tolerance, production/source/CSS/build change, or other harness modification. Then restart all ten tablet matrices on unchanged AFF2… assets with existing guards and stop-on-failure.

- New-freeze native-style-owners: PASS; original file bytes preserved; 2026-10-06T20:05:09.434Z → 2026-10-06T20:05:14.459Z. Evidence tools/obsidian_cdp/.out/l20-tablet-final/native-style-owners.log and .result.json.

### Corrected native style-owner result / harness lease receipt

Narrow authorized harness patch applied; syntax and scoped diff checks pass. Exact CSS declarations measured 1px and dashed. Actual selected computed width 0.941176px exactly equals the offscreen reference 0.941176px in the same tablet CSSOM; before/after group state restored. This confirms the earlier exact 1px computed-width failure was host fractional-DPR quantization, not a changed logical declaration. No production JS/CSS changed. Harness lease edit is complete; parent may review this pure harness correction.

Full installed native style-owner matrix PASS, both themes. Actual-host pure-helper CSSOM latest blue color/important priority restoration for embed/slide and table padding teardown pass. Installed plugin preview replacements: 200; source targets 5/5; current M1 sizers 0; unchanged history true. Source/unknown metadata integrity and original testfile exact bytes pass. These checks are CDP/native API and CSSOM instrumentation, no human/ADB pointer evidence. Fixed report .out/l20-native/styles-R52Y808PDJB.json is copied to the worker's native-style-owners.pass.json.

- New-freeze owned-hidden: PASS; original file bytes preserved; 2026-10-06T20:05:27.135Z → 2026-10-06T20:06:11.335Z. Evidence tools/obsidian_cdp/.out/l20-tablet-final/owned-hidden.log and .result.json.

- New-freeze owned-visibility: PASS; original file bytes preserved; 2026-10-06T20:06:17.837Z → 2026-10-06T20:06:37.114Z. Evidence tools/obsidian_cdp/.out/l20-tablet-final/owned-visibility.log and .result.json.

- New-freeze css-state: PASS; original file bytes preserved; 2026-10-06T20:06:44.809Z → 2026-10-06T20:07:21.282Z. Evidence tools/obsidian_cdp/.out/l20-tablet-final/css-state.log and .result.json.

- New-freeze timer-owners: PASS; original file bytes preserved; 2026-10-06T20:07:26.885Z → 2026-10-06T20:07:31.176Z. Evidence tools/obsidian_cdp/.out/l20-tablet-final/timer-owners.log and .result.json.

- New-freeze card-fill: PASS; original file bytes preserved; 2026-10-06T20:07:42.467Z → 2026-10-06T20:07:47.074Z. Evidence tools/obsidian_cdp/.out/l20-tablet-final/card-fill.log and .result.json.

- New-freeze font-failures: STOP — FAILURE; original file bytes preserved; 2026-10-06T20:07:52.258Z → 2026-10-06T20:07:52.378Z. Evidence tools/obsidian_cdp/.out/l20-tablet-final/font-failures.log and .result.json.

Font matrix first invocation exited before app evaluation because the default CDP selector matches desktop app://obsidian.md. Existing cdp.mjs connectByTitle explicitly supports CDP_TITLE; the documented Android invocation uses CDP_TITLE=Obsidian. Only the ignored worker command wrapper now supplies that environment option; check-font-failures.mjs and cdp.mjs are unchanged. The failed connection attempt is retained separately and is not a runtime font-failure result. Retry uses positional port 9340 with CDP_TITLE=Obsidian and all original device/vault/foreground/asset guards.

- New-freeze font-failures: PASS; original file bytes preserved; 2026-10-06T20:08:29.904Z → 2026-10-06T20:08:30.164Z. Evidence tools/obsidian_cdp/.out/l20-tablet-final/font-failures.log and .result.json.

- New-freeze arrow-color: PASS; original file bytes preserved; 2026-10-06T20:09:12.479Z → 2026-10-06T20:09:33.120Z. Evidence tools/obsidian_cdp/.out/l20-tablet-final/arrow-color.log and .result.json.

Read-only proof-scope follow-up during the next normal arrow fixture: {"file":"Export touch test.canvas","ordinary":null,"ordinaryNodePresent":false,"m1SizerTargets":0}. No fixture reopened/rewritten or production file edited. Correction from exact local declarations: appearance.ts VerticalAlign accepts top/center/bottom, isVerticalAlign also accepts middle, and normalizeVerticalAlign maps middle to center. Therefore center is valid and the hypothesized invalid enum is NOT the cause. source-model.ts maps center to middle for CSS. The safe read-only snapshot found the original Export touch test.canvas already active, ordinary absent and zero M1 sizer targets; it does not identify the fixture-time cause. The 100 ordinary replacements with count0 do not certify active M1 non-top owner retention. Source code owner replacement evidence (5/5 targets) is unaffected. Parent owns any corrected enum/stronger active-M1 proof.

- New-freeze drawing-hold-shapes: PASS; original file bytes preserved; 2026-10-06T20:10:18.886Z → 2026-10-06T20:11:20.765Z. Evidence tools/obsidian_cdp/.out/l20-tablet-final/drawing-hold-shapes.log and .result.json.

- New-freeze settings-navigation: STOP — FAILURE; original file bytes preserved; 2026-10-06T20:11:42.848Z → 2026-10-06T20:11:50.605Z. Evidence tools/obsidian_cdp/.out/l20-tablet-final/settings-navigation.log and .result.json.

## Final tablet queue receipt — nine matrices pass, settings welcome gate fails

All ten requested matrices attempted sequentially on the frozen AFF2… build, Samsung SM-X736B/R52Y808PDJB, Obsidian/native SDK 1.13.8 (supported settings minimum 1.13.7), MiroCanvasTest, port 9340. Nine pass; last settings-navigation matrix stops at fresh-welcome native-data/file comparison. No clipboard check or further native diagnostic mutation was started. Parent owns subsequent M1 proof and welcome-board diagnosis.

| # | Matrix | Result | Original testfile |
| --- | --- | --- | --- |
| 1 | native-style-owners | PASS | exact original bytes preserved |
| 2 | owned-hidden | PASS | exact original bytes preserved |
| 3 | owned-visibility | PASS | exact original bytes preserved |
| 4 | css-state | PASS | exact original bytes preserved |
| 5 | timer-owners | PASS | exact original bytes preserved |
| 6 | card-fill | PASS | exact original bytes preserved |
| 7 | font-failures | PASS | exact original bytes preserved |
| 8 | arrow-color | PASS | exact original bytes preserved |
| 9 | drawing-hold-shapes | PASS | exact original bytes preserved |
| 10 | settings-navigation | FAIL — fresh welcome settlement | exact original bytes preserved |

Final installed/readback SHA256, matching unchanged frozen root assets:

- main.js: aff2ee3a34a3045a30075c5736091c5cde937e3e06d2c1d327659ae5705aa200
- styles.css: 7c5ce8c141b048ae4382abb83f6c3a309a0bfef5c21290bc527184202a76208c
- manifest.json: 68169dd642f5654f4a1c3fdf0f64510dd5dba5a72c9d9a3abf39f1a6d4f1c174

Original active Export touch test.canvas exact path/text preserved after EVERY matrix and final readback, SHA256 2c7b4b8c34a6981ca326e2425fc6ce1708d44d5710a5cc4e59f1ffa1f016b3c2. Theme restored to system, plugin 0.2.7 enabled; foreground remained md.obsidian before input. Settings SDK capture restored eval, and that harness also verifies unchanged installed asset bytes and original-board source/unknown witness/restoration. No source/CSS/build changes, production build, commits, Windows/phone app access, or shared register write by this tablet executor. The sole approved shared-harness correction is check-native-style-owners.mjs; edit lease complete/returned, syntax/diff checks pass, patch captured in harness-applied.patch.

Evidence distinctions:

- Native style owners: installed DOM/CDP native API + foreign-inline styles in both themes; separate compiled pure-helper actual-host CSSOM table-padding and latest color/important-priority restoration; source code replacements 100 with bounded targets 5/5 and unchanged history; ordinary replacements 100 with M1 owner count0. Exact custom declarations 1px/dashed and same-host computed reference 0.941176px/dashed pass. These are instrumentation, not ADB input.
- Hidden/visibility: ADB control presses with CDP selection/text/state preparations, both themes, comment/menu/popover lifecycle and actual PDF capture. Resize state: real ADB down/move/up/cancel and Undo/Redo controls; CDP setup/probes separate; paths follow before release at 50%/125%, no preview save, one commit and exact cancel restore. Late code-title and attachment marks pass.
- Timer owners: actual installed native lifecycle and PDF width/page/reuse with forced retry/readiness/rejection/timeout/late-facade branches explicitly instrumented; current native fit succeeds. Popout/closed-owner evidence belongs to parent's separate native probe, not this tablet matrix.
- Card fill/arrow colour: real ADB selection/controls, native palette/preset/explicit-route states prepared via CDP; both themes and reload pass, no persisted colour change and one native face. Font failures: actual app CSSOM/FontFaceRegistry instrumentation, isolated fake bytes/missing face, partial Blob cleanup and alias retry; no real font-pack download. Documented CDP_TITLE environment option fixed target selection; no shared font harness changed.
- Drawing: FIVE hold variants using ADB stylus motions (pen/highlighter, enabled/disabled, zoom and cancel), THREE explicitly synthetic CDP pressure cases, TEN recognized-shape variants with rotation/dimensions and history Undo/Redo. No claim of physical S Pen pressure or palm handling. Original settings/board restored.
- Settings: supported actual declarative settings, all 12 sections, native ADB dropdown taps/keys and CDP Tab continuation passed. Failure occurs AFTER native section navigation when opening a fresh welcome board: native fields/source/extensions differ from disk beyond root ordering. Fresh-welcome/export-help gates not certified. Restoration attempted/PASS, original-board exact bytes, installed fingerprints and SDK eval restoration PASS. Fixed report settings-navigation-R52Y808PDJB.json, copied as settings-navigation.failure.json; full error preserved in log. No data/source/format fix or weakened check performed.

Active M1 non-top sizer retention remains a separate proof GAP, not a pass: count0 was also reported on Windows. Exact current appearance.ts accepts center and middle; center is NOT invalid. Safe snapshot had the original board already active and no ordinary target; cause is unproven, to be diagnosed by parent after lease. SourceRenderer 5/5 retention evidence is meaningful and unaffected.

Worker artifacts: tools/obsidian_cdp/.out/l20-tablet-final/*.log/*.result.json, before.json, new-grant.json, deployed-new.json, final.json, completed-summary.json, harness-applied.patch, native-style-owners.pass.json, timer-owners.native.json, settings-navigation.failure.json. Initial border-width failure and pre-evaluation font-target attempt are retained separately; final successful reruns supersede only those result records. Fixed harness outputs remain under tools/obsidian_cdp/.out/l20-native, .out/hidden-R52Y808PDJB-l20-final.json, .out/visibility-R52Y808PDJB.json, CSS-state/timer/drawing serial reports, and .out/l20-authoring-dom/settings-navigation-R52Y808PDJB.json/screenshots. No full parent integration/device gate is inferred from these scoped results.

Welcome-order first L20 field capture (no profile change): {"profile":"current-L20","file":"Miro Canvas - Начните здесь (6).canvas","nodes":79,"changedIds":[],"fieldChanges":[],"rootNodeOrderSame":false,"diskHashes":{"beforeOpen":"1e23fd6933c6b7d83621a7ae9e25b074d4ec708e6da057cc748c310a33243480","beforeGetData":"1e23fd6933c6b7d83621a7ae9e25b074d4ec708e6da057cc748c310a33243480","afterGetData":"1e23fd6933c6b7d83621a7ae9e25b074d4ec708e6da057cc748c310a33243480","afterSettled":"1e23fd6933c6b7d83621a7ae9e25b074d4ec708e6da057cc748c310a33243480"},"diskBytesUnchangedAcrossGetData":true,"diskBytesUnchangedAcrossReopen":true,"settingsBytesUnchanged":true,"originalPath":"Export touch test.canvas","originalBytesUnchanged":true,"history":0,"input":"CDP native API reopen/getData read-only observation; no ADB gesture, no explicit file save/rewrite"}. Exact disk/native payloads saved only in worker artifact files; no payload logs. No product/harness patch. Original board and settings preserved; shared style harness untouched during Dewey lease.

## Settings loading-race harness lease — before edit

Parent explicitly grants exclusive check-settings-navigation.mjs lease, with Windows actor paused until receipt. Current settled same-file L20/L19/native comparison has zero changed IDs/fields, stable bytes across getData, and only node-order changes on close. Source/runtime owner markers distinguish L20 from actual archived L19. The prior first native equality assertion occurred before five stable loading samples; mixed old/new native view or deferred layout is plausible but NOT yet proven. No product fix/field tolerance is authorized.

Keep contentWitness canonicalization and strict saved-file field/source/unknown witness every poll. Require same expected active file, matching actual native view.file.path, full canonical native witness equality and five stable byte/order samples to pass. Transient native mismatch resets stable/last and waits 250ms within the existing 48-attempt bound; record interim changed IDs/keys and exact file/native witness hashes, and recovery on eventual success. Deadline fails with succinct mismatch IDs/keys, no giant payload, skipping, rewrite or forced save. This is a bounded native-load wait, not a relaxed final field contract. Only this shared harness and the exclusive tablet worker report change; pure helper diagnostics live in ignored worker artifacts. Rerun tablet settings on unchanged AFF2 assets, restore exact original bytes/assets/settings; shared style harness remains Dewey-owned.

- New-freeze settings-navigation: STOP — FAILURE; original file bytes preserved; 2026-10-06T20:25:16.416Z → 2026-10-06T20:25:25.637Z. Evidence tools/obsidian_cdp/.out/l20-tablet-final/settings-navigation.log and .result.json.

## Settings harness receipt and tablet height diagnosis — before probe

Shared check-settings-navigation.mjs edit COMPLETE/RELEASED. Attempted direct Windows actor receipt via send_input failed because agent id 01a11235-42fc-7400-9da7-e0692420df74 is not accessible in this executor routing scope; coordinator receipt needed. Syntax/diff checks and six extracted-helper settlement proofs pass. Real retry records five native height mismatches for da3ab1600ec81a0b, followed by strict saved-file witness failure at nodes[da3ab1600ec81a0b].height; this is an actual disk field change, not proven to be a loading-only race. Original active board exact bytes and installed AFF2 assets/restoration passed. No height tolerance or production change.

Bounded tablet diagnostic: capture the same newly generated native Markdown node's initial disk and later disk/native values, content/appearance witness, and stack/write call path where feasible, using current L20, actual archived L19, and unloaded native profiles. Profile assets/settings are temporary only in guarded MiroCanvasTest; root assets remain frozen. Capture new welcome creation before native open via reversible scoped vault.create instrumentation, then replay identical captured raw board into native leaves for the three profiles. Capture native constructor/height-related prototype method source before wrapping verified methods; wrappers preserve receiver/arguments/results/throws and restore in finally. Exact JSON payloads stay in worker ignored artifacts. Native saves may happen naturally; no forceSave/field exclusion. Restore test-plugin current assets/settings, original active file/theme/exact bytes and all readback hashes. No Windows/phone access or shared style harness edits.

## Completed tablet height baseline diagnosis

Strict settings retry remains FAIL, not reclassified as a pass. Five interim native mismatches were followed by a real saved-field change. Exact affected node da3ab1600ec81a0b is a file/image attachment to Picture.png, NOT Markdown. Fresh generation captures height160,width200 before native open. Identical raw fresh-board bytes replayed under archived L19 and unloaded-native profiles; all three change only this height to133, keeping width200. No source/extensions/unknown/content fields differ.

| Profile | Plugin loaded | Initial → final height | First observed disk height change |
| --- | --- | --- | --- |
| current-L20-fresh | true | 160 → 133 | 2643ms |
| baseline-L19 | true | 160 → 133 | 2327ms |
| disabled-native | false | 160 → 133 | 2480ms |

Native file-node render source was read directly on Obsidian1.13.8: after child.loadFile(), HTMLImageElement natural dimensions set aspectRatio; if width/height differs, it calls resize({width:Math.min(width,height*ratio),height:Math.min(height,width/ratio)}) then canvas.overrideHistory(). Actual resize argument height133.33333333333334 rounds to133 in native geometry. Captured stack in unloaded-native case contains only native app.js:1:3261559 plus async helper frames, proving the resize exists without plugin runtime. L20/L19 traces include existing plugin wrappers around the same native call, not a differing size. Delayed disk writes go through native app.js Canvas view save → vault.modify → adapter.write; exact call stacks and file/native payloads retained in height-<profile>.json. No forced save or product mutation. This establishes the height failure as native image aspect-ratio normalization, not an L20 Markdown or CSS regression.

The first diagnostic replay incorrectly expanded literal $$ in a JavaScript replacement-string fixture transfer. Corrected artifact-only probe uses replacement callbacks, reran all three profiles, and verifies sole height-key difference; invalid attempt retained with .fixture-transfer-attempt suffix and excluded from conclusions.

Restoration PASS: original active Export touch test.canvas exact SHA256 2c7b4b8c34a6981ca326e2425fc6ce1708d44d5710a5cc4e59f1ffa1f016b3c2; original system theme; installed main AFF2, styles7c5ce8c1…, manifest68169dd6…; exact data.json SHA2569b43866521684d646ccac30d59fcd76d834dde55a0c54a399716e3132dc6e1df. Current enabled plugin restored. Instrumentation wrappers restored in finally. The newly created diagnostic welcome file remains as a test artifact in guarded MiroCanvasTest; no original board was rewritten. Artifacts height-profiles-report.json, height-diagnosis-summary.json, height-native-methods.json, height-runtime-backup.json and per-profile exact snapshots/stacks live only under tools/obsidian_cdp/.out/l20-tablet-final.

Settings harness edit lease remains released; syntax and six settlement proofs pass, no field tolerance was added. Parent separately reports Windows full settings strict witness/export/help PASS on AFF2; this is parent evidence, not a tablet pass. Pending: coordinator disposition or a newly authorized harness baseline contract for native creation normalization before action witnesses; existing tablet strict creation check remains failed. No additional shared harness/source/CSS/build edits performed during diagnosis.

## Native creation normalization contract — before edit

Renewed narrow shared check-settings-navigation.mjs grant. Capture exact fresh Canvas text at native vault.create before open. Only fresh-welcome-before-actions settlement may accept a single canonical variant for node da3ab1600ec81a0b, a native file image Picture.png: initial height160 at width200 becomes native-rounded aspect-ratio height derived from actual loaded HTMLImageElement natural dimensions and node.aspectRatio. Verify actual native width equals initial width, ratio equals naturalWidth/naturalHeight, computed width remains unchanged, and native height equals expected rounding. Assert every other field/root/source/extension/nested array unchanged via whole canonical witnesses, no broad height exclusion. Record exact ID/filepath/before/after/dimensions/ratio and native trace artifact reference. At most one creation variant; final full native/disk equality and five stable samples precede action baseline. Original-board settlement remains byte/field strict; export/close checks use exact final bytes. No forceSave or fixture/production rewriting.

Focused positive/negative helper proofs must cover known height only, width/source/unknown/nested edits rejected, wrong node/path/ratio/height rejected, initial raw differing fields caught even before first sample, strict original unchanged. Run tablet settings then positive actual-native M1 style-owner harness sequentially on unchanged AFF2 assets. Keep vault/foreground guards and exact original config/board restore; release tablet for Sagan after final readback. No other shared harness/source/CSS/build edits.

- New-freeze settings-navigation: PASS; original file bytes preserved; 2026-10-06T20:34:04.403Z → 2026-10-06T20:34:16.573Z. Evidence tools/obsidian_cdp/.out/l20-tablet-final/settings-navigation.log and .result.json.

- New-freeze native-style-owners: PASS; original file bytes preserved; 2026-10-06T20:34:30.027Z → 2026-10-06T20:34:36.699Z. Evidence tools/obsidian_cdp/.out/l20-tablet-final/native-style-owners.log and .result.json.

- New-freeze settings-navigation: PASS; original file bytes preserved; 2026-10-06T20:35:09.854Z → 2026-10-06T20:35:22.113Z. Evidence tools/obsidian_cdp/.out/l20-tablet-final/settings-navigation.log and .result.json.

## Final acceptance and tablet release

All TEN tablet matrices now PASS on the same immutable AFF2 main / 7c5ce8c1 styles / 68169dd6 manifest. Settings-navigation rerun 20:35:09Z–20:35:22Z PASS: 12 supported sections, native ADB section navigation with separate CDP Tab continuation, fresh welcome and export help. Fresh creation accepted exactly da3ab1600ec81a0b Picture.png height160→133, width200 unchanged, actual natural image480×320, native ratio1.5. Exact initial/normalized canonical hashes recorded; every other saved AND same-file native field/root/source/extension/nested array must match initial raw or sole known variant each poll. Five interim native mismatches then five stable full native/disk equal snapshots precede action baseline. Post-export and post-close exact bytes PASS. Original-board settlement remains strict. Hook vault.create uses captured receiver and is restored; final readback confirms no probe remains.

Ten creation helper proofs plus six prior settlement proofs PASS (known height, width/source/nested/ratio/file/ID/height negatives; native-only source changes rejected immediately; original height strict). node --check and scoped git diff --check PASS. Native origin traces reference height-diagnosis-summary.json; source runtime unchanged. No blanket height skip, tolerance, save/fixture rewrite, lint disable, or production fix. Shared settings harness edit lease COMPLETE/RELEASED. Concrete patches settings-harness-creation.patch and settings-harness-applied.patch; shared changed path in this slice ONLY tools/obsidian_cdp/check-settings-navigation.mjs, plus exclusive report and ignored evidence.

Positive updated native-style-owner harness PASS 20:34:30Z–20:34:36Z: actual ordinary Markdown visible/mounted with center metadata, M1 owner1 in each theme. Native per-card bounded pan/wait verifies real DOM. Replacement retention evidence: {"replacements": 200, "sourceTargets": 5, "initialSourceTargets": 5, "historyUnchanged": true, "initialM1Sizers": 1, "currentM1Sizers": 1, "ordinaryM1Sizers": 1, "m1HistoryUnchanged": true}. This supersedes earlier M1 owner0 proof GAP; no enum-invalid claim. Original board/history/unknown/source integrity PASS. Harness itself was not edited by tablet executor in this slice. Proof native-style-owners.positive-M1.pass.json.

Final readonly readback: exact active Export touch test.canvas SHA2562c7b4b8c34a6981ca326e2425fc6ce1708d44d5710a5cc4e59f1ffa1f016b3c2, system theme, current plugin0.2.7 enabled, current/installed three frozen asset hashes identical, exact data.json SHA2569b43866521684d646ccac30d59fcd76d834dde55a0c54a399716e3132dc6e1df. No remaining tablet check under this lease; physical stylus/palm/full integration claims remain outside these scoped tests. Tablet SM-X736B/R52Y808PDJB MiroCanvasTest port9340 RELEASED FOR SAGAN; no further app access by this executor after release. No clipboard test begun.
